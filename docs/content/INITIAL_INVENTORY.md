# CONTENT-001 — Initial inventory (base game)

**Owner:** Content worker  
**Scope:** `docs/content/INITIAL_INVENTORY.md` only  
**Input:** restored handoff docs; public publisher/rule sources  
**Output:** component baseline, stable card-ID proposal, and a small named-card sample  
**Acceptance:** counts have a publisher source; sample coverage and unknowns are explicit; no card text/effect is inferred.  
**Status:** discovery slice only; not a complete inventory and not ready to close CONTENT-001.

**Player capacity rule (product decision):** Base game supports 2–6 players. Selecting an expansion unlocks up to 8 players. The base game's 6 Party Leaders match the six-player cap, so no duplicate leaders are assumed. This capacity rule does not prove that any expansion currently has complete Party Leader/card/setup data; expansion readiness remains **UNKNOWN** per set.

## Verified component baseline

The publisher product listing identifies the base game as:

| Component | Quantity | Size / role | Evidence |
|---|---:|---|---|
| Main deck | 115 | Standard-sized cards | [Unstable Games product listing](https://unstablegames.com/products/here-to-slay-base-game-warriors-and-druids-expansion-bundle) |
| Party Leader | 6 | Oversized cards | same publisher listing |
| Monster | 15 | Oversized cards | same publisher listing |
| Rules reference | 6 | Reference cards | same publisher listing |
| Six-sided die | 2 | Dice | same publisher listing |

The retail rule sheet also describes the standard deck as containing Hero, Item, Magic, Modifier and Challenge cards, while Party Leaders and Monsters are separate oversized cards ([rule sheet copy](https://www.unstablegameswiki.com/images/7/73/Here-to-Slay-Rules.pdf)). The rule sheet copy is used only as a structural cross-check; the publisher listing is the source for the quantities above.

## Expansion inventory (initial, not complete)

These four expansions are tracked separately from `hts.base.v1`; do not merge their cards into the base set until edition boundaries are confirmed.

| Expansion / proposed `set_id` | Publisher-confirmed contents | New content or feature stated by source | Status |
|---|---|---|---|
| Warriors and Druids / `hts.warriors-druids.v1` | 31 standard cards, 2 oversized Party Leaders, 2 oversized Monsters, 1 rule book | New Warrior and Druid classes; publisher describes new leaders, Heroes and Monsters | Counts verified; exact card breakdown/effects UNKNOWN |
| Berserkers and Necromancers / `hts.berserkers-necromancers.v1` | 31 standard cards, 2 oversized Party Leaders, 2 oversized Monsters, 1 rule book | New Berserker and Necromancer content is identified by the expansion product; detailed feature/effect list UNKNOWN | Counts verified; exact breakdown UNKNOWN |
| Banner Quest / `hts.banner-quest.v1` | 32 standard cards, 13 oversized cards, 20 tokens, 1 rule book | New effects, mechanics and win conditions; players can claim Banners | Counts and Banner feature verified; card-role breakdown UNKNOWN |
| Dragon Sorcerer / `hts.dragon-sorcerer.v1` | 8 Dragon Sorcerer Heroes, 1 Dragon Sorcerer Party Leader, 1 Monster, 1 Magic, 1 Item, 2 Modifiers, 1 Challenge | Adds the Dragon Sorcerer class and its associated card types; source states the base six-class win condition is not changed | Kickstarter source verified; retail/second-edition packaging boundary UNKNOWN |

Sources: [publisher expansion bundle](https://unstablegames.com/it/collections/bundles/products/here-to-slay-deluxe-bundle-bq), [publisher Warriors and Druids listing](https://unstablegames.com/es/products/here-to-slay-warriors-and-druids-expansion), [publisher Banner Quest listing](https://unstablegames.com/es/products/here-to-slay-banner-quest-expansion), and [official BackerKit campaign update for Dragon Sorcerer](https://here-to-slay.backerkit.com/hosted_preorders/project_updates?page=7). No card text, effect, artwork, or rights status is inferred from these counts.

## Proposed stable ID schema

Use an immutable, namespaced ID rather than a display name:

`hts.<set_slug>.v1.<card_kind>.<canonical_slug>`

Examples: `hts.base.v1.party-leader.the-charismatic-song`, `hts.base.v1.hero.bad-axe`, `hts.warriors-druids.v1.hero.tenacious-timber`.

Suggested record fields:

| Field | Meaning |
|---|---|
| `card_id` | Stable machine ID; never recycle after publication |
| `set_id` | Edition-scoped namespace, e.g. `hts.base.v1` or `hts.banner-quest.v1` |
| `kind` | `party_leader`, `hero`, `monster`, `item`, `cursed_item`, `modifier`, `magic`, `challenge`, or `rule_card` |
| `canonical_name` | Source spelling; preserve punctuation in a separate display field if needed |
| `quantity` | Confirmed copy count, otherwise `UNKNOWN` |
| `source_urls` | Evidence for identity and count, separately linkable |
| `source_status` | `publisher_verified`, `secondary_discovery`, or `UNKNOWN` |
| `text_status` | `NOT_CAPTURED` until exact card text is sourced and transcribed |
| `rights_status` | `UNVERIFIED` for third-party artwork/text until reviewed |

Do not derive IDs from artwork, card effects, or translations. If a later official edition changes a card, create a new set/version namespace rather than silently changing the old record.

## Named sample (coverage is intentionally partial)

The names below are discovery samples from the community-maintained [base-deck inventory](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Inventory_List). They are **not publisher-verified**, and no text, effect, artwork, or quantity is asserted here. This sample covers 5 of the 9 proposed `kind` values; it is not a completeness claim.

| Proposed `card_id` | Kind | Name as found | Source status | Text/effect |
|---|---|---|---|---|
| `hts.base.v1.party-leader.the-charismatic-song` | party_leader | The Charismatic Song | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.party-leader.the-cloaked-sage` | party_leader | The Cloaked Sage | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.hero.bad-axe` | hero | Bad Axe | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.hero.beary-wise` | hero | Beary Wise | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.hero.lookie-rookie` | hero | Lookie Rookie | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.hero.bun-bun` | hero | Bun Bun | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.monster.anuran-cauldron` | monster | Anuran Cauldron | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.monster.bloodwing` | monster | Bloodwing | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.item.bard-mask` | item | Bard Mask | secondary_discovery | NOT_CAPTURED |
| `hts.base.v1.magic.critical-boost` | magic | Critical Boost | secondary_discovery | NOT_CAPTURED |

## Unknowns, dependencies, and handoff

- Full 115-card breakdown by type and copy count: **UNKNOWN** pending an official card list or source-file review.
- Retail vs Kickstarter/second-edition boundaries: **UNKNOWN**; do not merge those sets into `hts.base.v1`.
- Exact card text/effects, localization, and artwork mapping: **NOT CAPTURED**; rights remain **UNVERIFIED**.
- Dependency: Rules owner should confirm the intended base-game edition before this inventory is expanded.
- Check performed: source links were searched/opened on 2026-10-28 (Asia/Saigon); no repository tests apply to this documentation-only slice.
