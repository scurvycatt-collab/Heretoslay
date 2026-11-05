// Builds the real base-game decks from the CAT-001 reference catalog.
// IDs/kinds + display name (GAME-004 data); no artwork (rights UNVERIFIED).

import type { BaseCardKind, BaseCardView } from "@here-to-slay/protocol";
import { lookupCard } from "../content/base-cards.ts";
import { GAME_SET_CATALOG, type CatalogCopy, type SetCatalog } from "../content/set-catalog.ts";

/** Persisted card: one physical copy. `cardId` = catalog instanceId. */
export interface BaseCard {
  cardId: string;
  definitionId: string;
  kind: BaseCardKind;
}

function toCard(copy: CatalogCopy): BaseCard {
  return { cardId: copy.instanceId, definitionId: copy.definitionId, kind: copy.kind };
}


/** 74 main definitions → 115 copies (heroes, items, magic, modifiers, challenges, cursed items). */
export function baseMainDeck(expansionIds: readonly string[] = [], catalog: SetCatalog = GAME_SET_CATALOG): BaseCard[] {
  return catalog.compose(expansionIds).main.map(toCard);
}

/** 15 Monster instance ids. */
export function baseMonsterDeck(expansionIds: readonly string[] = [], catalog: SetCatalog = GAME_SET_CATALOG): string[] {
  return catalog.compose(expansionIds).monster.map((copy) => copy.instanceId);
}

/** 6 Party Leader definitionIds (each has exactly one copy, so they are unique picks). */
export function baseLeaderPool(expansionIds: readonly string[] = [], catalog: SetCatalog = GAME_SET_CATALOG): string[] {
  return [...catalog.compose(expansionIds).leaderPool];
}

export function monsterView(instanceId: string): BaseCardView {
  const definitionId = instanceId.split("#")[0];
  if (!lookupCard(definitionId)) throw new Error(`Unknown monster instance ${instanceId}`);
  return cardView({ cardId: instanceId, definitionId, kind: "monster" });
}

export function cardView(card: BaseCard): BaseCardView {
  const data = lookupCard(card.definitionId);
  const view: BaseCardView = { cardId: card.cardId, definitionId: card.definitionId, kind: card.kind, name: data?.name ?? card.definitionId };
  if (data?.kind === "modifier") view.modifierOptions = [...data.options];
  return view;
}
