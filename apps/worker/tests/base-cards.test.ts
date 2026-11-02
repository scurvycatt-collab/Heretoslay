import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CardDataFile } from "@here-to-slay/protocol";
import {
  BASE_CARD_DATA,
  BASE_CARDS_BY_ID,
  cardDataOfKind,
  validateCardData,
} from "../src/content/base-cards.ts";

const clone = (): CardDataFile => structuredClone(BASE_CARD_DATA);

test("base card data is valid and covers every playable row of BASE_CARD_INDEX.csv", () => {
  assert.deepEqual(validateCardData(BASE_CARD_DATA), []);
  const csv = readFileSync(new URL("../../../docs/content/BASE_CARD_INDEX.csv", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","));
  const playable = csv.filter((row) => row[2] !== "rule_card");
  assert.equal(playable.length, 95);
  for (const [id, , kind, name, quantity] of playable) {
    const card = BASE_CARDS_BY_ID.get(id);
    assert.ok(card, `missing ${id}`);
    assert.equal(card.kind, kind);
    assert.equal(card.name, name);
    assert.equal(card.quantity, Number(quantity));
  }
  const copies = (kinds: string[]) =>
    BASE_CARD_DATA.cards.filter((card) => kinds.includes(card.kind)).reduce((sum, card) => sum + card.quantity, 0);
  assert.equal(copies(["hero", "item", "cursed_item", "magic", "modifier", "challenge"]), 115);
  assert.equal(copies(["monster"]), 15);
  assert.equal(copies(["party_leader"]), 6);
});

test("heroes: 8 per class, thresholds in 2..12, every card has sourced text", () => {
  const heroes = BASE_CARD_DATA.cards.filter((card) => card.kind === "hero");
  assert.equal(heroes.length, 48);
  for (const heroClass of ["bard", "fighter", "guardian", "ranger", "thief", "wizard"]) {
    assert.equal(heroes.filter((hero) => hero.heroClass === heroClass).length, 8, heroClass);
  }
  const dodgy = cardDataOfKind("hts.base.v1.hero.dodgy-dealer", "hero");
  assert.equal(dodgy?.heroClass, "bard");
  assert.equal(dodgy?.rollThreshold, 9);
  for (const card of BASE_CARD_DATA.cards) {
    assert.ok(card.text, `${card.definitionId} has no text`);
    assert.notEqual(card.provenance.text.status, "UNVERIFIED");
  }
});

test("monsters: requirement slots, non-overlapping ranges, Dracos inverted", () => {
  const dracos = cardDataOfKind("hts.base.v1.monster.dracos", "monster");
  assert.deepEqual(dracos?.slay, { op: "lte", value: 5 });
  assert.deepEqual(dracos?.penaltyRange, { op: "gte", value: 8 });
  const ddk = cardDataOfKind("hts.base.v1.monster.dark-dragon-king", "monster");
  assert.deepEqual(ddk?.requirement, [{ kind: "class", heroClass: "bard" }, { kind: "any" }]);
  assert.deepEqual(ddk?.penalty, { effectId: "penalty.discard", count: 2 });
  assert.equal(ddk?.provenance.penaltyRange.status, "majority");
  const slime = cardDataOfKind("hts.base.v1.monster.mega-slime", "monster");
  assert.equal(slime?.requirement.length, 4);
});

test("items, modifiers, leaders carry the mechanics the engine needs", () => {
  assert.equal(cardDataOfKind("hts.base.v1.item.wizard-mask", "item")?.maskClass, "wizard");
  assert.equal(cardDataOfKind("hts.base.v1.item.decoy-doll", "item")?.maskClass, null);
  assert.equal(cardDataOfKind("hts.base.v1.cursed-item.sealing-key", "cursed_item")?.equip, "any_hero");
  assert.deepEqual(cardDataOfKind("hts.base.v1.modifier.modifier-plus-1-minus-3", "modifier")?.options, [1, -3]);
  assert.deepEqual(cardDataOfKind("hts.base.v1.modifier.modifier-minus-4", "modifier")?.options, [-4]);
  assert.deepEqual(cardDataOfKind("hts.base.v1.party-leader.the-shadow-claw", "party_leader")?.bannedPlayerCounts, [2]);
  const classes = BASE_CARD_DATA.cards.filter((card) => card.kind === "party_leader").map((card) => card.heroClass);
  assert.deepEqual([...classes].sort(), ["bard", "fighter", "guardian", "ranger", "thief", "wizard"]);
});

test("validator rejects bad data", () => {
  const unknownSource = clone();
  unknownSource.cards[0].provenance.text.sources = ["NOPE"];
  assert.match(validateCardData(unknownSource).join("\n"), /unknown source NOPE/);

  const nullWithoutUnverified = clone();
  (nullWithoutUnverified.cards[0] as { text: string | null }).text = null;
  assert.match(validateCardData(nullWithoutUnverified).join("\n"), /text is null but not UNVERIFIED/);

  const missingProvenance = clone();
  const hero = missingProvenance.cards.find((card) => card.kind === "hero")!;
  delete hero.provenance.rollThreshold;
  assert.match(validateCardData(missingProvenance).join("\n"), /missing provenance for rollThreshold/);

  const overlap = clone();
  const monster = overlap.cards.find((card) => card.kind === "monster")!;
  if (monster.kind === "monster") monster.penaltyRange = { op: "lte", value: 99 };
  assert.match(validateCardData(overlap).join("\n"), /overlap/);

  const missingCard = clone();
  missingCard.cards = missingCard.cards.slice(1);
  assert.match(validateCardData(missingCard).join("\n"), /missing from card data/);

  const badQty = clone();
  badQty.cards[0].quantity = 7;
  assert.match(validateCardData(badQty).join("\n"), /quantity 7/);
});
