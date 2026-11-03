/**
 * Browser AssetImportAdapter: everything runs locally on File objects the user
 * picked (no server, no path strings, nothing uploaded). Pure logic lives in
 * ./core.ts and is shared with tools/import-card-art.ts.
 */
import spec from "../../../../../docs/contracts/CARD_TEMPLATE_SPEC.json";
import {
  validateDraft, type AssetImportAdapter, type AssetSource, type ExportedCardAsset, type ExportMode, type ExportProgress,
  type ExportResult, type ImportCandidate, type ImportDraft, type RejectedFile, ARTWORK_RIGHTS_STATUS,
} from "../contract";
import {
  DEFAULT_LIMITS, FRONT_PADDING, TEMPLATE_SIZE, buildManifest, buildZip, cropInside, exportFileName, isProbablyBlank,
  parsePngHeader, proposeCandidates, readZipEntries, readmeText, renderPlan, rotatedSize, sniffImage, toHex,
  type Box, type Limits,
} from "./core";

type Definitions = ReadonlyMap<string, { kind: string }>;
type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface BrowserAdapterOptions {
  definitions: Definitions;
  limits?: Partial<Limits>;
}

const LAYOUT_ALIAS: Record<string, string> = { cursed_item: "item" };
const MiB = (n: number) => `${(n / 2 ** 20).toFixed(1)} MiB`;

function abortError(): DOMException { return new DOMException("Đã hủy thao tác.", "AbortError"); }
function check(signal: AbortSignal): void { if (signal.aborted) throw abortError(); }

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return canvas;
}

function context(canvas: AnyCanvas): Ctx {
  const ctx = canvas.getContext("2d", { alpha: true }) as Ctx | null;
  if (!ctx) throw new Error("Trình duyệt không cấp canvas 2D.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

async function canvasToPng(canvas: AnyCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("Không mã hóa được PNG."))), "image/png"));
}

async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

/** Draws the candidate's crop (source px, pre-rotation) rotated clockwise into dest. */
function drawCrop(ctx: Ctx, bitmap: ImageBitmap, c: ImportCandidate, dest: Box): void {
  const turned = c.rotation === 90 || c.rotation === 270;
  const pw = turned ? dest.height : dest.width;
  const ph = turned ? dest.width : dest.height;
  ctx.save();
  ctx.translate(dest.x + dest.width / 2, dest.y + dest.height / 2);
  ctx.rotate((c.rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, c.crop.x, c.crop.y, c.crop.width, c.crop.height, -pw / 2, -ph / 2, pw, ph);
  ctx.restore();
}

export function createBrowserAdapter(options: BrowserAdapterOptions): AssetImportAdapter & { readonly kind: "browser" } {
  const limits: Limits = { ...DEFAULT_LIMITS, ...options.limits };
  const { definitions } = options;
  const files = new Map<string, File>();
  const candidateUrls = new Map<string, string>();
  const sourceUrls = new Map<string, { url: string; scale: number }>();
  let exportUrls: string[] = [];
  const bitmaps = new Map<string, ImageBitmap>(); // tiny LRU: print sheets are ~80 MB decoded

  function artBoxFor(candidate: ImportCandidate): Box | undefined {
    const kind = candidate.definitionId ? definitions.get(candidate.definitionId)?.kind : undefined;
    if (!kind) return undefined;
    const layouts = spec.layouts as Record<string, { art?: { x: number; y: number; w: number; h: number } }>;
    const art = layouts[LAYOUT_ALIAS[kind] ?? kind]?.art;
    return art ? { x: art.x, y: art.y, width: art.w, height: art.h } : undefined;
  }

  async function bitmapFor(source: AssetSource, signal: AbortSignal): Promise<ImageBitmap> {
    const cached = bitmaps.get(source.sourceId);
    if (cached) { bitmaps.delete(source.sourceId); bitmaps.set(source.sourceId, cached); return cached; }
    const file = files.get(source.sourceId);
    if (!file) throw new Error(`Nguồn "${source.relativePath}" chưa được chọn trong phiên này. Chọn lại folder (draft sẽ được đối chiếu hash).`);
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (signal.aborted) { bitmap.close(); throw abortError(); }
    if (bitmap.width !== source.width || bitmap.height !== source.height) {
      bitmap.close();
      throw new Error(`Kích thước decode của "${source.relativePath}" không khớp draft (${source.width}×${source.height}).`);
    }
    bitmaps.set(source.sourceId, bitmap);
    while (bitmaps.size > 2) {
      const [oldest, old] = bitmaps.entries().next().value as [string, ImageBitmap];
      old.close(); bitmaps.delete(oldest);
    }
    return bitmap;
  }

  function render(bitmap: ImageBitmap, c: ImportCandidate): { canvas: AnyCanvas; contentRect: Box } {
    if (!cropInside(c.crop, bitmap.width, bitmap.height)) throw new Error("Vùng cắt nằm ngoài ảnh nguồn hoặc không phải pixel nguyên.");
    if (c.assetType === "artwork") {
      const box = artBoxFor(c);
      const turned = rotatedSize(c.crop.width, c.crop.height, c.rotation);
      // Without a definition there is no art box: show the reviewed crop as-is (bounded), never a fake face.
      const size = box ?? (() => { const s = Math.min(1, 1040 / Math.max(turned.width, turned.height)); return { width: Math.max(1, Math.round(turned.width * s)), height: Math.max(1, Math.round(turned.height * s)) }; })();
      const canvas = makeCanvas(size.width, size.height);
      const ctx = context(canvas);
      const scale = Math.max(size.width / turned.width, size.height / turned.height);
      const dw = turned.width * scale; const dh = turned.height * scale;
      drawCrop(ctx, bitmap, c, { x: (size.width - dw) / 2, y: (size.height - dh) / 2, width: dw, height: dh });
      return { canvas, contentRect: { x: 0, y: 0, width: size.width, height: size.height } };
    }
    const plan = renderPlan(c);
    const canvas = makeCanvas(plan.canvas.width, plan.canvas.height);
    const ctx = context(canvas);
    ctx.fillStyle = FRONT_PADDING;
    ctx.fillRect(0, 0, plan.canvas.width, plan.canvas.height);
    drawCrop(ctx, bitmap, c, plan.contentRect);
    return { canvas, contentRect: plan.contentRect };
  }

  /** Marks preset sheet cells that are visually empty as excluded (proposal only, user can re-include). */
  function flagBlankCells(bitmap: ImageBitmap, candidates: ImportCandidate[]): void {
    const probe = makeCanvas(24, 24);
    const ctx = context(probe) as Ctx & { getImageData: CanvasRenderingContext2D["getImageData"] };
    for (const c of candidates) {
      ctx.clearRect(0, 0, 24, 24);
      ctx.drawImage(bitmap, c.crop.x, c.crop.y, c.crop.width, c.crop.height, 0, 0, 24, 24);
      const px = ctx.getImageData(0, 0, 24, 24).data;
      const luma = new Float32Array(24 * 24);
      for (let i = 0; i < luma.length; i++) luma[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
      if (isProbablyBlank(luma)) { c.excluded = true; c.label += " · ô trống?"; }
    }
  }

  function replaceUrl(map: Map<string, string>, key: string, url: string): void {
    const old = map.get(key);
    if (old) URL.revokeObjectURL(old);
    map.set(key, url);
  }

  return {
    kind: "browser",

    async inspect(input, signal) {
      check(signal);
      const rejected: RejectedFile[] = [];
      const sources: AssetSource[] = [];
      const candidates: ImportCandidate[] = [];
      const hashes = new Map<string, string>();
      const fresh = new Map<string, File>();
      let batchBytes = 0;
      const sorted = [...input].sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
      for (const file of sorted) {
        check(signal);
        const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
        const reject = (code: string, message: string) => rejected.push({ relativePath, code, message });
        if (relativePath.split("/").some((seg) => seg.startsWith("."))) { reject("hidden", "File/thư mục ẩn — bỏ qua."); continue; }
        if (file.size === 0) { reject("empty", "File rỗng."); continue; }
        if (file.size > limits.maxFileBytes) { reject("file_too_large", `${MiB(file.size)} > giới hạn ${MiB(limits.maxFileBytes)}/file.`); continue; }
        const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
        const sniff = sniffImage(head) ?? (file.size > head.length ? sniffImage(new Uint8Array(await file.arrayBuffer())) : null);
        if (!sniff) { reject("not_image", "Nội dung không phải PNG/JPEG/WebP (đuôi file không được tin)."); continue; }
        if (sniff.width * sniff.height > limits.maxPixels) {
          reject("too_many_pixels", `${sniff.width}×${sniff.height} vượt ${limits.maxPixels / 1e6} MP; không tự thu nhỏ.`); continue;
        }
        if (batchBytes + file.size > limits.maxBatchBytes) { reject("batch_too_large", `Batch vượt ${MiB(limits.maxBatchBytes)}; tách folder.`); continue; }
        const bytes = await file.arrayBuffer();
        check(signal);
        const sha256 = await sha256Hex(bytes);
        const dup = hashes.get(sha256);
        if (dup) { reject("duplicate_source", `Trùng nội dung với ${dup}.`); continue; }
        let bitmap: ImageBitmap;
        try {
          bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch (error) {
          reject("decode_failed", `Không decode được ảnh: ${error instanceof Error ? error.message : String(error)}`); continue;
        }
        try {
          check(signal);
          const source: AssetSource = { sourceId: `src-${sha256.slice(0, 12)}`, relativePath, sha256, width: bitmap.width, height: bitmap.height };
          const proposed = proposeCandidates(source, definitions).map(({ cell: _cell, ...c }) => c as ImportCandidate);
          if (proposed.length > 1) flagBlankCells(bitmap, proposed);
          hashes.set(sha256, relativePath);
          batchBytes += file.size;
          sources.push(source);
          candidates.push(...proposed);
          fresh.set(source.sourceId, file);
        } finally {
          bitmap.close();
        }
      }
      check(signal);
      // Commit only after a complete, non-aborted inspect: a cancelled pick keeps the old registry.
      for (const url of candidateUrls.values()) URL.revokeObjectURL(url);
      for (const { url } of sourceUrls.values()) URL.revokeObjectURL(url);
      candidateUrls.clear(); sourceUrls.clear();
      for (const b of bitmaps.values()) b.close();
      bitmaps.clear(); files.clear();
      for (const [id, file] of fresh) files.set(id, file);
      const top = sorted[0]?.webkitRelativePath?.split("/")[0];
      return { schema: 1, collection: top || "Local import", sources, candidates, rejected };
    },

    async preview(source, candidate, signal) {
      check(signal);
      const bitmap = await bitmapFor(source, signal);
      const { canvas } = render(bitmap, candidate);
      const blob = await canvasToPng(canvas);
      check(signal);
      const url = URL.createObjectURL(blob);
      replaceUrl(candidateUrls, candidate.candidateId, url);
      return url;
    },

    async sourcePreview(source, signal) {
      check(signal);
      const cached = sourceUrls.get(source.sourceId);
      if (cached) return cached;
      const bitmap = await bitmapFor(source, signal);
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = makeCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
      context(canvas).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = "convertToBlob" in canvas ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : await canvasToPng(canvas);
      check(signal);
      const entry = { url: URL.createObjectURL(blob), scale };
      sourceUrls.set(source.sourceId, entry);
      return entry;
    },

    async export(draft: ImportDraft, mode: ExportMode, signal: AbortSignal, onProgress?: (p: ExportProgress) => void): Promise<ExportResult> {
      check(signal);
      const issues = validateDraft(draft, mode, definitions);
      if (issues.length) throw new Error(`Draft còn ${issues.length} vấn đề (vd: ${issues[0].candidateId}: ${issues[0].message}).`);
      const included = draft.candidates.filter((c) => !c.excluded);
      const artwork = included.filter((c) => c.assetType === "artwork");
      if (artwork.length) {
        throw new Error(`${artwork.length} artwork cần composite bằng CardRenderer thành mặt thẻ — chưa hỗ trợ xuất trong v1 (pending, contract §5.4). Đổi sang "Nguyên mặt thẻ" nếu ảnh đã là mặt hoàn chỉnh, hoặc loại khỏi batch.`);
      }
      const total = included.length + 2;
      let done = 0;
      const tick = (label: string) => onProgress?.({ done: ++done, total, label });

      // Sources must still be the exact bytes that were reviewed.
      const bySource = new Map<string, ImportCandidate[]>();
      for (const c of included) bySource.set(c.sourceId, [...(bySource.get(c.sourceId) ?? []), c]);
      for (const sourceId of bySource.keys()) {
        const source = draft.sources.find((s) => s.sourceId === sourceId)!;
        const file = files.get(sourceId);
        if (!file) throw new Error(`Nguồn "${source.relativePath}" chưa được chọn trong phiên này. Chọn lại folder.`);
        if ((await sha256Hex(await file.arrayBuffer())) !== source.sha256) throw new Error(`"${source.relativePath}" đã thay đổi kể từ lúc import; import lại.`);
        check(signal);
      }

      const pngs: Array<{ path: string; data: Uint8Array; candidateId: string }> = [];
      const assets: ExportedCardAsset[] = [];
      for (const [sourceId, list] of bySource) {
        const source = draft.sources.find((s) => s.sourceId === sourceId)!;
        const bitmap = await bitmapFor(source, signal);
        for (const c of list) {
          check(signal);
          const { canvas, contentRect } = render(bitmap, c);
          const blob = await canvasToPng(canvas);
          const data = new Uint8Array(await blob.arrayBuffer());
          // Independent verification of what we are about to claim.
          const header = parsePngHeader(data);
          const size = TEMPLATE_SIZE[c.template];
          if (!header || header.width !== size.width || header.height !== size.height) throw new Error(`PNG xuất cho ${c.candidateId} sai khổ.`);
          const decoded = await createImageBitmap(blob);
          const ok = decoded.width === size.width && decoded.height === size.height;
          decoded.close();
          if (!ok) throw new Error(`PNG xuất cho ${c.candidateId} không decode lại đúng khổ.`);
          const relativePath = exportFileName(c.candidateId);
          pngs.push({ path: relativePath, data, candidateId: c.candidateId });
          assets.push({
            candidateId: c.candidateId, definitionId: c.definitionId, variant: c.variant, inputType: c.assetType,
            renderMode: "complete_face", template: c.template, relativePath, sha256: await sha256Hex(data),
            width: size.width, height: size.height, contentRect, sourceId: c.sourceId, crop: { ...c.crop },
            rotation: c.rotation, provenance: { ...c.provenance }, rightsStatus: ARTWORK_RIGHTS_STATUS,
          });
          tick(c.label);
        }
      }
      check(signal);
      const manifest = buildManifest(draft, mode, assets);
      const enc = new TextEncoder();
      const manifestBytes = enc.encode(`${JSON.stringify(manifest, null, 2)}\n`);
      const zip = buildZip([
        ...pngs.map(({ path, data }) => ({ path, data })),
        { path: "manifest.json", data: manifestBytes },
        { path: "README.txt", data: enc.encode(readmeText(manifest)) },
      ]);
      tick("manifest + README");
      // Re-read the archive before reporting success.
      const entries = readZipEntries(zip);
      if (entries.length !== pngs.length + 2 || entries.some((e) => !e.crcOk)) throw new Error("ZIP kiểm tra lại thất bại (CRC/số file).");
      for (const e of entries.filter((x) => x.path.endsWith(".png"))) {
        const asset = assets.find((a) => a.relativePath === e.path);
        const h = parsePngHeader(e.data);
        if (!asset || !h || h.width !== asset.width || h.height !== asset.height || (await sha256Hex(e.data)) !== asset.sha256) {
          throw new Error(`ZIP kiểm tra lại thất bại ở ${e.path}.`);
        }
      }
      tick("ZIP đã kiểm tra");
      check(signal);

      for (const url of exportUrls) URL.revokeObjectURL(url);
      exportUrls = [];
      const mk = (data: Uint8Array, type: string) => { const url = URL.createObjectURL(new Blob([data as BlobPart], { type })); exportUrls.push(url); return url; };
      return {
        manifest,
        manifestUrl: mk(manifestBytes, "application/json"),
        archiveUrl: mk(zip, "application/zip"),
        files: pngs.map(({ data, candidateId }) => {
          const a = assets.find((x) => x.candidateId === candidateId)!;
          return { candidateId, url: mk(data, "image/png"), width: a.width, height: a.height, sha256: a.sha256 };
        }),
      };
    },

    dispose() {
      for (const url of candidateUrls.values()) URL.revokeObjectURL(url);
      for (const { url } of sourceUrls.values()) URL.revokeObjectURL(url);
      for (const url of exportUrls) URL.revokeObjectURL(url);
      for (const b of bitmaps.values()) b.close();
      candidateUrls.clear(); sourceUrls.clear(); bitmaps.clear(); files.clear();
      exportUrls = [];
    },
  };
}
