import test from "node:test";
import assert from "node:assert/strict";
import { validateDraft } from "../../apps/web/src/asset-import/contract.ts";
import type { ImportDraft } from "../../apps/web/src/asset-import/contract.ts";

const definitions = new Map([["hero-1", { kind: "hero" }], ["monster-1", { kind: "monster" }]]);
function draft(): ImportDraft {
  return { schema: 1, collection: "test", sources: [{ sourceId: "s1", relativePath: "front.jpg", sha256: "a".repeat(64), width: 3600, height: 5400 }], candidates: [{ candidateId: "c1", sourceId: "s1", label: "Front", previewUrl: null, assetType: "complete_card_front", side: "front", template: "poker", crop: { x: 1320, y: 304, width: 960, height: 664 }, rotation: 270, definitionId: null, variant: "default", reviewed: true, excluded: false, provenance: { origin: "owner folder", rightsStatus: "FAN_MADE_NON_COMMERCIAL" } }] };
}
const codes = (input: ImportDraft, mode: "preview" | "mapped" = "preview") => validateDraft(input, mode, definitions).map((issue) => issue.code);
test("preview permits unmapped expansion; mapped export requires known ID", () => {
  assert.deepEqual(codes(draft()), []);
  assert.ok(codes(draft(), "mapped").includes("definition"));
});
test("rejects out-of-bounds and fractional source crop before rotation", () => {
  for (const crop of [{ x: 3599, y: 0, width: 2, height: 5 }, { x: 0.5, y: 0, width: 10, height: 10 }]) {
    const input = draft(); input.candidates[0].crop = crop;
    assert.ok(codes(input).includes("crop_bounds"));
  }
});
test("raw artwork cannot masquerade as a complete front in preview export", () => {
  const input = draft(); input.candidates[0].assetType = "artwork";
  assert.deepEqual(codes(input), ["composite_data"]);
  input.candidates[0].definitionId = "hero-1";
  assert.deepEqual(codes(input), []);
});
test("backs, missing hashes and unreviewed candidates block export", () => {
  const input = draft(); input.sources[0].sha256 = null; input.candidates[0].side = "back"; input.candidates[0].reviewed = false;
  assert.deepEqual(codes(input).sort(), ["back_excluded", "not_reviewed", "source_hash"].sort());
});
test("rejects mapping collision; alternate variants remain explicit", () => {
  const input = draft(); input.candidates[0].definitionId = "hero-1";
  input.candidates.push({ ...input.candidates[0], candidateId: "c2" });
  assert.ok(codes(input, "mapped").includes("mapping_conflict"));
  input.candidates[1].variant = "alternate";
  assert.deepEqual(codes(input, "mapped"), []);
});
test("mapped template follows definition kind; excluded backs do not leak", () => {
  const input = draft(); input.candidates[0].definitionId = "monster-1";
  assert.ok(codes(input, "mapped").includes("template_mismatch"));
  input.candidates[0].template = "tarot";
  input.candidates.push({ ...input.candidates[0], candidateId: "back", side: "back", excluded: true });
  assert.deepEqual(codes(input, "mapped"), []);
});
test("rejects empty batch and duplicate candidate/source IDs", () => {
  const input = draft(); input.candidates[0].excluded = true;
  assert.deepEqual(codes(input), ["empty_batch"]);
  input.candidates[0].excluded = false;
  input.candidates.push({ ...input.candidates[0] }); input.sources.push({ ...input.sources[0] });
  assert.ok(codes(input).includes("duplicate_candidate"));
  assert.ok(codes(input).includes("duplicate_source"));
});
