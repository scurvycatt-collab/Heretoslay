import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createCardFaceResolver } from "../../apps/web/src/cards/cardFaceResolver.ts";

const options = { placeholderUrl: "/placeholder.svg", assetBaseUrl: "https://example.test/packs/base/" };
const face = { definitionId: "hero-1", candidateId: "crop-1", variant: "default", renderMode: "complete_face", relativePath: "fronts/hero-1.png" };
const manifest = (assets: unknown[]) => ({ schema: 1, mode: "mapped", assets });

test("resolves mapped definitionId and returns image placeholder for missing IDs", () => {
  const resolve = createCardFaceResolver(manifest([face]), options);
  assert.equal(resolve("hero-1"), "https://example.test/packs/base/fronts/hero-1.png");
  assert.equal(resolve("crop-1"), resolve("hero-1"));
  for (const id of ["missing", "", "instance:hero-1", "__proto__"]) assert.equal(resolve(id), options.placeholderUrl);
});
test("bundled URL wins; missing bundled image cannot create a broken path", () => {
  const resolve = createCardFaceResolver(manifest([face, { ...face, definitionId: "hero-2", candidateId: "crop-2", relativePath: "fronts/missing.png" }]), { ...options, assetUrls: { "fronts/hero-1.png": "/assets/hero-1-HASH.png" } });
  assert.equal(resolve("hero-1"), "/assets/hero-1-HASH.png");
  assert.equal(resolve("hero-2"), options.placeholderUrl);
});
test("all actual 69 PNGs resolve by previewId without invented base mappings", () => {
  const root = new URL("../../assets/cards/expansions/kickstarter/preview/webgame/", import.meta.url);
  const data = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
  const urls = Object.fromEntries(data.cards.map((card: { src: string }) => {
    assert.ok(existsSync(new URL(card.src, root)));
    return [card.src, `https://example.test/kickstarter/${card.src}`];
  }));
  const resolve = createCardFaceResolver(data, { placeholderUrl: options.placeholderUrl, assetUrls: urls });
  assert.equal(data.cards.length, 69);
  for (const card of data.cards) assert.equal(resolve(card.previewId), urls[card.src]);
  assert.equal(resolve("hts.base.v1.hero.hoodwink"), options.placeholderUrl);
});
test("rejects raw artwork, backs, excluded assets and unsafe paths", () => {
  for (const patch of [{ renderMode: "artwork" }, { side: "back" }, { excluded: true }, { relativePath: "../secret.png" }, { relativePath: "/outside.png" }, { relativePath: "https://other.test/card.png" }, { relativePath: "fronts/%2e%2e/card.png" }]) {
    assert.equal(createCardFaceResolver(manifest([{ ...face, ...patch }]), options)("hero-1"), options.placeholderUrl);
  }
});
test("ambiguous defaults fall back; alternate cannot override default by order", () => {
  assert.equal(createCardFaceResolver(manifest([face, { ...face, relativePath: "fronts/second.png" }]), options)("hero-1"), options.placeholderUrl);
  const alternate = { ...face, variant: "alternate", relativePath: "fronts/alternate.png" };
  for (const assets of [[alternate, face], [face, alternate]]) assert.equal(createCardFaceResolver(manifest(assets), options)("hero-1"), "https://example.test/packs/base/fronts/hero-1.png");
});
test("canonical preview pack does not install a gameplay mapping", () => {
  const resolve = createCardFaceResolver({ ...manifest([face]), mode: "preview" }, options);
  assert.equal(resolve("hero-1"), options.placeholderUrl);
  assert.equal(resolve("crop-1"), "https://example.test/packs/base/fronts/hero-1.png");
});
test("malformed/unsupported manifests and invalid base gracefully fall back", () => {
  for (const value of [null, {}, { schema: 2, assets: [face] }, { schema: 1, assets: [null, "bad"] }]) assert.equal(createCardFaceResolver(value, options)("hero-1"), options.placeholderUrl);
  assert.equal(createCardFaceResolver(manifest([face]), { ...options, assetBaseUrl: "not-a-url" })("hero-1"), options.placeholderUrl);
});

test("artwork entries register only from mapped packs and never as faces", async () => {
  const { createCardArtResolver, createCardFaceResolver } = await import("../../apps/web/src/cards/cardFaceResolver.ts");
  const entry = { candidateId: "c1", definitionId: "hts.base.v1.hero.hopper", variant: "default", renderMode: "artwork", relativePath: "cards/c1.png" };
  const urls = { "cards/c1.png": "blob:art" };
  const mapped = { schema: 1, mode: "mapped", assets: [entry] };
  assert.equal(createCardArtResolver(mapped, { assetUrls: urls })("hts.base.v1.hero.hopper"), "blob:art");
  assert.equal(createCardArtResolver({ ...mapped, mode: "preview" }, { assetUrls: urls })("hts.base.v1.hero.hopper"), undefined);
  assert.equal(createCardArtResolver({ ...mapped, assets: [entry, { ...entry, candidateId: "c2" }] }, { assetUrls: urls })("hts.base.v1.hero.hopper"), undefined, "ambiguous → none");
  assert.equal(createCardFaceResolver(mapped, { placeholderUrl: "ph", assetUrls: urls })("hts.base.v1.hero.hopper"), "ph", "artwork is not a complete face");
});
