import { Section, Slider, Toggle } from '../components/controls';
import { RANGES } from '../settingsRanges';
import { useAppStore } from '../store';

export function PostFxSection() {
  const dof = useAppStore((state) => state.settings.dof);
  const glints = useAppStore((state) => state.settings.glints);
  const godRays = useAppStore((state) => state.settings.godRays);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return (
    <Section id="postfx" title="Lens and light">
      <Toggle
        label="Depth of field"
        checked={dof.enabled}
        onChange={(enabled) => updateSettings({ dof: { ...dof, enabled } })}
      />
      {dof.enabled && (
        <>
          <Toggle
            label="Focus on map center"
            checked={dof.autoFocus}
            onChange={(autoFocus) => updateSettings({ dof: { ...dof, autoFocus } })}
          />
          <Slider
            label="Focus distance"
            value={dof.focusDistance}
            min={RANGES.dofFocusDistance.min}
            max={RANGES.dofFocusDistance.max}
            step={1}
            disabled={dof.autoFocus}
            onChange={(focusDistance) => updateSettings({ dof: { ...dof, focusDistance } })}
          />
          <Slider
            label="Aperture"
            value={dof.aperture}
            min={RANGES.dofAperture.min}
            max={RANGES.dofAperture.max}
            step={0.1}
            onChange={(aperture) => updateSettings({ dof: { ...dof, aperture } })}
          />
          <Slider
            label="Max blur"
            value={dof.maxBlur}
            min={RANGES.dofMaxBlur.min}
            max={RANGES.dofMaxBlur.max}
            unit="%"
            onChange={(maxBlur) => updateSettings({ dof: { ...dof, maxBlur } })}
          />
          <Slider
            label="Tilt shift"
            value={dof.tiltShift}
            min={RANGES.dofTiltShift.min}
            max={RANGES.dofTiltShift.max}
            onChange={(tiltShift) => updateSettings({ dof: { ...dof, tiltShift } })}
          />
        </>
      )}
      <Toggle
        label="Star glints"
        checked={glints.enabled}
        onChange={(enabled) => updateSettings({ glints: { ...glints, enabled } })}
      />
      {glints.enabled && (
        <>
          <Slider
            label="Strength"
            value={glints.strength}
            min={RANGES.glintStrength.min}
            max={RANGES.glintStrength.max}
            onChange={(strength) => updateSettings({ glints: { ...glints, strength } })}
          />
          <Slider
            label="Length"
            value={glints.length}
            min={RANGES.glintLength.min}
            max={RANGES.glintLength.max}
            step={0.1}
            unit="%"
            onChange={(length) => updateSettings({ glints: { ...glints, length } })}
          />
          <Slider
            label="Threshold"
            value={glints.threshold}
            min={RANGES.glintThreshold.min}
            max={RANGES.glintThreshold.max}
            step={0.1}
            onChange={(threshold) => updateSettings({ glints: { ...glints, threshold } })}
          />
        </>
      )}
      <Toggle
        label="God rays"
        checked={godRays.enabled}
        onChange={(enabled) => updateSettings({ godRays: { ...godRays, enabled } })}
      />
      {godRays.enabled && (
        <>
          <Slider
            label="Strength"
            value={godRays.strength}
            min={RANGES.godRaysStrength.min}
            max={RANGES.godRaysStrength.max}
            onChange={(strength) => updateSettings({ godRays: { ...godRays, strength } })}
          />
          <Slider
            label="Decay"
            value={godRays.decay}
            min={RANGES.godRaysDecay.min}
            max={RANGES.godRaysDecay.max}
            onChange={(decay) => updateSettings({ godRays: { ...godRays, decay } })}
          />
          <Slider
            label="Length"
            value={godRays.length}
            min={RANGES.godRaysLength.min}
            max={RANGES.godRaysLength.max}
            onChange={(length) => updateSettings({ godRays: { ...godRays, length } })}
          />
          <Slider
            label="Samples"
            value={godRays.samples}
            min={RANGES.godRaysSamples.min}
            max={RANGES.godRaysSamples.max}
            step={8}
            onChange={(samples) => updateSettings({ godRays: { ...godRays, samples } })}
          />
        </>
      )}
    </Section>
  );
}
