import type { ExportOptions } from '../core';

export const MIN_DIMENSION = 16;
export const MAX_DIMENSION = 16384;

export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return MIN_DIMENSION;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(value)));
}

export function applyAspectLock(
  changed: 'width' | 'height',
  value: number,
  ratio: number,
): { width: number; height: number } {
  const safeRatio = ratio > 0 && Number.isFinite(ratio) ? ratio : 1;
  if (changed === 'width') {
    const width = clampDimension(value);
    return { width, height: clampDimension(width / safeRatio) };
  }
  const height = clampDimension(value);
  return { width: clampDimension(height * safeRatio), height };
}

export function supportsTransparency(format: ExportOptions['format']): boolean {
  return format === 'png' || format === 'webp';
}

export function normalizeExportOptions(options: ExportOptions): ExportOptions {
  return {
    ...options,
    width: clampDimension(options.width),
    height: clampDimension(options.height),
    transparent: options.transparent && supportsTransparency(options.format),
    quality: Math.min(1, Math.max(0.1, options.quality)),
  };
}

export function extensionFor(format: ExportOptions['format']): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function sanitizeFilePart(text: string): string {
  const cleaned = text
    .trim()
    .replace(/\.[a-z0-9]{2,10}$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.length > 0 ? cleaned : 'schematic';
}

export function exportFileName(
  schematicName: string | null,
  shotName: string,
  width: number,
  height: number,
  format: ExportOptions['format'],
): string {
  const schematic = sanitizeFilePart(schematicName ?? 'schematic');
  const shot = sanitizeFilePart(shotName || 'view');
  return `${schematic}-${shot}-${width}x${height}.${extensionFor(format)}`;
}

export function turntableFileName(
  schematicName: string | null,
  width: number,
  height: number,
  format: 'webm' | 'gif',
): string {
  return `${sanitizeFilePart(schematicName ?? 'schematic')}-turntable-${width}x${height}.${format}`;
}

export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function frameRect(
  containerWidth: number,
  containerHeight: number,
  aspect: number,
  margin = 24,
): FrameRect {
  const availableWidth = Math.max(1, containerWidth - margin * 2);
  const availableHeight = Math.max(1, containerHeight - margin * 2);
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  let width = availableWidth;
  let height = width / safeAspect;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * safeAspect;
  }
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function megapixels(options: ExportOptions): number {
  return (options.width * options.height * options.supersample * options.supersample) / 1_000_000;
}
