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
import { GNAWING_DREAD } from "./expansion-ids.ts";
import { GAME_SET_CATALOG } from "../content/set-catalog.ts";
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
  afterDraw,
  playTargetError,
  challenge,
  eligibleChoiceCards,
  findHero,
  isBusy,
  log,
  nextDeadline,
  openChallengeWindow,
  pass,
  playModifier,
  useNobleShaman,
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
  refillFaceUpMonsters,
} from "./base-engine.ts";
import {
  DEFAULT_SETTINGS,
  heroClasses,
  leaderClass,
  leaderIs,
  meetsRequirement,
  monsterData,
  monsterDefinitionId,
  partyClasses,
  slainHas,
} from "./base-rules.ts";
import { canAttach, hasAttachment, hasCursedAttachment } from "./attachments.ts";
import { paidHeroEffectCost } from "./ap-cost.ts";
import { BOTTOMLESS_BAG, MUSCIPULA_REX } from "./expansion-ids.ts";
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
  /** Turn countdown (owner 2026-11-03): resets when AP changes or a chain opens/closes. */
  turnDeadlineAt?: number | null;
  /** `${turnId}:${actionPoints}:${busy}` — the deadline restarts whenever it changes. */
  turnTimerKey?: string | null;
  /** Five seconds for every accepted Modifier played during the current turn. */
  turnModifierBonusSeconds?: number;
  /** Lobby Leader picks in order (last picker goes first, SETUP-05). */
  leaderPickOrder?: string[];
  /** Lobby confirmations; changing Leader or starting a new game clears the seat. */
  readyPlayerIds?: string[];
  /** Earliest time the active bot takes its next turn action (pacing). */
  botNextActAt?: number | null;
  /** Earliest time any bot may answer a window / choice (every accepted action pushes it out, so humans can follow). */
  botPaceAt?: number | null;
}

/** Room-level facts the game needs but does not own. */
export interface BaseRoster {
  hostPlayerId: string;
  /** Players in join order. */
  players: ReadonlyArray<{ playerId: string; nickname: string; isBot?: boolean }>;
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
    collected: [],
    lastRoll: null,
    reveals: [],
    turnDeadlineAt: null,
    turnTimerKey: null,
    turnModifierBonusSeconds: 0,
    leaderPickOrder: [],
    readyPlayerIds: [],
    botNextActAt: null,
    botPaceAt: null,
  };
}

function newSeat(playerId: string): BaseSeat {
  return { playerId, leaderId: null, hand: [], party: [], slain: [], protections: { noDestroy: false, noSteal: false } };
}

/** C10 migration (any schema): legacy one-card windows marked a player "played"; they may now add more until Skip. */
function migrateModifierWindow(game: BaseGameState): void {
  if (game.chain?.step === "modifier_window") {
    const responders = game.chain.responders as Record<string, string>;
    for (const [playerId, state] of Object.entries(responders)) if (state === "played") responders[playerId] = "pending";
  }
  delete (game.settings as unknown as Record<string, unknown>)?.leaderPassiveUsesModifierSlot; // removed (conflicts with C10)
}

/** EX-02: legacy `{ card, item }` Party entries become `{ card, attachments }` (any schema). */
function migrateParty(game: BaseGameState): void {
  for (const seat of game.seats) {
    for (const entry of seat.party as Array<{ card: BaseCard; attachments?: BaseCard[]; item?: BaseCard | null }>) {
      entry.attachments ??= entry.item ? [entry.item] : [];
      delete entry.item;
    }
  }
}

/** Upgrades a persisted GAME-001 (schema 1) state in place. */
export function normalizeBaseGame(raw: unknown): BaseGameState {
  const game = raw as BaseGameState & { schema: number };
  if (game.schema === 2) {
    game.collected ??= [];
    game.lastRoll ??= null;
    game.reveals ??= [];
    game.turnDeadlineAt ??= null;
    game.turnTimerKey ??= null;
    game.turnModifierBonusSeconds ??= 0;
    game.leaderPickOrder ??= [];
    game.readyPlayerIds ??= [];
    game.botNextActAt ??= null;
    game.botPaceAt ??= null;
    game.settings = { ...DEFAULT_SETTINGS, ...game.settings };
    migrateModifierWindow(game);
    migrateParty(game);
    return game;
  }
  const defaults = initialBaseGameState();
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in game)) (game as unknown as Record<string, unknown>)[key] = value;
  }
  for (const seat of game.seats) {
    const legacy = seat as unknown as Partial<BaseSeat> & { party?: unknown[] };
    seat.party = Array.isArray(legacy.party)
      ? (legacy.party as Array<BaseCard | { card: BaseCard }>).map((entry) => ("card" in entry ? (entry as BaseSeat["party"][number]) : { card: entry, attachments: [] }))
      : [];
    seat.slain ??= [];
    seat.protections ??= { noDestroy: false, noSteal: false };
  }
  migrateModifierWindow(game);
  migrateParty(game);
  game.schema = 2;
  return game;
}

/** While in the lobby, seats mirror the roster; joins are locked afterwards. */
function syncLobbySeats(game: BaseGameState, roster: BaseRoster): void {
  game.names = Object.fromEntries(roster.players.map((player) => [player.playerId, player.nickname]));
  if (game.phase !== "lobby") return;
  const existing = new Map(game.seats.map((seat) => [seat.playerId, seat]));
  game.seats = roster.players.map(({ playerId }) => existing.get(playerId) ?? newSeat(playerId));
  game.readyPlayerIds = (game.readyPlayerIds ?? []).filter((playerId) => game.seats.some((seat) => seat.playerId === playerId));
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
    decks: () => ({ main: baseMainDeck(game.settings.expansionIds, deps.catalog), monsters: baseMonsterDeck(game.settings.expansionIds, deps.catalog) }),
    onTurnStart: () => onTurnStart(game),
  };
}

/** Per-turn resets. "Until your next turn" protections end when that player's turn starts. */
function onTurnStart(game: BaseGameState): void {
  game.botNextActAt = null;
  game.turnModifierBonusSeconds = 0;
  game.heroRollsUsed = [];
  game.turnRollBonus = 0;
  game.turnAttackBonus = 0;
  game.modifierLockBy = null;
  game.silentShieldBy = null;
  game.dragalterReplay = null;
  game.freeDrawCredit = 0;
  game.shamanUsed = false;
  game.noChallengeThisTurn = false;
  game.leaderActionUsed = false;
  const active = seatOf(game, activePlayerId(game) ?? "");
  if (!active) return;
  active.protections = { noDestroy: false, noSteal: false };
  active.rollSwings = 0; // Majestelk lasts until its owner's next turn (W01)
  // Mega Slime: "You may spend an extra action point on each of your turns."
  if (slainHas(active, "mega-slime")) game.actionPoints = TURN_ACTION_POINTS + 1;
  // Muscipula Rex (W08): "once per turn on your turn, DRAW a card without spending an action point".
  if (active.slain.some((id) => monsterDefinitionId(id) === MUSCIPULA_REX)) game.freeDrawCredit = 1;
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
/** E01: base-only needs six distinct classes; any enabled expansion pack needs seven. */
export function classWinCount(game: { settings: { expansionIds?: string[] } }): number {
  return game.settings.expansionIds?.length ? CLASS_WIN_COUNT + 1 : CLASS_WIN_COUNT;
}

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
    `${game.names[playerId] ?? playerId} THẮNG — ${reason === "slay_3" ? "đã SLAY 3 Monster" : `Party đủ ${classWinCount(game)} class khi kết thúc lượt`}`,
  );
}

/**
 * WIN-CLASS / WIN-CLASS-T: only the active player, at the end of their own turn
 * (after the chain closed), with 6 distinct classes in Party (7 with an enabled pack, E01) — Leader included,
 * Masks per settings.maskMode (Q-04).
 */
export function checkClassWin(game: BaseGameState): boolean {
  const actor = seatOf(game, activePlayerId(game) ?? "");
  if (!actor || partyClasses(actor, game.settings).length < classWinCount(game)) return false;
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
  afterModifierPlayed: (game) => { (game as BaseGameState).turnModifierBonusSeconds = ((game as BaseGameState).turnModifierBonusSeconds ?? 0) + 5; },
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

/** Lobby flow (owner 2026-11-03): every seat picks its Leader in the lobby; the host starts from there. */
function lobbySelectLeader(game: BaseGameState, seat: BaseSeat, leaderId: string): BaseCommandCode {
  if (!game.leaderPool.includes(leaderId)) return "LEADER_NOT_AVAILABLE";
  if (game.seats.some((other) => other !== seat && other.leaderId === leaderId)) return "LEADER_TAKEN";
  if (seat.leaderId === leaderId) return "NO_CHANGE";
  seat.leaderId = leaderId;
  game.readyPlayerIds = (game.readyPlayerIds ?? []).filter((id) => id !== seat.playerId);
  game.leaderPickOrder = [...(game.leaderPickOrder ?? []).filter((id) => id !== seat.playerId), seat.playerId];
  return "ACCEPTED";
}

function lobbyStart(game: BaseGameState, seat: BaseSeat, roster: BaseRoster, deps: BaseGameDeps): BaseCommandCode {
  if (seat.playerId !== roster.hostPlayerId) return "FORBIDDEN";
  let maxPlayers: number;
  try {
    maxPlayers = (deps.catalog ?? GAME_SET_CATALOG).compose(game.settings.expansionIds).maxPlayers;
  } catch {
    return "UNSUPPORTED_EXPANSION";
  }
  if (game.seats.length < 2 || game.seats.length > maxPlayers) return "NOT_ENOUGH_PLAYERS";
  if (game.seats.some((candidate) => !candidate.leaderId)) return "SELECTION_INCOMPLETE";
  // Base rulebook: The Shadow Claw may not be used in 2-player games.
  if (game.seats.some((candidate) => cardDataOfKind(candidate.leaderId!, "party_leader")?.bannedPlayerCounts.includes(game.seats.length))) {
    return "LEADER_NOT_AVAILABLE";
  }
  if (game.seats.some((candidate) => candidate.playerId !== roster.hostPlayerId && !(game.readyPlayerIds ?? []).includes(candidate.playerId))) return "PLAYERS_NOT_READY";
  // SETUP-05 keeps working: the selection order is the lobby pick order, so the last picker goes first.
  const picks = (game.leaderPickOrder ?? []).filter((id) => game.seats.some((candidate) => candidate.playerId === id));
  const order = [...game.seats.map((candidate) => candidate.playerId).filter((id) => !picks.includes(id)), ...picks];
  game.phase = "leader_selection";
  game.selectionOrder = order;
  game.selectionIndex = order.length;
  const code = applySetupCommand(setupContext(game, seat, roster, deps), { kind: "START_GAME", commandId: "lobby-start", expectedRevision: 0, payload: {} } as Parameters<typeof applySetupCommand>[1]);
  if (code !== "ACCEPTED") {
    game.phase = "lobby";
    return code;
  }
  return "ACCEPTED";
}

const setupHandler: Handler = (game, seat, command, roster, deps) => {
  if (game.phase === "lobby" && command.kind === "SELECT_PARTY_LEADER") return lobbySelectLeader(game, seat, command.payload.leaderId);
  if (game.phase === "lobby" && command.kind === "START_GAME") return lobbyStart(game, seat, roster, deps);
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
  const freeDraw = (game.freeDrawCredit ?? 0) > 0; // W08: the credit is spent before AP
  if (!freeDraw && (game.actionPoints ?? 0) < DRAW_COST) return "INSUFFICIENT_AP";
  const drawn = drawCards(game, game, 1, deps.shuffle);
  seat.hand.push(...drawn);
  if (freeDraw) game.freeDrawCredit = 0;
  else spendAp(game, DRAW_COST);
  afterDraw(game, seat, drawn);
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
  afterDraw(game, seat, seat.hand);
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

const playHandCardHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "PLAY_HAND_CARD") return "MODE_MISMATCH";
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  if ((game.actionPoints ?? 0) < PLAY_COST) return "INSUFFICIENT_AP";
  const index = seat.hand.findIndex((card) => card.cardId === command.payload.cardInstanceId);
  if (index < 0) return "CARD_NOT_IN_HAND";
  const card = seat.hand[index];
  const targets = command.payload.targets ?? {};
  // Modifier/Challenge are reactions only (EC-27); Item/Cursed/Magic targets per Q-06/Q-08.
  const error = playTargetError(game, seat, card, targets);
  if (error) return error;
  seat.hand.splice(index, 1);
  spendAp(game, PLAY_COST);
  log(game, `${game.names[seat.playerId] ?? seat.playerId} chơi ${cardDataOfKind(card.definitionId, card.kind as "hero")?.name ?? card.definitionId}`);
  openChallengeWindow(game, { actorId: seat.playerId, card, targets }, deps, HOOKS);
  advance(game, deps, HOOKS);
  return "ACCEPTED";
};

function heroRollError(game: BaseGameState, seat: BaseSeat, heroId: string, targets: BaseTargets, free = false): BaseCommandCode | null {
  const found = findHero(game, heroId);
  if (!found || found.seat !== seat) return "HERO_NOT_IN_PARTY";
  // RG-HERO-04 / C08: one attempt per Hero per turn, unless an equipped Bottomless Bag permits paid repeats (E04).
  if (!free && game.heroRollsUsed.includes(heroId) && !hasAttachment(found.hero, BOTTOMLESS_BAG)) return "HERO_ALREADY_ROLLED";
  if (hasAttachment(found.hero, "hts.base.v1.cursed-item.sealing-key")) return "HERO_EFFECT_BLOCKED";
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
  const cost = paidHeroEffectCost(findHero(game, command.payload.heroInstanceId)!.hero);
  if ((game.actionPoints ?? 0) < cost) return "INSUFFICIENT_AP";
  spendAp(game, cost);
  startHeroRoll(game, seat.playerId, command.payload.heroInstanceId, targets, deps, HOOKS);
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
    if (chain.after) game.queue.unshift(...chain.after);
    advance(game, deps, HOOKS);
    return "ACCEPTED";
  }
  const targets = command.payload.targets ?? {};
  const error = heroRollError(game, seat, chain.heroCardId, targets, chain.free === true);
  if (error) return error;
  game.chain = null;
  startHeroRoll(game, seat.playerId, chain.heroCardId, targets, deps, HOOKS, {
    ...(chain.bonus ? { bonus: chain.bonus } : {}), ...(chain.free ? { free: true } : {}), ...(chain.after ? { after: chain.after } : {}),
  });
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
  startAttack(game, seat.playerId, monsterId, deps, HOOKS);
  return "ACCEPTED";
};

const reactChallengeHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "REACT_CHALLENGE") return "MODE_MISMATCH";
  const guard = reactGuard(game);
  if (guard) return guard;
  const code = challenge(game, seat.playerId, command.payload.windowId, command.payload.cardInstanceId, deps, HOOKS);
  return code;
};

const reactModifierHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "REACT_MODIFIER") return "MODE_MISMATCH";
  const guard = reactGuard(game);
  if (guard) return guard;
  return playModifier(game, seat.playerId, command.payload, deps, HOOKS);
};

const reactShamanHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "REACT_SHAMAN") return "MODE_MISMATCH";
  const guard = reactGuard(game);
  if (guard) return guard;
  return useNobleShaman(game, seat.playerId, command.payload, deps);
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
  return resolveChoice(game, seat.playerId, command.payload.choiceId, command.payload.cardInstanceIds, deps, HOOKS, command.payload.accept, command.payload.targets);
};

/** The Gnawing Dread (BN): "Once per turn on your turn, you may spend 2 action points to search the discard pile for a card and add it to your hand." */
const GNAWING_DREAD_COST = 2;

/**
 * Leader skills that cost AP, once per turn.
 *  - The Shadow Claw: 1 AP, pull a card from another player's hand (payload.targetPlayerId required).
 *  - The Gnawing Dread: 2 AP, search the discard pile for any card (no target).
 */
const leaderActionHandler: Handler = (game, seat, command, _roster, deps) => {
  if (command.kind !== "LEADER_ACTION") return "MODE_MISMATCH";
  const blocked = turnGuard(game, seat);
  if (blocked) return blocked;
  if (seat.leaderId === GNAWING_DREAD) {
    if (game.leaderActionUsed || game.discard.length === 0) return "LEADER_ACTION_UNAVAILABLE";
    if ((game.actionPoints ?? 0) < GNAWING_DREAD_COST) return "INSUFFICIENT_AP";
    game.leaderActionUsed = true;
    spendAp(game, GNAWING_DREAD_COST);
    game.queue.push({ op: "choice", playerId: seat.playerId, kind: "take_from_discard", count: 1, prompt: "The Gnawing Dread: chọn 1 lá trong discard để lấy về tay" });
    advance(game, deps, HOOKS);
    return "ACCEPTED";
  }
  if (!leaderIs(seat, "the-shadow-claw") || game.leaderActionUsed) return "LEADER_ACTION_UNAVAILABLE";
  if ((game.actionPoints ?? 0) < SHADOW_CLAW_COST) return "INSUFFICIENT_AP";
  const target = command.payload.targetPlayerId;
  if (!target || target === seat.playerId || !seatOf(game, target)) return "INVALID_TARGET";
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
const configureHandler: Handler = (game, seat, command, roster, deps) => {
  if (command.kind !== "CONFIGURE_GAME") return "MODE_MISMATCH";
  if (seat.playerId !== roster.hostPlayerId) return "FORBIDDEN";
  if (game.phase !== "lobby" && game.phase !== "leader_selection") return "INVALID_PHASE";
  const { expansionIds, ...rest } = command.payload as typeof command.payload & { expansionIds?: string[] };
  const changes = Object.entries(rest).filter(([key, value]) => game.settings[key as keyof typeof game.settings] !== value);
  const current = game.settings.expansionIds ?? [];
  const packsChanged = expansionIds !== undefined && (expansionIds.length !== current.length || expansionIds.some((id) => !current.includes(id)));
  if (changes.length === 0 && !packsChanged) return "NO_CHANGE";
  if (packsChanged) {
    if (game.phase !== "lobby") return "INVALID_PHASE";
    let pool: string[];
    try {
      pool = baseLeaderPool(expansionIds, deps.catalog);
    } catch {
      return "UNSUPPORTED_EXPANSION";
    }
    game.settings = { ...game.settings, expansionIds: [...expansionIds!] };
    game.leaderPool = pool;
    // A Leader that left the pool is released; every Ready flag resets because the table changed under the players.
    for (const other of game.seats) if (other.leaderId && !pool.includes(other.leaderId)) other.leaderId = null;
    game.readyPlayerIds = [];
  }
  if (changes.length) game.settings = { ...game.settings, ...Object.fromEntries(changes) };
  return "ACCEPTED";
};

const setReadyHandler: Handler = (game, seat, command, roster) => {
  if (command.kind !== "SET_READY") return "MODE_MISMATCH";
  if (game.phase !== "lobby") return "INVALID_PHASE";
  if (seat.playerId === roster.hostPlayerId) return "FORBIDDEN";
  if (command.payload.ready && !seat.leaderId) return "SELECTION_INCOMPLETE";
  const ready = new Set(game.readyPlayerIds ?? []);
  const before = ready.has(seat.playerId);
  if (command.payload.ready) ready.add(seat.playerId);
  else ready.delete(seat.playerId);
  if (before === command.payload.ready) return "NO_CHANGE";
  game.readyPlayerIds = [...ready];
  return "ACCEPTED";
};

/** Host starts a clean game lifecycle without replacing the room or player identities. */
const newGameHandler: Handler = (game, seat, command, roster) => {
  if (command.kind !== "NEW_GAME") return "MODE_MISMATCH";
  if (seat.playerId !== roster.hostPlayerId) return "FORBIDDEN";
  if (game.phase !== "game_over") return "INVALID_PHASE";
  const settings = { ...game.settings };
  const fresh = initialBaseGameState();
  fresh.settings = settings;
  for (const key of Object.keys(game)) delete (game as unknown as Record<string, unknown>)[key];
  Object.assign(game, fresh);
  syncLobbySeats(game, roster);
  return "ACCEPTED";
};

/** ADD_BOT / REMOVE_BOT change the room roster, so the Durable Object handles them (see room.ts). */
const rosterHandler: Handler = () => "MODE_MISMATCH";

export const BASE_TURN_HANDLERS: Readonly<Record<BaseGameCommandKind, Handler>> = {
  CONFIGURE_GAME: configureHandler,
  NEW_GAME: newGameHandler,
  SET_READY: setReadyHandler,
  ADD_BOT: rosterHandler,
  REMOVE_BOT: rosterHandler,
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
  REACT_SHAMAN: reactShamanHandler,
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
  if (game.phase === "game_over" && command.kind !== "NEW_GAME") return "GAME_OVER"; // WIN-END
  const code = BASE_TURN_HANDLERS[command.kind](game, seat, command, roster, deps);
  if (code === "ACCEPTED") {
    // A human action just happened: bots wait before reacting so the player can follow what is going on.
    if (roster.players.some((player) => player.isBot)) game.botPaceAt = deps.now() + BOT_REACT_MS;
    updateTurnTimer(game, deps.now());
    runBots(game, roster, deps);
  }
  return code;
}

// ------------------------------------------------------------- turn timer

/**
 * Turn countdown: `settings.turnSeconds` plus five seconds per accepted Modifier
 * in this turn; every AP spend restarts it; while a chain/queue resolves the
 * countdown is suspended and restarts once it closes.
 */
function updateTurnTimer(game: BaseGameState, now: number): boolean {
  if (game.phase !== "turn_active") {
    const changed = game.turnDeadlineAt != null || game.turnTimerKey != null;
    game.turnDeadlineAt = null;
    game.turnTimerKey = null;
    return changed;
  }
  const busy = isBusy(game);
  const bonus = game.turnModifierBonusSeconds ?? 0;
  const key = `${game.turnId}:${game.actionPoints}:${busy ? 1 : 0}:${bonus}`;
  if (key === game.turnTimerKey) return false;
  game.turnTimerKey = key;
  game.turnDeadlineAt = busy ? null : now + ((game.settings.turnSeconds ?? DEFAULT_SETTINGS.turnSeconds) + bonus) * 1000;
  return true;
}

/** Turn expired with nothing pending: end it as if the player pressed END_TURN. */
function settleTurnTimer(game: BaseGameState, deps: BaseGameDeps): boolean {
  if (game.phase !== "turn_active" || isBusy(game) || game.turnDeadlineAt == null || deps.now() < game.turnDeadlineAt) return false;
  const active = activePlayerId(game);
  log(game, `Hết giờ lượt — ${game.names[active ?? ""] ?? active} tự động kết thúc lượt`);
  endTurn(game, deps);
  return true;
}

// ------------------------------------------------------------- bots

/** Pacing (owner 2026-11-04): bots must be readable. Between a bot's own turn actions: */
const BOT_STEP_MS = 3200;
/** ... before a bot answers a Challenge/Modifier window or a choice, and after any accepted action: */
const BOT_REACT_MS = 2600;
/** ... after a roll resolved the client shows a result screen; bots stay quiet until it is over. */
const BOT_RESULT_HOLD_MS = 9000;
const isBot = (roster: BaseRoster, playerId: string) => roster.players.some((player) => player.playerId === playerId && player.isBot);

function botCommand(kind: BaseGameCommandKind, payload: object): BaseGameCommand {
  return { kind, commandId: "bot", expectedRevision: 0, payload } as unknown as BaseGameCommand;
}

/** First legal targets for a target rule (bots only; humans always choose — Q-08). */
function botTargets(game: BaseGameState, botId: string, rule: Parameters<typeof validateTargets>[2]): BaseTargets | null {
  const others = game.seats.filter((seat) => seat.playerId !== botId);
  const own = seatOf(game, botId);
  const otherHeroes = others.flatMap((seat) => seat.party.map((hero) => hero.card.cardId));
  const ownHeroes = own?.party.map((hero) => hero.card.cardId) ?? [];
  let targets: BaseTargets | null;
  switch (rule) {
    case "none": targets = {}; break;
    case "other_player": targets = others[0] ? { playerId: [...others].sort((a, b) => b.hand.length - a.hand.length)[0].playerId } : null; break;
    case "hero_other_party": targets = otherHeroes[0] ? { heroInstanceIds: [otherHeroes[0]] } : null; break;
    case "two_heroes_other_party": targets = otherHeroes.length >= 2 ? { heroInstanceIds: otherHeroes.slice(0, 2) } : null; break;
    case "hero_other_party_and_own_hero": targets = otherHeroes[0] && ownHeroes[0] ? { heroInstanceIds: [otherHeroes[0], ownHeroes[0]] } : null; break;
    case "own_hero": targets = ownHeroes[0] ? { heroInstanceIds: [ownHeroes[0]] } : null; break;
    case "own_hero_with_cursed_item": {
      const hero = own?.party.find(hasCursedAttachment);
      targets = hero ? { heroInstanceIds: [hero.card.cardId] } : null;
      break;
    }
    case "any_hero_with_item": {
      const hero = game.seats.flatMap((seat) => seat.party).find((entry) => entry.attachments.length);
      targets = hero ? { heroInstanceIds: [hero.card.cardId] } : null;
      break;
    }
    default: targets = null;
  }
  return targets && validateTargets(game, botId, rule, targets) === null ? targets : null;
}

/** True once the pacing delays have passed (no bot acts while the previous action / result screen is still being shown). */
function botMayAct(game: BaseGameState, deps: BaseGameDeps): boolean {
  const now = deps.now();
  if (game.botPaceAt != null && now < game.botPaceAt) return false;
  if (game.lastRoll && now < game.lastRoll.resolvedAt + BOT_RESULT_HOLD_MS) return false;
  return true;
}

/** Earliest time a bot with pending work is allowed to act (for the alarm), or null when no bot is waiting. */
function botDueAt(game: BaseGameState, roster: BaseRoster): number | null {
  if (game.phase !== "turn_active") return null;
  const chain = game.chain;
  let waiting = false;
  if (chain) {
    if (chain.step === "challenge_window" || chain.step === "modifier_window") waiting = Object.entries(chain.responders).some(([id, state]) => state === "pending" && isBot(roster, id));
    else if (chain.step === "immediate_roll_choice") waiting = isBot(roster, chain.actorId);
    else waiting = isBot(roster, chain.choice.playerId);
  } else {
    const active = activePlayerId(game);
    if (!active || !isBot(roster, active) || game.botNextActAt == null) return null;
    waiting = true;
  }
  if (!waiting) return null;
  const hold = game.lastRoll ? game.lastRoll.resolvedAt + BOT_RESULT_HOLD_MS : 0;
  return Math.max(game.botPaceAt ?? 0, hold, chain ? 0 : game.botNextActAt ?? 0);
}

/** One reaction / choice answered by a bot, if any is waiting on one. */
function botReact(game: BaseGameState, roster: BaseRoster, deps: BaseGameDeps): boolean {
  const chain = game.chain;
  if (!chain) return false;
  if (!botMayAct(game, deps)) return false;
  const run = (playerId: string, command: BaseGameCommand) => {
    const seat = seatOf(game, playerId);
    const ok = seat ? BASE_TURN_HANDLERS[command.kind](game, seat, command, roster, deps) === "ACCEPTED" : false;
    if (ok) game.botPaceAt = deps.now() + BOT_REACT_MS;
    return ok;
  };
  if (chain.step === "challenge_window" || chain.step === "modifier_window") {
    const bot = Object.entries(chain.responders).find(([id, state]) => state === "pending" && isBot(roster, id));
    return bot ? run(bot[0], botCommand("REACT_PASS", { windowId: chain.windowId })) : false;
  }
  if (chain.step === "immediate_roll_choice") {
    if (!isBot(roster, chain.actorId)) return false;
    const hero = findHero(game, chain.heroCardId);
    const rule = hero ? cardDataOfKind(hero.hero.card.definitionId, "hero")?.target ?? "none" : "none";
    const targets = botTargets(game, chain.actorId, rule);
    if (targets && run(chain.actorId, botCommand("IMMEDIATE_ROLL", { choice: "roll", targets }))) return true;
    return run(chain.actorId, botCommand("IMMEDIATE_ROLL", { choice: "skip" }));
  }
  const choice = chain.choice;
  if (!isBot(roster, choice.playerId)) return false;
  const ids = eligibleChoiceCards(game, choice).slice(0, Math.max(choice.min, choice.kind === "order_top" ? choice.max : 0)).map((card) => card.cardId);
  if (choice.kind === "confirm") return run(choice.playerId, botCommand("RESOLVE_CHOICE", { choiceId: choice.choiceId, cardInstanceIds: [], accept: true }));
  return run(choice.playerId, botCommand("RESOLVE_CHOICE", { choiceId: choice.choiceId, cardInstanceIds: ids }));
}

/** One turn action for the active bot (paced by BOT_STEP_MS). Simple, legal-only heuristics. */
function botTurnAction(game: BaseGameState, roster: BaseRoster, deps: BaseGameDeps): boolean {
  const active = activePlayerId(game);
  if (game.phase !== "turn_active" || !active || !isBot(roster, active) || isBusy(game)) return false;
  const now = deps.now();
  if (game.botNextActAt == null || game.botNextActAt < 0) {
    game.botNextActAt = now + BOT_STEP_MS;
    return false;
  }
  if (now < game.botNextActAt) return false;
  if (!botMayAct(game, deps)) return false;
  const seat = seatOf(game, active)!;
  const ap = game.actionPoints ?? 0;
  const tryRun = (command: BaseGameCommand) => BASE_TURN_HANDLERS[command.kind](game, seat, command, roster, deps) === "ACCEPTED";
  let acted = false;
  if (!acted && ap >= ATTACK_COST) {
    const monster = game.faceUpMonsters.find((id) => meetsRequirement(seat, monsterData(id), game.settings));
    if (monster) acted = tryRun(botCommand("ATTACK_MONSTER", { monsterInstanceId: monster }));
  }
  if (!acted && ap >= PLAY_COST) {
    const hero = seat.hand.find((card) => card.kind === "hero");
    if (hero) acted = tryRun(botCommand("PLAY_HAND_CARD", { cardInstanceId: hero.cardId }));
  }
  if (!acted && ap >= PLAY_COST) {
    const item = seat.hand.find((card) => card.kind === "item");
    const bare = item ? seat.party.find((entry) => canAttach(entry, item)) : undefined;
    if (item && bare) acted = tryRun(botCommand("PLAY_HAND_CARD", { cardInstanceId: item.cardId, targets: { heroInstanceIds: [bare.card.cardId] } }));
  }
  if (!acted && ap >= HERO_EFFECT_COST) {
    for (const entry of seat.party) {
      if (game.heroRollsUsed.includes(entry.card.cardId) || ap < paidHeroEffectCost(entry)) continue;
      const rule = cardDataOfKind(entry.card.definitionId, "hero")?.target ?? "none";
      const targets = botTargets(game, active, rule);
      if (targets && tryRun(botCommand("USE_HERO_EFFECT", { heroInstanceId: entry.card.cardId, targets }))) { acted = true; break; }
    }
  }
  if (!acted && ap >= DRAW_COST) acted = tryRun(botCommand("DRAW_CARD", {}));
  if (!acted) acted = tryRun(botCommand("END_TURN", {}));
  game.botNextActAt = now + BOT_STEP_MS;
  game.botPaceAt = now + BOT_REACT_MS;
  return acted;
}

/** Lets bots answer pending windows/choices and take paced turn actions. Returns true if state changed. */
function runBots(game: BaseGameState, roster: BaseRoster, deps: BaseGameDeps): boolean {
  if (!roster.players.some((player) => player.isBot)) return false;
  let changed = false;
  for (let guard = 0; guard < 30 && game.phase === "turn_active"; guard += 1) {
    const step = botReact(game, roster, deps) || botTurnAction(game, roster, deps);
    if (!step) break;
    changed = true;
    updateTurnTimer(game, deps.now());
  }
  return changed;
}

/** Lobby: a new bot seat takes a random free Leader (respecting player-count bans at start). */
export function seatBot(game: BaseGameState, roster: BaseRoster, botId: string, deps: BaseGameDeps): void {
  normalizeBaseGame(game);
  syncLobbySeats(game, roster);
  const seat = seatOf(game, botId);
  if (!seat || seat.leaderId) return;
  const taken = new Set(game.seats.map((candidate) => candidate.leaderId).filter(Boolean));
  const free = deps.shuffle(game.leaderPool.filter((id) => !taken.has(id) && !(cardDataOfKind(id, "party_leader")?.bannedPlayerCounts.length)));
  if (free[0]) lobbySelectLeader(game, seat, free[0]);
  if (seat.leaderId) game.readyPlayerIds = [...new Set([...(game.readyPlayerIds ?? []), seat.playerId])];
}

/** Applies expired deadlines, the turn timer and bot moves (alarm / poll / before a command). Returns true if state changed. */
export function settleBaseGame(game: BaseGameState, roster: BaseRoster, deps: BaseGameDeps): boolean {
  normalizeBaseGame(game);
  syncLobbySeats(game, roster);
  let changed = false;
  for (let guard = 0; guard < 20; guard += 1) {
    let step = settleDeadlines(game, deps, HOOKS);
    step = settleTurnTimer(game, deps) || step;
    step = runBots(game, roster, deps) || step;
    step = updateTurnTimer(game, deps.now()) || step;
    if (!step) break;
    changed = true;
  }
  return changed;
}

export function baseNextDeadline(game: BaseGameState, roster?: BaseRoster): number | null {
  normalizeBaseGame(game);
  const candidates = [nextDeadline(game)];
  if (game.phase === "turn_active" && !isBusy(game)) {
    candidates.push(game.turnDeadlineAt ?? null);
  }
  if (roster) candidates.push(botDueAt(game, roster));
  const times = candidates.filter((value): value is number => typeof value === "number");
  return times.length ? Math.min(...times) : null;
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
    return { ...base, challengerPlayerId: roll.challengerId, challengerDice: [...roll.challengerDice] as [number, number], challengerTotal, attemptCard: anyCardView(roll.attempt.card) };
  }
  if (roll.kind === "hero_effect") return { ...base, heroInstanceId: roll.heroCardId, threshold: roll.threshold };
  return { ...base, monsterInstanceId: roll.monsterId };
}

function rollReferencesHiddenCard(game: BaseGameState, viewerId: string, roll: RollState, subject: BaseCard | null): boolean {
  const hidden = new Set<string>(game.mainDeck.map((card) => card.cardId));
  for (const seat of game.seats) {
    if (seat.playerId !== viewerId) for (const card of seat.hand) hidden.add(card.cardId);
  }
  const referenced = [
    ...roll.modifiers.map((entry) => entry.cardId),
    ...(roll.kind === "challenge" ? [roll.attempt.card.cardId] : []),
    ...(roll.kind === "hero_effect" ? [roll.heroCardId] : []),
    ...(subject ? [subject.cardId] : []),
  ];
  return referenced.some((cardId) => hidden.has(cardId));
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
  meta: { roomCode: string; revision: number; serverNow: number; viewerNickname?: string },
  viewerPlayerId: string,
): BaseGameSnapshot {
  const game = normalizeBaseGame(rawGame);
  const seats = new Map(game.seats.map((seat) => [seat.playerId, seat]));
  const viewer = roster.players.find((player) => player.playerId === viewerPlayerId) ??
    (meta.viewerNickname ? { playerId: viewerPlayerId, nickname: meta.viewerNickname, isBot: false } : undefined);
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
        isBot: Boolean(player.isBot),
        ready: (game.readyPlayerIds ?? []).includes(player.playerId),
        handCount: seat?.hand.length ?? 0,
        leaderId: seat?.leaderId ?? null,
        leaderClass: seat ? leaderClass(seat) : null,
        party: (seat?.party ?? []).map((hero) => ({
          hero: cardView(hero.card),
          item: hero.attachments[0] ? cardView(hero.attachments[0]) : null,
          attachments: hero.attachments.map(cardView),
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
      turnDeadlineAt: game.phase === "turn_active" && !isBusy(game) ? game.turnDeadlineAt ?? null : null,
      mainDeckCount: game.mainDeck.length,
      monsterDeckCount: game.monsterDeck.length,
      faceUpMonsters: game.faceUpMonsters.map(monsterView),
      discardCount: game.discard.length,
      discardPile: game.discard.map(cardView),
      lastRoll: game.lastRoll && !rollReferencesHiddenCard(game, viewerPlayerId, game.lastRoll.roll, game.lastRoll.subject)
        ? {
            id: game.lastRoll.id,
            resolvedAt: game.lastRoll.resolvedAt,
            outcome: game.lastRoll.outcome,
            roll: rollView(game.lastRoll.roll),
            card:
              game.lastRoll.roll.kind === "attack"
                ? monsterView(game.lastRoll.roll.monsterId)
                : game.lastRoll.subject
                  ? anyCardView(game.lastRoll.subject)
                  : null,
          }
        : null,
      reveals: (game.reveals ?? []).map((reveal) => ({
        revealId: reveal.revealId,
        playerId: reveal.playerId,
        source: reveal.source,
        card: anyCardView(reveal.card),
        expiresAt: reveal.expiresAt,
      })),
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
