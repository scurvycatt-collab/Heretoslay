# Chuyển giao chính xác vào Codex

## Khả năng đã kiểm tra

`list_projects` trả `projects: []`. Bộ tool có list/move project và create_thread cho project có sẵn, nhưng không có create_project. Chưa đăng ký project bằng UI. Chưa tạo remote repo. Tạo thư mục hoặc Git repository không tự đồng nghĩa project đã xuất hiện trong sidebar.

## Mở bộ đã chuẩn bị

1. Trong app, tạo project tên **Here to Slay Web** bằng chức năng tạo project; thêm thư mục local bên dưới. Nếu project đã tồn tại, dùng menu project → Edit project → Add folder.
2. Chọn thư mục này làm thư mục chính (Make primary) để các chat mới dùng đúng root và nhận AGENTS.md ở root:

   `C:\Users\hidey\Documents\Codex\2026-10-28\referenced-chatgpt-conversation-this-is-an\outputs\here-to-slay-web`

3. Mở chat mới trong project đó; xác nhận đường dẫn làm việc và đọc README.md trước khi sửa file. Nếu app hỏi quyền truy cập thư mục, hoàn tất trong UI.
4. Dán prompt tiếp quản ở cuối file. Không dùng lệnh handoff_thread để chuyển một ChatGPT conversation: tool đó chỉ di chuyển Codex thread có sẵn.

Tham khảo official OpenAI documentation: https://learn.chatgpt.com/docs/projects . Tên nút tạo project có thể khác theo phiên bản; quan trọng là project gắn đúng thư mục và root được xác minh, không chỉ đổi tên chat.

## Git và remote

Repository local trong thư mục này đã được khởi tạo trên nhánh main, chưa commit và chưa có remote. ZIP bàn giao chỉ chứa tài liệu, không bao gồm .git.

Nếu chưa có `.git` sau khi giải nén bundle, mở terminal tại root và chạy `git init -b main`. Kiểm tra `git status` và `git remote -v`. Review file trước khi commit; chưa cần GitHub để tiếp tục local. Khi muốn remote, xác định tài khoản, tên repo và visibility; tạo repo rồi thêm remote bằng URL thật, không dùng URL giả trong lệnh push.

## Quản lý tiếp

Repo là nguồn chung cho scope, decisions, tracker và handoff. Chat dùng để xử lý task; lưu kết quả cần tái sử dụng vào file. Mỗi task có ticket và phạm vi file. PM review output và kiểm tra trước khi đóng. Bắt đầu bằng nhập/đối chiếu bản gốc; có thể nghiên cứu RULE/ARCH độc lập trong lúc thiếu ZIP, nhưng không tuyên bố đạt Wave 1B gate.

## Prompt tiếp quản

```text
Tiếp quản Here to Slay Web trong thư mục project hiện tại. Đọc AGENTS.md, README.md, docs/handoff/SOURCE_REGISTER.md, master plan, Wave 1 và docs/STATUS.md. Phân biệt bản khôi phục với tài liệu v0.4 gốc. Kiểm tra cwd, Git và file đầu vào, cập nhật trạng thái thực tế. Nếu có ZIP gốc, giữ bản gốc và đối chiếu trước khi merge. Nếu thiếu, tiếp tục phần specification làm được và ghi rõ thiếu gì. Chưa build Foundation khi chưa đạt Wave 1B gate. Không tự coi Asset Agent đã được kiểm thử lại hoặc artwork đã tải đủ. Báo cáo file thay đổi, kiểm tra thực chạy, blocker và bước tiếp theo; không tự deploy.
```

