// W01: Majestelk — once per roll, ±5×n until the owner's next turn.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, buildEffect, resolveChoice, startAttack, settleDeadlines, type EngineDeps, type EngineHooks } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { rollTotals } from "../src/game/base-engine.ts";

const hero = (id: string): BaseCard => ({ cardId: id, definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" });

function table() {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: ["p1", "p2"].map((playerId) => ({ playerId, nickname: playerId })) };
  let id = 0;
  let clock = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => [3, 3], now: () => clock };
  const run = (pid: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, pid, { commandId: `c${++id}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  run("p1", "BEGIN_LEADER_SELECTION");
  run("p1", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" });
  run("p2", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-charismatic-song" });
  run("p1", "START_GAME");
  const me = game.seats.find((s) => s.playerId === game.turnOrder[game.currentPlayerIndex])!;
  me.leaderId = null;
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  const engineDeps: EngineDeps = deps;
  const playMajestelk = () => {
    me.party.push({ card: hero(`s${me.party.length}`), attachments: [] });
    game.chain = null;
    game.queue.push(...buildEffect(game, "hero.majestelk", me.playerId, {}));
    advance(game, engineDeps, hooks);
    const chain = game.chain as { choice: { choiceId: string } };
    assert.equal(resolveChoice(game, me.playerId, chain.choice.choiceId, [me.party[me.party.length - 1].card.cardId], engineDeps, hooks), "ACCEPTED");
  };
  const attack = () => {
    game.chain = null;
    startAttack(game, me.playerId, game.faceUpMonsters[0], engineDeps, hooks);
  };
  const answer = (accept: boolean) => {
    const chain = game.chain as { choice: { choiceId: string; kind: string; prompt: string } };
    return resolveChoice(game, me.playerId, chain.choice.choiceId, [], engineDeps, hooks, accept);
  };
  const total = () => rollTotals((game.chain as { roll: Parameters<typeof rollTotals>[0] }).roll).total;
  return { game, me, playMajestelk, attack, answer, total, tick: (ms: number) => { clock += ms; } };
}

test("Majestelk: sacrifices a Hero, then every roll asks once — accept = +5, decline = -5", () => {
  const t = table();
  t.playMajestelk();
  assert.equal(t.me.rollSwings, 1);
  assert.equal(t.me.party.length, 0);
  t.attack();
  assert.equal((t.game.chain as { step: string }).step, "choice");
  assert.equal(t.answer(true), "ACCEPTED");
  assert.equal((t.game.chain as { step: string }).step, "modifier_window");
  assert.equal(t.total(), 6 + 5);
  t.attack();
  t.answer(false);
  assert.equal(t.total(), 6 - 5, "each roll asks again, independently");
});

test("two activations stack into one popup of ±10, not two popups", () => {
  const t = table();
  t.playMajestelk();
  t.playMajestelk();
  assert.equal(t.me.rollSwings, 2);
  t.attack();
  const chain = t.game.chain as { choice: { prompt: string } };
  assert.match(chain.choice.prompt, /\+10/);
  t.answer(true);
  assert.equal((t.game.chain as { step: string }).step, "modifier_window", "a single popup");
  assert.equal(t.total(), 6 + 10);
});

test("timeout records neither + nor - (W01): the roll keeps its natural total", () => {
  const t = table();
  t.playMajestelk();
  t.attack();
  t.tick(10 * 60 * 1000);
  settleDeadlines(t.game, { newId: () => "x", shuffle: (a) => a, rollDice: () => [3, 3], now: () => 10 * 60 * 1000 }, { autoEndTurn: () => {}, afterSlay: () => false });
  assert.equal((t.game.chain as { step: string }).step, "modifier_window");
  assert.equal(t.total(), 6);
});
