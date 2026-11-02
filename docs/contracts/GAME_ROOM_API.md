# GAME_ROOM_API — real base game room (mode `base`)

Task: GAME-001 (2026-11-02). Owner: Architecture. Status: IMPLEMENTED for setup + DRAW/REDRAW/END_TURN; play/attack loop is GAME-002 (waiting on rule spec).

Types: `packages/protocol/src/game/base.ts` (`BaseGameSnapshot`, `BaseGameCommand`, `BaseCardView`), re-exported from `@here-to-slay/protocol`. `RoomSnapshot = RoomSliceSnapshot | BaseGameSnapshot`.
Rules: `docs/rules/BASE_SPEC.md` RULE-01..05, `docs/rules/SETUP_VERIFIED.md`. Cards: CAT-001 reference catalog (`apps/worker/src/content/`), IDs/kinds only, rights UNVERIFIED, no artwork.

## Endpoints

Same routes as the demo slices; mode is chosen at create time and fixed for the room.

| Method | Path | Auth | Body | Success |
|---|---|---|---|---|
| POST | `/api/rooms` | — | `{ "nickname": string, "mode": "base" }` | 201 `{ roomCode, sessionToken, snapshot }` |
| POST | `/api/rooms/:code/join` | — | `{ "nickname": string }` | 201 `{ roomCode, sessionToken, snapshot }` |
| GET | `/api/rooms/:code/snapshot` | `Bearer <sessionToken>` | — | 200 `{ snapshot }` |
| POST | `/api/rooms/:code/commands` | `Bearer <sessionToken>` | command (below) | 200 `{ outcome, snapshot }` |

- Room code: 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, server-generated; path code is case-insensitive.
- Nickname: NFKC + trim, 1–24 printable chars, unique per room case-insensitively.
- Reconnect/reload: keep `sessionToken` client-side and call `snapshot` with it; the same seat (`you.playerId`) is returned. Only the SHA-256 hash of the token is stored.
- Create accepts only `nickname` and `mode`; any other key (e.g. `enabledSetIds`, `capacity`, `reactionSeconds`) → 409 `EXPANSION_UNSUPPORTED`. Omitting `mode` still defaults to `reaction_demo` for backward compatibility.
- Body limit 4 KiB. Rate limits: create 10/min/IP (Worker), join 30/min/room, snapshot 180/min/session, commands 120/min/session.

## Commands

Envelope: `{ commandId: string, expectedRevision: number, kind, payload }`.
`commandId` is idempotent per player: same id + same kind/payload → stored outcome with `replayed: true`; same id + different body → `IDEMPOTENCY_CONFLICT`. `expectedRevision` must equal the current room `revision`, else `STALE_REVISION` (nothing changes). Joins also bump `revision`.

| kind | payload | Who / when | Effect |
|---|---|---|---|
| `BEGIN_LEADER_SELECTION` | `{}` | host, `lobby`, 2–6 players | phase → `leader_selection`; selection order = join order; joins locked |
| `SELECT_PARTY_LEADER` | `{ leaderId }` | current selector | assigns a unique Leader (catalog `party_leader` definitionId) |
| `START_GAME` | `{}` | host, all seats selected | shuffle 115-card main deck, deal 5 each, shuffle 15 Monsters, 3 face-up; last selector goes first, then join order; 3 AP |
| `DRAW_CARD` | `{}` | current player, ≥1 AP | draw 1, −1 AP |
| `REDRAW_HAND` | `{}` | current player, ≥3 AP | discard whole hand (if any), draw 5, −3 AP |
| `END_TURN` | `{}` | current player | next player clockwise, fresh 3 AP (no carry-over) |

The turn ends automatically when AP reaches 0. Empty main deck on draw: discard is reshuffled in (setup-slice behaviour; rulebook depletion is UNVERIFIED, SETUP_VERIFIED ambiguity #2).

## Outcome

`{ accepted: boolean, code: string, replayed: boolean, commandId, revision }` — HTTP 200 for rule rejections; the returned snapshot is always the authoritative state.

| code | meaning |
|---|---|
| `ACCEPTED` | applied; `revision` incremented by 1 |
| `STALE_REVISION` | `expectedRevision` ≠ current revision |
| `IDEMPOTENCY_CONFLICT` | reused `commandId` with a different body |
| `MODE_MISMATCH` | command kind not available in `base` (demo commands, reactions, `PLAY_CARD` until GAME-002) |
| `FORBIDDEN` | host-only command from a non-host, or actor not seated |
| `INVALID_PHASE` | wrong phase for the command |
| `NOT_ENOUGH_PLAYERS` | fewer than 2 (or more than 6) seated |
| `NOT_ACTIVE_SELECTOR` | not this player's turn to pick a Leader |
| `LEADER_NOT_AVAILABLE` | `leaderId` not in the base leader pool |
| `LEADER_TAKEN` | Leader already picked |
| `SELECTION_INCOMPLETE` | START_GAME before every seat picked |
| `INSUFFICIENT_CARDS` | deck too small to deal (should not occur with the base catalog) |
| `NOT_YOUR_TURN` | turn action from a non-current player |
| `INSUFFICIENT_AP` | not enough AP for the action |

## HTTP errors

`{ ok: false, error: { code, message } }`: 400 `INVALID_JSON`/`INVALID_NICKNAME`/`INVALID_MODE`/`INVALID_COMMAND`; 401 `UNAUTHORIZED`; 404 `ROOM_NOT_FOUND`/`NOT_FOUND`; 409 `ROOM_FULL` (7th player), `NICKNAME_TAKEN`, `SETUP_LOCKED` (join after selection begins), `EXPANSION_UNSUPPORTED`, `ROOM_CODE_TAKEN`; 413 `BODY_TOO_LARGE`; 429 `RATE_LIMITED`.

## Snapshot (`mode: "base"`)

```ts
{
  mode: "base"; roomCode; revision; serverNow; hostPlayerId;
  you: { playerId; nickname; isHost };
  players: Array<{ playerId; nickname; joinIndex; isHost;
                   handCount; leaderId: string | null; party: BaseCardView[] }>;
  yourHand: BaseCardView[];              // viewer-private
  game: {
    phase: "lobby" | "leader_selection" | "turn_active";
    selectionPlayerId; leaderPool: string[]; selectedLeaderIds: string[];
    turnOrder: string[]; currentPlayerId; turnNumber; turnId; actionPoints;
    mainDeckCount; monsterDeckCount; faceUpMonsters: BaseCardView[]; discardCount;
  };
}
BaseCardView = { cardId /* "<definitionId>#NN" instance */, definitionId, kind }
```

Privacy: only the requester's hand is serialized; other seats expose `handCount` only; deck order, monster deck order, discard contents and token hashes are never sent. No `demo`/`demoLabel` field. `party` excludes the Leader (see `leaderId`) and stays empty until GAME-002.

## Extension (GAME-002)

Add command interfaces to `BaseGameCommand` + `validateRoomSliceCommand` in protocol, then a handler in `BASE_TURN_HANDLERS` (`apps/worker/src/game/base-game.ts`). The Durable Object needs no change for new turn actions; reaction windows/alarms will need a DO hook (see ADR-002).

## Retry sau khi bị từ chối
Receipt được lưu cho cả command bị từ chối (kể cả `STALE_REVISION`). Client phải dùng `commandId` MỚI sau khi bị từ chối; gửi lại cùng `commandId` sẽ nhận lại đúng kết quả cũ.
