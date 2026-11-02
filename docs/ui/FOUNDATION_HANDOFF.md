# UI Foundation handoff

**Owner:** UI/UX. **Scope:** `apps/web/**`, this file. **Status:** scaffold/mock created; not a multiplayer game.

## Output

`apps/web` is a React + TypeScript + Vite package with `dev`, `typecheck`, and `build` scripts. `App.tsx` supplies four review scenes, a six-player local fixture (shown at 2/4/6 capacity), responsive seating/hand layout, a disabled expansion affordance, and accessible controls/labels. Visuals are CSS/vector-like placeholders only.

## Demo boundary

All table, card, player, roll, timer, and result values are client-side review data. A reaction window has a fixed 20-second local countdown; submitting one Modifier (only if demo player has one) or Skip completes that player and all-complete closes the demo. A timeout renders `WINDOW CLOSED · DEADLINE` and blocks completion. Restart resets only the demo fixture. Challenge exposes `PLAY CHALLENGE` only to a non-actor demo player with a Challenge card; its first mock request moves to the versus/server-result fixture. This does not validate hands, implement effects, authenticate players, decide eligibility, make dice authoritative, or run multiplayer.

Base capacity selector is 2/4/6. Expansion capacity to 8 is visibly disabled/not supported. Integration needs protocol DTO/events and Worker room state.

## Checks

`npm --workspace apps/web run typecheck` and `npm --workspace apps/web run build` passed on 2026-10-29. Vite is running for QA at `http://127.0.0.1:5173/` (terminal session `15501`). A shell HTTP probe was blocked by the sandbox socket policy, so it is not evidence of page rendering; Browser QA remains pending. Dependencies/lockfile were not changed by UI.
