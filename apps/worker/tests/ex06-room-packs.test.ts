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

function started(withPacks: boolean) {
  const r = room(2);
  if (withPacks) r.run("p1", "CONFIGURE_GAME", { expansionIds: ids });
  const [a, b] = r.game.leaderPool.filter((id) => !id.includes("shadow-claw"));
  r.run("p1", "SELECT_PARTY_LEADER", { leaderId: a });
  r.run("p2", "SELECT_PARTY_LEADER", { leaderId: b });
  r.run("p2", "SET_READY", { ready: true });
  assert.equal(r.run("p1", "START_GAME"), "ACCEPTED");
  const me = r.game.seats.find((s) => s.playerId === r.game.turnOrder[r.game.currentPlayerIndex])!;
  return { ...r, me };
}

test("E15: Party cap is six in base rooms and seven with a pack", () => {
  for (const [withPacks, cap] of [[false, 6], [true, 7]] as const) {
    const t = started(withPacks);
    const heroCard = (id: string) => ({ cardId: id, definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" as const });
    t.me.party = Array.from({ length: cap - 1 }, (_, i) => ({ card: heroCard(`f${i}`), attachments: [] }));
    t.me.hand = [heroCard("in1"), heroCard("in2")];
    assert.equal(t.run(t.me.playerId, "PLAY_HAND_CARD", { cardInstanceId: "in1" }), "ACCEPTED", `${cap - 1} → ${cap} allowed`);
    // the played Hero sits in a challenge window; the cap is enforced again on entry
    t.game.chain = null;
    t.me.party.push({ card: heroCard("x"), attachments: [] });
    t.game.actionPoints = 3;
    assert.equal(t.run(t.me.playerId, "PLAY_HAND_CARD", { cardInstanceId: "in2" }), "PARTY_FULL", "full Party blocks another Hero");
  }
});

test("E01: class win needs six classes in base rooms and seven with a pack", async () => {
  const { classWinCount } = await import("../src/game/base-game.ts");
  assert.equal(classWinCount(initialBaseGameState()), 6);
  const packed = initialBaseGameState();
  packed.settings = { ...packed.settings, expansionIds: [ids[0]] };
  assert.equal(classWinCount(packed), 7);
});

test("views: the live catalog advertises no pack; ±6 Modifiers carry their discard cost", async () => {
  const { cardView } = await import("../src/game/base-content.ts");
  const { DS_MODIFIER_PLUS_6 } = await import("../src/game/expansion-ids.ts");
  const { GAME_SET_CATALOG } = await import("../src/content/set-catalog.ts");
  assert.deepEqual(GAME_SET_CATALOG.expansionSetIds, []);
  assert.deepEqual(catalog.expansionSetIds, ids.slice().sort((a, b) => ids.indexOf(a) - ids.indexOf(b)).filter((id) => catalog.expansionSetIds.includes(id)));
  assert.equal(cardView({ cardId: "m", definitionId: DS_MODIFIER_PLUS_6, kind: "modifier" }).discardCost, 1);
  assert.equal(cardView({ cardId: "m", definitionId: "hts.base.v1.modifier.modifier-plus-4", kind: "modifier" }).discardCost, undefined);
});
