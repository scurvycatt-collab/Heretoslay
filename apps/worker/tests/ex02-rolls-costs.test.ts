import assert from "node:assert/strict";
import test from "node:test";

import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";
import { paidHeroEffectCost } from "../src/game/ap-cost.ts";
import { heroClasses, rollMeets, DEFAULT_SETTINGS } from "../src/game/base-rules.ts";
import type { BaseCard } from "../src/game/base-content.ts";

const card = (definitionId: string, kind: BaseCard["kind"], n = 1): BaseCard => ({ cardId: `${definitionId}#${n}`, definitionId, kind });

test("E03: explicit gte/lte at every boundary; default is gte", () => {
  assert.equal(rollMeets(8, 8, "lte"), true);
  assert.equal(rollMeets(9, 8, "lte"), false);
  assert.equal(rollMeets(2, 8, "lte"), true);
  assert.equal(rollMeets(8, 8, "gte"), true);
  assert.equal(rollMeets(7, 8, "gte"), false);
  assert.equal(rollMeets(7, 8), false);
  assert.equal(rollMeets(8, 8), true);
});

test("E03: a Mask changes class but never the printed comparator or threshold", () => {
  const hero = { card: card("hts.base.v1.hero.bad-axe", "hero"), attachments: [card("hts.base.v1.item.wizard-mask", "item")] };
  assert.deepEqual(heroClasses(hero, DEFAULT_SETTINGS), ["wizard"]);
  // Comparator is a property of the card definition, not of PartyHero.
  assert.equal("rollComparator" in hero, false);
});

test("E10: Grimoire reprices a PAID effect roll to two AP; no Grimoire stays one", () => {
  const bare = { card: card("hts.base.v1.hero.bad-axe", "hero"), attachments: [] };
  const grimoire = EXPANSION_FACE_DRAFTS.find((f) => f.canonicalName === "Soulbound Grimoire")!.definitionId;
  const cursed = { ...bare, attachments: [card(grimoire, "cursed_item")] };
  assert.equal(paidHeroEffectCost(bare), 1);
  assert.equal(paidHeroEffectCost(cursed), 2);
  const withRing = { ...bare, attachments: [card("hts.base.v1.item.really-big-ring", "item"), card(grimoire, "cursed_item")] };
  assert.equal(paidHeroEffectCost(withRing), 2, "second slot Grimoire still applies");
});

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { BASE_CARDS_BY_ID } from "../src/content/base-cards.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";

test("E10 in game: Grimoire Hero spends two AP; one AP left is rejected atomically", () => {
  const players = ["p1", "p2"];
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: players.map((playerId) => ({ playerId, nickname: playerId })) };
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => [1, 1], now: () => 0 };
  const run = (pid: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, pid, { commandId: `c${++id}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  run("p1", "BEGIN_LEADER_SELECTION");
  run("p1", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" });
  run("p2", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-charismatic-song" });
  run("p1", "START_GAME");
  const me = game.seats.find((s) => s.playerId === game.turnOrder[game.currentPlayerIndex])!;
  const noTarget = [...BASE_CARDS_BY_ID.values()].find((c) => c.kind === "hero" && c.target === "none")!;
  const heroCard = { cardId: "h-1", definitionId: noTarget.definitionId, kind: "hero" as const };
  const grimoire = EXPANSION_FACE_DRAFTS.find((f) => f.canonicalName === "Soulbound Grimoire")!.definitionId;
  me.party.push({ card: heroCard, attachments: [{ cardId: "g-1", definitionId: grimoire, kind: "cursed_item" }] });
  game.actionPoints = 1;
  assert.equal(run(me.playerId, "USE_HERO_EFFECT", { heroInstanceId: "h-1", targets: {} }), "INSUFFICIENT_AP");
  assert.equal(game.actionPoints, 1);
  assert.ok(!game.heroRollsUsed.includes("h-1"), "allowance not consumed by a rejected action");
  game.actionPoints = 3;
  assert.equal(run(me.playerId, "USE_HERO_EFFECT", { heroInstanceId: "h-1", targets: {} }), "ACCEPTED");
  assert.equal(game.actionPoints, 1);
});
