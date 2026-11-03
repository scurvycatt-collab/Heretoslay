import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import {
  buildZip, containRect, coverCrop, exportFileName, findSheetPreset, isSafeArchivePath, parseDraftJson, parsePngHeader,
  proposeCandidates, readZipEntries, renderPlan, resumeDraft, sniffImage,
} from "../apps/web/src/asset-import/adapters/core.ts";
import { validateDraft, type ImportDraft } from "../apps/web/src/asset-import/contract.ts";

const root = path.resolve(import.meta.dirname, "..");
const definitions = new Map([["hts.base.v1.hero.bad-axe", { kind: "hero" }]]);
const sha = (c: string) => c.repeat(64);

test("sniffImage decides by content, not extension", async () => {
  const base = sharp({ create: { width: 37, height: 21, channels: 3, background: "#123456" } });
  for (const [fmt, buf] of [
    ["png", await base.clone().png().toBuffer()],
    ["jpeg", await base.clone().jpeg().toBuffer()],
    ["webp", await base.clone().webp().toBuffer()],
    ["webp", await base.clone().webp({ lossless: true }).toBuffer()],
  ] as const) {
    assert.deepEqual(sniffImage(new Uint8Array(buf)), { format: fmt, width: 37, height: 21 }, fmt);
  }
  const enc = new TextEncoder();
  assert.equal(sniffImage(enc.encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniffImage(enc.encode("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffImage(new Uint8Array(0)), null);
});

test("geometry: contain keeps aspect inside the template, cover stays inside the source", () => {
  // Kickstarter poker cell 960×664 rotated 270 → 664×960 into 745×1040
  const plan = renderPlan({ assetType: "complete_card_front", template: "poker", crop: { x: 196, y: 304, width: 960, height: 664 }, rotation: 270 });
  assert.deepEqual(plan.canvas, { width: 745, height: 1040 });
  assert.deepEqual(plan.contentRect, { x: 13, y: 0, width: 719, height: 1040 });
  const tarot = renderPlan({ assetType: "complete_card_front", template: "tarot", crop: { x: 356, y: 75, width: 1417, height: 827 }, rotation: 270 });
  assert.deepEqual(tarot.contentRect, { x: 0, y: 0, width: 827, height: 1417 });
  assert.deepEqual(containRect(100, 100, 745, 1040), { x: 0, y: 147, width: 745, height: 745 });
  const c = coverCrop(1200, 700, 745, 824, "centre");
  assert.ok(c.x >= 0 && c.x + c.width <= 1200 && c.height === 700);
});

test("print-sheet presets reproduce every reference crop of the Kickstarter pack", async () => {
  const ref = JSON.parse(await readFile(path.join(root, "assets/cards/kickstarter-preview/manifest.json"), "utf8"));
  const sheetPath = new Map<string, string>(ref.sheets.map((s: { id: string; path: string }) => [s.id, s.path.replace(/\\/g, "/").split("/").slice(-2).join("/")]));
  let matched = 0;
  for (const card of ref.cards as Array<{ sheet: string; row: number; column: number; crop: object; rotationDegrees: number }>) {
    const preset = findSheetPreset(3600, 5400, sheetPath.get(card.sheet)!);
    assert.ok(preset, card.sheet);
    const cell = preset.cells.find((x) => x.row === card.row && x.column === card.column);
    assert.ok(cell, `${card.sheet} r${card.row} c${card.column}`);
    assert.deepEqual(cell.crop, card.crop);
    assert.equal(preset.rotation, card.rotationDegrees);
    matched++;
  }
  assert.equal(matched, 69);
  const counts = (["01", "02", "03", "04", "05"] as const).map((id) => findSheetPreset(3600, 5400, sheetPath.get(id)!)!.cells.length);
  assert.deepEqual(counts, [18, 18, 18, 12, 12], "grid proposals; blanks are excluded by pixel check, not hardcoded");
});

test("proposals never confirm ids from names; backs are excluded", () => {
  const src = (relativePath: string, width = 745, height = 1040) => ({ sourceId: "s", relativePath, sha256: sha("a"), width, height });
  const [exact] = proposeCandidates(src("x/hts.base.v1.hero.bad-axe.png"), definitions);
  assert.equal(exact.definitionId, "hts.base.v1.hero.bad-axe");
  assert.equal(exact.reviewed, false);
  const [slug] = proposeCandidates(src("x/bad-axe.png"), definitions);
  assert.equal(slug.definitionId, null);
  const [back] = proposeCandidates(src("x/Poker - Back.jpg"), definitions);
  assert.equal(back.side, "back");
  assert.equal(back.excluded, true);
  const [land] = proposeCandidates(src("x/card.png", 1040, 745), definitions);
  assert.equal(land.rotation, 90);
  const [art] = proposeCandidates(src("x/art.png", 1000, 1000), definitions);
  assert.equal(art.assetType, "artwork");
  const sheet = proposeCandidates(src("Print 04 - Tarot Cards/Tarot - Front.jpg", 3600, 5400), definitions);
  assert.equal(sheet.length, 12);
  assert.ok(sheet.every((c) => c.template === "tarot" && c.rotation === 270 && /^[a-z0-9-]+$/.test(c.candidateId)));
});

test("ZIP: safe paths only, round-trips, and system unzip accepts it", async () => {
  for (const bad of ["../x.png", "/abs.png", "C:/x.png", "a\\b.png", "a//b", "a/./b", ""]) assert.equal(isSafeArchivePath(bad), false, bad);
  assert.throws(() => exportFileName("../evil"), /không an toàn/);
  const png = new Uint8Array(await sharp({ create: { width: 745, height: 1040, channels: 3, background: "#10161b" } }).png().toBuffer());
  assert.deepEqual(parsePngHeader(png), { width: 745, height: 1040 });
  const zip = buildZip([{ path: "fronts/a.png", data: png }, { path: "manifest.json", data: new TextEncoder().encode("{}") }]);
  const entries = readZipEntries(zip);
  assert.deepEqual(entries.map((e) => [e.path, e.crcOk, e.data.length]), [["fronts/a.png", true, png.length], ["manifest.json", true, 2]]);
  assert.throws(() => buildZip([{ path: "../x", data: png }]), /không an toàn/);
  assert.throws(() => buildZip([{ path: "a", data: png }, { path: "a", data: png }]), /Trùng/);
  const dir = await mkdtemp(path.join(tmpdir(), "zip-"));
  try {
    await writeFile(path.join(dir, "t.zip"), zip);
    const out = execFileSync("python3", ["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(','.join(z.namelist()))", path.join(dir, "t.zip")]).toString().trim();
    assert.equal(out, "fronts/a.png,manifest.json");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("draft JSON boundary + resume by SHA-256", () => {
  const saved: ImportDraft = {
    schema: 1, collection: "Saved",
    sources: [{ sourceId: "old-1", relativePath: "A/sheet.jpg", sha256: sha("b"), width: 10, height: 10 }, { sourceId: "old-2", relativePath: "A/gone.jpg", sha256: sha("c"), width: 10, height: 10 }],
    candidates: [{ candidateId: "kept", sourceId: "old-1", label: "k", previewUrl: "blob:stale", assetType: "complete_card_front", side: "front", template: "poker", crop: { x: 1, y: 1, width: 5, height: 5 }, rotation: 0, definitionId: null, variant: "default", reviewed: true, excluded: false, provenance: { origin: "o", rightsStatus: "FAN_MADE_NON_COMMERCIAL" } }],
  };
  const parsed = parseDraftJson(JSON.parse(JSON.stringify(saved)));
  assert.equal(parsed.candidates[0].previewUrl, null, "blob URLs never survive");
  assert.throws(() => parseDraftJson({ ...saved, sources: [{ ...saved.sources[0], relativePath: "C:/Users/me/a.jpg" }] }), /tương đối/);
  assert.throws(() => parseDraftJson({ ...saved, candidates: [{ ...saved.candidates[0], provenance: { origin: "o", rightsStatus: "VERIFIED" } }] }), /FAN_MADE_NON_COMMERCIAL/);
  const inspected: ImportDraft = {
    schema: 1, collection: "New", sources: [{ sourceId: "src-new", relativePath: "B/renamed.jpg", sha256: sha("b"), width: 10, height: 10 }],
    candidates: [{ ...saved.candidates[0], candidateId: "fresh", sourceId: "src-new", reviewed: false }],
  };
  const r = resumeDraft(parsed, inspected);
  assert.equal(r.matched, 1);
  assert.deepEqual(r.missing, ["A/gone.jpg"]);
  assert.deepEqual(r.draft.candidates.map((c) => [c.candidateId, c.sourceId, c.reviewed]), [["kept", "src-new", true]]);
  assert.deepEqual(validateDraft(r.draft, "preview", definitions), []);
});
