import { parseSchematic } from '../schematic';
import type { SchematicVolume } from '../core';

export interface ParseRequest {
  id: number;
  data: ArrayBuffer;
  fileName: string;
}

export type ParseResponse =
  | { id: number; ok: true; volume: SchematicVolume }
  | { id: number; ok: false; error: string; name: string };

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { id, data, fileName } = event.data;
  try {
    const volume = parseSchematic(data, fileName);
    const response: ParseResponse = { id, ok: true, volume };
    self.postMessage(response, { transfer: [volume.blocks.buffer] });
  } catch (error) {
    const response: ParseResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Error',
    };
    self.postMessage(response);
  }
};
