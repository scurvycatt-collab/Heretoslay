// Shared, pure setup + basic turn/AP logic (RULE-03..05, SETUP_VERIFIED SETUP-02..05,
// TURN-01..03, AP-01, AP-05). Used by both `setup_demo` (fixture decks) and the real
// `base` mode (catalog decks) so the rules proven in the setup slice live in one place.
// No I/O, no clock, no crypto: randomness and ids are injected by the caller.

import type { SetupSliceCommand } from "@here-to-slay/protocol";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const TURN_ACTION_POINTS = 3;
export const STARTING_HAND_SIZE = 5;
export const FACE_UP_MONSTERS = 3;
export const DRAW_COST = 1;
export const REDRAW_COST = 3;

export type SetupPhase = "lobby" | "leader_selection" | "turn_active";

export interface CardLike {
  cardId: string;
}

/** Table state shared by every mode that uses the verified setup flow. */
export interface SetupTable<C extends CardLike> {
  phase: SetupPhase;
  leaderPool: string[];
  selectionOrder: string[];
  selectionIndex: number;
  turnOrder: string[];
  currentPlayerIndex: number;
  turnNumber: number;
  turnId: string | null;
  actionPoints: number | null;
  mainDeck: C[];
  monsterDeck: string[];
  faceUpMonsters: string[];
}

export interface SetupSeat<C extends CardLike> {
  playerId: string;
  leaderId?: string | null;
  hand: C[];
}

export interface SetupDecks<C extends CardLike> {
  main: C[];
  monsters: string[];
}

export interface SetupContext<C extends CardLike, S extends SetupSeat<C>> {
  table: SetupTable<C>;
  /** Seats in join (clockwise) order. */
  seats: S[];
  /** Holder of the discard pile; reassigned on reshuffle. */
  pile: { discard: C[] };
  actor: S;
  isHost: boolean;
  newTurnId: () => string;
  shuffle: (cardIds: string[]) => string[];
  /** Fresh, unshuffled decks for START_GAME. */
  decks: () => SetupDecks<C>;
  onTurnStart?: (turnId: string) => void;
}

/**
 * Outcome codes. "ACCEPTED" means state was mutated; every other code means the
 * context was left untouched (validation happens before any mutation).
 */
export type SetupCode =
  | "ACCEPTED"
  | "FORBIDDEN"
  | "INVALID_PHASE"
  | "NOT_ENOUGH_PLAYERS"
  | "NOT_ACTIVE_SELECTOR"
  | "LEADER_NOT_AVAILABLE"
  | "LEADER_TAKEN"
  | "SELECTION_INCOMPLETE"
  | "INSUFFICIENT_CARDS"
  | "NOT_YOUR_TURN"
  | "INSUFFICIENT_AP";

export function currentTurnPlayerId(table: SetupTable<CardLike>): string | null {
  return table.phase === "turn_active" ? table.turnOrder[table.currentPlayerIndex] ?? null : null;
}

export function selectionPlayerId(table: SetupTable<CardLike>): string | null {
  return table.phase === "leader_selection"
    ? table.selectionOrder[table.selectionIndex] ?? null
    : null;
}

function startTurn<C extends CardLike, S extends SetupSeat<C>>(ctx: SetupContext<C, S>): void {
  const turnId = ctx.newTurnId();
  ctx.table.turnId = turnId;
  ctx.table.actionPoints = TURN_ACTION_POINTS;
  ctx.onTurnStart?.(turnId);
}

/** TURN-03: turn ends when AP runs out or the player stops; AP never carries over. */
export function advanceTurn<C extends CardLike, S extends SetupSeat<C>>(ctx: SetupContext<C, S>): void {
  const table = ctx.table;
  table.currentPlayerIndex = (table.currentPlayerIndex + 1) % table.turnOrder.length;
  table.turnNumber += 1;
  startTurn(ctx);
}

function shuffled<C extends CardLike>(cards: C[], shuffle: (ids: string[]) => string[]): C[] {
  const byId = new Map(cards.map((card) => [card.cardId, card]));
  return shuffle([...byId.keys()]).map((cardId) => byId.get(cardId)!);
}

/**
 * Draws sequentially; when the main deck empties the discard pile is reshuffled in.
 * NOTE: depletion handling is not verified by the rulebook (SETUP_VERIFIED ambiguity #2);
 * this preserves the setup-slice behaviour until a rule spec decides otherwise.
 */
export function drawCards<C extends CardLike>(
  table: SetupTable<C>,
  pile: { discard: C[] },
  count: number,
  shuffle: (ids: string[]) => string[],
): C[] {
  const drawn: C[] = [];
  while (drawn.length < count) {
    if (table.mainDeck.length === 0) {
      if (pile.discard.length === 0) break;
      table.mainDeck = shuffled(pile.discard, shuffle);
      pile.discard = [];
    }
    const card = table.mainDeck.shift();
    if (!card) break;
    drawn.push(card);
  }
  return drawn;
}

function beginLeaderSelection<C extends CardLike, S extends SetupSeat<C>>(
  ctx: SetupContext<C, S>,
): SetupCode {
  if (!ctx.isHost) return "FORBIDDEN";
  if (ctx.table.phase !== "lobby") return "INVALID_PHASE";
  if (ctx.seats.length < MIN_PLAYERS || ctx.seats.length > MAX_PLAYERS) return "NOT_ENOUGH_PLAYERS";
  ctx.table.phase = "leader_selection";
  // Selection order = join order. Rulebook leaves pick order open (ambiguity #1).
  ctx.table.selectionOrder = ctx.seats.map((seat) => seat.playerId);
  ctx.table.selectionIndex = 0;
  for (const seat of ctx.seats) seat.leaderId = null;
  return "ACCEPTED";
}

function selectLeader<C extends CardLike, S extends SetupSeat<C>>(
  ctx: SetupContext<C, S>,
  leaderId: string,
): SetupCode {
  const table = ctx.table;
  if (table.phase !== "leader_selection") return "INVALID_PHASE";
  if (table.selectionOrder[table.selectionIndex] !== ctx.actor.playerId) return "NOT_ACTIVE_SELECTOR";
  if (!table.leaderPool.includes(leaderId)) return "LEADER_NOT_AVAILABLE";
  if (ctx.seats.some((seat) => seat.leaderId === leaderId)) return "LEADER_TAKEN";
  ctx.actor.leaderId = leaderId;
  table.selectionIndex += 1;
  return "ACCEPTED";
}

function startGame<C extends CardLike, S extends SetupSeat<C>>(ctx: SetupContext<C, S>): SetupCode {
  const table = ctx.table;
  if (!ctx.isHost) return "FORBIDDEN";
  if (table.phase !== "leader_selection") return "INVALID_PHASE";
  if (table.selectionIndex !== ctx.seats.length || ctx.seats.some((seat) => !seat.leaderId)) {
    return "SELECTION_INCOMPLETE";
  }
  const decks = ctx.decks();
  const main = shuffled(decks.main, ctx.shuffle);
  const monsters = ctx.shuffle([...decks.monsters]);
  if (main.length < ctx.seats.length * STARTING_HAND_SIZE || monsters.length < FACE_UP_MONSTERS) {
    return "INSUFFICIENT_CARDS";
  }
  for (const seat of ctx.seats) seat.hand = main.splice(0, STARTING_HAND_SIZE);
  table.mainDeck = main;
  table.faceUpMonsters = monsters.splice(0, FACE_UP_MONSTERS);
  table.monsterDeck = monsters;
  ctx.pile.discard = [];
  // SETUP-05: last Leader selector goes first, then clockwise (join order).
  const firstPlayerId = table.selectionOrder[table.selectionOrder.length - 1];
  const joinOrder = ctx.seats.map((seat) => seat.playerId);
  const startIndex = joinOrder.indexOf(firstPlayerId);
  table.turnOrder = [...joinOrder.slice(startIndex), ...joinOrder.slice(0, startIndex)];
  table.currentPlayerIndex = 0;
  table.turnNumber = 1;
  table.phase = "turn_active";
  startTurn(ctx);
  return "ACCEPTED";
}

/** Guard shared by every in-turn action: active phase and the actor holds the turn. */
export function turnGuard(table: SetupTable<CardLike>, actorPlayerId: string): SetupCode | null {
  if (table.phase !== "turn_active") return "INVALID_PHASE";
  if (table.turnOrder[table.currentPlayerIndex] !== actorPlayerId) return "NOT_YOUR_TURN";
  return null;
}

function spendAp<C extends CardLike, S extends SetupSeat<C>>(ctx: SetupContext<C, S>, cost: number): void {
  ctx.table.actionPoints = (ctx.table.actionPoints ?? 0) - cost;
  if (ctx.table.actionPoints <= 0) advanceTurn(ctx);
}

function drawAction<C extends CardLike, S extends SetupSeat<C>>(ctx: SetupContext<C, S>): SetupCode {
  if ((ctx.table.actionPoints ?? 0) < DRAW_COST) return "INSUFFICIENT_AP";
  ctx.actor.hand.push(...drawCards(ctx.table, ctx.pile, 1, ctx.shuffle));
  spendAp(ctx, DRAW_COST);
  return "ACCEPTED";
}

/** AP-05: discard the whole hand (if any), then draw 5. */
function redrawAction<C extends CardLike, S extends SetupSeat<C>>(ctx: SetupContext<C, S>): SetupCode {
  if ((ctx.table.actionPoints ?? 0) < REDRAW_COST) return "INSUFFICIENT_AP";
  ctx.pile.discard.push(...ctx.actor.hand);
  ctx.actor.hand = [];
  ctx.actor.hand.push(...drawCards(ctx.table, ctx.pile, STARTING_HAND_SIZE, ctx.shuffle));
  spendAp(ctx, REDRAW_COST);
  return "ACCEPTED";
}

/** Applies one setup-slice command. Revision/idempotency guards belong to the caller. */
export function applySetupCommand<C extends CardLike, S extends SetupSeat<C>>(
  ctx: SetupContext<C, S>,
  command: SetupSliceCommand,
): SetupCode {
  switch (command.kind) {
    case "BEGIN_LEADER_SELECTION":
      return beginLeaderSelection(ctx);
    case "SELECT_PARTY_LEADER":
      return selectLeader(ctx, command.payload.leaderId);
    case "START_GAME":
      return startGame(ctx);
  }
  const blocked = turnGuard(ctx.table, ctx.actor.playerId);
  if (blocked) return blocked;
  switch (command.kind) {
    case "DRAW_CARD":
      return drawAction(ctx);
    case "REDRAW_HAND":
      return redrawAction(ctx);
    case "END_TURN":
      advanceTurn(ctx);
      return "ACCEPTED";
  }
}
