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
  /** Display name from card data (GAME-004). */
  name: string;
  /** Modifier cards only: the values REACT_MODIFIER accepts. */
  modifierOptions?: number[];
}

export type BaseGamePhase = "lobby" | "leader_selection" | "turn_active" | "game_over";

/**
 * Targets chosen up front (Q-08) for a card/Hero effect; re-validated on resolve.
 * Shape per card `target` rule (docs/content/BASE_CARD_DATA.md):
 * other_player → playerId; hero_other_party / own_hero / any_hero_with_item /
 * own_hero_with_cursed_item → heroInstanceIds[0]; two_heroes_other_party → 2 ids;
 * hero_other_party_and_own_hero → [theirHero, ownHero]. Items: heroInstanceIds[0] = equip target.
 */
export interface BaseTargets {
  playerId?: string;
  heroInstanceIds?: string[];
}

interface BaseCommandBase {
  commandId: string;
  expectedRevision: number;
}

/** 1 AP: play a Hero, Item/Cursed Item or Magic from hand (opens the Challenge window). */
export interface PlayHandCardCommand extends BaseCommandBase {
  kind: "PLAY_HAND_CARD";
  payload: { cardInstanceId: string; targets?: BaseTargets };
}

/** 1 AP: roll for the effect of a Hero in your Party (once per Hero per turn). Pressing Roll = this command; server rolls (Q-10). */
export interface UseHeroEffectCommand extends BaseCommandBase {
  kind: "USE_HERO_EFFECT";
  payload: { heroInstanceId: string; targets?: BaseTargets };
}

/** 2 AP: attack a face-up Monster; server rolls (Q-10). */
export interface AttackMonsterCommand extends BaseCommandBase {
  kind: "ATTACK_MONSTER";
  payload: { monsterInstanceId: string };
}

/** Free: after a Hero enters your Party from your hand, roll its effect now (no AP) or skip. */
export interface ImmediateRollCommand extends BaseCommandBase {
  kind: "IMMEDIATE_ROLL";
  payload: { choice: "roll" | "skip"; targets?: BaseTargets };
}

/** Reaction: CHALLENGE the pending card (first valid wins). */
export interface ReactChallengeCommand extends BaseCommandBase {
  kind: "REACT_CHALLENGE";
  payload: { windowId: string; cardInstanceId: string };
}

/**
 * Reaction: play one Modifier on the open roll. `value` must be one of the card's
 * options. `side` is required on a Challenge roll (whose roll to modify).
 */
export interface ReactModifierCommand extends BaseCommandBase {
  kind: "REACT_MODIFIER";
  payload: {
    windowId: string;
    cardInstanceId: string;
    value: number;
    side?: "challenger" | "defender";
    /** The Protecting Horn passive: extra +1 or -1 on the same roll (Q-11 display). */
    leaderBonus?: 1 | -1;
  };
}

/** Reaction: Skip (completes this player's part of the window). */
export interface ReactPassCommand extends BaseCommandBase {
  kind: "REACT_PASS";
  payload: { windowId: string };
}

/** Answer a pending choice (discard / sacrifice / give / take from discard ...). */
export interface ResolveChoiceCommand extends BaseCommandBase {
  kind: "RESOLVE_CHOICE";
  /** `accept` answers a "confirm" choice (a "may" clause); omit it for card choices. */
  /** `targets`: only for a `play_card` choice (targets of the card being played). */
  payload: { choiceId: string; cardInstanceIds: string[]; accept?: boolean; targets?: BaseTargets };
}

/** Leader skill that costs AP (base: The Shadow Claw, 1 AP, once per turn). */
export interface LeaderActionCommand extends BaseCommandBase {
  kind: "LEADER_ACTION";
  payload: { targetPlayerId: string };
}

/** Host-only, before START_GAME: per-room rule settings (reaction time, Q-01/Q-04/Q-11 switches). */
export interface ConfigureGameCommand extends BaseCommandBase {
  kind: "CONFIGURE_GAME";
  payload: Partial<BaseGameSettings>;
}

/** Host-only, lobby: add a server-driven bot seat (it picks a free Leader at once). */
export interface AddBotCommand extends BaseCommandBase {
  kind: "ADD_BOT";
  payload: Record<string, never>;
}

/** Host-only, lobby: remove a bot seat. */
export interface RemoveBotCommand extends BaseCommandBase {
  kind: "REMOVE_BOT";
  payload: { playerId: string };
}

/** Host-only after GAME_OVER: reset game state while preserving the room and its seats. */
export interface NewGameCommand extends BaseCommandBase {
  kind: "NEW_GAME";
  payload: Record<string, never>;
}

/** Lobby seat confirms its selected Leader; changing Leader clears readiness. */
export interface SetReadyCommand extends BaseCommandBase {
  kind: "SET_READY";
  payload: { ready: boolean };
}

export type BaseTurnCommand =
  | ConfigureGameCommand
  | AddBotCommand
  | RemoveBotCommand
  | NewGameCommand
  | SetReadyCommand
  | PlayHandCardCommand
  | UseHeroEffectCommand
  | AttackMonsterCommand
  | ImmediateRollCommand
  | ReactChallengeCommand
  | ReactModifierCommand
  | ReactPassCommand
  | ResolveChoiceCommand
  | LeaderActionCommand;

export type BaseTurnCommandKind = BaseTurnCommand["kind"];

/**
 * Commands accepted in mode "base" (GAME-001). Same shapes and validation as the
 * setup slice. Extension point for GAME-002 (play/attack/hero roll): add the new
 * command interfaces to this union, to `validateRoomSliceCommand`, and a handler
 * in apps/worker/src/game/base-game.ts `BASE_TURN_HANDLERS`.
 */
export type BaseGameCommand = SetupSliceCommand | BaseTurnCommand;
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
    /** Server-driven seat added by the host in the lobby. */
    isBot: boolean;
    ready: boolean;
    handCount: number;
    /** Party Leader definitionId (placed in Party per RULE-03), or null. */
    leaderId: string | null;
    /** Leader class (for the 6-class win; Leader counts, RULE-23). */
    leaderClass: string | null;
    /** Heroes in Party with their equipped Item (if any). */
    party: Array<{ hero: BaseCardView; item: BaseCardView | null; classes: string[] }>;
    slainMonsters: BaseCardView[];
    /** Distinct classes in Party incl. Leader (6 = class win at end of own turn). */
    partyClasses: string[];
    protections: Array<"no_destroy" | "no_steal">;
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
    /** Turn countdown: end of the current turn unless an action is taken (resets on AP spend, paused while a chain resolves). */
    turnDeadlineAt: number | null;
    mainDeckCount: number;
    monsterDeckCount: number;
    faceUpMonsters: BaseCardView[];
    discardCount: number;
    /** Public discard pile, oldest first (last = most recently discarded). */
    discardPile: BaseCardView[];
    /** Last resolved roll (result screen; display only). Null before the first roll. */
    lastRoll: BaseRollResultView | null;
    /** C06: bounded public reveals (one explicitly revealed card each; hide after `expiresAt`). */
    reveals: Array<{ revealId: string; playerId: string; source: string; card: BaseCardView; expiresAt: number }>;
    /** Hero instance ids whose effect was already rolled this turn. */
    heroRollsUsed: string[];
    /** Current turn's +N to all rolls of the active player (Wise Shield etc.). */
    turnRollBonus: number;
    /** What is being resolved right now (null = free for turn actions). */
    chain: BaseChainView | null;
    winnerPlayerId: string | null;
    winReason: "slay_3" | "six_classes" | null;
    /** Last public events, newest last (bounded). */
    log: Array<{ seq: number; text: string }>;
    settings: BaseGameSettings;
  };
}

export interface BaseGameSettings {
  /** Turn timer chosen in the lobby: 30, 60 or 90 seconds. Expiry ends the turn. */
  turnSeconds: number;
  reactionSeconds: number;
  choiceSeconds: number;
  /** Q-01 (owner 2026-11-02): true = retail rulebook, Leader fills a Monster class slot. */
  leaderFillsClassSlot: boolean;
  /** Q-04 (owner 2026-11-02): "replace" = card text, Mask replaces the Hero's class. */
  maskMode: "add" | "replace";
  /** Q-11: owner default false — Leader passive does not use the player's Modifier slot. */
}

export interface BaseRollView {
  kind: "hero_effect" | "attack" | "challenge";
  rollerPlayerId: string;
  dice: [number, number];
  /** Challenge only: the challenger's dice. */
  challengerPlayerId?: string;
  challengerDice?: [number, number];
  modifiers: Array<{ playerId: string; cardId: string; value: number; side?: "challenger" | "defender" }>;
  /** Passive bonuses (Leader, slain Monster, Item, turn buffs) shown separately (Q-11). */
  passives: Array<{ source: string; label: string; value: number; side?: "challenger" | "defender" }>;
  total: number;
  challengerTotal?: number;
  /** For hero_effect: threshold; for attack: monster card. */
  heroInstanceId?: string;
  monsterInstanceId?: string;
  threshold?: number;
  /** Challenge only: the Hero/Item/Magic card being challenged. */
  attemptCard?: BaseCardView;
}

/** Outcome as decided by the server; the client never re-derives it. */
export type BaseRollOutcome = "success" | "fail" | "slay" | "penalty" | "none" | "challenge_succeeded" | "challenge_failed";

export interface BaseRollResultView {
  id: string;
  resolvedAt: number;
  outcome: BaseRollOutcome;
  roll: BaseRollView;
  /** Hero / challenged card / attacked Monster, when still known. */
  card: BaseCardView | null;
}

export type BaseChainView =
  | {
      step: "challenge_window";
      windowId: string;
      deadlineAt: number;
      actorPlayerId: string;
      pendingCard: BaseCardView;
      responders: Record<string, "pending" | "passed">;
    }
  | {
      step: "modifier_window";
      windowId: string;
      deadlineAt: number;
      roll: BaseRollView;
      responders: Record<string, "pending" | "passed">;
    }
  | {
      step: "immediate_roll_choice";
      deadlineAt: number;
      actorPlayerId: string;
      hero: BaseCardView;
    }
  | {
      step: "choice";
      choiceId: string;
      deadlineAt: number;
      playerId: string;
      kind:
        | "discard"
        | "sacrifice_hero"
        | "give_card"
        | "take_from_discard"
        | "discard_from_set"
        | "confirm"
        | "play_card"
        | "destroy_hero"
        | "take_from_top"
        | "order_top"
        | "view_hand"
        | "take_from_hand";
      min: number;
      max: number;
      prompt: string;
      /** Only for the chooser: what may be picked (own hand, public zones, or the
       *  hand/deck cards that the effect lets the chooser see — Sharp Fox, Silent Shadow, Bullseye). */
      options?: BaseCardView[];
    };
