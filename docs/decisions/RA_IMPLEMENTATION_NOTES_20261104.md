# RA-01..04 implementation notes (2026-11-04)

Implements `RULES_AUDIT_OWNER_DECISIONS_20261104.md` on top of origin/main 0fc08d2. Owner amendment: **C11** Forced Exchange needs an own Hero (chosen on play); STEAL first, own Hero moves to the victim only if the STEAL succeeded.

- **C01** `Step.choice.thenIfPaid`: dependent benefit runs only after full payment; insufficient cards/timeout grant nothing.
- **C02** timeout fallback (`isMandatoryChoice`): mandatory discard/sacrifice/give picks the first `min` cards of `eligibleChoiceCards` (hand order for discard/give, Party order for sacrifice), same legality as a normal pick. Optional `may`, play and gated payments still decline.
- **C03** `Attempt.continuation`: a nested play's Challenge → effect → cleanup run before the parent's remaining queue; the parent continuation (Snowball 2nd DRAW) runs last, also when the Challenge negates the card.
- **C04** `pendingMonster` zone; sequence draw reward → `award_monster` (+ win check) → `flush_draw_triggers` → `refill_monsters`. Trigger eligibility is computed at draw time. Data: optional `slayReward.draw` (only Corrupted Sabretooth: 1). Other Monsters' success boxes are NOT verified.
- **C05** Titan Wyvern bonus: holder only, challenger and defender rolls.
- **C06** `reveals`: Pan Chucks (on accept) and Rex Major; visible 10 s (`REVEAL_VISIBLE_MS`), at most 5 retained (`REVEAL_KEEP`), pruned on the next reveal; shifted by pause (C12).
- **C10** responders are `pending|passed`; playing keeps `pending`; Skip final; fixed deadline; early close only when all Skipped. `leaderPassiveUsesModifierSlot` removed; `normalizeBaseGame` migrates legacy `played` → `pending` and drops the setting.
- **C07/C08/C09/C12** already matched main; regression tests in `ra04-regression.test.ts`. C12 pause lives in `room.ts` `syncPause` (humans only, spectators ignored).
