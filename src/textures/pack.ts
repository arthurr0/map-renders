import { unzipSync } from 'fflate';

export interface TexturePack {
  id: string;
  name: string;
  attribution: string;
  getTexture(textureId: string): Promise<ImageBitmap | null>;
  getMcmeta(textureId: string): Promise<unknown | null>;
  has?(textureId: string): Promise<boolean>;
}

export const PIXEL_PERFECTION_ATTRIBUTION = [
  'Pixel Perfection by XSSheep (Hugh Rutland), licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).',
  'Original: https://www.minecraftforum.net/forums/mapping-and-modding-java-edition/resource-packs/1242533-pixel-perfection-now-with-polar-bears-1-11',
  'Updated for newer Minecraft versions by Nova Wostra (Pixel Perfection Legacy, https://modrinth.com/resourcepack/pixel-perfection-legacy), with textures and code from freejusticehere and HexaBlu.',
  'Modified: only block textures were kept, emissive shader variants were removed, files were repacked and listed in a manifest. The same license applies to the bundled files.',
].join('\n');

const DECODE_OPTIONS: ImageBitmapOptions = {
  premultiplyAlpha: 'none',
  colorSpaceConversion: 'none',
};

interface BundledManifest {
  name?: string;
  aliases?: Record<string, string>;
  textures: Record<string, { mcmeta?: unknown }>;
}

function stripPrefix(textureId: string): string | null {
  return textureId.startsWith('block/') ? textureId.slice('block/'.length) : null;
}

export async function loadBundledPack(): Promise<TexturePack> {
  const root = `${import.meta.env.BASE_URL}packs/pixel-perfection/`;
  const response = await fetch(`${root}manifest.json`);
  if (!response.ok) throw new Error(`Cannot load bundled pack manifest (${response.status})`);
  const manifest = (await response.json()) as BundledManifest;
  const aliases = manifest.aliases ?? {};

  const resolve = (textureId: string): string | null => {
    const name = stripPrefix(textureId);
    if (name === null) return null;
    if (manifest.textures[name]) return name;
    const alias = aliases[name];
    return alias && manifest.textures[alias] ? alias : null;
  };

  return {
    id: 'pixel-perfection',
    name: manifest.name ?? 'Pixel Perfection',
    attribution: PIXEL_PERFECTION_ATTRIBUTION,
    async has(textureId) {
      return resolve(textureId) !== null;
    },
    async getTexture(textureId) {
      const name = resolve(textureId);
      if (name === null) return null;
      const file = await fetch(`${root}block/${name}.png`);
      if (!file.ok) return null;
      return createImageBitmap(await file.blob(), DECODE_OPTIONS);
    },
    async getMcmeta(textureId) {
      const name = resolve(textureId);
      return name === null ? null : (manifest.textures[name]?.mcmeta ?? null);
    },
  };
}

const ZIP_TEXTURE = /(?:^|\/)assets\/minecraft\/textures\/block\/([^/]+)\.png(\.mcmeta)?$/;

export async function loadZipPack(file: ArrayBuffer, name: string): Promise<TexturePack> {
  const entries = unzipSync(new Uint8Array(file), {
    filter: (entry) => ZIP_TEXTURE.test(entry.name),
  });
  const pngs = new Map<string, Uint8Array>();
  const metas = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    const match = ZIP_TEXTURE.exec(path);
    const textureName = match?.[1];
    if (!match || !textureName) continue;
    (match[2] ? metas : pngs).set(textureName, bytes);
  }
  if (pngs.size === 0) throw new Error('No block textures found in resource pack');

  const decoder = new TextDecoder();
  return {
    id: `zip:${name}`,
    name,
    attribution: `Resource pack "${name}" supplied by the user.`,
    async has(textureId) {
      const textureName = stripPrefix(textureId);
      return textureName !== null && pngs.has(textureName);
    },
    async getTexture(textureId) {
      const textureName = stripPrefix(textureId);
      const bytes = textureName === null ? undefined : pngs.get(textureName);
      if (!bytes) return null;
      const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
      return createImageBitmap(blob, DECODE_OPTIONS);
    },
    async getMcmeta(textureId) {
      const textureName = stripPrefix(textureId);
      const bytes = textureName === null ? undefined : metas.get(textureName);
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
    attribution: [primary.attribution, fallback.attribution].filter(Boolean).join('\n'),
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
