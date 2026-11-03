# tools/

## import-card-art.ts — batch import ảnh thẻ bài

Crop/resize ảnh gốc theo khung Art trong `docs/contracts/CARD_TEMPLATE_SPEC.json`, xuất vào
`apps/web/public/assets/cards/` và ghi `card-art-manifest.json` (contract: `docs/contracts/CARD_ART_MANIFEST.md`).
`apps/worker/src/content/base-cards.json` chỉ được **đọc**, không bao giờ bị sửa.

### Cài đặt

`sharp` đã là devDependency ở root, chỉ cần:

```bash
npm install
```

### Chạy

```bash
npm run import-art -- ./raw-images
```

```bash
npm run import-art -- ./raw-images --dry-run --verbose
```

```bash
npm run import-art -- ./raw-images --format png --position attention
```

Tên file (không phân biệt hoa thường, bỏ qua đuôi) phải khớp một trong:

| Dạng | Ví dụ |
|---|---|
| definitionId đầy đủ | `hts.base.v1.hero.bad-axe.png` |
| kind + slug | `hero.bad-axe.jpg` |
| slug | `bad-axe.webp` |
| Tên thẻ | `Bad Axe.png` |

Nhiều file trỏ cùng một thẻ → giữ file khớp chính xác nhất (definitionId > kind.slug > slug > tên).
Tên sai chính tả sẽ được gợi ý "did you mean".

| Option | Mặc định | Ý nghĩa |
|---|---|---|
| `--format webp\|png` | `webp` | Định dạng xuất |
| `--quality 1-100` | `86` | Chất lượng WebP |
| `--fit cover\|contain` | `cover` | cover = crop lấp đầy khung; contain = giữ nguyên ảnh, viền trong suốt |
| `--position` | `centre` | Điểm neo crop: `centre/top/bottom/left/right/attention/entropy` |
| `--scale n` | `1` | Nhân kích thước khung (vd `0.5` cho asset nhẹ) |
| `--reset` | — | Bỏ manifest cũ thay vì merge |
| `--dry-run` | — | Chỉ match + kiểm tra ảnh, không ghi gì |
| `--strict` | — | Exit 1 nếu có file bị bỏ qua hoặc thẻ còn thiếu ảnh (dùng cho CI) |
| `--verbose` | — | Liệt kê từng thẻ còn thiếu ảnh |

Exit code: `0` OK · `1` lỗi cấu hình / `--strict` không đạt · `2` có ảnh hỏng.

Kích thước khung (px, từ spec): party_leader 745×1176 · monster 745×824 · hero/item/cursed_item/magic 545×545 ·
modifier 545×545 · challenge 645×550.

### Quyền tác giả

Artwork bên thứ ba = rights **UNVERIFIED** (ADR-003). Output bị `.gitignore` mặc định; chỉ bỏ ignore khi owner xác nhận quyền.
