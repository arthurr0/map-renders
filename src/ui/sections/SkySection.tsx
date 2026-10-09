import type { SkySettings } from '../../core';
import { ColorField, Section, Slider, Toggle } from '../components/controls';
import { RANGES } from '../settingsRanges';
import { useAppStore } from '../store';

export function SkySection() {
  const backgroundType = useAppStore((state) => state.settings.background.type);
  const sky = useAppStore((state) => state.settings.sky);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const active = backgroundType === 'sky' || backgroundType === 'night-sky';
  const set = (patch: Partial<SkySettings>) => updateSettings({ sky: { ...sky, ...patch } });
  const { stars, moon, horizonGlow } = sky;
  return (
    <Section id="sky" title="Night sky">
      {!active && (
        <p className="note">Set the background to Sky or Night sky to use these settings.</p>
      )}
      <Toggle
        label="Stars"
        checked={stars.enabled}
        disabled={!active}
        onChange={(enabled) => set({ stars: { ...stars, enabled } })}
      />
      {stars.enabled && active && (
        <>
          <Slider
            label="Density"
            value={stars.density}
            min={RANGES.starDensity.min}
            max={RANGES.starDensity.max}
            onChange={(density) => set({ stars: { ...stars, density } })}
          />
          <Slider
            label="Brightness"
            value={stars.brightness}
            min={RANGES.starBrightness.min}
            max={RANGES.starBrightness.max}
            onChange={(brightness) => set({ stars: { ...stars, brightness } })}
          />
        </>
      )}
      <Toggle
        label="Moon"
        checked={moon.enabled}
        disabled={!active}
        onChange={(enabled) => set({ moon: { ...moon, enabled } })}
      />
      {moon.enabled && active && (
        <>
          <Slider
            label="Azimuth"
            value={moon.azimuth}
            min={RANGES.moonAzimuth.min}
            max={RANGES.moonAzimuth.max}
            step={1}
            unit="°"
            onChange={(azimuth) => set({ moon: { ...moon, azimuth } })}
          />
          <Slider
            label="Elevation"
            value={moon.elevation}
            min={RANGES.moonElevation.min}
            max={RANGES.moonElevation.max}
            step={1}
            unit="°"
            onChange={(elevation) => set({ moon: { ...moon, elevation } })}
          />
          <Slider
            label="Size"
            value={moon.size}
            min={RANGES.moonSize.min}
            max={RANGES.moonSize.max}
            step={0.1}
            unit="°"
            onChange={(size) => set({ moon: { ...moon, size } })}
          />
          <Slider
            label="Glow"
            value={moon.glow}
            min={RANGES.moonGlow.min}
            max={RANGES.moonGlow.max}
            onChange={(glow) => set({ moon: { ...moon, glow } })}
          />
          <ColorField
            label="Moon color"
            value={moon.color}
            onChange={(color) => set({ moon: { ...moon, color } })}
          />
        </>
      )}
      <Toggle
        label="Horizon glow"
        checked={horizonGlow.enabled}
        disabled={!active}
        onChange={(enabled) => set({ horizonGlow: { ...horizonGlow, enabled } })}
      />
      {horizonGlow.enabled && active && (
        <>
          <Slider
            label="Intensity"
            value={horizonGlow.intensity}
            min={RANGES.horizonGlowIntensity.min}
            max={RANGES.horizonGlowIntensity.max}
            onChange={(intensity) => set({ horizonGlow: { ...horizonGlow, intensity } })}
          />
          <Slider
            label="Height"
            value={horizonGlow.height}
            min={RANGES.horizonGlowHeight.min}
            max={RANGES.horizonGlowHeight.max}
            onChange={(height) => set({ horizonGlow: { ...horizonGlow, height } })}
          />
          <ColorField
            label="Glow color"
            value={horizonGlow.color}
            onChange={(color) => set({ horizonGlow: { ...horizonGlow, color } })}
          />
        </>
      )}
    </Section>
  );
}
