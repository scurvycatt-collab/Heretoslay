import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBaseCommand,
  initialBaseGameState,
  projectBaseGame,
  type BaseGameDeps,
  type BaseGameState,
  type BaseRoster,
} from "../src/game/base-game.ts";
import { BASE_REFERENCE_PHYSICAL_COPIES } from "../src/content/base-reference.ts";

function deps(): BaseGameDeps {
  let id = 0;
  return { newId: () => `turn-${++id}`, shuffle: (ids) => [...ids] };
}

function roster(count: number): BaseRoster {
  return {
    hostPlayerId: "p1",
    players: Array.from({ length: count }, (_, index) => ({
      playerId: `p${index + 1}`,
      nickname: `Player ${index + 1}`,
    })),
  };
}

let commandSeq = 0;
function cmd(kind: string, payload: Record<string, unknown> = {}) {
  return { commandId: `c-${++commandSeq}`, expectedRevision: 0, kind, payload } as any;
}

function startedGame(count: number) {
  const game = initialBaseGameState();
  const players = roster(count);
  const d = deps();
  assert.equal(applyBaseCommand(game, players, "p1", cmd("BEGIN_LEADER_SELECTION"), d), "ACCEPTED");
  for (let index = 0; index < count; index += 1) {
    assert.equal(
      applyBaseCommand(game, players, `p${index + 1}`, cmd("SELECT_PARTY_LEADER", {
        leaderId: game.leaderPool[index],
      }), d),
      "ACCEPTED",
    );
  }
  assert.equal(applyBaseCommand(game, players, "p1", cmd("START_GAME"), d), "ACCEPTED");
  return { game, players, d };
}

function mainCardTotal(game: BaseGameState) {
  return game.seats.reduce((total, seat) => total + seat.hand.length, 0) +
    game.mainDeck.length + game.discard.length;
}

test("base state uses the real catalog leader pool, not fixtures", () => {
  const game = initialBaseGameState();
  assert.equal(game.leaderPool.length, 6);
  assert.deepEqual(
    game.leaderPool,
    BASE_REFERENCE_PHYSICAL_COPIES.partyLeader.map((copy) => copy.definitionId),
  );
  assert.ok(game.leaderPool.every((id) => id.startsWith("hts.base.v1.party-leader.")));
});

test("start deals 5 real catalog cards each, 3 face-up monsters, last selector first with 3 AP", () => {
  const { game, players } = startedGame(4);
  assert.equal(game.phase, "turn_active");
  for (const seat of game.seats) {
    assert.equal(seat.hand.length, 5);
    assert.ok(seat.hand.every((card) => card.cardId.startsWith(`${card.definitionId}#`)));
    assert.ok(seat.hand.every((card) => card.kind !== "monster" && card.kind !== "party_leader"));
  }
  assert.equal(mainCardTotal(game), 115);
  assert.equal(game.faceUpMonsters.length, 3);
  assert.equal(game.monsterDeck.length, 12);
  const allIds = [...game.seats.flatMap((seat) => seat.hand), ...game.mainDeck].map((c) => c.cardId);
  assert.equal(new Set(allIds).size, 115);
  assert.deepEqual(game.turnOrder, ["p4", "p1", "p2", "p3"]);
  assert.equal(game.actionPoints, 3);
  assert.equal(game.turnNumber, 1);

  const view = projectBaseGame(game, players, { roomCode: "ABC234", revision: 9, serverNow: 1 }, "p2");
  assert.equal(view.game.currentPlayerId, "p4");
  assert.equal(view.yourHand.length, 5);
  assert.deepEqual(view.yourHand.map((c) => c.cardId), game.seats[1].hand.map((c) => c.cardId));
  assert.ok(view.game.faceUpMonsters.every((m) => m.kind === "monster"));
  const serialized = JSON.stringify(view);
  for (const other of game.seats.filter((seat) => seat.playerId !== "p2")) {
    for (const card of other.hand) assert.equal(serialized.includes(`"${card.cardId}"`), false);
  }
  for (const card of game.mainDeck) assert.equal(serialized.includes(`"${card.cardId}"`), false);
});

test("leader selection is sequential and unique; rejections do not mutate", () => {
  const game = initialBaseGameState();
  const players = roster(3);
  const d = deps();
  assert.equal(applyBaseCommand(game, roster(1), "p1", cmd("BEGIN_LEADER_SELECTION"), d), "NOT_ENOUGH_PLAYERS");
  assert.equal(applyBaseCommand(game, players, "p2", cmd("BEGIN_LEADER_SELECTION"), d), "FORBIDDEN");
  assert.equal(applyBaseCommand(game, players, "p1", cmd("BEGIN_LEADER_SELECTION"), d), "ACCEPTED");
  const leader = game.leaderPool[0];
  assert.equal(applyBaseCommand(game, players, "p2", cmd("SELECT_PARTY_LEADER", { leaderId: leader }), d), "NOT_ACTIVE_SELECTOR");
  assert.equal(applyBaseCommand(game, players, "p1", cmd("SELECT_PARTY_LEADER", { leaderId: "fixture.setup.leader.1" }), d), "LEADER_NOT_AVAILABLE");
  assert.equal(applyBaseCommand(game, players, "p1", cmd("START_GAME"), d), "SELECTION_INCOMPLETE");
  assert.equal(applyBaseCommand(game, players, "p1", cmd("SELECT_PARTY_LEADER", { leaderId: leader }), d), "ACCEPTED");
  const before = structuredClone(game);
  assert.equal(applyBaseCommand(game, players, "p2", cmd("SELECT_PARTY_LEADER", { leaderId: leader }), d), "LEADER_TAKEN");
  assert.deepEqual(game, before);
});

test("DRAW costs 1 AP, REDRAW costs 3 AP and discards the hand, END_TURN advances without carry-over", () => {
  const { game, players, d } = startedGame(2);
  // turn order: p2 (last selector), p1
  assert.equal(applyBaseCommand(game, players, "p1", cmd("DRAW_CARD"), d), "NOT_YOUR_TURN");
  assert.equal(applyBaseCommand(game, players, "p2", cmd("DRAW_CARD"), d), "ACCEPTED");
  assert.equal(game.seats[1].hand.length, 6);
  assert.equal(game.actionPoints, 2);
  assert.equal(applyBaseCommand(game, players, "p2", cmd("REDRAW_HAND"), d), "INSUFFICIENT_AP");
  assert.equal(applyBaseCommand(game, players, "p2", cmd("END_TURN"), d), "ACCEPTED");
  assert.equal(game.turnOrder[game.currentPlayerIndex], "p1");
  assert.equal(game.actionPoints, 3);
  assert.equal(game.turnNumber, 2);

  const oldHand = game.seats[0].hand.map((card) => card.cardId);
  assert.equal(applyBaseCommand(game, players, "p1", cmd("REDRAW_HAND"), d), "ACCEPTED");
  assert.equal(game.seats[0].hand.length, 5);
  assert.deepEqual(game.discard.map((card) => card.cardId), oldHand);
  assert.equal(game.turnOrder[game.currentPlayerIndex], "p2", "3 AP spent ends the turn");
  assert.equal(game.actionPoints, 3);
  assert.equal(mainCardTotal(game), 115);

  for (let index = 0; index < 3; index += 1) {
    assert.equal(applyBaseCommand(game, players, "p2", cmd("DRAW_CARD"), d), "ACCEPTED");
  }
  assert.equal(game.turnOrder[game.currentPlayerIndex], "p1", "turn ends when AP reaches 0");
});

test("demo-only commands are a mode mismatch in base", () => {
  const { game, players, d } = startedGame(2);
  const before = structuredClone(game);
  for (const kind of ["OPEN_REACTION_DEMO", "START_EFFECT_DEMO", "PLAY_CARD", "SKIP_REACTION"]) {
    assert.equal(applyBaseCommand(game, players, "p2", cmd(kind), d), "MODE_MISMATCH");
  }
  assert.deepEqual(game, before);
});
