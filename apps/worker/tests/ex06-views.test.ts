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

test("immediate_roll_choice view carries the Mirroryu bonus and the Shamanaga sacrifice flag", () => {
  const { game, view } = started();
  game.seats[0].party = [{ card: { cardId: "h1", definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" }, attachments: [] }] as never;
  game.chain = { step: "immediate_roll_choice", deadlineAt: 1, actorId: "p1", heroCardId: "h1", bonus: 3, free: true } as never;
  let chain = view("p2").game.chain as { bonus?: number; sacrificesAfter?: boolean };
  assert.equal(chain.bonus, 3);
  assert.equal(chain.sacrificesAfter, undefined);
  game.chain = { step: "immediate_roll_choice", deadlineAt: 1, actorId: "p1", heroCardId: "h1", after: [{ op: "sacrifice_hero_card", heroCardId: "h1" }] } as never;
  chain = view("p2").game.chain as { bonus?: number; sacrificesAfter?: boolean };
  assert.equal(chain.bonus, undefined);
  assert.equal(chain.sacrificesAfter, true);
});

test("spectator view: no hand, no choice options, no shaman, no private roll targets", () => {
  const { game, view } = started();
  game.seats[0].hand = [{ cardId: "c1", definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" }] as never;
  game.seats[0].party = [{ card: { cardId: "h1", definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" }, attachments: [] }] as never;
  game.chain = { step: "choice", choice: { choiceId: "x", kind: "mirror_hero", playerId: "p1", min: 1, max: 1, deadlineAt: 1, prompt: "pick" } } as never;
  const spectator = view("watcher", true);
  assert.deepEqual(spectator.yourHand, []);
  assert.equal((spectator.game.chain as { options?: unknown }).options, undefined, "options only go to the chooser");
  assert.equal(spectator.game.shamanAvailable, false);
  assert.ok(!JSON.stringify(spectator).includes("c1"), "hand card id never leaks to a spectator");
  assert.ok((view("p1").game.chain as { options?: unknown[] }).options, "the chooser does get options");
});
