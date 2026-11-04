import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.REACTION_SLICE_BASE_URL?.replace(/\/$/, "");

type Json = Record<string, any>;

async function api(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; rawBody?: string; token?: string } = {},
) {
  const headers = new Headers();
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const text = await response.text();
  let json: Json;
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = { nonJsonBody: true };
  }
  return { response, json, text };
}

async function create(nickname = "Host") {
  const result = await api("/api/rooms", { method: "POST", body: { nickname } });
  assert.equal(result.response.status, 201);
  return result.json;
}

async function join(roomCode: string, nickname: string) {
  return api(`/api/rooms/${roomCode}/join`, { method: "POST", body: { nickname } });
}

async function snapshot(roomCode: string, token: string) {
  return api(`/api/rooms/${roomCode}/snapshot`, { token });
}

async function command(roomCode: string, token: string, body: Json) {
  return api(`/api/rooms/${roomCode}/commands`, { method: "POST", token, body });
}

function commandId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

if (!baseUrl) {
  test("reaction slice live HTTP harness", { skip: "REACTION_SLICE_BASE_URL is unset" }, () => {});
} else {
  test("live create/join validates nickname, capacity, auth, reload, projection and polling", async () => {
    const host = await create("  Host  ");
    const code = host.roomCode as string;
    assert.equal(host.snapshot.you.nickname, "Host");
    const guest = await join(code, "Guest");
    assert.equal(guest.response.status, 201);

    const duplicate = await join(code, " guest ");
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.json.error.code, "SESSION_ACTIVE");
    const invalid = await join(code, "   ");
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.json.error.code, "INVALID_NICKNAME");

    for (const nickname of ["P3", "P4", "P5", "P6"]) {
      assert.equal((await join(code, nickname)).response.status, 201);
    }
    const full = await join(code, "P7");
    assert.equal(full.response.status, 409);
    assert.equal(full.json.error.code, "ROOM_FULL");

    const hostView = await snapshot(code, host.sessionToken);
    const guestView = await snapshot(code, guest.json.sessionToken);
    assert.equal(hostView.json.snapshot.players.length, 6);
    assert.equal(hostView.json.snapshot.you.playerId, host.snapshot.you.playerId);
    assert.notEqual(hostView.json.snapshot.you.playerId, guestView.json.snapshot.you.playerId);
    for (const card of guestView.json.snapshot.yourHand) {
      assert.doesNotMatch(hostView.text, new RegExp(card.cardId));
    }
    assert.equal(hostView.text.includes(host.sessionToken), false);
    assert.equal(guestView.text.includes(guest.json.sessionToken), false);
    assert.equal(hostView.text.includes("sessionTokenHash"), false);
    assert.equal(hostView.text.includes("deckOrder"), false);

    const reload = await snapshot(code, host.sessionToken);
    assert.equal(reload.json.snapshot.you.playerId, host.snapshot.you.playerId);
    assert.equal(reload.json.snapshot.players.length, 6);
    const unauthorized = await snapshot(code, "invalid-session");
    assert.equal(unauthorized.response.status, 401);
    assert.equal(unauthorized.json.error.code, "UNAUTHORIZED");

    for (let index = 0; index < 3; index += 1) {
      const polled = await snapshot(code, host.sessionToken);
      assert.equal(polled.response.status, 200);
      if (index < 2) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    const expansion = await command(code, host.sessionToken, {
      commandId: commandId("expansion"),
      expectedRevision: reload.json.snapshot.revision,
      kind: "ENABLE_EXPANSION",
      payload: { setId: "fixture.unsupported" },
    });
    assert.equal(expansion.response.status, 409);
    assert.equal(expansion.json.error.code, "EXPANSION_UNSUPPORTED");
  });

  test("live host-only Modifier flow enforces bearer identity and authoritative F-04 card movement", async () => {
    const host = await create();
    const code = host.roomCode as string;
    const guest = await join(code, "Guest");
    const guestOpen = await command(code, guest.json.sessionToken, {
      commandId: commandId("guest-open"),
      expectedRevision: guest.json.snapshot.revision,
      kind: "OPEN_REACTION_DEMO",
      payload: { reactionKind: "modifier" },
    });
    assert.equal(guestOpen.json.outcome.code, "FORBIDDEN");

    const opened = await command(code, host.sessionToken, {
      commandId: commandId("host-open"),
      expectedRevision: host.snapshot.revision + 1,
      kind: "OPEN_REACTION_DEMO",
      payload: { reactionKind: "modifier" },
    });
    assert.equal(opened.json.outcome.accepted, true);
    const windowId = opened.json.snapshot.reaction.windowId;
    const deadlineAt = opened.json.snapshot.reaction.deadlineAt;
    const guestView = await snapshot(code, guest.json.sessionToken);
    const modifiers = guestView.json.snapshot.yourHand.filter((card: Json) => card.kind === "modifier");
    const firstCommand = {
      commandId: commandId("modifier"),
      expectedRevision: opened.json.snapshot.revision,
      kind: "PLAY_MODIFIER",
      payload: {
        windowId,
        cardId: modifiers[0].cardId,
        playerId: host.snapshot.you.playerId,
        delta: 99,
      },
    };
    const first = await command(code, guest.json.sessionToken, firstCommand);
    assert.equal(first.json.outcome.accepted, true);
    assert.equal(first.json.snapshot.reaction.youCompleted, true);
    assert.equal(first.json.snapshot.reaction.deadlineAt, deadlineAt);
    assert.equal(first.json.snapshot.discardCount, 1);
    assert.equal(first.json.snapshot.yourHand.some((card: Json) => card.cardId === modifiers[0].cardId), false);
    assert.equal(first.json.snapshot.fixtureTotals.modifierTotal, 1);

    const retry = await command(code, guest.json.sessionToken, firstCommand);
    assert.equal(retry.json.outcome.replayed, true);
    assert.equal(retry.json.snapshot.discardCount, 1);
    const conflict = await command(code, guest.json.sessionToken, {
      ...firstCommand,
      payload: { ...firstCommand.payload, cardId: modifiers[1].cardId },
    });
    assert.equal(conflict.json.outcome.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(conflict.json.snapshot.discardCount, 1);

    const beforeSecond = structuredClone(conflict.json.snapshot);
    delete beforeSecond.serverNow;
    const second = await command(code, guest.json.sessionToken, {
      commandId: commandId("second-modifier"),
      expectedRevision: opened.json.snapshot.revision,
      kind: "PLAY_MODIFIER",
      payload: { windowId, cardId: modifiers[1].cardId },
    });
    assert.equal(second.json.outcome.code, "MODIFIER_LIMIT_REACHED");
    const afterSecond = structuredClone(second.json.snapshot);
    delete afterSecond.serverNow;
    assert.deepEqual(afterSecond, beforeSecond);

    const hostSkip = await command(code, host.sessionToken, {
      commandId: commandId("host-skip"),
      expectedRevision: opened.json.snapshot.revision,
      kind: "SKIP_REACTION",
      payload: { windowId },
    });
    assert.equal(hostSkip.json.snapshot.reaction.resolved, true);
    assert.equal(hostSkip.json.snapshot.reaction.closeReason, "all_completed");
    assert.equal(hostSkip.json.snapshot.reaction.deadlineAt, deadlineAt);
  });

  test("live first-valid Challenge consumes once and uses server dice", async () => {
    const host = await create();
    const code = host.roomCode as string;
    const guest = await join(code, "Guest");
    const other = await join(code, "Other");
    const opened = await command(code, host.sessionToken, {
      commandId: commandId("open-challenge"),
      expectedRevision: other.json.snapshot.revision,
      kind: "OPEN_REACTION_DEMO",
      payload: { reactionKind: "challenge" },
    });
    const windowId = opened.json.snapshot.reaction.windowId;

    const selfCard = opened.json.snapshot.yourHand.find((card: Json) => card.kind === "challenge");
    const self = await command(code, host.sessionToken, {
      commandId: commandId("self-challenge"),
      expectedRevision: opened.json.snapshot.revision,
      kind: "PLAY_CHALLENGE",
      payload: { windowId, cardId: selfCard.cardId },
    });
    assert.equal(self.json.outcome.code, "SELF_CHALLENGE");
    assert.equal(self.json.snapshot.discardCount, 0);

    const hostSkip = await command(code, host.sessionToken, {
      commandId: commandId("actor-skip"),
      expectedRevision: opened.json.snapshot.revision,
      kind: "SKIP_REACTION",
      payload: { windowId },
    });
    assert.equal(hostSkip.json.outcome.accepted, true);
    assert.equal(hostSkip.json.snapshot.reaction.youCompleted, true);

    const guestView = await snapshot(code, guest.json.sessionToken);
    const otherView = await snapshot(code, other.json.sessionToken);
    const makeChallenge = (id: string, cardId: string) => ({
      commandId: id,
      expectedRevision: opened.json.snapshot.revision,
      kind: "PLAY_CHALLENGE",
      payload: { windowId, cardId, playerId: host.snapshot.you.playerId, dice: [99, 99] },
    });
    const [first, second] = await Promise.all([
      command(code, guest.json.sessionToken, makeChallenge(
        commandId("challenge-a"),
        guestView.json.snapshot.yourHand.find((card: Json) => card.kind === "challenge").cardId,
      )),
      command(code, other.json.sessionToken, makeChallenge(
        commandId("challenge-b"),
        otherView.json.snapshot.yourHand.find((card: Json) => card.kind === "challenge").cardId,
      )),
    ]);
    assert.equal([first, second].filter((item) => item.json.outcome.accepted).length, 1);
    const finalView = await snapshot(code, host.sessionToken);
    assert.equal(finalView.json.snapshot.discardCount, 1);
    assert.equal(finalView.json.snapshot.reaction.kind, "modifier");
    for (const dice of [
      ...finalView.json.snapshot.challengeRoll.playedByDice,
      ...finalView.json.snapshot.challengeRoll.challengerDice,
    ]) {
      assert.equal(Number.isInteger(dice) && dice >= 1 && dice <= 6, true);
    }
  });

  test("live disconnect remains pending until 20-second deadline and late command closes once", { timeout: 30_000 }, async () => {
    const host = await create();
    const code = host.roomCode as string;
    const guest = await join(code, "Guest");
    const opened = await command(code, host.sessionToken, {
      commandId: commandId("open-deadline"),
      expectedRevision: guest.json.snapshot.revision,
      kind: "OPEN_REACTION_DEMO",
      payload: { reactionKind: "modifier" },
    });
    const { windowId, deadlineAt } = opened.json.snapshot.reaction;
    const skipped = await command(code, host.sessionToken, {
      commandId: commandId("host-skip"),
      expectedRevision: opened.json.snapshot.revision,
      kind: "SKIP_REACTION",
      payload: { windowId },
    });
    assert.equal(skipped.json.snapshot.reaction.resolved, false);
    assert.equal(skipped.json.snapshot.reaction.pendingCount, 1);

    const waitMs = Math.max(0, deadlineAt - Date.now() + 300);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const guestView = await snapshot(code, guest.json.sessionToken);
    const modifier = guestView.json.snapshot.yourHand.find((card: Json) => card.kind === "modifier");
    const late = await command(code, guest.json.sessionToken, {
      commandId: commandId("late-modifier"),
      expectedRevision: opened.json.snapshot.revision,
      kind: "PLAY_MODIFIER",
      payload: { windowId, cardId: modifier.cardId },
    });
    assert.equal(late.json.outcome.code, "WINDOW_CLOSED");
    assert.equal(late.json.snapshot.reaction.closeReason, "deadline");
    assert.equal(late.json.snapshot.discardCount, 0);
    const revision = late.json.snapshot.revision;
    const after = await snapshot(code, guest.json.sessionToken);
    assert.equal(after.json.snapshot.revision, revision);
    assert.equal(after.json.snapshot.reaction.closeReason, "deadline");
  });

  test("live negative body and card validation returns stable errors without mutation", async () => {
    const invalidJson = await api("/api/rooms", { method: "POST", rawBody: "{" });
    assert.equal(invalidJson.response.status, 400);
    assert.equal(invalidJson.json.error.code, "INVALID_JSON");
    const oversized = await api("/api/rooms", {
      method: "POST",
      body: { nickname: "x".repeat(4_100) },
    });
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.json.error.code, "BODY_TOO_LARGE");

    const host = await create();
    const code = host.roomCode as string;
    const opened = await command(code, host.sessionToken, {
      commandId: commandId("open-negative"),
      expectedRevision: host.snapshot.revision,
      kind: "OPEN_REACTION_DEMO",
      payload: { reactionKind: "modifier" },
    });
    const missing = await command(code, host.sessionToken, {
      commandId: commandId("missing-card"),
      expectedRevision: opened.json.snapshot.revision,
      kind: "PLAY_MODIFIER",
      payload: { windowId: opened.json.snapshot.reaction.windowId, cardId: "fixture.not-owned" },
    });
    assert.equal(missing.json.outcome.code, "CARD_NOT_OWNED");
    assert.equal(missing.json.snapshot.discardCount, 0);
  });
}
