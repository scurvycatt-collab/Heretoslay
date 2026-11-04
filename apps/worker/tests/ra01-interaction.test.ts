// RA-01 (owner decisions 2026-11-04): C01 payment gate, C02 mandatory fallback, C03 nested order, C11 Forced Exchange.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";
import { buildEffect } from "../src/game/base-engine.ts";
import {
  applyBaseCommand,
  settleBaseGame,
  initialBaseGameState,
  projectBaseGame,
  type BaseGameDeps,
  type BaseRoster,
} from "../src/game/base-game.ts";

function table(leaders = ["the-charismatic-song", "the-fist-of-reason"]) {
  const players = leaders.map((_, index) => `p${index + 1}`);
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: players.map((playerId) => ({ playerId, nickname: playerId })) };
  const clock = { now: 0 };
  const dice: Array<[number, number]> = [];
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => dice.shift() ?? [6, 6], now: () => clock.now };
  let seq = 0;
  const run = (playerId: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, playerId, { commandId: `c${++seq}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  run("p1", "BEGIN_LEADER_SELECTION");
  players.forEach((playerId, index) => run(playerId, "SELECT_PARTY_LEADER", { leaderId: `hts.base.v1.party-leader.${leaders[index]}` }));
  run("p1", "START_GAME");
  const seat = (playerId: string) => game.seats.find((s) => s.playerId === playerId)!;
  const me = game.turnOrder[game.currentPlayerIndex];
  const them = game.turnOrder.find((pid) => pid !== me)!;
  const take = (definitionId: string): BaseCard => {
    for (const pool of [game.mainDeck, game.discard, ...game.seats.map((s) => s.hand)]) {
      const index = pool.findIndex((card) => card.definitionId === definitionId);
      if (index >= 0) return pool.splice(index, 1)[0];
    }
    throw new Error(definitionId);
  };
  const toHand = (playerId: string, definitionId: string) => {
    const card = take(definitionId);
    seat(playerId).hand.push(card);
    return card;
  };
  const toParty = (playerId: string, slug: string) => {
    const card = take(`hts.base.v1.hero.${slug}`);
    seat(playerId).party.push({ card, item: null });
    return card;
  };
  const toDeckTop = (definitionId: string) => {
    const card = take(definitionId);
    game.mainDeck.unshift(card);
    return card;
  };
  const passAll = () => {
    for (let guard = 0; guard < 5; guard += 1) {
      const chain = game.chain;
      if (!chain || (chain.step !== "challenge_window" && chain.step !== "modifier_window")) return;
      for (const [playerId, state] of Object.entries(chain.responders)) {
        if (state === "pending") run(playerId, "REACT_PASS", { windowId: chain.windowId });
      }
    }
  };
  const choice = () => {
    const chain = game.chain;
    assert.equal(chain?.step, "choice");
    return (chain as { choice: { choiceId: string; kind: string; min: number; max: number } }).choice;
  };
  /** Roll a Hero already in my Party (dice default 6+6 = success). */
  const roll = (hero: BaseCard, targets?: Record<string, unknown>) => {
    assert.equal(run(me, "USE_HERO_EFFECT", { heroInstanceId: hero.cardId, ...(targets ? { targets } : {}) }), "ACCEPTED");
    passAll();
  };
  return { clock, game, roster, deps, dice, run, seat, me, them, take, toHand, toParty, toDeckTop, passAll, choice, roll };
}

const play = (t: ReturnType<typeof table>, cardId: string, targets?: Record<string, unknown>) => {
  assert.equal(t.run(t.me, "PLAY_HAND_CARD", { cardInstanceId: cardId, ...(targets ? { targets } : {}) }), "ACCEPTED");
  t.passAll();
};
const expire = (t: ReturnType<typeof table>) => {
  const chain = t.game.chain as { choice: { deadlineAt: number } };
  t.clock.now = chain.choice.deadlineAt;
  settleBaseGame(t.game, t.roster, t.deps);
};

test("C01 Destructive Spell: full discard payment → DESTROY; Magic card ends in discard", () => {
  const t = table();
  const victim = t.toParty(t.them, "peanut");
  const spell = t.toHand(t.me, "hts.base.v1.magic.destructive-spell");
  const fodder = t.toHand(t.me, "hts.base.v1.hero.bad-axe");
  play(t, spell.cardId, { heroInstanceIds: [victim.cardId] });
  const c = t.choice() as { choiceId: string };
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [] }), "INVALID_CHOICE");
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [fodder.cardId] }), "ACCEPTED");
  assert.equal(t.seat(t.them).party.length, 0);
  assert.ok(t.game.discard.some((card) => card.cardId === spell.cardId));
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [fodder.cardId] }), "NO_PENDING_CHOICE");
});

test("C01 Destructive Spell: payment timeout → no DESTROY, nothing auto-paid, Magic still cleaned up", () => {
  const t = table();
  const victim = t.toParty(t.them, "peanut");
  const spell = t.toHand(t.me, "hts.base.v1.magic.destructive-spell");
  t.toHand(t.me, "hts.base.v1.hero.bad-axe");
  play(t, spell.cardId, { heroInstanceIds: [victim.cardId] });
  const fodder = t.seat(t.me).hand.find((card) => card.definitionId === "hts.base.v1.hero.bad-axe")!;
  const hand = t.seat(t.me).hand.length;
  expire(t);
  assert.equal(t.seat(t.them).party.length, 1, "no benefit without payment");
  assert.equal(t.seat(t.me).hand.length, hand, "payment not auto-taken");
  assert.ok(t.seat(t.me).hand.includes(fodder));
  assert.equal(t.game.chain, null);
  assert.ok(t.game.discard.some((card) => card.cardId === spell.cardId));
});

test("C01 Entangling Trap: insufficient cards → no STEAL; full payment → STEAL", () => {
  const poor = table();
  const target = poor.toParty(poor.them, "peanut");
  const trap = poor.toHand(poor.me, "hts.base.v1.magic.entangling-trap");
  const keep = poor.seat(poor.me).hand.find((card) => card !== trap)!;
  poor.seat(poor.me).hand = [trap, keep]; // after playing the trap only 1 card is left to pay 2
  play(poor, trap.cardId, { heroInstanceIds: [target.cardId] });
  assert.equal(poor.game.chain, null, "no payable choice opened");
  assert.equal(poor.seat(poor.them).party.length, 1, "no STEAL when payment is impossible");

  const t = table();
  const hero = t.toParty(t.them, "peanut");
  const card = t.toHand(t.me, "hts.base.v1.magic.entangling-trap");
  const a = t.toHand(t.me, "hts.base.v1.hero.bad-axe");
  const b = t.toHand(t.me, "hts.base.v1.hero.fluffy");
  play(t, card.cardId, { heroInstanceIds: [hero.cardId] });
  const c = t.choice() as { choiceId: string };
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [a.cardId, a.cardId] }), "INVALID_CHOICE");
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [a.cardId, b.cardId] }), "ACCEPTED");
  assert.ok(t.seat(t.me).party.some((h) => h.card.cardId === hero.cardId));
});

test("C02 mandatory penalty cannot be avoided by timeout; fallback is deterministic and fires once", () => {
  const t = table();
  const [h1, h2] = [t.toParty(t.me, "bad-axe"), t.toParty(t.me, "peanut")];
  t.game.faceUpMonsters = ["hts.base.v1.monster.terratuga#01"];
  t.dice.push([1, 1]);
  assert.equal(t.run(t.me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.terratuga#01" }), "ACCEPTED");
  t.passAll();
  assert.equal(t.choice().kind, "sacrifice_hero");
  expire(t);
  settleBaseGame(t.game, t.roster, t.deps); // replayed alarm: no second outcome
  const left = t.seat(t.me).party.map((h) => h.card.cardId);
  assert.deepEqual(left, [h2.cardId], "first eligible (Party order) is sacrificed");
  void h1;
});

test("C03 Snowball → Magic: nested play resolves (Challenge, effect, cleanup) before the second DRAW", () => {
  const t = table();
  const snow = t.toParty(t.me, "snowball");
  const victim = t.toParty(t.them, "peanut");
  const spell = t.toDeckTop("hts.base.v1.magic.destructive-spell");
  t.toHand(t.me, "hts.base.v1.hero.bad-axe"); // payment fodder
  t.roll(snow);
  const c = t.choice() as { choiceId: string };
  const deckBefore = t.game.mainDeck.length;
  assert.equal(
    t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [spell.cardId], targets: { heroInstanceIds: [victim.cardId] } }),
    "ACCEPTED",
  );
  assert.equal(t.game.chain?.step, "challenge_window");
  assert.equal(t.game.mainDeck.length, deckBefore, "no second draw during the child's Challenge window");
  t.passAll();
  const pay = t.choice() as { choiceId: string };
  assert.equal(t.game.mainDeck.length, deckBefore, "no second draw while the child's payment is pending");
  const fodder = t.seat(t.me).hand.find((card) => card.definitionId === "hts.base.v1.hero.bad-axe")!;
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: pay.choiceId, cardInstanceIds: [fodder.cardId] }), "ACCEPTED");
  assert.equal(t.seat(t.them).party.length, 0, "child DESTROY resolved");
  assert.equal(t.game.mainDeck.length, deckBefore - 1, "second DRAW happened after the child finished");
  assert.equal(t.game.chain, null);
});

test("C11 Forced Exchange: empty own Party ok; STEAL first, then return any own Hero (incl. the stolen one)", () => {
  const t = table();
  const hero = t.toParty(t.them, "peanut");
  const spare = t.toParty(t.them, "bad-axe");
  const fx = t.toHand(t.me, "hts.base.v1.magic.forced-exchange");
  play(t, fx.cardId, { heroInstanceIds: [hero.cardId] });
  assert.ok(t.seat(t.me).party.some((h) => h.card.cardId === hero.cardId), "STEAL done first");
  const c = t.choice() as { choiceId: string; kind: string };
  assert.equal(c.kind, "return_hero");
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [spare.cardId] }), "INVALID_CHOICE");
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [hero.cardId] }), "ACCEPTED");
  assert.equal(t.seat(t.me).party.length, 0);
  assert.ok(t.seat(t.them).party.some((h) => h.card.cardId === hero.cardId), "returned to the original victim");
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [hero.cardId] }), "NO_PENDING_CHOICE");
});

test("C11 Forced Exchange: blocked STEAL → no return choice, no transfer; return timeout falls back", () => {
  const blocked = table();
  const hero = blocked.toParty(blocked.them, "peanut");
  blocked.seat(blocked.them).protections.noSteal = true;
  const fx = blocked.toHand(blocked.me, "hts.base.v1.magic.forced-exchange");
  blocked.toParty(blocked.me, "bad-axe");
  play(blocked, fx.cardId, { heroInstanceIds: [hero.cardId] });
  assert.equal(blocked.game.chain, null);
  assert.equal(blocked.seat(blocked.me).party.length, 1);
  assert.equal(blocked.seat(blocked.them).party.length, 1);

  const t = table();
  const h = t.toParty(t.them, "peanut");
  const fx2 = t.toHand(t.me, "hts.base.v1.magic.forced-exchange");
  play(t, fx2.cardId, { heroInstanceIds: [h.cardId] });
  expire(t);
  assert.equal(t.seat(t.me).party.length, 0, "required return leg still happens on timeout");
  assert.equal(t.seat(t.them).party.length, 1);
});
