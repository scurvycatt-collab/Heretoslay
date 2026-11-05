import assert from "node:assert/strict";
import test from "node:test";

import { cardDataOfKind, EXPANSION_CARDS_BY_ID, lookupCard } from "../src/content/base-cards.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";
import { BN_CARD_DATA, BN_SOURCES, BN_UNIMPLEMENTED_EFFECTS } from "../src/content/expansion-bn.ts";
import { GAME_SET_CATALOG } from "../src/content/set-catalog.ts";

const drafts = EXPANSION_FACE_DRAFTS.filter((face) => face.setKey === "berserkersNecromancers");
const REQUIRED: Record<string, string[]> = {
  hero: ["heroClass", "rollThreshold", "effectId", "target"],
  monster: ["requirement", "slay", "penaltyRange", "penalty", "penaltyText", "slainEffectId"],
  item: ["equip", "maskClass", "effectId"], cursed_item: ["equip", "maskClass", "effectId"],
  magic: ["effectId", "target"], modifier: ["options"], challenge: ["requiredClass", "rollBonus"],
  party_leader: ["heroClass", "effectId", "bannedPlayerCounts"],
};

test("every BN face has exactly one engine card with matching id, kind and sourced quantity", () => {
  assert.equal(BN_CARD_DATA.length, 33);
  assert.deepEqual(new Set(BN_CARD_DATA.map((c) => c.definitionId)), new Set(drafts.map((d) => d.definitionId)));
  for (const card of BN_CARD_DATA) {
    const draft = drafts.find((d) => d.definitionId === card.definitionId)!;
    assert.equal(card.kind, draft.kind, card.name);
    assert.equal(card.quantity, draft.physicalCopyCount, card.name);
    assert.equal(card.name, draft.canonicalName);
  }
});

test("provenance covers text and every mechanic field and points at a known source", () => {
  for (const card of BN_CARD_DATA) {
    for (const field of ["text", ...REQUIRED[card.kind]]) {
      const entry = card.provenance[field];
      assert.ok(entry, `${card.name}: ${field}`);
      assert.ok(entry.sources.every((s) => s in BN_SOURCES), `${card.name}: ${field} source`);
    }
    assert.ok(typeof card.text === "string" && card.text.length > 10, card.name);
  }
});

test("printed class and threshold agree with the reviewed face labels; BN Heroes all roll high", () => {
  const heroes = BN_CARD_DATA.filter((c) => c.kind === "hero");
  assert.equal(heroes.length, 16);
  for (const card of heroes) {
    const draft = drafts.find((d) => d.definitionId === card.definitionId)!;
    const m = /Hero, (\w+), (\d+)\+/.exec(draft.observedKind)!;
    assert.equal(card.heroClass, m[1].toLowerCase(), card.name);
    assert.equal(card.rollThreshold, Number(m[2]), card.name);
    assert.equal(card.rollComparator, undefined, card.name);
  }
});

test("two-slot Heroes in the data match the draft index (Meowntain, Vicious Wildcat, Rabid Beast, Gruesome Gladiator)", () => {
  const twoSlot = drafts.filter((d) => d.twoItemSlots).map((d) => d.canonicalName).sort();
  assert.deepEqual(twoSlot, ["Gruesome Gladiator", "Meowntain", "Rabid Beast", "Vicious Wildcat"]);
});

test("Masks, class Challenges, Monsters and Leaders are encoded as printed", () => {
  const byName = (name: string) => BN_CARD_DATA.find((c) => c.name === name)!;
  assert.equal((byName("Berserker Mask") as { maskClass: string }).maskClass, "berserker");
  assert.equal((byName("Necromancer Mask") as { maskClass: string }).maskClass, "necromancer");
  assert.equal((byName("Berserker Challenge") as { requiredClass: string }).requiredClass, "berserker");
  assert.equal((byName("Necromancer Challenge") as { rollBonus: number }).rollBonus, 3);
  const ripper = byName("Reptilian Ripper") as Extract<(typeof BN_CARD_DATA)[number], { kind: "monster" }>;
  assert.deepEqual(ripper.requirement, [{ kind: "class", heroClass: "berserker" }, { kind: "any" }]);
  assert.deepEqual([ripper.slay, ripper.penaltyRange], [{ op: "gte", value: 7 }, { op: "lte", value: 6 }]);
  assert.deepEqual(ripper.penalty, { effectId: "penalty.sacrifice_hero", count: 2 });
  const doom = byName("Doombringer") as Extract<(typeof BN_CARD_DATA)[number], { kind: "monster" }>;
  assert.deepEqual(doom.requirement, [{ kind: "class", heroClass: "necromancer" }, { kind: "any" }]);
  assert.deepEqual([doom.slay, doom.penaltyRange], [{ op: "gte", value: 8 }, { op: "lte", value: 4 }]);
  assert.deepEqual(doom.penalty, { effectId: "penalty.discard_hand" });
  assert.equal((byName("Modifier +2/-2") as { options: number[] }).options.join(), "2,-2");
  assert.equal((byName("Modifier +7") as { options: number[] }).options.join(), "7");
  assert.equal((byName("The Gnawing Dread") as { heroClass: string }).heroClass, "necromancer");
  assert.equal((byName("The Raging Manticore") as { heroClass: string }).heroClass, "berserker");
});

test("BN is lookup-only: registered for lookup, never in the selectable catalog; pending effects are tracked", () => {
  for (const card of BN_CARD_DATA) assert.equal(lookupCard(card.definitionId), EXPANSION_CARDS_BY_ID.get(card.definitionId));
  assert.equal(cardDataOfKind(BN_CARD_DATA.find((c) => c.name === "Berserker Mask")!.definitionId, "item")?.maskClass, "berserker");
  assert.ok(!JSON.stringify(GAME_SET_CATALOG).includes("berserkers-necromancers"));
  assert.ok(BN_UNIMPLEMENTED_EFFECTS.includes("hero.grim-pupper"));
  assert.ok(!BN_UNIMPLEMENTED_EFFECTS.includes("item.soulbound-grimoire"));
});
