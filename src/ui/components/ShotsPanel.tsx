import { useRef, useState } from 'react';
import type { SavedShot } from '../../core';
import { runShotExport } from '../exportRunner';
import { flyToShot, renameShot, saveCurrentShot } from '../shots';
import { useAppStore } from '../store';
import { Icon, IconButton } from './Icon';

function ShotItem({
  shot,
  index,
  total,
  selected,
}: {
  shot: SavedShot;
  index: number;
  total: number;
  selected: boolean;
}) {
  const removeShot = useAppStore((state) => state.removeShot);
  const moveShot = useAppStore((state) => state.moveShot);
  const toggleSelected = useAppStore((state) => state.toggleShotSelected);
  const busy = useAppStore((state) => state.exportState.busy);
  const [draft, setDraft] = useState<string | null>(null);

  const cancelled = useRef(false);

  const commit = () => {
    if (draft !== null && !cancelled.current) renameShot(shot.id, draft);
    cancelled.current = false;
    setDraft(null);
  };

  return (
    <li className={`shot${selected ? ' selected' : ''}`}>
      <button
        type="button"
        className="shot-thumb"
        title={`Go to ${shot.name}`}
        aria-label={`Go to ${shot.name}`}
        onClick={() => flyToShot(shot)}
      >
        {shot.thumbnail ? (
          <img src={shot.thumbnail} alt="" draggable={false} />
        ) : (
          <Icon name="camera" size={24} />
        )}
      </button>
      <div className="shot-body">
        <input
          className="shot-name"
          aria-label={`Name of ${shot.name}`}
          value={draft ?? shot.name}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              cancelled.current = true;
              setDraft(null);
              event.currentTarget.blur();
            }
          }}
        />
        <div className="shot-actions">
          <label className="shot-select" title="Include in selected export">
            <input
              type="checkbox"
              checked={selected}
              aria-label={`Select ${shot.name}`}
              onChange={() => toggleSelected(shot.id)}
            />
          </label>
          <IconButton
            icon="up"
            label="Move up"
            disabled={index === 0}
            onClick={() => moveShot(shot.id, -1)}
          />
          <IconButton
            icon="down"
            label="Move down"
            disabled={index === total - 1}
            onClick={() => moveShot(shot.id, 1)}
          />
          <IconButton
            icon="export"
            label="Export this shot"
            disabled={busy}
            onClick={() => void runShotExport(shot)}
          />
          <IconButton icon="trash" label="Delete shot" onClick={() => removeShot(shot.id)} />
        </div>
      </div>
    </li>
  );
}

export function ShotsPanel() {
  const shots = useAppStore((state) => state.shots);
  const selected = useAppStore((state) => state.selectedShotIds);
  const hasVolume = useAppStore((state) => state.volume !== null);
  const open = useAppStore((state) => state.rightDrawerOpen);
  const setOpen = useAppStore((state) => state.setRightDrawerOpen);
  const setExportOpen = useAppStore((state) => state.setExportOpen);

  return (
    <aside className={`app-shots drawer${open ? ' open' : ''}`} aria-label="Shots">
      <div className="panel-header">
        <h2>Shots</h2>
        <span className="count">{shots.length}</span>
        <IconButton
          icon="close"
          label="Close shots"
          className="drawer-close"
          onClick={() => setOpen(false)}
        />
      </div>
      <button
        type="button"
        className="primary wide"
        disabled={!hasVolume}
        onClick={() => void saveCurrentShot()}
        title="Save current view (S)"
      >
        <Icon name="camera" size={16} />
        Save current view
      </button>
      {shots.length === 0 ? (
        <p className="note">
          Frame the model, then save the view. Shots are remembered for this file.
        </p>
      ) : (
        <>
          <ul className="shot-list">
            {shots.map((shot, index) => (
              <ShotItem
                key={shot.id}
                shot={shot}
                index={index}
                total={shots.length}
                selected={selected.includes(shot.id)}
              />
            ))}
          </ul>
          <button type="button" className="wide" onClick={() => setExportOpen(true)}>
            <Icon name="export" size={16} />
            Export shots
          </button>
        </>
      )}
    </aside>
  );
}
