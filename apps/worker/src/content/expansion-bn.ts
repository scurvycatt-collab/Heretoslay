// EX-04 data: the 33 Berserkers & Necromancers faces as engine card data (quantities come from the sourced
// draft index). Every printed fact below was read from the restored card face PNG the owner supplied
// (sha256 in expansion-drafts.ts). Rules text is the face text; mechanics are derived from it.
// Registered for lookup only: the pack is NOT playable until every effect below is implemented
// and EX-06 enables it (see BN_UNIMPLEMENTED_EFFECTS).
import type { CardData, CardSource, FieldProvenance } from "@here-to-slay/protocol";
import { EXPANSION_FACE_DRAFTS } from "./expansion-drafts.ts";

export const BN_SOURCES: Record<string, CardSource> = {
  FACE: {
    label: "Berserkers & Necromancers restored card face PNGs (owner-supplied scans, hashed in expansion-drafts.ts)",
    url: "https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Dragon_Berserkers_and_Necromancers_Expansion_-_Inventory_List",
    revision: "2026-11-05",
    authority: "card_face_scan",
  },
};

const face = (note?: string): FieldProvenance => ({ status: "single_source", sources: ["FACE"], ...(note ? { note } : {}) });
const derived = (note?: string): FieldProvenance => ({ status: "derived", sources: ["FACE"], ...(note ? { note } : {}) });

function draftOf(name: string) {
  const draft = EXPANSION_FACE_DRAFTS.find((entry) => entry.setKey === "berserkersNecromancers" && entry.canonicalName === name);
  if (!draft) throw new Error(`BN face missing from the draft index: ${name}`);
  return draft;
}

const base = (name: string, text: string) => ({ definitionId: draftOf(name).definitionId, name, quantity: draftOf(name).physicalCopyCount, text });

export const BN_CARD_DATA: readonly CardData[] = [
  {
    ...base("Grim Pupper", "Each player (including you) must SACRIFICE a card."), kind: "hero", heroClass: "necromancer", rollThreshold: 8, effectId: "hero.grim-pupper", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"8+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Boston Terror", "Choose a player. That player may give you a card from their hand. If they do not, you may choose 2 cards from the discard pile and add them to your hand."), kind: "hero", heroClass: "necromancer", rollThreshold: 7, effectId: "hero.boston-terror", target: "other_player",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Bark Hexer", "DISCARD a card. Each other player must DISCARD 2 cards."), kind: "hero", heroClass: "necromancer", rollThreshold: 7, effectId: "hero.bark-hexer", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Perfect Vessel", "SACRIFICE this card, then STEAL a Hero card."), kind: "hero", heroClass: "necromancer", rollThreshold: 4, effectId: "hero.perfect-vessel", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"4+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Bone Collector", "SACRIFICE an Item card. Search the discard pile for a Hero card and add it to your hand, then play it immediately."), kind: "hero", heroClass: "necromancer", rollThreshold: 7, effectId: "hero.bone-collector", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Hollow Husk", "Look at another player's hand. Choose a Magic card (if they have one) and add it to your hand. You may play it immediately."), kind: "hero", heroClass: "necromancer", rollThreshold: 6, effectId: "hero.hollow-husk", target: "other_player",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"6+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Shadow Saint", "DISCARD a Modifier card. No other player can play Modifier cards until the end of your turn."), kind: "hero", heroClass: "necromancer", rollThreshold: 5, effectId: "hero.shadow-saint", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"5+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Beholden Retriever", "SACRIFICE a Hero card. Search the discard pile for a Hero or Item card and add it to your hand, then play it immediately."), kind: "hero", heroClass: "necromancer", rollThreshold: 5, effectId: "hero.beholden-retriever", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"5+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Roaryal Guard", "Choose a Class. Return every Hero card of that Class to its respective player's hand."), kind: "hero", heroClass: "berserker", rollThreshold: 9, effectId: "hero.roaryal-guard", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"9+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Brawling Spirit", "Each player (including you) with more than 3 cards in their Party must SACRIFICE a card."), kind: "hero", heroClass: "berserker", rollThreshold: 9, effectId: "hero.brawling-spirit", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"9+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Unbridled Fury", "DESTROY a Hero card. If that Hero card is a Berserker, you may spend an extra action point this turn."), kind: "hero", heroClass: "berserker", rollThreshold: 8, effectId: "hero.unbridled-fury", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"8+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Annihilator", "Search the discard pile for a Challenge card and add it to your hand."), kind: "hero", heroClass: "berserker", rollThreshold: 6, effectId: "hero.annihilator", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"6+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Meowntain", "SACRIFICE a card. +5 to all of your rolls until the end of your turn."), kind: "hero", heroClass: "berserker", rollThreshold: 6, effectId: "hero.meowntain", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"6+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Vicious Wildcat", "SLAY any Monster card, then end your turn."), kind: "hero", heroClass: "berserker", rollThreshold: 12, effectId: "hero.vicious-wildcat", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"12+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Rabid Beast", "SACRIFICE any number of cards, then DESTROY the same number of cards."), kind: "hero", heroClass: "berserker", rollThreshold: 6, effectId: "hero.rabid-beast", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"6+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Gruesome Gladiator", "Look at each other player's hand. Choose a card from each player's hand and add it to your hand."), kind: "hero", heroClass: "berserker", rollThreshold: 10, effectId: "hero.gruesome-gladiator", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"10+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Berserker Mask", "The equipped Hero card is considered a Berserker instead of its original class."), kind: "item", equip: "any_hero", maskClass: "berserker", effectId: "item.berserker-mask",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Necromancer Mask", "The equipped Hero card is considered a Necromancer instead of its original class."), kind: "item", equip: "any_hero", maskClass: "necromancer", effectId: "item.necromancer-mask",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Goblet of Caffeination", "If you unsuccessfully roll to use the equipped Hero card's effect, you may SACRIFICE this card, then roll to use that effect again immediately."), kind: "item", equip: "any_hero", maskClass: null, effectId: "item.goblet-of-caffeination",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Biggest Ring Ever", "Each time you roll to use the equipped Hero card's effect, you may DISCARD up to 3 cards. For each card discarded, +2 to your roll."), kind: "item", equip: "any_hero", maskClass: null, effectId: "item.biggest-ring-ever",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Silver Lining", "If you unsuccessfully roll to use the equipped Hero card's effect, +2 to all of your rolls for the rest of your turn."), kind: "item", equip: "any_hero", maskClass: null, effectId: "item.silver-lining",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Dragon's Bile", "If you unsuccessfully roll to use the equipped Hero card's effect, SACRIFICE a Hero card."), kind: "cursed_item", equip: "any_hero", maskClass: null, effectId: "item.dragons-bile",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Soulbound Grimoire", "Rolling to use the equipped Hero card's effect costs 2 action points."), kind: "cursed_item", equip: "any_hero", maskClass: null, effectId: "item.soulbound-grimoire",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Modifier +2/-2", "Play this card after any player (including you) rolls the dice. +2 or -2 to that roll. If you are attacking a Monster card, +4 to that roll instead."), kind: "modifier", options: [2, -2],
    notes: ["Printed: +4 instead of +2/-2 when the player is attacking a Monster card (handled by the BN modifier effect, not by `options`)."],
    provenance: { text: face(), options: face() },
  },
  {
    ...base("Modifier +7", "Play this card after any player (including you) rolls the dice. DISCARD your hand. +7 to that roll."), kind: "modifier", options: [7],
    notes: ["Printed cost: DISCARD your hand (handled by the BN modifier effect)."],
    provenance: { text: face(), options: face() },
  },
  {
    ...base("Lightning Labrys", "DISCARD up to 3 cards. For each card discarded, choose a player. That player must SACRIFICE a Hero card."), kind: "magic", effectId: "magic.lightning-labrys", target: "none",
    provenance: { text: face(), effectId: derived(), target: derived() },
  },
  {
    ...base("Mass Sacrifice", "DISCARD your hand, then DRAW 5 cards."), kind: "magic", effectId: "magic.mass-sacrifice", target: "none",
    provenance: { text: face(), effectId: derived(), target: derived() },
  },
  {
    ...base("Berserker Challenge", "You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card. +3 to your roll."), kind: "challenge", requiredClass: "berserker", rollBonus: 3,
    provenance: { text: face(), requiredClass: face("REQUIREMENT icon on the face"), rollBonus: face() },
  },
  {
    ...base("Necromancer Challenge", "You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card. +3 to your roll."), kind: "challenge", requiredClass: "necromancer", rollBonus: 3,
    provenance: { text: face(), requiredClass: face("REQUIREMENT icon on the face"), rollBonus: face() },
  },
  {
    ...base("The Gnawing Dread", "Once per turn on your turn, you may spend 2 action points to search the discard pile for a card and add it to your hand."), kind: "party_leader", heroClass: "necromancer", effectId: "leader.the-gnawing-dread", bannedPlayerCounts: [],
    provenance: { text: face(), heroClass: face(), effectId: derived(), bannedPlayerCounts: face("No player-count restriction printed") },
  },
  {
    ...base("The Raging Manticore", "Each time you SLAY a Monster card, DRAW 2 cards."), kind: "party_leader", heroClass: "berserker", effectId: "leader.the-raging-manticore", bannedPlayerCounts: [],
    provenance: { text: face(), heroClass: face(), effectId: derived(), bannedPlayerCounts: face("No player-count restriction printed") },
  },
  {
    ...base("Reptilian Ripper", "Each time you roll to ATTACK a Monster card, +2 to your roll."), kind: "monster",
    requirement: [{ kind: "class", heroClass: "berserker" }, { kind: "any" }],
    slay: { op: "gte", value: 7 }, penaltyRange: { op: "lte", value: 6 },
    penalty: { effectId: "penalty.sacrifice_hero", count: 2 }, penaltyText: "SACRIFICE 2 Hero cards.", slainEffectId: "monster.reptilian-ripper",
    provenance: { text: face(), requirement: face("Printed Berserker icon + H icon"), slay: face(), penaltyRange: face(), penalty: face(), penaltyText: face(), slainEffectId: derived() },
  },
  {
    ...base("Doombringer", "Each time you SACRIFICE a card, you may choose a card from the discard pile and add it to your hand."), kind: "monster",
    requirement: [{ kind: "class", heroClass: "necromancer" }, { kind: "any" }],
    slay: { op: "gte", value: 8 }, penaltyRange: { op: "lte", value: 4 },
    penalty: { effectId: "penalty.discard_hand" }, penaltyText: "DISCARD your hand.", slainEffectId: "monster.doombringer",
    provenance: { text: face(), requirement: face("Printed Necromancer icon + H icon"), slay: face(), penaltyRange: face(), penalty: face(), penaltyText: face(), slainEffectId: derived() },
  },
];

/** Effects whose engine behaviour already exists and is tested. Everything else is pending (EX-04 slices). */
export const BN_IMPLEMENTED_EFFECTS: ReadonlySet<string> = new Set([
  "item.berserker-mask", "item.necromancer-mask", // generic Mask class replacement
  "hero.grim-pupper", "hero.boston-terror", "hero.bark-hexer", "hero.perfect-vessel", "hero.bone-collector", "hero.hollow-husk", "hero.shadow-saint", "hero.beholden-retriever", // EX-04 N1 (necromancers)
  "hero.roaryal-guard", "hero.brawling-spirit", "hero.unbridled-fury", "hero.annihilator", "hero.meowntain", "hero.rabid-beast", "hero.gruesome-gladiator", // EX-04 N2 (berserkers)
  "magic.mass-sacrifice", "magic.lightning-labrys",
  "hero.vicious-wildcat", // EX-04 N3 (direct SLAY + end turn)
  "leader.the-gnawing-dread", "leader.the-raging-manticore", "monster.reptilian-ripper", "monster.doombringer", // EX-04 N3
  "item.biggest-ring-ever", "item.silver-lining", "item.dragons-bile", // EX-04 N3
  "item.goblet-of-caffeination", // retry after failed hero roll (EX-02 B2)
  "item.soulbound-grimoire", // 2 AP hero-effect cost (EX-02 B2 / E10)
]);

export const BN_UNIMPLEMENTED_EFFECTS: readonly string[] = BN_CARD_DATA.flatMap((card) => {
  const id = "effectId" in card ? card.effectId : card.kind === "monster" ? card.slainEffectId : null;
  return id && !BN_IMPLEMENTED_EFFECTS.has(id) ? [id] : [];
});
