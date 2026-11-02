// Pure game-state module for the real base game (mode "base").
// The Durable Object owns persistence, auth, idempotency receipts and the room
// revision; this module owns the game state shape, command handling and the
// per-viewer projection. See docs/decisions/ADR-002-game-mode-module.md.

import type {
  BaseGameCommand,
  BaseGameCommandKind,
  BaseGameSnapshot,
  RoomSliceCommand,
} from "@here-to-slay/protocol";
import {
  baseLeaderPool,
  baseMainDeck,
  baseMonsterDeck,
  cardView,
  monsterView,
  type BaseCard,
} from "./base-content.ts";
import {
  applySetupCommand,
  currentTurnPlayerId,
  selectionPlayerId,
  type SetupCode,
  type SetupContext,
  type SetupTable,
} from "./setup-core.ts";

export interface BaseSeat {
  playerId: string;
  leaderId: string | null;
  hand: BaseCard[];
  /** Heroes/Items in Party (the Leader is tracked by leaderId). Filled by GAME-002. */
  party: BaseCard[];
}

export interface BaseGameState extends SetupTable<BaseCard> {
  schema: 1;
  seats: BaseSeat[];
  discard: BaseCard[];
}

/** Room-level facts the game needs but does not own. */
export interface BaseRoster {
  hostPlayerId: string;
  /** Players in join order. */
  players: ReadonlyArray<{ playerId: string; nickname: string }>;
}

export interface BaseGameDeps {
  newId: () => string;
  shuffle: (cardIds: string[]) => string[];
}

export type BaseCommandCode = SetupCode | "MODE_MISMATCH";

export function initialBaseGameState(): BaseGameState {
  return {
    schema: 1,
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
  };
}

/** While in the lobby, seats mirror the roster; joins are locked afterwards. */
function syncLobbySeats(game: BaseGameState, roster: BaseRoster): void {
  if (game.phase !== "lobby") return;
  const existing = new Map(game.seats.map((seat) => [seat.playerId, seat]));
  game.seats = roster.players.map(
    ({ playerId }) =>
      existing.get(playerId) ?? { playerId, leaderId: null, hand: [], party: [] },
  );
}

type Handler = (
  game: BaseGameState,
  seat: BaseSeat,
  command: BaseGameCommand,
  roster: BaseRoster,
  deps: BaseGameDeps,
) => BaseCommandCode;

const setupHandler: Handler = (game, seat, command, roster, deps) => {
  const ctx: SetupContext<BaseCard, BaseSeat> = {
    table: game,
    seats: game.seats,
    pile: game,
    actor: seat,
    isHost: seat.playerId === roster.hostPlayerId,
    newTurnId: deps.newId,
    shuffle: deps.shuffle,
    decks: () => ({ main: baseMainDeck(), monsters: baseMonsterDeck() }),
  };
  return applySetupCommand(ctx, command);
};

/**
 * Command table for mode "base". GAME-002 extension point: add PLAY_CARD,
 * ATTACK_MONSTER, ROLL_HERO_EFFECT, ... handlers here (after extending
 * BaseGameCommand in protocol). Handlers must validate before mutating and
 * return "ACCEPTED" only when state changed.
 */
export const BASE_TURN_HANDLERS: Readonly<Record<BaseGameCommandKind, Handler>> = {
  BEGIN_LEADER_SELECTION: setupHandler,
  SELECT_PARTY_LEADER: setupHandler,
  START_GAME: setupHandler,
  DRAW_CARD: setupHandler,
  REDRAW_HAND: setupHandler,
  END_TURN: setupHandler,
};

export function isBaseGameCommand(command: RoomSliceCommand): command is BaseGameCommand {
  return Object.hasOwn(BASE_TURN_HANDLERS, command.kind);
}

/**
 * Applies a validated command for `actorPlayerId`. Apart from mirroring lobby seats
 * to the roster, mutates `game` only when the result is "ACCEPTED". The caller
 * checks commandId (idempotency) and expectedRevision first.
 */
export function applyBaseCommand(
  game: BaseGameState,
  roster: BaseRoster,
  actorPlayerId: string,
  command: RoomSliceCommand,
  deps: BaseGameDeps,
): BaseCommandCode {
  if (!isBaseGameCommand(command)) return "MODE_MISMATCH";
  syncLobbySeats(game, roster);
  const seat = game.seats.find((candidate) => candidate.playerId === actorPlayerId);
  if (!seat) return "FORBIDDEN";
  return BASE_TURN_HANDLERS[command.kind](game, seat, command, roster, deps);
}

/** Per-viewer projection: only the viewer's own hand is serialized. */
export function projectBaseGame(
  game: BaseGameState,
  roster: BaseRoster,
  meta: { roomCode: string; revision: number; serverNow: number },
  viewerPlayerId: string,
): BaseGameSnapshot {
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
        party: (seat?.party ?? []).map(cardView),
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
      currentPlayerId: currentTurnPlayerId(game),
      turnNumber: game.turnNumber,
      turnId: game.turnId,
      actionPoints: game.actionPoints,
      mainDeckCount: game.mainDeck.length,
      monsterDeckCount: game.monsterDeck.length,
      faceUpMonsters: game.faceUpMonsters.map(monsterView),
      discardCount: game.discard.length,
    },
  };
}
