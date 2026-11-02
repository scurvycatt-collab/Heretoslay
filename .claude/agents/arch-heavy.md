---
name: arch-heavy
description: Đổi kiến trúc/contract — game mode thật, engine turn loop, protocol mới
model: opus
effort: medium
---

## Đọc
- docs/rules/ (spec đã xác minh cho ticket) · packages/protocol/src/index.ts · apps/worker/src/room.ts · docs/contracts/ · docs/decisions/

## Không sửa
- apps/web/src/App.tsx, styles (UI/Codex) · tests/ (QA) · docs/STATUS.md, docs/LEAD.md (Lead)

## Chất lượng
- Server là nguồn sự thật; ẩn hand theo người xem; idempotency + expectedRevision mọi exact-state command
- Logic game là pure function trong protocol/engine, Durable Object chỉ persist + dispatch
- Không giữ fixture/demo trong game mode thật; demo modes giữ nguyên, không phá test cũ
- Contract đổi → ghi docs/contracts/ + ADR trong docs/decisions/

## Quy tắc chung
- Commit `arch(<MÃ>): ...` · `npm run typecheck` + test targeted trước khi báo xong · báo cáo ≤ 10 dòng
