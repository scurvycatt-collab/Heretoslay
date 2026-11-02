# Worker migration — 2026-10-29

Owner yêu cầu kiểm context, migrate nếu lớn và archive chat cũ. Chỉ lấy metadata token_count/compacted từ rollout đúng 7 worker; không nhập lại nội dung lịch sử. Snapshot máy đọc: WORKER_CONTEXT_AUDIT_2026-10-29.json.

| Role | Last input tokens | Cached input | Compactions | Action |
|---|---:|---:|---:|---|
| Architecture | 34,444 | 34,176 | 1 | Giữ chat, context đã compact |
| UI/UX | 233,300 | 232,576 | 0 | Fresh chat + file handoff |
| QA | 154,670 | 154,368 | 1 | Fresh chat + file handoff |
| Infrastructure | 111,788 | 110,976 | 0 | Fresh chat + file handoff |
| Content | 157,735 | 157,056 | 0 | Fresh chat + file handoff |
| Rules | 123,215 | 122,624 | 0 | Fresh chat + file handoff |
| Assets | 28,525 | 21,504 | 0 | Giữ chat, chưa có workload lớn |

Đây là input request cuối, không phải unique tokens hoặc token riêng ticket; cumulative usage đếm lại context qua nhiều request. Cached input không thể quy thẳng sang account usedPercent, chi phí hoặc mức tiết kiệm bảo đảm. Chọn migration theo độ lớn tương đối và nhu cầu tiếp tục, không khẳng định ngưỡng hệ thống. Archive có thể khôi phục, không xóa source/checkpoint. Không fork vì cần context mới; giữ model/effort theo CHAT_ASSIGNMENTS. Không đánh thức worker cũ để viết lại lịch sử. Chat mới chỉ onboarding/idle, không mở thêm implementation trong lượt migration. Hẹn18:45 đọc CHAT_ASSIGNMENTS mới.

## Shared handoff

PM hiện tại 01a185a2-a20f-7fa0-8aaa-0b9f63e172e5. Đọc AGENTS+STATUS khi có ticket; chỉ đọc role handoff và source liên quan. SETUP-LOCAL chưa accepted cuối. Không commit/push/deploy, không mở MOD-SELECT/effects/expansion/art. Rights UNVERIFIED. Giữ ownership, không sửa tracker hoặc source owner khác. Không gọi test cũ là evidence cho code mới. Mỗi handoff<=250 từ. Owner đã giao PM xét permission hợp lý trong scope; không bypass auto-review. Chat mới chờ ticket, không tự tiếp tục batch.

## Migration đã xác nhận

| Role | Archived old ID | Active new ID | New input tokens | Model/effort verified |
|---|---|---|---:|---|
| UI/UX | 01a182c5-b08a-7481-b68f-cee5c0ed2702 | 01a186bd-fea3-7870-8bb8-35c48dceb2c3 | 31,020 | gpt-5.6-terra/medium |
| QA | 01a182c5-ba47-73e2-b0c2-37b6c5e06597 | 01a186be-0c58-7882-86a8-e66d830fd104 | 31,005 | gpt-5.6-sol/medium |
| Infrastructure | 01a182c5-60ee-71a2-9dc6-8ba3ed3e3fc5 | 01a186be-1832-7493-bb3e-3fe7970234e4 | 29,508 | gpt-5.6-luna/low |
| Content | 01a182c5-5c51-7180-bba1-555ded22b6e3 | 01a186be-22ff-7173-b226-89ee0552657a | 29,475 | gpt-5.6-luna/medium |
| Rules | 01a182c5-54dd-7502-95cb-cc0ea78497b1 | 01a186be-360e-7583-b8f8-0c7c7c06f306 | 31,024 | gpt-5.6-sol/medium |

Mỗi chat mới đã xác nhận vai trò/handoff và idle, không tools/test/source trong onboarding. Metadata sau migration: WORKER_CONTEXT_AFTER_2026-10-29.json. Input onboarding thấp hơn request cuối chat cũ; chưa đo workload tương đương nên không suy tỷ lệ tiết kiệm quota. Handoff role là checkpoint do PM tổng hợp từ files/checks hiện có; chat mới đọc khi có ticket, không claim đã review sources.

Archive tool xác nhận cả5 old worker archived=true. PM cũ01a182b4-4b5e-7152-a178-f91f4967c0dc cũng archived=true vì đã bàn giao sang PM hiện hành. Architecture/Assets giữ active IDs. Không archive các cuộc trò chuyện ngoài scope migration. Chưa sửa code/chạy checks mới; lịch18:45 giữ nguyên và đọc CHAT_ASSIGNMENTS mới.
