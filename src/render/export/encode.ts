import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { ArrayBufferTarget, Muxer } from 'webm-muxer';
import type { ExportOptions } from '../../core/types';

export function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function mimeFor(format: ExportOptions['format']): string {
  return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
}

export function flattenOnto(
  image: ImageData,
  top: [number, number, number],
  bottom: [number, number, number] = top,
): void {
  const d = image.data;
  const w = image.width;
  const h = image.height;
  for (let y = 0; y < h; y++) {
    const t = h > 1 ? y / (h - 1) : 0;
    const r = top[0] + (bottom[0] - top[0]) * t;
    const g = top[1] + (bottom[1] - top[1]) * t;
    const b = top[2] + (bottom[2] - top[2]) * t;
    for (let x = 0; x < w; x++) {
      const i = (x + y * w) * 4;
      const a = d[i + 3]! / 255;
      if (a >= 1) continue;
      d[i] = Math.round(d[i]! * a + r * (1 - a));
      d[i + 1] = Math.round(d[i + 1]! * a + g * (1 - a));
      d[i + 2] = Math.round(d[i + 2]! * a + b * (1 - a));
      d[i + 3] = 255;
    }
  }
}

export function gifFrameDelay(fps: number, index: number): number {
  const start = Math.round((index * 100) / fps);
  const end = Math.round(((index + 1) * 100) / fps);
  return Math.max(1, end - start) * 10;
}

export async function imageDataToBlob(
  image: ImageData,
  format: ExportOptions['format'],
  quality: number,
): Promise<Blob> {
  const type = mimeFor(format);
  const q = Math.min(1, Math.max(0, quality));
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    ctx.putImageData(image, 0, 0);
    return canvas.convertToBlob({ type, quality: q });
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, q),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(blob);
  });
}

export interface FrameSink {
  add(image: ImageData, index: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): void;
}

const VIDEO_CODECS: Array<{ webcodecs: string; matroska: string }> = [
  { webcodecs: 'vp09.00.40.08', matroska: 'V_VP9' },
  { webcodecs: 'vp09.00.10.08', matroska: 'V_VP9' },
  { webcodecs: 'vp8', matroska: 'V_VP8' },
];

export async function createWebCodecsSink(
  width: number,
  height: number,
  fps: number,
): Promise<FrameSink | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const bitrate = Math.round(Math.min(40e6, Math.max(2e6, width * height * fps * 0.18)));
  let chosen: { config: VideoEncoderConfig; matroska: string } | null = null;
  for (const c of VIDEO_CODECS) {
    const config: VideoEncoderConfig = {
      codec: c.webcodecs,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: 'quality',
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        chosen = { config, matroska: c.matroska };
        break;
      }
    } catch {
      continue;
    }
  }
  if (!chosen) return null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: chosen.matroska, width, height, frameRate: fps },
    firstTimestampBehavior: 'offset',
  });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(chosen.config);
  const frameDuration = 1e6 / fps;

  return {
    async add(image, index) {
      if (failure) throw failure;
      const frame = new VideoFrame(image.data, {
        format: 'RGBA',
        codedWidth: image.width,
        codedHeight: image.height,
        timestamp: Math.round(index * frameDuration),
        duration: Math.round(frameDuration),
      });
      encoder.encode(frame, { keyFrame: index % Math.max(1, Math.round(fps * 2)) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 5));
        if (failure) throw failure;
      }
    },
    async finish() {
      await encoder.flush();
      if (failure) throw failure;
      encoder.close();
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: 'video/webm' });
    },
    cancel() {
      if (encoder.state !== 'closed') encoder.close();
    },
  };
}

export function createMediaRecorderSink(width: number, height: number, fps: number): FrameSink {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: Math.round(Math.min(40e6, Math.max(2e6, width * height * fps * 0.18))),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  const frameMs = 1000 / fps;
  let last = performance.now();
  return {
    async add(image) {
      ctx.putImageData(image, 0, 0);
      track?.requestFrame();
      const wait = frameMs - (performance.now() - last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = performance.now();
    },
    finish() {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };
        recorder.stop();
      });
    },
    cancel() {
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export function createGifSink(fps: number, transparent: boolean): FrameSink {
  const gif = GIFEncoder();
  return {
    async add(image, frameIndex) {
      const delay = gifFrameDelay(fps, frameIndex);
      const data = image.data;
      if (transparent) {
        const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
        const index = applyPalette(data, palette, 'rgba4444');
        const t = palette.findIndex((c) => (c[3] ?? 255) === 0);
        gif.writeFrame(index, image.width, image.height, {
          palette,
          delay,
          repeat: 0,
          transparent: t >= 0,
          transparentIndex: Math.max(0, t),
          dispose: 2,
        });
      } else {
        const palette = quantize(data, 256);
        const index = applyPalette(data, palette);
        gif.writeFrame(index, image.width, image.height, { palette, delay, repeat: 0 });
      }
    },
    async finish() {
      gif.finish();
      const bytes = gif.bytes();
      return new Blob([bytes.slice().buffer], { type: 'image/gif' });
    },
    cancel() {
      gif.reset();
    },
  };
}
