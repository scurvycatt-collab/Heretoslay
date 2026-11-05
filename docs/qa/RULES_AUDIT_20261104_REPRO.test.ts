// Review-only regression specifications. Expected failures on main@7527f6b.
// HISTORICAL: owner contract docs/decisions/RULES_AUDIT_OWNER_DECISIONS_20261104.md supersedes proposals.
// R06's Hero-eligible expectation was rejected; replace with Item-only and two-Item-choice tests before adoption.
// R03 checks only that DRAW occurs; new acceptance must additionally verify DRAW-before-award-before-win/passives.
// Run from a checkout of that SHA: node --test --experimental-strip-types docs/qa/RULES_AUDIT_20261104_REPRO.test.ts
// No production code changes. R01 requires explicit resolution of the timeout policy before implementation.
import assert from "node:assert/strict";
import test from "node:test";
import { initialBaseGameState, applyBaseCommand, settleBaseGame, projectBaseGame } from "../../apps/worker/src/game/base-game.ts";
import { baseMainDeck } from "../../apps/worker/src/game/base-content.ts";
import { eligibleChoiceCards } from "../../apps/worker/src/game/base-engine.ts";
import { rollPassives } from "../../apps/worker/src/game/base-rules.ts";

function table() {
  const game = initialBaseGameState();
  const roster = { hostPlayerId: "p1", players: ["p1", "p2"].map(playerId => ({ playerId, nickname: playerId })) };
  game.phase = "turn_active";
  game.turnOrder = ["p1", "p2"];
  game.currentPlayerIndex = 0;
  game.turnId = "review-turn";
  game.turnNumber = 1;
  game.actionPoints = 3;
  game.mainDeck = baseMainDeck();
  game.seats = ["p1", "p2"].map((playerId, i) => ({ playerId, leaderId: `hts.base.v1.party-leader.${i === 0 ? "the-charismatic-song" : "the-cloaked-sage"}`, hand: [], party: [], slain: [], protections: { noDestroy: false, noSteal: false } }));
  let now = 1000, seq = 0;
  const deps = { now: () => now, newId: () => `review-${++seq}`, shuffle: (ids: string[]) => [...ids], rollDice: (): [number, number] => [6, 6] };
  const seat = (id: string) => game.seats.find(s => s.playerId === id)!;
  const take = (definitionId: string) => {
    const i = game.mainDeck.findIndex(c => c.definitionId === definitionId);
    assert.ok(i >= 0, definitionId);
    return game.mainDeck.splice(i, 1)[0];
  };
  const hero = (id: string, slug: string) => {
    const card = take(`hts.base.v1.hero.${slug}`);
    seat(id).party.push({ card, item: null });
    return card;
  };
  const run = (playerId: string, kind: string, payload: object = {}) => applyBaseCommand(game, roster, playerId, { kind, payload, commandId: `cmd-${++seq}`, expectedRevision: 0 } as any, deps);
  const pass = () => {
    for (let guard = 0; guard < 10; guard++) {
      const c = game.chain;
      if (!c || (c.step !== "challenge_window" && c.step !== "modifier_window")) return;
      for (const [pid, status] of Object.entries(c.responders)) if (status === "pending") assert.equal(run(pid, "REACT_PASS", { windowId: c.windowId }), "ACCEPTED");
    }
    assert.fail("window drain exceeded guard");
  };
  const choice = () => { assert.equal(game.chain?.step, "choice"); return (game.chain as any).choice; };
  return { game, roster, deps, seat, take, hero, run, pass, choice, expire: () => { now = choice().deadlineAt; settleBaseGame(game, roster, deps); } };
}

test("R01: timing out Entangling Trap's discard must not grant its steal for free [policy gate]", () => {
  const t = table();
  const victim = t.hero("p2", "peanut");
  const spell = t.take("hts.base.v1.magic.entangling-trap");
  t.seat("p1").hand.push(spell, t.take("hts.base.v1.hero.bad-axe"), t.take("hts.base.v1.hero.fluffy"));
  assert.equal(t.run("p1", "PLAY_HAND_CARD", { cardInstanceId: spell.cardId, targets: { heroInstanceIds: [victim.cardId] } }), "ACCEPTED");
  t.pass();
  assert.equal(t.choice().kind, "discard");
  t.expire();
  assert.ok(t.seat("p2").party.some(h => h.card.cardId === victim.cardId), "unpaid cost still granted STEAL");
});

test("R02: nested Snowball spell must resolve before Snowball's second draw", () => {
  const t = table();
  const snowball = t.hero("p1", "snowball");
  const victim = t.hero("p2", "peanut");
  const spell = t.take("hts.base.v1.magic.destructive-spell");
  const next = t.take("hts.base.v1.hero.bad-axe");
  t.game.mainDeck.unshift(spell, next);
  assert.equal(t.run("p1", "USE_HERO_EFFECT", { heroInstanceId: snowball.cardId }), "ACCEPTED");
  t.pass();
  const offer = t.choice();
  assert.equal(t.run("p1", "RESOLVE_CHOICE", { choiceId: offer.choiceId, cardInstanceIds: [spell.cardId], targets: { heroInstanceIds: [victim.cardId] } }), "ACCEPTED");
  t.pass();
  assert.equal(t.choice().kind, "discard");
  assert.ok(!t.seat("p1").hand.some(c => c.cardId === next.cardId), "parent's second DRAW ran before nested spell cost");
});

test("R03: slaying Corrupted Sabretooth grants the printed immediate DRAW reward", () => {
  const t = table();
  t.hero("p1", "peanut"); t.hero("p1", "bad-axe"); t.hero("p1", "fluffy");
  const monster = "hts.base.v1.monster.corrupted-sabretooth#01";
  t.game.faceUpMonsters = [monster];
  const before = t.seat("p1").hand.length;
  assert.equal(t.run("p1", "ATTACK_MONSTER", { monsterInstanceId: monster }), "ACCEPTED");
  t.pass();
  assert.ok(t.seat("p1").slain.includes(monster));
  assert.equal(t.seat("p1").hand.length, before + 1, "SLAY reward is absent from model/resolver");
});

test("R04: Titan Wyvern's Challenge-card roll bonus applies to defender too", () => {
  const t = table();
  t.seat("p1").slain = ["hts.base.v1.monster.titan-wyvern#01"];
  assert.ok(rollPassives(t.seat("p1"), "challenge_defender", {}).some(p => p.source.endsWith("titan-wyvern") && p.value === 1));
});

test("R05: Pan Chucks must publicly identify the revealed drawn Challenge", () => {
  const t = table();
  const pan = t.hero("p1", "pan-chucks");
  t.hero("p2", "peanut");
  const drawn = t.take("hts.base.v1.challenge.challenge");
  t.game.mainDeck.unshift(drawn);
  assert.equal(t.run("p1", "USE_HERO_EFFECT", { heroInstanceId: pan.cardId }), "ACCEPTED");
  t.pass();
  assert.equal(t.run("p1", "RESOLVE_CHOICE", { choiceId: t.choice().choiceId, cardInstanceIds: [], accept: true }), "ACCEPTED");
  const publicView = projectBaseGame(t.game, t.roster, { roomCode: "REVIEW", revision: 1, serverNow: 1000 }, "p2");
  assert.ok(JSON.stringify(publicView).includes(drawn.cardId), "no public reveal event/card reference was produced");
});

test("R06: Quick Draw Item+Hero eligibility includes either drawn playable card [wording gate]", () => {
  const t = table();
  const quick = t.hero("p1", "quick-draw");
  const item = t.take("hts.base.v1.item.really-big-ring");
  const hero = t.take("hts.base.v1.hero.peanut");
  t.game.mainDeck.unshift(item, hero);
  assert.equal(t.run("p1", "USE_HERO_EFFECT", { heroInstanceId: quick.cardId }), "ACCEPTED");
  t.pass();
  assert.ok(eligibleChoiceCards(t.game, t.choice()).some(c => c.cardId === hero.cardId), "implementation restricts offer to drawn Items");
});
