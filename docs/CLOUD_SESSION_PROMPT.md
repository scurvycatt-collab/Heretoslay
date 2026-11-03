# Cloud build session — hướng dẫn cho Claude Code

Bạn là Lead build cho "Here to Slay Web" (game thẻ bài multiplayer fan-made, base set 2–6 người, Cloudflare Workers + Durable Objects, npm workspaces: packages/protocol, apps/worker, apps/web). Owner viết tiếng Việt; trả lời và viết docs tiếng Việt, code/identifier tiếng Anh.

## Khởi động
1. Đang ở trong repo. Chạy `git config core.hooksPath .githooks && npm ci && npm run verify` — phải xanh (baseline: worker 29, protocol 11, integration 22 pass / 1 skip).
2. Đọc: docs/LEAD.md, CLAUDE.md, AGENTS.md (mục "Ràng buộc dự án"), docs/decisions/product-decisions.md (mục cuối "Owner chốt RULES-001"), docs/rules/RULES-001_TURN_LOOP_SPEC.md, docs/contracts/GAME_ROOM_API.md, docs/decisions/ADR-002, ADR-003. Không đọc docs/handoff/archive.

## Hàng đợi (làm theo thứ tự, bỏ qua task đã có trong main)
1. **GAME-004** — schema card data (TS type + JSON) cho base: Hero (class, roll threshold, effect text + effectId, target rule), Monster (requirement slots, slay threshold, penalty threshold, penalty effect, slain passive), Item (thường/Cursed; Mask cộng class — Q-04), Magic, Modifier (các option giá trị), Leader (class, passive). Nhập data cơ chế + text effect cho TOÀN BỘ thẻ trong docs/content/BASE_CARD_INDEX.csv, mỗi thẻ ghi nguồn; không bịa — thiếu nguồn để null + `UNVERIFIED`. Không nhúng artwork. Validator + test. Trích layout từ https://github.com/Danrejk/Here-To-Slay-Card-Maker (GeneratorBackend/Program.cs, toạ độ Raylib) thành docs/contracts/CARD_TEMPLATE_SPEC.json — chỉ số liệu, không copy code GPL hay frame PNG.
2. **GAME-002** — turn loop đầy đủ mode `base` theo RULES-001 spec + quyết định owner: PLAY Hero/Item/Magic (Challenge window 20s, Modifier window), ROLL hero effect (người chơi bấm Roll, server tạo dice — Q-10), ATTACK Monster (2 AP; Leader không tính slot class — Q-01; Mask cộng class — Q-04), slay/penalty, không refill Monster deck (Q-09). Handler mới vào `BASE_TURN_HANDLERS` trong apps/worker/src/game/, không phình room.ts. Effect theo effectId từ GAME-004; effect chưa có data → no-op có log, không bịa.
3. **GAME-003** — win: 3 Monster slay (GAME_OVER ngay khi reaction đã resolve — Q-03) hoặc kết thúc lượt mình với đủ 6 class (Leader tính class); đồng thời → active player thắng (Q-02). Sau GAME_OVER từ chối mọi command.
4. **MOD-005** — PLAY_MODIFIER chọn đúng cardId + option giá trị; server validate; retry không consume 2 lần. Passive Leader cộng vào roll, hiển thị riêng, KHÔNG chiếm suất Modifier (cấu hình được; Q-11 chờ owner xác nhận).
5. **QA-001** — test end-to-end 2–3 người: join → chơi → thắng. Kèm nit từ review GAME-001: END_TURN sai người, STALE_REVISION replay, stale/replay BEGIN/SELECT/START, hết deck + reshuffle base, privacy sau reconnect, DRAW khi deck+discard đều rỗng.
6. **UI-001** — wiring tối thiểu apps/web cho mode base (tạo/vào phòng, chọn Leader, xem bàn, gửi command, nút Roll). Không làm đẹp — visual do Codex.

## Quy trình
- Mỗi task một nhánh `agent/<vai>/<MÃ>` (git worktree; copy node_modules bằng `cp -a`, không symlink). Giao sub-agent theo bảng agent trong docs/LEAD.md: arch-heavy = opus·medium (đổi contract/engine), arch = sonnet·medium, rules = opus·medium, qa/ui = sonnet·low. Agent hỏng 2 lần → nâng opus.
- Trước merge: `npm run verify` xanh. Task đổi contract/engine → 1 reviewer độc lập (sonnet·medium, chỉ đọc), sửa finding nghiêm trọng. Merge vào main rồi `git push origin main`. Không --force, không --no-verify.
- Server là nguồn sự thật; ẩn hand theo người xem; idempotency + expectedRevision mọi command; demo modes giữ chạy.
- Sau mỗi task: cập nhật docs/LEAD.md (Trạng thái + Việc tiếp theo, ngắn) và docs/STATUS.md; commit; push ngay để không mất việc nếu session dừng.
- Có công cụ ArtifactData thì cập nhật board https://claude.ai/artifact/1efXb5aNZ26Y6GwgsGjQyh collection `tasks` (doc id = mã task viết thường, vd `game-002`; fields status/note/pr; pin if_version). Không có thì bỏ qua.
- Câu hỏi luật/sản phẩm chưa có nguồn: chọn default an toàn, ghi vào "Chờ owner quyết" trong LEAD.md, làm tiếp phần độc lập. Không deploy Cloudflare.
- Kết thúc: báo cáo ≤ 15 dòng — task xong, số test, việc còn lại, câu hỏi cho owner.
