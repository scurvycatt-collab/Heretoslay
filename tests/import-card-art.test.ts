import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import {
  MANIFEST_NAME, artBoxesFromSpec, buildCardIndex, containRect, coverCrop, layoutKeyFor, mappingStatusFor,
  matchFile, normalizeKey, parseCards, run,
} from "../tools/import-card-art.ts";

const root = path.resolve(import.meta.dirname, "..");
const cardsPath = path.join(root, "apps/worker/src/content/base-cards.json");
const cardsJson = JSON.parse(await readFile(cardsPath, "utf8"));
const spec = JSON.parse(await readFile(path.join(root, "docs/contracts/CARD_TEMPLATE_SPEC.json"), "utf8"));
const { cards } = parseCards(cardsJson);
const index = buildCardIndex(cards);

async function quietRun(argv: string[]): Promise<number> {
  const log = console.log;
  console.log = () => {};
  try { return await run(argv); } finally { console.log = log; }
}

async function withTmp(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "hts-art-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

const png = (w: number, h: number, file: string) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#a33" } }).png().toFile(file);

test("normalizeKey slugifies names but keeps id dots", () => {
  assert.equal(normalizeKey("Bad Axe"), "bad-axe");
  assert.equal(normalizeKey("bad_axe "), "bad-axe");
  assert.equal(normalizeKey("HTS.Base.V1.Hero.Bad-Axe"), "hts.base.v1.hero.bad-axe");
});

test("only a full definitionId is a confirmed mapping; slug/name are proposals", () => {
  const cases: Array<[string, string]> = [
    ["hts.base.v1.hero.bad-axe.png", "confirmed"],
    ["hero.bad-axe.jpg", "proposed"],
    ["bad-axe.webp", "proposed"],
    ["Bad Axe.png", "proposed"],
  ];
  for (const [name, status] of cases) {
    const m = matchFile(name, index);
    assert.ok(m.ok, name);
    assert.equal(m.definitionId, "hts.base.v1.hero.bad-axe");
    assert.equal(mappingStatusFor(m.method), status, name);
  }
  const typo = matchFile("bad-axxe.png", index);
  assert.ok(!typo.ok && typo.candidates.includes("hts.base.v1.hero.bad-axe"));
});

test("every base card kind has an integer art box in CARD_TEMPLATE_SPEC", () => {
  const boxes = artBoxesFromSpec(spec);
  for (const card of cards) assert.ok(boxes.has(layoutKeyFor(card.kind)), card.kind);
  assert.deepEqual(boxes.get("party_leader"), { x: 41, y: 41, w: 745, h: 1176 });
});

test("coverCrop / containRect stay inside the source and keep aspect", () => {
  assert.deepEqual(coverCrop(1200, 700, 745, 824, "centre"), { x: 283, y: 0, w: 633, h: 700 });
  assert.deepEqual(coverCrop(1200, 700, 745, 824, "left"), { x: 0, y: 0, w: 633, h: 700 });
  assert.deepEqual(coverCrop(500, 2000, 545, 545, "top"), { x: 0, y: 0, w: 500, h: 500 });
  assert.deepEqual(containRect(1200, 600, 545, 545), { x: 0, y: 136, w: 545, h: 273 });
  for (const [w, h] of [[1, 1], [7, 3000], [4000, 9]]) {
    const c = coverCrop(w, h, 645, 550, "bottom");
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= w && c.y + c.h <= h && c.w > 0 && c.h > 0, `${w}x${h}`);
  }
});

test("run() writes a verified artwork pack into --out, never touching sources or base-cards.json", async () => {
  const cardsBefore = await readFile(cardsPath, "utf8");
  await withTmp(async (dir) => {
    const input = path.join(dir, "raw");
    const out = path.join(dir, "out");
    await mkdir(path.join(input, "sub"), { recursive: true });
    await png(1200, 700, path.join(input, "hts.base.v1.monster.dracos.png"));
    await png(300, 900, path.join(input, "sub", "Bad Axe.png"));
    await writeFile(path.join(input, "hts.base.v1.item.bard-mask.png"), "not an image");
    await writeFile(path.join(input, "hts.base.v1.magic.critical-boost.png"), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await writeFile(path.join(input, "readme.txt"), "junk");
    const sourcesBefore = await readdir(input, { recursive: true });

    const code = await quietRun([input, "--out", out]);
    assert.equal(code, 2, "corrupt / non-raster images yield exit 2");

    const manifest = JSON.parse(await readFile(path.join(out, MANIFEST_NAME), "utf8"));
    assert.equal(manifest.schema, 2);
    assert.equal(manifest.rightsStatus, "UNVERIFIED");
    assert.equal(manifest.gameplaySupported, false);
    assert.deepEqual(Object.keys(manifest.cards), ["hts.base.v1.hero.bad-axe", "hts.base.v1.monster.dracos"]);

    const dracos = manifest.cards["hts.base.v1.monster.dracos"];
    assert.equal(dracos.mappingStatus, "confirmed");
    assert.equal(dracos.renderMode, "artwork");
    assert.equal(dracos.artUrl, null, "not under web public/ → no URL");
    assert.deepEqual(dracos.crop, { x: 283, y: 0, w: 633, h: 700 });
    assert.equal(dracos.source.relativePath, "hts.base.v1.monster.dracos.png");
    assert.match(dracos.source.sha256, /^[0-9a-f]{64}$/);
    const meta = await sharp(path.join(out, dracos.relativePath)).metadata();
    assert.deepEqual([meta.width, meta.height, meta.format], [745, 824, "png"]);

    const axe = manifest.cards["hts.base.v1.hero.bad-axe"];
    assert.equal(axe.mappingStatus, "proposed");
    assert.equal(axe.source.relativePath, "sub/Bad Axe.png");

    assert.deepEqual(await readdir(input, { recursive: true }), sourcesBefore);
  });
  assert.equal(await readFile(cardsPath, "utf8"), cardsBefore);
});

test("limits and --exact-only are enforced as errors, not silent downscales", async () => {
  await withTmp(async (dir) => {
    const input = path.join(dir, "raw");
    await mkdir(input);
    await png(2000, 2000, path.join(input, "hts.base.v1.monster.dracos.png"));
    await png(100, 100, path.join(input, "bad-axe.png"));
    const out = path.join(dir, "out");
    assert.equal(await quietRun([input, "--out", out, "--max-megapixels", "1", "--exact-only"]), 2);
    await assert.rejects(readFile(path.join(out, MANIFEST_NAME)), "nothing imported → no manifest");
    await assert.rejects(quietRun([input, "--out", out, "--max-batch-mib", "0.001"]), /batch is .* > limit/);
    await assert.rejects(quietRun([input, "--out", input]), /must not be the input dir/);
  });
});
