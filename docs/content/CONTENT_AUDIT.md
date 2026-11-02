# CONTENT-001 — Base card index audit

**Owner:** Content worker  
**Scope:** `docs/content/BASE_CARD_INDEX.csv` and this audit only  
**Status:** partial discovery index; not a complete publisher-verified content manifest.

## Coverage and reconciliation

The CSV has 96 unique named definitions, all in `hts.base.v1`, with 96 unique `card_id` values and no expansion rows. It indexes names found in the community-maintained base-deck inventory; every row is marked `secondary_discovery`, not `publisher_verified`. Card text/effects are intentionally not transcribed (`NOT_CAPTURED`).

| Component / group | Confirmed by publisher | Named rows / quantity in CSV | Reconciliation |
|---|---:|---:|---|
| Standard main deck | 115 | 115 known copies across Hero, Item, Cursed Item, Modifier, Magic and Challenge rows | Secondary inventory sums to publisher total; identity/count still not publisher-verified |
| Party Leader | 6 oversized | 6 rows / 6 copies | Name coverage from secondary source; publisher confirms quantity only |
| Monster | 15 oversized | 15 rows / 15 copies | Name coverage from secondary source; publisher confirms quantity only |
| Rules reference | 6 | Rule Card row has `UNKNOWN` quantity | Publisher confirms six references; CSV does not pretend the community row maps to all six |

Publisher component source: [Unstable Games product listing](https://unstablegames.com/products/here-to-slay-base-game-warriors-and-druids-expansion-bundle). Name/copy discovery source: [community base-deck inventory](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Inventory_List). The exact retail/Kickstarter/second-edition boundary is **UNKNOWN**; do not treat this CSV as edition-neutral.

## Expansion setup note for 7–8 players

Product decision is base-only 2–6 players; selecting an enabled expansion may unlock up to 8. Evidence of additional Party Leaders exists for Warriors and Druids (2), Berserkers and Necromancers (2), and Dragon Sorcerer (1). Banner Quest has 13 oversized cards, but their role split is **UNKNOWN**. None of these counts proves a valid 7–8-player setup, sufficient leader selection, deal size, or runtime eligibility.

The four expansion rows in `INITIAL_INVENTORY.md` remain separate. Needed before runtime support: official/edition-specific card manifests, Banner Quest oversized-card role mapping, setup/ruling for 7–8 players, and explicit expansion enablement/eligibility rules. No expansion is represented as implemented merely because a product page lists components.

## Checks and handoff

- `Import-Csv` parsed the file successfully.
- 96 rows; 96 unique IDs; 0 duplicate IDs; one set only (`hts.base.v1`).
- Known standard-card quantities sum to 115; `Rule Card` remains `UNKNOWN` and is excluded from that sum.
- No artwork was downloaded; no card effect or game code was added.
- Rights remain **UNVERIFIED**. Next input is an official edition-specific card list or source package; Rules/QA should review the 7–8 setup boundary before implementation.
