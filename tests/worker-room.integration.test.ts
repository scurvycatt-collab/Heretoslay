import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const protocolUrl = new URL("../packages/protocol/src/index.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@here-to-slay/protocol") {
      return { url: protocolUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { RoomDurableObject } = await import("../apps/worker/src/room.ts");

class MemoryStorage {
  readonly data = new Map<string, unknown>();
  readonly alarms: number[] = [];
  putCount = 0;

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.putCount += 1;
    this.data.set(key, structuredClone(value));
  }

  async setAlarm(timestamp: number): Promise<void> {
    this.alarms.push(timestamp);
  }

  async transaction<T>(callback: (txn: MemoryStorage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

class MemoryContext {
  readonly storage = new MemoryStorage();
  initialized: Promise<void> = Promise.resolve();

  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T> {
    const pending = callback();
    this.initialized = pending.then(() => undefined);
    return pending;
  }
}

test("Room DO persists initialization and resolves a deadline once across alarm retry (mock storage)", async () => {
  const context = new MemoryContext();
  let now = 1_000;
  let id = 0;
  let token = 0;
  const room = new RoomDurableObject(context as never, {
    now: () => now,
    randomUUID: () => `id-${++id}`,
    sessionToken: () => `test-session-${++token}`,
    rollDice: () => [2, 3] as const,
  });
  await context.initialized;

  const created = await room.fetch(new Request("https://local.test/api/rooms/ABC234", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-operation": "CREATE_ROOM",
      "x-room-code": "ABC234",
    },
    body: JSON.stringify({ nickname: "Host" }),
  }));
  assert.equal(created.status, 201);
  const createdBody = await created.json() as any;
  assert.equal(createdBody.roomCode, "ABC234");
  assert.equal(createdBody.snapshot.revision, 1);
  assert.equal(createdBody.snapshot.players.length, 1);

  const opened = await room.fetch(new Request("https://local.test/api/rooms/ABC234/commands", {
    method: "POST",
    headers: {
      authorization: `Bearer ${createdBody.sessionToken}`,
      "content-type": "application/json",
      "x-room-code": "ABC234",
    },
    body: JSON.stringify({
      commandId: "open-deadline",
      expectedRevision: createdBody.snapshot.revision,
      kind: "OPEN_REACTION_DEMO",
      payload: { reactionKind: "modifier" },
    }),
  }));
  assert.equal(opened.status, 200);
  const openedBody = await opened.json() as any;
  assert.equal(openedBody.snapshot.reaction.resolved, false);
  const deadlineAt = openedBody.snapshot.reaction.deadlineAt as number;
  assert.equal(deadlineAt, 21_000);
  assert.equal(context.storage.alarms.at(-1), deadlineAt);

  now = deadlineAt - 1;
  await room.alarm();
  const early = Array.from(context.storage.data.values())[0] as {
    revision: number;
    reaction: { resolved: boolean };
  };
  assert.equal(early.revision, openedBody.snapshot.revision);
  assert.equal(early.reaction.resolved, false);
  assert.equal(context.storage.alarms.at(-1), deadlineAt);

  now = deadlineAt;
  await room.alarm();
  const resolved = Array.from(context.storage.data.values())[0] as {
    revision: number;
    reaction: { windowId: string; resolved: boolean; closeReason?: string };
  };
  assert.equal(resolved.revision, openedBody.snapshot.revision + 1);
  assert.equal(resolved.reaction.resolved, true);
  assert.equal(resolved.reaction.closeReason, "deadline");

  const putsAfterResolution = context.storage.putCount;
  await room.alarm();
  const retried = Array.from(context.storage.data.values())[0] as { revision: number };
  assert.equal(retried.revision, resolved.revision);
  assert.equal(context.storage.putCount, putsAfterResolution);
});
