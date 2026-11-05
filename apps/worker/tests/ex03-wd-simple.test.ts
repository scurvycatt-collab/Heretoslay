import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, resolveChoice, type EngineDeps, type EngineHooks } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { buildEffect } from "../src/game/base-engine.ts";
import { WD_UNIMPLEMENTED_EFFECTS } from "../src/content/expansion-wd.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";

const wd = (name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === "warriorsDruids" && d.canonicalName === name)!.definitionId;
const card = (id: string, definitionId: string, kind: BaseCard["kind"]): BaseCard => ({ cardId: id, definitionId, kind });
const axe = (n: number) => card(`axe-${n}`, "hts.base.v1.hero.bad-axe", "hero");

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
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  const engineDeps: EngineDeps = deps;
  const play = (effectId: string) => {
    game.chain = null;
    game.queue.push(...buildEffect(game, effectId, me.playerId, {}));
    advance(game, engineDeps, hooks);
  };
  const choose = (ids: string[]) => {
    const chain = game.chain as { choice: { choiceId: string } };
    return resolveChoice(game, me.playerId, chain.choice.choiceId, ids, engineDeps, hooks);
  };
  return { game, me, play, choose };
}

test("Doe Fallow: SACRIFICE a Hero, then DRAW until 7 cards", () => {
  const t = table();
  t.me.party.push({ card: axe(1), attachments: [] });
  t.me.hand.splice(3);
  t.play("hero.doe-fallow");
  assert.equal(t.choose(["axe-1"]), "ACCEPTED");
  assert.equal(t.me.party.length, 0);
  assert.equal(t.me.hand.length, 7);
});

test("Rapid Refresh: DISCARD whole hand then DRAW 4; empty hand just draws", () => {
  const t = table();
  const before = t.me.hand.map((c) => c.cardId);
  t.play("magic.rapid-refresh");
  assert.equal(t.me.hand.length, 4);
  assert.ok(before.every((id) => t.game.discard.some((c) => c.cardId === id)));
  t.me.hand.splice(0);
  t.play("magic.rapid-refresh");
  assert.equal(t.me.hand.length, 4);
});

test("Magus Moose: take a discarded Hero to hand, then it must be played from that pick", () => {
  const t = table();
  const target = axe(9);
  t.game.discard.push(target, card("spell-1", "hts.base.v1.magic.enchanted-spell", "magic"));
  t.play("hero.magus-moose");
  assert.equal(t.choose(["spell-1"]), "INVALID_CHOICE", "only Heroes are offered");
  assert.equal(t.choose(["axe-9"]), "ACCEPTED");
  const pending = t.game.chain as { choice?: { kind: string; fromCardIds?: string[] } };
  assert.equal(pending.choice?.kind, "play_card");
  assert.deepEqual(pending.choice?.fromCardIds, ["axe-9"]);
});

test("Glowing Antler: second Magic offer only follows a played first card", () => {
  const t = table();
  t.me.hand.splice(0);
  t.me.hand.push(card("m1", "hts.base.v1.magic.enchanted-spell", "magic"), card("m2", "hts.base.v1.magic.enchanted-spell", "magic"));
  t.play("hero.glowing-antler");
  const first = t.game.chain as { choice: { kind: string; min: number; max: number } };
  assert.equal(first.choice.kind, "play_card");
  assert.equal(first.choice.min, 0, "optional (\"may\")");
  assert.equal(t.choose([]), "ACCEPTED", "declining the first ends the effect");
  assert.ok(!(t.game.chain && (t.game.chain as { step: string }).step === "choice"));
});

test("these four effects are no longer pending", () => {
  for (const id of ["hero.doe-fallow", "hero.glowing-antler", "hero.magus-moose", "magic.rapid-refresh"]) assert.ok(!WD_UNIMPLEMENTED_EFFECTS.includes(id), id);
  void wd;
});
