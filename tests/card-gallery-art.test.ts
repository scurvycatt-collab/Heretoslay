import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vietnamese cards crop artwork from a complete English face when no standalone art exists", async () => {
  const source = await readFile(new URL("../apps/web/src/cards/CardRenderer.tsx", import.meta.url), "utf8");
  assert.match(source, /const art = importedArt \?\? \(completeFace !== CARD_FACE_PLACEHOLDER \? completeFace : undefined\)/);
  assert.match(source, /const faceCrop: FaceCrop \| undefined = !importedArt && completeFace !== CARD_FACE_PLACEHOLDER/);
  assert.match(source, /x=\{x - faceCrop\.x \* sx\}/);
  assert.equal((source.match(/faceCrop=\{faceCrop\}/g) ?? []).length, 5);
});
