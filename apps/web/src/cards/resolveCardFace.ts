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

// Packs exported by the asset-import workbench: assets/cards/packs/<pack-name>/{manifest.json,cards/*.png}.
const packManifests = import.meta.glob<unknown>("../../../../assets/cards/packs/*/manifest.json", { eager: true, import: "default" });
const packPngs = import.meta.glob<string>("../../../../assets/cards/packs/*/cards/*.png", { eager: true, query: "?url", import: "default" });
const packName = (path: string) => path.split("/packs/")[1].split("/")[0];

export const CARD_FACE_PLACEHOLDER = placeholderUrl;
const lookups = [
  // Pack order is alphabetical by folder name, so a conflict between packs is resolved deterministically
  // (first pack wins), never by load order. The Kickstarter preview sample is consulted last.
  ...Object.keys(packManifests).sort().map((path) => {
    const name = packName(path);
    const urls = Object.fromEntries(Object.entries(packPngs).filter(([p]) => packName(p) === name).map(([p, url]) => [p.slice(p.lastIndexOf("/cards/") + 1), url]));
    return createCardFaceResolver(packManifests[path], { placeholderUrl, assetUrls: urls });
  }),
  createCardFaceResolver(manifest, { placeholderUrl, assetUrls }),
];

/** Synchronous URL lookup. Use definitionId for mapped gameplay cards;
 * existing unmapped Kickstarter samples are addressable only by previewId.
 * Manifests are bundled at build time: rebuild (or restart `dev:web`) after adding or replacing a pack.
 */
export function resolveCardFace(cardId: string): string {
  for (const lookup of lookups) {
    const url = lookup(cardId);
    if (url !== placeholderUrl) return url;
  }
  return placeholderUrl;
}
