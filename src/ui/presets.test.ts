import { beforeEach, describe, expect, it } from 'vitest';
import { presetDirection } from '../render/math/cameraFit';
import { directionToSunAngles, timeOfDayToSun } from '../render/math/sun';
import { STYLE_PRESETS } from './presets';
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
