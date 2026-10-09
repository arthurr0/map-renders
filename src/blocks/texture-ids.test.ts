import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import stored from './texture-ids.json?raw';
import { knownBlockNames, modelTextures, PROBE_PROPS, resolveBlockModel } from './index';
import type { NeighborLookup } from './types';

const air: NeighborLookup = () => ({ name: 'minecraft:air', properties: {} });

function collect(): string[] {
  const out = new Set<string>();
  for (const name of knownBlockNames()) {
    for (const props of PROBE_PROPS) {
      const model = resolveBlockModel({ name: `minecraft:${name}`, properties: { ...props } }, air);
      if (model) modelTextures(model, out);
    }
  }
  return [...out].sort();
}

describe('texture ids', () => {
  it('texture-ids.json lists every texture the library can request', () => {
    const body = `${JSON.stringify(collect(), null, 2)}\n`;
    if (process.env.UPDATE_TEXTURE_IDS) {
      writeFileSync(resolve(__dirname, 'texture-ids.json'), body);
      return;
    }
    expect(stored).toBe(body);
  });

  it('known blocks never fall back to unknown', () => {
    const unknown = knownBlockNames().filter(
      (name) => resolveBlockModel({ name: `minecraft:${name}`, properties: {} }, air)?.unknown,
    );
    expect(unknown).toEqual([]);
  });
});
