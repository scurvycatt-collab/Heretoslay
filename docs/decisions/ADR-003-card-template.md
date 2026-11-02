# ADR-003 — Card template: dùng Card Maker làm tham chiếu layout, không dùng làm tool

Ngày 2026-11-02 · Lead · Trạng thái: PROPOSED (chờ owner)

## Bối cảnh
Owner đề xuất https://github.com/Danrejk/Here-To-Slay-Card-Maker để Codex chỉ cần import creative là ra thẻ đúng form.

## Phát hiện
- App C# WinForms + Raylib, chỉ chạy Windows; không nhúng được vào web/Worker.
- License GPL-3.0 cho code. Frame PNG (frame_hero/item/leader/monster, cursed_item) phái sinh từ thiết kế Unstable Games → quyền bên thứ ba, cùng trạng thái UNVERIFIED như artwork; GPL của tác giả không cấp quyền đó.
- Giá trị thật: layout toạ độ pixel tường minh theo loại thẻ trong GeneratorBackend/Program.cs (vd. Leader art 41,41,745×1176; Monster art 41,41,745×824; Hero art 100,232,545×545; class icon, roll pill đỏ/xanh, item slots), kích thước tarot/poker, font Patua One + Source Sans (OFL, có trên Google Fonts), danh sách class.

## Quyết định đề xuất
1. Không chạy/nhúng tool. Viết CardRenderer web riêng (HTML/CSS hoặc canvas) nhận `card data` (cùng schema engine dùng, GAME-004) + `art asset` → ra thẻ đúng form.
2. Trích toạ độ/kích thước/font từ Program.cs thành `docs/contracts/CARD_TEMPLATE_SPEC.json` (sự kiện layout, không copy code GPL).
3. Frame/khung: asset thay thế được, map theo card type trong manifest, rights UNVERIFIED; có thể vẽ lại khung riêng.
4. Một nguồn data duy nhất: Codex điền card data (class, threshold, requirement, effect text) theo schema GAME-004 → engine và renderer cùng đọc.

## Hệ quả
GAME-004 mở rộng: schema + validator + CARD_TEMPLATE_SPEC. Renderer = Codex (visual).
