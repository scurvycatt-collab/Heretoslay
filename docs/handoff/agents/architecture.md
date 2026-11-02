# Architecture working state

- Worker: `idle`; task `EF-FOLLOWUP-001`: `ready_for_review`.
- Input: `docs/handoff/EF_FOLLOWUP_DISPATCH.md`; frozen delta END_TURN effect-demo và own-hand Modifier metadata.
- Scope: `packages/protocol/**`, `apps/worker/**`, worker tests, `docs/architecture/**`; giữ chat/model/effort.
- Files: protocol DTO/validation, worker effect routing/projection, targeted worker tests, `PLAY_CARD_API.md`, `EF_FOLLOWUP_HANDOFF.md`.
- Output: effect END_TURN advances once/fresh allowance; pending/wrong/stale/conflict guarded. Own modifiers expose typed actual `{delta,rollTarget}`; other hands count-only.
- Checks: protocol typecheck + 11/11 PASS; worker typecheck + targeted effect 8/8 PASS.
- Dependency: DTO stable đã báo UI; QA owns root acceptance; PM review.
- Blocker: chưa có; source/rights vẫn `UNVERIFIED`, không ảnh hưởng synthetic delta.
- Next: chờ PM/UI/QA; không rerun unchanged.

Compact working-state handoff; chưa xác nhận native context compaction.
