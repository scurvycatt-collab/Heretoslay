# VS-004 reaction slice integration/runtime

Ngày: 2026-10-29 (Asia/Saigon)  
Owner: Infrastructure  
Phạm vi: root tooling, local runtime, lock/CI evidence và report; không sửa source apps/protocol/tests.

## Manifests and runtime

Đã kiểm tra các manifests hiện tại: web giữ React/React DOM/Vite/TypeScript; worker giữ Wrangler/TypeScript và protocol workspace; protocol giữ TypeScript. Không có dependency change cần cài thêm, lockfile không sửa trong lượt này. Runtime: Node `v24.15.0`, npm `11.12.1`.

Local servers đang giữ cho review, chỉ bind loopback:

- Worker Wrangler: `http://127.0.0.1:8787`, PID `28200`, log `docs/infra/reaction-worker.log`.
- Vite: `http://127.0.0.1:5173`, PID `19636`, log `docs/infra/reaction-vite.log`.

Không dùng remote, tunnel, cloud login hoặc deploy. Stop sau review: `Stop-Process -Id 28200,19636` (chỉ dùng đúng PID nếu còn thuộc các process này).

## Runtime requests

Session test dùng nickname không nhạy cảm; token/header chỉ dùng trong memory, không ghi report.

- Worker `GET /health` → 200, service `here-to-slay-worker`, scope `foundation`.
- Vite `GET /` → 200 HTML đúng app; `GET /src/main.tsx` → 200 JavaScript.
- Vite proxy `GET /api/health` → 200, service `here-to-slay-worker`, scope `reaction-slice`.
- Worker `POST /api/rooms` → tạo room thật, revision 1, 1 player.
- Worker `POST /api/rooms/{roomCode}/join` → revision 2, 2 players.
- Worker `GET /api/rooms/{roomCode}/snapshot` → 200, revision 2, 2 players, personalized nickname đúng host.

Đây là runtime local Wrangler + local Durable Object binding, không phải production Cloudflare. Các request create/join/snapshot dùng session thật của runtime local; không đánh giá WebSocket/full gameplay.

## Checks

- `npm run typecheck` — PASS: web, worker, protocol.
- Worker tests — PASS: 10/10.
- Protocol tests — PASS: 10/10.
- Root integration — 1/2 pass, 1 fail: capacity contract pass; mock Room storage/alarm fail tại `tests/worker-room.integration.test.ts:61`, expected HTTP 201 nhưng nhận 404. Đây là failure của test/source owner, không sửa trong scope.
- Vì root `npm test` dừng ở integration failure, không claim full root test pass. Build/dry-run không chạy lại trong lượt này.

Handoff: local runtime đã healthy cho QA/UI review; blocker còn lại là mock integration failure nêu trên. UI/backend source và gameplay không được thay đổi bởi lượt này.
