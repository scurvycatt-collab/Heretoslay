import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { BASE_CARDS_BY_ID } from "../src/content/base-cards.ts";
import {
  BOTTOMLESS_BAG, GOBLET_OF_CAFFEINATION, SOULBOUND_GRIMOIRE, TEMPORAL_HOURGLASS,
} from "../src/game/expansion-ids.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";

type Item = "item" | "cursed_item";
function table(dice: Array<[number, number]>) {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: ["p1", "p2"].map((playerId) => ({ playerId, nickname: playerId })) };
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => dice.shift() ?? [1, 1], now: () => 0 };
  const run = (pid: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, pid, { commandId: `c${++id}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  run("p1", "BEGIN_LEADER_SELECTION");
  run("p1", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" });
  run("p2", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-charismatic-song" });
  run("p1", "START_GAME");
  const me = game.seats.find((s) => s.playerId === game.turnOrder[game.currentPlayerIndex])!;
  // A Hero whose effect needs no target and a threshold ≥ 5, so [1,1] fails and [6,6] succeeds.
  const data = [...BASE_CARDS_BY_ID.values()].find((c) => c.kind === "hero" && c.target === "none" && c.rollThreshold >= 5)!;
  me.party.push({ card: { cardId: "h-1", definitionId: data.definitionId, kind: "hero" }, attachments: [] });
  const attach = (definitionId: string, kind: Item, n = 1) => me.party[0].attachments.push({ cardId: `a-${n}`, definitionId, kind });
  const passWindow = () => {
    const chain = game.chain as { windowId: string; responders: Record<string, string> } | null;
    assert.ok(chain && "responders" in chain, "modifier window open");
    for (const [pid, state] of Object.entries(chain.responders)) if (state === "pending") run(pid, "REACT_PASS", { windowId: chain.windowId });
  };
  const roll = () => { assert.equal(run(me.playerId, "USE_HERO_EFFECT", { heroInstanceId: "h-1", targets: {} }), "ACCEPTED"); passWindow(); };
  const answer = (accept: boolean) => {
    const chain = game.chain as { step: string; choice?: { choiceId: string } } | null;
    assert.equal(chain?.step, "choice");
    return run(me.playerId, "RESOLVE_CHOICE", { choiceId: chain!.choice!.choiceId, cardInstanceIds: [], accept });
  };
  return { game, me, run, attach, roll, answer, passWindow };
}

test("C08 default: a second paid roll on the same Hero is rejected without Bottomless Bag", () => {
  const t = table([[1, 1]]);
  t.roll();
  assert.equal(t.run(t.me.playerId, "USE_HERO_EFFECT", { heroInstanceId: "h-1", targets: {} }), "HERO_ALREADY_ROLLED");
});

test("E04: Bottomless Bag permits another paid attempt with a fresh roll; Grimoire makes it two AP; removing the Bag ends it", () => {
  const t = table([[1, 1], [1, 1], [1, 1]]);
  t.attach(BOTTOMLESS_BAG, "item", 1);
  t.game.actionPoints = 3;
  t.roll();
  assert.equal(t.game.actionPoints, 2);
  t.roll();
  assert.equal(t.game.actionPoints, 1, "Bag repeat costs one AP");
  t.attach(SOULBOUND_GRIMOIRE, "cursed_item", 2); // second slot is only for printed two-slot Heroes; engine still prices it
  assert.equal(t.run(t.me.playerId, "USE_HERO_EFFECT", { heroInstanceId: "h-1", targets: {} }), "INSUFFICIENT_AP");
  assert.equal(t.game.actionPoints, 1, "rejected atomically");
  t.me.party[0].attachments.length = 0;
  t.game.actionPoints = 3;
  assert.equal(t.run(t.me.playerId, "USE_HERO_EFFECT", { heroInstanceId: "h-1", targets: {} }), "HERO_ALREADY_ROLLED");
});

test("E10: Temporal Hourglass offers AP only after a resolved failure; accept grants exactly 1, no retry", () => {
  const fail = table([[1, 1]]);
  fail.attach(TEMPORAL_HOURGLASS, "item");
  fail.game.actionPoints = 3;
  fail.roll();
  assert.equal(fail.answer(true), "ACCEPTED");
  assert.equal(fail.game.actionPoints, 3, "paid 1, gained 1");
  assert.equal(fail.game.heroRollsUsed.filter((id) => id === "h-1").length, 1, "no automatic retry");
  assert.equal(fail.game.chain, null);

  const decline = table([[1, 1]]);
  decline.attach(TEMPORAL_HOURGLASS, "item");
  decline.game.actionPoints = 3;
  decline.roll();
  decline.answer(false);
  assert.equal(decline.game.actionPoints, 2);

  const ok = table([[6, 6]]);
  ok.attach(TEMPORAL_HOURGLASS, "item");
  ok.game.actionPoints = 3;
  ok.roll();
  const chain = ok.game.chain as { choice?: { prompt: string } } | null;
  assert.ok(!chain?.choice?.prompt.includes("Hourglass"), "no failure popup on success");
});

test("E04: Goblet sacrifices itself for a free immediate retry with a fresh roll window, even with Grimoire's cost", () => {
  const t = table([[1, 1], [6, 6]]);
  t.attach(GOBLET_OF_CAFFEINATION, "item", 1);
  t.attach(SOULBOUND_GRIMOIRE, "cursed_item", 2); // paid roll costs 2; the Goblet retry must not
  t.game.actionPoints = 3;
  t.roll();
  assert.equal(t.game.actionPoints, 1);
  assert.equal(t.answer(true), "ACCEPTED");
  assert.equal((t.game.chain as { step: string }).step, "modifier_window", "fresh roll window opened");
  assert.equal(t.game.actionPoints, 1, "retry is free");
  assert.deepEqual(t.me.party[0].attachments.map((c) => c.cardId), ["a-2"], "Goblet sacrificed, Grimoire stays");
  assert.ok(t.game.discard.some((c) => c.cardId === "a-1"));
  t.passWindow();
  assert.notEqual(t.game.chain?.step, "modifier_window", "second roll resolved (succeeded, effect choice opened)");
});
