# ADR-004 — Artwork rights policy: FAN_MADE_NON_COMMERCIAL

Ngày 2026-11-03 · Owner (scurvycatt) · Trạng thái: **ACCEPTED** (owner xác nhận trong cloud session)

## Bối cảnh
ADR-003 / D-11 / D-12 để artwork bên thứ ba ở trạng thái `UNVERIFIED`. Pipeline import (CLI `tools/import-card-art.ts`,
workbench `/?asset-import`) và pack Kickstarter preview (`assets/cards/kickstarter-preview/`) đã sẵn sàng; owner cần chốt
trạng thái quyền để giữ ảnh trong repo và cho resolver nạp artwork.

## Quyết định (owner)
1. Dự án là **fan-made, phi thương mại**, dùng nội bộ gia đình; sẽ chứa cả thẻ fan custom.
2. Asset giữ nguyên **watermark của Unstable Games**; không xoá/che watermark.
3. Yêu cầu gỡ bản quyền (DMCA/takedown) được xử lý **ngay lập tức** qua **scurvycatt@gmail.com**.
4. Trạng thái quyền artwork: `UNVERIFIED` → **`FAN_MADE_NON_COMMERCIAL`**, kèm `takedownContact`.
5. Ảnh Kickstarter đã import được giữ trong lịch sử git và merge vào `main` cùng manifest đã sửa đường dẫn.

## Phạm vi
- Áp dụng cho **ảnh/artwork**: manifest pack (`rightsStatus`, `takedownContact`), `contract.ts`
  (`ARTWORK_RIGHTS_STATUS`, `TAKEDOWN_CONTACT`), adapter browser/core, CLI, script PowerShell, README/gallery.
- **Không** áp dụng cho card **data/text** (`apps/worker/src/content/base-cards.json`, reference catalog): các field đó
  vẫn `UNVERIFIED` theo nghĩa *provenance/độ chính xác nguồn*, là khái niệm khác, không đổi.
- Không đổi luật "chỉ base game": pack Kickstarter là nội dung expansion → giữ `gameplaySupported: false`, không hiển thị
  như expansion đã hỗ trợ.

## Phạm vi bổ sung (owner, 2026-11-03)
- Icon class / Item / Cursed Item gốc của Unstable Games (lấy từ Card Maker) được dùng trong `CardRenderer`: `apps/web/src/cards/icons/` (README ghi nguồn + file license GPL-3.0 của repo Card Maker).

## Đường dẫn trong manifest
Manifest chỉ lưu đường dẫn POSIX **tương đối** (vd. `Print 01 - Poker Cards_Hero/Poker - Front….jpg`,
`fronts/ks-preview-01-r2-c1.png`). `sheets[].path` tương đối so với folder nguồn Kickstarter trên máy owner
(tham số `-Source` của script; sheet gốc không commit). Được kiểm bởi `tests/card-art-rights-paths.test.ts` và guard
`assertRelativePaths` trong CLI.

## Hệ quả / rủi ro (ghi nhận, không chặn)
- `FAN_MADE_NON_COMMERCIAL` là **chính sách của owner, không phải giấy phép**; Unstable Games chưa cấp quyền.
- Repo GitHub `scurvycatt-collab/Heretoslay` đang **public** tại thời điểm quyết định → ảnh có thể được tải/fork bởi bất kỳ ai,
  vượt phạm vi "nội bộ gia đình". Khuyến nghị: chuyển repo private hoặc tách ảnh sang storage riêng tư.
- Gỡ ảnh khỏi lịch sử git (khi có yêu cầu takedown) cần rewrite history + force-push và không thu hồi được bản đã fork/clone.
- Không đưa pack vào `apps/web/public/` / bản deploy công khai nếu chưa có quyết định riêng.
