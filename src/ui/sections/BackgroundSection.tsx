import { useEffect } from 'react';
import type { Background } from '../../core';
import { ColorField, Section, SelectField, Slider } from '../components/controls';
import { fetchHdriList } from '../hdri';
import { useAppStore } from '../store';

type BackgroundType = Background['type'];

const TYPES: { value: BackgroundType; label: string }[] = [
  { value: 'solid', label: 'Solid color' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'sky', label: 'Sky' },
  { value: 'hdri', label: 'HDRI' },
  { value: 'transparent', label: 'Transparent' },
];

const GRADIENT_PRESETS = [
  { label: 'Day', top: '#6fa8dc', bottom: '#dbeafe' },
  { label: 'Dusk', top: '#3b2f63', bottom: '#f4a261' },
  { label: 'Night', top: '#050816', bottom: '#1b2447' },
  { label: 'Studio', top: '#f4f5f7', bottom: '#c9ced6' },
  { label: 'Mint', top: '#9be3c4', bottom: '#effcf6' },
];

const TIMES = [
  { label: 'Sunrise', hour: 6.5 },
  { label: 'Noon', hour: 12 },
  { label: 'Sunset', hour: 18 },
];

function formatHour(hour: number): string {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  return `${String(whole).padStart(2, '0')}:${String(minutes === 60 ? 0 : minutes).padStart(2, '0')}`;
}

export function BackgroundSection() {
  const background = useAppStore((state) => state.settings.background);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const hdriList = useAppStore((state) => state.hdriList);
  const setHdriList = useAppStore((state) => state.setHdriList);

  useEffect(() => {
    if (hdriList.length > 0) return;
    let cancelled = false;
    void fetchHdriList().then((list) => {
      if (!cancelled) setHdriList(list);
    });
    return () => {
      cancelled = true;
    };
  }, [hdriList.length, setHdriList]);

  const firstHdri = hdriList[0]?.id;
  const needsHdriId = background.type === 'hdri' && background.id === '';
  useEffect(() => {
    if (needsHdriId && firstHdri && background.type === 'hdri') {
      updateSettings({ background: { ...background, id: firstHdri } });
    }
  }, [needsHdriId, firstHdri, background, updateSettings]);

  const set = (next: Background) => updateSettings({ background: next });

  const changeType = (type: BackgroundType) => {
    if (type === background.type) return;
    switch (type) {
      case 'solid':
        set({
          type,
          color: background.type === 'gradient' ? background.bottom : '#1a1c21',
        });
        break;
      case 'gradient':
        set({
          type,
          top: background.type === 'solid' ? background.color : '#6fa8dc',
          bottom: '#dbeafe',
        });
        break;
      case 'sky':
        set({ type, timeOfDay: 12, turbidity: 4 });
        break;
      case 'hdri':
        set({ type, id: hdriList[0]?.id ?? '', blur: 0, rotation: 0 });
        break;
      case 'transparent':
        set({ type });
        break;
    }
  };

  return (
    <Section id="background" title="Background">
      <SelectField label="Type" value={background.type} options={TYPES} onChange={changeType} />
      {background.type === 'solid' && (
        <ColorField
          label="Color"
          value={background.color}
          onChange={(color) => set({ type: 'solid', color })}
        />
      )}
      {background.type === 'gradient' && (
        <>
          <ColorField
            label="Top"
            value={background.top}
            onChange={(top) => set({ ...background, top })}
          />
          <ColorField
            label="Bottom"
            value={background.bottom}
            onChange={(bottom) => set({ ...background, bottom })}
          />
          <div className="chips" role="group" aria-label="Gradient presets">
            {GRADIENT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="chip"
                title={`${preset.label} gradient`}
                onClick={() => set({ type: 'gradient', top: preset.top, bottom: preset.bottom })}
              >
                <span
                  className="chip-swatch"
                  style={{ background: `linear-gradient(${preset.top}, ${preset.bottom})` }}
                />
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
      {background.type === 'sky' && (
        <>
          <Slider
            label={`Time ${formatHour(background.timeOfDay)}`}
            value={background.timeOfDay}
            min={0}
            max={24}
            step={0.1}
            digits={1}
            unit="h"
            onChange={(timeOfDay) => set({ ...background, timeOfDay })}
          />
          <div className="chips" role="group" aria-label="Time of day">
            {TIMES.map((time) => (
              <button
                key={time.label}
                type="button"
                className="chip"
                onClick={() => set({ ...background, timeOfDay: time.hour })}
              >
                {time.label}
              </button>
            ))}
          </div>
          <Slider
            label="Turbidity"
            value={background.turbidity}
            min={1}
            max={20}
            step={0.5}
            onChange={(turbidity) => set({ ...background, turbidity })}
          />
        </>
      )}
      {background.type === 'hdri' && (
        <>
          {hdriList.length === 0 ? (
            <p className="note">No HDRI files found in /hdri/index.json.</p>
          ) : (
            <SelectField
              label="Environment"
              value={background.id}
              options={hdriList.map((entry) => ({ value: entry.id, label: entry.name }))}
              onChange={(id) => set({ ...background, id })}
            />
          )}
          <Slider
            label="Blur"
            value={background.blur}
            min={0}
            max={1}
            onChange={(blur) => set({ ...background, blur })}
          />
          <Slider
            label="Rotation"
            value={background.rotation}
            min={0}
            max={360}
            step={1}
            unit="°"
            onChange={(rotation) => set({ ...background, rotation })}
          />
        </>
      )}
      {background.type === 'transparent' && (
        <div className="checkerboard" aria-label="Transparent background preview" />
      )}
    </Section>
  );
}
