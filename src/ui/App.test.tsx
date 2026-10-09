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
  useAppStore.setState({
    volume: null,
    fileName: null,
    exportOpen: false,
    helpOpen: false,
    creditsOpen: false,
    packSource: 'bundled',
    packName: null,
  });
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

  it('opens the credits dialog with real links from the textures section', () => {
    render(<App />);
    expect(screen.queryByRole('dialog', { name: 'Credits' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Credits and licenses' }));
    const dialog = screen.getByRole('dialog', { name: 'Credits' });
    const links = Array.from(dialog.querySelectorAll('a'));
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(hrefs).toContain('https://modrinth.com/resourcepack/pixel-perfection-legacy');
    expect(hrefs).toContain('https://polyhaven.com/a/meadow_2');
    expect(hrefs).toContain('https://polyhaven.com/license');
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer');
    }
    expect(dialog.textContent).toContain('XSSheep');
    expect(screen.queryByText('Your resource pack')).toBeNull();
  });

  it('closes the credits dialog with Escape and the close button', () => {
    render(<App />);
    act(() => useAppStore.getState().setCreditsOpen(true));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Credits' })).toBeNull();
    act(() => useAppStore.getState().setCreditsOpen(true));
    fireEvent.click(screen.getByRole('button', { name: 'Close credits' }));
    expect(screen.queryByRole('dialog', { name: 'Credits' })).toBeNull();
  });

  it('opens the credits dialog from the landing credit link', () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Textures: Pixel Perfection, CC BY-SA 4.0' }),
    );
    expect(screen.getByRole('dialog', { name: 'Credits' })).toBeTruthy();
  });

  it('mentions a user supplied pack and the fallback in the credits dialog', () => {
    useAppStore.setState({ packSource: 'zip', packName: 'my-pack.zip' });
    render(<App />);
    act(() => useAppStore.getState().setCreditsOpen(true));
    const dialog = screen.getByRole('dialog', { name: 'Credits' });
    expect(dialog.textContent).toContain('my-pack.zip is supplied by you');
    expect(dialog.textContent).toContain('fall back to Pixel Perfection');
  });

  it('ignores shortcuts while the credits dialog is open', () => {
    render(<App />);
    act(() => useAppStore.getState().setCreditsOpen(true));
    fireEvent.keyDown(window, { key: 't' });
    expect(useAppStore.getState().settings.textureMode).toBe('textured');
  });

  it('toggles the texture mode with T', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 't' });
    expect(useAppStore.getState().settings.textureMode).toBe('simplified');
    fireEvent.keyDown(window, { key: 't' });
    expect(useAppStore.getState().settings.textureMode).toBe('textured');
  });
});
