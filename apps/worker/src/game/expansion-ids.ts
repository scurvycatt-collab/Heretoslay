// Definition IDs of expansion cards the engine special-cases. Resolved from the reviewed draft index
// by canonical name once at load, so a rename fails loudly instead of silently disabling a rule.
import { EXPANSION_FACE_DRAFTS } from "../content/expansion-drafts.ts";

function idOf(name: string, setKey?: string): string {
  const face = EXPANSION_FACE_DRAFTS.find((entry) => entry.canonicalName === name && (!setKey || entry.setKey === setKey));
  if (!face) throw new Error(`Unknown expansion card: ${name}`);
  return face.definitionId;
}

export const SOULBOUND_GRIMOIRE = idOf("Soulbound Grimoire");
export const BOTTOMLESS_BAG = idOf("Bottomless Bag");
export const TEMPORAL_HOURGLASS = idOf("Temporal Hourglass");
export const GOBLET_OF_CAFFEINATION = idOf("Goblet of Caffeination");

// M01–M04 (Warriors & Druids Modifiers); M05–M08 arrive with BN/DS.
export const WD_MODIFIER_PLUS_1_MINUS_1 = idOf("Modifier +1/-1", "warriorsDruids");
export const WD_MODIFIER_PLUS_2_MINUS_1 = idOf("Modifier +2/-1", "warriorsDruids");
export const WD_MODIFIER_PLUS_4 = idOf("Modifier +4", "warriorsDruids");
export const WD_MODIFIER_MINUS_4 = idOf("Modifier -4", "warriorsDruids");
export const EVEN_BIGGER_RING = idOf("Even Bigger Ring");
export const PIERCING_HOWL = idOf("The Piercing Howl");
export const SOUL_TETHER = idOf("Soul Tether");
export const CURSED_GLOVE = idOf("Cursed Glove");
export const FERAL_DRAGON = idOf("Feral Dragon");
export const MUSCIPULA_REX = idOf("Muscipula Rex");
export const NOBLE_SHAMAN = idOf("The Noble Shaman");
export const MAJESTELK = idOf("Majestelk");

// EX-04 (Berserkers & Necromancers)
export const GNAWING_DREAD = idOf("The Gnawing Dread");
export const RAGING_MANTICORE = idOf("The Raging Manticore");
export const REPTILIAN_RIPPER = idOf("Reptilian Ripper");
export const DOOMBRINGER = idOf("Doombringer");
export const BIGGEST_RING_EVER = idOf("Biggest Ring Ever");
export const SILVER_LINING = idOf("Silver Lining");
export const DRAGONS_BILE = idOf("Dragon's Bile");
export const BN_MODIFIER_PLUS_2_MINUS_2 = idOf("Modifier +2/-2", "berserkersNecromancers");
export const BN_MODIFIER_PLUS_7 = idOf("Modifier +7", "berserkersNecromancers");

// EX-05 (Dragon Sorcerer v2)
export const FEARLESS_FLAME = idOf("The Fearless Flame");
export const CALAMITY_MONGREL = idOf("Calamity Mongrel");
export const DS_MODIFIER_PLUS_6 = idOf("Modifier +6", "dragonSorcerer");
export const DS_MODIFIER_MINUS_6 = idOf("Modifier -6", "dragonSorcerer");
