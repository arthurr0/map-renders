import type { CloudQuality, CloudSettings } from '../../core';
import { ColorField, Section, Segmented, Slider, Toggle } from '../components/controls';
import { RANGES } from '../settingsRanges';
import { useAppStore } from '../store';

const QUALITY: { value: CloudQuality; label: string; title: string }[] = [
  { value: 'low', label: 'Low', title: 'Fewer steps at half resolution' },
  { value: 'medium', label: 'Medium', title: 'Balanced steps at half resolution' },
  { value: 'high', label: 'High', title: 'Most steps at full resolution' },
];

export const CLOUD_LOOKS: {
  id: string;
  label: string;
  colors: Pick<CloudSettings, 'color' | 'shadowColor'>;
}[] = [
  { id: 'bright', label: 'Bright', colors: { color: '#ffffff', shadowColor: '#8f9cc8' } },
  { id: 'storm', label: 'Storm', colors: { color: '#b4b8bf', shadowColor: '#3f444d' } },
  { id: 'twilight', label: 'Twilight', colors: { color: '#eceaff', shadowColor: '#5a5fb4' } },
  { id: 'sunset', label: 'Sunset', colors: { color: '#ffd9b8', shadowColor: '#7b6a9e' } },
];

export function CloudsSection() {
  const clouds = useAppStore((state) => state.settings.clouds);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const set = (patch: Partial<CloudSettings>) =>
    updateSettings({ clouds: { ...clouds, ...patch } });
  return (
    <Section id="clouds" title="Clouds">
      <Toggle
        label="Volumetric clouds"
        checked={clouds.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      {clouds.enabled && (
        <>
          <Segmented
            label="Cloud quality"
            value={clouds.quality}
            options={QUALITY}
            onChange={(quality) => set({ quality })}
          />
          <div className="chips" role="group" aria-label="Cloud looks">
            {CLOUD_LOOKS.map((look) => (
              <button key={look.id} type="button" className="chip" onClick={() => set(look.colors)}>
                {look.label}
              </button>
            ))}
          </div>
          <Slider
            label="Coverage"
            value={clouds.coverage}
            min={RANGES.cloudCoverage.min}
            max={RANGES.cloudCoverage.max}
            onChange={(coverage) => set({ coverage })}
          />
          <Slider
            label="Density"
            value={clouds.density}
            min={RANGES.cloudDensity.min}
            max={RANGES.cloudDensity.max}
            onChange={(density) => set({ density })}
          />
          <Slider
            label="Height"
            value={clouds.height}
            min={RANGES.cloudHeight.min}
            max={RANGES.cloudHeight.max}
            onChange={(height) => set({ height })}
          />
          <Slider
            label="Thickness"
            value={clouds.thickness}
            min={RANGES.cloudThickness.min}
            max={RANGES.cloudThickness.max}
            onChange={(thickness) => set({ thickness })}
          />
          <Slider
            label="Scale"
            value={clouds.scale}
            min={RANGES.cloudScale.min}
            max={RANGES.cloudScale.max}
            onChange={(scale) => set({ scale })}
          />
          <Slider
            label="Wind offset"
            value={clouds.windOffset}
            min={RANGES.cloudWindOffset.min}
            max={RANGES.cloudWindOffset.max}
            onChange={(windOffset) => set({ windOffset })}
          />
          <Slider
            label="Sun influence"
            value={clouds.sunInfluence}
            min={RANGES.cloudSunInfluence.min}
            max={RANGES.cloudSunInfluence.max}
            onChange={(sunInfluence) => set({ sunInfluence })}
          />
          <ColorField
            label="Cloud color"
            value={clouds.color}
            onChange={(color) => set({ color })}
          />
          <ColorField
            label="Shadow color"
            value={clouds.shadowColor}
            onChange={(shadowColor) => set({ shadowColor })}
          />
        </>
      )}
    </Section>
  );
}
