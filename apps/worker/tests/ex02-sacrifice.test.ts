import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, resolveChoice, type EngineDeps, type EngineHooks } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";

const hero = (n: number): BaseCard => ({ cardId: `h-${n}`, definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" });
const doll = (n: number): BaseCard => ({ cardId: `doll-${n}`, definitionId: "hts.base.v1.item.decoy-doll", kind: "item" });
const ring = (n: number): BaseCard => ({ cardId: `ring-${n}`, definitionId: "hts.base.v1.item.really-big-ring", kind: "item" });

function table() {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: ["p1", "p2"].map((playerId) => ({ playerId, nickname: playerId })) };
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => [1, 1], now: () => 0 };
  const run = (pid: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, pid, { commandId: `c${++id}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  run("p1", "BEGIN_LEADER_SELECTION");
  run("p1", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" });
  run("p2", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-charismatic-song" });
  run("p1", "START_GAME");
  const me = game.seats.find((s) => s.playerId === game.turnOrder[game.currentPlayerIndex])!;
  const engineDeps: EngineDeps = deps;
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  /** Opens "SACRIFICE 1 Hero" whose dependent effect is DRAW 1; returns helpers to answer it. */
  const sacrificeThenDraw = () => {
    game.chain = null;
    game.queue.push({ op: "choice", playerId: me.playerId, kind: "sacrifice_hero", count: 1, prompt: "SACRIFICE", thenIfPaid: [{ op: "draw", playerId: me.playerId, n: 1 }] });
    advance(game, engineDeps, hooks);
  };
  const choose = (ids: string[], accept?: boolean) => {
    const chain = game.chain as { choice: { choiceId: string } };
    return resolveChoice(game, me.playerId, chain.choice.choiceId, ids, engineDeps, hooks, accept);
  };
  const zones = (cardId: string) => ({
    hand: me.hand.some((c) => c.cardId === cardId), party: me.party.some((e) => e.card.cardId === cardId),
    discard: game.discard.some((c) => c.cardId === cardId),
  });
  return { game, me, sacrificeThenDraw, choose, zones };
}

test("E06 Decoy Doll: sacrifice cost is credited once; Doll discarded, Hero stays", () => {
  const t = table();
  t.me.party.push({ card: hero(1), attachments: [doll(1)] });
  const hand = t.me.hand.length;
  t.sacrificeThenDraw();
  assert.equal(t.choose(["h-1"]), "ACCEPTED");
  assert.deepEqual(t.zones("h-1"), { hand: false, party: true, discard: false });
  assert.ok(t.game.discard.some((c) => c.cardId === "doll-1"));
  assert.equal(t.me.hand.length, hand + 1, "dependent DRAW granted exactly once");
});

test("E06 Maegisty: sacrifice is credited, Hero + Items return to hand, never in two zones", () => {
  const t = table();
  t.me.protections.returnToHand = true;
  t.me.party.push({ card: hero(1), attachments: [ring(1)] });
  const hand = t.me.hand.length;
  t.sacrificeThenDraw();
  assert.equal(t.choose(["h-1"]), "ACCEPTED");
  assert.deepEqual(t.zones("h-1"), { hand: true, party: false, discard: false });
  assert.equal(t.me.hand.some((c) => c.cardId === "ring-1"), true, "attachment follows the returning Hero");
  assert.equal(t.me.hand.length, hand + 3, "Hero + Item + the credited DRAW");
});

test("E07: Decoy and Maegisty both eligible → owner chooses; the cost is credited either way and the effect runs after", () => {
  for (const [accept, expected] of [[true, { hand: false, party: true, discard: false }], [false, { hand: true, party: false, discard: false }]] as const) {
    const t = table();
    t.me.protections.returnToHand = true;
    t.me.party.push({ card: hero(1), attachments: [doll(1)] });
    const hand = t.me.hand.length;
    t.sacrificeThenDraw();
    t.choose(["h-1"]);
    assert.equal((t.game.chain as { choice: { kind: string } }).choice.kind, "confirm", "replacement prompt first");
    assert.equal(t.me.hand.length, hand, "dependent DRAW has not run before the movement");
    assert.equal(t.choose([], accept), "ACCEPTED");
    assert.deepEqual(t.zones("h-1"), expected);
    assert.equal(t.me.hand.length, hand + (accept ? 1 : 3), "DRAW exactly once, after the movement (Maegisty returns Hero + Doll)");
  }
});

test("Maegisty also replaces a DESTROY without firing destroyed-triggers, and expires on the owner's turn", () => {
  const t = table();
  t.me.protections.returnToHand = true;
  t.me.party.push({ card: hero(1), attachments: [] });
  t.game.queue.push({ op: "destroy", heroCardId: "h-1", byPlayerId: t.game.seats.find((s) => s !== t.me)!.playerId });
  advance(t.game, { newId: () => "x", shuffle: (i) => i, rollDice: () => [1, 1], now: () => 0 }, { autoEndTurn: () => {}, afterSlay: () => false });
  assert.deepEqual(t.zones("h-1"), { hand: true, party: false, discard: false });
  t.me.protections = { noDestroy: false, noSteal: false };
  assert.equal(t.me.protections.returnToHand, undefined, "turn-start reset clears it");
});
