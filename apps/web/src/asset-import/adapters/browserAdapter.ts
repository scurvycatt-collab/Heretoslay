import { cardById } from "../../cards/catalog";
import { validateDraft, type AssetImportAdapter, type AssetSource, type CardAssetManifest, type ExportMode, type ExportResult, type ExportedCardAsset, type ImportCandidate, type ImportDraft } from "../contract";
import { buildZip, readZip, type ZipEntry } from "./zip";
import { LIMITS, canvasSize, decodeImage, guessTemplate, proposeGrid, renderFace, sha256Hex, throwIfAborted } from "./imageOps";

const EXT = /\.(png|jpe?g|webp)$/i;
const safeName = (id: string) => id.replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/^\.+/, "") || "card";
const stem = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

/**
 * Browser-only AssetImportAdapter: files come from the folder picker as File objects, nothing is read by path,
 * no server or network is involved. Owns every object URL it hands out; dispose() revokes them.
 */
export function createBrowserAdapter(): AssetImportAdapter {
  const files = new Map<string, File>();
  const previews = new Map<string, string>();
  const exportUrls: string[] = [];
  let cache: { sourceId: string; bitmap: ImageBitmap }[] = [];

  const releaseExport = () => { exportUrls.splice(0).forEach((url) => URL.revokeObjectURL(url)); };
  const clearCache = () => { cache.forEach((entry) => entry.bitmap.close()); cache = []; };
  async function bitmapFor(sourceId: string): Promise<ImageBitmap> {
    const hit = cache.find((entry) => entry.sourceId === sourceId);
    if (hit) return hit.bitmap;
    const file = files.get(sourceId);
    if (!file) throw new Error("Nguồn ảnh không còn trong phiên này. Hãy chọn lại folder.");
    const bitmap = await decodeImage(file);
    cache.unshift({ sourceId, bitmap });
    while (cache.length > 2) cache.pop()!.bitmap.close();
    return bitmap;
  }
  const requireComplete = (candidate: ImportCandidate) => {
    if (candidate.assetType === "artwork") throw new Error(`"${candidate.label}": artwork riêng cần composite bằng CardRenderer với data thẻ; adapter v1 chưa hỗ trợ. Đổi loại thành "Nguyên mặt thẻ" hoặc loại khỏi batch.`);
  };

  return {
    async inspect(picked, signal) {
      files.clear(); previews.forEach((url) => URL.revokeObjectURL(url)); previews.clear(); releaseExport(); clearCache();
      const sources: AssetSource[] = [], candidates: ImportCandidate[] = [], rejected: NonNullable<ImportDraft["rejected"]> = [];
      let batchBytes = 0;
      const sorted = [...picked].sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, "en", { numeric: true }));
      for (const file of sorted) {
        throwIfAborted(signal);
        const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
        if (!EXT.test(file.name)) { rejected.push({ relativePath, reason: "Không phải PNG/JPEG/WebP." }); continue; }
        if (file.size > LIMITS.maxFileBytes) { rejected.push({ relativePath, reason: `Vượt ${LIMITS.maxFileBytes / 1048576} MiB/file.` }); continue; }
        if (batchBytes + file.size > LIMITS.maxBatchBytes) { rejected.push({ relativePath, reason: `Vượt ${LIMITS.maxBatchBytes / 1048576} MiB/batch.` }); continue; }
        let bitmap: ImageBitmap | undefined;
        try {
          bitmap = await decodeImage(file);
          throwIfAborted(signal);
          if (bitmap.width * bitmap.height > LIMITS.maxPixels) { rejected.push({ relativePath, reason: `Vượt ${LIMITS.maxPixels / 1e6} MP (${bitmap.width}×${bitmap.height}).` }); continue; }
          const sha256 = await sha256Hex(await file.arrayBuffer());
          throwIfAborted(signal);
          const sourceId = `src-${String(sources.length + 1).padStart(3, "0")}-${sha256.slice(0, 8)}`;
          batchBytes += file.size; files.set(sourceId, file);
          sources.push({ sourceId, relativePath, sha256, width: bitmap.width, height: bitmap.height });
          const template = guessTemplate(bitmap.width, bitmap.height);
          const grid = proposeGrid(bitmap.width, bitmap.height, template);
          const base = { sourceId, side: "front" as const, assetType: "complete_card_front" as const, template, rotation: 0 as const, definitionId: null, variant: "default", reviewed: false, excluded: false, previewUrl: null, provenance: { origin: `Owner-selected local file: ${relativePath}`, rightsStatus: "UNVERIFIED" as const } };
          if (!grid) candidates.push({ ...base, candidateId: sourceId, label: stem(relativePath), crop: { x: 0, y: 0, width: bitmap.width, height: bitmap.height } });
          else for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
            const x0 = Math.round((c * bitmap.width) / grid.cols), x1 = Math.round(((c + 1) * bitmap.width) / grid.cols);
            const y0 = Math.round((r * bitmap.height) / grid.rows), y1 = Math.round(((r + 1) * bitmap.height) / grid.rows);
            candidates.push({ ...base, candidateId: `${sourceId}-r${r + 1}-c${c + 1}`, label: `${stem(relativePath)} r${r + 1}c${c + 1} (lưới ${grid.cols}×${grid.rows} đề xuất)`, crop: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
          }
        } catch (error) {
          if (signal.aborted) throw error;
          rejected.push({ relativePath, reason: `Không giải mã được ảnh${error instanceof Error ? `: ${error.message}` : "."}` });
        } finally { bitmap?.close(); }
      }
      throwIfAborted(signal);
      return { schema: 1, collection: "Imported cards", sources, candidates, rejected };
    },

    async preview(source, candidate, signal) {
      requireComplete(candidate);
      const bitmap = await bitmapFor(source.sourceId);
      throwIfAborted(signal);
      const { blob } = await renderFace(bitmap, candidate.crop, candidate.rotation, candidate.template);
      if (signal.aborted) throw new DOMException("Đã hủy thao tác.", "AbortError");
      const old = previews.get(candidate.candidateId); if (old) URL.revokeObjectURL(old);
      const url = URL.createObjectURL(blob); previews.set(candidate.candidateId, url);
      return url;
    },

    async export(draft: ImportDraft, mode: ExportMode, signal) {
      const issues = validateDraft(draft, mode, cardById);
      if (issues.length) throw new Error(`Draft còn ${issues.length} vấn đề: ${issues.slice(0, 3).map((i) => `${i.candidateId}: ${i.message}`).join(" | ")}`);
      const included = draft.candidates.filter((c) => !c.excluded);
      included.forEach(requireComplete);
      const entries: ZipEntry[] = [], assets: ExportedCardAsset[] = [], fileUrls: ExportResult["files"] = [], blobs: { id: string; blob: Blob }[] = [];
      const usedNames = new Set<string>();
      for (const candidate of included) {
        throwIfAborted(signal);
        const source = draft.sources.find((s) => s.sourceId === candidate.sourceId)!;
        const file = files.get(source.sourceId);
        if (!file) throw new Error("Nguồn ảnh không còn trong phiên này; chọn lại folder trước khi xuất.");
        // Re-hash the original bytes: the source must still be exactly what the draft was built from.
        if ((await sha256Hex(await file.arrayBuffer())) !== source.sha256) throw new Error(`Nguồn ${source.relativePath} đã đổi so với lúc import (hash khác).`);
        const bitmap = await bitmapFor(source.sourceId);
        if (bitmap.width !== source.width || bitmap.height !== source.height) throw new Error(`Kích thước ${source.relativePath} khác draft.`);
        const out = await renderFace(bitmap, candidate.crop, candidate.rotation, candidate.template);
        throwIfAborted(signal);
        // Independent decode of what we are about to ship.
        const check = await decodeImage(out.blob);
        const expected = canvasSize(candidate.template);
        const okSize = check.width === expected.width && check.height === expected.height; check.close();
        if (!okSize) throw new Error(`PNG của ${candidate.candidateId} sai kích thước.`);
        const bytes = new Uint8Array(await out.blob.arrayBuffer());
        const sha256 = await sha256Hex(bytes.buffer as ArrayBuffer);
        let name = safeName(candidate.candidateId), n = 1;
        while (usedNames.has(name.toLowerCase())) name = `${safeName(candidate.candidateId)}_${++n}`;
        usedNames.add(name.toLowerCase());
        const relativePath = `cards/${name}.png`;
        entries.push({ name: relativePath, data: bytes });
        blobs.push({ id: candidate.candidateId, blob: out.blob });
        assets.push({ candidateId: candidate.candidateId, definitionId: candidate.definitionId, variant: candidate.variant, inputType: candidate.assetType, renderMode: "complete_face", template: candidate.template, relativePath, sha256, width: out.width, height: out.height, contentRect: out.contentRect, sourceId: candidate.sourceId, crop: candidate.crop, rotation: candidate.rotation, provenance: candidate.provenance, rightsStatus: "UNVERIFIED" });
      }
      const usedSources = new Set(assets.map((a) => a.sourceId));
      const manifest: CardAssetManifest = { schema: 1, collection: draft.collection, mode, gameplaySupported: false, sources: draft.sources.filter((s) => usedSources.has(s.sourceId)), assets };
      const manifestText = JSON.stringify(manifest, null, 2);
      const readme = `# ${draft.collection}\n\nMode: ${mode}. ${assets.length} complete card faces (front only).\nRights: UNVERIFIED. gameplaySupported: false. Not for public hosting.\n\nInstall: unzip into assets/cards/packs/<pack-name>/ so that manifest.json and cards/ sit directly inside, then rebuild the web app.\n`;
      entries.unshift({ name: "manifest.json", data: new TextEncoder().encode(manifestText) }, { name: "README.md", data: new TextEncoder().encode(readme) });
      const archive = buildZip(entries);
      // Verify the archive we are about to hand out: every entry present, CRC good, paths safe.
      const listed = await readZip(archive);
      if (listed.length !== entries.length || listed.some((e) => !e.crcOk)) throw new Error("ZIP xuất ra không qua kiểm tra CRC.");
      throwIfAborted(signal);
      releaseExport();
      const manifestUrl = URL.createObjectURL(new Blob([manifestText], { type: "application/json" }));
      const archiveUrl = URL.createObjectURL(archive);
      exportUrls.push(manifestUrl, archiveUrl);
      for (const [i, asset] of assets.entries()) {
        const url = URL.createObjectURL(blobs[i].blob); exportUrls.push(url);
        fileUrls.push({ candidateId: asset.candidateId, url, width: asset.width, height: asset.height, sha256: asset.sha256 });
      }
      return { manifest, manifestUrl, archiveUrl, files: fileUrls };
    },

    dispose() {
      previews.forEach((url) => URL.revokeObjectURL(url)); previews.clear();
      releaseExport(); clearCache(); files.clear();
    },
  };
}
