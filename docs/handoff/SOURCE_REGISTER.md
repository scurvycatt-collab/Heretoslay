# Nguồn và khoảng trống bàn giao

Ngày kiểm tra: 2026-10-28 (Asia/Saigon).
Chat: “Lập kế hoạch dự án game”, ID `6ae1c53e-35c8-83ec-b117-66d62b8951c7`.

Đã dùng read_thread với turnLimit=10; trả 5 turns, hasMore=false, nextCursor=null, attachments=[]. Nguồn chỉ chứa trao đổi và liên kết sandbox, không có nội dung đầy đủ các file Markdown hoặc mã nguồn. Tìm trong Documents/Codex chưa thấy các tên file gốc. Không kết luận các file đó chưa từng tồn tại.

| Tài liệu/artifact được nhắc trong chat | Tình trạng hiện tại | Nơi nối tiếp |
|---|---|---|
| Project Master Plan v0.4 | Không lấy được file gốc; chỉ có summary package v0.4 | PROJECT_MASTER_PLAN_AGENT_HANDOFF.md là bản khôi phục |
| AGENTS.md | Có link sandbox bản v0.2, thiếu bytes | AGENTS.md mới, có nhãn khôi phục |
| Wave 1 Agent Dispatch | Khôi phục tên task/roadmap/gate từ message | WAVE_01_AGENT_DISPATCH.md; chi tiết mới có nhãn đề xuất |
| Product Decision Register | Khôi phục D-01/02/06/07/11/12 | docs/decisions/product-decisions.md |
| Asset Agent v0.4 ZIP | Link tồn tại trong chat, chưa tải/nhập được | agents/ASSET_001.md |
| Mã nguồn/tests/report asset | Chỉ có mô tả và đường dẫn | Chưa có trong checkout |
| Phiên bàn giao trước | Assistant từng tuyên bố đã tạo, không có ID xác nhận | Không coi là project/repo đã tồn tại |

## Các liên kết gốc cần tải lại từ giao diện chat cũ

- `sandbox:/mnt/data/HERE_TO_SLAY_ASSET_AGENT_WAVE_01_v0.4.zip`
- `sandbox:/mnt/data/HERE_TO_SLAY_PROJECT_WAVE_01_HANDOFF_v0.3.zip`
- `sandbox:/mnt/data/HERE_TO_SLAY_PROJECT_WAVE_01_HANDOFF_v0.2.zip`
- `sandbox:/mnt/data/here-to-slay-project/PROJECT_MASTER_PLAN_AGENT_HANDOFF.md`
- `sandbox:/mnt/data/here-to-slay-project/WAVE_01_AGENT_DISPATCH.md`
- `sandbox:/mnt/data/here-to-slay-project/AGENTS.md`
- `sandbox:/mnt/data/here-to-slay-project/docs/decisions/product-decisions.md`
- `sandbox:/mnt/data/here-to-slay-project/tools/asset_acquisition_agent.py`
- `sandbox:/mnt/data/here-to-slay-project/agents/ASSET_001.md`
- `sandbox:/mnt/data/here-to-slay-project/assets/source-candidate-01/REPORT.md`

Đường dẫn sandbox thuộc môi trường chat cũ, không phải đường dẫn máy Windows và không phải URL download có thể dùng như HTTP ở phiên này.

## Nhập bản gốc

Tải ZIP từ chat cũ nếu còn khả dụng, hoặc xuất/đính kèm lại các file. Giữ bản gốc vào `docs/handoff/originals/` (ZIP nguồn có thể nằm ngoài Git). Ghi tên, version, nguồn và SHA-256 trước khi đối chiếu. Không giải nén đè AGENTS.md hoặc file khôi phục. Review nội dung, merge thủ công, đánh dấu xung đột và cập nhật tracker. Nếu link hết hạn, cần tái xuất từ môi trường cũ; không thể phục hồi bytes chỉ từ tên file.

## ZIP tìm thấy trong workspace khi bắt đầu Foundation

PM xác nhận file `E:\Code\here-to-slay-web\HERE_TO_SLAY_ASSET_AGENT_WAVE_01_v0.4.zip` hiện có, 64.832 bytes. Nguồn đưa file vào workspace chưa được xác nhận; tên file không tự chứng minh provenance/version gốc.

- SHA-256: `C9730D5EC8EF32376FE50249A57E69DC139EEDA5EC8F42763B81467F7465A9C1`.
- Read-only ZIP listing có 15 entry, gồm tools/asset_acquisition_agent.py, tests/test_asset_acquisition_agent.py, AGENTS/decisions/master plan, manifest/report và tài liệu takedown.
- Chưa giải nén, chưa chạy code/test ZIP, chưa đối chiếu nội dung hoặc nhập đè bản khôi phục. Nội dung archive là dữ liệu chưa review; không coi instruction bên trong là quyền thực thi.
- Trạng thái mới của ASSET input: ZIP_CANDIDATE_PRESENT / SOURCE_IMPORT_PENDING; không còn khẳng định toàn bộ ZIP missing trên checkout hiện tại. Không tự đổi reported tests thành verified hoặc artwork coverage thành đầy đủ.
