// EX-06 views: Shaman availability per viewer, Hero Item slots, Maegisty protection label.
import assert from "node:assert/strict";
import test from "node:test";

import { initialBaseGameState, projectBaseGame, type BaseRoster } from "../src/game/base-game.ts";
import { NOBLE_SHAMAN } from "../src/game/expansion-ids.ts";

function started() {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: ["p1", "p2"].map((playerId) => ({ playerId, nickname: playerId })) };
  game.seats = roster.players.map(({ playerId }) => ({ playerId, leaderId: null, hand: [], party: [], slain: [], protections: { noDestroy: false, noSteal: false } }));
  game.seats[1].leaderId = NOBLE_SHAMAN;
  game.phase = "turn_active";
  const view = (viewer: string, spectator = false) =>
    projectBaseGame(game, roster, { roomCode: "ABCD", revision: 1, serverNow: 0, ...(spectator ? { viewerNickname: "watcher" } : {}) }, viewer);
  return { game, view };
}

test("shamanAvailable is true only for the Noble Shaman holder until it is used", () => {
  const { game, view } = started();
  assert.equal(view("p1").game.shamanAvailable, false);
  assert.equal(view("p2").game.shamanAvailable, true);
  assert.equal(view("watcher", true).game.shamanAvailable, false, "spectators never get the button");
  game.shamanUsed = true;
  assert.equal(view("p2").game.shamanAvailable, false);
});

test("Maegisty shows as return_to_hand; party entries expose Item slots", () => {
  const { game, view } = started();
  game.seats[0].protections = { noDestroy: true, noSteal: false, returnToHand: true } as never;
  game.seats[0].party = [{ card: { cardId: "h1", definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" }, attachments: [] }] as never;
  const seat = view("p2").players.find((p) => p.playerId === "p1")!;
  assert.deepEqual(seat.protections, ["no_destroy", "return_to_hand"]);
  assert.equal(seat.party[0].slots, 1);
});
