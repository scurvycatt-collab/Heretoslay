# VS-001 Reaction API contract

**Status:** implementation contract, 2026-10-29. Transport của slice là HTTP command + personalized snapshot polling; chưa phải WebSocket. Cùng origin dưới `/api`; dev dùng Vite proxy, server không phát `Access-Control-Allow-Origin: *` kèm credentials.

## Routes

| Method/path | Auth | Request | Success |
|---|---|---|---|
| `POST /api/rooms` | none | `{ "nickname": "Host" }` | `201 { roomCode, sessionToken, snapshot }` |
| `POST /api/rooms/{code}/join` | none | `{ "nickname": "Guest" }` | `201 { roomCode, sessionToken, snapshot }` |
| `GET /api/rooms/{code}/snapshot` | Bearer | none | `200 { snapshot }` |
| `POST /api/rooms/{code}/commands` | Bearer | command envelope | `200 { outcome, snapshot }` |

Server sinh room code và opaque session token; chỉ lưu SHA-256 token. Client giữ token trong `sessionStorage` theo tab và gửi `Authorization: Bearer …`. Reload dùng lại token/snapshot, không join hay tạo ghế mới. Nickname trim, dài 1–24, unique không phân biệt hoa/thường; base-only tối đa 6. Expansion/config không được hỗ trợ trong slice và bị reject.

Snapshot là view theo session:

```json
{
  "mode": "reaction_demo",
  "roomCode": "ABC234",
  "revision": 8,
  "serverNow": 123,
  "hostPlayerId": "opaque-host",
  "you": { "playerId": "opaque", "nickname": "Host", "isHost": true },
  "players": [{ "playerId": "opaque", "nickname": "Host", "handCount": 2, "isHost": true }],
  "yourHand": [{ "cardId": "fixture.modifier.plus-one.1", "kind": "modifier" }],
  "discardCount": 0,
  "reaction": { "windowId": "opaque", "kind": "modifier", "actorPlayerId": "opaque-host", "deadlineAt": 20123, "resolved": false, "completedPlayerIds": [], "pendingCount": 2, "youCompleted": false },
  "challengeRoll": null,
  "fixtureTotals": { "baseTotal": 7, "modifiers": [], "modifierTotal": 0, "finalTotal": 7 },
  "demo": true
}
```

`serverNow` và `deadlineAt` là epoch ms để client ước lượng countdown offset; `closeReason` xuất hiện khi đóng. Challenge snapshot có `challengeRoll.playedByDice/challengerDice`. `fixtureTotals.modifiers[]` gồm `{playerId, cardId, delta}` và mọi delta/total đều do fixture server tính; đây không phải card effect base. Typed DTO live là `ReactionSliceSnapshot` export từ `@here-to-slay/protocol`.

Không trả session token, token hash, deck order hoặc hand người khác. `playerId`, dice, deadline, delta/value và server time trong payload client đều không có authority; identity lấy từ Bearer token.

## Commands

```json
{"commandId":"uuid","expectedRevision":8,"kind":"OPEN_REACTION_DEMO","payload":{"reactionKind":"challenge"}}
{"commandId":"uuid","expectedRevision":8,"kind":"PLAY_CHALLENGE","payload":{"windowId":"opaque","cardId":"fixture.challenge.response.1"}}
{"commandId":"uuid","expectedRevision":8,"kind":"PLAY_MODIFIER","payload":{"windowId":"opaque","cardId":"fixture.modifier.plus-one.1"}}
{"commandId":"uuid","expectedRevision":8,"kind":"SKIP_REACTION","payload":{"windowId":"opaque"}}
```

Chỉ host mở demo. Fixture dùng namespace `fixture.*`, không phải base card/effect. Mọi player có Skip. Challenge hợp lệ đầu tiên từ đối thủ có card sẽ consume card, server roll hai bên và mở Modifier window 20 giây. Modifier hợp lệ hoặc Skip hoàn tất player; toàn bộ hoàn tất đóng sớm. Deadline không reset; `now >= deadlineAt` đóng đúng một lần. Retry cùng scoped idempotency key/fingerprint trả outcome cũ; payload khác trả conflict và không consume thêm.

## Response/error

Outcome: `{ "accepted": true, "code": "ACCEPTED", "replayed": false, "commandId": "uuid", "revision": 8 }`. Error dùng `{ "ok": false, "error": { "code": "STABLE_CODE", "message": "safe text" } }` với HTTP phù hợp. Tối thiểu: `INVALID_JSON`, `BODY_TOO_LARGE`, `INVALID_NICKNAME`, `NICKNAME_TAKEN`, `ROOM_NOT_FOUND`, `ROOM_CODE_TAKEN`, `ROOM_FULL`, `REACTION_ACTIVE`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `INVALID_COMMAND`, `STALE_REVISION`, `WINDOW_ACTIVE`, `WINDOW_CLOSED`, `WINDOW_MISMATCH`, `CARD_NOT_OWNED`, `SELF_CHALLENGE`, `IDEMPOTENCY_CONFLICT`, `EXPANSION_UNSUPPORTED`.

Body tối đa 4 KiB. Create có best-effort per-IP bound; join/command/snapshot có per-room/session bounds. Contract không tạo account, không hứa reconnect rotation production và không triển khai full AP/card-effect/win engine.
