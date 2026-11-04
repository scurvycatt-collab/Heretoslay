// Room lifecycle (owner 2026-11-04): idle expiry after 5 min without PLAYER activity, bots/timers pause
// while no human is present, explicit leave.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ROOM_IDLE_MS,
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
  async deleteAll(): Promise<void> {
    this.values.clear();
    this.alarmAt = null;
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
async function send(rt: Rt, code: string, p: Player, kind: string, payload: Record<string, unknown> = {}) {
  const expectedRevision = (await snap(rt, code, p)).revision;
  return (await rt.request(`/api/rooms/${code}/commands`, { method: "POST", token: p.token, body: { commandId: `l-${++seq}`, expectedRevision, kind, payload } })).json;
}
/** First Leader nobody holds yet (Shadow Claw skipped: banned at 2 players). */
function freeLeader(view: any): string {
  const taken = new Set(view.players.map((p: any) => p.leaderId).filter(Boolean));
  return view.game.leaderPool.find((id: string) => !taken.has(id) && !id.endsWith("the-shadow-claw"));
}
async function hostRoom(rt: Rt) {
  const host = await rt.request("/api/rooms", { method: "POST", body: { nickname: "Ann", mode: "base" } });
  return { code: host.json.roomCode as string, a: { playerId: host.json.snapshot.you.playerId, token: host.json.sessionToken } as Player };
}


const roomState = (rt: Rt) => rt.rooms[0].storage.values.get("room-state-v2") as any;

test("Idle expiry: the alarm is set 5 min after creation and deletes the room when nobody acted", async () => {
  const rt = runtime();
  const { code } = await hostRoom(rt);
  assert.equal(rt.rooms[0].storage.alarmAt, rt.clock.now + ROOM_IDLE_MS);
  rt.clock.now += ROOM_IDLE_MS - 1_000;
  await rt.rooms[0].room.alarm();
  assert.ok(roomState(rt), "still alive just before the limit");
  rt.clock.now += 2_000;
  await rt.rooms[0].room.alarm();
  assert.equal(roomState(rt), undefined, "room storage wiped");
  assert.equal((await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "Late" } })).status, 404);
});

test("Idle expiry: a player command pushes the deadline out; snapshot polling alone does not", async () => {
  const rt = runtime();
  const { code, a } = await hostRoom(rt);
  rt.clock.now += 4 * 60_000;
  assert.equal((await send(rt, code, a, "ADD_BOT")).outcome.code, "ACCEPTED");
  assert.equal(rt.rooms[0].storage.alarmAt, rt.clock.now + ROOM_IDLE_MS);
  rt.clock.now += 4 * 60_000;
  for (let i = 0; i < 5; i += 1) { await snap(rt, code, a); rt.clock.now += 10_000; } // polling only
  await rt.rooms[0].room.alarm();
  assert.ok(roomState(rt), "4 min 50 s after the command: alive");
  rt.clock.now += 30_000;
  await rt.rooms[0].room.alarm();
  assert.equal(roomState(rt), undefined, "polling is presence, not activity: the room expired");
});

test("Bots and timers freeze while no human is present and resume with shifted deadlines", async () => {
  const rt = runtime();
  const { code, a } = await hostRoom(rt);
  await send(rt, code, a, "ADD_BOT");
  await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: freeLeader(await snap(rt, code, a)) });
  await send(rt, code, a, "SET_READY", { ready: true });
  const started = await send(rt, code, a, "START_GAME");
  assert.equal(started.outcome.code, "ACCEPTED");
  const before = (await snap(rt, code, a)).revision;
  const deadlineBefore = (await snap(rt, code, a)).game.turnDeadlineAt as number;
  // The human closes the tab: no more polls. A minute passes and the alarm fires.
  rt.clock.now += 60_000;
  await rt.rooms[0].room.alarm();
  assert.notEqual(roomState(rt).pausedAt, null, "room is paused");
  assert.equal(roomState(rt).revision, before, "nothing happened while paused (no auto-pass, no bot move)");
  // The human returns: deadlines moved forward by the paused time.
  const back = await snap(rt, code, a);
  assert.equal(roomState(rt).pausedAt, null);
  const slack = back.game.turnDeadlineAt - deadlineBefore;
  assert.ok(slack >= 30_000 && slack <= 60_000, `deadline shifted by ~the pause (got ${slack})`);
  assert.equal(back.game.currentPlayerId, a.playerId, "still the human's turn");
});

test("Leaving: a lobby seat is freed, the host passes to the next human; leaving counts as activity", async () => {
  const rt = runtime();
  const { code, a } = await hostRoom(rt);
  const joined = await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "Bob" } });
  const b: Player = { playerId: joined.json.snapshot.you.playerId, token: joined.json.sessionToken };
  assert.equal((await snap(rt, code, a)).players.length, 2);
  rt.clock.now += 2 * 60_000;
  assert.equal((await rt.request(`/api/rooms/${code}/leave`, { method: "POST", token: a.token })).status, 200);
  const view = await snap(rt, code, b);
  assert.equal(view.players.length, 1);
  assert.equal(view.you.isHost, true, "Bob is the host now");
  assert.equal(rt.rooms[0].storage.alarmAt, rt.clock.now + ROOM_IDLE_MS);
  assert.equal((await rt.request(`/api/rooms/${code}/snapshot`, { token: a.token })).status, 401, "Ann's session is gone");
});
