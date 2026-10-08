import { useEffect, useRef, useState } from 'react';
import { SceneRenderer } from '../../render';
import { frameRect } from '../exportMath';
import { PIPELINE_STEPS } from '../pipeline';
import { setRenderer } from '../rendererRef';
import { useAppStore } from '../store';
import { openFilePicker } from '../filePicker';
import { Icon } from './Icon';

function FrameOverlay({ width, height }: { width: number; height: number }) {
  const exportOpen = useAppStore((state) => state.exportOpen);
  const tab = useAppStore((state) => state.exportTab);
  const image = useAppStore((state) => state.exportState.options);
  const turntable = useAppStore((state) => state.turntable);
  if (!exportOpen || width === 0 || height === 0) return null;
  const size = tab === 'image' ? image : turntable;
  const rect = frameRect(width, height, size.width / size.height);
  return (
    <div className="frame-overlay" aria-hidden="true">
      <div
        className="frame"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      >
        <span className="frame-label">
          {size.width} x {size.height}
        </span>
      </div>
    </div>
  );
}

function LoadingOverlay() {
  const loading = useAppStore((state) => state.loading);
  const step = useAppStore((state) => state.step);
  if (!loading) return null;
  return (
    <div className="viewport-overlay" role="status" aria-live="polite">
      <div className="steps">
        {PIPELINE_STEPS.map((label, index) => {
          const state = !step
            ? 'todo'
            : index < step.index
              ? 'done'
              : index === step.index
                ? 'active'
                : 'todo';
          return (
            <div key={label} className={`step ${state}`}>
              <span className="step-dot">
                {state === 'done' ? <Icon name="check" size={12} /> : null}
              </span>
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpdatingBadge() {
  const loading = useAppStore((state) => state.loading);
  const step = useAppStore((state) => state.step);
  if (loading || !step) return null;
  return (
    <div className="badge" role="status">
      <span className="spinner" aria-hidden="true" />
      {step.label}
    </div>
  );
}

function Landing({ dragging }: { dragging: boolean }) {
  const volume = useAppStore((state) => state.volume);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  if ((volume || loading) && !dragging) return null;
  return (
    <div className={`landing${dragging ? ' dragging' : ''}`}>
      <div className="dropzone">
        <Icon name="cube" size={44} />
        <h2>{dragging ? 'Drop to open' : 'Drop a .schem, .litematic or .nbt file'}</h2>
        {error && <p className="note error">{error}</p>}
        <button type="button" className="primary" onClick={openFilePicker}>
          <Icon name="open" size={16} />
          Choose file
        </button>
        <p className="note">
          Sponge .schem (v1 to v3), Litematica .litematic and structure block .nbt files from
          Minecraft 1.13 and newer. Everything runs in your browser, files are never uploaded.
        </p>
        <a
          className="credit"
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          Textures: Pixel Perfection, CC BY-SA 4.0
        </a>
      </div>
    </div>
  );
}

export function Viewport({ dragging }: { dragging: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failure, setFailure] = useState<string | null>(null);
  const transparent = useAppStore((state) => state.settings.background.type === 'transparent');

  useEffect(() => {
    const element = canvas.current;
    const holder = container.current;
    if (!element || !holder) return;
    let renderer: SceneRenderer;
    try {
      renderer = new SceneRenderer(element);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the 3D renderer.';
      queueMicrotask(() => setFailure(message));
      return;
    }

    const fit = () => {
      const width = Math.max(1, Math.floor(holder.clientWidth));
      const height = Math.max(1, Math.floor(holder.clientHeight));
      renderer.resize(width, height);
      setSize({ width, height });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(holder);

    let frame = 0;
    const unsubscribeCamera = renderer.onCameraChange((camera) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => useAppStore.getState().setCamera(camera));
    });

    setRenderer(renderer);
    useAppStore.getState().setCamera(renderer.getCamera());

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribeCamera();
      setRenderer(null);
      renderer.dispose();
    };
  }, []);

  return (
    <main className={`app-viewport${transparent ? ' transparent' : ''}`} ref={container}>
      <canvas ref={canvas} className="viewport-canvas" aria-label="3D view of the schematic" />
      {failure && (
        <div className="viewport-overlay">
          <p className="note error">The 3D view could not start: {failure}</p>
        </div>
      )}
      <FrameOverlay width={size.width} height={size.height} />
      <LoadingOverlay />
      <UpdatingBadge />
      <Landing dragging={dragging} />
    </main>
  );
}
