# Expansion owner decisions — 5 November 2026

Authority: owner responses E01–E16 in the expansion review chat, plus explicit Grimoire clarification. This is a project contract, not a claim of publisher rulings. Implementation owner proposed: Claude. No gameplay implementation, merge or deployment is claimed.

Inputs: [expansion audit](../qa/EXPANSION_RULES_AUDIT_20261105.md), [84-face evidence matrix](../rules/EXPANSION_CARD_REVIEW_20261105.md), [base C01–C12 contract](RULES_AUDIT_OWNER_DECISIONS_20261104.md). Latest explicit decisions here override conflicting earlier proposals/C rules only for the stated scope. **E01–E16, including E09/M01–M08, are now owner-approved.** Production implementation and evidence gates remain separate.

## Approved behavior

### E01 — Profiles and victory

Approved proposal: base-only requires six distinct classes; any supported enabled pack among WD, BN and DS requires seven, including mixed profiles. Do not add another required class per pack. Count the Leader and effective Mask classes at the end of the acting player's own turn. Three Monsters remains the alternative win. DS-only/mixed seven-class setting is now an owner-approved project policy, not a newly verified publisher ruling.

### E02 — Printed two-Item trait and equip ownership override

Approved: two-slot capacity belongs to the printed Hero definition/icon, independently of effective class. Owner permits a manual reviewed map because relatively few Heroes have that trait. One Mask-titled Item maximum per Hero; Cursed Items consume capacity. Mask changes do not add/remove slots. All attached Items follow the Hero's STEAL/DESTROY/return unless a specific effect says otherwise.

**New owner override:** both ordinary and Cursed Items can equip any player's eligible Hero. This replaces the older own-Hero-only ordinary Item restriction (C09/Q-06). Treat it as the revised shared equip rule; apply consistently to direct and effect-granted plays, server validation, free-play eligibility, bots, catalog metadata and UI. A pack-specific divergence must not be invented.

Acceptance: both types equip an opposing Hero with a free slot; occupied/full slot or Leader rejected; eight marked face records manually mapped with evidence; masked/nonmasked capacity unchanged; bundles move/discard once; exact Item selection for removal or theft.

Reviewed two-slot mapping candidates from the linked face inventory: WD **Agile Dagger, Critical Fang, Looting Lupo, Tenacious Timber**; BN **Gruesome Gladiator, Meowntain, Rabid Beast, Vicious Wildcat** (inventory rows 13,15,17,19,50,51,52,54). Map by edition-aligned definition ID after catalog creation, never display-name matching at runtime. Recheck each printed icon when importing the actual playable definition.

### E03 — Low rolls, signed buffs and independent Noble Shaman popup

Approved: explicit lte checks for low-roll Heroes; positive/negative adjustments retain their mathematical sign; Mask does not rewrite a printed comparator. Majestelk's +5/-5 sign may be selected separately for each qualifying roll during its duration.

For the Noble Shaman holder, show a separate popup alongside the Modifier selection window: **"Do you want to use Party leader passive"**. Yes applies -1 to the chosen roll; No declines. Modifier Skip does not dismiss, consume, or disable this independent choice. Use at most once on each player's turn; a No does not itself use the skill. Select an exact side when a Challenge exposes two rolls.

Implementation consequence of independence: all Modifier Skips must not prematurely discard an already-pending Shaman choice; require its answer or the same original reaction deadline before final resolution. Neither popup nor a late answer resets that deadline. This is a coordination requirement derived from the approved independence, not a second timer policy. Persist passive response/use separately from Modifier responder state.

Acceptance: Yes/No, Modifier Skip before/after passive response, no second use that turn after Yes, next player's turn reset, exact roll side, disconnect/expiry, no accidental prohibition under a Modifier-card-only ban.

### E04 — C08 default; explicit repeat exceptions

Approved: keep C08's shared one-attempt-per-Hero-per-turn rule by default. Explicit card text has priority for qualifying repeat/retry permissions; it must still satisfy other requirements. Generic departure/reentry is not automatically an exception or allowance reset.

Bottomless Bag permits additional paid attempts only for its equipped Hero. Mirroryu/Goblet follow their explicit extra-attempt scope. **Goblet's immediate retry costs no additional AP.** Owner requests careful text review and allows clarification for unresolved combinations; do not introduce arbitrary gameplay restrictions merely to prevent a long legal sequence. Bound execution per transaction, persist continuation/choices, keep final deadlines, and prevent duplicate event resolution or unintended self-recursion.

Acceptance: used/unused Hero, paid/AP exhaustion, Item removed, retry gets fresh roll/window, correct +3 placement for Mirroryu, self-target exclusion from its wiki clarification, recovery mid-chain. If a new combination lacks sufficient wording, record it explicitly rather than broadening the exception silently.

### E05 — PLAY versus bring and sequential nested plays

Approved proposal: explicit PLAY is Challengeable and offers a free entry roll subject to allowance/exceptions; generic bring/STEAL/move does not grant one. Shamanaga has its separately printed roll and later sacrifice. Up-to-two plays resolve sequentially, with the first child's full chain completed before offering/resolving the next.

### E06 — Typed payments; credited sacrifice despite Maegisty/Decoy

Approved typed payments, counts and recovery of a just-sacrificed eligible card. A sacrificed Hero with attachments pays one Hero cost, not several selected cost units. Leaders/slain Monsters are not ordinary sacrifice targets.

**Explicit owner exception to the previous proposal:** Maegisty and Decoy Doll still count as a qualifying Hero SACRIFICE for the initiating cost/effect. Resolve this step and its special movement before continuing the effect. For Maegisty, the sacrificed Hero returns to the owner's hand; for Decoy Doll, discard that particular Doll and keep the protected Hero. The required Hero-sacrifice cost is credited in either case. Do not turn this into a generic permission to substitute any Item for a Hero payment.

Represent credited sacrifice separately from final physical movement, linked by a single event/cause ID. A pending/temporary location must never make the Hero both in hand and Party. Do not invent a second credited sacrifice for the Doll's disposal and double-trigger per-sacrifice rewards. This exception is specifically for sacrifice; it does not automatically make a replaced DESTROY an actual destruction.

Acceptance: actual sacrifice, Maegisty return, Decoy discard, source-Hero sacrifice (Perfect Vessel), exact-card cost attribution, cost granted exactly once, eligible sacrifice triggers exactly once, final-zone-based discard recovery, replacement collision selected under E07, reconnect/alarm replay.

### E07 — Replacement selection and event order

Approved proposal: if multiple replacements are eligible, the current owner of the affected card chooses which applies first; revalidate after each change. Process final movements/triggers without duplicate disposal or recursion. RETURN normally is not DESTROY/SACRIFICE, **except E06's explicitly credited Maegisty/Decoy sacrifice**. Generic MOVE is not STEAL. Soul Tether/Cursed Glove cascades stop when their source/target is no longer eligible.

### E08 — Class Challenge eligibility and rejection message

Approved proposal: require an actual Hero of the effective class; Leader class does not qualify. Masks count by effective class. A qualifying class Challenge adds its intrinsic +3 only to the challenger's roll, separate from passives/Modifier cards.

A failed attempt to play due to this prerequisite must show **"Requirement not met"**. Server rejects atomically, without consuming the card or capturing first-valid Challenge. Preserve exact-side and window/idempotency checks.

### E09 — M01–M08 approved after individual review

The owner resolved all eight variants after reviewing their face sources. [M01–M08 contract and citations](../rules/EXPANSION_MODIFIERS_REVIEW_20261105.md) is authoritative over the historical audit's immediate-draw/immediate-threshold/+4-only proposals. C10 multi-play/final-Skip/fixed-deadline remains in force.

| ID | Approved adjustment / payment | Approved follow-up |
|---|---|---|
| M01, WD +1/-1 | Choose +1 or -1 on the selected roll. | Card user DRAWs 2 **after that roll resolves**, not when the Modifier is submitted. |
| M02, WD +2/-1 | Choose +2 or -1. | Card user DRAWs 1 **after that roll resolves**. |
| M03, WD +4 | Add 4. | At roll resolution, check selected roll's **final total >12**; if true, card user DRAWs 1; otherwise none. |
| M04, WD -4 | Subtract 4. | At roll resolution, check selected roll's **final total <2**; if true, card user selects one eligible discard card to hand. The same resolving -4 card is not eligible for its own recovery. |
| M05, BN +2/-2 | When modifying **the user's own Monster attack roll**, choose **+4 or -2**. On another player's roll, or the user's non-attack roll, use ordinary **+2 or -2**. | No extra follow-up. +4 is not a third-party bonus and is not a forced replacement of both options. |
| M06, BN +7 | Discard the user's remaining hand, then +7. Empty remaining hand is legal and discards zero. | Played Modifier remains separate from remaining hand; no self-payment. |
| M07, DS +6 | Select/discard another hand card before receiving +6. | Insufficient/unfinished payment never grants the adjustment. |
| M08, DS -6 | Same separate-payment rule as M07, then -6. | Insufficient/unfinished payment never grants the adjustment. |

Persist roll-bound follow-ups rather than executing M01–M04 side effects during the open Modifier window. Freeze totals/outcome first; later DRAW/recovery cannot retroactively modify that roll. In a Challenge, final-total checks use the exact side modified by this card. Multiple qualifying physical Modifier instances each get one eligible follow-up, delivered to their respective users. Retain C03 nesting and C04 terminal behavior: no gameplay follow-ups after GAME_OVER.

For M04, the particular resolving card remains reserved until its recovery opportunity is finished or skipped; already-resolved other discard cards may be eligible. Do not generally ban all same-named cards or expose hidden zones. M07/M08 rejection/timeout must follow the existing atomic/payment rules; never consume/replay the same physical card twice.

Acceptance: M01/M02 no premature draw; M03 9→13→10 gives no draw, final13 draws, final12 does not; M04 5→1→4 gives no recovery, final1 recovers, final2 does not, no self-retrieval; M05 own attack+4/-2 versus another attack+2/-2 and own Hero roll+2/-2; empty-hand M06; M07/M08 separate-card/no-AP payment, insufficient cards/timeout/duplicate payload; multiple instances/Challenge sides/final Skip/fixed deadlines/restart/terminal suppression.

### E10 — Failure popups, Bag paid reactivation and Grimoire clarification

Temporal Hourglass popup appears **only after the equipped Hero's effect roll has fully resolved as Failed**. It offers the printed extra action point; this is an AP grant, not an automatic free retry. Success does not show the failure popup. Do not decide before Modifiers/passives finish.

Bottomless Bag has two entry points, only for its equipped Hero:

1. After a resolved failure, an independent offer such as **"Bottomless Bag passive: you may spend ..."** permits a further paid effect attempt.
2. After a resolved success, the equipped Hero remains clickable for an additional paid attempt, normally costing one AP.

Decline keeps the turn usable; Bag is not consumed. Hourglass grants and Bag reactivation are distinct operations; do not charge twice or imply Hourglass itself retries. No automatic endless failure loop; each paid retry requires a legal accepted action and enough AP, and has a new roll/window.

**Explicit clarification:** Grimoire modifies paid roll actions to **two AP**, including Bag's paid repeat. It does **not** charge for an otherwise free PLAY-entry/Goblet/Mirroryu-granted attempt. This clarification supersedes an overbroad reading of the owner's earlier "in every case" phrase. Goblet remains free as explicitly approved.

Acceptance: success/failure boundary, first/last AP, insufficient two AP, Bag+Grimoire, free entry with Grimoire, Goblet+Grimoire free retry, Hourglass+Bag both eligible, no popup on wrong Hero, UI and bots share the same cost resolver.

### E11 — Leader trade

Approved proposal: exchange two unique Leader instances atomically; class/skills follow the new Leader without swapping hands. Once-per-turn usage follows Leader instance plus the current turn, not a freshly reset holder counter. Established roll bonuses are not retroactively recomputed. Keep two-player Shadow Claw setup ban and existing supported Leader pool rules; do not manufacture unavailable Leaders.

### E12 — Dragalter copies numbers only

Approved proposal: discard a qualifying Modifier to establish the numeric roll adjustment for the rest of the turn. Choose the sign separately per roll when the numeric card offers two choices. Ignore that Modifier's extra effect instructions (draw/search/discard-hand/additional discard payments); it is not PLAYed on each roll and does not emit per-Modifier-PLAY triggers. Initial Dragalter payment still applies.

M01–M08 now define real-card semantics, but do not add their extra draw/recovery/payment effects to Dragalter's approved numbers-only copy. Definition identity, copied numeric options and expiry must be persisted.

### E13 — Free attack, direct slay and row ordering

Approved proposal: Big Buckley waives the two-AP attack cost, but still checks Party requirement and rolls an attack. Vicious Wildcat directly slays a chosen face-up Monster, without an extra Monster attack roll/requirement check; preserve C04 reward→award→immediate-win ordering. If no win, finish applicable passives before its end-turn instruction. Beast Call moves the face-up row to the deck bottom left-to-right before replenishing.

### E14 — Scoped triggers, privacy and expiry

Approved proposal: event actor/owner, actual or expressly credited event, event-time eligibility, and correct duration owner determine triggers. Differentiate DRAW, PULL, recover, reveal, PLAY and bring. Owner-next-turn duration survives source movement as specified, while other effects expire at end turn. Look-at information stays private; reveal shows only authorized selected cards. New skills do not retroactively see earlier events; terminal C04 award suppresses later gameplay passives. E06 overrides the default sacrifice-event rule only in its named cases.

### E15 — Expansion Party cap and Brawling Spirit count override

**Owner changed the proposal:** with a supported enabled expansion, cap Party at **seven Heroes**. Base-only keeps its current six-Hero cap. A full Party blocks another Hero being played/brought/stolen/moved into it; there is no automatic replacement/discard or temporary-entry exemption. A simultaneous/multi-step operation must validate its actual destination capacity at the relevant stage.

**Brawling Spirit counts only Hero cards plus equipped Item cards**, including Cursed Items and both attachments where present. Do not count Party Leaders or slain Monsters toward its threshold. This is a card-specific count rule; do not extend it to unrelated text saying Party/cards without checking that text. Count scope remains separate from valid sacrifice/destroy target scope.

Acceptance: six/seven/eight Hero boundaries by profile; temporary resurrection blocked when full; attachment counts vs Hero cap; Leader/Monster ignored for Brawling Spirit; no lost/duplicated card or unpaid benefit when entry is blocked.

### E16 — Room capacity, set locks and physical deck quantities

Approved proposal: base-only max six; expansion capacity `min(8, available unique supported Leaders)`. DS-only has seven unique base+DS Leaders and therefore max seven, unless another approved Leader source is enabled. No duplicates. Supported sets lock before start; previews/art folders cannot enable a set.

An artwork file represents a **face**, not necessarily one physical card in a game. Multiple physical copies may reuse one face; alternate scans/editions can supply several files for one definition; the source inventory also includes Party Leaders and Monsters, which do not all belong to the main draw deck. Source `quantity` per definition and create unique physical instance IDs; do not use image count as quantity. A hypothetical face with three printed copies yields three game instances using one image—this example is not an asserted quantity for a named card.

### E17 — No instruction supplied

The owner's trailing "17." contained no text. No rule is inferred or recorded for it.

## Claude instructions and merge delta

Read this approved contract before the historical audit. EX-00 owner review is resolved for **E01–E16 including M01–M08**. Continue EX-01..06 with the adopted behavior; do not enable a pack before its complete catalog, handlers, migrations and acceptance are implemented. New unknown combinations still require an explicit record rather than an invented ruling.

Update EX-01..06 acceptance for: any-Hero ordinary Item equip; printed capacity; lower-roll checks; independent Shaman response; explicit repeat permissions; typed credited sacrifice and physical movement; Hero-only class Challenge requirement/message; failure-only Hourglass/Bag UI; Grimoire paid-only two AP; numbers-only Dragalter; seven-Hero expansion cap; Brawling Hero+Item count; seven-Leader DS-only capacity.

Owner-approved special sacrifice handling must replace older audit tests expecting Maegisty/Decoy costs to fail. Preserve source/rule labels as project policy where applicable. New schema saves must migrate old attachment, allowance, response and effect states without changing active base-only room profiles. Do not rerun historical checks as evidence for new behavior; add failing-before/passing-after tests on the actual implementation SHA.

### Handoff prompt

Read docs/decisions/EXPANSION_OWNER_DECISIONS_20261105.md first; E01–E16/M01–M08 are approved and supersede old proposals. Follow scoped EX-01..06. Persist post-roll Modifier follow-ups: M01/02 draw after resolution; M03/04 inspect final totals; M04 cannot recover itself; M05 own attack +4/-2, other rolls +2/-2; M06 allows empty remaining hand; M07/08 need another discard. Keep C10 final Skip/fixed deadline and C04 terminal suppression. Preserve any-Hero equip, intrinsic two-slot capacity, lte rolls, independent Shaman popup, explicit retries, credited sacrifice, Hero-only class Challenges, paid-only Grimoire cost2, numbers-only Dragalter, seven-Hero expansion cap, Brawling Hero+Item count and DS-only seven-Leader capacity. Include sourced quantities, state migration and current-SHA tests. No automatic enablement/deployment or invented rulings.
