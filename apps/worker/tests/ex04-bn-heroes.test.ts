// BN heroes/magic that reuse the choice machinery (N1/N2): sacrifice, discard, steal, class returns.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, buildEffect, resolveChoice, type EngineDeps, type EngineHooks, type Step } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";

const bn = (name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === "berserkersNecromancers" && d.canonicalName === name)!.definitionId;
const hero = (id: string, definitionId = "hts.base.v1.hero.bad-axe"): BaseCard => ({ cardId: id, definitionId, kind: "hero" });
const card = (id: string, definitionId: string, kind: BaseCard["kind"]): BaseCard => ({ cardId: id, definitionId, kind });

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
  them.leaderId = null;
  me.hand.splice(0);
  them.hand.splice(0);
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  const engineDeps: EngineDeps = deps;
  const effect = (effectId: string, targets = {}, source?: string) => {
    game.chain = null;
    game.queue.push(...buildEffect(game, effectId, me.playerId, targets, source) as Step[]);
    advance(game, engineDeps, hooks);
  };
  const pending = () => (game.chain as { choice: { kind: string; choiceId: string; playerId: string; max: number; min: number } } | null)?.choice;
  const answer = (ids: string[], accept?: boolean) => {
    const c = pending()!;
    return resolveChoice(game, c.playerId, c.choiceId, ids, engineDeps, hooks, accept);
  };
  return { game, me, them, effect, pending, answer };
}

test("Mass Sacrifice: discards the hand and draws 5", () => {
  const t = table();
  t.me.hand.push(hero("x"), hero("y"));
  t.effect("magic.mass-sacrifice");
  assert.equal(t.me.hand.length, 5);
  assert.ok(t.game.discard.some((c) => c.cardId === "x") && t.game.discard.some((c) => c.cardId === "y"));
});

test("Grim Pupper: every player, actor included, sacrifices a Hero", () => {
  const t = table();
  t.me.party.push({ card: hero("m1"), attachments: [] });
  t.them.party.push({ card: hero("t1"), attachments: [] });
  t.effect("hero.grim-pupper");
  assert.equal(t.pending()!.playerId, t.me.playerId);
  t.answer(["m1"]);
  assert.equal(t.pending()!.playerId, t.them.playerId);
  t.answer(["t1"]);
  assert.equal(t.me.party.length + t.them.party.length, 0);
});

test("Brawling Spirit: only Parties with more than 3 cards (Heroes + equipped Items) sacrifice (E15)", () => {
  const t = table();
  for (const n of ["a", "b", "c"]) t.me.party.push({ card: hero(n), attachments: [] });
  t.me.party[0].attachments.push(card("i1", bn("Silver Lining"), "item")); // 3 Heroes + 1 Item = 4
  for (const n of ["d", "e", "f"]) t.them.party.push({ card: hero(n), attachments: [] }); // exactly 3
  t.effect("hero.brawling-spirit");
  assert.equal(t.pending()!.playerId, t.me.playerId);
  t.answer(["a"]);
  assert.equal(t.pending(), undefined, "the 3-card Party is untouched");
  assert.equal(t.them.party.length, 3);
});

test("Bark Hexer: actor discards 1, each other player discards 2", () => {
  const t = table();
  t.me.hand.push(hero("x"), hero("y"));
  t.them.hand.push(hero("p"), hero("q"), hero("r"));
  t.effect("hero.bark-hexer");
  t.answer(["x"]);
  assert.equal(t.pending()!.playerId, t.them.playerId);
  t.answer(["p", "q"]);
  assert.equal(t.them.hand.length, 1);
});

test("Perfect Vessel sacrifices itself, then steals a Hero", () => {
  const t = table();
  t.me.party.push({ card: hero("pv", bn("Perfect Vessel")), attachments: [] });
  t.them.party.push({ card: hero("victim"), attachments: [] });
  t.effect("hero.perfect-vessel", {}, "pv");
  assert.ok(!t.me.party.some((h) => h.card.cardId === "pv"));
  assert.equal(t.pending()!.kind, "steal_hero");
  t.answer(["victim"]);
  assert.ok(t.me.party.some((h) => h.card.cardId === "victim"));
});

test("Boston Terror: giving a card ends it; declining (or timing out) lets the actor take 2 from discard", () => {
  const t = table();
  t.them.hand.push(hero("g"));
  t.game.discard.push(hero("d1"), hero("d2"), hero("d3"));
  t.effect("hero.boston-terror", { playerId: t.them.playerId });
  assert.equal(t.pending()!.kind, "confirm");
  assert.equal(t.pending()!.playerId, t.them.playerId);
  t.answer([], true);
  assert.equal(t.pending()!.kind, "give_card");
  t.answer(["g"]);
  assert.ok(t.me.hand.some((c) => c.cardId === "g"));
  assert.equal(t.game.discard.length, 3);

  const u = table();
  u.them.hand.push(hero("g"));
  u.game.discard.push(hero("d1"), hero("d2"), hero("d3"));
  u.effect("hero.boston-terror", { playerId: u.them.playerId });
  u.answer([], false);
  assert.equal(u.pending()!.kind, "take_from_discard");
  assert.equal(u.pending()!.playerId, u.me.playerId);
  u.answer(["d1", "d2"]);
  assert.equal(u.me.hand.length, 2);
});

test("Bone Collector: sacrifices an equipped Item, then takes a Hero from discard and plays it", () => {
  const t = table();
  t.me.party.push({ card: hero("h"), attachments: [card("it", bn("Silver Lining"), "item")] });
  t.game.discard.push(hero("back"));
  t.effect("hero.bone-collector");
  assert.equal(t.pending()!.kind, "sacrifice_item");
  t.answer(["it"]);
  assert.ok(t.game.discard.some((c) => c.cardId === "it"));
  assert.equal(t.pending()!.kind, "take_from_discard");
  t.answer(["back"]);
  assert.equal(t.pending()!.kind, "play_card");
});

test("Hollow Husk: sees the hand, may only take a Magic card, and is offered to play it", () => {
  const t = table();
  t.them.hand.push(hero("h"), card("mg", "hts.base.v1.magic.enchanted-spell", "magic"));
  t.effect("hero.hollow-husk", { playerId: t.them.playerId });
  assert.equal(t.pending()!.kind, "view_hand");
  t.answer([]);
  assert.equal(t.pending()!.kind, "take_from_hand");
  t.answer(["mg"]);
  assert.ok(t.me.hand.some((c) => c.cardId === "mg"));
});

test("Shadow Saint: discards a Modifier and locks other players' Modifiers", () => {
  const t = table();
  t.me.hand.push(card("mod", "hts.base.v1.modifier.plus-1", "modifier"), hero("keep"));
  t.effect("hero.shadow-saint");
  assert.equal(t.pending()!.kind, "discard");
  t.answer(["mod"]);
  assert.equal(t.game.modifierLockBy, t.me.playerId);
});

test("Unbridled Fury: destroying a Berserker grants an extra AP; other classes do not", () => {
  const t = table();
  t.them.party.push({ card: hero("b", bn("Annihilator")), attachments: [] }, { card: hero("o"), attachments: [] });
  const ap = t.game.actionPoints ?? 0;
  t.effect("hero.unbridled-fury");
  t.answer(["b"]);
  assert.equal(t.game.actionPoints, ap + 1);
  t.effect("hero.unbridled-fury");
  t.answer(["o"]);
  assert.equal(t.game.actionPoints, ap + 1);
});

test("Rabid Beast: DESTROY count equals the Heroes actually sacrificed", () => {
  const t = table();
  t.me.party.push({ card: hero("s1"), attachments: [] }, { card: hero("s2"), attachments: [] });
  t.them.party.push({ card: hero("t1"), attachments: [] }, { card: hero("t2"), attachments: [] }, { card: hero("t3"), attachments: [] });
  t.effect("hero.rabid-beast");
  t.answer(["s1", "s2"]);
  assert.equal(t.pending()!.kind, "destroy_hero");
  assert.equal(t.pending()!.max, 2);
  t.answer(["t1", "t2"]);
  assert.equal(t.them.party.length, 1);
});

test("Rabid Beast sacrificing nothing destroys nothing", () => {
  const t = table();
  t.me.party.push({ card: hero("s1"), attachments: [] });
  t.them.party.push({ card: hero("t1"), attachments: [] });
  t.effect("hero.rabid-beast");
  t.answer([]);
  assert.equal(t.pending(), undefined);
  assert.equal(t.them.party.length, 1);
});

test("Roaryal Guard: every Hero of the named effective Class returns to its owner's hand (Mask counts)", () => {
  const t = table();
  t.me.party.push({ card: hero("bz", bn("Annihilator")), attachments: [] });
  t.them.party.push({ card: hero("masked"), attachments: [card("mk", bn("Berserker Mask"), "item")] }, { card: hero("plain"), attachments: [] });
  t.effect("hero.roaryal-guard");
  t.answer(["bz"]);
  assert.equal(t.me.party.length, 0);
  assert.ok(t.me.hand.some((c) => c.cardId === "bz"));
  assert.deepEqual(t.them.party.map((h) => h.card.cardId), ["plain"]);
  assert.ok(t.them.hand.some((c) => c.cardId === "masked") && t.them.hand.some((c) => c.cardId === "mk"));
});

test("Gruesome Gladiator takes a card from each other hand; players with no hand are skipped", () => {
  const t = table();
  t.them.hand.push(hero("c1"));
  t.effect("hero.gruesome-gladiator");
  assert.equal(t.pending()!.kind, "view_hand");
  t.answer([]);
  t.answer(["c1"]);
  assert.ok(t.me.hand.some((c) => c.cardId === "c1"));
  const u = table();
  u.effect("hero.gruesome-gladiator");
  assert.equal(u.pending(), undefined);
});

test("Meowntain: sacrifice, then +5 to all rolls this turn", () => {
  const t = table();
  t.me.party.push({ card: hero("m"), attachments: [] });
  const bonus = t.game.turnRollBonus;
  t.effect("hero.meowntain");
  t.answer(["m"]);
  assert.equal(t.game.turnRollBonus, bonus + 5);
});

test("Lightning Labrys: each discarded card picks a player who sacrifices a Hero", () => {
  const t = table();
  t.me.hand.push(hero("d1"), hero("d2"));
  t.them.party.push({ card: hero("t1"), attachments: [] }, { card: hero("t2"), attachments: [] });
  t.effect("magic.lightning-labrys");
  t.answer(["d1", "d2"]);
  assert.equal(t.pending()!.kind, "make_sacrifice");
  t.answer(["t1"]);
  assert.equal(t.pending()!.playerId, t.them.playerId);
  t.answer(["t1"]);
  assert.equal(t.pending()!.kind, "make_sacrifice");
});

test("Annihilator takes a Challenge card from discard", () => {
  const t = table();
  t.game.discard.push(hero("h"), card("ch", bn("Berserker Challenge"), "challenge"));
  t.effect("hero.annihilator");
  t.answer(["ch"]);
  assert.ok(t.me.hand.some((c) => c.cardId === "ch"));
});

test("Beholden Retriever: sacrifice a Hero, then take a Hero or Item from discard and play it", () => {
  const t = table();
  t.me.party.push({ card: hero("s"), attachments: [] }, { card: hero("keep"), attachments: [] }); // an Item needs a Hero to equip
  t.game.discard.push(card("it", bn("Silver Lining"), "item"));
  t.effect("hero.beholden-retriever");
  t.answer(["s"]);
  t.answer(["it"]);
  assert.equal(t.pending()!.kind, "play_card");
});
