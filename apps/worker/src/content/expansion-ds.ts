// EX-05 data: the 16 Dragon Sorcerer v2 faces as engine card data (quantities come from the sourced
// draft index). Every printed fact below was read from the restored card face PNG the owner supplied
// (sha256 in expansion-drafts.ts). Rules text is the face text; mechanics are derived from it.
// Registered for lookup only: the pack is NOT playable until every effect below is implemented
// and EX-06 enables it (see DS_UNIMPLEMENTED_EFFECTS).
import type { CardData, CardSource, FieldProvenance } from "@here-to-slay/protocol";
import { EXPANSION_FACE_DRAFTS } from "./expansion-drafts.ts";

export const DS_SOURCES: Record<string, CardSource> = {
  FACE: {
    label: "Dragon Sorcerer v2 restored card face PNGs (owner-supplied scans, hashed in expansion-drafts.ts)",
    url: "https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Dragon_Sorcerer_Expansion_-_Inventory_List",
    revision: "2026-11-05",
    authority: "card_face_scan",
  },
};

const face = (note?: string): FieldProvenance => ({ status: "single_source", sources: ["FACE"], ...(note ? { note } : {}) });
const derived = (note?: string): FieldProvenance => ({ status: "derived", sources: ["FACE"], ...(note ? { note } : {}) });

function draftOf(name: string) {
  const draft = EXPANSION_FACE_DRAFTS.find((entry) => entry.setKey === "dragonSorcerer" && entry.canonicalName === name);
  if (!draft) throw new Error(`DS face missing from the draft index: ${name}`);
  return draft;
}

const base = (name: string, text: string) => ({ definitionId: draftOf(name).definitionId, name, quantity: draftOf(name).physicalCopyCount, text });

export const DS_CARD_DATA: readonly CardData[] = [
  {
    ...base("Dragalter", "DISCARD a Modifier card. You may apply that Modifier card's effect to all of your rolls for the rest of this turn."), kind: "hero", heroClass: "sorcerer", rollThreshold: 7, effectId: "hero.dragalter", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Dystortivern", "Trade Party Leader cards with another player."), kind: "hero", heroClass: "sorcerer", rollThreshold: 10, effectId: "hero.dystortivern", target: "other_player",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"10+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Extraga", "Each player (including you) must return any other Sorcerers in their Party to their hand."), kind: "hero", heroClass: "sorcerer", rollThreshold: 7, effectId: "hero.extraga", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Luut", "STEAL an Item card and equip it to a Hero card in your Party."), kind: "hero", heroClass: "sorcerer", rollThreshold: 7, effectId: "hero.luut", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Mirroryu", "Roll to use the effect of any Hero card in your Party immediately. +3 to that roll."), kind: "hero", heroClass: "sorcerer", rollThreshold: 7, effectId: "hero.mirroryu", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Oracon", "Pull a card from another player's hand. If it is a Modifier card, that player must SACRIFICE a Hero card."), kind: "hero", heroClass: "sorcerer", rollThreshold: 7, effectId: "hero.oracon", target: "other_player",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Face prints \"+7\"; read as 7+ (matches the reviewed draft label)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Renovern", "Search the discard pile for an Item card and play it immediately."), kind: "hero", heroClass: "sorcerer", rollThreshold: 8, effectId: "hero.renovern", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"8+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Shamanaga", "Choose a Hero card from the discard pile. Bring that Hero card into your Party, roll to use its effect immediately, then SACRIFICE it."), kind: "hero", heroClass: "sorcerer", rollThreshold: 7, effectId: "hero.shamanaga", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Smok", "DRAW 2 cards. If at least one of those cards is a Magic card, you may reveal it, then spend an extra action point this turn."), kind: "hero", heroClass: "sorcerer", rollThreshold: 8, effectId: "hero.smok", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"8+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Sorcerer Mask", "The equipped Hero card is considered a Sorcerer instead of its original class."), kind: "item", equip: "any_hero", maskClass: "sorcerer", effectId: "item.sorcerer-mask",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Modifier +6", "Play this card after any player (including you) rolls the dice and DISCARD a card. +6 to that roll."), kind: "modifier", options: [6],
    notes: ["Printed cost: DISCARD a card (handled when the Modifier is played)."],
    provenance: { text: face(), options: face() },
  },
  {
    ...base("Modifier -6", "Play this card after any player (including you) rolls the dice and DISCARD a card. -6 to that roll."), kind: "modifier", options: [-6],
    notes: ["Printed cost: DISCARD a card (handled when the Modifier is played)."],
    provenance: { text: face(), options: face() },
  },
  {
    ...base("Egg of Fortune", "DISCARD a card, then pull a card from each other player's hand."), kind: "magic", effectId: "magic.egg-of-fortune", target: "none",
    provenance: { text: face(), effectId: derived(), target: derived() },
  },
  {
    ...base("Sorcerer Challenge", "You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card. +3 to your roll."), kind: "challenge", requiredClass: "sorcerer", rollBonus: 3,
    provenance: { text: face(), requiredClass: face("REQUIREMENT icon on the face"), rollBonus: face() },
  },
  {
    ...base("The Fearless Flame", "Each time you roll the dice, you may DISCARD a card. If you do, +1 to your roll."), kind: "party_leader", heroClass: "sorcerer", effectId: "leader.the-fearless-flame", bannedPlayerCounts: [],
    provenance: { text: face(), heroClass: face(), effectId: derived(), bannedPlayerCounts: face("No player-count restriction printed") },
  },
  {
    ...base("Calamity Mongrel", "Each time you DRAW a Challenge card, you may DISCARD it and DRAW 2 cards."), kind: "monster",
    requirement: [{ kind: "class", heroClass: "sorcerer" }, { kind: "any" }],
    slay: { op: "gte", value: 8 }, penaltyRange: { op: "lte", value: 4 },
    penalty: { effectId: "penalty.discard", count: 2 }, penaltyText: "DISCARD 2 cards.", slainEffectId: "monster.calamity-mongrel",
    provenance: { text: face(), requirement: face("Printed Sorcerer icon + H icon"), slay: face(), penaltyRange: face(), penalty: face(), penaltyText: face(), slainEffectId: derived() },
  },
];

/** Effects whose engine behaviour already exists and is tested. Everything else is pending (EX-05 slices). */
export const DS_IMPLEMENTED_EFFECTS: ReadonlySet<string> = new Set([
  "item.sorcerer-mask", // generic Mask class replacement
  "hero.dystortivern", "hero.extraga", "hero.oracon", "hero.renovern", "hero.smok", "magic.egg-of-fortune",
  "leader.the-fearless-flame", "monster.calamity-mongrel",
]);

export const DS_UNIMPLEMENTED_EFFECTS: readonly string[] = DS_CARD_DATA.flatMap((card) => {
  const id = "effectId" in card ? card.effectId : card.kind === "monster" ? card.slainEffectId : null;
  return id && !DS_IMPLEMENTED_EFFECTS.has(id) ? [id] : [];
});
