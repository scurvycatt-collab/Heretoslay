/**
 * Asset-import core: pure, DOM-free logic shared by the browser adapter and the
 * Node CLI (tools/import-card-art.ts). No I/O, no canvas, no globals.
 * Contract: docs/contracts/ASSET_IMPORT_WORKBENCH.md + ../contract.ts.
 */
import type {
  AssetSource, AssetType, CardAssetManifest, ExportedCardAsset, ExportMode, ImportCandidate, ImportDraft,
  QuarterTurn, RejectedFile, Template,
} from "../contract";

export type Box = { x: number; y: number; width: number; height: number };
export type ImageFormat = "png" | "jpeg" | "webp";
export type Limits = { maxFileBytes: number; maxBatchBytes: number; maxPixels: number };

/** v1 limits (contract §4). Exceeding them is an error, never a silent downscale. */
export const DEFAULT_LIMITS: Limits = { maxFileBytes: 32 * 2 ** 20, maxBatchBytes: 256 * 2 ** 20, maxPixels: 40_000_000 };
export const TEMPLATE_SIZE: Record<Template, { width: number; height: number }> = {
  poker: { width: 745, height: 1040 },
  tarot: { width: 827, height: 1417 },
};
/** Opaque padding for complete fronts (contract §5.3). */
export const FRONT_PADDING = "#10161b";

// ---------------------------------------------------------------------------
// Names / ids
// ---------------------------------------------------------------------------

/** "Bad Axe", "bad_axe", "BAD-AXE " -> "bad-axe". Dots are kept (definitionId separators). */
export function normalizeKey(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-*\.-*/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
}

export const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/;

/** A path segment that cannot escape the archive root. */
export function isSafeArchivePath(p: string): boolean {
  if (!p || p.length > 240 || p.startsWith("/") || p.includes("\\") || /^[a-zA-Z]:/.test(p) || p.includes("\0")) return false;
  return p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== ".." && /^[A-Za-z0-9._ -]+$/.test(seg));
}

export function stem(relativePath: string): string {
  const base = relativePath.split("/").pop() ?? relativePath;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

// ---------------------------------------------------------------------------
// Image header sniffing (decide format by content, read size without decoding)
// ---------------------------------------------------------------------------

const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

export function parsePngHeader(b: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function parseJpegHeader(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) { o++; continue; }
    const marker = b[o + 1];
    if (marker === 0xff) { o++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
    const len = u16be(b, o + 2);
    if (len < 2) return null;
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
    }
    o += 2 + len;
  }
  return null;
}

function parseWebpHeader(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const chunk = tag(12);
  if (chunk === "VP8 ") return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    if (b[20] & 0x02) return null; // animated
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return null;
}

/** Format + stored dimensions from magic bytes. Extension/MIME are never trusted. */
export function sniffImage(b: Uint8Array): { format: ImageFormat; width: number; height: number } | null {
  const png = parsePngHeader(b);
  if (png) return { format: "png", ...png };
  const jpeg = parseJpegHeader(b);
  if (jpeg) return { format: "jpeg", ...jpeg };
  const webp = parseWebpHeader(b);
  if (webp) return { format: "webp", ...webp };
  return null;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function rotatedSize(width: number, height: number, rotation: QuarterTurn): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Whole source fitted, centred, inside dst (no crop, no stretch). */
export function containRect(srcW: number, srcH: number, dstW: number, dstH: number): Box {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const width = Math.max(1, Math.min(dstW, Math.round(srcW * scale)));
  const height = Math.max(1, Math.min(dstH, Math.round(srcH * scale)));
  return { x: Math.floor((dstW - width) / 2), y: Math.floor((dstH - height) / 2), width, height };
}

export type Anchor = "centre" | "top" | "bottom" | "left" | "right";

/** Integer source rect that, scaled, exactly covers dst. */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number, anchor: Anchor = "centre"): Box {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const width = Math.min(srcW, Math.max(1, Math.round(dstW / scale)));
  const height = Math.min(srcH, Math.max(1, Math.round(dstH / scale)));
  const x = anchor === "left" ? 0 : anchor === "right" ? srcW - width : Math.floor((srcW - width) / 2);
  const y = anchor === "top" ? 0 : anchor === "bottom" ? srcH - height : Math.floor((srcH - height) / 2);
  return { x, y, width, height };
}

export function cropInside(crop: Box, w: number, h: number): boolean {
  return [crop.x, crop.y, crop.width, crop.height].every(Number.isInteger)
    && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 && crop.x + crop.width <= w && crop.y + crop.height <= h;
}

export function clampCrop(crop: Box, w: number, h: number): Box {
  const width = Math.max(1, Math.min(w, Math.round(crop.width)));
  const height = Math.max(1, Math.min(h, Math.round(crop.height)));
  return {
    x: Math.max(0, Math.min(w - width, Math.round(crop.x))),
    y: Math.max(0, Math.min(h - height, Math.round(crop.y))),
    width, height,
  };
}

/**
 * Output plan for one candidate. complete_card_front → contain on the template
 * canvas. artwork → cover into the template's art box (preview only; composite
 * into a face is CardRenderer's job, contract §5.4).
 */
export function renderPlan(candidate: Pick<ImportCandidate, "assetType" | "template" | "crop" | "rotation">, artBox?: Box) {
  const turned = rotatedSize(candidate.crop.width, candidate.crop.height, candidate.rotation);
  if (candidate.assetType === "artwork" && artBox) {
    return { canvas: { width: artBox.width, height: artBox.height }, contentRect: { x: 0, y: 0, width: artBox.width, height: artBox.height }, fit: "cover" as const, turned };
  }
  const canvas = TEMPLATE_SIZE[candidate.template];
  return { canvas, contentRect: containRect(turned.width, turned.height, canvas.width, canvas.height), fit: "contain" as const, turned };
}

// ---------------------------------------------------------------------------
// Candidate proposals (never "confirmed": reviewed=false, definitionId only for exact ids)
// ---------------------------------------------------------------------------

/**
 * Print-sheet grids measured on the owner's Kickstarter sheets
 * (tools/card-render/extract-kickstarter.ps1). Cells are cut faces, rotated 270°.
 */
export const SHEET_PRESETS = [
  {
    id: "print-3600x5400-poker", width: 3600, height: 5400, template: "poker" as Template, rotation: 270 as QuarterTurn,
    cells: (() => {
      const xs = [196, 1320, 2448]; const ys = [304, 1132, 1956, 2782, 3606, 4432];
      return xs.flatMap((x, c) => ys.map((y, r) => ({ row: r + 1, column: c + 1, crop: { x, y, width: 960, height: 664 } })));
    })(),
  },
  {
    id: "print-3600x5400-tarot", width: 3600, height: 5400, template: "tarot" as Template, rotation: 270 as QuarterTurn,
    cells: (() => {
      const xs = [356, 1860];
      return xs.flatMap((x, c) => [0, 1, 2, 3, 4, 5].map((r) => ({ row: r + 1, column: c + 1, crop: { x, y: 75 + 884 * r, width: 1417, height: 827 } })));
    })(),
  },
] as const;

export type SheetPreset = (typeof SHEET_PRESETS)[number];

export function findSheetPreset(width: number, height: number, relativePath: string): SheetPreset | null {
  const fits = SHEET_PRESETS.filter((p) => p.width === width && p.height === height);
  if (!fits.length) return null;
  const tarot = /tarot/i.test(relativePath);
  return fits.find((p) => p.template === (tarot ? "tarot" : "poker")) ?? fits[0];
}

const ASPECT = { poker: 745 / 1040, tarot: 827 / 1417 };

/** Single-image template guess by aspect (±4%), either orientation. */
export function guessSingle(width: number, height: number): { assetType: AssetType; template: Template; rotation: QuarterTurn } {
  const portrait = width / height;
  const landscape = height / width;
  for (const template of ["poker", "tarot"] as const) {
    if (Math.abs(portrait / ASPECT[template] - 1) <= 0.04) return { assetType: "complete_card_front", template, rotation: 0 };
    if (Math.abs(landscape / ASPECT[template] - 1) <= 0.04) return { assetType: "complete_card_front", template, rotation: 90 };
  }
  return { assetType: "artwork", template: "poker", rotation: 0 };
}

export const looksLikeBack = (relativePath: string) => /(^|[^a-z])back([^a-z]|$)/i.test(relativePath);

/** Low luminance spread on a downscaled cell ⇒ probably an empty sheet slot. */
export function isProbablyBlank(luma: ArrayLike<number>): boolean {
  let sum = 0; let sq = 0;
  for (let i = 0; i < luma.length; i++) { sum += luma[i]; sq += luma[i] * luma[i]; }
  const mean = sum / luma.length;
  return Math.sqrt(Math.max(0, sq / luma.length - mean * mean)) < 6;
}

export function proposeCandidates(
  source: AssetSource,
  definitions: ReadonlyMap<string, unknown>,
): Array<ImportCandidate & { cell?: { row: number; column: number } }> {
  const base = {
    sourceId: source.sourceId, previewUrl: null, variant: "default", reviewed: false,
    provenance: { origin: `Owner folder · ${source.relativePath}`, rightsStatus: "UNVERIFIED" as const },
  };
  const back = looksLikeBack(source.relativePath);
  const key = source.sha256 ? source.sha256.slice(0, 10) : source.sourceId;
  const preset = findSheetPreset(source.width, source.height, source.relativePath);
  if (preset) {
    return preset.cells.map((cell) => ({
      ...base,
      candidateId: `${key}-r${cell.row}-c${cell.column}`,
      label: `${stem(source.relativePath)} · r${cell.row} c${cell.column}`,
      assetType: "complete_card_front" as const,
      side: back ? "back" as const : "front" as const,
      template: preset.template,
      crop: { ...cell.crop },
      rotation: preset.rotation,
      definitionId: null,
      excluded: back,
      cell: { row: cell.row, column: cell.column },
    }));
  }
  const guess = guessSingle(source.width, source.height);
  const exactId = normalizeKey(stem(source.relativePath));
  return [{
    ...base,
    candidateId: `${key}-single`,
    label: stem(source.relativePath),
    assetType: guess.assetType,
    side: back ? "back" : "front",
    template: guess.template,
    crop: { x: 0, y: 0, width: source.width, height: source.height },
    rotation: guess.rotation,
    // Only an exact definitionId file name is carried over; everything else stays unmapped.
    definitionId: definitions.has(exactId) ? exactId : null,
    excluded: back,
  }];
}

// ---------------------------------------------------------------------------
// Draft JSON boundary (runtime validation) + resume
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Structural validation of a saved draft. Semantic checks stay in validateDraft(). */
export function parseDraftJson(raw: unknown): ImportDraft {
  const fail = (msg: string): never => { throw new Error(`Draft JSON không hợp lệ: ${msg}`); };
  if (!isObj(raw)) fail("không phải object");
  const d = raw as Record<string, unknown>;
  if (d.schema !== 1) fail("schema phải là 1");
  if (typeof d.collection !== "string") fail("thiếu collection");
  if (!Array.isArray(d.sources) || !Array.isArray(d.candidates)) fail("thiếu sources/candidates");
  const sources = (d.sources as unknown[]).map((s, i): AssetSource => {
    if (!isObj(s) || typeof s.sourceId !== "string" || typeof s.relativePath !== "string" || !isInt(s.width) || !isInt(s.height)) fail(`sources[${i}]`);
    const src = s as Record<string, unknown>;
    if (!isSafeRelative(src.relativePath as string)) fail(`sources[${i}].relativePath phải là đường dẫn tương đối`);
    const sha = src.sha256;
    if (sha !== null && (typeof sha !== "string" || !/^[a-f0-9]{64}$/i.test(sha))) fail(`sources[${i}].sha256`);
    return { sourceId: src.sourceId as string, relativePath: src.relativePath as string, sha256: (sha as string | null) ?? null, width: src.width as number, height: src.height as number };
  });
  const candidates = (d.candidates as unknown[]).map((c, i): ImportCandidate => {
    if (!isObj(c)) fail(`candidates[${i}]`);
    const k = c as Record<string, unknown>;
    const crop = k.crop as Record<string, unknown>;
    const prov = k.provenance as Record<string, unknown>;
    if (typeof k.candidateId !== "string" || typeof k.sourceId !== "string" || typeof k.label !== "string") fail(`candidates[${i}] id/label`);
    if (!isObj(crop) || ![crop.x, crop.y, crop.width, crop.height].every((n) => typeof n === "number")) fail(`candidates[${i}].crop`);
    if (!["complete_card_front", "artwork"].includes(k.assetType as string)) fail(`candidates[${i}].assetType`);
    if (!["front", "back"].includes(k.side as string)) fail(`candidates[${i}].side`);
    if (!["poker", "tarot"].includes(k.template as string)) fail(`candidates[${i}].template`);
    if (![0, 90, 180, 270].includes(k.rotation as number)) fail(`candidates[${i}].rotation`);
    if (k.definitionId !== null && typeof k.definitionId !== "string") fail(`candidates[${i}].definitionId`);
    if (typeof k.variant !== "string" || typeof k.reviewed !== "boolean" || typeof k.excluded !== "boolean") fail(`candidates[${i}] flags`);
    if (!isObj(prov) || typeof prov.origin !== "string") fail(`candidates[${i}].provenance`);
    if (prov.rightsStatus !== "UNVERIFIED") fail(`candidates[${i}].provenance.rightsStatus phải là UNVERIFIED`);
    return {
      candidateId: k.candidateId as string, sourceId: k.sourceId as string, label: k.label as string,
      previewUrl: null, // blob URLs never survive a reload
      assetType: k.assetType as AssetType, side: k.side as "front" | "back", template: k.template as Template,
      crop: { x: crop.x as number, y: crop.y as number, width: crop.width as number, height: crop.height as number },
      rotation: k.rotation as QuarterTurn, definitionId: (k.definitionId as string | null) ?? null,
      variant: k.variant as string, reviewed: k.reviewed as boolean, excluded: k.excluded as boolean,
      provenance: { origin: prov.origin as string, rightsStatus: "UNVERIFIED" },
    };
  });
  return { schema: 1, collection: d.collection as string, sources, candidates };
}

function isSafeRelative(p: string): boolean {
  return !!p && !p.startsWith("/") && !/^[a-zA-Z]:/.test(p) && !p.includes("\\") && !p.split("/").includes("..");
}

/**
 * Re-attach a saved draft to freshly inspected files: sources are matched by
 * SHA-256 only (never by path). Saved candidates of matched sources replace the
 * fresh proposals; saved candidates whose source is gone are reported, not kept.
 * Reviewed flags survive only when hash + dimensions match exactly.
 */
export function resumeDraft(saved: ImportDraft, inspected: ImportDraft): { draft: ImportDraft; matched: number; missing: string[] } {
  const byHash = new Map(inspected.sources.filter((s) => s.sha256).map((s) => [s.sha256!.toLowerCase(), s]));
  const remap = new Map<string, AssetSource>();
  const missing: string[] = [];
  for (const s of saved.sources) {
    const hit = s.sha256 ? byHash.get(s.sha256.toLowerCase()) : undefined;
    if (hit && hit.width === s.width && hit.height === s.height) remap.set(s.sourceId, hit);
    else missing.push(s.relativePath);
  }
  const resumedSourceIds = new Set([...remap.values()].map((s) => s.sourceId));
  const carried = saved.candidates
    .filter((c) => remap.has(c.sourceId))
    .map((c) => ({ ...c, sourceId: remap.get(c.sourceId)!.sourceId, previewUrl: null }));
  const fresh = inspected.candidates.filter((c) => !resumedSourceIds.has(c.sourceId));
  return {
    draft: { ...inspected, collection: saved.collection || inspected.collection, candidates: [...carried, ...fresh] },
    matched: remap.size,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Manifest + archive
// ---------------------------------------------------------------------------

export function exportFileName(candidateId: string): string {
  if (!SAFE_ID.test(candidateId)) throw new Error(`candidateId không an toàn cho tên file: ${candidateId}`);
  return `fronts/${candidateId}.png`;
}

export function buildManifest(
  draft: ImportDraft, mode: ExportMode, assets: ExportedCardAsset[],
): CardAssetManifest {
  const used = new Set(assets.map((a) => a.sourceId));
  return {
    schema: 1,
    collection: draft.collection,
    mode,
    gameplaySupported: false,
    sources: draft.sources.filter((s) => used.has(s.sourceId)).map((s) => ({ ...s })),
    assets,
  };
}

export function readmeText(manifest: CardAssetManifest): string {
  const poker = manifest.assets.filter((a) => a.template === "poker").length;
  const tarot = manifest.assets.length - poker;
  return [
    `${manifest.collection}`,
    `${manifest.assets.length} complete card faces (${manifest.mode} pack). Poker 745x1040: ${poker}. Tarot 827x1417: ${tarot}.`,
    "renderMode=complete_face: show the PNG directly; do not overlay frame/text again.",
    manifest.mode === "preview" ? "Preview pack: definitionId may be null; do not load into the gameplay resolver." : "Mapped pack: every definitionId was checked against the catalog at export time.",
    "Rights: UNVERIFIED. gameplaySupported=false. Not for public hosting.",
    "Source paths are relative to the folder chosen in the workbench; hashes are SHA-256 of the original bytes.",
    "",
  ].join("\n");
}

let CRC_TABLE: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP (stored, no compression — PNGs are already deflated). */
export function buildZip(entries: Array<{ path: string; data: Uint8Array }>, date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const seen = new Set<string>();
  const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!isSafeArchivePath(entry.path)) throw new Error(`Đường dẫn trong ZIP không an toàn: ${entry.path}`);
    if (seen.has(entry.path)) throw new Error(`Trùng đường dẫn trong ZIP: ${entry.path}`);
    seen.add(entry.path);
    const name = enc.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length; }
  return out;
}

/** Read back a stored ZIP built by buildZip (used to verify the archive before reporting success). */
export function readZipEntries(zip: Uint8Array): Array<{ path: string; data: Uint8Array; crcOk: boolean }> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("ZIP: thiếu end-of-central-directory");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: Array<{ path: string; data: Uint8Array; crcOk: boolean }> = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP: central directory hỏng");
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const path = dec.decode(zip.subarray(p + 46, p + 46 + nameLen));
    const localNameLen = dv.getUint16(local + 26, true);
    const localExtra = dv.getUint16(local + 28, true);
    const start = local + 30 + localNameLen + localExtra;
    const data = zip.subarray(start, start + size);
    out.push({ path, data, crcOk: crc32(data) === crc });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type { RejectedFile };
