// Builds the real base-game decks from the CAT-001 reference catalog.
// IDs/kinds + display name (GAME-004 data); no artwork (rights UNVERIFIED).

import type { BaseCardKind, BaseCardView } from "@here-to-slay/protocol";
import { lookupCard } from "../content/base-cards.ts";
import { GAME_SET_CATALOG, type CatalogCopy } from "../content/set-catalog.ts";

/** Persisted card: one physical copy. `cardId` = catalog instanceId. */
export interface BaseCard {
  cardId: string;
  definitionId: string;
  kind: BaseCardKind;
}

function toCard(copy: CatalogCopy): BaseCard {
  return { cardId: copy.instanceId, definitionId: copy.definitionId, kind: copy.kind };
}

const BASE_CONTENT = GAME_SET_CATALOG.compose();
const MONSTER_BY_INSTANCE = new Map(BASE_CONTENT.monster.map((copy) => [copy.instanceId, toCard(copy)]));

/** 74 main definitions → 115 copies (heroes, items, magic, modifiers, challenges, cursed items). */
export function baseMainDeck(): BaseCard[] {
  return BASE_CONTENT.main.map(toCard);
}

/** 15 Monster instance ids. */
export function baseMonsterDeck(): string[] {
  return BASE_CONTENT.monster.map((copy) => copy.instanceId);
}

/** 6 Party Leader definitionIds (each has exactly one copy, so they are unique picks). */
export function baseLeaderPool(): string[] {
  return [...BASE_CONTENT.leaderPool];
}

export function monsterView(instanceId: string): BaseCardView {
  const card = MONSTER_BY_INSTANCE.get(instanceId);
  if (!card) throw new Error(`Unknown base monster instance ${instanceId}`);
  return cardView(card);
}

export function cardView(card: BaseCard): BaseCardView {
  const data = lookupCard(card.definitionId);
  const view: BaseCardView = { cardId: card.cardId, definitionId: card.definitionId, kind: card.kind, name: data?.name ?? card.definitionId };
  if (data?.kind === "modifier") view.modifierOptions = [...data.options];
  return view;
}
