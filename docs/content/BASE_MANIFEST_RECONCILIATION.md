# BR-01 — English Base manifest reconciliation

**Reviewed:** 2026-11-02  
**Scope:** bounded identity/copy reconciliation only. No effect-text scan, artwork download, license determination, runtime change, or edition promotion.

## Pinned source traces

| Trace | Pinned reference | Interpretation |
|---|---|---|
| Inventory | [English Base inventory](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Inventory_List&oldid=32728) | PM direct-IAB DOM review pinned public permalink `oldid=32728`. The page heading is “Here To Slay Base Deck - Inventory List”; visible sections are Party Leaders, Monsters, Heroes, Items, Cursed Items, Modifiers, Magic, Challenges and Rule Card. The page is community-hosted/publisher-linked. |
| Gallery | [English Base Deck card previews](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Card_Previews&oldid=42555) | Revision pinned to `oldid=42555`; PM DOM review captured each row’s gallery file name, thumbnail and card-page link. The separate [2nd Edition gallery](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Card_Previews_-_2nd_Edition&oldid=40557) was not merged. |
| Publisher aggregate | [Asmodee product evidence](https://www.asmodee.ca/en/product/here-to-slay/) and [retail rulebook](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf) | Authority is limited to aggregate contents/setup: 115 standard cards, 15 Monsters, 6 Leaders, 2–6 players. It does not make wiki row data publisher-verified. |

The companion CSV contains one row for every 74 main-deck IDs, 15 Monster IDs and 6 Leader IDs. Each row records the PM-reviewed inventory/card-page URL, edition heading, gallery section/file/thumbnail/card-page link, artifact status and reconciliation note. `Rule Card` is excluded because its inventory quantity is `?` and it is outside the requested 74/115 + 15 + 6 subset.

## Reconciliation result

| Subset | IDs | Copies | Source match | Status |
|---|---:|---:|---|---|
| Main deck | 74 | 115 | Inventory rows sum to 115; matches Asmodee aggregate only | **Arithmetic match; secondary** |
| Monsters | 15 | 15 | Inventory has 15 named rows at quantity 1; matches Asmodee aggregate | **Name/copy secondary; artifact not individually checked** |
| Party Leaders | 6 | 6 | Inventory has six named rows at quantity 1; matches Asmodee aggregate | **Six base artifacts visually checked; retail/full-manifest authority gated** |

## Match / mismatch / unknown

- **Match:** all six inventory Leader names and quantity 1; all fifteen Monster names and quantity 1; 74 main-deck IDs with 115 copies. The arithmetic agrees with the official aggregate counts.
- **Link-checked trace:** all 95 rows have PM-reviewed inventory/card-page and gallery file/thumbnail/card-page links in the CSV. This is link provenance only and does not mean the images or effects were verified.
- **Visual artifact subset:** the six Leader rows are additionally marked `visual_checked_secondary`; PM viewed their base scans. This is community-hosted, publisher-linked evidence, not publisher-hosted evidence.
- **Unknown:** retail-vs-KS-vs-2nd-edition identity for every row; per-card publisher authenticity; artwork/license status. Historical revision views were not inspected because the public historical URL required login; no historical content is claimed.
- **Mismatch:** none asserted from this bounded pass. The existing `BASE_CARD_INDEX.csv` uses `Artic Aries`, matching the inventory spelling; no correction was inferred from other editions/localizations.

## Gate

The reconciliation is **ready as a secondary discovery subset** for the six Leader artifacts and as an arithmetic/name trace for the 74/115 + 15 rows. It is **not ready for authoritative base catalog implementation**. Keep all rows `secondary_discovery` and rights `UNVERIFIED`; do not infer a publisher-verified manifest or license from matching totals.

## Checks / handoff

- Parsed output CSV: 95 rows = 74 main + 15 Monster + 6 Leader; main quantity sum = 115; zero duplicate IDs and zero PM review errors.
- Confirmed PM public permalinks inventory `32728` and gallery `42555`; did not claim historical view and did not merge 2nd Edition.
- No effect text was read, no art was downloaded, and no file outside `docs/content/**` was changed.
- **Blocker:** full retail/authenticity/license authority remains unresolved even though row links are checked.
- **Next:** owner may open a separately bounded provenance task for the remaining gallery artifact links; no implementation should consume this as authoritative data.
