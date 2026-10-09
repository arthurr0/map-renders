import { useEffect } from 'react';
import { applyCameraPreset, CAMERA_PRESETS } from './sections/SettingsSections';
import { openFilePicker } from './filePicker';
import { saveCurrentShot } from './shots';
import { useAppStore } from './store';

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button', 'color'].includes(target.type);
  }
  return false;
}

export function handleShortcut(event: KeyboardEvent): boolean {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (isTypingTarget(event.target)) return false;
  const store = useAppStore.getState();
  if (store.exportOpen || store.helpOpen || store.creditsOpen) return false;
  const key = event.key;
  const preset = CAMERA_PRESETS.find((candidate) => candidate.key === key);
  if (preset) {
    applyCameraPreset(preset.id);
    return true;
  }
  switch (key.toLowerCase()) {
    case 's':
      void saveCurrentShot();
      return true;
    case 'e':
      if (store.volume) store.setExportOpen(true);
      return true;
    case 'o':
      openFilePicker();
      return true;
    case 't':
      store.updateSettings({
        textureMode: store.settings.textureMode === 'textured' ? 'simplified' : 'textured',
      });
      return true;
    case '?':
      store.setHelpOpen(true);
      return true;
    default:
      return false;
  }
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (handleShortcut(event)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
