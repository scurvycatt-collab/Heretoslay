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

type Cell = { storage: SerialMemoryStorage; room: RoomDurableObject };
let runtimeSerial = 0;

function localRuntime(initialRolls: Array<readonly [number, number]> = []) {
  const runtimeId = ++runtimeSerial;
  const cells = new Map<string, Cell>();
  const rolls = [...initialRolls];
  let now = 1_000;
  let id = 0;
  let session = 0;
  let requestId = 0;
  let rollCalls = 0;

  function makeRoom(storage: SerialMemoryStorage) {
    const context: DurableObjectContextLike = {
      storage,
      blockConcurrencyWhile: async <T>(callback: () => Promise<T>) => callback(),
    };
    return new RoomDurableObject(context, {
      now: () => now,
      randomUUID: () => `effect-id-${++id}`,
      sessionToken: () => `effect-session-${++session}`,
      rollDice: () => {
        rollCalls += 1;
        return rolls.shift() ?? [6, 6];
      },
      shuffle: <T>(items: T[]) => [...items],
    } as any);
  }

  const namespace = {
    idFromName(name: string) { return name; },
    get(roomId: unknown) {
      const code = String(roomId);
      let cell = cells.get(code);
      if (!cell) {
        const storage = new SerialMemoryStorage();
        cell = { storage, room: makeRoom(storage) };
        cells.set(code, cell);
      }
      return { fetch: (request: Request) => cell!.room.fetch(request) };
    },
  } satisfies WorkerEnv["ROOMS"];

  async function request(
    path: string,
    options: { method?: "GET" | "POST"; body?: unknown; token?: string } = {},
  ) {
    const headers = new Headers({ "cf-connecting-ip": `effect-qa-${runtimeId}-${++requestId}` });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    const response = await routeRequest(new Request(`https://local.test${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }), { ROOMS: namespace });
    return { response, json: await response.json() as any };
  }

  return {
    request,
    setNow(value: number) { now = value; },
    getNow() { return now; },
    pushRolls(...values: Array<readonly [number, number]>) { rolls.push(...values); },
    getRollCalls() { return rollCalls; },
    state(code: string) {
      return cells.get(code)!.storage.values.get("room-state-v2") as any;
    },
    restart(code: string) {
      const cell = cells.get(code)!;
      cell.room = makeRoom(cell.storage);
    },
    async alarm(code: string) {
      await cells.get(code)!.room.alarm();
    },
  };
}

type Runtime = ReturnType<typeof localRuntime>;
type Session = { sessionToken: string; snapshot: any };

async function command(runtime: Runtime, code: string, token: string, body: Record<string, unknown>) {
  return runtime.request(`/api/rooms/${code}/commands`, { method: "POST", token, body });
}

async function snapshot(runtime: Runtime, code: string, token: string) {
  return runtime.request(`/api/rooms/${code}/snapshot`, { token });
}

async function createStarted(runtime: Runtime, reactionSeconds = 5) {
  const hostResult = await runtime.request("/api/rooms", {
    method: "POST",
    body: { nickname: "EffectHost", mode: "effect_demo", reactionSeconds },
  });
  assert.equal(hostResult.response.status, 201);
  const code = hostResult.json.roomCode as string;
  const host = hostResult.json as Session;
  const guestResult = await runtime.request(`/api/rooms/${code}/join`, {
    method: "POST",
    body: { nickname: "EffectGuest" },
  });
  assert.equal(guestResult.response.status, 201);
  const guest = guestResult.json as Session;
  const started = await command(runtime, code, host.sessionToken, {
    commandId: "start-effect",
    expectedRevision: guest.snapshot.revision,
    kind: "START_EFFECT_DEMO",
    payload: {},
  });
  assert.equal(started.json.outcome.accepted, true);
  return { code, host, guest, started: started.json.snapshot };
}

async function skipAll(
  runtime: Runtime,
  code: string,
  host: Session,
  guest: Session,
  value: any,
  prefix: string,
) {
  const windowId = value.reaction.windowId;
  for (const [name, player] of [["host", host], ["guest", guest]] as const) {
    const result = await command(runtime, code, player.sessionToken, {
      commandId: `${prefix}-${name}`,
      expectedRevision: value.revision,
      kind: "SKIP_REACTION",
      payload: { windowId },
    });
    assert.equal(result.json.outcome.accepted, true);
  }
  return (await snapshot(runtime, code, host.sessionToken)).json.snapshot;
}

function cardByDefinition(value: any, fragment: string) {
  const card = value.yourHand.find((candidate: any) =>
    candidate.fixtureDefinitionId.includes(fragment)
  );
  assert.ok(card, `expected ${fragment} in private hand`);
  return card;
}

function totalInstances(state: any) {
  return state.players.reduce(
    (total: number, player: any) => total + player.hand.length + player.party.length,
    state.discard.length + state.effect.mainDeck.length + (state.effect.pendingCard ? 1 : 0),
  );
}

function stateDigest(state: any) {
  return structuredClone({
    revision: state.revision,
    players: state.players,
    discard: state.discard,
    reaction: state.reaction,
    effect: state.effect,
    lastChallengeRoll: state.lastChallengeRoll,
  });
}

function configureCriticalSources(
  runtime: Runtime,
  code: string,
  mainCount: number,
  discardCount: number,
  emptyActorHand = false,
) {
  const state = runtime.state(code);
  const pending = state.effect.pendingPlay;
  const actor = state.players.find((player: any) => player.playerId === pending.actorPlayerId);
  const receiver = state.players.find((player: any) => player.playerId !== pending.actorPlayerId);
  const pool = [...state.effect.mainDeck];
  state.effect.mainDeck = pool.splice(0, mainCount);
  state.discard = pool.splice(0, discardCount);
  receiver.hand.push(...pool);
  if (emptyActorHand) receiver.hand.push(...actor.hand.splice(0));
}

test("router effect flow preserves auth, privacy, replay/conflict, paid allowance, swap, last AP, and conservation", async () => {
  const runtime = localRuntime([[5, 4]]);
  const { code, host, guest, started } = await createStarted(runtime);
  const initialTotal = totalInstances(runtime.state(code));
  const critical = cardByDefinition(started, "critical-boost");
  const dodgy = cardByDefinition(started, "dodgy-dealer");

  const guestView = await snapshot(runtime, code, guest.sessionToken);
  assert.equal(JSON.stringify(guestView.json).includes(critical.instanceId), false);
  assert.equal(JSON.stringify(guestView.json).includes(dodgy.instanceId), false);
  const unauthorized = await snapshot(runtime, code, "invalid-session");
  assert.equal(unauthorized.response.status, 401);

  const beforeStale = stateDigest(runtime.state(code));
  const stale = await command(runtime, code, host.sessionToken, {
    commandId: "stale-play",
    expectedRevision: started.revision - 1,
    kind: "PLAY_CARD",
    payload: { cardInstanceId: critical.instanceId },
  });
  assert.equal(stale.json.outcome.code, "STALE_REVISION");
  assert.deepEqual(stateDigest(runtime.state(code)), beforeStale);

  const criticalPlayBody = {
    commandId: "play-critical",
    expectedRevision: started.revision,
    kind: "PLAY_CARD",
    payload: { cardInstanceId: critical.instanceId },
  };
  const playedCritical = await command(runtime, code, host.sessionToken, criticalPlayBody);
  assert.equal(playedCritical.json.outcome.accepted, true);
  assert.equal(playedCritical.json.snapshot.effect.actionPoints, 2);
  const replayedPlay = await command(runtime, code, host.sessionToken, criticalPlayBody);
  assert.equal(replayedPlay.json.outcome.replayed, true);
  assert.equal(replayedPlay.json.snapshot.revision, playedCritical.json.snapshot.revision);
  const playConflict = await command(runtime, code, host.sessionToken, {
    ...criticalPlayBody,
    payload: { cardInstanceId: dodgy.instanceId },
  });
  assert.equal(playConflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(totalInstances(runtime.state(code)), initialTotal);

  const criticalChoice = await skipAll(
    runtime, code, host, guest, playedCritical.json.snapshot, "critical-challenge",
  );
  assert.equal(criticalChoice.pendingPlay.phase, "critical_boost_discard");
  assert.equal(criticalChoice.pendingPlay.youMustChoose, true);
  assert.equal(criticalChoice.effect.mainDeckCount, 21);
  const guestCriticalChoice = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot;
  assert.equal(guestCriticalChoice.pendingPlay.youMustChoose, false);
  for (const card of criticalChoice.yourHand) {
    assert.equal(JSON.stringify(guestCriticalChoice).includes(card.instanceId), false);
  }
  const discardCard = criticalChoice.yourHand.find((card: any) => card.kind === "inert");
  const discardBody = {
    commandId: "critical-discard",
    expectedRevision: criticalChoice.revision,
    kind: "CHOOSE_CRITICAL_BOOST_DISCARD",
    payload: {
      attemptId: criticalChoice.pendingPlay.attemptId,
      cardInstanceId: discardCard.instanceId,
    },
  };
  const criticalDone = await command(runtime, code, host.sessionToken, discardBody);
  assert.equal(criticalDone.json.outcome.accepted, true);
  const replayedDiscard = await command(runtime, code, host.sessionToken, discardBody);
  assert.equal(replayedDiscard.json.outcome.replayed, true);
  assert.equal(totalInstances(runtime.state(code)), initialTotal);

  const hostAfterCritical = (await snapshot(runtime, code, host.sessionToken)).json.snapshot;
  const playedDodgy = await command(runtime, code, host.sessionToken, {
    commandId: "play-dodgy",
    expectedRevision: hostAfterCritical.revision,
    kind: "PLAY_CARD",
    payload: { cardInstanceId: cardByDefinition(hostAfterCritical, "dodgy-dealer").instanceId },
  });
  const dodgyChoice = await skipAll(
    runtime, code, host, guest, playedDodgy.json.snapshot, "dodgy-challenge",
  );
  const immediateSkip = await command(runtime, code, host.sessionToken, {
    commandId: "immediate-skip",
    expectedRevision: dodgyChoice.revision,
    kind: "CHOOSE_DODGY_DEALER_IMMEDIATE",
    payload: { attemptId: dodgyChoice.pendingPlay.attemptId, choice: "skip" },
  });
  assert.equal(immediateSkip.json.outcome.accepted, true);
  const heroId = immediateSkip.json.snapshot.players
    .find((player: any) => player.playerId === host.snapshot.you.playerId)
    .party.find((card: any) => card.fixtureDefinitionId.includes("dodgy-dealer")).instanceId;
  assert.equal(immediateSkip.json.snapshot.yourHeroAllowance[heroId], "available");

  const hostHandBefore = immediateSkip.json.snapshot.yourHand.map((card: any) => card.instanceId);
  const guestHandBefore = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot.yourHand
    .map((card: any) => card.instanceId);
  const paidBody = {
    commandId: "paid-dodgy",
    expectedRevision: immediateSkip.json.snapshot.revision,
    kind: "ROLL_HERO_EFFECT",
    payload: { heroInstanceId: heroId, targetPlayerId: guest.snapshot.you.playerId },
  };
  const paid = await command(runtime, code, host.sessionToken, paidBody);
  assert.equal(paid.json.outcome.accepted, true);
  assert.equal(paid.json.snapshot.effect.actionPoints, 0);
  assert.equal(paid.json.snapshot.yourHeroAllowance[heroId], "used");
  const paidDone = await skipAll(runtime, code, host, guest, paid.json.snapshot, "paid-modifier");
  assert.equal(paidDone.pendingPlay, null);
  assert.equal(paidDone.effect.currentPlayerId, guest.snapshot.you.playerId);
  assert.equal(paidDone.effect.actionPoints, 3);
  assert.deepEqual(paidDone.yourHand.map((card: any) => card.instanceId), guestHandBefore);
  const guestAfter = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot;
  assert.deepEqual(guestAfter.yourHand.map((card: any) => card.instanceId), hostHandBefore);
  const replayedPaid = await command(runtime, code, host.sessionToken, paidBody);
  assert.equal(replayedPaid.json.outcome.replayed, true);
  assert.equal(totalInstances(runtime.state(code)), initialTotal);
});

test("Critical Boost resolves partial/zero sources and Challenge win/loss without rollback", async () => {
  {
    const runtime = localRuntime();
    const { code, host, guest, started } = await createStarted(runtime);
    const total = totalInstances(runtime.state(code));
    const critical = cardByDefinition(started, "critical-boost");
    const played = await command(runtime, code, host.sessionToken, {
      commandId: "partial-play", expectedRevision: started.revision,
      kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
    });
    configureCriticalSources(runtime, code, 1, 1);
    const choice = await skipAll(runtime, code, host, guest, played.json.snapshot, "partial-skip");
    assert.equal(choice.pendingPlay.phase, "critical_boost_discard");
    assert.equal(choice.effect.mainDeckCount, 0);
    assert.equal(choice.effect.discardCount, 0);
    assert.equal(choice.yourHand.length, 5);
    const chosen = choice.yourHand[0];
    const done = await command(runtime, code, host.sessionToken, {
      commandId: "partial-discard", expectedRevision: choice.revision,
      kind: "CHOOSE_CRITICAL_BOOST_DISCARD",
      payload: { attemptId: choice.pendingPlay.attemptId, cardInstanceId: chosen.instanceId },
    });
    assert.equal(done.json.outcome.accepted, true);
    assert.equal(totalInstances(runtime.state(code)), total);
  }

  {
    const runtime = localRuntime();
    const { code, host, guest, started } = await createStarted(runtime);
    const total = totalInstances(runtime.state(code));
    const critical = cardByDefinition(started, "critical-boost");
    const played = await command(runtime, code, host.sessionToken, {
      commandId: "zero-play", expectedRevision: started.revision,
      kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
    });
    configureCriticalSources(runtime, code, 0, 0, true);
    const done = await skipAll(runtime, code, host, guest, played.json.snapshot, "zero-skip");
    assert.equal(done.pendingPlay, null);
    assert.equal(done.effect.mainDeckCount, 0);
    assert.equal(done.effect.discardCount, 1);
    assert.equal(done.yourHand.length, 0);
    assert.equal(done.effect.actionPoints, 2);
    assert.equal(totalInstances(runtime.state(code)), total);
  }

  for (const scenario of [
    { name: "win", rolls: [[1, 1], [6, 6]] as Array<readonly [number, number]>, effectRuns: false },
    { name: "loss", rolls: [[6, 6], [1, 1]] as Array<readonly [number, number]>, effectRuns: true },
  ]) {
    const runtime = localRuntime(scenario.rolls);
    const { code, host, guest, started } = await createStarted(runtime);
    const total = totalInstances(runtime.state(code));
    const critical = cardByDefinition(started, "critical-boost");
    const played = await command(runtime, code, host.sessionToken, {
      commandId: `${scenario.name}-play`, expectedRevision: started.revision,
      kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
    });
    const guestView = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot;
    const challenge = guestView.yourHand.find((card: any) => card.kind === "challenge");
    const challenged = await command(runtime, code, guest.sessionToken, {
      commandId: `${scenario.name}-challenge`, expectedRevision: played.json.snapshot.revision,
      kind: "PLAY_CHALLENGE",
      payload: { windowId: played.json.snapshot.reaction.windowId, cardId: challenge.instanceId },
    });
    assert.equal(challenged.json.outcome.accepted, true);
    const resolved = await skipAll(
      runtime, code, host, guest, challenged.json.snapshot, `${scenario.name}-modifier`,
    );
    if (scenario.effectRuns) {
      assert.equal(resolved.pendingPlay.phase, "critical_boost_discard");
      assert.equal(resolved.effect.mainDeckCount, 21);
    } else {
      assert.equal(resolved.pendingPlay, null);
      assert.equal(resolved.effect.mainDeckCount, 24);
      assert.equal(resolved.effect.discardCount, 2);
    }
    assert.equal(totalInstances(runtime.state(code)), total);
  }
});

test("Dodgy Dealer enforces threshold, empty-hand swap, disconnected target, and immediate allowance", async () => {
  {
    const runtime = localRuntime([[5, 4]]);
    const { code, host, guest, started } = await createStarted(runtime);
    const total = totalInstances(runtime.state(code));
    const dodgy = cardByDefinition(started, "dodgy-dealer");
    const played = await command(runtime, code, host.sessionToken, {
      commandId: "success-play", expectedRevision: started.revision,
      kind: "PLAY_CARD", payload: { cardInstanceId: dodgy.instanceId },
    });
    const choice = await skipAll(runtime, code, host, guest, played.json.snapshot, "success-challenge");
    const state = runtime.state(code);
    const actor = state.players.find((player: any) => player.playerId === host.snapshot.you.playerId);
    state.effect.mainDeck.push(...actor.hand.splice(0));
    const guestHand = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot.yourHand
      .map((card: any) => card.instanceId);
    const roll = await command(runtime, code, host.sessionToken, {
      commandId: "success-roll", expectedRevision: choice.revision,
      kind: "CHOOSE_DODGY_DEALER_IMMEDIATE",
      payload: {
        attemptId: choice.pendingPlay.attemptId,
        choice: "roll",
        targetPlayerId: guest.snapshot.you.playerId,
      },
    });
    const heroId = roll.json.snapshot.players
      .find((player: any) => player.playerId === host.snapshot.you.playerId).party[0].instanceId;
    assert.equal(roll.json.snapshot.yourHeroAllowance[heroId], "used");
    const deadline = roll.json.snapshot.reaction.deadlineAt;
    runtime.setNow(deadline + 1);
    await runtime.alarm(code);
    const hostAfter = (await snapshot(runtime, code, host.sessionToken)).json.snapshot;
    const guestAfter = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot;
    assert.deepEqual(hostAfter.yourHand.map((card: any) => card.instanceId), guestHand);
    assert.equal(guestAfter.yourHand.length, 0);
    const usedAgain = await command(runtime, code, host.sessionToken, {
      commandId: "used-again", expectedRevision: hostAfter.revision,
      kind: "ROLL_HERO_EFFECT",
      payload: { heroInstanceId: heroId, targetPlayerId: guest.snapshot.you.playerId },
    });
    assert.equal(usedAgain.json.outcome.code, "HERO_EFFECT_ALREADY_USED");
    assert.equal(totalInstances(runtime.state(code)), total);
  }

  {
    const runtime = localRuntime([[2, 2]]);
    const { code, host, guest, started } = await createStarted(runtime);
    const dodgy = cardByDefinition(started, "dodgy-dealer");
    const played = await command(runtime, code, host.sessionToken, {
      commandId: "fail-play", expectedRevision: started.revision,
      kind: "PLAY_CARD", payload: { cardInstanceId: dodgy.instanceId },
    });
    const choice = await skipAll(runtime, code, host, guest, played.json.snapshot, "fail-challenge");
    const hostHand = choice.yourHand.map((card: any) => card.instanceId);
    const guestHand = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot.yourHand
      .map((card: any) => card.instanceId);
    const roll = await command(runtime, code, host.sessionToken, {
      commandId: "fail-roll", expectedRevision: choice.revision,
      kind: "CHOOSE_DODGY_DEALER_IMMEDIATE",
      payload: {
        attemptId: choice.pendingPlay.attemptId,
        choice: "roll",
        targetPlayerId: guest.snapshot.you.playerId,
      },
    });
    const resolved = await skipAll(runtime, code, host, guest, roll.json.snapshot, "fail-modifier");
    assert.deepEqual(resolved.yourHand.map((card: any) => card.instanceId), hostHand);
    const guestAfter = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot;
    assert.deepEqual(guestAfter.yourHand.map((card: any) => card.instanceId), guestHand);
  }
});

test("Critical and Dodgy choice deadlines recover after restart and settle exactly once", async () => {
  {
    const runtime = localRuntime();
    const { code, host, guest, started } = await createStarted(runtime);
    const total = totalInstances(runtime.state(code));
    const critical = cardByDefinition(started, "critical-boost");
    const played = await command(runtime, code, host.sessionToken, {
      commandId: "timeout-critical-play", expectedRevision: started.revision,
      kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
    });
    const choice = await skipAll(
      runtime, code, host, guest, played.json.snapshot, "timeout-critical-challenge",
    );
    const firstPersisted = choice.yourHand[0].instanceId;
    const deadline = choice.pendingPlay.choiceDeadlineAt;
    runtime.setNow(deadline + 1);
    runtime.restart(code);
    await runtime.alarm(code);
    const after = (await snapshot(runtime, code, host.sessionToken)).json.snapshot;
    assert.equal(after.pendingPlay, null);
    assert.equal(after.yourHand.some((card: any) => card.instanceId === firstPersisted), false);
    const revision = after.revision;
    await runtime.alarm(code);
    const twice = (await snapshot(runtime, code, host.sessionToken)).json.snapshot;
    assert.equal(twice.revision, revision);
    assert.equal(totalInstances(runtime.state(code)), total);
  }

  {
    const runtime = localRuntime();
    const { code, host, guest, started } = await createStarted(runtime);
    const dodgy = cardByDefinition(started, "dodgy-dealer");
    const played = await command(runtime, code, host.sessionToken, {
      commandId: "timeout-dodgy-play", expectedRevision: started.revision,
      kind: "PLAY_CARD", payload: { cardInstanceId: dodgy.instanceId },
    });
    const choice = await skipAll(
      runtime, code, host, guest, played.json.snapshot, "timeout-dodgy-challenge",
    );
    const heroId = choice.players
      .find((player: any) => player.playerId === host.snapshot.you.playerId).party[0].instanceId;
    const deadline = choice.pendingPlay.choiceDeadlineAt;
    const rollCallsBefore = runtime.getRollCalls();
    runtime.setNow(deadline + 1);
    runtime.restart(code);
    await runtime.alarm(code);
    const after = (await snapshot(runtime, code, host.sessionToken)).json.snapshot;
    assert.equal(after.pendingPlay, null);
    assert.equal(after.yourHeroAllowance[heroId], "available");
    assert.equal(runtime.getRollCalls(), rollCallsBefore);
  }
});

test("effect END_TURN advances an inert-only player once and refreshes turn allowance", async () => {
  const runtime = localRuntime([[5, 4]]);
  const { code, host, guest, started } = await createStarted(runtime);
  const total = totalInstances(runtime.state(code));

  const critical = cardByDefinition(started, "critical-boost");
  const playedCritical = await command(runtime, code, host.sessionToken, {
    commandId: "endturn-critical-play", expectedRevision: started.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
  });
  const criticalChoice = await skipAll(
    runtime, code, host, guest, playedCritical.json.snapshot, "endturn-critical-challenge",
  );
  const criticalDone = await command(runtime, code, host.sessionToken, {
    commandId: "endturn-critical-discard", expectedRevision: criticalChoice.revision,
    kind: "CHOOSE_CRITICAL_BOOST_DISCARD",
    payload: {
      attemptId: criticalChoice.pendingPlay.attemptId,
      cardInstanceId: criticalChoice.yourHand.find((card: any) => card.kind === "inert").instanceId,
    },
  });
  const dodgy = cardByDefinition(criticalDone.json.snapshot, "dodgy-dealer");
  const playedDodgy = await command(runtime, code, host.sessionToken, {
    commandId: "endturn-dodgy-play", expectedRevision: criticalDone.json.snapshot.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: dodgy.instanceId },
  });
  const dodgyChoice = await skipAll(
    runtime, code, host, guest, playedDodgy.json.snapshot, "endturn-dodgy-challenge",
  );
  const skipped = await command(runtime, code, host.sessionToken, {
    commandId: "endturn-immediate-skip", expectedRevision: dodgyChoice.revision,
    kind: "CHOOSE_DODGY_DEALER_IMMEDIATE",
    payload: { attemptId: dodgyChoice.pendingPlay.attemptId, choice: "skip" },
  });
  const heroId = skipped.json.snapshot.players
    .find((player: any) => player.playerId === host.snapshot.you.playerId).party[0].instanceId;
  const paid = await command(runtime, code, host.sessionToken, {
    commandId: "endturn-paid", expectedRevision: skipped.json.snapshot.revision,
    kind: "ROLL_HERO_EFFECT",
    payload: { heroInstanceId: heroId, targetPlayerId: guest.snapshot.you.playerId },
  });
  const guestTurn = await skipAll(runtime, code, host, guest, paid.json.snapshot, "endturn-paid-modifier");
  assert.equal(guestTurn.effect.currentPlayerId, guest.snapshot.you.playerId);
  assert.equal(guestTurn.effect.actionPoints, 3);

  const state = runtime.state(code);
  const guestState = state.players.find((player: any) => player.playerId === guest.snapshot.you.playerId);
  const nonInert = guestState.hand.filter((card: any) => card.kind !== "inert");
  guestState.hand = guestState.hand.filter((card: any) => card.kind === "inert");
  state.effect.mainDeck.push(...nonInert);
  assert.ok(guestState.hand.length > 0);
  assert.ok(guestState.hand.every((card: any) => card.kind === "inert"));
  assert.equal(totalInstances(state), total);

  const guestView = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot;
  const beforeRejected = stateDigest(runtime.state(code));
  const wrongActor = await command(runtime, code, host.sessionToken, {
    commandId: "wrong-actor-end", expectedRevision: guestView.revision,
    kind: "END_TURN", payload: {},
  });
  assert.equal(wrongActor.json.outcome.code, "NOT_YOUR_TURN");
  assert.deepEqual(stateDigest(runtime.state(code)), beforeRejected);
  const stale = await command(runtime, code, guest.sessionToken, {
    commandId: "stale-end", expectedRevision: guestView.revision - 1,
    kind: "END_TURN", payload: {},
  });
  assert.equal(stale.json.outcome.code, "STALE_REVISION");
  assert.deepEqual(stateDigest(runtime.state(code)), beforeRejected);

  const oldTurnId = guestView.effect.turnId;
  const endBody = {
    commandId: "guest-end-once", expectedRevision: guestView.revision,
    kind: "END_TURN", payload: {},
  };
  const ended = await command(runtime, code, guest.sessionToken, endBody);
  assert.equal(ended.json.outcome.accepted, true);
  assert.equal(ended.json.snapshot.effect.currentPlayerId, host.snapshot.you.playerId);
  assert.equal(ended.json.snapshot.effect.actionPoints, 3);
  assert.notEqual(ended.json.snapshot.effect.turnId, oldTurnId);
  assert.equal(ended.json.snapshot.yourHeroAllowance[heroId], undefined);
  const hostFresh = (await snapshot(runtime, code, host.sessionToken)).json.snapshot;
  assert.equal(hostFresh.yourHeroAllowance[heroId], "available");
  const afterEnd = stateDigest(runtime.state(code));

  const replay = await command(runtime, code, guest.sessionToken, endBody);
  assert.equal(replay.json.outcome.replayed, true);
  assert.deepEqual(stateDigest(runtime.state(code)), afterEnd);
  const conflict = await command(runtime, code, guest.sessionToken, {
    ...endBody,
    kind: "PLAY_CARD",
    payload: { cardInstanceId: "fixture.effect.instance.conflict" },
  });
  assert.equal(conflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");
  assert.deepEqual(stateDigest(runtime.state(code)), afterEnd);
  assert.equal(totalInstances(runtime.state(code)), total);
});

test("effect END_TURN is blocked by pending play and Modifier metadata is private and authoritative", async () => {
  const runtime = localRuntime([[4, 4], [4, 4]]);
  const { code, host, guest, started } = await createStarted(runtime);
  const hostModifiers = started.yourHand.filter((card: any) => card.kind === "modifier");
  assert.deepEqual(
    hostModifiers.map((card: any) => card.modifier),
    [{ delta: 1, rollTarget: "actor" }, { delta: 1, rollTarget: "hero" }],
  );
  const guestView = (await snapshot(runtime, code, guest.sessionToken)).json.snapshot;
  const guestChallenge = guestView.yourHand.find((card: any) => card.kind === "challenge");
  assert.equal(guestChallenge.modifier, undefined);
  assert.deepEqual(
    guestView.yourHand.filter((card: any) => card.kind === "modifier").map((card: any) => card.modifier),
    [{ delta: 1, rollTarget: "challenger" }, { delta: 1, rollTarget: "hero" }],
  );
  for (const card of hostModifiers) {
    assert.equal(JSON.stringify(guestView).includes(card.instanceId), false);
  }

  const critical = cardByDefinition(started, "critical-boost");
  const played = await command(runtime, code, host.sessionToken, {
    commandId: "modifier-critical-play", expectedRevision: started.revision,
    kind: "PLAY_CARD", payload: { cardInstanceId: critical.instanceId },
  });
  const pendingDigest = stateDigest(runtime.state(code));
  const blockedEnd = await command(runtime, code, host.sessionToken, {
    commandId: "pending-end", expectedRevision: played.json.snapshot.revision,
    kind: "END_TURN", payload: {},
  });
  assert.equal(blockedEnd.json.outcome.code, "PENDING_ACTION_ACTIVE");
  assert.deepEqual(stateDigest(runtime.state(code)), pendingDigest);

  const challenged = await command(runtime, code, guest.sessionToken, {
    commandId: "modifier-challenge", expectedRevision: played.json.snapshot.revision,
    kind: "PLAY_CHALLENGE",
    payload: { windowId: played.json.snapshot.reaction.windowId, cardId: guestChallenge.instanceId },
  });
  assert.equal(challenged.json.outcome.accepted, true);
  const actorModifier = hostModifiers.find((card: any) => card.modifier.rollTarget === "actor");
  const modified = await command(runtime, code, host.sessionToken, {
    commandId: "actor-plus-one", expectedRevision: challenged.json.snapshot.revision,
    kind: "PLAY_MODIFIER",
    payload: { windowId: challenged.json.snapshot.reaction.windowId, cardId: actorModifier.instanceId },
  });
  assert.equal(modified.json.outcome.accepted, true);
  assert.equal(modified.json.snapshot.reaction.youCompleted, true);
  const afterModifier = stateDigest(runtime.state(code));
  const secondModifier = hostModifiers.find((card: any) => card.instanceId !== actorModifier.instanceId);
  const blockedSecond = await command(runtime, code, host.sessionToken, {
    commandId: "second-modifier", expectedRevision: challenged.json.snapshot.revision,
    kind: "PLAY_MODIFIER",
    payload: { windowId: challenged.json.snapshot.reaction.windowId, cardId: secondModifier.instanceId },
  });
  assert.equal(blockedSecond.json.outcome.code, "MODIFIER_LIMIT_REACHED");
  assert.deepEqual(stateDigest(runtime.state(code)), afterModifier);
  const resolved = await command(runtime, code, guest.sessionToken, {
    commandId: "guest-completes", expectedRevision: challenged.json.snapshot.revision,
    kind: "SKIP_REACTION", payload: { windowId: challenged.json.snapshot.reaction.windowId },
  });
  assert.equal(resolved.json.outcome.accepted, true);
  const choice = (await snapshot(runtime, code, host.sessionToken)).json.snapshot;
  assert.equal(choice.pendingPlay.phase, "critical_boost_discard");
});
