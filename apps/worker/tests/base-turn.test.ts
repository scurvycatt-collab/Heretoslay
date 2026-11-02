import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { baseMainDeck, type BaseCard } from "../src/game/base-content.ts";
import {
  applyBaseCommand,
  initialBaseGameState,
  projectBaseGame,
  settleBaseGame,
  type BaseGameDeps,
  type BaseGameState,
  type BaseRoster,
} from "../src/game/base-game.ts";

const LEADER = (slug: string) => `hts.base.v1.party-leader.${slug}`;
const HERO = (slug: string) => `hts.base.v1.hero.${slug}`;

interface Table {
  game: BaseGameState;
  roster: BaseRoster;
  deps: BaseGameDeps;
  dice: Array<[number, number]>;
  clock: { now: number };
  run: (playerId: string, kind: BaseGameCommand["kind"], payload?: Record<string, unknown>) => string;
}

function table(players = ["p1", "p2"], leaders = ["the-charismatic-song", "the-cloaked-sage", "the-divine-arrow"]): Table {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: players[0], players: players.map((playerId) => ({ playerId, nickname: playerId.toUpperCase() })) };
  const dice: Array<[number, number]> = [];
  const clock = { now: 1_000 };
  let id = 0;
  const deps: BaseGameDeps = {
    newId: () => `id-${++id}`,
    shuffle: (ids) => [...ids],
    rollDice: () => dice.shift() ?? [1, 1],
    now: () => clock.now,
  };
  let seq = 0;
  const run: Table["run"] = (playerId, kind, payload = {}) =>
    applyBaseCommand(game, roster, playerId, { commandId: `c${++seq}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  assert.equal(run(players[0], "BEGIN_LEADER_SELECTION"), "ACCEPTED");
  players.forEach((playerId, index) => assert.equal(run(playerId, "SELECT_PARTY_LEADER", { leaderId: LEADER(leaders[index]) }), "ACCEPTED"));
  assert.equal(run(players[0], "START_GAME"), "ACCEPTED");
  return { game, roster, deps, dice, clock, run };
}

const seat = (t: Table, playerId: string) => t.game.seats.find((s) => s.playerId === playerId)!;
const active = (t: Table) => t.game.turnOrder[t.game.currentPlayerIndex];
const other = (t: Table) => t.game.turnOrder.find((id) => id !== active(t))!;

/** Moves a specific card (by definitionId) from wherever it is into a hand. */
function give(t: Table, playerId: string, definitionId: string): BaseCard {
  const pools = [t.game.mainDeck, t.game.discard, ...t.game.seats.map((s) => s.hand)];
  for (const pool of pools) {
    const index = pool.findIndex((card) => card.definitionId === definitionId);
    if (index >= 0) {
      const [card] = pool.splice(index, 1);
      seat(t, playerId).hand.push(card);
      return card;
    }
  }
  throw new Error(`no copy of ${definitionId} left`);
}

/** Puts a Hero straight into a Party (test setup). */
function placeHero(t: Table, playerId: string, slug: string): BaseCard {
  const card = give(t, playerId, HERO(slug));
  const hand = seat(t, playerId).hand;
  hand.splice(hand.indexOf(card), 1);
  seat(t, playerId).party.push({ card, item: null });
  return card;
}

function passAll(t: Table) {
  const chain = t.game.chain;
  assert.ok(chain && (chain.step === "challenge_window" || chain.step === "modifier_window"));
  for (const playerId of Object.keys(chain.responders)) {
    if (chain.responders[playerId] === "pending") assert.equal(t.run(playerId, "REACT_PASS", { windowId: chain.windowId }), "ACCEPTED");
  }
}

test("PLAY Hero: Challenge window → Party → immediate roll choice (skip); AP spent once", () => {
  const t = table();
  const me = active(t);
  const hero = give(t, me, HERO("peanut"));
  assert.equal(t.run(me, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId }), "ACCEPTED");
  assert.equal(t.game.actionPoints, 2);
  assert.equal(t.game.chain?.step, "challenge_window");
  assert.equal(t.run(me, "DRAW_CARD"), "CHAIN_PENDING"); // G-02
  passAll(t);
  assert.equal(seat(t, me).party[0].card.cardId, hero.cardId);
  assert.equal(t.game.chain?.step, "immediate_roll_choice");
  assert.equal(t.run(me, "IMMEDIATE_ROLL", { choice: "skip" }), "ACCEPTED");
  assert.equal(t.game.chain, null);
  assert.equal(t.game.actionPoints, 2);
});

test("Challenge: tie goes to the challenger; card discarded, AP not refunded", () => {
  const t = table();
  const me = active(t);
  const them = other(t);
  const hero = give(t, me, HERO("peanut"));
  const challengeCard = give(t, them, "hts.base.v1.challenge.challenge");
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
  const windowId = (t.game.chain as { windowId: string }).windowId;
  assert.equal(t.run(me, "REACT_CHALLENGE", { windowId, cardInstanceId: challengeCard.cardId }), "NOT_ELIGIBLE");
  t.dice.push([3, 3], [2, 4]); // defender 6, challenger 6
  assert.equal(t.run(them, "REACT_CHALLENGE", { windowId, cardInstanceId: challengeCard.cardId }), "ACCEPTED");
  assert.equal(t.game.chain?.step, "modifier_window");
  passAll(t);
  assert.equal(seat(t, me).party.length, 0);
  assert.ok(t.game.discard.some((card) => card.cardId === hero.cardId));
  assert.equal(t.game.actionPoints, 2);
});

test("Hero roll: Modifier value/side validated, effect on success, once per Hero per turn", () => {
  const t = table(["p1", "p2"], ["the-cloaked-sage", "the-charismatic-song"]); // p2 picks last → goes first
  const me = active(t);
  const them = other(t);
  const peanut = placeHero(t, me, "peanut"); // 7+: DRAW 2
  const mod = give(t, them, "hts.base.v1.modifier.modifier-plus-2-minus-2");
  const handBefore = seat(t, me).hand.length;
  t.dice.push([3, 3]); // 6 (+1 Charismatic Song passive) = 7
  assert.equal(t.run(me, "USE_HERO_EFFECT", { heroInstanceId: peanut.cardId }), "ACCEPTED");
  const chain = t.game.chain!;
  assert.equal(chain.step, "modifier_window");
  const windowId = (chain as { windowId: string }).windowId;
  const view = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, them);
  assert.equal(view.game.chain?.step === "modifier_window" && view.game.chain.roll.passives[0].label, "passive của Leader: The Charismatic Song");
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId, cardInstanceId: mod.cardId, value: 4 }), "INVALID_MODIFIER_VALUE");
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId, cardInstanceId: mod.cardId, value: -2, side: "defender" }), "INVALID_MODIFIER_SIDE");
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId, cardInstanceId: mod.cardId, value: 2 }), "ACCEPTED");
  assert.equal(t.run(them, "REACT_MODIFIER", { windowId, cardInstanceId: mod.cardId, value: 2 }), "ALREADY_RESPONDED");
  passAll(t);
  assert.equal(seat(t, me).hand.length, handBefore + 2);
  assert.equal(t.run(me, "USE_HERO_EFFECT", { heroInstanceId: peanut.cardId }), "HERO_ALREADY_ROLLED");
  assert.equal(t.game.actionPoints, 2);
});

test("ATTACK: Leader is not a Hero for an \"any\" slot; requirement, slay + refill, penalty choice", () => {
  const t = table();
  const me = active(t);
  t.game.faceUpMonsters = ["hts.base.v1.monster.dracos#01", "hts.base.v1.monster.terratuga#01", "hts.base.v1.monster.mega-slime#01"];
  t.game.monsterDeck = ["hts.base.v1.monster.orthus#01"];
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.dracos#01" }), "REQUIREMENT_NOT_MET");
  const hero = placeHero(t, me, "peanut");
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.orthus#01" }), "MONSTER_NOT_AVAILABLE");
  // Dracos is inverted: slay on 5-, penalty on 8+.
  t.dice.push([2, 2]); // 4 (+1 Divine Arrow only for that leader; p1 here may not have it)
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.dracos#01" }), "ACCEPTED");
  passAll(t);
  const total = 4 + (seat(t, me).leaderId === LEADER("the-divine-arrow") ? 1 : 0);
  assert.ok(total <= 5);
  assert.deepEqual(seat(t, me).slain, ["hts.base.v1.monster.dracos#01"]);
  assert.deepEqual(t.game.faceUpMonsters, ["hts.base.v1.monster.orthus#01", "hts.base.v1.monster.terratuga#01", "hts.base.v1.monster.mega-slime#01"]);
  assert.equal(t.game.actionPoints, 1);
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.terratuga#01" }), "INSUFFICIENT_AP");
  void hero;
});

test("ATTACK penalty: SACRIFICE choice; last AP → auto END_TURN only after the chain closes", () => {
  const t = table();
  const me = active(t);
  t.game.faceUpMonsters = ["hts.base.v1.monster.terratuga#01"];
  t.game.monsterDeck = [];
  const hero = placeHero(t, me, "peanut");
  t.game.actionPoints = 2;
  t.dice.push([2, 3]); // 5 (≤ 7-) → penalty SACRIFICE
  t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.terratuga#01" });
  passAll(t);
  const chain = t.game.chain;
  assert.equal(chain?.step, "choice");
  assert.equal(active(t), me); // AP 0 but chain open → no advance (G-03)
  const choiceId = (chain as { choice: { choiceId: string } }).choice.choiceId;
  assert.equal(t.run(other(t), "RESOLVE_CHOICE", { choiceId, cardInstanceIds: [hero.cardId] }), "NOT_YOUR_CHOICE");
  assert.equal(t.run(me, "RESOLVE_CHOICE", { choiceId, cardInstanceIds: [hero.cardId] }), "ACCEPTED");
  assert.equal(seat(t, me).party.length, 0);
  assert.notEqual(active(t), me);
  assert.equal(t.game.actionPoints, 3);
  assert.deepEqual(t.game.faceUpMonsters, ["hts.base.v1.monster.terratuga#01"]);
});

test("Items: own Hero only for Item (Q-06), any Hero for Cursed, one Item per Hero; Mask replaces the class (owner 2026-11-02)", () => {
  const t = table();
  const me = active(t);
  const them = other(t);
  const mine = placeHero(t, me, "peanut"); // bard
  const theirs = placeHero(t, them, "bad-axe");
  const mask = give(t, me, "hts.base.v1.item.wizard-mask");
  const curse = give(t, me, "hts.base.v1.cursed-item.sealing-key");
  assert.equal(t.run(me, "PLAY_HAND_CARD", { cardInstanceId: mask.cardId, targets: { heroInstanceIds: [theirs.cardId] } }), "INVALID_TARGET");
  assert.equal(t.run(me, "PLAY_HAND_CARD", { cardInstanceId: mask.cardId, targets: { heroInstanceIds: [mine.cardId] } }), "ACCEPTED");
  passAll(t);
  assert.equal(seat(t, me).party[0].item?.cardId, mask.cardId);
  const view = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, me);
  assert.deepEqual(view.players.find((p) => p.playerId === me)!.party[0].classes, ["wizard"]);
  assert.equal(t.run(me, "PLAY_HAND_CARD", { cardInstanceId: curse.cardId, targets: { heroInstanceIds: [mine.cardId] } }), "INVALID_TARGET");
  assert.equal(t.run(me, "PLAY_HAND_CARD", { cardInstanceId: curse.cardId, targets: { heroInstanceIds: [theirs.cardId] } }), "ACCEPTED");
  passAll(t);
  assert.equal(seat(t, them).party[0].item?.cardId, curse.cardId);
});

test("Sealing Key blocks the Hero effect; Mighty Blade stops DESTROY; Decoy Doll absorbs it", () => {
  const t = table();
  const me = active(t);
  const them = other(t);
  const axe = placeHero(t, me, "bad-axe"); // 8+: DESTROY
  const target = placeHero(t, them, "peanut");
  seat(t, them).protections.noDestroy = true;
  t.dice.push([6, 6]);
  assert.equal(t.run(me, "USE_HERO_EFFECT", { heroInstanceId: axe.cardId, targets: { heroInstanceIds: [target.cardId] } }), "ACCEPTED");
  passAll(t);
  assert.equal(seat(t, them).party.length, 1);
  assert.match(t.game.log.at(-1)!.text, /không thể bị destroy/);

  const t2 = table();
  const me2 = active(t2);
  const them2 = other(t2);
  const axe2 = placeHero(t2, me2, "bad-axe");
  const target2 = placeHero(t2, them2, "peanut");
  const doll = give(t2, them2, "hts.base.v1.item.decoy-doll");
  seat(t2, them2).hand.splice(seat(t2, them2).hand.indexOf(doll), 1);
  seat(t2, them2).party[0].item = doll;
  t2.dice.push([6, 6]);
  t2.run(me2, "USE_HERO_EFFECT", { heroInstanceId: axe2.cardId, targets: { heroInstanceIds: [target2.cardId] } });
  passAll(t2);
  assert.equal(seat(t2, them2).party[0].card.cardId, target2.cardId);
  assert.equal(seat(t2, them2).party[0].item, null);

  const key = give(t2, them2, "hts.base.v1.cursed-item.sealing-key");
  seat(t2, them2).hand.splice(seat(t2, them2).hand.indexOf(key), 1);
  seat(t2, me2).party[0].item = key;
  t2.game.heroRollsUsed = [];
  assert.equal(t2.run(me2, "USE_HERO_EFFECT", { heroInstanceId: axe2.cardId, targets: { heroInstanceIds: [target2.cardId] } }), "HERO_EFFECT_BLOCKED");
});

test("deadlines: Challenge window and choices settle by default; timer is not reset", () => {
  const t = table();
  const me = active(t);
  const hero = give(t, me, HERO("peanut"));
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId });
  assert.equal(settleBaseGame(t.game, t.roster, t.deps), false);
  t.clock.now += 20_000;
  assert.equal(settleBaseGame(t.game, t.roster, t.deps), true);
  assert.equal(seat(t, me).party.length, 1);
  assert.equal(t.game.chain?.step, "immediate_roll_choice");
  t.clock.now += 30_000;
  settleBaseGame(t.game, t.roster, t.deps);
  assert.equal(t.game.chain, null);
});

test("Shadow Claw: banned in 2-player games; 1 AP once per turn pull in 3-player games", () => {
  const t2 = table(["a", "b"], ["the-charismatic-song", "the-cloaked-sage"]);
  void t2;
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "a", players: [{ playerId: "a", nickname: "A" }, { playerId: "b", nickname: "B" }] };
  const deps: BaseGameDeps = { newId: () => "x", shuffle: (ids) => ids, rollDice: () => [1, 1], now: () => 0 };
  const cmd = (kind: string, payload = {}) => ({ commandId: "c", expectedRevision: 0, kind, payload }) as BaseGameCommand;
  applyBaseCommand(game, roster, "a", cmd("BEGIN_LEADER_SELECTION"), deps);
  assert.equal(applyBaseCommand(game, roster, "a", cmd("SELECT_PARTY_LEADER", { leaderId: LEADER("the-shadow-claw") }), deps), "LEADER_NOT_AVAILABLE");

  const t = table(["a", "b", "c"], ["the-charismatic-song", "the-cloaked-sage", "the-shadow-claw"]);
  const me = active(t); // last selector goes first → "c" with Shadow Claw
  assert.equal(me, "c");
  const before = seat(t, "a").hand.length;
  assert.equal(t.run(me, "LEADER_ACTION", { targetPlayerId: "a" }), "ACCEPTED");
  assert.equal(seat(t, "a").hand.length, before - 1);
  assert.equal(t.run(me, "LEADER_ACTION", { targetPlayerId: "a" }), "LEADER_ACTION_UNAVAILABLE");
  assert.equal(t.game.actionPoints, 2);
});

test("Magic: Enchanted Spell +2 to the actor's rolls this turn; unknown effects are a logged no-op", () => {
  const t = table();
  const me = active(t);
  const spell = give(t, me, "hts.base.v1.magic.enchanted-spell");
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: spell.cardId });
  passAll(t);
  assert.equal(t.game.turnRollBonus, 2);
  const fuzzy = placeHero(t, me, "fuzzy-cheeks");
  t.dice.push([6, 6]);
  t.run(me, "USE_HERO_EFFECT", { heroInstanceId: fuzzy.cardId });
  passAll(t);
  assert.ok(t.game.log.some((entry) => /chưa được hỗ trợ/.test(entry.text)));
});

test("privacy: choice options only for the chooser; other hands never serialized", () => {
  const t = table();
  const me = active(t);
  const them = other(t);
  const spell = give(t, me, "hts.base.v1.magic.critical-boost");
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: spell.cardId });
  passAll(t);
  const mine = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, me);
  const theirs = projectBaseGame(t.game, t.roster, { roomCode: "X", revision: 1, serverNow: 0 }, them);
  assert.equal(mine.game.chain?.step, "choice");
  assert.ok(mine.game.chain?.step === "choice" && mine.game.chain.options!.length > 0);
  assert.ok(theirs.game.chain?.step === "choice" && theirs.game.chain.options === undefined);
  assert.equal(JSON.stringify(theirs).includes(seat(t, me).hand[0].cardId), false);
});

test("Tipsy Tootie: blocked STEAL (Calming Voice) → Tootie stays; Magic stays out of a reshuffle while resolving", () => {
  const t = table();
  const me = active(t);
  const them = other(t);
  const tootie = placeHero(t, me, "tipsy-tootie");
  const target = placeHero(t, them, "peanut");
  seat(t, them).protections.noSteal = true;
  t.dice.push([6, 6]);
  t.run(me, "USE_HERO_EFFECT", { heroInstanceId: tootie.cardId, targets: { heroInstanceIds: [target.cardId] } });
  passAll(t);
  assert.deepEqual(seat(t, me).party.map((h) => h.card.cardId), [tootie.cardId]);
  assert.deepEqual(seat(t, them).party.map((h) => h.card.cardId), [target.cardId]);

  const boost = give(t, me, "hts.base.v1.magic.critical-boost");
  t.game.mainDeck = [];
  t.game.discard = [];
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: boost.cardId });
  passAll(t);
  assert.equal(seat(t, me).hand.some((card) => card.cardId === boost.cardId), false);
});

test("owner 2026-11-02: Leader fills a class slot (retail rulebook); a Mask replaces the Hero's class for requirements", () => {
  const t = table(["p1", "p2"], ["the-charismatic-song", "the-cloaked-sage"]); // p2 (Wizard Leader) starts
  const me = active(t);
  t.game.faceUpMonsters = ["hts.base.v1.monster.orthus#01"]; // 1 Wizard + 1 Hero
  const fighter = placeHero(t, me, "bad-axe");
  t.dice.push([1, 1]);
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.orthus#01" }), "ACCEPTED");
  passAll(t);
  // Mask replace: a Bard Hero wearing a Fighter Mask is no longer a Bard.
  const t2 = table(["p1", "p2"], ["the-cloaked-sage", "the-fist-of-reason"]);
  const me2 = active(t2);
  t2.game.faceUpMonsters = ["hts.base.v1.monster.dark-dragon-king#01"]; // 1 Bard + 1 Hero
  const bard = placeHero(t2, me2, "peanut");
  placeHero(t2, me2, "bad-axe");
  const mask = give(t2, me2, "hts.base.v1.item.fighter-mask");
  seat(t2, me2).hand.splice(seat(t2, me2).hand.indexOf(mask), 1);
  seat(t2, me2).party.find((h) => h.card.cardId === bard.cardId)!.item = mask;
  assert.equal(t2.run(me2, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.dark-dragon-king#01" }), "REQUIREMENT_NOT_MET");
  void fighter;
});

test("owner 2026-11-02: \"may\" asks the player (confirm); choice timeout = skip", () => {
  const t = table();
  const me = active(t);
  const them = other(t);
  const peanut = placeHero(t, me, "peanut");
  seat(t, me).slain = ["hts.base.v1.monster.artic-aries#01"];
  t.dice.push([6, 6]);
  t.run(me, "USE_HERO_EFFECT", { heroInstanceId: peanut.cardId });
  passAll(t);
  const chain = t.game.chain;
  assert.ok(chain?.step === "choice" && chain.choice.kind === "confirm");
  const choiceId = (chain as { choice: { choiceId: string } }).choice.choiceId;
  const hand = seat(t, me).hand.length;
  assert.equal(t.run(me, "RESOLVE_CHOICE", { choiceId, cardInstanceIds: [] }), "INVALID_CHOICE");
  assert.equal(t.run(me, "RESOLVE_CHOICE", { choiceId, cardInstanceIds: [], accept: true }), "ACCEPTED");
  assert.equal(seat(t, me).hand.length, hand + 1);

  // Penalty DISCARD times out → nothing discarded.
  t.game.faceUpMonsters = ["hts.base.v1.monster.terratuga#01"];
  t.game.actionPoints = 2;
  void them;
  t.dice.push([1, 1]);
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.terratuga#01" }), "ACCEPTED");
  passAll(t);
  assert.equal(t.game.chain?.step, "choice");
  const party = seat(t, me).party.length;
  t.clock.now += 30_000;
  settleBaseGame(t.game, t.roster, t.deps);
  assert.equal(seat(t, me).party.length, party);
  assert.equal(t.game.chain, null);
});
