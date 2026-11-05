// Turn-loop engine for mode "base" (GAME-002): chain of Challenge window →
// Modifier window → resolution, effect steps, pending choices, deadlines.
// Pure: no I/O; dice/ids/shuffle/clock are injected. Spec: docs/rules/
// RULES-001_TURN_LOOP_SPEC.md + owner decisions Q-01..Q-12 (product-decisions.md).
// Card facts: GAME-004 (apps/worker/src/content/base-cards.json).

import type {
  BaseCardKind,
  BaseGameSettings,
  BaseTargets,
  TargetRule,
} from "@here-to-slay/protocol";
import { cardDataOfKind } from "../content/base-cards.ts";
import type { BaseCard } from "./base-content.ts";
import { CALAMITY_MONGREL, DS_MODIFIER_MINUS_6, DS_MODIFIER_PLUS_6, FEARLESS_FLAME, BIGGEST_RING_EVER, BN_MODIFIER_PLUS_2_MINUS_2, BN_MODIFIER_PLUS_7, DOOMBRINGER, DRAGONS_BILE, RAGING_MANTICORE, SILVER_LINING, CURSED_GLOVE, FERAL_DRAGON, MAJESTELK, MUSCIPULA_REX, NOBLE_SHAMAN, GOBLET_OF_CAFFEINATION, SOUL_TETHER, TEMPORAL_HOURGLASS, WD_MODIFIER_PLUS_1_MINUS_1, WD_MODIFIER_PLUS_2_MINUS_1, WD_MODIFIER_MINUS_4, WD_MODIFIER_PLUS_4 } from "./expansion-ids.ts";
import { canAttach, detach, detachAll, hasAttachment, hasCursedAttachment, isAttachable } from "./attachments.ts";
import {
  cardName,
  classifyAttack,
  hasClassInParty,
  heroClasses,
  leaderIs,
  monsterData,
  meetsRequirement,
  monsterDefinitionId,
  rollMeets,
  rollPassives,
  slainHas,
  type PartyHero,
  type RollComparator,
  type Passive,
  type RulesSeat,
} from "./base-rules.ts";
import { drawCards, type SetupTable } from "./setup-core.ts";

export const LOG_LIMIT = 30;
export const PARTY_CARD_LIMIT = 6;

export interface BaseSeat extends RulesSeat {}

export interface Attempt {
  actorId: string;
  card: BaseCard;
  targets: BaseTargets;
  /**
   * RA-01/C03: steps of the PARENT effect that must run only after this (nested) play fully resolved
   * (Challenge, effect, cleanup). Serializable; also applied when a Challenge negates the card.
   */
  continuation?: Step[];
}

export interface ModifierEntry {
  playerId: string;
  cardId: string;
  value: number;
  side?: "challenger" | "defender";
}

export interface SidedPassive extends Passive {
  side?: "challenger" | "defender";
}

export type RollState =
  | {
      kind: "hero_effect";
      rollerId: string;
      dice: [number, number];
      heroCardId: string;
      threshold: number;
      /** Absent in legacy saves = "gte". */
      comparator?: RollComparator;
      targets: BaseTargets;
      modifiers: ModifierEntry[];
      passives: SidedPassive[];
    }
  | {
      kind: "attack";
      rollerId: string;
      dice: [number, number];
      monsterId: string;
      modifiers: ModifierEntry[];
      passives: SidedPassive[];
    }
  | {
      kind: "challenge";
      /** The defender (player whose card is challenged). */
      rollerId: string;
      dice: [number, number];
      challengerId: string;
      challengerDice: [number, number];
      attempt: Attempt;
      modifiers: ModifierEntry[];
      passives: SidedPassive[];
    };

/** "confirm": a yes/no for a "may" clause (owner 2026-11-02: ask the player). */
export type ChoiceKind =
  | "discard"
  | "sacrifice_hero"
  | "give_card"
  | "take_from_discard"
  | "discard_from_set"
  | "confirm"
  /** Play a card from hand for free ("play it immediately"); RESOLVE_CHOICE.targets apply. */
  | "play_card"
  /** Pick a Hero in another Party to DESTROY. */
  | "destroy_hero"
  /** Bullseye: pick 1 of the top 3 deck cards (private to the chooser). */
  | "take_from_top"
  /** Bullseye: put the remaining top cards back in the chosen order (ids, top first; private). */
  | "order_top"
  /** Sharp Fox: look at another player's hand (private); resolve with []. */
  | "view_hand"
  /** Silent Shadow: take 1 card from another player's hand (seen). */
  | "take_from_hand"
  /** Tenacious Timber (W06): pick Heroes in other Parties to STEAL, all at once. */
  | "steal_hero"
  /** Buck Omens (W05): pick a Hero in another player's hand to bring straight into your Party. */
  | "bring_hero"
  /** Big Buckley (W04): pick a face-up Monster whose Party requirement you meet, to ATTACK now. */
  | "attack_monster"
  /** Bone Collector (BN): pick an Item equipped in your own Party to SACRIFICE. */
  | "sacrifice_item"
  /** Roaryal Guard (BN): name a Class by picking a Hero in play; every Hero of its (effective) Class returns to hand. */
  | "choose_class"
  /** Lightning Labrys (BN): pick a Hero in any Party; its owner must SACRIFICE a Hero card. */
  | "make_sacrifice"
  /** Vicious Wildcat (BN): pick any face-up Monster to SLAY directly (no roll, no Party requirement). */
  | "slay_monster";

/** Extra fields shared by a choice step and the pending choice it opens. */
export interface ChoiceExtras {
  filterKinds?: BaseCardKind[];
  fromCardIds?: string[];
  recipientId?: string;
  /** view_hand / take_from_hand: whose hand. */
  targetPlayerId?: string;
  /** confirm: run if accepted. */
  then?: Step[];
  /** confirm: run if declined (or timed out). */
  otherwise?: Step[];
  /** confirm: steps to run on timeout instead of `otherwise` (Majestelk: none — keep the roll as it is). */
  onTimeout?: Step[];
  /** play_card: run after a card was picked, played and fully resolved (nested play, C03). */
  thenIfPicked?: Step[];
  /**
   * C01: required payment. The dependent benefit runs only when the full payment was made;
   * insufficient cards, timeout or no choice grant nothing (never auto-paid).
   */
  thenIfPaid?: Step[];
  /** discard: run these steps once per discarded card (Qi Bear). */
  perCardThen?: Step[];
  /** discard: remember discarded ids in game.collected (Beary Wise). */
  collect?: boolean;
  /** take_from_discard: cards that may not be picked (M04: the resolving -4 cannot recover itself). */
  excludeCardIds?: string[];
  /** take_from_discard: "add it to your hand, then play it immediately" (Magus Moose). */
  thenPlayTaken?: boolean;
  /** take_from_hand: "you may play it immediately" — an optional play of the taken card (Hollow Husk). */
  thenOfferPlayTaken?: boolean;
  /** sacrifice_hero: then DESTROY as many Hero cards as were sacrificed (Rabid Beast). */
  destroyEqual?: boolean;
  /** destroy_hero: if the chosen Hero is of this effective Class, run `steps` once it is really destroyed (Unbridled Fury). */
  thenIfClass?: { heroClass: string; steps: Step[] };
}

export interface PendingChoice extends ChoiceExtras {
  choiceId: string;
  playerId: string;
  kind: ChoiceKind;
  min: number;
  max: number;
  prompt: string;
  deadlineAt: number;
}

export type Chain =
  | {
      step: "challenge_window";
      windowId: string;
      deadlineAt: number;
      attempt: Attempt;
      responders: Record<string, "pending" | "passed">;
    }
  | {
      step: "modifier_window";
      windowId: string;
      deadlineAt: number;
      roll: RollState;
      /** C10: a Modifier play does not complete a participant; only Skip ("passed") does. */
      responders: Record<string, "pending" | "passed">;
    }
  | { step: "immediate_roll_choice"; deadlineAt: number; actorId: string; heroCardId: string }
  | { step: "choice"; choice: PendingChoice };

/** Serializable effect steps, run in order; a `choice` step suspends the queue. */
export type Step =
  | {
      op: "draw";
      playerId: string;
      n: number;
      /** "If that card is a <kind>, you may play it immediately." */
      offerPlayIfKind?: BaseCardKind[];
      /** Steps after the offered card was played (Snowball: DRAW a second card). */
      offerThen?: Step[];
      /** "If at least one of those cards is a <kind> …" (Pan Chucks). */
      ifAnyKindThen?: { kinds: BaseCardKind[]; steps: Step[]; revealSource?: string };
      /** Internal: skip slain-Monster draw triggers (none currently). */
      quiet?: boolean;
      /** C04: compute draw-trigger steps now but run them later (`flush_draw_triggers`). */
      deferTriggers?: boolean;
    }
  | { op: "offer_immediate_roll"; playerId: string; heroCardId: string }
  | { op: "draw_to"; playerId: string; n: number }
  /** DISCARD every card in the player's hand (Rapid Refresh); no-op on an empty hand. */
  | { op: "discard_hand"; playerId: string }
  | ({
      op: "choice";
      playerId: string;
      kind: ChoiceKind;
      count: number;
      upTo?: boolean;
      prompt: string;
      /** take_from_discard limited to game.collected (Beary Wise). */
      fromCollected?: boolean;
    } & ChoiceExtras)
  | { op: "destroy"; heroCardId: string; byPlayerId: string; itemToPlayerId?: string; noStealInstead?: boolean; thenIfReal?: Step[] }
  | { op: "steal"; heroCardId: string; toPlayerId: string }
  | { op: "move_hero"; heroCardId: string; toPlayerId: string; onlyIfOwns?: { heroCardId: string; playerId: string } }
  | { op: "discard_card"; card: BaseCard }
  | { op: "trade_hands"; a: string; b: string }
  | { op: "pull"; fromPlayerId: string; toPlayerId: string; n: number; extraIfKind?: BaseCardKind; thenDiscardOne?: boolean; offerPlayIfKind?: BaseCardKind[]; ifKindThen?: { kind: BaseCardKind; steps: Step[] } }
  | { op: "roll_bonus"; n: number }
  /** +n to the active player's ATTACK rolls until the end of the turn (Critical Fang). */
  | { op: "attack_bonus"; n: number }
  /** DRAW one card per qualifying card, counted when this step runs (Hardened Hunter, Looting Lupo). */
  | { op: "draw_for"; playerId: string; rule: "other_party_monsters" | "own_equipped_items" }
  /** Return every equipped Item in `fromPlayerId`'s Party to `toPlayerId`'s hand (Blinding Blade). */
  | { op: "return_party_items"; fromPlayerId: string; toPlayerId: string }
  /** Nobody but `playerId` may play Modifier cards until the end of the turn (Stagguard). */
  | { op: "lock_modifiers"; playerId: string }
  /** Silent Shield: arm the sacrifice/destroy Hero-recovery trigger for `playerId` until the end of the turn (W03). */
  | { op: "arm_silent_shield"; playerId: string }
  /** Beast Call (W07): face-up Monsters to the bottom of the deck, flip the top 3 face up. */
  | { op: "rotate_monsters" }
  /** Majestelk (W01): one more ±5 activation for the player until their next turn. */
  | { op: "add_roll_swing"; playerId: string }
  /** Majestelk popup result: add a ±value passive to the roll waiting in the queue's `open_modifier_window` step. */
  | { op: "apply_roll_swing"; value: number; source: string; label?: string; side?: "challenger" | "defender" }
  /** Opens the Modifier window of a roll once its Majestelk popups are settled. */
  | { op: "open_modifier_window"; roll: RollState }
  /** Big Buckley (W04): ATTACK `monsterId` now with no AP (handled in advance(), which owns the hooks). */
  | { op: "attack_monster_now"; playerId: string; monsterId: string }
  /** Soul Tether: SACRIFICE the equipped Hero because another Hero in the Party was lost (W11). */
  | { op: "tether_sacrifice"; heroCardId: string }
  /** SACRIFICE one specific Hero (Perfect Vessel sacrifices itself); credited like any sacrifice (E06). */
  | { op: "sacrifice_hero_card"; heroCardId: string }
  /** Vicious Wildcat (BN): "then end your turn" — no action points remain once the queue drains. */
  | { op: "end_turn_now" }
  /** Dystortivern (DS): the two players trade Party Leader cards. */
  | { op: "swap_leaders"; a: string; b: string }
  /** Calamity Mongrel (DS): DISCARD one exact card from the player's hand (only if it is still there). */
  | { op: "discard_from_hand"; playerId: string; cardId: string }
  /** Brawling Spirit (BN): every player with more than 3 cards in their Party (Heroes + equipped Items) SACRIFICEs a Hero. */
  | { op: "brawling_spirit"; actorId: string }
  /** Roaryal Guard (BN): return every Hero of this effective Class to its owner's hand (attachments follow). */
  | { op: "return_class_heroes"; heroClass: string; exceptHeroCardId?: string }
  /** E10: an explicit AP grant (Temporal Hourglass); never a retry. */
  | { op: "gain_ap"; playerId: string; n: number }
  /** Sacrifice-by-discard of one exact attachment (credited-sacrifice events arrive with EX-02 B3). */
  | { op: "discard_attachment"; heroCardId: string; itemCardId: string }
  /** E04: fresh roll + Modifier window for an already-used Hero; costs no AP here (Goblet). */
  | { op: "retry_hero_roll"; playerId: string; heroCardId: string; targets: BaseTargets }
  | { op: "protect"; playerId: string; kind: "noDestroy" | "noSteal" | "returnToHand" }
  /** Executes the owner-selected replacement (E07) for a Hero that would be sacrificed/destroyed. */
  | { op: "resolve_hero_loss"; heroCardId: string; via: "decoy" | "return" | "none"; cause: HeroLossCause }
  | { op: "no_challenge" }
  | { op: "return_item"; heroCardId: string; onlyCursed?: boolean; itemCardId?: string; toPlayerId?: string }
  | { op: "return_all_items" }
  | { op: "pull_from_class"; toPlayerId: string; heroClass: "thief" }
  | { op: "each_other_choice"; actorId: string; kind: "discard" | "sacrifice_hero" | "give_card"; count: number; requireClass?: "fighter"; collect?: boolean }
  /** C04: move the pending slain Monster into the Party, then check the win (hooks.afterSlay). */
  | { op: "award_monster"; playerId: string; monsterId: string }
  /** C04: release draw triggers deferred by `deferTriggers` (passives run only after award/win check). */
  | { op: "flush_draw_triggers" }
  /** C06: publicly reveal one card from the player's hand (only if it is still there). */
  | { op: "reveal"; playerId: string; cardId: string; source: string }
  | { op: "refill_monsters"; slot: number }
  | { op: "log"; text: string };

export type RollOutcome = "success" | "fail" | "slay" | "penalty" | "none" | "challenge_succeeded" | "challenge_failed";

/** Last resolved roll, kept for the client's result screen (display only). */
export interface LastRoll {
  id: string;
  resolvedAt: number;
  roll: RollState;
  outcome: RollOutcome;
  /** Hero (effect) or challenged card; null for attacks or a Hero that left play. */
  subject: BaseCard | null;
}

export interface EngineState extends SetupTable<BaseCard> {
  seats: BaseSeat[];
  discard: BaseCard[];
  settings: BaseGameSettings;
  heroRollsUsed: string[];
  turnRollBonus: number;
  /** ATTACK-only turn bonus (Critical Fang); absent in legacy saves = 0. */
  turnAttackBonus?: number;
  /** Stagguard: the only player allowed to play Modifier cards this turn; absent/null = no lock. */
  modifierLockBy?: string | null;
  /** Silent Shield (W03): the active player whose sacrifices/destroys may recover a Hero this turn; absent/null = off. */
  silentShieldBy?: string | null;
  /** Muscipula Rex (W08): free draw-only credits left this turn; absent = 0. */
  freeDrawCredit?: number;
  /** The Noble Shaman (W09): used this turn; reset at every turn start. */
  shamanUsed?: boolean;
  noChallengeThisTurn: boolean;
  leaderActionUsed: boolean;
  chain: Chain | null;
  queue: Step[];
  winnerPlayerId: string | null;
  winReason: "slay_3" | "six_classes" | null;
  log: Array<{ seq: number; text: string }>;
  logSeq: number;
  /** playerId → nickname, mirrored from the roster for log lines. */
  names: Record<string, string>;
  /** Card ids collected by `collect` discards for a follow-up step (Beary Wise). */
  collected: string[];
  lastRoll?: LastRoll | null;
  /**
   * C04: a successfully slain Monster held outside the face-up row and the Party while its reward resolves,
   * so it cannot be attacked again, vanish, or count as owned. Cleared by `award_monster`.
   */
  pendingMonster?: { playerId: string; monsterId: string; slot: number } | null;
  /** C04: draw-trigger steps computed at draw time, waiting for `flush_draw_triggers`. */
  deferredSteps?: Step[];
  /** C06: bounded public reveals (selected card only; never the whole hand). */
  reveals?: RevealEvent[];
}

/** C06: a card explicitly revealed to everyone (players and spectators). */
export interface RevealEvent {
  revealId: string;
  playerId: string;
  source: string;
  card: BaseCard;
  revealedAt: number;
  expiresAt: number;
}

/** C06 lifetime: how long the UI shows a reveal, and how many are retained. */
export const REVEAL_VISIBLE_MS = 10_000;
export const REVEAL_KEEP = 5;

export function pruneReveals(game: EngineState, now: number): void {
  if (!game.reveals) return;
  game.reveals = game.reveals.filter((reveal) => reveal.expiresAt > now).slice(-REVEAL_KEEP);
}

export interface EngineDeps {
  newId: () => string;
  shuffle: (cardIds: string[]) => string[];
  rollDice: () => readonly [number, number];
  now: () => number;
}

/** Hooks the turn module provides (turn end / win checks live there). */
export interface EngineHooks {
  /** Called when the chain and queue are empty and AP ≤ 0 (TL-AUTO-END). */
  autoEndTurn: (game: EngineState, deps: EngineDeps) => void;
  /** Called right after a Monster is slain (WIN-SLAY-T). Returns true if the game ended. */
  afterSlay: (game: EngineState, seat: BaseSeat) => boolean;
  /** Called after a valid Modifier card is consumed. */
  afterModifierPlayed?: (game: EngineState) => void;
}

// ---------------------------------------------------------------- helpers

export function log(game: EngineState, text: string): void {
  game.logSeq += 1;
  game.log.push({ seq: game.logSeq, text });
  if (game.log.length > LOG_LIMIT) game.log.splice(0, game.log.length - LOG_LIMIT);
}

export function seatOf(game: EngineState, playerId: string): BaseSeat | undefined {
  return game.seats.find((seat) => seat.playerId === playerId);
}

export function findHero(game: EngineState, heroCardId: string): { seat: BaseSeat; index: number; hero: PartyHero } | null {
  for (const seat of game.seats) {
    const index = seat.party.findIndex((hero) => hero.card.cardId === heroCardId);
    if (index >= 0) return { seat, index, hero: seat.party[index] };
  }
  return null;
}

export function activePlayerId(game: EngineState): string | null {
  return game.phase === "turn_active" ? game.turnOrder[game.currentPlayerIndex] ?? null : null;
}

export function isBusy(game: EngineState): boolean {
  return game.chain !== null || game.queue.length > 0;
}

/** Display name for log lines (names mirrored from the room roster). */
const whoName = (game: EngineState, playerId: string) => game.names[playerId] ?? playerId;

function sumDice(dice: readonly [number, number]): number {
  return dice[0] + dice[1];
}

export function rollTotals(roll: RollState): { total: number; challengerTotal?: number } {
  const side = (s: "challenger" | "defender" | undefined) => (entry: { side?: string }) =>
    roll.kind !== "challenge" || entry.side === s;
  const add = (list: Array<{ value: number; side?: string }>, s?: "challenger" | "defender") =>
    list.filter(side(s)).reduce((sum, entry) => sum + entry.value, 0);
  if (roll.kind === "challenge") {
    return {
      total: sumDice(roll.dice) + add(roll.modifiers, "defender") + add(roll.passives, "defender"),
      challengerTotal: sumDice(roll.challengerDice) + add(roll.modifiers, "challenger") + add(roll.passives, "challenger"),
    };
  }
  return { total: sumDice(roll.dice) + add(roll.modifiers) + add(roll.passives) };
}

function moveHeroToDiscard(game: EngineState, found: { seat: BaseSeat; index: number; hero: PartyHero }, itemToPlayerId?: string): void {
  found.seat.party.splice(found.index, 1);
  game.discard.push(found.hero.card);
  const itemOwner = itemToPlayerId ? seatOf(game, itemToPlayerId) : undefined;
  for (const attachment of detachAll(found.hero)) {
    if (itemOwner) itemOwner.hand.push(attachment);
    else game.discard.push(attachment);
  }
}

const DECOY_DOLL = "hts.base.v1.item.decoy-doll";

export interface HeroLossCause {
  kind: "sacrifice" | "destroy";
  byPlayerId?: string;
  itemToPlayerId?: string;
  /** Run after the Hero really leaves the Party (not when Decoy Doll / Maegisty replaced the loss). */
  thenIfReal?: Step[];
}

/**
 * A Hero is about to be sacrificed or destroyed. The cost/effect that required a SACRIFICE is already
 * credited by its caller (E06: Decoy Doll and Maegisty still count). Only the physical movement varies:
 *  - Decoy Doll: the Doll goes to discard, the Hero stays.
 *  - Maegisty (`protections.returnToHand`): the Hero and its attachments return to the owner's hand.
 * With both eligible the owner chooses (E07); a timeout takes the Maegisty return. A replaced DESTROY is
 * not a real destruction, so it never fires "Hero destroyed" triggers.
 */
function loseHero(game: EngineState, found: { seat: BaseSeat; index: number; hero: PartyHero }, cause: HeroLossCause, deps: EngineDeps): void {
  const decoy = found.hero.attachments.some((card) => card.definitionId === DECOY_DOLL);
  const returns = Boolean(found.seat.protections.returnToHand);
  const heroCardId = found.hero.card.cardId;
  if (decoy && returns) {
    game.queue.unshift({
      op: "choice", playerId: found.seat.playerId, kind: "confirm", count: 1,
      prompt: `${cardName(found.hero.card.definitionId)}: dùng Decoy Doll (Hero ở lại) thay vì Maegisty (Hero về tay)?`,
      then: [{ op: "resolve_hero_loss", heroCardId, via: "decoy", cause }],
      otherwise: [{ op: "resolve_hero_loss", heroCardId, via: "return", cause }],
    });
    return;
  }
  // No choice needed: move now, so a dependent effect (thenIfPaid) can never run before the loss.
  resolveHeroLoss(game, { op: "resolve_hero_loss", heroCardId, via: decoy ? "decoy" : returns ? "return" : "none", cause }, deps);
}

function resolveHeroLoss(game: EngineState, step: Extract<Step, { op: "resolve_hero_loss" }>, deps: EngineDeps): void {
  const found = findHero(game, step.heroCardId);
  if (!found) return; // idempotent replay: the Hero already left the Party
  const name = cardName(found.hero.card.definitionId);
  const doll = found.hero.attachments.find((card) => card.definitionId === DECOY_DOLL);
  // Revalidate the selected replacement; otherwise fall through to the next one, then the normal loss.
  if (step.via === "decoy" && doll) {
    game.discard.push(detach(found.hero, doll.cardId)!);
    log(game, `Decoy Doll bảo vệ ${name} (Decoy Doll vào discard)`);
    afterHeroLost(game, found.seat, step.cause, found.hero.card.cardId, false);
    return;
  }
  if ((step.via === "return" || (step.via === "decoy" && !doll)) && found.seat.protections.returnToHand) {
    found.seat.party.splice(found.index, 1);
    found.seat.hand.push(found.hero.card, ...detachAll(found.hero));
    log(game, `Maegisty: ${name} trở về tay ${whoName(game, found.seat.playerId)} thay vì ${step.cause.kind === "destroy" ? "DESTROY" : "SACRIFICE"}`);
    afterHeroLost(game, found.seat, step.cause, found.hero.card.cardId, false);
    return;
  }
  moveHeroToDiscard(game, found, step.cause.itemToPlayerId);
  if (step.cause.kind === "destroy") {
    log(game, `${whoName(game, step.cause.byPlayerId ?? "")} DESTROY ${name} của ${whoName(game, found.seat.playerId)}`);
    afterHeroDestroyed(game, found.seat, deps);
  } else {
    log(game, `${whoName(game, found.seat.playerId)} SACRIFICE ${name}`);
  }
  afterHeroLost(game, found.seat, step.cause, found.hero.card.cardId, true);
  if (step.cause.thenIfReal) game.queue.unshift(...step.cause.thenIfReal);
}

/** Doombringer (BN, slain): "Each time you SACRIFICE a card, you may choose a card from the discard pile and add it to your hand." */
function doombringerPrompt(playerId: string): Step {
  return { op: "choice", playerId, kind: "take_from_discard", count: 1, upTo: true, prompt: "Doombringer: lấy 1 lá bất kỳ trong discard về tay (tùy chọn)" };
}

/**
 * Triggers after a Hero loss, released right after it in order: Soul Tether, Feral Dragon, Silent Shield.
 * A credited SACRIFICE (E06) fires Soul Tether even when Decoy Doll/Maegisty replaced the movement (W11/T2); Feral
 * Dragon and Silent Shield need the Hero to really leave (W02). A replaced DESTROY is not a destruction: no trigger.
 */
function afterHeroLost(game: EngineState, owner: BaseSeat, cause: HeroLossCause, lostHeroId: string, real: boolean): void {
  if (!real && cause.kind === "destroy") return;
  const follow: Step[] = [];
  for (const hero of owner.party) {
    if (hero.card.cardId !== lostHeroId && hasAttachment(hero, SOUL_TETHER)) follow.push({ op: "tether_sacrifice", heroCardId: hero.card.cardId });
  }
  if (!real) {
    if (follow.length > 0) game.queue.unshift(...follow);
    return;
  }
  if (cause.kind === "sacrifice") {
    if (owner.slain.some((id) => monsterDefinitionId(id) === DOOMBRINGER)) follow.push(doombringerPrompt(owner.playerId));
    for (const seat of game.seats) {
      if (seat.slain.some((id) => monsterDefinitionId(id) === FERAL_DRAGON)) follow.push({ op: "draw", playerId: seat.playerId, n: 1 });
    }
  }
  const shield = game.silentShieldBy;
  if (shield && (cause.kind === "sacrifice" ? owner.playerId === shield : cause.byPlayerId === shield)) {
    follow.push({
      op: "choice", playerId: shield, kind: "take_from_discard", count: 1, upTo: true, filterKinds: ["hero"],
      prompt: "Silent Shield: lấy 1 Hero trong discard về tay (tùy chọn)",
    });
  }
  if (follow.length > 0) game.queue.unshift(...follow);
}

/** A "may" clause: the player is asked (owner 2026-11-02); timeout = decline. */
export function may(playerId: string, prompt: string, then: Step[]): Step {
  return { op: "choice", playerId, kind: "confirm", count: 1, prompt, then };
}

/** Offer to play one of `cards` for free (a "may"), then `thenIfPicked`. */
function offerPlay(playerId: string, cards: BaseCard[], prompt: string, thenIfPicked?: Step[]): Step {
  return {
    op: "choice",
    playerId,
    kind: "play_card",
    count: 1,
    upTo: true,
    prompt,
    fromCardIds: cards.map((card) => card.cardId),
    ...(thenIfPicked ? { thenIfPicked } : {}),
  };
}

/**
 * Slain-Monster DRAW triggers. Malamammoth: "Each time you DRAW an Item card, you may play it
 * immediately." Orthus: same for Magic. Rex Major: "Each time you DRAW a Modifier card, you may
 * reveal it and DRAW a second card."
 */
export function afterDraw(game: EngineState, seat: BaseSeat, drawn: BaseCard[]): void {
  game.queue.unshift(...drawTriggerSteps(game, seat, drawn)); // right after the draw, before later effect steps
}

/**
 * Eligibility is evaluated NOW (at draw time) from the Monsters the seat owns at this moment; the returned
 * steps may run later (C04 deferral) without granting retroactive eligibility to a Monster awarded since.
 */
export function drawTriggerSteps(game: EngineState, seat: BaseSeat, drawn: BaseCard[]): Step[] {
  // Prompts are public: never name the drawn (hidden) card; the chooser sees it in `options`.
  const offers: Step[] = [];
  for (const card of drawn) {
    if ((card.kind === "item" || card.kind === "cursed_item") && slainHas(seat, "malamammoth")) {
      offers.push(offerPlay(seat.playerId, [card], "Malamammoth: chơi ngay Item vừa rút?"));
    }
    if (card.kind === "challenge" && seat.slain.some((id) => monsterDefinitionId(id) === CALAMITY_MONGREL)) {
      offers.push(
        may(seat.playerId, "Calamity Mongrel: DISCARD Challenge vừa rút để DRAW 2 lá?", [
          { op: "discard_from_hand", playerId: seat.playerId, cardId: card.cardId },
          { op: "draw", playerId: seat.playerId, n: 2 },
        ]),
      );
    }
    if (card.kind === "magic" && slainHas(seat, "orthus")) {
      offers.push(offerPlay(seat.playerId, [card], "Orthus: chơi ngay Magic vừa rút?"));
    }
    if (card.kind === "modifier" && slainHas(seat, "rex-major")) {
      offers.push(
        may(seat.playerId, "Rex Major: lộ Modifier vừa rút để DRAW thêm 1 lá?", [
          { op: "reveal", playerId: seat.playerId, cardId: card.cardId, source: "Rex Major" },
          { op: "draw", playerId: seat.playerId, n: 1 },
        ]),
      );
    }
  }
  return offers;
}

/** Dracos slain skill: "Each time a Hero card in your Party is destroyed, you may DRAW a card." */
function afterHeroDestroyed(game: EngineState, owner: BaseSeat, deps: EngineDeps): void {
  void deps;
  if (slainHas(owner, "dracos")) {
    game.queue.unshift(may(owner.playerId, "Dracos: DRAW 1 lá?", [{ op: "draw", playerId: owner.playerId, n: 1 }]));
  }
}

function heroCannotBeDestroyed(owner: BaseSeat): boolean {
  return owner.protections.noDestroy || slainHas(owner, "terratuga");
}

// ---------------------------------------------------------------- targets

/** Q-08: validate targets for a target rule against the current table. Returns an error code or null. */
export function validateTargets(game: EngineState, actorId: string, rule: TargetRule, targets: BaseTargets): string | null {
  const heroes = targets.heroInstanceIds ?? [];
  const otherHero = (id: string | undefined) => {
    const found = id ? findHero(game, id) : null;
    return found && found.seat.playerId !== actorId ? found : null;
  };
  const ownHero = (id: string | undefined) => {
    const found = id ? findHero(game, id) : null;
    return found && found.seat.playerId === actorId ? found : null;
  };
  switch (rule) {
    case "none":
      return null;
    case "other_player":
      return targets.playerId && targets.playerId !== actorId && seatOf(game, targets.playerId) ? null : "INVALID_TARGET";
    case "hero_other_party":
      return otherHero(heroes[0]) ? null : "INVALID_TARGET";
    case "two_heroes_other_party":
      return heroes.length === 2 && heroes[0] !== heroes[1] && otherHero(heroes[0]) && otherHero(heroes[1]) ? null : "INVALID_TARGET";
    case "hero_other_party_and_own_hero":
      return otherHero(heroes[0]) && ownHero(heroes[1]) ? null : "INVALID_TARGET";
    case "own_hero":
      return ownHero(heroes[0]) ? null : "INVALID_TARGET";
    case "own_hero_with_cursed_item": {
      const found = ownHero(heroes[0]);
      return found && hasCursedAttachment(found.hero) ? null : "INVALID_TARGET";
    }
    case "any_hero_with_item": {
      const found = heroes[0] ? findHero(game, heroes[0]) : null;
      return found?.hero.attachments.length ? null : "INVALID_TARGET";
    }
    case "any_player":
      return targets.playerId && seatOf(game, targets.playerId) ? null : "INVALID_TARGET";
  }
}


/**
 * True when at least one legal target set exists for `rule` right now. Used to skip a Hero's
 * free "roll its effect" offer when it could not be used anyway (owner 2026-11-04: a Hero with
 * no valid target still enters the Party; its ability is simply skipped).
 */
export function hasValidTargets(game: EngineState, actorId: string, rule: TargetRule): boolean {
  const others = game.seats.filter((seat) => seat.playerId !== actorId);
  const own = seatOf(game, actorId);
  const otherHeroes = others.flatMap((seat) => seat.party).length;
  const ownHeroes = own?.party ?? [];
  switch (rule) {
    case "none": return true;
    case "other_player": return others.length > 0;
    case "hero_other_party": return otherHeroes >= 1;
    case "two_heroes_other_party": return otherHeroes >= 2;
    case "hero_other_party_and_own_hero": return otherHeroes >= 1 && ownHeroes.length >= 1;
    case "own_hero": return ownHeroes.length >= 1;
    case "own_hero_with_cursed_item": return ownHeroes.some(hasCursedAttachment);
    case "any_hero_with_item": return game.seats.some((seat) => seat.party.some((entry) => entry.attachments.length));
    case "any_player": return game.seats.length > 0;
  }
}

/** Opens the free roll offer for a Hero that just entered, unless its effect has no valid target. */
function offerHeroRoll(game: EngineState, actorId: string, heroCardId: string, heroDefinitionId: string, deps: EngineDeps): boolean {
  const rule = cardDataOfKind(heroDefinitionId, "hero")?.target ?? "none";
  if (!hasValidTargets(game, actorId, rule)) {
    log(game, `${cardName(heroDefinitionId)}: không có mục tiêu hợp lệ — bỏ qua hiệu ứng`);
    return false;
  }
  game.chain = { step: "immediate_roll_choice", deadlineAt: deps.now() + game.settings.choiceSeconds * 1000, actorId, heroCardId };
  return true;
}

// ---------------------------------------------------------------- effects

/**
 * Effect steps for a Hero/Magic effectId. Effects not (yet) modelled return a
 * single log step — no-op, never invented behaviour.
 */
export function buildEffect(game: EngineState, effectId: string | null, actorId: string, targets: BaseTargets, sourceCardId?: string): Step[] {
  const h = targets.heroInstanceIds ?? [];
  const p = targets.playerId ?? "";
  const ownerOf = (heroId: string | undefined) => (heroId ? findHero(game, heroId)?.seat.playerId : undefined) ?? "";
  const takeDiscard = (kinds: BaseCardKind[], label: string): Step[] => [
    { op: "choice", playerId: actorId, kind: "take_from_discard", count: 1, filterKinds: kinds, prompt: `Chọn 1 ${label} trong discard để lấy về tay` },
  ];
  switch (effectId) {
    case "hero.napping-nibbles":
      return [{ op: "log", text: "Napping Nibbles: không làm gì" }];
    case "hero.peanut":
      return [{ op: "draw", playerId: actorId, n: 2 }];
    case "hero.wily-red":
      return [{ op: "draw_to", playerId: actorId, n: 7 }];
    case "hero.kit-napper":
      return [{ op: "steal", heroCardId: h[0], toPlayerId: actorId }];
    case "hero.bad-axe":
      return [{ op: "destroy", heroCardId: h[0], byPlayerId: actorId }];
    case "hero.serious-grey":
      return [{ op: "destroy", heroCardId: h[0], byPlayerId: actorId }, { op: "draw", playerId: actorId, n: 1 }];
    case "hero.fluffy":
      return [
        { op: "destroy", heroCardId: h[0], byPlayerId: actorId },
        { op: "destroy", heroCardId: h[1], byPlayerId: actorId },
      ];
    case "hero.whiskers":
      return [
        { op: "steal", heroCardId: h[0], toPlayerId: actorId },
        { op: "destroy", heroCardId: h[1], byPlayerId: actorId },
      ];
    case "hero.shurikitty":
      return [{ op: "destroy", heroCardId: h[0], byPlayerId: actorId, itemToPlayerId: actorId }];
    case "hero.tipsy-tootie": {
      const victim = ownerOf(h[0]);
      return sourceCardId
        ? [
            { op: "steal", heroCardId: h[0], toPlayerId: actorId },
            // "and move this card to that player's Party" — only if the steal happened.
            { op: "move_hero", heroCardId: sourceCardId, toPlayerId: victim, onlyIfOwns: { heroCardId: h[0], playerId: actorId } },
          ]
        : [{ op: "steal", heroCardId: h[0], toPlayerId: actorId }];
    }
    case "hero.meowzio": {
      const victim = ownerOf(h[0]);
      return [
        { op: "steal", heroCardId: h[0], toPlayerId: actorId },
        { op: "pull", fromPlayerId: victim, toPlayerId: actorId, n: 1 },
      ];
    }
    case "hero.dodgy-dealer":
      return [{ op: "trade_hands", a: actorId, b: p }];
    case "hero.greedy-cheeks":
      return [{ op: "each_other_choice", actorId, kind: "give_card", count: 1 }];
    case "hero.heavy-bear":
      return [{ op: "choice", playerId: p, kind: "discard", count: 2, prompt: "DISCARD 2 lá (Heavy Bear)" }];
    case "hero.hopper":
      return [{ op: "choice", playerId: p, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Hopper)" }];
    case "hero.spooky":
      return [{ op: "each_other_choice", actorId, kind: "sacrifice_hero", count: 1 }];
    case "hero.tough-teddy":
      return [{ op: "each_other_choice", actorId, kind: "discard", count: 1, requireClass: "fighter" }];
    case "hero.smooth-mimimeow":
      return [{ op: "pull_from_class", toPlayerId: actorId, heroClass: "thief" }];
    case "hero.bear-claw":
      return [{ op: "pull", fromPlayerId: p, toPlayerId: actorId, n: 1, extraIfKind: "hero" }];
    case "hero.fury-knuckle":
      return [{ op: "pull", fromPlayerId: p, toPlayerId: actorId, n: 1, extraIfKind: "challenge" }];
    case "hero.plundering-puma":
      return [
        { op: "pull", fromPlayerId: p, toPlayerId: actorId, n: 2 },
        may(p, "Plundering Puma: bạn có muốn DRAW 1 lá?", [{ op: "draw", playerId: p, n: 1 }]),
      ];
    case "hero.slippery-paws":
      // "then DISCARD one of those cards": the choice is restricted to the pulled cards.
      return [{ op: "pull", fromPlayerId: p, toPlayerId: actorId, n: 2, thenDiscardOne: true }];
    case "hero.lucky-bucky":
      return [{ op: "pull", fromPlayerId: p, toPlayerId: actorId, n: 1, offerPlayIfKind: ["hero"] }];
    case "hero.sly-pickings":
      return [{ op: "pull", fromPlayerId: p, toPlayerId: actorId, n: 1, offerPlayIfKind: ["item", "cursed_item"] }];
    case "hero.buttons":
      return [{ op: "pull", fromPlayerId: p, toPlayerId: actorId, n: 1, offerPlayIfKind: ["magic"] }];
    case "hero.mellow-dee":
      return [{ op: "draw", playerId: actorId, n: 1, offerPlayIfKind: ["hero"] }];
    case "hero.snowball":
      return [{ op: "draw", playerId: actorId, n: 1, offerPlayIfKind: ["magic"], offerThen: [{ op: "draw", playerId: actorId, n: 1 }] }];
    case "hero.quick-draw":
      return [{ op: "draw", playerId: actorId, n: 2, offerPlayIfKind: ["item", "cursed_item"] }];
    case "hero.fuzzy-cheeks":
      return [
        { op: "draw", playerId: actorId, n: 1 },
        { op: "choice", playerId: actorId, kind: "play_card", count: 1, filterKinds: ["hero"], prompt: "Chơi ngay 1 Hero từ tay (Fuzzy Cheeks)" },
      ];
    case "hero.hook":
      return [
        { op: "choice", playerId: actorId, kind: "play_card", count: 1, filterKinds: ["item", "cursed_item"], prompt: "Chơi ngay 1 Item từ tay (Hook)" },
        { op: "draw", playerId: actorId, n: 1 },
      ];
    case "hero.pan-chucks":
      return [
        {
          op: "draw",
          playerId: actorId,
          n: 2,
          ifAnyKindThen: {
            kinds: ["challenge"],
            revealSource: "Pan Chucks",
            steps: [
              may(actorId, "Pan Chucks: lộ Challenge vừa rút để DESTROY 1 Hero?", [
                { op: "choice", playerId: actorId, kind: "destroy_hero", count: 1, prompt: "Chọn Hero để DESTROY (Pan Chucks)" },
              ]),
            ],
          },
        },
      ];
    case "hero.qi-bear":
      return [
        {
          op: "choice",
          playerId: actorId,
          kind: "discard",
          count: 3,
          upTo: true,
          prompt: "DISCARD tối đa 3 lá; mỗi lá = DESTROY 1 Hero (Qi Bear)",
          perCardThen: [{ op: "choice", playerId: actorId, kind: "destroy_hero", count: 1, prompt: "Chọn Hero để DESTROY (Qi Bear)" }],
        },
      ];
    case "hero.beary-wise":
      return [
        { op: "each_other_choice", actorId, kind: "discard", count: 1, collect: true },
        { op: "choice", playerId: actorId, kind: "take_from_discard", count: 1, fromCollected: true, prompt: "Chọn 1 lá vừa bị discard để lấy về tay (Beary Wise)" },
      ];
    case "hero.bullseye":
      return [{ op: "choice", playerId: actorId, kind: "take_from_top", count: 1, prompt: "Chọn 1 trong 3 lá trên cùng của deck (Bullseye)" }];
    case "hero.sharp-fox":
      return [{ op: "choice", playerId: actorId, kind: "view_hand", count: 0, upTo: true, targetPlayerId: p, prompt: "Xem tay bài (Sharp Fox) — bấm xác nhận để đóng" }];
    case "hero.silent-shadow":
      return [{ op: "choice", playerId: actorId, kind: "take_from_hand", count: 1, targetPlayerId: p, prompt: "Chọn 1 lá trong tay đối thủ (Silent Shadow)" }];
    case "hero.wiggles":
      return [
        { op: "steal", heroCardId: h[0], toPlayerId: actorId },
        { op: "offer_immediate_roll", playerId: actorId, heroCardId: h[0] },
      ];
    case "hero.guiding-light":
    case "magic.call-to-the-fallen":
      return takeDiscard(["hero"], "Hero");
    case "hero.lookie-rookie":
      return takeDiscard(["item", "cursed_item"], "Item");
    case "hero.bun-bun":
      return takeDiscard(["magic"], "Magic");
    case "hero.radiant-horn":
      return takeDiscard(["modifier"], "Modifier");
    case "hero.wildshot":
    case "magic.critical-boost":
      return [
        { op: "draw", playerId: actorId, n: 3 },
        { op: "choice", playerId: actorId, kind: "discard", count: 1, prompt: "DISCARD 1 lá" },
      ];
    case "hero.agile-dagger":
      return [
        {
          op: "choice", playerId: actorId, kind: "play_card", count: 1, upTo: true, filterKinds: ["item", "cursed_item"],
          prompt: "Chơi ngay tối đa 2 Item (Agile Dagger) — lá 1",
          thenIfPicked: [
            { op: "choice", playerId: actorId, kind: "play_card", count: 1, upTo: true, filterKinds: ["item", "cursed_item"], prompt: "Chơi ngay Item thứ 2 (Agile Dagger)" },
          ],
        },
      ];
    case "hero.hardened-hunter":
      return [{ op: "draw_for", playerId: actorId, rule: "other_party_monsters" }];
    case "hero.looting-lupo":
      return [{ op: "draw_for", playerId: actorId, rule: "own_equipped_items" }];
    case "hero.blinding-blade":
      return [{ op: "return_party_items", fromPlayerId: p, toPlayerId: actorId }];
    case "hero.critical-fang":
      return [{ op: "attack_bonus", n: 4 }];
    case "hero.wolfgang-pack": {
      const others = (seatOf(game, actorId)?.party ?? []).filter((entry) => entry.card.cardId !== sourceCardId).length;
      return others > 0 ? [{ op: "roll_bonus", n: others }] : [{ op: "log", text: "Wolfgang Pack: không có Hero khác — +0" }];
    }
    case "hero.majestelk":
      return [
        { op: "choice", playerId: actorId, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Majestelk)" },
        { op: "add_roll_swing", playerId: actorId },
      ];
    case "hero.big-buckley":
      return [{ op: "choice", playerId: actorId, kind: "attack_monster", count: 1, prompt: "Chọn Monster để ATTACK ngay (Big Buckley)" }];
    case "hero.buck-omens":
      return [
        { op: "choice", playerId: actorId, kind: "view_hand", count: 0, upTo: true, targetPlayerId: p, prompt: "Xem tay bài (Buck Omens) — bấm xác nhận để đóng" },
        { op: "choice", playerId: actorId, kind: "bring_hero", count: 1, targetPlayerId: p, prompt: "Chọn 1 Hero trong tay để đưa vào Party (Buck Omens)" },
      ];
    case "hero.tenacious-timber": {
      const monsters = seatOf(game, actorId)?.slain.length ?? 0; // counted once, now (W06)
      return monsters > 0
        ? [{ op: "choice", playerId: actorId, kind: "steal_hero", count: monsters, prompt: `STEAL tối đa ${monsters} Hero (Tenacious Timber)` }]
        : [{ op: "log", text: "Tenacious Timber: không có Monster trong Party — không STEAL" }];
    }
    case "magic.beast-call":
      return [{ op: "rotate_monsters" }, { op: "gain_ap", playerId: actorId, n: 1 }];
    case "hero.silent-shield":
      return [{ op: "arm_silent_shield", playerId: actorId }];
    case "hero.stagguard":
      return [{ op: "lock_modifiers", playerId: actorId }];
    case "hero.maegisty":
      return [{ op: "protect", playerId: actorId, kind: "returnToHand" }];
    case "hero.doe-fallow":
      return [
        { op: "choice", playerId: actorId, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Doe Fallow)" },
        { op: "draw_to", playerId: actorId, n: 7 },
      ];
    case "hero.glowing-antler":
      // "You may play up to 2 Magic cards immediately": the second offer only follows a played first card.
      return [
        {
          op: "choice", playerId: actorId, kind: "play_card", count: 1, upTo: true, filterKinds: ["magic"],
          prompt: "Chơi ngay tối đa 2 Magic (Glowing Antler) — lá 1",
          thenIfPicked: [
            { op: "choice", playerId: actorId, kind: "play_card", count: 1, upTo: true, filterKinds: ["magic"], prompt: "Chơi ngay Magic thứ 2 (Glowing Antler)" },
          ],
        },
      ];
    case "hero.magus-moose":
      return [
        { op: "choice", playerId: actorId, kind: "take_from_discard", count: 1, filterKinds: ["hero"], thenPlayTaken: true, prompt: "Chọn 1 Hero trong discard, lấy về tay rồi chơi ngay (Magus Moose)" },
      ];
    case "magic.rapid-refresh":
      return [{ op: "discard_hand", playerId: actorId }, { op: "draw", playerId: actorId, n: 4 }];
    case "magic.mass-sacrifice":
      return [{ op: "discard_hand", playerId: actorId }, { op: "draw", playerId: actorId, n: 5 }];
    case "hero.annihilator":
      return [{ op: "choice", playerId: actorId, kind: "take_from_discard", count: 1, filterKinds: ["challenge"], prompt: "Chọn 1 Challenge trong discard, lấy về tay (Annihilator)" }];
    case "hero.bark-hexer":
      return [
        { op: "choice", playerId: actorId, kind: "discard", count: 1, prompt: "DISCARD 1 lá (Bark Hexer)" },
        { op: "each_other_choice", actorId, kind: "discard", count: 2 },
      ];
    case "hero.grim-pupper":
      return [
        { op: "choice", playerId: actorId, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Grim Pupper)" },
        { op: "each_other_choice", actorId, kind: "sacrifice_hero", count: 1 },
      ];
    case "hero.brawling-spirit":
      return [{ op: "brawling_spirit", actorId }];
    case "hero.unbridled-fury":
      return [{
        op: "choice", playerId: actorId, kind: "destroy_hero", count: 1, prompt: "DESTROY 1 Hero (Unbridled Fury)",
        thenIfClass: { heroClass: "berserker", steps: [{ op: "gain_ap", playerId: actorId, n: 1 }] },
      }];
    case "hero.roaryal-guard":
      return [{ op: "choice", playerId: actorId, kind: "choose_class", count: 1, prompt: "Chọn Class (chọn 1 Hero để chỉ Class của nó) — mọi Hero Class đó về tay chủ (Roaryal Guard)" }];
    case "hero.boston-terror": {
      const target = p ? seatOf(game, p) : undefined;
      const fromDiscard: Step = { op: "choice", playerId: actorId, kind: "take_from_discard", count: 2, upTo: true, prompt: "Lấy tối đa 2 lá từ discard (Boston Terror)" };
      if (!target || target.hand.length === 0) return [fromDiscard];
      return [{
        op: "choice", playerId: target.playerId, kind: "confirm", count: 1,
        prompt: `Đưa 1 lá cho ${whoName(game, actorId)}? Không đưa (hoặc hết giờ) → họ lấy 2 lá từ discard (Boston Terror)`,
        then: [{ op: "choice", playerId: target.playerId, kind: "give_card", count: 1, recipientId: actorId, prompt: `Đưa 1 lá cho ${whoName(game, actorId)} (Boston Terror)` }],
        otherwise: [fromDiscard],
      }];
    }
    case "hero.perfect-vessel":
      return [
        ...(sourceCardId ? [{ op: "sacrifice_hero_card", heroCardId: sourceCardId } as Step] : []),
        { op: "choice", playerId: actorId, kind: "steal_hero", count: 1, prompt: "STEAL 1 Hero (Perfect Vessel)" },
      ];
    case "hero.bone-collector":
      return [
        { op: "choice", playerId: actorId, kind: "sacrifice_item", count: 1, prompt: "SACRIFICE 1 Item (Bone Collector)" },
        { op: "choice", playerId: actorId, kind: "take_from_discard", count: 1, filterKinds: ["hero"], thenPlayTaken: true, prompt: "Chọn 1 Hero trong discard, lấy về tay rồi chơi ngay (Bone Collector)" },
      ];
    case "hero.beholden-retriever":
      return [
        { op: "choice", playerId: actorId, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Beholden Retriever)" },
        { op: "choice", playerId: actorId, kind: "take_from_discard", count: 1, filterKinds: ["hero", "item", "cursed_item"], thenPlayTaken: true, prompt: "Chọn 1 Hero hoặc Item trong discard, lấy về tay rồi chơi ngay (Beholden Retriever)" },
      ];
    case "hero.hollow-husk":
      return [
        { op: "choice", playerId: actorId, kind: "view_hand", count: 0, upTo: true, targetPlayerId: p, prompt: "Xem tay bài (Hollow Husk) — bấm xác nhận để đóng" },
        { op: "choice", playerId: actorId, kind: "take_from_hand", count: 1, targetPlayerId: p, filterKinds: ["magic"], thenOfferPlayTaken: true, prompt: "Chọn 1 Magic lấy về tay (Hollow Husk)" },
      ];
    case "hero.shadow-saint":
      // Owner: a Modifier must be discarded to activate; without one the effect ends (C01 required payment).
      return [{ op: "choice", playerId: actorId, kind: "discard", count: 1, filterKinds: ["modifier"], prompt: "DISCARD 1 Modifier (Shadow Saint)", thenIfPaid: [{ op: "lock_modifiers", playerId: actorId }] }];
    case "hero.gruesome-gladiator":
      return orderFrom(game, actorId).filter((seat) => seat.playerId !== actorId).flatMap((seat): Step[] => [
        { op: "choice", playerId: actorId, kind: "view_hand", count: 0, upTo: true, targetPlayerId: seat.playerId, prompt: `Xem tay bài ${whoName(game, seat.playerId)} (Gruesome Gladiator)` },
        { op: "choice", playerId: actorId, kind: "take_from_hand", count: 1, targetPlayerId: seat.playerId, prompt: `Lấy 1 lá từ tay ${whoName(game, seat.playerId)} (Gruesome Gladiator)` },
      ]);
    case "hero.dystortivern":
      return p ? [{ op: "swap_leaders", a: actorId, b: p }] : [{ op: "log", text: "Dystortivern: không có mục tiêu" }];
    case "magic.egg-of-fortune":
      return [
        { op: "choice", playerId: actorId, kind: "discard", count: 1, prompt: "DISCARD 1 lá (Egg of Fortune)" },
        ...orderFrom(game, actorId).filter((seat) => seat.playerId !== actorId).map((seat): Step => ({ op: "pull", fromPlayerId: seat.playerId, toPlayerId: actorId, n: 1 })),
      ];
    case "hero.extraga":
      return [{ op: "return_class_heroes", heroClass: "sorcerer", ...(sourceCardId ? { exceptHeroCardId: sourceCardId } : {}) }];
    case "hero.oracon":
      return p
        ? [{ op: "pull", fromPlayerId: p, toPlayerId: actorId, n: 1, ifKindThen: { kind: "modifier", steps: [{ op: "choice", playerId: p, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Oracon — bị rút trúng Modifier)" }] } }]
        : [{ op: "log", text: "Oracon: không có mục tiêu" }];
    case "hero.renovern":
      return [{ op: "choice", playerId: actorId, kind: "take_from_discard", count: 1, filterKinds: ["item", "cursed_item"], thenPlayTaken: true, prompt: "Chọn 1 Item trong discard, lấy về tay rồi chơi ngay (Renovern)" }];
    case "hero.smok":
      return [{
        op: "draw", playerId: actorId, n: 2,
        ifAnyKindThen: { kinds: ["magic"], revealSource: "Smok", steps: [may(actorId, "Smok: lộ Magic vừa rút để nhận thêm 1 AP?", [{ op: "gain_ap", playerId: actorId, n: 1 }])] },
      }];
    case "hero.vicious-wildcat":
      return [{ op: "choice", playerId: actorId, kind: "slay_monster", count: 1, prompt: "Chọn 1 Monster ngửa để SLAY ngay (Vicious Wildcat) — sau đó kết thúc lượt" }];
    case "hero.meowntain":
      return [
        { op: "choice", playerId: actorId, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Meowntain)" },
        { op: "roll_bonus", n: 5 },
      ];
    case "hero.rabid-beast":
      return [{ op: "choice", playerId: actorId, kind: "sacrifice_hero", count: 99, upTo: true, destroyEqual: true, prompt: "SACRIFICE số Hero tùy ý, sau đó DESTROY cùng số lượng (Rabid Beast)" }];
    case "magic.lightning-labrys":
      return [{
        op: "choice", playerId: actorId, kind: "discard", count: 3, upTo: true, prompt: "DISCARD tối đa 3 lá (Lightning Labrys) — mỗi lá chọn 1 người SACRIFICE 1 Hero",
        perCardThen: [{ op: "choice", playerId: actorId, kind: "make_sacrifice", count: 1, prompt: "Chọn 1 người (bằng cách chọn 1 Hero của họ) phải SACRIFICE 1 Hero (Lightning Labrys)" }],
      }];
    case "hero.vibrant-glow":
      return [{ op: "roll_bonus", n: 5 }];
    case "hero.wise-shield":
      return [{ op: "roll_bonus", n: 3 }];
    case "magic.enchanted-spell":
      return [{ op: "roll_bonus", n: 2 }];
    case "hero.mighty-blade":
      return [{ op: "protect", playerId: actorId, kind: "noDestroy" }];
    case "hero.calming-voice":
      return [{ op: "protect", playerId: actorId, kind: "noSteal" }];
    case "hero.iron-resolve":
      return [{ op: "no_challenge" }];
    case "hero.holy-curselifter":
      return [{ op: "return_item", heroCardId: h[0], onlyCursed: true, toPlayerId: actorId }];
    case "magic.destructive-spell":
      return [
        { op: "choice", playerId: actorId, kind: "discard", count: 1, prompt: "DISCARD 1 lá (Destructive Spell)", thenIfPaid: [{ op: "destroy", heroCardId: h[0], byPlayerId: actorId }] },
      ];
    case "magic.entangling-trap":
      return [
        { op: "choice", playerId: actorId, kind: "discard", count: 2, prompt: "DISCARD 2 lá (Entangling Trap)", thenIfPaid: [{ op: "steal", heroCardId: h[0], toPlayerId: actorId }] },
      ];
    case "magic.forced-exchange": {
      const victim = ownerOf(h[0]);
      // C11 (owner 2026-11-04): needs an own Hero (target h[1], chosen on play); STEAL first, the own Hero
      // moves back to the victim only if the STEAL succeeded.
      return [
        { op: "steal", heroCardId: h[0], toPlayerId: actorId },
        { op: "move_hero", heroCardId: h[1], toPlayerId: victim, onlyIfOwns: { heroCardId: h[0], playerId: actorId } },
      ];
    }
    case "magic.forceful-winds":
      return [{ op: "return_all_items" }];
    case "magic.winds-of-change":
      return [{ op: "return_item", heroCardId: h[0] }, { op: "draw", playerId: actorId, n: 1 }];
    default:
      return [{ op: "log", text: `Hiệu ứng ${effectId ?? "(không có data)"} chưa được hỗ trợ — bỏ qua (no-op)` }];
  }
}

function openChoice(game: EngineState, step: Extract<Step, { op: "choice" }>, deps: EngineDeps): boolean {
  const seat = seatOf(game, step.playerId);
  if (!seat) return false;
  if (step.fromCollected) {
    step = { ...step, fromCardIds: game.collected.filter((id) => game.discard.some((card) => card.cardId === id)) };
    game.collected = [];
  }
  const probe: PendingChoice = { choiceId: "", playerId: step.playerId, kind: step.kind, min: 0, max: 0, prompt: "", deadlineAt: 0, ...extrasOf(step) };
  const available = step.kind === "confirm" || step.kind === "view_hand" ? 1 : eligibleChoiceCards(game, probe).length;
  const max = step.kind === "view_hand" ? 0 : Math.min(step.count, available);
  if (step.kind === "view_hand") {
    const target = seatOf(game, step.targetPlayerId ?? "");
    if (!target || target.hand.length === 0) {
      log(game, `${whoName(game, step.playerId)}: tay bài trống — bỏ qua`);
      return false;
    }
  }
  // C01: a required payment must be payable in full, otherwise its dependent benefit is not granted.
  if (step.thenIfPaid && available < step.count) {
    log(game, `${whoName(game, step.playerId)}: không đủ bài để trả (${step.prompt}) — không nhận được hiệu ứng`);
    return false;
  }
  // Q-05 / RULE-20: do as much as possible; nothing available → no effect.
  if (max === 0 && step.kind !== "view_hand") {
    log(game, `${whoName(game, step.playerId)}: không có gì để chọn (${step.prompt}) — bỏ qua`);
    return false;
  }
  game.chain = {
    step: "choice",
    choice: {
      choiceId: deps.newId(),
      playerId: step.playerId,
      kind: step.kind,
      min: step.upTo || step.kind === "confirm" || step.kind === "view_hand" ? 0 : max,
      max,
      prompt: step.prompt,
      deadlineAt: deps.now() + game.settings.choiceSeconds * 1000,
      ...extrasOf(step),
    },
  };
  return true;
}

function extrasOf(step: ChoiceExtras): ChoiceExtras {
  const out: ChoiceExtras = {};
  for (const key of ["filterKinds", "fromCardIds", "recipientId", "targetPlayerId", "then", "otherwise", "thenIfPicked", "thenIfPaid", "perCardThen", "collect", "thenPlayTaken", "thenOfferPlayTaken", "destroyEqual", "thenIfClass", "excludeCardIds", "onTimeout"] as const) {
    if (step[key] !== undefined) (out as Record<string, unknown>)[key] = step[key];
  }
  return out;
}

/** Runs one step. Returns true if it opened a choice (queue suspends). */
function runStep(game: EngineState, step: Step, deps: EngineDeps): boolean {
  switch (step.op) {
    case "log":
      log(game, step.text);
      return false;
    case "award_monster": // needs hooks → handled in advance()
      return false;
    case "flush_draw_triggers": {
      const deferred = game.deferredSteps ?? [];
      game.deferredSteps = [];
      game.queue.unshift(...deferred);
      return false;
    }
    case "refill_monsters":
      refillFaceUpMonsters(game, step.slot);
      return false;
    case "reveal": {
      const seat = seatOf(game, step.playerId);
      const card = seat?.hand.find((candidate) => candidate.cardId === step.cardId);
      if (!seat || !card) return false;
      const now = deps.now();
      pruneReveals(game, now);
      game.reveals = [
        ...(game.reveals ?? []),
        { revealId: deps.newId(), playerId: step.playerId, source: step.source, card, revealedAt: now, expiresAt: now + REVEAL_VISIBLE_MS },
      ].slice(-REVEAL_KEEP);
      log(game, `${whoName(game, step.playerId)} lộ ${cardName(card.definitionId)} (${step.source})`);
      return false;
    }
    case "draw": {
      const seat = seatOf(game, step.playerId);
      if (!seat) return false;
      const drawn = drawCards(game, game, step.n, deps.shuffle);
      seat.hand.push(...drawn);
      log(game, `${whoName(game, step.playerId)} rút ${drawn.length} lá`);
      const follow: Step[] = [];
      if (step.offerPlayIfKind) {
        const playable = drawn.filter((card) => step.offerPlayIfKind!.includes(card.kind));
        if (playable.length > 0) follow.push(offerPlay(step.playerId, playable, "Chơi ngay lá vừa rút?", step.offerThen));
      }
      const revealed = step.ifAnyKindThen ? drawn.find((card) => step.ifAnyKindThen!.kinds.includes(card.kind)) : undefined;
      if (step.ifAnyKindThen && revealed) {
        // C06: accepting the "may reveal" clause publicly reveals exactly the qualifying card.
        const label = step.ifAnyKindThen.revealSource;
        follow.push(
          ...step.ifAnyKindThen.steps.map((inner) =>
            label && inner.op === "choice" && inner.kind === "confirm" && inner.then
              ? { ...inner, then: [{ op: "reveal", playerId: step.playerId, cardId: revealed.cardId, source: label } as Step, ...inner.then] }
              : inner,
          ),
        );
      }
      game.queue.unshift(...follow);
      if (step.deferTriggers) game.deferredSteps = [...(game.deferredSteps ?? []), ...drawTriggerSteps(game, seat, drawn)];
      else afterDraw(game, seat, drawn);
      return false;
    }
    case "retry_hero_roll": return false; // handled in advance(), which owns the hooks
    case "resolve_hero_loss":
      resolveHeroLoss(game, step, deps);
      return false;
    case "gain_ap": {
      if (step.playerId === game.turnOrder[game.currentPlayerIndex]) {
        game.actionPoints = (game.actionPoints ?? 0) + step.n;
        log(game, `${whoName(game, step.playerId)} nhận thêm ${step.n} AP`);
      }
      return false;
    }
    case "discard_attachment": {
      const found = findHero(game, step.heroCardId);
      const item = found ? detach(found.hero, step.itemCardId) : null;
      if (!item) return false;
      game.discard.push(item);
      log(game, `${cardName(item.definitionId)} bị hy sinh (vào discard)`);
      if (found && found.seat.slain.some((id) => monsterDefinitionId(id) === DOOMBRINGER)) game.queue.unshift(doombringerPrompt(found.seat.playerId));
      return false;
    }
    case "offer_immediate_roll": {
      const found = findHero(game, step.heroCardId);
      if (!found || found.seat.playerId !== step.playerId) return false;
      return offerHeroRoll(game, step.playerId, step.heroCardId, found.hero.card.definitionId, deps);
    }
    case "discard_hand": {
      const seat = seatOf(game, step.playerId);
      if (!seat || seat.hand.length === 0) return false;
      const dropped = seat.hand.splice(0, seat.hand.length);
      game.discard.push(...dropped);
      log(game, `${whoName(game, step.playerId)} DISCARD cả tay (${dropped.length} lá)`);
      return false;
    }
    case "draw_to": {
      const seat = seatOf(game, step.playerId);
      if (!seat) return false;
      const need = Math.max(0, step.n - seat.hand.length);
      const drawn = drawCards(game, game, need, deps.shuffle);
      seat.hand.push(...drawn);
      log(game, `${whoName(game, step.playerId)} rút ${drawn.length} lá (tới ${step.n})`);
      afterDraw(game, seat, drawn);
      return false;
    }
    case "choice":
      return openChoice(game, step, deps);
    case "destroy": {
      const found = findHero(game, step.heroCardId);
      if (!found || found.seat.playerId === step.byPlayerId) {
        log(game, "DESTROY: mục tiêu không còn hợp lệ — bỏ qua");
        return false;
      }
      if (heroCannotBeDestroyed(found.seat)) {
        log(game, `DESTROY: Hero của ${whoName(game, found.seat.playerId)} không thể bị destroy — bỏ qua`);
        return false;
      }
      const destroyer = seatOf(game, step.byPlayerId);
      // Corrupted Sabretooth: "Each time you would DESTROY a Hero card, you may STEAL that Hero card instead."
      if (destroyer && !step.noStealInstead && slainHas(destroyer, "corrupted-sabretooth")) {
        game.queue.unshift({
          op: "choice",
          playerId: step.byPlayerId,
          kind: "confirm",
          count: 1,
          prompt: `Corrupted Sabretooth: STEAL ${cardName(found.hero.card.definitionId)} thay vì DESTROY?`,
          then: [{ op: "steal", heroCardId: step.heroCardId, toPlayerId: step.byPlayerId }],
          otherwise: [{ ...step, noStealInstead: true }],
        });
        return false;
      }
      loseHero(game, found, { kind: "destroy", byPlayerId: step.byPlayerId, itemToPlayerId: step.itemToPlayerId, ...(step.thenIfReal ? { thenIfReal: step.thenIfReal } : {}) }, deps);
      return false;
    }
    case "steal": {
      const found = findHero(game, step.heroCardId);
      const to = seatOf(game, step.toPlayerId);
      if (!found || !to || found.seat.playerId === step.toPlayerId) {
        log(game, "STEAL: mục tiêu không còn hợp lệ — bỏ qua");
        return false;
      }
      if (found.seat.protections.noSteal) {
        log(game, `STEAL: Hero của ${whoName(game, found.seat.playerId)} không thể bị steal — bỏ qua`);
        return false;
      }
      if (to.party.length >= PARTY_CARD_LIMIT) {
        log(game, `STEAL: Party của ${whoName(game, step.toPlayerId)} đã đủ ${PARTY_CARD_LIMIT} Hero — bỏ qua`);
        return false;
      }
      found.seat.party.splice(found.index, 1);
      to.party.push(found.hero);
      log(game, `${whoName(game, step.toPlayerId)} STEAL ${cardName(found.hero.card.definitionId)} của ${whoName(game, found.seat.playerId)}`);
      // W10 Cursed Glove: each other Hero left behind carrying a Glove follows the stolen one (after it). A move is
      // not a steal; a full Party sends the Hero and its items to the discard pile.
      for (const gloved of found.seat.party.filter((hero) => hasAttachment(hero, CURSED_GLOVE))) {
        found.seat.party.splice(found.seat.party.indexOf(gloved), 1);
        if (to.party.length >= PARTY_CARD_LIMIT) {
          game.discard.push(gloved.card, ...detachAll(gloved));
          log(game, `Cursed Glove: Party đầy — ${cardName(gloved.card.definitionId)} và Item vào discard`);
        } else {
          to.party.push(gloved);
          log(game, `Cursed Glove: ${cardName(gloved.card.definitionId)} chuyển theo sang Party của ${whoName(game, step.toPlayerId)}`);
        }
      }
      return false;
    }
    case "move_hero": {
      const found = findHero(game, step.heroCardId);
      const to = seatOf(game, step.toPlayerId);
      if (!found || !to || found.seat === to) return false;
      if (to.party.length >= PARTY_CARD_LIMIT) {
        log(game, `Party của ${whoName(game, step.toPlayerId)} đã đủ ${PARTY_CARD_LIMIT} Hero — không chuyển thêm`);
        return false;
      }
      if (step.onlyIfOwns && findHero(game, step.onlyIfOwns.heroCardId)?.seat.playerId !== step.onlyIfOwns.playerId) {
        log(game, "Không STEAL được — không chuyển Hero");
        return false;
      }
      found.seat.party.splice(found.index, 1);
      to.party.push(found.hero);
      log(game, `${cardName(found.hero.card.definitionId)} chuyển sang Party của ${whoName(game, step.toPlayerId)}`);
      return false;
    }
    case "discard_card":
      game.discard.push(step.card);
      return false;
    case "trade_hands": {
      const a = seatOf(game, step.a);
      const b = seatOf(game, step.b);
      if (!a || !b || a === b) return false;
      [a.hand, b.hand] = [b.hand, a.hand];
      log(game, `${whoName(game, step.a)} và ${whoName(game, step.b)} đổi tay bài`);
      return false;
    }
    case "pull": {
      const from = seatOf(game, step.fromPlayerId);
      const to = seatOf(game, step.toPlayerId);
      if (!from || !to || from === to) return false;
      const pulled: BaseCard[] = [];
      const pullOne = () => {
        if (from.hand.length === 0) return null;
        const pickId = deps.shuffle(from.hand.map((card) => card.cardId))[0];
        const index = from.hand.findIndex((card) => card.cardId === pickId);
        const [card] = from.hand.splice(index, 1);
        to.hand.push(card);
        pulled.push(card);
        return card;
      };
      for (let i = 0; i < step.n; i += 1) pullOne();
      if (step.extraIfKind && pulled[0]?.kind === step.extraIfKind) pullOne();
      // Oracon (DS): a follow-up that depends on the kind of the pulled card.
      if (step.ifKindThen && pulled.some((card) => card.kind === step.ifKindThen!.kind)) game.queue.unshift(...step.ifKindThen.steps);
      if (step.offerPlayIfKind) {
        const playable = pulled.filter((card) => step.offerPlayIfKind!.includes(card.kind));
        if (playable.length > 0) game.queue.unshift(offerPlay(step.toPlayerId, playable, "Chơi ngay lá vừa rút?"));
      }
      log(game, `${whoName(game, step.toPlayerId)} rút ${pulled.length} lá từ tay ${whoName(game, step.fromPlayerId)}`);
      if (step.thenDiscardOne && pulled.length > 0) {
        return openChoice(
          game,
          { op: "choice", playerId: step.toPlayerId, kind: "discard_from_set", count: 1, fromCardIds: pulled.map((c) => c.cardId), prompt: "DISCARD 1 trong các lá vừa rút (Slippery Paws)" },
          deps,
        );
      }
      return false;
    }
    case "pull_from_class": {
      const to = seatOf(game, step.toPlayerId);
      if (!to) return false;
      for (const seat of orderFrom(game, step.toPlayerId)) {
        if (seat.playerId === step.toPlayerId || !hasClassInParty(seat, step.heroClass, game.settings)) continue;
        runStep(game, { op: "pull", fromPlayerId: seat.playerId, toPlayerId: step.toPlayerId, n: 1 }, deps);
      }
      return false;
    }
    case "attack_bonus":
      game.turnAttackBonus = (game.turnAttackBonus ?? 0) + step.n;
      log(game, `+${step.n} cho mọi lần ATTACK đến hết lượt`);
      return false;
    case "open_modifier_window": return false; // handled in advance(), which owns the hooks
    case "add_roll_swing": {
      const seat = seatOf(game, step.playerId);
      if (seat) seat.rollSwings = (seat.rollSwings ?? 0) + 1;
      return false;
    }
    case "apply_roll_swing": {
      const pending = game.queue.find((queued): queued is Extract<Step, { op: "open_modifier_window" }> => queued.op === "open_modifier_window");
      if (!pending) return false;
      pending.roll.passives.push({ source: step.source, label: `${step.label ?? "Majestelk"} (${step.value > 0 ? "+" : ""}${step.value})`, value: step.value, ...(step.side ? { side: step.side } : {}) });
      return false;
    }
    case "attack_monster_now": return false; // handled in advance(), which owns the hooks
    case "rotate_monsters": {
      game.monsterDeck.push(...game.faceUpMonsters.splice(0));
      game.faceUpMonsters.push(...game.monsterDeck.splice(0, FACE_UP_MONSTER_COUNT));
      log(game, "Beast Call: Monster ngửa xuống đáy deck, lật 3 lá mới");
      return false;
    }
    case "arm_silent_shield":
      game.silentShieldBy = step.playerId;
      log(game, `${whoName(game, step.playerId)}: Silent Shield có hiệu lực đến hết lượt`);
      return false;
    case "tether_sacrifice": {
      const found = findHero(game, step.heroCardId);
      if (!found) return false; // already gone: a Hero is lost only once, tethers cannot loop
      log(game, `Soul Tether: ${cardName(found.hero.card.definitionId)} bị SACRIFICE`);
      loseHero(game, found, { kind: "sacrifice" }, deps);
      return false;
    }
    case "swap_leaders": {
      const a = seatOf(game, step.a);
      const b = seatOf(game, step.b);
      if (!a || !b || a === b) return false;
      [a.leaderId, b.leaderId] = [b.leaderId, a.leaderId];
      log(game, `${whoName(game, step.a)} và ${whoName(game, step.b)} đổi Party Leader cho nhau`);
      return false;
    }
    case "discard_from_hand": {
      const seat = seatOf(game, step.playerId);
      const index = seat ? seat.hand.findIndex((card) => card.cardId === step.cardId) : -1;
      if (!seat || index < 0) return false;
      game.discard.push(seat.hand.splice(index, 1)[0]);
      log(game, `${whoName(game, step.playerId)} DISCARD 1 lá`);
      return false;
    }
    case "end_turn_now":
      game.actionPoints = 0;
      log(game, "Kết thúc lượt (Vicious Wildcat)");
      return false;
    case "sacrifice_hero_card": {
      const found = findHero(game, step.heroCardId);
      if (!found) return false;
      loseHero(game, found, { kind: "sacrifice" }, deps);
      return false;
    }
    case "brawling_spirit": {
      const steps: Step[] = [];
      for (const seat of orderFrom(game, step.actorId)) {
        const cards = seat.party.length + seat.party.reduce((sum, hero) => sum + hero.attachments.length, 0); // E15: Heroes + equipped Items
        if (cards > 3) steps.push({ op: "choice", playerId: seat.playerId, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Brawling Spirit)" });
      }
      game.queue.unshift(...steps);
      return false;
    }
    case "return_class_heroes": {
      let count = 0;
      for (const seat of game.seats) {
        for (const hero of [...seat.party]) {
          if (hero.card.cardId === step.exceptHeroCardId || !heroClasses(hero, game.settings).includes(step.heroClass as never)) continue;
          seat.party.splice(seat.party.indexOf(hero), 1);
          seat.hand.push(hero.card, ...detachAll(hero));
          count += 1;
        }
      }
      log(game, `Roaryal Guard: ${count} Hero (${step.heroClass}) trở về tay chủ`);
      return false;
    }
    case "lock_modifiers":
      game.modifierLockBy = step.playerId;
      log(game, `${whoName(game, step.playerId)}: người khác không thể chơi Modifier đến hết lượt`);
      return false;
    case "draw_for": {
      const seat = seatOf(game, step.playerId);
      if (!seat) return false;
      const count = step.rule === "other_party_monsters"
        ? game.seats.filter((other) => other !== seat).reduce((sum, other) => sum + other.slain.length, 0)
        : seat.party.reduce((sum, hero) => sum + hero.attachments.length, 0);
      if (count === 0) {
        log(game, `${whoName(game, step.playerId)}: không có lá nào để đếm — không rút`);
        return false;
      }
      game.queue.unshift({ op: "draw", playerId: step.playerId, n: count });
      return false;
    }
    case "return_party_items": {
      const from = seatOf(game, step.fromPlayerId);
      const to = seatOf(game, step.toPlayerId);
      if (!from || !to) return false;
      let count = 0;
      for (const hero of from.party) {
        const removed = detachAll(hero);
        to.hand.push(...removed);
        count += removed.length;
      }
      log(game, `${count} Item của ${whoName(game, from.playerId)} trở về tay ${whoName(game, to.playerId)}`);
      return false;
    }
    case "roll_bonus":
      game.turnRollBonus += step.n;
      log(game, `+${step.n} cho mọi lần roll đến hết lượt`);
      return false;
    case "protect": {
      const seat = seatOf(game, step.playerId);
      if (seat) seat.protections[step.kind] = true;
      log(game, `${whoName(game, step.playerId)}: ${step.kind === "noDestroy" ? "Hero không thể bị destroy" : step.kind === "noSteal" ? "Hero không thể bị steal" : "Hero bị destroy/sacrifice sẽ về tay"} tới lượt sau`);
      return false;
    }
    case "no_challenge":
      game.noChallengeThisTurn = true;
      log(game, "Các lá chơi tiếp trong lượt này không thể bị Challenge");
      return false;
    case "return_item": {
      const found = findHero(game, step.heroCardId);
      const item = found?.hero.attachments.find((card) =>
        step.itemCardId ? card.cardId === step.itemCardId : !step.onlyCursed || card.kind === "cursed_item");
      if (!found || !item) {
        log(game, "Trả Item: mục tiêu không còn hợp lệ — bỏ qua");
        return false;
      }
      const owner = seatOf(game, step.toPlayerId ?? found.seat.playerId) ?? found.seat;
      detach(found.hero, item.cardId);
      owner.hand.push(item);
      log(game, `${cardName(item.definitionId)} trở về tay ${whoName(game, owner.playerId)}`);
      return false;
    }
    case "return_all_items": {
      let count = 0;
      for (const seat of game.seats) {
        for (const hero of seat.party) {
          const removed = detachAll(hero);
          seat.hand.push(...removed);
          count += removed.length;
        }
      }
      log(game, `${count} Item trở về tay chủ Party`);
      return false;
    }
    case "each_other_choice": {
      const steps: Step[] = [];
      for (const seat of orderFrom(game, step.actorId)) {
        if (seat.playerId === step.actorId) continue;
        if (step.requireClass && !hasClassInParty(seat, step.requireClass, game.settings)) continue;
        const prompt =
          step.kind === "give_card"
            ? `Đưa ${step.count} lá cho ${whoName(game, step.actorId)}`
            : step.kind === "sacrifice_hero"
              ? `SACRIFICE ${step.count} Hero`
              : `DISCARD ${step.count} lá`;
        steps.push({
          op: "choice",
          playerId: seat.playerId,
          kind: step.kind,
          count: step.count,
          prompt,
          ...(step.kind === "give_card" ? { recipientId: step.actorId } : {}),
          ...(step.collect ? { collect: true } : {}),
        });
      }
      game.queue.unshift(...steps);
      return false;
    }
  }
}

function orderFrom(game: EngineState, playerId: string): BaseSeat[] {
  const start = game.seats.findIndex((seat) => seat.playerId === playerId);
  return [...game.seats.slice(start), ...game.seats.slice(0, start)];
}

/** C04: pending Monster → Party, then the win check. Idempotent (a replayed step finds no pending Monster). Returns true if the game ended. */
function awardMonster(game: EngineState, step: Extract<Step, { op: "award_monster" }>, hooks: EngineHooks): boolean {
  const seat = seatOf(game, step.playerId);
  const pending = game.pendingMonster;
  if (!seat || !pending || pending.monsterId !== step.monsterId || pending.playerId !== step.playerId) return false;
  game.pendingMonster = null;
  seat.slain.push(step.monsterId);
  log(game, `${whoName(game, step.playerId)} nhận ${cardName(monsterData(step.monsterId).definitionId)} vào Party`);
  return hooks.afterSlay(game, seat);
}

function retryHeroRoll(game: EngineState, step: Extract<Step, { op: "retry_hero_roll" }>, deps: EngineDeps, hooks: EngineHooks): void {
  const found = findHero(game, step.heroCardId);
  const data = found ? cardDataOfKind(found.hero.card.definitionId, "hero") : null;
  if (!found || !data || found.seat.playerId !== step.playerId || validateTargets(game, step.playerId, data.target, step.targets)) {
    log(game, "Thử lại: Hero hoặc mục tiêu không còn hợp lệ — bỏ qua");
    return;
  }
  startHeroRoll(game, step.playerId, step.heroCardId, step.targets, deps, hooks);
}

/** Drains the effect queue until empty or a choice opens; then auto-ends the turn if AP ≤ 0. */
export function advance(game: EngineState, deps: EngineDeps, hooks: EngineHooks): void {
  if (game.phase !== "turn_active") return;
  while (game.chain === null && game.queue.length > 0) {
    const step = game.queue.shift()!;
    if (step.op === "award_monster") {
      if (awardMonster(game, step, hooks)) return; // C04: win → stop; no passives / refill after GAME_OVER
    } else if (step.op === "retry_hero_roll") {
      retryHeroRoll(game, step, deps, hooks);
    } else if (step.op === "open_modifier_window") {
      openModifierWindowNow(game, step.roll, deps, hooks);
    } else if (step.op === "attack_monster_now") {
      const seat = seatOf(game, step.playerId);
      if (seat && game.faceUpMonsters.includes(step.monsterId) && meetsRequirement(seat, monsterData(step.monsterId), game.settings)) {
        startAttack(game, step.playerId, step.monsterId, deps, hooks);
      } else {
        log(game, "Big Buckley: Monster không còn hợp lệ — không ATTACK");
      }
    } else {
      runStep(game, step, deps);
    }
    if (game.phase !== "turn_active") return;
  }
  if (game.chain === null && game.queue.length === 0 && (game.actionPoints ?? 0) <= 0) {
    // W08: an unused Muscipula Rex draw credit is spent now (AP is gone and the credit would be lost with the turn).
    const active = game.turnOrder[game.currentPlayerIndex];
    if ((game.freeDrawCredit ?? 0) > 0 && active) {
      game.freeDrawCredit = 0;
      log(game, `${whoName(game, active)}: Muscipula Rex — rút miễn AP`);
      game.queue.push({ op: "draw", playerId: active, n: 1 });
      advance(game, deps, hooks);
      return;
    }
    hooks.autoEndTurn(game, deps);
  }
}

// ---------------------------------------------------------------- choices

export function resolveChoice(
  game: EngineState,
  playerId: string,
  choiceId: string,
  cardIds: string[],
  deps: EngineDeps,
  hooks: EngineHooks,
  accept?: boolean,
  targets?: BaseTargets,
): string {
  const chain = game.chain;
  if (!chain || chain.step !== "choice") return "NO_PENDING_CHOICE";
  const choice = chain.choice;
  if (choice.choiceId !== choiceId) return "STALE_CHOICE";
  if (choice.playerId !== playerId) return "NOT_YOUR_CHOICE";
  if (choice.kind === "confirm") {
    if (cardIds.length !== 0 || accept === undefined) return "INVALID_CHOICE";
    game.chain = null;
    log(game, `${whoName(game, playerId)} ${accept ? "đồng ý" : "từ chối"}: ${choice.prompt}`);
    if (accept && choice.then) game.queue.unshift(...choice.then);
    if (!accept && choice.otherwise) game.queue.unshift(...choice.otherwise);
    advance(game, deps, hooks);
    return "ACCEPTED";
  }
  if (accept !== undefined) return "INVALID_CHOICE";
  const unique = new Set(cardIds);
  if (unique.size !== cardIds.length || cardIds.length < choice.min || cardIds.length > choice.max) return "INVALID_CHOICE";
  const seat = seatOf(game, playerId)!;
  const eligible = eligibleChoiceCards(game, choice).map((card) => card.cardId);
  if (!cardIds.every((id) => eligible.includes(id))) return "INVALID_CHOICE";
  if (choice.kind === "play_card" && cardIds.length === 1) {
    const card = seat.hand.find((candidate) => candidate.cardId === cardIds[0])!;
    const error = playTargetError(game, seat, card, targets ?? {});
    if (error) return error;
    seat.hand.splice(seat.hand.indexOf(card), 1);
    game.chain = null;
    log(game, `${whoName(game, playerId)} chơi ngay ${cardName(card.definitionId)} (không tốn AP)`);
    // C03: the parent's continuation waits for this child play (Challenge → effect → cleanup).
    openChallengeWindow(game, { actorId: playerId, card, targets: targets ?? {}, ...(choice.thenIfPicked ? { continuation: choice.thenIfPicked } : {}) }, deps, hooks);
    advance(game, deps, hooks);
    return "ACCEPTED";
  }
  if (targets !== undefined) return "INVALID_CHOICE";
  const queued = game.queue.length;
  applyChoice(game, choice, seat, cardIds, deps);
  game.chain = null;
  // Steps the selection itself queued (e.g. an E07 replacement prompt) must run before the dependent effect.
  if (choice.thenIfPaid) game.queue.splice(game.queue.length - queued, 0, ...choice.thenIfPaid);
  advance(game, deps, hooks);
  return "ACCEPTED";
}

export function eligibleChoiceCards(game: EngineState, choice: PendingChoice): BaseCard[] {
  const seat = seatOf(game, choice.playerId);
  if (!seat) return [];
  switch (choice.kind) {
    case "sacrifice_hero":
      return seat.party.map((hero) => hero.card);
    case "take_from_discard":
      return game.discard.filter(
        (card) =>
          (!choice.filterKinds || choice.filterKinds.includes(card.kind)) &&
          (!choice.fromCardIds || choice.fromCardIds.includes(card.cardId)) &&
          !choice.excludeCardIds?.includes(card.cardId),
      );
    case "discard_from_set":
      return seat.hand.filter((card) => choice.fromCardIds?.includes(card.cardId));
    case "confirm":
    case "view_hand":
      return choice.kind === "view_hand" ? [...(seatOf(game, choice.targetPlayerId ?? "")?.hand ?? [])] : [];
    case "play_card":
      return seat.hand.filter(
        (card) =>
          (!choice.fromCardIds || choice.fromCardIds.includes(card.cardId)) &&
          (!choice.filterKinds || choice.filterKinds.includes(card.kind)) &&
          canPlaySomewhere(game, seat, card),
      );
    case "destroy_hero":
      return game.seats.filter((other) => other !== seat).flatMap((other) => other.party.map((hero) => hero.card));
    case "steal_hero":
      return game.seats.filter((other) => other !== seat && !other.protections.noSteal).flatMap((other) => other.party.map((hero) => hero.card));
    case "bring_hero":
      return seat.party.length >= PARTY_CARD_LIMIT
        ? []
        : (seatOf(game, choice.targetPlayerId ?? "")?.hand ?? []).filter((card) => card.kind === "hero");
    case "attack_monster":
      return game.faceUpMonsters
        .filter((id) => meetsRequirement(seat, monsterData(id), game.settings))
        .map((id) => ({ cardId: id, definitionId: monsterDefinitionId(id), kind: "monster" as const }));
    case "slay_monster":
      return game.faceUpMonsters.map((id) => ({ cardId: id, definitionId: monsterDefinitionId(id), kind: "monster" as const }));
    case "take_from_top":
      return game.mainDeck.slice(0, 3);
    case "order_top":
      return game.mainDeck.filter((card) => choice.fromCardIds?.includes(card.cardId));
    case "take_from_hand":
      return (seatOf(game, choice.targetPlayerId ?? "")?.hand ?? []).filter((card) => !choice.filterKinds || choice.filterKinds.includes(card.kind));
    case "sacrifice_item":
      return seat.party.flatMap((hero) => hero.attachments);
    case "choose_class":
    case "make_sacrifice":
      return game.seats.flatMap((other) => other.party.map((hero) => hero.card));
    default:
      return seat.hand.filter((card) => !choice.filterKinds || choice.filterKinds.includes(card.kind));
  }
}

function applyChoice(game: EngineState, choice: PendingChoice, seat: BaseSeat, cardIds: string[], deps: EngineDeps): void {
  const takeFromHand = (id: string) => {
    const index = seat.hand.findIndex((card) => card.cardId === id);
    return index >= 0 ? seat.hand.splice(index, 1)[0] : null;
  };
  switch (choice.kind) {
    case "discard":
    case "discard_from_set":
      for (const id of cardIds) {
        const card = takeFromHand(id);
        if (card) {
          game.discard.push(card);
          if (choice.collect) game.collected.push(card.cardId);
        }
      }
      log(game, `${whoName(game, seat.playerId)} DISCARD ${cardIds.length} lá`);
      if (choice.perCardThen) {
        const steps: Step[] = [];
        for (let i = 0; i < cardIds.length; i += 1) steps.push(...choice.perCardThen);
        game.queue.unshift(...steps);
      }
      return;
    case "destroy_hero":
      game.queue.unshift(...cardIds.map((id): Step => {
        const found = findHero(game, id);
        const matches = choice.thenIfClass && found && heroClasses(found.hero, game.settings).includes(choice.thenIfClass.heroClass as never);
        return { op: "destroy", heroCardId: id, byPlayerId: seat.playerId, ...(matches ? { thenIfReal: choice.thenIfClass!.steps } : {}) };
      }));
      return;
    case "slay_monster": {
      const id = cardIds[0];
      const index = id ? game.faceUpMonsters.indexOf(id) : -1;
      if (index < 0) return;
      game.faceUpMonsters.splice(index, 1);
      game.pendingMonster = { playerId: seat.playerId, monsterId: id, slot: index };
      log(game, `${whoName(game, seat.playerId)} SLAY ${cardName(monsterData(id).definitionId)} (Vicious Wildcat — không roll)`);
      game.queue.unshift(...slaySteps(game, seat.playerId, id, index), { op: "end_turn_now" });
      return;
    }
    case "sacrifice_item":
      for (const id of cardIds) {
        const holder = seat.party.find((hero) => hero.attachments.some((card) => card.cardId === id));
        if (holder) game.queue.unshift({ op: "discard_attachment", heroCardId: holder.card.cardId, itemCardId: id });
      }
      return;
    case "choose_class": {
      const found = cardIds[0] ? findHero(game, cardIds[0]) : null;
      const heroClass = found ? heroClasses(found.hero, game.settings)[0] : undefined;
      if (heroClass) game.queue.unshift({ op: "return_class_heroes", heroClass });
      return;
    }
    case "make_sacrifice": {
      const found = cardIds[0] ? findHero(game, cardIds[0]) : null;
      if (found) game.queue.unshift({ op: "choice", playerId: found.seat.playerId, kind: "sacrifice_hero", count: 1, prompt: `SACRIFICE 1 Hero (Lightning Labrys — ${whoName(game, seat.playerId)} chọn bạn)` });
      return;
    }
    case "steal_hero":
      game.queue.unshift(...cardIds.map((id): Step => ({ op: "steal", heroCardId: id, toPlayerId: seat.playerId })));
      return;
    case "bring_hero": {
      const source = seatOf(game, choice.targetPlayerId ?? "");
      const index = source ? source.hand.findIndex((card) => card.cardId === cardIds[0]) : -1;
      if (source && index >= 0 && seat.party.length < PARTY_CARD_LIMIT) {
        const [card] = source.hand.splice(index, 1);
        seat.party.push({ card, attachments: [] });
        log(game, `${whoName(game, seat.playerId)} đưa ${cardName(card.definitionId)} từ tay ${whoName(game, source.playerId)} vào Party`);
      }
      return;
    }
    case "attack_monster":
      if (cardIds[0]) game.queue.unshift({ op: "attack_monster_now", playerId: seat.playerId, monsterId: cardIds[0] });
      return;
    case "take_from_top":
      for (const id of cardIds) {
        const index = game.mainDeck.findIndex((card) => card.cardId === id);
        if (index >= 0) seat.hand.push(game.mainDeck.splice(index, 1)[0]);
      }
      log(game, `${whoName(game, seat.playerId)} lấy 1 lá từ các lá trên cùng của deck`);
      {
        // "return the other two to the top of the deck in any order" — owner: the player orders them.
        const rest = game.mainDeck.slice(0, Math.max(0, 3 - cardIds.length)).map((card) => card.cardId);
        if (rest.length >= 2) {
          game.queue.unshift({ op: "choice", playerId: seat.playerId, kind: "order_top", count: rest.length, fromCardIds: rest, prompt: "Xếp thứ tự các lá trả lại đỉnh deck (lá đầu = trên cùng)" });
        }
      }
      return;
    case "order_top": {
      const picked = cardIds.map((id) => game.mainDeck.find((card) => card.cardId === id)!).filter(Boolean);
      game.mainDeck = [...picked, ...game.mainDeck.filter((card) => !cardIds.includes(card.cardId))];
      log(game, `${whoName(game, seat.playerId)} xếp lại ${picked.length} lá trên cùng deck`);
      return;
    }
    case "view_hand":
      log(game, `${whoName(game, seat.playerId)} đã xem tay bài của ${whoName(game, choice.targetPlayerId ?? "")}`);
      return;
    case "take_from_hand": {
      const target = seatOf(game, choice.targetPlayerId ?? "");
      for (const id of cardIds) {
        const index = target ? target.hand.findIndex((card) => card.cardId === id) : -1;
        if (target && index >= 0) seat.hand.push(target.hand.splice(index, 1)[0]);
      }
      log(game, `${whoName(game, seat.playerId)} lấy 1 lá từ tay ${whoName(game, choice.targetPlayerId ?? "")}`);
      if (choice.thenOfferPlayTaken && cardIds.length > 0) {
        game.queue.push({ op: "choice", playerId: seat.playerId, kind: "play_card", count: 1, upTo: true, fromCardIds: [...cardIds], prompt: "Chơi ngay lá vừa lấy (tùy chọn)" });
      }
      return;
    }
    case "play_card":
      return;
    case "give_card": {
      const recipient = choice.recipientId ? seatOf(game, choice.recipientId) : undefined;
      for (const id of cardIds) {
        const card = takeFromHand(id);
        if (card) (recipient ? recipient.hand : game.discard).push(card);
      }
      log(game, `${whoName(game, seat.playerId)} đưa ${cardIds.length} lá cho ${whoName(game, choice.recipientId ?? "")}`);
      return;
    }
    case "take_from_discard":
      for (const id of cardIds) {
        const index = game.discard.findIndex((card) => card.cardId === id);
        if (index >= 0) {
          const [card] = game.discard.splice(index, 1);
          seat.hand.push(card);
          log(game, `${whoName(game, seat.playerId)} lấy ${cardName(card.definitionId)} từ discard`);
        }
      }
      if (choice.thenPlayTaken && cardIds.length > 0) {
        game.queue.push({ op: "choice", playerId: seat.playerId, kind: "play_card", count: 1, fromCardIds: [...cardIds], prompt: "Chơi ngay Hero vừa lấy (Magus Moose)" });
      }
      return;
    case "confirm":
      return;
    case "sacrifice_hero": {
      const before = game.queue.length;
      let sacrificed = 0;
      for (const id of cardIds) {
        const found = findHero(game, id);
        if (!found || found.seat !== seat) continue;
        loseHero(game, found, { kind: "sacrifice" }, deps);
        sacrificed += 1;
      }
      if (choice.destroyEqual && sacrificed > 0) {
        // Rabid Beast: the destroy follows the sacrifices (and any replacement prompt they opened). Counted by credited sacrifices.
        game.queue.splice(game.queue.length - before, 0, { op: "choice", playerId: seat.playerId, kind: "destroy_hero", count: sacrificed, prompt: `DESTROY ${sacrificed} Hero (Rabid Beast)` });
      }
      return;
    }
  }
}


// ---------------------------------------------------------------- windows

function responders<T extends string>(game: EngineState, except: string | null, value: T): Record<string, T> {
  return Object.fromEntries(game.seats.filter((seat) => seat.playerId !== except).map((seat) => [seat.playerId, value]));
}

/** Can the pending card be challenged at all? (Iron Resolve; Warworn Owlbear for Items.) */
function challengeable(game: EngineState, attempt: Attempt): boolean {
  if (game.noChallengeThisTurn) return false;
  const actor = seatOf(game, attempt.actorId);
  if (actor && (attempt.card.kind === "item" || attempt.card.kind === "cursed_item") && slainHas(actor, "warworn-owlbear")) return false;
  return true;
}

export function openChallengeWindow(game: EngineState, attempt: Attempt, deps: EngineDeps, hooks: EngineHooks): void {
  if (!challengeable(game, attempt)) {
    log(game, `${cardName(attempt.card.definitionId)} không thể bị Challenge`);
    resolveAttempt(game, attempt, deps, hooks);
    return;
  }
  game.chain = {
    step: "challenge_window",
    windowId: deps.newId(),
    deadlineAt: deps.now() + game.settings.reactionSeconds * 1000,
    attempt,
    responders: responders(game, attempt.actorId, "pending"),
  };
}

export function challenge(game: EngineState, playerId: string, windowId: string, cardId: string, deps: EngineDeps, hooks: EngineHooks): string {
  const chain = game.chain;
  if (!chain || chain.step !== "challenge_window") return "NO_OPEN_WINDOW";
  if (chain.windowId !== windowId) return "STALE_WINDOW";
  if (deps.now() >= chain.deadlineAt) return "WINDOW_CLOSED";
  if (!(playerId in chain.responders)) return "NOT_ELIGIBLE";
  if (chain.responders[playerId] !== "pending") return "ALREADY_RESPONDED";
  const seat = seatOf(game, playerId)!;
  const index = seat.hand.findIndex((card) => card.cardId === cardId);
  if (index < 0 || seat.hand[index].kind !== "challenge") return "CARD_NOT_PLAYABLE";
  // E08: a class Challenge needs a real Hero of that effective class (Leader does not count). Rejected before any
  // mutation, so the card is kept and the window stays open for the next valid Challenge.
  const challengeData = cardDataOfKind(seat.hand[index].definitionId, "challenge");
  if (challengeData?.requiredClass && !seat.party.some((hero) => heroClasses(hero, game.settings).includes(challengeData.requiredClass!))) {
    return "REQUIREMENT_NOT_MET";
  }
  const [card] = seat.hand.splice(index, 1);
  game.discard.push(card);
  const attempt = chain.attempt;
  log(game, `${whoName(game, playerId)} CHALLENGE ${cardName(attempt.card.definitionId)} của ${whoName(game, attempt.actorId)}`);
  // RULE-17: server rolls both sides; then a Modifier window over both rolls.
  const defender = seatOf(game, attempt.actorId)!;
  const passives: SidedPassive[] = [
    ...rollPassives(seat, "challenge_challenger", {}).map((p) => ({ ...p, side: "challenger" as const })),
    ...rollPassives(defender, "challenge_defender", { turnRollBonus: game.turnRollBonus }).map((p) => ({ ...p, side: "defender" as const })),
  ];
  // E08: the intrinsic bonus belongs to the challenger's roll only and is shown apart from other passives.
  if (challengeData?.rollBonus) {
    passives.push({ source: card.definitionId, label: `${cardName(card.definitionId)} (+${challengeData.rollBonus})`, value: challengeData.rollBonus, side: "challenger" });
  }
  const dice = [...deps.rollDice()] as [number, number];
  const challengerDice = [...deps.rollDice()] as [number, number];
  openModifierWindow(game, { kind: "challenge", rollerId: attempt.actorId, dice, challengerId: playerId, challengerDice, attempt, modifiers: [], passives }, deps, hooks);
  // Bloodwing slain passive: "Each time another player CHALLENGES you, that player must DISCARD a card."
  if (slainHas(defender, "bloodwing")) {
    game.queue.unshift({ op: "choice", playerId, kind: "discard", count: 1, prompt: "DISCARD 1 lá (Bloodwing)" });
  }
  return "ACCEPTED";
}

/**
 * W01 Majestelk: before a roll's Modifier window opens, each roller with active swings answers one popup
 * (accept = +5×n, decline = -5×n, timeout = neither). The popups run through the queue; the window follows them.
 */
function openModifierWindow(game: EngineState, roll: RollState, deps: EngineDeps, hooks: EngineHooks): void {
  const owners: Array<{ playerId: string; side?: "challenger" | "defender" }> =
    roll.kind === "challenge"
      ? [{ playerId: roll.rollerId, side: "defender" }, { playerId: roll.challengerId, side: "challenger" }]
      : [{ playerId: roll.rollerId }];
  const steps: Step[] = [];
  // Biggest Ring Ever (BN): "Each time you roll to use the equipped Hero card's effect, you may DISCARD up to 3 cards. For each, +2."
  if (roll.kind === "hero_effect") {
    const rolled = findHero(game, roll.heroCardId);
    if (rolled && rolled.seat.playerId === roll.rollerId && rolled.hero.attachments.some((card) => card.definitionId === BIGGEST_RING_EVER)) {
      steps.push({
        op: "choice", playerId: roll.rollerId, kind: "discard", count: 3, upTo: true,
        prompt: "Biggest Ring Ever: DISCARD tối đa 3 lá, mỗi lá +2 cho roll này (tùy chọn)",
        perCardThen: [{ op: "apply_roll_swing", value: 2, source: BIGGEST_RING_EVER, label: "Biggest Ring Ever" }],
      });
    }
  }
  for (const { playerId, side } of owners) {
    // The Fearless Flame (DS): "Each time you roll the dice, you may DISCARD a card. If you do, +1 to your roll."
    if (seatOf(game, playerId)?.leaderId === FEARLESS_FLAME) {
      steps.push({
        op: "choice", playerId, kind: "discard", count: 1, upTo: true,
        prompt: "The Fearless Flame: DISCARD 1 lá để +1 cho roll này (tùy chọn)",
        perCardThen: [{ op: "apply_roll_swing", value: 1, source: FEARLESS_FLAME, label: "The Fearless Flame", ...(side ? { side } : {}) }],
      });
    }
    const swings = seatOf(game, playerId)?.rollSwings ?? 0;
    if (swings <= 0) continue;
    const magnitude = 5 * swings;
    const apply = (value: number): Step[] => [{ op: "apply_roll_swing", value, source: MAJESTELK, ...(side ? { side } : {}) }];
    steps.push({
      op: "choice", playerId, kind: "confirm", count: 1, onTimeout: [],
      prompt: `Majestelk: Đồng ý = +${magnitude}, Từ chối = -${magnitude} cho roll này`,
      then: apply(magnitude), otherwise: apply(-magnitude),
    });
  }
  if (steps.length === 0) {
    openModifierWindowNow(game, roll, deps, hooks);
    return;
  }
  game.chain = null;
  game.queue.unshift(...steps, { op: "open_modifier_window", roll });
  advance(game, deps, hooks);
}

function openModifierWindowNow(game: EngineState, roll: RollState, deps: EngineDeps, hooks: EngineHooks): void {
  const { total, challengerTotal } = rollTotals(roll);
  log(
    game,
    roll.kind === "challenge"
      ? `Roll Challenge: ${whoName(game, roll.challengerId)} ${challengerTotal} vs ${whoName(game, roll.rollerId)} ${total}`
      : `${whoName(game, roll.rollerId)} roll ${roll.dice[0]}+${roll.dice[1]} → ${total}`,
  );
  game.chain = {
    step: "modifier_window",
    windowId: deps.newId(),
    deadlineAt: deps.now() + game.settings.reactionSeconds * 1000,
    roll,
    responders: modifierResponders(game, roll),
  };
  // Q-11 switch on: every slot may already be used → close at once.
  maybeCloseModifierWindow(game, deps, hooks);
}

/**
 * C10: every player may play any number of Modifiers on the same roll until they Skip (final) or the
 * fixed absolute deadline passes. The window closes early only when everyone has Skipped.
 * (The legacy one-slot option `leaderPassiveUsesModifierSlot` was removed: it conflicted with C10.)
 */
function modifierResponders(game: EngineState, _roll: RollState): Record<string, "pending" | "passed"> {
  return responders<"pending" | "passed">(game, null, "pending");
}

export function playModifier(
  game: EngineState,
  playerId: string,
  payload: { windowId: string; cardInstanceId: string; value: number; side?: "challenger" | "defender"; leaderBonus?: 1 | -1 },
  deps: EngineDeps,
  hooks: EngineHooks,
): string {
  const chain = game.chain;
  if (!chain || chain.step !== "modifier_window") return "NO_OPEN_WINDOW";
  if (chain.windowId !== payload.windowId) return "STALE_WINDOW";
  if (deps.now() >= chain.deadlineAt) return "WINDOW_CLOSED";
  if (!(playerId in chain.responders)) return "NOT_ELIGIBLE";
  if (chain.responders[playerId] !== "pending") return "ALREADY_RESPONDED"; // Skip is final
  const seat = seatOf(game, playerId)!;
  const index = seat.hand.findIndex((card) => card.cardId === payload.cardInstanceId);
  if (index < 0 || seat.hand[index].kind !== "modifier") return "CARD_NOT_PLAYABLE";
  const data = cardDataOfKind(seat.hand[index].definitionId, "modifier");
  if (!data || !data.options.includes(payload.value)) return "INVALID_MODIFIER_VALUE";
  const roll = chain.roll;
  if (roll.kind === "challenge" ? !payload.side : payload.side !== undefined) return "INVALID_MODIFIER_SIDE";
  if (payload.leaderBonus !== undefined && !leaderIs(seat, "the-protecting-horn")) return "INVALID_LEADER_BONUS";
  if (game.modifierLockBy && game.modifierLockBy !== playerId) return "MODIFIERS_LOCKED";
  if ((seat.hand[index].definitionId === DS_MODIFIER_PLUS_6 || seat.hand[index].definitionId === DS_MODIFIER_MINUS_6) && seat.hand.length < 2) return "CARD_NOT_PLAYABLE"; // needs another card to DISCARD
  const [card] = seat.hand.splice(index, 1);
  game.discard.push(card);
  const side = payload.side;
  let value = payload.value;
  // BN Modifier +2/-2: "If you are attacking a Monster card, +4 to that roll instead" — only on your own ATTACK roll.
  if (card.definitionId === BN_MODIFIER_PLUS_2_MINUS_2 && value === 2 && roll.kind === "attack" && roll.rollerId === playerId) value = 4;
  roll.modifiers.push({ playerId, cardId: card.cardId, value, ...(side ? { side } : {}) });
  // DS Modifier +6 / -6: "...rolls the dice and DISCARD a card" — a mandatory discard once the roll settles.
  if (card.definitionId === DS_MODIFIER_PLUS_6 || card.definitionId === DS_MODIFIER_MINUS_6) {
    game.queue.push({ op: "choice", playerId, kind: "discard", count: 1, prompt: "DISCARD 1 lá (Modifier ±6)" });
  }
  // BN Modifier +7: "DISCARD your hand" (the played card is already in the discard pile).
  if (card.definitionId === BN_MODIFIER_PLUS_7 && seat.hand.length > 0) {
    game.discard.push(...seat.hand.splice(0));
    log(game, `${whoName(game, playerId)} DISCARD cả tay (Modifier +7)`);
  }
  hooks.afterModifierPlayed?.(game);
  if (payload.leaderBonus !== undefined) {
    roll.passives.push({
      source: "hts.base.v1.party-leader.the-protecting-horn",
      label: `passive của Leader: The Protecting Horn (${whoName(game, playerId)})`,
      value: payload.leaderBonus,
      ...(side ? { side } : {}),
    });
  }
  // Abyss Queen slain passive: "Each time another player plays a Modifier card on one of your rolls, +1 to your roll."
  const rollOwner = roll.kind === "challenge" ? (side === "challenger" ? roll.challengerId : roll.rollerId) : roll.rollerId;
  const owner = seatOf(game, rollOwner);
  if (owner && rollOwner !== playerId && slainHas(owner, "abyss-queen")) {
    roll.passives.push({ source: "hts.base.v1.monster.abyss-queen", label: "Abyss Queen (đã slay)", value: 1, ...(side ? { side } : {}) });
  }
  // Crowned Serpent: "Each time any player (including you) plays a Modifier card, you may DRAW a card."
  for (const holder of game.seats) {
    if (slainHas(holder, "crowned-serpent")) {
      game.queue.push(may(holder.playerId, "Crowned Serpent: DRAW 1 lá?", [{ op: "draw", playerId: holder.playerId, n: 1 }]));
    }
  }
  log(game, `${whoName(game, playerId)} chơi Modifier ${payload.value > 0 ? "+" : ""}${payload.value}${side ? ` (${side})` : ""}`);
  // C10: playing a card keeps the player pending (may add more until Skip); the deadline is never extended.
  return "ACCEPTED";
}

/**
 * W09 The Noble Shaman: a Leader passive (not a Modifier card), once per turn on every player's turn,
 * -1 to the chosen roll of an open Modifier window. A player who already Skipped (final) cannot use it.
 */
export function useNobleShaman(
  game: EngineState,
  playerId: string,
  payload: { windowId: string; side?: "challenger" | "defender" },
  deps: EngineDeps,
): string {
  const chain = game.chain;
  if (!chain || chain.step !== "modifier_window") return "NO_OPEN_WINDOW";
  if (chain.windowId !== payload.windowId) return "STALE_WINDOW";
  if (deps.now() >= chain.deadlineAt) return "WINDOW_CLOSED";
  if (!(playerId in chain.responders)) return "NOT_ELIGIBLE";
  if (chain.responders[playerId] !== "pending") return "ALREADY_RESPONDED";
  const seat = seatOf(game, playerId)!;
  if (seat.leaderId !== NOBLE_SHAMAN || game.shamanUsed) return "LEADER_ACTION_UNAVAILABLE";
  const roll = chain.roll;
  if (roll.kind === "challenge" ? !payload.side : payload.side !== undefined) return "INVALID_MODIFIER_SIDE";
  game.shamanUsed = true;
  roll.passives.push({
    source: NOBLE_SHAMAN,
    label: `passive của Leader: The Noble Shaman (${whoName(game, playerId)})`,
    value: -1,
    ...(payload.side ? { side: payload.side } : {}),
  });
  log(game, `${whoName(game, playerId)}: The Noble Shaman -1${payload.side ? ` (${payload.side})` : ""}`);
  return "ACCEPTED";
}

export function pass(game: EngineState, playerId: string, windowId: string, deps: EngineDeps, hooks: EngineHooks): string {
  const chain = game.chain;
  if (!chain || (chain.step !== "challenge_window" && chain.step !== "modifier_window")) return "NO_OPEN_WINDOW";
  if (chain.windowId !== windowId) return "STALE_WINDOW";
  if (deps.now() >= chain.deadlineAt) return "WINDOW_CLOSED";
  if (!(playerId in chain.responders)) return "NOT_ELIGIBLE";
  if (chain.responders[playerId] !== "pending") return "ALREADY_RESPONDED";
  chain.responders[playerId] = "passed";
  if (chain.step === "challenge_window") {
    if (Object.values(chain.responders).every((state) => state !== "pending")) {
      game.chain = null;
      resolveAttempt(game, chain.attempt, deps, hooks);
      advance(game, deps, hooks);
    }
  } else {
    maybeCloseModifierWindow(game, deps, hooks);
  }
  return "ACCEPTED";
}

function maybeCloseModifierWindow(game: EngineState, deps: EngineDeps, hooks: EngineHooks): void {
  const chain = game.chain;
  if (chain?.step !== "modifier_window") return;
  if (Object.values(chain.responders).some((state) => state === "pending")) return;
  closeModifierWindow(game, deps, hooks);
}

function closeModifierWindow(game: EngineState, deps: EngineDeps, hooks: EngineHooks): void {
  const chain = game.chain;
  if (chain?.step !== "modifier_window") return;
  game.chain = null;
  resolveRoll(game, chain.roll, deps, hooks);
  advance(game, deps, hooks);
}

/** An Item needs a legal Hero to equip; other playable kinds are always offered (targets checked on play). */
function canPlaySomewhere(game: EngineState, seat: BaseSeat, card: BaseCard): boolean {
  if (isAttachable(card)) return game.seats.some((other) => other.party.some((hero) => canAttach(hero, card)));
  if (card.kind === "hero") return seat.party.length < PARTY_CARD_LIMIT;
  return card.kind === "magic";
}

/** Validation shared by PLAY_HAND_CARD and free plays (RULE-08, Q-06, Q-08). */
export function playTargetError(game: EngineState, seat: BaseSeat, card: BaseCard, targets: BaseTargets): string | null {
  if (card.kind === "hero" && seat.party.length >= PARTY_CARD_LIMIT) return "PARTY_FULL";
  if (card.kind === "item" || card.kind === "cursed_item") {
    const targetId = targets.heroInstanceIds?.[0];
    const found = targetId ? findHero(game, targetId) : null;
    return found && canAttach(found.hero, card) ? null : "INVALID_TARGET";
  }
  if (card.kind === "magic") {
    const data = cardDataOfKind(card.definitionId, "magic");
    return validateTargets(game, seat.playerId, data?.target ?? "none", targets);
  }
  return card.kind === "hero" ? null : "CARD_NOT_PLAYABLE";
}

// ---------------------------------------------------------------- resolution

/** Pending card was not challenged (or the challenge failed): put it into play. */
export function resolveAttempt(game: EngineState, attempt: Attempt, deps: EngineDeps, hooks: EngineHooks): void {
  const actor = seatOf(game, attempt.actorId)!;
  const card = attempt.card;
  const continuation = attempt.continuation ?? [];
  if (card.kind === "hero") {
    if (actor.party.length >= PARTY_CARD_LIMIT) {
      game.discard.push(card);
      log(game, `${cardName(card.definitionId)}: Party đã đủ ${PARTY_CARD_LIMIT} Hero — vào discard`);
      game.queue.unshift(...continuation);
      return;
    }
    actor.party.push({ card, attachments: [] });
    log(game, `${whoName(game, attempt.actorId)} đưa ${cardName(card.definitionId)} vào Party`);
    // RULE-06: optional immediate roll (free) — skip if the Hero cannot use its effect.
    offerHeroRoll(game, attempt.actorId, card.cardId, card.definitionId, deps);
    game.queue.unshift(...continuation); // runs once the (optional) entry roll chain is done
    return;
  }
  if (card.kind === "item" || card.kind === "cursed_item") {
    // Q-07: revalidate the locked target; invalid → discard, AP not refunded.
    const targetId = attempt.targets.heroInstanceIds?.[0];
    const found = targetId ? findHero(game, targetId) : null;
    const ok = found && canAttach(found.hero, card);
    if (!ok) {
      game.discard.push(card);
      log(game, `${cardName(card.definitionId)}: mục tiêu không còn hợp lệ — vào discard`);
      game.queue.unshift(...continuation);
      return;
    }
    found.hero.attachments.push(card);
    log(game, `${whoName(game, attempt.actorId)} gắn ${cardName(card.definitionId)} vào ${cardName(found.hero.card.definitionId)}`);
    game.queue.unshift(...continuation);
    return;
  }
  if (card.kind === "magic") {
    const data = cardDataOfKind(card.definitionId, "magic");
    log(game, `${whoName(game, attempt.actorId)} dùng Magic ${cardName(card.definitionId)}`);
    const rule = data?.target ?? "none";
    const invalid = validateTargets(game, attempt.actorId, rule, attempt.targets);
    const steps = invalid
      ? [{ op: "log", text: `${cardName(card.definitionId)}: mục tiêu không còn hợp lệ — không có hiệu ứng` } as Step]
      : buildEffect(game, data?.effectId ?? null, attempt.actorId, attempt.targets, card.cardId);
    // The Cloaked Sage: "Each time you play a Magic card, DRAW a card."
    if (leaderIs(actor, "the-cloaked-sage")) steps.push({ op: "draw", playerId: attempt.actorId, n: 1 });
    // PC-CB-04: the Magic card stays pending (not reshufflable) until its effect resolved.
    steps.push({ op: "discard_card", card });
    // C03: a nested play resolves before the parent's remaining queue; its continuation comes last.
    game.queue.unshift(...steps, ...continuation);
    return;
  }
  game.queue.unshift(...continuation);
}

/** Starts a Hero effect roll (paid or immediate). Caller validated eligibility/targets. */
export function startHeroRoll(game: EngineState, actorId: string, heroCardId: string, targets: BaseTargets, deps: EngineDeps, hooks: EngineHooks): void {
  const seat = seatOf(game, actorId)!;
  const found = findHero(game, heroCardId)!;
  const data = cardDataOfKind(found.hero.card.definitionId, "hero")!;
  if (!game.heroRollsUsed.includes(heroCardId)) game.heroRollsUsed.push(heroCardId); // RG-HERO: allowance consumed before dice
  const dice = [...deps.rollDice()] as [number, number];
  const passives = rollPassives(seat, "hero_effect", { hero: found.hero, turnRollBonus: game.turnRollBonus });
  log(game, `${whoName(game, actorId)} roll hiệu ứng ${data.name} (cần ${data.rollThreshold}${data.rollComparator === "lte" ? "-" : "+"})`);
  openModifierWindow(game, { kind: "hero_effect", rollerId: actorId, dice, heroCardId, threshold: data.rollThreshold, comparator: data.rollComparator ?? "gte", targets, modifiers: [], passives }, deps, hooks);
}

export function startAttack(game: EngineState, actorId: string, monsterId: string, deps: EngineDeps, hooks: EngineHooks): void {
  const seat = seatOf(game, actorId)!;
  const dice = [...deps.rollDice()] as [number, number];
  const passives = rollPassives(seat, "attack", { turnRollBonus: game.turnRollBonus, turnAttackBonus: game.turnAttackBonus });
  log(game, `${whoName(game, actorId)} ATTACK ${cardName(monsterData(monsterId).definitionId)}`);
  openModifierWindow(game, { kind: "attack", rollerId: actorId, dice, monsterId, modifiers: [], passives }, deps, hooks);
}

function rememberRoll(game: EngineState, roll: RollState, outcome: RollOutcome, subject: BaseCard | null, deps: EngineDeps): void {
  game.lastRoll = { id: deps.newId(), resolvedAt: deps.now(), roll: structuredClone(roll), outcome, subject: subject ? { ...subject } : null };
}

/**
 * M01–M04 (owner E09): Modifier side effects run after the roll resolves, from the frozen final total,
 * once per physical card. They never re-enter the closed roll window.
 */
function modifierFollowUps(roll: RollState): Step[] {
  const totals = rollTotals(roll);
  const steps: Step[] = [];
  for (const entry of roll.modifiers) {
    const final = roll.kind === "challenge" && entry.side === "challenger" ? totals.challengerTotal ?? 0 : totals.total;
    switch (monsterDefinitionId(entry.cardId)) { // instance ids are `<definitionId>#NN`
      case WD_MODIFIER_PLUS_1_MINUS_1:
        steps.push({ op: "draw", playerId: entry.playerId, n: 2 });
        break;
      case WD_MODIFIER_PLUS_2_MINUS_1:
        steps.push({ op: "draw", playerId: entry.playerId, n: 1 });
        break;
      case WD_MODIFIER_PLUS_4:
        if (final > 12) steps.push({ op: "draw", playerId: entry.playerId, n: 1 });
        break;
      case WD_MODIFIER_MINUS_4:
        if (final < 2) {
          steps.push({ op: "choice", playerId: entry.playerId, kind: "take_from_discard", count: 1, excludeCardIds: [entry.cardId], prompt: "Modifier -4: chọn 1 lá trong discard để lấy về tay" });
        }
        break;
    }
  }
  return steps;
}

function resolveRoll(game: EngineState, roll: RollState, deps: EngineDeps, hooks: EngineHooks): void {
  resolveRollOutcome(game, roll, deps, hooks);
  game.queue.push(...modifierFollowUps(roll));
}

function resolveRollOutcome(game: EngineState, roll: RollState, deps: EngineDeps, hooks: EngineHooks): void {
  const { total, challengerTotal } = rollTotals(roll);
  if (roll.kind === "challenge") {
    // RULE-17: challenger wins ties.
    rememberRoll(game, roll, (challengerTotal ?? 0) >= total ? "challenge_succeeded" : "challenge_failed", roll.attempt.card, deps);
    if ((challengerTotal ?? 0) >= total) {
      game.discard.push(roll.attempt.card);
      log(game, `Challenge thành công (${challengerTotal} ≥ ${total}): ${cardName(roll.attempt.card.definitionId)} vào discard`);
      if (roll.attempt.continuation) game.queue.unshift(...roll.attempt.continuation);
    } else {
      log(game, `Challenge thất bại (${challengerTotal} < ${total})`);
      resolveAttempt(game, roll.attempt, deps, hooks);
    }
    return;
  }
  const roller = seatOf(game, roll.rollerId)!;
  if (roll.kind === "hero_effect") {
    const found = findHero(game, roll.heroCardId);
    const success = rollMeets(total, roll.threshold, roll.comparator);
    rememberRoll(game, roll, success ? "success" : "fail", found?.hero.card ?? null, deps);
    log(game, `Kết quả ${total} ${roll.comparator === "lte" ? (success ? "≤" : ">") : success ? "≥" : "<"} ${roll.threshold}: ${success ? "thành công" : "thất bại"}`);
    if (!success) {
      if (found && found.seat === roller) {
        // E10: failure-only popups, after Modifiers and passives are final. An AP grant is not a retry.
        if (hasAttachment(found.hero, TEMPORAL_HOURGLASS)) {
          game.queue.push(may(roll.rollerId, "Temporal Hourglass: gain 1 AP?", [{ op: "gain_ap", playerId: roll.rollerId, n: 1 }]));
        }
        const goblet = found.hero.attachments.find((card) => card.definitionId === GOBLET_OF_CAFFEINATION);
        if (goblet) {
          game.queue.push(may(roll.rollerId, "Goblet of Caffeination: sacrifice it to attempt this Hero effect again (free)?", [
            { op: "discard_attachment", heroCardId: found.hero.card.cardId, itemCardId: goblet.cardId },
            { op: "retry_hero_roll", playerId: roll.rollerId, heroCardId: found.hero.card.cardId, targets: roll.targets },
          ]));
        }
      }
      if (found && found.seat === roller) {
        // Silver Lining: +2 to all rolls for the rest of the turn. Dragon's Bile: the roller SACRIFICEs a Hero.
        if (hasAttachment(found.hero, SILVER_LINING)) game.queue.push({ op: "roll_bonus", n: 2 });
        if (hasAttachment(found.hero, DRAGONS_BILE)) game.queue.push({ op: "choice", playerId: roll.rollerId, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE 1 Hero (Dragon's Bile)" });
      }
      if (found && hasAttachment(found.hero, "hts.base.v1.item.particularly-rusty-coin") && found.seat === roller) game.queue.push({ op: "draw", playerId: roll.rollerId, n: 1 });
      return;
    }
    // Hero must still be in the roller's Party (Q-07 revalidation); targets re-checked.
    if (!found || found.seat !== roller) {
      log(game, "Hero không còn trong Party — không có hiệu ứng");
      return;
    }
    const data = cardDataOfKind(found.hero.card.definitionId, "hero")!;
    const invalid = validateTargets(game, roll.rollerId, data.target, roll.targets);
    if (invalid) {
      log(game, `${data.name}: mục tiêu không còn hợp lệ — không có hiệu ứng`);
    } else {
      game.queue.push(...buildEffect(game, data.effectId, roll.rollerId, roll.targets, found.hero.card.cardId));
    }
    if (hasAttachment(found.hero, "hts.base.v1.cursed-item.suspiciously-shiny-coin")) {
      game.queue.push({ op: "choice", playerId: roll.rollerId, kind: "discard", count: 1, prompt: "DISCARD 1 lá (Suspiciously Shiny Coin)" });
    }
    // Arctic Aries: "Each time you successfully roll to use a Hero card's effect, you may DRAW a card."
    if (slainHas(roller, "artic-aries")) {
      game.queue.push(may(roll.rollerId, "Arctic Aries: DRAW 1 lá?", [{ op: "draw", playerId: roll.rollerId, n: 1 }]));
    }
    return;
  }
  // attack
  const monster = monsterData(roll.monsterId);
  const outcome = classifyAttack(total, monster);
  rememberRoll(game, roll, outcome, null, deps);
  log(game, `ATTACK ${monster.name}: ${total} → ${outcome === "slay" ? "SLAY" : outcome === "penalty" ? "PENALTY" : "không có gì"}`);
  if (outcome === "slay") {
    const index = game.faceUpMonsters.indexOf(roll.monsterId);
    if (index >= 0) game.faceUpMonsters.splice(index, 1);
    if (UNMODELLED_SLAIN.has(monster.definitionId)) {
      log(game, `Kỹ năng của ${monster.name} chưa được hỗ trợ — bỏ qua (no-op)`);
    }
    // C04: printed reward DRAW → award (pending zone until then) → win check → passives → refill.
    // Draw-trigger eligibility is fixed at draw time; the trigger steps are only released after the award.
    game.pendingMonster = { playerId: roll.rollerId, monsterId: roll.monsterId, slot: index };
    game.queue.unshift(...slaySteps(game, roll.rollerId, roll.monsterId, index));
    return;
  }
  if (outcome === "penalty") {
    const penalty = monster.penalty;
    game.queue.push(
      penalty.effectId === "penalty.sacrifice_hero"
        ? { op: "choice", playerId: roll.rollerId, kind: "sacrifice_hero", count: penalty.count, prompt: `SACRIFICE ${penalty.count} Hero (${monster.name})` }
        : penalty.effectId === "penalty.discard_hand"
          ? { op: "discard_hand", playerId: roll.rollerId }
          : { op: "choice", playerId: roll.rollerId, kind: "discard", count: penalty.count, prompt: `DISCARD ${penalty.count} lá (${monster.name})` },
    );
  }
}

/**
 * C04 slay sequence: printed reward / Leader DRAW (triggers deferred) → award (pending zone until then) → win check →
 * passives → refill. Shared by a rolled SLAY and by Vicious Wildcat's direct SLAY.
 */
function slaySteps(game: EngineState, playerId: string, monsterId: string, slot: number): Step[] {
  const monster = monsterData(monsterId);
  const sequence: Step[] = [];
  if (monster.slayReward) sequence.push({ op: "draw", playerId, n: monster.slayReward.draw, deferTriggers: true });
  // The Raging Manticore: "Each time you SLAY a Monster card, DRAW 2 cards."
  if (seatOf(game, playerId)?.leaderId === RAGING_MANTICORE) sequence.push({ op: "draw", playerId, n: 2, deferTriggers: true });
  sequence.push(
    { op: "award_monster", playerId, monsterId },
    { op: "flush_draw_triggers" },
    { op: "refill_monsters", slot }, // DECK-03; Q-09: no refill when the Monster deck is empty
  );
  return sequence;
}

/** Table size of the face-up Monster row (DECK-03). */
const FACE_UP_MONSTER_COUNT = 3;

/**
 * Keeps the face-up Monster row full: while fewer than 3 are up and the Monster deck has cards, the top
 * card is turned up (in the slain Monster's slot when `slot` is given). Idempotent, so it is also run as a
 * safety net after every command / deadline settle and when state is loaded (Q-09: empty deck → row shrinks).
 * Returns true when the row changed.
 */
export function refillFaceUpMonsters(game: Pick<EngineState, "faceUpMonsters" | "monsterDeck">, slot = -1): boolean {
  let changed = false;
  while (game.faceUpMonsters.length < FACE_UP_MONSTER_COUNT && game.monsterDeck.length > 0) {
    const next = game.monsterDeck.shift() as string;
    if (slot >= 0 && slot <= game.faceUpMonsters.length) game.faceUpMonsters.splice(slot, 0, next);
    else game.faceUpMonsters.push(next);
    slot = -1;
    changed = true;
  }
  return changed;
}

/** Slain-Monster skills not modelled yet (logged no-op on slay). */
const UNMODELLED_SLAIN = new Set<string>([]);

// ---------------------------------------------------------------- deadlines

const MANDATORY_KINDS: ReadonlySet<ChoiceKind> = new Set<ChoiceKind>(["discard", "discard_from_set", "sacrifice_hero", "give_card", "sacrifice_item", "choose_class", "make_sacrifice", "slay_monster"]);

/** C02: required (min > 0) penalty choice that is not an elective payment gating a benefit (C01). */
export function isMandatoryChoice(choice: PendingChoice): boolean {
  return MANDATORY_KINDS.has(choice.kind) && choice.min > 0 && !choice.thenIfPaid;
}

export function nextDeadline(game: EngineState): number | null {
  const chain = game.chain;
  if (!chain || game.phase !== "turn_active") return null;
  if (chain.step === "choice") return chain.choice.deadlineAt;
  return chain.deadlineAt;
}

/**
 * Applies every expired deadline (timer not reset; disconnect waits for deadline).
 * Defaults: challenge/modifier window → close as Skip; immediate roll → Skip;
 * choice → skip, no effect (owner decision lần 2). Returns true if state changed.
 */
export function settleDeadlines(game: EngineState, deps: EngineDeps, hooks: EngineHooks): boolean {
  let changed = false;
  for (let guard = 0; guard < 50; guard += 1) {
    const deadline = nextDeadline(game);
    if (deadline === null || deps.now() < deadline) break;
    const chain = game.chain!;
    changed = true;
    if (chain.step === "challenge_window") {
      game.chain = null;
      log(game, "Hết giờ Challenge — không ai Challenge");
      resolveAttempt(game, chain.attempt, deps, hooks);
    } else if (chain.step === "modifier_window") {
      log(game, "Hết giờ Modifier");
      closeModifierWindow(game, deps, hooks);
      continue;
    } else if (chain.step === "immediate_roll_choice") {
      game.chain = null;
      log(game, "Hết giờ — bỏ qua roll ngay");
    } else if (isMandatoryChoice(chain.choice)) {
      // C02: a mandatory penalty/return cannot be dodged by timeout — server fallback over legal cards,
      // in persisted eligibility order (hand / Party order), same legality as a normal pick.
      const choice = chain.choice;
      const seat = seatOf(game, choice.playerId);
      const ids = eligibleChoiceCards(game, choice).slice(0, choice.min).map((card) => card.cardId);
      game.chain = null;
      log(game, `Hết giờ chọn — server tự chọn thay ${whoName(game, choice.playerId)} (${choice.prompt})`);
      if (seat && ids.length > 0) applyChoice(game, choice, seat, ids, deps);
    } else {
      // Owner 2026-11-02 / C01: optional or gated-payment choice timeout = skip (no payment, no benefit; "may" declined).
      log(game, `Hết giờ chọn — ${whoName(game, chain.choice.playerId)} bỏ qua (${chain.choice.prompt})`);
      game.chain = null;
      if (chain.choice.kind === "confirm") {
        const run = chain.choice.onTimeout ?? chain.choice.otherwise;
        if (run) game.queue.unshift(...run);
      }
    }
    advance(game, deps, hooks);
  }
  return changed;
}

export type { PartyHero };
