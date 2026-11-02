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
import {
  cardName,
  classifyAttack,
  hasClassInParty,
  leaderIs,
  monsterData,
  rollPassives,
  slainHas,
  type PartyHero,
  type Passive,
  type RulesSeat,
} from "./base-rules.ts";
import { drawCards, type SetupTable } from "./setup-core.ts";

export const LOG_LIMIT = 30;

export interface BaseSeat extends RulesSeat {}

export interface Attempt {
  actorId: string;
  card: BaseCard;
  targets: BaseTargets;
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
  /** Sharp Fox: look at another player's hand (private); resolve with []. */
  | "view_hand"
  /** Silent Shadow: take 1 card from another player's hand (seen). */
  | "take_from_hand";

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
  /** play_card: run after a card was picked and played. */
  thenIfPicked?: Step[];
  /** discard: run these steps once per discarded card (Qi Bear). */
  perCardThen?: Step[];
  /** discard: remember discarded ids in game.collected (Beary Wise). */
  collect?: boolean;
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
      responders: Record<string, "pending" | "passed" | "played">;
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
      ifAnyKindThen?: { kinds: BaseCardKind[]; steps: Step[] };
      /** Internal: skip slain-Monster draw triggers (none currently). */
      quiet?: boolean;
    }
  | { op: "offer_immediate_roll"; playerId: string; heroCardId: string }
  | { op: "draw_to"; playerId: string; n: number }
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
  | { op: "destroy"; heroCardId: string; byPlayerId: string; itemToPlayerId?: string; noStealInstead?: boolean }
  | { op: "steal"; heroCardId: string; toPlayerId: string }
  | { op: "move_hero"; heroCardId: string; toPlayerId: string; onlyIfOwns?: { heroCardId: string; playerId: string } }
  | { op: "discard_card"; card: BaseCard }
  | { op: "trade_hands"; a: string; b: string }
  | { op: "pull"; fromPlayerId: string; toPlayerId: string; n: number; extraIfKind?: BaseCardKind; thenDiscardOne?: boolean; offerPlayIfKind?: BaseCardKind[] }
  | { op: "roll_bonus"; n: number }
  | { op: "protect"; playerId: string; kind: "noDestroy" | "noSteal" }
  | { op: "no_challenge" }
  | { op: "return_item"; heroCardId: string; onlyCursed?: boolean; toPlayerId?: string }
  | { op: "return_all_items" }
  | { op: "pull_from_class"; toPlayerId: string; heroClass: "thief" }
  | { op: "each_other_choice"; actorId: string; kind: "discard" | "sacrifice_hero" | "give_card"; count: number; requireClass?: "fighter"; collect?: boolean }
  | { op: "log"; text: string };

export interface EngineState extends SetupTable<BaseCard> {
  seats: BaseSeat[];
  discard: BaseCard[];
  settings: BaseGameSettings;
  heroRollsUsed: string[];
  turnRollBonus: number;
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
  if (found.hero.item) {
    const itemOwner = itemToPlayerId ? seatOf(game, itemToPlayerId) : undefined;
    if (itemOwner) itemOwner.hand.push(found.hero.item);
    else game.discard.push(found.hero.item);
  }
}

/** Decoy Doll: "If the equipped Hero card would be sacrificed or destroyed, move this card to the discard pile instead." */
function decoyDollSaves(game: EngineState, hero: PartyHero): boolean {
  if (hero.item?.definitionId !== "hts.base.v1.item.decoy-doll") return false;
  game.discard.push(hero.item);
  hero.item = null;
  log(game, `Decoy Doll bảo vệ ${cardName(hero.card.definitionId)} (Decoy Doll vào discard)`);
  return true;
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
  for (const card of drawn) {
    if ((card.kind === "item" || card.kind === "cursed_item") && slainHas(seat, "malamammoth")) {
      game.queue.push(offerPlay(seat.playerId, [card], `Malamammoth: chơi ngay ${cardName(card.definitionId)}?`));
    }
    if (card.kind === "magic" && slainHas(seat, "orthus")) {
      game.queue.push(offerPlay(seat.playerId, [card], `Orthus: chơi ngay ${cardName(card.definitionId)}?`));
    }
    if (card.kind === "modifier" && slainHas(seat, "rex-major")) {
      game.queue.push(may(seat.playerId, `Rex Major: lộ ${cardName(card.definitionId)} để DRAW thêm 1 lá?`, [{ op: "draw", playerId: seat.playerId, n: 1 }]));
    }
  }
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
      return found?.hero.item?.kind === "cursed_item" ? null : "INVALID_TARGET";
    }
    case "any_hero_with_item": {
      const found = heroes[0] ? findHero(game, heroes[0]) : null;
      return found?.hero.item ? null : "INVALID_TARGET";
    }
  }
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
        { op: "choice", playerId: actorId, kind: "discard", count: 1, prompt: "DISCARD 1 lá (Destructive Spell)" },
        { op: "destroy", heroCardId: h[0], byPlayerId: actorId },
      ];
    case "magic.entangling-trap":
      return [
        { op: "choice", playerId: actorId, kind: "discard", count: 2, prompt: "DISCARD 2 lá (Entangling Trap)" },
        { op: "steal", heroCardId: h[0], toPlayerId: actorId },
      ];
    case "magic.forced-exchange": {
      const victim = ownerOf(h[0]);
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
  for (const key of ["filterKinds", "fromCardIds", "recipientId", "targetPlayerId", "then", "otherwise", "thenIfPicked", "perCardThen", "collect"] as const) {
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
      if (step.ifAnyKindThen && drawn.some((card) => step.ifAnyKindThen!.kinds.includes(card.kind))) follow.push(...step.ifAnyKindThen.steps);
      game.queue.unshift(...follow);
      afterDraw(game, seat, drawn);
      return false;
    }
    case "offer_immediate_roll": {
      const found = findHero(game, step.heroCardId);
      if (!found || found.seat.playerId !== step.playerId) return false;
      game.chain = {
        step: "immediate_roll_choice",
        deadlineAt: deps.now() + game.settings.choiceSeconds * 1000,
        actorId: step.playerId,
        heroCardId: step.heroCardId,
      };
      return true;
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
      if (decoyDollSaves(game, found.hero)) return false;
      moveHeroToDiscard(game, found, step.itemToPlayerId);
      log(game, `${whoName(game, step.byPlayerId)} DESTROY ${cardName(found.hero.card.definitionId)} của ${whoName(game, found.seat.playerId)}`);
      afterHeroDestroyed(game, found.seat, deps);
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
      found.seat.party.splice(found.index, 1);
      to.party.push(found.hero);
      log(game, `${whoName(game, step.toPlayerId)} STEAL ${cardName(found.hero.card.definitionId)} của ${whoName(game, found.seat.playerId)}`);
      return false;
    }
    case "move_hero": {
      const found = findHero(game, step.heroCardId);
      const to = seatOf(game, step.toPlayerId);
      if (!found || !to || found.seat === to) return false;
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
    case "roll_bonus":
      game.turnRollBonus += step.n;
      log(game, `+${step.n} cho mọi lần roll đến hết lượt`);
      return false;
    case "protect": {
      const seat = seatOf(game, step.playerId);
      if (seat) seat.protections[step.kind] = true;
      log(game, `${whoName(game, step.playerId)}: Hero ${step.kind === "noDestroy" ? "không thể bị destroy" : "không thể bị steal"} tới lượt sau`);
      return false;
    }
    case "no_challenge":
      game.noChallengeThisTurn = true;
      log(game, "Các lá chơi tiếp trong lượt này không thể bị Challenge");
      return false;
    case "return_item": {
      const found = findHero(game, step.heroCardId);
      const item = found?.hero.item;
      if (!found || !item || (step.onlyCursed && item.kind !== "cursed_item")) {
        log(game, "Trả Item: mục tiêu không còn hợp lệ — bỏ qua");
        return false;
      }
      const owner = seatOf(game, step.toPlayerId ?? found.seat.playerId) ?? found.seat;
      found.hero.item = null;
      owner.hand.push(item);
      log(game, `${cardName(item.definitionId)} trở về tay ${whoName(game, owner.playerId)}`);
      return false;
    }
    case "return_all_items": {
      let count = 0;
      for (const seat of game.seats) {
        for (const hero of seat.party) {
          if (!hero.item) continue;
          seat.hand.push(hero.item);
          hero.item = null;
          count += 1;
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

/** Drains the effect queue until empty or a choice opens; then auto-ends the turn if AP ≤ 0. */
export function advance(game: EngineState, deps: EngineDeps, hooks: EngineHooks): void {
  if (game.phase !== "turn_active") return;
  while (game.chain === null && game.queue.length > 0) {
    const step = game.queue.shift()!;
    runStep(game, step, deps);
    if (game.phase !== "turn_active") return;
  }
  if (game.chain === null && game.queue.length === 0 && (game.actionPoints ?? 0) <= 0) {
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
    if (choice.thenIfPicked) game.queue.unshift(...choice.thenIfPicked);
    log(game, `${whoName(game, playerId)} chơi ngay ${cardName(card.definitionId)} (không tốn AP)`);
    openChallengeWindow(game, { actorId: playerId, card, targets: targets ?? {} }, deps, hooks);
    advance(game, deps, hooks);
    return "ACCEPTED";
  }
  if (targets !== undefined) return "INVALID_CHOICE";
  applyChoice(game, choice, seat, cardIds, deps);
  game.chain = null;
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
          (!choice.fromCardIds || choice.fromCardIds.includes(card.cardId)),
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
          (!choice.filterKinds || choice.filterKinds.includes(card.kind)),
      );
    case "destroy_hero":
      return game.seats.filter((other) => other !== seat).flatMap((other) => other.party.map((hero) => hero.card));
    case "take_from_top":
      return game.mainDeck.slice(0, 3);
    case "take_from_hand":
      return [...(seatOf(game, choice.targetPlayerId ?? "")?.hand ?? [])];
    default:
      return [...seat.hand];
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
      if (cardIds[0]) game.queue.unshift({ op: "destroy", heroCardId: cardIds[0], byPlayerId: seat.playerId });
      return;
    case "take_from_top":
      for (const id of cardIds) {
        const index = game.mainDeck.findIndex((card) => card.cardId === id);
        if (index >= 0) seat.hand.push(game.mainDeck.splice(index, 1)[0]);
      }
      log(game, `${whoName(game, seat.playerId)} lấy 1 lá từ 3 lá trên cùng; 2 lá còn lại trả lại đỉnh deck`);
      return;
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
      return;
    case "confirm":
      return;
    case "sacrifice_hero":
      for (const id of cardIds) {
        const found = findHero(game, id);
        if (!found || found.seat !== seat) continue;
        if (decoyDollSaves(game, found.hero)) continue;
        moveHeroToDiscard(game, found);
        log(game, `${whoName(game, seat.playerId)} SACRIFICE ${cardName(found.hero.card.definitionId)}`);
      }
      void deps;
      return;
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
  const dice = [...deps.rollDice()] as [number, number];
  const challengerDice = [...deps.rollDice()] as [number, number];
  openModifierWindow(game, { kind: "challenge", rollerId: attempt.actorId, dice, challengerId: playerId, challengerDice, attempt, modifiers: [], passives }, deps, hooks);
  // Bloodwing slain passive: "Each time another player CHALLENGES you, that player must DISCARD a card."
  if (slainHas(defender, "bloodwing")) {
    game.queue.unshift({ op: "choice", playerId, kind: "discard", count: 1, prompt: "DISCARD 1 lá (Bloodwing)" });
  }
  return "ACCEPTED";
}

function openModifierWindow(game: EngineState, roll: RollState, deps: EngineDeps, hooks: EngineHooks): void {
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
 * Everyone may play one Modifier or Skip. Q-11 (configurable, default off): if
 * `leaderPassiveUsesModifierSlot`, a player whose Leader passive already applies
 * to this roll has used their one Modifier slot ("played").
 */
function modifierResponders(game: EngineState, roll: RollState): Record<string, "pending" | "passed" | "played"> {
  const result: Record<string, "pending" | "passed" | "played"> = responders(game, null, "pending");
  if (!game.settings.leaderPassiveUsesModifierSlot) return result;
  for (const passive of roll.passives) {
    if (!passive.source.startsWith("hts.base.v1.party-leader.")) continue;
    const owner = roll.kind === "challenge" && passive.side === "challenger" ? roll.challengerId : roll.rollerId;
    if (owner in result) result[owner] = "played";
  }
  return result;
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
  if (chain.responders[playerId] !== "pending") return "ALREADY_RESPONDED";
  const seat = seatOf(game, playerId)!;
  const index = seat.hand.findIndex((card) => card.cardId === payload.cardInstanceId);
  if (index < 0 || seat.hand[index].kind !== "modifier") return "CARD_NOT_PLAYABLE";
  const data = cardDataOfKind(seat.hand[index].definitionId, "modifier");
  if (!data || !data.options.includes(payload.value)) return "INVALID_MODIFIER_VALUE";
  const roll = chain.roll;
  if (roll.kind === "challenge" ? !payload.side : payload.side !== undefined) return "INVALID_MODIFIER_SIDE";
  if (payload.leaderBonus !== undefined && !leaderIs(seat, "the-protecting-horn")) return "INVALID_LEADER_BONUS";
  const [card] = seat.hand.splice(index, 1);
  game.discard.push(card);
  const side = payload.side;
  roll.modifiers.push({ playerId, cardId: card.cardId, value: payload.value, ...(side ? { side } : {}) });
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
  chain.responders[playerId] = "played";
  maybeCloseModifierWindow(game, deps, hooks);
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

/** Validation shared by PLAY_HAND_CARD and free plays (RULE-08, Q-06, Q-08). */
export function playTargetError(game: EngineState, seat: BaseSeat, card: BaseCard, targets: BaseTargets): string | null {
  if (card.kind === "item" || card.kind === "cursed_item") {
    const targetId = targets.heroInstanceIds?.[0];
    const found = targetId ? findHero(game, targetId) : null;
    if (!found || found.hero.item) return "INVALID_TARGET";
    if (card.kind === "item" && found.seat !== seat) return "INVALID_TARGET";
    return null;
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
  if (card.kind === "hero") {
    actor.party.push({ card, item: null });
    log(game, `${whoName(game, attempt.actorId)} đưa ${cardName(card.definitionId)} vào Party`);
    // RULE-06: optional immediate roll (free) — skip if the Hero cannot use its effect.
    game.chain = {
      step: "immediate_roll_choice",
      deadlineAt: deps.now() + game.settings.choiceSeconds * 1000,
      actorId: attempt.actorId,
      heroCardId: card.cardId,
    };
    return;
  }
  if (card.kind === "item" || card.kind === "cursed_item") {
    // Q-07: revalidate the locked target; invalid → discard, AP not refunded.
    const targetId = attempt.targets.heroInstanceIds?.[0];
    const found = targetId ? findHero(game, targetId) : null;
    const ok = found && !found.hero.item && (card.kind === "cursed_item" || found.seat.playerId === attempt.actorId);
    if (!ok) {
      game.discard.push(card);
      log(game, `${cardName(card.definitionId)}: mục tiêu không còn hợp lệ — vào discard`);
      return;
    }
    found.hero.item = card;
    log(game, `${whoName(game, attempt.actorId)} gắn ${cardName(card.definitionId)} vào ${cardName(found.hero.card.definitionId)}`);
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
    game.queue.push(...steps);
  }
}

/** Starts a Hero effect roll (paid or immediate). Caller validated eligibility/targets. */
export function startHeroRoll(game: EngineState, actorId: string, heroCardId: string, targets: BaseTargets, deps: EngineDeps, hooks: EngineHooks): void {
  const seat = seatOf(game, actorId)!;
  const found = findHero(game, heroCardId)!;
  const data = cardDataOfKind(found.hero.card.definitionId, "hero")!;
  game.heroRollsUsed.push(heroCardId); // RG-HERO: allowance consumed before dice
  const dice = [...deps.rollDice()] as [number, number];
  const passives = rollPassives(seat, "hero_effect", { hero: found.hero, turnRollBonus: game.turnRollBonus });
  log(game, `${whoName(game, actorId)} roll hiệu ứng ${data.name} (cần ${data.rollThreshold}+)`);
  openModifierWindow(game, { kind: "hero_effect", rollerId: actorId, dice, heroCardId, threshold: data.rollThreshold, targets, modifiers: [], passives }, deps, hooks);
}

export function startAttack(game: EngineState, actorId: string, monsterId: string, deps: EngineDeps, hooks: EngineHooks): void {
  const seat = seatOf(game, actorId)!;
  const dice = [...deps.rollDice()] as [number, number];
  const passives = rollPassives(seat, "attack", { turnRollBonus: game.turnRollBonus });
  log(game, `${whoName(game, actorId)} ATTACK ${cardName(monsterData(monsterId).definitionId)}`);
  openModifierWindow(game, { kind: "attack", rollerId: actorId, dice, monsterId, modifiers: [], passives }, deps, hooks);
}

function resolveRoll(game: EngineState, roll: RollState, deps: EngineDeps, hooks: EngineHooks): void {
  const { total, challengerTotal } = rollTotals(roll);
  if (roll.kind === "challenge") {
    // RULE-17: challenger wins ties.
    if ((challengerTotal ?? 0) >= total) {
      game.discard.push(roll.attempt.card);
      log(game, `Challenge thành công (${challengerTotal} ≥ ${total}): ${cardName(roll.attempt.card.definitionId)} vào discard`);
    } else {
      log(game, `Challenge thất bại (${challengerTotal} < ${total})`);
      resolveAttempt(game, roll.attempt, deps, hooks);
    }
    return;
  }
  const roller = seatOf(game, roll.rollerId)!;
  if (roll.kind === "hero_effect") {
    const found = findHero(game, roll.heroCardId);
    const success = total >= roll.threshold;
    log(game, `Kết quả ${total} ${success ? "≥" : "<"} ${roll.threshold}: ${success ? "thành công" : "thất bại"}`);
    const item = found?.hero.item?.definitionId;
    if (!success) {
      if (item === "hts.base.v1.item.particularly-rusty-coin" && found?.seat === roller) game.queue.push({ op: "draw", playerId: roll.rollerId, n: 1 });
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
    if (item === "hts.base.v1.cursed-item.suspiciously-shiny-coin") {
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
  log(game, `ATTACK ${monster.name}: ${total} → ${outcome === "slay" ? "SLAY" : outcome === "penalty" ? "PENALTY" : "không có gì"}`);
  if (outcome === "slay") {
    const index = game.faceUpMonsters.indexOf(roll.monsterId);
    if (index >= 0) game.faceUpMonsters.splice(index, 1);
    roller.slain.push(roll.monsterId);
    if (UNMODELLED_SLAIN.has(monster.definitionId)) {
      log(game, `Kỹ năng của ${monster.name} chưa được hỗ trợ — bỏ qua (no-op)`);
    }
    if (hooks.afterSlay(game, roller)) return; // WIN-SLAY-T: stop, no refill (Q-03)
    // DECK-03 refill; Q-09: no refill when the Monster deck is empty.
    const next = game.monsterDeck.shift();
    if (next) {
      if (index >= 0) game.faceUpMonsters.splice(index, 0, next);
      else game.faceUpMonsters.push(next);
    }
    return;
  }
  if (outcome === "penalty") {
    const penalty = monster.penalty;
    game.queue.push(
      penalty.effectId === "penalty.sacrifice_hero"
        ? { op: "choice", playerId: roll.rollerId, kind: "sacrifice_hero", count: penalty.count, prompt: `SACRIFICE ${penalty.count} Hero (${monster.name})` }
        : { op: "choice", playerId: roll.rollerId, kind: "discard", count: penalty.count, prompt: `DISCARD ${penalty.count} lá (${monster.name})` },
    );
  }
}

/** Slain-Monster skills not modelled yet (logged no-op on slay). */
const UNMODELLED_SLAIN = new Set<string>([]);

// ---------------------------------------------------------------- deadlines

export function nextDeadline(game: EngineState): number | null {
  const chain = game.chain;
  if (!chain || game.phase !== "turn_active") return null;
  if (chain.step === "choice") return chain.choice.deadlineAt;
  return chain.deadlineAt;
}

/**
 * Applies every expired deadline (timer not reset; disconnect waits for deadline).
 * Defaults: challenge/modifier window → close as Skip; immediate roll → Skip;
 * choice → first `min` eligible cards. Returns true if state changed.
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
    } else {
      // Owner 2026-11-02: timeout = skip (nothing chosen, nothing happens; "may" declined).
      log(game, `Hết giờ chọn — ${whoName(game, chain.choice.playerId)} bỏ qua (${chain.choice.prompt})`);
      game.chain = null;
      if (chain.choice.kind === "confirm" && chain.choice.otherwise) game.queue.unshift(...chain.choice.otherwise);
    }
    advance(game, deps, hooks);
  }
  return changed;
}

export type { PartyHero };
