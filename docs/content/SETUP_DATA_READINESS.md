# PS-02 — Setup data readiness

**Owner:** Content  
**Scope:** base setup data only; no runtime/code change  
**Status:** partial; Leader abilities remain secondary discovery.

## Party Leaders

The six IDs are present in `BASE_CARD_INDEX.csv`. The Asmodee rulebook verifies six oversized Party Leaders and that each player chooses one, but does not enumerate per-card abilities. Ability summaries below come from a publicly hosted print-and-play reproduction and are **not publisher-verified**; they must not be treated as final card text.

| `card_id` | Class | Ability summary (not verbatim card text) | Identity | Ability | Source |
|---|---|---|---|---|---|
| `hts.base.v1.party-leader.the-charismatic-song` | Bard | Add 1 to rolls for Hero effects. | secondary_discovery | secondary_discovery | [public print-and-play PDF](https://www.unstablegameswiki.com/images/3/37/HTSpnp_3.5.2020-16.pdf) |
| `hts.base.v1.party-leader.the-cloaked-sage` | Wizard | Draw a card when playing a Magic card. | secondary_discovery | secondary_discovery | same PDF |
| `hts.base.v1.party-leader.the-divine-arrow` | Ranger | Add 1 to rolls when attacking a Monster. | secondary_discovery | secondary_discovery | same PDF |
| `hts.base.v1.party-leader.the-fist-of-reason` | Fighter | Add 2 to rolls when challenging. | secondary_discovery | secondary_discovery | same PDF |
| `hts.base.v1.party-leader.the-protecting-horn` | Guardian | Each Modifier played on a roll adds 1 or subtracts 1. | secondary_discovery | secondary_discovery | same PDF |
| `hts.base.v1.party-leader.the-shadow-claw` | Thief | Once per turn, spend 1 AP to take a card from another player’s hand. | secondary_discovery | secondary_discovery | same PDF |

**Verified boundary:** Asmodee’s [product page](https://www.asmodee.ca/en/product/here-to-slay/) and [rulebook](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf) verify the base six-player cap, six Leaders, and Leader selection; they do not verify these six ability texts.

## Deck counts and setup state

| Data | Status | Source / derivation |
|---|---|---|
| Main deck: 115 standard cards before deal | **verified quantity** | Asmodee product/rulebook |
| Initial hand: 5 cards per player | **verified rule** | Asmodee rulebook, setup |
| Main deck after deal | **derived count**: `115 - (5 × player_count)` | Arithmetic from verified values; valid for 2–6 base players |
| Monster cards: 15 oversized before setup | **verified quantity** | Asmodee product/rulebook |
| Face-up Monsters at setup | **verified rule**: 3 | Asmodee rulebook |
| Face-down Monster deck after setup | **derived count**: 12 | `15 - 3`, before any Monster is slain |

## Card-ID readiness gate

| Deck / component | Card IDs currently indexed | Indexed quantity | Readiness |
|---|---:|---:|---|
| Main deck (`hero`, `item`, `cursed_item`, `modifier`, `magic`, `challenge`) | 74 | 115 known copies | Quantity total reconciles to the publisher’s 115, but all rows are `secondary_discovery`; card identity/copy mapping is not authoritative. **Do not build the authoritative deck from this file yet.** |
| Monster deck | 15 | 15 known copies | Quantity reconciles to publisher count; identities remain `secondary_discovery`, so authoritative Monster deck is also blocked. |
| Party Leaders | 6 | 6 known copies | IDs/count align with base component count; ability text remains `secondary_discovery`. |

The index has no missing quantity for the named main/Monster rows, but its source does not prove edition mapping or publisher identity. No card-ID mismatch is claimed resolved beyond the secondary inventory’s arithmetic. Expansion setup and 7–8-player sufficiency remain **UNKNOWN**. Duplicate Party Leaders are disallowed by owner decision; selection ordering/tie-break remains UNKNOWN. No artwork or effect code was added.

## Handoff

- Checks: read `SETUP_VERIFIED.md`, `BASE_CARD_INDEX.csv`, `INITIAL_INVENTORY.md`, and `CONTENT_AUDIT.md`; confirmed all six IDs exist and are unique; checked arithmetic above.
- Blocker: need an edition-specific authoritative card source to promote abilities from `secondary_discovery`.
- Next: Rules/QA review the ability source and Architecture defines setup validation; do not enable expansion capacity from counts alone.
