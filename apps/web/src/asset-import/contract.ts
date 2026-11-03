/** UI/importer boundary only. Card mechanics and protocol data remain read-only. */
/** Artwork rights policy (ADR-004, owner 2026-11-03): fan-made, non-commercial, watermarks kept. Not a licence. */
export const ARTWORK_RIGHTS_STATUS = "FAN_MADE_NON_COMMERCIAL" as const;
export type ArtworkRightsStatus = typeof ARTWORK_RIGHTS_STATUS;
/** DMCA / takedown requests are handled immediately via this address (ADR-004). */
export const TAKEDOWN_CONTACT = "scurvycatt@gmail.com";
export type AssetType = "complete_card_front" | "artwork";
export type Template = "poker" | "tarot";
export type QuarterTurn = 0 | 90 | 180 | 270;
export interface AssetSource {
  sourceId: string;
  relativePath: string;
  sha256: string | null;
  width: number;
  height: number;
}
export interface ImportCandidate {
  candidateId: string;
  sourceId: string;
  label: string;
  previewUrl: string | null;
  assetType: AssetType;
  side: "front" | "back";
  template: Template;
  crop: { x: number; y: number; width: number; height: number };
  rotation: QuarterTurn;
  definitionId: string | null;
  variant: string;
  reviewed: boolean;
  excluded: boolean;
  provenance: { origin: string; rightsStatus: ArtworkRightsStatus };
}
/** A file the adapter could not turn into a source; shown separately, never drops the batch. */
export interface RejectedFile { relativePath: string; code: string; message: string }
export interface ImportDraft {
  schema: 1;
  collection: string;
  sources: AssetSource[];
  candidates: ImportCandidate[];
  /** Delta 2026-11-03 (Claude): per-file inspect errors. Optional; ignored by validateDraft. */
  rejected?: RejectedFile[];
}
export type ExportMode = "preview" | "mapped";
export interface ImportIssue { candidateId: string; code: string; message: string }
export interface ExportedCardAsset {
  candidateId: string;
  definitionId: string | null;
  variant: string;
  inputType: AssetType;
  renderMode: "complete_face";
  template: Template;
  relativePath: string;
  sha256: string;
  width: number;
  height: number;
  contentRect: ImportCandidate["crop"];
  sourceId: string;
  crop: ImportCandidate["crop"];
  rotation: QuarterTurn;
  provenance: ImportCandidate["provenance"];
  rightsStatus: ArtworkRightsStatus;
}
export interface CardAssetManifest {
  schema: 1;
  collection: string;
  mode: ExportMode;
  gameplaySupported: false;
  rightsStatus: ArtworkRightsStatus;
  takedownContact: string;
  sources: AssetSource[];
  assets: ExportedCardAsset[];
}
export interface ExportResult {
  manifest: CardAssetManifest;
  manifestUrl: string;
  archiveUrl: string;
  files: { candidateId: string; url: string; width: number; height: number; sha256: string }[];
}
export interface ExportProgress { done: number; total: number; label: string }
/** Claude supplies one adapter. URLs are owned by it; dispose revokes object URLs. */
export interface AssetImportAdapter {
  inspect(files: File[], signal: AbortSignal): Promise<ImportDraft>;
  preview(source: AssetSource, candidate: ImportCandidate, signal: AbortSignal): Promise<string>;
  /** Delta 2026-11-03 (Claude): optional progress callback. */
  export(draft: ImportDraft, mode: ExportMode, signal: AbortSignal, onProgress?: (progress: ExportProgress) => void): Promise<ExportResult>;
  /** Delta 2026-11-03 (Claude): downscaled upright view of the whole source, for the crop overlay. */
  sourcePreview?(source: AssetSource, signal: AbortSignal): Promise<{ url: string; scale: number }>;
  /** Releases URLs/caches. The adapter stays usable afterwards (React StrictMode re-mounts). */
  dispose(): void;
}

export function validateDraft(draft: ImportDraft, mode: ExportMode, definitions: ReadonlyMap<string, { kind: string }>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const used = new Set<string>();
  const candidateIds = new Set<string>();
  const sourceIds = new Set<string>();
  const duplicateSources = new Set<string>();
  for (const source of draft.sources) {
    if (sourceIds.has(source.sourceId)) duplicateSources.add(source.sourceId);
    sourceIds.add(source.sourceId);
  }
  const included = draft.candidates.filter((card) => !card.excluded);
  if (!included.length) issues.push({ candidateId: "batch", code: "empty_batch", message: "Chưa có thẻ được chọn để xuất." });
  for (const card of included) {
    const add = (code: string, message: string) => issues.push({ candidateId: card.candidateId, code, message });
    if (!card.candidateId || candidateIds.has(card.candidateId)) add("duplicate_candidate", "candidateId phải có giá trị và duy nhất.");
    candidateIds.add(card.candidateId);
    const source = draft.sources.find((entry) => entry.sourceId === card.sourceId);
    if (!source) add("missing_source", "Không tìm thấy nguồn ảnh.");
    else {
      if (duplicateSources.has(source.sourceId)) add("duplicate_source", "sourceId trùng trong batch.");
      if (!source.sha256 || !/^[a-f0-9]{64}$/i.test(source.sha256)) add("source_hash", "Nguồn chưa có SHA-256 hợp lệ.");
      const { x, y, width, height } = card.crop;
      if (![source.width, source.height, x, y, width, height].every(Number.isInteger) || source.width <= 0 || source.height <= 0 || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > source.width || y + height > source.height) add("crop_bounds", "Vùng cắt phải nằm trong ảnh nguồn, theo pixel trước khi xoay.");
    }
    if (![0, 90, 180, 270].includes(card.rotation)) add("rotation", "Chỉ nhận góc xoay 0/90/180/270° theo chiều kim đồng hồ.");
    if (!["complete_card_front", "artwork"].includes(card.assetType)) add("asset_type", "Loại asset không hợp lệ.");
    if (!["poker", "tarot"].includes(card.template)) add("template", "Khổ thẻ không hợp lệ.");
    if (card.side !== "front") add("back_excluded", "Batch hiện tại chỉ xuất front; hãy loại back khỏi batch.");
    if (!card.reviewed) add("not_reviewed", "Cần duyệt vùng cắt và chiều thẻ.");
    if (!card.provenance.origin.trim()) add("provenance", "Cần ghi nguồn/provenance.");
    if (card.provenance.rightsStatus !== ARTWORK_RIGHTS_STATUS) add("rights", `Importer không được tự đổi trạng thái quyền (phải là ${ARTWORK_RIGHTS_STATUS}).`);
    if (!card.variant.trim()) add("variant", "Variant phải có giá trị, ví dụ default hoặc alternate.");
    if (mode === "mapped" || card.assetType === "artwork") {
      const definition = card.definitionId ? definitions.get(card.definitionId) : undefined;
      if (!definition) add(card.assetType === "artwork" ? "composite_data" : "definition", card.assetType === "artwork" ? "Artwork cần definitionId/data trước khi composite thành mặt thẻ." : "Chọn definitionId có trong catalog hiện hành.");
      else {
        const expected = ["party_leader", "monster"].includes(definition.kind) ? "tarot" : "poker";
        if (card.template !== expected) add("template_mismatch", `Definition này dùng khổ ${expected}.`);
        const key = `${card.definitionId}|${card.variant}|${card.assetType}`;
        if (used.has(key)) add("mapping_conflict", "Trùng definitionId + variant + loại asset; cần chọn bản thay thế rõ ràng.");
        used.add(key);
      }
    }
  }
  return issues;
}
