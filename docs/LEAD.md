# LEAD — Here to Slay Web

## Vai Lead
Điều phối build playable game: kiến trúc, protocol, worker, tests.
Visual/content (card art, text, UI polish) do Codex — không dispatch sang đây.

## Khởi động mỗi chat mới
Nguồn sự thật: GitHub https://github.com/scurvycatt-collab/heretoslay (nhánh main).
```
git clone https://github.com/scurvycatt-collab/heretoslay hts && cd hts
git config core.hooksPath .githooks && npm ci && npm run verify
```
Đọc docs/LEAD.md (Trạng thái + Việc tiếp theo) + CLAUDE.md + board. Không đọc code trước khi có task.
Máy owner: E:\Code\here-to-slay-web (chưa có git) — sync bằng tar qua bridge khi chat Lead có link máy.

## Công cụ & link
- Board: https://claude.ai/artifact/1efXb5aNZ26Y6GwgsGjQyh
- Repo: E:\Code\here-to-slay-web
- Deploy: Cloudflare Workers (wrangler deploy, chưa setup CI)
- Test: `npm run typecheck` + `npm run test:integration`
- Dev: `npm run dev:worker` (port 8787) + `npm run dev:web` (port 5173)

## Bảng agent

| Vai | Model · effort | Sở hữu | Dùng khi |
|---|---|---|---|
| arch-heavy | opus · medium | protocol, worker, contracts, ADR | Đổi contract/engine: GAME-001, GAME-002 |
| arch | sonnet · medium | như trên | Logic nhỏ trong contract có sẵn: GAME-003, MOD-005 code, DEPL |
| rules | opus · medium | docs/rules/ | Xác minh luật trước khi code: RULES-001, MOD-005 bước 1 |
| ui | sonnet · low | App.tsx (chỉ wiring) | Nối command/snapshot; style do Codex |
| qa | sonnet · low | tests/ | Integration test |
| reviewer | sonnet · medium | không sửa | Review diff trước merge khi đổi contract/engine |

Nâng cấp: agent hỏng 2 lần → lên opus. Codex: visual, card art, nội dung card.

## Quy trình task
1. Board `doing` → worktree `agent/<vai>/<mã>` → giao agent (scope file, tiêu chí xong)
2. Review diff + `npm run typecheck` + test targeted → push nhánh → PR
3. CI xanh (nếu có) → merge → board `done`
4. Parallel: task độc lập chạy cùng lúc; task có contract change → PR riêng trước

## Uỷ quyền
Tự merge khi: typecheck PASS + test targeted PASS + diff trong scope file + không đổi contract.
Chờ owner: contract change mới, deploy lần đầu, expansion scope.

## Ngưỡng usage
- 80%: không giao task mới, làm nốt task đang chạy, cập nhật LEAD.md checkpoint, hỏi owner.
- Checkpoint: ghi Trạng thái + Việc tiếp theo bên dưới.

## Phát hành
Chưa setup. Cần: wrangler secret, domain, Cloudflare account của owner.

## Bẫy môi trường
- `workspace:*` là cú pháp pnpm/yarn → npm ci lỗi. Dùng `"*"` (đã sửa T00).
- Worktree: copy `node_modules` bằng `cp -a` (symlink workspace là tương đối); KHÔNG symlink cả thư mục.
- Pre-commit hook chạy `npm run verify` (core.hooksPath=.githooks).
- GitHub GraphQL/Actions từ phiên bị chặn → dùng REST API
- `npm run test:integration` cần node >= 22 (--experimental-strip-types)
- Miniflare trong tests — không cần wrangler up

---

## Trạng thái
**2026-11-05** — main `309c58b`. `npm run verify` PASS: worker 113, protocol 11, integration 109 pass / 1 skip (live). Base game chơi trọn ván 2–6 người kèm bot, reconnect, spectator, VI/EN, art thật; Party tối đa 6 Hero. Chi tiết + bản đồ code: [handoff/HANDOFF_2026-11-05.md](handoff/HANDOFF_2026-11-05.md).

## Việc tiếp theo (theo thứ tự)
1. Owner deploy 309c58b lên production và xác minh.
2. Browser review 3–6 người trên production.
3. `rules`: xác minh slay reward các Monster (chỉ Corrupted Sabretooth đã có nguồn) và setup depletion.
4. Asset: chạy workbench với sheet Kickstarter thật trên máy owner.
5. Dọn docs lỗi thời (README, RESUME, agents/{architecture,ui}.md).

## Chờ owner quyết
- Có deploy 309c58b không; ưu tiên giữa mục 2–4 ở trên.
