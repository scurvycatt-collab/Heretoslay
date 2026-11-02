# INFRA-000 — Baseline Git diagnosis

Ngày kiểm tra: 2026-10-28 (Asia/Saigon)  
Owner: Infrastructure worker  
Phạm vi: chỉ đọc cwd và Git; không sửa `.git`, không init/reset, không cài dependency, không deploy.

## Kết quả

Checkout được kiểm tra tại `E:\Code\here-to-slay-web`. Thư mục `.git` tồn tại và là thư mục metadata (có `HEAD`, `config`, `description`, `hooks/`, `info/`, `refs/`). Tuy nhiên Git không nhận đây là repository:

- `git -C E:/Code/here-to-slay-web status --short` → `fatal: not a git repository (or any of the parent directories): .git`
- `git -C E:/Code/here-to-slay-web log -1 --oneline` → cùng lỗi.
- `git -C E:/Code/here-to-slay-web remote -v` → cùng lỗi.
- `git rev-parse --show-toplevel` và `git rev-parse --git-dir` tại cwd → cùng lỗi.

## Chẩn đoán có chứng cứ

`.git/HEAD` chứa `ref: refs/heads/main`; `.git/config` chỉ có các khóa repository cơ bản (`repositoryformatversion=0`, `bare=false`, v.v.) và không có `[remote]`. Không thấy ref nào dưới `.git/refs` khi kiểm tra read-only. Vì vậy metadata hiện tại là không đầy đủ hoặc không được Git nhận diện đúng; chưa đủ chứng cứ để kết luận nguyên nhân sâu hơn (ví dụ metadata bị sao chép thiếu hoặc bị môi trường/worktree làm hỏng). Chưa có branch, commit hoặc remote nào được xác minh. Không coi mô tả cũ “đã khởi tạo Git” là bằng chứng hiện tại.

## Đường dẫn bàn giao cũ

`docs/handoff/CODEX_SETUP.md` yêu cầu mở/đặt thư mục project làm root chính (“Make primary”) và ghi đường dẫn checkout hiện tại. PM cần rà soát, chỉnh các hướng dẫn `CODEX_SETUP` cũ nếu còn trỏ tới môi trường/sandbox cũ; các link `sandbox:/mnt/data/...` trong `SOURCE_REGISTER.md` không phải đường dẫn Windows hiện tại.

## Đề xuất sửa tối thiểu (chưa thực hiện)

1. PM xác nhận đúng root `E:\Code\here-to-slay-web` và sao lưu `.git` hiện tại trước khi thay đổi.
2. Nếu không cần giữ metadata hỏng, tạo lại repository tại đúng root bằng `git init -b main`; sau đó chạy `git status`, `git log -1`, `git remote -v` để xác minh. Không reset hoặc ghi đè file làm việc.
3. Chỉ thêm remote sau khi chủ dự án xác định URL thật; chưa đề xuất CI/staging/stack trước ARCH-001.

## Kiểm tra thực chạy / blocker / handoff

Kiểm tra thực chạy: các lệnh Git nêu trên và liệt kê metadata `.git`; kết quả là lỗi repository như trên. Blocker: chưa có repository Git hợp lệ, commit, remote hoặc nguồn gốc `.git` để đối chiếu. Phụ thuộc: PM review và quyết định có khôi phục hay khởi tạo lại metadata. Đầu ra đợt này chỉ là chẩn đoán; không tuyên bố INFRA-000 hoàn tất.
