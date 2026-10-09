import { unzipSync } from 'fflate';
import { createLimiter } from './limit';

export interface TexturePack {
  id: string;
  name: string;
  getTexture(textureId: string): Promise<ImageBitmap | null>;
  getMcmeta(textureId: string): Promise<unknown | null>;
  has?(textureId: string): Promise<boolean>;
}

const DECODE_OPTIONS: ImageBitmapOptions = {
  premultiplyAlpha: 'none',
  colorSpaceConversion: 'none',
};

interface ManifestEntry {
  mcmeta?: unknown;
}

interface BundledManifest {
  name?: string;
  aliases?: Record<string, string>;
  entityAliases?: Record<string, string>;
  textures: Record<string, ManifestEntry>;
  entity?: Record<string, ManifestEntry>;
}

interface Resolved {
  path: string;
  mcmeta: unknown;
}

const fetchLimit = createLimiter(24);

function stripPrefix(textureId: string): string | null {
  return textureId.startsWith('block/') ? textureId.slice('block/'.length) : null;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function parseManifest(value: unknown): BundledManifest {
  if (!value || typeof value !== 'object') throw new Error('invalid structure');
  const record = value as Record<string, unknown>;
  if (!record.textures || typeof record.textures !== 'object') {
    throw new Error('missing "textures" table');
  }
  return record as unknown as BundledManifest;
}

export async function loadBundledPack(): Promise<TexturePack> {
  const root = `${import.meta.env.BASE_URL}packs/pixel-perfection/`;
  let manifest: BundledManifest;
  try {
    const response = await fetch(`${root}manifest.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = parseManifest(await response.json());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot load the bundled texture pack manifest: ${reason}`, { cause: error });
  }
  const textures = new Map(Object.entries(manifest.textures));
  const aliases = new Map(Object.entries(manifest.aliases ?? {}));
  const entities = new Map(Object.entries(manifest.entity ?? {}));
  const entityAliases = new Map(Object.entries(manifest.entityAliases ?? {}));

  const lookup = (
    kind: 'block' | 'entity',
    name: string,
    table: Map<string, ManifestEntry>,
    aliasTable: Map<string, string>,
  ): Resolved | null => {
    const target = table.has(name) ? name : aliasTable.get(name);
    const entry = target === undefined ? undefined : table.get(target);
    return target !== undefined && entry
      ? { path: `${kind}/${target}`, mcmeta: entry.mcmeta }
      : null;
  };

  const resolve = (textureId: string): Resolved | null => {
    if (textureId.startsWith('entity/')) {
      return lookup('entity', textureId.slice('entity/'.length), entities, entityAliases);
    }
    const name = stripPrefix(textureId);
    return name === null ? null : lookup('block', name, textures, aliases);
  };

  return {
    id: 'pixel-perfection',
    name: manifest.name ?? 'Pixel Perfection',
    async has(textureId) {
      return resolve(textureId) !== null;
    },
    async getTexture(textureId) {
      const resolved = resolve(textureId);
      if (resolved === null) return null;
      return fetchLimit(async () => {
        const file = await fetch(`${root}${encodePath(resolved.path)}.png`);
        if (!file.ok) return null;
        return createImageBitmap(await file.blob(), DECODE_OPTIONS);
      });
    },
    async getMcmeta(textureId) {
      return resolve(textureId)?.mcmeta ?? null;
    },
  };
}

const ZIP_TEXTURE =
  /(?:^|\/)assets\/minecraft\/textures\/(blocks?|entity)\/([^/]+(?:\/[^/]+)*)\.png(\.mcmeta)?$/;
const MODERN_MARKERS = [
  'block/oak_planks',
  'block/stone_bricks',
  'block/grass_block_top',
  'block/oak_log',
];
const UNSUPPORTED_MESSAGE =
  'Only Minecraft 1.13 and newer resource packs are supported (textures/block with current file names).';

interface FileTables {
  pngs: Map<string, Uint8Array>;
  metas: Map<string, Uint8Array>;
}

export async function loadZipPack(file: ArrayBuffer, name: string): Promise<TexturePack> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(file), {
      filter: (entry) => ZIP_TEXTURE.test(entry.name),
    });
  } catch {
    throw new Error('The file is not a valid zip archive.');
  }
  const modern: FileTables = { pngs: new Map(), metas: new Map() };
  const legacy: FileTables = { pngs: new Map(), metas: new Map() };
  const entity: FileTables = { pngs: new Map(), metas: new Map() };
  for (const [path, bytes] of Object.entries(entries)) {
    const match = ZIP_TEXTURE.exec(path);
    const folder = match?.[1];
    const textureName = match?.[2];
    if (!match || !folder || !textureName) continue;
    if (folder !== 'entity' && textureName.includes('/')) continue;
    const target = folder === 'entity' ? entity : folder === 'blocks' ? legacy : modern;
    const key = folder === 'entity' ? `entity/${textureName}` : `block/${textureName}`;
    (match[3] ? target.metas : target.pngs).set(key, bytes);
  }
  let chosen = modern;
  if (modern.pngs.size === 0) {
    if (legacy.pngs.size === 0) throw new Error(`No block textures found. ${UNSUPPORTED_MESSAGE}`);
    if (!MODERN_MARKERS.some((marker) => legacy.pngs.has(marker))) {
      throw new Error(UNSUPPORTED_MESSAGE);
    }
    chosen = legacy;
  }
  const pngs = new Map([...chosen.pngs, ...entity.pngs]);
  const metas = new Map([...chosen.metas, ...entity.metas]);

  const decoder = new TextDecoder();
  return {
    id: `zip:${name}`,
    name,
    async has(textureId) {
      return pngs.has(textureId);
    },
    async getTexture(textureId) {
      const bytes = pngs.get(textureId);
      if (!bytes) return null;
      const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
      return createImageBitmap(blob, DECODE_OPTIONS);
    },
    async getMcmeta(textureId) {
      const bytes = metas.get(textureId);
      if (!bytes) return null;
      try {
        return JSON.parse(decoder.decode(bytes)) as unknown;
      } catch {
        return null;
      }
    },
  };
}

export function layerPacks(primary: TexturePack, fallback: TexturePack): TexturePack {
  const hasIn = async (pack: TexturePack, textureId: string): Promise<boolean> => {
    if (pack.has) return pack.has(textureId);
    const bitmap = await pack.getTexture(textureId);
    bitmap?.close();
    return bitmap !== null;
  };
  const pick = async (textureId: string): Promise<TexturePack> =>
    (await hasIn(primary, textureId)) ? primary : fallback;

  return {
    id: `${primary.id}+${fallback.id}`,
    name: `${primary.name} over ${fallback.name}`,
    async has(textureId) {
      return (await hasIn(primary, textureId)) || (await hasIn(fallback, textureId));
    },
    async getTexture(textureId) {
      return (await pick(textureId)).getTexture(textureId);
    },
    async getMcmeta(textureId) {
      return (await pick(textureId)).getMcmeta(textureId);
    },
  };
}
