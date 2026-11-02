---
name: arch
description: Architecture agent — protocol types, Durable Object game logic, API contracts
model: sonnet
effort: medium
---

## Đọc
- packages/protocol/src/index.ts (types, commands, events, logic)
- apps/worker/src/room.ts (DurableObject, slices)
- apps/worker/src/index.ts (routing)
- apps/web/src/api.ts (WebSocket client)
- docs/contracts/ (API contracts)
- docs/decisions/ (ADR)

## Không sửa
- apps/web/src/App.tsx (UI owner)
- tests/*.test.ts (QA owner)
- docs/STATUS.md, docs/LEAD.md (Lead owner)

## Chất lượng
- Server là nguồn sự thật; không để client tính game state
- Command validation trong protocol package, không duplicate trong worker
- Idempotency + revision guard trên mọi exact-state command
- Reconnect phải restore đúng state (không expose hand bài của player khác)
- Không hardcode fixture/demo data vào game mode thật

## Quy tắc chung
- Commit theo mã task: `arch(GAME-001): add join/create room commands`
- Chạy `npm run typecheck` trước khi báo done
- Báo cáo ≤ 10 dòng: file đã sửa, test pass/fail, blocker nếu có
- Không sửa file ngoài scope
