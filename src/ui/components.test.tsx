import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SizeFields } from './components/ExportDialog';
import { ShotsPanel } from './components/ShotsPanel';
import { MOCK_CAMERA } from './dev/mocks';
import { useAppStore } from './store';

afterEach(() => {
  cleanup();
  useAppStore.setState({ shots: [], selectedShotIds: [] });
});

describe('SizeFields', () => {
  it('lets the user type 1920 and applies the aspect lock on commit only', () => {
    const onChange = vi.fn();
    function Harness() {
      const [size, setSize] = useState({ width: 1280, height: 720 });
      return (
        <SizeFields
          width={size.width}
          height={size.height}
          onChange={(width, height) => {
            onChange(width, height);
            setSize({ width, height });
          }}
        />
      );
    }
    render(<Harness />);
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    for (const typed of ['1', '19', '192', '1920']) {
      fireEvent.change(width, { target: { value: typed } });
      expect(width.value).toBe(typed);
    }
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(width);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1920, 1080);
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('1080');
  });

  it('commits on Enter and clamps tiny values', () => {
    const onChange = vi.fn();
    render(<SizeFields width={1000} height={1000} onChange={onChange} />);
    const height = screen.getByLabelText('Height');
    fireEvent.change(height, { target: { value: '2' } });
    fireEvent.keyDown(height, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(16, 16);
  });

  it('changes one side only when unlocked', () => {
    const onChange = vi.fn();
    render(<SizeFields width={1600} height={900} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock aspect ratio' }));
    const width = screen.getByLabelText('Width');
    fireEvent.change(width, { target: { value: '800' } });
    fireEvent.blur(width);
    expect(onChange).toHaveBeenCalledWith(800, 900);
  });
});

describe('shot rename', () => {
  const shot = { id: 's1', name: 'Front', camera: MOCK_CAMERA, createdAt: 1 };

  it('saves on Enter', () => {
    useAppStore.setState({ shots: [shot] });
    render(<ShotsPanel />);
    const input = screen.getByLabelText('Name of Front');
    fireEvent.change(input, { target: { value: 'Back' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(useAppStore.getState().shots[0]?.name).toBe('Back');
  });

  it('discards the edit on Escape', () => {
    useAppStore.setState({ shots: [shot] });
    render(<ShotsPanel />);
    const input = screen.getByLabelText('Name of Front');
    input.focus();
    fireEvent.change(input, { target: { value: 'Back' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(useAppStore.getState().shots[0]?.name).toBe('Front');
  });
});
