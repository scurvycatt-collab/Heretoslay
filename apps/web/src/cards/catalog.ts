import type { CardData, CardDataFile } from "@here-to-slay/protocol";
import type { ArtworkRightsStatus } from "../asset-import/contract";
import data from "../../../worker/src/content/base-cards.json";
import { EXPANSION_CARD_DATA } from "../cardCatalog";

// Public definitions only. Never derive the contents of a player's hidden hand.
export const cardCatalog: readonly CardData[] = [...(data as unknown as CardDataFile).cards, ...EXPANSION_CARD_DATA];
export const cardById = new Map<string, CardData>(cardCatalog.map((card) => [card.definitionId, card]));

export interface CardAsset {
  artUrl: string;
  source: string;
  revision: string;
  rightsStatus: ArtworkRightsStatus;
}
// Deliberately empty until artwork with per-definition provenance is supplied.
export const cardAssets: Readonly<Record<string, CardAsset>> = {};
