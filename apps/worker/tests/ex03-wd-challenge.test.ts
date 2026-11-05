// E08: class Challenges need a real Hero of that effective class; +3 goes to the challenger only.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { challenge, openChallengeWindow, type EngineDeps, type EngineHooks } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { EXPANSION_FACE_DRAFTS } from "../src/content/expansion-drafts.ts";

const wd = (name: string) => EXPANSION_FACE_DRAFTS.find((d) => d.setKey === "warriorsDruids" && d.canonicalName === name)!.definitionId;
const axe: BaseCard = { cardId: "axe", definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" };

function table() {
  const game = initialBaseGameState();
  const roster: BaseRoster = { hostPlayerId: "p1", players: ["p1", "p2"].map((playerId) => ({ playerId, nickname: playerId })) };
  let id = 0;
  const deps: BaseGameDeps = { newId: () => `id-${++id}`, shuffle: (ids) => [...ids], rollDice: () => [2, 2], now: () => 0 };
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
  const challengeCard = (name: string): BaseCard => {
    const card = { cardId: `${wd(name)}#01`, definitionId: wd(name), kind: "challenge" as const };
    them.hand.push(card);
    return card;
  };
  const openWindow = () => {
    game.chain = null;
    openChallengeWindow(game, { actorId: me.playerId, card: { cardId: "tgt", definitionId: "hts.base.v1.hero.bad-axe", kind: "hero" }, targets: {} }, engineDeps, hooks);
    return (game.chain as { windowId: string }).windowId;
  };
  const play = (windowId: string, card: BaseCard) => challenge(game, them.playerId, windowId, card.cardId, engineDeps, hooks);
  return { game, me, them, challengeCard, openWindow, play };
}

test("class Challenge without a Hero of that class: Requirement not met, card kept, window still open", () => {
  const t = table();
  const card = t.challengeCard("Druid Challenge");
  t.them.party.push({ card: axe, attachments: [] }); // a Fighter
  const windowId = t.openWindow();
  assert.equal(t.play(windowId, card), "REQUIREMENT_NOT_MET");
  assert.ok(t.them.hand.includes(card), "card not consumed");
  assert.ok(!t.game.discard.includes(card));
  const chain = t.game.chain as { step: string; responders: Record<string, string> };
  assert.equal(chain.step, "challenge_window");
  assert.equal(chain.responders[t.them.playerId], "pending", "responder not captured");
});

test("Leader class does not qualify; a Druid Hero does, and +3 applies to the challenger only", () => {
  const t = table();
  const card = t.challengeCard("Druid Challenge");
  const windowId = t.openWindow();
  assert.equal(t.play(windowId, card), "REQUIREMENT_NOT_MET");
  const buck: BaseCard = { cardId: "buck", definitionId: wd("Buck Omens"), kind: "hero" };
  t.them.party.push({ card: buck, attachments: [] });
  assert.equal(t.play(windowId, card), "ACCEPTED");
  const roll = (t.game.chain as { roll: { passives: Array<{ value: number; side?: string; source: string }> } }).roll;
  const bonus = roll.passives.filter((p) => p.source === card.definitionId);
  assert.deepEqual(bonus.map((p) => [p.value, p.side]), [[3, "challenger"]]);
  assert.ok(t.game.discard.includes(card));
});

test("Mask counts by effective class: a Warrior Mask on a Fighter qualifies for the Warrior Challenge", () => {
  const t = table();
  const card = t.challengeCard("Warrior Challenge");
  const mask: BaseCard = { cardId: "wm", definitionId: wd("Warrior Mask"), kind: "item" };
  t.them.party.push({ card: axe, attachments: [mask] });
  assert.equal(t.play(t.openWindow(), card), "ACCEPTED");
});
