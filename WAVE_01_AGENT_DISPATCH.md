# Wave 1 — bản dispatch khôi phục

Tên ticket và vai trò được lấy từ chat; phạm vi/đầu ra chi tiết dưới đây là đề xuất mới để có thể tiếp tục. Chưa dispatch agent trong phiên bàn giao này.

| Ticket / vai trò | Phạm vi file đề xuất | Đầu ra và nghiệm thu |
|---|---|---|
| PM-001 / PM | docs/STATUS.md, docs/decisions/product-decisions.md | Đối chiếu nguồn; log quyết định và phụ thuộc, review gate |
| RULE-001 / Rules | docs/rules/ | Canonical rules có dẫn nguồn, edge cases và chỗ chưa chắc; không tự bịa luật |
| CONTENT-001 / Content | docs/content/ | Base card inventory, ID ổn định, rights matrix; đối chiếu tổng số từ nguồn |
| ARCH-001 / Tech lead | docs/architecture/ | ADR Cloudflare, protocol, state ownership, reconnect/timer, hidden information; review rủi ro |
| UI-001 / UI/UX | docs/ui/ | Wireframe desktop/mobile và reaction states; owner duyệt direction |
| QA-001 / QA | docs/qa/ | Ma trận rule tests, timer, reconnect và security gắn acceptance criteria |
| INFRA-000 / DevOps | docs/infra/ | Đề xuất repo, CI/CD và staging; không tự deploy; lệnh verify phù hợp stack đã chọn |
| TIME-001 / phối hợp ARCH + QA | Trong đầu ra ARCH và QA | Deadline, alarm retry, late reaction, reconnect và double-resolution; PM chọn một owner khi dispatch |
| ASSET-001 / Asset | agents/ASSET_001.md, tools/, assets/source-candidate-01/ | Nhập công cụ gốc, chạy lại test, acquisition report + manifest + coverage; không done chỉ vì downloader chạy |

## Prompt dùng cho từng ticket

“Đọc AGENTS.md và SOURCE_REGISTER. Thực hiện [ticket] theo hàng tương ứng; phân biệt quyết định đã duyệt với đề xuất. Chỉ sửa phạm vi được giao. Báo cáo nguồn đầu vào, file đầu ra, kiểm tra và kết quả, điều chưa rõ, phụ thuộc, bước tiếp theo. Không tuyên bố done nếu chưa đạt nghiệm thu.”

Các task specification có thể làm độc lập khi được phân công. Wave 1B phụ thuộc gate trong master plan. Chưa chọn stack/frontend và chưa dựng game chỉ từ các tóm tắt này.
