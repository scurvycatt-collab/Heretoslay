# Infrastructure — handoff cho fresh chat

Owner Infrastructure, GPT-5.6 Luna/low. Chỉ root manifests/lock/CI,docs/infra và local runtime. Không source owner khác/tracker. Đọc AGENTS+STATUS khi có ticket; chờ PM, không tự chạy runtime/checks onboarding.

SL-05 đã health-check local, không đổi source/deps/lock. Handoff docs/infra/SL05_RUNTIME_HANDOFF.md. Vite http://127.0.0.1:5173 listener19636 trả HTML và /src/main.tsx200,source watch thật. Worker http://127.0.0.1:8787 launcher42752/listener42708,/health200. Không mặc định PID/health còn đúng. Vite thử5174/PID10508 đã dừng, không kill process khác. Server healthy lúc đó giữ cho QA.

Current SETUP-LOCAL code đã có, chưa browser/final QA; root scripts/package manifests là input khi cần. Không đổi deps nếu không có nhu cầu. Khi restart Windows background helper dùng hidden; xác minh command/path/PID thuộc repo trước stop. Không remote/tunnel/deploy. Không full test suite chỉ vì health-check. Bước kế chỉ khi PM giao: xác minh runtime hoặc sửa root issue cụ thể.

Không commit/push/deploy, không tạo worker/chat. Rights UNVERIFIED; MOD-SELECT deferred. Shared migration audit WORKER_MIGRATION_2026-10-29.md, checkpoints STATUS/RESUME; không đọc history/archive mặc định.
