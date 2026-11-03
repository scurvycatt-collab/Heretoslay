# Hướng dẫn nhập asset thẻ bài bằng Adapter

Cập nhật 2026-11-03. Adapter: `apps/web/src/asset-import/adapters/browser.ts` (+ `core.ts`, trình crop `CropEditor.tsx`) (hợp đồng: `docs/contracts/ASSET_IMPORT_WORKBENCH.md`).

## "Database" ở đây là gì?

Dự án **không có database cho ảnh thẻ**. Nơi "lưu" asset là một **pack** trên đĩa:

```
assets/cards/packs/<tên-pack>/
├─ manifest.json        # ánh xạ definitionId → file PNG, kèm hash/nguồn/crop
└─ cards/*.png          # mặt thẻ hoàn chỉnh, 745×1040 (poker) hoặc 827×1417 (tarot)
```

Web đọc pack lúc build (`apps/web/src/cards/resolveCardFace.ts`). Thẻ có `definitionId` trong manifest sẽ hiện ảnh; thẻ chưa có hiện placeholder. Adapter **chạy hoàn toàn trong trình duyệt**: không upload, không server, không ghi đè ảnh nguồn.

## Quy trình 6 bước

1. **Chạy web**: `npm ci` (lần đầu) rồi `npm run dev:web`. Mở `http://localhost:5173/?asset-import`.
   Banner "UI DEMO" nghĩa là chưa nạp ảnh thật.
2. **Chọn nguồn**: bấm **＋ Chọn folder ảnh**, chọn folder chứa PNG/JPEG/WebP (ví dụ `assets/cards/wiki-monster-expansion-20261103/source-png`). Adapter tính SHA-256, giải mã ảnh, đề xuất khổ thẻ. Ảnh hỏng/sai loại/quá lớn được liệt kê ở mục "Bỏ qua N file", không làm mất cả batch.
   - Ảnh đã là một thẻ → 1 candidate. Ảnh là sheet nhiều thẻ → adapter đề xuất lưới; **phải chỉnh lại số crop** cho đúng.
3. **Cắt & xoay** (bước 02):
   - Chọn loại ở cột phải: **Nguyên mặt thẻ** (cắt cả lá, game hiện nguyên ảnh) hoặc **Artwork riêng** (chỉ cắt phần tranh, game tự vẽ khung + chữ — phải gán thẻ ở bước 03).
   - Trên ảnh: **kéo chuột để vẽ vùng**, kéo trong vùng để dời, kéo 8 ô vuông để đổi cỡ. Con lăn = zoom; Space/nút giữa hoặc công cụ ✥ = kéo ảnh. "Khoá tỉ lệ" giữ đúng tỉ lệ ảnh xuất (giữ Alt khi kéo để bỏ khoá tạm thời). Shift + kéo = vẽ đè lên vùng có sẵn.
   - Trang có nhiều thẻ: vẽ (hoặc giữ) vùng bao cả cụm → mở **Chia vùng thành lưới** → nhập hàng/cột → bấm Chia; để tick "Bắt sát mép" thì mỗi ô tự thu sát mép thẻ, bỏ tiêu đề trang.
   - **⇲ Bắt sát mép** cho một vùng: tìm mép thẻ quanh vùng hiện tại (nền phải tương đối đồng màu).
   - Tinh chỉnh: mũi tên dời 1 px (Shift 10 px), Alt + mũi tên đổi cỡ, hoặc gõ số x/y/rộng/cao. Xoay bằng ⟲ ⟳.
   - **Kết quả xuất** ở cột phải tự cập nhật sau mỗi thay đổi (không cần bấm nút). Artwork hiện cả ảnh khung tranh lẫn thẻ đã ghép. Tick **Đã kiểm tra** hoặc bấm **Duyệt & sang vùng kế**.
4. **Gán thẻ** (bước 03):
   - **Thẻ trong game**: gõ vài chữ tên thẻ vào ô tìm (không cần dấu, vd. `dodgy`, `wizard`), lọc nhanh bằng nút loại (Hero, Item, Monster…), dùng ↑/↓ + Enter hoặc bấm để gán. Thẻ đã được vùng khác gán (cùng variant) có dấu ⚠. Thẻ expansion chưa có trong catalog: để **Chưa gán**.
   - **Variant** = phiên bản ảnh của cùng một thẻ. Mỗi thẻ chỉ có **một** ảnh `default` — ảnh game hiển thị. Ảnh thứ hai cho cùng thẻ (vd. bản Kickstarter alternate) chọn **Bản khác** và đặt tên riêng; ảnh đó được lưu trong pack nhưng game chưa hiện.
   - **Ghi chú nguồn ảnh**: tự điền theo tên file; sửa nếu muốn ghi rõ bộ thẻ/người vẽ. Dùng để tra và gỡ nhanh khi có yêu cầu bản quyền.
   - Mặt sau (back) hoặc vùng không dùng: tick **Loại khỏi batch**.
5. **Kiểm tra & xuất**: chọn chế độ (`Preview pack` cho phép ID trống; `Webgame pack` bắt buộc ID hợp lệ, đúng khổ, không trùng). Hết lỗi thì bấm **Xuất PNG + manifest + ZIP**, rồi **Tải ZIP**.
6. **Cài vào game**: giải nén ZIP vào `assets/cards/packs/<tên-pack>/` sao cho `manifest.json` và `cards/` nằm ngay trong thư mục đó. **Khởi động lại** `npm run dev:web` (hoặc `npm run build`). Kiểm tra tại `http://localhost:5173/?cards`.

## Quy tắc quan trọng

- `rightsStatus` luôn `FAN_MADE_NON_COMMERCIAL` (ADR-004, DMCA: scurvycatt@gmail.com), `gameplaySupported` luôn `false`: nhập ảnh **không** bật expansion hay thay đổi luật.
- Trùng `definitionId` giữa nhiều pack: pack có **tên thư mục đứng trước theo alphabet thắng**, thẻ mẫu Kickstarter xét sau cùng. Đặt tên pack có chủ đích (vd. `01-base`, `02-alt`).
- Giới hạn v1: 32 MiB/file, 256 MiB/batch, 40 MP/ảnh. Vượt giới hạn thì bị báo lỗi, không tự thu nhỏ.
- Ảnh nguyên mặt được **contain** vào canvas (nền `#10161b`), không méo, không vẽ thêm khung/chữ.
- Artwork được **cover** vào khung tranh của thẻ (Hero/Item/Magic/Modifier 545×545, Challenge 645×550, Monster 745×824, Leader 745×1176); CardRenderer vẽ khung + chữ. Pack phải ở chế độ **Webgame (mapped)** thì game mới dùng.
- Tên file trong ZIP lấy từ `candidateId` đã làm sạch; ZIP được tự kiểm CRC trước khi cho tải.

## Chưa hỗ trợ (cần biết)

| Hạng mục | Tình trạng |
|---|---|
| Hot-reload pack mới | Cần restart dev server / rebuild |
| Zoom 2 ngón trên điện thoại | Chưa; dùng nút −/＋ |
| Safari/Firefox | Chưa kiểm; Chromium OK |

## Xử lý sự cố

- **Nút "Chọn folder" mờ**: trang không có `?asset-import`, hoặc đang bận (bấm Hủy).
- **"Nguồn chưa có SHA-256"**: đang ở demo; chọn folder thật.
- **"Vùng cắt phải nằm trong ảnh nguồn"**: crop âm/tràn/số lẻ.
- **Ảnh vẫn là placeholder sau khi cài pack**: sai cấu trúc thư mục, chưa restart, `definitionId` rỗng/sai, hoặc mode `preview` (pack preview chỉ tra được bằng `candidateId`).
- **Lỗi "Nguồn ... đã đổi (hash khác)"**: file nguồn bị sửa sau khi import; chọn lại folder.

## Kiểm thử đã chạy (2026-11-03)

Trình duyệt Chromium thật, folder gồm 3 PNG monster, 1 JPG Hoodwink, 1 PNG hỏng, 1 `.txt`: bỏ qua đúng 2 file lỗi; xuất 4 PNG đúng kích thước/hash; mapped mode chặn trùng ID; xoay 90° đúng chiều; game đọc pack và trả đúng ảnh 827×1417 cho ID đã map, placeholder cho ID chưa map. Test đơn vị ZIP/CRC: `node --test --experimental-strip-types tools/card-render/*.test.ts`.
