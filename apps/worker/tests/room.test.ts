import assert from "node:assert/strict";
import test from "node:test";

import {
  ROOM_IDLE_MS,
  RoomDurableObject,
  type DurableObjectContextLike,
  type DurableObjectStorageLike,
  type DurableObjectTransactionLike,
} from "../src/room.ts";

class MemoryStorage implements DurableObjectStorageLike, DurableObjectTransactionLike {
  readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async setAlarm(timestamp: number): Promise<void> {
    this.alarmAt = timestamp;
  }

  async transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function context(storage: MemoryStorage): DurableObjectContextLike {
  return {
    storage,
    blockConcurrencyWhile: async <T>(callback: () => Promise<T>) => callback(),
  };
}

function harness() {
  const storage = new MemoryStorage();
  let now = 1_000;
  let id = 0;
  let token = 0;
  const rolls: Array<readonly [number, number]> = [
    [2, 3],
    [4, 5],
    [3, 4],
    [1, 6],
  ];
  const room = new RoomDurableObject(context(storage), {
    now: () => now,
    randomUUID: () => `id-${++id}`,
    sessionToken: () => `session-${++token}`,
    rollDice: () => rolls.shift() ?? [1, 1],
    shuffle: (items) => [...items],
  });
  return {
    room,
    storage,
    setNow(value: number) {
      now = value;
    },
  };
}

async function body(response: Response) {
  return (await response.json()) as any;
}

function roomRequest(
  path: string,
  method: "GET" | "POST",
  options: { token?: string; body?: unknown; internalCreate?: boolean } = {},
) {
  const headers = new Headers({ "x-room-code": "ABC234" });
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.internalCreate) headers.set("x-internal-operation", "CREATE_ROOM");
  return new Request(`https://room.test${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function create(
  room: RoomDurableObject,
  nickname = "Host",
  mode?: "reaction_demo" | "setup_demo",
) {
  const response = await room.fetch(
    roomRequest("/api/rooms/ABC234", "POST", {
      body: mode ? { nickname, mode } : { nickname },
      internalCreate: true,
    }),
  );
  assert.equal(response.status, 201);
  return body(response);
}

async function join(room: RoomDurableObject, nickname: string) {
  const response = await room.fetch(
    roomRequest("/api/rooms/ABC234/join", "POST", { body: { nickname } }),
  );
  return { response, json: await body(response) };
}

async function snapshot(room: RoomDurableObject, token: string) {
  const response = await room.fetch(
    roomRequest("/api/rooms/ABC234/snapshot", "GET", { token }),
  );
  return { response, json: await body(response) };
}

async function send(
  room: RoomDurableObject,
  token: string,
  command: Record<string, unknown>,
) {
  const response = await room.fetch(
    roomRequest("/api/rooms/ABC234/commands", "POST", { token, body: command }),
  );
  return { response, json: await body(response) };
}

function setupCardTotal(state: any): number {
  return (
    state.players.reduce((total: number, player: any) => total + player.hand.length, 0) +
    state.setup.mainDeck.length +
    state.discard.length
  );
}

test("create/join sessions isolate hands, reject duplicate nickname, and reload without a seat", async () => {
  const { room } = harness();
  const host = await create(room);
  const guest = await join(room, "Guest");
  assert.equal(guest.response.status, 201);

  const duplicate = await join(room, "  guest  ");
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.json.error.code, "NICKNAME_TAKEN");

  const hostView = await snapshot(room, host.sessionToken);
  const guestView = await snapshot(room, guest.json.sessionToken);
  assert.equal(hostView.response.status, 200);
  assert.equal(guestView.response.status, 200);
  assert.equal(hostView.json.snapshot.players.length, 2);
  assert.equal(hostView.json.snapshot.you.playerId, host.snapshot.you.playerId);
  assert.notDeepEqual(hostView.json.snapshot.yourHand, guestView.json.snapshot.yourHand);
  for (const card of guestView.json.snapshot.yourHand) {
    assert.doesNotMatch(JSON.stringify(hostView.json), new RegExp(card.cardId));
  }
  assert.doesNotMatch(JSON.stringify(hostView.json), /session-|TokenHash|deckOrder/);

  const reload = await snapshot(room, host.sessionToken);
  assert.equal(reload.json.snapshot.players.length, 2);
  assert.equal(reload.json.snapshot.you.playerId, host.snapshot.you.playerId);

  const unauthorized = await snapshot(room, "wrong-session");
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.json.error.code, "UNAUTHORIZED");
});

test("base room caps at six and duplicate/capacity failures do not create seats", async () => {
  const { room } = harness();
  const host = await create(room);
  for (const nickname of ["P2", "P3", "P4", "P5", "P6"]) {
    const result = await join(room, nickname);
    assert.equal(result.response.status, 201);
  }
  const seventh = await join(room, "P7");
  assert.equal(seventh.response.status, 409);
  assert.equal(seventh.json.error.code, "ROOM_FULL");
  const view = await snapshot(room, host.sessionToken);
  assert.equal(view.json.snapshot.players.length, 6);

  const expansion = await send(room, host.sessionToken, {
    commandId: "expansion",
    expectedRevision: view.json.snapshot.revision,
    kind: "ENABLE_EXPANSION",
    payload: { setId: "fixture.expansion" },
  });
  assert.equal(expansion.response.status, 409);
  assert.equal(expansion.json.error.code, "EXPANSION_UNSUPPORTED");
});

test("same-revision Modifiers consume once, retry safely, and all-completed closes early", async () => {
  const { room } = harness();
  const host = await create(room);
  const p2 = await join(room, "P2");
  const p3 = await join(room, "P3");
  const before = await snapshot(room, host.sessionToken);
  const opened = await send(room, host.sessionToken, {
    commandId: "open-modifier",
    expectedRevision: before.json.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "modifier" },
  });
  assert.equal(opened.json.outcome.accepted, true);
  const windowId = opened.json.snapshot.reaction.windowId;
  const globalRevision = opened.json.snapshot.revision;

  const p2View = await snapshot(room, p2.json.sessionToken);
  const p3View = await snapshot(room, p3.json.sessionToken);
  const p2Cards = p2View.json.snapshot.yourHand.filter((card: any) => card.kind === "modifier");
  const p3Card = p3View.json.snapshot.yourHand.find((card: any) => card.kind === "modifier");
  const p2Command = {
    commandId: "p2-modifier",
    expectedRevision: globalRevision,
    kind: "PLAY_MODIFIER",
    payload: { windowId, cardId: p2Cards[0].cardId },
  };
  const first = await send(room, p2.json.sessionToken, p2Command);
  const second = await send(room, p3.json.sessionToken, {
    commandId: "p3-modifier",
    expectedRevision: globalRevision,
    kind: "PLAY_MODIFIER",
    payload: { windowId, cardId: p3Card.cardId },
  });
  assert.equal(first.json.outcome.accepted, true);
  assert.equal(second.json.outcome.accepted, true);
  assert.equal(second.json.snapshot.discardCount, 2);

  const retry = await send(room, p2.json.sessionToken, p2Command);
  assert.equal(retry.json.outcome.replayed, true);
  assert.equal(retry.json.snapshot.discardCount, 2);

  const conflict = await send(room, p2.json.sessionToken, {
    ...p2Command,
    payload: { windowId, cardId: p2Cards[1].cardId },
  });
  assert.equal(conflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(conflict.json.snapshot.discardCount, 2);

  const secondModifier = await send(room, p2.json.sessionToken, {
    commandId: "p2-second-modifier",
    expectedRevision: globalRevision,
    kind: "PLAY_MODIFIER",
    payload: { windowId, cardId: p2Cards[1].cardId },
  });
  assert.equal(secondModifier.json.outcome.code, "MODIFIER_LIMIT_REACHED");
  assert.equal(secondModifier.json.snapshot.discardCount, 2);
  assert.equal(secondModifier.json.snapshot.yourHand.length, 2);

  const hostSkip = await send(room, host.sessionToken, {
    commandId: "host-skip",
    expectedRevision: globalRevision,
    kind: "SKIP_REACTION",
    payload: { windowId },
  });
  assert.equal(hostSkip.json.snapshot.reaction.resolved, true);
  assert.equal(hostSkip.json.snapshot.reaction.closeReason, "all_completed");
  assert.equal(hostSkip.json.snapshot.fixtureTotals.modifierTotal, 2);
});

test("first valid opponent Challenge uses server dice, consumes once, and opens Modifier", async () => {
  const { room } = harness();
  const host = await create(room);
  const guest = await join(room, "Guest");
  const other = await join(room, "Other");
  const before = await snapshot(room, host.sessionToken);
  const opened = await send(room, host.sessionToken, {
    commandId: "open-challenge",
    expectedRevision: before.json.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "challenge" },
  });
  const windowId = opened.json.snapshot.reaction.windowId;

  const selfCard = opened.json.snapshot.yourHand.find((card: any) => card.kind === "challenge");
  const self = await send(room, host.sessionToken, {
    commandId: "self-challenge",
    expectedRevision: opened.json.snapshot.revision,
    kind: "PLAY_CHALLENGE",
    payload: { windowId, cardId: selfCard.cardId },
  });
  assert.equal(self.json.outcome.code, "SELF_CHALLENGE");
  assert.equal(self.json.snapshot.discardCount, 0);

  const guestView = await snapshot(room, guest.json.sessionToken);
  const challengeCard = guestView.json.snapshot.yourHand.find(
    (card: any) => card.kind === "challenge",
  );
  const command = {
    commandId: "guest-challenge",
    expectedRevision: opened.json.snapshot.revision,
    kind: "PLAY_CHALLENGE",
    payload: {
      windowId,
      cardId: challengeCard.cardId,
      playerId: host.snapshot.you.playerId,
      dice: [6, 6],
      deadlineAt: 999999,
    },
  };
  const accepted = await send(room, guest.json.sessionToken, command);
  assert.equal(accepted.json.outcome.accepted, true);
  assert.equal(accepted.json.snapshot.discardCount, 1);
  assert.equal(accepted.json.snapshot.reaction.kind, "modifier");
  assert.deepEqual(accepted.json.snapshot.challengeRoll.playedByDice, [2, 3]);
  assert.deepEqual(accepted.json.snapshot.challengeRoll.challengerDice, [4, 5]);
  assert.equal(accepted.json.snapshot.fixtureTotals.baseTotal, 5);

  const retry = await send(room, guest.json.sessionToken, command);
  assert.equal(retry.json.outcome.replayed, true);
  assert.equal(retry.json.snapshot.discardCount, 1);
  assert.equal(retry.json.snapshot.reaction.windowId, accepted.json.snapshot.reaction.windowId);

  const otherView = await snapshot(room, other.json.sessionToken);
  const otherChallenge = otherView.json.snapshot.yourHand.find(
    (card: any) => card.kind === "challenge",
  );
  const competing = await send(room, other.json.sessionToken, {
    commandId: "competing-challenge",
    expectedRevision: opened.json.snapshot.revision,
    kind: "PLAY_CHALLENGE",
    payload: { windowId, cardId: otherChallenge.cardId },
  });
  assert.equal(competing.json.outcome.accepted, false);
  assert.equal(competing.json.outcome.code, "WINDOW_MISMATCH");
  assert.equal(competing.json.snapshot.discardCount, 1);
});

test("deadline command and alarm resolve exactly once while incomplete players wait", async () => {
  const { room, storage, setNow } = harness();
  const host = await create(room);
  const guest = await join(room, "Guest");
  const before = await snapshot(room, host.sessionToken);
  const opened = await send(room, host.sessionToken, {
    commandId: "open-deadline",
    expectedRevision: before.json.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "modifier" },
  });
  const { windowId, deadlineAt } = opened.json.snapshot.reaction;
  const hostSkip = await send(room, host.sessionToken, {
    commandId: "skip-before-deadline",
    expectedRevision: opened.json.snapshot.revision,
    kind: "SKIP_REACTION",
    payload: { windowId },
  });
  assert.equal(hostSkip.json.snapshot.reaction.resolved, false);

  setNow(deadlineAt);
  const guestCard = (await snapshot(room, guest.json.sessionToken)).json.snapshot.yourHand.find(
    (card: any) => card.kind === "modifier",
  );
  const late = await send(room, guest.json.sessionToken, {
    commandId: "late-modifier",
    expectedRevision: opened.json.snapshot.revision,
    kind: "PLAY_MODIFIER",
    payload: { windowId, cardId: guestCard.cardId },
  });
  assert.equal(late.json.outcome.code, "WINDOW_CLOSED");
  assert.equal(late.json.snapshot.reaction.closeReason, "deadline");
  assert.equal(late.json.snapshot.discardCount, 0);
  const revision = late.json.snapshot.revision;

  await room.alarm();
  await room.alarm();
  const afterAlarm = await snapshot(room, guest.json.sessionToken);
  assert.equal(afterAlarm.json.snapshot.revision, revision);
  assert.equal(afterAlarm.json.snapshot.reaction.closeReason, "deadline");
  assert.equal(storage.alarmAt, deadlineAt + ROOM_IDLE_MS, "resolved reaction rearms the room idle-expiry alarm");
});

test("create accepts the real base mode but rejects unknown modes and expansion/capacity config", async () => {
  const { room } = harness();
  const unknown = await room.fetch(
    roomRequest("/api/rooms/ABC234", "POST", {
      body: { nickname: "Host", mode: "base_plus_expansion" },
      internalCreate: true,
    }),
  );
  assert.equal(unknown.status, 400);
  const unknownBody = await body(unknown);
  assert.equal(unknownBody.error.code, "INVALID_MODE");
  assert.equal("sessionToken" in unknownBody, false);

  for (const unsupported of [
    { nickname: "BaseExpansion", mode: "base", enabledSetIds: ["fixture.expansion"] },
    { nickname: "BaseReaction", mode: "base", reactionSeconds: 30 },
  ]) {
    const rejected = await room.fetch(
      roomRequest("/api/rooms/ABC234", "POST", { body: unsupported, internalCreate: true }),
    );
    assert.equal(rejected.status, 409);
    assert.equal((await body(rejected)).error.code, "EXPANSION_UNSUPPORTED");
  }

  const response = await room.fetch(
    roomRequest("/api/rooms/ABC234", "POST", {
      body: { nickname: "Host", mode: "base" },
      internalCreate: true,
    }),
  );
  assert.equal(response.status, 201);
  const created = await body(response);
  assert.equal(created.snapshot.mode, "base");
  assert.equal("demo" in created.snapshot, false);
  assert.equal("demoLabel" in created.snapshot, false);

  for (const unsupported of [
    { nickname: "Expansion", mode: "setup_demo", enabledSetIds: ["fixture.expansion"] },
    { nickname: "NestedConfig", mode: "setup_demo", config: { enabledSetIds: [] } },
    { nickname: "Capacity", mode: "setup_demo", capacity: { maxPlayers: 8 } },
  ]) {
    const rejected = await room.fetch(
      roomRequest("/api/rooms/ABC234", "POST", {
        body: unsupported,
        internalCreate: true,
      }),
    );
    const rejectedBody = await body(rejected);
    assert.equal(rejected.status, 409);
    assert.equal(rejectedBody.error.code, "EXPANSION_UNSUPPORTED");
    assert.equal("sessionToken" in rejectedBody, false);
  }
});

test("setup_demo selects unique Leaders sequentially and starts with the last selector", async () => {
  const { room } = harness();
  const host = await create(room, "Host", "setup_demo");
  const guest = await join(room, "Guest");
  assert.equal(host.snapshot.mode, "setup_demo");
  assert.equal(host.snapshot.yourHand.length, 0);

  const begun = await send(room, host.sessionToken, {
    commandId: "begin-selection",
    expectedRevision: guest.json.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  });
  assert.equal(begun.json.outcome.accepted, true);
  assert.equal(begun.json.snapshot.setup.selectionPlayerId, host.snapshot.you.playerId);

  const lateJoin = await join(room, "Late");
  assert.equal(lateJoin.response.status, 409);
  assert.equal(lateJoin.json.error.code, "SETUP_LOCKED");

  const outOfOrder = await send(room, guest.json.sessionToken, {
    commandId: "guest-too-early",
    expectedRevision: begun.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: "fixture.setup.leader.2" },
  });
  assert.equal(outOfOrder.json.outcome.code, "NOT_ACTIVE_SELECTOR");

  const hostSelected = await send(room, host.sessionToken, {
    commandId: "host-leader",
    expectedRevision: begun.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: "fixture.setup.leader.1" },
  });
  assert.equal(hostSelected.json.outcome.accepted, true);
  assert.equal(hostSelected.json.snapshot.setup.selectionPlayerId, guest.json.snapshot.you.playerId);

  const duplicate = await send(room, guest.json.sessionToken, {
    commandId: "duplicate-leader",
    expectedRevision: hostSelected.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: "fixture.setup.leader.1" },
  });
  assert.equal(duplicate.json.outcome.code, "LEADER_TAKEN");
  assert.equal(duplicate.json.snapshot.revision, hostSelected.json.snapshot.revision);

  const guestSelected = await send(room, guest.json.sessionToken, {
    commandId: "guest-leader",
    expectedRevision: hostSelected.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: "fixture.setup.leader.2" },
  });
  const forbidden = await send(room, guest.json.sessionToken, {
    commandId: "guest-start",
    expectedRevision: guestSelected.json.snapshot.revision,
    kind: "START_GAME",
    payload: {},
  });
  assert.equal(forbidden.json.outcome.code, "FORBIDDEN");

  const startCommand = {
    commandId: "host-start",
    expectedRevision: guestSelected.json.snapshot.revision,
    kind: "START_GAME",
    payload: {},
  };
  const started = await send(room, host.sessionToken, startCommand);
  assert.equal(started.json.outcome.accepted, true);
  assert.equal(started.json.snapshot.setup.phase, "turn_active");
  assert.equal(started.json.snapshot.setup.currentPlayerId, guest.json.snapshot.you.playerId);
  assert.deepEqual(started.json.snapshot.setup.turnOrder, [
    guest.json.snapshot.you.playerId,
    host.snapshot.you.playerId,
  ]);
  assert.equal(started.json.snapshot.setup.actionPoints, 3);
  assert.equal(started.json.snapshot.setup.mainDeckCount, 105);
  assert.equal(started.json.snapshot.setup.monsterDeckCount, 12);
  assert.equal(started.json.snapshot.setup.faceUpMonsterIds.length, 3);
  assert.equal(started.json.snapshot.yourHand.length, 5);

  const guestView = await snapshot(room, guest.json.sessionToken);
  assert.equal(guestView.json.snapshot.yourHand.length, 5);
  for (const card of guestView.json.snapshot.yourHand) {
    assert.doesNotMatch(JSON.stringify(started.json), new RegExp(card.cardId));
  }

  const retry = await send(room, host.sessionToken, startCommand);
  assert.equal(retry.json.outcome.replayed, true);
  assert.equal(retry.json.snapshot.setup.mainDeckCount, 105);
  assert.equal(retry.json.snapshot.yourHand.length, 5);
});

test("setup AP commands are authoritative, idempotent, and auto-advance at zero", async () => {
  const { room } = harness();
  const host = await create(room, "Host", "setup_demo");
  const guest = await join(room, "Guest");
  const begun = await send(room, host.sessionToken, {
    commandId: "begin",
    expectedRevision: guest.json.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  });
  const hostLeader = await send(room, host.sessionToken, {
    commandId: "leader-host",
    expectedRevision: begun.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: "fixture.setup.leader.1" },
  });
  const guestLeader = await send(room, guest.json.sessionToken, {
    commandId: "leader-guest",
    expectedRevision: hostLeader.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: "fixture.setup.leader.2" },
  });
  const started = await send(room, host.sessionToken, {
    commandId: "start",
    expectedRevision: guestLeader.json.snapshot.revision,
    kind: "START_GAME",
    payload: {},
  });
  const windowRevision = started.json.snapshot.revision;
  const drawOne = {
    commandId: "draw-one",
    expectedRevision: windowRevision,
    kind: "DRAW_CARD",
    payload: {},
  };
  const first = await send(room, guest.json.sessionToken, drawOne);
  assert.equal(first.json.snapshot.setup.actionPoints, 2);
  assert.equal(first.json.snapshot.yourHand.length, 6);

  const second = await send(room, guest.json.sessionToken, {
    commandId: "draw-two",
    expectedRevision: first.json.snapshot.revision,
    kind: "DRAW_CARD",
    payload: {},
  });
  const third = await send(room, guest.json.sessionToken, {
    commandId: "draw-three",
    expectedRevision: second.json.snapshot.revision,
    kind: "DRAW_CARD",
    payload: {},
  });
  assert.equal(third.json.snapshot.setup.currentPlayerId, host.snapshot.you.playerId);
  assert.equal(third.json.snapshot.setup.actionPoints, 3);
  assert.equal(third.json.snapshot.setup.turnNumber, 2);

  const retry = await send(room, guest.json.sessionToken, drawOne);
  assert.equal(retry.json.outcome.replayed, true);
  assert.equal(retry.json.snapshot.setup.mainDeckCount, third.json.snapshot.setup.mainDeckCount);

  const conflict = await send(room, guest.json.sessionToken, {
    commandId: "draw-one",
    expectedRevision: third.json.snapshot.revision,
    kind: "END_TURN",
    payload: {},
  });
  assert.equal(conflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");

  const redraw = await send(room, host.sessionToken, {
    commandId: "host-redraw",
    expectedRevision: third.json.snapshot.revision,
    kind: "REDRAW_HAND",
    payload: {},
  });
  assert.equal(redraw.json.outcome.accepted, true);
  assert.equal(redraw.json.snapshot.yourHand.length, 5);
  assert.equal(redraw.json.snapshot.setup.discardCount, 5);
  assert.equal(redraw.json.snapshot.setup.currentPlayerId, guest.json.snapshot.you.playerId);

  const outOfTurn = await send(room, host.sessionToken, {
    commandId: "host-out-of-turn",
    expectedRevision: redraw.json.snapshot.revision,
    kind: "DRAW_CARD",
    payload: {},
  });
  assert.equal(outOfTurn.json.outcome.code, "NOT_YOUR_TURN");
  assert.equal(outOfTurn.json.snapshot.revision, redraw.json.snapshot.revision);

  const endTurn = await send(room, guest.json.sessionToken, {
    commandId: "guest-end-turn",
    expectedRevision: redraw.json.snapshot.revision,
    kind: "END_TURN",
    payload: {},
  });
  assert.equal(endTurn.json.outcome.accepted, true);
  assert.equal(endTurn.json.snapshot.setup.currentPlayerId, host.snapshot.you.playerId);
  assert.equal(endTurn.json.snapshot.setup.actionPoints, 3);
});

test("setup depletion reshuffles, accepts zero draw, replays safely, and modes stay isolated", async () => {
  const { room, storage } = harness();
  const host = await create(room, "Host", "setup_demo");
  const guest = await join(room, "Guest");
  const begun = await send(room, host.sessionToken, {
    commandId: "begin",
    expectedRevision: guest.json.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  });
  const h = await send(room, host.sessionToken, {
    commandId: "h",
    expectedRevision: begun.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: "fixture.setup.leader.1" },
  });
  const g = await send(room, guest.json.sessionToken, {
    commandId: "g",
    expectedRevision: h.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: "fixture.setup.leader.2" },
  });
  const started = await send(room, host.sessionToken, {
    commandId: "start",
    expectedRevision: g.json.snapshot.revision,
    kind: "START_GAME",
    payload: {},
  });

  const persisted = storage.values.get("room-state-v2") as any;
  persisted.setup.mainDeck = [];
  persisted.discard = [{ cardId: "fixture.setup.main.reshuffle", kind: "other" }];
  const totalBeforeReshuffle = setupCardTotal(persisted);
  const beforeReshuffle = await snapshot(room, guest.json.sessionToken);
  const reshuffled = await send(room, guest.json.sessionToken, {
    commandId: "reshuffle-draw",
    expectedRevision: beforeReshuffle.json.snapshot.revision,
    kind: "DRAW_CARD",
    payload: {},
  });
  assert.equal(reshuffled.json.outcome.accepted, true);
  assert.equal(reshuffled.json.snapshot.setup.mainDeckCount, 0);
  assert.equal(reshuffled.json.snapshot.setup.discardCount, 0);
  assert.equal(reshuffled.json.snapshot.setup.actionPoints, 2);
  assert.equal(setupCardTotal(storage.values.get("room-state-v2")), totalBeforeReshuffle);

  const persistedAfterReshuffle = storage.values.get("room-state-v2") as any;
  persistedAfterReshuffle.setup.mainDeck = [];
  persistedAfterReshuffle.discard = [];
  const before = await snapshot(room, guest.json.sessionToken);
  const emptyDrawCommand = {
    commandId: "empty-draw",
    expectedRevision: before.json.snapshot.revision,
    kind: "DRAW_CARD",
    payload: {},
  };
  const totalBeforeEmpty = setupCardTotal(persistedAfterReshuffle);
  const emptyDraw = await send(room, guest.json.sessionToken, emptyDrawCommand);
  assert.equal(emptyDraw.json.outcome.accepted, true);
  assert.equal(emptyDraw.json.snapshot.revision, before.json.snapshot.revision + 1);
  assert.equal(emptyDraw.json.snapshot.setup.actionPoints, 1);
  assert.equal(emptyDraw.json.snapshot.yourHand.length, 6);
  assert.equal(setupCardTotal(storage.values.get("room-state-v2")), totalBeforeEmpty);

  const replay = await send(room, guest.json.sessionToken, emptyDrawCommand);
  assert.equal(replay.json.outcome.replayed, true);
  assert.equal(replay.json.snapshot.revision, emptyDraw.json.snapshot.revision);
  assert.equal(replay.json.snapshot.setup.actionPoints, 1);
  assert.equal(replay.json.snapshot.yourHand.length, 6);

  const advanced = await send(room, guest.json.sessionToken, {
    commandId: "empty-draw-advance",
    expectedRevision: emptyDraw.json.snapshot.revision,
    kind: "DRAW_CARD",
    payload: {},
  });
  assert.equal(advanced.json.outcome.accepted, true);
  assert.equal(advanced.json.snapshot.setup.currentPlayerId, host.snapshot.you.playerId);
  assert.equal(advanced.json.snapshot.setup.actionPoints, 3);

  const beforeFullState = storage.values.get("room-state-v2") as any;
  const hostState = beforeFullState.players.find(
    (candidate: any) => candidate.playerId === host.snapshot.you.playerId,
  );
  hostState.hand = [
    { cardId: "fixture.setup.main.hand.1", kind: "other" },
    { cardId: "fixture.setup.main.hand.2", kind: "other" },
    { cardId: "fixture.setup.main.hand.3", kind: "other" },
  ];
  beforeFullState.setup.mainDeck = [
    { cardId: "fixture.setup.main.deck", kind: "other" },
  ];
  beforeFullState.discard = [
    { cardId: "fixture.setup.main.discard", kind: "other" },
  ];
  const totalBeforeFull = setupCardTotal(beforeFullState);
  const fullRedrawView = await snapshot(room, host.sessionToken);
  const fullRedraw = await send(room, host.sessionToken, {
    commandId: "full-redraw",
    expectedRevision: fullRedrawView.json.snapshot.revision,
    kind: "REDRAW_HAND",
    payload: {},
  });
  assert.equal(fullRedraw.json.outcome.accepted, true);
  assert.deepEqual(
    fullRedraw.json.snapshot.yourHand.map((card: any) => card.cardId),
    [
      "fixture.setup.main.deck",
      "fixture.setup.main.discard",
      "fixture.setup.main.hand.1",
      "fixture.setup.main.hand.2",
      "fixture.setup.main.hand.3",
    ],
  );
  assert.equal(fullRedraw.json.snapshot.setup.currentPlayerId, guest.json.snapshot.you.playerId);
  assert.equal(setupCardTotal(storage.values.get("room-state-v2")), totalBeforeFull);

  const beforePartialState = storage.values.get("room-state-v2") as any;
  const guestState = beforePartialState.players.find(
    (candidate: any) => candidate.playerId === guest.json.snapshot.you.playerId,
  );
  guestState.hand = [
    { cardId: "fixture.setup.main.partial.1", kind: "other" },
    { cardId: "fixture.setup.main.partial.2", kind: "other" },
  ];
  beforePartialState.setup.mainDeck = [];
  beforePartialState.discard = [];
  const totalBeforePartial = setupCardTotal(beforePartialState);
  const partialView = await snapshot(room, guest.json.sessionToken);
  const partialRedraw = await send(room, guest.json.sessionToken, {
    commandId: "partial-redraw",
    expectedRevision: partialView.json.snapshot.revision,
    kind: "REDRAW_HAND",
    payload: {},
  });
  assert.equal(partialRedraw.json.outcome.accepted, true);
  assert.equal(partialRedraw.json.snapshot.yourHand.length, 2);
  assert.equal(partialRedraw.json.snapshot.setup.mainDeckCount, 0);
  assert.equal(partialRedraw.json.snapshot.setup.discardCount, 0);
  assert.equal(setupCardTotal(storage.values.get("room-state-v2")), totalBeforePartial);

  const beforeZeroState = storage.values.get("room-state-v2") as any;
  const zeroHostState = beforeZeroState.players.find(
    (candidate: any) => candidate.playerId === host.snapshot.you.playerId,
  );
  zeroHostState.hand = [];
  beforeZeroState.setup.mainDeck = [];
  beforeZeroState.discard = [];
  const totalBeforeZero = setupCardTotal(beforeZeroState);
  const zeroView = await snapshot(room, host.sessionToken);
  const zeroRedraw = await send(room, host.sessionToken, {
    commandId: "zero-redraw",
    expectedRevision: zeroView.json.snapshot.revision,
    kind: "REDRAW_HAND",
    payload: {},
  });
  assert.equal(zeroRedraw.json.outcome.accepted, true);
  assert.equal(zeroRedraw.json.snapshot.yourHand.length, 0);
  assert.equal(zeroRedraw.json.snapshot.setup.currentPlayerId, guest.json.snapshot.you.playerId);
  assert.equal(setupCardTotal(storage.values.get("room-state-v2")), totalBeforeZero);

  const modeMismatch = await send(room, host.sessionToken, {
    commandId: "reaction-in-setup",
    expectedRevision: started.json.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "modifier" },
  });
  assert.equal(modeMismatch.json.outcome.code, "MODE_MISMATCH");

  const otherHarness = harness();
  const reactionHost = await create(otherHarness.room);
  const setupInReaction = await send(otherHarness.room, reactionHost.sessionToken, {
    commandId: "setup-in-reaction",
    expectedRevision: reactionHost.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  });
  assert.equal(setupInReaction.json.outcome.code, "MODE_MISMATCH");
});

test("snapshot polling at one request/second remains below the session rate bound", async () => {
  const { room, setNow } = harness();
  const host = await create(room);
  for (let second = 0; second < 65; second += 1) {
    setNow(1_000 + second * 1_000);
    const result = await snapshot(room, host.sessionToken);
    assert.equal(result.response.status, 200);
  }
});
