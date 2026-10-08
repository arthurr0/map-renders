import type { BlockEntity, BlockState } from '../core/types';
import { AIR_NAME, createAirState, parseStateKey, stateKey } from '../core/volume';
import {
  isCompound,
  type NbtCompound,
  type NbtValue,
  getCompound,
  getList,
  getNumber,
  getString,
} from './nbt';
import { SchematicParseError } from './errors';

const AIR_NAMES = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
  'minecraft:structure_void',
]);

export function normalizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

export class PaletteBuilder {
  readonly palette: BlockState[] = [createAirState()];
  private readonly index = new Map<string, number>([[AIR_NAME, 0]]);

  add(name: string, properties: Record<string, string>): number {
    const normalized = normalizeName(name);
    if (AIR_NAMES.has(normalized)) return 0;
    const state: BlockState = { name: normalized, properties };
    const key = stateKey(state);
    const existing = this.index.get(key);
    if (existing !== undefined) return existing;
    const id = this.palette.length;
    this.palette.push(state);
    this.index.set(key, id);
    return id;
  }

  addKey(key: string): number {
    const state = parseStateKey(key);
    return this.add(state.name, state.properties);
  }

  addCompound(entry: NbtCompound): number {
    const name = getString(entry, 'Name');
    if (name === undefined) {
      throw new SchematicParseError('The file is corrupted: a palette entry has no block name.');
    }
    const props: Record<string, string> = {};
    const raw = getCompound(entry, 'Properties');
    if (raw) for (const k of Object.keys(raw)) props[k] = String(raw[k]);
    return this.add(name, props);
  }
}

export function toPlain(value: NbtValue): unknown {
  if (Array.isArray(value)) return value.map(toPlain);
  if (isCompound(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) out[k] = toPlain(value[k] as NbtValue);
    return out;
  }
  return value;
}

export function makeBlockEntity(
  pos: [number, number, number],
  id: string | undefined,
  data: NbtCompound,
  skip: readonly string[],
): BlockEntity {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(data)) {
    if (!skip.includes(k)) out[k] = toPlain(data[k] as NbtValue);
  }
  return { pos, id: normalizeName(id ?? 'unknown'), data: out };
}

export function readIntTriple(value: NbtValue | undefined): [number, number, number] | undefined {
  if (value instanceof Int32Array && value.length >= 3) {
    return [value[0] as number, value[1] as number, value[2] as number];
  }
  if (Array.isArray(value) && value.length >= 3) {
    const [a, b, c] = value;
    if (typeof a === 'number' && typeof b === 'number' && typeof c === 'number') return [a, b, c];
  }
  return undefined;
}

export function readXyz(c: NbtCompound | undefined): [number, number, number] | undefined {
  if (!c) return undefined;
  const x = getNumber(c, 'x');
  const y = getNumber(c, 'y');
  const z = getNumber(c, 'z');
  return x === undefined || y === undefined || z === undefined ? undefined : [x, y, z];
}

export function compoundList(c: NbtCompound, key: string): NbtCompound[] {
  const list = getList(c, key) ?? [];
  return list.filter(isCompound);
}
