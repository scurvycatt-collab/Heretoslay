import spec from "../../../../../docs/contracts/CARD_TEMPLATE_SPEC.json";
import type { QuarterTurn, Template } from "../contract";

/** v1 limits from ASSET_IMPORT_WORKBENCH.md. Files over a limit are reported, never silently downscaled. */
export const LIMITS = { maxFileBytes: 32 * 1024 * 1024, maxBatchBytes: 256 * 1024 * 1024, maxPixels: 40_000_000 };
export const PADDING = "#10161b";
export type Rect = { x: number; y: number; width: number; height: number };

export const canvasSize = (template: Template) => spec.cardSizes[template] as { width: number; height: number };

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Đã hủy thao tác.", "AbortError");
}

export async function sha256Hex(data: ArrayBuffer | Blob): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Decode with EXIF orientation applied, so width/height are the upright source dimensions. */
export function decodeImage(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas;
}
function canvasToPng(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không mã hóa được PNG.")), "image/png"));
}

/**
 * Crop (pixels in the upright source, before rotation) -> rotate clockwise -> fit contain, centred,
 * on the template canvas with opaque padding. Nothing is overlaid, stretched to cover, or re-lettered.
 * The content box is snapped to whole pixels (scale differs from uniform by <0.2%) so edges are not blended with padding.
 */
export async function renderFace(bitmap: ImageBitmap, crop: Rect, rotation: QuarterTurn, template: Template): Promise<{ blob: Blob; contentRect: Rect; width: number; height: number }> {
  const { width, height } = canvasSize(template);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Trình duyệt không tạo được canvas 2D.");
  ctx.fillStyle = PADDING; ctx.fillRect(0, 0, width, height);
  const swap = rotation === 90 || rotation === 270;
  const rw = swap ? crop.height : crop.width, rh = swap ? crop.width : crop.height;
  const fit = Math.min(width / rw, height / rh);
  const dw = Math.max(1, Math.min(width, Math.round(rw * fit))), dh = Math.max(1, Math.min(height, Math.round(rh * fit)));
  const dx = Math.round((width - dw) / 2), dy = Math.round((height - dh) / 2);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.translate(dx + dw / 2, dy + dh / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  // Scales are expressed in the pre-rotation frame of the crop.
  ctx.scale((swap ? dh : dw) / crop.width, (swap ? dw : dh) / crop.height);
  ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height);
  ctx.restore();
  return { blob: await canvasToPng(canvas), contentRect: { x: dx, y: dy, width: dw, height: dh }, width, height };
}

/** Initial template guess from aspect ratio; the reviewer can change it. */
export function guessTemplate(width: number, height: number): Template {
  const ratio = Math.min(width, height) / Math.max(width, height);
  const poker = spec.cardSizes.poker.width / spec.cardSizes.poker.height, tarot = spec.cardSizes.tarot.width / spec.cardSizes.tarot.height;
  return Math.abs(Math.log(ratio / tarot)) < Math.abs(Math.log(ratio / poker)) ? "tarot" : "poker";
}

/**
 * Grid proposal for a sheet. Returns null when the image already looks like a single card (within 4%).
 * It is only a starting point: every cell stays unreviewed until a person checks it.
 */
export function proposeGrid(width: number, height: number, template: Template): { cols: number; rows: number } | null {
  const { width: cw, height: ch } = canvasSize(template);
  const targets = [cw / ch, ch / cw];
  const error = (cols: number, rows: number) => Math.min(...targets.map((t) => Math.abs(Math.log((width / cols) / (height / rows) / t))));
  if (error(1, 1) < 0.04) return null;
  let best = { cols: 1, rows: 1, err: Infinity };
  for (let cols = 1; cols <= 6; cols++) for (let rows = 1; rows <= 6; rows++) {
    if (cols * rows < 2) continue;
    const err = error(cols, rows);
    if (err < best.err - 1e-9) best = { cols, rows, err };
  }
  return best.err < 0.15 ? { cols: best.cols, rows: best.rows } : null;
}
