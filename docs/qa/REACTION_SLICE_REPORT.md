# VS-003 — Reaction Slice QA report

Ngày: 2026-10-29 (Asia/Saigon)  
Owner: QA worker  
Phạm vi ghi: `tests/**`, file này; không sửa backend/UI/root/lock  
Input: `REACTION_API.md`, Architecture/UI handoff và source checkout hiện tại  
Trạng thái: package/direct-DO, live local Wrangler/DO HTTP và browser hai tab đã chạy. F-01/F-02/F-03 đã được targeted reverify; invalid saved-session và physical no-card browser state còn SKIP vì UI không có đường tạo trạng thái.

## Thay đổi QA

- Thêm `tests/reaction-slice.integration.test.ts`: router→Room mock integration cho auth/profile isolation, reload identity, host-only demo, chống `playerId` spoof, F-04 hand→discard/idempotency/second Modifier và concurrent Challenge/server dice.
- Thêm `tests/reaction-slice.live.test.ts`: guard bằng `REACTION_SLICE_BASE_URL`; unset thì SKIP rõ, có URL thì dùng create/join session thật qua launch routes. Token chỉ ở memory, không log/URL/report.
- Nâng `tests/worker-room.integration.test.ts` khỏi contract cũ sang internal API create + authenticated open reaction; giữ alarm sớm, đúng deadline và retry close-once.
- Không in token/hash vào report, URL hoặc test output.

## Lệnh và kết quả thực

| Lệnh | Kết quả |
|---|---|
| `npm --workspace packages/protocol test` | PASS 10/10 |
| `npm --workspace apps/worker test` | PASS 10/10 |
| Protocol + Worker typecheck | PASS, exit 0 |
| `node --test --experimental-strip-types tests/worker-room.integration.test.ts` | PASS 1/1 sau cập nhật contract |
| `npm test` (rerun sau F-01, checkout hiện tại) | **PASS**, exit 0: workspace 20/20 PASS; root integration 5 PASS/1 SKIP (live URL unset) |
| `REACTION_SLICE_BASE_URL=http://127.0.0.1:8787 node --test … reaction-slice.live.test.ts` | **PASS 5/5**, exit 0, local Wrangler/DO; một deadline thật ~20 giây |
| Browser thật, 2 IAB tabs, Worker `:8787` + Vite `:5173` | **PARTIAL**: create/join/reaction/clock/privacy PASS; reload và control-state FAIL; physical no-card state SKIP |
| Browser targeted reverify sau UI fix, room `TZMVWV` | **PASS** reload đúng room/seat, self-Challenge/completed/resolved disabled; invalid saved-session và physical no-card state SKIP |
| `npm --workspace apps/web run typecheck` sau UI fix | **PASS**, exit 0 |

Root gateway rerun ngày 2026-10-29 xác nhận ba VS-003 route tests đã PASS sau Architecture sửa F-01. Live suite vẫn được tính riêng vì root run chủ ý SKIP khi `REACTION_SLICE_BASE_URL` unset.

Live suite ban đầu bị sandbox chặn loopback `EACCES`; rerun sau tool approval truy cập cùng URL và PASS 5/5. Một assertion harness ban đầu so toàn JSON đã fail vì `serverNow` tăng; QA sửa để loại riêng trường quan sát thời gian rồi rerun xanh. Đây không phải backend finding.

## Finding actionable

### F-01 — P1 — POST forwarding không chạy được trong Node 24 integration

- File: `apps/worker/src/router.ts:60`–`apps/worker/src/router.ts:69`.
- Trigger: qua `routeRequest`, `POST /api/rooms/{code}/join` hoặc `/commands` với request body trong Node `v24.15.0`.
- Expected: router chuyển body/header sang Room stub; root test tiếp tục kiểm auth/session/reaction.
- Actual: `new Request(..., { body: request.body })` ném `TypeError: RequestInit: duplex option is required when sending a body` tại line 65. Ba root tests fail cùng stack trước DO.
- Kết quả rerun: **RESOLVED/VERIFIED** trên checkout hiện tại; `npm test` exit 0, root 5 PASS/1 SKIP.

### F-02 — P1 — Reload không khôi phục room/session trong UI

- Browser evidence: host và guest tạo/join room `HX529T`, revision 1→2; reload từng tab đều quay về màn hình Create/Join thay vì đúng personalized room.
- Source evidence: `App` khởi tạo `session` bằng `loadSession()` nhưng `mode` luôn khởi tạo `"lobby"`; không có bootstrap chuyển `mode` sang `"room"` khi session hợp lệ.
- Impact: token có thể còn trong `sessionStorage` nhưng người chơi không thể tiếp tục seat bằng UI; rejoin bằng cùng nickname không phải reload identity.
- Owner action: UI khởi tạo mode từ session hoặc revalidate session trước khi hiển thị room; QA rerun hai tab sau fix.
- Targeted rerun: **RESOLVED/VERIFIED**. Host `ReloadHost` và guest `ReloadGuest` cùng room `TZMVWV`; sau reload riêng từng tab, cả hai vẫn ở đúng room, đúng nickname/seat và revision 2.
- Invalid saved-session fallback: **SKIP browser**. Không có UI/public endpoint để invalidate token hoặc tạo saved session giả; QA không mutate `sessionStorage` bằng script. Source có `clearSession()` + về lobby khi snapshot poll lỗi, nhưng không nâng thành browser PASS.

### F-03 — P2 — Reaction controls vẫn enabled sau completed/closed

- Browser evidence: guest dùng một Modifier và roster đổi `COMPLETED`, nhưng `USE 1 MODIFIER`/`SKIP` vẫn enabled; sau host Skip đóng `CLOSED · all_completed`, các nút vẫn enabled. Revision/state không đổi khi thử Modifier thứ hai, nên server guard vẫn bảo vệ authority.
- Cùng surface, actor Challenge vẫn thấy `PLAY CHALLENGE` enabled dù self-Challenge không hợp lệ; server không đổi revision.
- Impact: UI cho gửi lệnh chắc chắn invalid và feedback lỗi có thể bị polling kế tiếp xóa; không phát hiện corruption server.
- Owner action: UI disable controls khi `resolved`, khi viewer đã completed, và disable Challenge cho actor/no legal card.
- Targeted rerun: **RESOLVED/VERIFIED** cho các state tạo được qua UI. Ở Challenge, actor `PLAY CHALLENGE` disabled, actor `SKIP` enabled, guest Challenge enabled. Sau guest dùng một Modifier, cả `USE 1 MODIFIER` và `SKIP` của guest disabled khi roster là `COMPLETED`. Sau host Skip đóng `CLOSED · all_completed`, cả hai controls disabled ở cả hai tab.
- Physical no-card Challenge: **SKIP browser** vì fixture cấp Challenge cho mỗi player và không cho mở Challenge thứ hai sau khi card đã tiêu thụ. Source có guard `!challenge`, nhưng không suy browser PASS.

## Coverage trạng thái

- Direct Room/package assertions hiện có: create/join 2–6, nickname/auth/profile isolation, reload, host-only, no-card Skip ở protocol, same-window concurrency/idempotency, F-04 card movement, early close, deadline/alarm, server dice — PASS trong mock/package layer.
- Root gateway: PASS sau F-01, 5 PASS/1 live-harness SKIP.
- Live local Wrangler/DO HTTP: PASS 5/5 flows, bao phủ nickname/capacity/auth/projection/reload, poll ~1 giây, host-only, chống payload spoof, same-window concurrency/idempotency, **F-04 authoritative hand→discard**, no-legal-Challenge actor Skip, early close/no-reset, deadline/disconnect/late close-once, server dice và negative body/card. Fixture vẫn `fixture.*`; không phải base effects.
- Browser hai tab: create/join nickname+room, personalized polling revision, host mở Challenge, guest Challenge, server dice, transition sang Modifier, một Modifier/player, Skip và early close `all_completed`, countdown 20→17→14→11→9 không reset trong cùng window — PASS.
- URL cả hai tab giữ `http://127.0.0.1:5173/`; 6 console entries/tab không có `Bearer`, `sessionToken` hay error — PASS, không rò token quan sát được.
- Reload identity — PASS targeted reverify F-02. Invalid saved-session fallback — SKIP browser, source-only evidence.
- Controls theo actor/completed/resolved — PASS targeted reverify F-03. Physical no-card browser state — SKIP: fixture hiện cấp card cho mỗi player và resolved reaction không mở lại demo kế tiếp. Direct protocol/live HTTP coverage cho no-legal-card Skip vẫn PASS; không suy browser PASS từ đó.

## Handoff

F-02/F-03 đã verified trên browser thật; web typecheck xanh. Hai case chưa thể browser-verify là invalid saved-session fallback và physical no-card Challenge, cần test hook/fixture công khai nếu muốn đóng browser coverage. Không cần lặp live 20 giây; F-01, root gate và live HTTP giữ kết quả xanh trước đó. Không claim production, full game, WebSocket hoặc reconnect rotation.

## Checkpoint

- Đã kiểm: protocol 10/10, worker 10/10, root 5 PASS/1 SKIP, Room legacy 1/1, live HTTP 5/5; browser hai tab reaction flow đã chạy.
- Fail/skip: không còn FAIL targeted; invalid saved-session và physical no-card browser state SKIP.
- WIP thuộc QA: `tests/reaction-slice.integration.test.ts`, `tests/reaction-slice.live.test.ts`, `tests/worker-room.integration.test.ts`, `docs/qa/REACTION_SLICE_PLAN.md`, file report này.
- Bước kế tiếp: chỉ rerun hai case SKIP nếu UI/fixture cung cấp đường tạo trạng thái; QA không sửa backend/UI.
