// RA-03 (owner decisions 2026-11-04): C06 bounded public reveal; C10 persisted-state migration.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";
import { normalizeBaseGame } from "../src/game/base-game.ts";
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


const view = (t: ReturnType<typeof table>, viewer: string | null) =>
  projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, viewer as string);

test("C06 Pan Chucks: accepted reveal discloses exactly the Challenge card to everyone; hand stays private", () => {
  const t = table();
  const pan = t.toParty(t.me, "pan-chucks");
  t.toParty(t.them, "peanut");
  const ch = t.toDeckTop("hts.base.v1.challenge.challenge");
  t.roll(pan);
  const c = t.choice() as { choiceId: string; kind: string };
  assert.equal(c.kind, "confirm");
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [], accept: true }), "ACCEPTED");
  const reveals = view(t, t.them).game.reveals;
  assert.equal(reveals.length, 1);
  assert.equal(reveals[0].card.cardId, ch.cardId);
  assert.equal(reveals[0].playerId, t.me);
  assert.ok(reveals[0].expiresAt > 0);
  const text = JSON.stringify(view(t, t.them));
  for (const other of t.seat(t.me).hand) if (other.cardId !== ch.cardId) assert.ok(!text.includes(other.cardId), "unrelated hand card stays hidden");
});

test("C06 Pan Chucks: declined reveal discloses nothing; reveals stay bounded", () => {
  const t = table();
  const pan = t.toParty(t.me, "pan-chucks");
  t.toParty(t.them, "peanut");
  t.toDeckTop("hts.base.v1.challenge.challenge");
  t.roll(pan);
  const c = t.choice() as { choiceId: string };
  assert.equal(t.run(t.me, "RESOLVE_CHOICE", { choiceId: c.choiceId, cardInstanceIds: [], accept: false }), "ACCEPTED");
  assert.equal(view(t, t.them).game.reveals.length, 0);
});

test("C10 migration: legacy 'played' responders become pending (window not stuck); removed setting dropped", () => {
  const t = table();
  const raw = JSON.parse(JSON.stringify(t.game));
  raw.settings.leaderPassiveUsesModifierSlot = true;
  raw.chain = { step: "modifier_window", windowId: "w", deadlineAt: 10, roll: { kind: "attack", rollerId: "p1", dice: [1, 1], monsterId: "x", modifiers: [], passives: [] }, responders: { p1: "played", p2: "passed" } };
  const game = normalizeBaseGame(raw);
  assert.deepEqual((game.chain as { responders: Record<string, string> }).responders, { p1: "pending", p2: "passed" });
  assert.ok(!("leaderPassiveUsesModifierSlot" in game.settings));
  assert.deepEqual(game.reveals, []);
});
