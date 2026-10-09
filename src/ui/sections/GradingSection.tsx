import { ColorField, Section, Slider, Toggle } from '../components/controls';
import { RANGES } from '../settingsRanges';
import { useAppStore } from '../store';

export function GradingSection() {
  const grading = useAppStore((state) => state.settings.grading);
  const vignette = useAppStore((state) => state.settings.vignette);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setGrading = (patch: Partial<typeof grading>) =>
    updateSettings({ grading: { ...grading, ...patch } });
  return (
    <Section id="grading" title="Color grading">
      <Toggle
        label="Color grading"
        checked={grading.enabled}
        onChange={(enabled) => setGrading({ enabled })}
      />
      {grading.enabled && (
        <>
          <Slider
            label="Contrast"
            value={grading.contrast}
            min={RANGES.gradingContrast.min}
            max={RANGES.gradingContrast.max}
            onChange={(contrast) => setGrading({ contrast })}
          />
          <Slider
            label="Saturation"
            value={grading.saturation}
            min={RANGES.gradingSaturation.min}
            max={RANGES.gradingSaturation.max}
            onChange={(saturation) => setGrading({ saturation })}
          />
          <Slider
            label="Vibrance"
            value={grading.vibrance}
            min={RANGES.gradingVibrance.min}
            max={RANGES.gradingVibrance.max}
            onChange={(vibrance) => setGrading({ vibrance })}
          />
          <Slider
            label="Midtones"
            value={grading.gamma}
            min={RANGES.gradingGamma.min}
            max={RANGES.gradingGamma.max}
            onChange={(gamma) => setGrading({ gamma })}
          />
          <Slider
            label="Temperature"
            value={grading.temperature}
            min={RANGES.gradingTemperature.min}
            max={RANGES.gradingTemperature.max}
            onChange={(temperature) => setGrading({ temperature })}
          />
          <Slider
            label="Tint"
            value={grading.tint}
            min={RANGES.gradingTint.min}
            max={RANGES.gradingTint.max}
            onChange={(tint) => setGrading({ tint })}
          />
          <div className="subheading">Shadows</div>
          <ColorField
            label="Shadow tint"
            value={grading.shadowColor}
            onChange={(shadowColor) => setGrading({ shadowColor })}
          />
          <Slider
            label="Amount"
            value={grading.shadowAmount}
            min={RANGES.gradingTone.min}
            max={RANGES.gradingTone.max}
            onChange={(shadowAmount) => setGrading({ shadowAmount })}
          />
          <div className="subheading">Highlights</div>
          <ColorField
            label="Highlight tint"
            value={grading.highlightColor}
            onChange={(highlightColor) => setGrading({ highlightColor })}
          />
          <Slider
            label="Amount"
            value={grading.highlightAmount}
            min={RANGES.gradingTone.min}
            max={RANGES.gradingTone.max}
            onChange={(highlightAmount) => setGrading({ highlightAmount })}
          />
          <div className="subheading">Lens</div>
          <Slider
            label="Film grain"
            value={grading.grain}
            min={RANGES.gradingGrain.min}
            max={RANGES.gradingGrain.max}
            onChange={(grain) => setGrading({ grain })}
          />
          <Slider
            label="Chromatic aberration"
            value={grading.aberration}
            min={RANGES.gradingAberration.min}
            max={RANGES.gradingAberration.max}
            onChange={(aberration) => setGrading({ aberration })}
          />
        </>
      )}
      <Toggle
        label="Vignette"
        checked={vignette.enabled}
        onChange={(enabled) => updateSettings({ vignette: { ...vignette, enabled } })}
      />
      {vignette.enabled && (
        <>
          <Slider
            label="Strength"
            value={vignette.strength}
            min={RANGES.vignetteStrength.min}
            max={RANGES.vignetteStrength.max}
            onChange={(strength) => updateSettings({ vignette: { ...vignette, strength } })}
          />
          <Slider
            label="Softness"
            value={vignette.softness}
            min={RANGES.vignetteSoftness.min}
            max={RANGES.vignetteSoftness.max}
            onChange={(softness) => updateSettings({ vignette: { ...vignette, softness } })}
          />
        </>
      )}
    </Section>
  );
}
