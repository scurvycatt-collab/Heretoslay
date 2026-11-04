# UI localization — EN / VI

Source chính: `apps/web/src/i18n.tsx`; catalog Việt build-time: `apps/web/src/i18n.vi.json`; script cập nhật catalog: `scripts/generate-vi-catalog.mjs`.

- Tiếng Anh là mặc định. Lựa chọn `EN`/`VI` lưu tại `hts.language` và áp dụng cho lobby, preview, bàn chơi, panel/menu, gallery và renderer thẻ.
- Tên riêng của lá bài giữ nguyên để đối chiếu bản gốc. Loại thẻ, rule/effect, hành động và trạng thái được dịch.
- Thuật ngữ game dùng duy nhất `COMMON_VI_TERMS`; chuỗi động và nội dung thẻ đều đi qua `translateVi`. Không tạo glossary riêng trong từng component.
- Ở chế độ VI, renderer dựng lại mặt thẻ bằng text Việt thay vì dùng ảnh mặt thẻ có chữ Anh đóng cứng.
- Lobby dùng một state loại trừ `create | join | view`, mỗi thời điểm chỉ render một nội dung.

Test bắt buộc: `node --test --experimental-strip-types tests/i18n-ui.test.ts`, web typecheck và web build. Deploy chỉ cần build web assets rồi deploy Worker assets; không migration hoặc backfill.
