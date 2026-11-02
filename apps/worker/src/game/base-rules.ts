// Pure rule helpers for mode "base" (GAME-002): classes, Monster requirement
// matching, roll passives. Card facts come from GAME-004 card data.

import type { BaseGameSettings, HeroClass, MonsterCardData } from "@here-to-slay/protocol";
import { BASE_CARDS_BY_ID, cardDataOfKind } from "../content/base-cards.ts";
import type { BaseCard } from "./base-content.ts";

export interface PartyHero {
  card: BaseCard;
  item: BaseCard | null;
}

export interface Protections {
  /** "Hero cards in your Party cannot be destroyed until your next turn" (Mighty Blade). */
  noDestroy: boolean;
  /** "… cannot be stolen until your next turn" (Calming Voice). */
  noSteal: boolean;
}

export interface RulesSeat {
  playerId: string;
  leaderId: string | null;
  hand: BaseCard[];
  party: PartyHero[];
  /** Slain Monster instance ids, in slay order. */
  slain: string[];
  protections: Protections;
}

export const DEFAULT_SETTINGS: BaseGameSettings = {
  reactionSeconds: 20,
  choiceSeconds: 30,
  leaderFillsClassSlot: false,
  maskMode: "add",
  leaderPassiveUsesModifierSlot: false,
};

export function monsterDefinitionId(instanceId: string): string {
  const hash = instanceId.indexOf("#");
  return hash < 0 ? instanceId : instanceId.slice(0, hash);
}

export function monsterData(instanceId: string): MonsterCardData {
  const data = cardDataOfKind(monsterDefinitionId(instanceId), "monster");
  if (!data) throw new Error(`Not a monster: ${instanceId}`);
  return data;
}

export function cardName(definitionId: string): string {
  return BASE_CARDS_BY_ID.get(definitionId)?.name ?? definitionId;
}

export function leaderClass(seat: { leaderId: string | null }): HeroClass | null {
  return seat.leaderId ? cardDataOfKind(seat.leaderId, "party_leader")?.heroClass ?? null : null;
}

/** Classes a Party Hero counts as (Q-04: Mask adds its class; `replace` follows the card text). */
export function heroClasses(hero: PartyHero, settings: BaseGameSettings): HeroClass[] {
  const own = cardDataOfKind(hero.card.definitionId, "hero")?.heroClass;
  const mask = hero.item ? cardDataOfKind(hero.item.definitionId, "item")?.maskClass ?? null : null;
  if (mask && settings.maskMode === "replace") return [mask];
  const classes = own ? [own] : [];
  if (mask && !classes.includes(mask)) classes.push(mask);
  return classes;
}

/** Distinct classes in a Party, Leader included (RULE-23 class win). */
export function partyClasses(seat: RulesSeat, settings: BaseGameSettings): HeroClass[] {
  const set = new Set<HeroClass>();
  const leader = leaderClass(seat);
  if (leader) set.add(leader);
  for (const hero of seat.party) for (const heroClass of heroClasses(hero, settings)) set.add(heroClass);
  return [...set];
}

/** "with a <class> in their Party" — Leader is in the Party, so its class counts. */
export function hasClassInParty(seat: RulesSeat, heroClass: HeroClass, settings: BaseGameSettings): boolean {
  return partyClasses(seat, settings).includes(heroClass);
}

/**
 * MON-01..06: injective assignment of Party Heroes to requirement slots (bipartite
 * matching, needed once Masks give a Hero two classes). The Leader is never a Hero
 * (does not fill `any`); it fills a class slot only if `leaderFillsClassSlot` (Q-01).
 */
export function meetsRequirement(seat: RulesSeat, monster: MonsterCardData, settings: BaseGameSettings): boolean {
  type Unit = HeroClass[] | { leader: HeroClass };
  const units: Unit[] = seat.party.map((hero) => heroClasses(hero, settings));
  const leader = leaderClass(seat);
  if (settings.leaderFillsClassSlot && leader) units.push({ leader });
  const fits = (unit: Unit, slot: MonsterCardData["requirement"][number]) =>
    Array.isArray(unit)
      ? slot.kind === "any" || unit.includes(slot.heroClass)
      : slot.kind === "class" && slot.heroClass === unit.leader;
  const slotOwner: number[] = new Array(monster.requirement.length).fill(-1);
  const tryAssign = (unitIndex: number, seen: boolean[]): boolean => {
    for (let slot = 0; slot < monster.requirement.length; slot += 1) {
      if (seen[slot] || !fits(units[unitIndex], monster.requirement[slot])) continue;
      seen[slot] = true;
      if (slotOwner[slot] < 0 || tryAssign(slotOwner[slot], seen)) {
        slotOwner[slot] = unitIndex;
        return true;
      }
    }
    return false;
  };
  for (let unit = 0; unit < units.length; unit += 1) tryAssign(unit, new Array(monster.requirement.length).fill(false));
  return slotOwner.every((owner) => owner >= 0);
}

export function slainHas(seat: RulesSeat, slug: string): boolean {
  return seat.slain.some((id) => monsterDefinitionId(id) === `hts.base.v1.monster.${slug}`);
}

export function leaderIs(seat: RulesSeat, slug: string): boolean {
  return seat.leaderId === `hts.base.v1.party-leader.${slug}`;
}

export interface Passive {
  source: string;
  label: string;
  value: number;
}

/**
 * Automatic roll bonuses (not Modifiers; Q-11 shows them separately).
 * `turnRollBonus` applies only when `seat` is the active player.
 */
export function rollPassives(
  seat: RulesSeat,
  kind: "hero_effect" | "attack" | "challenge_challenger" | "challenge_defender",
  opts: { hero?: PartyHero; turnRollBonus?: number },
): Passive[] {
  const out: Passive[] = [];
  const add = (source: string, label: string, value: number) => out.push({ source, label, value });
  if (opts.turnRollBonus) add("turn", "Hiệu ứng đến hết lượt", opts.turnRollBonus);
  if (slainHas(seat, "anuran-cauldron")) add("hts.base.v1.monster.anuran-cauldron", "Anuran Cauldron (đã slay)", 1);
  if (kind === "hero_effect") {
    if (leaderIs(seat, "the-charismatic-song")) add("hts.base.v1.party-leader.the-charismatic-song", "passive của Leader: The Charismatic Song", 1);
    if (slainHas(seat, "dark-dragon-king")) add("hts.base.v1.monster.dark-dragon-king", "Dark Dragon King (đã slay)", 1);
    const item = opts.hero?.item?.definitionId;
    if (item === "hts.base.v1.item.really-big-ring") add(item, "Really Big Ring", 2);
    if (item === "hts.base.v1.cursed-item.curse-of-the-snakes-eyes") add(item, "Curse of the Snake's Eyes", -2);
  }
  if (kind === "attack" && leaderIs(seat, "the-divine-arrow")) {
    add("hts.base.v1.party-leader.the-divine-arrow", "passive của Leader: The Divine Arrow", 1);
  }
  if (kind === "challenge_challenger") {
    if (leaderIs(seat, "the-fist-of-reason")) add("hts.base.v1.party-leader.the-fist-of-reason", "passive của Leader: The Fist of Reason", 2);
    if (slainHas(seat, "titan-wyvern")) add("hts.base.v1.monster.titan-wyvern", "Titan Wyvern (đã slay)", 1);
  }
  return out;
}

export function classifyAttack(final: number, monster: MonsterCardData): "slay" | "penalty" | "none" {
  const hit = (range: { op: "gte" | "lte"; value: number }) =>
    range.op === "gte" ? final >= range.value : final <= range.value;
  if (hit(monster.slay)) return "slay";
  if (hit(monster.penaltyRange)) return "penalty";
  return "none";
}
