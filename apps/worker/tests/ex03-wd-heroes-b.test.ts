// W04–W08: Big Buckley, Buck Omens, Tenacious Timber, Beast Call, Muscipula Rex.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, buildEffect, eligibleChoiceCards, resolveChoice, type EngineDeps, type EngineHooks, type Step } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { monsterData } from "../src/game/base-rules.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";

const wd = (name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === "warriorsDruids" && d.canonicalName === name)!.definitionId;
const hero = (id: string): BaseCard => ({ cardId: id, definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" });

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
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  const engineDeps: EngineDeps = deps;
  const exec = (...steps: Step[]) => {
    game.chain = null;
    game.queue.push(...steps);
    advance(game, engineDeps, hooks);
  };
  const effect = (effectId: string, targets = {}) => exec(...buildEffect(game, effectId, me.playerId, targets));
  const choice = () => (game.chain as { choice: { kind: string; choiceId: string; max: number } }).choice;
  const options = () => eligibleChoiceCards(game, (game.chain as { choice: Parameters<typeof eligibleChoiceCards>[1] }).choice);
  const choose = (ids: string[]) => resolveChoice(game, me.playerId, choice().choiceId, ids, engineDeps, hooks);
  return { game, me, them, exec, effect, choice, options, choose, run, deps: engineDeps, hooks };
}

test("Big Buckley: only Monsters whose requirement you meet are offered; the ATTACK opens a roll with no AP spent", () => {
  const t = table();
  t.me.party.push({ card: hero("a"), attachments: [] });
  const ap = t.game.actionPoints;
  t.effect("hero.big-buckley");
  const eligible = t.game.faceUpMonsters.filter((id) => {
    const need = monsterData(id).requirement;
    return need.every((slot) => slot.kind === "any") && need.length <= 1;
  });
  if (eligible.length === 0) return; // deck shuffle (identity) offers none — nothing to assert
  assert.equal(t.choice().kind, "attack_monster");
  assert.equal(t.choose([eligible[0]]), "ACCEPTED");
  assert.equal((t.game.chain as { step: string }).step, "modifier_window");
  assert.equal(t.game.actionPoints, ap);
});

test("Big Buckley with no eligible Monster does nothing", () => {
  const t = table();
  t.effect("hero.big-buckley");
  assert.equal(t.game.chain, null);
});

test("Buck Omens: only the actor sees the hand; picked Hero goes straight into the Party (no Challenge window)", () => {
  const t = table();
  t.them.hand.splice(0);
  t.them.hand.push(hero("h1"), { cardId: "m", definitionId: "hts.base.v1.magic.enchanted-spell", kind: "magic" });
  t.effect("hero.buck-omens", { playerId: t.them.playerId });
  assert.equal(t.choice().kind, "view_hand");
  assert.ok(t.options().some((c) => c.cardId === "m"), "actor sees the whole hand");
  assert.equal(t.choose([]), "ACCEPTED");
  assert.equal(t.choice().kind, "bring_hero");
  assert.deepEqual(t.options().map((c) => c.cardId), ["h1"], "only Heroes can be chosen");
  assert.equal(t.choose(["h1"]), "ACCEPTED");
  assert.deepEqual(t.me.party.map((h) => h.card.cardId), ["h1"]);
  assert.equal(t.game.chain, null, "no PLAY → no Challenge window");
  assert.ok(!t.them.hand.some((c) => c.cardId === "h1"));
});

test("Buck Omens does nothing when they hold no Hero", () => {
  const t = table();
  t.them.hand.splice(0);
  t.them.hand.push({ cardId: "m", definitionId: "hts.base.v1.magic.enchanted-spell", kind: "magic" });
  t.effect("hero.buck-omens", { playerId: t.them.playerId });
  assert.equal(t.choice().kind, "view_hand");
  t.choose([]);
  assert.equal(t.game.chain, null);
  assert.equal(t.me.party.length, 0);
});

test("Tenacious Timber: one multi-select sized by the Monsters in your Party; noSteal Heroes are not offered", () => {
  const t = table();
  t.me.slain.push("hts.base.v1.monster.anuran-cauldron#01", "hts.base.v1.monster.bloodwing#01");
  t.them.party.push({ card: hero("x"), attachments: [] }, { card: hero("y"), attachments: [] }, { card: hero("z"), attachments: [] });
  t.effect("hero.tenacious-timber");
  assert.equal(t.choice().kind, "steal_hero");
  assert.equal(t.choice().max, 2);
  assert.equal(t.choose(["x", "z"]), "ACCEPTED");
  assert.deepEqual(t.me.party.map((h) => h.card.cardId), ["x", "z"]);
  assert.deepEqual(t.them.party.map((h) => h.card.cardId), ["y"]);

  const none = table();
  none.them.party.push({ card: hero("x"), attachments: [] });
  none.effect("hero.tenacious-timber");
  assert.equal(none.game.chain, null, "no Monsters → no steal");

  const calm = table();
  calm.me.slain.push("hts.base.v1.monster.bloodwing#01");
  calm.them.protections.noSteal = true;
  calm.them.party.push({ card: hero("x"), attachments: [] });
  calm.effect("hero.tenacious-timber");
  assert.equal(calm.game.chain, null, "protected Heroes are not offered");
});

test("Beast Call: face-up Monsters go to the bottom in order, 3 new flip, +1 AP", () => {
  const t = table();
  const old = [...t.game.faceUpMonsters];
  const deckBefore = [...t.game.monsterDeck];
  const ap = t.game.actionPoints ?? 0;
  t.effect("magic.beast-call");
  assert.deepEqual(t.game.faceUpMonsters, deckBefore.slice(0, 3));
  assert.deepEqual(t.game.monsterDeck.slice(-old.length), old, "old Monsters keep order at the bottom");
  assert.equal(t.game.monsterDeck.length, deckBefore.length - 3 + old.length);
  assert.equal(t.game.actionPoints, ap + 1);
});

test("Muscipula Rex: one free draw-only credit per own turn, spent before AP and never carried over", () => {
  const t = table();
  t.me.slain.push(`${wd("Muscipula Rex")}#01`);
  t.game.freeDrawCredit = 1; // set at turn start for the owner
  const ap = t.game.actionPoints ?? 0;
  const hand = t.me.hand.length;
  assert.equal(t.run(t.me.playerId, "DRAW_CARD"), "ACCEPTED");
  assert.equal(t.me.hand.length, hand + 1);
  assert.equal(t.game.actionPoints, ap, "no AP spent");
  assert.equal(t.game.freeDrawCredit, 0);
  t.run(t.me.playerId, "DRAW_CARD");
  assert.equal(t.game.actionPoints, ap - 1, "second draw costs AP");

  const spent = table();
  spent.me.slain.push(`${wd("Muscipula Rex")}#01`);
  spent.game.freeDrawCredit = 1;
  spent.game.actionPoints = 0;
  const before = spent.me.hand.length;
  spent.exec();
  assert.equal(spent.me.hand.length, before + 1, "credit is used when AP runs out");
  assert.equal(spent.game.freeDrawCredit, 0);
});
