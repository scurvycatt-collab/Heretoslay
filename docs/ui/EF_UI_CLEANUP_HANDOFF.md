# EF-UI-CLEANUP-001 handoff

Scope was `apps/web/src/App.tsx` only. Removed unused `EffectEndTurn` and prior `EffectRoom`; renamed the active `EffectRoomV2` to `EffectRoom` and updated its entrypoint. No active JSX, behavior, styles, DTO, or dependency change.

Evidence: active renderer body compared before/after with the function name normalized; SHA-256 `0fd3d9a80d22d98ac5703239d5cb47ef9b888fcc513a7e64d156d4708f8d8ca9`, 6245 characters. Exactly one effect renderer remains.

Checks: `npm run typecheck --workspace=@here-to-slay/web` PASS; `npm run build --workspace=@here-to-slay/web` PASS, 2026-11-02. No browser or new tests run. No blocker for maintenance cleanup; existing effect-demo runtime acceptance is unchanged.
