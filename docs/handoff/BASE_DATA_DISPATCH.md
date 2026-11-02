# DATA-BASE — source/readiness batch 2026-11-02

Owner yêu cầu tiếp tục sau SETUP-LOCAL accepted. PM chỉ điều phối/review/tổng hợp. Giữ CHAT_ASSIGNMENTS/model/effort;không tạo chat/worker. Usage đầu55%/5h,67%/tuần;checkpoint theo AGENTS.

## Mục tiêu
Gỡ gate có nguồn cho base retail đã định hướng:edition/card identity/copy mapping/6Leader abilities. Không lặp việc chỉ mở rulebook aggregate rồi gọi per-card verified. Đây là source/readiness batch,không implementation/art acquisition/deploy.

| Ticket/owner | Phạm vi ghi | Input | Output/acceptance | Phụ thuộc |
|---|---|---|---|---|
| DB-01/Content | docs/content/** | SETUP_DATA_READINESS,SOURCE_VERIFICATION,CONTENT_AUDIT,BASE_CARD_INDEX và source map phần liên quan | BASE_SOURCE_EVIDENCE.md:nguồn gốc publisher/card scans/download links,edition/date,page/item→ID/copy/Leader ability summary;match/mismatch/unknown,decision-ready readiness. Nếu primary PnP khác retail,ghi khác biệt,không tự coi equivalent. Có thể tạo manifest draft trong docs/content với provenance/status,mọi row chưa đủ giữ secondary. | Không |
| DB-02/Rules | docs/rules/** | SETUP_VERIFIED ambiguities và nguồn publisher/rulebook/FAQ liên quan | BASE_RULE_GATES.md:immediate Hero roll có consume once-per-turn attempt không;deck+discard thiếu tổngcard khiDraw/Redraw. Link/page/exact proposition,verified vs unknown và cases;không đặt ruling. Reshuffle discard đã là product decision,không mở lại. | Không;không chờ card catalog |
| PM | STATUS/RESUME/NEXT_BATCH/dispatch | Hai handoff | Review source evidence;đánh dấu subset đã đạt/thiếu,đề xuất scope implementation chỉ khi readiness đủ. Không silent relax gate hoặc tự chọn edition khác. | DB-01/02 |

## Giới hạn đọc và nghiệm thu
Bắt đầu bằng role handoff và các input ticket,candidate official Here to Slay/Unstable Games/Kickstarter publisher-linked source. Lần tìm hẹp có nguồn mới thật,không archive/history/toànrepo hoặc lặp query vô hạn. Source community có thể discovery nhưng không tự nâng authority;original publisher link/provenance phải ghi evidence. Khi bế tắc ghi URL/attempt/gap cụ thể và bước tối thiểu cần owner;không suy không có nguồn trên toànInternet.

Không artwork/effects code/expansion/MOD-SELECT/rootdeps/tracker của worker. Rights UNVERIFIED không thay vì có source. Không copy toàn văn card vào final;dùng summaries/factual fields cần thiết. Không commit/push/deploy. Handoff<=250 từ,file/checks/blocker/bước kế. Không chạy tests cũ cho docs-only research. Nếu cần đổi luật/edition/scope hoặc đọc rộng,PM trình owner trước theo AGENTS.
