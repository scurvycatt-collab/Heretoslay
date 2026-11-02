# SL-03 — Setup slice QA preparation

Ngày: 2026-10-29 (Asia/Saigon)  
Owner: QA  
Scope: `tests/**`, `docs/qa/**`; không sửa source/root/tracker  
Input: `SETUP_SLICE_DISPATCH.md`, frozen `SETUP_API.md`, `SETUP_ACCEPTANCE.md`

## Trạng thái

**ROOT/LIVE COMPLETE; BROWSER COVERAGE COMPLETE BY PM IAB.** QA worker post-fix root/live đã PASS. Native Chrome automation của QA không chạy vì app approval timeout; PM đã hoàn tất browser hai client bằng IAB và lưu provenance riêng ngày 2026-11-02.

## File chuẩn bị

- `tests/setup-slice.integration.test.ts`: root router→Room contract tests, chỉ dùng public HTTP envelope.
- File report này: tách planned khỏi evidence đã chạy.

## Planned root coverage

1. Base boundary của `setup_demo`: 1 player bị `NOT_ENOUGH_PLAYERS`; 2 player start được; 6 player start được; player thứ 7 bị room capacity chặn.
2. Sequential persisted join-order: active selector, unique Leader, duplicate reject không mutation, selection incomplete/start/host/setup-lock guards; người chọn cuối đi trước và turn order rotate từ đó.
3. Setup commit: deal 5/player; main deck còn 105 ở 2 player và 85 ở 6; 3 Monster face-up/12 face-down; 3 AP.
4. Auth/privacy/reload: Bearer reject, actor từ session, own-hand only, không token/hash/deck order, reload giữ seat/hand.
5. Turn/AP/idempotency/atomicity: Draw cost 1, Redraw cost 3, EndTurn/no carry, out-of-turn/stale/insufficient AP không mutation, exact replay và conflict.
6. Depletion: seed discard bằng Redraw, drain main deck, reshuffle discard, rồi `INSUFFICIENT_CARDS` không mutation khi tổng nguồn hết.
7. Mode isolation: setup commands trong reaction room và reaction command trong setup room trả `MODE_MISMATCH`; base/expansion config không tạo room.

## Đã chạy

- Targeted root `node --test --experimental-strip-types tests/setup-slice.integration.test.ts`: **4 PASS / 1 FAIL** sau khi sửa một viewer-comparison bug trong test depletion.
- Root gate `npm run test:integration`: **9 PASS / 1 FAIL / 1 SKIP**; reaction live harness SKIP vì URL unset. Mọi root test cũ và bốn nhóm setup còn lại PASS.
- Live HTTP Worker `:8787`: create/join/BEGIN/select/select/START/DRAW đều PASS; snapshot cuối `mode=setup_demo`, `phase=turn_active`, deck 104, AP 2.
- Live probe tái hiện cùng finding: create có unsupported `enabledSetIds` trả 201 và session.
- SL-01 đã báo protocol 10/10, Worker 14/14, typecheck/build dry-run PASS; QA không lặp workspace suites.
- Browser: **NOT RUN** trong checkpoint này, chờ UI delta final.

Lần live đầu không chạm runtime do QA dùng nhầm biến PowerShell reserved `$Host`; đổi tên biến rồi rerun thành công. Đây là harness issue, không phải product finding.

## Post-fix SL-F01 checkpoint — 2026-11-01

- Targeted root `node --test --experimental-strip-types tests/setup-slice.integration.test.ts`: **5 PASS / 0 FAIL / 0 SKIP**. Case expansion/config giữ assertion non-201 và không `sessionToken`; depletion assertion không đổi.
- Root gate `npm run test:integration`: **10 PASS / 0 FAIL / 1 SKIP**. SKIP duy nhất là `reaction slice live HTTP harness` vì `REACTION_SLICE_BASE_URL` unset.
- Health-check local sau khi được phép truy cập socket: `http://127.0.0.1:5173` và `http://127.0.0.1:8787` đều **connection refused**.
- Checkpoint Infra báo sau đó: Vite `http://localhost:5173` HTTP 200 (PID 10292); Worker `127.0.0.1:8787` có listener PID 6496 nhưng `/health` timeout. Đây là trạng thái phối hợp, không thay cho QA live/browser evidence.
- Backend actual URL do PM green-light: `http://127.0.0.1:8789`; elevated loopback health trả HTTP 200 với `service=here-to-slay-worker`.
- Live harness `pwsh -NoProfile -File tests/setup-slice.live-probe.ps1 -BaseUrl http://127.0.0.1:8789`: **PASS**.
  - SL-F01: create với unsupported `enabledSetIds` trả non-201, không `sessionToken`.
  - Setup core: create/join/Leader selection/start PASS; 2 players, `turn_active`, 3 AP, main deck 105, 3 face-up Monsters.
  - Draw/replay: Draw còn 2 AP và active hand 6; exact retry có `replayed=true`, không đổi revision/deck/hand lần hai.
  - Privacy: hai session chỉ thấy own hand IDs; observer thấy roster `handCount=6`, không thấy card IDs hoặc token của session kia.
- QA worker native Chrome: **NOT RUN**; `sky.launch_app` kết thúc bằng `app approval timed out`, không có browser action và không retry/bypass.

## Browser evidence của PM — IAB hai client, 2026-11-02

Provenance: PM chạy IAB trên `http://localhost:5173` sau khi `/api/health` qua proxy tới Worker 8789 trả HTTP 200. Đây là browser evidence tích hợp của PM, không ghi thành QA worker/native Chrome PASS.

- Setup room `BDNP49`: hai client chọn Leader 3/5; Leader đã lấy bị disabled; start deal 5/player, 3 Monsters, 3 AP.
- Draw, reload giữ đúng guest/Leader 5/hand 6/seat, End Turn bỏ AP dư và chuyển turn, Redraw dùng 3 AP rồi auto-advance: **PASS**.
- Roster cùng hiện `Leader X · HAND n`, contrast/wrap đọc được; reload không hiện lại nickname lobby prompt.
- Reaction regression: Challenge dùng server dice, một Modifier + client kia Skip, window đóng `all_completed`: **PASS**.
- Guard room `VVKDUM`: một player Begin bị `NOT_ENOUGH_PLAYERS`; notice tồn tại qua polling, phase không đổi, không auto-retry gameplay.
- Screenshot PM đã view: `C:/Users/hidey/.codex/visualizations/2026/10/29/01a185a2-a20f-7fa0-8aaa-0b9f63e172e5/setup-review-2026-11-01.jpg`.

## Finding actionable

### SL-F01 — P1 — Unsupported expansion/config vẫn tạo setup room

- Contract: `SETUP_API.md` yêu cầu expansion/config bị reject; expansion chưa hỗ trợ không được tạo room/session.
- Trigger: `POST /api/rooms` body `{"nickname":"ExpansionHost","mode":"setup_demo","enabledSetIds":["fixture.expansion"]}`.
- Expected: non-201 stable error, không `sessionToken`, không room.
- Actual: root router→Room và live Worker đều trả **201** với session; room nội bộ vẫn ép base set.
- Evidence source read-only: `apps/worker/src/room.ts` `createModeFrom` chỉ đọc/validate `mode`; `createRoom` bỏ qua extra config và luôn persist base-only sets.
- Impact: client nhận success cho config unsupported, vi phạm frozen API/product gate dù runtime không thật sự enable expansion.
- Owner action: Architecture reject create payload có expansion/config unsupported trước khi tạo token/room; QA rerun targeted + root gate + live probe.

## Bước kế

1. Không còn check bắt buộc trong scope `setup_demo` synthetic của SL-03; PM đã accepted batch local.
2. Không suy acceptance này thành full base/effects/art/expansion hoặc native Chrome coverage.
3. Health-check lại runtime khi batch sau cần dùng; không mặc định PID/port hiện tại còn sống.

## Handoff

- Files: `tests/setup-slice.integration.test.ts`, `docs/qa/SETUP_SLICE_REPORT.md`.
- Checks mới: targeted root 5/5 PASS; root gate 10 PASS/0 FAIL/1 SKIP (live reaction URL unset).
- SL-F01 root và live config regression: PASS; live actual URL `http://127.0.0.1:8789`.
- Live setup core/replay/privacy: PASS qua `tests/setup-slice.live-probe.ps1`.
- Browser: PM IAB hai client setup/reload/reaction regression PASS; QA worker native Chrome NOT RUN vì approval timeout.
- Blocker: không còn blocker trong scope SL-03 synthetic; base/effects/art/expansion vẫn ngoài scope/gated.
- Bước kế: idle; chỉ tiếp tục khi PM giao ticket mới.
