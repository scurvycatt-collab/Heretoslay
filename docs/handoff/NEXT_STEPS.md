# Kế hoạch tiếp tục — chờ owner duyệt

Ngày: 2026-10-28 (Asia/Saigon). Owner thực hiện: Codex trong chat hiện tại; owner review: chủ dự án. Thực hiện tuần tự; chưa phân công subagent. Đây là đề xuất mới, không phải kế hoạch v0.4 gốc.

## Hiện trạng đã kiểm tra

- Đã đọc README, AGENTS, SOURCE_REGISTER, product decisions, STATUS, master plan, Wave 1 dispatch, CODEX_SETUP và ASSET_001.
- Checkout có tài liệu khôi phục; chưa có source game, source/tests asset hoặc ZIP gốc trong danh sách file hiện tại.
- Có thư mục `.git`, nhưng `git -C E:/Code/here-to-slay-web status --short`, `log -1 --oneline` và `remote -v` đều báo `not a git repository`. Chưa xác nhận branch, commit hoặc remote; không sửa `.git` trong lượt rà soát.
- Chưa chạy test: checkout chưa có mã nguồn hoặc bộ test. Wave 1B gate chưa đạt.

## Các bước đề xuất

Mỗi hàng do Codex sở hữu. Codex tổng hợp tracker sau mỗi bước; báo cáo gồm input, file đầu ra, kiểm tra thực chạy, vấn đề còn mở và bước tiếp theo.

| Bước / ticket | Input và phụ thuộc | Phạm vi file | Đầu ra và tiêu chí nghiệm thu |
|---|---|---|---|
| 1. PM-001: chuẩn hóa baseline | Checkout và tài liệu khôi phục; bắt đầu sau owner duyệt kế hoạch | README.md, docs/handoff/, docs/STATUS.md; metadata Git sau chẩn đoán | Xác minh root/Git, sửa đường dẫn bàn giao cũ, ghi missing inputs; nếu có ZIP thì lưu bản gốc, hash và đối chiếu, không ghi đè. Thiếu ZIP không chặn nghiên cứu spec. Git phải được kiểm tra lại trước khi báo hoạt động. |
| 2. RULE-001 + CONTENT-001: luật và danh mục base | Baseline; rulebook/card text từ nguồn được xác minh | docs/rules/, docs/content/ | Rule spec có nguồn; inventory với card ID ổn định, số lượng đối chiếu, effect và edge cases có nguồn; ghi rõ chỗ chưa biết. Rights giữ UNVERIFIED khi chưa có bằng chứng khác. |
| 3. ARCH-001 + TIME-001: thiết kế kỹ thuật | Spec luật và yêu cầu sản phẩm đã biết | docs/architecture/, docs/decisions/ (ADR kỹ thuật) | Xác minh Workers + Durable Objects bằng tài liệu chính thức; ADR đề xuất frontend/protocol, state server, hidden information, reconnect, deadline, retry, action trùng, late reaction và resolve một lần. Chỗ cần quyết định phải được ghi rõ và review. |
| 4. UI-001: hướng giao diện | Rules/content và luồng protocol dự kiến | docs/ui/ | Wireframe desktop/mobile: nickname, tạo/vào phòng, lobby, bàn chơi, reaction 20 giây có cấu hình trước ván, Skip/đóng sớm không reset và reconnect. Owner duyệt direction trước Foundation. |
| 5. QA-001 + INFRA-000: tiêu chí kiểm thử và gate | Rules, ADR và UI đề xuất | docs/qa/, docs/infra/, docs/STATUS.md | Ma trận acceptance cho gameplay, thông tin ẩn, timer, reconnect; đề xuất repo/CI và staging, release plan có gỡ nội dung/purge cache. Review gate có bằng chứng và người review, chưa deploy. |
| 6. Wave 1B: Foundation | Chỉ bắt đầu khi rule spec, ADR, QA và UI đạt gate | apps/web/, apps/worker/, packages/engine/, packages/protocol/, packages/content/, tests/, tools/; cấu hình root theo ADR | Khung chạy local với mock UI, engine/protocol và Worker/DO theo ADR; build/typecheck và test phù hợp chạy thật. Handoff ghi rõ phần mới có khung và phần gameplay đã thực thi. |
| 7. Wave 2: một luồng chơi multiplayer hoàn chỉnh | Foundation đã kiểm tra | Các package/app/test liên quan | Tạo/vào phòng, bắt đầu, lượt và action, Challenge/Modifier, auto-pass và reconnect theo spec. Kiểm thử nhiều client, không lộ bài và không resolve trùng. |
| 8. Hoàn thiện base và beta riêng | Luồng multiplayer đạt nghiệm thu; inventory/effect đã xác minh | Engine/content/UI/tests, docs release và asset manifest riêng | Triển khai đủ base effects, kiểm tra coverage theo card ID, kiểm thử end-to-end và checklist beta. Chuẩn bị release để owner duyệt trước deploy/công bố artwork. |

## Nhánh asset: ASSET-001

Sau bước 2, phục hồi và review công cụ gốc nếu có. Nếu vẫn thiếu source, đề xuất xây công cụ thay thế mới có nhãn rõ ràng trước khi thực hiện. Input: inventory, nguồn công khai và D-12. Phạm vi: agents/ASSET_001.md, tools/, tests asset và assets/source-candidate-01/. Đầu ra: test thực chạy, manifest URL/hash/card ID và báo cáo coverage/thiếu/lỗi. Không báo đủ asset chỉ vì downloader chạy; quyền giữ UNVERIFIED. Asset thiếu không chặn engine và UI placeholder.

## Phạm vi xin duyệt lần này

Đề xuất duyệt bước 1–5 để hoàn thành bộ đặc tả Wave 1A. Khi có đầu ra cụ thể, trình owner review ADR, UI và gate trước bước 6. Chưa tự chọn frontend, cài dependency, xây Foundation, push hoặc deploy trong lượt lập kế hoạch.
