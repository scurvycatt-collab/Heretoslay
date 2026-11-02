# Foundation readiness — INFRA-000

Ngày kiểm tra: 2026-10-28 (Asia/Saigon)  
Owner: Infrastructure  
Phạm vi: read-only baseline; không init/reset/move/delete/sửa Git, không cài dependency/deploy.

## Git baseline

Root kiểm tra: `E:\Code\here-to-slay-web`. `.git` là thư mục và có `HEAD`, `config`, `description`, `hooks/`, `info/`; `HEAD` trỏ `refs/heads/main`. `config` chỉ có cấu hình repository cơ bản, không có remote. Kiểm tra read-only không thấy `objects/` hoặc `refs/` khả dụng/được liệt kê; không có branch/commit để xác minh. `git -C E:/Code/here-to-slay-web rev-parse --is-inside-work-tree` và `status --short` đều trả `fatal: not a git repository`.

Đây không chỉ là unborn branch: repository mới hợp lệ vẫn có metadata/object database tối thiểu và Git phải nhận root. Bằng chứng hiện tại phù hợp với `.git` bị chép thiếu/hỏng (đặc biệt thiếu object database; refs cũng không tồn tại), nhưng chưa đủ để xác định nguồn gây hỏng. Không có remote hoặc commit làm nguồn khôi phục.

Fix tối thiểu đề xuất, chưa thực hiện: sao lưu nguyên trạng `.git` ra vị trí an toàn; sau khi PM xác nhận không cần phục hồi metadata, chạy `git init -b main` tại đúng root. Xác minh bằng `git rev-parse --show-toplevel`, `git status`, `git branch --show-current`, `git log -1`, `git remote -v`. Chỉ thêm remote URL thật sau khi chủ dự án xác định; không reset file làm việc.

## Foundation catalog (chưa tạo)

ADR-001 và protocol draft đề xuất, chưa approved/verified runtime:

- `apps/web/`: React + TypeScript + Vite; static frontend.
- `apps/worker/`: Cloudflare Worker HTTP/WebSocket gateway và Durable Object `Room`.
- `packages/engine/`: server-authoritative game transitions/RNG boundary.
- `packages/protocol/`: shared command/event schemas, `windowId`, idempotency.
- `packages/content/`: card/content namespaces; expansion chỉ khi có data được hỗ trợ.
- `tests/`, `tools/`: unit/contract/integration harness và tooling tối thiểu.
- Root scripts/CI tối thiểu cần đề xuất sau ADR approval: format, typecheck, build, test; CI chạy các script này trên pull request. Chưa tạo package manager, dependency hay workflow.

Frontend ADR vẫn **PROPOSED**. Foundation chưa readiness-approved vì Git baseline, owner decisions về eligibility/Skip-finality và dice, content/setup evidence, cùng runtime tests còn thiếu.

## Beta/release checklist (riêng, chưa deploy)

- [ ] Xác minh access thực: nickname + room code, reconnect, rate limit, logs/observability và quyền truy cập secrets.
- [ ] Release gate: base 2–6; expansion bật có kiểm tra capacity trước khi mở 7–8; không hiển thị expansion chưa hỗ trợ.
- [ ] Takedown: có manifest card ID/source/rights (UNVERIFIED), quy trình gỡ content/artwork và owner xử lý yêu cầu.
- [ ] Asset change: version/hash manifest, review thay đổi, rollback; không công bố artwork chỉ vì tải được.
- [ ] Cloudflare cache: purge cache sau content/asset release hoặc takedown; ghi bằng chứng purge và kiểm tra URL cũ không còn phục vụ.
- [ ] Release chỉ được approved sau ADR, QA executable tests, access checks và owner review; hiện chưa deploy.

Handoff: output này là readiness draft, chưa là test pass hay release approval. Phụ thuộc PM/owner review Git recovery và các quyết định reaction/dice.
