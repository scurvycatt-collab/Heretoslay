# EF-FOLLOWUP-001 Architecture handoff

Ngày: 2026-11-02. State: `ready_for_review`. Không commit/push/deploy.

## Delta

- Protocol: `EffectSliceCommand` reuses exact-state `END_TURN`; effect own-hand cards optionally expose typed `modifier { delta, rollTarget: actor|challenger|hero }`.
- Worker: effect-demo `END_TURN` requires active actor, `turn_active`, no pending play/unresolved reaction; forfeits AP and advances once with new `turnId`, 3 AP and fresh Hero allowance. Existing exact receipt handles replay/conflict; stale/wrong actor/pending reject atomically.
- Projection maps Modifier metadata from `fixtureDelta`/`fixtureRollTarget` only. Non-Modifiers omit it; other hands remain count-only. Reaction/setup behavior and full-base gates unchanged.

## Evidence

- Protocol typecheck PASS; tests 11/11 PASS.
- Worker typecheck PASS; targeted effect regression 8/8 PASS.
- Coverage: inert-turn advance, fresh allowance, wrong actor, stale, replay, conflict, pending last-AP guard, conservation, exact own metadata and other-hand privacy; prior two-card flows run once in same targeted file.

## Dependency / blocker

DTO stable was reported to UI. QA owns root acceptance. No Architecture blocker; source/rights remain `UNVERIFIED`, unrelated to synthetic fixture delta. No DRAW/Redraw, modifier selection, base/art/expansion scope added.
