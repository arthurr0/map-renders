import { DEFAULT_RENDER_SETTINGS } from '../../core/defaults';
import type {
  Background,
  ExportOptions,
  GroundType,
  RenderSettings,
  TextureMode,
  TurntableOptions,
} from '../../core/types';
import { SceneRenderer, type CameraPreset } from '../index';
import { blobToDataUrl } from '../export/encode';
import { buildSyntheticAtlas, buildSyntheticModel } from './synthetic';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const panel = document.getElementById('panel') as HTMLDivElement;
const frame = document.getElementById('frame') as HTMLDivElement;
if (params.get('panel') === '0') panel.classList.add('hidden');

function backgroundFrom(kind: string): Background {
  switch (kind) {
    case 'solid':
      return { type: 'solid', color: params.get('color') ?? '#d7dde6' };
    case 'sky':
      return {
        type: 'sky',
        timeOfDay: Number(params.get('time') ?? 15),
        turbidity: Number(params.get('turbidity') ?? 4),
      };
    case 'night-sky':
      return { type: 'night-sky', twilight: Number(params.get('twilight') ?? 0.2) };
    case 'hdri':
      return {
        type: 'hdri',
        id: params.get('hdri') ?? 'meadow_2',
        blur: Number(params.get('blur') ?? 0),
        rotation: Number(params.get('rot') ?? 0),
      };
    case 'transparent':
      return { type: 'transparent' };
    default:
      return { type: 'gradient', top: '#6fa8dc', bottom: '#dbeafe' };
  }
}

const flag = (name: string, fallback: boolean) => {
  const v = params.get(name);
  return v === null ? fallback : v === '1' || v === 'true';
};

let settings: RenderSettings = {
  ...DEFAULT_RENDER_SETTINGS,
  background: backgroundFrom(params.get('bg') ?? 'gradient'),
  ground: (params.get('ground') as GroundType | null) ?? 'grass',
  useBackgroundLighting: flag('envlight', false),
  shadows: { ...DEFAULT_RENDER_SETTINGS.shadows, enabled: flag('shadows', true) },
  ssao: { ...DEFAULT_RENDER_SETTINGS.ssao, enabled: flag('ssao', true) },
  bloom: { ...DEFAULT_RENDER_SETTINGS.bloom, enabled: flag('bloom', true) },
  fog: { ...DEFAULT_RENDER_SETTINGS.fog, enabled: flag('fog', false) },
  toneMapping: (params.get('tm') as RenderSettings['toneMapping'] | null) ?? 'agx',
  exposure: Number(params.get('exposure') ?? 1),
};
if (params.get('az')) settings.sun = { ...settings.sun, azimuth: Number(params.get('az')) };
if (params.get('el')) settings.sun = { ...settings.sun, elevation: Number(params.get('el')) };

const mode: TextureMode = params.get('mode') === 'simplified' ? 'simplified' : 'textured';
const atlas = mode === 'textured' ? buildSyntheticAtlas() : null;
const model = buildSyntheticModel(atlas);

const renderer = new SceneRenderer(canvas);
renderer.setRenderOptions({ animateWater: flag('animate', false) });
renderer.setSettings(settings);

function layout(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
  const aspect = Number(params.get('frame') ?? 0);
  if (aspect > 0) {
    const f = renderer.getExportFrame(aspect);
    Object.assign(frame.style, {
      display: 'block',
      left: `${f.x}px`,
      top: `${f.y}px`,
      width: `${f.width}px`,
      height: `${f.height}px`,
    });
  } else {
    frame.style.display = 'none';
  }
}
window.addEventListener('resize', layout);
layout();
renderer.setModel(model, atlas ? atlas.canvas : null, mode);
renderer.fitCamera((params.get('preset') as CameraPreset | null) ?? 'three-quarter', false);
const camParam = params.get('cam');
if (camParam) {
  const v = camParam.split(',').map(Number);
  renderer.setCamera(
    {
      ...renderer.getCamera(),
      position: [v[0] ?? 40, v[1] ?? 20, v[2] ?? 40],
      target: [v[3] ?? 16, v[4] ?? 4, v[5] ?? 16],
    },
    false,
  );
}
if (params.get('proj') === 'ortho') {
  renderer.setCamera({ ...renderer.getCamera(), projection: 'orthographic' }, false);
}

function update(patch: Partial<RenderSettings>): void {
  settings = { ...settings, ...patch };
  renderer.setSettings(settings);
}

function addSelect(label: string, values: string[], current: string, on: (v: string) => void) {
  const l = document.createElement('label');
  l.textContent = label;
  const s = document.createElement('select');
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    s.append(o);
  }
  s.value = current;
  s.addEventListener('change', () => on(s.value));
  panel.append(l, s);
}

addSelect(
  'Background',
  ['gradient', 'solid', 'sky', 'night-sky', 'hdri', 'transparent'],
  settings.background.type,
  (v) => update({ background: backgroundFrom(v) }),
);
addSelect(
  'HDRI',
  ['meadow_2', 'kloofendal_overcast_puresky', 'venice_sunset', 'studio_small_09'],
  params.get('hdri') ?? 'meadow_2',
  (v) => update({ background: { type: 'hdri', id: v, blur: 0, rotation: 0 } }),
);
addSelect('Ground', ['none', 'shadow-catcher', 'grass', 'grid', 'water'], settings.ground, (v) =>
  update({ ground: v as GroundType }),
);
addSelect('Tone map', ['aces', 'agx', 'neutral', 'none'], settings.toneMapping, (v) =>
  update({ toneMapping: v as RenderSettings['toneMapping'] }),
);
addSelect('Camera', ['three-quarter', 'iso', 'front', 'side', 'top'], 'three-quarter', (v) =>
  renderer.fitCamera(v as CameraPreset),
);
addSelect('Projection', ['perspective', 'orthographic'], 'perspective', (v) =>
  renderer.setCamera({ ...renderer.getCamera(), projection: v as 'perspective' }, true),
);
addSelect('SSAO', ['on', 'off'], settings.ssao.enabled ? 'on' : 'off', (v) =>
  update({ ssao: { ...settings.ssao, enabled: v === 'on' } }),
);
addSelect('Bloom', ['on', 'off'], settings.bloom.enabled ? 'on' : 'off', (v) =>
  update({ bloom: { ...settings.bloom, enabled: v === 'on' } }),
);
addSelect('Env light', ['off', 'on'], settings.useBackgroundLighting ? 'on' : 'off', (v) =>
  update({ useBackgroundLighting: v === 'on' }),
);

const sandbox = {
  renderer,
  get settings() {
    return settings;
  },
  update,
  async exportImage(options: Partial<ExportOptions> = {}): Promise<string> {
    const blob = await renderer.renderImage({
      width: 1280,
      height: 720,
      supersample: 1,
      transparent: false,
      format: 'png',
      quality: 0.92,
      ...options,
    });
    return blobToDataUrl(blob);
  },
  async exportTurntable(
    options: Partial<TurntableOptions> = {},
  ): Promise<{ size: number; type: string; url: string }> {
    const blob = await renderer.renderTurntable({
      width: 320,
      height: 180,
      durationSec: 1,
      fps: 24,
      format: 'webm',
      ...options,
    });
    return { size: blob.size, type: blob.type, url: await blobToDataUrl(blob) };
  },
  thumbnail: (size: number) => renderer.captureThumbnail(size),
};

(window as unknown as { sandbox: typeof sandbox }).sandbox = sandbox;
