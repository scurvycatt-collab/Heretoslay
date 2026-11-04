# Handoff — 2026-11-04 · UI-006 / ROOM-001

Branch `feat/UI-006-layout-rooms` (merged into `main`). Deploy is done by the owner on Cloudflare (not by the agent).

## What changed

### Table UI (owner layout from the layout-editor artifact, v177)
- Seats, Deck, Monsters, Discard, turn buttons, hint, menu, status placed by saved centre point + scale
  (`base-room.css`, blocks UI-007/008/009, desktop only: `min-width:1101px; min-height:641px`).
- Seat slots per player count (`seatSlots` in `BaseRoom.tsx`): 3p `top-cl top-cr`; 4p `left top-c right`;
  5p `left top-cl top-cr right`; 6p `left top-l top-c top-r right`.
- Leader is a standalone card (class `t3-seat-leader`): left of the hex cluster on top/me seats, above it on the side seats.
  Heroes: one row above the panel (me), one row below (top seats), vertical column (side seats; right seat mirrored).
- Slain Monsters: vertical column hugging the panel (right of it; left of it on the right-hand seat).
- Stats row (◆ ☠ ✋) removed; the same numbers are now a hover tooltip (`title`) on the seat.
- PULL / DRAW / REDEAL / PASS: even grid (2×2 with PULL, 1×3 without). Latest-action toast moved to the top, next to the menu button.
- Earlier in the same branch: bigger player panels, 1-line toast fading after 5 s, centred Challenge / hero-roll result screens,
  Monster auto-refill (`refillFaceUpMonsters`), WebP card assets re-organised under `assets/cards/base/*` and
  `assets/cards/expansions/kickstarter/*` (see `assets/cards/README.md`).

### Rooms (ROOM-001)
- URL: `/herotoslay/<ROOM>/<playerId>`. Several rooms at once were already possible (one Durable Object per room code);
  now every tab/refresh/shared link lands on its own seat. `/herotoslay/<ROOM>` = join form with the room code prefilled.
  The session token is NOT in the URL: stored per `ROOM/playerId` in `localStorage` (`hts.sessions.v1`, 6 h TTL) — `apps/web/src/api.ts`.
- `wrangler.jsonc`: `assets.not_found_handling = "single-page-application"` so deep links serve `index.html`.
- Leaving: the lobby button now calls `POST /api/rooms/:code/leave` (frees a lobby seat, passes host to the next human; in-game seats are kept).
- Expiry: `ROOM_IDLE_MS = 5 min` without PLAYER activity (create / join / leave / command; bots and snapshot polling do not count)
  → the alarm calls `storage.deleteAll()`; later requests get `ROOM_NOT_FOUND` (the client returns to the lobby with the error).
- Bots/timers pause when no human is present (no snapshot poll within `PRESENCE_MS = 20 s`): `syncPause` in `room.ts`;
  when a human returns every deadline is shifted by the paused time (`shiftDeadlines`). One alarm = min(game deadline, expiry) via `rearm`.
- Tests: `tests/room-lifecycle.integration.test.ts` (expiry, activity vs polling, pause/resume, leave); `base-lobby-bots` test keeps presence fresh before its alarm.

## Verify
`npm run typecheck && npm run test:integration` → 89 pass. `npm run build` + wrangler dry-run OK.

## Deploy notes (owner)
- `wrangler deploy` picks up the new `not_found_handling`. No new DO migration (only new optional fields in the persisted state: `lastActivityAt`, `presence`, `pausedAt`; old rooms get `lastActivityAt` on their first request).
- Existing rooms created before this deploy expire 5 min after their first request post-deploy.

## Open / not verified
- Hero row (5 heroes) and the right-hand vertical column were only checked with CSS logic + empty parties; play a few turns and look at 6 players.
- Challenge result screen after the UI-006 CSS has not been screenshot-verified.
- A player who only watches (no commands) for 5 min loses the room by design (owner spec); consider a keep-alive button if that hurts.
- Rights: card art stays FAN_MADE_NON_COMMERCIAL / PnP source UNVERIFIED (ADR-004).
