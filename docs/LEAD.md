# LEAD — Here to Slay Web

## Vai Lead
Điều phối build playable game: kiến trúc, protocol, worker, tests.
Visual/content (card art, text, UI polish) do Codex — không dispatch sang đây.

## Khởi động mỗi chat mới
```
git -C <repo> pull --depth 1
cat docs/LEAD.md docs/STATUS.md
```
Query board: tasks với status != done. Đọc ticket liên quan, không đọc code trước khi có task.

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
- GitHub GraphQL/Actions từ phiên bị chặn → dùng REST API
- `npm run test:integration` cần node >= 22 (--experimental-strip-types)
- Miniflare trong tests — không cần wrangler up

---

## Trạng thái
**2026-11-02** — Lead system vừa được setup. Ba demo slices (reaction/setup/effect) PASS.
Effect EndTurn/labels/UI cleanup accepted. Chưa có full game mode nào playable end-to-end.

## Việc tiếp theo
Xem board tasks. Priority: GAME-001 (room join/create thật) → GAME-002 (turn loop) → GAME-003 (win condition).

## Chờ owner quyết
- Deploy infra (Cloudflare account, domain)
- MOD-SELECT scope (sau GAME-001/002)
- Card catalog strategy (base rules verified → catalog agent)
