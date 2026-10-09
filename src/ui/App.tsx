import { useEffect, useState } from 'react';
import { CreditsDialog } from './components/CreditsDialog';
import { ExportDialog } from './components/ExportDialog';
import { HelpOverlay, Toasts } from './components/Overlays';
import { ShotsPanel } from './components/ShotsPanel';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Viewport } from './components/Viewport';
import { isSupportedFileName } from './filePicker';
import { getBundledPack, loadSchematicFile, startPipelineSync } from './pipeline';
import { useShortcuts } from './shortcuts';
import { startPersistence, useAppStore } from './store';

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function App() {
  const [dragging, setDragging] = useState(false);
  const drawerOpen = useAppStore((state) => state.leftDrawerOpen || state.rightDrawerOpen);
  useShortcuts();

  useEffect(() => {
    const stopSync = startPipelineSync();
    const stopPersistence = startPersistence();
    getBundledPack()
      .then((pack) => {
        if (!useAppStore.getState().pack) useAppStore.getState().setPack(pack, 'bundled', null);
      })
      .catch(() => undefined);
    return () => {
      stopSync();
      stopPersistence();
    };
  }, []);

  useEffect(() => {
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      if (!isSupportedFileName(file.name)) {
        useAppStore
          .getState()
          .pushToast('error', 'Unsupported file. Use .schem, .litematic or .nbt files.');
        return;
      }
      void loadSchematicFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className="app">
      <TopBar />
      <Sidebar />
      <Viewport dragging={dragging} />
      <ShotsPanel />
      {drawerOpen && (
        <button
          type="button"
          className="drawer-backdrop"
          aria-label="Close panels"
          onClick={() => {
            useAppStore.getState().setLeftDrawerOpen(false);
            useAppStore.getState().setRightDrawerOpen(false);
          }}
        />
      )}
      <ExportDialog />
      <HelpOverlay />
      <CreditsDialog />
      <Toasts />
    </div>
  );
}
