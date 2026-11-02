# Review đợt 2 — chờ chủ dự án duyệt

Owner tổng hợp: PM, ngày 2026-10-28. Input: phản hồi trực tiếp của chủ dự án trong các chat Rules/Content/UI và output Architecture/UI/QA. Đây là review tài liệu, chưa xác nhận runtime hoạt động.

## Đầu ra

| Owner | File | Kết quả review / kiểm tra |
|---|---|---|
| Architecture | docs/decisions/ADR-001-cloudflare.md; docs/architecture/PROTOCOL_DRAFT.md | ADR Workers/DO, React/TS/Vite đề xuất, hidden hand, reconnect, deadline/alarm/idempotency; nguồn Cloudflare. PM đã đọc; worker báo static checks và JSON mẫu hợp lệ. QA đã phát hiện ba gap kỹ thuật và PM giao sửa trong draft. |
| UI/UX | docs/ui/UI_DIRECTION.md; docs/ui/WIREFRAME.svg | Một hướng desktop/mobile + lobby/reaction/reconnect; placeholder. Nguồn homepage + ảnh, không thử tương tác game tham chiếu. Worker báo mở SVG rà visual và XML parse thành công; PM đã đọc docs/source SVG, chưa tự xác nhận visual render. Mở file trong Codex trả queued, không xác nhận user đã xem. |
| QA | docs/qa/ACCEPTANCE_DRAFT.md | PM đã đọc 16 ca NOT_RUN và 5 findings. Matrix bao phủ concurrency/reaction/hidden state/reconnect/8-player boundary; không phải test pass. |

## Thay đổi đã được chủ dự án chốt

- D-07: 20 giây, Skip đóng sớm khi mọi eligible Skip, không reset khi có reaction mới; vẫn cấu hình trước ván.
- Không Challenge roll Hero effect; chỉ Challenge khi chơi Hero/Item/Magic.
- 2–8 người và đích hạ tầng Cloudflare. Không tự triển khai expansion trước base; expansion inventory nghiên cứu riêng đã được owner yêu cầu.

## Các lựa chọn đề xuất cần review

1. UI direction: tabletop sạch, không mặc định pixel; desktop trải bàn, mobile đổi cấu trúc thành các vùng có thể đọc. Wireframe mới minh họa layout, chưa giải quyết chi tiết đủ 8 ghế và không phải app chơi được.
2. Reaction eligibility: Challenge dành mọi đối thủ, Modifier dành tất cả người chơi, không phụ thuộc server phát hiện có card phù hợp để tránh lộ hand. Disconnect vẫn đợi deadline.
3. Skip khóa phản ứng trong chính window; người đã dùng Modifier vẫn có thể dùng thêm cho đến khi Skip, không reset timer. Đây là chi tiết mới đề xuất, chưa tự ghi thành approved.
4. Challenge dice: đề xuất server tự roll sau Challenge hợp lệ để không chờ người mất kết nối; chưa thay UNKNOWN trong protocol trước khi owner duyệt. Alternative manual roll cần timeout/fallback.
5. 8 người nhưng base inventory có 6 Party Leader: cần xác minh/chọn nguồn Leader bổ sung, cho phép trùng hay quy tắc khác. Chưa quyết thay owner; điều này chưa có acceptance cho phép start 8 người bằng base content hiện tại. Expansion nghiên cứu không đồng nghĩa đã đủ data/effect để dùng.

## Gate và bước kế

- F-01 concurrent reaction/global revision, F-02 windowId và F-03 reuse idempotency key: Architecture đã sửa protocol, QA đọc lại và ghi ADDRESSED_IN_DRAFT. PM đã đọc protocol mới và kiểm tra QA file; không đánh runtime resolved. Toàn bộ 16 ca vẫn NOT_RUN.
- F-04 eligibility/Skip và F-05 Challenge roll cần owner quyết định. Kiểm tra sức chứa 8 người/Leader là gap sản phẩm bổ sung, không được ẩn sau số slot trên UI.
- Wave 1B gate chưa đạt: rule spec và inventory/text còn thiếu, ADR/UI chưa được duyệt toàn bộ, QA mới là acceptance draft; Git chưa sửa, chưa có runtime/test harness.
- Đề xuất sau review: chốt các quyết định trên, giao Rules/Content hoàn thiện phần setup và spec cần cho một vertical slice, QA sync protocol, rồi review Foundation scope. Không tự mở đợt triển khai/code/deploy trong đợt này.

## Handoff cuối đợt

Architecture, UI và QA đều đã kết thúc lượt; chưa giao đợt 3. PM chạy XML parse trên WIREFRAME.svg thành công; đây là kiểm tra cấu trúc, không thay visual approval của owner. Chi tiết reaction/capacity còn chờ review. Git không được sửa; không có runtime test để báo pass.

## Owner review UI bổ sung

Owner gửi bốn ảnh và ưu tiên design đó hơn hướng tabletop trung tính. UI direction ở mục 1 chưa được duyệt; PM đã giao UI revision riêng, giữ bản cũ và tạo docs/ui/REFERENCE_REVISION.svg với bốn trạng thái tương ứng. Bố cục/chrome/visual hierarchy tham khảo ảnh; timer D-07 vẫn 20s. Việc chọn design không chốt các câu hỏi gameplay/8-player setup ở trên. Chưa mở Foundation.

Revision đã có: REFERENCE_REVISION.svg + UI_DIRECTION.md. PM đã đọc và parse XML thành công; chưa có visual render/PNG preview. Chờ owner xem và duyệt bản sửa; không coi sự ưu tiên nguồn tham khảo là tự động duyệt mockup mới.

## Quyết định owner sau revision

Owner đã duyệt REFERENCE_REVISION.svg và chốt base-only 2–6 người; chọn thêm expansion mở tối đa 8. Do đó mục UI direction và gap bắt base hỗ trợ 8 ở trên đã được giải quyết ở mức sản phẩm; không dùng trùng Leader cho base. Architecture/QA/Content đã đồng bộ requirement trong file sở hữu. Setup/content readiness từng expansion vẫn cần xác minh trước implementation. Các câu hỏi eligibility/Skip-finality và Challenge roll vẫn chưa được trả lời; không tự coi UI approval là duyệt các mục đó hoặc toàn bộ ADR.
