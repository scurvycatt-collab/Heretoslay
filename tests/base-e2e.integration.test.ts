// QA-001: end-to-end base games over HTTP (join → play → win) for 2 and 3
// players, plus the GAME-001 review nits. Deck order and dice are injected so
// the games are deterministic; every action goes through the public API.
import assert from "node:assert/strict";
import test from "node:test";

import {
  RoomDurableObject,
  type DurableObjectContextLike,
  type DurableObjectStorageLike,
  type DurableObjectTransactionLike,
} from "../apps/worker/src/room.ts";
import { routeRequest, type WorkerEnv } from "../apps/worker/src/router.ts";

class MemoryStorage implements DurableObjectStorageLike, DurableObjectTransactionLike {
  readonly values = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
  async setAlarm(): Promise<void> {}
  transaction<T>(callback: (txn: DurableObjectTransactionLike) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => callback(this));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

/** `order` lists definition-id prefixes to put on top of the main / monster deck (in that order). */
function runtime(order: { main?: string[]; monsters?: string[] } = {}) {
  const dice: Array<[number, number]> = [];
  let id = 0;
  let ip = 0;
  const arrange = (values: string[]) => {
    const isMonster = values.some((v) => v.includes(".monster."));
    const wanted = (isMonster ? order.monsters : order.main) ?? [];
    const rest = [...values];
    const top: string[] = [];
    for (const prefix of wanted) {
      const index = rest.findIndex((v) => v.startsWith(prefix));
      if (index >= 0) top.push(...rest.splice(index, 1));
    }
    return [...top, ...rest];
  };
  const rooms = new Map<string, RoomDurableObject>();
  const namespace = {
    idFromName: (name: string) => name,
    get(roomId: unknown) {
      const code = String(roomId);
      let room = rooms.get(code);
      if (!room) {
        const storage = new MemoryStorage();
        const context: DurableObjectContextLike = { storage, blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb() };
        room = new RoomDurableObject(context, {
          now: () => 1_000_000,
          randomUUID: () => `id-${++id}`,
          sessionToken: () => `tok-${++id}`,
          shuffle: arrange,
          rollDice: () => dice.shift() ?? [3, 4],
        });
        rooms.set(code, room);
      }
      const target = room;
      return { fetch: (request: Request) => target.fetch(request) };
    },
  } satisfies WorkerEnv["ROOMS"];
  async function request(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
    const headers = new Headers({ "cf-connecting-ip": `e2e-${++ip}` });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    const response = await routeRequest(
      new Request(`https://local.test${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
      { ROOMS: namespace },
    );
    return { status: response.status, json: (await response.json()) as any };
  }
  return { dice, request };
}

type Rt = ReturnType<typeof runtime>;
type Player = { name: string; playerId: string; token: string };

let seq = 0;
const snap = async (rt: Rt, code: string, p: Player) => (await rt.request(`/api/rooms/${code}/snapshot`, { token: p.token })).json.snapshot;
async function raw(rt: Rt, code: string, p: Player, body: Record<string, unknown>) {
  return (await rt.request(`/api/rooms/${code}/commands`, { method: "POST", token: p.token, body })).json;
}
async function send(rt: Rt, code: string, p: Player, kind: string, payload: Record<string, unknown> = {}) {
  const expectedRevision = (await snap(rt, code, p)).revision;
  return raw(rt, code, p, { commandId: `e-${++seq}`, expectedRevision, kind, payload });
}
async function ok(rt: Rt, code: string, p: Player, kind: string, payload: Record<string, unknown> = {}) {
  const result = await send(rt, code, p, kind, payload);
  assert.equal(result.outcome.code, "ACCEPTED", `${p.name} ${kind}: ${result.outcome.code}`);
  return result.snapshot;
}

async function seat(rt: Rt, names: string[], leaders: string[]) {
  const host = await rt.request("/api/rooms", { method: "POST", body: { nickname: names[0], mode: "base" } });
  const code = host.json.roomCode as string;
  const players: Player[] = [{ name: names[0], playerId: host.json.snapshot.you.playerId, token: host.json.sessionToken }];
  for (const name of names.slice(1)) {
    const joined = await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: name } });
    assert.equal(joined.status, 201);
    players.push({ name, playerId: joined.json.snapshot.you.playerId, token: joined.json.sessionToken });
  }
  await ok(rt, code, players[0], "BEGIN_LEADER_SELECTION");
  for (let i = 0; i < players.length; i += 1) {
    await ok(rt, code, players[i], "SELECT_PARTY_LEADER", { leaderId: `hts.base.v1.party-leader.${leaders[i]}` });
  }
  await ok(rt, code, players[0], "START_GAME");
  return { code, players };
}

/** Everyone except `actor` passes the open window. */
async function othersPass(rt: Rt, code: string, players: Player[], actor: Player) {
  const view = await snap(rt, code, actor);
  const chain = view.game.chain;
  for (const p of players) {
    if (p === actor && chain.step === "challenge_window") continue;
    if (chain.responders[p.playerId] === "pending") await ok(rt, code, p, "REACT_PASS", { windowId: chain.windowId });
  }
}

async function playHero(rt: Rt, code: string, players: Player[], actor: Player, definitionId: string) {
  const hand = (await snap(rt, code, actor)).yourHand;
  const card = hand.find((c: any) => c.definitionId === definitionId);
  assert.ok(card, `${actor.name} lacks ${definitionId}`);
  await ok(rt, code, actor, "PLAY_HAND_CARD", { cardInstanceId: card.cardId });
  await othersPass(rt, code, players, actor);
  // A Hero whose effect has no valid target is skipped by the server (no roll offer).
  if ((await snap(rt, code, actor)).game.chain?.step === "immediate_roll_choice") await ok(rt, code, actor, "IMMEDIATE_ROLL", { choice: "skip" });
}

const H = (slug: string) => `hts.base.v1.hero.${slug}`;
const M = (slug: string) => `hts.base.v1.monster.${slug}`;

test("QA-001 e2e (2 players): join → Leaders → play Heroes over 2 turns → 6-class win at END_TURN", async () => {
  // Deal order = join order: Ann gets the first 5, Bob the next 5. Bob picks last → Bob goes first.
  const rt = runtime({
    main: [H("peanut"), H("bear-claw"), H("hopper"), H("bun-bun"), H("buttons"), H("dodgy-dealer"), H("bad-axe"), H("calming-voice"), H("bullseye"), H("kit-napper")],
  });
  const { code, players } = await seat(rt, ["Ann", "Bob"], ["the-charismatic-song", "the-cloaked-sage"]);
  const [ann, bob] = players;
  let view = await snap(rt, code, bob);
  assert.equal(view.game.currentPlayerId, bob.playerId);
  assert.deepEqual(view.yourHand.map((c: any) => c.definitionId), [H("dodgy-dealer"), H("bad-axe"), H("calming-voice"), H("bullseye"), H("kit-napper")]);
  // Turn 1 (Bob, Wizard Leader): Fighter, Guardian, Ranger → 3 AP spent → auto end with 4 classes: no win.
  await playHero(rt, code, players, bob, H("bad-axe"));
  await playHero(rt, code, players, bob, H("calming-voice"));
  await playHero(rt, code, players, bob, H("bullseye"));
  view = await snap(rt, code, bob);
  assert.equal(view.game.currentPlayerId, ann.playerId);
  assert.equal(view.game.phase, "turn_active");
  assert.deepEqual([...view.players.find((p: any) => p.playerId === bob.playerId).partyClasses].sort(), ["fighter", "guardian", "ranger", "wizard"]);
  // Ann: one Hero, then ends her turn.
  await playHero(rt, code, players, ann, H("bear-claw"));
  await ok(rt, code, ann, "END_TURN");
  // Turn 3 (Bob): Thief + Bard → 6 classes; win is only checked when his turn ends.
  await playHero(rt, code, players, bob, H("kit-napper"));
  await playHero(rt, code, players, bob, H("dodgy-dealer"));
  view = await snap(rt, code, ann);
  assert.equal(view.game.phase, "turn_active");
  assert.equal(view.players.find((p: any) => p.playerId === bob.playerId).partyClasses.length, 6);
  await ok(rt, code, bob, "END_TURN");
  view = await snap(rt, code, ann);
  assert.equal(view.game.phase, "game_over");
  assert.equal(view.game.winnerPlayerId, bob.playerId);
  assert.equal(view.game.winReason, "six_classes");
  assert.equal((await send(rt, code, ann, "DRAW_CARD")).outcome.code, "GAME_OVER");
});

test("QA-001 e2e (3 players): attacks with injected dice → 3rd SLAY wins immediately; later commands rejected", async () => {
  const rt = runtime({
    main: [H("peanut"), H("fuzzy-cheeks"), H("greedy-cheeks"), H("lucky-bucky"), H("mellow-dee"), H("bad-axe"), H("bear-claw"), H("beary-wise"), H("fury-knuckle"), H("heavy-bear"), H("calming-voice"), H("guiding-light"), H("holy-curselifter"), H("iron-resolve"), H("mighty-blade")],
    monsters: [M("artic-aries"), M("terratuga"), M("dracos")],
  });
  const { code, players } = await seat(rt, ["Ann", "Bob", "Cat"], ["the-charismatic-song", "the-cloaked-sage", "the-fist-of-reason"]);
  const [ann, bob, cat] = players;
  let view = await snap(rt, code, cat);
  assert.equal(view.game.currentPlayerId, cat.playerId); // last selector first, then join order
  assert.deepEqual(view.game.turnOrder, [cat.playerId, ann.playerId, bob.playerId]);
  const monsters = view.game.faceUpMonsters.map((m: any) => m.cardId);
  assert.deepEqual(monsters, [`${M("artic-aries")}#01`, `${M("terratuga")}#01`, `${M("dracos")}#01`]);

  async function attack(monsterId: string, dice: [number, number]) {
    rt.dice.push(dice);
    await ok(rt, code, cat, "ATTACK_MONSTER", { monsterInstanceId: monsterId });
    await othersPass(rt, code, players, cat); // Modifier window: everyone (incl. Cat) skips
  }
  async function othersEnd() {
    await ok(rt, code, ann, "END_TURN");
    await ok(rt, code, bob, "END_TURN");
  }

  await playHero(rt, code, players, cat, H("calming-voice"));
  await attack(monsters[0], [6, 6]); // Arctic Aries 10+ → SLAY, refill from the Monster deck
  view = await snap(rt, code, cat);
  assert.equal(view.players.find((p: any) => p.playerId === cat.playerId).slainMonsters.length, 1);
  assert.equal(view.game.faceUpMonsters.length, 3);
  assert.equal(view.game.currentPlayerId, ann.playerId);
  await othersEnd();
  await attack(monsters[1], [5, 6]); // Terratuga 11+ → SLAY
  await ok(rt, code, cat, "END_TURN");
  await othersEnd();
  await attack(monsters[2], [1, 2]); // Dracos slays on 5- → 3rd Monster → win
  view = await snap(rt, code, ann);
  assert.equal(view.game.phase, "game_over");
  assert.equal(view.game.winnerPlayerId, cat.playerId);
  assert.equal(view.game.winReason, "slay_3");
  for (const p of players) assert.equal((await send(rt, code, p, "END_TURN")).outcome.code, "GAME_OVER");
  assert.equal((await send(rt, code, cat, "DRAW_CARD")).outcome.code, "GAME_OVER");
});

test("QA-001 nits: wrong-player END_TURN, STALE_REVISION receipt replay, stale/replayed BEGIN/SELECT/START", async () => {
  const rt = runtime();
  const host = await rt.request("/api/rooms", { method: "POST", body: { nickname: "Ann", mode: "base" } });
  const code = host.json.roomCode;
  const ann: Player = { name: "Ann", playerId: host.json.snapshot.you.playerId, token: host.json.sessionToken };
  const joined = await rt.request(`/api/rooms/${code}/join`, { method: "POST", body: { nickname: "Bob" } });
  const bob: Player = { name: "Bob", playerId: joined.json.snapshot.you.playerId, token: joined.json.sessionToken };
  const rev = (await snap(rt, code, ann)).revision;

  const stale = await raw(rt, code, ann, { commandId: "b-1", expectedRevision: rev - 1, kind: "BEGIN_LEADER_SELECTION", payload: {} });
  assert.equal(stale.outcome.code, "STALE_REVISION");
  // The rejection is a stored receipt: same commandId replays it even with the right revision.
  const replay = await raw(rt, code, ann, { commandId: "b-1", expectedRevision: rev - 1, kind: "BEGIN_LEADER_SELECTION", payload: {} });
  assert.deepEqual([replay.outcome.code, replay.outcome.replayed], ["STALE_REVISION", true]);
  const begun = await raw(rt, code, ann, { commandId: "b-2", expectedRevision: rev, kind: "BEGIN_LEADER_SELECTION", payload: {} });
  assert.equal(begun.outcome.code, "ACCEPTED");
  const again = await raw(rt, code, ann, { commandId: "b-2", expectedRevision: rev, kind: "BEGIN_LEADER_SELECTION", payload: {} });
  assert.deepEqual([again.outcome.code, again.outcome.replayed, again.snapshot.revision], ["ACCEPTED", true, rev + 1]);

  const pick = { kind: "SELECT_PARTY_LEADER", payload: { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" } };
  assert.equal((await raw(rt, code, ann, { commandId: "s-1", expectedRevision: rev, ...pick })).outcome.code, "STALE_REVISION");
  assert.equal((await raw(rt, code, ann, { commandId: "s-2", expectedRevision: rev + 1, ...pick })).outcome.code, "ACCEPTED");
  assert.equal((await raw(rt, code, ann, { commandId: "s-2", expectedRevision: rev + 1, ...pick })).outcome.replayed, true);
  assert.equal((await raw(rt, code, ann, { commandId: "s-2", expectedRevision: rev + 1, kind: "SELECT_PARTY_LEADER", payload: { leaderId: "x" } })).outcome.code, "IDEMPOTENCY_CONFLICT");
  await ok(rt, code, bob, "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-divine-arrow" });
  const r = (await snap(rt, code, ann)).revision;
  assert.equal((await raw(rt, code, ann, { commandId: "g-1", expectedRevision: r - 1, kind: "START_GAME", payload: {} })).outcome.code, "STALE_REVISION");
  assert.equal((await raw(rt, code, ann, { commandId: "g-2", expectedRevision: r, kind: "START_GAME", payload: {} })).outcome.code, "ACCEPTED");
  assert.equal((await raw(rt, code, ann, { commandId: "g-2", expectedRevision: r, kind: "START_GAME", payload: {} })).outcome.replayed, true);

  // Bob picked last → Bob's turn; Ann's END_TURN is refused and changes nothing.
  const before = await snap(rt, code, ann);
  assert.equal((await send(rt, code, ann, "END_TURN")).outcome.code, "NOT_YOUR_TURN");
  const after = await snap(rt, code, ann);
  assert.equal(after.revision, before.revision);
  assert.equal(after.game.currentPlayerId, bob.playerId);
});

test("QA-001 nits: deck exhaustion reshuffles the discard; empty deck+discard draws 0 but spends 1 AP; privacy after reconnect", async () => {
  const rt = runtime();
  const { code, players } = await seat(rt, ["Ann", "Bob"], ["the-charismatic-song", "the-cloaked-sage"]);
  const [ann, bob] = players;
  let view = await snap(rt, code, bob);
  const deckStart = view.game.mainDeckCount;
  assert.equal(deckStart, 105);
  // Burn the deck with REDRAW (5 cards each) until it reshuffles.
  let turns = 0;
  while ((await snap(rt, code, bob)).game.mainDeckCount >= 5 && turns < 60) {
    const current = (await snap(rt, code, ann)).game.currentPlayerId === ann.playerId ? ann : bob;
    await ok(rt, code, current, "REDRAW_HAND");
    turns += 1;
  }
  view = await snap(rt, code, ann);
  const current = view.game.currentPlayerId === ann.playerId ? ann : bob;
  const discardBefore = view.game.discardCount;
  assert.ok(discardBefore > 0);
  await ok(rt, code, current, "REDRAW_HAND"); // needs reshuffle mid-draw
  view = await snap(rt, code, current);
  assert.equal(view.yourHand.length, 5);
  assert.ok(view.game.mainDeckCount + view.game.discardCount + 10 === 115, "conservation of the 115 main cards");

  // Reconnect = snapshot with the same token: same seat, still only own hand.
  const reconnect = await snap(rt, code, ann);
  assert.equal(reconnect.you.playerId, ann.playerId);
  const bobHand = (await snap(rt, code, bob)).yourHand.map((c: any) => c.cardId);
  assert.equal(bobHand.some((id: string) => JSON.stringify(reconnect).includes(id)), false);
});

test("QA-001 nit: DRAW with deck and discard both empty draws 0, still spends 1 AP, turn continues (EC-26)", async () => {
  const { applyBaseCommand, initialBaseGameState } = await import("../apps/worker/src/game/base-game.ts");
  const game = initialBaseGameState();
  const roster = { hostPlayerId: "a", players: [{ playerId: "a", nickname: "A" }, { playerId: "b", nickname: "B" }] };
  const deps = { newId: () => "t", shuffle: (ids: string[]) => ids, rollDice: () => [1, 1] as const, now: () => 0 };
  const run = (who: string, kind: string, payload: Record<string, unknown> = {}) =>
    applyBaseCommand(game, roster, who, { commandId: "c", expectedRevision: 0, kind, payload } as never, deps);
  run("a", "BEGIN_LEADER_SELECTION");
  run("a", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-cloaked-sage" });
  run("b", "SELECT_PARTY_LEADER", { leaderId: "hts.base.v1.party-leader.the-divine-arrow" });
  run("a", "START_GAME");
  game.mainDeck = [];
  game.discard = [];
  const me = game.turnOrder[game.currentPlayerIndex];
  const hand = game.seats.find((s) => s.playerId === me)!.hand.length;
  assert.equal(run(me, "DRAW_CARD"), "ACCEPTED");
  assert.equal(game.seats.find((s) => s.playerId === me)!.hand.length, hand);
  assert.equal(game.actionPoints, 2);
  assert.equal(game.turnOrder[game.currentPlayerIndex], me);
});
