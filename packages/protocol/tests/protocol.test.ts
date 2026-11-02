import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_SET_ID,
  canApplyCapacityConfig,
  deriveRoomCapacity,
  processReactionCommand,
  projectRoomForPlayer,
  validateClientCommand,
  validateReactionCommand,
  validateRoomSliceCommand,
  validateStartCapacity,
  type IdempotencyStore,
  type ReactionCommand,
  type ReactionWindowState,
  type ServerCard,
} from "../src/index.ts";

const deadlineAt = 20_000;

function window(
  kind: "challenge" | "modifier",
  eligiblePlayerIds = ["p1", "p2"],
): ReactionWindowState {
  return {
    windowId: `window-${kind}`,
    kind,
    revision: 7,
    openedAt: 0,
    deadlineAt,
    eligiblePlayerIds,
    completedPlayerIds: [],
    playedByPlayerId: kind === "challenge" ? "p1" : undefined,
    modifiers: [],
    resolved: false,
  };
}

function command(
  kind: ReactionCommand["kind"],
  commandId: string,
  windowId: string,
  cardId?: string,
): ReactionCommand {
  const payload = cardId ? { windowId, cardId } : { windowId };
  return { kind, commandId, expectedRevision: 7, payload } as ReactionCommand;
}

function apply(
  state: ReactionWindowState,
  nextCommand: ReactionCommand,
  playerId: string,
  hand: ServerCard[],
  store: IdempotencyStore = new Map(),
  nowMs = 1_000,
) {
  return processReactionCommand(
    state,
    nextCommand,
    {
      roomId: "room-a",
      playerId,
      nowMs,
      hand,
      rollDice: (() => {
        const rolls: Array<readonly [number, number]> = [
          [2, 3],
          [4, 5],
        ];
        return () => rolls.shift() ?? [1, 1];
      })(),
    },
    store,
  );
}

test("privacy projection exposes only the viewer hand and hand counts", () => {
  const projection = projectRoomForPlayer(
    {
      roomId: "room-a",
      revision: 3,
      players: [
        {
          playerId: "p1",
          nickname: "One",
          hand: [{ cardId: "visible-card", kind: "modifier" }],
          reconnectTokenHash: "secret-hash-one",
        },
        {
          playerId: "p2",
          nickname: "Two",
          hand: [{ cardId: "hidden-card", kind: "challenge" }],
          reconnectTokenHash: "secret-hash-two",
        },
      ],
      deckOrder: ["future-draw"],
    },
    "p1",
  );
  const json = JSON.stringify(projection);
  assert.deepEqual(projection.yourHand.map((card) => card.cardId), ["visible-card"]);
  assert.equal(projection.players[1].handCount, 1);
  assert.doesNotMatch(json, /hidden-card|future-draw|secret-hash/);
});

test("players without reaction cards can Skip", () => {
  const result = apply(
    window("challenge"),
    command("SKIP_REACTION", "skip-1", "window-challenge"),
    "p1",
    [],
  );
  assert.equal(result.response.code, "ACCEPTED");
  assert.deepEqual(result.state.completedPlayerIds, ["p1"]);
  assert.equal(result.state.resolved, false);
});

test("self Challenge and Challenge without an owned card are rejected", () => {
  const initial = window("challenge");
  const self = apply(
    initial,
    command("PLAY_CHALLENGE", "challenge-self", initial.windowId, "challenge-a"),
    "p1",
    [{ cardId: "challenge-a", kind: "challenge" }],
  );
  assert.equal(self.response.code, "SELF_CHALLENGE");
  assert.equal(self.state.revision, initial.revision);

  const missing = apply(
    initial,
    command("PLAY_CHALLENGE", "challenge-missing", initial.windowId, "challenge-a"),
    "p2",
    [],
  );
  assert.equal(missing.response.code, "CARD_NOT_OWNED");
  assert.equal(missing.state.resolved, false);
});

test("first valid Challenge closes once and dice are server supplied", () => {
  const initial = window("challenge", ["p1", "p2", "p3"]);
  const first = apply(
    initial,
    command("PLAY_CHALLENGE", "challenge-first", initial.windowId, "challenge-a"),
    "p2",
    [{ cardId: "challenge-a", kind: "challenge" }],
  );
  assert.equal(first.state.closeReason, "first_valid_challenge");
  assert.deepEqual(first.state.challenge?.playedByDice, [2, 3]);
  assert.deepEqual(first.state.challenge?.challengerDice, [4, 5]);

  const second = apply(
    first.state,
    command("PLAY_CHALLENGE", "challenge-second", initial.windowId, "challenge-b"),
    "p3",
    [{ cardId: "challenge-b", kind: "challenge" }],
  );
  assert.equal(second.response.code, "WINDOW_CLOSED");
  assert.equal(second.state.revision, first.state.revision);
});

test("idempotency replays an old outcome and rejects a changed payload", () => {
  const store: IdempotencyStore = new Map();
  const initial = window("challenge");
  const skip = command("SKIP_REACTION", "same-id", initial.windowId);
  const first = apply(initial, skip, "p2", [], store);
  const replay = apply(first.state, skip, "p2", [], store);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.response, first.response);

  const conflict = apply(
    replay.state,
    command("SKIP_REACTION", "same-id", "another-window"),
    "p2",
    [],
    store,
  );
  assert.equal(conflict.response.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(conflict.state.revision, first.state.revision);
});

test("same-revision concurrent Modifiers from different players both apply", () => {
  const store: IdempotencyStore = new Map();
  const initial = window("modifier");
  const first = apply(
    initial,
    command("PLAY_MODIFIER", "modifier-p1", initial.windowId, "modifier-a"),
    "p1",
    [{ cardId: "modifier-a", kind: "modifier" }],
    store,
  );
  const second = apply(
    first.state,
    command("PLAY_MODIFIER", "modifier-p2", initial.windowId, "modifier-b"),
    "p2",
    [{ cardId: "modifier-b", kind: "modifier" }],
    store,
  );
  assert.equal(first.response.accepted, true);
  assert.equal(second.response.accepted, true);
  assert.deepEqual(second.state.modifiers.map((item) => item.playerId), ["p1", "p2"]);
  assert.equal(second.state.closeReason, "all_completed");
});

test("a second Modifier is rejected without changing state or consuming a card", () => {
  const initial = window("modifier", ["p1", "p2", "p3"]);
  const hand = [
    { cardId: "modifier-a", kind: "modifier" as const },
    { cardId: "modifier-b", kind: "modifier" as const },
  ];
  const first = apply(
    initial,
    command("PLAY_MODIFIER", "modifier-first", initial.windowId, "modifier-a"),
    "p1",
    hand,
  );
  const second = apply(
    first.state,
    command("PLAY_MODIFIER", "modifier-second", initial.windowId, "modifier-b"),
    "p1",
    hand,
  );
  assert.equal(second.response.code, "MODIFIER_LIMIT_REACHED");
  assert.deepEqual(second.state.modifiers, first.state.modifiers);
  assert.equal(hand.length, 2);
});

test("deadline closes exactly once while a disconnected player remains incomplete", () => {
  const initial = window("modifier", ["p1", "p2"]);
  const first = apply(
    initial,
    command("SKIP_REACTION", "skip-p1", initial.windowId),
    "p1",
    [],
  );
  assert.equal(first.state.resolved, false);
  const timedOut = apply(
    first.state,
    command("SKIP_REACTION", "late-p2", initial.windowId),
    "p2",
    [],
    new Map(),
    deadlineAt,
  );
  assert.equal(timedOut.response.code, "WINDOW_CLOSED");
  assert.equal(timedOut.state.closeReason, "deadline");
  const after = apply(
    timedOut.state,
    command("SKIP_REACTION", "later-p2", initial.windowId),
    "p2",
    [],
    new Map(),
    deadlineAt + 1,
  );
  assert.equal(after.state.revision, timedOut.state.revision);
});

test("base capacity remains six until a supported expansion is enabled", () => {
  const baseOnly = { supportedSetIds: [BASE_SET_ID], enabledSetIds: [BASE_SET_ID] };
  assert.equal(deriveRoomCapacity(baseOnly), 6);
  assert.equal(validateStartCapacity(7, baseOnly), false);
  assert.equal(
    deriveRoomCapacity({
      supportedSetIds: [BASE_SET_ID, "hts.expansion.demo.v1"],
      enabledSetIds: [BASE_SET_ID, "hts.expansion.demo.v1"],
    }),
    8,
  );
  assert.equal(
    canApplyCapacityConfig(7, { supportedSetIds: [BASE_SET_ID], enabledSetIds: [BASE_SET_ID] }),
    false,
  );
});

test("validation requires commandId, windowId and cardId when applicable", () => {
  assert.equal(validateReactionCommand({ kind: "SKIP_REACTION", payload: {} }).ok, false);
  assert.equal(
    validateReactionCommand({
      commandId: "valid",
      kind: "PLAY_MODIFIER",
      payload: { windowId: "window" },
    }).ok,
    false,
  );
  assert.equal(
    validateClientCommand({
      commandId: "play-1",
      kind: "PLAY_CARD",
      payload: { cardId: "demo-only" },
    }).ok,
    false,
  );
  assert.equal(
    validateClientCommand({
      commandId: "play-1",
      expectedRevision: 4,
      kind: "PLAY_CARD",
      payload: { cardId: "demo-only" },
    }).ok,
    true,
  );
  assert.equal(
    validateRoomSliceCommand({
      commandId: "select",
      expectedRevision: 2,
      kind: "SELECT_PARTY_LEADER",
      payload: {},
    }).ok,
    false,
  );
  assert.equal(
    validateRoomSliceCommand({
      commandId: "select",
      expectedRevision: 2,
      kind: "SELECT_PARTY_LEADER",
      payload: { leaderId: "fixture.setup.leader.1" },
    }).ok,
    true,
  );
});

test("effect-demo commands validate exact revisions and discriminated choice payloads", () => {
  assert.equal(
    validateRoomSliceCommand({
      commandId: "effect-end",
      expectedRevision: 9,
      kind: "END_TURN",
      payload: {},
    }).ok,
    true,
  );
  assert.equal(
    validateRoomSliceCommand({
      commandId: "start-effect",
      expectedRevision: 1,
      kind: "START_EFFECT_DEMO",
      payload: {},
    }).ok,
    true,
  );
  assert.equal(
    validateRoomSliceCommand({
      commandId: "play-effect",
      expectedRevision: 2,
      kind: "PLAY_CARD",
      payload: { cardInstanceId: "fixture.effect.instance.1" },
    }).ok,
    true,
  );
  assert.equal(
    validateRoomSliceCommand({
      commandId: "roll",
      expectedRevision: 3,
      kind: "CHOOSE_DODGY_DEALER_IMMEDIATE",
      payload: { attemptId: "attempt", choice: "roll" },
    }).ok,
    false,
  );
  assert.equal(
    validateRoomSliceCommand({
      commandId: "skip",
      expectedRevision: 3,
      kind: "CHOOSE_DODGY_DEALER_IMMEDIATE",
      payload: { attemptId: "attempt", choice: "skip", targetPlayerId: "p2" },
    }).ok,
    false,
  );
});
