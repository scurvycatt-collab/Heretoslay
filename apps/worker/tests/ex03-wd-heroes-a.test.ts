import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, buildEffect, playModifier, resolveChoice, startAttack, type EngineDeps, type EngineHooks } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { rollPassives } from "../src/game/base-rules.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";
import { WD_UNIMPLEMENTED_EFFECTS } from "../src/content/expansion-wd.ts";

const wd = (name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === "warriorsDruids" && d.canonicalName === name)!.definitionId;
const hero = (id: string, name = "Bad Axe"): BaseCard => ({ cardId: id, definitionId: name === "Bad Axe" ? "hts.base.v1.hero.bad-axe" : wd(name), kind: "hero" });
const item = (id: string, name = "Even Bigger Ring"): BaseCard => ({ cardId: id, definitionId: wd(name), kind: "item" });

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
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  const engineDeps: EngineDeps = deps;
  const play = (effectId: string, targets = {}, source?: string) => {
    game.chain = null;
    game.queue.push(...buildEffect(game, effectId, me.playerId, targets, source));
    advance(game, engineDeps, hooks);
  };
  return { game, me, them, play, deps: engineDeps, hooks, run };
}

test("Hardened Hunter counts Monsters in OTHER players' Parties when it resolves", () => {
  const t = table();
  t.me.slain.push("hts.base.v1.monster.anuran-cauldron#01"); // own Monster does not count
  t.them.slain.push("hts.base.v1.monster.bloodwing#01", "hts.base.v1.monster.dark-dragon-king#01");
  const before = t.me.hand.length;
  t.play("hero.hardened-hunter");
  assert.equal(t.me.hand.length, before + 2);
  const none = table();
  const n = none.me.hand.length;
  none.play("hero.hardened-hunter");
  assert.equal(none.me.hand.length, n, "zero Monsters → zero draws");
});

test("Looting Lupo draws one per Item equipped in your own Party (Heroes alone do not count)", () => {
  const t = table();
  t.me.party.push({ card: hero("h1"), attachments: [item("i1"), item("i2")] }, { card: hero("h2"), attachments: [item("i3")] }, { card: hero("h3"), attachments: [] });
  t.them.party.push({ card: hero("h4"), attachments: [item("i4")] });
  const before = t.me.hand.length;
  t.play("hero.looting-lupo");
  assert.equal(t.me.hand.length, before + 3);
});

test("Blinding Blade returns every equipped Item of the chosen player's Party to the actor's hand", () => {
  const t = table();
  t.them.party.push({ card: hero("h1"), attachments: [item("i1")] }, { card: hero("h2"), attachments: [item("i2", "Soul Tether")] });
  const before = t.me.hand.length;
  t.play("hero.blinding-blade", { playerId: t.them.playerId });
  assert.equal(t.me.hand.length, before + 2);
  assert.ok(t.them.party.every((entry) => entry.attachments.length === 0));
  assert.equal(t.them.party.length, 2, "Heroes stay");
});

test("Critical Fang: +4 to ATTACK rolls only, until end of turn; Hero rolls unaffected", () => {
  const t = table();
  t.me.leaderId = null; // no Leader passive noise
  t.play("hero.critical-fang");
  const attack = rollPassives(t.me, "attack", { turnAttackBonus: t.game.turnAttackBonus });
  const heroRoll = rollPassives(t.me, "hero_effect", { turnAttackBonus: t.game.turnAttackBonus });
  assert.equal(attack.reduce((s, p) => s + p.value, 0), 4);
  assert.equal(heroRoll.reduce((s, p) => s + p.value, 0), 0);
});

test("Wolfgang Pack: +1 to all rolls for each OTHER Hero in your Party", () => {
  const t = table();
  const pack = hero("wp", "Wolfgang Pack");
  t.me.party.push({ card: pack, attachments: [] }, { card: hero("h1"), attachments: [] }, { card: hero("h2"), attachments: [] });
  t.play("hero.wolfgang-pack", {}, "wp");
  assert.equal(t.game.turnRollBonus, 2);
});

test("Stagguard: only the Stagguard player may play Modifier cards until the turn ends", () => {
  const t = table();
  t.play("hero.stagguard");
  const mod: BaseCard = { cardId: "hts.base.v1.modifier.modifier-plus-2-minus-2#01", definitionId: "hts.base.v1.modifier.modifier-plus-2-minus-2", kind: "modifier" };
  t.them.hand.push(mod);
  t.game.chain = null;
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  const windowId = (t.game.chain as { windowId: string }).windowId;
  assert.equal(playModifier(t.game, t.them.playerId, { windowId, cardInstanceId: mod.cardId, value: 2 }, t.deps, t.hooks), "MODIFIERS_LOCKED");
  assert.ok(t.them.hand.includes(mod), "rejected without consuming the card");
  const own: BaseCard = { ...mod, cardId: "hts.base.v1.modifier.modifier-plus-2-minus-2#02" };
  t.me.hand.push(own);
  assert.equal(playModifier(t.game, t.me.playerId, { windowId, cardInstanceId: own.cardId, value: 2 }, t.deps, t.hooks), "ACCEPTED");
});

test("Maegisty sets the return-to-hand protection; Agile Dagger offers an optional Item play", () => {
  const t = table();
  t.play("hero.maegisty");
  assert.equal(t.me.protections.returnToHand, true);
  const d = table();
  d.me.party.push({ card: hero("h1"), attachments: [] });
  d.me.hand.push({ cardId: "ring", definitionId: wd("Even Bigger Ring"), kind: "item" });
  d.play("hero.agile-dagger");
  const chain = d.game.chain as { choice: { kind: string; min: number; filterKinds: string[] } };
  assert.equal(chain.choice.kind, "play_card");
  assert.equal(chain.choice.min, 0);
  assert.deepEqual(chain.choice.filterKinds, ["item", "cursed_item"]);
  assert.equal(resolveChoice(d.game, d.me.playerId, (d.game.chain as { choice: { choiceId: string } }).choice.choiceId, [], d.deps, d.hooks), "ACCEPTED");
});

test("Even Bigger Ring +4 and The Piercing Howl +1 per equipped Item", () => {
  const t = table();
  t.me.leaderId = null;
  const ringHero = { card: hero("h1"), attachments: [item("i1")] };
  t.me.party.push(ringHero, { card: hero("h2"), attachments: [item("i2", "Soul Tether")] });
  assert.equal(rollPassives(t.me, "hero_effect", { hero: ringHero }).reduce((s, p) => s + p.value, 0), 4);
  t.me.leaderId = wd("The Piercing Howl");
  const howl = rollPassives(t.me, "hero_effect", { hero: ringHero }).filter((p) => p.source === wd("The Piercing Howl"));
  assert.deepEqual(howl.map((p) => p.value), [2]);
  assert.equal(rollPassives(t.me, "attack", {}).filter((p) => p.source === wd("The Piercing Howl")).length, 1, "every roll, not only Hero rolls");
});

test("these ten effects are no longer pending", () => {
  for (const id of ["hero.agile-dagger", "hero.hardened-hunter", "hero.looting-lupo", "hero.blinding-blade", "hero.critical-fang", "hero.wolfgang-pack", "hero.stagguard", "hero.maegisty", "item.even-bigger-ring", "leader.the-piercing-howl"]) {
    assert.ok(!WD_UNIMPLEMENTED_EFFECTS.includes(id), id);
  }
});
