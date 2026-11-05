import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";
import { canAttach, detach, detachAll, isMask, slotCapacity } from "../src/game/attachments.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { playTargetError } from "../src/game/base-engine.ts";
import {
  applyBaseCommand, initialBaseGameState, normalizeBaseGame,
  type BaseGameDeps, type BaseRoster,
} from "../src/game/base-game.ts";

const card = (definitionId: string, kind: BaseCard["kind"], n = 1): BaseCard => ({ cardId: `${definitionId}#${n}`, definitionId, kind });
const face = (name: string) => EXPANSION_FACE_DRAFTS.find((f) => f.canonicalName === name)!.definitionId;
const hero = (definitionId: string, attachments: BaseCard[] = []) => ({ card: card(definitionId, "hero"), attachments });

test("E02 capacity follows the printed definition: exactly the eight reviewed Heroes hold two", () => {
  assert.equal(slotCapacity(hero(face("Agile Dagger"))), 2);
  assert.equal(slotCapacity(hero(face("Vicious Wildcat"))), 2);
  assert.equal(slotCapacity(hero(face("Big Buckley"))), 1);
  assert.equal(slotCapacity(hero("hts.base.v1.hero.bad-axe")), 1);
});

test("E02: ordinary and Cursed Items both fit; full or second Mask is rejected", () => {
  const dagger = hero(face("Agile Dagger"));
  const ring = card("hts.base.v1.item.really-big-ring", "item");
  const curse = card("hts.base.v1.cursed-item.sealing-key", "cursed_item");
  assert.ok(canAttach(dagger, ring));
  dagger.attachments.push(ring);
  assert.ok(canAttach(dagger, curse), "Cursed uses the second slot");
  dagger.attachments.push(curse);
  assert.ok(!canAttach(dagger, card("hts.base.v1.item.decoy-doll", "item")), "full");
  const maskHero = hero(face("Agile Dagger"), [card("hts.base.v1.item.wizard-mask", "item")]);
  assert.ok(isMask(maskHero.attachments[0]));
  assert.ok(!canAttach(maskHero, card(face("Warrior Mask"), "item", 2)), "second Mask rejected");
  assert.ok(canAttach(maskHero, ring), "non-Mask still fits beside a Mask");
  assert.ok(!canAttach(hero("hts.base.v1.hero.bad-axe", [ring]), curse), "base Hero holds one");
  assert.ok(!canAttach(hero("hts.base.v1.hero.bad-axe"), card("hts.base.v1.hero.x", "hero")), "Heroes are not attachments");
});

test("exact attachment removal and one-time bundle detach", () => {
  const a = card("hts.base.v1.item.really-big-ring", "item");
  const b = card("hts.base.v1.cursed-item.sealing-key", "cursed_item");
  const holder = hero(face("Meowntain"), [a, b]);
  assert.equal(detach(holder, b.cardId), b);
  assert.equal(detach(holder, b.cardId), null);
  assert.deepEqual(detachAll(holder), [a]);
  assert.deepEqual(detachAll(holder), []);
});

test("migration turns legacy { card, item } entries into attachments and is idempotent", () => {
  const game = initialBaseGameState();
  const ring = card("hts.base.v1.item.really-big-ring", "item");
  game.seats.push({
    playerId: "p1", leaderId: null, hand: [], slain: [], protections: { noDestroy: false, noSteal: false },
    party: [
      { card: card("hts.base.v1.hero.bad-axe", "hero"), item: ring },
      { card: card("hts.base.v1.hero.kit-napper", "hero"), item: null },
    ] as never,
  } as never);
  const once = normalizeBaseGame(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(once.seats[0].party.map((e) => e.attachments.map((c) => c.cardId)), [[ring.cardId], []]);
  assert.ok(once.seats[0].party.every((e) => !("item" in e)));
  assert.deepEqual(normalizeBaseGame(JSON.parse(JSON.stringify(once))), once);
});

test("engine: any player's Hero is a legal equip target for Item and Cursed Item; Leader id is not", () => {
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
  const foe = game.seats.find((s) => s !== me)!;
  const target = card("hts.base.v1.hero.bad-axe", "hero", 99);
  foe.party.push({ card: target, attachments: [] });
  for (const item of [card("hts.base.v1.item.really-big-ring", "item", 5), card("hts.base.v1.cursed-item.sealing-key", "cursed_item", 6)]) {
    assert.equal(playTargetError(game, me, item, { heroInstanceIds: [target.cardId] }), null, item.kind);
  }
  assert.equal(playTargetError(game, me, card("hts.base.v1.item.really-big-ring", "item", 7), { heroInstanceIds: [me.leaderId!] }), "INVALID_TARGET");
  foe.party[0].attachments.push(card("hts.base.v1.item.decoy-doll", "item", 8));
  assert.equal(playTargetError(game, me, card("hts.base.v1.item.really-big-ring", "item", 9), { heroInstanceIds: [target.cardId] }), "INVALID_TARGET", "occupied base slot");
});
