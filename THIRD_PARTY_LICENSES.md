# Third party licenses

## Pixel Perfection (bundled texture pack)

- Title: Pixel Perfection
- Original author: XSSheep (Hugh Rutland)
- Original source: https://www.minecraftforum.net/forums/mapping-and-modding-java-edition/resource-packs/1242533-pixel-perfection-now-with-polar-bears-1-11
- Maintained update used here: Pixel Perfection Legacy by Nova Wostra, version 26.3-97.1 (https://modrinth.com/resourcepack/pixel-perfection-legacy, source https://github.com/NovaWostra/Pixel-Perfection-Chorus-Eddit). The update credits further contributions from freejusticehere (1.13 and 1.14 textures and code) and HexaBlu (several block textures).
- License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/
- License text: `public/packs/pixel-perfection/LICENSE.txt`
- Permission note from the author: the textures may be used in any mixpack, project or game, paid or unpaid, with credit.

Modifications made for this project:

- Only the block textures (`assets/minecraft/textures/block/*.png` and their animation metadata) were taken from the pack.
- Variants used by the pack's emissive shaders (file names ending in `_e`, `_s` and `_e_s`) were left out.
- The animation metadata (`.mcmeta`) was merged into `public/packs/pixel-perfection/manifest.json`.
- One alias was added in the manifest (`wheat_stage7` points to `wheat_stage_full_7`).
- The image data itself was not changed.

The bundled texture files are shared under the same CC BY-SA 4.0 license. The application code of this repository is not part of that adaptation.

Note: the Modrinth page of the update lists its license identifier as CC BY 4.0 while linking to the CC BY-SA 4.0 deed. Because the update is an adaptation of a CC BY-SA 4.0 work, CC BY-SA 4.0 is applied here.
