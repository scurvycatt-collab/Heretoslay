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
**2026-11-02 (cloud)** — GAME-004 DONE: `packages/protocol/src/cards.ts` + `apps/worker/src/content/base-cards.{json,ts}` + `docs/contracts/CARD_TEMPLATE_SPEC.json`; nguồn/sai lệch ở `docs/content/BASE_CARD_DATA.md`. GAME-002 DONE: engine `apps/worker/src/game/base-engine.ts` (+ base-rules.ts), contract GAME_ROOM_API.md. GAME-003 DONE (win + GAME_OVER). MOD-005 DONE (Modifier picker + Q-11 switch + CONFIGURE_GAME). Đang QA-001.

**2026-11-02 12:50** — main đã push GitHub. Merged: T00, RULES-001, GAME-001 (base room thật, logic ở apps/worker/src/game/).
Owner đã chốt Q-01..Q-12 (docs/decisions/product-decisions.md, mục cuối). Q-11: đã làm switch `leaderPassiveUsesModifierSlot` (default false) — owner xác nhận thì xong.
Owner đổi: engine side nhập luôn data cơ chế/effect của thẻ; art do Codex sau.
Code chạy trên cloud session (credit); chat Lead chỉ duyệt/quyết.

## Việc tiếp theo (theo thứ tự)
2. GAME-002 — turn loop đầy đủ theo RULES-001 spec + product decisions.
3. GAME-003 — win condition.
4. MOD-005 — chọn Modifier cụ thể + option giá trị.
5. QA-001 — test end-to-end + các nit từ review GAME-001.
6. UI-001 — wiring lobby/bàn chơi base tối thiểu (style để Codex).
Deploy Cloudflare (DEPL-001) để SAU khi sản phẩm xong.

## Chờ owner quyết
- **Default hết giờ choice** (discard/sacrifice/give/lấy từ discard): server chọn `min` lá đầu tiên. Owner có muốn random hay khác?
- **"may" có lợi cho chính chủ** (Arctic Aries, Crowned Serpent, Dracos, Plundering Puma) đang áp dụng tự động. Owner có muốn hỏi người chơi?
- Effect chưa mô hình hoá (log no-op): Fuzzy Cheeks, Mellow Dee, Pan Chucks, Qi Bear, Beary Wise, Bullseye, Hook, Quick Draw, Sharp Fox, Silent Shadow, Snowball, Wiggles, phần "play immediately"; skill slain Corrupted Sabretooth/Malamammoth/Orthus/Rex Major. Cần task tiếp (GAME-005?).
- **Q-01 vs rulebook**: bản text rulebook retail (Wayback) ghi class requirement có thể thỏa bởi "a Hero card or the <class> Party Leader card". Engine theo Q-01 (Leader KHÔNG thỏa), có setting `leaderFillsClassSlot` để đổi.
- **Q-04 vs card text**: Mask ghi "considered a <class> **instead of** its original class" (thay, không cộng). Engine theo Q-04 (cộng), setting `maskMode: add|replace`.
- Data thẻ chỉ từ nguồn community (không scan retail): 1 lệch penalty (Dark Dragon King 4- vs 7-), DISCARD 1 vs 2 cho 6 Monster — chọn đa số, ghi trong BASE_CARD_DATA.md.
- Gắn remote GitHub để có PR/CI thật (hiện merge cục bộ trong session cloud)
- Deploy infra (Cloudflare account, domain)
- MOD-SELECT scope (sau GAME-001/002)
- Card catalog strategy (base rules verified → catalog agent)
