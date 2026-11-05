// EX-05 Dragon Sorcerer v2: data + the handlers that need no further owner answers.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, buildEffect, drawTriggerSteps, pass, playModifier, resolveChoice, startAttack, rollTotals, type EngineDeps, type EngineHooks, type Step } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";
import { DS_CARD_DATA, DS_SOURCES, DS_UNIMPLEMENTED_EFFECTS } from "../src/content/expansion-ds.ts";
import { EXPANSION_CARDS_BY_ID } from "../src/content/base-cards.ts";
import { GAME_SET_CATALOG } from "../src/content/set-catalog.ts";

const drafts = EXPANSION_FACE_DRAFTS.filter((face) => face.setKey === "dragonSorcerer");
const ds = (name: string) => drafts.find((d) => d.canonicalName === name)!.definitionId;
const hero = (id: string, definitionId = "hts.base.v1.hero.bad-axe"): BaseCard => ({ cardId: id, definitionId, kind: "hero" });
const card = (id: string, definitionId: string, kind: BaseCard["kind"]): BaseCard => ({ cardId: id, definitionId, kind });

const REQUIRED: Record<string, string[]> = {
  hero: ["heroClass", "rollThreshold", "effectId", "target"],
  monster: ["requirement", "slay", "penaltyRange", "penalty", "penaltyText", "slainEffectId"],
  item: ["equip", "maskClass", "effectId"], magic: ["effectId", "target"], modifier: ["options"], challenge: ["requiredClass", "rollBonus"],
  party_leader: ["heroClass", "effectId", "bannedPlayerCounts"],
};

test("every DS face has exactly one engine card with matching id, kind, quantity and provenance", () => {
  assert.equal(DS_CARD_DATA.length, 16);
  assert.deepEqual(new Set(DS_CARD_DATA.map((c) => c.definitionId)), new Set(drafts.map((d) => d.definitionId)));
  for (const c of DS_CARD_DATA) {
    const draft = drafts.find((d) => d.definitionId === c.definitionId)!;
    assert.equal(c.kind, draft.kind, c.name);
    assert.equal(c.quantity, draft.physicalCopyCount, c.name);
    for (const field of ["text", ...REQUIRED[c.kind]]) {
      assert.ok(c.provenance[field], `${c.name}: ${field}`);
      assert.ok(c.provenance[field].sources.every((s) => s in DS_SOURCES));
    }
    assert.ok(EXPANSION_CARDS_BY_ID.has(c.definitionId));
  }
});

test("Hero class and threshold agree with the reviewed labels (all Sorcerers roll high)", () => {
  for (const c of DS_CARD_DATA.filter((x) => x.kind === "hero")) {
    const m = /Hero, (\w+), (\d+)\+/.exec(drafts.find((d) => d.definitionId === c.definitionId)!.observedKind)!;
    assert.equal(c.heroClass, m[1].toLowerCase());
    assert.equal(c.rollThreshold, Number(m[2]), c.name);
  }
});

test("DS stays lookup-only; the four owner-gated Heroes are the only pending effects", () => {
  assert.ok(!JSON.stringify(GAME_SET_CATALOG).includes("dragon-sorcerer"));
  assert.deepEqual([...DS_UNIMPLEMENTED_EFFECTS].sort(), ["hero.dragalter", "hero.luut", "hero.mirroryu", "hero.shamanaga"]);
});

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
  const pending = () => (game.chain as { choice: { kind: string; choiceId: string; playerId: string } } | null)?.choice;
  const answer = (ids: string[], accept?: boolean) => {
    const c = pending()!;
    return resolveChoice(game, c.playerId, c.choiceId, ids, engineDeps, hooks, accept);
  };
  const window = () => game.chain as { step: string; windowId: string; roll: Parameters<typeof rollTotals>[0] };
  const total = () => rollTotals(window().roll).total;
  return { game, me, them, effect, pending, answer, window, total, deps: engineDeps, hooks };
}

test("Dystortivern trades Party Leader cards", () => {
  const t = table();
  t.me.leaderId = "hts.base.v1.party-leader.the-cloaked-sage";
  t.them.leaderId = "hts.base.v1.party-leader.the-charismatic-song";
  t.effect("hero.dystortivern", { playerId: t.them.playerId });
  assert.equal(t.me.leaderId, "hts.base.v1.party-leader.the-charismatic-song");
  assert.equal(t.them.leaderId, "hts.base.v1.party-leader.the-cloaked-sage");
});

test("Egg of Fortune: discard a card, then pull a card from each other hand", () => {
  const t = table();
  t.me.hand.push(hero("mine"));
  t.them.hand.push(hero("theirs"));
  t.effect("magic.egg-of-fortune");
  t.answer(["mine"]);
  assert.deepEqual(t.me.hand.map((c) => c.cardId), ["theirs"]);
});

test("Extraga returns every OTHER Sorcerer (Mask counts) in every Party, attachments with them", () => {
  const t = table();
  t.me.party.push({ card: hero("ext", ds("Extraga")), attachments: [] }, { card: hero("s1", ds("Smok")), attachments: [] }, { card: hero("plain"), attachments: [] });
  t.them.party.push({ card: hero("masked"), attachments: [card("mk", ds("Sorcerer Mask"), "item")] }, { card: hero("axe"), attachments: [] });
  t.effect("hero.extraga", {}, "ext");
  assert.deepEqual(t.me.party.map((h) => h.card.cardId).sort(), ["ext", "plain"]);
  assert.deepEqual(t.them.party.map((h) => h.card.cardId), ["axe"]);
  assert.ok(t.them.hand.some((c) => c.cardId === "masked") && t.them.hand.some((c) => c.cardId === "mk"));
  assert.ok(t.me.hand.some((c) => c.cardId === "s1"));
});

test("Oracon: a pulled Modifier makes that player SACRIFICE a Hero; any other card does not", () => {
  const t = table();
  t.them.party.push({ card: hero("t1"), attachments: [] });
  t.them.hand.push(card("mod", "hts.base.v1.modifier.plus-1", "modifier"));
  t.effect("hero.oracon", { playerId: t.them.playerId });
  assert.equal(t.pending()!.kind, "sacrifice_hero");
  assert.equal(t.pending()!.playerId, t.them.playerId);
  const u = table();
  u.them.party.push({ card: hero("t1"), attachments: [] });
  u.them.hand.push(hero("not-a-modifier"));
  u.effect("hero.oracon", { playerId: u.them.playerId });
  assert.equal(u.pending(), undefined);
  assert.equal(u.them.party.length, 1);
});

test("Renovern takes an Item from discard and plays it", () => {
  const t = table();
  t.me.party.push({ card: hero("h"), attachments: [] });
  t.game.discard.push(card("it", ds("Sorcerer Mask"), "item"));
  t.effect("hero.renovern");
  t.answer(["it"]);
  assert.equal(t.pending()!.kind, "play_card");
});

test("Smok: drawing a Magic card offers to reveal it for an extra AP", () => {
  const t = table();
  t.game.mainDeck.unshift(card("m1", "hts.base.v1.magic.enchanted-spell", "magic"), hero("x"));
  const ap = t.game.actionPoints ?? 0;
  t.effect("hero.smok");
  assert.equal(t.pending()!.kind, "confirm");
  t.answer([], true);
  assert.equal(t.game.actionPoints, ap + 1);
});

test("The Fearless Flame: discard a card for +1 to any roll of yours", () => {
  const t = table();
  t.me.leaderId = ds("The Fearless Flame");
  t.me.hand.push(hero("a"), hero("b"));
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  assert.equal(t.pending()!.kind, "discard");
  t.answer(["a"]);
  assert.equal(t.window().step, "modifier_window");
  assert.equal(t.total(), 6 + 1);
});

test("Calamity Mongrel (slain): a drawn Challenge may be discarded for 2 new cards", () => {
  const t = table();
  t.me.slain.push(`${ds("Calamity Mongrel")}#01`);
  const challenge = card("ch", ds("Sorcerer Challenge"), "challenge");
  t.me.hand.push(challenge);
  const steps = drawTriggerSteps(t.game, t.me, [challenge]);
  t.game.queue.push(...steps);
  advance(t.game, t.deps, t.hooks);
  assert.equal(t.pending()!.kind, "confirm");
  t.answer([], true);
  assert.ok(!t.me.hand.some((c) => c.cardId === "ch"));
  assert.equal(t.me.hand.length, 2);
});

test("Modifier +6 / -6 need another card to DISCARD and make the player discard one", () => {
  const t = table();
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  t.me.hand.push(card("m6", ds("Modifier +6"), "modifier"));
  const windowId = t.window().windowId;
  assert.equal(playModifier(t.game, t.me.playerId, { windowId, cardInstanceId: "m6", value: 6 }, t.deps, t.hooks), "CARD_NOT_PLAYABLE", "no other card to discard");
  t.me.hand.push(hero("fodder"));
  assert.equal(playModifier(t.game, t.me.playerId, { windowId, cardInstanceId: "m6", value: 6 }, t.deps, t.hooks), "ACCEPTED");
  assert.equal(t.total(), 6 + 6);
  for (const playerId of Object.keys((t.game.chain as { responders: Record<string, string> }).responders)) pass(t.game, playerId, windowId, t.deps, t.hooks);
  assert.equal(t.pending()!.kind, "discard");
  assert.equal(t.pending()!.playerId, t.me.playerId);
});
