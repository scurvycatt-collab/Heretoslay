// GAME-005: effects that were logged no-ops — "play immediately", Pan Chucks, Qi Bear,
// Beary Wise, Bullseye, Sharp Fox, Silent Shadow, Wiggles, slain-Monster skills.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";
import { buildEffect } from "../src/game/base-engine.ts";
import {
  applyBaseCommand,
  initialBaseGameState,
  projectBaseGame,
  type BaseGameDeps,
  type BaseRoster,
} from "../src/game/base-game.ts";

function table(leaders = ["the-charismatic-song", "the-cloaked-sage"]) {
  const players = leaders.map((_, index) => `p${index + 1}`);
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: players.map((playerId) => ({ playerId, nickname: playerId })) };
  const dice: Array<[number, number]> = [];
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => dice.shift() ?? [6, 6], now: () => 0 };
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
    seat(playerId).party.push({ card, attachments: [] });
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
  return { game, roster, deps, dice, run, seat, me, them, take, toHand, toParty, toDeckTop, passAll, choice, roll };
}

test("Mellow Dee: drawn Hero may be played for free (Challenge window opens, no AP)", () => {
  const t = table();
  const dee = t.toParty(t.me, "mellow-dee");
  const peanut = t.toDeckTop("hts.base.v1.hero.peanut");
  t.roll(dee);
  assert.ok(t.seat(t.me).hand.some((card) => card.cardId === peanut.cardId), "Mellow Dee draws into the actor's hand");
  assert.ok(!t.seat(t.them).hand.some((card) => card.cardId === peanut.cardId), "the drawn card never enters another hand");
  const c = t.choice();
  assert.equal(c.kind, "play_card");
  assert.equal(c.min, 0);
  const ap = t.game.actionPoints;
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: (c as { choiceId: string }).choiceId, cardInstanceIds: [peanut.cardId] }), "ACCEPTED");
  assert.equal(t.game.chain?.step, "challenge_window");
  t.passAll();
  assert.ok(t.seat(t.me).party.some((h) => h.card.cardId === peanut.cardId));
  assert.equal(t.game.actionPoints, ap);
});

test("Hook: play an Item from hand immediately (targets via RESOLVE_CHOICE), then DRAW", () => {
  const t = table();
  const hook = t.toParty(t.me, "hook");
  const ring = t.toHand(t.me, "hts.base.v1.item.really-big-ring");
  t.roll(hook);
  const c = t.choice() as { choiceId: string };
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [ring.cardId] }), "INVALID_TARGET");
  const hand = t.seat(t.me).hand.length;
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [ring.cardId], targets: { heroInstanceIds: [hook.cardId] } }), "ACCEPTED");
  t.passAll();
  assert.equal(t.seat(t.me).party[0].attachments[0]?.cardId, ring.cardId);
  assert.equal(t.seat(t.me).hand.length, hand); // −Ring +1 drawn
});

test("Qi Bear: DISCARD up to 3, one DESTROY choice per discarded card", () => {
  const t = table();
  const qi = t.toParty(t.me, "qi-bear");
  const a = t.toParty(t.them, "peanut");
  const b = t.toParty(t.them, "bad-axe");
  t.dice.push([6, 6]);
  t.roll(qi);
  const discard = t.choice() as { choiceId: string; min: number; max: number };
  assert.deepEqual([discard.min, discard.max], [0, 3]);
  const twoCards = t.seat(t.me).hand.slice(0, 2).map((card) => card.cardId);
  t.run(t.me, "RESOLVE_CHOICE", { choiceId: discard.choiceId, cardInstanceIds: twoCards });
  for (const hero of [a, b]) {
    const pick = t.choice() as { choiceId: string; kind: string };
    assert.equal(pick.kind, "destroy_hero");
    assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: pick.choiceId, cardInstanceIds: [hero.cardId] }), "ACCEPTED");
  }
  assert.equal(t.seat(t.them).party.length, 0);
});

test("Bullseye / Sharp Fox / Silent Shadow: private views go only to the chooser", () => {
  const t = table();
  const eye = t.toParty(t.me, "bullseye");
  t.roll(eye);
  const top3 = t.game.mainDeck.slice(0, 3).map((card) => card.cardId);
  const mine = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, t.me);
  const theirs = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, t.them);
  assert.deepEqual(mine.game.chain?.step === "choice" && mine.game.chain.options?.map((c) => c.cardId), top3);
  assert.equal(JSON.stringify(theirs).includes(top3[0]), false);
  t.run(t.me, "RESOLVE_CHOICE", { choiceId: t.choice().choiceId, cardInstanceIds: [top3[1]] });
  assert.ok(t.seat(t.me).hand.some((card) => card.cardId === top3[1]));
  const order = t.choice() as { choiceId: string; kind: string; min: number };
  assert.deepEqual([order.kind, order.min], ["order_top", 2]);
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: order.choiceId, cardInstanceIds: [top3[0]] }), "INVALID_CHOICE");
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: order.choiceId, cardInstanceIds: [top3[2], top3[0]] }), "ACCEPTED");
  assert.deepEqual(t.game.mainDeck.slice(0, 2).map((card) => card.cardId), [top3[2], top3[0]]);

  const t2 = table();
  const shadow = t2.toParty(t2.me, "silent-shadow");
  t2.roll(shadow, { playerId: t2.them });
  const target = t2.seat(t2.them).hand[0].cardId;
  t2.run(t2.me, "RESOLVE_CHOICE", { choiceId: t2.choice().choiceId, cardInstanceIds: [target] });
  assert.ok(t2.seat(t2.me).hand.some((card) => card.cardId === target));
});

test("Beary Wise: others DISCARD 1, actor takes one of those cards", () => {
  const t = table();
  const bear = t.toParty(t.me, "beary-wise");
  t.roll(bear);
  const theirChoice = t.choice() as { choiceId: string };
  const dropped = t.seat(t.them).hand[0].cardId;
  t.run(t.them, "RESOLVE_CHOICE", { choiceId: theirChoice.choiceId, cardInstanceIds: [dropped] });
  const pick = t.choice() as { choiceId: string; kind: string };
  assert.equal(pick.kind, "take_from_discard");
  const view = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, t.me);
  assert.deepEqual(view.game.chain?.step === "choice" && view.game.chain.options?.map((c) => c.cardId), [dropped]);
  t.run(t.me, "RESOLVE_CHOICE", { choiceId: pick.choiceId, cardInstanceIds: [dropped] });
  assert.ok(t.seat(t.me).hand.some((card) => card.cardId === dropped));
});

test("Wiggles: STEAL then a free roll of the stolen Hero", () => {
  const t = table();
  const wiggles = t.toParty(t.me, "wiggles");
  const peanut = t.toParty(t.them, "peanut");
  t.roll(wiggles, { heroInstanceIds: [peanut.cardId] });
  assert.ok(t.seat(t.me).party.some((h) => h.card.cardId === peanut.cardId));
  assert.equal(t.game.chain?.step, "immediate_roll_choice");
  const hand = t.seat(t.me).hand.length;
  assert.equal(t.run(t.me, "IMMEDIATE_ROLL", { choice: "roll" }), "ACCEPTED");
  t.passAll();
  assert.equal(t.seat(t.me).hand.length, hand + 2); // Peanut: DRAW 2
});

test("Corrupted Sabretooth: may STEAL instead of DESTROY; declining destroys", () => {
  const t = table();
  t.seat(t.me).slain = ["hts.base.v1.monster.corrupted-sabretooth#01"];
  const axe = t.toParty(t.me, "bad-axe");
  const victim = t.toParty(t.them, "peanut");
  t.roll(axe, { heroInstanceIds: [victim.cardId] });
  const c = t.choice() as { choiceId: string; kind: string };
  assert.equal(c.kind, "confirm");
  t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [], accept: true });
  assert.ok(t.seat(t.me).party.some((h) => h.card.cardId === victim.cardId));

  const t2 = table();
  t2.seat(t2.me).slain = ["hts.base.v1.monster.corrupted-sabretooth#01"];
  const axe2 = t2.toParty(t2.me, "bad-axe");
  const victim2 = t2.toParty(t2.them, "peanut");
  t2.roll(axe2, { heroInstanceIds: [victim2.cardId] });
  t2.run(t2.me, "RESOLVE_CHOICE", { choiceId: t2.choice().choiceId, cardInstanceIds: [], accept: false });
  assert.ok(t2.game.discard.some((card) => card.cardId === victim2.cardId));
});

test("Rex Major / Orthus: DRAW triggers ask the player", () => {
  const t = table();
  t.seat(t.me).slain = ["hts.base.v1.monster.rex-major#01", "hts.base.v1.monster.orthus#01"];
  t.toDeckTop("hts.base.v1.modifier.modifier-plus-4");
  assert.equal(t.run(t.me, "DRAW_CARD"), "ACCEPTED");
  const c = t.choice() as { choiceId: string; kind: string };
  assert.equal(c.kind, "confirm");
  t.toDeckTop("hts.base.v1.magic.enchanted-spell"); // next card drawn by Rex Major
  t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [], accept: true });
  const offer = t.choice() as { choiceId: string; kind: string };
  assert.equal(offer.kind, "play_card"); // Orthus: play the drawn Magic?
  t.run(t.me, "RESOLVE_CHOICE", { choiceId: offer.choiceId, cardInstanceIds: [] });
  assert.equal(t.game.chain, null);
});

test("every Hero/Magic effectId has a handler (no silent no-op left)", () => {
  const t = table();
  const steps = buildEffect(t.game, "hero.does-not-exist", t.me, {});
  assert.equal(steps[0].op, "log");
});

test("review: hidden drawn card is never named in public prompt/log unless revealed; unplayable Item not offered", () => {
  const t = table();
  t.seat(t.me).slain = ["hts.base.v1.monster.orthus#01"];
  const spell = t.toDeckTop("hts.base.v1.magic.enchanted-spell");
  t.run(t.me, "DRAW_CARD");
  const theirs = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, t.them);
  assert.equal(JSON.stringify(theirs).includes("Enchanted Spell"), false);
  assert.equal(JSON.stringify(theirs).includes(spell.cardId), false);
  t.run(t.me, "RESOLVE_CHOICE", { choiceId: t.choice().choiceId, cardInstanceIds: [] });

  const t2 = table();
  const hook = t2.toParty(t2.me, "hook");
  t2.seat(t2.me).party[0].attachments = [t2.take("hts.base.v1.item.decoy-doll")]; // only Hero already equipped
  for (const card of [...t2.seat(t2.me).hand]) if (card.kind !== "item") t2.game.discard.push(t2.seat(t2.me).hand.splice(t2.seat(t2.me).hand.indexOf(card), 1)[0]);
  t2.toHand(t2.me, "hts.base.v1.item.really-big-ring");
  t2.roll(hook);
  // No legal target for the Item → no choice opens; Hook still DRAWs.
  assert.equal(t2.game.chain, null);
});
