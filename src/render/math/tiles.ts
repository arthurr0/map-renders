export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Tile {
  render: Rect;
  core: Rect;
  cropX: number;
  cropY: number;
  output: Rect;
}

export interface TileLayout {
  fullWidth: number;
  fullHeight: number;
  supersample: number;
  margin: number;
  columns: number;
  rows: number;
  tiles: Tile[];
}

export interface TileLayoutInput {
  width: number;
  height: number;
  supersample: number;
  maxTileSize: number;
  margin: number;
}

export function splitEven(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  const out: number[] = [];
  for (let i = 0; i < parts; i++) out.push(base + (i < extra ? 1 : 0));
  return out;
}

export function computeTileLayout(input: TileLayoutInput): TileLayout {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const ss = Math.max(1, Math.round(input.supersample));
  const fullWidth = width * ss;
  const fullHeight = height * ss;
  const maxTile = Math.max(ss * 4, Math.floor(input.maxTileSize));

  if (fullWidth <= maxTile && fullHeight <= maxTile) {
    const rect = { x: 0, y: 0, width: fullWidth, height: fullHeight };
    return {
      fullWidth,
      fullHeight,
      supersample: ss,
      margin: 0,
      columns: 1,
      rows: 1,
      tiles: [
        {
          render: rect,
          core: { ...rect },
          cropX: 0,
          cropY: 0,
          output: { x: 0, y: 0, width, height },
        },
      ],
    };
  }

  let margin = Math.ceil(Math.max(0, input.margin) / ss) * ss;
  margin = Math.min(margin, Math.floor(maxTile / 4 / ss) * ss);
  const coreMaxOut = Math.max(1, Math.floor((maxTile - 2 * margin) / ss));
  const columns = Math.ceil(width / coreMaxOut);
  const rows = Math.ceil(height / coreMaxOut);
  const colWidths = splitEven(width, columns);
  const rowHeights = splitEven(height, rows);

  const tiles: Tile[] = [];
  let oy = 0;
  for (let r = 0; r < rows; r++) {
    const oh = rowHeights[r]!;
    let ox = 0;
    for (let c = 0; c < columns; c++) {
      const ow = colWidths[c]!;
      const core: Rect = { x: ox * ss, y: oy * ss, width: ow * ss, height: oh * ss };
      const rx0 = Math.max(0, core.x - margin);
      const ry0 = Math.max(0, core.y - margin);
      const rx1 = Math.min(fullWidth, core.x + core.width + margin);
      const ry1 = Math.min(fullHeight, core.y + core.height + margin);
      tiles.push({
        render: { x: rx0, y: ry0, width: rx1 - rx0, height: ry1 - ry0 },
        core,
        cropX: core.x - rx0,
        cropY: core.y - ry0,
        output: { x: ox, y: oy, width: ow, height: oh },
      });
      ox += ow;
    }
    oy += oh;
  }
  return { fullWidth, fullHeight, supersample: ss, margin, columns, rows, tiles };
}

export function exportFrame(viewWidth: number, viewHeight: number, aspect: number): Rect {
  const viewAspect = viewWidth / Math.max(1, viewHeight);
  if (aspect >= viewAspect) {
    const height = viewWidth / aspect;
    return { x: 0, y: (viewHeight - height) / 2, width: viewWidth, height };
  }
  const width = viewHeight * aspect;
  return { x: (viewWidth - width) / 2, y: 0, width, height: viewHeight };
}

export function exportHeightFraction(viewAspect: number, exportAspect: number): number {
  return exportAspect >= viewAspect ? viewAspect / exportAspect : 1;
}

export function exportFov(previewFov: number, viewAspect: number, exportAspect: number): number {
  const f = exportHeightFraction(viewAspect, exportAspect);
  const half = (previewFov * Math.PI) / 360;
  return (Math.atan(Math.tan(half) * f) * 360) / Math.PI;
}

export function aoMarginPixels(
  worldRadius: number,
  pixelsPerWorldUnit: number,
  denoiseRadiusPx: number,
): number {
  return Math.ceil(worldRadius * pixelsPerWorldUnit * 1.5 + denoiseRadiusPx * 2 + 8);
}
