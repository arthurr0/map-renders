import { beforeEach, describe, expect, it } from 'vitest';
import { presetDirection } from '../render/math/cameraFit';
import { directionToSunAngles, timeOfDayToSun } from '../render/math/sun';
import { DEFAULT_RENDER_SETTINGS, type RenderSettings } from '../core';
import { STYLE_PRESET_GROUPS, STYLE_PRESETS } from './presets';
import { useAppStore } from './store';

function preset(id: string) {
  const found = STYLE_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`missing preset ${id}`);
  return found;
}

describe('preset texture mode', () => {
  beforeEach(() => {
    useAppStore.getState().resetSettings();
  });

  it('switches back to textured after the blueprint preset', () => {
    useAppStore.getState().applyStylePreset(preset('blueprint'));
    expect(useAppStore.getState().settings.textureMode).toBe('simplified');
    useAppStore.getState().applyStylePreset(preset('golden-hour'));
    expect(useAppStore.getState().settings.textureMode).toBe('textured');
    expect(useAppStore.getState().meshOptions.mode).toBe('textured');
  });

  it('keeps a texture mode the user picked by hand after blueprint', () => {
    useAppStore.getState().applyStylePreset(preset('blueprint'));
    useAppStore.getState().updateSettings({ textureMode: 'simplified' });
    useAppStore.getState().applyStylePreset(preset('overcast'));
    expect(useAppStore.getState().settings.textureMode).toBe('simplified');
  });

  it('keeps simplified chosen by hand before any preset', () => {
    useAppStore.getState().updateSettings({ textureMode: 'simplified' });
    useAppStore.getState().applyStylePreset(preset('clean-studio'));
    expect(useAppStore.getState().settings.textureMode).toBe('simplified');
  });
});

const SCENE_IDS = [
  'cloud-castle',
  'tropical-island',
  'pastel-sky',
  'night-harbor',
  'twilight-town',
  'ocean-gold',
  'sunset-palms',
  'storm-front',
];

const SCENE_KEYS: (keyof RenderSettings)[] = [
  'background',
  'ground',
  'water',
  'sky',
  'sun',
  'ambient',
  'useBackgroundLighting',
  'shadows',
  'ssao',
  'bloom',
  'fog',
  'grading',
  'vignette',
  'dof',
  'glints',
  'godRays',
  'toneMapping',
  'exposure',
  'clouds',
];

describe('preset list', () => {
  it('keeps the five basic presets and adds eight scene presets', () => {
    const basic = STYLE_PRESETS.filter((p) => p.group === 'basic').map((p) => p.id);
    const scenes = STYLE_PRESETS.filter((p) => p.group === 'scene').map((p) => p.id);
    expect(basic).toEqual([
      'clean-studio',
      'golden-hour',
      'overcast',
      'night-lanterns',
      'blueprint',
    ]);
    expect(scenes).toEqual(SCENE_IDS);
  });

  it('uses unique kebab case ids and only known groups', () => {
    const ids = STYLE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    const groups = new Set(STYLE_PRESET_GROUPS.map((g) => g.id));
    for (const p of STYLE_PRESETS) expect(groups.has(p.group), p.id).toBe(true);
  });
});

describe('scene presets', () => {
  it.each(SCENE_IDS)('%s sets every look related field', (id) => {
    const settings = preset(id).settings;
    for (const key of SCENE_KEYS) expect(settings[key], `${id}.${key}`).toBeDefined();
  });

  it.each(SCENE_IDS)('%s keeps water and the water ground in sync', (id) => {
    const settings = preset(id).settings;
    expect(settings.water?.enabled, id).toBe(settings.ground === 'water');
  });

  it('enables clouds everywhere except the open ocean look', () => {
    const withClouds = SCENE_IDS.filter((id) => preset(id).settings.clouds?.enabled);
    expect(withClouds).toEqual(SCENE_IDS.filter((id) => id !== 'ocean-gold'));
  });

  it('lights the night harbor with stars, the moon and glints over reflective water', () => {
    const night = preset('night-harbor').settings;
    expect(night.background?.type).toBe('night-sky');
    expect(night.sky?.stars.enabled).toBe(true);
    expect(night.sky?.moon.enabled).toBe(true);
    expect(night.glints?.enabled).toBe(true);
    expect(night.water?.reflectivity).toBeGreaterThan(0.8);
  });

  it('applies the full scene and resets it when a basic preset follows', () => {
    const store = useAppStore.getState();
    store.resetSettings();
    store.applyStylePreset(preset('sunset-palms'));
    const scene = useAppStore.getState().settings;
    expect(scene.clouds.enabled).toBe(true);
    expect(scene.water.enabled).toBe(true);
    expect(scene.godRays.enabled).toBe(true);
    expect(scene.vignette.strength).toBeGreaterThan(0.5);
    store.applyStylePreset(preset('overcast'));
    const basic = useAppStore.getState().settings;
    expect(basic.clouds).toEqual(DEFAULT_RENDER_SETTINGS.clouds);
    expect(basic.water).toEqual(DEFAULT_RENDER_SETTINGS.water);
    expect(basic.sky).toEqual(DEFAULT_RENDER_SETTINGS.sky);
    expect(basic.grading).toEqual(DEFAULT_RENDER_SETTINGS.grading);
    expect(basic.vignette).toEqual(DEFAULT_RENDER_SETTINGS.vignette);
    expect(basic.dof).toEqual(DEFAULT_RENDER_SETTINGS.dof);
    expect(basic.glints).toEqual(DEFAULT_RENDER_SETTINGS.glints);
    expect(basic.godRays).toEqual(DEFAULT_RENDER_SETTINGS.godRays);
  });
});

describe('golden hour sun', () => {
  it('puts the sky sun on the camera side of the default three quarter view', () => {
    const golden = preset('golden-hour');
    const background = golden.settings.background;
    if (background?.type !== 'sky') throw new Error('golden hour should use the sky');
    const sun = timeOfDayToSun(background.timeOfDay, golden.settings.sun?.azimuth);
    const camera = directionToSunAngles(presetDirection('three-quarter'));
    const delta = Math.abs(((sun.azimuth - camera.azimuth + 540) % 360) - 180);
    expect(delta).toBeLessThan(90);
    expect(sun.elevation).toBeGreaterThan(10);
    expect(sun.elevation).toBeLessThan(30);
  });
});
