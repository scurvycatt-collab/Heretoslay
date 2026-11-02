# EF-FOLLOWUP-001 — bounded dispatch, 2026-11-02
Owner yêu cầu tiếp theo operating model. Inputs BACKLOG EF-TURN-001/EF-UI-001, PLAY_CARD_API.md, per-role cards. PM freezes narrow contract delta below under delegated owner authority; project demo behavior, not new publisher ruling.

## Contract delta
1. Reuse exact-state END_TURN empty payload in effect_demo, only active actor/turn_active and no pendingPlay or unresolved reaction. Set next persisted turnOrder actor,3AP,new turnId/new Hero allowance exactly once; oldAP forfeited. Wrong actor/pending/stale/conflict rejected without own mutation; exact retry receipt replay, no double advance. Keep setup/reaction mode behavior and join/auth/privacy guards. DRAW_CARD/Redraw and other mechanics remain outside this ticket.
2. EffectDemoSnapshot.yourHand modifier-only optional field modifier:{delta:number,rollTarget:'actor'|'challenger'|'hero'}, populated from actual fixture metadata. No metadata inferred from name substrings, no other hand/deck leakage. No modifier option selection/new effects. UI uses kind-correct label and fixed numeric signed delta/target; reaction controls distinguish each instance meaningfully and are disabled after player completed.

## Ownership / dependency
Architecture packages/protocol/**,apps/worker/**,apps/worker/tests,docs/architecture: implement routing/contract delta+metadata; targeted tests/typecheck. UI apps/web/**,docs/ui: EndTurn for active/no pending, labels from typed modifier fields; typecheck/build after DTO stable. QA tests/**,docs/qa: independent acceptance after implementation, own tests separate from Worker tests. All update own docs/handoff/agents/<role>.md <=150words at milestones, final<=60words. PM STATUS/RESUME/DONE/BACKLOG/priority only. Models/efforts/IDs unchanged.

## Acceptance
Inert-only guest can end turn and host gets fresh3AP/allowance; replay/wrong actor/pending/stale/conflict; pending lastAP untouched. Fixed modifier fields equal actual fixture values, absent from other-hand projection; kind=modifier never labelled Challenge; delta/target clear and already-completed no action. Existing two-card integration regression once after delta, no unrelated audit/history or rechecks for docs. PM review evidence/source and browser if runtime reachable, no recovery scope expansion.

Usage start16%/5h91%week. Owner expressly continues after checkpoint; one bounded batch only, no resetcredit/idlemonitor/commit/push/deploy/base/art/expansion/MOD-SELECT/WebSocket. Check usage end/5min; checkpoint if limit/failure, no workaround loops.
