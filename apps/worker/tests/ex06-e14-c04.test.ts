// E14 / C04 with expansion passives: a winning third SLAY ends the game before deferred DRAW triggers run.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";

const face = (setKey: string, name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === setKey && d.canonicalName === name)!.definitionId;

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


const CHALLENGE = "hts.base.v1.challenge.challenge";

function withManticoreAndMongrel(owned: string[]) {
  const t = table();
  t.seat(t.me).leaderId = face("berserkersNecromancers", "The Raging Manticore");
  t.toDeckTop(CHALLENGE);
  t.toDeckTop(CHALLENGE);
  t.toDeckTop(CHALLENGE);
  const before = attackSab(t, [`${face("dragonSorcerer", "Calamity Mongrel")}#01`, ...owned]);
  return { t, before };
}

test("E14: Manticore + Calamity Mongrel on a winning third SLAY: draws happen, no Mongrel offer, game over", () => {
  const { t, before } = withManticoreAndMongrel([ARIES]);
  assert.equal(t.game.phase, "game_over");
  assert.equal(t.game.winnerPlayerId, t.me);
  assert.equal(t.game.chain, null, "no deferred Mongrel offer after the win");
  assert.equal(t.seat(t.me).hand.length, before + 3, "Sabretooth reward 1 + Manticore 2, Challenges kept");
});

test("E14: the same draws on a NON-winning slay do release the Mongrel offers after the award", () => {
  const { t } = withManticoreAndMongrel([]);
  assert.notEqual(t.game.phase, "game_over");
  assert.equal((t.game.chain as { choice?: { kind: string } } | null)?.choice?.kind, "confirm", "Mongrel offer runs after the Monster was awarded");
});
