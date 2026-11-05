// EX-03 data: the 35 Warriors & Druids faces as engine card data (quantities come from the sourced
// draft index). Every printed fact below was read from the card face PNG the owner supplied
// (sha256 in expansion-drafts.ts). Rules text is the face text; mechanics are derived from it.
// Registered for lookup only: the pack is NOT playable until every effect below is implemented
// and EX-06 enables it (see WD_UNIMPLEMENTED_EFFECTS).
import type { CardData, CardSource, FieldProvenance } from "@here-to-slay/protocol";
import { EXPANSION_FACE_DRAFTS } from "./expansion-drafts.ts";

export const WD_SOURCES: Record<string, CardSource> = {
  FACE: {
    label: "Warriors & Druids card face PNGs (owner-supplied scans, hashed in expansion-drafts.ts)",
    url: "https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Dragon_Warrior_and_Druid_Expansion_-_Cards_In_This_Deck",
    revision: "2026-11-05",
    authority: "card_face_scan",
  },
};

const face = (note?: string): FieldProvenance => ({ status: "single_source", sources: ["FACE"], ...(note ? { note } : {}) });
const derived = (note?: string): FieldProvenance => ({ status: "derived", sources: ["FACE"], ...(note ? { note } : {}) });

function draftOf(name: string) {
  const draft = EXPANSION_FACE_DRAFTS.find((entry) => entry.setKey === "warriorsDruids" && entry.canonicalName === name);
  if (!draft) throw new Error(`WD face missing from the draft index: ${name}`);
  return draft;
}

const base = (name: string, text: string) => ({ definitionId: draftOf(name).definitionId, name, quantity: draftOf(name).physicalCopyCount, text });

export const WD_CARD_DATA: readonly CardData[] = [
  {
    ...base("Big Buckley", "ATTACK a Monster card immediately. (You must still meet its Party requirement.)"), kind: "hero", heroClass: "druid", rollThreshold: 8, rollComparator: "lte", effectId: "hero.big-buckley", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"8-\" (rolls at or below succeed)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Buck Omens", "Look at another player's hand. Choose a Hero card from their hand (if they have one) and bring it into your Party."), kind: "hero", heroClass: "druid", rollThreshold: 6, rollComparator: "lte", effectId: "hero.buck-omens", target: "other_player",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"6-\" (rolls at or below succeed)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Doe Fallow", "SACRIFICE a Hero card, then DRAW cards until you have 7 cards in your hand."), kind: "hero", heroClass: "druid", rollThreshold: 7, rollComparator: "lte", effectId: "hero.doe-fallow", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7-\" (rolls at or below succeed)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Glowing Antler", "You may play up to 2 Magic cards immediately."), kind: "hero", heroClass: "druid", rollThreshold: 7, rollComparator: "lte", effectId: "hero.glowing-antler", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7-\" (rolls at or below succeed)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Maegisty", "Until your next turn, if a Hero card in your Party would be sacrificed or destroyed, return it to your hand instead."), kind: "hero", heroClass: "druid", rollThreshold: 7, rollComparator: "lte", effectId: "hero.maegisty", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7-\" (rolls at or below succeed)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Magus Moose", "Search the discard pile for a Hero card and add it to your hand, then play it immediately."), kind: "hero", heroClass: "druid", rollThreshold: 5, rollComparator: "lte", effectId: "hero.magus-moose", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"5-\" (rolls at or below succeed)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Majestelk", "SACRIFICE a Hero card. +5 or -5 to each of your rolls until your next turn."), kind: "hero", heroClass: "druid", rollThreshold: 7, rollComparator: "lte", effectId: "hero.majestelk", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7-\" (rolls at or below succeed)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Stagguard", "No other player can play Modifier cards until the end of your turn."), kind: "hero", heroClass: "druid", rollThreshold: 8, rollComparator: "lte", effectId: "hero.stagguard", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"8-\" (rolls at or below succeed)"), effectId: derived(), target: derived() },
  },
  {
    ...base("Agile Dagger", "You may play up to 2 Item cards immediately."), kind: "hero", heroClass: "warrior", rollThreshold: 7, effectId: "hero.agile-dagger", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"7+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Blinding Blade", "Choose any player. Return all equipped Item cards in that player's Party to your hand."), kind: "hero", heroClass: "warrior", rollThreshold: 8, effectId: "hero.blinding-blade", target: "any_player",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"8+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Critical Fang", "+4 to your rolls to ATTACK a Monster card until the end of your turn."), kind: "hero", heroClass: "warrior", rollThreshold: 6, effectId: "hero.critical-fang", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"6+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Hardened Hunter", "DRAW a card for each Monster card in each other player's Party."), kind: "hero", heroClass: "warrior", rollThreshold: 9, effectId: "hero.hardened-hunter", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"9+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Looting Lupo", "DRAW a card for each Item card equipped to a Hero card in your Party."), kind: "hero", heroClass: "warrior", rollThreshold: 5, effectId: "hero.looting-lupo", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"5+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Silent Shield", "For the rest of your turn, if you SACRIFICE or DESTROY a Hero card, you may search the discard pile for a Hero card and add it to your hand."), kind: "hero", heroClass: "warrior", rollThreshold: 6, effectId: "hero.silent-shield", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"6+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Tenacious Timber", "For each Monster card in your Party, STEAL a Hero."), kind: "hero", heroClass: "warrior", rollThreshold: 8, effectId: "hero.tenacious-timber", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"8+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Wolfgang Pack", "For each other Hero card in your Party, +1 to all of your rolls until the end of your turn."), kind: "hero", heroClass: "warrior", rollThreshold: 5, effectId: "hero.wolfgang-pack", target: "none",
    provenance: { text: face(), heroClass: face(), rollThreshold: face("Printed \"5+\""), effectId: derived(), target: derived() },
  },
  {
    ...base("Bottomless Bag", "You may roll to use the equipped Hero card's effect more than once per turn, at a cost of one action point for each roll to use."), kind: "item", equip: "any_hero", maskClass: null, effectId: "item.bottomless-bag",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Druid Mask", "The equipped Hero card is considered a Druid instead of its original class."), kind: "item", equip: "any_hero", maskClass: "druid", effectId: "item.druid-mask",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Even Bigger Ring", "Each time you roll to use the equipped Hero card's effect, +4 to your roll."), kind: "item", equip: "any_hero", maskClass: null, effectId: "item.even-bigger-ring",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Temporal Hourglass", "If you unsuccessfully roll to use the equipped Hero card's effect, you may spend an extra action point this turn."), kind: "item", equip: "any_hero", maskClass: null, effectId: "item.temporal-hourglass",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Warrior Mask", "The equipped Hero card is considered a Warrior instead of its original class."), kind: "item", equip: "any_hero", maskClass: "warrior", effectId: "item.warrior-mask",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Cursed Glove", "If another Hero card in your Party is stolen, move the equipped Hero card to the Party of the player who stole it as well."), kind: "cursed_item", equip: "any_hero", maskClass: null, effectId: "item.cursed-glove",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Soul Tether", "If any Hero card in your Party is sacrificed or destroyed, SACRIFICE the equipped Hero card."), kind: "cursed_item", equip: "any_hero", maskClass: null, effectId: "item.soul-tether",
    provenance: { text: face(), equip: derived("E02: any player's eligible Hero"), effectId: derived(), maskClass: face() },
  },
  {
    ...base("Modifier +1/-1", "Play this card after any player (including you) rolls the dice. +1 or -1 to that roll. DRAW 2 cards."), kind: "modifier", options: [1, -1],
    provenance: { text: face(), options: face() },
  },
  {
    ...base("Modifier +2/-1", "Play this card after any player (including you) rolls the dice. +2 or -1 to that roll. DRAW a card."), kind: "modifier", options: [2, -1],
    provenance: { text: face(), options: face() },
  },
  {
    ...base("Modifier +4", "Play this card after any player (including you) rolls the dice. +4 to that roll. If the roll is modified above 12, DRAW a card."), kind: "modifier", options: [4],
    provenance: { text: face(), options: face() },
  },
  {
    ...base("Modifier -4", "Play this card after any player (including you) rolls the dice. -4 to that roll. If the roll is modified below 2, choose a card from the discard pile and add it to your hand."), kind: "modifier", options: [-4],
    provenance: { text: face(), options: face() },
  },
  {
    ...base("Beast Call", "Move all face-up Monster cards to the bottom of the Monster deck and flip the top 3 cards from the Monster deck face up. You may spend an extra action point this turn."), kind: "magic", effectId: "magic.beast-call", target: "none",
    provenance: { text: face(), effectId: derived(), target: derived() },
  },
  {
    ...base("Rapid Refresh", "DISCARD every card in your hand (if you have any) and DRAW 4 cards."), kind: "magic", effectId: "magic.rapid-refresh", target: "none",
    provenance: { text: face(), effectId: derived(), target: derived() },
  },
  {
    ...base("Druid Challenge", "You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card. +3 to your roll."), kind: "challenge", requiredClass: "druid", rollBonus: 3,
    provenance: { text: face(), requiredClass: face("REQUIREMENT icon on the face"), rollBonus: face() },
  },
  {
    ...base("Warrior Challenge", "You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card. +3 to your roll."), kind: "challenge", requiredClass: "warrior", rollBonus: 3,
    provenance: { text: face(), requiredClass: face("REQUIREMENT icon on the face"), rollBonus: face() },
  },
  {
    ...base("The Noble Shaman", "Once per turn on each player's turn, you may choose any player's roll. -1 to that roll."), kind: "party_leader", heroClass: "druid", effectId: "leader.the-noble-shaman", bannedPlayerCounts: [],
    provenance: { text: face(), heroClass: face(), effectId: derived(), bannedPlayerCounts: face("No player-count restriction printed") },
  },
  {
    ...base("The Piercing Howl", "Each time you roll, +1 to your roll for each Item card equipped to a Hero card in your Party."), kind: "party_leader", heroClass: "warrior", effectId: "leader.the-piercing-howl", bannedPlayerCounts: [],
    provenance: { text: face(), heroClass: face(), effectId: derived(), bannedPlayerCounts: face("No player-count restriction printed") },
  },
  {
    ...base("Feral Dragon", "Each time any player sacrifices a card, DRAW a card."), kind: "monster",
    requirement: [{ kind: "any" }, { kind: "any" }],
    slay: { op: "gte", value: 9 }, penaltyRange: { op: "lte", value: 6 },
    penalty: { effectId: "penalty.sacrifice_hero", count: 1 }, penaltyText: "SACRIFICE a Hero card.", slainEffectId: "monster.feral-dragon",
    provenance: { text: face(), requirement: face("Printed H icons, any class"), slay: face(), penaltyRange: face(), penalty: face(), penaltyText: face(), slainEffectId: derived() },
  },
  {
    ...base("Muscipula Rex", "Once per turn on your turn, you may DRAW a card without spending an action point."), kind: "monster",
    requirement: [{ kind: "any" }, { kind: "any" }, { kind: "any" }],
    slay: { op: "gte", value: 10 }, penaltyRange: { op: "lte", value: 7 },
    penalty: { effectId: "penalty.sacrifice_hero", count: 1 }, penaltyText: "SACRIFICE a Hero card.", slainEffectId: "monster.muscipula-rex",
    provenance: { text: face(), requirement: face("Printed H icons, any class"), slay: face(), penaltyRange: face(), penalty: face(), penaltyText: face(), slainEffectId: derived() },
  },
];

/** Effects whose engine behaviour already exists and is tested. Everything else is still pending (EX-03 slices). */
export const WD_IMPLEMENTED_EFFECTS: ReadonlySet<string> = new Set([
  "item.bottomless-bag", // C08 override + paid repeats (EX-02 B2)
  "item.temporal-hourglass", // failure-only AP offer (EX-02 B2)
  "item.druid-mask", // generic Mask class replacement
  "item.warrior-mask",
  "hero.doe-fallow", // sacrifice + draw to 7 (EX-03 H1)
  "hero.glowing-antler", // up to 2 Magic plays (EX-03 H1)
  "hero.magus-moose", // discard Hero -> hand -> play (EX-03 H1)
  "magic.rapid-refresh", // discard hand, draw 4 (EX-03 H1)
  "hero.agile-dagger", "hero.hardened-hunter", "hero.looting-lupo", "hero.blinding-blade", // EX-03 H4
  "hero.critical-fang", "hero.wolfgang-pack", "hero.stagguard", "hero.maegisty",
  "item.even-bigger-ring", "leader.the-piercing-howl",
  "hero.silent-shield", "item.cursed-glove", "item.soul-tether", "monster.feral-dragon", // EX-03 H5 (W02/W03/W10/W11)
]);

export const WD_UNIMPLEMENTED_EFFECTS: readonly string[] = WD_CARD_DATA.flatMap((card) => {
  const id = "effectId" in card ? card.effectId : card.kind === "monster" ? card.slainEffectId : null;
  return id && !WD_IMPLEMENTED_EFFECTS.has(id) ? [id] : [];
});
