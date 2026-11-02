# DB-01 — Base source evidence

**Owner:** Content  
**Reviewed:** 2026-11-02  
**Scope:** base retail identity/copy readiness and six Party Leader ability summaries. This is source evidence only; it does not authorize runtime data or artwork use.

## Decision summary

The retail product boundary is supported for **aggregate contents and player count**, but not for a complete authoritative per-card manifest. The current `BASE_CARD_INDEX.csv` can remain a **secondary discovery manifest** only. Do not promote `hts.base.v1` rows to production-authoritative until an edition-aligned publisher card manifest/scan or publisher-linked export is supplied.

The bounded search found no publisher-hosted per-card list or complete publisher download for the English retail base deck. The official sources below describe contents and rules at aggregate level. Community pages expose per-card names, copy counts and ability text, but explicitly mix KS PnP, base, second-edition and later playmat releases; therefore they are useful for matching, not authority.

## Source register

| Ref | URL / page | Access / date | Edition or provenance | Evidence and limit |
|---|---|---|---|---|
| S1 | [Asmodee Canada product page](https://www.asmodee.ca/en/product/here-to-slay/) | accessed 2026-11-02 | Asmodee retail product page; no edition code shown | 2–6 players; 115 standard cards, 6 Party Leaders, 15 Monsters, 6 reference cards, 2 dice. Official aggregate only; no per-card IDs/copies/text. |
| S2 | [Unstable Games retail product](https://buyunstablegames.shop/products/here-to-slay-base-game) | accessed 2026-11-02 | Merchant page using Unstable Games branding; first-party status not independently established | Same contents; says print runs may vary slightly in card-back color. **Unverified merchant evidence only**; not used as authoritative publisher proof or card manifest. |
| S3 | [Kickstarter campaign](https://www.kickstarter.com/projects/ramybadie/here-to-slay) | accessed 2026-11-02 | Campaign ran 2020-01-21 to 2020-02-11; last updated 2021-03-11 | Publisher/creator campaign provenance. It is not evidence that KS PnP cards equal the later retail/2nd-edition deck. |
| S4 | [Official retail rulebook link](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf), pp.1–2 | accessed 2026-11-02 | Asmodee-hosted retail rules PDF | Confirms box counts, setup and that each Leader has a class/skill; does not enumerate Leader names or individual skills. |
| S5 | [Community English base inventory](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Inventory_List) and [cards-in-deck list](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Cards_In_This_Deck) | accessed 2026-11-02 | Community-maintained. `unstablegames.com` currently redirects to TeeTurtle and its footer links to the wiki main page; this is publisher-linked provenance for the site, not per-row publisher verification. The page separates English base and English 2nd Edition, but current row provenance is not independently fixed. | Discovery of names and copy counts. Secondary; not sufficient to choose retail vs KS/2nd edition. |
| S6 | [Community card page: The Charismatic Song](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_The_Charismatic_Song) and [five linked Leader pages](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_The_Cloaked_Sage) | accessed 2026-11-02 | Community transcription; page labels include Base, KS PnP, 2nd Edition and 2025 Playmat Edition | Discovery of ability summaries and release quantities. Secondary; text is not promoted to authoritative. |
| S7 | [Community PnP transcription](https://www.unstablegameswiki.com/images/3/37/HTSpnp_3.5.2020-16.pdf) | accessed 2026-11-02 | KS PnP dated 2020-03-05 in filename/page context | Provides readable six-Leader text and extracted classes for the PnP artifact. It is not retail proof. Any class disagreement with S6 is treated as **unconfirmed extraction**, not a product-level mismatch, until the card image/field is checked against a fixed edition. |
| S8 | [Base Deck card previews/gallery](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Card_Previews) → six base scans listed in [BASE_LEADER_ARTIFACT_CHECK.md](BASE_LEADER_ARTIFACT_CHECK.md) | PM visual check, 2026-11-02; file history observed for the gallery files | Publisher-linked wiki gallery/file usage; images are base scans, not a publisher-hosted manifest | All six indexed Leader artifacts have visually checked class and ability fields. This is a ready **artifact subset**, not proof of retail authenticity for the whole manifest. |

## Manifest match and copy gate

`BASE_CARD_INDEX.csv` currently contains 96 unique IDs. Its secondary rows reconcile to the official aggregate as follows:

| Subset | Index rows / copies | Official comparison | Readiness |
|---|---:|---|---|
| Main deck: Hero | 48 / 48 | Included in S1/S2 total only | **Secondary match; not authoritative** |
| Main deck: Item + Cursed Item | 12 / 15 | Included in S1/S2 total only | **Secondary match; not authoritative** |
| Main deck: Magic | 8 / 13 | Included in S1/S2 total only | **Secondary match; not authoritative** |
| Main deck: Modifier | 5 / 25 | Included in S1/S2 total only | **Secondary match; not authoritative** |
| Main deck: Challenge | 1 / 14 | Included in S1/S2 total only | **Secondary match; not authoritative** |
| **Main deck subtotal** | **74 / 115** | **Matches official 115 standard cards** | **Aggregate arithmetic only** |
| Monster | 15 / 15 | Matches official 15 oversized Monsters | **Names/copies secondary** |
| Party Leader | 6 / 6 | Matches official 6 oversized Leaders | **Six base-scan artifacts visually checked; retail/full-manifest authority still gated** |

The 74 IDs and 115 copies above are the exact rows in `BASE_CARD_INDEX.csv`; the BR-01 trace is preserved in [BASE_MANIFEST_RECONCILIATION.csv](BASE_MANIFEST_RECONCILIATION.csv) and [BASE_MANIFEST_RECONCILIATION.md](BASE_MANIFEST_RECONCILIATION.md). The count match does not prove edition alignment, exact card identity, or card text. The rule/reference row has quantity `UNKNOWN` and is outside the 115-card main-deck subtotal.

## Six Party Leaders — item→ID, copy, ability summary

All six rows below map to one index ID and quantity 1. Ability summaries are paraphrases of S6–S8 and the visual check in [BASE_LEADER_ARTIFACT_CHECK.md](BASE_LEADER_ARTIFACT_CHECK.md), not licensed card text.

| Index ID / item | Copy | Community ability summary | Match / mismatch / gate |
|---|---:|---|---|
| `hts.base.v1.party-leader.the-charismatic-song` — The Charismatic Song | 1 | When rolling to use a Hero effect, add +1. | S8 visual check confirms this base scan’s field as **Bard** and the +1 ability. Retail edition/authenticity and the other five Leader artifacts remain gated. |
| `hts.base.v1.party-leader.the-cloaked-sage` — The Cloaked Sage | 1 | Each time you play a Magic card, draw a card. | Text matches S6/S7; edition remains mixed/secondary. |
| `hts.base.v1.party-leader.the-divine-arrow` — The Divine Arrow | 1 | When rolling to attack a Monster, add +1. | Text matches S6 and S7; edition remains mixed/secondary. |
| `hts.base.v1.party-leader.the-fist-of-reason` — The Fist of Reason | 1 | When rolling to Challenge, add +2. | Text matches S6/S7; edition remains mixed/secondary. |
| `hts.base.v1.party-leader.the-protecting-horn` — The Protecting Horn | 1 | When playing a Modifier on a roll, choose +1 or −1 to that roll. | Text matches S6/S7; edition remains mixed/secondary. |
| `hts.base.v1.party-leader.the-shadow-claw` — The Shadow Claw | 1 | Once per turn on your turn, spend an action point to take a card from another player’s hand. | S8 visual check confirms the base artifact field; S4 publisher rulebook confirms this Leader cannot be used in 2-player games. |

S4 independently confirms the general Leader model (one class and one skill) and gives the example “play a Magic card, draw a card,” but does not identify that example as a named card. It therefore cannot resolve the per-card gate.

## Readiness / next minimum evidence

- **Ready:** retail aggregate boundary: 2–6 players, 115 standard cards, 15 Monsters, 6 Leaders; main/index arithmetic matches those totals.
- **Subset ready:** six Party Leader artifact scans with class and ability fields are visually checked; see [BASE_LEADER_ARTIFACT_CHECK.md](BASE_LEADER_ARTIFACT_CHECK.md).
- **Not ready:** authoritative item→ID/copy mapping, retail-vs-KS-vs-2nd-edition boundary, full retail-manifest authenticity, and per-card text for the 115-card main deck. The visual subset does not establish artwork/license status. The Shadow Claw 2-player restriction is publisher-rulebook-supported.
- **Do not infer:** `v1` from the filename, retail equivalence from matching totals, or “publisher source” from a community mirror.
- **Minimum unblocker:** an English retail edition-specific publisher card manifest, card scan/download, or publisher-linked source that fixes edition and exposes the 115-card identity/copy list. The six Leader artifact subset is now checked, but all current rows remain `secondary_discovery` and rights `UNVERIFIED` until the full boundary is resolved.

## Checks / handoff

- Parsed `BASE_CARD_INDEX.csv`: 96 unique IDs; 74 main-deck IDs / 115 copies; 15 Monster IDs / 15 copies; 6 Leader IDs / 6 copies.
- Bounded search reviewed official Asmodee/Unstable retail pages, the creator Kickstarter page, official rulebook link, and community inventory/card pages; no artwork downloaded and no runtime/test/tracker file changed.
- **Blocker:** no edition-aligned publisher per-card manifest found; six Leader base-scan artifacts are checked, but full retail/authenticity/licensing remains unresolved.
- **Next:** PM review whether to open a narrowly scoped source-recovery task for the missing retail manifest; do not implement base card data from this evidence.
