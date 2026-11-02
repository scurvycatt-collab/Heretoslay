# UI worker card

Task: EF-UI-CLEANUP-001. State: ready_for_review; worker idle. Scope/settings: `apps/web/src/App.tsx`, `docs/ui/**`; giữ chat/model/effort.

Input: BACKLOG EF-UI-CLEANUP-001. Output: active renderer renamed `EffectRoom`; unused prior `EffectRoom` and `EffectEndTurn` removed. No active JSX/behavior/style/DTO/dependency change. Active body normalized before/after SHA-256: `0fd3d9a80d22d98ac5703239d5cb47ef9b888fcc513a7e64d156d4708f8d8ca9` (6245 chars).

Checks thật: web typecheck PASS; web production build PASS (2026-11-02). Blocker: none; browser/new tests intentionally not run. Next: PM source-review and accept maintenance delta. This is working-state compact, not confirmed native context compaction.
