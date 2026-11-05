import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";
import {
  applyBaseCommand,
  initialBaseGameState,
  projectBaseGame,
  settleBaseGame,
  type BaseGameDeps,
  type BaseGameState,
  type BaseRoster,
} from "../src/game/base-game.ts";

const LEADER = (slug: string) => `hts.base.v1.party-leader.${slug}`;

function table(leaders: string[]) {
  const players = leaders.map((_, index) => `p${index + 1}`);
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: players.map((playerId) => ({ playerId, nickname: playerId })) };
  const dice: Array<[number, number]> = [];
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => dice.shift() ?? [1, 1], now: () => 0 };
  let seq = 0;
  const run = (playerId: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, playerId, { commandId: `c${++seq}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  run("p1", "BEGIN_LEADER_SELECTION");
  players.forEach((playerId, index) => run(playerId, "SELECT_PARTY_LEADER", { leaderId: LEADER(leaders[index]) }));
  run("p1", "START_GAME");
  const seat = (playerId: string) => game.seats.find((s) => s.playerId === playerId)!;
  const active = () => game.turnOrder[game.currentPlayerIndex];
  const take = (definitionId: string): BaseCard => {
    for (const pool of [game.mainDeck, ...game.seats.map((s) => s.hand)]) {
      const index = pool.findIndex((card) => card.definitionId === definitionId);
      if (index >= 0) return pool.splice(index, 1)[0];
    }
    throw new Error(definitionId);
  };
  const hero = (playerId: string, slug: string) => {
    const card = take(`hts.base.v1.hero.${slug}`);
    seat(playerId).party.push({ card, attachments: [] });
    return card;
  };
  const passAll = () => {
    const chain = game.chain!;
    assert.ok(chain.step === "modifier_window" || chain.step === "challenge_window");
    for (const [playerId, state] of Object.entries(chain.responders)) {
      if (state === "pending") assert.equal(run(playerId, "REACT_PASS", { windowId: chain.windowId }), "ACCEPTED");
    }
  };
  return { game, roster, deps, dice, run, seat, active, hero, passAll, take };
}

const BARD = "dodgy-dealer", FIGHTER = "bad-axe", GUARDIAN = "calming-voice", RANGER = "bullseye", THIEF = "kit-napper", WIZARD = "bun-bun";

test("WIN-SLAY-T: 3rd SLAY ends the game at once; no refill; every later command → GAME_OVER", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  t.seat(me).slain = ["hts.base.v1.monster.orthus#01", "hts.base.v1.monster.rex-major#01"];
  t.hero(me, BARD);
  t.game.faceUpMonsters = ["hts.base.v1.monster.terratuga#01"];
  t.game.monsterDeck = ["hts.base.v1.monster.bloodwing#01"];
  t.dice.push([6, 6]);
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.terratuga#01" }), "ACCEPTED");
  t.passAll();
  assert.equal(t.game.phase, "game_over");
  assert.equal(t.game.winnerPlayerId, me);
  assert.equal(t.game.winReason, "slay_3");
  assert.deepEqual(t.game.faceUpMonsters, []);
  assert.equal(t.game.chain, null);
  for (const [kind, payload] of [["DRAW_CARD", {}], ["END_TURN", {}], ["REACT_PASS", { windowId: "w" }], ["BEGIN_LEADER_SELECTION", {}]] as const) {
    assert.equal(t.run(me, kind, payload), "GAME_OVER");
  }
  assert.equal(settleBaseGame(t.game, t.roster, t.deps), false);
  const view = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 9, serverNow: 0 }, me);
  assert.equal(view.game.phase, "game_over");
  assert.equal(view.game.winnerPlayerId, me);
  assert.equal(view.game.currentPlayerId, null);
});

test("WIN-CLASS: 5 Hero classes + Leader class wins at END_TURN (Leader counts)", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]); // p2 (Bard leader) starts
  const me = t.active();
  assert.equal(me, "p2");
  for (const slug of [FIGHTER, GUARDIAN, RANGER, THIEF, WIZARD]) t.hero(me, slug);
  assert.equal(t.run(me, "END_TURN"), "ACCEPTED");
  assert.equal(t.game.phase, "game_over");
  assert.equal(t.game.winnerPlayerId, me);
  assert.equal(t.game.winReason, "six_classes");
});

test("WIN-CLASS-T: only the active player at the end of their own turn; duplicate classes do not count", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  const them = t.game.turnOrder.find((id) => id !== me)!;
  // The other player has 6 classes (Wizard leader + 5) but it is not their turn.
  for (const slug of [BARD, FIGHTER, GUARDIAN, RANGER, THIEF]) t.hero(them, slug);
  // Active player: Bard leader + Bard hero + 4 others = 5 distinct.
  for (const slug of ["fuzzy-cheeks", "bear-claw", "guiding-light", "hook", "meowzio"]) t.hero(me, slug);
  assert.equal(t.run(me, "END_TURN"), "ACCEPTED");
  assert.equal(t.game.phase, "turn_active");
  assert.equal(t.active(), them);
  // Their own END_TURN: now they win.
  assert.equal(t.run(them, "END_TURN"), "ACCEPTED");
  assert.equal(t.game.winnerPlayerId, them);
});

test("WIN-CLASS: auto END_TURN at 0 AP checks the class win; 6 classes lost mid-turn → no win (EC-14)", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  for (const slug of [FIGHTER, GUARDIAN, RANGER, THIEF, WIZARD]) t.hero(me, slug);
  t.game.actionPoints = 1;
  assert.equal(t.run(me, "DRAW_CARD"), "ACCEPTED");
  assert.equal(t.game.winnerPlayerId, me);

  const t2 = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me2 = t2.active();
  for (const slug of [FIGHTER, GUARDIAN, RANGER, THIEF]) t2.hero(me2, slug);
  const wizard = t2.hero(me2, WIZARD);
  t2.game.faceUpMonsters = ["hts.base.v1.monster.terratuga#01"]; // 7-: SACRIFICE
  t2.dice.push([1, 2]);
  t2.run(me2, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.terratuga#01" });
  t2.passAll();
  const chain = t2.game.chain as { choice: { choiceId: string } };
  t2.run(me2, "RESOLVE_CHOICE", { choiceId: chain.choice.choiceId, cardInstanceIds: [wizard.cardId] });
  assert.equal(t2.run(me2, "END_TURN"), "ACCEPTED");
  assert.equal(t2.game.phase, "turn_active");
});

test("WIN-CLASS with a Mask (owner: replace): the Mask class replaces the Hero's class", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active(); // Bard leader
  for (const slug of [FIGHTER, GUARDIAN, RANGER, THIEF, "bear-claw"]) t.hero(me, slug);
  // Second Fighter wears a Wizard Mask → counts as Wizard only → 6 classes.
  t.seat(me).party[4].attachments = [t.take("hts.base.v1.item.wizard-mask")];
  assert.equal(t.run(me, "END_TURN"), "ACCEPTED");
  assert.equal(t.game.winReason, "six_classes");

  const t2 = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me2 = t2.active();
  for (const slug of [FIGHTER, GUARDIAN, RANGER, THIEF]) t2.hero(me2, slug);
  t2.seat(me2).party[0].attachments = [t2.take("hts.base.v1.item.wizard-mask")]; // Fighter → Wizard: still 5
  assert.equal(t2.run(me2, "END_TURN"), "ACCEPTED");
  assert.equal(t2.game.phase, "turn_active");
});
