export type PlayerId = string;
export type CardId = string;
export type WindowId = string;

export type CardKind = "challenge" | "modifier" | "other" | "magic" | "hero" | "inert";

export interface ServerCard {
  cardId: CardId;
  kind: CardKind;
}

interface ReactionCommandBase {
  commandId: string;
  /** Informational for reactions; exact-state actions validate it elsewhere. */
  expectedRevision?: number;
}

export interface PlayChallengeCommand extends ReactionCommandBase {
  kind: "PLAY_CHALLENGE";
  payload: { windowId: WindowId; cardId: CardId };
}

export interface PlayModifierCommand extends ReactionCommandBase {
  kind: "PLAY_MODIFIER";
  payload: { windowId: WindowId; cardId: CardId };
}

export interface SkipReactionCommand extends ReactionCommandBase {
  kind: "SKIP_REACTION";
  payload: { windowId: WindowId };
}

export type ReactionCommand =
  | PlayChallengeCommand
  | PlayModifierCommand
  | SkipReactionCommand;

export type ExactStateCommandKind =
  | "START_GAME"
  | "PLAY_CARD"
  | "ROLL_HERO_EFFECT"
  | "END_TURN";

export interface ExactStateCommand {
  commandId: string;
  expectedRevision: number;
  kind: ExactStateCommandKind;
  payload: Record<string, unknown>;
}

export type ClientCommand = ReactionCommand | ExactStateCommand;

export interface OpenReactionDemoCommand {
  commandId: string;
  expectedRevision: number;
  kind: "OPEN_REACTION_DEMO";
  payload: { reactionKind: "challenge" | "modifier" };
}

interface SetupCommandBase {
  commandId: string;
  expectedRevision: number;
}

export interface BeginLeaderSelectionCommand extends SetupCommandBase {
  kind: "BEGIN_LEADER_SELECTION";
  payload: Record<string, never>;
}

export interface SelectPartyLeaderCommand extends SetupCommandBase {
  kind: "SELECT_PARTY_LEADER";
  payload: { leaderId: string };
}

export interface StartGameCommand extends SetupCommandBase {
  kind: "START_GAME";
  payload: Record<string, never>;
}

export interface DrawCardCommand extends SetupCommandBase {
  kind: "DRAW_CARD";
  payload: Record<string, never>;
}

export interface RedrawHandCommand extends SetupCommandBase {
  kind: "REDRAW_HAND";
  payload: Record<string, never>;
}

export interface EndTurnCommand extends SetupCommandBase {
  kind: "END_TURN";
  payload: Record<string, never>;
}

export type SetupSliceCommand =
  | BeginLeaderSelectionCommand
  | SelectPartyLeaderCommand
  | StartGameCommand
  | DrawCardCommand
  | RedrawHandCommand
  | EndTurnCommand;

interface EffectCommandBase {
  commandId: string;
  expectedRevision: number;
}

export interface StartEffectDemoCommand extends EffectCommandBase {
  kind: "START_EFFECT_DEMO";
  payload: Record<string, never>;
}

export interface PlayEffectCardCommand extends EffectCommandBase {
  kind: "PLAY_CARD";
  payload: { cardInstanceId: string };
}

export interface ChooseCriticalBoostDiscardCommand extends EffectCommandBase {
  kind: "CHOOSE_CRITICAL_BOOST_DISCARD";
  payload: { attemptId: string; cardInstanceId: string };
}

export interface ChooseDodgyDealerImmediateCommand extends EffectCommandBase {
  kind: "CHOOSE_DODGY_DEALER_IMMEDIATE";
  payload:
    | { attemptId: string; choice: "skip" }
    | { attemptId: string; choice: "roll"; targetPlayerId: PlayerId };
}

export interface RollHeroEffectCommand extends EffectCommandBase {
  kind: "ROLL_HERO_EFFECT";
  payload: { heroInstanceId: string; targetPlayerId: PlayerId };
}

export type EffectSliceCommand =
  | StartEffectDemoCommand
  | PlayEffectCardCommand
  | ChooseCriticalBoostDiscardCommand
  | ChooseDodgyDealerImmediateCommand
  | RollHeroEffectCommand
  | EndTurnCommand;

export type RoomSliceCommand =
  | ReactionCommand
  | OpenReactionDemoCommand
  | SetupSliceCommand
  | EffectSliceCommand;
/** "base" is the real game (GAME-001); the *_demo modes use synthetic fixtures. */
export type RoomCreateMode = "reaction_demo" | "setup_demo" | "effect_demo" | "base";
export type DemoRoomMode = Exclude<RoomCreateMode, "base">;

interface ServerEventBase {
  eventId: string;
  revision: number;
  serverNow: number;
}

export interface ReactionOpenedEvent extends ServerEventBase {
  kind: "REACTION_OPENED";
  payload: {
    windowId: WindowId;
    reactionKind: "challenge" | "modifier";
    deadlineAt: number;
    youAreEligible: boolean;
    pendingCount: number;
  };
}

export interface ReactionClosedEvent extends ServerEventBase {
  kind: "REACTION_CLOSED";
  payload: { windowId: WindowId; reason: ReactionCloseReason };
}

export interface CommandRejectedEvent extends ServerEventBase {
  kind: "COMMAND_REJECTED";
  payload: { commandId: string; code: ReactionCode };
}

export interface RoomSnapshotEvent extends ServerEventBase {
  kind: "ROOM_SNAPSHOT";
  payload: PlayerRoomProjection;
}

export type ServerEvent =
  | ReactionOpenedEvent
  | ReactionClosedEvent
  | CommandRejectedEvent
  | RoomSnapshotEvent;

export type ReactionCloseReason =
  | "all_completed"
  | "deadline"
  | "first_valid_challenge";

export interface ChallengeRoll {
  challengerId: PlayerId;
  cardId: CardId;
  playedByDice: readonly [number, number];
  challengerDice: readonly [number, number];
}

export interface ModifierSubmission {
  playerId: PlayerId;
  cardId: CardId;
}

export interface ReactionWindowState {
  windowId: WindowId;
  kind: "challenge" | "modifier";
  revision: number;
  openedAt: number;
  deadlineAt: number;
  eligiblePlayerIds: PlayerId[];
  completedPlayerIds: PlayerId[];
  playedByPlayerId?: PlayerId;
  challenge?: ChallengeRoll;
  modifiers: ModifierSubmission[];
  resolved: boolean;
  closeReason?: ReactionCloseReason;
}

export type ReactionCode =
  | "ACCEPTED"
  | "ALREADY_COMPLETED"
  | "CARD_NOT_OWNED"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_COMMAND"
  | "INVALID_REACTION_KIND"
  | "MODIFIER_LIMIT_REACHED"
  | "NOT_ELIGIBLE"
  | "SELF_CHALLENGE"
  | "WINDOW_CLOSED"
  | "WINDOW_MISMATCH";

export interface ReactionResponse {
  accepted: boolean;
  code: ReactionCode;
  revision: number;
  windowId: WindowId;
}

export interface ReactionProcessResult {
  state: ReactionWindowState;
  response: ReactionResponse;
  replayed: boolean;
}

export interface StoredIdempotencyOutcome {
  fingerprint: string;
  response: ReactionResponse;
}

export type IdempotencyStore = Map<string, StoredIdempotencyOutcome>;

export interface ReactionContext {
  roomId: string;
  playerId: PlayerId;
  nowMs: number;
  hand: readonly ServerCard[];
  /** Server-only dependency. Commands never carry dice outcomes. */
  rollDice?: () => readonly [number, number];
}

export interface ValidationResult {
  ok: boolean;
  command?: ClientCommand;
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateReactionCommand(value: unknown): ValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ["command must be an object"] };
  if (!isNonEmptyString(value.commandId)) issues.push("commandId is required");
  if (
    value.expectedRevision !== undefined &&
    (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 0)
  ) {
    issues.push("expectedRevision must be a non-negative integer");
  }
  if (
    value.kind !== "PLAY_CHALLENGE" &&
    value.kind !== "PLAY_MODIFIER" &&
    value.kind !== "SKIP_REACTION"
  ) {
    issues.push("unsupported reaction kind");
  }
  if (!isRecord(value.payload)) {
    issues.push("payload is required");
  } else {
    if (!isNonEmptyString(value.payload.windowId)) issues.push("payload.windowId is required");
    if (
      (value.kind === "PLAY_CHALLENGE" || value.kind === "PLAY_MODIFIER") &&
      !isNonEmptyString(value.payload.cardId)
    ) {
      issues.push("payload.cardId is required");
    }
  }
  return issues.length === 0
    ? { ok: true, command: value as unknown as ReactionCommand, issues }
    : { ok: false, issues };
}

export function validateClientCommand(value: unknown): ValidationResult {
  if (isRecord(value) && (
    value.kind === "PLAY_CHALLENGE" ||
    value.kind === "PLAY_MODIFIER" ||
    value.kind === "SKIP_REACTION"
  )) {
    return validateReactionCommand(value);
  }
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ["command must be an object"] };
  if (!isNonEmptyString(value.commandId)) issues.push("commandId is required");
  if (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) {
    issues.push("expectedRevision is required for exact-state commands");
  }
  if (
    value.kind !== "START_GAME" &&
    value.kind !== "PLAY_CARD" &&
    value.kind !== "ROLL_HERO_EFFECT" &&
    value.kind !== "END_TURN"
  ) {
    issues.push("unsupported command kind");
  }
  if (!isRecord(value.payload)) issues.push("payload is required");
  return issues.length === 0
    ? { ok: true, command: value as unknown as ExactStateCommand, issues }
    : { ok: false, issues };
}

export interface RoomSliceValidationResult {
  ok: boolean;
  command?: RoomSliceCommand;
  issues: string[];
}

export function validateRoomSliceCommand(value: unknown): RoomSliceValidationResult {
  if (isRecord(value) && value.kind === "OPEN_REACTION_DEMO") {
    const issues: string[] = [];
    if (!isNonEmptyString(value.commandId)) issues.push("commandId is required");
    if (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) {
      issues.push("expectedRevision is required");
    }
    if (
      !isRecord(value.payload) ||
      (value.payload.reactionKind !== "challenge" && value.payload.reactionKind !== "modifier")
    ) {
      issues.push("payload.reactionKind must be challenge or modifier");
    }
    return issues.length === 0
      ? { ok: true, command: value as unknown as OpenReactionDemoCommand, issues }
      : { ok: false, issues };
  }
  if (
    isRecord(value) &&
    (value.kind === "START_EFFECT_DEMO" ||
      value.kind === "PLAY_CARD" ||
      value.kind === "CHOOSE_CRITICAL_BOOST_DISCARD" ||
      value.kind === "CHOOSE_DODGY_DEALER_IMMEDIATE" ||
      value.kind === "ROLL_HERO_EFFECT")
  ) {
    const issues: string[] = [];
    if (!isNonEmptyString(value.commandId)) issues.push("commandId is required");
    if (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) {
      issues.push("expectedRevision is required");
    }
    if (!isRecord(value.payload)) {
      issues.push("payload is required");
    } else if (value.kind === "PLAY_CARD" && !isNonEmptyString(value.payload.cardInstanceId)) {
      issues.push("payload.cardInstanceId is required");
    } else if (value.kind === "CHOOSE_CRITICAL_BOOST_DISCARD") {
      if (!isNonEmptyString(value.payload.attemptId)) issues.push("payload.attemptId is required");
      if (!isNonEmptyString(value.payload.cardInstanceId)) {
        issues.push("payload.cardInstanceId is required");
      }
    } else if (value.kind === "CHOOSE_DODGY_DEALER_IMMEDIATE") {
      if (!isNonEmptyString(value.payload.attemptId)) issues.push("payload.attemptId is required");
      if (value.payload.choice !== "skip" && value.payload.choice !== "roll") {
        issues.push("payload.choice must be skip or roll");
      }
      if (value.payload.choice === "roll" && !isNonEmptyString(value.payload.targetPlayerId)) {
        issues.push("payload.targetPlayerId is required for roll");
      }
      if (value.payload.choice === "skip" && "targetPlayerId" in value.payload) {
        issues.push("payload.targetPlayerId is not allowed for skip");
      }
    } else if (value.kind === "ROLL_HERO_EFFECT") {
      if (!isNonEmptyString(value.payload.heroInstanceId)) {
        issues.push("payload.heroInstanceId is required");
      }
      if (!isNonEmptyString(value.payload.targetPlayerId)) {
        issues.push("payload.targetPlayerId is required");
      }
    }
    return issues.length === 0
      ? { ok: true, command: value as unknown as EffectSliceCommand, issues }
      : { ok: false, issues };
  }
  if (
    isRecord(value) &&
    (value.kind === "BEGIN_LEADER_SELECTION" ||
      value.kind === "SELECT_PARTY_LEADER" ||
      value.kind === "START_GAME" ||
      value.kind === "DRAW_CARD" ||
      value.kind === "REDRAW_HAND" ||
      value.kind === "END_TURN")
  ) {
    const issues: string[] = [];
    if (!isNonEmptyString(value.commandId)) issues.push("commandId is required");
    if (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) {
      issues.push("expectedRevision is required");
    }
    if (!isRecord(value.payload)) {
      issues.push("payload is required");
    } else if (
      value.kind === "SELECT_PARTY_LEADER" &&
      !isNonEmptyString(value.payload.leaderId)
    ) {
      issues.push("payload.leaderId is required");
    }
    return issues.length === 0
      ? { ok: true, command: value as unknown as SetupSliceCommand, issues }
      : { ok: false, issues };
  }
  const reaction = validateReactionCommand(value);
  return reaction.ok
    ? { ok: true, command: reaction.command as ReactionCommand, issues: [] }
    : { ok: false, issues: reaction.issues };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function commandFingerprint(command: ReactionCommand): string {
  return JSON.stringify(canonicalize({ kind: command.kind, payload: command.payload }));
}

function response(
  state: ReactionWindowState,
  code: ReactionCode,
  accepted = false,
): ReactionResponse {
  return { accepted, code, revision: state.revision, windowId: state.windowId };
}

function cloneWindow(state: ReactionWindowState): ReactionWindowState {
  return {
    ...state,
    eligiblePlayerIds: [...state.eligiblePlayerIds],
    completedPlayerIds: [...state.completedPlayerIds],
    modifiers: state.modifiers.map((entry) => ({ ...entry })),
    challenge: state.challenge
      ? {
          ...state.challenge,
          playedByDice: [...state.challenge.playedByDice] as [number, number],
          challengerDice: [...state.challenge.challengerDice] as [number, number],
        }
      : undefined,
  };
}

function closeWindow(
  state: ReactionWindowState,
  reason: ReactionCloseReason,
): ReactionWindowState {
  if (state.resolved) return state;
  return { ...state, resolved: true, closeReason: reason, revision: state.revision + 1 };
}

function completedByAll(state: ReactionWindowState): boolean {
  const completed = new Set(state.completedPlayerIds);
  return state.eligiblePlayerIds.every((playerId) => completed.has(playerId));
}

function ownsCard(hand: readonly ServerCard[], cardId: CardId, kind: CardKind): boolean {
  return hand.some((card) => card.cardId === cardId && card.kind === kind);
}

function rollUnbiasedDie(): number {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / 6) * 6;
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample);
  while (sample[0] >= limit);
  return (sample[0] % 6) + 1;
}

function defaultRollDice(): readonly [number, number] {
  return [rollUnbiasedDie(), rollUnbiasedDie()];
}

export function processReactionCommand(
  current: ReactionWindowState,
  command: ReactionCommand,
  context: ReactionContext,
  idempotency: IdempotencyStore,
): ReactionProcessResult {
  const key = `${context.roomId}\u0000${context.playerId}\u0000${command.commandId}`;
  const fingerprint = commandFingerprint(command);
  const stored = idempotency.get(key);
  if (stored) {
    if (stored.fingerprint !== fingerprint) {
      return { state: current, response: response(current, "IDEMPOTENCY_CONFLICT"), replayed: true };
    }
    return { state: current, response: stored.response, replayed: true };
  }

  let state = current;
  let result: ReactionResponse;
  const finish = (nextState: ReactionWindowState, nextResponse: ReactionResponse) => {
    idempotency.set(key, { fingerprint, response: nextResponse });
    return { state: nextState, response: nextResponse, replayed: false };
  };

  if (command.payload.windowId !== state.windowId) {
    return finish(state, response(state, "WINDOW_MISMATCH"));
  }
  if (state.resolved) return finish(state, response(state, "WINDOW_CLOSED"));
  if (context.nowMs >= state.deadlineAt) {
    state = closeWindow(state, "deadline");
    return finish(state, response(state, "WINDOW_CLOSED"));
  }
  if (!state.eligiblePlayerIds.includes(context.playerId)) {
    return finish(state, response(state, "NOT_ELIGIBLE"));
  }
  if (state.completedPlayerIds.includes(context.playerId)) {
    const usedModifier = state.modifiers.some((entry) => entry.playerId === context.playerId);
    return finish(
      state,
      response(state, usedModifier ? "MODIFIER_LIMIT_REACHED" : "ALREADY_COMPLETED"),
    );
  }

  if (command.kind === "SKIP_REACTION") {
    state = cloneWindow(state);
    state.completedPlayerIds.push(context.playerId);
    state.revision += 1;
    if (completedByAll(state)) state = closeWindow({ ...state, revision: state.revision - 1 }, "all_completed");
    return finish(state, response(state, "ACCEPTED", true));
  }

  if (command.kind === "PLAY_CHALLENGE") {
    if (state.kind !== "challenge") return finish(state, response(state, "INVALID_REACTION_KIND"));
    if (state.playedByPlayerId === context.playerId) {
      return finish(state, response(state, "SELF_CHALLENGE"));
    }
    if (!ownsCard(context.hand, command.payload.cardId, "challenge")) {
      return finish(state, response(state, "CARD_NOT_OWNED"));
    }
    const rollDice = context.rollDice ?? defaultRollDice;
    state = cloneWindow(state);
    state.challenge = {
      challengerId: context.playerId,
      cardId: command.payload.cardId,
      playedByDice: rollDice(),
      challengerDice: rollDice(),
    };
    state = closeWindow(state, "first_valid_challenge");
    return finish(state, response(state, "ACCEPTED", true));
  }

  if (state.kind !== "modifier") return finish(state, response(state, "INVALID_REACTION_KIND"));
  if (!ownsCard(context.hand, command.payload.cardId, "modifier")) {
    return finish(state, response(state, "CARD_NOT_OWNED"));
  }
  state = cloneWindow(state);
  state.modifiers.push({ playerId: context.playerId, cardId: command.payload.cardId });
  state.completedPlayerIds.push(context.playerId);
  state.revision += 1;
  if (completedByAll(state)) state = closeWindow({ ...state, revision: state.revision - 1 }, "all_completed");
  result = response(state, "ACCEPTED", true);
  return finish(state, result);
}

export function resolveReactionDeadline(
  state: ReactionWindowState,
  nowMs: number,
): ReactionWindowState {
  if (state.resolved || nowMs < state.deadlineAt) return state;
  return closeWindow(cloneWindow(state), "deadline");
}

export const BASE_SET_ID = "hts.base.v1";

export interface CapacityConfig {
  supportedSetIds: readonly string[];
  enabledSetIds: readonly string[];
}

export function deriveRoomCapacity(config: CapacityConfig): 6 | 8 {
  const supported = new Set(config.supportedSetIds);
  const hasEnabledSupportedExpansion = config.enabledSetIds.some(
    (setId) => setId !== BASE_SET_ID && supported.has(setId),
  );
  return hasEnabledSupportedExpansion ? 8 : 6;
}

export function validateStartCapacity(playerCount: number, config: CapacityConfig): boolean {
  return Number.isInteger(playerCount) && playerCount >= 2 && playerCount <= deriveRoomCapacity(config);
}

export function canJoinRoom(playerCount: number, config: CapacityConfig): boolean {
  return Number.isInteger(playerCount) && playerCount >= 0 && playerCount < deriveRoomCapacity(config);
}

export function canApplyCapacityConfig(
  playerCount: number,
  nextConfig: CapacityConfig,
): boolean {
  return playerCount <= deriveRoomCapacity(nextConfig);
}

export interface PrivatePlayerState {
  playerId: PlayerId;
  nickname: string;
  hand: ServerCard[];
  reconnectTokenHash: string;
}

export interface AuthoritativeRoomState {
  roomId: string;
  revision: number;
  players: PrivatePlayerState[];
  deckOrder: CardId[];
}

export interface PlayerRoomProjection {
  roomId: string;
  revision: number;
  players: Array<{ playerId: PlayerId; nickname: string; handCount: number }>;
  yourHand: Array<{ cardId: CardId; kind: CardKind }>;
}

export interface ReactionSliceSnapshot {
  mode: "reaction_demo";
  roomCode: string;
  revision: number;
  serverNow: number;
  hostPlayerId: PlayerId;
  you: { playerId: PlayerId; nickname: string; isHost: boolean };
  players: Array<{ playerId: PlayerId; nickname: string; handCount: number; isHost: boolean }>;
  yourHand: Array<{ cardId: CardId; kind: CardKind }>;
  discardCount: number;
  reaction: null | {
    windowId: WindowId;
    kind: "challenge" | "modifier";
    actorPlayerId: PlayerId | null;
    deadlineAt: number;
    resolved: boolean;
    closeReason?: ReactionCloseReason;
    completedPlayerIds: PlayerId[];
    pendingCount: number;
    youCompleted: boolean;
  };
  challengeRoll: ChallengeRoll | null;
  fixtureTotals: null | {
    baseTotal: number;
    modifiers: Array<{ playerId: PlayerId; cardId: CardId; delta: number }>;
    modifierTotal: number;
    finalTotal: number;
  };
  demo: true;
  demoLabel: "Reaction demo — fixture data";
}

export const REACTION_DEMO_LABEL = "Reaction demo — fixture data" as const;
export const SETUP_DEMO_LABEL = "Setup demo — synthetic fixture data" as const;
export const EFFECT_DEMO_LABEL = "Effect demo — synthetic two-card fixture data" as const;

export type SetupDemoPhase = "lobby" | "leader_selection" | "turn_active";

export interface SetupDemoSnapshot {
  mode: "setup_demo";
  roomCode: string;
  revision: number;
  serverNow: number;
  hostPlayerId: PlayerId;
  you: { playerId: PlayerId; nickname: string; isHost: boolean };
  players: Array<{
    playerId: PlayerId;
    nickname: string;
    joinIndex: number;
    handCount: number;
    leaderId: string | null;
    isHost: boolean;
  }>;
  yourHand: Array<{ cardId: CardId; kind: CardKind }>;
  setup: {
    phase: SetupDemoPhase;
    selectionPlayerId: PlayerId | null;
    leaderPool: string[];
    selectedLeaderIds: string[];
    turnOrder: PlayerId[];
    currentPlayerId: PlayerId | null;
    turnNumber: number;
    turnId: string | null;
    actionPoints: number | null;
    mainDeckCount: number;
    monsterDeckCount: number;
    faceUpMonsterIds: string[];
    discardCount: number;
  };
  demo: true;
  demoLabel: "Setup demo — synthetic fixture data";
}

export type EffectDemoPhase = "lobby" | "turn_active";
export type EffectPendingPhase =
  | "challenge"
  | "critical_boost_discard"
  | "dodgy_roll_choice"
  | "dodgy_modifier";

export interface EffectDemoSnapshot {
  mode: "effect_demo";
  roomCode: string;
  revision: number;
  serverNow: number;
  hostPlayerId: PlayerId;
  you: { playerId: PlayerId; nickname: string; isHost: boolean };
  players: Array<{
    playerId: PlayerId;
    nickname: string;
    handCount: number;
    party: Array<{ instanceId: CardId; fixtureDefinitionId: string }>;
    isHost: boolean;
  }>;
  yourHand: Array<{
    instanceId: CardId;
    fixtureDefinitionId: string;
    kind: CardKind;
    modifier?: {
      delta: number;
      rollTarget: "actor" | "challenger" | "hero";
    };
  }>;
  effect: {
    phase: EffectDemoPhase;
    currentPlayerId: PlayerId | null;
    turnNumber: number;
    turnId: string | null;
    actionPoints: number | null;
    mainDeckCount: number;
    discardCount: number;
    reactionSeconds: number;
  };
  reaction: ReactionSliceSnapshot["reaction"];
  challengeRoll: ChallengeRoll | null;
  pendingPlay: null | {
    attemptId: string;
    actorPlayerId: PlayerId;
    cardFixtureDefinitionId: string;
    phase: EffectPendingPhase;
    lockedTargetPlayerId: PlayerId | null;
    choiceDeadlineAt: number | null;
    youMustChoose: boolean;
  };
  heroRoll: null | {
    raw: readonly [number, number];
    finalTotal: number | null;
    threshold: 9;
  };
  yourHeroAllowance: Record<CardId, "available" | "used">;
  demo: true;
  demoLabel: "Effect demo — synthetic two-card fixture data";
}

export type RoomSliceSnapshot = ReactionSliceSnapshot | SetupDemoSnapshot | EffectDemoSnapshot;

export type {
  BaseCardKind,
  BaseCardView,
  BaseGameCommand,
  BaseGameCommandKind,
  BaseGamePhase,
  BaseGameSnapshot,
} from "./game/base";
import type { BaseGameSnapshot } from "./game/base";

/** Every snapshot shape a room can return: demo slices plus the real base game. */
export type RoomSnapshot = RoomSliceSnapshot | BaseGameSnapshot;

export function projectRoomForPlayer(
  state: AuthoritativeRoomState,
  viewerId: PlayerId,
): PlayerRoomProjection {
  const viewer = state.players.find((player) => player.playerId === viewerId);
  return {
    roomId: state.roomId,
    revision: state.revision,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      handCount: player.hand.length,
    })),
    yourHand: viewer ? viewer.hand.map(({ cardId, kind }) => ({ cardId, kind })) : [],
  };
}
