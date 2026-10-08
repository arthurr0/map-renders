import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { IconButton } from './Icon';

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          kind={toast.kind}
          message={toast.message}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}

function ToastItem({
  id,
  kind,
  message,
  onDismiss,
}: {
  id: number;
  kind: string;
  message: string;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), kind === 'error' ? 9000 : 4000);
    return () => clearTimeout(timer);
  }, [id, kind, onDismiss]);
  return (
    <div className={`toast ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{message}</span>
      <IconButton icon="close" label="Dismiss" onClick={() => onDismiss(id)} />
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['1 to 5', 'Camera presets: Iso, Front, Side, Top, 3/4'],
  ['S', 'Save current view as a shot'],
  ['E', 'Open export'],
  ['O', 'Open a file'],
  ['T', 'Switch textured and simplified'],
  ['?', 'Show this help'],
  ['Esc', 'Close dialogs'],
];

export function HelpOverlay() {
  const open = useAppStore((state) => state.helpOpen);
  const setOpen = useAppStore((state) => state.setHelpOpen);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={() => setOpen(false)}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        ref={dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="help-title">Keyboard shortcuts</h2>
          <IconButton icon="close" label="Close help" onClick={() => setOpen(false)} />
        </div>
        <dl className="shortcut-list">
          {SHORTCUTS.map(([keys, text]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <p className="note">
          Drag to orbit, right drag to pan, scroll to zoom. Drop a file anywhere to open it.
        </p>
      </div>
    </div>
  );
}
