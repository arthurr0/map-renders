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
- `pnpm e2e`: build the app and run the Playwright smoke test

## End to end test

`pnpm e2e` builds the app, serves it with `vite preview` on port 4179 and runs `e2e/smoke.spec.ts` in Chromium. The test opens `tests/fixtures/village_v3.schem` through the file picker, exports a 1080p PNG and checks the PNG size and that the console stays free of errors.

The script always builds first. If you run `playwright test -c e2e/playwright.config.ts` directly, run `pnpm build` before it, because the preview serves whatever is in `dist/`.

WebGL runs on SwiftShader (software rendering) through the Chromium args `--use-angle=swiftshader --enable-unsafe-swiftshader`, so no GPU is needed. It is slow, a run takes under a minute.

On headless Linux without a display, unset the display variables:

```
env -u WAYLAND_DISPLAY -u DISPLAY pnpm e2e
```

If the browser is missing, install it once with:

```
pnpm exec playwright install chromium
```

## Docker

The app is a static site, so the image is just nginx serving the built files. The `Dockerfile` has two stages: a Node 22 stage that runs `pnpm build` (always on the build host, so multi-arch builds do not run Node under emulation) and an `nginxinc/nginx-unprivileged` stage that serves `dist/` on port 8080 as a non-root user.

Build and run:

```
docker build -t map-renders .
docker run --rm -p 8080:8080 map-renders
```

Then open http://localhost:8080.

With Compose (builds the image and starts it with a read-only root filesystem, a tmpfs for `/tmp`, all capabilities dropped, `no-new-privileges`, process and 128 MB memory limits, and the port bound to 127.0.0.1 only):

```
docker compose up --build
```

Pull the published image instead of building:

```
docker run --rm -p 8080:8080 ghcr.io/<owner>/map-renders:latest
```

Image details:

- Location: `ghcr.io/<owner>/map-renders` (owner in lowercase)
- Tags: `latest` and `sha-<short>` for every push to `master`; `1.2.3`, `1.2` and `1` for a release tag `v1.2.3` (the `1` tag is not created for `0.x` releases)
- Platforms: `linux/amd64` and `linux/arm64`
- Health: `GET /healthz` returns `200 ok`, and the image has a `HEALTHCHECK` that calls it
- Read-only friendly: nginx only writes to `/tmp`, so `docker run --read-only --tmpfs /tmp` works
- Caching: files under `/assets/` are hashed and cached for a year, `index.html` is never cached, `/packs/` and `/hdri/` are cached for a day
- Security headers: a strict Content Security Policy (own origin only, workers from `self` and `blob:`, images from `self`, `data:` and `blob:`), `nosniff`, a referrer policy and frame blocking. The config is in `docker/nginx.conf`. If you add code that loads anything from another origin, extend the policy there.

## CI/CD

The workflow is `.github/workflows/ci.yml`.

| Event                            | Checks, e2e | Image build | Image push                    |
| -------------------------------- | ----------- | ----------- | ----------------------------- |
| Pull request                     | yes         | yes         | no                            |
| Push to `master`                 | yes         | yes         | `latest`, `sha-<short>`       |
| Push of a tag `vX.Y.Z`           | yes         | yes         | `X.Y.Z`, `X.Y`, `X`           |
| Manual run (`workflow_dispatch`) | yes         | yes         | only on `master` or a tag ref |

Jobs:

- `checks`: `pnpm install --frozen-lockfile`, typecheck, lint, unit tests
- `e2e`: installs Chromium with system dependencies and runs `pnpm e2e`. On failure the Playwright report and traces are uploaded as an artifact
- `image`: runs after both jobs pass, builds for amd64 and arm64 with Buildx (the Node build always runs natively on the build host, and the nginx stage only copies files, so no emulation is needed), uses the GitHub Actions cache and attaches provenance and SBOM attestations. Pull requests build the image but never log in or push, so PRs from forks work without secrets

Concurrency: a new run for the same PR or non-master branch cancels the older one. Runs on `master` and on tags are never cancelled.

Release:

```
git tag v1.2.3
git push origin v1.2.3
```

After the workflow finishes, the image is available as `ghcr.io/<owner>/map-renders:1.2.3`.

GHCR visibility: a package published for the first time is private by default. To make it public, open the repository owner's Packages page on GitHub, select `map-renders`, go to Package settings, and under Danger Zone choose Change visibility, then Public. Also make sure the package has repository access with write role for Actions (Package settings, Manage Actions access), otherwise later pushes can be denied.

Dependabot (`.github/dependabot.yml`) opens weekly grouped updates for GitHub Actions, the Docker base images and npm packages.

## License

The app code is MIT licensed, see `LICENSE`. The bundled Pixel Perfection texture pack is CC BY-SA 4.0 and the HDRIs are CC0. Details are in `THIRD_PARTY_LICENSES.md` and `public/hdri/LICENSES.md`.

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
