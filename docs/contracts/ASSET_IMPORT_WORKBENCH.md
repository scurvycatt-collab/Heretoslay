# ASSET-IMPORT-UI-001 — UI framework & implementation contract

Ngày 2026-11-03. Owner yêu cầu Codex dựng UI/contract để Claude triển khai importer đang làm. Đây là contract giao việc cho tool local, không thay ADR-003 (vẫn PROPOSED), schema card hay luật. Gemini vẫn sở hữu board/ưu tiên.

> **Đọc §0 trước.** §0 ghi các điều chỉnh của Claude khi merge (2026-11-03): trạng thái thật trong repo, chỗ doc gốc mâu thuẫn với nhau hoặc với tool hiện có, và cách đã giải quyết. Các mục §1–§8 là nội dung gốc của Codex (đã sửa lỗi chính tả/khoảng trắng). Chỗ nào §0 nói khác thì §0 thắng cho tới khi owner quyết lại.

## 0. Điều chỉnh khi merge (Claude)

### 0.1 Trạng thái thật trong repo (sau khi merge `codex/card-render-import-workbench`, 2026-11-03)

| Thành phần | Trạng thái |
|---|---|
| `apps/web/src/asset-import/{AssetImportWorkbench.tsx,contract.ts,fixtures.ts,workbench.css}`, route `/?asset-import` | Có (Codex, `668a506`). Adapter browser **đã nối** (§0.4). Route chỉ có ở dev build. |
| `apps/web/src/cards/{CardRenderer,CardGallery,CardPreview}.tsx`, `catalog.ts` (`cardAssets` rỗng, chỉ `artUrl`), route `/?cards` | Có. Resolver chưa phân biệt `artwork`/`complete_face`. |
| `tools/card-render/asset-import-contract.test.ts` | Có. Đã thêm vào `npm run test:integration` (§0.2-J). |
| `assets/cards/kickstarter-preview/` (crop nguồn + `png-webgame/` 69 PNG + 2 manifest) | Có trong git. Đây là output tham chiếu của script PowerShell, **không** phải output của adapter. |
| 5 sheet JPG Kickstarter gốc | **Không** có trong repo (chỉ ở máy owner, `E:\…`) → nghiệm thu §7 cần owner chọn folder đó trên máy thật. |
| Importer CLI | `tools/import-card-art.ts` (Node + sharp, artwork pack, `CARD_ART_MANIFEST.md`). |

Vấn đề phát hiện khi merge:
- ~~Manifest Kickstarter chứa **đường dẫn tuyệt đối Windows** (`sheets[].path`).~~ **Đã sửa 2026-11-03:** `sheets[].path` giờ là POSIX tương đối so với folder nguồn Kickstarter (`sheetPathBase`); hai script PowerShell sinh path tương đối, script export resolve qua `-Source`. CLI có guard `assertRelativePaths`; adapter browser vốn chỉ dùng `webkitRelativePath`. Test: `tests/card-art-rights-paths.test.ts`.
- ~~Ảnh Kickstarter trong lịch sử git — chờ owner.~~ **Owner quyết 2026-11-03 (ADR-004):** giữ trong git, rights `FAN_MADE_NON_COMMERCIAL`, DMCA/gỡ qua scurvycatt@gmail.com. Vẫn không đặt dưới `apps/web/public/`; `gameplaySupported: false` (expansion).
- Hai schema manifest song song: `CardAssetManifest` (contract.ts, complete_face) và artwork pack schema 2 của CLI. Đã phân biệt bằng `packType`/`renderMode` (§0.2-C); resolver cần đọc cả hai có chủ đích.

### 0.2 Mâu thuẫn đã giải quyết

| # | Chỗ mâu thuẫn | Quyết định |
|---|---|---|
| A | §3 "không tự đoán ID từ filename rồi đánh dấu confirmed" vs. CLI ghép theo tên file (owner yêu cầu, gồm cả `bad-axe.jpg`) | CLI giữ cách ghép, nhưng chỉ tên = **definitionId đầy đủ** mới là `mappingStatus: "confirmed"`; ghép theo `kind.slug`/`slug`/tên thẻ là `"proposed"` và được liệt kê riêng trong báo cáo. `--exact-only` bỏ toàn bộ proposed. `--strict` fail nếu còn proposed. |
| B | §6 "Export pack không đưa lên public hosting" + "output vào batch directory mới" vs. CLI cũ ghi thẳng vào `apps/web/public/assets/cards/` (Vite copy `public/` vào bản build → art UNVERIFIED sẽ bị deploy) | Mặc định CLI ghi vào batch dir **mới** `assets/imports/card-art-<stamp>/` (git-ignored, ngoài `public/`). Chỉ khi owner chủ động `--out` vào thư mục có sẵn mới merge; `artUrl` chỉ được điền khi `--out` nằm trong `apps/web/public/` (owner tự chọn publish). |
| C | §5.4 "artwork phải composite, không xuất artwork riêng như mặt thẻ hoàn tất; raw artwork chỉ trong gói riêng nếu owner yêu cầu ngoài v1" | Owner đã yêu cầu CLI artwork. Pack của CLI là **gói riêng đó**: `packType: "artwork"`, mỗi entry `inputType: "artwork"`, `renderMode: "artwork"` (khác `complete_face`). Resolver **không được** nạp pack này như mặt thẻ hoàn tất; chỉ dùng làm input cho composite ở CardRenderer. |
| D | §2 "không viết importer thứ hai" vs. §4 "browser nhận File, không đọc path bằng chuỗi" — sharp chỉ chạy trên Node | Đề xuất (chờ Codex/owner duyệt, xem 0.3): adapter **chạy trong browser** (`createImageBitmap` + `OffscreenCanvas` + `crypto.subtle`), dùng chung phần lõi thuần (ghép ID, `coverCrop`/`containRect`, validator, giới hạn) với CLI — một importer, hai cách chạy, không cần service loopback. |
| E | §4 limits "gợi ý" | CLI áp dụng đúng mặc định v1 và cho cấu hình: `--max-file-mib 32`, `--max-batch-mib 256`, `--max-megapixels 40`. Vượt ngưỡng = lỗi có tên file, không downscale ngầm. |
| F | §4 "MIME/extension chỉ là gợi ý, phải decode thật; không thực thi SVG" | CLI quét theo đuôi `.png/.jpg/.jpeg/.webp` nhưng kiểm **định dạng sau decode** ∈ {png, jpeg, webp}; file SVG/HTML đổi đuôi `.png` bị từ chối; ảnh nhiều trang/animated bị từ chối. |
| G | §5.1 hash + crop trong hệ upright, ghi lại được | CLI hash SHA-256 byte gốc, decode xoay EXIF trước, crop cover là **rect nguyên tính tường minh** (`coverCrop`) ghi vào manifest kèm `contentRect`. Bỏ gravity `attention/entropy` (không tái lập được crop). |
| H | §4 "Tên file xuất dùng ID an toàn, chặn traversal" | `definitionId` phải khớp `^[a-z0-9]+([.-][a-z0-9]+)*$` mới được dùng làm tên file; `--out` không được trùng/chứa thư mục nguồn; manifest chỉ ghi path tương đối POSIX. |
| I | §3 "chỉ báo thành công sau khi kiểm file đầu ra" | CLI decode lại buffer đã encode, kiểm format + kích thước trước khi ghi (ghi atomic), mới tính là imported. |
| J | §1 test ở `tools/card-render/*.test.ts` | `npm run test:integration` chỉ chạy `tests/*.test.ts`. Khi Codex push test contract, hoặc đặt trong `tests/`, hoặc mở rộng glob — nếu không thì `verify` sẽ không chạy nó. |
| K | §2 "Không tự commit/push/deploy" | Session cloud có hook bắt commit + push lên **nhánh feature** của session; đó không phải merge `main` hay deploy. Vẫn không merge/deploy khi chưa được yêu cầu. |

### 0.3 Kiến trúc đã chọn (D)

Adapter chạy hoàn toàn trong browser trên `File` người dùng chọn: không service, không upload, không đọc path bằng chuỗi. Phần lõi thuần `apps/web/src/asset-import/adapters/core.ts` (nhận diện ảnh theo magic bytes, toán crop/contain/cover, grid preset, ZIP, parse/resume draft) được dùng chung với CLI `tools/import-card-art.ts` — một importer, hai cách chạy.

### 0.4 Đã triển khai (Claude, 2026-11-03)

| File | Vai trò |
|---|---|
| `adapters/core.ts` | Lõi thuần, test trên Node (`tests/asset-import-core.test.ts`) |
| `adapters/browser.ts` | `createBrowserAdapter({ definitions })`: `inspect` / `preview` / `sourcePreview` / `export` / `dispose` |
| `SheetOverlay.tsx` | Overlay vùng cắt trên sheet: kéo để dời, kéo góc để đổi cỡ, phím mũi tên (Shift = 10px, Alt = đổi cỡ), zoom 1–4× |
| `AssetImportWorkbench.tsx` | Nối adapter; tab Sheet/Ảnh xuất; preview tự động lần đầu; bỏ kết quả preview cũ nếu tham số đổi trong lúc render; thêm/xóa vùng; "Duyệt & sang mặt kế"; mở draft JSON + resume; danh sách file bị từ chối; thanh tiến độ; hủy/thử lại |
| `main.tsx` | Composition root: một adapter cho cả trang, nạp lazy **chỉ khi dev** |

Hành vi chính:
- **inspect**: bỏ file ẩn; giới hạn 32 MiB/file, 256 MiB/batch, 40 MP/ảnh (đọc kích thước từ header, trước khi decode); định dạng theo nội dung; SHA-256 byte gốc; decode `imageOrientation: "from-image"` (kích thước upright = `AssetSource.width/height`); file trùng nội dung bị từ chối. Mỗi lỗi vào `draft.rejected`, batch vẫn giữ. Nếu đang hủy giữa chừng thì registry cũ được giữ nguyên.
- **Đề xuất**: sheet 3600×5400 → grid theo `SHEET_PRESETS` (toạ độ đo từ `extract-kickstarter.ps1`; "tarot" trong đường dẫn → tarot 2×6, ngược lại poker 3×6), xoay 270°. Ô gần như đồng màu bị **đề xuất loại** ("ô trống?"), người dùng bật lại được. Ảnh lẻ đúng tỉ lệ poker/tarot (±4%) → complete front; khác → artwork. Tên chứa "back" → side back + loại. definitionId chỉ điền khi tên file = definitionId đầy đủ; mọi đề xuất `reviewed=false`.
- **preview**: render đúng canvas xuất (contain, nền `#10161b`); revoke URL cũ theo candidateId.
- **export**: chạy lại `validateDraft` tại biên; artwork bị chặn với lý do "cần composite — pending v1"; hash lại từng nguồn (đổi file → lỗi); decode mỗi sheet một lần (LRU 2 bitmap); mỗi PNG được đọc lại header + decode lại để kiểm khổ; ZIP (stored) được đọc lại, kiểm CRC + kích thước + SHA-256 từng PNG trước khi báo thành công; kiểm `AbortSignal` giữa các bước, không trả success sau abort.
- **Gói xuất**: `fronts/<candidateId>.png`, `manifest.json` (`CardAssetManifest`, chỉ nguồn được dùng, path tương đối), `README.txt`.

Delta interface (`contract.ts`, đều optional, tương thích ngược):
1. `ImportDraft.rejected?: RejectedFile[]`
2. `AssetImportAdapter.export(..., onProgress?: (p: ExportProgress) => void)`
3. `AssetImportAdapter.sourcePreview?(source, signal): Promise<{ url; scale }>`
4. `dispose()` chỉ giải phóng tài nguyên; adapter vẫn dùng tiếp được (React StrictMode mount 2 lần).

Sửa lỗi phát hiện khi QA:
- Bản build production đóng gói 3 ảnh demo Kickstarter (`fixtures.ts` dùng `new URL(..., import.meta.url)`) → `/?asset-import` giờ chỉ nạp ở dev; `vite build` không còn ảnh hay code workbench.
- Notice kết quả inspect bị preview tự động xóa → preview không xóa notice.

### 0.5 QA đã chạy

- `npm run typecheck`, `tsc -p tools/tsconfig.json`, `vite build`: sạch. `npm run test:integration`: 49 pass / 0 fail / 1 skip (live).
- Unit (Node): preset tái tạo **đúng 69/69 crop** của `assets/cards/kickstarter-preview/manifest.json`; `contentRect` khớp `png-webgame/manifest.json`; sniff PNG/JPEG/WebP, từ chối SVG/HTML; ZIP round-trip + Python `zipfile.testzip()`; path traversal; draft JSON từ chối path tuyệt đối/rights khác UNVERIFIED; resume theo hash.
- E2E Playwright (Chromium) trên **sheet tổng hợp** dựng lại từ 69 crop tham chiếu (5 sheet thật không có trong repo), kèm `.DS_Store`, `notes.txt`, SVG đổi đuôi `.png`, một ảnh back:
  - inspect 1.5 s: 6 nguồn, 79 vùng, 3 file bị từ chối; tự loại 9 ô trống + 1 back → **69/79**.
  - Phím/kéo đổi crop đúng (−30 px màn hình ≈ −147 px nguồn), preview bị đánh dấu stale tới khi áp dụng lại.
  - Duyệt 69/69; mapped mode chặn (69 lỗi definition); hủy giữa lúc xuất → không có kết quả; thử lại → 69 PNG trong ~8 s.
  - ZIP kiểm độc lập: 71 entry, 45 × 745×1040 + 24 × 827×1417, 69/69 SHA-256 khớp manifest, không path nguy hiểm/tuyệt đối; crop/contentRect/rotation khớp tham chiếu 69/69; pixel lệch trung bình 1.96/255 (tối đa 2.71) so với `png-webgame/` — mức nhiễu JPEG của sheet tổng hợp.
  - Draft: lưu → reload → mở draft → chọn folder: khớp hash 6/6, giữ trạng thái duyệt; folder khác → 0/6, liệt kê nguồn thiếu.
  - Mobile 390 px: không tràn ngang; 0 lỗi console.

### 0.6 Chưa làm / giới hạn

- **Chưa chạy trên 5 sheet JPG thật** (chỉ có ở máy owner). Ô sheet 01 r1c1 và cột 1 + r5–6 cột 2 của sheet 02 được loại *vì trống trên sheet tổng hợp*; nếu trên sheet thật chúng không trống (logo, thẻ luật…), workbench sẽ để chúng **được chọn** và người duyệt phải loại tay → kỳ vọng vẫn là 69.
- **Artwork composite** chưa có (CardRenderer chưa có rasterizer PNG): artwork preview được, xuất bị chặn có lý do.
- Grid chỉnh từng ô (kéo/phím/số), chưa có chỉnh cả grid một lần; không có preset cho sheet kích thước khác (dùng "Thêm vùng").
- Resolver `cards/catalog.ts` chưa đọc pack `complete_face` (việc của Codex, phân biệt với pack artwork của CLI).
- Safari/Firefox chưa kiểm; Chromium thì OK. Chưa kiểm keyboard/screen-reader đầy đủ ngoài overlay (vùng là `<button>` có `aria-label` + phím).

---

## 1. Đầu ra hiện có / điểm nối

- Route dev: `/?asset-import`.
- `apps/web/src/asset-import/AssetImportWorkbench.tsx`: khung UI tương tác 4 bước; nhận prop `adapter?: AssetImportAdapter`.
- `contract.ts`: kiểu draft, adapter, manifest và validator dùng chung.
- `fixtures.ts`: 3 ảnh demo đã crop; hash=null có chủ đích. Không phải kết quả import thật.
- `workbench.css`: responsive, giao diện nguồn / preview / inspector.
- `tools/card-render/asset-import-contract.test.ts`: checks contract.

UI chạy được với demo: chuyển bước/thẻ, sửa metadata, loại candidate, đọc lỗi, tải draft JSON. **Chưa có adapter**: chọn folder, áp dụng crop và xuất PNG bị khóa. Đổi crop/rotation/type/template làm preview stale và bỏ reviewed; không giả vờ ảnh đã được render lại. Demo luôn bị chặn export PNG.

## 2. Phân công và giới hạn

**Codex đã chuẩn bị:** các file trên + route tối thiểu trong `apps/web/src/main.tsx`.

**Claude triển khai:** adapter trong `apps/web/src/asset-import/adapters/**`, crop/composite/export tooling liên quan; nối instance adapter vào workbench. Đọc lại file trước khi sửa vì checkout có WIP. Không viết importer thứ hai nếu tool đang làm đã có chức năng tương ứng: bọc bằng adapter.

Không sửa protocol, card data, engine, luật hoặc kích hoạt expansion. Không ghi đè bộ ảnh/source. Không tự commit/push/deploy (xem §0.2-K). Nếu cần thay interface, sửa contract và test trong cùng ticket, ghi rõ delta để Codex tích hợp renderer.

Input chính: folder do người dùng chọn; catalog definition read-only; `CARD_TEMPLATE_SPEC.json`; optional draft JSON đã lưu. Output: PNG, manifest, ZIP và preview thật. Import artifact không đồng nghĩa gameplay hỗ trợ bộ đó.

## 3. Luồng UI cần hoàn thiện

| Bước | Hành vi bắt buộc | Điều kiện chuyển trạng thái |
|---|---|---|
| 1. Nguồn | Chọn folder, liệt kê file/path tương đối, kích thước, hash, phân biệt ảnh sheet/ảnh riêng, front/back | Decode/hash xong mới tạo candidate thật; file lỗi hiện riêng, không làm mất batch |
| 2. Crop | Overlay vùng cắt trên sheet, grid proposal có thể chỉnh; thêm/xóa vùng; rotate 0/90/180/270; zoom | Người dùng áp dụng crop, xem preview mới rồi đánh dấu reviewed |
| 3. Mapping | Chọn nguyên mặt/artwork, khổ, ID, variant, nguồn; cảnh báo trùng | Preview cho phép ID=null; webgame yêu cầu ID hợp lệ và khổ tương ứng |
| 4. Xuất | Tóm tắt included/excluded/error, PNG/manifest/ZIP, progress/cancel/retry | Chỉ báo thành công sau khi kiểm ảnh/file đầu ra và ZIP |

UI shell hiện nhập crop bằng số; overlay và grid là phần Claude cần nối. Không tự đoán tên/ID từ OCR hoặc filename rồi đánh dấu confirmed. Có thể đề xuất nhưng phải cho duyệt (CLI: xem §0.2-A). Back được nhận diện nhưng loại khỏi batch front-only. Không cắt watermark có sẵn.

Cho phép load/save draft theo schema; draft không chứa binary hoặc URL blob có thời hạn. Reload yêu cầu chọn lại folder và đối chiếu hash, không giả vờ nguồn cũ còn truy cập được. UI shell hiện chỉ có save; load/resume cần Claude nối.

## 4. API adapter — nguồn chuẩn là contract.ts

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

Browser nhận File từ folder picker; không đọc một đường dẫn Windows bất kỳ chỉ bằng chuỗi. Nếu importer hiện là desktop/CLI/service local, adapter bọc transport đó; service chỉ bind loopback, nhận session/file handle do người dùng chọn, không endpoint đọc/ghi tùy ý theo path do client gửi. Không ghép vào API gameplay trên Cloudflare. (Đề xuất tránh service: §0.2-D.)

Runtime-validate JSON/adapter output tại biên, không chỉ ép kiểu TypeScript. Cấu hình v1: PNG/JPEG/WebP; tối đa 32 MiB/file, 256 MiB/batch, 40 MP/ảnh. Cho cấu hình rõ trong tool; báo lỗi file vượt ngưỡng, không âm thầm downscale nguồn. MIME/extension chỉ là gợi ý, phải decode ảnh thật; không thực thi HTML/SVG hay nội dung từ metadata. Tên file xuất dùng candidateId an toàn, chặn traversal, không chấp nhận absolute path trong archive.

## 5. Hệ tọa độ / render

1. Hash SHA-256 byte file gốc. Decode có xử lý EXIF thành ảnh nguồn upright chuẩn; `AssetSource.width/height` là kích thước ảnh decode chuẩn này. Crop là pixel nguyên trong hệ đó, **trước rotation của candidate**.
2. Crop phải nằm trong source, width/height > 0. Rotation theo chiều kim đồng hồ; 270 tương đương 90 ngược chiều.
3. `complete_card_front`: đây là toàn bộ mặt thẻ; fit contain căn giữa vào canvas chuẩn, không chồng tên/chữ/frame lần nữa. Đệm opaque `#10161b` khi cần; giữ `contentRect` thực tế. Không auto-stretch/cover mất chữ.
4. `artwork`: chỉ hình minh họa. Fit cover vào vùng art theo template khi người dùng đã duyệt crop; composite bằng CardRenderer với data read-only. Nếu chưa có definitionId/data hoặc font cần thiết, đánh dấu chưa đủ input, **không xuất artwork riêng như mặt thẻ đã hoàn tất**. Có thể xuất raw artwork trong gói riêng nếu owner yêu cầu ngoài v1 (= pack của CLI, §0.2-C).
5. Canvas PNG cuối: poker 745×1040 cho Hero/Item/Cursed Item/Magic/Modifier/Challenge; tarot 827×1417 cho Leader/Monster. Lấy trực tiếp size/layout từ spec, không hardcode bản khác. Dùng đúng op/value khi render ngưỡng Monster, gồm Dracos đảo range.
6. Preview phải thể hiện output canvas/contain/composite thật trước khi duyệt; nguồn full sheet có preview riêng. Không dùng ảnh fixture làm preview cho nguồn thật.

Font chưa local / layout chưa đủ: báo pending ở composite. Không tự đổi text hoặc cắt dòng mất chữ. Export complete fronts không cần dựng lại font.

## 6. Manifest và mapping renderer

`CardAssetManifest` / `ExportedCardAsset` nằm trong contract.ts. Mỗi file có candidateId, definitionId|null, variant, inputType, **renderMode=complete_face**, template, relativePath, PNG hash/size, sourceId, crop, rotation, contentRect và rightsStatus. Sources chứa path tương đối, hash và dimensions. Không đưa absolute path riêng của máy vào gói chia sẻ.

- Gói preview: ID chưa biết giữ null, không nạp vào resolver gameplay.
- Gói mapped: ID phải có trong catalog, template đúng kind. Key `(definitionId, variant, inputType)` duy nhất; trùng phải chọn rõ replace/skip/variant. Không lấy tên ảnh làm ID engine.
- Chọn variant dùng một policy rõ tại resolver, không ngẫu nhiên/last-write-wins.
- `inputType` ghi nguồn ban đầu; `renderMode=complete_face` ghi cách dùng PNG cuối. Vì artwork đã composite cũng là complete face, renderer hiển thị trực tiếp PNG, không composite hai lần.
- `rightsStatus=FAN_MADE_NON_COMMERCIAL` + `takedownContact` (ADR-004), `gameplaySupported=false` ở pack import. Mapping ảnh không được tự đổi trạng thái quyền hoặc chứng nhận hỗ trợ gameplay.
- Pack artwork của CLI (`packType: "artwork"`, `renderMode: "artwork"`) là loại khác, xem `CARD_ART_MANIFEST.md`; resolver phải phân biệt (§0.2-C).

Resolver hiện `apps/web/src/cards/catalog.ts` chỉ có `artUrl` và manifest rỗng; **chưa nhận whole-face asset**. Claude cần cung cấp pack đúng contract, không nhét ảnh nguyên mặt vào `artUrl`. Tích hợp renderer cần resolver phân biệt `artwork` và `complete_face`, fallback hiện tại khi thiếu/lỗi ảnh. Không sửa BaseRoom commands.

Không ghi đè source; output vào batch directory mới, tên an toàn, chỉ replace khi owner chọn. Gói xuất chứa PNG + manifest + README, không back/excluded/error candidate. Export pack không đưa lên public hosting.

## 7. Nghiệm thu Claude phải báo

- Import ảnh riêng và sheet; crop/rotate/preview/edit/review thực sự hoạt động. Picker hủy không xóa draft. Có state busy/error/cancel/retry; không accept kết quả cũ sau đổi crop.
- Boundary: sai loại file, decode fail, vượt limit, crop âm/tràn/fraction, không có source/hash, duplicate source/candidate, back, empty batch, unreviewed đều có lỗi hữu ích.
- Preview mode giữ ID=null; mapped mode chặn unknown ID, sai template, trùng mapping; variant rõ ràng.
- Complete-front không overlay chữ/frame; artwork có composite hoặc pending đúng lý do. Fit không méo/mất nội dung.
- Fixture thực: 5 front sheets Kickstarter → 69 fronts (17/10/18/12/12); bỏ back. Nguồn hiện tại và crop tham chiếu: `assets/cards/kickstarter-preview/manifest.json`. PNG tham chiếu: `png-webgame/manifest.json`. Chỉ cần đọc các file/ảnh liên quan, không gameplay history.
- Decode độc lập toàn bộ PNG xuất: 45 Poker 745×1040, 24 Tarot 827×1417; hash đúng; ZIP đủ 69 PNG và path an toàn; source giữ nguyên. Kiểm trực quan Hero/Item/Modifier/Challenge/Monster/Leader và crop góc mép.
- Build web + contract tests PASS; browser review desktop/mobile, keyboard/modal, chọn folder/cancel/export/download thật. Báo checks thật và giới hạn; không ghi done chỉ vì mock chạy.

## 8. Prompt chuyển cho Claude

> Triển khai importer đang làm theo docs/contracts/ASSET_IMPORT_WORKBENCH.md và apps/web/src/asset-import/contract.ts. Dùng lại tool hiện có qua AssetImportAdapter, nối UI /?asset-import; không tạo importer trùng. Scope: adapters/**, crop/composite/export tooling, thay đổi UI/contract cần thiết có báo delta. Không sửa engine/protocol/card data. Input sheet Kickstarter 69 front hoặc folder owner chọn. Output PNG chuẩn Poker/Tarot, manifest, ZIP, preview thật; complete front không overlay lại chữ/frame; artwork phải composite đúng data. Preview ID=null được phép, mapped phải kiểm ID/template/variant; giữ rights UNVERIFIED. Chạy build, contract tests, QA import/crop/cancel/export và kích thước PNG; báo handoff ngắn, file/checks/blocker. Không commit/push/deploy.
