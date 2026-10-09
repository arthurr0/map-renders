# Map Renders

A browser-only web app that renders Minecraft schematics. It reads .schem (Sponge v1, v2, v3), .litematic and structure .nbt files (Minecraft 1.13 and newer) and produces high quality images and turntable animations. Everything runs in the browser with Three.js, there is no backend.

Features:

- Interactive 3D preview with an orbit camera for choosing shots
- Textured mode (bundled Pixel Perfection pack) or simplified flat color mode
- Backgrounds: solid, gradient, procedural sky, HDRI, transparent
- Optional shadows, SSAO and bloom
- PNG export in many resolutions (presets up to 8K and custom sizes)
- Saved camera shots and turntable animation export

The UI language is English only.

## Stack

- Vite, React 18, TypeScript (strict)
- Three.js (core and examples/jsm addons)
- zustand for state, fflate for zip and gzip
- vitest, Testing Library, ESLint (flat config), Prettier
- pnpm

## Scripts

- `pnpm dev`: start the dev server
- `pnpm build`: typecheck and build for production
- `pnpm preview`: serve the production build
- `pnpm test`: run unit tests once
- `pnpm typecheck`: run the TypeScript compiler without emitting
- `pnpm lint`: run ESLint
- `pnpm format`: run Prettier

## Module map

| Path              | Responsibility                                                                 | Owner                   |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------- |
| `src/core/`       | Shared types, defaults, volume helpers. Changes require coordination.          | Shared                  |
| `src/schematic/`  | NBT reader, format parsers, `parseSchematic`, `detectFormat`                   | Schematic parsing agent |
| `src/textures/`   | Texture pack loading, atlas building, simplified colors, biome tints           | Textures agent          |
| `src/blocks/`     | Block model library: blockstate to model elements with texture ids             | Blocks agent            |
| `src/mesher/`     | Volume to buffers, runs in `mesher.worker.ts`, `client.ts` talks to the worker | Mesher agent            |
| `src/render/`     | Three.js scene, lighting, post-processing, backgrounds, export                 | Render agent            |
| `src/ui/`         | React components, zustand store, pipeline orchestration                        | UI agent                |
| `public/packs/`   | Bundled texture pack assets                                                    | Textures agent          |
| `tests/fixtures/` | Sample schematics for tests                                                    | Whoever adds the tests  |

Modules depend only on `src/core/` and on the public `index.ts` of other modules. Texture ids use vanilla 1.13+ naming without namespace or extension, for example `block/stone_bricks`.

## Coordinate and index convention

- X is width (east is +X), Y is height (0 is the bottom), Z is length (south is +Z, north is -Z)
- Block index in `SchematicVolume.blocks` is `x + z * width + y * width * length`
- Palette index 0 is always `minecraft:air`
- Block state keys look like `minecraft:name[a=b,c=d]` with properties sorted by name
- Model coordinates use 0 to 16 units like vanilla models

## Credits

- Texture pack: Pixel Perfection by XSSheep (Hugh Rutland), licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Original: https://www.minecraftforum.net/forums/mapping-and-modding-java-edition/resource-packs/1242533-pixel-perfection-now-with-polar-bears-1-11
- Updated for newer Minecraft versions by Nova Wostra (Pixel Perfection Legacy 26.3-97.1, https://modrinth.com/resourcepack/pixel-perfection-legacy), with contributions from freejusticehere and HexaBlu.
- Modifications: only block textures were kept, emissive shader variants were removed, animation metadata was merged into a manifest, the files are served individually from `public/packs/pixel-perfection/`. The bundled textures stay under CC BY-SA 4.0.
- Full details and license text: `THIRD_PARTY_LICENSES.md` and `public/packs/pixel-perfection/LICENSE.txt`.
