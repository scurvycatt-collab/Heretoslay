# EG-PREP-001 — PLAY_CARD source slice

**Reviewed:** 2026-11-02  
**Scope:** exactly two base artifacts selected from the pinned English Base inventory/gallery trace. This is source input for Rules contract work, not an authoritative retail catalog. Rights remain `UNVERIFIED`; no artwork was downloaded or published.

## Source provenance

- Inventory permalink: [English Base inventory, `oldid=32728`](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Inventory_List&oldid=32728)
- Gallery permalink: [English Base Deck previews, `oldid=42555`](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Card_Previews&oldid=42555)
- PM DOM review in `docs/content/evidence/base-manifest-pm-review.json` joined each row’s inventory section, gallery file, thumbnail and card page. The source is publisher-linked/community-hosted; it is not publisher-hosted or license-verified.
- Card pages below are used for the visible base/KS PnP/shared mechanics entry only. Their page metadata also mentions later releases; no Playmat/2nd-Edition metadata is used to promote these rows.

## Artifact 1 — Magic

| Field | Evidence |
|---|---|
| Card ID / name / type | `hts.base.v1.magic.critical-boost` — **Critical Boost** — Magic; inventory quantity **2** |
| Inventory row | [Magic inventory/card row](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Critical_Boost) — pinned inventory revision `32728` |
| Gallery artifact | File `HtS-Base-017.png`; [file image URL](https://www.unstablegameswiki.com/images/7/77/HtS-Base-017.png); [thumbnail](https://www.unstablegameswiki.com/images/thumb/7/77/HtS-Base-017.png/100px-HtS-Base-017.png); gallery revision `42555`; [card page](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Critical_Boost) |
| Edition | English Base inventory/gallery artifact; card-page evidence lists the shared KS PnP/Base/2nd Edition mechanic. No later-edition metadata is used as authority. |
| Roll threshold | **N/A:** the visually checked Magic scan has no roll badge/threshold. |
| Target / timing | No target shown; visible sequence is draw 3 cards, then discard 1 card. Exact action-point/timing rule remains **UNKNOWN**. |
| Effect summary | **Draw 3 cards and discard 1 card.** The scan visibly reads “DRAW 3 cards and DISCARD a card.” |
| Evidence status | **Visual base-scan check plus secondary card-page evidence; mechanics usable as a candidate Rules case, not publisher-verified card text.** |

## Artifact 2 — Hero

| Field | Evidence |
|---|---|
| Card ID / name / type | `hts.base.v1.hero.dodgy-dealer` — **Dodgy Dealer** — Hero; inventory quantity **1** |
| Inventory row | [Hero inventory/card row](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Dodgy_Dealer) — pinned inventory revision `32728` |
| Gallery artifact | File `HtS-Base-041.png`; [file image URL](https://www.unstablegameswiki.com/images/1/12/HtS-Base-041.png); [thumbnail](https://www.unstablegameswiki.com/images/thumb/1/12/HtS-Base-041.png/100px-HtS-Base-041.png); gallery revision `42555`; [card page](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Dodgy_Dealer) |
| Edition | English Base inventory/gallery artifact; card-page evidence lists the shared KS PnP/Base/2nd Edition mechanic. No later-edition metadata is used as authority. |
| Roll threshold | **9+**, visibly printed on the Hero scan. |
| Target / timing | Target: another player; effect targets/trades that player’s hand. The scan does not resolve action cost or once-per-turn behavior. |
| Effect summary | **Trade hands with another player.** The scan visibly shows the same effect text. |
| Evidence status | **Visual base-scan check plus secondary card-page evidence; mechanics usable as a candidate Rules case, not publisher-verified card text.** |

## Rules-facing unknowns

- `Critical Boost` has no roll threshold on the checked Magic scan; Rules still needs the draw source, discard timing and whether the action cost is explicit.
- `Dodgy Dealer` visibly requires 9+ and trades hands with another player; Rules still needs play legality/action cost, target eligibility and hand-empty behavior.
- Both rows remain `secondary_discovery`; matching inventory quantity and gallery links do not establish retail authenticity, licensing or complete card text.

## Checks / handoff

- CSV mapping checked against `BASE_MANIFEST_RECONCILIATION.csv`: `Critical Boost` quantity 2 and `Dodgy Dealer` quantity 1; both use gallery revision `42555` and inventory revision `32728`.
- Two card pages and both public base scans were read; the first direct Critical Boost image request showed a Cloudflare verification page, then the public thumbnail/full image path succeeded. No effect-text sweep, historical view, image download, code, tracker, test, commit or deployment was performed.
- **Blocker:** several legality/timing fields remain unknown; Rules should model them as explicit cases, not guesses.
- **Next:** Rules may review these two candidate mechanics and return the missing contract fields before any PLAY_CARD implementation.
