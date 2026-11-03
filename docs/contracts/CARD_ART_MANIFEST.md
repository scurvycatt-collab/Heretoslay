# Contract — card-art-manifest.json

Producer: `tools/import-card-art.ts` · Consumer: web CardRenderer · Served at `/assets/cards/card-art-manifest.json`.

```jsonc
{
  "schema": 1,
  "setId": "hts.base.v1",
  "rightsStatus": "UNVERIFIED",
  "generatedAt": "2026-11-03T07:38:01.583Z",
  "cards": {
    "hts.base.v1.hero.bad-axe": {
      "artUrl": "/assets/cards/hts.base.v1.hero.bad-axe.webp?v=f215136286", // ?v = sha256 prefix (cache-bust)
      "file": "hts.base.v1.hero.bad-axe.webp",
      "kind": "hero",
      "layout": "hero",            // key in CARD_TEMPLATE_SPEC.layouts (cursed_item -> item)
      "width": 545, "height": 545, // already cropped to layouts.<layout>.art (× --scale)
      "format": "webp",
      "sha256": "…",
      "sourceFile": "bad-axe.png", // basename only, no local paths
      "importedAt": "…"
    }
  }
}
```

Rules
- Keys are `definitionId` from `apps/worker/src/content/base-cards.json`; the card data file is never modified.
- A card absent from `cards` has no art → renderer keeps the placeholder.
- Image is pre-cropped to the art box; renderer draws it at the spec's `art.x/y/w/h` without further cropping.
- Manifest is merged across runs; entries for unknown ids or deleted files are pruned.
