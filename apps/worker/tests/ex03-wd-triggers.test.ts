// W02/W03/W10/W11: Feral Dragon, Silent Shield, Cursed Glove, Soul Tether.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { advance, buildEffect, resolveChoice, PARTY_CARD_LIMIT, type EngineDeps, type EngineHooks, type Step } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";

const wd = (name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === "warriorsDruids" && d.canonicalName === name)!.definitionId;
const hero = (id: string): BaseCard => ({ cardId: id, definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" });
const gear = (id: string, name: string): BaseCard => ({ cardId: id, definitionId: wd(name), kind: name === "Cursed Glove" ? "cursed_item" : "item" });

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
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  const engineDeps: EngineDeps = deps;
  const exec = (...steps: Step[]) => {
    game.chain = null;
    game.queue.push(...steps);
    advance(game, engineDeps, hooks);
  };
  const choose = (ids: string[]) => resolveChoice(game, me.playerId, (game.chain as { choice: { choiceId: string } }).choice.choiceId, ids, engineDeps, hooks);
  const sacrifice = (cardId: string) => {
    exec(...buildEffect(game, "hero.doe-fallow", me.playerId, {}));
    return choose([cardId]);
  };
  return { game, me, them, exec, choose, sacrifice, deps: engineDeps, hooks };
}
const inParty = (seat: { party: Array<{ card: BaseCard }> }, id: string) => seat.party.some((h) => h.card.cardId === id);

test("Feral Dragon: its owner draws when ANY player really sacrifices a Hero; Decoy Doll does not count", () => {
  const t = table();
  t.them.slain.push(`${wd("Feral Dragon")}#01`);
  t.me.party.push({ card: hero("a"), attachments: [] });
  const before = t.them.hand.length;
  assert.equal(t.sacrifice("a"), "ACCEPTED");
  assert.equal(t.them.hand.length, before + 1);

  const decoy = table();
  decoy.them.slain.push(`${wd("Feral Dragon")}#01`);
  decoy.me.party.push({ card: hero("a"), attachments: [{ cardId: "doll", definitionId: "hts.base.v1.item.decoy-doll", kind: "item" }] });
  const b = decoy.them.hand.length;
  decoy.sacrifice("a");
  assert.equal(decoy.them.hand.length, b, "Hero stayed → no sacrifice");
  assert.ok(inParty(decoy.me, "a"));
});

test("Silent Shield: armed player may recover a Hero when sacrificing (also forced) or destroying; off for others and after the turn", () => {
  const t = table();
  t.me.party.push({ card: hero("a"), attachments: [] });
  t.game.discard.push(hero("old"));
  t.exec(...buildEffect(t.game, "hero.silent-shield", t.me.playerId, {}));
  assert.equal(t.game.silentShieldBy, t.me.playerId);
  t.sacrifice("a");
  const choice = (t.game.chain as { choice: { kind: string; min: number } }).choice;
  assert.equal(choice.kind, "take_from_discard");
  assert.equal(choice.min, 0, "optional");
  assert.equal(t.choose(["old"]), "ACCEPTED");
  assert.ok(t.me.hand.some((c) => c.cardId === "old"));

  const destroy = table();
  destroy.game.silentShieldBy = destroy.me.playerId;
  destroy.them.party.push({ card: hero("b"), attachments: [] });
  destroy.exec({ op: "destroy", heroCardId: "b", byPlayerId: destroy.me.playerId } as Step);
  assert.equal((destroy.game.chain as { choice: { kind: string } } | null)?.choice.kind, "take_from_discard");

  const other = table(); // someone else's sacrifice does not trigger my Shield
  other.game.silentShieldBy = other.me.playerId;
  other.them.party.push({ card: hero("c"), attachments: [] });
  other.game.discard.push(hero("old"));
  other.exec({ op: "choice", playerId: other.them.playerId, kind: "sacrifice_hero", count: 1, prompt: "x" } as Step);
  resolveChoice(other.game, other.them.playerId, (other.game.chain as { choice: { choiceId: string } }).choice.choiceId, ["c"], other.deps, other.hooks);
  assert.notEqual((other.game.chain as { choice?: { kind: string } } | null)?.choice?.kind, "take_from_discard");
});

test("Cursed Glove: the gloved Hero follows the stolen one with its items; full Party sends it to discard; Calming Voice blocks everything", () => {
  const t = table();
  t.them.party.push(
    { card: hero("stolen"), attachments: [] },
    { card: hero("gloved"), attachments: [gear("glove", "Cursed Glove"), gear("ring", "Even Bigger Ring")] },
  );
  t.exec({ op: "steal", heroCardId: "stolen", toPlayerId: t.me.playerId });
  assert.deepEqual(t.me.party.map((h) => h.card.cardId), ["stolen", "gloved"], "gloved goes after");
  assert.equal(t.me.party[1].attachments.length, 2, "attachments travel along");
  assert.equal(t.them.party.length, 0);

  const full = table();
  full.me.party.push(...Array.from({ length: PARTY_CARD_LIMIT - 1 }, (_, i) => ({ card: hero(`f${i}`), attachments: [] })));
  full.them.party.push({ card: hero("stolen"), attachments: [] }, { card: hero("gloved"), attachments: [gear("glove", "Cursed Glove"), gear("ring", "Even Bigger Ring")] });
  full.exec({ op: "steal", heroCardId: "stolen", toPlayerId: full.me.playerId });
  assert.equal(full.me.party.length, PARTY_CARD_LIMIT);
  assert.ok(inParty(full.me, "stolen") && !inParty(full.me, "gloved"));
  for (const id of ["gloved", "glove", "ring"]) assert.ok(full.game.discard.some((c) => c.cardId === id), id);

  const calm = table();
  calm.them.protections.noSteal = true;
  calm.them.party.push({ card: hero("stolen"), attachments: [] }, { card: hero("gloved"), attachments: [gear("glove", "Cursed Glove")] });
  calm.exec({ op: "steal", heroCardId: "stolen", toPlayerId: calm.me.playerId });
  assert.equal(calm.them.party.length, 2);
  assert.equal(calm.me.party.length, 0);
});

test("Soul Tether: another Hero's sacrifice/destroy sacrifices the equipped Hero; Maegisty returns it; no loops; steal does not trigger", () => {
  const t = table();
  t.me.party.push({ card: hero("a"), attachments: [] }, { card: hero("b"), attachments: [gear("t1", "Soul Tether")] });
  t.sacrifice("a");
  assert.equal(t.me.party.length, 0, "tethered Hero sacrificed too");
  assert.ok(t.game.discard.some((c) => c.cardId === "b") && t.game.discard.some((c) => c.cardId === "t1"));

  const mutual = table();
  mutual.me.party.push({ card: hero("a"), attachments: [gear("t1", "Soul Tether")] }, { card: hero("b"), attachments: [gear("t2", "Soul Tether")] }, { card: hero("c"), attachments: [] });
  mutual.sacrifice("c");
  assert.equal(mutual.me.party.length, 0, "both tethers resolve once, no infinite loop");

  const maegisty = table();
  maegisty.me.protections.returnToHand = true;
  maegisty.me.party.push({ card: hero("a"), attachments: [] }, { card: hero("b"), attachments: [gear("t1", "Soul Tether")] });
  maegisty.sacrifice("a");
  assert.equal(maegisty.me.party.length, 0, "credited sacrifice fires the Tether, whose own sacrifice is replaced too");
  assert.ok(["a", "b", "t1"].every((id) => maegisty.me.hand.some((c) => c.cardId === id)), "both Heroes (and the Tether) back in hand");
  assert.ok(!maegisty.game.discard.some((c) => c.cardId === "b"));

  const steal = table();
  steal.them.party.push({ card: hero("x"), attachments: [] }, { card: hero("y"), attachments: [gear("t1", "Soul Tether")] });
  steal.exec({ op: "steal", heroCardId: "x", toPlayerId: steal.me.playerId });
  assert.ok(inParty(steal.them, "y"), "steal never triggers the Tether");
});
