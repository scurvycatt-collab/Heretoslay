# resolveCardFace — importer → CardRenderer

Implementation: `apps/web/src/cards/resolveCardFace.ts`.

```tsx
import { resolveCardFace, CARD_FACE_PLACEHOLDER } from "./cards/resolveCardFace";

const url: string = resolveCardFace(card.definitionId);
// url is either the Vite-resolved complete-face PNG or the bundled SVG placeholder.
// For component rendering (including image-load fallback):
// <CardFaceImage cardId={card.definitionId} label={card.name} />
```

- Synchronous, builds one Map at module load. Reads the generated manifest as a build-time JSON import. Replace pack/rebuild to update assets; this is not a runtime file watcher or server fetch.
- Current pack: `assets/cards/kickstarter-preview/png-webgame/manifest.json`, 69 PNGs. Its definitionId values are null. Use e.g. `resolveCardFace("ks-preview-01-r1-c2")` for preview; actual base IDs fall back until explicitly mapped. Never pass a hidden/unknown instance ID and infer its definition.
- Vite `import.meta.glob` resolves/copies actual PNGs into build assets; image URLs survive hashed filenames and deployment under a configured Vite base. Missing bundled files fall back rather than emitting guessed URLs.
- Unknown IDs, invalid entries, raw artwork, back/excluded assets, unsupported schema and ambiguous default mappings return `CARD_FACE_PLACEHOLDER`. Only variant `default` is auto-selected.
- `CardRenderer` uses a mapped complete face directly, without applying frame/text a second time. When no complete face is mapped it retains its existing SVG card template. `CardFaceImage` / unknown `CardById` use the generic image placeholder; image-load errors switch once to that placeholder.

## Connecting Claude's importer

Pure factory: `createCardFaceResolver` from `cardFaceResolver.ts` accepts an already-read manifest and `{ placeholderUrl, assetBaseUrl? , assetUrls? }`.

- Supports existing export `{schema:1, assetType:"complete-card-front", cards:[{previewId,definitionId,src}]}`.
- Supports `ASSET_IMPORT_WORKBENCH` manifest `{schema:1, mode:"mapped"|"preview", assets:[{candidateId,definitionId,variant,renderMode:"complete_face",relativePath}]}`. Preview mode indexes candidateId only; mapped mode also indexes explicit definitionId.
- `assetBaseUrl` is an absolute directory URL ending in `/`, e.g. `https://host.test/card-packs/base/`. Each PNG path is relative to that directory. Browser File/ZIP imports must first expose assets as owned blob URLs; pass `assetUrls` keyed by relativePath. Revoke those URLs when the pack is disposed.
- `assetUrls` takes precedence; a path absent from it is treated as missing. Sources' Windows paths never become browser image URLs.
- If the real importer emits another shape, add a small explicit adapter; do not guess IDs or mutate card data.

Checks: `node --test --experimental-strip-types tools/card-render/card-face-resolver.test.ts` and web build.
