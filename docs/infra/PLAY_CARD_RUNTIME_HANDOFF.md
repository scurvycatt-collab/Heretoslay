# PC-IMPL-BOTH local runtime handoff

Date: 2026-11-02 (Asia/Saigon)  
Scope: local preview only; no source/dependency/lock/tracker changes.

## Runtime

- Vite: `http://localhost:5173/`, launcher PID `24992`, listener PID `20628`.
- Vite was started with `WORKER_PROXY_TARGET=http://127.0.0.1:8789`.
- Worker: `http://127.0.0.1:8789`, launcher PID `33756`, listener PID `14352`.
- Worker was started with existing Wrangler command and explicit `--port 8789`; default `8787` was not changed.

## Evidence

- `GET http://localhost:5173/` → HTTP 200.
- `GET http://localhost:5173/api/health` → HTTP 200, `service=here-to-slay-worker`, `scope=reaction-slice`.
- `GET http://127.0.0.1:8789/health` → HTTP 200, `service=here-to-slay-worker`, `scope=foundation`.
- Wrangler log confirms `/api/health` and `/health` requests returned 200.

No tests were run; no deployment or remote access was used. Keep these local processes for browser QA and re-check ownership before stopping them.

Post-return check: Vite listener remains only on `[::1]:5173`; `http://localhost:5173/` returns 200 from elevated curl, while `http://127.0.0.1:5173/` fails with connection refused. Worker `127.0.0.1:8789/health` remains 200. The concrete browser-risk is IPv6-only Vite binding versus IAB's localhost resolution/lifecycle boundary; no restart loop or firewall change was attempted.

Corrective restart 2026-11-02: verified/stopped Vite PID `20628`; relaunched with `WORKER_PROXY_TARGET=http://127.0.0.1:8789`, `vite --host 127.0.0.1 --strictPort` (launcher `36204`, listener PID `36324`). `127.0.0.1:5173/` → 200; `/api/health` → 200 reaction-slice; direct Worker `127.0.0.1:8789/health` → 200 foundation. Worker PID `14352` was kept unchanged.
