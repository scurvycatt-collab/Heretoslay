# Card assets

```
assets/cards/
  base/                      Base game (set hts.base.v1) — what the game ships
    01-base-faces/           complete card faces (modifiers)
    02-base-art-a/           illustration-only art (heroes, monsters, leaders, items, magic)
    03-base-art-b/           illustration-only art (items, masks)
    04-base-challenge/       Challenge card art (from the PnP base sheet)
    05-base-pnp-fill/        art that was missing from the mapped packs (Mighty Blade, Sealing Key)
  expansions/
    warriors-druids/faces/           35 complete faces (set hts.warriors-druids.v1), mapped, playable
    berserkers-necromancers/faces/   33 complete faces (set hts.berserkers-necromancers.v1), mapped, playable
    dragon-sorcerer/faces/           16 complete faces (set hts.dragon-sorcerer.v2), mapped, playable
    kickstarter/             Kickstarter Exclusive Pack — an expansion, not base game
      preview/               local visual-test set (unmapped; gameplaySupported=false)
```

* Every pack is `manifest.json` + `cards/*.webp`. Images are **WebP** (quality 90) at the exact pixel size of the
  original PNG exports; PNG is no longer shipped (≈150 MB → ≈11 MB).
* Packs are bundled by `apps/web/src/cards/resolveCardFace.ts`. Base packs are consulted first, expansions after,
  alphabetical inside each group. A new expansion = a new folder `expansions/<name>/<pack>/`; no code change.
* The three playable expansion packs are built by `python3 tools/import-expansion-faces.py "<owner Expansion folder>"`
  from the owner's `restored-png/` copies (generative watermark removal of the reviewed wiki faces; small
  art/typography differences are possible). Each face is mapped to its definitionId by the sha256 of the
  reviewed source face in `expansion-drafts.ts`. Rules always come from card data, never from the image.
* Pack source zips live outside the repo (`E:\Code\Card asset\<Base game|expansion>\`).
* Rights: FAN_MADE_NON_COMMERCIAL (ADR-004); takedown contact scurvycatt@gmail.com.
