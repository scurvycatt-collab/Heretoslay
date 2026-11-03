# ASSET-IMPORT-UI-001 — UI framework & implementation contract

Ngày 2026-11-03. Owner yêu cầu Codex dựng UI/contract để Claude triển khai importer đang làm. Đây là contract giao việc cho tool local, không thay ADR-003 (vẫn PROPOSED), schema card hay luật. Gemini vẫn sở hữu board/ưu tiên.

## Đầu ra hiện có / điểm nối

- Route dev: `/?asset-import`.
- `apps/web/src/asset-import/AssetImportWorkbench.tsx`: khung UI tương tác 4 bước; nhận prop `adapter?: AssetImportAdapter`.
- `contract.ts`: kiểu draft, adapter, manifest và validator dùng chung.
- `fixtures.ts`: 3 ảnh demo đã crop; hash=null có chủ đích. Không phải kết quả import thật.
- `workbench.css`: responsive, giao diện nguồn / preview / inspector.
- `tools/card-render/asset-import-contract.test.ts`: checks contract.

UI chạy được với demo: chuyển bước/thẻ, sửa metadata, loại candidate, đọc lỗi, tải draft JSON. **Chưa có adapter**: chọn folder, áp dụng crop và xuất PNG bị khóa. Đổi crop/rotation/type/template làm preview stale và bỏ reviewed; không giả vờ ảnh đã được render lại. Demo luôn bị chặn export PNG.

## Phân công và giới hạn

**Codex đã chuẩn bị:** các file trên + route tối thiểu trong `apps/web/src/main.tsx`.

**Claude triển khai:** adapter trong `apps/web/src/asset-import/adapters/**`, crop/composite/export tooling liên quan; nối instance adapter vào workbench. Đọc lại file trước khi sửa vì checkout có WIP. Không viết importer thứ hai nếu tool đang làm đã có chức năng tương ứng: bọc bằng adapter.

Không sửa protocol, card data, engine, luật hoặc kích hoạt expansion. Không ghi đè bộ ảnh/source. Không tự commit/push/deploy. Nếu cần thay interface, sửa contract và test trong cùng ticket, ghi rõ delta để Codex tích hợp renderer.

Input chính: folder do người dùng chọn; catalog definition read-only; `CARD_TEMPLATE_SPEC.json`; optional draft JSON đã lưu. Output: PNG, manifest, ZIP và preview thật. Import artifact không đồng nghĩa gameplay hỗ trợ bộ đó.

## Luồng UI cần hoàn thiện

| Bước | Hành vi bắt buộc | Điều kiện chuyển trạng thái |
|---|---|---|
| 1. Nguồn | Chọn folder, liệt kê file/path tương đối, kích thước, hash, phân biệt ảnh sheet/ảnh riêng, front/back | Decode/hash xong mới tạo candidate thật; file lỗi hiện riêng, không làm mất batch |
| 2. Crop | Overlay vùng cắt trên sheet, grid proposal có thể chỉnh; thêm/xóa vùng; rotate 0/90/180/270; zoom | Người dùng áp dụng crop, xem preview mới rồi đánh dấu reviewed |
| 3. Mapping | Chọn nguyên mặt/artwork, khổ, ID, variant, nguồn; cảnh báo trùng | Preview cho phép ID=null; webgame yêu cầu ID hợp lệ và khổ tương ứng |
| 4. Xuất | Tóm tắt included/excluded/error, PNG/manifest/ZIP, progress/cancel/retry | Chỉ báo thành công sau khi kiểm ảnh/file đầu ra và ZIP |

UI shell hiện nhập crop bằng số; overlay và grid là phần Claude cần nối. Không tự đoán tên/ID từ OCR hoặc filename rồi đánh dấu confirmed. Có thể đề xuất nhưng phải cho duyệt. Back được nhận diện nhưng loại khỏi batch front-only. Không cắt watermark có sẵn.

Cho phép load/save draft theo schema; draft không chứa binary hoặc URL blob có thời hạn. Reload yêu cầu chọn lại folder và đối chiếu hash, không giả vờ nguồn cũ còn truy cập được. UI shell hiện chỉ có save; load/resume cần Claude nối.

## API adapter — nguồn chuẩn là contract.ts

```ts
interface AssetImportAdapter {
  inspect(files: File[], signal: AbortSignal): Promise<ImportDraft>;
  preview(source: AssetSource, candidate: ImportCandidate,
          signal: AbortSignal): Promise<string>;
  export(draft: ImportDraft, mode: "preview" | "mapped",
         signal: AbortSignal): Promise<ExportResult>;
  dispose(): void;
}
```

Nối một instance có lifetime ổn định (useMemo hoặc composition root); không tạo lại mỗi render. UI gọi dispose khi unmount/thay adapter. Giữ file/blob registry theo sourceId; revoke URL cũ khi thay preview/dispose. Hủy phải ngừng đọc/render/ghi thêm khi có thể, bỏ kết quả stale, giữ draft để retry. Không trả success sau abort.

Browser nhận File từ folder picker; không đọc một đường dẫn Windows bất kỳ chỉ bằng chuỗi. Nếu importer hiện là desktop/CLI/service local, adapter bọc transport đó; service chỉ bind loopback, nhận session/file handle do người dùng chọn, không endpoint đọc/ghi tùy ý theo path do client gửi. Không ghép vào API gameplay trên Cloudflare.

Runtime-validate JSON/adapter output tại biên, không chỉ ép kiểu TypeScript. Gợi ý cấu hình v1: PNG/JPEG/WebP; tối đa32MiB/file, 256MiB/batch, 40MP/ảnh. Cho cấu hình rõ trong tool; báo lỗi file vượt ngưỡng, không âm thầm downscale nguồn. MIME/extension chỉ là gợi ý, phải decode ảnh thật; không thực thi HTML/SVG hay nội dung từ metadata. Tên file xuất dùng candidateId an toàn, chặn traversal, không chấp nhận absolute path trong archive.

## Hệ tọa độ / render

1. Hash SHA-256 byte file gốc. Decode có xử lý EXIF thành ảnh nguồn upright chuẩn; `AssetSource.width/height` là kích thước ảnh decode chuẩn này. Crop là pixel nguyên trong hệ đó, **trước rotation của candidate**.
2. Crop phải nằm trong source, width/height>0. Rotation theo chiều kim đồng hồ; 270 tương đương90 ngược chiều.
3. `complete_card_front`: đây là toàn bộ mặt thẻ; fit contain căn giữa vào canvas chuẩn, không chồng tên/chữ/frame lần nữa. Đệm opaque `#10161b` khi cần; giữ `contentRect` thực tế. Không auto-stretch/cover mất chữ.
4. `artwork`: chỉ hình minh họa. Fit cover vào vùng art theo template khi người dùng đã duyệt crop; composite bằng CardRenderer với data read-only. Nếu chưa có definitionId/data hoặc font cần thiết, đánh dấu chưa đủ input, **không xuất artwork riêng như mặt thẻ đã hoàn tất**. Có thể xuất raw artwork trong gói riêng nếu owner yêu cầu ngoài v1.
5. Canvas PNG cuối: poker745×1040 cho Hero/Item/Cursed Item/Magic/Modifier/Challenge; tarot827×1417 cho Leader/Monster. Lấy trực tiếp size/layout từ spec, không hardcode bản khác. Dùng đúng op/value khi render ngưỡng Monster, gồm Dracos đảo range.
6. Preview phải thể hiện output canvas/contain/composite thật trước khi duyệt; nguồn full sheet có preview riêng. Không dùng ảnh fixture làm preview cho nguồn thật.

Font chưa local / layout chưa đủ: báo pending ở composite. Không tự đổi text hoặc cắt dòng mất chữ. Export complete fronts không cần dựng lại font.

## Manifest và mapping renderer

`CardAssetManifest` / `ExportedCardAsset` nằm trong contract.ts. Mỗi file có candidateId, definitionId|null, variant, inputType, **renderMode=complete_face**, template, relativePath, PNG hash/size, sourceId, crop, rotation, contentRect và rightsStatus. Sources chứa path tương đối, hash và dimensions. Không đưa absolute path riêng của máy vào gói chia sẻ.

- Gói preview: ID chưa biết giữ null, không nạp vào resolver gameplay.
- Gói mapped: ID phải có trong catalog, template đúng kind. Key `(definitionId, variant, inputType)` duy nhất; trùng phải chọn rõ replace/skip/variant. Không lấy tên ảnh làm ID engine.
- Chọn variant dùng một policy rõ tại resolver, không ngẫu nhiên/last-write-wins.
- `inputType` ghi nguồn ban đầu; `renderMode=complete_face` ghi cách dùng PNG cuối. Vì artwork đã composite cũng là complete face, renderer hiển thị trực tiếp PNG, không composite hai lần.
- `rightsStatus=UNVERIFIED`, `gameplaySupported=false` ở pack import. Mapping ảnh không được tự nâng quyền hoặc chứng nhận hỗ trợ gameplay.

Resolver hiện `apps/web/src/cards/catalog.ts` chỉ có `artUrl` và manifest rỗng; **chưa nhận whole-face asset**. Claude cần cung cấp pack đúng contract, không nhét ảnh nguyên mặt vào `artUrl`. Tích hợp renderer cần resolver phân biệt `artwork` và `complete_face`, fallback hiện tại khi thiếu/lỗi ảnh. Không sửa BaseRoom commands.

Không ghi đè source; output vào batch directory mới, tên an toàn, chỉ replace khi owner chọn. Gói xuất chứa PNG + manifest + README, không back/excluded/error candidate. Export pack không đưa lên public hosting.

## Nghiệm thu Claude phải báo

- Import ảnh riêng và sheet; crop/rotate/preview/edit/review thực sự hoạt động. Picker hủy không xóa draft. Có state busy/error/cancel/retry; không accept kết quả cũ sau đổi crop.
- Boundary: sai loại file, decode fail, vượt limit, crop âm/tràn/fraction, không có source/hash, duplicate source/candidate, back, empty batch, unreviewed đều có lỗi hữu ích.
- Preview mode giữ ID=null; mapped mode chặn unknown ID, sai template, trùng mapping; variant rõ ràng.
- Complete-front không overlay chữ/frame; artwork có composite hoặc pending đúng lý do. Fit không méo/mất nội dung.
- Fixture thực: 5 front sheets Kickstarter ->69 fronts (17/10/18/12/12); bỏ back. Nguồn hiện tại và crop tham chiếu: assets/cards/kickstarter-preview/manifest.json. PNG tham chiếu: png-webgame/manifest.json. Chỉ cần đọc các file/ảnh liên quan, không gameplay history.
- Decode độc lập toàn bộ PNG xuất:45 Poker745×1040,24 Tarot827×1417; hash đúng; ZIP đủ69PNG và path an toàn; source giữ nguyên. Kiểm trực quan Hero/Item/Modifier/Challenge/Monster/Leader và crop góc mép.
- Build web + contract tests PASS; browser review desktop/mobile, keyboard/modal, chọn folder/cancel/export/download thật. Báo checks thật và giới hạn; không ghi done chỉ vì mock chạy.

## Prompt chuyển cho Claude

> Triển khai importer đang làm theo docs/contracts/ASSET_IMPORT_WORKBENCH.md và apps/web/src/asset-import/contract.ts. Dùng lại tool hiện có qua AssetImportAdapter, nối UI /?asset-import; không tạo importer trùng. Scope: adapters/**, crop/composite/export tooling, thay đổi UI/contract cần thiết có báo delta. Không sửa engine/protocol/card data. Input sheet Kickstarter69front hoặc folder owner chọn. Output PNG chuẩn Poker/Tarot, manifest, ZIP, preview thật; complete front không overlay lại chữ/frame; artwork phải composite đúng data. Preview ID=null được phép, mapped phải kiểm ID/template/variant; giữ rights UNVERIFIED. Chạy build, contract tests, QA import/crop/cancel/export và kích thước PNG; báo handoff ngắn, file/checks/blocker. Không commit/push/deploy.
