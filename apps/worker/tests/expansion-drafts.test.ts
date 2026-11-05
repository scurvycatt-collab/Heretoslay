import assert from "node:assert/strict";
import test from "node:test";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";
import { EXPANSION_SET_IDS, GAME_SET_CATALOG } from "../src/content/set-catalog.ts";

const bySet = (key: string) => EXPANSION_FACE_DRAFTS.filter((face) => face.setKey === key);

test("84 reviewed faces: WD 35, BN 33, DS 16, unique scoped IDs", () => {
  assert.deepEqual(
    [bySet("warriorsDruids").length, bySet("berserkersNecromancers").length, bySet("dragonSorcerer").length],
    [35, 33, 16],
  );
  assert.equal(new Set(EXPANSION_FACE_DRAFTS.map((face) => face.definitionId)).size, 84);
  for (const face of EXPANSION_FACE_DRAFTS) {
    const prefix = `${EXPANSION_SET_IDS[face.setKey]}.`;
    assert.ok(face.definitionId.startsWith(prefix), face.definitionId);
    assert.match(face.definitionId.slice(prefix.length), /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
    assert.match(face.sha256, /^[0-9a-f]{64}$/);
  }
});

test("E02: exactly the eight reviewed Heroes carry the printed two-Item trait", () => {
  const two = EXPANSION_FACE_DRAFTS.filter((face) => face.twoItemSlots).map((face) => face.canonicalName).sort();
  assert.deepEqual(two, [
    "Agile Dagger", "Critical Fang", "Gruesome Gladiator", "Looting Lupo",
    "Meowntain", "Rabid Beast", "Tenacious Timber", "Vicious Wildcat",
  ]);
  assert.ok(EXPANSION_FACE_DRAFTS.filter((face) => face.twoItemSlots).every((face) => face.kind === "hero"));
});

test("drafts carry no quantity and are not in the live registry", () => {
  assert.ok(EXPANSION_FACE_DRAFTS.every((face) => !("physicalCopyCount" in face)));
  const base = GAME_SET_CATALOG.compose();
  assert.deepEqual(base.setIds, ["hts.base.v1"]);
  for (const face of EXPANSION_FACE_DRAFTS) assert.equal(base.expansionCard(face.definitionId), undefined);
  assert.throws(() => GAME_SET_CATALOG.compose([EXPANSION_SET_IDS.warriorsDruids]), /Unsupported expansion/);
});
