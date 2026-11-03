# Contract — card-art-manifest.json (artwork pack, schema 2)

Producer: `tools/import-card-art.ts` · Consumer: CardRenderer (composite input only).
This is the **raw artwork pack** of `ASSET_IMPORT_WORKBENCH.md` §0.2-C / §5.4 — NOT a complete-face pack.
A resolver must not show these images as finished card faces.

```jsonc
{
  "schema": 2,
  "packType": "artwork",
  "setId": "hts.base.v1",
  "rightsStatus": "UNVERIFIED",
  "gameplaySupported": false,
  "generatedAt": "2026-11-03T08:00:03.000Z",
  "cards": {
    "hts.base.v1.monster.dracos": {
      "definitionId": "hts.base.v1.monster.dracos",
      "mappingStatus": "confirmed",       // "confirmed" = file named with the full definitionId
                                           // "proposed"  = matched by kind.slug / slug / card name → needs review
      "matchMethod": "definitionId",       // definitionId | kindSlug | slug | name
      "inputType": "artwork",
      "renderMode": "artwork",             // composite into the template art box; never complete_face
      "kind": "monster",
      "layout": "monster",                 // key in CARD_TEMPLATE_SPEC.layouts (cursed_item → item)
      "relativePath": "hts.base.v1.monster.dracos.png",
      "artUrl": null,                      // set only when --out is inside apps/web/public (owner opted to publish)
      "width": 745, "height": 824,         // = layouts.<layout>.art.w/h × --scale
      "format": "png",
      "sha256": "…", "bytes": 12345,       // of the output file
      "source": { "relativePath": "sub/dracos.png", "sha256": "…", "width": 1200, "height": 700, "bytes": 23456 },
      "crop": { "x": 283, "y": 0, "w": 633, "h": 700 },  // integer px in the EXIF-upright source
      "rotation": 0,
      "fit": "cover",                      // cover | contain
      "contentRect": { "x": 0, "y": 0, "w": 745, "h": 824 }, // where source pixels sit in the output (contain → smaller, transparent padding)
      "importedAt": "…"
    }
  }
}
```

Rules
- Keys are `definitionId` from `apps/worker/src/content/base-cards.json` (read-only; never modified).
- A card absent from `cards` has no artwork → renderer keeps the placeholder.
- Only `mappingStatus: "confirmed"` entries should be loaded without human review.
- Image is pre-cropped to the art box; renderer draws it at the spec's `art.x/y/w/h` with no further crop.
- No absolute paths; all paths are POSIX, relative to the pack dir / input dir.
- Merged across runs only when the owner points `--out` at an existing pack; ids no longer in card data and vanished files are pruned. Schema-1 manifests are replaced.
