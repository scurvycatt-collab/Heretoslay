// Action-cost resolver (EX-02, E10): the single source for server validation, bots and UI hints.
// Free actions (entry roll, Goblet/Mirroryu-granted attempts) never go through this: Grimoire only
// reprices PAID roll actions. Callers pass the paid flag explicitly rather than assuming it.

import { hasAttachment } from "./attachments.ts";
import { SOULBOUND_GRIMOIRE } from "./expansion-ids.ts";
import type { PartyHero } from "./base-rules.ts";

export const BASE_HERO_EFFECT_COST = 1;
export const GRIMOIRE_HERO_EFFECT_COST = 2;

/** AP for a PAID Hero effect roll (including a Bag repeat). Printed Grimoire text sets it to two. */
export function paidHeroEffectCost(hero: PartyHero): number {
  return hasAttachment(hero, SOULBOUND_GRIMOIRE) ? GRIMOIRE_HERO_EFFECT_COST : BASE_HERO_EFFECT_COST;
}
