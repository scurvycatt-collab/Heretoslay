# Vận hành agent nền — 2026-11-02

Owner yêu cầu giữ model/effort, compact working state và dùng status theo task để giảm đọc context. Giữ nguyên chat IDs ở CHAT_ASSIGNMENTS; không tạo/fork/migrate chat hoặc đổi model/effort.

## Nguồn trạng thái
- docs/STATUS.md: board tổng hợp ngắn, PM sở hữu; mỗi task một hàng ID/owner/state/evidence/next.
- docs/handoff/agents/<role>.md: worker sở hữu đúng một card, <=150 từ, overwrite trạng thái hiện hành; đây cũng là handoff phục hồi. Chỉ ghi task/state, files/input, checks thật, blocker, next/dependency, scope/settings. Không append nhật ký.
- Chi tiết nghiệm thu giữ report theo ticket; DONE chỉ PM cập nhật mốc accepted. NEXT_BATCH/BACKLOG giữ ticket chưa mở đủ để resume độc lập.

## Chu kỳ
Worker cập nhật card khi nhận task, kết thúc phase/đổi dependency, blocked, ready_for_review hoặc done. Dùng state queued/running/blocked/ready_for_review/done/idle; tách worker idle khỏi kết quả task done. Không timer/status polling hoặc cập nhật định kỳ khi không thay đổi.
PM dispatch ticket+delta+file+acceptance <=150 từ, không lặp toàn context. Worker đọc AGENTS+STATUS ngắn+card của mình+input của ticket; không history/archive mặc định. PM dùng wait_threads gom cursor, không read_thread trừ thiếu evidence/lỗi; chỉ đọc card đổi và source cần review. Final worker <=60 từ, evidence link+check/blocker+next. Không gửi status lặp vào PM khi unchanged; PM chỉ thông báo owner khi meaningful/completed/failure/action needed.

## Compact thật
File handoff không phải context compaction của app. Chỉ ghi compacted khi có xác nhận compaction native. Tool connector hiện chưa expose compact; composer /compact chưa có xác nhận chạy. Không sửa JSONL/context DB, không gọi API riêng hoặc tạo chat thay thế. Native auto/manual compaction nếu dùng phải giữ task/settings và đọc lại đúng card, không reload history.

## Guard
Giữ nguyên usage/checkpoint AGENTS; chạy nền không có nghĩa bypass quota hoặc daemon sau khi lượt kết thúc. Chỉ task đã dispatch/ủy quyền được chạy; không đánh thức idle để poll/báo lại việc xong. Đợt chuyển vận hành này owner yêu cầu explicit nên được lấy một checkpoint ngắn từ mỗi worker; không mở gameplay batch mới chỉ để đổi workflow. PM không tự biến ready_for_review thành done thiếu bằng chứng.
