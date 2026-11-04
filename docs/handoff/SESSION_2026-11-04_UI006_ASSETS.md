# Handoff — UI-006 + asset restructure + WebP (2026-11-04)

## Assets
- Layout mới: `assets/cards/base/<pack>/` (base game) và `assets/cards/expansions/<expansion>/<pack>/` (mở rộng). Xem `assets/cards/README.md`.
- Kickstarter = expansion: `assets/cards/expansions/kickstarter/preview/` (đã tách khỏi base, không dùng cho gameplay base).
- Toàn bộ card PNG → **WebP q90, đúng kích thước pixel cũ** (152 MB → ~11 MB; `apps/web/dist` ~13 MB). Resolver nhận `.png|.webp`; loader glob `base/*` trước, `expansions/**` sau → thêm expansion chỉ cần thả folder.
- 3 zip trong `E:\Code\Card asset\Base game` trùng byte-size với pack 01/02/03 → không có gì mới để thêm từ đó.
- Art còn thiếu đã lấp bằng PnP sheet gốc (wiki PnP, rights UNVERIFIED như các nguồn khác): `05-base-pnp-fill` (Mighty Blade, Sealing Key), `04-base-challenge` (Challenge thật, thay bản clone Kickstarter). Catalog 95/95 card có art. Mighty Blade có huy hiệu class của PnP đè lên góc art.
- Class icon (9 PNG nhỏ, ~80 KB tổng) giữ PNG.

## Game
- Fix: Monster bị slay không bù lại → `refillFaceUpMonsters` (base-engine.ts) chạy sau mọi lệnh, mọi settle và khi load state; test `tests/monster-refill.integration.test.ts`.

## UI
- Player panel: hex/nametag/stats/token lớn hơn, art hero nhìn rõ; seat mình xếp cột sát hand.
- Notification: chỉ 1 dòng mới nhất, cạnh nút LOG, fade sau 5s.
- Draw / Redeal / Pass (+Pull) to hơn; thanh timer to hơn.
- Màn Challenge (versus) + Hero roll: khối nội dung căn giữa dọc (2 hàng spacer 1fr), card feature cap theo vh.

## Chưa làm / cần mắt owner
- Chưa chụp được màn kết quả Challenge thật (dùng chung CSS với màn Hero roll đã kiểm tra).
- Typecheck PASS; `npm run test:integration` 85 pass / 0 fail / 1 skip.
