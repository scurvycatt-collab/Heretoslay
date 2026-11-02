import assert from "node:assert/strict";
import test from "node:test";

import {
  RoomDurableObject,
  type DurableObjectContextLike,
  type DurableObjectStorageLike,
  type DurableObjectTransactionLike,
} from "../src/room.ts";

class MemoryStorage implements DurableObjectStorageLike, DurableObjectTransactionLike {
  readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async setAlarm(timestamp: number) { this.alarmAt = timestamp; }
  async transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>) {
    return callback(this);
  }
}

function context(storage: MemoryStorage): DurableObjectContextLike {
  return { storage, blockConcurrencyWhile: async <T>(callback: () => Promise<T>) => callback() };
}

function harness(storage = new MemoryStorage(), initialNow = 1_000, rolls: Array<readonly [number, number]> = []) {
  let now = initialNow;
  let id = 0;
  let token = 0;
  const room = new RoomDurableObject(context(storage), {
    now: () => now,
    randomUUID: () => `id-${++id}`,
    sessionToken: () => `session-${++token}`,
    rollDice: () => rolls.shift() ?? [6, 6],
    shuffle: (items) => [...items],
  });
  return { room, storage, setNow(value: number) { now = value; } };
}

function request(path: string, method: "GET" | "POST", body?: unknown, token?: string, create = false) {
  const headers = new Headers({ "x-room-code": "ABC234" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (create) headers.set("x-internal-operation", "CREATE_ROOM");
  return new Request(`https://room.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response) { return response.json() as Promise<any>; }

async function create(room: RoomDurableObject) {
  return json(await room.fetch(request("/api/rooms/ABC234", "POST", {
    nickname: "Host", mode: "effect_demo", reactionSeconds: 5,
  }, undefined, true)));
}

async function join(room: RoomDurableObject) {
  return json(await room.fetch(request("/api/rooms/ABC234/join", "POST", { nickname: "Guest" })));
}

async function command(room: RoomDurableObject, token: string, value: Record<string, unknown>) {
  return json(await room.fetch(request("/api/rooms/ABC234/commands", "POST", value, token)));
}

async function view(room: RoomDurableObject, token: string) {
  return json(await room.fetch(request("/api/rooms/ABC234/snapshot", "GET", undefined, token)));
}

function totalInstances(state: any): number {
  return state.players.reduce(
    (total: number, player: any) => total + player.hand.length + player.party.length,
    state.discard.length + state.effect.mainDeck.length + (state.effect.pendingCard ? 1 : 0),
  );
}

async function start(room: RoomDurableObject, host: any, guest: any) {
  return command(room, host.sessionToken, {
    commandId: "start",
    expectedRevision: guest.snapshot.revision,
    kind: "START_EFFECT_DEMO",
    payload: {},
  });
}

async function skipWindow(room: RoomDurableObject, host: any, guest: any, snapshot: any, prefix: string) {
  const windowId = snapshot.reaction.windowId;
  await command(room, host.sessionToken, {
    commandId: `${prefix}-host`, expectedRevision: snapshot.revision,
    kind: "SKIP_REACTION", payload: { windowId },
  });
  await command(room, guest.sessionToken, {
    commandId: `${prefix}-guest`, expectedRevision: snapshot.revision,
    kind: "SKIP_REACTION", payload: { windowId },
  });
  return view(room, host.sessionToken);
}

test("Critical Boost and Dodgy Dealer preserve privacy, replay, allowance, conservation, and last-AP timing", async () => {
  const { room, storage } = harness();
  const host = await create(room);
  const guest = await join(room);
  const started = await start(room, host, guest);
  assert.equal(started.outcome.accepted, true);
  const initialState = storage.values.get("room-state-v2") as any;
  const conservedTotal = totalInstances(initialState);
  const hostCards = started.snapshot.yourHand;
  const critical = hostCards.find((card: any) => card.fixtureDefinitionId.includes("critical-boost"));
  const dodgy = hostCards.find((card: any) => card.fixtureDefinitionId.includes("dodgy-dealer"));
  const guestView = await view(room, guest.sessionToken);
  assert.doesNotMatch(JSON.stringify(guestView), new RegExp(critical.instanceId));
  assert.doesNotMatch(JSON.stringify(guestView), new RegExp(dodgy.instanceId));

  const playedCritical = await command(room, host.sessionToken, {
    commandId: "play-critical", expectedRevision: started.snapshot.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
  });
  assert.equal(playedCritical.snapshot.effect.actionPoints, 2);
  const criticalChoice = await skipWindow(room, host, guest, playedCritical.snapshot, "critical-challenge");
  assert.equal(criticalChoice.snapshot.pendingPlay.phase, "critical_boost_discard");
  const discard = criticalChoice.snapshot.yourHand.find((card: any) => card.kind === "inert");
  const discardCommand = {
    commandId: "critical-discard", expectedRevision: criticalChoice.snapshot.revision,
    kind: "CHOOSE_CRITICAL_BOOST_DISCARD", payload: {
      attemptId: criticalChoice.snapshot.pendingPlay.attemptId,
      cardInstanceId: discard.instanceId,
    },
  };
  const criticalDone = await command(room, host.sessionToken, discardCommand);
  assert.equal(criticalDone.outcome.accepted, true);
  assert.equal(criticalDone.snapshot.pendingPlay, null);
  const replay = await command(room, host.sessionToken, discardCommand);
  assert.equal(replay.outcome.replayed, true);
  assert.equal(replay.snapshot.effect.actionPoints, 2);

  const hostAfterCritical = await view(room, host.sessionToken);
  const dodgyAfterDraw = hostAfterCritical.snapshot.yourHand.find(
    (card: any) => card.fixtureDefinitionId.includes("dodgy-dealer"),
  );
  const playedDodgy = await command(room, host.sessionToken, {
    commandId: "play-dodgy", expectedRevision: hostAfterCritical.snapshot.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: dodgyAfterDraw.instanceId },
  });
  const dodgyChoice = await skipWindow(room, host, guest, playedDodgy.snapshot, "dodgy-challenge");
  const immediateSkip = await command(room, host.sessionToken, {
    commandId: "skip-immediate", expectedRevision: dodgyChoice.snapshot.revision,
    kind: "CHOOSE_DODGY_DEALER_IMMEDIATE",
    payload: { attemptId: dodgyChoice.snapshot.pendingPlay.attemptId, choice: "skip" },
  });
  const heroId = immediateSkip.snapshot.players[0].party[0].instanceId;
  assert.equal(immediateSkip.snapshot.yourHeroAllowance[heroId], "available");
  const guestHandBefore = (await view(room, guest.sessionToken)).snapshot.yourHand.map((card: any) => card.instanceId);
  const paid = await command(room, host.sessionToken, {
    commandId: "paid-roll", expectedRevision: immediateSkip.snapshot.revision,
    kind: "ROLL_HERO_EFFECT", payload: {
      heroInstanceId: heroId, targetPlayerId: guest.snapshot.you.playerId,
    },
  });
  assert.equal(paid.snapshot.effect.actionPoints, 0);
  assert.equal(paid.snapshot.yourHeroAllowance[heroId], "used");
  const heroModifier = paid.snapshot.yourHand.find(
    (card: any) => card.kind === "modifier" && card.fixtureDefinitionId.includes("hero-plus-one"),
  );
  await command(room, host.sessionToken, {
    commandId: "paid-modifier", expectedRevision: paid.snapshot.revision,
    kind: "PLAY_MODIFIER", payload: {
      windowId: paid.snapshot.reaction.windowId, cardId: heroModifier.instanceId,
    },
  });
  await command(room, guest.sessionToken, {
    commandId: "paid-guest-skip", expectedRevision: paid.snapshot.revision,
    kind: "SKIP_REACTION", payload: { windowId: paid.snapshot.reaction.windowId },
  });
  const paidDone = await view(room, host.sessionToken);
  assert.equal(paidDone.snapshot.pendingPlay, null);
  assert.equal(paidDone.snapshot.effect.currentPlayerId, guest.snapshot.you.playerId);
  assert.equal(paidDone.snapshot.effect.actionPoints, 3);
  assert.deepEqual(paidDone.snapshot.yourHand.map((card: any) => card.instanceId), guestHandBefore);
  assert.equal(totalInstances(storage.values.get("room-state-v2")), conservedTotal);

  const wrongActor = await command(room, host.sessionToken, {
    commandId: "wrong-end", expectedRevision: paidDone.snapshot.revision,
    kind: "END_TURN", payload: {},
  });
  assert.equal(wrongActor.outcome.code, "NOT_YOUR_TURN");
  assert.equal(wrongActor.snapshot.revision, paidDone.snapshot.revision);

  const endTurnCommand = {
    commandId: "guest-end", expectedRevision: paidDone.snapshot.revision,
    kind: "END_TURN", payload: {},
  };
  const ended = await command(room, guest.sessionToken, endTurnCommand);
  assert.equal(ended.outcome.accepted, true);
  assert.equal(ended.snapshot.effect.currentPlayerId, host.snapshot.you.playerId);
  assert.equal(ended.snapshot.effect.actionPoints, 3);
  assert.equal(ended.snapshot.yourHeroAllowance[heroId], undefined);
  const hostFresh = await view(room, host.sessionToken);
  assert.equal(hostFresh.snapshot.yourHeroAllowance[heroId], "available");

  const endReplay = await command(room, guest.sessionToken, endTurnCommand);
  assert.equal(endReplay.outcome.replayed, true);
  assert.equal(endReplay.snapshot.effect.turnNumber, ended.snapshot.effect.turnNumber);
  const endConflict = await command(room, guest.sessionToken, {
    ...endTurnCommand,
    payload: { unexpected: true },
  });
  assert.equal(endConflict.outcome.code, "IDEMPOTENCY_CONFLICT");
  const stale = await command(room, guest.sessionToken, {
    commandId: "stale-end", expectedRevision: paidDone.snapshot.revision,
    kind: "END_TURN", payload: {},
  });
  assert.equal(stale.outcome.code, "STALE_REVISION");

  const pendingState = storage.values.get("room-state-v2") as any;
  pendingState.effect.actionPoints = 1;
  const beforePending = await view(room, host.sessionToken);
  const pendingRoll = await command(room, host.sessionToken, {
    commandId: "new-turn-paid", expectedRevision: beforePending.snapshot.revision,
    kind: "ROLL_HERO_EFFECT", payload: {
      heroInstanceId: heroId, targetPlayerId: guest.snapshot.you.playerId,
    },
  });
  assert.equal(pendingRoll.snapshot.effect.actionPoints, 0);
  const blockedEnd = await command(room, host.sessionToken, {
    commandId: "pending-end", expectedRevision: pendingRoll.snapshot.revision,
    kind: "END_TURN", payload: {},
  });
  assert.equal(blockedEnd.outcome.code, "PENDING_ACTION_ACTIVE");
  assert.equal(blockedEnd.snapshot.effect.currentPlayerId, host.snapshot.you.playerId);
  assert.equal(blockedEnd.snapshot.effect.actionPoints, 0);
  assert.equal(totalInstances(storage.values.get("room-state-v2")), conservedTotal);
});

test("effect snapshot exposes fixed Modifier metadata only for the viewer hand", async () => {
  const { room } = harness();
  const host = await create(room);
  const guest = await join(room);
  const started = await start(room, host, guest);
  const hostModifiers = started.snapshot.yourHand
    .filter((card: any) => card.kind === "modifier")
    .map((card: any) => card.modifier);
  assert.deepEqual(hostModifiers, [
    { delta: 1, rollTarget: "actor" },
    { delta: 1, rollTarget: "hero" },
  ]);
  assert.equal(
    started.snapshot.yourHand
      .filter((card: any) => card.kind !== "modifier")
      .every((card: any) => card.modifier === undefined),
    true,
  );

  const guestView = await view(room, guest.sessionToken);
  const guestModifiers = guestView.snapshot.yourHand
    .filter((card: any) => card.kind === "modifier")
    .map((card: any) => card.modifier);
  assert.deepEqual(guestModifiers, [
    { delta: 1, rollTarget: "challenger" },
    { delta: 1, rollTarget: "hero" },
  ]);
  assert.doesNotMatch(JSON.stringify(guestView.snapshot.players), /rollTarget|fixtureDefinitionId/);
});

test("Dodgy Dealer immediate roll locks target, consumes allowance on failure, and blocks paid retry", async () => {
  const { room } = harness(undefined, 1_000, [[1, 1]]);
  const host = await create(room);
  const guest = await join(room);
  const started = await start(room, host, guest);
  const dodgy = started.snapshot.yourHand.find((card: any) => card.kind === "hero");
  const played = await command(room, host.sessionToken, {
    commandId: "play-dodgy", expectedRevision: started.snapshot.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: dodgy.instanceId },
  });
  const choice = await skipWindow(room, host, guest, played.snapshot, "challenge-skip");
  const rolling = await command(room, host.sessionToken, {
    commandId: "immediate-roll", expectedRevision: choice.snapshot.revision,
    kind: "CHOOSE_DODGY_DEALER_IMMEDIATE", payload: {
      attemptId: choice.snapshot.pendingPlay.attemptId,
      choice: "roll",
      targetPlayerId: guest.snapshot.you.playerId,
    },
  });
  assert.equal(rolling.snapshot.pendingPlay.lockedTargetPlayerId, guest.snapshot.you.playerId);
  const heroId = rolling.snapshot.players[0].party[0].instanceId;
  assert.equal(rolling.snapshot.yourHeroAllowance[heroId], "used");
  const failed = await skipWindow(room, host, guest, rolling.snapshot, "modifier-skip");
  assert.equal(failed.snapshot.pendingPlay, null);
  assert.equal(failed.snapshot.effect.actionPoints, 2);
  const retry = await command(room, host.sessionToken, {
    commandId: "paid-after-immediate", expectedRevision: failed.snapshot.revision,
    kind: "ROLL_HERO_EFFECT", payload: {
      heroInstanceId: heroId, targetPlayerId: guest.snapshot.you.playerId,
    },
  });
  assert.equal(retry.outcome.code, "HERO_EFFECT_ALREADY_USED");
});

test("Dodgy Dealer immediate-choice timeout deterministically skips and preserves allowance", async () => {
  const { room, setNow } = harness();
  const host = await create(room);
  const guest = await join(room);
  const started = await start(room, host, guest);
  const dodgy = started.snapshot.yourHand.find((card: any) => card.kind === "hero");
  const played = await command(room, host.sessionToken, {
    commandId: "play-dodgy", expectedRevision: started.snapshot.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: dodgy.instanceId },
  });
  const choice = await skipWindow(room, host, guest, played.snapshot, "challenge-skip");
  const heroId = choice.snapshot.players[0].party[0].instanceId;
  setNow(choice.snapshot.pendingPlay.choiceDeadlineAt + 1);
  await room.alarm();
  const timedOut = await view(room, host.sessionToken);
  assert.equal(timedOut.snapshot.pendingPlay, null);
  assert.equal(timedOut.snapshot.yourHeroAllowance[heroId], "available");
  assert.equal(timedOut.snapshot.effect.actionPoints, 2);
});

test("Dodgy Dealer success becomes a no-op when the locked player record is missing", async () => {
  const { room, storage, setNow } = harness(undefined, 1_000, [[6, 6]]);
  const host = await create(room);
  const guest = await join(room);
  const started = await start(room, host, guest);
  const dodgy = started.snapshot.yourHand.find((card: any) => card.kind === "hero");
  const played = await command(room, host.sessionToken, {
    commandId: "play-dodgy", expectedRevision: started.snapshot.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: dodgy.instanceId },
  });
  const choice = await skipWindow(room, host, guest, played.snapshot, "challenge-skip");
  const rolling = await command(room, host.sessionToken, {
    commandId: "immediate-roll", expectedRevision: choice.snapshot.revision,
    kind: "CHOOSE_DODGY_DEALER_IMMEDIATE", payload: {
      attemptId: choice.snapshot.pendingPlay.attemptId,
      choice: "roll",
      targetPlayerId: guest.snapshot.you.playerId,
    },
  });
  const state = storage.values.get("room-state-v2") as any;
  const hostState = state.players.find((player: any) => player.playerId === host.snapshot.you.playerId);
  const hostHandBefore = hostState.hand.map((card: any) => card.cardId);
  state.players = [hostState];
  setNow(rolling.snapshot.reaction.deadlineAt + 1);
  await room.alarm();
  const after = await view(room, host.sessionToken);
  assert.equal(after.snapshot.pendingPlay, null);
  assert.deepEqual(after.snapshot.yourHand.map((card: any) => card.instanceId), hostHandBefore);
  assert.equal(after.snapshot.players.length, 1);
});

test("Challenge success discards both cards and prevents the Magic effect", async () => {
  const { room, storage } = harness(undefined, 1_000, [[1, 1], [6, 6]]);
  const host = await create(room);
  const guest = await join(room);
  const started = await start(room, host, guest);
  const conservedTotal = totalInstances(storage.values.get("room-state-v2"));
  const critical = started.snapshot.yourHand.find((card: any) => card.kind === "magic");
  const played = await command(room, host.sessionToken, {
    commandId: "play", expectedRevision: started.snapshot.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
  });
  const guestSnapshot = await view(room, guest.sessionToken);
  const challenge = guestSnapshot.snapshot.yourHand.find((card: any) => card.kind === "challenge");
  const challenged = await command(room, guest.sessionToken, {
    commandId: "challenge", expectedRevision: played.snapshot.revision,
    kind: "PLAY_CHALLENGE", payload: {
      windowId: played.snapshot.reaction.windowId, cardId: challenge.instanceId,
    },
  });
  const resolved = await skipWindow(room, host, guest, challenged.snapshot, "challenge-modifier");
  assert.equal(resolved.snapshot.pendingPlay, null);
  assert.equal(resolved.snapshot.effect.actionPoints, 2);
  assert.equal(resolved.snapshot.effect.mainDeckCount, 24);
  assert.equal(resolved.snapshot.effect.discardCount, 2);
  assert.equal(totalInstances(storage.values.get("room-state-v2")), conservedTotal);
});

test("Critical Boost accepts partial and zero draws without rollback", async () => {
  for (const available of [2, 0]) {
    const { room, storage } = harness();
    const host = await create(room);
    const guest = await join(room);
    const started = await start(room, host, guest);
    const critical = started.snapshot.yourHand.find((card: any) => card.kind === "magic");
    const played = await command(room, host.sessionToken, {
      commandId: `play-${available}`, expectedRevision: started.snapshot.revision,
      kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
    });
    const state = storage.values.get("room-state-v2") as any;
    state.effect.mainDeck = Array.from({ length: available }, (_, index) => ({
      cardId: `fixture.effect.instance.short.${available}.${index}`,
      fixtureDefinitionId: `fixture.effect.inert.short.${index}`,
      kind: "inert",
    }));
    state.discard = [];
    const conserved = totalInstances(state);
    const choice = await skipWindow(room, host, guest, played.snapshot, `skip-${available}`);
    assert.equal(choice.snapshot.effect.mainDeckCount, 0);
    assert.equal(choice.snapshot.yourHand.length, 3 + available);
    const chosen = choice.snapshot.yourHand[0];
    const done = await command(room, host.sessionToken, {
      commandId: `discard-${available}`, expectedRevision: choice.snapshot.revision,
      kind: "CHOOSE_CRITICAL_BOOST_DISCARD", payload: {
        attemptId: choice.snapshot.pendingPlay.attemptId,
        cardInstanceId: chosen.instanceId,
      },
    });
    assert.equal(done.outcome.accepted, true);
    assert.equal(done.snapshot.pendingPlay, null);
    assert.equal(done.snapshot.yourHand.length, 2 + available);
    assert.equal(totalInstances(storage.values.get("room-state-v2")), conserved);
  }
});

test("persisted Critical Boost choice recovers and times out exactly once", async () => {
  const storage = new MemoryStorage();
  const first = harness(storage);
  const host = await create(first.room);
  const guest = await join(first.room);
  const started = await start(first.room, host, guest);
  const critical = started.snapshot.yourHand.find((card: any) => card.kind === "magic");
  const played = await command(first.room, host.sessionToken, {
    commandId: "play", expectedRevision: started.snapshot.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
  });
  const choice = await skipWindow(first.room, host, guest, played.snapshot, "skip");
  const deadline = choice.snapshot.pendingPlay.choiceDeadlineAt;
  const totalBefore = totalInstances(storage.values.get("room-state-v2"));

  const recovered = harness(storage, deadline + 1);
  await recovered.room.alarm();
  const after = await view(recovered.room, host.sessionToken);
  assert.equal(after.snapshot.pendingPlay, null);
  assert.equal(after.snapshot.effect.discardCount, 2);
  assert.equal(totalInstances(storage.values.get("room-state-v2")), totalBefore);
  const revision = after.snapshot.revision;
  await recovered.room.alarm();
  const twice = await view(recovered.room, host.sessionToken);
  assert.equal(twice.snapshot.revision, revision);
  assert.equal(twice.snapshot.effect.discardCount, 2);
});
