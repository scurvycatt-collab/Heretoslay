# SL-01 — Setup demo API (frozen)

**Frozen:** 2026-10-29 cho UI/QA integration. HTTP polling + Bearer session, cùng origin `/api`; không WebSocket. `setup_demo` dùng `fixture.setup.*`, không phải base catalog/effect.

## Create/join/routes

```json
POST /api/rooms
{"nickname":"Host","mode":"setup_demo"}
```

`mode` bắt buộc là `reaction_demo | setup_demo`; omit giữ backward-compatible `reaction_demo`. Response vẫn `201 { roomCode, sessionToken, snapshot }`. Join/snapshot/commands không đổi:

- `POST /api/rooms/{code}/join` `{nickname}`
- `GET /api/rooms/{code}/snapshot` Bearer
- `POST /api/rooms/{code}/commands` Bearer

Room mode không đổi sau create. Expansion/config bị reject. `reaction_demo` giữ contract `REACTION_API.md`; setup commands trả `MODE_MISMATCH` trong reaction room và ngược lại.

## Typed setup snapshot

`SetupDemoSnapshot` export từ `@here-to-slay/protocol`:

```json
{
  "mode":"setup_demo",
  "roomCode":"ABC234",
  "revision":9,
  "serverNow":123,
  "hostPlayerId":"p1",
  "you":{"playerId":"p1","nickname":"Host","isHost":true},
  "players":[{"playerId":"p1","nickname":"Host","joinIndex":0,"handCount":5,"leaderId":"fixture.setup.leader.1","isHost":true}],
  "yourHand":[{"cardId":"fixture.setup.main.001","kind":"other"}],
  "setup":{
    "phase":"turn_active",
    "selectionPlayerId":null,
    "leaderPool":["fixture.setup.leader.1"],
    "selectedLeaderIds":["fixture.setup.leader.1"],
    "turnOrder":["p1"],
    "currentPlayerId":"p1",
    "turnNumber":1,
    "turnId":"opaque",
    "actionPoints":3,
    "mainDeckCount":110,
    "monsterDeckCount":12,
    "faceUpMonsterIds":["fixture.setup.monster.1"],
    "discardCount":0
  },
  "demo":true,
  "demoLabel":"Setup demo — synthetic fixture data"
}
```

Only own hand IDs are returned. Other players expose `handCount`; snapshot never includes token/hash, other hands or deck order. `serverNow`, turn/AP/deck/Leader state are authoritative.

## Commands

All use `{commandId, expectedRevision, kind, payload}`; server derives actor from Bearer.

```json
{"commandId":"1","expectedRevision":2,"kind":"BEGIN_LEADER_SELECTION","payload":{}}
{"commandId":"2","expectedRevision":3,"kind":"SELECT_PARTY_LEADER","payload":{"leaderId":"fixture.setup.leader.1"}}
{"commandId":"3","expectedRevision":5,"kind":"START_GAME","payload":{}}
{"commandId":"4","expectedRevision":6,"kind":"DRAW_CARD","payload":{}}
{"commandId":"5","expectedRevision":7,"kind":"REDRAW_HAND","payload":{}}
{"commandId":"6","expectedRevision":8,"kind":"END_TURN","payload":{}}
```

Flow: host begins selection (requires 2–6 players); selectors act sequentially by persisted join order; duplicate Leader rejects atomically. Last selector becomes first player; turn order is join order rotated from that player. Host starts after all selections. Server shuffles synthetic 115-card/15-Monster fixtures, deals 5/player, exposes 3 Monsters and sets 3 AP.

`DRAW_CARD` costs 1 AP and draws up to 1 card. `REDRAW_HAND` costs 3 AP, discards the whole hand first, then draws up to 5 cards. Each draw is sequential: take the next main-deck card; when the deck is empty, shuffle the whole discard into it and continue. Stop after the requested count or when both deck and discard are empty. Full, partial and zero-card outcomes are accepted, spend the normal AP, and follow normal auto-advance; they never roll back or loop. `END_TURN` drops unused AP. AP reaching zero auto-advances and grants the next player 3 AP. `INSUFFICIENT_CARDS` remains a start-game fixture guard. Play/Hero/Attack/effects/win are not implemented.

## Outcome/errors/idempotency

Success/reject command response remains `{ outcome, snapshot }`, outcome `{accepted, code, replayed, commandId, revision}`. Exact commands require current `expectedRevision`. Idempotency key `(room, actor, commandId)` is checked before revision; same canonical payload replays old outcome without repeating draw/discard/turn, changed payload returns `IDEMPOTENCY_CONFLICT`.

Stable setup codes: `MODE_MISMATCH`, `FORBIDDEN`, `SETUP_LOCKED`, `NOT_ENOUGH_PLAYERS`, `INVALID_PHASE`, `NOT_ACTIVE_SELECTOR`, `LEADER_NOT_AVAILABLE`, `LEADER_TAKEN`, `SELECTION_INCOMPLETE`, `STALE_REVISION`, `NOT_YOUR_TURN`, `INSUFFICIENT_AP`, `INSUFFICIENT_CARDS`. Auth/body/rate errors remain from `REACTION_API.md`.

Base mode remains gated and absent. No Leader abilities, reactions, artwork or expansion are enabled in setup_demo.
