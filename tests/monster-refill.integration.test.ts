// DECK-03: the face-up Monster row refills from the Monster deck whenever a Monster leaves the table.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refillFaceUpMonsters } from "../apps/worker/src/game/base-engine.ts";

test("refill tops the row back up to 3 from the top of the deck, in the slain slot", () => {
  const game = { faceUpMonsters: ["a", "c"], monsterDeck: ["d", "e", "f"] };
  assert.equal(refillFaceUpMonsters(game, 1), true);
  assert.deepEqual(game.faceUpMonsters, ["a", "d", "c"]);
  assert.deepEqual(game.monsterDeck, ["e", "f"]);
});

test("refill is idempotent and a no-op when the row is full", () => {
  const game = { faceUpMonsters: ["a", "b", "c"], monsterDeck: ["d"] };
  assert.equal(refillFaceUpMonsters(game), false);
  assert.deepEqual(game, { faceUpMonsters: ["a", "b", "c"], monsterDeck: ["d"] });
});

test("refill fills several empty slots and stops when the deck runs out (Q-09)", () => {
  const game = { faceUpMonsters: ["a"], monsterDeck: ["b"] };
  assert.equal(refillFaceUpMonsters(game), true);
  assert.deepEqual(game.faceUpMonsters, ["a", "b"]);
  assert.equal(refillFaceUpMonsters(game), false);
});
