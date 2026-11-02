# Foundation step 1 — root scaffold and Git repair

Ngày: 2026-10-28 (Asia/Saigon)  
Owner: Infrastructure  
Phạm vi: root tooling, `.git` backup/repair, `docs/infra/`; chưa tạo source/package config của owner khác.

## Đầu ra

- Root npm workspace contract: `package.json`, `package-lock.json` với `apps/*` và `packages/*`.
- Shared TypeScript baseline: `tsconfig.base.json`.
- Root scripts: `dev:web`, `dev:worker`, `typecheck`, `build`, `test`; `test` dùng `--if-present` vì web chưa có test script, còn protocol/worker đã có test script.
- CI draft: `.github/workflows/foundation.yml` chạy Node 24, `npm ci`, typecheck/build/test. Đây là workflow chuẩn bị, chưa chạy remote.
- `.gitignore` thêm backup Foundation, `node_modules`, build/Workers output và env files.

## Git backup/repair

Root xác minh: `E:\Code\here-to-slay-web`. Backup nguyên trạng được tạo tại `E:\Code\here-to-slay-web\.git-backup-foundation-20261028` trước repair; backup tồn tại và có 20 entries khi kiểm tra. Backup pattern đã được ignore.

Sau backup, repair tối thiểu bằng `git init -b main` tại root đã thực hiện thành công sau một lần bị `Permission denied` khi Git khóa `.git/config`. Không reset, xóa, di chuyển working files, commit, push hoặc thêm remote.

- Lần đầu `git init -b main` → BLOCKED bởi sandbox permission; retry elevated → `Reinitialized existing Git repository`.
- Verify sau repair: root `E:/Code/here-to-slay-web`, branch `main`, status thành công, chưa có commit, không có remote.

## Runtime và giới hạn

Đã kiểm tra Node/npm: Node `v24.15.0`, npm `11.12.1`; không dump environment/secrets. Apps/web, apps/worker và packages/protocol đã có manifests; lock/install và checks được ghi trong `FOUNDATION_INTEGRATION.md`. CI pin Node 24.

Phụ thuộc: owner Architecture xác nhận ADR/protocol; owner web/worker tạo package manifests; QA tạo test harness. Frontend React/TypeScript/Vite và Workers/DO vẫn theo ADR-001, chưa coi là runtime-verified. Chưa deploy.
