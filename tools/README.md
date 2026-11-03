# tools/

## import-card-art.ts — batch import artwork thẻ bài (CLI)

Crop/resize **artwork** (chỉ hình minh hoạ) theo khung Art trong `docs/contracts/CARD_TEMPLATE_SPEC.json`,
xuất vào một **batch dir mới** `assets/imports/card-art-<stamp>/` (git-ignored, ngoài web `public/`) kèm
`card-art-manifest.json` (contract: `docs/contracts/CARD_ART_MANIFEST.md`).
`apps/worker/src/content/base-cards.json` chỉ được **đọc**. Ảnh nguồn không bao giờ bị ghi đè.

Mặt thẻ hoàn chỉnh / sheet nhiều thẻ → thuộc workbench `/?asset-import` (`docs/contracts/ASSET_IMPORT_WORKBENCH.md`).

### Cài đặt

`sharp` là devDependency ở root:

```bash
npm install
```

### Chạy

```bash
npm run import-art -- ./raw-images --dry-run --verbose
```

```bash
npm run import-art -- ./raw-images
```

```bash
npm run import-art -- ./raw-images --exact-only --strict
```

Ghép tên file (không phân biệt hoa thường, bỏ qua đuôi):

| Dạng | Ví dụ | mappingStatus |
|---|---|---|
| definitionId đầy đủ | `hts.base.v1.hero.bad-axe.png` | `confirmed` |
| kind + slug | `hero.bad-axe.jpg` | `proposed` |
| slug | `bad-axe.webp` | `proposed` |
| Tên thẻ | `Bad Axe.png` | `proposed` |

`proposed` vẫn được import nhưng liệt kê riêng để duyệt; đổi tên file sang definitionId đầy đủ để xác nhận,
hoặc dùng `--exact-only` để bỏ qua chúng. Nhiều file cùng một thẻ → giữ file khớp chính xác nhất.

| Option | Mặc định | Ý nghĩa |
|---|---|---|
| `--out <dir>` | batch dir mới | Thư mục có manifest sẵn → merge (`--reset` để thay) |
| `--format png\|webp` | `png` | Định dạng xuất |
| `--quality 1-100` | `86` | Chất lượng WebP |
| `--fit cover\|contain` | `cover` | cover = crop lấp đầy khung; contain = cả ảnh, viền trong suốt |
| `--position` | `centre` | Neo crop: `centre/top/bottom/left/right` |
| `--scale n` | `1` | Nhân kích thước khung |
| `--exact-only` | — | Chỉ nhận file đặt tên bằng definitionId đầy đủ |
| `--max-file-mib` / `--max-batch-mib` / `--max-megapixels` | `32` / `256` / `40` | Giới hạn v1; vượt = lỗi, không downscale ngầm |
| `--dry-run` | — | Ghép + decode + kiểm tra, không ghi gì |
| `--strict` | — | Exit 1 nếu có file bị bỏ qua/lỗi, còn proposed, hoặc thẻ thiếu ảnh |
| `--verbose` | — | Liệt kê file bị ignore và từng thẻ còn thiếu |

Exit code: `0` OK · `1` lỗi cấu hình/batch hoặc `--strict` không đạt · `2` có ảnh hỏng.

An toàn đầu vào: chỉ quét `.png/.jpg/.jpeg/.webp`, nhưng **định dạng sau decode** mới quyết định (SVG/HTML đổi
đuôi bị từ chối); EXIF được xoay trước khi crop; output được decode lại để kiểm kích thước trước khi ghi.

Kích thước khung (px, từ spec): party_leader 745×1176 · monster 745×824 · hero/item/cursed_item/magic/modifier 545×545 ·
challenge 645×550.

### Quyền tác giả

Artwork bên thứ ba = rights **UNVERIFIED** (ADR-003), `gameplaySupported: false`. Đừng trỏ `--out` vào
`apps/web/public/` (sẽ bị deploy theo bản build) khi owner chưa xác nhận quyền.
