# SL-05 runtime diagnostic

Ngày: 2026-11-01 (Asia/Saigon). Owner: Architecture. Phạm vi chỉ local runtime; không sửa source/config/deps, không deploy.

## Evidence

1. Sandbox mặc định:
   `npm --workspace apps/worker run dev -- --port 8787 --log-level debug`
   kết thúc exit 1. Wrangler không ghi được `%APPDATA%\xdg.config\.wrangler\registry\here-to-slay-worker` và log do `EPERM`. Đây là nguyên nhân lifecycle biến mất ở lần launch này, không phải `apps/worker/src/index.ts` hoặc `wrangler.jsonc`.
2. Ngoài sandbox, cùng lệnh không debug báo `Ready on http://127.0.0.1:8787` và PTY còn sống. Probe từ execution khác timeout; do khác boundary nên không dùng kết quả này để khẳng định app healthy hay source lỗi. Session do lượt này tạo đã được dừng sạch bằng `x`.
3. Lần launch bounded cuối trong sandbox đặt `XDG_CONFIG_HOME=<sandbox TEMP>\here-to-slay-wrangler-xdg`. Registry/log ghi được, nhưng Wrangler kết thúc exit 1 với `connect EACCES 127.0.0.1:9232`, trước HTTP Ready. Log: `<sandbox TEMP>\here-to-slay-wrangler-xdg\.wrangler\logs\wrangler-2026-11-01_16-38-26_402.log`.

## Kết luận / bước kế

Blocker là quyền socket/registry theo execution environment, chưa có bằng chứng lỗi Worker source/config. Không restart thêm. Để nghiệm thu, launcher và probe `/health` phải chạy trong cùng execution context và cùng escalation level; chỉ HTTP 200 thật mới green-light QA. Không còn server 8787 do lượt này giữ.
