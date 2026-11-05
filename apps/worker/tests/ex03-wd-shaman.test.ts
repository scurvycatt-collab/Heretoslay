// W09: The Noble Shaman — -1 passive on a chosen roll, once per turn, not a Modifier card.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { pass, playModifier, rollTotals, startAttack, useNobleShaman, type EngineDeps, type EngineHooks } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { NOBLE_SHAMAN } from "../src/game/expansion-ids.ts";
import { validateRoomSliceCommand } from "../../../packages/protocol/src/index.ts";

function table() {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: ["p1", "p2"].map((playerId) => ({ playerId, nickname: playerId })) };
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => [3, 3], now: () => 0 };
  const run = (pid: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, pid, { commandId: `c${++id}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  run("p1", "BEGIN_LEADER_SELECTION");
  run("p1", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" });
  run("p2", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-charismatic-song" });
  run("p1", "START_GAME");
  const me = game.seats.find((s) => s.playerId === game.turnOrder[game.currentPlayerIndex])!;
  const them = game.seats.find((s) => s !== me)!;
  me.leaderId = null;
  them.leaderId = NOBLE_SHAMAN;
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  const engineDeps: EngineDeps = deps;
  const attack = () => {
    game.chain = null;
    startAttack(game, me.playerId, game.faceUpMonsters[0], engineDeps, hooks);
    return (game.chain as { windowId: string }).windowId;
  };
  const total = () => rollTotals((game.chain as { roll: Parameters<typeof rollTotals>[0] }).roll).total;
  return { game, me, them, attack, total, deps: engineDeps, hooks, run };
}

test("Shaman holder applies -1 to the roller once per turn; a second use is rejected", () => {
  const t = table();
  const windowId = t.attack();
  assert.equal(t.total(), 6);
  assert.equal(useNobleShaman(t.game, t.them.playerId, { windowId }, t.deps), "ACCEPTED");
  assert.equal(t.total(), 5);
  assert.equal(useNobleShaman(t.game, t.them.playerId, { windowId }, t.deps), "LEADER_ACTION_UNAVAILABLE");
  assert.equal(t.total(), 5);
});

test("only the Shaman Leader may use it, not after Skipping, and `side` is Challenge-only", () => {
  const t = table();
  const windowId = t.attack();
  assert.equal(useNobleShaman(t.game, t.me.playerId, { windowId }, t.deps), "LEADER_ACTION_UNAVAILABLE");
  assert.equal(useNobleShaman(t.game, t.them.playerId, { windowId, side: "challenger" }, t.deps), "INVALID_MODIFIER_SIDE");
  assert.equal(pass(t.game, t.them.playerId, windowId, t.deps, t.hooks), "ACCEPTED");
  assert.equal(useNobleShaman(t.game, t.them.playerId, { windowId }, t.deps), "ALREADY_RESPONDED");
});

test("Stagguard blocks Modifier cards but not the Shaman passive", () => {
  const t = table();
  t.game.modifierLockBy = t.me.playerId;
  const windowId = t.attack();
  const mod: BaseCard = { cardId: "hts.base.v1.modifier.modifier-plus-2-minus-2#01", definitionId: "hts.base.v1.modifier.modifier-plus-2-minus-2", kind: "modifier" };
  t.them.hand.push(mod);
  assert.equal(playModifier(t.game, t.them.playerId, { windowId, cardInstanceId: mod.cardId, value: -2 }, t.deps, t.hooks), "MODIFIERS_LOCKED");
  assert.equal(useNobleShaman(t.game, t.them.playerId, { windowId }, t.deps), "ACCEPTED");
});

test("the REACT_SHAMAN command is wired end to end and validated", () => {
  const t = table();
  const windowId = t.attack();
  assert.equal(t.run(t.them.playerId, "REACT_SHAMAN", { windowId }), "ACCEPTED");
  assert.equal(t.total(), 5);
  const base = { commandId: "c", expectedRevision: 0, kind: "REACT_SHAMAN" };
  assert.equal(validateRoomSliceCommand({ ...base, payload: { windowId: "w" } }).ok, true);
  assert.equal(validateRoomSliceCommand({ ...base, payload: { windowId: "w", side: "challenger" } }).ok, true);
  assert.equal(validateRoomSliceCommand({ ...base, payload: { windowId: "w", side: "nope" } }).ok, false);
  assert.equal(validateRoomSliceCommand({ ...base, payload: {} }).ok, false);
});
