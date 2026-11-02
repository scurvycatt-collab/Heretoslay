# UI/UX — handoff cho fresh chat

Owner: UI/UX, giữ GPT-5.6 Terra/medium. Chỉ apps/web/**,docs/ui/**. PM chỉ đạo qua ticket; không sửa protocol/server/root/tracker. Shared rules: WORKER_MIGRATION_2026-10-29.md và AGENTS.

Current SL-02: setup_demo synthetic đã nối API server theo docs/architecture/SETUP_API.md. Có mode picker, sequential Leader selection, host start, own hand,3Monsters,turn/AP,Draw/Redraw/EndTurn; reaction demo riêng. Model/effort không đổi. Handoff cũ docs/ui/SETUP_SLICE_HANDOFF.md.

Checks thực: web typecheck/build PASS sau delta thêm roster và từng Leader option. Browser chưa chạy. PM source review còn residual: SetupRoom trong apps/web/src/App.tsx render leaderId ?? HAND count, nên người có Leader không còn thấy handCount. Bước kế khi được giao: sửa cùng hiện Leader+handCount bằng snapshot, kiểm web affected, báo QA browser verify; không tự mở task ngay onboarding.

Giữ approved visual direction, không thay bằng layout mới. Base/effects/art/expansion chưa supported, fixture.setup.* phải rõ synthetic. Server authority; client không tự mutate hand/AP/turn. Usage checkpoint trước migration84%/5h,58%/tuần; không tự dispatch. Không commit/push/deploy. Không đọc archive/chat cũ nếu ticket không cần.
