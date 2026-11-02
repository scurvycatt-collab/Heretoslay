# Audit token — 2026-10-29

## Kết luận

Cách điều phối trước audit có lãng phí rõ: đọc nguyên tài liệu đã biết, nhiều prompt lặp context, gọi follow-up cho thay đổi rất nhỏ, polling/đọc thread chi tiết và báo cáo lịch sử ngày càng dài. Chưa có telemetry token theo task/model để tính chính xác lượng hao phí hay chi phí.

Baseline đo trực tiếp: STATUS cũ 2.861 từ; CHAT_ASSIGNMENTS cũ 2.123 từ, tổng4.984 từ. Đã sao lưu và xác minh hash trước khi rút gọn; không xóa bằng chứng cũ.

Sau rút gọn: STATUS 369 từ, CHAT_ASSIGNMENTS 217 từ, tổng586 từ — giảm88,2% lượng chữ của hai file này. RESUME 196 từ. Đây không phải tỷ lệ tiết kiệm token/billing toàn task.

## Chính sách mới

- Hot set: AGENTS + STATUS; khi resume thêm RESUME. Contract/source chỉ đọc theo ticket. DONE/archive là cold set.
- STATUS thay trạng thái hiện tại thay vì append nhật ký. Hoàn tất một mốc thì chuyển bằng chứng ngắn sang DONE; WIP ở handoff owner và một điểm tiếp tục chung.
- Prompt delta ngắn, một batch rõ nghiệm thu; giảm đánh thức worker idle, gom wait và chỉ đọc output chi tiết khi lỗi cần điều tra.
- Không chạy checks lặp vì sửa docs. Giữ model/effort, không tự nâng cấp hoặc tạo chat để né hạn mức.
- PM kiểm account usage đầu/cuối batch, mỗi5phút khi batch dài. >=70 lưu checkpoint dự phòng; >=80 lưu RESUME<=250từ, cập nhật STATUS, ngừng dispatch mới và lấy checkpoint worker rồi kết thúc lượt. Handoff không chứa secret/token.

## Số đo và giới hạn

Usage snapshot trong audit: primary35%/300phút, secondary37%/10080phút. Đây là hạn mức chung tài khoản, không chứng minh task này riêng lẻ dùng20% hay chiếm toàn bộ mức tăng.

Snapshot cuối audit: primary49%, secondary39%. Không có telemetry để phân bổ mức tăng giữa PM, worker hoặc chat khác. Audit này chỉ sửa docs/workflow, không mở việc code mới; QA đang chạy đã checkpoint và dừng. Việc đo/kể lại lịch sử audit thêm cũng tốn token, nên không tiếp tục truy hồi toàn bộ log để tính số không có sẵn.

Tách file giảm lượng đọc lại; không xóa lịch sử đã có trong context chat. Không có số token/cost chính xác hoặc cam kết tỷ lệ tiết kiệm billing. Không tạo heartbeat lúc idle vì chính nó cũng dùng usage. Trigger80 được kiểm tại checkpoint trong lượt chạy, không phải monitor24/7; spike giữa hai lần đo vẫn có thể xảy ra. RESUME được giữ sẵn để phục hồi ngay cả khi lần dispatch tiếp bị chặn.

Owner xác nhận ngày 2026-10-29 rằng toàn bộ usage hiện tại dành cho project. Việc này giúp lập ngân sách project, nhưng các snapshot vẫn không phân bổ được chính xác theo chat/agent. Với context dài, PM cập nhật RESUME rồi dùng nó làm điểm đọc lại khi có compaction hoặc chat PM mới; không thể xóa lịch sử của chat đang mở bằng cách sửa file. Không tự tạo chat mới chỉ để giả lập reset.
