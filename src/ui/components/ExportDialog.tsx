import { useEffect, useRef, useState } from 'react';
import { RESOLUTION_PRESETS } from '../../core';
import {
  applyAspectLock,
  clampDimension,
  extensionFor,
  megapixels,
  supportsTransparency,
} from '../exportMath';
import {
  cancelExport,
  resolveTargets,
  runImageExport,
  runTurntableExport,
  type ExportScope,
} from '../exportRunner';
import { useAppStore } from '../store';
import { Segmented, SelectField, Slider, Toggle } from './controls';
import { Icon, IconButton } from './Icon';

function presetIdFor(width: number, height: number): string {
  const match = RESOLUTION_PRESETS.find((p) => p.width === width && p.height === height);
  return match ? match.id : 'custom';
}

function SizeFields({
  width,
  height,
  onChange,
}: {
  width: number;
  height: number;
  onChange: (width: number, height: number) => void;
}) {
  const [locked, setLocked] = useState(true);
  const ratio = width / height;
  return (
    <div className="size-fields">
      <label>
        <span className="field-label">Width</span>
        <input
          type="number"
          min={16}
          max={16384}
          value={width}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (!Number.isFinite(value)) return;
            if (locked) {
              const next = applyAspectLock('width', value, ratio);
              onChange(next.width, next.height);
            } else {
              onChange(clampDimension(value), height);
            }
          }}
        />
      </label>
      <IconButton
        icon={locked ? 'link' : 'unlink'}
        label={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
        active={locked}
        onClick={() => setLocked(!locked)}
      />
      <label>
        <span className="field-label">Height</span>
        <input
          type="number"
          min={16}
          max={16384}
          value={height}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (!Number.isFinite(value)) return;
            if (locked) {
              const next = applyAspectLock('height', value, ratio);
              onChange(next.width, next.height);
            } else {
              onChange(width, clampDimension(value));
            }
          }}
        />
      </label>
    </div>
  );
}

export function ExportDialog() {
  const open = useAppStore((state) => state.exportOpen);
  const setOpen = useAppStore((state) => state.setExportOpen);
  const tab = useAppStore((state) => state.exportTab);
  const setTab = useAppStore((state) => state.setExportTab);
  const { options, busy, progress, error } = useAppStore((state) => state.exportState);
  const update = useAppStore((state) => state.updateExportOptions);
  const shots = useAppStore((state) => state.shots);
  const selected = useAppStore((state) => state.selectedShotIds);
  const hasVolume = useAppStore((state) => state.volume !== null);
  const [scope, setScope] = useState<ExportScope>('current');
  const turntable = useAppStore((state) => state.turntable);
  const updateTurntable = useAppStore((state) => state.updateTurntable);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !useAppStore.getState().exportState.busy) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const transparentAllowed = supportsTransparency(options.format);
  const targetCount = resolveTargets(scope, shots, selected).length;
  const lossy = options.format !== 'png';

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        tabIndex={-1}
        ref={dialog}
      >
        <div className="dialog-header">
          <h2 id="export-title">Export</h2>
          <IconButton
            icon="close"
            label="Close export"
            disabled={busy}
            onClick={() => setOpen(false)}
          />
        </div>
        <Segmented
          label="Export type"
          value={tab}
          options={[
            { value: 'image', label: 'Image' },
            { value: 'turntable', label: 'Turntable' },
          ]}
          onChange={setTab}
        />

        {tab === 'image' ? (
          <div className="dialog-body">
            <SelectField
              label="Resolution"
              value={presetIdFor(options.width, options.height)}
              options={[
                ...RESOLUTION_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                { value: 'custom', label: 'Custom' },
              ]}
              onChange={(id) => {
                const preset = RESOLUTION_PRESETS.find((p) => p.id === id);
                if (preset) update({ width: preset.width, height: preset.height });
              }}
            />
            <SizeFields
              width={options.width}
              height={options.height}
              onChange={(width, height) => update({ width, height })}
            />
            <Segmented
              label="Supersampling"
              value={options.supersample}
              options={[
                { value: 1, label: '1x' },
                { value: 2, label: '2x' },
                { value: 4, label: '4x' },
              ]}
              onChange={(supersample) => update({ supersample })}
            />
            {megapixels(options) > 100 && (
              <p className="note warn">
                This renders about {Math.round(megapixels(options))} megapixels. It may be slow or
                run out of memory.
              </p>
            )}
            <SelectField
              label="Format"
              value={options.format}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'webp', label: 'WebP' },
              ]}
              onChange={(format) =>
                update({ format, transparent: options.transparent && supportsTransparency(format) })
              }
            />
            {lossy && (
              <Slider
                label="Quality"
                value={options.quality}
                min={0.1}
                max={1}
                step={0.01}
                onChange={(quality) => update({ quality })}
              />
            )}
            <Toggle
              label="Transparent background"
              checked={options.transparent && transparentAllowed}
              disabled={!transparentAllowed}
              onChange={(transparent) => update({ transparent })}
            />
            {!transparentAllowed && <p className="note">JPEG has no transparency.</p>}
            <SelectField
              label="Shots"
              value={scope}
              options={[
                { value: 'current', label: 'Current view' },
                { value: 'selected', label: `Selected shots (${selected.length})` },
                { value: 'all', label: `All shots (${shots.length})` },
              ]}
              onChange={setScope}
            />
            {targetCount > 1 && (
              <p className="note">Several images are downloaded together as one zip file.</p>
            )}
          </div>
        ) : (
          <div className="dialog-body">
            <SizeFields
              width={turntable.width}
              height={turntable.height}
              onChange={(width, height) => updateTurntable({ width, height })}
            />
            <Slider
              label="Duration"
              value={turntable.durationSec}
              min={2}
              max={30}
              step={1}
              unit="s"
              onChange={(durationSec) => updateTurntable({ durationSec })}
            />
            <Segmented
              label="Frame rate"
              value={turntable.fps}
              options={[
                { value: 24, label: '24 fps' },
                { value: 30, label: '30 fps' },
                { value: 60, label: '60 fps' },
              ]}
              onChange={(fps) => updateTurntable({ fps })}
            />
            <Segmented
              label="Video format"
              value={turntable.format}
              options={[
                { value: 'webm', label: 'WebM' },
                { value: 'gif', label: 'GIF' },
              ]}
              onChange={(format) => updateTurntable({ format })}
            />
            <p className="note">
              The camera orbits the model once from the current view. File type: .{turntable.format}
            </p>
          </div>
        )}

        {busy && (
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            <span>{Math.round(progress * 100)}%</span>
          </div>
        )}
        {error && !busy && <p className="note error">{error}</p>}

        <div className="dialog-footer">
          {busy ? (
            <button type="button" onClick={cancelExport}>
              Cancel export
            </button>
          ) : (
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={busy || !hasVolume || (tab === 'image' && targetCount === 0)}
            onClick={() =>
              void (tab === 'image' ? runImageExport(scope) : runTurntableExport(turntable))
            }
          >
            <Icon name={tab === 'image' ? 'export' : 'play'} size={16} />
            {tab === 'image' ? `Export .${extensionFor(options.format)}` : 'Render turntable'}
          </button>
        </div>
      </div>
    </div>
  );
}
