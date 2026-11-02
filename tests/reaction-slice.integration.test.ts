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

function localRuntime() {
  const rooms = new Map<string, RoomDurableObject>();
  let id = 0;
  let session = 0;
  const rolls: Array<readonly [number, number]> = [[2, 3], [4, 5], [3, 4]];
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
          now: () => 1_000,
          randomUUID: () => `id-${++id}`,
          sessionToken: () => `test-session-${++session}`,
          rollDice: () => rolls.shift() ?? [1, 1],
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
    const headers = new Headers({ "cf-connecting-ip": `qa-${rooms.size}` });
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

async function createAndJoin() {
  const runtime = localRuntime();
  const host = await runtime.request("/api/rooms", {
    method: "POST",
    body: { nickname: " Host " },
  });
  assert.equal(host.response.status, 201);
  const code = host.json.roomCode as string;
  const guest = await runtime.request(`/api/rooms/${code}/join`, {
    method: "POST",
    body: { nickname: "Guest" },
  });
  assert.equal(guest.response.status, 201);
  return { runtime, code, host: host.json, guest: guest.json };
}

async function command(
  runtime: ReturnType<typeof localRuntime>,
  code: string,
  token: string,
  body: Record<string, unknown>,
) {
  return runtime.request(`/api/rooms/${code}/commands`, { method: "POST", token, body });
}

test("router-to-Room auth isolates profiles, preserves reload identity, and ignores playerId spoofing", async () => {
  const { runtime, code, host, guest } = await createAndJoin();
  const hostView = await runtime.request(`/api/rooms/${code}/snapshot`, { token: host.sessionToken });
  const guestView = await runtime.request(`/api/rooms/${code}/snapshot`, { token: guest.sessionToken });
  assert.equal(hostView.json.snapshot.you.nickname, "Host");
  assert.equal(guestView.json.snapshot.you.nickname, "Guest");
  assert.notEqual(hostView.json.snapshot.you.playerId, guestView.json.snapshot.you.playerId);
  for (const card of guestView.json.snapshot.yourHand) {
    assert.doesNotMatch(JSON.stringify(hostView.json), new RegExp(card.cardId));
  }

  const reload = await runtime.request(`/api/rooms/${code}/snapshot`, { token: host.sessionToken });
  assert.equal(reload.json.snapshot.you.playerId, hostView.json.snapshot.you.playerId);
  assert.equal(reload.json.snapshot.players.length, 2);
  const unauthorized = await runtime.request(`/api/rooms/${code}/snapshot`, { token: "invalid" });
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.json.error.code, "UNAUTHORIZED");

  const guestOpen = await command(runtime, code, guest.sessionToken, {
    commandId: "guest-open",
    expectedRevision: guestView.json.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "modifier" },
  });
  assert.equal(guestOpen.json.outcome.code, "FORBIDDEN");
  const opened = await command(runtime, code, host.sessionToken, {
    commandId: "host-open",
    expectedRevision: hostView.json.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "modifier" },
  });
  const spoofedSkip = await command(runtime, code, guest.sessionToken, {
    commandId: "guest-skip",
    expectedRevision: opened.json.snapshot.revision,
    kind: "SKIP_REACTION",
    payload: {
      windowId: opened.json.snapshot.reaction.windowId,
      playerId: hostView.json.snapshot.you.playerId,
    },
  });
  assert.equal(spoofedSkip.json.snapshot.reaction.youCompleted, true);
  assert.equal(
    spoofedSkip.json.snapshot.reaction.completedPlayerIds.includes(hostView.json.snapshot.you.playerId),
    false,
  );
});

test("authoritative hand-to-discard is idempotent and a second Modifier leaves state unchanged", async () => {
  const { runtime, code, host, guest } = await createAndJoin();
  const opened = await command(runtime, code, host.sessionToken, {
    commandId: "open-modifier",
    expectedRevision: guest.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "modifier" },
  });
  const guestView = await runtime.request(`/api/rooms/${code}/snapshot`, { token: guest.sessionToken });
  const modifiers = guestView.json.snapshot.yourHand.filter((card: any) => card.kind === "modifier");
  const firstCommand = {
    commandId: "modifier-once",
    expectedRevision: opened.json.snapshot.revision,
    kind: "PLAY_MODIFIER",
    payload: { windowId: opened.json.snapshot.reaction.windowId, cardId: modifiers[0].cardId },
  };
  const first = await command(runtime, code, guest.sessionToken, firstCommand);
  assert.equal(first.json.outcome.accepted, true);
  assert.equal(first.json.snapshot.discardCount, 1);
  assert.equal(first.json.snapshot.yourHand.some((card: any) => card.cardId === modifiers[0].cardId), false);

  const retry = await command(runtime, code, guest.sessionToken, firstCommand);
  assert.equal(retry.json.outcome.replayed, true);
  assert.equal(retry.json.snapshot.discardCount, 1);
  const conflict = await command(runtime, code, guest.sessionToken, {
    ...firstCommand,
    payload: { ...firstCommand.payload, cardId: modifiers[1].cardId },
  });
  assert.equal(conflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(conflict.json.snapshot.discardCount, 1);

  const beforeSecond = JSON.stringify(conflict.json.snapshot);
  const second = await command(runtime, code, guest.sessionToken, {
    commandId: "modifier-twice",
    expectedRevision: opened.json.snapshot.revision,
    kind: "PLAY_MODIFIER",
    payload: { windowId: opened.json.snapshot.reaction.windowId, cardId: modifiers[1].cardId },
  });
  assert.equal(second.json.outcome.code, "MODIFIER_LIMIT_REACHED");
  assert.equal(second.json.snapshot.discardCount, 1);
  assert.equal(second.json.snapshot.yourHand.some((card: any) => card.cardId === modifiers[1].cardId), true);
  assert.equal(second.json.snapshot.revision, conflict.json.snapshot.revision);
  assert.equal(JSON.stringify(second.json.snapshot), beforeSecond);
});

test("concurrent Challenges through the router consume once and keep server-authoritative dice", async () => {
  const { runtime, code, host, guest } = await createAndJoin();
  const other = await runtime.request(`/api/rooms/${code}/join`, {
    method: "POST",
    body: { nickname: "Other" },
  });
  const opened = await command(runtime, code, host.sessionToken, {
    commandId: "open-challenge",
    expectedRevision: other.json.snapshot.revision,
    kind: "OPEN_REACTION_DEMO",
    payload: { reactionKind: "challenge" },
  });
  const guestView = await runtime.request(`/api/rooms/${code}/snapshot`, { token: guest.sessionToken });
  const otherView = await runtime.request(`/api/rooms/${code}/snapshot`, { token: other.json.sessionToken });
  const windowId = opened.json.snapshot.reaction.windowId;
  const makeChallenge = (id: string, cardId: string) => ({
    commandId: id,
    expectedRevision: opened.json.snapshot.revision,
    kind: "PLAY_CHALLENGE",
    payload: { windowId, cardId, playerId: host.snapshot.you.playerId, dice: [6, 6] },
  });
  const [a, b] = await Promise.all([
    command(runtime, code, guest.sessionToken, makeChallenge(
      "challenge-a",
      guestView.json.snapshot.yourHand.find((card: any) => card.kind === "challenge").cardId,
    )),
    command(runtime, code, other.json.sessionToken, makeChallenge(
      "challenge-b",
      otherView.json.snapshot.yourHand.find((card: any) => card.kind === "challenge").cardId,
    )),
  ]);
  const outcomes = [a.json.outcome, b.json.outcome];
  assert.equal(outcomes.filter((outcome) => outcome.accepted).length, 1);
  assert.equal(outcomes.filter((outcome) => !outcome.accepted).length, 1);
  const finalSnapshot = a.json.snapshot.revision > b.json.snapshot.revision ? a.json.snapshot : b.json.snapshot;
  assert.equal(finalSnapshot.discardCount, 1);
  assert.equal(finalSnapshot.reaction.kind, "modifier");
  assert.deepEqual(finalSnapshot.challengeRoll.playedByDice, [2, 3]);
  assert.deepEqual(finalSnapshot.challengeRoll.challengerDice, [4, 5]);
});
