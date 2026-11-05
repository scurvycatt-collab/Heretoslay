// EX-06: a room selects expansion packs in the lobby; decks, Leader pool and player cap follow the live catalog.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { createBnModule } from "../src/content/expansion-bn-module.ts";
import { createDsModule } from "../src/content/expansion-ds-module.ts";
import { createWdModule } from "../src/content/expansion-wd-module.ts";
import { createSetCatalog, EXPANSION_SET_IDS } from "../src/content/set-catalog.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";

const catalog = createSetCatalog([createWdModule(), createBnModule(), createDsModule()] as never[]);
const ids = Object.values(EXPANSION_SET_IDS);

function room(players: number, withCatalog = true) {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: Array.from({ length: players }, (_, i) => ({ playerId: `p${i + 1}`, nickname: `p${i + 1}` })) };
  let n = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++n}`, shuffle: (x) => [...x], rollDice: () => [3, 3], now: () => 0, ...(withCatalog ? { catalog: catalog as never } : {}) };
  const run = (pid: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, pid, { commandId: `c${++n}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  return { game, run };
}

test("the live catalog rejects every pack", () => {
  const { run, game } = room(2, false);
  assert.equal(run("p1", "CONFIGURE_GAME", { expansionIds: [EXPANSION_SET_IDS.warriorsDruids] }), "UNSUPPORTED_EXPANSION");
  assert.deepEqual(game.settings.expansionIds, []);
});

test("host selects packs: the Leader pool grows, a stale Leader pick is released, Ready resets", () => {
  const { run, game } = room(2);
  const base = game.leaderPool.length;
  assert.equal(run("p2", "CONFIGURE_GAME", { expansionIds: [ids[0]] }), "FORBIDDEN");
  assert.equal(run("p1", "CONFIGURE_GAME", { expansionIds: ids }), "ACCEPTED");
  assert.deepEqual(game.settings.expansionIds, ids);
  assert.ok(game.leaderPool.length > base);
  const extra = game.leaderPool.find((id) => !id.startsWith("hts.base.v1."))!;
  assert.equal(run("p1", "SELECT_PARTY_LEADER", { leaderId: extra }), "ACCEPTED");
  assert.equal(run("p1", "CONFIGURE_GAME", { expansionIds: ids }), "NO_CHANGE");
  assert.equal(run("p1", "CONFIGURE_GAME", { expansionIds: [] }), "ACCEPTED");
  assert.equal(game.leaderPool.length, base);
  assert.equal(game.seats.find((s) => s.playerId === "p1")!.leaderId, null, "expansion Leader released");
});

test("the game starts with the selected packs' cards in the decks", () => {
  const { run, game } = room(2);
  run("p1", "CONFIGURE_GAME", { expansionIds: ids });
  const leaders = game.leaderPool.filter((id) => !id.includes("shadow-claw")).slice(0, 2);
  run("p1", "SELECT_PARTY_LEADER", { leaderId: leaders[0] });
  run("p2", "SELECT_PARTY_LEADER", { leaderId: leaders[1] });
  run("p2", "SET_READY", { ready: true });
  assert.equal(run("p1", "START_GAME"), "ACCEPTED");
  const everyCard = [...game.mainDeck, ...game.seats.flatMap((s) => s.hand), ...game.discard];
  assert.ok(everyCard.some((c) => !c.definitionId.startsWith("hts.base.v1.")), "expansion cards were shuffled in");
  assert.ok(game.monsterDeck.concat(game.faceUpMonsters).some((id) => !id.startsWith("hts.base.v1.")), "expansion Monsters too");
});

test("player cap follows the composed set: 7 players need packs, base stays at 6", () => {
  const plain = room(7);
  plain.run("p1", "CONFIGURE_GAME", { turnSeconds: 30 }); // syncs the lobby seats
  assert.equal(plain.game.seats.length, 7);
  assert.equal(plain.run("p1", "START_GAME"), "NOT_ENOUGH_PLAYERS");

  const packed = room(7);
  packed.run("p1", "CONFIGURE_GAME", { expansionIds: ids });
  const leaders = packed.game.leaderPool.filter((id) => !id.includes("shadow-claw"));
  assert.ok(leaders.length >= 7);
  for (let i = 0; i < 7; i += 1) {
    assert.equal(packed.run(`p${i + 1}`, "SELECT_PARTY_LEADER", { leaderId: leaders[i] }), "ACCEPTED");
    if (i > 0) packed.run(`p${i + 1}`, "SET_READY", { ready: true });
  }
  assert.equal(packed.run("p1", "START_GAME"), "ACCEPTED");
});
