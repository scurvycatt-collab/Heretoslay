// EX-06: old saves without settings.expansionIds load cleanly; selected packs survive a persist/restore cycle.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { createBnModule } from "../src/content/expansion-bn-module.ts";
import { createDsModule } from "../src/content/expansion-ds-module.ts";
import { createWdModule } from "../src/content/expansion-wd-module.ts";
import { createSetCatalog, EXPANSION_SET_IDS } from "../src/content/set-catalog.ts";
import { classWinCount, initialBaseGameState, normalizeBaseGame, applyBaseCommand, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import { partyLimit } from "../src/game/base-engine.ts";

const catalog = createSetCatalog([createWdModule(), createBnModule(), createDsModule()] as never[]);
const ids = Object.values(EXPANSION_SET_IDS);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test("schema 2 save without expansionIds normalizes to base rules", () => {
  const raw = clone(initialBaseGameState()) as unknown as { settings: Record<string, unknown> };
  delete raw.settings.expansionIds;
  const game = normalizeBaseGame(raw);
  assert.deepEqual(game.settings.expansionIds ?? [], []);
  assert.equal(partyLimit(game), 6);
  assert.equal(classWinCount(game), 6);
});

test("schema 1 save without expansionIds loads and keeps base limits", () => {
  const raw = clone(initialBaseGameState()) as unknown as { schema: number; settings: Record<string, unknown> };
  raw.schema = 1;
  delete raw.settings.expansionIds;
  const game = normalizeBaseGame(raw);
  assert.equal(game.schema, 2);
  assert.equal(partyLimit(game), 6);
  assert.equal(classWinCount(game), 6);
});

test("selected packs survive JSON restore and normalize twice", () => {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: [{ playerId: "p1", nickname: "a" }, { playerId: "p2", nickname: "b" }] };
  let n = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++n}`, shuffle: (x) => [...x], rollDice: () => [3, 3], now: () => 0, catalog: catalog as never };
  const cmd = { commandId: "c1", expectedRevision: 0, kind: "CONFIGURE_GAME", payload: { expansionIds: ids } } as BaseGameCommand;
  assert.equal(applyBaseCommand(game, roster, "p1", cmd, deps), "ACCEPTED");

  const restored = normalizeBaseGame(clone(game));
  assert.deepEqual(restored.settings.expansionIds, ids);
  assert.deepEqual(restored.leaderPool, game.leaderPool);
  assert.equal(partyLimit(restored), 7);
  assert.equal(classWinCount(restored), 7);
  assert.deepEqual(normalizeBaseGame(clone(restored)), restored);
});
