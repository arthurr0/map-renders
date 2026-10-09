import { openFilePicker } from '../filePicker';
import { useAppStore } from '../store';
import { Icon, IconButton } from './Icon';

export function TopBar() {
  const fileName = useAppStore((state) => state.fileName);
  const volume = useAppStore((state) => state.volume);
  const total = useAppStore((state) => state.blockStats.total);
  const setExportOpen = useAppStore((state) => state.setExportOpen);
  const setHelpOpen = useAppStore((state) => state.setHelpOpen);
  const leftOpen = useAppStore((state) => state.leftDrawerOpen);
  const rightOpen = useAppStore((state) => state.rightDrawerOpen);
  const setLeft = useAppStore((state) => state.setLeftDrawerOpen);
  const setRight = useAppStore((state) => state.setRightDrawerOpen);

  return (
    <header className="app-header">
      <IconButton
        icon="settings"
        label="Toggle settings"
        className="drawer-toggle"
        active={leftOpen}
        onClick={() => {
          setLeft(!leftOpen);
          setRight(false);
        }}
      />
      <h1>Map Renders</h1>
      <div className="app-file" aria-live="polite">
        {volume && fileName ? (
          <>
            <strong title={fileName}>{fileName}</strong>
            <span>
              {volume.width} x {volume.height} x {volume.length}
            </span>
            <span>{total.toLocaleString()} blocks</span>
          </>
        ) : (
          <span>No schematic loaded</span>
        )}
      </div>
      <div className="spacer" />
      <button type="button" onClick={openFilePicker} title="Open file (O)">
        <Icon name="open" size={16} />
        <span className="label">Open file</span>
      </button>
      <button
        type="button"
        className="primary"
        disabled={!volume}
        onClick={() => setExportOpen(true)}
        title="Export (E)"
      >
        <Icon name="export" size={16} />
        <span className="label">Export</span>
      </button>
      <IconButton icon="help" label="Keyboard shortcuts (?)" onClick={() => setHelpOpen(true)} />
      <IconButton
        icon="shots"
        label="Toggle shots"
        className="drawer-toggle"
        active={rightOpen}
        onClick={() => {
          setRight(!rightOpen);
          setLeft(false);
        }}
      />
    </header>
  );
}
