// Builds the real base-game decks from the CAT-001 reference catalog.
// IDs/kinds + display name (GAME-004 data); no artwork (rights UNVERIFIED).

import type { BaseCardKind, BaseCardView } from "@here-to-slay/protocol";
import { BASE_CARDS_BY_ID } from "../content/base-cards.ts";
import { BASE_REFERENCE_PHYSICAL_COPIES } from "../content/base-reference.ts";
import type { BaseReferencePhysicalCopy } from "../content/types.ts";

/** Persisted card: one physical copy. `cardId` = catalog instanceId. */
export interface BaseCard {
  cardId: string;
  definitionId: string;
  kind: BaseCardKind;
}

function toCard(copy: BaseReferencePhysicalCopy): BaseCard {
  return { cardId: copy.instanceId, definitionId: copy.definitionId, kind: copy.kind };
}

const MONSTER_BY_INSTANCE = new Map(
  BASE_REFERENCE_PHYSICAL_COPIES.monster.map((copy) => [copy.instanceId, toCard(copy)]),
);

/** 74 main definitions → 115 copies (heroes, items, magic, modifiers, challenges, cursed items). */
export function baseMainDeck(): BaseCard[] {
  return BASE_REFERENCE_PHYSICAL_COPIES.main.map(toCard);
}

/** 15 Monster instance ids. */
export function baseMonsterDeck(): string[] {
  return BASE_REFERENCE_PHYSICAL_COPIES.monster.map((copy) => copy.instanceId);
}

/** 6 Party Leader definitionIds (each has exactly one copy, so they are unique picks). */
export function baseLeaderPool(): string[] {
  return BASE_REFERENCE_PHYSICAL_COPIES.partyLeader.map((copy) => copy.definitionId);
}

export function monsterView(instanceId: string): BaseCardView {
  const card = MONSTER_BY_INSTANCE.get(instanceId);
  if (!card) throw new Error(`Unknown base monster instance ${instanceId}`);
  return cardView(card);
}

export function cardView(card: BaseCard): BaseCardView {
  const data = BASE_CARDS_BY_ID.get(card.definitionId);
  const view: BaseCardView = { cardId: card.cardId, definitionId: card.definitionId, kind: card.kind, name: data?.name ?? card.definitionId };
  if (data?.kind === "modifier") view.modifierOptions = [...data.options];
  return view;
}
