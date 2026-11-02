import assert from "node:assert/strict";
import test from "node:test";

import {
  RoomDurableObject,
  type DurableObjectContextLike,
  type DurableObjectStorageLike,
  type DurableObjectTransactionLike,
} from "../apps/worker/src/room.ts";
import { routeRequest, type WorkerEnv } from "../apps/worker/src/router.ts";

class SerialMemoryStorage implements DurableObjectStorageLike, DurableObjectTransactionLike {
  readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async setAlarm(timestamp: number): Promise<void> {
    this.alarmAt = timestamp;
  }

  transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => callback(this));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

type ApiResult = { response: Response; json: any };
type Runtime = ReturnType<typeof localRuntime>;
type PlayerSession = {
  nickname: string;
  playerId: string;
  sessionToken: string;
};

function localRuntime() {
  const rooms = new Map<string, RoomDurableObject>();
  let id = 0;
  let session = 0;
  let requestId = 0;
  const namespace = {
    idFromName(name: string) {
      return name;
    },
    get(roomId: unknown) {
      const code = String(roomId);
      let room = rooms.get(code);
      if (!room) {
        const storage = new SerialMemoryStorage();
        const context: DurableObjectContextLike = {
          storage,
          blockConcurrencyWhile: async <T>(callback: () => Promise<T>) => callback(),
        };
        room = new RoomDurableObject(context, {
          now: () => 10_000,
          randomUUID: () => `id-${++id}`,
          sessionToken: () => `setup-session-${++session}`,
          rollDice: () => [2, 3] as const,
          shuffle: <T>(values: T[]) => [...values],
        } as any);
        rooms.set(code, room);
      }
      return { fetch: (request: Request) => room!.fetch(request) };
    },
  } satisfies WorkerEnv["ROOMS"];

  async function request(
    path: string,
    options: { method?: "GET" | "POST"; body?: unknown; token?: string } = {},
  ): Promise<ApiResult> {
    const headers = new Headers({ "cf-connecting-ip": `setup-qa-${++requestId}` });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    const response = await routeRequest(new Request(`https://local.test${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }), { ROOMS: namespace });
    return { response, json: await response.json() as any };
  }

  return { request };
}

async function createRoom(
  runtime: Runtime,
  nickname = "Host",
  mode: "setup_demo" | "reaction_demo" = "setup_demo",
) {
  const result = await runtime.request("/api/rooms", {
    method: "POST",
    body: { nickname, mode },
  });
  assert.equal(result.response.status, 201);
  return result.json;
}

async function joinRoom(runtime: Runtime, code: string, nickname: string) {
  return runtime.request(`/api/rooms/${code}/join`, {
    method: "POST",
    body: { nickname },
  });
}

async function snapshot(runtime: Runtime, code: string, token: string) {
  return runtime.request(`/api/rooms/${code}/snapshot`, { token });
}

async function command(
  runtime: Runtime,
  code: string,
  token: string,
  body: Record<string, unknown>,
) {
  return runtime.request(`/api/rooms/${code}/commands`, {
    method: "POST",
    token,
    body,
  });
}

async function createPlayers(runtime: Runtime, count: number) {
  const host = await createRoom(runtime);
  const code = host.roomCode as string;
  const players: PlayerSession[] = [{
    nickname: "Host",
    playerId: host.snapshot.you.playerId,
    sessionToken: host.sessionToken,
  }];
  for (let index = 1; index < count; index += 1) {
    const joined = await joinRoom(runtime, code, `Player${index + 1}`);
    assert.equal(joined.response.status, 201);
    players.push({
      nickname: `Player${index + 1}`,
      playerId: joined.json.snapshot.you.playerId,
      sessionToken: joined.json.sessionToken,
    });
  }
  return { code, host, players };
}

async function beginAndStart(runtime: Runtime, code: string, players: PlayerSession[]) {
  const hostView = await snapshot(runtime, code, players[0].sessionToken);
  let current = (await command(runtime, code, players[0].sessionToken, {
    commandId: "begin-selection",
    expectedRevision: hostView.json.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  })).json.snapshot;
  assert.equal(current.setup.phase, "leader_selection");

  const leaders = [...current.setup.leaderPool];
  assert.ok(leaders.length >= players.length);
  for (let index = 0; index < players.length; index += 1) {
    assert.equal(current.setup.selectionPlayerId, players[index].playerId);
    const selected = await command(runtime, code, players[index].sessionToken, {
      commandId: `select-${index}`,
      expectedRevision: current.revision,
      kind: "SELECT_PARTY_LEADER",
      payload: { leaderId: leaders[index] },
    });
    assert.equal(selected.json.outcome.accepted, true);
    current = selected.json.snapshot;
  }

  const started = await command(runtime, code, players[0].sessionToken, {
    commandId: "start-game",
    expectedRevision: current.revision,
    kind: "START_GAME",
    payload: {},
  });
  assert.equal(started.json.outcome.accepted, true);
  assert.equal(started.json.snapshot.setup.phase, "turn_active");
  return started.json.snapshot;
}

function stateDigest(value: any) {
  return {
    revision: value.revision,
    players: value.players,
    yourHand: value.yourHand,
    setup: value.setup,
  };
}

function setupMainCardTotal(value: any) {
  return value.players.reduce((total: number, player: any) => total + player.handCount, 0)
    + value.setup.mainDeckCount
    + value.setup.discardCount;
}

function tokenForCurrentPlayer(players: PlayerSession[], value: any) {
  const player = players.find((candidate) => candidate.playerId === value.setup.currentPlayerId);
  assert.ok(player, "current player must have a session");
  return player.sessionToken;
}

test("setup_demo enforces the two-player boundary, sequential unique Leaders, and atomic start guards", async () => {
  const runtime = localRuntime();
  const host = await createRoom(runtime);
  const code = host.roomCode as string;

  const tooFew = await command(runtime, code, host.sessionToken, {
    commandId: "begin-too-few",
    expectedRevision: host.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  });
  assert.equal(tooFew.json.outcome.code, "NOT_ENOUGH_PLAYERS");
  assert.equal(tooFew.json.snapshot.revision, host.snapshot.revision);

  const guestJoin = await joinRoom(runtime, code, "Guest");
  assert.equal(guestJoin.response.status, 201);
  const guest = guestJoin.json;
  const nonHost = await command(runtime, code, guest.sessionToken, {
    commandId: "guest-begin",
    expectedRevision: guest.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  });
  assert.equal(nonHost.json.outcome.code, "FORBIDDEN");
  assert.equal(nonHost.json.snapshot.revision, guest.snapshot.revision);

  const begun = await command(runtime, code, host.sessionToken, {
    commandId: "host-begin",
    expectedRevision: guest.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  });
  assert.equal(begun.json.outcome.accepted, true);
  const lockedJoin = await joinRoom(runtime, code, "Late");
  assert.notEqual(lockedJoin.response.status, 201);
  assert.equal(lockedJoin.json.error.code, "SETUP_LOCKED");

  const incomplete = await command(runtime, code, host.sessionToken, {
    commandId: "start-incomplete",
    expectedRevision: begun.json.snapshot.revision,
    kind: "START_GAME",
    payload: {},
  });
  assert.equal(incomplete.json.outcome.code, "SELECTION_INCOMPLETE");
  assert.equal(incomplete.json.snapshot.revision, begun.json.snapshot.revision);

  const [firstLeader, secondLeader] = begun.json.snapshot.setup.leaderPool;
  const hostSelected = await command(runtime, code, host.sessionToken, {
    commandId: "host-select",
    expectedRevision: begun.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: firstLeader },
  });
  assert.equal(hostSelected.json.outcome.accepted, true);

  const duplicate = await command(runtime, code, guest.sessionToken, {
    commandId: "guest-duplicate",
    expectedRevision: hostSelected.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: firstLeader },
  });
  assert.equal(duplicate.json.outcome.code, "LEADER_TAKEN");
  assert.deepEqual(stateDigest(duplicate.json.snapshot), stateDigest(hostSelected.json.snapshot));

  const guestSelected = await command(runtime, code, guest.sessionToken, {
    commandId: "guest-select",
    expectedRevision: hostSelected.json.snapshot.revision,
    kind: "SELECT_PARTY_LEADER",
    payload: { leaderId: secondLeader },
  });
  const started = await command(runtime, code, host.sessionToken, {
    commandId: "host-start",
    expectedRevision: guestSelected.json.snapshot.revision,
    kind: "START_GAME",
    payload: {},
  });
  assert.equal(started.json.outcome.accepted, true);
  assert.equal(started.json.snapshot.setup.phase, "turn_active");
  assert.equal(started.json.snapshot.setup.currentPlayerId, guest.snapshot.you.playerId);
  assert.deepEqual(started.json.snapshot.setup.turnOrder, [guest.snapshot.you.playerId, host.snapshot.you.playerId]);
  assert.equal(started.json.snapshot.setup.actionPoints, 3);
  assert.equal(started.json.snapshot.setup.mainDeckCount, 105);
  assert.equal(started.json.snapshot.setup.monsterDeckCount, 12);
  assert.equal(started.json.snapshot.setup.faceUpMonsterIds.length, 3);
  assert.equal(started.json.snapshot.yourHand.length, 5);
});

test("six-player setup caps the room, keeps private hands isolated, and reloads the same seat", async () => {
  const runtime = localRuntime();
  const { code, players } = await createPlayers(runtime, 6);
  const seventh = await joinRoom(runtime, code, "Player7");
  assert.notEqual(seventh.response.status, 201);
  assert.equal(seventh.json.error.code, "ROOM_FULL");

  const started = await beginAndStart(runtime, code, players);
  assert.equal(started.setup.mainDeckCount, 85);
  assert.equal(started.setup.monsterDeckCount, 12);
  assert.equal(started.setup.faceUpMonsterIds.length, 3);
  assert.equal(started.setup.currentPlayerId, players[5].playerId);
  assert.deepEqual(started.setup.turnOrder, [
    players[5].playerId,
    players[0].playerId,
    players[1].playerId,
    players[2].playerId,
    players[3].playerId,
    players[4].playerId,
  ]);

  const hostView = await snapshot(runtime, code, players[0].sessionToken);
  const lastView = await snapshot(runtime, code, players[5].sessionToken);
  assert.equal(hostView.json.snapshot.players.length, 6);
  assert.equal(lastView.json.snapshot.players.length, 6);
  assert.equal(hostView.json.snapshot.yourHand.length, 5);
  assert.equal(lastView.json.snapshot.yourHand.length, 5);
  for (const card of lastView.json.snapshot.yourHand) {
    assert.doesNotMatch(JSON.stringify(hostView.json.snapshot), new RegExp(card.cardId));
  }
  const serializedHost = JSON.stringify(hostView.json.snapshot);
  for (const player of players) {
    assert.equal(serializedHost.includes(player.sessionToken), false);
  }
  assert.equal(serializedHost.includes("sessionTokenHash"), false);
  assert.equal(serializedHost.includes("mainDeck\":["), false);
  assert.equal(serializedHost.includes("monsterDeck\":["), false);

  const reload = await snapshot(runtime, code, players[0].sessionToken);
  assert.equal(reload.json.snapshot.you.playerId, players[0].playerId);
  assert.equal(reload.json.snapshot.players.length, 6);
  assert.deepEqual(reload.json.snapshot.yourHand, hostView.json.snapshot.yourHand);
  const unauthorized = await snapshot(runtime, code, "invalid-session");
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.json.error.code, "UNAUTHORIZED");
});

test("turn/AP commands are authoritative, idempotent, and atomic on invalid actions", async () => {
  const runtime = localRuntime();
  const { code, players } = await createPlayers(runtime, 2);
  let current = await beginAndStart(runtime, code, players);
  const active = players.find((player) => player.playerId === current.setup.currentPlayerId)!;
  const inactive = players.find((player) => player.playerId !== current.setup.currentPlayerId)!;

  const inactiveBefore = await snapshot(runtime, code, inactive.sessionToken);
  const outOfTurn = await command(runtime, code, inactive.sessionToken, {
    commandId: "out-of-turn",
    expectedRevision: current.revision,
    kind: "DRAW_CARD",
    payload: { playerId: active.playerId },
  });
  assert.equal(outOfTurn.json.outcome.code, "NOT_YOUR_TURN");
  assert.deepEqual(stateDigest(outOfTurn.json.snapshot), stateDigest(inactiveBefore.json.snapshot));

  const drawBody = {
    commandId: "draw-once",
    expectedRevision: current.revision,
    kind: "DRAW_CARD",
    payload: {},
  };
  const drawn = await command(runtime, code, active.sessionToken, drawBody);
  assert.equal(drawn.json.outcome.accepted, true);
  assert.equal(drawn.json.snapshot.setup.actionPoints, 2);
  assert.equal(drawn.json.snapshot.setup.mainDeckCount, 104);
  assert.equal(drawn.json.snapshot.yourHand.length, 6);
  current = drawn.json.snapshot;

  const replay = await command(runtime, code, active.sessionToken, drawBody);
  assert.equal(replay.json.outcome.replayed, true);
  assert.equal(replay.json.snapshot.setup.mainDeckCount, 104);
  assert.equal(replay.json.snapshot.yourHand.length, 6);
  const conflict = await command(runtime, code, active.sessionToken, {
    ...drawBody,
    payload: { clientResult: "spoof" },
  });
  assert.equal(conflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");
  assert.deepEqual(stateDigest(conflict.json.snapshot), stateDigest(current));

  const stale = await command(runtime, code, active.sessionToken, {
    commandId: "stale-draw",
    expectedRevision: drawBody.expectedRevision,
    kind: "DRAW_CARD",
    payload: {},
  });
  assert.equal(stale.json.outcome.code, "STALE_REVISION");
  assert.deepEqual(stateDigest(stale.json.snapshot), stateDigest(current));

  const insufficientAp = await command(runtime, code, active.sessionToken, {
    commandId: "redraw-too-expensive",
    expectedRevision: current.revision,
    kind: "REDRAW_HAND",
    payload: {},
  });
  assert.equal(insufficientAp.json.outcome.code, "INSUFFICIENT_AP");
  assert.deepEqual(stateDigest(insufficientAp.json.snapshot), stateDigest(current));

  const ended = await command(runtime, code, active.sessionToken, {
    commandId: "end-with-two-ap",
    expectedRevision: current.revision,
    kind: "END_TURN",
    payload: {},
  });
  assert.equal(ended.json.outcome.accepted, true);
  assert.equal(ended.json.snapshot.setup.currentPlayerId, inactive.playerId);
  assert.equal(ended.json.snapshot.setup.actionPoints, 3);
  assert.equal(ended.json.snapshot.setup.turnNumber, current.setup.turnNumber + 1);
  assert.notEqual(ended.json.snapshot.setup.turnId, current.setup.turnId);
});

test("depletion draws sequentially across reshuffle and empty sources resolve without looping", async () => {
  const runtime = localRuntime();
  const { code, players } = await createPlayers(runtime, 2);
  let current = await beginAndStart(runtime, code, players);
  assert.equal(setupMainCardTotal(current), 115);

  const initialRedraw = await command(runtime, code, tokenForCurrentPlayer(players, current), {
    commandId: "seed-discard",
    expectedRevision: current.revision,
    kind: "REDRAW_HAND",
    payload: {},
  });
  assert.equal(initialRedraw.json.outcome.accepted, true);
  current = initialRedraw.json.snapshot;
  assert.equal(current.setup.mainDeckCount, 100);
  assert.equal(current.setup.discardCount, 5);
  assert.equal(setupMainCardTotal(current), 115);

  let sequence = 0;
  while (current.setup.mainDeckCount > 2) {
    const drawn = await command(runtime, code, tokenForCurrentPlayer(players, current), {
      commandId: `drain-main-${++sequence}`,
      expectedRevision: current.revision,
      kind: "DRAW_CARD",
      payload: {},
    });
    assert.equal(drawn.json.outcome.accepted, true);
    current = drawn.json.snapshot;
    assert.equal(setupMainCardTotal(current), 115);
  }
  assert.equal(current.setup.mainDeckCount, 2);
  assert.equal(current.setup.discardCount, 5);

  if (current.setup.actionPoints < 3) {
    const advanced = await command(runtime, code, tokenForCurrentPlayer(players, current), {
      commandId: "advance-before-sequential-redraw",
      expectedRevision: current.revision,
      kind: "END_TURN",
      payload: {},
    });
    assert.equal(advanced.json.outcome.accepted, true);
    current = advanced.json.snapshot;
  }
  assert.equal(current.setup.actionPoints, 3);
  const redrawToken = tokenForCurrentPlayer(players, current);
  const beforeRedraw = await snapshot(runtime, code, redrawToken);
  const redrawHandCount = beforeRedraw.json.snapshot.yourHand.length;
  const redrawPlayerId = current.setup.currentPlayerId;
  const redrawTurn = current.setup.turnNumber;
  const sequentialRedrawBody = {
    commandId: "sequential-redraw-across-piles",
    expectedRevision: current.revision,
    kind: "REDRAW_HAND",
    payload: {},
  };
  const reshuffled = await command(runtime, code, redrawToken, sequentialRedrawBody);
  assert.equal(reshuffled.json.outcome.accepted, true);
  assert.equal(reshuffled.json.snapshot.yourHand.length, 5);
  assert.equal(reshuffled.json.snapshot.setup.mainDeckCount, redrawHandCount + 2);
  assert.equal(reshuffled.json.snapshot.setup.discardCount, 0);
  assert.notEqual(reshuffled.json.snapshot.setup.currentPlayerId, redrawPlayerId);
  assert.equal(reshuffled.json.snapshot.setup.turnNumber, redrawTurn + 1);
  assert.equal(reshuffled.json.snapshot.setup.actionPoints, 3);
  assert.equal(setupMainCardTotal(reshuffled.json.snapshot), 115);
  const replayedRedraw = await command(runtime, code, redrawToken, sequentialRedrawBody);
  assert.equal(replayedRedraw.json.outcome.replayed, true);
  assert.deepEqual(stateDigest(replayedRedraw.json.snapshot), stateDigest(reshuffled.json.snapshot));
  const redrawConflict = await command(runtime, code, redrawToken, {
    ...sequentialRedrawBody,
    payload: { clientResult: "spoof" },
  });
  assert.equal(redrawConflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");
  assert.deepEqual(stateDigest(redrawConflict.json.snapshot), stateDigest(reshuffled.json.snapshot));
  current = reshuffled.json.snapshot;

  while (current.setup.mainDeckCount > 0) {
    const drawn = await command(runtime, code, tokenForCurrentPlayer(players, current), {
      commandId: `drain-after-sequential-redraw-${++sequence}`,
      expectedRevision: current.revision,
      kind: "DRAW_CARD",
      payload: {},
    });
    assert.equal(drawn.json.outcome.accepted, true);
    current = drawn.json.snapshot;
    assert.equal(setupMainCardTotal(current), 115);
  }
  assert.equal(current.setup.discardCount, 0);

  const exhaustedToken = tokenForCurrentPlayer(players, current);
  const beforeEmptyDraw = await snapshot(runtime, code, exhaustedToken);
  const emptyDrawBody = {
    commandId: "draw-from-empty-sources",
    expectedRevision: current.revision,
    kind: "DRAW_CARD",
    payload: {},
  };
  const emptyDraw = await command(runtime, code, exhaustedToken, emptyDrawBody);
  assert.equal(emptyDraw.json.outcome.accepted, true);
  assert.equal(emptyDraw.json.snapshot.revision, beforeEmptyDraw.json.snapshot.revision + 1);
  assert.equal(emptyDraw.json.snapshot.setup.mainDeckCount, 0);
  assert.equal(emptyDraw.json.snapshot.setup.discardCount, 0);
  assert.equal(setupMainCardTotal(emptyDraw.json.snapshot), 115);
  if (beforeEmptyDraw.json.snapshot.setup.actionPoints === 1) {
    assert.notEqual(
      emptyDraw.json.snapshot.setup.currentPlayerId,
      beforeEmptyDraw.json.snapshot.setup.currentPlayerId,
    );
    assert.equal(emptyDraw.json.snapshot.setup.actionPoints, 3);
  } else {
    assert.equal(
      emptyDraw.json.snapshot.setup.actionPoints,
      beforeEmptyDraw.json.snapshot.setup.actionPoints - 1,
    );
  }
  const replayedEmptyDraw = await command(runtime, code, exhaustedToken, emptyDrawBody);
  assert.equal(replayedEmptyDraw.json.outcome.replayed, true);
  assert.deepEqual(stateDigest(replayedEmptyDraw.json.snapshot), stateDigest(emptyDraw.json.snapshot));
  const emptyDrawConflict = await command(runtime, code, exhaustedToken, {
    ...emptyDrawBody,
    payload: { clientResult: "spoof" },
  });
  assert.equal(emptyDrawConflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");
  assert.deepEqual(stateDigest(emptyDrawConflict.json.snapshot), stateDigest(emptyDraw.json.snapshot));
});

test("setup and reaction demos remain isolated and unsupported config never creates a room", async () => {
  const runtime = localRuntime();
  const reaction = await createRoom(runtime, "ReactionHost", "reaction_demo");
  const setupInReaction = await command(runtime, reaction.roomCode, reaction.sessionToken, {
    commandId: "setup-in-reaction",
    expectedRevision: reaction.snapshot.revision,
    kind: "BEGIN_LEADER_SELECTION",
    payload: {},
  });
  assert.equal(setupInReaction.json.outcome.code, "MODE_MISMATCH");
  assert.equal(setupInReaction.json.snapshot.mode, "reaction_demo");
  assert.equal("setup" in setupInReaction.json.snapshot, false);

  const setup = await createRoom(runtime, "SetupHost", "setup_demo");
  const reactionInSetup = await command(runtime, setup.roomCode, setup.sessionToken, {
    commandId: "reaction-in-setup",
    expectedRevision: setup.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "modifier" },
  });
  assert.equal(reactionInSetup.json.outcome.code, "MODE_MISMATCH");
  assert.equal(reactionInSetup.json.snapshot.mode, "setup_demo");
  assert.equal("reaction" in reactionInSetup.json.snapshot, false);
  assert.equal(reactionInSetup.json.snapshot.demo, true);
  assert.match(reactionInSetup.json.snapshot.demoLabel, /synthetic fixture/i);

  const base = await runtime.request("/api/rooms", {
    method: "POST",
    body: { nickname: "BaseHost", mode: "base" },
  });
  // GAME-001: the real base game is approved; it is a separate, non-demo mode.
  assert.equal(base.response.status, 201);
  assert.equal(base.json.snapshot.mode, "base");
  assert.equal("demo" in base.json.snapshot, false);
  assert.equal("setup" in base.json.snapshot, false);
  const expansion = await runtime.request("/api/rooms", {
    method: "POST",
    body: { nickname: "ExpansionHost", mode: "setup_demo", enabledSetIds: ["fixture.expansion"] },
  });
  assert.notEqual(expansion.response.status, 201);
  assert.equal("sessionToken" in expansion.json, false);
});
