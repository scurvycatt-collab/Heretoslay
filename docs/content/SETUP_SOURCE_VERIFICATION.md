# SL-04 — Setup source verification

**Owner:** Content  
**Scope:** publisher/edition verification for base setup data; no runtime catalog  
**Status:** no item promoted from `secondary_discovery` to authoritative.

## Source and provenance review

| Item | Source / page | Edition/provenance | Status |
|---|---|---|---|
| Base component counts | [Asmodee rulebook](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf), p.1, “WHAT’S IN THE BOX” | Retail rulebook PDF; publisher-hosted CDN | **Verified aggregate only:** 115 standard, 6 Leaders, 15 Monsters, 6 reference cards, 2 dice |
| Setup deal | Same PDF, p.1, “HOW TO START” | Same retail rulebook | **Verified:** deal 5 standard cards/player; reveal 3 Monsters; remainder forms decks |
| Leader identity/skills | Same PDF, p.2, “THE PARTY LEADERS” | Same retail rulebook | **Verified only:** Leaders are oversized, class-bearing, and have skills; names and six individual skills are not enumerated |
| Six Leader names/ability summaries | [public print-and-play reproduction](https://www.unstablegameswiki.com/images/3/37/HTSpnp_3.5.2020-16.pdf) | Community-hosted reproduction; edition provenance not independently established | **Secondary discovery only**; no promotion to verified card text |
| Main/Monster ID→copy mapping | `BASE_CARD_INDEX.csv`, `CONTENT_AUDIT.md`, [community inventory](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Inventory_List) | Community-maintained inventory; edition boundary unclear | **Secondary discovery only:** 74 main IDs/115 copies and 15 Monster IDs/15 copies reconcile arithmetically, not authoritatively |

The current `SETUP_DATA_READINESS.md` remains correct: no authoritative deck can be built from the index. The publisher source verifies totals and setup operations, not per-card identity, copy mapping, or individual Leader skills.

## Remaining gaps / gate

- Need an edition-specific publisher card manifest or source package for all base card IDs, copy counts, and exact Leader skills.
- Need to resolve retail vs Kickstarter/second-edition scope before assigning `v1` as authoritative.
- Duplicate Party Leaders remain disallowed by owner decision; Leader selection ordering/tie-break remains **UNKNOWN** from the rulebook.
- Expansion/7–8-player readiness is outside this source verification and remains **UNKNOWN**.

## Checks and handoff

- Re-read `SETUP_VERIFIED.md`, `SETUP_DATA_READINESS.md`, `BASE_CARD_INDEX.csv`, `CONTENT_AUDIT.md`, and the dispatch scope.
- Parsed CSV and confirmed 74 main IDs/115 indexed copies, 15 Monster IDs/15 indexed copies, and 6 Leader IDs.
- Opened the publisher-hosted rulebook on 2026-10-29; it is a 2-page PDF and the cited setup/count text is present.
- No artwork, runtime catalog, code, tracker, commit, or deployment changed.

**Blocker:** authoritative per-card source/edition manifest is missing.  
**Next:** PM/Rules may decide whether secondary discovery is acceptable for a non-authoritative demo; production setup data must wait for the manifest.
