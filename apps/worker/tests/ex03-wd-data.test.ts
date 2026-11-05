import assert from "node:assert/strict";
import test from "node:test";

import { cardDataOfKind, EXPANSION_CARDS_BY_ID, lookupCard } from "../src/content/base-cards.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";
import { WD_CARD_DATA, WD_SOURCES, WD_UNIMPLEMENTED_EFFECTS } from "../src/content/expansion-wd.ts";
import { GAME_SET_CATALOG } from "../src/content/set-catalog.ts";
import { cardName } from "../src/game/base-rules.ts";

const drafts = EXPANSION_FACE_DRAFTS.filter((face) => face.setKey === "warriorsDruids");
const REQUIRED: Record<string, string[]> = {
  hero: ["heroClass", "rollThreshold", "effectId", "target"],
  monster: ["requirement", "slay", "penaltyRange", "penalty", "penaltyText", "slainEffectId"],
  item: ["equip", "maskClass", "effectId"], cursed_item: ["equip", "maskClass", "effectId"],
  magic: ["effectId", "target"], modifier: ["options"], challenge: ["requiredClass", "rollBonus"],
  party_leader: ["heroClass", "effectId", "bannedPlayerCounts"],
};

test("every WD face has exactly one engine card with matching id, kind and sourced quantity", () => {
  assert.equal(WD_CARD_DATA.length, 35);
  assert.deepEqual(new Set(WD_CARD_DATA.map((c) => c.definitionId)), new Set(drafts.map((d) => d.definitionId)));
  for (const card of WD_CARD_DATA) {
    const draft = drafts.find((d) => d.definitionId === card.definitionId)!;
    assert.equal(card.kind, draft.kind, card.name);
    assert.equal(card.quantity, draft.physicalCopyCount, card.name);
    assert.equal(card.name, draft.canonicalName);
  }
});

test("provenance covers text and every mechanic field and points at a known source", () => {
  for (const card of WD_CARD_DATA) {
    for (const field of ["text", ...REQUIRED[card.kind]]) {
      const entry = card.provenance[field];
      assert.ok(entry, `${card.name}: ${field}`);
      assert.ok(entry.sources.every((s) => s in WD_SOURCES), `${card.name}: ${field} source`);
    }
    assert.ok(typeof card.text === "string" && card.text.length > 10, card.name);
  }
});

test("printed class/threshold/comparator agree with the reviewed face labels", () => {
  for (const card of WD_CARD_DATA.filter((c) => c.kind === "hero")) {
    const draft = drafts.find((d) => d.definitionId === card.definitionId)!;
    const m = /Hero, (\w+), (\d+)([+-])/.exec(draft.observedKind)!;
    assert.equal(card.heroClass, m[1].toLowerCase(), card.name);
    assert.equal(card.rollThreshold, Number(m[2]), card.name);
    assert.equal(card.rollComparator ?? "gte", m[3] === "-" ? "lte" : "gte", card.name);
    assert.ok(card.effectId?.startsWith("hero."), card.name);
  }
});

test("Druids roll low, Warriors roll high; Mask never changes a printed comparator", () => {
  const heroes = WD_CARD_DATA.filter((c) => c.kind === "hero");
  assert.ok(heroes.filter((h) => h.heroClass === "druid").every((h) => h.rollComparator === "lte"));
  assert.ok(heroes.filter((h) => h.heroClass === "warrior").every((h) => h.rollComparator === undefined));
});

test("E08 class Challenges, E02 any-Hero equip and monster ranges are encoded as printed", () => {
  const challenges = WD_CARD_DATA.filter((c) => c.kind === "challenge");
  assert.deepEqual(challenges.map((c) => [c.requiredClass, c.rollBonus]).sort(), [["druid", 3], ["warrior", 3]]);
  for (const item of WD_CARD_DATA.filter((c) => c.kind === "item" || c.kind === "cursed_item")) assert.equal(item.equip, "any_hero");
  const rex = lookupCard(drafts.find((d) => d.canonicalName === "Muscipula Rex")!.definitionId);
  assert.ok(rex?.kind === "monster" && rex.requirement.length === 3 && rex.slay.value === 10 && rex.penaltyRange.value === 7);
  const dragon = lookupCard(drafts.find((d) => d.canonicalName === "Feral Dragon")!.definitionId);
  assert.ok(dragon?.kind === "monster" && dragon.requirement.length === 2 && dragon.slay.value === 9 && dragon.penaltyRange.value === 6);
});

test("lookup works for in-play expansion cards but this does not enable the pack", () => {
  const maegisty = drafts.find((d) => d.canonicalName === "Maegisty")!.definitionId;
  assert.equal(cardDataOfKind(maegisty, "hero")?.rollComparator, "lte");
  assert.equal(cardName(maegisty), "Maegisty");
  assert.equal(EXPANSION_CARDS_BY_ID.size, 35);
  assert.deepEqual(GAME_SET_CATALOG.compose().setIds, ["hts.base.v1"]);
});

test("pending effects are tracked explicitly, so the pack cannot be enabled by accident", () => {
  assert.ok(WD_UNIMPLEMENTED_EFFECTS.length > 0);
  assert.ok(!WD_UNIMPLEMENTED_EFFECTS.includes("item.bottomless-bag"));
  assert.ok(WD_UNIMPLEMENTED_EFFECTS.includes("hero.maegisty"), "the Maegisty hero effect still needs its handler");
  assert.equal(new Set(WD_UNIMPLEMENTED_EFFECTS).size, WD_UNIMPLEMENTED_EFFECTS.length);
});
