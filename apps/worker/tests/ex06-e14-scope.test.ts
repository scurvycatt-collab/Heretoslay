// E14: a passive fires only for the scope it names (owner / actor). The event happening to someone else must not trigger it.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, buildEffect, drawTriggerSteps, resolveChoice, rollTotals, startAttack, startHeroRoll, type EngineDeps, type EngineHooks, type Step } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";

const face = (setKey: string, name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === setKey && d.canonicalName === name)!.definitionId;
const wd = (name: string) => face("warriorsDruids", name);
const bn = (name: string) => face("berserkersNecromancers", name);
const ds = (name: string) => face("dragonSorcerer", name);
const hero = (id: string): BaseCard => ({ cardId: id, definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" });
const card = (id: string, definitionId: string, kind: BaseCard["kind"]): BaseCard => ({ cardId: id, definitionId, kind });

/** `me` is the active player (the actor); `them` owns the passive under test. */
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
  const effect = (effectId: string, targets = {}) => {
    game.chain = null;
    game.queue.push(...(buildEffect(game, effectId, me.playerId, targets) as Step[]));
    advance(game, engineDeps, hooks);
  };
  const pending = () => (game.chain as { choice: { kind: string; choiceId: string; playerId: string } } | null)?.choice;
  const answer = (ids: string[]) => {
    const c = pending()!;
    return resolveChoice(game, c.playerId, c.choiceId, ids, engineDeps, hooks);
  };
  const total = () => rollTotals((game.chain as { roll: Parameters<typeof rollTotals>[0] }).roll).total;
  return { game, me, them, effect, pending, answer, total, deps: engineDeps, hooks };
}

test("Raging Manticore: the Leader's owner draws on THEIR slay, not on an opponent's", () => {
  const t = table();
  t.them.leaderId = bn("The Raging Manticore");
  t.me.party.push({ card: hero("w"), attachments: [] });
  t.effect("hero.vicious-wildcat");
  t.answer([t.game.faceUpMonsters[0]]);
  assert.equal(t.them.hand.length, 0, "opponent's slay draws nothing for the Manticore owner");
  assert.equal(t.me.hand.length, 0);
});

test("Reptilian Ripper: +2 applies to its owner's ATTACK only", () => {
  const t = table();
  t.them.slain.push(`${bn("Reptilian Ripper")}#01`);
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  assert.equal(t.total(), 6, "no bonus on an opponent's attack");
});

test("Doombringer: only its owner's SACRIFICE offers a discard-pile card", () => {
  const sacrificeWith = (doombringerOwner: "me" | "them") => {
    const t = table();
    t[doombringerOwner].slain.push(`${bn("Doombringer")}#01`);
    t.me.party.push({ card: hero("h"), attachments: [] }, { card: hero("s"), attachments: [] });
    t.game.discard.push(hero("pick"));
    t.effect("hero.meowntain");
    t.answer(["s"]);
    return t.pending();
  };
  assert.equal(sacrificeWith("me")?.kind, "take_from_discard", "control: the sacrificer's own Doombringer offers");
  assert.equal(sacrificeWith("them")?.kind, undefined, "an opponent's Doombringer does not");
});

test("The Fearless Flame: an opponent's roll offers no discard-for-+1", () => {
  const t = table();
  t.them.leaderId = ds("The Fearless Flame");
  t.them.hand.push(hero("a"));
  t.me.hand.push(hero("b"));
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  assert.equal(t.pending(), undefined);
  assert.equal(t.total(), 6);
});

test("Calamity Mongrel: an opponent's DRAW of a Challenge offers nothing", () => {
  const t = table();
  t.them.slain.push(`${ds("Calamity Mongrel")}#01`);
  const challenge = card("ch", ds("Sorcerer Challenge"), "challenge");
  t.me.hand.push(challenge);
  t.game.chain = null;
  t.game.queue.push(...drawTriggerSteps(t.game, t.me, [challenge]));
  advance(t.game, t.deps, t.hooks);
  assert.equal(t.pending(), undefined);
  assert.ok(t.me.hand.some((c) => c.cardId === "ch"), "Challenge stays in hand");
});

test("The Piercing Howl: +1 per equipped Item counts for its owner's rolls only", () => {
  const t = table();
  t.them.leaderId = wd("The Piercing Howl");
  t.me.party.push({ card: hero("h"), attachments: [card("it", bn("Silver Lining"), "item")] });
  startAttack(t.game, t.me.playerId, t.game.faceUpMonsters[0], t.deps, t.hooks);
  assert.equal(t.total(), 6, "opponent's Leader adds nothing to my roll");
});

test("cross-set: a 2-slot Hero stacks a WD Item, a BN Item and a DS Leader on one roll", () => {
  const t = table();
  t.me.leaderId = ds("The Fearless Flame");
  t.me.party.push({
    card: { cardId: "w", definitionId: bn("Vicious Wildcat"), kind: "hero" },
    attachments: [card("ebr", wd("Even Bigger Ring"), "item"), card("bbr", bn("Biggest Ring Ever"), "item")],
  });
  t.me.hand.push(hero("a"), hero("b"), hero("c"));
  startHeroRoll(t.game, t.me.playerId, "w", {}, t.deps, t.hooks);
  const seen: string[] = [];
  for (let guard = 0; t.pending() && guard < 6; guard += 1) {
    seen.push(t.pending()!.kind);
    t.answer(t.me.hand.slice(0, 1).map((c) => c.cardId)); // each prompt: discard one card
  }
  const window = t.game.chain as { step: string } | null;
  assert.equal(window?.step, "modifier_window", `prompts seen: ${seen.join(",")}`);
  assert.deepEqual(seen, ["discard", "discard"], "Biggest Ring Ever and The Fearless Flame each ask once");
  assert.equal(t.total(), 6 + 4 + 2 + 1, "dice 6 + Even Bigger Ring 4 + one Ring discard 2 + Flame 1");
  assert.equal(t.me.hand.length, 1, "two cards discarded");
});

test("E14: PULL is not DRAW — pulling a Challenge does not trigger Calamity Mongrel, drawing one does", () => {
  const pulled = table();
  pulled.me.slain.push(`${ds("Calamity Mongrel")}#01`);
  pulled.them.hand.push(card("ch", ds("Sorcerer Challenge"), "challenge"));
  pulled.game.chain = null;
  pulled.game.queue.push({ op: "pull", fromPlayerId: pulled.them.playerId, toPlayerId: pulled.me.playerId, n: 1 } as Step);
  advance(pulled.game, pulled.deps, pulled.hooks);
  assert.ok(pulled.me.hand.some((c) => c.cardId === "ch"), "the Challenge arrived by PULL");
  assert.equal(pulled.pending(), undefined, "no Mongrel offer for a PULL");

  const drawn = table();
  drawn.me.slain.push(`${ds("Calamity Mongrel")}#01`);
  drawn.game.mainDeck.unshift(card("ch2", ds("Sorcerer Challenge"), "challenge"));
  drawn.game.chain = null;
  drawn.game.queue.push({ op: "draw", playerId: drawn.me.playerId, n: 1 } as Step);
  advance(drawn.game, drawn.deps, drawn.hooks);
  assert.equal(drawn.pending()?.kind, "confirm", "control: a DRAW does offer");
});
