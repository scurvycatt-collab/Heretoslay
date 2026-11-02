# Phân công hiện hành
Chỉ PM tích hợp STATUS/RESUME/decisions. Worker không ghi source owner khác; không mở scope hoặc đổi model/effort. Lịch sử cũ ở archive, không đọc mặc định.

| Owner | Thread ID | Model / effort | Phạm vi ghi |
|---|---|---|---|
| PM | 01a185a2-a20f-7fa0-8aaa-0b9f63e172e5 | 6.1 Sol / medium theo owner | STATUS, handoff chung, AGENTS, README, product decisions |
| Architecture | 01a182c5-9fbe-7f42-81ea-f2f6f818069b | 5.6 Sol / medium | packages/protocol, apps/worker, docs/architecture, ADR |
| UI/UX | 01a186bd-fea3-7870-8bb8-35c48dceb2c3 | 5.6 Terra / medium | apps/web, docs/ui |
| QA | 01a186be-0c58-7882-86a8-e66d830fd104 | 5.6 Sol / medium | tests, docs/qa |
| Infrastructure | 01a186be-1832-7493-bb3e-3fe7970234e4 | 5.6 Luna / low | Root manifests/lock/CI, docs/infra, local runtime |
| Rules | 01a186be-360e-7583-b8f8-0c7c7c06f306 | 5.6 Sol / medium | docs/rules |
| Content | 01a186be-22ff-7173-b226-89ee0552657a | 5.6 Luna / medium | docs/content |
| Assets | 01a182c5-bf35-7c91-9b4e-7cc4a12dc183 | 5.6 Luna / low | agents/ASSET_001.md, docs/assets; mở source/tools khi được giao |

Hiện các chat đã checkpoint/idle; task đang dở và bước kế ở STATUS. Chỉ gửi ticket+delta+file+nghiệm thu, không gửi lại toàn bộ bối cảnh. Quy tắc ngân sách/handoff ở AGENTS.

PM cũ 01a182b4-4b5e-7152-a178-f91f4967c0dc đã archive, chỉ restore khi cần chứng cứ; owner duyệt chuyển PM ngày 2026-10-29. Không điều phối đồng thời từ hai chat PM.

Scope batch hiện hành: SETUP_SLICE_DISPATCH.md; reaction baseline ở REACTION_SLICE_DISPATCH.md. Không mặc định đọc dispatch cũ hoặc cả lịch sử thread. Root install/lock chỉ Infrastructure, không commit/push/deploy.

## Fresh-context migration theo owner — 2026-10-29

UI/QA/Infra/Content/Rules đã tạo chat mới, xác nhận idle, giữ model/effort đúng metadata. Role handoffs: UI_RESUME.md,QA_RESUME.md,INFRA_RESUME.md,CONTENT_RESUME.md,RULES_RESUME.md. Chỉ đọc role file khi nhận ticket; không nhập lại lịch sử. Architecture đã compact còn34k input,Assets29k nên giữ chat.

Mapping old→new và metadata audit tại WORKER_MIGRATION_2026-10-29.md; old chat chỉ tham chiếu/restore khi thật sự cần, không dispatch vào old IDs. Hẹn18:45 phải dùng bảng hiện hành ở trên.
## Vận hành hiện hành — owner2026-11-02
7worker đã OPS-CHECKPOINT vào docs/handoff/agents/<role>.md, <=150 từ; chat/model/effort giữ nguyên. Dùng OPERATING_MODEL.md và STATUS taskboard thay dispatch lịch sử làm điểm vào. Worker ghi card riêng, PM chốt acceptance/priority. Native compaction chưa xác nhận; không gọi checkpointfile là nén context thật. Tất cả idle khi không có ticket; background chỉ chạy task đã giao, không daemon.

