// AUDIT-001 (QA) — randomized full-game simulation of the base engine.
//
// Plays many complete games (2-6 players) with a seeded RNG for shuffle + dice and a
// controlled clock, always choosing a random LEGAL command for whoever must act
// (turn actions, Challenge/Modifier/Skip, immediate roll, pending choices) plus a
// sprinkling of deliberately ILLEGAL probes and deadline (alarm) advances.
// After every transition it asserts the invariants listed in docs/qa/AUDIT-001_REPORT.md.
//
// Reproduce one game:   AUDIT_SEED=1007 node --test --experimental-strip-types apps/worker/tests/audit-fuzz.test.ts
// More games:           AUDIT_GAMES=2000 ...      Verbose trace on failure: AUDIT_TRACE=1
// Machine-readable out: AUDIT_OUT=/path/result.json

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import test from "node:test";

import type { BaseGameCommand, BaseGameSnapshot } from "@here-to-slay/protocol";
import { BASE_CARDS_BY_ID, cardDataOfKind } from "../src/content/base-cards.ts";
import { baseLeaderPool, baseMainDeck, baseMonsterDeck } from "../src/game/base-content.ts";
import {
  applyBaseCommand,
  baseNextDeadline,
  initialBaseGameState,
  projectBaseGame,
  settleBaseGame,
  type BaseGameDeps,
  type BaseGameState,
  type BaseRoster,
} from "../src/game/base-game.ts";
import { meetsRequirement } from "../src/game/base-rules.ts";

// ----------------------------------------------------------------------------
// Known bugs found by this fuzz: seed -> invariant code. They are reported as
// test.todo (see bottom) and tolerated in the run so `npm run verify` stays green.
// ----------------------------------------------------------------------------
const KNOWN_BUGS: Record<number, { code: string; note: string }> = {};

const GAMES = Number(process.env.AUDIT_GAMES ?? 60);
const ONLY_SEED = process.env.AUDIT_SEED ? Number(process.env.AUDIT_SEED) : null;
const TURN_CAP = 400;
const STEP_CAP = 25_000;
const BASE_SEED = 1000;

// ------------------------------------------------------------------ rng
class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  weighted<T>(items: Array<{ w: number; v: T }>): T {
    const total = items.reduce((s, i) => s + i.w, 0);
    let r = this.next() * total;
    for (const item of items) {
      r -= item.w;
      if (r <= 0) return item.v;
    }
    return items[items.length - 1].v;
  }
}

// ------------------------------------------------------------------ types
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Violation {
  code: string;
  detail: string;
}
export interface GameResult {
  seed: number;
  players: number;
  outcome: "slay_3" | "six_classes" | "turn_cap" | "violation" | "step_cap";
  turns: number;
  steps: number;
  violation?: Violation & { stepIndex: number; trace: string[] };
  settings: Any;
  stats: Record<string, number>;
}

class InvariantError extends Error {
  code: string;
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

const MAIN_TOTAL = baseMainDeck().length; // 115
const MONSTER_TOTAL = baseMonsterDeck().length; // 15
const CLASSES = ["bard", "fighter", "guardian", "ranger", "thief", "wizard"];

function maskClassOf(definitionId: string): string | null {
  const data = BASE_CARDS_BY_ID.get(definitionId) as Any;
  return data?.maskClass ?? null;
}

/** Independent class computation (does not use base-rules.ts). */
function independentClasses(game: BaseGameState, playerId: string): Set<string> {
  const seat = game.seats.find((s) => s.playerId === playerId)!;
  const set = new Set<string>();
  const leader = seat.leaderId ? (BASE_CARDS_BY_ID.get(seat.leaderId) as Any)?.heroClass : null;
  if (leader) set.add(leader);
  for (const entry of seat.party) {
    const own = (BASE_CARDS_BY_ID.get(entry.card.definitionId) as Any).heroClass as string;
    const mask = entry.item ? maskClassOf(entry.item.definitionId) : null;
    if (mask && game.settings.maskMode === "replace") set.add(mask);
    else {
      set.add(own);
      if (mask) set.add(mask);
    }
  }
  return set;
}

function rollTotalsIndependent(roll: Any): { total: number; challenger?: number } {
  const sum = (d: number[]) => d[0] + d[1];
  const side = (entry: Any, s: string) => roll.kind !== "challenge" || entry.side === s;
  if (roll.kind === "challenge") {
    const add = (s: string) =>
      roll.modifiers.filter((e: Any) => side(e, s)).reduce((a: number, e: Any) => a + e.value, 0) +
      roll.passives.filter((e: Any) => side(e, s)).reduce((a: number, e: Any) => a + e.value, 0);
    return { total: sum(roll.dice) + add("defender"), challenger: sum(roll.challengerDice) + add("challenger") };
  }
  return {
    total:
      sum(roll.dice) +
      roll.modifiers.reduce((a: number, e: Any) => a + e.value, 0) +
      roll.passives.reduce((a: number, e: Any) => a + e.value, 0),
  };
}

const cmpOp = (op: "gte" | "lte", value: number, n: number) => (op === "gte" ? n >= value : n <= value);

// ------------------------------------------------------------------ one game
function playGame(seed: number, nPlayers: number): GameResult {
  const rng = new Rng(seed);
  const dice = new Rng(seed ^ 0x9e3779b9);
  const shuf = new Rng(seed ^ 0x85ebca6b);
  // play style: slayers go for Monsters, builders for 6 classes (so both win paths are exercised)
  const style = rng.pick(['slayer', 'builder', 'builder', 'mixed'] as const);
  const playerIds = Array.from({ length: nPlayers }, (_, i) => `p${i + 1}`);
  const roster: BaseRoster = { hostPlayerId: "p1", players: playerIds.map((playerId) => ({ playerId, nickname: playerId.toUpperCase() })) };
  const game: BaseGameState = initialBaseGameState();
  const clock = { now: 1_700_000_000_000 };
  let idSeq = 0;
  const deps: BaseGameDeps = {
    newId: () => `id-${++idSeq}`,
    shuffle: (ids) => shuf.shuffle(ids),
    rollDice: () => [1 + dice.int(6), 1 + dice.int(6)] as const,
    now: () => clock.now,
  };

  const stats: Record<string, number> = {};
  const bump = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);
  const trace: string[] = [];
  let revision = 0;
  let cmdSeq = 0;
  let steps = 0;
  const result: GameResult = { seed, players: nPlayers, outcome: "turn_cap", turns: 0, steps: 0, settings: null, stats };

  // ---- tracking state for cross-transition invariants
  interface Prev {
    phase: string;
    active: string | null;
    ap: number | null;
    turnId: string | null;
    chain: Any;
    /** live reference: the roll object is mutated in place by the closing command (last Modifier) */
    chainLive: Any;
    discardIds: Set<string>;
    slainCount: Map<string, number>;
    monsterDeck: string[];
    turnNumber: number;
    pendingOf: Record<string, string[]>; // modifier window pending responders
    classesOfActive: number;
  }
  let prev: Prev | null = null;
  const windowDeadline = new Map<string, number>();
  const rollsThisTurn = new Set<string>();
  const challengeRollsPerAttempt = new WeakMap<object, number>();
  let initialMonsterIds: Set<string> | null = null;

  const fail = (code: string, detail: string): never => {
    throw new InvariantError(code, detail);
  };

  function zonesOf(g: BaseGameState): Map<string, string> {
    const zones = new Map<string, string>();
    const put = (id: string, zone: string) => {
      if (zones.has(id)) fail("DUP_CARD", `${id} in ${zones.get(id)} and ${zone}`);
      zones.set(id, zone);
    };
    for (const c of g.mainDeck) put(c.cardId, "deck");
    for (const c of g.discard) put(c.cardId, "discard");
    for (const s of g.seats) {
      for (const c of s.hand) put(c.cardId, `hand:${s.playerId}`);
      for (const h of s.party) {
        put(h.card.cardId, `party:${s.playerId}`);
        if (h.item) put(h.item.cardId, `item:${s.playerId}`);
      }
      for (const m of s.slain) put(m, `slain:${s.playerId}`);
    }
    for (const m of g.monsterDeck) put(m, "monsterDeck");
    for (const m of g.faceUpMonsters) put(m, "faceUp");
    const chain = g.chain as Any;
    if (chain?.step === "challenge_window") put(chain.attempt.card.cardId, "limbo:attempt");
    if (chain?.step === "modifier_window" && chain.roll.kind === "challenge") put(chain.roll.attempt.card.cardId, "limbo:attempt");
    for (const step of g.queue as Any[]) if (step.op === "discard_card") put(step.card.cardId, "limbo:magic");
    return zones;
  }

  function summarize(g: BaseGameState): Prev {
    const active = g.phase === "turn_active" ? g.turnOrder[g.currentPlayerIndex] : null;
    const chain = g.chain ? structuredClone(g.chain) : null;
    const pendingOf: Record<string, string[]> = {};
    return {
      phase: g.phase,
      active,
      ap: g.actionPoints,
      turnId: g.turnId,
      chain,
      chainLive: g.chain,
      discardIds: new Set(g.discard.map((c) => c.cardId)),
      slainCount: new Map(g.seats.map((s) => [s.playerId, s.slain.length])),
      monsterDeck: [...g.monsterDeck],
      turnNumber: g.turnNumber,
      pendingOf,
      classesOfActive: active ? independentClasses(g, active).size : 0,
    };
  }

  const project = (viewer: string, rev = revision): BaseGameSnapshot =>
    projectBaseGame(game, roster, { roomCode: "AUDIT1", revision: rev, serverNow: clock.now }, viewer);

  // ---- invariants run after EVERY transition (command or settle)
  function checkInvariants(label: string, cmdPlayer: string | null, cmdKind: string | null, deepProjection: boolean): void {
    const g = game;
    // --- conservation
    const zones = zonesOf(g);
    if (g.phase !== "lobby" && g.phase !== "leader_selection") {
      let main = 0;
      let mon = 0;
      for (const id of zones.keys()) (id.includes(".monster.") ? mon++ : main++);
      if (main !== MAIN_TOTAL) fail("CONSERVATION", `main-deck cards total ${main}, expected ${MAIN_TOTAL} (${label})`);
      if (mon !== MONSTER_TOTAL) fail("MONSTER_CONSERVATION", `monster cards total ${mon}, expected ${MONSTER_TOTAL} (${label})`);
      if (!initialMonsterIds) initialMonsterIds = new Set([...zones.keys()].filter((id) => id.includes(".monster.")));
      if (g.faceUpMonsters.length > 3) fail("FACEUP_GT3", `${g.faceUpMonsters.length} face-up monsters`);
      if (prev && prev.phase !== "lobby" && prev.phase !== "leader_selection") {
        if (g.monsterDeck.length > prev.monsterDeck.length) fail("MONSTER_DECK_GREW", `${prev.monsterDeck.length} -> ${g.monsterDeck.length}`);
        const prevSet = new Set(prev.monsterDeck);
        for (const id of g.monsterDeck) if (!prevSet.has(id)) fail("MONSTER_DECK_REFILLED", `${id} appeared in monster deck`);
      }
      // faceUp refills only from deck: if deck empty, faceUp can only shrink
      if (g.monsterDeck.length === 0 && prev && g.faceUpMonsters.length > 3) fail("FACEUP_GT3", "after empty deck");
    }

    // --- AP
    if (g.phase === "turn_active") {
      const ap = g.actionPoints;
      if (ap === null || !Number.isInteger(ap)) fail("AP_RANGE", `ap=${ap}`);
      const activeSeat = g.seats.find((s) => s.playerId === g.turnOrder[g.currentPlayerIndex])!;
      const megaSlime = activeSeat.slain.some((m) => m.startsWith("hts.base.v1.monster.mega-slime#"));
      const max = 3 + (megaSlime ? 1 : 0);
      if (ap! < 0) fail("AP_NEGATIVE", `ap=${ap}`);
      if (ap! > max) fail("AP_GT_MAX", `ap=${ap} max=${max}`);
      const busy = g.chain !== null || g.queue.length > 0;
      if (!busy && ap! <= 0) fail("AUTO_END_MISSED", `turn_active, nothing pending, ap=${ap}`);
      if (prev && prev.phase === "turn_active" && prev.turnId !== g.turnId) {
        // new turn
        if (ap !== max) fail("AP_NOT_RESET", `new turn ap=${ap}, expected ${max}`);
        if (g.heroRollsUsed.length !== 0) fail("ROLLS_NOT_RESET", `heroRollsUsed=${g.heroRollsUsed}`);
        const expectedNext = g.turnOrder[(g.turnOrder.indexOf(prev.active!) + 1) % g.turnOrder.length];
        if (g.turnOrder[g.currentPlayerIndex] !== expectedNext) fail("TURN_ORDER", `expected ${expectedNext}, got ${g.turnOrder[g.currentPlayerIndex]}`);
        const endClasses = independentClasses(g, prev.active!).size; // party is unchanged by advancing the turn
        if (endClasses >= 6) fail("WIN_MISSED_CLASS", `${prev.active} ended turn with ${endClasses} classes and did not win`);
        rollsThisTurn.clear();
      } else if (prev && prev.phase === "turn_active" && prev.turnId === g.turnId) {
        if (prev.active !== g.turnOrder[g.currentPlayerIndex]) fail("ACTIVE_CHANGED_SAME_TURN", "");
        if (g.actionPoints! > prev.ap!) fail("AP_INCREASED", `${prev.ap} -> ${g.actionPoints} in same turn`);
        if (g.actionPoints! < prev.ap! && cmdPlayer !== prev.active) fail("AP_SPENT_BY_NON_ACTIVE", `${cmdPlayer} ${cmdKind}: ${prev.ap}->${g.actionPoints}`);
      }
      if (new Set(g.heroRollsUsed).size !== g.heroRollsUsed.length) fail("HERO_ROLL_TWICE", `heroRollsUsed=${g.heroRollsUsed}`);
      for (const s of g.seats) if (s.slain.length >= 3) fail("WIN_MISSED_SLAY", `${s.playerId} has ${s.slain.length} slain and the game continues`);
    } else if (g.phase === "game_over") {
      if (g.actionPoints !== null && false) fail("", "");
    }

    // --- chain / windows
    const chain = g.chain as Any;
    if (chain) {
      if (g.phase !== "turn_active") fail("CHAIN_AFTER_GAME_OVER", `phase=${g.phase}`);
      const dl = baseNextDeadline(g);
      if (dl === null || !Number.isFinite(dl)) fail("DEADLOCK_NO_DEADLINE", `chain ${chain.step} has no deadline`);
      const key = chain.step === "choice" ? `c:${chain.choice.choiceId}` : chain.step === "immediate_roll_choice" ? `i:${chain.heroCardId}:${g.turnId}` : `w:${chain.windowId}`;
      const deadline = chain.step === "choice" ? chain.choice.deadlineAt : chain.deadlineAt;
      const seen = windowDeadline.get(key);
      if (seen === undefined) {
        const secs = chain.step === "challenge_window" || chain.step === "modifier_window" ? g.settings.reactionSeconds : g.settings.choiceSeconds;
        if (deadline !== clock.now + secs * 1000) fail("DEADLINE_WRONG", `${key} deadline ${deadline - clock.now}ms from creation, expected ${secs * 1000}`);
        windowDeadline.set(key, deadline);
      } else if (seen !== deadline) fail("DEADLINE_RESET", `${key} deadline moved ${seen} -> ${deadline}`);

      if (chain.step === "challenge_window") {
        const kind = chain.attempt.card.kind;
        if (!["hero", "item", "cursed_item", "magic"].includes(kind)) fail("CHALLENGE_ON_WRONG_KIND", kind);
        if (!Object.values(chain.responders).includes("pending")) fail("WINDOW_OPEN_NO_PENDING", "challenge");
        if (chain.attempt.actorId in chain.responders) fail("ACTOR_CAN_CHALLENGE", "");
      }
      if (chain.step === "modifier_window") {
        if (!Object.values(chain.responders).includes("pending")) fail("WINDOW_OPEN_NO_PENDING", "modifier");
        const per: Record<string, number> = {};
        for (const m of chain.roll.modifiers) per[m.playerId] = (per[m.playerId] ?? 0) + 1;
        for (const [pid, n] of Object.entries(per)) if (n > 1) fail("MODIFIER_TWICE", `${pid} played ${n} modifiers in one window`);
        const roll = chain.roll;
        for (const d of roll.dice) if (d < 1 || d > 6) fail("DICE_RANGE", `${d}`);
        if (roll.kind === "hero_effect") {
          const k = `${g.turnId}|${roll.heroCardId}`;
          if (!windowDeadline.has(`rollseen:${chain.windowId}`)) {
            windowDeadline.set(`rollseen:${chain.windowId}`, 1);
            if (rollsThisTurn.has(k)) fail("HERO_ROLL_TWICE", `${roll.heroCardId} rolled twice in turn ${g.turnId}`);
            rollsThisTurn.add(k);
            if (roll.rollerId !== g.turnOrder[g.currentPlayerIndex]) fail("HERO_ROLL_NOT_ACTIVE", "");
          }
        }
        if (roll.kind === "challenge") {
          const n = (challengeRollsPerAttempt.get(roll.attempt) ?? 0) + (windowDeadline.has(`rollseen:${chain.windowId}`) ? 0 : 1);
          if (!windowDeadline.has(`rollseen:${chain.windowId}`)) windowDeadline.set(`rollseen:${chain.windowId}`, 1);
          challengeRollsPerAttempt.set(roll.attempt, n);
          if (n > 1) fail("TWO_CHALLENGES_ONE_CARD", roll.attempt.card.cardId);
          if (roll.challengerId === roll.attempt.actorId) fail("SELF_CHALLENGE", "");
        }
      }
    }

    // --- transitions of windows -> outcomes
    if (prev?.chain?.step === "modifier_window") {
      const pc = prev.chain;
      const stillSame = g.chain && (g.chain as Any).step === "modifier_window" && (g.chain as Any).windowId === pc.windowId;
      if (!stillSame && g.phase !== "lobby") {
        const pend = Object.entries(pc.responders).filter(([, st]) => st === "pending").map(([pid]) => pid);
        const earlyByCommand = cmdKind === "REACT_PASS" || cmdKind === "REACT_MODIFIER";
        if (earlyByCommand && pend.some((pid) => pid !== cmdPlayer)) fail("MODIFIER_WINDOW_CLOSED_EARLY", `pending ${pend} but closed after ${cmdPlayer} ${cmdKind}`);
        const totals = rollTotalsIndependent(prev.chainLive.roll);
        const zonesNow = zones;
        if (pc.roll.kind === "challenge") {
          const id = pc.roll.attempt.card.cardId;
          const zone = zonesNow.get(id) ?? "(gone)";
          if (totals.challenger! >= totals.total) {
            if (!(zone === "discard" || zone === "deck")) fail("CHALLENGE_TIE_OR_WIN_NOT_DISCARDED", `challenger ${totals.challenger} >= defender ${totals.total} but ${id} is in ${zone}`);
          } else if (pc.roll.attempt.card.kind === "hero" && !zone.startsWith("party:") && g.phase === "turn_active") {
            fail("CHALLENGE_LOST_HERO_NOT_IN_PARTY", `defender ${totals.total} > challenger ${totals.challenger} but ${id} is in ${zone}`);
          }
        } else if (pc.roll.kind === "attack") {
          const data = cardDataOfKind(pc.roll.monsterId.replace(/#.*/, ""), "monster")!;
          const slay = cmpOp(data.slay.op, data.slay.value, totals.total);
          const zone = zonesNow.get(pc.roll.monsterId);
          if (slay && zone !== `slain:${pc.roll.rollerId}`) fail("ATTACK_SLAY_NOT_APPLIED", `${pc.roll.monsterId} total ${totals.total} (slay ${data.slay.op} ${data.slay.value}) is in ${zone}`);
          if (!slay && zone !== "faceUp") fail("ATTACK_NOT_SLAIN_BUT_MOVED", `${pc.roll.monsterId} total ${totals.total} is in ${zone}`);
          if (slay) bump("slays");
          else bump(cmpOp(data.penaltyRange.op, data.penaltyRange.value, totals.total) ? "penalties" : "attackNothing");
          if (slay && g.phase === "game_over" && g.winReason !== "slay_3" && g.winReason !== "six_classes") fail("WIN_REASON", String(g.winReason));
        }
      }
    }

    // --- game over
    if (g.phase === "game_over") {
      if (!g.winnerPlayerId || !g.winReason) fail("WIN_FIELDS", "game_over without winner/reason");
      if (!prev || prev.phase !== "game_over") {
        if (prev?.phase !== "turn_active") fail("WIN_FROM_WRONG_PHASE", String(prev?.phase));
        if (g.winnerPlayerId !== prev.active) fail("WIN_NOT_ACTIVE_PLAYER", `winner ${g.winnerPlayerId}, active was ${prev.active}`);
        if (g.winReason === "slay_3") {
          const w = g.seats.find((s) => s.playerId === g.winnerPlayerId)!;
          if (w.slain.length < 3) fail("WIN_BAD_SLAY", `winner has ${w.slain.length} slain`);
          if (prev.chain?.step !== "modifier_window" || prev.chain.roll.kind !== "attack") fail("WIN_SLAY_NOT_FROM_ATTACK_ROLL", String(prev.chain?.step));
          if (prev.slainCount.get(g.winnerPlayerId) !== 2) fail("WIN_SLAY_COUNT_JUMP", `${prev.slainCount.get(g.winnerPlayerId)} -> ${w.slain.length}`);
          // Q-03: every responder completed (or deadline reached) before the slay resolved.
          const pend = Object.entries(prev.chain.responders).filter(([, st]) => st === "pending").map(([p]) => p);
          const byDeadline = clock.now >= prev.chain.deadlineAt;
          if (pend.some((p) => p !== cmdPlayer) && !byDeadline) fail("WIN_SLAY_BEFORE_REACTIONS_RESOLVED", `pending ${pend}`);
        } else {
          const n = independentClasses(g, g.winnerPlayerId).size;
          if (n < 6) fail("WIN_BAD_CLASS", `winner has ${n} distinct classes`);
        }
        if (g.chain !== null || g.queue.length !== 0) fail("GAME_OVER_NOT_FROZEN", "chain/queue not cleared");
        // nobody else changed turn: AP/currentPlayer frozen
      }
      if (g.winnerPlayerId && !g.seats.some((s) => s.playerId === g.winnerPlayerId)) fail("WIN_UNKNOWN_PLAYER", "");
      if (baseNextDeadline(g) !== null) fail("GAME_OVER_HAS_DEADLINE", "");
    }

    // --- projection / privacy
    const viewers = deepProjection ? playerIds : [cmdPlayer && playerIds.includes(cmdPlayer) ? cmdPlayer : rng.pick(playerIds), rng.pick(playerIds)];
    if (g.phase !== "lobby") {
      const deckIds = new Set<string>([...g.mainDeck.map((c) => c.cardId), ...g.monsterDeck]);
      for (const viewer of new Set(viewers)) {
        const snap = project(viewer);
        const text = JSON.stringify(snap);
        if (/token|sessionToken|tokenHash/i.test(Object.keys(snap).join(" ") + Object.keys(snap.you).join(" "))) fail("LEAK_TOKEN_KEY", "");
        if (/"(sessionToken|tokenHash|token)"\s*:/.test(text)) fail("LEAK_TOKEN", viewer);
        const idsInSnap = new Set<string>();
        for (const m of text.matchAll(/"(hts\.base\.v1\.[a-z-]+\.[a-z0-9-]+#\d+)"/g)) idsInSnap.add(m[1]);
        const allowed = new Set<string>();
        const sc = snap.game.chain as Any;
        if (sc?.step === "choice" && sc.playerId === viewer && ["take_from_top", "view_hand", "take_from_hand", "order_top"].includes(sc.kind)) {
          for (const o of sc.options ?? []) allowed.add(o.cardId);
        }
        const forbidden = new Set<string>(deckIds);
        for (const s of g.seats) if (s.playerId !== viewer) for (const c of s.hand) forbidden.add(c.cardId);
        for (const id of idsInSnap) if (forbidden.has(id) && !allowed.has(id)) fail("LEAK_HIDDEN_CARD", `viewer ${viewer} sees ${id} (${zones.get(id)})`);
        // handCount correctness + own hand
        for (const pl of snap.players) {
          const s = g.seats.find((x) => x.playerId === pl.playerId)!;
          if (pl.handCount !== s.hand.length) fail("HANDCOUNT_MISMATCH", pl.playerId);
          if ("hand" in (pl as object)) fail("LEAK_HAND_FIELD", pl.playerId);
        }
        const mine = g.seats.find((x) => x.playerId === viewer)!;
        if (snap.yourHand.map((c) => c.cardId).join() !== mine.hand.map((c) => c.cardId).join()) fail("YOURHAND_MISMATCH", viewer);
        if (snap.game.mainDeckCount !== g.mainDeck.length) fail("DECKCOUNT_MISMATCH", "");
        // deck order must not be derivable: only counts
        if ("mainDeck" in (snap.game as object) || "monsterDeck" in (snap.game as object)) fail("LEAK_DECK_FIELD", "");
      }
    }
    prev = summarize(g);
  }

  // ---- command plumbing, mirrors the Durable Object: settle first, then apply
  let curKey: string | null = null; // cached JSON of the game between transitions (perf)
  function doSettle(label: string): boolean {
    const dl = baseNextDeadline(game);
    if (dl === null || clock.now < dl) {
      // nothing is due: settle must be a no-op
      if (settleBaseGame(game, roster, deps)) fail("SETTLE_CHANGED_BEFORE_DEADLINE", `now=${clock.now} deadline=${dl}`);
      return false;
    }
    const before = curKey ?? JSON.stringify(game);
    const changed = settleBaseGame(game, roster, deps);
    const after = JSON.stringify(game);
    curKey = after;
    if (changed !== (before !== after)) fail("SETTLE_RETURN_MISMATCH", `returned ${changed}, state changed=${before !== after}`);
    if (changed) {
      revision += 1;
      bump("settles");
      trace.push(`[t=${clock.now - 1_700_000_000_000}] SETTLE -> rev ${revision}`);
      checkInvariants(label, null, "SETTLE", false);
    }
    return changed;
  }

  function send(playerId: string, kind: string, payload: Record<string, unknown>, opts: { expectReject?: boolean; deep?: boolean } = {}): string {
    steps += 1;
    doSettle("pre-command settle");
    const before = curKey ?? JSON.stringify(game);
    const command = { commandId: `c${++cmdSeq}`, expectedRevision: revision, kind, payload } as unknown as BaseGameCommand;
    const code = applyBaseCommand(game, roster, playerId, command, deps);
    const after = JSON.stringify(game);
    curKey = after;
    trace.push(`${playerId} ${kind} ${JSON.stringify(payload).slice(0, 160)} => ${code}`);
    bump(`code:${code}`);
    if (code === "ACCEPTED") {
      if (opts.expectReject) fail("ILLEGAL_COMMAND_ACCEPTED", `${playerId} ${kind} ${JSON.stringify(payload)}`);
      if (before === after) fail("ACCEPTED_NO_STATE_CHANGE", `${playerId} ${kind}`);
      const revBefore = revision;
      revision += 1;
      if (!(revision > revBefore)) fail("REVISION_NOT_INCREASING", "");
    } else if (before !== after) {
      fail("REJECTED_MUTATED_STATE", `${playerId} ${kind} -> ${code}`);
    }
    checkInvariants(`${kind}:${code}`, playerId, kind, opts.deep ?? false);
    return code;
  }

  function advanceClock(ms: number): void {
    clock.now += ms;
    doSettle("alarm");
  }

  // ---------------------------------------------------------------- targets
  const heroIdsOf = (pid: string) => game.seats.find((s) => s.playerId === pid)!.party.map((h) => h.card.cardId);
  const othersOf = (pid: string) => game.seats.filter((s) => s.playerId !== pid);
  function genTargets(rule: string, actor: string): Any | null {
    const other = othersOf(actor).flatMap((s) => s.party.map((h) => h.card.cardId));
    const own = heroIdsOf(actor);
    switch (rule) {
      case "none":
        return {};
      case "other_player":
        return { playerId: rng.pick(othersOf(actor)).playerId };
      case "hero_other_party":
        return other.length ? { heroInstanceIds: [rng.pick(other)] } : null;
      case "two_heroes_other_party":
        return other.length >= 2 ? { heroInstanceIds: rng.shuffle(other).slice(0, 2) } : null;
      case "hero_other_party_and_own_hero":
        return other.length && own.length ? { heroInstanceIds: [rng.pick(other), rng.pick(own)] } : null;
      case "own_hero":
        return own.length ? { heroInstanceIds: [rng.pick(own)] } : null;
      case "own_hero_with_cursed_item": {
        const ok = game.seats.find((s) => s.playerId === actor)!.party.filter((h) => h.item?.kind === "cursed_item");
        return ok.length ? { heroInstanceIds: [rng.pick(ok).card.cardId] } : null;
      }
      case "any_hero_with_item": {
        const ok = game.seats.flatMap((s) => s.party.filter((h) => h.item));
        return ok.length ? { heroInstanceIds: [rng.pick(ok).card.cardId] } : null;
      }
    }
    return null;
  }
  function playTargets(card: { kind: string; definitionId: string }, actor: string): Any | null {
    if (card.kind === "hero") return {};
    if (card.kind === "item") {
      const ok = game.seats.find((s) => s.playerId === actor)!.party.filter((h) => !h.item);
      return ok.length ? { heroInstanceIds: [rng.pick(ok).card.cardId] } : null;
    }
    if (card.kind === "cursed_item") {
      const ok = game.seats.flatMap((s) => s.party.filter((h) => !h.item));
      return ok.length ? { heroInstanceIds: [rng.pick(ok).card.cardId] } : null;
    }
    if (card.kind === "magic") return genTargets(cardDataOfKind(card.definitionId, "magic")!.target, actor);
    return null;
  }

  // ---------------------------------------------------------------- setup
  // applyBaseCommand mirrors the roster (names, and seats while in the lobby) even on rejection.
  const stateKey = (): string => JSON.stringify(game, (k, v) => (k === "names" || (k === "seats" && game.phase === "lobby") ? undefined : v));
  const send0 = (pid: string, kind: string, payload: Record<string, unknown> = {}) => {
    const before = stateKey();
    const code = applyBaseCommand(game, roster, pid, { commandId: `c${++cmdSeq}`, expectedRevision: revision, kind, payload } as unknown as BaseGameCommand, deps);
    trace.push(`${pid} ${kind} ${JSON.stringify(payload).slice(0, 100)} => ${code}`);
    if (code !== "ACCEPTED" && before !== stateKey()) fail("REJECTED_MUTATED_STATE", `setup ${kind} ${code}`);
    if (code === "ACCEPTED") revision += 1;
    return code;
  };
  try {
    // host-only settings
    if (rng.chance(0.5)) {
      if (send0("p2", "CONFIGURE_GAME", { reactionSeconds: 30 }) === "ACCEPTED") fail("NONHOST_CONFIGURE_ACCEPTED", "");
      const cfg: Record<string, unknown> = {};
      if (rng.chance(0.5)) cfg.reactionSeconds = 5 + rng.int(40);
      if (rng.chance(0.5)) cfg.choiceSeconds = 10 + rng.int(40);
      if (rng.chance(0.5)) cfg.leaderFillsClassSlot = rng.chance(0.5);
      if (rng.chance(0.5)) cfg.maskMode = rng.pick(["add", "replace"]);
      if (rng.chance(0.15)) cfg.leaderPassiveUsesModifierSlot = true;
      if (Object.keys(cfg).length) send0("p1", "CONFIGURE_GAME", cfg);
    }
    if (send0("p1", "START_GAME") === "ACCEPTED") fail("START_BEFORE_SELECTION", "");
    if (send0("p1", "BEGIN_LEADER_SELECTION") !== "ACCEPTED") fail("SETUP_FAILED", "begin");
    if (send0("p2", "BEGIN_LEADER_SELECTION") === "ACCEPTED") fail("SETUP_FAILED", "begin twice");
    const pool = baseLeaderPool();
    const shadow = pool.find((l) => l.endsWith("the-shadow-claw"))!;
    const order = [...playerIds];
    for (let i = 0; i < order.length; i += 1) {
      const pid = order[i];
      if (send0(playerIds[(i + 1) % playerIds.length] === pid ? "p1" : playerIds[(i + 1) % playerIds.length], "SELECT_PARTY_LEADER", { leaderId: pool[0] }) === "ACCEPTED") fail("OUT_OF_TURN_LEADER_ACCEPTED", "");
      if (i === 0 && nPlayers === 2) {
        if (send0(pid, "SELECT_PARTY_LEADER", { leaderId: shadow }) !== "LEADER_NOT_AVAILABLE") fail("SHADOW_CLAW_ALLOWED_IN_2P", "");
      }
      const taken = new Set(game.seats.map((s) => s.leaderId));
      const choices = pool.filter((l) => !taken.has(l) && !(nPlayers === 2 && l === shadow));
      const pickLeader = rng.pick(choices);
      if (send0(pid, "SELECT_PARTY_LEADER", { leaderId: pickLeader }) !== "ACCEPTED") fail("SETUP_FAILED", `select ${pickLeader}`);
      if (i === 0 && send0(pid === "p1" ? "p2" : "p1", "SELECT_PARTY_LEADER", { leaderId: pickLeader }) === "ACCEPTED") fail("LEADER_DUP_ACCEPTED", "");
    }
    if (send0("p2", "START_GAME") === "ACCEPTED") fail("NONHOST_START_ACCEPTED", "");
    if (send0("p1", "START_GAME") !== "ACCEPTED") fail("SETUP_FAILED", "start");
    curKey = null;
    result.settings = { ...game.settings, style };
    checkInvariants("start", "p1", "START_GAME", true);
    for (const s of game.seats) if (s.hand.length !== 5) fail("DEAL_SIZE", `${s.playerId} has ${s.hand.length}`);
    if (game.faceUpMonsters.length !== 3 || game.monsterDeck.length !== 12) fail("MONSTER_SETUP", `${game.faceUpMonsters.length}/${game.monsterDeck.length}`);
    if (game.mainDeck.length !== MAIN_TOTAL - 5 * nPlayers) fail("DECK_SETUP", `${game.mainDeck.length}`);
    if (game.turnOrder[game.currentPlayerIndex] !== playerIds[nPlayers - 1]) fail("FIRST_PLAYER", `expected last selector ${playerIds[nPlayers - 1]}, got ${game.turnOrder[game.currentPlayerIndex]}`);
    if (game.actionPoints !== 3) fail("START_AP", `${game.actionPoints}`);

    // ------------------------------------------------------------- main loop
    while (game.phase === "turn_active") {
      if (game.turnNumber > TURN_CAP) {
        result.outcome = "turn_cap";
        break;
      }
      if (steps > STEP_CAP) {
        result.outcome = "step_cap";
        fail("LIVELOCK", `steps>${STEP_CAP}`);
      }
      const active = game.turnOrder[game.currentPlayerIndex];
      // illegal probes
      if (rng.chance(0.07)) {
        probe(active);
        if (game.phase !== "turn_active") break;
      }
      // spontaneous time passing / alarm
      if (game.chain && rng.chance(0.035)) {
        const dl = baseNextDeadline(game)!;
        advanceClock(Math.max(0, dl - clock.now) + rng.int(300));
        bump("timeouts");
        continue;
      }
      if (rng.chance(0.2)) advanceClock(rng.int(1500));
      if (game.phase !== "turn_active") break;
      stepOnce(active);
    }
    if (game.phase === "game_over") {
      result.outcome = game.winReason!;
      postGameChecks();
    }
    result.turns = game.turnNumber;
    result.steps = steps;
  } catch (error) {
    const stepIndex = steps;
    if (error instanceof InvariantError) {
      result.outcome = "violation";
      result.violation = { code: error.code, detail: error.message, stepIndex, trace: trace.slice(-30) };
    } else {
      result.outcome = "violation";
      result.violation = { code: "EXCEPTION", detail: String((error as Error).stack ?? error).slice(0, 1200), stepIndex, trace: trace.slice(-30) };
    }
    result.turns = game.turnNumber;
    result.steps = steps;
  }
  return result;

  // ---------------------------------------------------------------- after the game
  function postGameChecks(): void {
    const frozen = JSON.stringify(game);
    const pid = rng.pick(playerIds);
    const probes: Array<[string, string, Record<string, unknown>]> = [
      [game.winnerPlayerId!, "DRAW_CARD", {}],
      [game.winnerPlayerId!, "END_TURN", {}],
      [pid, "REDRAW_HAND", {}],
      [pid, "REACT_PASS", { windowId: "x" }],
      [pid, "RESOLVE_CHOICE", { choiceId: "x", cardInstanceIds: [] }],
      [pid, "ATTACK_MONSTER", { monsterInstanceId: "hts.base.v1.monster.terratuga#01" }],
      ["p1", "BEGIN_LEADER_SELECTION", {}],
      ["p1", "START_GAME", {}],
      [pid, "IMMEDIATE_ROLL", { choice: "skip" }],
    ];
    for (const [p, kind, payload] of probes) {
      const code = applyBaseCommand(game, roster, p, { commandId: `post${++cmdSeq}`, expectedRevision: revision, kind, payload } as unknown as BaseGameCommand, deps);
      if (code !== "GAME_OVER") fail("POST_GAME_COMMAND_NOT_REJECTED", `${p} ${kind} => ${code}`);
    }
    clock.now += 10 * 60_000;
    if (settleBaseGame(game, roster, deps)) fail("POST_GAME_SETTLE_CHANGED", "");
    if (JSON.stringify(game) !== frozen) fail("POST_GAME_STATE_CHANGED", "");
    for (const p of playerIds) {
      const snap = project(p);
      if (snap.game.winnerPlayerId !== game.winnerPlayerId || snap.game.currentPlayerId !== null) fail("POST_GAME_PROJECTION", "");
    }
  }

  // ---------------------------------------------------------------- illegal probes
  function probe(active: string): void {
    bump("probes");
    const others = playerIds.filter((p) => p !== active);
    const chain = game.chain as Any;
    const choice = rng.int(7);
    const hand0 = game.seats.find((s) => s.playerId === active)!.hand[0];
    switch (choice) {
      case 0:
        send(rng.pick(others), rng.pick(["DRAW_CARD", "REDRAW_HAND", "END_TURN"]), {}, { expectReject: true });
        return;
      case 1:
        if (hand0) send(rng.pick(others), "PLAY_HAND_CARD", { cardInstanceId: hand0.cardId, targets: {} }, { expectReject: true });
        return;
      case 2:
        send(rng.pick(others), "ATTACK_MONSTER", { monsterInstanceId: game.faceUpMonsters[0] ?? "x" }, { expectReject: true });
        return;
      case 3: {
        // modifier / challenge cards are reactions only
        const card = game.seats.find((s) => s.playerId === active)!.hand.find((c) => c.kind === "modifier" || c.kind === "challenge");
        if (card && !chain) send(active, "PLAY_HAND_CARD", { cardInstanceId: card.cardId, targets: {} }, { expectReject: true });
        return;
      }
      case 4:
        if (chain) send(active, rng.pick(["DRAW_CARD", "END_TURN", "REDRAW_HAND"]), {}, { expectReject: true });
        return;
      case 5:
        if (chain && (chain.step === "challenge_window" || chain.step === "modifier_window")) {
          send(rng.pick(playerIds), "REACT_PASS", { windowId: "stale-window" }, { expectReject: true });
          // already-responded repeat
          const done = Object.entries(chain.responders).find(([, st]) => st !== "pending");
          if (done) send(done[0], "REACT_PASS", { windowId: chain.windowId }, { expectReject: true });
          if (chain.step === "challenge_window") {
            const card = game.seats.find((s) => s.playerId === chain.attempt.actorId)!.hand.find((c) => c.kind === "challenge");
            if (card) send(chain.attempt.actorId, "REACT_CHALLENGE", { windowId: chain.windowId, cardInstanceId: card.cardId }, { expectReject: true });
            const nonChallenge = game.seats.find((s) => s.playerId !== chain.attempt.actorId)!;
            const wrong = nonChallenge.hand.find((c) => c.kind !== "challenge");
            if (wrong) send(nonChallenge.playerId, "REACT_CHALLENGE", { windowId: chain.windowId, cardInstanceId: wrong.cardId }, { expectReject: true });
          }
        }
        return;
      default:
        if (chain?.step === "choice") {
          send(chain.choice.playerId, "RESOLVE_CHOICE", { choiceId: "stale", cardInstanceIds: [] }, { expectReject: true });
          const wrongPlayer = playerIds.find((p) => p !== chain.choice.playerId)!;
          send(wrongPlayer, "RESOLVE_CHOICE", { choiceId: chain.choice.choiceId, cardInstanceIds: [] }, { expectReject: true });
        } else if (chain?.step === "immediate_roll_choice") {
          const wrongPlayer = playerIds.find((p) => p !== chain.actorId)!;
          send(wrongPlayer, "IMMEDIATE_ROLL", { choice: "skip" }, { expectReject: true });
        } else if (!chain) {
          send(active, "RESOLVE_CHOICE", { choiceId: "x", cardInstanceIds: [] }, { expectReject: true });
          send(active, "IMMEDIATE_ROLL", { choice: "roll" }, { expectReject: true });
          send(active, "REACT_PASS", { windowId: "x" }, { expectReject: true });
        }
    }
  }

  // ---------------------------------------------------------------- one policy step
  function stepOnce(active: string): void {
    const chain = game.chain as Any;
    if (!chain) return turnAction(active);
    switch (chain.step) {
      case "challenge_window":
        return challengeWindow(chain);
      case "modifier_window":
        return modifierWindow(chain);
      case "immediate_roll_choice":
        return immediateRoll(chain);
      case "choice":
        return answerChoice(chain.choice);
    }
  }

  function turnAction(active: string): void {
    const seat = game.seats.find((s) => s.playerId === active)!;
    const ap = game.actionPoints ?? 0;
    type Cand = { w: number; run: () => string };
    const cands: Cand[] = [];
    if (ap >= 1) {
      for (const card of seat.hand) {
        if (!["hero", "item", "cursed_item", "magic"].includes(card.kind)) continue;
        const targets = playTargets(card, active);
        if (!targets) continue;
        cands.push({ w: card.kind === "hero" ? (style === "builder" ? 14 : 7) : 3, run: () => send(active, "PLAY_HAND_CARD", { cardInstanceId: card.cardId, targets }) });
      }
      for (const h of seat.party) {
        if (game.heroRollsUsed.includes(h.card.cardId) || h.item?.definitionId.endsWith("sealing-key")) continue;
        const targets = genTargets(cardDataOfKind(h.card.definitionId, "hero")!.target, active);
        if (!targets) continue;
        cands.push({ w: 5, run: () => send(active, "USE_HERO_EFFECT", { heroInstanceId: h.card.cardId, targets }) });
      }
      cands.push({ w: 1.5, run: () => send(active, "DRAW_CARD", {}) });
      if (seat.leaderId?.endsWith("the-shadow-claw") && !game.leaderActionUsed) {
        cands.push({ w: 2, run: () => send(active, "LEADER_ACTION", { targetPlayerId: rng.pick(othersOf(active)).playerId }) });
      }
    }
    if (ap >= 2) {
      for (const monsterId of game.faceUpMonsters) {
        const monster = cardDataOfKind(monsterId.replace(/#.*/, ""), "monster")!;
        if (!meetsRequirement(seat, monster, game.settings)) continue;
        cands.push({ w: style === "slayer" ? 6 : style === "mixed" ? 2.5 : 0.25, run: () => send(active, "ATTACK_MONSTER", { monsterInstanceId: monsterId }) });
      }
    }
    if (ap >= 3) cands.push({ w: 0.4, run: () => send(active, "REDRAW_HAND", {}) });
    cands.push({ w: ap >= 1 && cands.length > 1 ? 0.8 : 6, run: () => send(active, "END_TURN", {}) });
    // sometimes try an attack the engine should refuse (requirement / AP / not face-up)
    if (rng.chance(0.04)) {
      const code = send(active, "ATTACK_MONSTER", { monsterInstanceId: game.faceUpMonsters[0] ?? "hts.base.v1.monster.terratuga#99" }, {});
      bump("blindAttack");
      if (code === "ACCEPTED") return;
    }
    // Pick; a refusal of a command we believed legal is recorded as a soft anomaly
    for (let tries = 0; tries < 6; tries += 1) {
      const idx = rng.weighted(cands.map((c, i) => ({ w: c.w, v: i })));
      const code = cands[idx].run();
      if (code === "ACCEPTED") return;
      bump(`anomaly:${code}`);
      trace.push(`  ^ ANOMALY: believed legal, engine said ${code}`);
      cands.splice(idx, 1);
      if (!cands.length) break;
    }
    const code = send(active, "END_TURN", {});
    if (code !== "ACCEPTED") fail("DEADLOCK_END_TURN_REJECTED", `${active} END_TURN => ${code} in turn_active with no chain`);
  }

  function challengeWindow(chain: Any): void {
    const pending = Object.entries(chain.responders).filter(([, st]) => st === "pending").map(([pid]) => pid);
    const pid = rng.pick(pending);
    const seat = game.seats.find((s) => s.playerId === pid)!;
    const card = seat.hand.find((c) => c.kind === "challenge");
    if (card && rng.chance(0.3)) {
      const code = send(pid, "REACT_CHALLENGE", { windowId: chain.windowId, cardInstanceId: card.cardId });
      if (code !== "ACCEPTED") bump(`anomaly:challenge:${code}`);
      else bump("challenges");
      return;
    }
    const code = send(pid, "REACT_PASS", { windowId: chain.windowId });
    if (code !== "ACCEPTED") bump(`anomaly:pass:${code}`);
  }

  function modifierWindow(chain: Any): void {
    const pending = Object.entries(chain.responders).filter(([, st]) => st === "pending").map(([pid]) => pid);
    const pid = rng.pick(pending);
    const seat = game.seats.find((s) => s.playerId === pid)!;
    const card = seat.hand.find((c) => c.kind === "modifier");
    if (card && rng.chance(0.35)) {
      const data = cardDataOfKind(card.definitionId, "modifier")!;
      const payload: Record<string, unknown> = { windowId: chain.windowId, cardInstanceId: card.cardId, value: rng.pick(data.options) };
      if (chain.roll.kind === "challenge") payload.side = rng.pick(["challenger", "defender"]);
      if (seat.leaderId?.endsWith("the-protecting-horn") && rng.chance(0.6)) payload.leaderBonus = rng.pick([1, -1]);
      const code = send(pid, "REACT_MODIFIER", payload);
      if (code !== "ACCEPTED") bump(`anomaly:modifier:${code}`);
      else bump("modifiers");
      return;
    }
    const code = send(pid, "REACT_PASS", { windowId: chain.windowId });
    if (code !== "ACCEPTED") bump(`anomaly:pass:${code}`);
  }

  function immediateRoll(chain: Any): void {
    const hero = game.seats.flatMap((s) => s.party).find((h) => h.card.cardId === chain.heroCardId);
    if (hero && rng.chance(0.65) && !hero.item?.definitionId.endsWith("sealing-key") && !game.heroRollsUsed.includes(chain.heroCardId)) {
      const targets = genTargets(cardDataOfKind(hero.card.definitionId, "hero")!.target, chain.actorId);
      if (targets) {
        const code = send(chain.actorId, "IMMEDIATE_ROLL", { choice: "roll", targets });
        if (code === "ACCEPTED") {
          bump("immediateRolls");
          return;
        }
        bump(`anomaly:immediate:${code}`);
      }
    }
    send(chain.actorId, "IMMEDIATE_ROLL", { choice: "skip" });
  }

  function answerChoice(choice: Any): void {
    const chooser = choice.playerId as string;
    const snap = project(chooser);
    const sc = snap.game.chain as Any;
    if (sc?.step !== "choice" || sc.choiceId !== choice.choiceId) fail("PROJECTION_CHOICE_MISSING", "");
    const options: Array<{ cardId: string; kind: string; definitionId: string }> = sc.options ?? [];
    if (choice.kind !== "confirm" && sc.options === undefined) fail("CHOOSER_WITHOUT_OPTIONS", choice.kind);
    for (const other of [rng.pick(playerIds.filter((p) => p !== chooser))]) {
      const o = (project(other).game.chain as Any)?.options;
      if (o !== undefined) fail("LEAK_CHOICE_OPTIONS", `non-chooser ${other} gets options for ${choice.kind}`);
    }
    bump(`choice:${choice.kind}`);
    // sometimes just let it time out (owner: choice timeout = skip)
    if (rng.chance(0.08)) {
      advanceClock(Math.max(0, choice.deadlineAt - clock.now) + 1);
      bump("choiceTimeouts");
      return;
    }
    const base = { choiceId: choice.choiceId };
    if (choice.kind === "confirm") {
      const code = send(chooser, "RESOLVE_CHOICE", { ...base, cardInstanceIds: [], accept: rng.chance(0.5) });
      if (code !== "ACCEPTED") bump(`anomaly:choice:${code}`);
      return;
    }
    if (choice.kind === "view_hand") {
      send(chooser, "RESOLVE_CHOICE", { ...base, cardInstanceIds: [] });
      return;
    }
    if (choice.kind === "play_card") {
      if (choice.min === 0 && rng.chance(0.4)) {
        send(chooser, "RESOLVE_CHOICE", { ...base, cardInstanceIds: [] });
        return;
      }
      for (const opt of rng.shuffle(options)) {
        const card = game.seats.find((s) => s.playerId === chooser)!.hand.find((c) => c.cardId === opt.cardId)!;
        const targets = playTargets(card, chooser);
        if (!targets) continue;
        const code = send(chooser, "RESOLVE_CHOICE", { ...base, cardInstanceIds: [opt.cardId], targets });
        if (code === "ACCEPTED") return;
        bump(`anomaly:playchoice:${code}`);
      }
      if (choice.min === 0) {
        send(chooser, "RESOLVE_CHOICE", { ...base, cardInstanceIds: [] });
        return;
      }
      bump("mandatoryPlayNoTarget");
      advanceClock(Math.max(0, choice.deadlineAt - clock.now) + 1); // only a timeout can resolve it
      return;
    }
    const n = choice.min + rng.int(choice.max - choice.min + 1);
    const ids = choice.kind === "order_top" ? rng.shuffle(options.map((o) => o.cardId)) : rng.shuffle(options.map((o) => o.cardId)).slice(0, n);
    const code = send(chooser, "RESOLVE_CHOICE", { ...base, cardInstanceIds: ids });
    if (code !== "ACCEPTED") {
      bump(`anomaly:choice:${choice.kind}:${code}`);
      advanceClock(Math.max(0, choice.deadlineAt - clock.now) + 1);
    }
  }
}

// ----------------------------------------------------------------------------
// The test
// ----------------------------------------------------------------------------
const seeds = ONLY_SEED !== null ? [ONLY_SEED] : Array.from({ length: GAMES }, (_, i) => BASE_SEED + i);

test(`AUDIT-001 fuzz: ${seeds.length} complete base games hold all invariants`, { timeout: 600_000 }, (t) => {
  const results: GameResult[] = [];
  for (const seed of seeds) {
    const nPlayers = 2 + ((seed - BASE_SEED) % 5);
    results.push(playGame(seed, nPlayers));
  }
  const outcomes: Record<string, number> = {};
  const totals: Record<string, number> = {};
  const byPlayers: Record<string, Record<string, number>> = {};
  for (const r of results) {
    outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    (byPlayers[r.players] ??= {})[r.outcome] = (byPlayers[r.players][r.outcome] ?? 0) + 1;
    for (const [k, v] of Object.entries(r.stats)) totals[k] = (totals[k] ?? 0) + v;
  }
  const violations = results.filter((r) => r.violation);
  const known = violations.filter((r) => KNOWN_BUGS[r.seed]?.code === r.violation!.code);
  const unexpected = violations.filter((r) => !known.includes(r));
  const summary = {
    games: results.length,
    outcomes,
    byPlayers,
    avgTurns: Math.round(results.reduce((s, r) => s + r.turns, 0) / results.length),
    totalSteps: results.reduce((s, r) => s + r.steps, 0),
    totals,
    violations: violations.map((r) => ({ seed: r.seed, players: r.players, ...r.violation })),
  };
  if (process.env.AUDIT_OUT) writeFileSync(process.env.AUDIT_OUT, JSON.stringify({ summary, results: results.map((r) => ({ ...r, violation: r.violation && { code: r.violation.code, detail: r.violation.detail, stepIndex: r.violation.stepIndex } })) }, null, 1));
  t.diagnostic(JSON.stringify({ ...summary, violations: summary.violations.map((v) => `${v.seed}:${v.code}`) }));
  if (unexpected.length) {
    const first = unexpected[0];
    const text = unexpected
      .slice(0, 5)
      .map((r) => `seed ${r.seed} (${r.players}p): ${r.violation!.detail}\n  trace:\n    ${r.violation!.trace.slice(-(process.env.AUDIT_TRACE ? 30 : 12)).join("\n    ")}`)
      .join("\n---\n");
    assert.fail(`${unexpected.length} game(s) violated invariants (first: seed ${first.seed}):\n${text}`);
  }
  assert.ok(results.every((r) => r.outcome !== "step_cap"), "a game hit the step cap (livelock)");
});

for (const [seed, bug] of Object.entries(KNOWN_BUGS)) {
  test.todo(`AUDIT-001 known bug seed ${seed} [${bug.code}]: ${bug.note}`);
}
