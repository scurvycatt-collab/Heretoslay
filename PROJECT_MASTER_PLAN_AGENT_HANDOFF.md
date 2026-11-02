# Master Plan — bản khôi phục từ tóm tắt v0.4

Không phải nguyên bản v0.4. Chi tiết không có trong chat được để mở. Nguồn: docs/handoff/SOURCE_REGISTER.md.

## Mục tiêu và scope xác nhận

Here to Slay Web chơi multiplayer thực tế trên Cloudflare, phục vụ nhóm bạn, fan-made, không thương mại hóa/không quảng bá công khai theo chat cũ. Bám gameplay gốc; base trước, expansion sau; nickname + mã phòng, không tài khoản; reaction auto-pass mặc định 20 giây và cấu hình trước ván (owner cập nhật 2026-10-28 thay 30 giây). Modifier/Challenge có Skip, đóng khi mọi người đủ điều kiện Skip hoặc hết giờ; timer không reset.

Hướng kiến trúc được bàn giao: Cloudflare Workers + Durable Objects. Frontend framework, database, giới hạn người chơi, cơ chế truy cập nhóm và chi tiết protocol chưa khôi phục được quyết định gốc.

## Roadmap khôi phục

| Giai đoạn | Đầu ra | Trạng thái |
|---|---|---|
| Wave 1A | Rules, card inventory, ADR, UI, QA và tooling proposal | Chưa xác minh đã thực thi |
| Wave 1B | Monorepo, engine core, Worker, Durable Objects, mock UI | Chưa bắt đầu trong bộ này |
| Wave 2 | Multiplayer vertical slice, turn/action, Challenge/Modifier, auto-pass | Chưa bắt đầu |
| Wave 3–4 | Full base effects, kiểm thử, beta nhóm bạn, deploy | Chưa bắt đầu |

## Gate mở Wave 1B

- Rule spec đối chiếu nguồn và danh sách edge case rõ ràng.
- Architecture ADR được review; timer/reconnect/late reaction/double-resolution có mô tả.
- QA có tiêu chí kiểm thử; quyền nội dung được phân loại, không yêu cầu chờ giấy phép để làm engine.
- UI direction được owner duyệt.
- Không coi tài liệu viết xong là tự động đạt gate; ghi người review và bằng chứng vào tracker.

## Đề xuất kỹ thuật cần review

Server quyết định trạng thái game, ẩn bài riêng theo người nhận; xử lý action trùng/lệch lượt; timeout có deadline và chỉ resolve một lần; reconnect phục hồi state hợp lệ. Đây là tiêu chí đề xuất để ARCH/QA làm rõ, chưa phải protocol đã duyệt.

## Asset và phát hành

ASSET-001 được chat cũ báo đã xây công cụ và pass 2/2 tests; live acquisition bị DNS block, chưa có artwork gốc tải thành công tại thời điểm báo cáo. Không có source/tests để chạy lại trong bộ hiện tại.

Source candidate: https://heretoslay.online/ (chưa kiểm tra lại ở lượt bàn giao này). Tách asset bằng manifest card ID, có nguồn và hash, hỗ trợ thay/gỡ asset. Trước phát hành phải có kiểm soát truy cập thực, kế hoạch tắt game, thay artwork, purge cache Cloudflare và owner review việc dùng nội dung bên thứ ba.
