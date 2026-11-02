// Pure game-state module for the real base game (mode "base").
// The Durable Object owns persistence, auth, idempotency receipts and the room
// revision; this module owns the game state shape, command handling and the
// per-viewer projection. See docs/decisions/ADR-002-game-mode-module.md.
// Turn loop (GAME-002): ./base-engine.ts; rule helpers: ./base-rules.ts.

import type {
  BaseCardView,
  BaseChainView,
  BaseGameCommand,
  BaseGameCommandKind,
  BaseGameSnapshot,
  BaseRollView,
  BaseTargets,
  RoomSliceCommand,
} from "@here-to-slay/protocol";
import { cardDataOfKind } from "../content/base-cards.ts";
import {
  baseLeaderPool,
  baseMainDeck,
  baseMonsterDeck,
  cardView,
  monsterView,
  type BaseCard,
} from "./base-content.ts";
import {
  activePlayerId,
  advance,
  challenge,
  eligibleChoiceCards,
  findHero,
  isBusy,
  log,
  nextDeadline,
  openChallengeWindow,
  pass,
  playModifier,
  resolveChoice,
  rollTotals,
  seatOf,
  settleDeadlines,
  startAttack,
  startHeroRoll,
  validateTargets,
  type BaseSeat,
  type EngineDeps,
  type EngineHooks,
  type EngineState,
  type RollState,
} from "./base-engine.ts";
import {
  DEFAULT_SETTINGS,
  heroClasses,
  leaderClass,
  leaderIs,
  meetsRequirement,
  monsterData,
  partyClasses,
  slainHas,
} from "./base-rules.ts";
import {
  advanceTurn,
  applySetupCommand,
  drawCards,
  selectionPlayerId,
  DRAW_COST,
  REDRAW_COST,
  STARTING_HAND_SIZE,
  TURN_ACTION_POINTS,
  type SetupCode,
  type SetupContext,
} from "./setup-core.ts";

export type { BaseSeat };

export const ATTACK_COST = 2;
export const PLAY_COST = 1;
export const HERO_EFFECT_COST = 1;
export const SHADOW_CLAW_COST = 1;

export interface BaseGameState extends EngineState {
  schema: 2;
}

/** Room-level facts the game needs but does not own. */
export interface BaseRoster {
  hostPlayerId: string;
  /** Players in join order. */
  players: ReadonlyArray<{ playerId: string; nickname: string }>;
}

export type BaseGameDeps = EngineDeps;

export type BaseCommandCode =
  | SetupCode
  | "MODE_MISMATCH"
  | "CHAIN_PENDING"
  | "CARD_NOT_IN_HAND"
  | "CARD_NOT_PLAYABLE"
  | "INVALID_TARGET"
  | "HERO_NOT_IN_PARTY"
  | "HERO_ALREADY_ROLLED"
  | "HERO_EFFECT_BLOCKED"
  | "MONSTER_NOT_AVAILABLE"
  | "REQUIREMENT_NOT_MET"
  | "NO_PENDING_ROLL_CHOICE"
  | "LEADER_ACTION_UNAVAILABLE"
  | "GAME_OVER"
  | string;

export function initialBaseGameState(): BaseGameState {
  return {
    schema: 2,
    phase: "lobby",
    leaderPool: baseLeaderPool(),
    selectionOrder: [],
    selectionIndex: 0,
    turnOrder: [],
    currentPlayerIndex: 0,
    turnNumber: 0,
    turnId: null,
    actionPoints: null,
    mainDeck: [],
    monsterDeck: [],
    faceUpMonsters: [],
    seats: [],
    discard: [],
    settings: { ...DEFAULT_SETTINGS },
    heroRollsUsed: [],
    turnRollBonus: 0,
    noChallengeThisTurn: false,
    leaderActionUsed: false,
    chain: null,
    queue: [],
    winnerPlayerId: null,
    winReason: null,
    log: [],
    logSeq: 0,
    names: {},
  };
}

function newSeat(playerId: string): BaseSeat {
  return { playerId, leaderId: null, hand: [], party: [], slain: [], protections: { noDestroy: false, noSteal: false } };
}

/** Upgrades a persisted GAME-001 (schema 1) state in place. */
export function normalizeBaseGame(raw: unknown): BaseGameState {
  const game = raw as BaseGameState & { schema: number };
  if (game.schema === 2) return game;
  const defaults = initialBaseGameState();
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in game)) (game as unknown as Record<string, unknown>)[key] = value;
  }
  for (const seat of game.seats) {
    const legacy = seat as unknown as Partial<BaseSeat> & { party?: unknown[] };
    seat.party = Array.isArray(legacy.party)
      ? (legacy.party as Array<BaseCard | { card: BaseCard }>).map((entry) => ("card" in entry ? (entry as BaseSeat["party"][number]) : { card: entry, item: null }))
      : [];
    seat.slain ??= [];
    seat.protections ??= { noDestroy: false, noSteal: false };
  }
  game.schema = 2;
  return game;
}

/** While in the lobby, seats mirror the roster; joins are locked afterwards. */
function syncLobbySeats(game: BaseGameState, roster: BaseRoster): void {
  game.names = Object.fromEntries(roster.players.map((player) => [player.playerId, player.nickname]));
  if (game.phase !== "lobby") return;
  const existing = new Map(game.seats.map((seat) => [seat.playerId, seat]));
  game.seats = roster.players.map(({ playerId }) => existing.get(playerId) ?? newSeat(playerId));
}

// ------------------------------------------------------------- turn cycle

function setupContext(game: BaseGameState, seat: BaseSeat, roster: BaseRoster, deps: BaseGameDeps): SetupContext<BaseCard, BaseSeat> {
  return {
    table: game,
    seats: game.seats,
    pile: game,
    actor: seat,
    isHost: seat.playerId === roster.hostPlayerId,
    newTurnId: deps.newId,
    shuffle: deps.shuffle,
    decks: () => ({ main: baseMainDeck(), monsters: baseMonsterDeck() }),
    onTurnStart: () => onTurnStart(game),
  };
}

/** Per-turn resets. "Until your next turn" protections end when that player's turn starts. */
function onTurnStart(game: BaseGameState): void {
  game.heroRollsUsed = [];
  game.turnRollBonus = 0;
  game.noChallengeThisTurn = false;
  game.leaderActionUsed = false;
  const active = seatOf(game, activePlayerId(game) ?? "");
  if (!active) return;
  active.protections = { noDestroy: false, noSteal: false };
  // Mega Slime: "You may spend an extra action point on each of your turns."
  if (slainHas(active, "mega-slime")) game.actionPoints = TURN_ACTION_POINTS + 1;
}

/** TL-END / TL-AUTO-END: class-win check for the actor, then advance (WIN-CLASS-T). */
export function endTurn(game: BaseGameState, deps: BaseGameDeps): void {
  if (game.phase !== "turn_active") return;
  if (checkClassWin(game)) return;
  const actor = seatOf(game, activePlayerId(game) ?? "")!;
  advanceTurn({
    table: game,
    seats: game.seats,
    pile: game,
    actor,
    isHost: false,
    newTurnId: deps.newId,
    shuffle: deps.shuffle,
    decks: () => ({ main: [], monsters: [] }),
    onTurnStart: () => onTurnStart(game),
  });
}

export const SLAY_WIN_COUNT = 3;
export const CLASS_WIN_COUNT = 6;

/**
 * GAME_OVER (WIN-END): freezes the table. Open windows/choices are closed without
 * resolving and queued effect steps are dropped (Q-03); every later command is
 * rejected with GAME_OVER by applyBaseCommand.
 */
function declareWinner(game: BaseGameState, playerId: string, reason: "slay_3" | "six_classes"): void {
  game.phase = "game_over";
  game.winnerPlayerId = playerId;
  game.winReason = reason;
  game.chain = null;
  game.queue = [];
  log(
    game,
    `${game.names[playerId] ?? playerId} THẮNG — ${reason === "slay_3" ? "đã SLAY 3 Monster" : "Party đủ 6 class khi kết thúc lượt"}`,
  );
}

/**
 * WIN-CLASS / WIN-CLASS-T: only the active player, at the end of their own turn
 * (after the chain closed), with 6 distinct classes in Party — Leader included,
 * Masks per settings.maskMode (Q-04).
 */
export function checkClassWin(game: BaseGameState): boolean {
  const actor = seatOf(game, activePlayerId(game) ?? "");
  if (!actor || partyClasses(actor, game.settings).length < CLASS_WIN_COUNT) return false;
  declareWinner(game, actor.playerId, "six_classes");
  return true;
}

/**
 * WIN-SLAY-T: checked in the same transition that puts the 3rd Monster into the
 * Party (Q-03: slay only happens after every Modifier/Challenge resolved), so the
 * game ends at once. Q-02: in base only the roller can slay, so the active player
 * is the only candidate in that step; if several seats ever qualified in one step
 * the active player wins first.
 */
export function checkSlayWin(game: BaseGameState, seat: BaseSeat): boolean {
  const active = activePlayerId(game);
  const candidates = game.seats.filter((candidate) => candidate.slain.length >= SLAY_WIN_COUNT);
  if (candidates.length === 0) return false;
  const winner = candidates.find((candidate) => candidate.playerId === active) ?? candidates.find((candidate) => candidate === seat) ?? candidates[0];
  declareWinner(game, winner.playerId, "slay_3");
  return true;
}

const HOOKS: EngineHooks = {
  autoEndTurn: (game, deps) => endTurn(game as BaseGameState, deps),
  afterSlay: (game, seat) => checkSlayWin(game as BaseGameState, seat),
};

function spendAp(game: BaseGameState, cost: number): void {
  game.actionPoints = (game.actionPoints ?? 0) - cost;
}

// ------------------------------------------------------------- handlers

type Handler = (
  game: BaseGameState,
  seat: BaseSeat,
  command: BaseGameCommand,
  roster: BaseRoster,
  deps: BaseGameDeps,
) => BaseCommandCode;

const setupHandler: Handler = (game, seat, command, roster, deps) => {
  if (command.kind === "SELECT_PARTY_LEADER") {
    const data = cardDataOfKind(command.payload.leaderId, "party_leader");
    // Base rulebook: The Shadow Claw may not be used in 2-player games.
    if (game.phase === "leader_selection" && data?.bannedPlayerCounts.includes(game.seats.length)) {
      return "LEADER_NOT_AVAILABLE";
    }
  }
  return applySetupCommand(setupContext(game, seat, roster, deps), command as Parameters<typeof applySetupCommand>[1]);
};

/** Guard for in-turn actions: phase, turn holder, nothing pending (G-02). */
function turnGuard(game: BaseGameState, seat: BaseSeat): BaseCommandCode | null {
  if (game.phase === "game_over") return "GAME_OVER";
  if (game.phase !== "turn_active") return "INVALID_PHASE";
  if (activePlayerId(game) !== seat.playerId) return "NOT_YOUR_TURN";
  if (isBusy(game)) return "CHAIN_PENDING";
  return null;
}

const reactGuard = (game: BaseGameState): BaseCommandCode | null =>
  game.phase === "game_over" ? "GAME_OVER" : game.phase !== "turn_active" ? "INVALID_PHASE" : null;

const drawHandler: Handler = (game, seat, _command, _roster, deps) => {
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  if ((game.actionPoints ?? 0) < DRAW_COST) return "INSUFFICIENT_AP";
  const drawn = drawCards(game, game, 1, deps.shuffle);
  seat.hand.push(...drawn);
  spendAp(game, DRAW_COST);
  log(game, `${game.names[seat.playerId] ?? seat.playerId} DRAW ${drawn.length} lá`);
  advance(game, deps, HOOKS);
  return "ACCEPTED";
};

const redrawHandler: Handler = (game, seat, _command, _roster, deps) => {
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  if ((game.actionPoints ?? 0) < REDRAW_COST) return "INSUFFICIENT_AP";
  game.discard.push(...seat.hand);
  seat.hand = drawCards(game, game, STARTING_HAND_SIZE, deps.shuffle);
  spendAp(game, REDRAW_COST);
  log(game, `${game.names[seat.playerId] ?? seat.playerId} bỏ cả tay, rút ${seat.hand.length} lá`);
  advance(game, deps, HOOKS);
  return "ACCEPTED";
};

const endTurnHandler: Handler = (game, seat, _command, _roster, deps) => {
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  endTurn(game, deps);
  return "ACCEPTED";
};

function itemTargetError(game: BaseGameState, seat: BaseSeat, card: BaseCard, targets: BaseTargets): BaseCommandCode | null {
  const targetId = targets.heroInstanceIds?.[0];
  const found = targetId ? findHero(game, targetId) : null;
  if (!found || found.hero.item) return "INVALID_TARGET"; // RULE-08: one Item per Hero; Leader is not a Hero
  if (card.kind === "item" && found.seat !== seat) return "INVALID_TARGET"; // Q-06
  return null;
}

const playHandCardHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "PLAY_HAND_CARD") return "MODE_MISMATCH";
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  if ((game.actionPoints ?? 0) < PLAY_COST) return "INSUFFICIENT_AP";
  const index = seat.hand.findIndex((card) => card.cardId === command.payload.cardInstanceId);
  if (index < 0) return "CARD_NOT_IN_HAND";
  const card = seat.hand[index];
  const targets = command.payload.targets ?? {};
  if (card.kind === "item" || card.kind === "cursed_item") {
    const error = itemTargetError(game, seat, card, targets);
    if (error) return error;
  } else if (card.kind === "magic") {
    const data = cardDataOfKind(card.definitionId, "magic");
    const error = validateTargets(game, seat.playerId, data?.target ?? "none", targets);
    if (error) return error;
  } else if (card.kind !== "hero") {
    return "CARD_NOT_PLAYABLE"; // Modifier/Challenge are reactions only (EC-27)
  }
  seat.hand.splice(index, 1);
  spendAp(game, PLAY_COST);
  log(game, `${game.names[seat.playerId] ?? seat.playerId} chơi ${cardDataOfKind(card.definitionId, card.kind as "hero")?.name ?? card.definitionId}`);
  openChallengeWindow(game, { actorId: seat.playerId, card, targets }, deps, HOOKS);
  advance(game, deps, HOOKS);
  return "ACCEPTED";
};

function heroRollError(game: BaseGameState, seat: BaseSeat, heroId: string, targets: BaseTargets): BaseCommandCode | null {
  const found = findHero(game, heroId);
  if (!found || found.seat !== seat) return "HERO_NOT_IN_PARTY";
  if (game.heroRollsUsed.includes(heroId)) return "HERO_ALREADY_ROLLED"; // RG-HERO-04
  if (found.hero.item?.definitionId === "hts.base.v1.cursed-item.sealing-key") return "HERO_EFFECT_BLOCKED";
  const data = cardDataOfKind(found.hero.card.definitionId, "hero");
  if (!data) return "HERO_NOT_IN_PARTY";
  return validateTargets(game, seat.playerId, data.target, targets);
}

const useHeroEffectHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "USE_HERO_EFFECT") return "MODE_MISMATCH";
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  if ((game.actionPoints ?? 0) < HERO_EFFECT_COST) return "INSUFFICIENT_AP";
  const targets = command.payload.targets ?? {};
  const error = heroRollError(game, seat, command.payload.heroInstanceId, targets);
  if (error) return error;
  spendAp(game, HERO_EFFECT_COST);
  startHeroRoll(game, seat.playerId, command.payload.heroInstanceId, targets, deps);
  return "ACCEPTED";
};

const immediateRollHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "IMMEDIATE_ROLL") return "MODE_MISMATCH";
  const guard = reactGuard(game);
  if (guard) return guard;
  const chain = game.chain;
  if (!chain || chain.step !== "immediate_roll_choice" || chain.actorId !== seat.playerId) return "NO_PENDING_ROLL_CHOICE";
  if (command.payload.choice === "skip") {
    game.chain = null;
    log(game, `${game.names[seat.playerId] ?? seat.playerId} bỏ qua roll ngay`);
    advance(game, deps, HOOKS);
    return "ACCEPTED";
  }
  const targets = command.payload.targets ?? {};
  const error = heroRollError(game, seat, chain.heroCardId, targets);
  if (error) return error;
  game.chain = null;
  startHeroRoll(game, seat.playerId, chain.heroCardId, targets, deps);
  return "ACCEPTED";
};

const attackHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "ATTACK_MONSTER") return "MODE_MISMATCH";
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  if ((game.actionPoints ?? 0) < ATTACK_COST) return "INSUFFICIENT_AP";
  const monsterId = command.payload.monsterInstanceId;
  if (!game.faceUpMonsters.includes(monsterId)) return "MONSTER_NOT_AVAILABLE"; // MON-01, Q-09
  if (!meetsRequirement(seat, monsterData(monsterId), game.settings)) return "REQUIREMENT_NOT_MET"; // Q-12
  spendAp(game, ATTACK_COST);
  startAttack(game, seat.playerId, monsterId, deps);
  return "ACCEPTED";
};

const reactChallengeHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "REACT_CHALLENGE") return "MODE_MISMATCH";
  const guard = reactGuard(game);
  if (guard) return guard;
  const code = challenge(game, seat.playerId, command.payload.windowId, command.payload.cardInstanceId, deps);
  return code;
};

const reactModifierHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "REACT_MODIFIER") return "MODE_MISMATCH";
  const guard = reactGuard(game);
  if (guard) return guard;
  return playModifier(game, seat.playerId, command.payload, deps, HOOKS);
};

const reactPassHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "REACT_PASS") return "MODE_MISMATCH";
  const guard = reactGuard(game);
  if (guard) return guard;
  return pass(game, seat.playerId, command.payload.windowId, deps, HOOKS);
};

const resolveChoiceHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "RESOLVE_CHOICE") return "MODE_MISMATCH";
  const guard = reactGuard(game);
  if (guard) return guard;
  return resolveChoice(game, seat.playerId, command.payload.choiceId, command.payload.cardInstanceIds, deps, HOOKS);
};

/** The Shadow Claw: "Once per turn on your turn, you may spend an action point to pull a card from another player's hand." */
const leaderActionHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "LEADER_ACTION") return "MODE_MISMATCH";
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  if (!leaderIs(seat, "the-shadow-claw") || game.leaderActionUsed) return "LEADER_ACTION_UNAVAILABLE";
  if ((game.actionPoints ?? 0) < SHADOW_CLAW_COST) return "INSUFFICIENT_AP";
  const target = command.payload.targetPlayerId;
  if (target === seat.playerId || !seatOf(game, target)) return "INVALID_TARGET";
  game.leaderActionUsed = true;
  spendAp(game, SHADOW_CLAW_COST);
  game.queue.push({ op: "pull", fromPlayerId: target, toPlayerId: seat.playerId, n: 1 });
  advance(game, deps, HOOKS);
  return "ACCEPTED";
};

/**
 * Command table for mode "base". Handlers validate before mutating and return
 * "ACCEPTED" only when state changed.
 */
/** Host-only rule settings, only before START_GAME ("cấu hình trước ván"). */
const configureHandler: Handler = (game, seat, command, roster) => {
  if (command.kind !== "CONFIGURE_GAME") return "MODE_MISMATCH";
  if (seat.playerId !== roster.hostPlayerId) return "FORBIDDEN";
  if (game.phase !== "lobby" && game.phase !== "leader_selection") return "INVALID_PHASE";
  game.settings = { ...game.settings, ...command.payload };
  return "ACCEPTED";
};

export const BASE_TURN_HANDLERS: Readonly<Record<BaseGameCommandKind, Handler>> = {
  CONFIGURE_GAME: configureHandler,
  BEGIN_LEADER_SELECTION: setupHandler,
  SELECT_PARTY_LEADER: setupHandler,
  START_GAME: setupHandler,
  DRAW_CARD: drawHandler,
  REDRAW_HAND: redrawHandler,
  END_TURN: endTurnHandler,
  PLAY_HAND_CARD: playHandCardHandler,
  USE_HERO_EFFECT: useHeroEffectHandler,
  ATTACK_MONSTER: attackHandler,
  IMMEDIATE_ROLL: immediateRollHandler,
  REACT_CHALLENGE: reactChallengeHandler,
  REACT_MODIFIER: reactModifierHandler,
  REACT_PASS: reactPassHandler,
  RESOLVE_CHOICE: resolveChoiceHandler,
  LEADER_ACTION: leaderActionHandler,
};

export function isBaseGameCommand(command: RoomSliceCommand): command is BaseGameCommand {
  return Object.hasOwn(BASE_TURN_HANDLERS, command.kind);
}

/**
 * Applies a validated command for `actorPlayerId`. Mutates `game` only when the
 * result is "ACCEPTED" (apart from mirroring the roster). The caller checks
 * commandId (idempotency) and expectedRevision first, and calls
 * `settleBaseGame` before it so expired windows close first.
 */
export function applyBaseCommand(
  game: BaseGameState,
  roster: BaseRoster,
  actorPlayerId: string,
  command: RoomSliceCommand,
  deps: BaseGameDeps,
): BaseCommandCode {
  if (!isBaseGameCommand(command)) return "MODE_MISMATCH";
  normalizeBaseGame(game);
  syncLobbySeats(game, roster);
  const seat = game.seats.find((candidate) => candidate.playerId === actorPlayerId);
  if (!seat) return "FORBIDDEN";
  if (game.phase === "game_over") return "GAME_OVER"; // WIN-END
  return BASE_TURN_HANDLERS[command.kind](game, seat, command, roster, deps);
}

/** Applies expired deadlines (alarm / before a command). Returns true if state changed. */
export function settleBaseGame(game: BaseGameState, roster: BaseRoster, deps: BaseGameDeps): boolean {
  normalizeBaseGame(game);
  syncLobbySeats(game, roster);
  return settleDeadlines(game, deps, HOOKS);
}

export function baseNextDeadline(game: BaseGameState): number | null {
  return nextDeadline(normalizeBaseGame(game));
}

// ------------------------------------------------------------- projection

function anyCardView(card: BaseCard): BaseCardView {
  return cardView(card);
}

function rollView(roll: RollState): BaseRollView {
  const { total, challengerTotal } = rollTotals(roll);
  const base: BaseRollView = {
    kind: roll.kind,
    rollerPlayerId: roll.rollerId,
    dice: [...roll.dice] as [number, number],
    modifiers: roll.modifiers.map((entry) => ({ ...entry })),
    passives: roll.passives.map((entry) => ({ ...entry })),
    total,
  };
  if (roll.kind === "challenge") {
    return { ...base, challengerPlayerId: roll.challengerId, challengerDice: [...roll.challengerDice] as [number, number], challengerTotal };
  }
  if (roll.kind === "hero_effect") return { ...base, heroInstanceId: roll.heroCardId, threshold: roll.threshold };
  return { ...base, monsterInstanceId: roll.monsterId };
}

function chainView(game: BaseGameState, viewerId: string): BaseChainView | null {
  const chain = game.chain;
  if (!chain) return null;
  switch (chain.step) {
    case "challenge_window":
      return {
        step: chain.step,
        windowId: chain.windowId,
        deadlineAt: chain.deadlineAt,
        actorPlayerId: chain.attempt.actorId,
        pendingCard: anyCardView(chain.attempt.card),
        responders: { ...chain.responders },
      };
    case "modifier_window":
      return { step: chain.step, windowId: chain.windowId, deadlineAt: chain.deadlineAt, roll: rollView(chain.roll), responders: { ...chain.responders } };
    case "immediate_roll_choice": {
      const found = findHero(game, chain.heroCardId);
      return {
        step: chain.step,
        deadlineAt: chain.deadlineAt,
        actorPlayerId: chain.actorId,
        hero: found ? anyCardView(found.hero.card) : { cardId: chain.heroCardId, definitionId: "", kind: "hero", name: "" },
      };
    }
    case "choice": {
      const choice = chain.choice;
      return {
        step: "choice",
        choiceId: choice.choiceId,
        deadlineAt: choice.deadlineAt,
        playerId: choice.playerId,
        kind: choice.kind,
        min: choice.min,
        max: choice.max,
        prompt: choice.prompt,
        // Hand cards are the chooser's own; discard/party cards are public.
        ...(choice.playerId === viewerId ? { options: eligibleChoiceCards(game, choice).map(anyCardView) } : {}),
      };
    }
  }
}

/** Per-viewer projection: only the viewer's own hand is serialized. */
export function projectBaseGame(
  rawGame: BaseGameState,
  roster: BaseRoster,
  meta: { roomCode: string; revision: number; serverNow: number },
  viewerPlayerId: string,
): BaseGameSnapshot {
  const game = normalizeBaseGame(rawGame);
  const seats = new Map(game.seats.map((seat) => [seat.playerId, seat]));
  const viewer = roster.players.find((player) => player.playerId === viewerPlayerId);
  if (!viewer) throw new Error("Viewer is not seated in this room");
  return {
    mode: "base",
    roomCode: meta.roomCode,
    revision: meta.revision,
    serverNow: meta.serverNow,
    hostPlayerId: roster.hostPlayerId,
    you: {
      playerId: viewer.playerId,
      nickname: viewer.nickname,
      isHost: viewer.playerId === roster.hostPlayerId,
    },
    players: roster.players.map((player, joinIndex) => {
      const seat = seats.get(player.playerId);
      return {
        playerId: player.playerId,
        nickname: player.nickname,
        joinIndex,
        isHost: player.playerId === roster.hostPlayerId,
        handCount: seat?.hand.length ?? 0,
        leaderId: seat?.leaderId ?? null,
        leaderClass: seat ? leaderClass(seat) : null,
        party: (seat?.party ?? []).map((hero) => ({
          hero: cardView(hero.card),
          item: hero.item ? cardView(hero.item) : null,
          classes: heroClasses(hero, game.settings),
        })),
        slainMonsters: (seat?.slain ?? []).map(monsterView),
        partyClasses: seat ? partyClasses(seat, game.settings) : [],
        protections: seat
          ? [...(seat.protections.noDestroy ? (["no_destroy"] as const) : []), ...(seat.protections.noSteal ? (["no_steal"] as const) : [])]
          : [],
      };
    }),
    yourHand: (seats.get(viewerPlayerId)?.hand ?? []).map(cardView),
    game: {
      phase: game.phase,
      selectionPlayerId: selectionPlayerId(game),
      leaderPool: [...game.leaderPool],
      selectedLeaderIds: game.seats
        .map((seat) => seat.leaderId)
        .filter((leaderId): leaderId is string => typeof leaderId === "string"),
      turnOrder: [...game.turnOrder],
      currentPlayerId: activePlayerId(game),
      turnNumber: game.turnNumber,
      turnId: game.turnId,
      actionPoints: game.actionPoints,
      mainDeckCount: game.mainDeck.length,
      monsterDeckCount: game.monsterDeck.length,
      faceUpMonsters: game.faceUpMonsters.map(monsterView),
      discardCount: game.discard.length,
      heroRollsUsed: [...game.heroRollsUsed],
      turnRollBonus: game.turnRollBonus,
      chain: chainView(game, viewerPlayerId),
      winnerPlayerId: game.winnerPlayerId,
      winReason: game.winReason,
      log: game.log.map((entry) => ({ ...entry })),
      settings: { ...game.settings },
    },
  };
}
