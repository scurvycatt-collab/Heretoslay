// EX-06 room level: packs selected in the lobby are played through the Durable Object with the LIVE catalog,
// survive a Durable Object restart (state reloaded from storage) and a reconnect, and bot tables with all three
// packs run to a winner without a stall or a server error.
import assert from "node:assert/strict";
import test from "node:test";

import { GAME_SET_CATALOG } from "../apps/worker/src/content/live-catalog.ts";
import { EXPANSION_SET_IDS } from "../apps/worker/src/content/set-catalog.ts";
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
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async put<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
  async setAlarm(at: number): Promise<void> { this.alarmAt = at; }
  transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => callback(this));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

/** Small deterministic PRNG so a failing seed can be replayed. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runtime(seed = 1) {
  const clock = { now: 100_000 };
  const rand = mulberry(seed);
  const storages = new Map<string, MemoryStorage>();
  const live = new Map<string, RoomDurableObject>();
  let id = 0;
  let ip = 0;
  const namespace = {
    idFromName: (name: string) => name,
    get(roomId: unknown) {
      const code = String(roomId);
      let room = live.get(code);
      if (!room) {
        let storage = storages.get(code);
        if (!storage) storages.set(code, (storage = new MemoryStorage()));
        const context: DurableObjectContextLike = { storage, blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb() };
        room = new RoomDurableObject(context, {
          now: () => clock.now,
          randomUUID: () => `id-${++id}`,
          sessionToken: () => `tok-${++id}`,
          shuffle: (values) => {
            const out = [...values];
            for (let i = out.length - 1; i > 0; i -= 1) {
              const j = Math.floor(rand() * (i + 1));
              [out[i], out[j]] = [out[j], out[i]];
            }
            return out;
          },
          rollDice: () => [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)],
        });
        live.set(code, room);
      }
      const current = room;
      return { fetch: (request: Request) => current.fetch(request) };
    },
  } satisfies WorkerEnv["ROOMS"];
  async function request(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
    const headers = new Headers({ "cf-connecting-ip": `t-${++ip}` });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    const response = await routeRequest(
      new Request(`https://local.test${path}`, { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }),
      { ROOMS: namespace },
    );
    return { status: response.status, json: (await response.json()) as any };
  }
  /** Evict every in-memory Durable Object: the next request rebuilds the room from storage. */
  const restart = () => live.clear();
  return { clock, request, restart };
}

type Rt = ReturnType<typeof runtime>;
type Player = { playerId: string; token: string };
const PACKS = Object.values(EXPANSION_SET_IDS);
const isExpansion = (id: string) => !id.startsWith("hts.base.v1.");

let seq = 0;
async function snap(rt: Rt, code: string, p: Player) {
  const response = await rt.request(`/api/rooms/${code}/snapshot`, { token: p.token });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  return response.json.snapshot;
}
async function send(rt: Rt, code: string, p: Player, kind: string, payload: Record<string, unknown> = {}) {
  const expectedRevision = (await snap(rt, code, p)).revision;
  const response = await rt.request(`/api/rooms/${code}/commands`, { method: "POST", token: p.token, body: { commandId: `x-${++seq}`, expectedRevision, kind, payload } });
  assert.ok(response.status < 500, `${kind}: HTTP ${response.status} ${JSON.stringify(response.json)}`);
  return response.json;
}
async function hostRoom(rt: Rt) {
  const host = await rt.request("/api/rooms", { method: "POST", body: { nickname: "Ann", mode: "base" } });
  assert.equal(host.status, 201, JSON.stringify(host.json));
  return { code: host.json.roomCode as string, a: { playerId: host.json.snapshot.you.playerId, token: host.json.sessionToken } as Player };
}
function freeLeader(view: any, expansion = false): string {
  const taken = new Set(view.players.map((p: any) => p.leaderId).filter(Boolean));
  return view.game.leaderPool.find((id: string) => !taken.has(id) && !id.endsWith("the-shadow-claw") && (!expansion || isExpansion(id)));
}

test("the lobby offers WD / BN / DS and nothing else", async () => {
  const rt = runtime();
  const { code, a } = await hostRoom(rt);
  const view = await snap(rt, code, a);
  assert.deepEqual(view.game.availableExpansions.map((pack: any) => pack.id), PACKS);
  assert.deepEqual(view.game.availableExpansions.map((pack: any) => pack.name), ["Warriors & Druids", "Berserkers & Necromancers", "Dragon & Sorcerer"]);
  assert.deepEqual([view.game.classGoal, view.game.partyLimit], [6, 6]);
  assert.equal((await send(rt, code, a, "CONFIGURE_GAME", { expansionIds: ["hts.monster-expansion.v1"] })).outcome.code, "UNSUPPORTED_EXPANSION");
});

test("packs survive a Durable Object restart and a reconnect, in the lobby and mid-game", async () => {
  const rt = runtime(7);
  const { code, a } = await hostRoom(rt);
  assert.equal((await send(rt, code, a, "CONFIGURE_GAME", { expansionIds: PACKS })).outcome.code, "ACCEPTED");
  const joined = await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "Bob" } });
  const b: Player = { playerId: joined.json.snapshot.you.playerId, token: joined.json.sessionToken };

  rt.restart();
  let view = await snap(rt, code, a);
  assert.deepEqual(view.game.settings.expansionIds, PACKS, "pack selection reloaded from storage");
  assert.equal(view.game.leaderPool.length, 11);
  assert.deepEqual([view.game.classGoal, view.game.partyLimit], [7, 7]);
  assert.equal(view.game.enabledClasses.length, 11);

  const leaderA = freeLeader(view, true);
  assert.equal((await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: leaderA })).outcome.code, "ACCEPTED");
  assert.equal((await send(rt, code, b, "SELECT_PARTY_LEADER", { leaderId: freeLeader(await snap(rt, code, b), true) })).outcome.code, "ACCEPTED");
  await send(rt, code, b, "SET_READY", { ready: true });
  const started = await send(rt, code, a, "START_GAME");
  assert.equal(started.outcome.code, "ACCEPTED");
  const before = started.snapshot;
  assert.equal(before.game.mainDeckCount + before.yourHand.length + 5, 115 + 31 + 31 + 14, "all three packs are in the main deck");

  rt.restart();
  view = await snap(rt, code, a);
  assert.equal(view.revision, before.revision);
  assert.deepEqual(view.yourHand, before.yourHand, "same private hand after the restart");
  assert.deepEqual(view.game.faceUpMonsters, before.game.faceUpMonsters);
  assert.equal(view.players.find((p: any) => p.playerId === a.playerId).leaderId, leaderA);
  assert.deepEqual(view.game.settings.expansionIds, PACKS);

  // Reconnect: Bob resumes his seat; his hand is his own and Ann's stays hidden.
  const resumed = await rt.request(`/api/rooms/${code}/resume`, { method: "POST", token: b.token, body: {} });
  if (resumed.status === 200) assert.equal(resumed.json.snapshot.you.playerId, b.playerId);
  const bobView = await snap(rt, code, b);
  assert.equal(bobView.yourHand.length, 5);
  assert.ok(!JSON.stringify(bobView).includes(before.yourHand[0].cardId) || bobView.yourHand.some((c: any) => c.cardId === before.yourHand[0].cardId), "Ann's hand is not leaked to Bob");

  // The turn still advances after the restart.
  const current = view.game.currentPlayerId === a.playerId ? a : b;
  assert.equal((await send(rt, code, current, "DRAW_CARD")).outcome.code, "ACCEPTED");
});

for (const [seed, seats] of [[11, 8], [12, 8], [13, 5], [14, 3], [15, 7], [16, 2]] as const) {
  test(`bot table, all packs, ${seats} seats, seed ${seed}: plays to a winner with restarts along the way`, { timeout: 120_000 }, async () => {
    const rt = runtime(seed);
    const { code, a } = await hostRoom(rt);
    assert.equal((await send(rt, code, a, "CONFIGURE_GAME", { expansionIds: PACKS })).outcome.code, "ACCEPTED");
    for (let i = 1; i < seats; i += 1) assert.equal((await send(rt, code, a, "ADD_BOT")).outcome.code, "ACCEPTED", `bot ${i}`);
    await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: freeLeader(await snap(rt, code, a)) });
    assert.equal((await send(rt, code, a, "START_GAME")).outcome.code, "ACCEPTED");

    const seen = new Set<string>();
    let view = await snap(rt, code, a);
    let lastRevision = view.revision;
    let idle = 0;
    for (let step = 0; step < 6_000 && view.game.phase !== "game_over"; step += 1) {
      // The human seat only draws and ends its turn; every reaction / choice it owes resolves by its deadline.
      if (view.game.currentPlayerId === a.playerId && !view.game.chain) {
        if ((view.game.actionPoints ?? 0) > 0 && step % 3 === 0) await send(rt, code, a, "DRAW_CARD");
        else await send(rt, code, a, "END_TURN");
      }
      rt.clock.now += 1_500;
      if (step % 97 === 0) rt.restart();
      view = await snap(rt, code, a);
      for (const seat of view.game.seats ?? view.players) {
        for (const slot of seat.party ?? []) for (const card of [slot.hero, ...(slot.attachments ?? [])]) if (card && isExpansion(card.definitionId)) seen.add(card.definitionId);
      }
      idle = view.revision === lastRevision ? idle + 1 : 0;
      lastRevision = view.revision;
      assert.ok(idle < 400, `stalled at revision ${view.revision}: ${JSON.stringify(view.game.chain ?? view.game.phase)}`);
    }
    assert.equal(view.game.phase, "game_over", `no winner after the step cap (revision ${view.revision})`);
    assert.ok(view.game.winnerPlayerId, "a winner is recorded");
    assert.ok(seen.size > 0, "expansion cards reached the table");
  });
}

test("the live catalog and the lobby agree", () => {
  assert.deepEqual(GAME_SET_CATALOG.expansionSetIds, PACKS);
});
