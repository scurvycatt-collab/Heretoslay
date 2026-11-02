# Protocol draft — room game base

**Status:** FOUNDATION IMPLEMENTED DRAFT; reducer/package contract đã có test cục bộ, chưa phải full gameplay wire contract.

## Envelope và command/event tối thiểu

```json
{"type":"COMMAND","commandId":"uuid","expectedRevision":12,"kind":"PLAY_CARD","payload":{}}
{"type":"EVENT","eventId":"uuid","revision":13,"kind":"REACTION_OPENED","serverNow":1000,"payload":{}}
```

Dòng đầu là client → server; dòng sau là server → client với payload đã lọc theo player.

Commands: `CREATE_ROOM`, `JOIN_ROOM`, `RECONNECT`, `START_GAME`, `PLAY_CARD`, `ROLL_HERO_EFFECT`, `ROLL_DICE`, `PLAY_CHALLENGE`, `PLAY_MODIFIER`, `SKIP_REACTION`, `END_TURN`, `RESYNC`. Events: `ROOM_SNAPSHOT`, `PLAYER_JOINED`, `GAME_STARTED`, `ACTION_ACCEPTED|REJECTED`, `REACTION_OPENED|UPDATED|CLOSED`, `ROLL_COMMITTED`, `CARD_PLAY_RESOLVED`, `MONSTER_RESOLVED`, `TURN_CHANGED`, `GAME_OVER`. Reject dùng code ổn định, không leak hand.

Server suy ra capacity từ selected/enabled set mà build hiện tại hỗ trợ: base-only là 2–6; chỉ expansion được hỗ trợ và bật mới unlock tối đa 8. `JOIN_ROOM` và `START_GAME` validate theo capacity này; reconnect không chiếm ghế mới. Foundation base-first chưa hỗ trợ expansion nên không giả unlock 8. Thay đổi cấu hình cũng phải revalidate capacity; nếu đang có 7–8 người mà tắt expansion cuối, **PROPOSED** reject thay đổi, không kick người chơi.

Mọi gameplay command có `commandId`. Action cần exact state (như `PLAY_CARD`, `END_TURN`) còn bắt `expectedRevision` bằng revision hiện tại. Reaction không bắt equality global này: `PLAY_CHALLENGE`, `PLAY_MODIFIER`, `SKIP_REACTION` bắt buộc gửi `windowId`; DO kiểm tra lại phase, deadline, eligibility và trạng thái Skip.

Thứ tự xử lý: xác thực room/player → lookup idempotency → validate state → commit. Key là `(roomId, playerId, commandId)`; record lưu fingerprint canonical của `kind + payload + windowId` và outcome. Retry cùng fingerprint trả outcome cũ dù revision/window nay đã đổi; cùng key nhưng fingerprint khác bị reject `IDEMPOTENCY_CONFLICT`. Command mới mới chịu validation hiện tại. Event tăng revision sau mỗi transition commit; resync nhận personalized snapshot mới nhất.

## State/phase chính

```text
TURN_ACTION
  PLAY Hero|Item|Magic -> CHALLENGE_WINDOW -> (challenged) CHALLENGE_ROLL
                                            -> (unchallenged/player wins) PLAY_RESOLVE
  PLAY_RESOLVE Hero -> optional FREE_HERO_EFFECT_ROLL -> ROLL_BASE | TURN_ACTION
  ROLL Hero effect --------------------------> ROLL_BASE
  ATTACK Monster ----------------------------> ROLL_BASE
CHALLENGE_ROLL or ROLL_BASE -> MODIFIER_WINDOW -> ROLL_RESOLVE -> TURN_ACTION/GAME_OVER
```

Challenge chỉ mở khi chơi Hero/Item/Magic. Sau khi Hero được chơi thành công, người chơi có thể roll effect ngay không tốn AP; roll này đi thẳng tới Modifier, không mở Challenge. Challenge request hợp lệ đầu tiên theo thứ tự DO thắng; transition đặt `challengerId` và đóng window. Server tự roll cho cả hai bên, persist kết quả rồi mở Modifier; client chỉ animate và không cần bấm/ack.

Mỗi reaction state persist `windowId`, `kind`, `openedAt`, `deadlineAt`, `eligiblePlayerIds`, `skippedPlayerIds`, submissions và `resolved=false`. `deadlineAt = openedAt + configuredReactionMs` (mặc định 20 giây, cấu hình trước ván). Modifier mới không đổi deadline.

## Ordering, deadline và resolve đúng một lần

- Với command reaction mới, DO revalidate `windowId`; nếu `serverNow >= deadlineAt`, resolve rồi reject `WINDOW_CLOSED`. Message nhận trước deadline được xét theo thứ tự DO, không theo timestamp client.
- `resolveWindow(windowId)` kiểm tra phase/ID/deadline/`resolved`, persist transition trước broadcast. Alarm/reconnect/call trùng trở thành no-op. DO schedule deadline gần nhất; không dùng `setTimeout` làm nguồn sự thật.
- Client bỏ event trùng, resync khi gap. Countdown hiển thị deadline theo `serverNow`; client về 0 không tự đóng window.

## Reaction participation và completion

1. **Product decision:** mọi player hiện diện trong cả Challenge và Modifier window, kể cả không có card, và luôn có Skip. Eligibility không suy từ hand. `PLAY_CHALLENGE` vẫn chỉ hợp lệ từ người khác người chơi lá và phải sở hữu Challenge card; self-Challenge bị reject.
2. **Product override:** mỗi người tối đa một Modifier trong một `windowId`; DO reject lá thứ hai bằng `MODIFIER_LIMIT_REACHED`. Quy tắc này thay thế khả năng chơi nhiều Modifier của rulebook cho sản phẩm số.
3. **Product decision:** mỗi eligible player hoàn tất/final cho `windowId` ngay khi submit một Modifier hợp lệ hoặc Skip; sau đó không thể reaction lại. Reaction mới không reset clock, mở lại hay xóa completed. Modifier window đóng sớm khi toàn bộ eligible đã completed.
4. Disconnect không tự Skip; người chưa completed vẫn eligible tới deadline 20 giây. Reconnect trước deadline vẫn reaction được.
5. Challenge đóng ngay ở request hợp lệ đầu tiên; server tự roll cả hai bên như trên.

## Handoff checklist

QA cần kiểm: reaction đồng thời không bị global revision làm mất; `windowId`; retry cũ và idempotency conflict; deadline/alarm; Skip; reconnect; hidden hand; Monster thứ ba commit trước animation.

UI cần: hiển thị countdown dựa deadline server; trạng thái reconnect/resync; disable reaction sau một Modifier hợp lệ hoặc Skip; phân biệt pending/accepted/rejected; animation Monster/Game Over chỉ là presentation và có thể resume từ snapshot.

F-01–F-04 đã được kiểm bằng reducer và Room DO storage tests package-local. Typecheck/dry-run bundle pass; HTTP smoke trên workerd local còn bị sandbox chặn trước startup, xem `REACTION_SLICE_HANDOFF.md`.
