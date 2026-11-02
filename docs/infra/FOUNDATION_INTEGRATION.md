# Foundation integration handoff

Ngày: 2026-10-29 (Asia/Saigon)  
Owner: Infrastructure  
Phạm vi: root tooling, Git metadata, lockfile/CI và kiểm tra tích hợp; không sửa source owner khác.

## Git

Backup nguyên trạng trước repair: `E:\Code\here-to-slay-web\.git-backup-foundation-20261028`; kiểm tra tồn tại, 20 entries, không overwrite backup cũ. `git init -b main` lần đầu bị sandbox `Permission denied` khi lock `.git/config`; chạy lại với quyền nâng cao thành công (`Reinitialized existing Git repository`).

Verify thực chạy sau repair:

- `git rev-parse --show-toplevel` → `E:/Code/here-to-slay-web`
- `git status --short` → thành công, tất cả thay đổi hiện là untracked; chưa commit
- `git branch --show-current` → `main`
- `git log -1 --oneline` → không có commit
- `git remote -v` → không có remote

Không reset, move/delete working files, commit, push hoặc thêm remote.

## Root integration

`package.json` dùng npm workspaces `apps/*`, `packages/*`, pin `npm@11.12.1`; root scripts gồm `dev:web`, `dev:worker`, `typecheck`, `build`, `test`, `test:integration`. Root test dùng `--if-present` vì web chưa có test script; worker và protocol có test scripts, sau đó chạy root integration glob. CI `.github/workflows/foundation.yml` pin Node 24 và chạy `npm ci`, typecheck/build/test.

`npm install` thực chạy thành công: 112 packages added, 0 vulnerabilities; lockfile được cập nhật. Runtime: Node `v24.15.0`, npm `11.12.1`.

## Checks

- `npm run typecheck` — PASS (web, worker, protocol).
- `npm run build` — PASS sau retry elevated; web Vite build, worker Wrangler `--dry-run`, protocol TypeScript build. Không deploy.
- `npm test` — PASS: 14 tests, 14 pass, 0 fail. Workspace suites: worker 2 router/unit tests và protocol 10 contract/unit tests. Root integration: 2 mock integration tests (capacity contract 1, worker Room mock storage/alarm 1); không phải live Durable Object.

## Local Worker smoke

Đã chạy local-only bằng `npm --workspace apps/worker run dev -- --ip 127.0.0.1 --port 8787`, Wrangler báo `Ready on http://127.0.0.1:8787`; sau kiểm tra đã dừng server. Không dùng `--remote`, tunnel, cloud auth hoặc deploy.

- `GET /health` → `200`, `{"ok":true,"service":"here-to-slay-worker","scope":"foundation"}`.
- `GET /rooms/QA429` trước init → `404`, `ROOM_NOT_INITIALIZED`.
- `POST /rooms/QA429` → `201`, `roomCode=QA429`, `revision=1`, `maxPlayers=6`, `enabledSetIds=["hts.base.v1"]`, `scaffold=true`.
- `GET /rooms/QA429` sau init → `200`, cùng snapshot/revision/capacity.

Đây là smoke runtime Wrangler local với Durable Object local binding, khác với mock integration test; chưa phải live Cloudflare production verification.

## Local Vite preview

Port 5173 ban đầu có Node PID 27356 nhưng không trả HTTP; process cũ đã được dừng đúng PID. Vite được khởi động local-only bằng Node entrypoint với PID `31244`, `127.0.0.1:5173`, working directory `apps/web`; server đang được giữ chạy cho QA. Log: `docs/infra/vite-preview.log` và `docs/infra/vite-preview.err.log`.

- `GET http://127.0.0.1:5173/` → `200 text/html`, title `Here to Slay — UI review mock`, module `/src/main.tsx`.
- `GET http://127.0.0.1:5173/src/main.tsx` → `200 text/javascript`, Vite-transformed React entrypoint.
- Stop khi review xong: `Stop-Process -Id 31244`.

Preview chỉ bind loopback; không tunnel, login, remote hoặc deploy.

Giới hạn: đây là scaffold/integration, chưa claim gameplay/full Foundation done. ADR/frontend và protocol là input đã có; deployment, remote, production access, expansion và full effect coverage vẫn ngoài scope/chưa approved. Không có source failure còn chờ owner trong các checks trên.
