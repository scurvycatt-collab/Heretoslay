// GAME-002 through the Durable Object: commands over HTTP, reaction windows,
// alarm-driven deadline, idempotent retry, privacy.
import assert from "node:assert/strict";
import test from "node:test";

import {
  RoomDurableObject,
  type DurableObjectContextLike,
  type DurableObjectStorageLike,
  type DurableObjectTransactionLike,
} from "../apps/worker/src/room.ts";
import { routeRequest, type WorkerEnv } from "../apps/worker/src/router.ts";

class MemoryStorage implements DurableObjectStorageLike, DurableObjectTransactionLike {
  readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
  async setAlarm(at: number): Promise<void> {
    this.alarmAt = at;
  }
  transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => callback(this));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

function runtime() {
  const clock = { now: 100_000 };
  const dice: Array<[number, number]> = [];
  const rooms: Array<{ room: RoomDurableObject; storage: MemoryStorage }> = [];
  let id = 0;
  let ip = 0;
  const byCode = new Map<string, { room: RoomDurableObject; storage: MemoryStorage }>();
  const namespace = {
    idFromName: (name: string) => name,
    get(roomId: unknown) {
      const code = String(roomId);
      let entry = byCode.get(code);
      if (!entry) {
        const storage = new MemoryStorage();
        const context: DurableObjectContextLike = { storage, blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb() };
        const room = new RoomDurableObject(context, {
          now: () => clock.now,
          randomUUID: () => `id-${++id}`,
          sessionToken: () => `tok-${++id}`,
          shuffle: (values) => [...values],
          rollDice: () => dice.shift() ?? [1, 1],
        });
        entry = { room, storage };
        byCode.set(code, entry);
        rooms.push(entry);
      }
      const room = entry.room;
      return { fetch: (request: Request) => room.fetch(request) };
    },
  } satisfies WorkerEnv["ROOMS"];
  async function request(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
    const headers = new Headers({ "cf-connecting-ip": `t-${++ip}` });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    const response = await routeRequest(
      new Request(`https://local.test${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
      { ROOMS: namespace },
    );
    return { status: response.status, json: (await response.json()) as any };
  }
  return { clock, dice, rooms, request };
}

type Rt = ReturnType<typeof runtime>;
type Player = { playerId: string; token: string };

let seq = 0;
async function snap(rt: Rt, code: string, p: Player) {
  return (await rt.request(`/api/rooms/${code}/snapshot`, { token: p.token })).json.snapshot;
}
async function send(rt: Rt, code: string, p: Player, kind: string, payload: Record<string, unknown> = {}, commandId = `k-${++seq}`) {
  const expectedRevision = (await snap(rt, code, p)).revision;
  return (await rt.request(`/api/rooms/${code}/commands`, { method: "POST", token: p.token, body: { commandId, expectedRevision, kind, payload } })).json;
}

async function twoPlayerGame(rt: Rt) {
  const host = await rt.request("/api/rooms", { method: "POST", body: { nickname: "Ann", mode: "base" } });
  const code = host.json.roomCode as string;
  const a: Player = { playerId: host.json.snapshot.you.playerId, token: host.json.sessionToken };
  const joined = await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "Bob" } });
  const b: Player = { playerId: joined.json.snapshot.you.playerId, token: joined.json.sessionToken };
  await send(rt, code, a, "BEGIN_LEADER_SELECTION");
  await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" });
  await send(rt, code, b, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-divine-arrow" });
  const started = await send(rt, code, a, "START_GAME");
  assert.equal(started.outcome.code, "ACCEPTED");
  // Last selector (Bob) goes first.
  assert.equal(started.snapshot.game.currentPlayerId, b.playerId);
  return { code, a, b };
}

test("GAME-002 over HTTP: play Hero, Skip by the other player, immediate-roll choice, idempotent retry", async () => {
  const rt = runtime();
  const { code, a, b } = await twoPlayerGame(rt);
  const hand = (await snap(rt, code, b)).yourHand;
  const hero = hand.find((card: any) => card.kind === "hero");
  assert.ok(hero.name.length > 0);
  const played = await send(rt, code, b, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId }, "play-1");
  assert.equal(played.outcome.code, "ACCEPTED");
  const chain = played.snapshot.game.chain;
  assert.equal(chain.step, "challenge_window");
  assert.deepEqual(Object.keys(chain.responders), [a.playerId]);
  // Same commandId + same body → stored outcome, nothing consumed twice.
  const replay = await rt.request(`/api/rooms/${code}/commands`, {
    method: "POST",
    token: b.token,
    body: { commandId: "play-1", expectedRevision: played.outcome.revision - 1, kind: "PLAY_HAND_CARD", payload: { cardInstanceId: hero.cardId } },
  });
  assert.equal(replay.json.outcome.replayed, true);
  assert.equal(replay.json.snapshot.game.actionPoints, 2);
  const passed = await send(rt, code, a, "REACT_PASS", { windowId: chain.windowId });
  assert.equal(passed.outcome.code, "ACCEPTED");
  const view = await snap(rt, code, b);
  assert.equal(view.players.find((p: any) => p.playerId === b.playerId).party[0].hero.cardId, hero.cardId);
  assert.equal(view.game.chain.step, "immediate_roll_choice");
  assert.equal((await send(rt, code, b, "IMMEDIATE_ROLL", { choice: "skip" })).outcome.code, "ACCEPTED");
  // Opponent never sees Bob's hand.
  const other = await snap(rt, code, a);
  assert.equal(JSON.stringify(other).includes(hand[1].cardId), false);
});

test("GAME-002 over HTTP: expired Challenge window is closed by the alarm (revision bumps once)", async () => {
  const rt = runtime();
  const { code, b } = await twoPlayerGame(rt);
  const hero = (await snap(rt, code, b)).yourHand.find((card: any) => card.kind === "hero");
  const played = await send(rt, code, b, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
  const storage = rt.rooms[0].storage;
  assert.equal(storage.alarmAt, played.snapshot.game.chain.deadlineAt);
  rt.clock.now = storage.alarmAt! - 1;
  await rt.rooms[0].room.alarm();
  assert.equal((await snap(rt, code, b)).revision, played.outcome.revision);
  rt.clock.now = storage.alarmAt!;
  await rt.rooms[0].room.alarm();
  await rt.rooms[0].room.alarm(); // retry is a no-op
  const view = await snap(rt, code, b);
  assert.equal(view.revision, played.outcome.revision + 1);
  assert.equal(view.game.chain.step, "immediate_roll_choice");
  assert.equal(storage.alarmAt, view.game.chain.deadlineAt);
});

test("GAME-002 over HTTP: turn commands are rejected while a window is open; reactions from the right players only", async () => {
  const rt = runtime();
  const { code, a, b } = await twoPlayerGame(rt);
  const hero = (await snap(rt, code, b)).yourHand.find((card: any) => card.kind === "hero");
  const played = await send(rt, code, b, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
  assert.equal((await send(rt, code, b, "END_TURN")).outcome.code, "CHAIN_PENDING");
  assert.equal((await send(rt, code, b, "REACT_PASS", { windowId: played.snapshot.game.chain.windowId })).outcome.code, "NOT_ELIGIBLE");
  assert.equal((await send(rt, code, a, "REACT_PASS", { windowId: "nope" })).outcome.code, "STALE_WINDOW");
  const bad = await rt.request(`/api/rooms/${code}/commands`, {
    method: "POST",
    token: a.token,
    body: { commandId: "x1", expectedRevision: 0, kind: "REACT_MODIFIER", payload: { windowId: "w", cardInstanceId: "c", value: "big" } },
  });
  assert.equal(bad.status, 400);
});
