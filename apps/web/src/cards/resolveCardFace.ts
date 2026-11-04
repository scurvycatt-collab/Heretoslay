import placeholderUrl from "./placeholder-card.svg?url";
import { createCardArtResolver, createCardFaceResolver } from "./cardFaceResolver";

// Card images are WebP (same pixel size as the source PNG exports). Vite copies them into dist/assets
// and supplies real hashed URLs. Do not concatenate paths against a bundled manifest's hashed filename.
//
// Asset layout (see assets/cards/README.md):
//   assets/cards/base/<pack>/{manifest.json,cards/*.webp}                 base game packs
//   assets/cards/expansions/<expansion>/<pack>/manifest.json (+ images)   one folder per expansion
// Base packs are consulted first, then expansions; inside each group the order is alphabetical by path,
// so a conflict is resolved deterministically (first pack wins), never by load order.
const packManifests = import.meta.glob<unknown>(
  ["../../../../assets/cards/base/*/manifest.json", "../../../../assets/cards/expansions/**/manifest.json"],
  { eager: true, import: "default" },
);
const packImages = import.meta.glob<string>(
  [
    "../../../../assets/cards/base/*/cards/*.webp",
    "../../../../assets/cards/expansions/**/cards/*.webp",
    "../../../../assets/cards/expansions/**/fronts/*.webp",
  ],
  { eager: true, query: "?url", import: "default" },
);
const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/manifest.json"));
const group = (path: string) => (path.includes("/cards/base/") ? 0 : 1);

export const CARD_FACE_PLACEHOLDER = placeholderUrl;

const packs = Object.keys(packManifests)
  .sort((a, b) => group(a) - group(b) || a.localeCompare(b))
  .map((path) => {
    const dir = dirOf(path);
    // Manifest-relative path ("cards/x.webp", "fronts/x.webp") → bundled URL.
    const urls = Object.fromEntries(
      Object.entries(packImages)
        .filter(([p]) => p.startsWith(`${dir}/`))
        .map(([p, url]) => [p.slice(dir.length + 1), url]),
    );
    return { manifest: packManifests[path], urls };
  });
const lookups = packs.map((pack) => createCardFaceResolver(pack.manifest, { placeholderUrl, assetUrls: pack.urls }));
const artLookups = packs.map((pack) => createCardArtResolver(pack.manifest, { assetUrls: pack.urls }));

/** Illustration-only artwork for a definition (mapped packs), composited by CardRenderer. */
export function resolveCardArt(definitionId: string): string | undefined {
  for (const lookup of artLookups) {
    const url = lookup(definitionId);
    if (url) return url;
  }
  return undefined;
}

/** Synchronous URL lookup. Use definitionId for mapped gameplay cards;
 * unmapped expansion previews are addressable only by previewId.
 * Manifests are bundled at build time: rebuild (or restart `dev:web`) after adding or replacing a pack.
 */
export function resolveCardFace(cardId: string): string {
  for (const lookup of lookups) {
    const url = lookup(cardId);
    if (url !== placeholderUrl) return url;
  }
  return placeholderUrl;
}
