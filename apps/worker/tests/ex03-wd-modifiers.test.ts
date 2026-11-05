// M01–M04 (owner E09): follow-ups after the roll resolves, from the frozen final total.
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseGameCommand } from "@here-to-slay/protocol";
import { pass, playModifier, startAttack, type EngineDeps, type EngineHooks } from "../src/game/base-engine.ts";
import { applyBaseCommand, initialBaseGameState, type BaseGameDeps, type BaseRoster } from "../src/game/base-game.ts";
import type { BaseCard } from "../src/game/base-content.ts";
import { WD_MODIFIER_MINUS_4, WD_MODIFIER_PLUS_1_MINUS_1, WD_MODIFIER_PLUS_4 } from "../src/game/expansion-ids.ts";

function table(dice: [number, number]) {
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
  const other = game.seats.find((s) => s !== me)!;
  const hooks: EngineHooks = { autoEndTurn: () => {}, afterSlay: () => false };
  const engineDeps: EngineDeps = deps;
  const modifier = (owner: typeof me, definitionId: string, cardId: string): BaseCard => {
    const card: BaseCard = { cardId: `${definitionId}#${cardId}`, definitionId, kind: "modifier" };
    owner.hand.push(card);
    return card;
  };
  /** `user` plays `card` with `value` on my attack, then everyone Skips. */
  const attackWith = (user: typeof me, card: BaseCard, value: number) => {
    game.chain = null;
    startAttack(game, me.playerId, game.faceUpMonsters[0], engineDeps, hooks);
    const windowId = (game.chain as { windowId: string }).windowId;
    assert.equal(playModifier(game, user.playerId, { windowId, cardInstanceId: card.cardId, value }, engineDeps, hooks), "ACCEPTED");
    return {
      handDuringWindow: user.hand.length,
      close: () => {
        for (const pid of [me.playerId, other.playerId]) pass(game, pid, windowId, engineDeps, hooks);
      },
    };
  };
  return { game, me, other, modifier, attackWith };
}

test("M01 +1/-1: the card's user (not the roller) draws 2 only after the roll resolves", () => {
  const t = table([3, 3]);
  const card = t.modifier(t.other, WD_MODIFIER_PLUS_1_MINUS_1, "m1");
  const play = t.attackWith(t.other, card, 1);
  const before = t.other.hand.length;
  assert.equal(before, play.handDuringWindow, "no draw while the window is open");
  const mine = t.me.hand.length;
  play.close();
  assert.equal(t.other.hand.length, before + 2);
  assert.equal(t.me.hand.length, mine, "roller draws nothing");
});

test("M03 +4: draws 1 only when the final total is above 12", () => {
  for (const [dice, expected] of [[[6, 6], 1], [[5, 4], 1], [[4, 4], 0], [[4, 3], 0]] as const) {
    const t = table([...dice]);
    const card = t.modifier(t.me, WD_MODIFIER_PLUS_4, "m3");
    const play = t.attackWith(t.me, card, 4);
    const before = t.me.hand.length;
    play.close();
    assert.equal(t.me.hand.length - before, expected, `dice ${dice} → final ${dice[0] + dice[1] + 4}`);
  }
});

test("M04 -4: below 2 opens a discard recovery that cannot take the -4 itself; 2 or more grants none", () => {
  const low = table([1, 1]);
  const spare: BaseCard = { cardId: "spare", definitionId: "hts.base.v1.magic.enchanted-spell", kind: "magic" };
  low.game.discard.push(spare);
  const card = low.modifier(low.me, WD_MODIFIER_MINUS_4, "m4");
  const play = low.attackWith(low.me, card, -4);
  play.close();
  const chain = low.game.chain as { step: string; choice: { kind: string; excludeCardIds?: string[] } } | null;
  assert.equal(chain?.step, "choice");
  assert.equal(chain?.choice.kind, "take_from_discard");
  assert.deepEqual(chain?.choice.excludeCardIds, [card.cardId]);

  const edge = table([3, 3]); // 6 - 4 = 2 → not below 2
  edge.game.discard.push(spare);
  const edgeCard = edge.modifier(edge.me, WD_MODIFIER_MINUS_4, "m4");
  edge.attackWith(edge.me, edgeCard, -4).close();
  assert.notEqual((edge.game.chain as { step?: string } | null)?.step, "choice");
});
