// BN (N3): Leaders, Monsters, Modifiers, Items, class Challenges, Vicious Wildcat, Shadow Saint.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, buildEffect, pass, resolveChoice, startAttack, startHeroRoll, playModifier, rollTotals, type EngineDeps, type EngineHooks, type Step } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";
import { cardDataOfKind } from "../src/content/base-cards.ts";

const bn = (name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === "berserkersNecromancers" && d.canonicalName === name)!.definitionId;
const hero = (id: string, definitionId = "hts.base.v1.hero.bad-axe"): BaseCard => ({ cardId: id, definitionId, kind: "hero" });
const card = (id: string, definitionId: string, kind: BaseCard["kind"]): BaseCard => ({ cardId: id, definitionId, kind });

function table(dice: [number, number] = [3, 3]) {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: ["p1", "p2"].map((playerId) => ({ playerId, nickname: playerId })) };
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => dice, now: () => 0 };
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
    game.queue.push(...(buildEffect(game, effectId, me.playerId, targets, source) as Step[]));
    advance(game, engineDeps, hooks);
  };
  const pending = () => (game.chain as { choice: { kind: string; choiceId: string; playerId: string; max: number } } | null)?.choice;
  const answer = (ids: string[], accept?: boolean) => {
    const c = pending()!;
    return resolveChoice(game, c.playerId, c.choiceId, ids, engineDeps, hooks, accept);
  };
  const window = () => game.chain as { step: string; windowId: string; roll: Parameters<typeof rollTotals>[0] };
  const total = () => rollTotals(window().roll).total;
  const play = (playerId: string, cardId: string, value: number) =>
    playModifier(game, playerId, { windowId: window().windowId, cardInstanceId: cardId, value }, engineDeps, hooks);
  return { game, me, them, effect, pending, answer, window, total, play, deps: engineDeps, hooks, run };
}

test("Vicious Wildcat: SLAY any face-up Monster with no roll and no requirement, then the turn ends", () => {
  const t = table();
  t.me.party.push({ card: hero("w", bn("Vicious Wildcat")), attachments: [] });
  t.effect("hero.vicious-wildcat");
  assert.equal(t.pending()!.kind, "slay_monster");
  const target = t.game.faceUpMonsters[0];
  t.answer([target]);
  assert.ok(t.me.slain.includes(target), "no Party requirement needed");
  assert.equal(t.game.actionPoints, 0);
  assert.ok(!t.game.faceUpMonsters.includes(target));
});

test("Raging Manticore: each SLAY draws 2 more cards", () => {
  const t = table();
  t.me.leaderId = bn("The Raging Manticore");
  t.me.party.push({ card: hero("w"), attachments: [] });
  t.effect("hero.vicious-wildcat");
  t.answer([t.game.faceUpMonsters[0]]);
  assert.equal(t.me.hand.length, 2);
});

test("Shadow Saint needs a Modifier to discard: without one the effect ends and nothing is locked", () => {
  const t = table();
  t.me.hand.push(hero("x"));
  t.effect("hero.shadow-saint");
  assert.equal(t.pending(), undefined);
  assert.ok(!t.game.modifierLockBy);
  t.me.hand.push(card("mod", "hts.base.v1.modifier.plus-1", "modifier"));
  t.effect("hero.shadow-saint");
  t.answer(["mod"]);
  assert.equal(t.game.modifierLockBy, t.me.playerId);
});

test("Reptilian Ripper (slain): +2 to your ATTACK rolls only", () => {
  const t = table();
  const monster = t.game.faceUpMonsters[0];
  t.me.slain.push(`${bn("Reptilian Ripper")}#01`);
  startAttack(t.game, t.me.playerId, monster, t.deps, t.hooks);
  assert.equal(t.total(), 6 + 2);
});

test("Modifier +2/-2: +4 instead of +2 only on the player's own ATTACK roll", () => {
  const t = table();
  t.me.party.push({ card: hero("h"), attachments: [] });
  t.me.hand.push(card("m1", bn("Modifier +2/-2"), "modifier"));
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  assert.equal(t.play(t.me.playerId, "m1", 2), "ACCEPTED");
  assert.equal(t.total(), 6 + 4);
});

test("Modifier +2/-2 played on another player's ATTACK stays +2; a hero roll stays +2", () => {
  const t = table();
  t.them.hand.push(card("m2", bn("Modifier +2/-2"), "modifier"));
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  assert.equal(t.play(t.them.playerId, "m2", 2), "ACCEPTED");
  assert.equal(t.total(), 6 + 2);
});

test("Modifier +7 discards the player's hand when played", () => {
  const t = table();
  t.me.hand.push(card("m7", bn("Modifier +7"), "modifier"), hero("a"), hero("b"));
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  assert.equal(t.play(t.me.playerId, "m7", 7), "ACCEPTED");
  assert.equal(t.me.hand.length, 0);
  assert.equal(t.total(), 6 + 7);
});

test("Biggest Ring Ever: discard up to 3 cards for +2 each on the hero roll", () => {
  const t = table();
  t.me.party.push({ card: hero("h"), attachments: [card("ring", bn("Biggest Ring Ever"), "item")] });
  t.me.hand.push(hero("a"), hero("b"), hero("c"));
  startHeroRoll(t.game, t.me.playerId, "h", {}, t.deps, t.hooks);
  assert.equal(t.pending()!.kind, "discard");
  t.answer(["a", "b"]);
  assert.equal(t.window().step, "modifier_window");
  assert.equal(t.total(), 6 + 4);
  assert.equal(t.me.hand.length, 1);
});

test("Silver Lining: a failed hero roll grants +2 to all rolls for the rest of the turn", () => {
  const t = table([1, 1]);
  t.me.party.push({ card: hero("h"), attachments: [card("sl", bn("Silver Lining"), "item")] });
  startHeroRoll(t.game, t.me.playerId, "h", {}, t.deps, t.hooks);
  const before = t.game.turnRollBonus;
  resolveWindowByTimeout(t);
  assert.equal(t.game.turnRollBonus, before + 2);
});

test("Dragon's Bile: a failed hero roll makes the roller SACRIFICE a Hero", () => {
  const t = table([1, 1]);
  t.me.party.push({ card: hero("h"), attachments: [card("db", bn("Dragon's Bile"), "cursed_item")] }, { card: hero("other"), attachments: [] });
  startHeroRoll(t.game, t.me.playerId, "h", {}, t.deps, t.hooks);
  resolveWindowByTimeout(t);
  assert.equal(t.pending()!.kind, "sacrifice_hero");
  assert.equal(t.pending()!.playerId, t.me.playerId);
});

test("Doombringer (slain): each Hero or Item SACRIFICE offers any card from the discard pile", () => {
  const t = table();
  t.me.slain.push(`${bn("Doombringer")}#01`);
  t.me.party.push({ card: hero("h"), attachments: [card("it", bn("Silver Lining"), "item")] }, { card: hero("s"), attachments: [] });
  t.game.discard.push(hero("pick"));
  t.effect("hero.bone-collector");
  t.answer(["it"]); // Item sacrifice
  assert.equal(t.pending()!.kind, "take_from_discard");
  assert.equal(t.pending()!.playerId, t.me.playerId);
  t.answer(["pick"]);
  assert.ok(t.me.hand.some((c) => c.cardId === "pick"));
  t.effect("hero.meowntain");
  t.answer(["s"]); // Hero sacrifice
  assert.equal(t.pending()!.kind, "take_from_discard");
});

test("Doombringer's penalty discards the whole hand", () => {
  const t = table([1, 1]);
  t.me.hand.push(hero("a"), hero("b"));
  const id = t.game.faceUpMonsters[0];
  void id;
  const data = cardDataOfKind(bn("Doombringer"), "monster")!;
  assert.deepEqual(data.penalty, { effectId: "penalty.discard_hand" });
});

test("The Gnawing Dread: 2 AP, once per turn, takes any card from the discard pile", () => {
  const t = table();
  t.me.leaderId = bn("The Gnawing Dread");
  t.game.discard.push(hero("d"));
  const ap = t.game.actionPoints ?? 0;
  assert.equal(t.run(t.me.playerId, "LEADER_ACTION"), "ACCEPTED");
  assert.equal(t.game.actionPoints, ap - 2);
  assert.equal(t.pending()!.kind, "take_from_discard");
  t.answer(["d"]);
  assert.ok(t.me.hand.some((c) => c.cardId === "d"));
  assert.equal(t.run(t.me.playerId, "LEADER_ACTION"), "LEADER_ACTION_UNAVAILABLE");
});

test("class Challenges: need an effective Hero of their class (Mask counts, Leader does not)", () => {
  const data = cardDataOfKind(bn("Berserker Challenge"), "challenge")!;
  assert.equal(data.requiredClass, "berserker");
  assert.equal(data.rollBonus, 3);
});

function resolveWindowByTimeout(t: ReturnType<typeof table>) {
  // Everyone skips: the roll closes and its outcome resolves.
  const windowId = t.window().windowId;
  for (const playerId of Object.keys((t.game.chain as { responders: Record<string, string> }).responders)) pass(t.game, playerId, windowId, t.deps, t.hooks);
}
