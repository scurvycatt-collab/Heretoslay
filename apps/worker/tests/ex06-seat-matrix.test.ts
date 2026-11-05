// EX-06 / E16: seat cap = min(8, unique Leaders) for every pack combination; one seat over the cap cannot start.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { createBnModule } from "../src/content/expansion-bn-module.ts";
import { createDsModule } from "../src/content/expansion-ds-module.ts";
import { createWdModule } from "../src/content/expansion-wd-module.ts";
import { createSetCatalog, EXPANSION_SET_IDS } from "../src/content/set-catalog.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";

const catalog = createSetCatalog([createWdModule(), createBnModule(), createDsModule()] as never[]);
const all = Object.values(EXPANSION_SET_IDS);
const combos = Array.from({ length: 8 }, (_, mask) => all.filter((_, i) => mask & (1 << i)));

function lobby(players: number, expansionIds: string[]) {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: Array.from({ length: players }, (_, i) => ({ playerId: `p${i + 1}`, nickname: `p${i + 1}` })) };
  let n = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++n}`, shuffle: (x) => [...x], rollDice: () => [3, 3], now: () => 0, catalog: catalog as never };
  const run = (pid: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, pid, { commandId: `c${++n}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  if (expansionIds.length) assert.equal(run("p1", "CONFIGURE_GAME", { expansionIds }), "ACCEPTED");
  else run("p1", "CONFIGURE_GAME", { turnSeconds: 30 });
  return { game, run };
}

function fillAndStart(players: number, expansionIds: string[]) {
  const { game, run } = lobby(players, expansionIds);
  const leaders = game.leaderPool;
  for (let i = 0; i < players; i += 1) {
    const picked = run(`p${i + 1}`, "SELECT_PARTY_LEADER", { leaderId: leaders[i] ?? "none" });
    if (picked !== "ACCEPTED") return { result: picked, game };
    if (i > 0) run(`p${i + 1}`, "SET_READY", { ready: true });
  }
  return { result: run("p1", "START_GAME"), game };
}

for (const packs of combos) {
  const name = packs.length ? packs.join("+") : "base";
  const cap = catalog.compose(packs).maxPlayers;

  test(`seat matrix [${name}]: cap ${cap} = min(8, unique Leaders)`, () => {
    const composed = catalog.compose(packs);
    assert.equal(cap, Math.min(8, composed.leaderPool.length));
    assert.equal(fillAndStart(cap, packs).result, "ACCEPTED", `${cap} players start`);
    assert.notEqual(fillAndStart(cap + 1, packs).result, "ACCEPTED", `${cap + 1} players are refused`);
    assert.equal(fillAndStart(2, packs).result, "ACCEPTED", "2 players start");
  });
}

test("seat matrix: Dragon & Sorcerer alone cannot seat eight", () => {
  const ds = [EXPANSION_SET_IDS.dragonSorcerer];
  assert.equal(catalog.compose(ds).maxPlayers, 7);
  assert.notEqual(fillAndStart(8, ds).result, "ACCEPTED");
});
