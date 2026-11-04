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
  private tail: Promise<unknown> = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
  async setAlarm(): Promise<void> {}
  transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => callback(this));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

type Session = { nickname: string; playerId: string; sessionToken: string };

function runtime() {
  const rooms = new Map<string, RoomDurableObject>();
  let id = 0;
  let session = 0;
  let ip = 0;
  const namespace = {
    idFromName: (name: string) => name,
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
          now: () => 50_000,
          randomUUID: () => `id-${++id}`,
          sessionToken: () => `base-session-${++session}`,
          shuffle: (values) => [...values],
        });
        rooms.set(code, room);
      }
      return { fetch: (request: Request) => room!.fetch(request) };
    },
  } satisfies WorkerEnv["ROOMS"];

  async function request(
    path: string,
    options: { method?: "GET" | "POST"; body?: unknown; token?: string } = {},
  ) {
    const headers = new Headers({ "cf-connecting-ip": `base-${++ip}` });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    const response = await routeRequest(new Request(`https://local.test${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }), { ROOMS: namespace });
    return { response, json: await response.json() as any };
  }

  const api = {
    request,
    create: (nickname: string) =>
      request("/api/rooms", { method: "POST", body: { nickname, mode: "base" } }),
    join: (code: string, nickname: string) =>
      request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname } }),
    snapshot: (code: string, token: string) => request(`/api/rooms/${code}/snapshot`, { token }),
    disconnect: (code: string, token: string) => request(`/api/rooms/${code}/disconnect`, { method: "POST", token }),
    command: (code: string, token: string, body: Record<string, unknown>) =>
      request(`/api/rooms/${code}/commands`, { method: "POST", token, body }),
  };
  return api;
}

type Api = ReturnType<typeof runtime>;

async function seatPlayers(api: Api, count: number) {
  const host = await api.create("Host");
  assert.equal(host.response.status, 201);
  const code = host.json.roomCode as string;
  const players: Session[] = [{
    nickname: "Host",
    playerId: host.json.snapshot.you.playerId,
    sessionToken: host.json.sessionToken,
  }];
  for (let index = 1; index < count; index += 1) {
    const joined = await api.join(code, `Player${index + 1}`);
    assert.equal(joined.response.status, 201);
    players.push({
      nickname: `Player${index + 1}`,
      playerId: joined.json.snapshot.you.playerId,
      sessionToken: joined.json.sessionToken,
    });
  }
  return { code, players };
}

let seq = 0;
async function send(api: Api, code: string, who: Session, kind: string, payload = {}, revision?: number) {
  const expectedRevision = revision ?? (await api.snapshot(code, who.sessionToken)).json.snapshot.revision;
  return api.command(code, who.sessionToken, { commandId: `cmd-${++seq}`, expectedRevision, kind, payload });
}

async function startGame(api: Api, code: string, players: Session[]) {
  const begun = await send(api, code, players[0], "BEGIN_LEADER_SELECTION");
  assert.equal(begun.json.outcome.code, "ACCEPTED");
  const pool: string[] = begun.json.snapshot.game.leaderPool;
  for (let index = 0; index < players.length; index += 1) {
    const selected = await send(api, code, players[index], "SELECT_PARTY_LEADER", { leaderId: pool[index] });
    assert.equal(selected.json.outcome.code, "ACCEPTED");
  }
  const started = await send(api, code, players[0], "START_GAME");
  assert.equal(started.json.outcome.code, "ACCEPTED");
  return started.json.snapshot;
}

test("base: create returns a server room code and room+nickname reconnects the same seat", async () => {
  const api = runtime();
  const host = await api.create("Host");
  assert.equal(host.response.status, 201);
  assert.match(host.json.roomCode, /^[A-Z2-9]{6}$/);
  const view = host.json.snapshot;
  assert.equal(view.mode, "base");
  assert.equal("demo" in view, false);
  assert.equal("demoLabel" in view, false);
  assert.equal(view.game.phase, "lobby");
  assert.equal(view.game.leaderPool.length, 6);
  assert.ok(view.game.leaderPool.every((id: string) => id.startsWith("hts.base.v1.party-leader.")));

  const code = host.json.roomCode;
  const guest = await api.join(code.toLowerCase(), "Guest");
  assert.equal(guest.response.status, 201);
  assert.equal(guest.json.snapshot.players.length, 2);

  const activeDuplicate = await api.join(code, "  guest ");
  assert.equal(activeDuplicate.response.status, 409);
  assert.equal(activeDuplicate.json.error.code, "SESSION_ACTIVE");
  assert.equal((await api.disconnect(code, guest.json.sessionToken)).response.status, 200);
  const duplicate = await api.join(code, "  guest ");
  assert.equal(duplicate.response.status, 201);
  assert.equal(duplicate.json.snapshot.you.playerId, guest.json.snapshot.you.playerId);
  assert.notEqual(duplicate.json.sessionToken, guest.json.sessionToken);
  assert.equal((await api.snapshot(code, guest.json.sessionToken)).response.status, 401);

  // Reload: same token → same seat, no new player.
  const reload = await api.snapshot(code, duplicate.json.sessionToken);
  assert.equal(reload.response.status, 200);
  assert.equal(reload.json.snapshot.you.playerId, guest.json.snapshot.you.playerId);
  assert.equal(reload.json.snapshot.players.length, 2);

  const bad = await api.snapshot(code, "not-a-session");
  assert.equal(bad.response.status, 401);
  const missing = await api.join("ZZZZZZ", "Nobody");
  assert.equal(missing.response.status, 404);
});

test("base: capacity is 2–6; a seventh join is rejected and solo start is refused", async () => {
  const api = runtime();
  const solo = await seatPlayers(api, 1);
  const soloStart = await send(api, solo.code, solo.players[0], "BEGIN_LEADER_SELECTION");
  assert.equal(soloStart.json.outcome.code, "NOT_ENOUGH_PLAYERS");

  const { code } = await seatPlayers(api, 6);
  const seventh = await api.join(code, "Seventh");
  assert.equal(seventh.response.status, 409);
  assert.equal(seventh.json.error.code, "ROOM_FULL");
});

test("base: host-only start, sequential unique leaders, join locked, real deal and turn order", async () => {
  const api = runtime();
  const { code, players } = await seatPlayers(api, 3);
  const guestBegin = await send(api, code, players[1], "BEGIN_LEADER_SELECTION");
  assert.equal(guestBegin.json.outcome.code, "FORBIDDEN");

  const begun = await send(api, code, players[0], "BEGIN_LEADER_SELECTION");
  assert.equal(begun.json.snapshot.game.phase, "leader_selection");
  assert.equal(begun.json.snapshot.game.selectionPlayerId, players[0].playerId);
  const late = await api.join(code, "Late");
  assert.equal(late.response.status, 409);
  assert.equal(late.json.error.code, "SETUP_LOCKED");

  const pool: string[] = begun.json.snapshot.game.leaderPool;
  const early = await send(api, code, players[1], "SELECT_PARTY_LEADER", { leaderId: pool[1] });
  assert.equal(early.json.outcome.code, "NOT_ACTIVE_SELECTOR");
  assert.equal((await send(api, code, players[0], "SELECT_PARTY_LEADER", { leaderId: pool[0] })).json.outcome.code, "ACCEPTED");
  const taken = await send(api, code, players[1], "SELECT_PARTY_LEADER", { leaderId: pool[0] });
  assert.equal(taken.json.outcome.code, "LEADER_TAKEN");
  const fixture = await send(api, code, players[1], "SELECT_PARTY_LEADER", { leaderId: "fixture.setup.leader.2" });
  assert.equal(fixture.json.outcome.code, "LEADER_NOT_AVAILABLE");
  const incomplete = await send(api, code, players[0], "START_GAME");
  assert.equal(incomplete.json.outcome.code, "SELECTION_INCOMPLETE");
  assert.equal((await send(api, code, players[1], "SELECT_PARTY_LEADER", { leaderId: pool[1] })).json.outcome.code, "ACCEPTED");
  assert.equal((await send(api, code, players[2], "SELECT_PARTY_LEADER", { leaderId: pool[2] })).json.outcome.code, "ACCEPTED");
  const guestStart = await send(api, code, players[1], "START_GAME");
  assert.equal(guestStart.json.outcome.code, "FORBIDDEN");

  const started = await send(api, code, players[0], "START_GAME");
  const view = started.json.snapshot;
  assert.equal(view.game.phase, "turn_active");
  assert.deepEqual(view.players.map((p: any) => p.leaderId), pool.slice(0, 3));
  assert.ok(view.players.every((p: any) => p.handCount === 5));
  assert.equal(view.game.mainDeckCount, 115 - 15);
  assert.equal(view.game.faceUpMonsters.length, 3);
  assert.ok(view.game.faceUpMonsters.every((m: any) => m.kind === "monster" && m.definitionId.startsWith("hts.base.v1.")));
  assert.equal(view.game.monsterDeckCount, 12);
  assert.equal(view.game.discardCount, 0);
  assert.deepEqual(view.game.turnOrder, [players[2].playerId, players[0].playerId, players[1].playerId]);
  assert.equal(view.game.currentPlayerId, players[2].playerId);
  assert.equal(view.game.actionPoints, 3);
  assert.ok(view.yourHand.every((c: any) => c.cardId.startsWith(`${c.definitionId}#`)));
  assert.ok(view.yourHand.every((c: any) => !String(c.cardId).startsWith("fixture.")));
});

test("base: hands are viewer-private in every snapshot", async () => {
  const api = runtime();
  const { code, players } = await seatPlayers(api, 3);
  await startGame(api, code, players);
  const views = await Promise.all(players.map((p) => api.snapshot(code, p.sessionToken)));
  for (const [index, result] of views.entries()) {
    const view = result.json.snapshot;
    assert.equal(view.you.playerId, players[index].playerId);
    assert.equal(view.yourHand.length, 5);
    assert.ok(view.players.every((p: any) => !("hand" in p) && !("yourHand" in p)));
    const raw = JSON.stringify(result.json);
    for (const [otherIndex, other] of views.entries()) {
      if (otherIndex === index) continue;
      for (const card of other.json.snapshot.yourHand) {
        assert.equal(raw.includes(`"${card.cardId}"`), false, "another seat's card leaked");
      }
    }
    assert.equal(raw.includes("sessionTokenHash"), false);
    assert.equal(raw.includes("mainDeck\":["), false);
  }
});

test("base: DRAW / REDRAW / END_TURN with AP, turn ownership, idempotency and stale revision", async () => {
  const api = runtime();
  const { code, players } = await seatPlayers(api, 2);
  const started = await startGame(api, code, players);
  const [hostP, guestP] = players;
  assert.equal(started.game.currentPlayerId, guestP.playerId, "last selector goes first");

  const notYours = await send(api, code, hostP, "DRAW_CARD");
  assert.equal(notYours.json.outcome.code, "NOT_YOUR_TURN");

  const rev = started.revision;
  const drawBody = { commandId: "draw-once", expectedRevision: rev, kind: "DRAW_CARD", payload: {} };
  const drawn = await api.command(code, guestP.sessionToken, drawBody);
  assert.equal(drawn.json.outcome.code, "ACCEPTED");
  assert.equal(drawn.json.snapshot.yourHand.length, 6);
  assert.equal(drawn.json.snapshot.game.actionPoints, 2);
  assert.equal(drawn.json.snapshot.revision, rev + 1);

  const replay = await api.command(code, guestP.sessionToken, drawBody);
  assert.equal(replay.json.outcome.replayed, true);
  assert.equal(replay.json.outcome.code, "ACCEPTED");
  assert.equal(replay.json.snapshot.yourHand.length, 6, "replay does not draw again");
  const conflict = await api.command(code, guestP.sessionToken, { ...drawBody, kind: "END_TURN" });
  assert.equal(conflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");

  const stale = await api.command(code, guestP.sessionToken, {
    commandId: "stale", expectedRevision: rev, kind: "DRAW_CARD", payload: {},
  });
  assert.equal(stale.json.outcome.code, "STALE_REVISION");
  assert.equal(stale.json.snapshot.yourHand.length, 6);

  const redrawLow = await send(api, code, guestP, "REDRAW_HAND");
  assert.equal(redrawLow.json.outcome.code, "INSUFFICIENT_AP");

  const ended = await send(api, code, guestP, "END_TURN");
  assert.equal(ended.json.outcome.code, "ACCEPTED");
  assert.equal(ended.json.snapshot.game.currentPlayerId, hostP.playerId);
  assert.equal(ended.json.snapshot.game.actionPoints, 3, "AP does not carry over");
  assert.equal(ended.json.snapshot.game.turnNumber, 2);

  const before = (await api.snapshot(code, hostP.sessionToken)).json.snapshot;
  const redraw = await send(api, code, hostP, "REDRAW_HAND");
  const after = redraw.json.snapshot;
  assert.equal(redraw.json.outcome.code, "ACCEPTED");
  assert.equal(after.yourHand.length, 5);
  assert.equal(after.game.discardCount, 5);
  const oldIds = new Set(before.yourHand.map((c: any) => c.cardId));
  assert.ok(after.yourHand.every((c: any) => !oldIds.has(c.cardId)));
  assert.equal(after.game.currentPlayerId, guestP.playerId, "spending 3 AP ends the turn");
  const total = after.players.reduce((n: number, p: any) => n + p.handCount, 0) +
    after.game.mainDeckCount + after.game.discardCount;
  assert.equal(total, 115);
});

test("base: demo-only commands are rejected as MODE_MISMATCH without changing state", async () => {
  const api = runtime();
  const { code, players } = await seatPlayers(api, 2);
  const started = await startGame(api, code, players);
  for (const body of [
    { kind: "OPEN_REACTION_DEMO", payload: { reactionKind: "modifier" } },
    { kind: "START_EFFECT_DEMO", payload: {} },
    { kind: "PLAY_CARD", payload: { cardInstanceId: started.yourHand[0].cardId } },
    { kind: "SKIP_REACTION", payload: { windowId: "w" } },
  ]) {
    const result = await api.command(code, players[1].sessionToken, {
      commandId: `mm-${body.kind}`, expectedRevision: started.revision, ...body,
    });
    assert.equal(result.json.outcome.code, "MODE_MISMATCH", body.kind);
    assert.equal(result.json.snapshot.revision, started.revision);
  }
});
