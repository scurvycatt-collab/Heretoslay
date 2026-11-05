// AUDIT-001 (QA) — rule-conformance spot checks against the owner decisions
// (product-decisions.md: "Owner chốt RULES-001", "lần 2", "lần 3") and RULES-001.
// Each test names the decision ID it audits. Settled product decisions are mandatory assertions.

import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import type { BaseCard } from "../src/game/base-content.ts";
import {
  applyBaseCommand,
  checkSlayWin,
  initialBaseGameState,
  projectBaseGame,
  settleBaseGame,
  type BaseGameDeps,
  type BaseGameState,
  type BaseRoster,
} from "../src/game/base-game.ts";

const LEADER = (slug: string) => `hts.base.v1.party-leader.${slug}`;
const HERO = (slug: string) => `hts.base.v1.hero.${slug}`;
const MON = (slug: string) => `hts.base.v1.monster.${slug}#01`;

function table(leaders: string[], settings: Record<string, unknown> = {}) {
  const players = leaders.map((_, i) => `p${i + 1}`);
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: players.map((playerId) => ({ playerId, nickname: playerId })) };
  const dice: Array<[number, number]> = [];
  const clock = { now: 1_000_000 };
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => dice.shift() ?? [1, 1], now: () => clock.now };
  let seq = 0;
  const run = (playerId: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, playerId, { commandId: `c${++seq}`, expectedRevision: 0, kind, payload } as BaseGameCommand, deps);
  if (Object.keys(settings).length) assert.ok(["ACCEPTED", "NO_CHANGE"].includes(run("p1", "CONFIGURE_GAME", settings)));
  run("p1", "BEGIN_LEADER_SELECTION");
  players.forEach((playerId, i) => run(playerId, "SELECT_PARTY_LEADER", { leaderId: LEADER(leaders[i]) }));
  run("p1", "START_GAME");
  const seat = (pid: string) => game.seats.find((s) => s.playerId === pid)!;
  const active = () => game.turnOrder[game.currentPlayerIndex];
  const others = () => game.turnOrder.filter((p) => p !== active());
  const take = (definitionId: string): BaseCard => {
    for (const pool of [game.mainDeck, game.discard, ...game.seats.map((s) => s.hand)]) {
      const i = pool.findIndex((c) => c.definitionId === definitionId);
      if (i >= 0) return pool.splice(i, 1)[0];
    }
    throw new Error(definitionId);
  };
  const give = (pid: string, definitionId: string) => {
    const c = take(definitionId);
    seat(pid).hand.push(c);
    return c;
  };
  const hero = (pid: string, slug: string) => {
    const c = take(HERO(slug));
    seat(pid).party.push({ card: c, attachments: [] });
    return c;
  };
  const passAll = () => {
    const chain = game.chain as { step: string; windowId: string; responders: Record<string, string> };
    for (const [pid, st] of Object.entries(chain.responders)) if (st === "pending") assert.equal(run(pid, "REACT_PASS", { windowId: chain.windowId }), "ACCEPTED");
  };
  const view = (pid: string) => projectBaseGame(game, roster, { roomCode: "X", revision: 1, serverNow: clock.now }, pid);
  return { game, roster, deps, dice, clock, run, seat, active, others, take, give, hero, passAll, view };
}

// ---------------------------------------------------------------- Q-01 (lần 2)
test("Q-01 (lần 2): Party Leader fills a Monster CLASS slot but never an 'any' slot; setting off reverts", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]); // p2 (Bard leader) first
  const me = t.active();
  assert.equal(me, "p2");
  t.game.faceUpMonsters = [MON("dark-dragon-king")]; // 1 Bard + 1 any
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: MON("dark-dragon-king") }), "REQUIREMENT_NOT_MET"); // Leader alone: 'any' unfilled
  t.hero(me, "bad-axe"); // Fighter fills 'any'; Bard Leader fills the Bard slot
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: MON("dark-dragon-king") }), "ACCEPTED");
  const t2 = table(["the-cloaked-sage", "the-charismatic-song"], { leaderFillsClassSlot: false });
  t2.game.faceUpMonsters = [MON("dark-dragon-king")];
  t2.hero(t2.active(), "bad-axe");
  assert.equal(t2.run(t2.active(), "ATTACK_MONSTER", { monsterInstanceId: MON("dark-dragon-king") }), "REQUIREMENT_NOT_MET");
});

// ---------------------------------------------------------------- Q-04 (lần 2)
test("Q-04 (lần 2): Mask REPLACES the class (requirement + projection); maskMode 'add' keeps both", () => {
  for (const [mode, expectMet] of [["replace", false], ["add", true]] as const) {
    const t = table(["the-cloaked-sage", "the-divine-arrow"], { maskMode: mode });
    const me = t.active();
    const fighter = t.hero(me, "bad-axe");
    t.hero(me, "dodgy-dealer"); // Bard → 'any'
    t.seat(me).party[0].attachments = [t.take("hts.base.v1.item.wizard-mask")];
    t.game.faceUpMonsters = [MON("titan-wyvern")]; // 1 Fighter + 1 any
    const classes = t.view(me).players.find((p) => p.playerId === me)!.party[0].classes;
    assert.deepEqual(classes, mode === "replace" ? ["wizard"] : ["fighter", "wizard"], `${mode}: ${fighter.cardId}`);
    // Leader is Ranger → cannot fill the Fighter slot either.
    assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: MON("titan-wyvern") }) === "ACCEPTED", expectMet, mode);
  }
});

// ---------------------------------------------------------------- Q-02
test("Q-02: simultaneous slay-win candidates → the ACTIVE player wins, even if the roller is another seat", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song", "the-divine-arrow"]);
  const me = t.active();
  const other = t.others()[0];
  t.seat(me).slain = [MON("orthus"), MON("rex-major"), MON("terratuga")];
  t.seat(other).slain = [MON("bloodwing"), MON("dracos"), MON("mega-slime")];
  assert.equal(checkSlayWin(t.game, t.seat(other)), true);
  assert.equal(t.game.winnerPlayerId, me);
});

// ---------------------------------------------------------------- Q-03
test("Q-03: the 3rd slay only lands after every Modifier/Skip resolved; a Modifier can still flip the result", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  t.seat(me).slain = [MON("orthus"), MON("rex-major")];
  t.hero(me, "bad-axe");
  t.game.faceUpMonsters = [MON("terratuga")]; // slay 11+
  t.game.monsterDeck = [MON("bloodwing")];
  const foe = t.others()[0];
  const mod = t.give(foe, "hts.base.v1.modifier.modifier-plus-2-minus-2");
  t.dice.push([5, 6]); // 11 +1 Charismatic?? (p2 leader is Bard: only on hero rolls) → 11
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: MON("terratuga") }), "ACCEPTED");
  const w = (t.game.chain as { windowId: string }).windowId;
  assert.equal(t.game.phase, "turn_active");
  assert.equal(t.seat(me).slain.length, 2, "nothing is slain while the Modifier window is open");
  t.run(me, "REACT_PASS", { windowId: w });
  assert.equal(t.game.phase, "turn_active", "still waiting for the other player");
  assert.equal(t.run(foe, "REACT_MODIFIER", { windowId: w, cardInstanceId: mod.cardId, value: -2 }), "ACCEPTED");
  assert.equal(t.game.phase, "turn_active", "11-2=9 → not a slay → no win");
  assert.deepEqual(t.game.faceUpMonsters, [MON("terratuga")]);
});

// ---------------------------------------------------------------- Q-09
test("Q-09: empty Monster deck → no refill (and no reshuffle of slain); ATTACK with none face-up is rejected; game continues", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  t.hero(me, "bad-axe");
  t.game.faceUpMonsters = [MON("terratuga"), MON("artic-aries")];
  t.game.monsterDeck = [];
  t.dice.push([6, 6]);
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: MON("terratuga") }), "ACCEPTED");
  t.passAll();
  assert.deepEqual(t.game.faceUpMonsters, [MON("artic-aries")]);
  assert.deepEqual(t.game.monsterDeck, []);
  t.game.faceUpMonsters = [];
  t.game.actionPoints = 3;
  assert.equal(t.run(me, "ATTACK_MONSTER", { monsterInstanceId: MON("terratuga") }), "MONSTER_NOT_AVAILABLE");
  assert.equal(t.run(me, "END_TURN"), "ACCEPTED");
  assert.equal(t.game.phase, "turn_active");
});

// ---------------------------------------------------------------- Q-10
test("Q-10: no Hero/Monster dice are rolled until the player sends the roll command; Challenge is server-rolled", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  const foe = t.others()[0];
  t.dice.push([6, 6], [6, 6], [6, 6]);
  const h = t.give(me, HERO("peanut"));
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: h.cardId });
  t.passAll();
  assert.equal(t.game.chain?.step, "immediate_roll_choice");
  assert.equal(t.dice.length, 3, "playing a Hero does not roll");
  t.run(me, "IMMEDIATE_ROLL", { choice: "roll", targets: {} });
  assert.equal(t.dice.length, 2, "exactly one roll when the player presses Roll");
  t.passAll();
  // Challenge: both sides rolled by the server in the same command
  const h2 = t.give(me, HERO("bad-axe"));
  const ch = t.give(foe, "hts.base.v1.challenge.challenge");
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: h2.cardId });
  const w = (t.game.chain as { windowId: string }).windowId;
  t.run(foe, "REACT_CHALLENGE", { windowId: w, cardInstanceId: ch.cardId });
  assert.equal(t.dice.length, 0, "challenger + defender both rolled by the server");
});

// ---------------------------------------------------------------- Q-11
test("Q-11/C10: Leader passive is shown as its own labelled entry and never takes a Modifier slot", () => {
  for (const expected of ["pending"] as const) {
    const t = table(["the-cloaked-sage", "the-divine-arrow"]);
    const me = t.active(); // Divine Arrow: +1 on attack
    t.hero(me, "bad-axe");
    t.game.faceUpMonsters = [MON("terratuga")];
    t.run(me, "ATTACK_MONSTER", { monsterInstanceId: MON("terratuga") });
    const chain = t.game.chain as { responders: Record<string, string> };
    assert.equal(chain.responders[me], expected);
    const v = t.view(me).game.chain as { roll: { passives: Array<{ label: string }>; modifiers: unknown[] } };
    assert.match(v.roll.passives[0].label, /^passive của Leader: The Divine Arrow/);
    assert.deepEqual(v.roll.modifiers, []);
  }
});

// ---------------------------------------------------------------- choice timeout = skip, may = ask
test("CHOICE-TIMEOUT: mandatory penalty falls back (C02); MAY: asks, timeout = decline", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  t.hero(me, "bad-axe");
  t.game.faceUpMonsters = [MON("terratuga")];
  t.dice.push([1, 2]); // penalty (7-): SACRIFICE
  t.run(me, "ATTACK_MONSTER", { monsterInstanceId: MON("terratuga") });
  t.passAll();
  assert.equal(t.game.chain?.step, "choice");
  const deadline = (t.game.chain as { choice: { deadlineAt: number } }).choice.deadlineAt;
  t.clock.now = deadline - 1;
  assert.equal(settleBaseGame(t.game, t.roster, t.deps), false);
  t.clock.now = deadline;
  assert.equal(settleBaseGame(t.game, t.roster, t.deps), true);
  assert.equal(t.seat(me).party.length, 0, "C02: mandatory SACRIFICE cannot be dodged by timeout (server fallback)");
  assert.equal(t.game.chain, null);

  // "may": Arctic Aries slain → success of a Hero roll asks the player
  const m = table(["the-cloaked-sage", "the-charismatic-song"]);
  const who = m.active();
  m.seat(who).slain = [MON("artic-aries")];
  const nib = m.hero(who, "napping-nibbles"); // 2+
  m.dice.push([6, 6]);
  m.run(who, "USE_HERO_EFFECT", { heroInstanceId: nib.cardId });
  m.passAll();
  const chain = m.game.chain as { step: string; choice: { kind: string; deadlineAt: number } };
  assert.equal(chain.step, "choice");
  assert.equal(chain.choice.kind, "confirm");
  const hand = m.seat(who).hand.length;
  m.clock.now = chain.choice.deadlineAt;
  settleBaseGame(m.game, m.roster, m.deps);
  assert.equal(m.seat(who).hand.length, hand, "timed-out 'may' = declined");
});

// ---------------------------------------------------------------- Challenge scope / uniqueness / timers
test("Challenge only for Hero/Item/Magic; never on rolls/attacks/draws; one Challenge per card; 20s windows are not reset", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song", "the-divine-arrow"]);
  const me = t.active();
  const [a, b] = t.others();
  t.run(me, "DRAW_CARD");
  assert.equal(t.game.chain, null, "DRAW opens no window");
  const bad = t.hero(me, "bad-axe");
  t.hero(a, "kit-napper");
  t.run(me, "USE_HERO_EFFECT", { heroInstanceId: bad.cardId, targets: { heroInstanceIds: [t.seat(a).party[0].card.cardId] } });
  assert.equal(t.game.chain?.step, "modifier_window", "Hero roll: Modifier only");
  assert.equal(t.run(a, "REACT_CHALLENGE", { windowId: (t.game.chain as { windowId: string }).windowId, cardInstanceId: "x" }), "NO_OPEN_WINDOW");
  t.passAll();
  // Play a Hero: Challenge window, two challengers race → only the first counts; windows keep their deadline
  const h = t.give(me, HERO("peanut"));
  const c1 = t.give(a, "hts.base.v1.challenge.challenge");
  const c2 = t.give(b, "hts.base.v1.challenge.challenge");
  const mod = t.give(b, "hts.base.v1.modifier.modifier-plus-4");
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: h.cardId });
  const cw = t.game.chain as { windowId: string; deadlineAt: number };
  assert.equal(cw.deadlineAt, t.clock.now + 20_000);
  t.clock.now += 5_000;
  assert.equal(t.run(a, "REACT_CHALLENGE", { windowId: cw.windowId, cardInstanceId: c1.cardId }), "ACCEPTED");
  assert.notEqual(t.run(b, "REACT_CHALLENGE", { windowId: cw.windowId, cardInstanceId: c2.cardId }), "ACCEPTED");
  const mw = t.game.chain as { windowId: string; deadlineAt: number };
  assert.equal(mw.deadlineAt, t.clock.now + 20_000, "Modifier window = 20s from the challenge, not from the card play");
  t.clock.now += 9_000;
  assert.equal(t.run(b, "REACT_MODIFIER", { windowId: mw.windowId, cardInstanceId: mod.cardId, value: 4, side: "challenger" }), "ACCEPTED");
  assert.equal((t.game.chain as { deadlineAt: number }).deadlineAt, mw.deadlineAt, "playing a Modifier does not reset the clock");
  t.clock.now = mw.deadlineAt;
  settleBaseGame(t.game, t.roster, t.deps);
  assert.ok(t.game.chain === null || t.game.chain.step !== "modifier_window", "window closed at the original deadline");
  assert.ok(!(t.game.chain && "attempt" in t.game.chain), "no second Challenge window for the same card");
});

// ---------------------------------------------------------------- hero roll once per turn
test("RG-HERO-04: one roll per Hero per turn, immediate roll included; Skip does not consume it; resets next turn", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  const p = t.give(me, HERO("peanut"));
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: p.cardId });
  t.passAll();
  t.run(me, "IMMEDIATE_ROLL", { choice: "skip" });
  assert.equal(t.game.actionPoints, 2);
  // skip kept the allowance → a paid roll is still possible
  assert.equal(t.run(me, "USE_HERO_EFFECT", { heroInstanceId: p.cardId }), "ACCEPTED");
  t.passAll();
  assert.equal(t.run(me, "USE_HERO_EFFECT", { heroInstanceId: p.cardId }), "HERO_ALREADY_ROLLED");
  // immediate roll consumes the allowance
  const t2 = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me2 = t2.active();
  const p2 = t2.give(me2, HERO("peanut"));
  t2.run(me2, "PLAY_HAND_CARD", { cardInstanceId: p2.cardId });
  t2.passAll();
  assert.equal(t2.run(me2, "IMMEDIATE_ROLL", { choice: "roll", targets: {} }), "ACCEPTED");
  t2.passAll();
  assert.equal(t2.game.actionPoints, 2, "immediate roll is free");
  assert.equal(t2.run(me2, "USE_HERO_EFFECT", { heroInstanceId: p2.cardId }), "HERO_ALREADY_ROLLED");
});

// ---------------------------------------------------------------- G-03 last AP
test("G-03: AP→0 mid-chain does not end the turn until the chain (window + immediate roll) is closed; then exactly once", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  t.game.actionPoints = 1;
  const turn = t.game.turnNumber;
  const h = t.give(me, HERO("peanut"));
  t.run(me, "PLAY_HAND_CARD", { cardInstanceId: h.cardId });
  assert.equal(t.game.actionPoints, 0);
  assert.equal(t.active(), me);
  t.passAll();
  assert.equal(t.active(), me, "immediate roll choice still open");
  t.run(me, "IMMEDIATE_ROLL", { choice: "skip" });
  assert.notEqual(t.active(), me);
  assert.equal(t.game.turnNumber, turn + 1);
  assert.equal(t.game.actionPoints, 3);
});

// ---------------------------------------------------------------- Q-06 / Q-07 / Q-12
test("Q-07/Q-12 (Q-06 superseded by E02): target lost before resolve → discard, no AP refund; requirement checked only at ATTACK", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const me = t.active();
  const foe = t.others()[0];
  const mine = t.hero(me, "bad-axe");
  const theirs = t.hero(foe, "kit-napper");
  const item = t.give(me, "hts.base.v1.item.bard-mask");
  assert.equal(t.game.actionPoints, 3);
  const cursed = t.give(me, "hts.base.v1.cursed-item.sealing-key");
  assert.equal(t.run(me, "PLAY_HAND_CARD", { cardInstanceId: cursed.cardId, targets: { heroInstanceIds: [theirs.cardId] } }), "ACCEPTED");
  t.passAll();
  assert.equal(t.seat(foe).party[0].attachments[0]?.cardId, cursed.cardId);
  // Q-07
  assert.equal(t.run(me, "PLAY_HAND_CARD", { cardInstanceId: item.cardId, targets: { heroInstanceIds: [mine.cardId] } }), "ACCEPTED");
  t.seat(me).party.length = 0; // target vanishes while the Challenge window is open
  t.passAll();
  assert.ok(t.game.discard.some((c) => c.cardId === item.cardId));
  assert.equal(t.game.actionPoints, 1, "no AP refund");
  // Q-12
  const t2 = table(["the-cloaked-sage", "the-charismatic-song"]);
  const m2 = t2.active();
  t2.hero(m2, "bad-axe");
  t2.game.faceUpMonsters = [MON("bloodwing")]; // 2 Heroes
  assert.equal(t2.run(m2, "ATTACK_MONSTER", { monsterInstanceId: MON("bloodwing") }), "REQUIREMENT_NOT_MET");
  t2.hero(m2, "peanut");
  t2.dice.push([6, 6]);
  assert.equal(t2.run(m2, "ATTACK_MONSTER", { monsterInstanceId: MON("bloodwing") }), "ACCEPTED");
  t2.seat(m2).party.length = 0; // Party shrinks after the attack was accepted
  t2.passAll();
  assert.equal(t2.seat(m2).slain.length, 1, "requirement is not re-checked after the roll");
});

// ---------------------------------------------------------------- CHALLENGE-SKIP / CHOICE-TIMER
test("CHALLENGE-SKIP: card actor is excluded; only opponents must answer", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"]);
  const actor = t.active();
  const opponent = t.others()[0];
  const hero = t.give(actor, HERO("peanut"));
  assert.equal(t.run(actor, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId }), "ACCEPTED");
  const challenge = t.game.chain!;
  assert.equal(challenge.step, "challenge_window");
  if (challenge.step !== "challenge_window") return;
  assert.equal(Object.hasOwn(challenge.responders, actor), false);
  assert.equal(challenge.responders[opponent], "pending");
  assert.equal(t.run(actor, "REACT_PASS", { windowId: challenge.windowId }), "NOT_ELIGIBLE");
  assert.equal(t.run(opponent, "REACT_PASS", { windowId: challenge.windowId }), "ACCEPTED");
  assert.equal(t.game.chain?.step, "immediate_roll_choice");
});

test("CHALLENGE-SKIP: all opponents passing closes the window immediately", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song", "the-fist-of-reason"], { reactionSeconds: 120 });
  const actor = t.active();
  const opponents = t.others();
  const hero = t.give(actor, HERO("peanut"));
  assert.equal(t.run(actor, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId }), "ACCEPTED");
  const challenge = t.game.chain!;
  assert.equal(challenge.step, "challenge_window");
  if (challenge.step !== "challenge_window") return;
  assert.equal(t.run(opponents[0], "REACT_PASS", { windowId: challenge.windowId }), "ACCEPTED");
  assert.equal(t.game.chain?.step, "challenge_window", "one pending opponent keeps the window open");
  assert.equal(t.run(opponents[1], "REACT_PASS", { windowId: challenge.windowId }), "ACCEPTED");
  assert.equal(t.game.chain?.step, "immediate_roll_choice", "the final Skip advances without waiting for the deadline");
  assert.ok(t.clock.now < challenge.deadlineAt);
});

test("CHOICE-TIMER: reactions use 20s while choices and immediate rolls use 30s", () => {
  const t = table(["the-cloaked-sage", "the-charismatic-song"], { reactionSeconds: 20, choiceSeconds: 30 });
  const actor = t.active();
  const opponent = t.others()[0];
  const hero = t.give(actor, HERO("peanut"));
  assert.equal(t.run(actor, "PLAY_HAND_CARD", { cardInstanceId: hero.cardId }), "ACCEPTED");
  const challenge = t.game.chain!;
  assert.equal(challenge.step, "challenge_window");
  if (challenge.step !== "challenge_window") return;
  assert.equal(challenge.deadlineAt, t.clock.now + 20_000);
  assert.equal(t.run(opponent, "REACT_PASS", { windowId: challenge.windowId }), "ACCEPTED");
  const choice = t.game.chain!;
  assert.equal(choice.step, "immediate_roll_choice");
  if (choice.step !== "immediate_roll_choice") return;
  assert.equal(choice.deadlineAt, t.clock.now + 30_000);
});
