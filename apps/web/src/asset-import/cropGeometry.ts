/**
 * Pure crop geometry for the workbench crop editor. All boxes are integer source
 * pixels in the upright source, BEFORE the candidate's rotation (contract §5.1).
 * No DOM, no imports with runtime values: tested by tests/crop-geometry.test.ts.
 */
export type Box = { x: number; y: number; width: number; height: number };
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type QuarterTurn = 0 | 90 | 180 | 270;
export type Template = "poker" | "tarot";

/** Output canvases and art boxes (CARD_TEMPLATE_SPEC.json; kept literal so this file stays dependency-free). */
export const CARD_SIZE: Record<Template, { width: number; height: number }> = {
  poker: { width: 745, height: 1040 },
  tarot: { width: 827, height: 1417 },
};
export const ART_LAYOUTS = {
  hero: { label: "Hero / Item / Magic (545×545)", width: 545, height: 545, template: "poker" },
  modifier: { label: "Modifier (545×545)", width: 545, height: 545, template: "poker" },
  challenge: { label: "Challenge (645×550)", width: 645, height: 550, template: "poker" },
  monster: { label: "Monster (745×824)", width: 745, height: 824, template: "tarot" },
  party_leader: { label: "Party Leader (745×1176)", width: 745, height: 1176, template: "tarot" },
} as const;
export type ArtLayout = keyof typeof ART_LAYOUTS;

/** Card kind (catalog) → art layout key. */
export function artLayoutForKind(kind: string | undefined): ArtLayout | undefined {
  if (!kind) return undefined;
  if (kind === "item" || kind === "cursed_item" || kind === "magic" || kind === "hero") return "hero";
  return kind in ART_LAYOUTS ? (kind as ArtLayout) : undefined;
}

const turned = (rotation: QuarterTurn) => rotation === 90 || rotation === 270;

/**
 * width/height ratio the crop must have IN SOURCE PIXELS so that, after rotation,
 * it fills the target exactly (card canvas for complete faces, art box for artwork).
 */
export function sourceAspect(target: { width: number; height: number }, rotation: QuarterTurn): number {
  const r = target.width / target.height;
  return turned(rotation) ? 1 / r : r;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Integer box fully inside bounds with at least `min` px per side. */
export function normalizeBox(b: Box, bounds: { width: number; height: number }, min = 8): Box {
  const width = clamp(Math.round(b.width), Math.min(min, bounds.width), bounds.width);
  const height = clamp(Math.round(b.height), Math.min(min, bounds.height), bounds.height);
  return { x: clamp(Math.round(b.x), 0, bounds.width - width), y: clamp(Math.round(b.y), 0, bounds.height - height), width, height };
}

/** b grown by `fraction` of its size on every side, clamped to bounds (search area for edge snapping). */
export function expandBox(b: Box, fraction: number, bounds: { width: number; height: number }): Box {
  const dx = b.width * fraction, dy = b.height * fraction;
  const x0 = Math.max(0, b.x - dx), y0 = Math.max(0, b.y - dy);
  const x1 = Math.min(bounds.width, b.x + b.width + dx), y1 = Math.min(bounds.height, b.y + b.height + dy);
  return normalizeBox({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, bounds, 1);
}

/** True when b covers nearly the whole image (then a drag inside it draws instead of moving). */
export function coversImage(b: Box, bounds: { width: number; height: number }): boolean {
  return b.width * b.height >= 0.9 * bounds.width * bounds.height;
}

/** Moves a box by (dx, dy), keeping its size and staying inside bounds. */
export function moveBox(b: Box, dx: number, dy: number, bounds: { width: number; height: number }): Box {
  return normalizeBox({ ...b, x: b.x + dx, y: b.y + dy }, bounds);
}

/**
 * Resizes from a handle. The opposite edge/corner stays fixed. With `aspect`
 * (w/h) the box keeps that ratio; it shrinks instead of leaving the bounds.
 */
export function resizeBox(b: Box, handle: Handle, dx: number, dy: number, bounds: { width: number; height: number }, aspect?: number, min = 8): Box {
  let left = b.x, top = b.y, right = b.x + b.width, bottom = b.y + b.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - min);
  if (handle.includes("e")) right = clamp(right + dx, left + min, bounds.width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - min);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + min, bounds.height);
  if (!aspect) return normalizeBox({ x: left, y: top, width: right - left, height: bottom - top }, bounds, min);

  // Aspect lock: the dragged axis drives; edge handles grow the other axis around the centre.
  const horizontal = handle === "e" || handle === "w";
  const vertical = handle === "n" || handle === "s";
  let w = right - left, h = bottom - top;
  if (horizontal) h = w / aspect;
  else if (vertical) w = h * aspect;
  else if (Math.abs(dx) * b.height >= Math.abs(dy) * b.width) h = w / aspect; else w = h * aspect;

  // Anchor = the fixed side(s); centre for the axis an edge handle does not touch.
  const ax = handle.includes("w") ? right : handle.includes("e") ? left : b.x + b.width / 2;
  const ay = handle.includes("n") ? bottom : handle.includes("s") ? top : b.y + b.height / 2;
  const dirX = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const dirY = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
  // Largest size (same ratio) that still fits from the anchor.
  const roomX = dirX < 0 ? ax : dirX > 0 ? bounds.width - ax : 2 * Math.min(ax, bounds.width - ax);
  const roomY = dirY < 0 ? ay : dirY > 0 ? bounds.height - ay : 2 * Math.min(ay, bounds.height - ay);
  const s = Math.min(1, roomX / w, roomY / h);
  w = Math.max(min, w * s); h = Math.max(min, h * s);
  const x = dirX < 0 ? ax - w : dirX > 0 ? ax : ax - w / 2;
  const y = dirY < 0 ? ay - h : dirY > 0 ? ay : ay - h / 2;
  return normalizeBox({ x, y, width: w, height: h }, bounds, min);
}

/** Box spanned by a drag from p0 to p1 (any direction); aspect-locked when given. */
export function boxFromDrag(p0: { x: number; y: number }, p1: { x: number; y: number }, bounds: { width: number; height: number }, aspect?: number): Box {
  const sx = p1.x >= p0.x ? 1 : -1, sy = p1.y >= p0.y ? 1 : -1;
  let w = Math.abs(p1.x - p0.x), h = Math.abs(p1.y - p0.y);
  if (aspect) { if (w / Math.max(h, 1e-9) > aspect) h = w / aspect; else w = h * aspect; }
  const roomX = sx > 0 ? bounds.width - p0.x : p0.x;
  const roomY = sy > 0 ? bounds.height - p0.y : p0.y;
  const s = Math.min(1, roomX / Math.max(w, 1e-9), roomY / Math.max(h, 1e-9));
  w *= s; h *= s;
  return normalizeBox({ x: sx > 0 ? p0.x : p0.x - w, y: sy > 0 ? p0.y : p0.y - h, width: w, height: h }, bounds, 1);
}

/** Largest box with `aspect` centred inside b (used when the lock is switched on). */
export function fitAspect(b: Box, aspect: number, bounds: { width: number; height: number }): Box {
  let w = b.width, h = b.height;
  if (w / h > aspect) w = h * aspect; else h = w / aspect;
  return normalizeBox({ x: b.x + (b.width - w) / 2, y: b.y + (b.height - h) / 2, width: w, height: h }, bounds);
}

/**
 * Splits b into rows × cols cells separated by gutters (source px). Cells are
 * integer and tile b exactly apart from the gutters (remainder spread left→right).
 */
export function splitGrid(b: Box, rows: number, cols: number, gutterX = 0, gutterY = 0): Array<Box & { row: number; column: number }> {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) throw new Error("Số hàng/cột phải là số nguyên ≥ 1.");
  const cellW = (b.width - gutterX * (cols - 1)) / cols;
  const cellH = (b.height - gutterY * (rows - 1)) / rows;
  if (cellW < 1 || cellH < 1) throw new Error("Khe hở quá lớn so với vùng.");
  const out: Array<Box & { row: number; column: number }> = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = Math.round(b.x + c * (cellW + gutterX)), x1 = Math.round(b.x + c * (cellW + gutterX) + cellW);
    const y0 = Math.round(b.y + r * (cellH + gutterY)), y1 = Math.round(b.y + r * (cellH + gutterY) + cellH);
    out.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, row: r + 1, column: c + 1 });
  }
  return out;
}

/**
 * Tight bounding box of "content" inside an RGBA sample of a region: pixels that
 * differ from the region's border colour (median of the outer ring) by more than
 * `tolerance` (0–255, max channel delta). Coordinates are in sample pixels.
 * Returns null when nothing stands out (empty / uniform region).
 */
export function contentBounds(rgba: ArrayLike<number>, width: number, height: number, tolerance = 28): Box | null {
  if (width < 3 || height < 3) return null;
  const ring: number[][] = [[], [], []];
  const at = (x: number, y: number) => (y * width + x) * 4;
  const pushRing = (x: number, y: number) => { const i = at(x, y); ring[0].push(rgba[i]); ring[1].push(rgba[i + 1]); ring[2].push(rgba[i + 2]); };
  for (let x = 0; x < width; x++) { pushRing(x, 0); pushRing(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { pushRing(0, y); pushRing(width - 1, y); }
  const bg = ring.map((ch) => ch.sort((a, b) => a - b)[ch.length >> 1]);
  const differs = (x: number, y: number) => {
    const i = at(x, y);
    return Math.abs(rgba[i] - bg[0]) > tolerance || Math.abs(rgba[i + 1] - bg[1]) > tolerance || Math.abs(rgba[i + 2] - bg[2]) > tolerance;
  };
  // Per-row / per-column counts of differing pixels. A line counts as content when ≥ 2% of it differs
  // (ignores specks / JPEG noise). Separate blocks (a page title, a caption) are split at gaps of
  // background; the block with the most content wins, so a heading above a card is not swallowed.
  const minRow = Math.max(2, width * 0.02);
  const rowCount = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (differs(x, y)) rowCount[y]++;
  const rows = dominantRun(rowCount, minRow, Math.max(2, Math.round(height * 0.02)));
  if (!rows) return null;
  const colCount = new Array<number>(width).fill(0);
  for (let x = 0; x < width; x++) for (let y = rows[0]; y <= rows[1]; y++) if (differs(x, y)) colCount[x]++;
  const cols = dominantRun(colCount, Math.max(2, (rows[1] - rows[0] + 1) * 0.02), Math.max(2, Math.round(width * 0.02)));
  if (!cols) return null;
  return { x: cols[0], y: rows[0], width: cols[1] - cols[0] + 1, height: rows[1] - rows[0] + 1 };
}

/** [start, end] of the run of "hit" lines (count ≥ min) with the largest total; gaps ≤ maxGap are bridged. */
function dominantRun(counts: number[], min: number, maxGap: number): [number, number] | null {
  let best: [number, number] | null = null, bestMass = 0;
  let start = -1, end = -1, mass = 0, gap = 0;
  const close = () => { if (start >= 0 && mass > bestMass) { best = [start, end]; bestMass = mass; } start = -1; mass = 0; gap = 0; };
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] >= min) { if (start < 0) start = i; end = i; mass += counts[i]; gap = 0; }
    else if (start >= 0 && ++gap > maxGap) close();
  }
  close();
  return best;
}

/** Maps a box found in a downscaled sample back to source pixels, padded outward by one sample pixel. */
export function sampleToSource(found: Box, region: Box, sampleW: number, sampleH: number, bounds: { width: number; height: number }): Box {
  const sx = region.width / sampleW, sy = region.height / sampleH;
  const x0 = region.x + Math.floor(found.x * sx), y0 = region.y + Math.floor(found.y * sy);
  const x1 = region.x + Math.ceil((found.x + found.width) * sx), y1 = region.y + Math.ceil((found.y + found.height) * sy);
  return normalizeBox({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, bounds, 1);
}
