# Architecture Foundation handoff

Ngày tạo: 2026-10-28; kiểm tra lại: 2026-10-29. Owner: Architecture. Phạm vi ghi: `packages/protocol/**`, `apps/worker/**`, ADR/protocol docs. Đây là scaffold Foundation, không phải full gameplay/release.

## Đầu ra

- `@here-to-slay/protocol`: TypeScript command/event contract; validation cho reaction và exact-state command; reducer reaction thuần với `windowId`, scoped idempotency/fingerprint, deadline/close-once, first-valid Challenge, server dice injection, một Modifier-or-Skip; capacity base 2–6/expansion supported+enabled tối đa 8; personalized projection lọc hand/token/deck.
- `@here-to-slay/worker`: router `GET /health`, `/rooms/:code`; Room Durable Object SQLite migration config, public scaffold state, persisted deadline + alarm idempotent. `POST` khởi tạo room; gameplay command chưa nối trả `FOUNDATION_PROTOCOL_NOT_CONNECTED` thay vì giả hoạt động.
- ADR đổi thành `APPROVED FOR FOUNDATION`; eligibility pending đã được thay bằng product decision.

Manifests khai `typescript@7.0.2`, `wrangler@4.154.0`, và workspace dependency `@here-to-slay/protocol@0.0.0`. Không sửa root manifest/lockfile và không cài package.

## API contract

Protocol export `validateClientCommand`, `validateReactionCommand`, `processReactionCommand`, `commandFingerprint`, capacity helpers, `projectRoomForPlayer`, cùng `ClientCommand`, `ServerEvent`, reaction/state DTO. Reaction retry lookup theo `(roomId, playerId, commandId)` trước validation hiện tại; fingerprint khác trả `IDEMPOTENCY_CONFLICT`.

Worker export default `fetch`, `RoomDurableObject`, và testable `routeRequest`. Room code không phải credential; auth/WebSocket/reconnect token rotation chưa được triển khai.

## Kiểm tra thực chạy trên checkout hiện tại

- Node `v24.15.0`, `node --test --experimental-strip-types packages/protocol/tests/*.test.ts`: PASS 10/10 ngày 2026-10-29.
- `node --test --experimental-strip-types apps/worker/tests/*.test.ts`: PASS 2/2 (`/health`, room routing) ngày 2026-10-29.
- Node syntax check `apps/worker/src/room.ts`: PASS; package JSON parse: PASS.
- `typecheck`/protocol `build`: PENDING Infra install/lock integration; lần thử trước không tìm thấy `tsc`.
- Worker dry-run `wrangler deploy --dry-run --outdir dist`: PENDING Infra install; lần thử trước không tìm thấy `wrangler`; không live deploy.
- `git status --short`: FAIL `fatal: not a git repository`; Architecture không sửa metadata Git vì thuộc Infra.

Sau khi Infra tích hợp lock/install, chạy:

```text
npm --workspace packages/protocol run typecheck && npm --workspace packages/protocol run build
npm --workspace apps/worker run typecheck && npm --workspace apps/worker run build
npm --workspace packages/protocol test && npm --workspace apps/worker test
```

Giới hạn: Worker mới là route/Room DO scaffold; reducer chưa nối vào authenticated WebSocket, reconnect token rotation hoặc full game/effect engine. QA/Infra cần chạy typecheck, dry-run bundle và contract tests sau install; không coi các phần đó đã hoàn thành ở scaffold này.
