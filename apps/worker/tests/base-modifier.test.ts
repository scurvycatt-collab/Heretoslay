// MOD-005: Modifier picked by cardId + value option, server-validated; Leader
// passives shown separately and (by default) not using the Modifier slot (Q-11).
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";
import {
  applyBaseCommand,
  initialBaseGameState,
  projectBaseGame,
  type BaseGameDeps,
  type BaseRoster,
} from "../src/game/base-game.ts";

const LEADER = (slug: string) => `hts.base.v1.party-leader.${slug}`;

function table(leaders: string[], settings?: Record<string, unknown>) {
  const players = leaders.map((_, index) => `p${index + 1}`);
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: players.map((playerId) => ({ playerId, nickname: playerId })) };
  const dice: Array<[number, number]> = [];
  const clock = { now: 0 };
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => dice.shift() ?? [1, 1], now: () => clock.now };
  let seq = 0;
  const run = (playerId: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, playerId, { commandId: `c${++seq}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  if (settings) assert.equal(run("p1", "CONFIGURE_GAME", settings), "ACCEPTED");
  run("p1", "BEGIN_LEADER_SELECTION");
  players.forEach((playerId, index) => run(playerId, "SELECT_PARTY_LEADER", { leaderId: LEADER(leaders[index]) }));
  assert.equal(run("p1", "START_GAME"), "ACCEPTED");
  const seat = (playerId: string) => game.seats.find((s) => s.playerId === playerId)!;
  const give = (playerId: string, definitionId: string): BaseCard => {
    for (const pool of [game.mainDeck, ...game.seats.map((s) => s.hand)]) {
      const index = pool.findIndex((card) => card.definitionId === definitionId);
      if (index >= 0) {
        const [card] = pool.splice(index, 1);
        seat(playerId).hand.push(card);
        return card;
      }
    }
    throw new Error(definitionId);
  };
  const active = () => game.turnOrder[game.currentPlayerIndex];
  const windowId = () => (game.chain as { windowId: string }).windowId;
  const passRest = () => {
    const chain = game.chain as { responders: Record<string, string>; windowId: string };
    for (const [playerId, state] of Object.entries(chain.responders)) if (state === "pending") run(playerId, "REACT_PASS", { windowId: chain.windowId });
  };
  return { game, roster, deps, dice, clock, run, seat, give, active, windowId, passRest };
}

const PLUS2 = "hts.base.v1.modifier.modifier-plus-2-minus-2";
const PLUS1 = "hts.base.v1.modifier.modifier-plus-1-minus-3";
const PLUS4 = "hts.base.v1.modifier.modifier-plus-4";

function startAttack(t: ReturnType<typeof table>, dice: [number, number]) {
  const me = t.active();
  const hero = t.give(me, "hts.base.v1.hero.bad-axe");
  t.seat(me).hand.splice(t.seat(me).hand.indexOf(hero), 1);
  t.seat(me).party.push({ card: hero, item: null });
  t.game.faceUpMonsters = ["hts.base.v1.monster.terratuga#01"]; // slay 11+, penalty 7-
  t.dice.push(dice);
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.terratuga#01" }), "ACCEPTED");
  return me;
}

test("REACT_MODIFIER: exact card + option; invalid picks change nothing", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = startAttack(t, [4, 4]); // 8 → nothing
  const them = t.game.turnOrder.find((id) => id !== me)!;
  const mod = t.give(them, PLUS2);
  const plus4 = t.give(them, PLUS4);
  const challengeCard = t.give(them, "hts.base.v1.challenge.challenge");
  const handBefore = t.seat(them).hand.map((card) => card.cardId);
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: "nope", value: 2 }), "CARD_NOT_PLAYABLE");
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: challengeCard.cardId, value: 2 }), "CARD_NOT_PLAYABLE");
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: plus4.cardId, value: -4 }), "INVALID_MODIFIER_VALUE");
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: mod.cardId, value: 2, leaderBonus: 1 }), "INVALID_LEADER_BONUS");
  assert.deepEqual(t.seat(them).hand.map((card) => card.cardId), handBefore);
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: mod.cardId, value: -2 }), "ACCEPTED");
  const chain = t.game.chain;
  assert.equal(chain?.step, "modifier_window");
  if (chain?.step === "modifier_window") {
    assert.deepEqual(chain.roll.modifiers, [{ playerId: them, cardId: mod.cardId, value: -2 }]);
  }
  t.passRest();
  // 8 - 2 = 6 ≤ 7 → penalty (SACRIFICE)
  assert.equal(t.game.chain?.step, "choice");
});

test("Challenge roll: side required; the Modifier applies to the chosen side only", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  const them = t.game.turnOrder.find((id) => id !== me)!;
  const hero = t.give(me, "hts.base.v1.hero.peanut");
  const challengeCard = t.give(them, "hts.base.v1.challenge.challenge");
  const mod = t.give(me, PLUS2);
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
  t.dice.push([4, 4], [4, 5]); // defender 8, challenger 9
  t.run(them, "REACT_CHALLENGE", { windowId: t.windowId(), cardInstanceId: challengeCard.cardId });
  assert.equal(t.run(me, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: mod.cardId, value: 2 }), "INVALID_MODIFIER_SIDE");
  assert.equal(t.run(me, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: mod.cardId, value: 2, side: "defender" }), "ACCEPTED");
  t.passRest();
  assert.equal(t.seat(me).party[0]?.card.cardId, hero.cardId); // 10 > 9 → play proceeds
});

test("Leader passive: shown separately, does not use the Modifier slot by default (Q-11)", () => {
  const t = table(["the-cloaked-sage", "the-divine-arrow"]);
  const me = startAttack(t, [3, 3]);
  const chain = t.game.chain;
  assert.ok(chain?.step === "modifier_window");
  if (chain?.step !== "modifier_window") return;
  assert.deepEqual(chain.roll.passives.map((p) => [p.label, p.value]), [["passive của Leader: The Divine Arrow", 1]]);
  assert.equal(chain.responders[me], "pending");
  const mod = t.give(me, PLUS4);
  assert.equal(t.run(me, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: mod.cardId, value: 4 }), "ACCEPTED");
});

test("C10: several Modifiers keep the reaction deadline fixed and add five seconds each to the turn", () => {
  const t = table(["the-cloaked-sage", "the-divine-arrow"]);
  const me = startAttack(t, [1, 1]);
  const w = t.windowId();
  const deadline = (t.game.chain as { deadlineAt: number }).deadlineAt;
  const a = t.give(me, PLUS4);
  const b = t.give(me, PLUS2);
  t.clock.now += 5000;
  assert.equal(t.run(me, "REACT_MODIFIER", { windowId: w, cardInstanceId: a.cardId, value: 4 }), "ACCEPTED");
  const chain = t.game.chain as { responders: Record<string, string>; deadlineAt: number };
  assert.equal(chain.responders[me], "pending", "playing does not complete participation");
  assert.equal(chain.deadlineAt, deadline, "no clock reset");
  assert.equal(t.run(me, "REACT_MODIFIER", { windowId: w, cardInstanceId: a.cardId, value: 4 }), "CARD_NOT_PLAYABLE", "replay never reuses a card");
  assert.equal(t.run(me, "REACT_MODIFIER", { windowId: w, cardInstanceId: b.cardId, value: 2 }), "ACCEPTED");
  assert.equal(t.game.turnModifierBonusSeconds, 10);
  assert.equal((t.game.chain as { roll: { modifiers: unknown[] } }).roll.modifiers.length, 2);
  assert.equal(t.run(me, "REACT_PASS", { windowId: w }), "ACCEPTED");
  const c = t.give(me, PLUS4);
  assert.equal(t.run(me, "REACT_MODIFIER", { windowId: w, cardInstanceId: c.cardId, value: 4 }), "ALREADY_RESPONDED", "Skip is final");
  assert.equal(t.game.chain?.step, "modifier_window", "other player still pending → stays open");
  t.passRest();
  assert.notEqual(t.game.chain?.step, "modifier_window", "closes early only when everyone Skipped");
  assert.equal(t.game.turnDeadlineAt, t.clock.now + 70_000, "base 60s + 5s for each accepted Modifier");
});

test("The Protecting Horn: 6 + Modifier +1 + Horn +1 resolves to 8", () => {
  const t = table(["the-protecting-horn", "the-charismatic-song"]);
  const me = startAttack(t, [3, 3]);
  const them = t.game.turnOrder.find((id) => id !== me)!;
  assert.equal(t.seat(them).leaderId, LEADER("the-protecting-horn"));
  const mod = t.give(them, PLUS1);
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId: t.windowId(), cardInstanceId: mod.cardId, value: 1, leaderBonus: 1 }), "ACCEPTED");
  const chain = t.game.chain;
  assert.ok(chain?.step === "modifier_window");
  if (chain?.step === "modifier_window") {
    assert.equal(chain.roll.passives.at(-1)?.value, 1);
    assert.match(chain.roll.passives.at(-1)!.label, /^passive của Leader: The Protecting Horn/);
  }
  t.passRest();
  const view = projectBaseGame(t.game, t.roster, { roomCode: "HORN", revision: 1, serverNow: t.clock.now }, me);
  assert.equal(view.game.lastRoll?.roll.total, 8);
});

test("CONFIGURE_GAME: host-only, before START_GAME; reactionSeconds drives the window deadline", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"], { reactionSeconds: 45 });
  assert.equal(t.game.settings.reactionSeconds, 45);
  assert.equal(t.run("p1", "CONFIGURE_GAME", { reactionSeconds: 30 }), "INVALID_PHASE");
  const me = t.active();
  const hero = t.give(me, "hts.base.v1.hero.peanut");
  t.clock.now = 1000;
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
  assert.equal((t.game.chain as { deadlineAt: number }).deadlineAt, 46_000);
  const lobby = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "h", players: [{ playerId: "h", nickname: "H" }, { playerId: "g", nickname: "G" }] };
  const cmd = { commandId: "x", expectedRevision: 0, kind: "CONFIGURE_GAME", payload: { maskMode: "add" } } as BaseGameCommand;
  assert.equal(applyBaseCommand(lobby, roster, "g", cmd, t.deps), "FORBIDDEN");
  assert.equal(applyBaseCommand(lobby, roster, "h", cmd, t.deps), "ACCEPTED");
  assert.equal(lobby.settings.maskMode, "add");
});

test("C10: Leader passives never close a window by themselves; CONFIGURE_GAME with no change → NO_CHANGE", () => {
  const t = table(["the-fist-of-reason", "the-charismatic-song"]);
  assert.equal(t.run("p1", "CONFIGURE_GAME", {}), "INVALID_PHASE");
  const me = t.active(); // p2 (Charismatic Song: +1 hero roll)
  const them = t.game.turnOrder.find((id) => id !== me)!; // p1 (Fist of Reason: +2 challenge)
  const hero = t.give(me, "hts.base.v1.hero.peanut");
  const challengeCard = t.give(them, "hts.base.v1.challenge.challenge");
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
  t.dice.push([6, 6], [1, 1]);
  assert.equal(t.run(them, "REACT_CHALLENGE", { windowId: t.windowId(), cardInstanceId: challengeCard.cardId }), "ACCEPTED");
  // Defender (me) has no challenge passive → still pending; window stays open.
  assert.equal(t.game.chain?.step, "modifier_window");
  t.passRest();
  // Peanut entered the Party; immediate roll: Charismatic Song passive uses my slot, opponent still pending.
  t.dice.push([3, 3]);
  assert.equal(t.run(me, "IMMEDIATE_ROLL", { choice: "roll" }), "ACCEPTED");
  const chain = t.game.chain;
  assert.ok(chain?.step === "modifier_window" && chain.responders[me] === "pending" && chain.responders[them] === "pending");
  assert.equal(t.run(them, "REACT_PASS", { windowId: t.windowId() }), "ACCEPTED");
  assert.equal(t.game.chain?.step, "modifier_window", "roller has not Skipped yet");
  assert.equal(t.run(me, "REACT_PASS", { windowId: t.windowId() }), "ACCEPTED");
  assert.notEqual(t.game.chain?.step, "modifier_window");

  const lobby = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "h", players: [{ playerId: "h", nickname: "H" }, { playerId: "g", nickname: "G" }] };
  const cmd = (payload: Record<string, unknown>) => ({ commandId: "x", expectedRevision: 0, kind: "CONFIGURE_GAME", payload }) as BaseGameCommand;
  assert.equal(applyBaseCommand(lobby, roster, "h", cmd({ reactionSeconds: 20 }), t.deps), "NO_CHANGE");
});
