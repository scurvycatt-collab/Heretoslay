import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import {
  artBoxesFromSpec, buildCardIndex, layoutKeyFor, matchFile, normalizeKey, parseCards, run,
} from "../tools/import-card-art.ts";

const root = path.resolve(import.meta.dirname, "..");
const cardsJson = JSON.parse(await readFile(path.join(root, "apps/worker/src/content/base-cards.json"), "utf8"));
const spec = JSON.parse(await readFile(path.join(root, "docs/contracts/CARD_TEMPLATE_SPEC.json"), "utf8"));
const { cards } = parseCards(cardsJson);
const index = buildCardIndex(cards);

test("normalizeKey slugifies names but keeps id dots", () => {
  assert.equal(normalizeKey("Bad Axe"), "bad-axe");
  assert.equal(normalizeKey("bad_axe "), "bad-axe");
  assert.equal(normalizeKey("HTS.Base.V1.Hero.Bad-Axe"), "hts.base.v1.hero.bad-axe");
});

test("file names match by full id, kind.slug, slug and card name", () => {
  for (const name of ["hts.base.v1.hero.bad-axe.png", "hero.bad-axe.jpg", "bad-axe.webp", "Bad Axe.png"]) {
    const m = matchFile(name, index);
    assert.ok(m.ok, name);
    assert.equal(m.definitionId, "hts.base.v1.hero.bad-axe");
  }
});

test("unmatched names get a did-you-mean suggestion", () => {
  const m = matchFile("bad-axxe.png", index);
  assert.equal(m.ok, false);
  assert.ok(!m.ok && m.candidates.includes("hts.base.v1.hero.bad-axe"));
});

test("every base card kind has an art box in CARD_TEMPLATE_SPEC", () => {
  const boxes = artBoxesFromSpec(spec);
  for (const card of cards) assert.ok(boxes.has(layoutKeyFor(card.kind)), card.kind);
  assert.deepEqual(boxes.get("party_leader"), { x: 41, y: 41, w: 745, h: 1176 });
});

test("run() crops to the art box, skips junk, and never touches base-cards.json", async () => {
  const before = await readFile(path.join(root, "apps/worker/src/content/base-cards.json"), "utf8");
  const dir = await mkdtemp(path.join(tmpdir(), "hts-art-"));
  const input = path.join(dir, "raw");
  const out = path.join(dir, "out");
  await mkdir(input);
  try {
    await sharp({ create: { width: 1200, height: 700, channels: 3, background: "#a33" } }).png().toFile(path.join(input, "dracos.png"));
    await writeFile(path.join(input, "hts.base.v1.hero.bad-axe.png"), "not an image");
    await writeFile(path.join(input, "readme.txt"), "junk");

    const log = console.log;
    console.log = () => {};
    let code: number;
    try { code = await run([input, "--out", out]); } finally { console.log = log; }

    assert.equal(code, 2, "a corrupt image yields exit 2");
    const manifest = JSON.parse(await readFile(path.join(out, "card-art-manifest.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.cards), ["hts.base.v1.monster.dracos"]);
    const entry = manifest.cards["hts.base.v1.monster.dracos"];
    assert.match(entry.artUrl, /^\/assets\/cards\/hts\.base\.v1\.monster\.dracos\.webp\?v=[0-9a-f]{10}$/);
    const meta = await sharp(path.join(out, entry.file)).metadata();
    assert.deepEqual([meta.width, meta.height, meta.format], [745, 824, "webp"]);
    assert.equal(await readFile(path.join(root, "apps/worker/src/content/base-cards.json"), "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
