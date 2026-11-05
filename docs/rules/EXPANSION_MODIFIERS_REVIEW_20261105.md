# Expansion Modifier contract — M01–M08 approved, 5 November 2026

These are eight source-face variants, not verified physical quantities. Same displayed numeric labels do not imply the same card definition/effect as base cards. English wording was inspected on the linked faces; several wiki text-page requests returned cache errors, so the source-face links are provided directly. Owner decisions below are project contracts and supersede earlier proposals. Existing C10 multi-play/final-Skip/fixed-deadline behavior remains in force. See [approved E09 and Claude instructions](../decisions/EXPANSION_OWNER_DECISIONS_20261105.md).

| ID | Set / label | Printed behavior, paraphrased | Owner-approved resolution |
|---|---|---|---|
| **M01** | WD +1/-1 | Select +1 or -1 on the roll; the player using this card also draws two. | DRAW 2 after the roll resolves; no draw during its open window. |
| **M02** | WD +2/-1 | Select +2 or -1; the card's user also draws one. | DRAW 1 after the roll resolves, as M01. |
| **M03** | WD +4 | Add four; if the roll is modified above twelve, the card's user draws one. | Inspect final total after roll resolution: >12 draws1; <=12 draws0. |
| **M04** | WD -4 | Subtract four; if modified below two, the user chooses a discard-pile card to add to hand. | Inspect final total: <2 grants recovery; >=2 none. The same resolving physical -4 card cannot recover itself. |
| **M05** | BN +2/-2 | Normally +2 or -2; conditional attack adjustment. | Choose +4/-2 on user's own Monster attack; otherwise +2/-2. No third-party +4. |
| **M06** | BN +7 | Discard remaining hand and add seven to the roll. | Empty remaining hand is legal; discard0. Played Modifier is separate from hand. |
| **M07** | DS +6 | Discard another hand card and add six to the roll. | Pay a separate selected card before +6; no full payment means no adjustment. |
| **M08** | DS -6 | Discard another hand card and subtract six from the roll. | Same payment rule as M07, then -6. |

## Exact face sources

- M01: [WD +1/-1 face](https://www.unstablegameswiki.com/images/0/09/HtS-WarDruid-012-2.png).
- M02: [WD +2/-1 face](https://www.unstablegameswiki.com/images/1/16/HtS-WarDruid-013-2.png).
- M03: [WD +4 face](https://www.unstablegameswiki.com/images/d/dd/HtS-WarDruid-010-2.png).
- M04: [WD -4 face](https://www.unstablegameswiki.com/images/4/4f/HtS-WarDruid-011-2.png).
- M05: [BN +2/-2 face](https://www.unstablegameswiki.com/images/a/aa/HtS-BersNecr-019.png).
- M06: [BN +7 face](https://www.unstablegameswiki.com/images/d/db/HtS-BersNecr-020.png), [wiki text](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Modifier_%2B7).
- M07: [DS +6 face](https://www.unstablegameswiki.com/images/b/b7/HtS-Drag-004-2E.png), [wiki text](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Modifier_%2B6).
- M08: [DS -6 face](https://www.unstablegameswiki.com/images/2/29/HtS-Drag-003-2E.png), [wiki text](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Modifier_-6).

M05 qualification corrects the earlier audit's shorthand "attack-roll context": the owner chose +4/-2 specifically for the user's own attack. Merely targeting another player's attack never grants +4. This approval does not turn a Hero/Challenge roll into an attack roll.

## Shared timing and acceptance boundaries

1. M01–M04 follow-ups occur after the original roll resolves. Their newly drawn/recovered cards cannot reenter that closed roll window or alter its frozen outcome. A later new roll has its own window.
2. M07/M08 payment and all card-level resolution are persisted/idempotent; no payment choice resets the original reaction deadline. Use the established payment/timeout rules, without granting unpaid numeric changes.
3. Prohibitions on Modifier **cards** remain separate from Leader/Item abilities. Dragalter copies numbers only under E12; it does not replay these side effects.
4. C03 nested resolution and C04 terminal award remain in force. Never process queued gameplay draws/recoveries after GAME_OVER. Keep exact roll-side references and one follow-up per qualifying physical Modifier use.

## Acceptance for implementation

Test each identity independently, both Challenge sides, own/other rolls, separate payment, conservation/replay/recovery, pending/discard transitions and draw privacy. Final-total examples: M03 9→13→10 draws0, final13 draws1, final12 draws0; M04 5→1→4 recovers0, final1 recovers1, final2 recovers0. M04 cannot retrieve itself; M05 own attack offers+4/-2, another attack and own Hero roll offer+2/-2. Preserve final Skip, fixed deadlines, independent Shaman and terminal suppression. Do not enable packs by testing only numeric deltas.
