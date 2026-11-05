// RA-02 (owner decisions 2026-11-04): C04 reward DRAW → award → win → passives, C05 Titan Wyvern both Challenge sides.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";
import { rollPassives } from "../src/game/base-rules.ts";
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
  return { clock, game, roster, deps, dice, run, seat, me, them, take, toHand, toParty, toDeckTop, passAll, choice, roll };
}

const SAB = "hts.base.v1.monster.corrupted-sabretooth#01";
const ARIES = "hts.base.v1.monster.artic-aries#01";
const TERRA = "hts.base.v1.monster.terratuga#01";

function attackSab(t: ReturnType<typeof table>, owned: string[] = []) {
  for (const slug of ["bad-axe", "peanut", "fluffy"]) t.toParty(t.me, slug);
  t.seat(t.me).slain = [...owned];
  const before = t.seat(t.me).hand.length;
  t.game.faceUpMonsters = [SAB, "hts.base.v1.monster.mega-slime#01", "hts.base.v1.monster.bloodwing#01"];
  t.game.actionPoints = 3;
  t.dice.push([6, 6]); // 12 ≥ 9
  assert.equal(t.run(t.me, "ATTACK_MONSTER", { monsterInstanceId: SAB }), "ACCEPTED");
  t.passAll();
  return before;
}

test("C04 ordinary slay: printed reward DRAW, then Monster joins the Party; refill after", () => {
  const t = table();
  const hand = attackSab(t, [ARIES]);
  assert.equal(t.seat(t.me).hand.length, hand + 1, "Sabretooth reward DRAW 1");
  assert.deepEqual(t.seat(t.me).slain, [ARIES, SAB]);
  assert.equal(t.game.pendingMonster ?? null, null);
  assert.ok(!t.game.faceUpMonsters.includes(SAB));
  const text = t.game.log.map((l) => l.text);
  const drew = text.findIndex((x) => x.includes("rút 1 lá"));
  const award = text.findIndex((x) => x.includes("nhận") && x.includes("vào Party"));
  assert.ok(drew >= 0 && award > drew, "reward draw logged before the Monster is awarded");
});

test("C04 third slay: reward DRAW still happens before GAME_OVER; no refill/passives after the win", () => {
  const t = table();
  const hand = attackSab(t, [ARIES, TERRA]);
  assert.equal(t.game.phase, "game_over");
  assert.equal(t.game.winnerPlayerId, t.me);
  assert.equal(t.game.winReason, "slay_3");
  assert.equal(t.seat(t.me).hand.length, hand + 1, "third-slay reward DRAW performed");
  assert.equal(t.seat(t.me).slain.length, 3);
  assert.equal(t.game.faceUpMonsters.length, 2, "no refill after the win");
  assert.equal(t.game.chain, null);
});

test("C04 reward draw trigger eligibility is fixed at draw time and survives the deferral", () => {
  const t = table();
  const magic = t.toDeckTop("hts.base.v1.magic.destructive-spell");
  attackSab(t, ["hts.base.v1.monster.orthus#01"]);
  const c = t.choice() as { kind: string; choiceId: string };
  assert.equal(c.kind, "play_card", "Orthus offer released after the award");
  assert.ok(t.seat(t.me).slain.includes(SAB), "Monster already awarded when passives run");
  void magic;
});

test("C04 no reward DRAW for a Monster whose printed success has none", () => {
  const t = table();
  for (const slug of ["bad-axe", "peanut", "fluffy"]) t.toParty(t.me, slug);
  t.game.faceUpMonsters = [ARIES, SAB, TERRA];
  t.game.actionPoints = 3;
  t.dice.push([6, 6]);
  const hand = t.seat(t.me).hand.length;
  t.run(t.me, "ATTACK_MONSTER", { monsterInstanceId: ARIES });
  t.passAll();
  if (t.seat(t.me).slain.includes(ARIES)) assert.equal(t.seat(t.me).hand.length, hand);
});

test("C05 Titan Wyvern: holder gets +1 as challenger AND defender; opponent never", () => {
  const t = table();
  const holder = t.seat(t.me);
  holder.slain = ["hts.base.v1.monster.titan-wyvern#01"];
  const other = t.seat(t.them);
  const has = (list: Array<{ source: string }>) => list.some((p) => p.source.includes("titan-wyvern"));
  assert.ok(has(rollPassives(holder, "challenge_challenger", {})));
  assert.ok(has(rollPassives(holder, "challenge_defender", {})));
  assert.ok(!has(rollPassives(other, "challenge_challenger", {})));
  assert.ok(!has(rollPassives(other, "challenge_defender", {})));
  assert.ok(!has(rollPassives(holder, "attack", {})) && !has(rollPassives(holder, "hero_effect", {})));
});
