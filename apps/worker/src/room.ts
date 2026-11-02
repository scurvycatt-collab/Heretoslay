import {
  BASE_SET_ID,
  EFFECT_DEMO_LABEL,
  REACTION_DEMO_LABEL,
  SETUP_DEMO_LABEL,
  processReactionCommand,
  resolveReactionDeadline,
  validateRoomSliceCommand,
  type ChallengeRoll,
  type EffectDemoSnapshot,
  type EffectSliceCommand,
  type IdempotencyStore,
  type OpenReactionDemoCommand,
  type ReactionCommand,
  type ReactionSliceSnapshot,
  type ReactionWindowState,
  type ServerCard,
  type RoomCreateMode,
  type RoomSliceCommand,
  type RoomSnapshot,
  type SetupDemoSnapshot,
  type SetupSliceCommand,
  type StoredIdempotencyOutcome,
} from "@here-to-slay/protocol";
import {
  applyBaseCommand,
  initialBaseGameState,
  isBaseGameCommand,
  projectBaseGame,
  type BaseGameState,
  type BaseRoster,
} from "./game/base-game.ts";
import { applySetupCommand as applySharedSetupCommand } from "./game/setup-core.ts";

export interface DurableObjectTransactionLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  setAlarm(timestamp: number): Promise<void>;
}

export interface DurableObjectStorageLike extends DurableObjectTransactionLike {
  transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>): Promise<T>;
}

export interface DurableObjectContextLike {
  storage: DurableObjectStorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

export interface RoomRuntimeDependencies {
  now?: () => number;
  randomUUID?: () => string;
  rollDice?: () => readonly [number, number];
  sessionToken?: () => string;
  shuffle?: (cardIds: string[]) => string[];
}

interface FixtureCard extends ServerCard {
  fixtureDelta?: number;
  fixtureDefinitionId?: string;
  fixtureRollTarget?: "actor" | "challenger" | "hero";
}

interface PersistedPlayer {
  playerId: string;
  nickname: string;
  normalizedNickname: string;
  sessionTokenHash: string;
  hand: FixtureCard[];
  party: FixtureCard[];
  leaderId?: string | null;
}

interface RateBucket {
  startedAt: number;
  count: number;
}

interface CommandOutcome {
  accepted: boolean;
  code: string;
  replayed: boolean;
  commandId: string;
  revision: number;
}

interface OpenReceipt {
  fingerprint: string;
  outcome: CommandOutcome;
}

interface PersistedSetupState {
  phase: "lobby" | "leader_selection" | "turn_active";
  leaderPool: string[];
  selectionOrder: string[];
  selectionIndex: number;
  turnOrder: string[];
  currentPlayerIndex: number;
  turnNumber: number;
  turnId: string | null;
  actionPoints: number | null;
  mainDeck: FixtureCard[];
  monsterDeck: string[];
  faceUpMonsters: string[];
  paidHeroEffectAttempts: Record<string, string[]>;
}

type PendingEffectPhase =
  | "challenge"
  | "critical_boost_discard"
  | "dodgy_roll_choice"
  | "dodgy_modifier";

interface PendingEffectPlay {
  attemptId: string;
  actorPlayerId: string;
  cardInstanceId: string;
  cardKind: "magic" | "hero";
  phase: PendingEffectPhase;
  lockedTargetPlayerId: string | null;
  choiceDeadlineAt: number | null;
  reactionWindowId: string | null;
  heroRoll: { raw: readonly [number, number]; finalTotal: number | null; threshold: 9 } | null;
  source: "play" | "paid_hero_roll";
}

interface PersistedEffectState {
  phase: "lobby" | "turn_active";
  reactionWindowMs: number;
  turnOrder: string[];
  currentPlayerIndex: number;
  turnNumber: number;
  turnId: string | null;
  actionPoints: number | null;
  mainDeck: FixtureCard[];
  pendingCard: FixtureCard | null;
  pendingPlay: PendingEffectPlay | null;
  heroAllowanceUsed: Record<string, string[]>;
}

interface PersistedRoomState {
  schemaVersion: 2 | 3 | 4;
  roomCode: string;
  mode?: RoomCreateMode;
  revision: number;
  hostPlayerId: string;
  supportedSetIds: [typeof BASE_SET_ID];
  enabledSetIds: [typeof BASE_SET_ID];
  players: PersistedPlayer[];
  discard: FixtureCard[];
  reaction: ReactionWindowState | null;
  lastChallengeRoll: ChallengeRoll | null;
  fixtureBaseRoll: readonly [number, number] | null;
  idempotencyEntries: Array<[string, StoredIdempotencyOutcome]>;
  openReceipts: Record<string, OpenReceipt>;
  rateLimits: Record<string, RateBucket>;
  setup?: PersistedSetupState | null;
  effect?: PersistedEffectState | null;
  /** Real base game state (mode "base"); owned by ./game/base-game.ts. */
  game?: BaseGameState | null;
}

const ROOM_STATE_KEY = "room-state-v2";
const MAX_BODY_BYTES = 4_096;
const REACTION_WINDOW_MS = 20_000;
const MAX_PLAYERS = 6;
const RATE_WINDOW_MS = 60_000;
const SETUP_LEADERS = Array.from({ length: 6 }, (_, index) =>
  `fixture.setup.leader.${index + 1}`,
);

class ApiFault extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function apiError(fault: ApiFault): Response {
  return Response.json(
    { ok: false, error: { code: fault.code, message: fault.message } },
    { status: fault.status, headers: { "cache-control": "no-store" } },
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiFault("BODY_TOO_LARGE", "Request body exceeds 4 KiB", 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ApiFault("BODY_TOO_LARGE", "Request body exceeds 4 KiB", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiFault("INVALID_JSON", "Request body must be valid JSON", 400);
  }
}

function nicknameFrom(value: unknown): { nickname: string; normalized: string } {
  if (typeof value !== "object" || value === null || !("nickname" in value)) {
    throw new ApiFault("INVALID_NICKNAME", "nickname is required", 400);
  }
  const raw = (value as { nickname?: unknown }).nickname;
  if (typeof raw !== "string") {
    throw new ApiFault("INVALID_NICKNAME", "nickname must be text", 400);
  }
  const nickname = raw.normalize("NFKC").trim();
  if (
    nickname.length < 1 ||
    nickname.length > 24 ||
    /[\u0000-\u001f\u007f]/.test(nickname)
  ) {
    throw new ApiFault("INVALID_NICKNAME", "nickname must be 1-24 printable characters", 400);
  }
  return { nickname, normalized: nickname.toLocaleLowerCase("en-US") };
}

function createModeFrom(value: unknown): RoomCreateMode {
  if (typeof value !== "object" || value === null || !("mode" in value)) {
    return "reaction_demo";
  }
  const mode = (value as { mode?: unknown }).mode;
  if (
    mode !== "reaction_demo" &&
    mode !== "setup_demo" &&
    mode !== "effect_demo" &&
    mode !== "base"
  ) {
    throw new ApiFault(
      "INVALID_MODE",
      "mode must be base, reaction_demo, setup_demo, or effect_demo",
      400,
    );
  }
  return mode;
}

function assertSupportedCreateShape(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const mode = "mode" in value ? (value as { mode?: unknown }).mode : undefined;
  const allowed = new Set(["nickname", "mode"]);
  if (mode === "effect_demo") allowed.add("reactionSeconds");
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new ApiFault(
      "EXPANSION_UNSUPPORTED",
      "Create supports only nickname and mode; expansion/capacity config is unavailable",
      409,
    );
  }
}

function reactionSecondsFrom(value: unknown, mode: RoomCreateMode): number {
  if (typeof value !== "object" || value === null || !("reactionSeconds" in value)) return 20;
  if (mode !== "effect_demo") {
    throw new ApiFault("EXPANSION_UNSUPPORTED", "reactionSeconds is effect_demo-only", 409);
  }
  const seconds = (value as { reactionSeconds?: unknown }).reactionSeconds;
  if (!Number.isInteger(seconds) || Number(seconds) < 5 || Number(seconds) > 120) {
    throw new ApiFault("INVALID_CONFIG", "reactionSeconds must be an integer from 5 to 120", 400);
  }
  return Number(seconds);
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length <= 7) {
    throw new ApiFault("UNAUTHORIZED", "A valid Bearer session is required", 401);
  }
  return authorization.slice(7);
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function secureDie(): number {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / 6) * 6;
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample);
  while (sample[0] >= limit);
  return (sample[0] % 6) + 1;
}

function fixtureHand(playerId: string): FixtureCard[] {
  return [
    { cardId: `fixture.challenge.response.${playerId}`, kind: "challenge" },
    { cardId: `fixture.modifier.plus-one.a.${playerId}`, kind: "modifier", fixtureDelta: 1 },
    { cardId: `fixture.modifier.plus-one.b.${playerId}`, kind: "modifier", fixtureDelta: 1 },
  ];
}

function initialSetupState(): PersistedSetupState {
  return {
    phase: "lobby",
    leaderPool: [...SETUP_LEADERS],
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
    paidHeroEffectAttempts: {},
  };
}

function initialEffectState(reactionSeconds: number): PersistedEffectState {
  return {
    phase: "lobby",
    reactionWindowMs: reactionSeconds * 1_000,
    turnOrder: [],
    currentPlayerIndex: 0,
    turnNumber: 0,
    turnId: null,
    actionPoints: null,
    mainDeck: [],
    pendingCard: null,
    pendingPlay: null,
    heroAllowanceUsed: {},
  };
}

function roomMode(state: PersistedRoomState): RoomCreateMode {
  return state.mode ?? "reaction_demo";
}

function normalizeState(state: PersistedRoomState): PersistedRoomState {
  if (!state.mode) state.mode = "reaction_demo";
  if (state.setup === undefined) state.setup = null;
  if (state.effect === undefined) state.effect = null;
  if (state.game === undefined) state.game = null;
  for (const player of state.players) {
    if (player.leaderId === undefined) player.leaderId = null;
    if (player.party === undefined) player.party = [];
  }
  state.schemaVersion = 4;
  return state;
}

function enforceRate(
  state: PersistedRoomState,
  key: string,
  limit: number,
  now: number,
): void {
  const bucket = state.rateLimits[key];
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    state.rateLimits[key] = { startedAt: now, count: 1 };
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new ApiFault("RATE_LIMITED", "Too many requests", 429);
}

function requireState(state: PersistedRoomState | undefined): PersistedRoomState {
  if (!state) throw new ApiFault("ROOM_NOT_FOUND", "Room does not exist", 404);
  return normalizeState(state);
}

function sessionPlayer(state: PersistedRoomState, tokenHash: string): PersistedPlayer {
  const player = state.players.find((candidate) => candidate.sessionTokenHash === tokenHash);
  if (!player) throw new ApiFault("UNAUTHORIZED", "Session is not valid for this room", 401);
  return player;
}

function reactionState(
  kind: "challenge" | "modifier",
  state: PersistedRoomState,
  actorPlayerId: string,
  windowId: string,
  now: number,
  windowMs = REACTION_WINDOW_MS,
): ReactionWindowState {
  return {
    windowId,
    kind,
    revision: state.revision + 1,
    openedAt: now,
    deadlineAt: now + windowMs,
    eligiblePlayerIds: state.players.map((player) => player.playerId),
    completedPlayerIds: [],
    playedByPlayerId: actorPlayerId,
    modifiers: [],
    resolved: false,
  };
}

function fixtureTotals(state: PersistedRoomState) {
  if (!state.fixtureBaseRoll) return null;
  const baseTotal = state.fixtureBaseRoll[0] + state.fixtureBaseRoll[1];
  const modifiers = (state.reaction?.modifiers ?? []).map((entry) => ({
    playerId: entry.playerId,
    cardId: entry.cardId,
    delta: state.discard.find((card) => card.cardId === entry.cardId)?.fixtureDelta ?? 0,
  }));
  const modifierTotal = modifiers.reduce((sum, entry) => sum + entry.delta, 0);
  return { baseTotal, modifiers, modifierTotal, finalTotal: baseTotal + modifierTotal };
}

function reactionSnapshot(
  state: PersistedRoomState,
  viewer: PersistedPlayer,
  now: number,
): ReactionSliceSnapshot {
  const reaction = state.reaction;
  const completed = new Set(reaction?.completedPlayerIds ?? []);
  return {
    mode: "reaction_demo",
    roomCode: state.roomCode,
    revision: state.revision,
    serverNow: now,
    hostPlayerId: state.hostPlayerId,
    you: {
      playerId: viewer.playerId,
      nickname: viewer.nickname,
      isHost: viewer.playerId === state.hostPlayerId,
    },
    players: state.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      handCount: player.hand.length,
      isHost: player.playerId === state.hostPlayerId,
    })),
    yourHand: viewer.hand.map(({ cardId, kind }) => ({ cardId, kind })),
    discardCount: state.discard.length,
    reaction: reaction
      ? {
          windowId: reaction.windowId,
          kind: reaction.kind,
          actorPlayerId: reaction.playedByPlayerId ?? null,
          deadlineAt: reaction.deadlineAt,
          resolved: reaction.resolved,
          closeReason: reaction.closeReason,
          completedPlayerIds: [...reaction.completedPlayerIds],
          pendingCount: reaction.eligiblePlayerIds.filter((id) => !completed.has(id)).length,
          youCompleted: completed.has(viewer.playerId),
        }
      : null,
    challengeRoll: state.lastChallengeRoll,
    fixtureTotals: fixtureTotals(state),
    demo: true,
    demoLabel: REACTION_DEMO_LABEL,
  };
}

function setupSnapshot(
  state: PersistedRoomState,
  viewer: PersistedPlayer,
  now: number,
): SetupDemoSnapshot {
  const setup = state.setup ?? initialSetupState();
  return {
    mode: "setup_demo",
    roomCode: state.roomCode,
    revision: state.revision,
    serverNow: now,
    hostPlayerId: state.hostPlayerId,
    you: {
      playerId: viewer.playerId,
      nickname: viewer.nickname,
      isHost: viewer.playerId === state.hostPlayerId,
    },
    players: state.players.map((player, joinIndex) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      joinIndex,
      handCount: player.hand.length,
      leaderId: player.leaderId ?? null,
      isHost: player.playerId === state.hostPlayerId,
    })),
    yourHand: viewer.hand.map(({ cardId, kind }) => ({ cardId, kind })),
    setup: {
      phase: setup.phase,
      selectionPlayerId:
        setup.phase === "leader_selection"
          ? setup.selectionOrder[setup.selectionIndex] ?? null
          : null,
      leaderPool: [...setup.leaderPool],
      selectedLeaderIds: state.players
        .map((player) => player.leaderId)
        .filter((leaderId): leaderId is string => typeof leaderId === "string"),
      turnOrder: [...setup.turnOrder],
      currentPlayerId:
        setup.phase === "turn_active"
          ? setup.turnOrder[setup.currentPlayerIndex] ?? null
          : null,
      turnNumber: setup.turnNumber,
      turnId: setup.turnId,
      actionPoints: setup.actionPoints,
      mainDeckCount: setup.mainDeck.length,
      monsterDeckCount: setup.monsterDeck.length,
      faceUpMonsterIds: [...setup.faceUpMonsters],
      discardCount: state.discard.length,
    },
    demo: true,
    demoLabel: SETUP_DEMO_LABEL,
  };
}

function effectReactionSnapshot(state: PersistedRoomState, viewer: PersistedPlayer) {
  const reaction = state.reaction;
  if (!reaction) return null;
  const completed = new Set(reaction.completedPlayerIds);
  return {
    windowId: reaction.windowId,
    kind: reaction.kind,
    actorPlayerId: reaction.playedByPlayerId ?? null,
    deadlineAt: reaction.deadlineAt,
    resolved: reaction.resolved,
    closeReason: reaction.closeReason,
    completedPlayerIds: [...reaction.completedPlayerIds],
    pendingCount: reaction.eligiblePlayerIds.filter((id) => !completed.has(id)).length,
    youCompleted: completed.has(viewer.playerId),
  };
}

function effectSnapshot(
  state: PersistedRoomState,
  viewer: PersistedPlayer,
  now: number,
): EffectDemoSnapshot {
  const effect = state.effect ?? initialEffectState(20);
  const pending = effect.pendingPlay;
  const actor = pending
    ? state.players.find((player) => player.playerId === pending.actorPlayerId)
    : undefined;
  const pendingDefinition =
    effect.pendingCard?.fixtureDefinitionId ??
    actor?.party.find((card) => card.cardId === pending?.cardInstanceId)?.fixtureDefinitionId ??
    "fixture.effect.unknown";
  const used = new Set(effect.turnId ? effect.heroAllowanceUsed[effect.turnId] ?? [] : []);
  return {
    mode: "effect_demo",
    roomCode: state.roomCode,
    revision: state.revision,
    serverNow: now,
    hostPlayerId: state.hostPlayerId,
    you: {
      playerId: viewer.playerId,
      nickname: viewer.nickname,
      isHost: viewer.playerId === state.hostPlayerId,
    },
    players: state.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      handCount: player.hand.length,
      party: player.party.map((card) => ({
        instanceId: card.cardId,
        fixtureDefinitionId: card.fixtureDefinitionId ?? "fixture.effect.unknown",
      })),
      isHost: player.playerId === state.hostPlayerId,
    })),
    yourHand: viewer.hand.map((card) => ({
      instanceId: card.cardId,
      fixtureDefinitionId: card.fixtureDefinitionId ?? "fixture.effect.unknown",
      kind: card.kind,
      ...(card.kind === "modifier" &&
      typeof card.fixtureDelta === "number" &&
      card.fixtureRollTarget
        ? {
            modifier: {
              delta: card.fixtureDelta,
              rollTarget: card.fixtureRollTarget,
            },
          }
        : {}),
    })),
    effect: {
      phase: effect.phase,
      currentPlayerId:
        effect.phase === "turn_active"
          ? effect.turnOrder[effect.currentPlayerIndex] ?? null
          : null,
      turnNumber: effect.turnNumber,
      turnId: effect.turnId,
      actionPoints: effect.actionPoints,
      mainDeckCount: effect.mainDeck.length,
      discardCount: state.discard.length,
      reactionSeconds: effect.reactionWindowMs / 1_000,
    },
    reaction: effectReactionSnapshot(state, viewer),
    challengeRoll: state.lastChallengeRoll,
    pendingPlay: pending
      ? {
          attemptId: pending.attemptId,
          actorPlayerId: pending.actorPlayerId,
          cardFixtureDefinitionId: pendingDefinition,
          phase: pending.phase,
          lockedTargetPlayerId: pending.lockedTargetPlayerId,
          choiceDeadlineAt: pending.choiceDeadlineAt,
          youMustChoose:
            pending.actorPlayerId === viewer.playerId &&
            (pending.phase === "critical_boost_discard" || pending.phase === "dodgy_roll_choice"),
        }
      : null,
    heroRoll: pending?.heroRoll ?? null,
    yourHeroAllowance: Object.fromEntries(
      viewer.party
        .filter((card) => card.fixtureDefinitionId === DODGY_DEALER_FIXTURE)
        .map((card) => [card.cardId, used.has(card.cardId) ? "used" : "available"]),
    ),
    demo: true,
    demoLabel: EFFECT_DEMO_LABEL,
  };
}

function baseRoster(state: PersistedRoomState): BaseRoster {
  return {
    hostPlayerId: state.hostPlayerId,
    players: state.players.map(({ playerId, nickname }) => ({ playerId, nickname })),
  };
}

function snapshot(
  state: PersistedRoomState,
  viewer: PersistedPlayer,
  now: number,
): RoomSnapshot {
  if (roomMode(state) === "base") {
    return projectBaseGame(
      state.game ?? initialBaseGameState(),
      baseRoster(state),
      { roomCode: state.roomCode, revision: state.revision, serverNow: now },
      viewer.playerId,
    );
  }
  return roomMode(state) === "setup_demo"
    ? setupSnapshot(state, viewer, now)
    : roomMode(state) === "effect_demo"
      ? effectSnapshot(state, viewer, now)
      : reactionSnapshot(state, viewer, now);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalValue(record[key])]),
  );
}

function commandFingerprint(command: RoomSliceCommand): string {
  return JSON.stringify(canonicalValue({ kind: command.kind, payload: command.payload }));
}

function isEffectCommand(command: unknown): command is EffectSliceCommand {
  if (typeof command !== "object" || command === null || !("kind" in command)) return false;
  const kind = (command as { kind?: unknown }).kind;
  return (
    kind === "START_EFFECT_DEMO" ||
    kind === "PLAY_CARD" ||
    kind === "CHOOSE_CRITICAL_BOOST_DISCARD" ||
    kind === "CHOOSE_DODGY_DEALER_IMMEDIATE" ||
    kind === "ROLL_HERO_EFFECT" ||
    kind === "END_TURN"
  );
}

function isSetupCommand(command: unknown): command is SetupSliceCommand {
  if (typeof command !== "object" || command === null || !("kind" in command)) return false;
  const kind = (command as { kind?: unknown }).kind;
  return (
    kind === "BEGIN_LEADER_SELECTION" ||
    kind === "SELECT_PARTY_LEADER" ||
    kind === "START_GAME" ||
    kind === "DRAW_CARD" ||
    kind === "REDRAW_HAND" ||
    kind === "END_TURN"
  );
}

function fixtureMainDeck(): FixtureCard[] {
  return Array.from({ length: 115 }, (_, index) => ({
    cardId: `fixture.setup.main.${String(index + 1).padStart(3, "0")}`,
    kind: "other" as const,
  }));
}

function fixtureMonsterDeck(): string[] {
  return Array.from(
    { length: 15 },
    (_, index) => `fixture.setup.monster.${String(index + 1).padStart(2, "0")}`,
  );
}

const CRITICAL_BOOST_FIXTURE = "fixture.effect.magic.critical-boost";
const DODGY_DEALER_FIXTURE = "fixture.effect.hero.dodgy-dealer";

function effectFixture(
  instanceId: string,
  fixtureDefinitionId: string,
  kind: FixtureCard["kind"],
  options: Pick<FixtureCard, "fixtureDelta" | "fixtureRollTarget"> = {},
): FixtureCard {
  return { cardId: instanceId, fixtureDefinitionId, kind, ...options };
}

function seedEffectFixtures(state: PersistedRoomState): void {
  const effect = state.effect!;
  for (const player of state.players) {
    player.hand = [];
    player.party = [];
  }
  const host = state.players.find((player) => player.playerId === state.hostPlayerId)!;
  host.hand.push(
    effectFixture(`fixture.effect.instance.${host.playerId}.critical`, CRITICAL_BOOST_FIXTURE, "magic"),
    effectFixture(`fixture.effect.instance.${host.playerId}.dodgy`, DODGY_DEALER_FIXTURE, "hero"),
    effectFixture(
      `fixture.effect.instance.${host.playerId}.modifier-actor`,
      "fixture.effect.modifier.actor-plus-one",
      "modifier",
      { fixtureDelta: 1, fixtureRollTarget: "actor" },
    ),
    effectFixture(
      `fixture.effect.instance.${host.playerId}.modifier-hero`,
      "fixture.effect.modifier.hero-plus-one",
      "modifier",
      { fixtureDelta: 1, fixtureRollTarget: "hero" },
    ),
  );
  for (const player of state.players.filter((candidate) => candidate !== host)) {
    player.hand.push(
      effectFixture(
        `fixture.effect.instance.${player.playerId}.challenge`,
        "fixture.effect.challenge",
        "challenge",
      ),
      effectFixture(
        `fixture.effect.instance.${player.playerId}.modifier-challenger`,
        "fixture.effect.modifier.challenger-plus-one",
        "modifier",
        { fixtureDelta: 1, fixtureRollTarget: "challenger" },
      ),
      effectFixture(
        `fixture.effect.instance.${player.playerId}.modifier-hero`,
        "fixture.effect.modifier.hero-plus-one",
        "modifier",
        { fixtureDelta: 1, fixtureRollTarget: "hero" },
      ),
    );
  }
  effect.mainDeck = Array.from({ length: 24 }, (_, index) =>
    effectFixture(
      `fixture.effect.instance.draw.${String(index + 1).padStart(2, "0")}`,
      `fixture.effect.inert.${String(index + 1).padStart(2, "0")}`,
      "inert",
    ),
  );
  state.discard = [];
}

function consumeCard(
  player: PersistedPlayer,
  discard: FixtureCard[],
  cardId: string,
): void {
  const index = player.hand.findIndex((card) => card.cardId === cardId);
  if (index < 0) return;
  const [card] = player.hand.splice(index, 1);
  discard.push(card);
}

function nextEffectDeadline(state: PersistedRoomState): number | null {
  const reactionDeadline = state.reaction && !state.reaction.resolved
    ? state.reaction.deadlineAt
    : null;
  const choiceDeadline = state.effect?.pendingPlay?.choiceDeadlineAt ?? null;
  if (reactionDeadline === null) return choiceDeadline;
  if (choiceDeadline === null) return reactionDeadline;
  return Math.min(reactionDeadline, choiceDeadline);
}

export class RoomDurableObject {
  readonly ctx: DurableObjectContextLike;
  readonly ready: Promise<void>;
  readonly now: () => number;
  readonly randomUUID: () => string;
  readonly rollDice: () => readonly [number, number];
  readonly makeSessionToken: () => string;
  readonly shuffle: (cardIds: string[]) => string[];

  constructor(ctx: DurableObjectContextLike, dependencies: RoomRuntimeDependencies = {}) {
    this.ctx = ctx;
    this.now = dependencies.now ?? Date.now;
    this.randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());
    this.rollDice = dependencies.rollDice ?? (() => {
      return [secureDie(), secureDie()] as const;
    });
    this.makeSessionToken = dependencies.sessionToken ?? secureToken;
    this.shuffle = dependencies.shuffle ?? ((cardIds) => {
      const shuffled = [...cardIds];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const sample = new Uint32Array(1);
        const range = 0x1_0000_0000;
        const limit = Math.floor(range / (index + 1)) * (index + 1);
        do crypto.getRandomValues(sample);
        while (sample[0] >= limit);
        const swapIndex = sample[0] % (index + 1);
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      return shuffled;
    });
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.ctx.storage.get<PersistedRoomState>(ROOM_STATE_KEY);
      if (!state) return;
      normalizeState(state);
      const deadline = nextEffectDeadline(state);
      if (deadline !== null) await this.ctx.storage.setAlarm(deadline);
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    try {
      const url = new URL(request.url);
      const roomCode = request.headers.get("x-room-code")?.toUpperCase();
      if (!roomCode) throw new ApiFault("ROOM_NOT_FOUND", "Room code is required", 404);

      if (
        request.method === "POST" &&
        request.headers.get("x-internal-operation") === "CREATE_ROOM"
      ) {
        return await this.createRoom(request, roomCode);
      }
      if (request.method === "POST" && url.pathname.endsWith("/join")) {
        return await this.joinRoom(request, roomCode);
      }
      if (request.method === "GET" && url.pathname.endsWith("/snapshot")) {
        return await this.getSnapshot(request, roomCode);
      }
      if (request.method === "POST" && url.pathname.endsWith("/commands")) {
        return await this.handleCommand(request, roomCode);
      }
      if (request.method === "GET" && url.pathname.startsWith("/rooms/")) {
        const state = requireState(await this.ctx.storage.get<PersistedRoomState>(ROOM_STATE_KEY));
        return Response.json({
          roomCode: state.roomCode,
          revision: state.revision,
          maxPlayers: MAX_PLAYERS,
          enabledSetIds: state.enabledSetIds,
          scaffold: false,
        });
      }
      throw new ApiFault("NOT_FOUND", "Route not found", 404);
    } catch (error) {
      return apiError(
        error instanceof ApiFault
          ? error
          : new ApiFault("INTERNAL_ERROR", "Unexpected room error", 500),
      );
    }
  }

  async createRoom(request: Request, roomCode: string): Promise<Response> {
    const createBody = await readJsonBody(request);
    assertSupportedCreateShape(createBody);
    const { nickname, normalized } = nicknameFrom(createBody);
    const mode = createModeFrom(createBody);
    const reactionSeconds = reactionSecondsFrom(createBody, mode);
    const sessionToken = this.makeSessionToken();
    const tokenHash = await hashToken(sessionToken);
    const playerId = this.randomUUID();
    const now = this.now();
    const state = await this.ctx.storage.transaction(async (txn) => {
      const existing = await txn.get<PersistedRoomState>(ROOM_STATE_KEY);
      if (existing) throw new ApiFault("ROOM_CODE_TAKEN", "Generated room code is in use", 409);
      const player: PersistedPlayer = {
        playerId,
        nickname,
        normalizedNickname: normalized,
        sessionTokenHash: tokenHash,
        hand: mode === "reaction_demo" ? fixtureHand(playerId) : [],
        party: [],
        leaderId: null,
      };
      const created: PersistedRoomState = {
        schemaVersion: 4,
        roomCode,
        mode,
        revision: 1,
        hostPlayerId: playerId,
        supportedSetIds: [BASE_SET_ID],
        enabledSetIds: [BASE_SET_ID],
        players: [player],
        discard: [],
        reaction: null,
        lastChallengeRoll: null,
        fixtureBaseRoll: null,
        idempotencyEntries: [],
        openReceipts: {},
        rateLimits: {},
        setup: mode === "setup_demo" ? initialSetupState() : null,
        effect: mode === "effect_demo" ? initialEffectState(reactionSeconds) : null,
        game: mode === "base" ? initialBaseGameState() : null,
      };
      await txn.put(ROOM_STATE_KEY, created);
      return created;
    });
    return Response.json(
      { roomCode, sessionToken, snapshot: snapshot(state, state.players[0], now) },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  }

  async joinRoom(request: Request, roomCode: string): Promise<Response> {
    const { nickname, normalized } = nicknameFrom(await readJsonBody(request));
    const sessionToken = this.makeSessionToken();
    const tokenHash = await hashToken(sessionToken);
    const playerId = this.randomUUID();
    const now = this.now();
    const result = await this.ctx.storage.transaction(async (txn) => {
      const state = requireState(await txn.get<PersistedRoomState>(ROOM_STATE_KEY));
      if (state.roomCode !== roomCode) throw new ApiFault("ROOM_NOT_FOUND", "Room does not exist", 404);
      enforceRate(state, "join", 30, now);
      if (roomMode(state) === "setup_demo" && state.setup?.phase !== "lobby") {
        throw new ApiFault("SETUP_LOCKED", "Join is locked after selection begins", 409);
      }
      if (roomMode(state) === "base" && state.game?.phase !== "lobby") {
        throw new ApiFault("SETUP_LOCKED", "Join is locked after leader selection begins", 409);
      }
      if (roomMode(state) === "effect_demo" && state.effect?.phase !== "lobby") {
        throw new ApiFault("SETUP_LOCKED", "Join is locked after the effect demo starts", 409);
      }
      if (state.reaction && !state.reaction.resolved) {
        throw new ApiFault("REACTION_ACTIVE", "Join after the reaction closes", 409);
      }
      if (state.players.length >= MAX_PLAYERS) {
        throw new ApiFault("ROOM_FULL", "Base room supports at most 6 players", 409);
      }
      if (state.players.some((player) => player.normalizedNickname === normalized)) {
        throw new ApiFault("NICKNAME_TAKEN", "Nickname is already used in this room", 409);
      }
      const player: PersistedPlayer = {
        playerId,
        nickname,
        normalizedNickname: normalized,
        sessionTokenHash: tokenHash,
        hand: roomMode(state) === "reaction_demo" ? fixtureHand(playerId) : [],
        party: [],
        leaderId: null,
      };
      state.players.push(player);
      state.revision += 1;
      await txn.put(ROOM_STATE_KEY, state);
      return { state, player };
    });
    return Response.json(
      { roomCode, sessionToken, snapshot: snapshot(result.state, result.player, now) },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  }

  async getSnapshot(request: Request, roomCode: string): Promise<Response> {
    const tokenHash = await hashToken(bearerToken(request));
    const now = this.now();
    const result = await this.ctx.storage.transaction(async (txn) => {
      const state = requireState(await txn.get<PersistedRoomState>(ROOM_STATE_KEY));
      if (state.roomCode !== roomCode) throw new ApiFault("ROOM_NOT_FOUND", "Room does not exist", 404);
      const player = sessionPlayer(state, tokenHash);
      // 180/min allows six independent clients polling once per second with headroom.
      enforceRate(state, `snapshot:${tokenHash}`, 180, now);
      if (roomMode(state) === "effect_demo") {
        await this.settleExpiredEffect(state, now, txn);
      }
      await txn.put(ROOM_STATE_KEY, state);
      return { state, player };
    });
    return Response.json(
      { snapshot: snapshot(result.state, result.player, now) },
      { headers: { "cache-control": "no-store" } },
    );
  }

  async handleCommand(request: Request, roomCode: string): Promise<Response> {
    const parsed = await readJsonBody(request);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "kind" in parsed &&
      (parsed as { kind?: unknown }).kind === "ENABLE_EXPANSION"
    ) {
      throw new ApiFault(
        "EXPANSION_UNSUPPORTED",
        "No expansion is implemented in this base-only slice",
        409,
      );
    }
    const validation = validateRoomSliceCommand(parsed);
    if (!validation.ok || !validation.command) {
      throw new ApiFault("INVALID_COMMAND", validation.issues.join("; "), 400);
    }
    const command = validation.command;
    const tokenHash = await hashToken(bearerToken(request));
    const now = this.now();
    const nextWindowId = this.randomUUID();
    const result = await this.ctx.storage.transaction(async (txn) => {
      const state = requireState(await txn.get<PersistedRoomState>(ROOM_STATE_KEY));
      if (state.roomCode !== roomCode) throw new ApiFault("ROOM_NOT_FOUND", "Room does not exist", 404);
      const player = sessionPlayer(state, tokenHash);
      enforceRate(state, `command:${tokenHash}`, 120, now);

      const expiredEffectChoice =
        roomMode(state) === "effect_demo" &&
        isEffectCommand(command) &&
        (command.kind === "CHOOSE_CRITICAL_BOOST_DISCARD" ||
          command.kind === "CHOOSE_DODGY_DEALER_IMMEDIATE") &&
        state.effect?.pendingPlay?.choiceDeadlineAt !== null &&
        state.effect?.pendingPlay?.choiceDeadlineAt !== undefined &&
        now >= state.effect.pendingPlay.choiceDeadlineAt;
      if (roomMode(state) === "effect_demo") {
        await this.settleExpiredEffect(state, now, txn);
      }

      if (
        roomMode(state) === "base" ||
        command.kind === "OPEN_REACTION_DEMO" ||
        isSetupCommand(command) ||
        isEffectCommand(command)
      ) {
        const receiptKey = `${player.playerId}\u0000${command.commandId}`;
        const fingerprint = commandFingerprint(command);
        const receipt = state.openReceipts[receiptKey];
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) {
            const outcome: CommandOutcome = {
              accepted: false,
              code: "IDEMPOTENCY_CONFLICT",
              replayed: true,
              commandId: command.commandId,
              revision: state.revision,
            };
            await txn.put(ROOM_STATE_KEY, state);
            return { state, player, outcome };
          }
          await txn.put(ROOM_STATE_KEY, state);
          return { state, player, outcome: { ...receipt.outcome, replayed: true } };
        }
        let outcome: CommandOutcome;
        if (roomMode(state) === "base") {
          outcome = this.applyBaseGameCommand(state, player, command);
        } else if (command.kind === "OPEN_REACTION_DEMO") {
          outcome =
            roomMode(state) === "reaction_demo"
              ? await this.openReactionDemo(
                  state,
                  player,
                  command,
                  nextWindowId,
                  now,
                  txn,
                )
              : this.commandOutcome(state, command.commandId, "MODE_MISMATCH");
        } else if (roomMode(state) === "setup_demo" && isSetupCommand(command)) {
          outcome = this.applySetupCommand(state, player, command);
        } else if (roomMode(state) === "effect_demo" && isEffectCommand(command)) {
          outcome = expiredEffectChoice
            ? this.commandOutcome(state, command.commandId, "CHOICE_CLOSED")
            : await this.applyEffectCommand(state, player, command, nextWindowId, now, txn);
        } else {
          outcome = this.commandOutcome(state, command.commandId, "MODE_MISMATCH");
        }
        state.openReceipts[receiptKey] = { fingerprint, outcome };
        await txn.put(ROOM_STATE_KEY, state);
        return { state, player, outcome };
      }

      if (roomMode(state) !== "reaction_demo" && roomMode(state) !== "effect_demo") {
        const outcome = this.commandOutcome(state, command.commandId, "MODE_MISMATCH");
        await txn.put(ROOM_STATE_KEY, state);
        return { state, player, outcome };
      }

      const outcome = await this.applyReactionCommand(
        state,
        player,
        command,
        nextWindowId,
        now,
        txn,
      );
      await txn.put(ROOM_STATE_KEY, state);
      return { state, player, outcome };
    });
    return Response.json(
      { outcome: result.outcome, snapshot: snapshot(result.state, result.player, now) },
      { headers: { "cache-control": "no-store" } },
    );
  }

  commandOutcome(
    state: PersistedRoomState,
    commandId: string,
    code: string,
    accepted = false,
    replayed = false,
  ): CommandOutcome {
    return { accepted, code, replayed, commandId, revision: state.revision };
  }

  applySetupCommand(
    state: PersistedRoomState,
    player: PersistedPlayer,
    command: SetupSliceCommand,
  ): CommandOutcome {
    const setup = state.setup;
    if (!setup) return this.commandOutcome(state, command.commandId, "MODE_MISMATCH");
    if (command.expectedRevision !== state.revision) {
      return this.commandOutcome(state, command.commandId, "STALE_REVISION");
    }
    const code = applySharedSetupCommand(
      {
        table: setup,
        seats: state.players,
        pile: state,
        actor: player,
        isHost: player.playerId === state.hostPlayerId,
        newTurnId: this.randomUUID,
        shuffle: this.shuffle,
        decks: () => ({ main: fixtureMainDeck(), monsters: fixtureMonsterDeck() }),
        onTurnStart: (turnId) => {
          setup.paidHeroEffectAttempts[turnId] = [];
        },
      },
      command,
    );
    if (code !== "ACCEPTED") return this.commandOutcome(state, command.commandId, code);
    state.revision += 1;
    return this.commandOutcome(state, command.commandId, "ACCEPTED", true);
  }

  /** Mode "base": DO keeps revision/idempotency; game rules live in ./game/base-game.ts. */
  applyBaseGameCommand(
    state: PersistedRoomState,
    player: PersistedPlayer,
    command: RoomSliceCommand,
  ): CommandOutcome {
    const game = (state.game ??= initialBaseGameState());
    if (!isBaseGameCommand(command)) {
      return this.commandOutcome(state, command.commandId, "MODE_MISMATCH");
    }
    if (command.expectedRevision !== state.revision) {
      return this.commandOutcome(state, command.commandId, "STALE_REVISION");
    }
    const code = applyBaseCommand(game, baseRoster(state), player.playerId, command, {
      newId: this.randomUUID,
      shuffle: this.shuffle,
    });
    if (code !== "ACCEPTED") return this.commandOutcome(state, command.commandId, code);
    state.revision += 1;
    return this.commandOutcome(state, command.commandId, "ACCEPTED", true);
  }

  effectOutcome(state: PersistedRoomState, commandId: string, code: string, accepted = false) {
    return this.commandOutcome(state, commandId, code, accepted);
  }

  advanceEffectTurn(effect: PersistedEffectState): void {
    effect.currentPlayerIndex = (effect.currentPlayerIndex + 1) % effect.turnOrder.length;
    effect.turnNumber += 1;
    effect.turnId = this.randomUUID();
    effect.actionPoints = 3;
    effect.heroAllowanceUsed[effect.turnId] = [];
  }

  finishEffectAttempt(state: PersistedRoomState): void {
    const effect = state.effect!;
    effect.pendingPlay = null;
    effect.pendingCard = null;
    state.reaction = null;
    state.lastChallengeRoll = null;
    state.fixtureBaseRoll = null;
    if (effect.actionPoints === 0) this.advanceEffectTurn(effect);
    state.revision += 1;
  }

  drawEffectCards(state: PersistedRoomState, count: number): FixtureCard[] {
    const effect = state.effect!;
    const drawn: FixtureCard[] = [];
    while (drawn.length < count) {
      if (effect.mainDeck.length === 0) {
        if (state.discard.length === 0) break;
        const byId = new Map(state.discard.map((card) => [card.cardId, card]));
        effect.mainDeck = this.shuffle([...byId.keys()]).map((id) => byId.get(id)!);
        state.discard = [];
      }
      const card = effect.mainDeck.shift();
      if (!card) break;
      drawn.push(card);
    }
    return drawn;
  }

  async openEffectReaction(
    state: PersistedRoomState,
    kind: "challenge" | "modifier",
    actorPlayerId: string,
    windowId: string,
    now: number,
    txn: DurableObjectTransactionLike,
  ): Promise<void> {
    const effect = state.effect!;
    state.reaction = reactionState(kind, state, actorPlayerId, windowId, now, effect.reactionWindowMs);
    state.revision = state.reaction.revision;
    await txn.setAlarm(state.reaction.deadlineAt);
  }

  async continueEffectCard(
    state: PersistedRoomState,
    now: number,
    txn: DurableObjectTransactionLike,
  ): Promise<void> {
    const effect = state.effect!;
    const pending = effect.pendingPlay!;
    const actor = state.players.find((player) => player.playerId === pending.actorPlayerId)!;
    state.reaction = null;
    state.lastChallengeRoll = null;
    state.fixtureBaseRoll = null;
    if (pending.cardKind === "magic") {
      actor.hand.push(...this.drawEffectCards(state, 3));
      pending.phase = "critical_boost_discard";
      if (actor.hand.length === 0) {
        if (effect.pendingCard) state.discard.push(effect.pendingCard);
        this.finishEffectAttempt(state);
        return;
      }
    } else {
      if (effect.pendingCard) actor.party.push(effect.pendingCard);
      effect.pendingCard = null;
      pending.phase = "dodgy_roll_choice";
    }
    pending.choiceDeadlineAt = now + effect.reactionWindowMs;
    state.revision += 1;
    await txn.setAlarm(pending.choiceDeadlineAt);
  }

  modifierTotalFor(state: PersistedRoomState, target: FixtureCard["fixtureRollTarget"]): number {
    return (state.reaction?.modifiers ?? []).reduce((total, entry) => {
      const card = state.discard.find((candidate) => candidate.cardId === entry.cardId);
      return total + (card && card.fixtureRollTarget === target ? card.fixtureDelta ?? 0 : 0);
    }, 0);
  }

  async settleEffectReaction(
    state: PersistedRoomState,
    now: number,
    txn: DurableObjectTransactionLike,
  ): Promise<void> {
    const effect = state.effect;
    const pending = effect?.pendingPlay;
    if (!effect || !pending || !state.reaction?.resolved) return;

    if (pending.phase === "challenge") {
      const challenge = state.lastChallengeRoll;
      if (!challenge) {
        await this.continueEffectCard(state, now, txn);
        return;
      }
      const actorTotal = challenge.playedByDice[0] + challenge.playedByDice[1] +
        this.modifierTotalFor(state, "actor");
      const challengerTotal = challenge.challengerDice[0] + challenge.challengerDice[1] +
        this.modifierTotalFor(state, "challenger");
      if (challengerTotal >= actorTotal) {
        if (effect.pendingCard) state.discard.push(effect.pendingCard);
        this.finishEffectAttempt(state);
      } else {
        await this.continueEffectCard(state, now, txn);
      }
      return;
    }

    if (pending.phase === "dodgy_modifier") {
      const raw = pending.heroRoll?.raw ?? [1, 1];
      const finalTotal = raw[0] + raw[1] + this.modifierTotalFor(state, "hero");
      pending.heroRoll = { raw, finalTotal, threshold: 9 };
      if (finalTotal >= 9) {
        const actor = state.players.find((player) => player.playerId === pending.actorPlayerId);
        const target = state.players.find((player) => player.playerId === pending.lockedTargetPlayerId);
        if (actor && target) [actor.hand, target.hand] = [target.hand, actor.hand];
      }
      this.finishEffectAttempt(state);
    }
  }

  async startDodgyRoll(
    state: PersistedRoomState,
    pending: PendingEffectPlay,
    targetPlayerId: string,
    windowId: string,
    now: number,
    txn: DurableObjectTransactionLike,
  ): Promise<void> {
    const effect = state.effect!;
    const used = effect.heroAllowanceUsed[effect.turnId!] ??= [];
    if (!used.includes(pending.cardInstanceId)) used.push(pending.cardInstanceId);
    pending.lockedTargetPlayerId = targetPlayerId;
    pending.choiceDeadlineAt = null;
    pending.phase = "dodgy_modifier";
    const raw = this.rollDice();
    pending.heroRoll = { raw, finalTotal: null, threshold: 9 };
    state.fixtureBaseRoll = raw;
    await this.openEffectReaction(state, "modifier", pending.actorPlayerId, windowId, now, txn);
  }

  async applyEffectCommand(
    state: PersistedRoomState,
    player: PersistedPlayer,
    command: EffectSliceCommand,
    windowId: string,
    now: number,
    txn: DurableObjectTransactionLike,
  ): Promise<CommandOutcome> {
    const effect = state.effect;
    if (!effect) return this.effectOutcome(state, command.commandId, "MODE_MISMATCH");
    if (command.expectedRevision !== state.revision) {
      return this.effectOutcome(state, command.commandId, "STALE_REVISION");
    }

    if (command.kind === "START_EFFECT_DEMO") {
      if (player.playerId !== state.hostPlayerId) {
        return this.effectOutcome(state, command.commandId, "FORBIDDEN");
      }
      if (effect.phase !== "lobby") return this.effectOutcome(state, command.commandId, "INVALID_PHASE");
      if (state.players.length < 2 || state.players.length > MAX_PLAYERS) {
        return this.effectOutcome(state, command.commandId, "NOT_ENOUGH_PLAYERS");
      }
      seedEffectFixtures(state);
      effect.phase = "turn_active";
      effect.turnOrder = state.players.map((candidate) => candidate.playerId);
      effect.currentPlayerIndex = 0;
      effect.turnNumber = 1;
      effect.turnId = this.randomUUID();
      effect.actionPoints = 3;
      effect.heroAllowanceUsed = { [effect.turnId]: [] };
      state.revision += 1;
      return this.effectOutcome(state, command.commandId, "ACCEPTED", true);
    }

    if (effect.phase !== "turn_active") {
      return this.effectOutcome(state, command.commandId, "INVALID_PHASE");
    }
    if (effect.turnOrder[effect.currentPlayerIndex] !== player.playerId) {
      return this.effectOutcome(state, command.commandId, "NOT_YOUR_TURN");
    }

    if (command.kind === "END_TURN") {
      if (effect.pendingPlay || (state.reaction && !state.reaction.resolved)) {
        return this.effectOutcome(state, command.commandId, "PENDING_ACTION_ACTIVE");
      }
      this.advanceEffectTurn(effect);
      state.revision += 1;
      return this.effectOutcome(state, command.commandId, "ACCEPTED", true);
    }

    if (command.kind === "PLAY_CARD") {
      if (effect.pendingPlay) return this.effectOutcome(state, command.commandId, "PENDING_ACTION_ACTIVE");
      if ((effect.actionPoints ?? 0) < 1) {
        return this.effectOutcome(state, command.commandId, "INSUFFICIENT_AP");
      }
      const cardIndex = player.hand.findIndex((card) => card.cardId === command.payload.cardInstanceId);
      if (cardIndex < 0) return this.effectOutcome(state, command.commandId, "CARD_NOT_OWNED");
      const card = player.hand[cardIndex]!;
      if (card.fixtureDefinitionId !== CRITICAL_BOOST_FIXTURE && card.fixtureDefinitionId !== DODGY_DEALER_FIXTURE) {
        return this.effectOutcome(state, command.commandId, "UNSUPPORTED_CARD");
      }
      player.hand.splice(cardIndex, 1);
      effect.pendingCard = card;
      effect.actionPoints = (effect.actionPoints ?? 0) - 1;
      effect.pendingPlay = {
        attemptId: this.randomUUID(),
        actorPlayerId: player.playerId,
        cardInstanceId: card.cardId,
        cardKind: card.fixtureDefinitionId === CRITICAL_BOOST_FIXTURE ? "magic" : "hero",
        phase: "challenge",
        lockedTargetPlayerId: null,
        choiceDeadlineAt: null,
        reactionWindowId: windowId,
        heroRoll: null,
        source: "play",
      };
      state.lastChallengeRoll = null;
      state.fixtureBaseRoll = null;
      await this.openEffectReaction(state, "challenge", player.playerId, windowId, now, txn);
      return this.effectOutcome(state, command.commandId, "ACCEPTED", true);
    }

    const pending = effect.pendingPlay;
    if (command.kind === "CHOOSE_CRITICAL_BOOST_DISCARD") {
      if (!pending || pending.phase !== "critical_boost_discard") {
        return this.effectOutcome(state, command.commandId, "CHOICE_NOT_ALLOWED");
      }
      if (pending.actorPlayerId !== player.playerId || pending.attemptId !== command.payload.attemptId) {
        return this.effectOutcome(state, command.commandId, "ATTEMPT_MISMATCH");
      }
      const index = player.hand.findIndex((card) => card.cardId === command.payload.cardInstanceId);
      if (index < 0) return this.effectOutcome(state, command.commandId, "CARD_NOT_OWNED");
      state.discard.push(player.hand.splice(index, 1)[0]);
      if (effect.pendingCard) state.discard.push(effect.pendingCard);
      this.finishEffectAttempt(state);
      return this.effectOutcome(state, command.commandId, "ACCEPTED", true);
    }

    if (command.kind === "CHOOSE_DODGY_DEALER_IMMEDIATE") {
      if (!pending || pending.phase !== "dodgy_roll_choice") {
        return this.effectOutcome(state, command.commandId, "CHOICE_NOT_ALLOWED");
      }
      if (pending.actorPlayerId !== player.playerId || pending.attemptId !== command.payload.attemptId) {
        return this.effectOutcome(state, command.commandId, "ATTEMPT_MISMATCH");
      }
      if (command.payload.choice === "skip") {
        this.finishEffectAttempt(state);
        return this.effectOutcome(state, command.commandId, "ACCEPTED", true);
      }
      const targetPlayerId = command.payload.targetPlayerId;
      if (
        targetPlayerId === player.playerId ||
        !state.players.some((candidate) => candidate.playerId === targetPlayerId)
      ) {
        return this.effectOutcome(state, command.commandId, "INVALID_TARGET");
      }
      await this.startDodgyRoll(state, pending, targetPlayerId, windowId, now, txn);
      return this.effectOutcome(state, command.commandId, "ACCEPTED", true);
    }

    if (command.kind === "ROLL_HERO_EFFECT") {
      if (effect.pendingPlay) return this.effectOutcome(state, command.commandId, "PENDING_ACTION_ACTIVE");
      const hero = player.party.find(
        (card) => card.cardId === command.payload.heroInstanceId && card.fixtureDefinitionId === DODGY_DEALER_FIXTURE,
      );
      if (!hero) return this.effectOutcome(state, command.commandId, "HERO_NOT_IN_PARTY");
      const used = effect.heroAllowanceUsed[effect.turnId!] ?? [];
      if (used.includes(hero.cardId)) {
        return this.effectOutcome(state, command.commandId, "HERO_EFFECT_ALREADY_USED");
      }
      if ((effect.actionPoints ?? 0) < 1) {
        return this.effectOutcome(state, command.commandId, "INSUFFICIENT_AP");
      }
      if (
        command.payload.targetPlayerId === player.playerId ||
        !state.players.some((candidate) => candidate.playerId === command.payload.targetPlayerId)
      ) {
        return this.effectOutcome(state, command.commandId, "INVALID_TARGET");
      }
      effect.actionPoints = (effect.actionPoints ?? 0) - 1;
      effect.pendingPlay = {
        attemptId: this.randomUUID(),
        actorPlayerId: player.playerId,
        cardInstanceId: hero.cardId,
        cardKind: "hero",
        phase: "dodgy_modifier",
        lockedTargetPlayerId: command.payload.targetPlayerId,
        choiceDeadlineAt: null,
        reactionWindowId: windowId,
        heroRoll: null,
        source: "paid_hero_roll",
      };
      await this.startDodgyRoll(
        state,
        effect.pendingPlay,
        command.payload.targetPlayerId,
        windowId,
        now,
        txn,
      );
      return this.effectOutcome(state, command.commandId, "ACCEPTED", true);
    }

    throw new ApiFault("INVALID_COMMAND", "Unsupported effect command", 400);
  }

  async settleExpiredEffect(
    state: PersistedRoomState,
    now: number,
    txn: DurableObjectTransactionLike,
  ): Promise<void> {
    const effect = state.effect;
    const pending = effect?.pendingPlay;
    if (!effect || !pending) return;
    if (state.reaction && !state.reaction.resolved && now >= state.reaction.deadlineAt) {
      state.reaction = resolveReactionDeadline(state.reaction, now);
      state.revision = state.reaction.revision;
      await this.settleEffectReaction(state, now, txn);
      return;
    }
    if (pending.choiceDeadlineAt !== null && now >= pending.choiceDeadlineAt) {
      const actor = state.players.find((candidate) => candidate.playerId === pending.actorPlayerId);
      if (pending.phase === "critical_boost_discard") {
        const fallback = actor?.hand.shift();
        if (fallback) state.discard.push(fallback);
        if (effect.pendingCard) state.discard.push(effect.pendingCard);
      }
      this.finishEffectAttempt(state);
    }
    const deadline = nextEffectDeadline(state);
    if (deadline !== null) await txn.setAlarm(deadline);
  }

  async openReactionDemo(
    state: PersistedRoomState,
    player: PersistedPlayer,
    command: OpenReactionDemoCommand,
    windowId: string,
    now: number,
    txn: DurableObjectTransactionLike,
  ): Promise<CommandOutcome> {
    if (player.playerId !== state.hostPlayerId) {
      return {
        accepted: false,
        code: "FORBIDDEN",
        replayed: false,
        commandId: command.commandId,
        revision: state.revision,
      };
    }
    if (command.expectedRevision !== state.revision) {
      return {
        accepted: false,
        code: "STALE_REVISION",
        replayed: false,
        commandId: command.commandId,
        revision: state.revision,
      };
    }
    if (state.reaction && !state.reaction.resolved) {
      return {
        accepted: false,
        code: "WINDOW_ACTIVE",
        replayed: false,
        commandId: command.commandId,
        revision: state.revision,
      };
    }
    if (command.payload.reactionKind === "challenge" && state.players.length < 2) {
      return {
        accepted: false,
        code: "NOT_ENOUGH_PLAYERS",
        replayed: false,
        commandId: command.commandId,
        revision: state.revision,
      };
    }
    state.reaction = reactionState(
      command.payload.reactionKind,
      state,
      player.playerId,
      windowId,
      now,
    );
    state.revision = state.reaction.revision;
    state.lastChallengeRoll = null;
    state.fixtureBaseRoll =
      command.payload.reactionKind === "modifier" ? this.rollDice() : null;
    await txn.setAlarm(state.reaction.deadlineAt);
    return {
      accepted: true,
      code: "ACCEPTED",
      replayed: false,
      commandId: command.commandId,
      revision: state.revision,
    };
  }

  async applyReactionCommand(
    state: PersistedRoomState,
    player: PersistedPlayer,
    command: ReactionCommand,
    nextWindowId: string,
    now: number,
    txn: DurableObjectTransactionLike,
  ): Promise<CommandOutcome> {
    if (!state.reaction) {
      return {
        accepted: false,
        code: "WINDOW_CLOSED",
        replayed: false,
        commandId: command.commandId,
        revision: state.revision,
      };
    }
    const idempotency: IdempotencyStore = new Map(state.idempotencyEntries);
    const processed = processReactionCommand(
      state.reaction,
      command,
      {
        roomId: state.roomCode,
        playerId: player.playerId,
        nowMs: now,
        hand: player.hand,
        rollDice: this.rollDice,
      },
      idempotency,
    );
    state.reaction = processed.state;
    state.revision = processed.state.revision;
    state.idempotencyEntries = Array.from(idempotency.entries()).slice(-256);

    if (processed.response.accepted && !processed.replayed && command.kind !== "SKIP_REACTION") {
      consumeCard(player, state.discard, command.payload.cardId);
    }

    if (
      command.kind === "PLAY_CHALLENGE" &&
      processed.response.accepted &&
      !processed.replayed
    ) {
      state.lastChallengeRoll = processed.state.challenge ?? null;
      state.fixtureBaseRoll = processed.state.challenge?.playedByDice ?? null;
      const reactionActor = roomMode(state) === "effect_demo"
        ? state.effect?.pendingPlay?.actorPlayerId ?? player.playerId
        : player.playerId;
      const windowMs = roomMode(state) === "effect_demo"
        ? state.effect?.reactionWindowMs ?? REACTION_WINDOW_MS
        : REACTION_WINDOW_MS;
      state.reaction = reactionState("modifier", state, reactionActor, nextWindowId, now, windowMs);
      state.revision = state.reaction.revision;
      await txn.setAlarm(state.reaction.deadlineAt);
    } else if (roomMode(state) === "effect_demo" && state.reaction.resolved) {
      await this.settleEffectReaction(state, now, txn);
    }

    return {
      accepted: processed.response.accepted,
      code: processed.response.code,
      replayed: processed.replayed,
      commandId: command.commandId,
      revision: roomMode(state) === "effect_demo" ? state.revision : processed.response.revision,
    };
  }

  async alarm(): Promise<void> {
    await this.ready;
    const now = this.now();
    await this.ctx.storage.transaction(async (txn) => {
      const stored = await txn.get<PersistedRoomState>(ROOM_STATE_KEY);
      if (!stored) return;
      const state = normalizeState(stored);
      if (roomMode(state) === "effect_demo") {
        await this.settleExpiredEffect(state, now, txn);
        await txn.put(ROOM_STATE_KEY, state);
        return;
      }
      if (!state.reaction || state.reaction.resolved) return;
      if (now < state.reaction.deadlineAt) {
        await txn.setAlarm(state.reaction.deadlineAt);
        return;
      }
      const resolved = resolveReactionDeadline(state.reaction, now);
      if (resolved === state.reaction) return;
      state.reaction = resolved;
      state.revision = resolved.revision;
      await txn.put(ROOM_STATE_KEY, state);
    });
  }
}
