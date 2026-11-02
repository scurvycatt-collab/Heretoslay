// Wire contract for the real (non-demo) base game room, mode "base".
// Types only: this file is re-exported with `export type` so it adds no runtime
// code to the client and the client never computes game state (server is authority).
// Contract doc: docs/contracts/GAME_ROOM_API.md.

import type { SetupSliceCommand } from "../index";

/** Card kinds as listed in the base reference catalog (apps/worker/src/content). */
export type BaseCardKind =
  | "challenge"
  | "cursed_item"
  | "hero"
  | "item"
  | "magic"
  | "modifier"
  | "monster"
  | "party_leader";

/**
 * One physical card copy. `cardId` is the unique instance id
 * (`<definitionId>#NN`); `definitionId` maps to card metadata/assets by ID only.
 */
export interface BaseCardView {
  cardId: string;
  definitionId: string;
  kind: BaseCardKind;
}

export type BaseGamePhase = "lobby" | "leader_selection" | "turn_active";

/**
 * Commands accepted in mode "base" (GAME-001). Same shapes and validation as the
 * setup slice. Extension point for GAME-002 (play/attack/hero roll): add the new
 * command interfaces to this union, to `validateRoomSliceCommand`, and a handler
 * in apps/worker/src/game/base-game.ts `BASE_TURN_HANDLERS`.
 */
export type BaseGameCommand = SetupSliceCommand;
export type BaseGameCommandKind = BaseGameCommand["kind"];

export interface BaseGameSnapshot {
  mode: "base";
  roomCode: string;
  revision: number;
  serverNow: number;
  hostPlayerId: string;
  you: { playerId: string; nickname: string; isHost: boolean };
  players: Array<{
    playerId: string;
    nickname: string;
    joinIndex: number;
    isHost: boolean;
    handCount: number;
    /** Party Leader definitionId (placed in Party per RULE-03), or null. */
    leaderId: string | null;
    /** Non-leader Party cards (Heroes/Items). Empty until GAME-002. */
    party: BaseCardView[];
  }>;
  /** Viewer-private: only the requesting seat's hand is ever serialized. */
  yourHand: BaseCardView[];
  game: {
    phase: BaseGamePhase;
    selectionPlayerId: string | null;
    /** All Party Leader definitionIds in the base set. */
    leaderPool: string[];
    selectedLeaderIds: string[];
    turnOrder: string[];
    currentPlayerId: string | null;
    turnNumber: number;
    turnId: string | null;
    actionPoints: number | null;
    mainDeckCount: number;
    monsterDeckCount: number;
    faceUpMonsters: BaseCardView[];
    discardCount: number;
  };
}
