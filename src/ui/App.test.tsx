import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockVolume } from './dev/mocks';

vi.mock('../render', async () => ({ SceneRenderer: (await import('./dev/mocks')).MockRenderer }));
vi.mock('../textures', () => ({
  loadBundledPack: vi.fn(async () => (await import('./dev/mocks')).createMockPack('bundled')),
  loadZipPack: vi.fn(),
  buildAtlas: vi.fn(),
}));
vi.mock('../blocks', () => ({ requiredTextures: vi.fn(() => []) }));
vi.mock('../mesher/client', () => ({ meshInWorker: vi.fn() }));
vi.mock('./parseClient', () => ({ parseInWorker: vi.fn() }));

import { App } from './App';
import { useAppStore } from './store';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAppStore.setState({ volume: null, fileName: null, exportOpen: false, helpOpen: false });
});

describe('App', () => {
  it('shows the landing state with the layout', () => {
    render(<App />);
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Shots')).toBeTruthy();
    expect(screen.getByText('Drop a .schem, .litematic or .nbt file')).toBeTruthy();
    expect(screen.getByText('No schematic loaded')).toBeTruthy();
  });

  it('shows file info in the top bar and opens the export dialog', () => {
    render(<App />);
    act(() => {
      useAppStore.getState().setVolume(createMockVolume(), 'house.schem');
    });
    expect(screen.getByText('house.schem')).toBeTruthy();
    expect(screen.getByText('3 x 2 x 3')).toBeTruthy();
    expect(screen.getByText('10 blocks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Export$/ }));
    expect(screen.getByRole('dialog', { name: 'Export' })).toBeTruthy();
  });

  it('keeps the transparent toggle off for jpeg', () => {
    render(<App />);
    act(() => {
      useAppStore.getState().setVolume(createMockVolume(), 'house.schem');
      useAppStore.getState().setExportOpen(true);
      useAppStore.getState().updateExportOptions({ format: 'jpeg' });
    });
    const toggle = screen.getByRole('switch', { name: 'Transparent background' });
    expect((toggle as HTMLInputElement).disabled).toBe(true);
  });

  it('opens help with the question mark key', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('toggles the texture mode with T', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 't' });
    expect(useAppStore.getState().settings.textureMode).toBe('simplified');
    fireEvent.keyDown(window, { key: 't' });
    expect(useAppStore.getState().settings.textureMode).toBe('textured');
  });
});
