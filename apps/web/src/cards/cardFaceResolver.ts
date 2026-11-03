export interface CardFaceResolverOptions {
  placeholderUrl: string;
  /** Directory URL of a deployed import pack, ending in '/'. */
  assetBaseUrl?: string;
  /** Vite-resolved URLs keyed by the manifest-relative path, e.g. fronts/a.png. */
  assetUrls?: Readonly<Record<string, string>>;
}

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);

function safePngPath(value: unknown): value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_ .\/-]+\.png$/i.test(value)) return false;
  return !value.startsWith("/") && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

/** Build once per manifest. Unknown, ambiguous or unusable entries resolve to placeholder.
 * Supports CardAssetManifest.assets and the existing 69-front export's cards array.
 * Only complete faces are accepted here; raw artwork belongs to the compositor.
 */
export function createCardFaceResolver(manifest: unknown, options: CardFaceResolverOptions): (cardId: string) => string {
  const faces = new Map<string, string>();
  const ambiguous = new Set<string>();
  const add = (id: unknown, url: string) => {
    if (typeof id !== "string" || !id.trim() || ambiguous.has(id)) return;
    if (faces.has(id)) { faces.delete(id); ambiguous.add(id); }
    else faces.set(id, url);
  };
  if (record(manifest) && manifest.schema === 1) {
    const canonical = Array.isArray(manifest.assets);
    const entries = canonical ? manifest.assets : manifest.cards;
    if (Array.isArray(entries)) for (const entry of entries) {
      if (!record(entry) || entry.side === "back" || entry.excluded === true) continue;
      if (canonical ? entry.renderMode !== "complete_face" : manifest.assetType !== "complete-card-front") continue;
      // Alternate selection is explicit; never let array order choose a variant.
      if (entry.variant !== undefined && entry.variant !== "default") continue;
      const path = canonical ? entry.relativePath : entry.src;
      if (!safePngPath(path)) continue;
      let url: string | undefined;
      if (options.assetUrls) {
        if (Object.hasOwn(options.assetUrls, path)) url = options.assetUrls[path];
      } else if (options.assetBaseUrl) {
        try { url = new URL(path, options.assetBaseUrl).href; } catch { /* Invalid base -> placeholder. */ }
      }
      if (!url) continue;
      const definitionId = typeof entry.definitionId === "string" ? entry.definitionId : null;
      // Preview packs cannot silently register gameplay mappings.
      if (!canonical || manifest.mode === "mapped") add(definitionId, url);
      const previewId = canonical ? entry.candidateId : entry.previewId;
      if (previewId !== definitionId) add(previewId, url);
    }
  }
  return (cardId: string) => faces.get(cardId) ?? options.placeholderUrl;
}
