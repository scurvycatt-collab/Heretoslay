# Infrastructure card — PC-IMPL-BOTH

State: ready_for_review; worker idle sau checkpoint. Đây là working-state compact, chưa xác nhận native context compaction.

Input/phạm vi: khôi phục local preview current checkout; chỉ runtime/docs/infra. Input chính: `docs/infra/PLAY_CARD_RUNTIME_HANDOFF.md`.

Files: `docs/infra/PLAY_CARD_RUNTIME_HANDOFF.md`, file này.

Checks thật: Vite chạy với `WORKER_PROXY_TARGET=http://127.0.0.1:8789`, bind `127.0.0.1:5173` (listener PID 36324), `/` HTTP 200, `/api/health` HTTP 200 reaction-slice. Worker `127.0.0.1:8789` (PID 14352), `/health` HTTP 200 foundation. Không chạy tests/deploy.

Blocker: không có trong runtime evidence; browser acceptance vẫn phụ thuộc QA/IAB.

Next/dependency: QA tiếp tục PC-IMPL-BOTH trên URL local; PM review card. Không đổi default `8787`, source/deps/lock/tracker.
