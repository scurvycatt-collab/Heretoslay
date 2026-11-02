# Reaction slice UI handoff

**Owner:** UI/UX · **Scope:** `apps/web/**`, `docs/ui/**` · **Status:** client integration aligned to the reaction-slice contract; runtime QA pending backend availability.

## Delivered

- A retro-chrome nickname/create/join lobby is now the entry screen. Base capacity remains 2–6; expansion-to-8 is visibly disabled and not presented as available.
- Create and Join retain only local form text and explicitly state that neither room nor session was created. No token, room code, player identity, fake player, local timeout, dice, completion, or hand state is fabricated for a connected mode.
- The approved tabletop/reaction design remains reachable as **LOCAL MOCK**. It is deliberately separate from a future server-snapshot reaction mode.

## Dependency / next integration boundary

The client now follows `REACTION_API.md`: Vite proxies `/api` to `127.0.0.1:8787`; create/join persist the returned opaque token only in per-tab `sessionStorage`; snapshot polling uses Bearer auth; commands use the snapshot revision and a generated command ID. Server snapshots alone render personalized hand, roster completion, reaction kind and closed state. Failed requests remain visible as safe server error text; the client does not invent success or auto-pass disconnects. A connected runtime was not started because backend handoff was not yet available.

The client imports the live `ReactionSliceSnapshot` DTO from `@here-to-slay/protocol`. It calculates displayed seconds from epoch-ms `deadlineAt` using the offset between snapshot `serverNow` and local receipt time. Completion/closed status, personalized hand, challenge dice, and fixture totals remain snapshot-only; the client never generates them. Challenge dice and fixture totals display only when supplied by the server.

## Checks and preview

- F-02: a stored per-tab session now boots directly into room mode and is revalidated by authenticated snapshot polling. An invalid session is cleared and returns to the lobby with a connection message; reload never calls create/join.
- F-03: reaction buttons are disabled from server snapshot state when `youCompleted` or `resolved`; Challenge also disables for the actor or without a personal Challenge card. Server validation remains authoritative.
- `npm --workspace apps/web run typecheck` — pass after the F-02/F-03 patch.
- `npm --workspace apps/web run build` — pass after the F-02/F-03 patch.
- Preview is owned by Infrastructure. PID `31244` was no longer present in a read-only process check after the UI build; UI did not reset or kill it. Browser multi-client QA and connected-flow checks are pending a restarted preview plus the contract/backend.
