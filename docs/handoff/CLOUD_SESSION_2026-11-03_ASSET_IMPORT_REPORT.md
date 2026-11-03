# Cloud session 2026-11-03 — Card art import (Claude)

Nhánh: `claude/cool-cray-tu3i5h` (base `main` d05242b). **Chưa merge `main`, chưa deploy.**

## Commits
| Commit | Nội dung |
|---|---|
| f68086c | CLI `tools/import-card-art.ts` (sharp) — crop artwork theo `CARD_TEMPLATE_SPEC`, manifest, báo cáo |
| 550c821 | Merge contract `docs/contracts/ASSET_IMPORT_WORKBENCH.md` (+§0 điều chỉnh); CLI theo contract: batch dir ngoài `public/`, confirmed/proposed, limits, decode thật, schema 2 |
| b482f71 | Merge `origin/codex/card-render-import-workbench` (CardRenderer + workbench + Kickstarter pack); contract tests vào `test:integration` |
| 9cffbd2 | Browser adapter nối workbench `/?asset-import` (dev-only), overlay crop, resume draft, export PNG/manifest/ZIP có kiểm lại; core dùng chung với CLI |

## Trạng thái kiểm tra (lần chạy cuối)
- `npm run typecheck`, `tsc -p tools/tsconfig.json`, `vite build`: sạch.
- `npm run test:integration`: 49 pass / 0 fail / 1 skip (live test, skip như trước).
- E2E Chromium trên sheet tổng hợp dựng từ 69 crop tham chiếu: 69 PNG (45 poker / 24 tarot); crop/contentRect/rotation khớp tham chiếu 69/69; ZIP + SHA-256 kiểm độc lập; cancel/retry, mapped-block, resume draft, mobile 390px OK. Chi tiết: contract §0.5.

## Owner cần làm / quyết
1. Chạy workbench với **5 sheet JPG thật** (`npm run dev:web` → `/?asset-import` → chọn folder Kickstarter); kỳ vọng 69 mặt, loại tay ô thừa nếu có (contract §0.6).
2. `assets/cards/kickstarter-preview/**/manifest.json` chứa **đường dẫn tuyệt đối Windows** (`E:\…`) — nên đổi sang path tương đối.
3. Ảnh Kickstarter (rights UNVERIFIED, expansion) đã nằm trong lịch sử git của nhánh: chấp nhận, hay đưa ra ngoài repo.
4. Review rồi quyết merge nhánh vào `main`.

## Việc tiếp theo (không thuộc session này)
- Codex: resolver `cards/catalog.ts` đọc pack `complete_face` (khác pack `artwork` của CLI); tiếp nhận delta `contract.ts` (§0.4).
- Artwork composite → PNG (cần rasterizer cho CardRenderer); hiện artwork bị chặn xuất có lý do.
- Kiểm Safari/Firefox; chỉnh cả grid một lần.
