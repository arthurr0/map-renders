import type { GroundType, Projection, RenderSettings } from '../../core';
import {
  ColorField,
  Section,
  Segmented,
  SelectField,
  Slider,
  Toggle,
} from '../components/controls';
import { getRenderer } from '../rendererRef';
import { STYLE_PRESETS } from '../presets';
import { useAppStore } from '../store';
import type { CameraPreset } from '../../render';

const GROUNDS: { value: GroundType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'shadow-catcher', label: 'Shadow catcher' },
  { value: 'grass', label: 'Grass' },
  { value: 'grid', label: 'Grid' },
  { value: 'water', label: 'Water' },
];

export function GroundSection() {
  const ground = useAppStore((state) => state.settings.ground);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <Section id="ground" title="Ground">
      <SelectField
        label="Surface"
        value={ground}
        options={GROUNDS}
        onChange={(value) => updateSettings({ ground: value })}
      />
    </Section>
  );
}

export function LightingSection() {
  const sun = useAppStore((state) => state.settings.sun);
  const ambient = useAppStore((state) => state.settings.ambient);
  const useBackgroundLighting = useAppStore((state) => state.settings.useBackgroundLighting);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <Section id="lighting" title="Lighting">
      <div className="subheading">Sun</div>
      <Slider
        label="Azimuth"
        value={sun.azimuth}
        min={0}
        max={360}
        step={1}
        unit="°"
        onChange={(azimuth) => updateSettings({ sun: { ...sun, azimuth } })}
      />
      <Slider
        label="Elevation"
        value={sun.elevation}
        min={0}
        max={90}
        step={1}
        unit="°"
        onChange={(elevation) => updateSettings({ sun: { ...sun, elevation } })}
      />
      <Slider
        label="Intensity"
        value={sun.intensity}
        min={0}
        max={10}
        step={0.1}
        onChange={(intensity) => updateSettings({ sun: { ...sun, intensity } })}
      />
      <ColorField
        label="Sun color"
        value={sun.color}
        onChange={(color) => updateSettings({ sun: { ...sun, color } })}
      />
      <div className="subheading">Ambient</div>
      <Slider
        label="Intensity"
        value={ambient.intensity}
        min={0}
        max={3}
        step={0.05}
        onChange={(intensity) => updateSettings({ ambient: { ...ambient, intensity } })}
      />
      <ColorField
        label="Ambient color"
        value={ambient.color}
        onChange={(color) => updateSettings({ ambient: { ...ambient, color } })}
      />
      <Toggle
        label="Use background lighting"
        checked={useBackgroundLighting}
        onChange={(value) => updateSettings({ useBackgroundLighting: value })}
      />
    </Section>
  );
}

const TONE_MAPPING: { value: RenderSettings['toneMapping']; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'aces', label: 'ACES Filmic' },
  { value: 'agx', label: 'AgX' },
  { value: 'none', label: 'None' },
];

export function EffectsSection() {
  const shadows = useAppStore((state) => state.settings.shadows);
  const ssao = useAppStore((state) => state.settings.ssao);
  const bloom = useAppStore((state) => state.settings.bloom);
  const fog = useAppStore((state) => state.settings.fog);
  const toneMapping = useAppStore((state) => state.settings.toneMapping);
  const exposure = useAppStore((state) => state.settings.exposure);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <Section id="effects" title="Effects">
      <Toggle
        label="Shadows"
        checked={shadows.enabled}
        onChange={(enabled) => updateSettings({ shadows: { ...shadows, enabled } })}
      />
      {shadows.enabled && (
        <>
          <Slider
            label="Softness"
            value={shadows.softness}
            min={0}
            max={10}
            step={0.1}
            onChange={(softness) => updateSettings({ shadows: { ...shadows, softness } })}
          />
          <SelectField
            label="Quality"
            value={shadows.mapSize}
            options={[
              { value: 1024, label: '1024' },
              { value: 2048, label: '2048' },
              { value: 4096, label: '4096' },
            ]}
            onChange={(mapSize) => updateSettings({ shadows: { ...shadows, mapSize } })}
          />
        </>
      )}
      <Toggle
        label="SSAO"
        checked={ssao.enabled}
        onChange={(enabled) => updateSettings({ ssao: { ...ssao, enabled } })}
      />
      {ssao.enabled && (
        <>
          <Slider
            label="Intensity"
            value={ssao.intensity}
            min={0}
            max={4}
            onChange={(intensity) => updateSettings({ ssao: { ...ssao, intensity } })}
          />
          <Slider
            label="Radius"
            value={ssao.radius}
            min={0}
            max={4}
            onChange={(radius) => updateSettings({ ssao: { ...ssao, radius } })}
          />
        </>
      )}
      <Toggle
        label="Bloom"
        checked={bloom.enabled}
        onChange={(enabled) => updateSettings({ bloom: { ...bloom, enabled } })}
      />
      {bloom.enabled && (
        <>
          <Slider
            label="Strength"
            value={bloom.strength}
            min={0}
            max={3}
            onChange={(strength) => updateSettings({ bloom: { ...bloom, strength } })}
          />
          <Slider
            label="Threshold"
            value={bloom.threshold}
            min={0}
            max={1}
            onChange={(threshold) => updateSettings({ bloom: { ...bloom, threshold } })}
          />
          <Slider
            label="Radius"
            value={bloom.radius}
            min={0}
            max={1}
            onChange={(radius) => updateSettings({ bloom: { ...bloom, radius } })}
          />
        </>
      )}
      <Toggle
        label="Fog"
        checked={fog.enabled}
        onChange={(enabled) => updateSettings({ fog: { ...fog, enabled } })}
      />
      {fog.enabled && (
        <>
          <Slider
            label="Density"
            value={fog.density}
            min={0}
            max={0.1}
            step={0.001}
            digits={3}
            onChange={(density) => updateSettings({ fog: { ...fog, density } })}
          />
          <ColorField
            label="Fog color"
            value={fog.color}
            onChange={(color) => updateSettings({ fog: { ...fog, color } })}
          />
        </>
      )}
      <SelectField
        label="Tone mapping"
        value={toneMapping}
        options={TONE_MAPPING}
        onChange={(toneMapping) => updateSettings({ toneMapping })}
      />
      <Slider
        label="Exposure"
        value={exposure}
        min={0.1}
        max={4}
        step={0.05}
        onChange={(exposure) => updateSettings({ exposure })}
      />
    </Section>
  );
}

export const CAMERA_PRESETS: { id: CameraPreset; label: string; key: string }[] = [
  { id: 'iso', label: 'Iso', key: '1' },
  { id: 'front', label: 'Front', key: '2' },
  { id: 'side', label: 'Side', key: '3' },
  { id: 'top', label: 'Top', key: '4' },
  { id: 'three-quarter', label: '3/4', key: '5' },
];

export function applyCameraPreset(preset: CameraPreset): void {
  getRenderer()?.fitCamera(preset);
}

export function CameraSection() {
  const camera = useAppStore((state) => state.camera);
  const setStoreCamera = useAppStore((state) => state.setCamera);

  const change = (patch: Partial<{ projection: Projection; fov: number }>) => {
    const renderer = getRenderer();
    if (!renderer) return;
    const next = { ...renderer.getCamera(), ...patch };
    renderer.setCamera(next, false);
    setStoreCamera(next);
  };

  return (
    <Section id="camera" title="Camera">
      <Segmented
        label="Projection"
        value={camera?.projection ?? 'perspective'}
        options={[
          { value: 'perspective', label: 'Perspective' },
          { value: 'orthographic', label: 'Orthographic' },
        ]}
        onChange={(projection) => change({ projection })}
      />
      <Slider
        label="Field of view"
        value={camera?.fov ?? 50}
        min={10}
        max={110}
        step={1}
        unit="°"
        disabled={camera?.projection === 'orthographic'}
        onChange={(fov) => change({ fov })}
      />
      <div className="chips" role="group" aria-label="Camera presets">
        {CAMERA_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="chip"
            title={`${preset.label} view (${preset.key})`}
            onClick={() => applyCameraPreset(preset.id)}
          >
            {preset.label}
            <kbd>{preset.key}</kbd>
          </button>
        ))}
      </div>
    </Section>
  );
}

export function PresetsSection() {
  const applyStylePreset = useAppStore((state) => state.applyStylePreset);
  const pushToast = useAppStore((state) => state.pushToast);
  return (
    <Section id="presets" title="Style presets" defaultOpen>
      <div className="preset-list">
        {STYLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset"
            onClick={() => {
              applyStylePreset(preset);
              pushToast('info', `Applied ${preset.label}`);
            }}
          >
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}
