// Lobby Leader pick, bots and the turn timer (owner 2026-11-03) through the Durable Object.
// Bots are server-driven seats; the turn timer resets on AP spend and pauses during chains.
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

test("Lobby: players pick Leaders in the lobby, last picker goes first, host starts from the lobby", async () => {
  const rt = runtime();
  const { code, a } = await hostRoom(rt);
  const joined = await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "Bob" } });
  const b: Player = { playerId: joined.json.snapshot.you.playerId, token: joined.json.sessionToken };
  assert.equal((await send(rt, code, a, "START_GAME")).outcome.code, "SELECTION_INCOMPLETE");
  assert.equal((await send(rt, code, b, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-divine-arrow" })).outcome.code, "ACCEPTED");
  assert.equal((await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-divine-arrow" })).outcome.code, "LEADER_TAKEN");
  assert.equal((await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" })).outcome.code, "ACCEPTED");
  // Shadow Claw is banned at 2 players; changing a pick in the lobby is allowed.
  assert.equal((await send(rt, code, b, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-shadow-claw" })).outcome.code, "ACCEPTED");
  assert.equal((await send(rt, code, a, "START_GAME")).outcome.code, "LEADER_NOT_AVAILABLE");
  assert.equal((await send(rt, code, b, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-divine-arrow" })).outcome.code, "ACCEPTED");
  assert.equal((await send(rt, code, b, "START_GAME")).outcome.code, "FORBIDDEN");
  const started = await send(rt, code, a, "START_GAME");
  assert.equal(started.outcome.code, "ACCEPTED");
  assert.equal(started.snapshot.game.phase, "turn_active");
  assert.equal(started.snapshot.game.currentPlayerId, b.playerId, "Bob picked last, so Bob goes first (SETUP-05)");
  assert.equal(started.snapshot.yourHand.length, 5);
});

test("Lobby: host adds bots (auto Leader), removes one; non-host and in-game changes are refused", async () => {
  const rt = runtime();
  const { code, a } = await hostRoom(rt);
  const added = await send(rt, code, a, "ADD_BOT");
  assert.equal(added.outcome.code, "ACCEPTED");
  const bot = added.snapshot.players.find((p: any) => p.isBot);
  assert.equal(bot.nickname, "Bot 1");
  assert.ok(bot.leaderId, "bot picked a Leader");
  assert.notEqual(bot.leaderId, "hts.base.v1.party-leader.the-shadow-claw");
  const second = await send(rt, code, a, "ADD_BOT");
  const bot2 = second.snapshot.players.find((p: any) => p.isBot && p.playerId !== bot.playerId);
  assert.equal(bot2.nickname, "Bot 2");
  assert.notEqual(bot2.leaderId, bot.leaderId);
  assert.equal((await send(rt, code, a, "REMOVE_BOT", { playerId: bot2.playerId })).outcome.code, "ACCEPTED");
  assert.equal((await snap(rt, code, a)).players.length, 2);
  const joined = await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "Bob" } });
  const b: Player = { playerId: joined.json.snapshot.you.playerId, token: joined.json.sessionToken };
  assert.equal((await send(rt, code, b, "ADD_BOT")).outcome.code, "FORBIDDEN");
  await send(rt, code, b, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-protecting-horn" });
  await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: freeLeader(await snap(rt, code, a)) });
  assert.equal((await send(rt, code, a, "START_GAME")).outcome.code, "ACCEPTED");
  assert.equal((await send(rt, code, a, "ADD_BOT")).outcome.code, "INVALID_PHASE");
});

test("Turn timer: 30/60/90 only; expiry ends the turn; spending AP restarts it; paused while a window is open", async () => {
  const rt = runtime();
  const { code, a } = await hostRoom(rt);
  const joined = await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "Bob" } });
  const b: Player = { playerId: joined.json.snapshot.you.playerId, token: joined.json.sessionToken };
  const bad = await rt.request(`/api/rooms/${code}/commands`, { method: "POST", token: a.token, body: { commandId: "bad", expectedRevision: 0, kind: "CONFIGURE_GAME", payload: { turnSeconds: 45 } } });
  assert.equal(bad.status, 400);
  assert.equal((await send(rt, code, a, "CONFIGURE_GAME", { turnSeconds: 30 })).outcome.code, "ACCEPTED");
  await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" });
  await send(rt, code, b, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-divine-arrow" });
  const started = await send(rt, code, a, "START_GAME");
  assert.equal(started.snapshot.game.settings.turnSeconds, 30);
  assert.equal(started.snapshot.game.turnDeadlineAt, rt.clock.now + 30_000);
  // Spending AP restarts the countdown.
  rt.clock.now += 20_000;
  const drew = await send(rt, code, b, "DRAW_CARD");
  assert.equal(drew.outcome.code, "ACCEPTED");
  assert.equal(drew.snapshot.game.turnDeadlineAt, rt.clock.now + 30_000);
  // A window suspends the countdown (null in the snapshot) and it restarts once the window closes.
  const hero = drew.snapshot.yourHand.find((card: any) => card.kind === "hero");
  if (hero) {
    const played = await send(rt, code, b, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
    assert.equal(played.snapshot.game.turnDeadlineAt, null);
    rt.clock.now += 25_000; // Challenge window (20 s) expires; turn timer must not.
    let view = await snap(rt, code, b);
    if (view.game.chain?.step === "immediate_roll_choice") view = (await send(rt, code, b, "IMMEDIATE_ROLL", { choice: "skip" })).snapshot;
    assert.equal(view.game.currentPlayerId, b.playerId);
    assert.equal(view.game.turnDeadlineAt, rt.clock.now + 30_000);
  }
  // Expiry ends the turn even with AP left; the alarm is armed for it.
  const storage = rt.rooms[0].storage;
  const before = await snap(rt, code, b);
  assert.equal(storage.alarmAt, before.game.turnDeadlineAt);
  rt.clock.now = before.game.turnDeadlineAt;
  await rt.rooms[0].room.alarm();
  const after = await snap(rt, code, a);
  assert.equal(after.game.currentPlayerId, a.playerId);
  assert.ok(after.game.log.some((entry: any) => entry.text.includes("Hết giờ lượt")));
  assert.equal(after.game.turnDeadlineAt, rt.clock.now + 30_000);
});

test("Bots: answer reactions at once and play their own turn (paced), then pass the turn back", async () => {
  const rt = runtime();
  const { code, a } = await hostRoom(rt);
  await send(rt, code, a, "ADD_BOT");
  await send(rt, code, a, "SELECT_PARTY_LEADER", { leaderId: freeLeader(await snap(rt, code, a)) });
  const started = await send(rt, code, a, "START_GAME");
  assert.equal(started.outcome.code, "ACCEPTED");
  // The human picked last, so the human moves first. A Hero play is never left waiting on the bot.
  let view = started.snapshot;
  assert.equal(view.game.currentPlayerId, a.playerId);
  const hero = view.yourHand.find((card: any) => card.kind === "hero");
  if (hero) {
    const played = await send(rt, code, a, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
    assert.notEqual(played.snapshot.game.chain?.step, "challenge_window", "bot passed the Challenge window immediately");
  }
  view = await snap(rt, code, a);
  if (view.game.chain?.step === "immediate_roll_choice") await send(rt, code, a, "IMMEDIATE_ROLL", { choice: "skip" });
  await send(rt, code, a, "END_TURN");
  view = await snap(rt, code, a);
  const botId = view.players.find((p: any) => p.isBot).playerId;
  assert.equal(view.game.currentPlayerId, botId);
  // Bot acts every ~1.4 s of server time; within a 60 s turn it must hand the turn back.
  for (let i = 0; i < 80 && view.game.currentPlayerId === botId; i += 1) {
    rt.clock.now += 1_500;
    view = await snap(rt, code, a);
    if (view.game.chain && (view.game.chain.responders?.[a.playerId] === "pending")) await send(rt, code, a, "REACT_PASS", { windowId: view.game.chain.windowId });
    if (view.game.chain?.step === "choice" && view.game.chain.playerId === a.playerId) await send(rt, code, a, "RESOLVE_CHOICE", { choiceId: view.game.chain.choiceId, cardInstanceIds: [] });
    view = await snap(rt, code, a);
  }
  assert.ok(view.game.currentPlayerId === a.playerId || view.game.phase === "game_over", "bot finished its turn");
  assert.ok(view.game.log.some((entry: any) => entry.text.startsWith("Bot 1")), "bot took visible actions");
});
