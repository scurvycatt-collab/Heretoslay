# Here to Slay Web — CLAUDE.md

Fan-made multiplayer browser game trên Cloudflare Workers + Durable Objects.
Scope: base game (2–6 người, nickname + room code, không tài khoản). Visual/content do Codex.

## Bản đồ repo

| Đường dẫn | Vai trò | Owner |
|---|---|---|
| packages/protocol/src/index.ts | Types, commands, events, game logic | arch |
| apps/worker/src/room.ts | Durable Object — game state, slice dispatch | arch |
| apps/worker/src/index.ts | Worker entry, routing | arch |
| apps/web/src/App.tsx | React UI (views, send commands) | ui |
| apps/web/src/api.ts | WebSocket client, session | arch |
| tests/*.test.ts | Integration tests | qa |
| docs/contracts/*.md | API contracts giữa protocol↔worker↔web | arch |
| docs/decisions/*.md | ADR — quyết định kỹ thuật | arch |
| docs/STATUS.md | Task board ngắn gọn (PM only) | lead |
| docs/LEAD.md | Lead context, checkpoint | lead |

## Việc → đọc gì

| Việc | File cần đọc |
|---|---|
| Thêm command/event mới | packages/protocol/src/index.ts + docs/contracts/ |
| Sửa game logic worker | apps/worker/src/room.ts + protocol |
| Sửa UI view | apps/web/src/App.tsx + protocol (snapshot types) |
| Thêm test | tests/relevant.test.ts + protocol + room.ts |
| Quyết định kiến trúc | docs/decisions/ + docs/contracts/ |

## Quy tắc bắt buộc

- Server là nguồn sự thật; client không tự tính trạng thái game.
- Không bịa luật, card effect, tiến độ, kết quả test.
- Không commit secrets, không push/deploy khi chưa được yêu cầu.
- Chỉ base game; không hiển thị expansion như đã hỗ trợ.
- Asset artwork bên thứ ba: UNVERIFIED rights, không embed vào engine.
- Mỗi agent chỉ sửa file trong phạm vi vai của mình.
- verify = npm run typecheck + npm run test:integration (targeted khi đủ).
