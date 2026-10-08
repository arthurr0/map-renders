import type { SchematicFormat, SchematicVolume } from '../core/types';

export function parseSchematic(_data: ArrayBuffer, _fileName: string): SchematicVolume {
  throw new Error('not implemented');
}

export function detectFormat(_data: Uint8Array, _fileName: string): SchematicFormat {
  throw new Error('not implemented');
}
