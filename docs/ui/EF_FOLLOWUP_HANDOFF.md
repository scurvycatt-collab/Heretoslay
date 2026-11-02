# EF-FOLLOWUP-001 UI handoff

Implemented effect-demo `END_TURN`: it renders only for the active player in `turn_active` with no pending action or unresolved reaction, sends `END_TURN {}`, and does not advance local state.

The stable `yourHand[].modifier` DTO now drives kind-correct Modifier labels, signed delta, and actor/challenger/hero target labels. Reaction Challenge, Modifier, and Skip controls all disable when the personalized snapshot marks `youCompleted`; action text distinguishes Modifier instances by metadata. No values are inferred from fixture names.

Checks: `npm run typecheck --workspace=@here-to-slay/web` PASS; `npm run build --workspace=@here-to-slay/web` PASS, 2026-11-02. Browser/runtime QA not run. Scope remains synthetic effect-demo only; PM/QA should verify live End Turn and completed-reaction snapshots.
