// RA-04 regression guards (owner decisions 2026-11-04): C07 Quick Draw Item-only, C08 shared free roll, C09 equip/steal/destroy.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";

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
const options = (t: ReturnType<typeof table>) => {
  const chain = t.game.chain as { choice: { fromCardIds?: string[] } };
  return chain.choice.fromCardIds ?? [];
};

test("C07 Quick Draw: Item + Hero drawn → only the Item is offered", () => {
  const t = table();
  const qd = t.toParty(t.me, "quick-draw");
  t.toParty(t.me, "peanut"); // a Hero without an Item to equip
  const hero = t.toDeckTop("hts.base.v1.hero.bad-axe");
  const item = t.toDeckTop("hts.base.v1.item.really-big-ring");
  t.roll(qd);
  assert.equal(t.choice().kind, "play_card");
  assert.deepEqual(options(t), [item.cardId]);
  assert.ok(!options(t).includes(hero.cardId));
});

test("C07 Quick Draw: two Items offered, at most one played; no Item → no offer", () => {
  const t = table();
  const qd = t.toParty(t.me, "quick-draw");
  const target = t.toParty(t.me, "peanut");
  const a = t.toDeckTop("hts.base.v1.item.really-big-ring");
  const b = t.toDeckTop("hts.base.v1.item.particularly-rusty-coin");
  t.roll(qd);
  assert.deepEqual([...options(t)].sort(), [a.cardId, b.cardId].sort());
  const c = t.choice() as { choiceId: string };
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [a.cardId, b.cardId], targets: { heroInstanceIds: [target.cardId] } }), "INVALID_CHOICE");
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [] }), "ACCEPTED", "choosing none is allowed");

  const none = table();
  const qd2 = none.toParty(none.me, "quick-draw");
  none.toDeckTop("hts.base.v1.hero.bad-axe");
  none.toDeckTop("hts.base.v1.hero.fluffy");
  none.roll(qd2);
  assert.equal(none.game.chain, null, "no Item drawn → no offer");
});

test("C08 PLAY grants an optional free roll; it shares the once-per-turn allowance with the paid roll", () => {
  const t = table();
  const hero = t.toHand(t.me, "hts.base.v1.hero.peanut");
  t.toParty(t.them, "bad-axe");
  const ap = t.game.actionPoints;
  play(t, hero.cardId);
  assert.equal(t.game.chain?.step, "immediate_roll_choice");
  assert.equal(t.game.actionPoints, (ap ?? 0) - 1, "only the PLAY costs AP");
  assert.equal(t.run(t.me, "IMMEDIATE_ROLL", { choice: "roll" }), "ACCEPTED");
  t.passAll();
  assert.equal(t.run(t.me, "USE_HERO_EFFECT", { heroInstanceId: hero.cardId }), "HERO_ALREADY_ROLLED");
});

test("C08 skipping the free roll does not consume the allowance", () => {
  const t = table();
  const hero = t.toHand(t.me, "hts.base.v1.hero.peanut");
  play(t, hero.cardId);
  assert.equal(t.run(t.me, "IMMEDIATE_ROLL", { choice: "skip" }), "ACCEPTED");
  assert.equal(t.run(t.me, "USE_HERO_EFFECT", { heroInstanceId: hero.cardId }), "ACCEPTED");
});

test("C09 ordinary Item → own Hero only; equipped Item follows the Hero on STEAL and is discarded on DESTROY", () => {
  const t = table();
  const mine = t.toParty(t.me, "bad-axe");
  const theirs = t.toParty(t.them, "peanut");
  const ring = t.toHand(t.me, "hts.base.v1.item.really-big-ring");
  assert.notEqual(t.run(t.me, "PLAY_HAND_CARD", { cardInstanceId: ring.cardId, targets: { heroInstanceIds: [theirs.cardId] } }), "ACCEPTED");
  play(t, ring.cardId, { heroInstanceIds: [mine.cardId] });
  assert.equal(t.seat(t.me).party[0].item?.cardId, ring.cardId);

});

test("C09 STEAL moves Hero + equipped Item once; DESTROY discards both once", () => {
  const stolen = table();
  const hero = stolen.toParty(stolen.them, "peanut");
  const ring = stolen.take("hts.base.v1.item.really-big-ring");
  stolen.seat(stolen.them).party[0].item = ring;
  const trap = stolen.toHand(stolen.me, "hts.base.v1.magic.entangling-trap");
  const [x, y] = [stolen.toHand(stolen.me, "hts.base.v1.hero.bad-axe"), stolen.toHand(stolen.me, "hts.base.v1.hero.fluffy")];
  play(stolen, trap.cardId, { heroInstanceIds: [hero.cardId] });
  const c = stolen.choice() as { choiceId: string };
  stolen.run(stolen.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [x.cardId, y.cardId] });
  const mine = stolen.seat(stolen.me).party.find((h) => h.card.cardId === hero.cardId);
  assert.equal(mine?.item?.cardId, ring.cardId, "Item followed the stolen Hero");
  assert.equal(stolen.seat(stolen.them).party.length, 0);

  const destroyed = table();
  const victim = destroyed.toParty(destroyed.them, "peanut");
  const coin = destroyed.take("hts.base.v1.item.really-big-ring");
  destroyed.seat(destroyed.them).party[0].item = coin;
  const spell = destroyed.toHand(destroyed.me, "hts.base.v1.magic.destructive-spell");
  const fodder = destroyed.toHand(destroyed.me, "hts.base.v1.hero.bad-axe");
  play(destroyed, spell.cardId, { heroInstanceIds: [victim.cardId] });
  const d = destroyed.choice() as { choiceId: string };
  destroyed.run(destroyed.me, "RESOLVE_CHOICE", { choiceId: d.choiceId, cardInstanceIds: [fodder.cardId] });
  const inDiscard = (id: string) => destroyed.game.discard.filter((card) => card.cardId === id).length;
  assert.equal(inDiscard(victim.cardId), 1);
  assert.equal(inDiscard(coin.cardId), 1);
});
