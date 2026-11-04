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
    kickstarter/             Kickstarter Exclusive Pack — an expansion, not base game
      preview/               local visual-test set (unmapped; gameplaySupported=false)
```

* Every pack is `manifest.json` + `cards/*.webp`. Images are **WebP** (quality 90) at the exact pixel size of the
  original PNG exports; PNG is no longer shipped (≈150 MB → ≈11 MB).
* Packs are bundled by `apps/web/src/cards/resolveCardFace.ts`. Base packs are consulted first, expansions after,
  alphabetical inside each group. A new expansion = a new folder `expansions/<name>/<pack>/`; no code change.
* Pack source zips live outside the repo (`E:\Code\Card asset\<Base game|expansion>\`).
* Rights: FAN_MADE_NON_COMMERCIAL (ADR-004); takedown contact scurvycatt@gmail.com.
