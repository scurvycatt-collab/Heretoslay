// Definition IDs of expansion cards the engine special-cases. Resolved from the reviewed draft index
// by canonical name once at load, so a rename fails loudly instead of silently disabling a rule.
import { EXPANSION_FACE_DRAFTS } from "../content/expansion-drafts.ts";

function idOf(name: string): string {
  const face = EXPANSION_FACE_DRAFTS.find((entry) => entry.canonicalName === name);
  if (!face) throw new Error(`Unknown expansion card: ${name}`);
  return face.definitionId;
}

export const SOULBOUND_GRIMOIRE = idOf("Soulbound Grimoire");
export const BOTTOMLESS_BAG = idOf("Bottomless Bag");
export const TEMPORAL_HOURGLASS = idOf("Temporal Hourglass");
export const GOBLET_OF_CAFFEINATION = idOf("Goblet of Caffeination");
