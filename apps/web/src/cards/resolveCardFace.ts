import manifest from "../../../../assets/cards/kickstarter-preview/png-webgame/manifest.json";
import placeholderUrl from "./placeholder-card.svg?url";
import { createCardFaceResolver } from "./cardFaceResolver";

// Vite copies these PNGs into dist/assets and supplies real hashed URLs.
// Do not concatenate paths against a bundled manifest's hashed filename.
const bundledPngs = import.meta.glob<string>(
  "../../../../assets/cards/kickstarter-preview/png-webgame/fronts/*.png",
  { eager: true, query: "?url", import: "default" },
);
const assetUrls = Object.fromEntries(Object.entries(bundledPngs).map(([path, url]) => [path.slice(path.lastIndexOf("/fronts/") + 1), url]));

export const CARD_FACE_PLACEHOLDER = placeholderUrl;
const lookup = createCardFaceResolver(manifest, { placeholderUrl, assetUrls });

/** Synchronous URL lookup. Use definitionId for mapped gameplay cards;
 * existing unmapped Kickstarter samples are addressable only by previewId.
 * The manifest is bundled at build time: rebuild after replacing the import pack.
 */
export function resolveCardFace(cardId: string): string {
  return lookup(cardId);
}
