import type { WaterSettings } from '../../core';
import { ColorField, Section, Slider, Toggle } from '../components/controls';
import { RANGES } from '../settingsRanges';
import { useAppStore } from '../store';

export function WaterSection() {
  const ground = useAppStore((state) => state.settings.ground);
  const water = useAppStore((state) => state.settings.water);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const set = (patch: Partial<WaterSettings>) => updateSettings({ water: { ...water, ...patch } });
  const active = ground === 'water';
  return (
    <Section id="water" title="Water">
      {!active && <p className="note">Set the ground surface to Water to use these settings.</p>}
      <Toggle
        label="Advanced water"
        checked={water.enabled}
        disabled={!active}
        onChange={(enabled) => set({ enabled })}
      />
      {water.enabled && active && (
        <>
          <div className="subheading">Color</div>
          <ColorField
            label="Shallow"
            value={water.colorShallow}
            onChange={(colorShallow) => set({ colorShallow })}
          />
          <ColorField
            label="Deep"
            value={water.colorDeep}
            onChange={(colorDeep) => set({ colorDeep })}
          />
          <Slider
            label="Level"
            value={water.level}
            min={RANGES.waterLevel.min}
            max={RANGES.waterLevel.max}
            step={0.5}
            digits={1}
            onChange={(level) => set({ level })}
          />
          <div className="subheading">Surface</div>
          <Slider
            label="Reflectivity"
            value={water.reflectivity}
            min={RANGES.waterReflectivity.min}
            max={RANGES.waterReflectivity.max}
            onChange={(reflectivity) => set({ reflectivity })}
          />
          <Slider
            label="Roughness"
            value={water.roughness}
            min={RANGES.waterRoughness.min}
            max={RANGES.waterRoughness.max}
            onChange={(roughness) => set({ roughness })}
          />
          <Slider
            label="Wave height"
            value={water.waveHeight}
            min={RANGES.waterWaveHeight.min}
            max={RANGES.waterWaveHeight.max}
            onChange={(waveHeight) => set({ waveHeight })}
          />
          <Slider
            label="Wave scale"
            value={water.waveScale}
            min={RANGES.waterWaveScale.min}
            max={RANGES.waterWaveScale.max}
            onChange={(waveScale) => set({ waveScale })}
          />
          <Slider
            label="Wave phase"
            value={water.wavePhase}
            min={RANGES.waterWavePhase.min}
            max={RANGES.waterWavePhase.max}
            step={0.5}
            digits={1}
            onChange={(wavePhase) => set({ wavePhase })}
          />
          <div className="subheading">Highlights</div>
          <Slider
            label="Sun glitter"
            value={water.sunGlitter}
            min={RANGES.waterSunGlitter.min}
            max={RANGES.waterSunGlitter.max}
            onChange={(sunGlitter) => set({ sunGlitter })}
          />
          <Slider
            label="Shore glow"
            value={water.shoreGlow}
            min={RANGES.waterShoreGlow.min}
            max={RANGES.waterShoreGlow.max}
            onChange={(shoreGlow) => set({ shoreGlow })}
          />
        </>
      )}
    </Section>
  );
}
