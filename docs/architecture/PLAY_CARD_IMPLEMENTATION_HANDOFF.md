# PC-IMPL-BOTH implementation handoff

Ngày: 2026-11-02. Owner: Architecture. Không commit/push/deploy.

## Output

- Protocol: `effect_demo`, five exact-state commands, discriminated choice payloads, `EffectDemoSnapshot`, challenge-roll/private projection; existing reaction/setup DTO giữ nguyên.
- Worker: schema v4 normalization; persisted effect state/pending zone/Party/allowance/absolute deadlines/receipts. Critical Boost sequential draw3→choice/fallback→Magic final discard. Dodgy Dealer immediate Skip/roll và paid roll, target lock, Modifier, atomic empty-hand swap, retained-record swap/missing-record no-op. Last AP advances only after chain complete.
- Fixture gate: host gets one Critical Boost, one Dodgy Dealer, fixed-target actor/hero Modifiers; guests get Challenge, challenger/hero Modifiers; main deck 24 inert cards. Tất cả `fixture.effect.*`; không import base catalog.
- Recovery: constructor re-arms earliest alarm; alarm/entrypoint settle once, never reroll/redraw/reswap/reset deadline. Personalized snapshot hides other hands/deck/discard order.

## Checks

- Protocol typecheck/build PASS; tests 11/11 PASS.
- Worker typecheck/dry-run build PASS; targeted effect tests 7/7 PASS; full worker 23/23 PASS.
- Coverage: both effects, Challenge/Modifier, immediate/paid allowance, full/partial/zero draw, timeouts, persisted recovery, replay, privacy, conservation, last-AP, retained/missing target.

## Gates / next

QA owns root `tests/**`; UI can consume frozen DTO. Source/rights remain secondary/UNVERIFIED; full base/catalog/art/expansion/MOD-SELECT remain disabled.
