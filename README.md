# Here to Slay Web

Bộ bàn giao Codex được khôi phục ngày 2026-10-28 từ chat “Lập kế hoạch dự án game”. Dự án đã có room/reaction nhiều client chạy local bằng fixture; chưa có ván base hoàn chỉnh.

## Đọc theo thứ tự

1. [Hướng dẫn agent](AGENTS.md) và [trạng thái hiện hành](docs/STATUS.md).
2. Khi tiếp tục: [handoff ngắn](docs/handoff/RESUME.md).
3. Chỉ đọc contract/source liên quan ticket. [Nguồn](docs/handoff/SOURCE_REGISTER.md), master plan và Wave 1 là tài liệu tra cứu khi cần; không đọc lại mặc định.

## Trạng thái thực tế

- Đã chuẩn bị các file trong thư mục này; tài liệu mới được gắn nhãn khôi phục, không giả làm file v0.4 gốc.
- Có ZIP candidate Asset Agent v0.4 trong root, hash/listing tại SOURCE_REGISTER; chưa import/review source bên trong. AGENTS hiện tại vẫn là bản khôi phục.
- Project đã đăng ký trong Codex. Git metadata đã khôi phục và giữ backup; PM đã xác minh root/nhánh main/status. Chưa commit, push hoặc deploy.
- UI đã nối Room Durable Object qua HTTP commands/polling, session theo tab, reaction server authoritative và server dice. Card-specific effects và expansion chưa triển khai.
- Kiểm tra ngày 2026-10-29: root tests 20 workspace + 5 root PASS, live harness SKIP khi URL unset; live HTTP riêng 5/5 PASS. Browser hai tab core flow, reload và disabled controls PASS; giới hạn trong docs/qa/REACTION_SLICE_REPORT.md. Kết quả này gắn với checkout tại lần kiểm.
- Xem CODEX_SETUP.md để mở đúng thư mục và tiếp tục quản lý.

## Cấu trúc đề xuất khi bước vào Foundation

`apps/web/`, `apps/worker/`, `packages/engine/`, `packages/protocol/`, `packages/content/`, `tests/`, `tools/`.
Phạm vi Foundation đã được owner duyệt: React/TypeScript/Vite, npm workspaces, Cloudflare Workers + Durable Objects. Xem docs/handoff/FOUNDATION_DISPATCH.md để biết ownership và nghiệm thu; scope gameplay đầy đủ vẫn theo gate riêng.

## Chạy local

Yêu cầu Node 24, npm 11. Sau khi cài dependency bằng `npm ci`, chạy `npm run dev:web` cho UI mock hoặc `npm run dev:worker` cho Worker local. `npm run typecheck`, `npm run build`, `npm test` là các kiểm tra Foundation; Worker build dùng dry-run, không deploy.

UI có room/reaction demo nhiều client, dùng fixture riêng. Base 2–6 người; expansion chỉ mở tối đa 8 sau khi được triển khai và bật. Batch kế tiếp được đề xuất tại docs/handoff/NEXT_BATCH.md.

## Triển khai

Frontend và Worker được phát hành cùng một revision Cloudflare. Người dùng truy cập qua domain thương hiệu tại `/herotoslay/`; gateway Nau Games chuyển tiếp nội bộ bằng service binding, không công khai endpoint Worker nguồn.

```bash
npm ci
npm run verify
npm run build
npx wrangler deploy --config apps/worker/wrangler.jsonc
```

