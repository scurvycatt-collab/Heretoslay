# Expansion framework — handoff (2026-11-05, cập nhật 23:xx ICT)

Dùng file này để mở chat mới. User nói tiếng Việt, muốn trả lời ngắn kiểu caveman. Quyết định của owner luôn thắng.

## Repo / nhánh
- Repo `scurvycatt-collab/Heretoslay`, clone `/home/claude/heretoslay` (clone lại nếu container mới).
- Nhánh `feat/expansion-ex-foundation`, base `main@309c58b`, HEAD xem `git rev-parse --short=8 HEAD` (đã push; nhánh đi trước `main` ~31 commit).
- Stop hook hay báo sai "unpushed commits": kiểm bằng `git ls-remote origin feat/expansion-ex-foundation | cut -c1-8` so với `git rev-parse --short=8 HEAD`. Khớp thì bỏ qua.
- Verify: `npm run verify` (typecheck + worker/protocol/integration tests). Lúc cuối: 280 worker + 11 protocol + 109/110 integration, 0 fail. Web build ok.

## Ràng buộc cứng
- Không bịa luật / card effect / kết quả test. Chưa có ruling thì hỏi owner.
- KHÔNG push `main`, KHÔNG deploy. Push nhánh feature thì được.
- Chưa đăng ký pack vào `GAME_SET_CATALOG` (đang `createSetCatalog([])`) cho tới khi catalog, handler, migration, acceptance đủ. Không hiển thị expansion như đã hỗ trợ.
- Commit kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` và dòng `Claude-Session: ...`.
- Quyết định owner: `docs/decisions/EXPANSION_OWNER_DECISIONS_20261105.md` (E01–E16, M01–M08, W01–W11) + các câu trả lời BN/DS trong chat. E14 scoped trigger, E15 cap 7 Hero, E01 thắng 7 class, E16 số ghế = min(8, số Leader duy nhất).

## Đã xong
- **EX-03 WD** (Warriors & Druids): data + handler đủ. `expansion-wd.ts`, `expansion-wd-module.ts`.
- **EX-04 BN** (Berserkers & Necromancers): 33 card, mọi effect đã implement. `expansion-bn.ts`, `expansion-bn-module.ts`.
- **EX-05 DS** (Dragon & Sorcerer v2): 16 card, đủ 16 effect (Dragalter, Luut, Mirroryu, Shamanaga xong ở commit `51a399a`). `expansion-ds.ts`, `expansion-ds-module.ts`.
- Modifier ±6 (DS): phải discard 1 lá TRƯỚC khi kích hoạt. Chọn lúc chơi qua `REACT_MODIFIER.discardCardInstanceId`.
- **EX-06 (phần đã làm):**
  1. Module BN/DS (`createBnModule`, `createDsModule`), chưa đăng ký.
  2. Chọn pack ở lobby: `settings.expansionIds` qua `CONFIGURE_GAME` (host, chỉ phase `lobby`). Deck, Monster, pool Leader, số ghế theo pack. Đổi pack thì Leader rơi khỏi pool bị bỏ chọn, Ready reset. Catalog inject được qua `deps.catalog` (test dùng). Pack lạ → `UNSUPPORTED_EXPANSION`. Room `maxPlayersFor(state)` trong `room.ts`.
  3. `partyLimit(game)` (6 base, 7 có pack) và `classWinCount(game)` (6 / 7).
  4. UI (`apps/web/src/BaseRoom.tsx`): nút chọn pack chỉ hiện khi `game.availableExpansions` không rỗng (live = rỗng), picker discard cho ±6 (`discardCost` trên card view), nút Gnawing Dread (`LEADER_ACTION {}`), cap Party và số ghế theo pack.
- Tests mới: `ex03-*`, `ex04-bn-*`, `ex05-ds.test.ts`, `ex06-modules.test.ts`, `ex06-room-packs.test.ts`.

## Đã xong thêm (phiên 2026-11-05 tối)
- UI: 5 class mở rộng (glyph/màu là placeholder tự làm, không phải art card), bộ đếm class theo `classGoal` (6/7), Hero 2 slot hiển thị đủ attachment + filter equip theo `slots`, nhãn "Returns to hand" (Maegisty, `protections` có `return_to_hand`), nút Shaman (`shamanAvailable` theo viewer, chọn side khi Challenge), `rejections.ts` map mã lỗi (REQUIREMENT_NOT_MET...), `immediate_roll_choice` có `bonus` (Mirroryu +3) và `sacrificesAfter` (Shamanaga).
- Đã kiểm: 11 choice kind mới đều có nhánh trong `eligibleChoiceCards` và đi qua UI choice chung (prompt + options, options chỉ gửi cho người chọn).
- Test: `ex06-persist` (save cũ schema 1/2 thiếu `expansionIds`, roundtrip JSON), `ex06-seat-matrix` (8 tổ hợp pack, cap = min(8, Leader), cap+1 bị từ chối, DS-only không ghế 8), `ex06-views` (shaman, slots, Maegisty, bonus Mirroryu, spectator privacy), `ex06-e14-scope` (card trigger chỉ kích hoạt cho đúng owner/actor: Manticore, Ripper, Doombringer, Fearless Flame, Calamity Mongrel, Piercing Howl + cross-set 2-slot WD Item + BN Item + DS Leader).
- Contract `GAME_ROOM_API.md` đã cập nhật (`slots`, `return_to_hand`, `shamanAvailable`).

## Còn lại
1. Room-level restart/reconnect với pack: không test được vì room dùng `GAME_SET_CATALOG` rỗng (live). Chỉ có test state-level. Làm khi đăng ký pack, hoặc cho room nhận catalog inject.
2. E14: đã rà và có test cho owner/actor scope, DRAW≠PULL (Calamity Mongrel), C04 thắng slay thứ 3 không chạy passive deferred (Manticore + Mongrel), eligibility chốt lúc DRAW (`drawTriggerSteps`). Chưa test riêng: recover/reveal/PLAY/bring cho từng card, và Rex Major/Orthus/Malamammoth theo DRAW vs PULL.
3. UI đã xem qua snapshot thật (`projectBaseGame`) trong vite dev + Playwright: bàn có pack, Shaman, Mirroryu. Đã sửa 2 lỗi bố cục (nút Shaman bị SKIP đè, chip class đè nhãn protection). Card mở rộng hiện placeholder chữ cái vì web chưa có card data/art mở rộng — chưa sửa.
4. Acceptance cuối, rồi mới đăng ký pack vào `GAME_SET_CATALOG`. Cần owner đồng ý trước. Không deploy.
5. Monster Expansion (13 card) ngoài phạm vi trừ khi owner yêu cầu.

## Quy ước thiết kế cần giữ
- Choice "chọn class"/"chọn player" mô phỏng bằng chọn 1 Hero đang ở trong Party làm proxy.
- "Item card" gồm Cursed Item. Doombringer chỉ kích hoạt khi Hero/Item thật sự rời Party.
- Unbridled Fury: AP chỉ khi Berserker thật sự bị destroy (bị cứu/ngăn thì không).
- Oracon in "+7" đọc là 7+. Dragalter: chỉ áp số của Modifier, không lặp draw/discard hand/chi phí ±6; BN +2/-2 = +4 khi ATTACK của chính mình.
- Mirroryu: chọn Hero khác trong Party, roll +3, miễn phí, không tính vào 1 roll/Hero/lượt. Shamanaga: SACRIFICE sau roll dù thắng/thua/skip/timeout.
- Instance id: `<definitionId>#NN`; id expansion resolve qua `expansion-ids.ts` (`idOf(name)`).
- Test dùng `node --test --experimental-strip-types`.

## Bản đồ file chính
- Engine: `apps/worker/src/game/base-engine.ts` (steps, choices, `buildEffect`, `playModifier`, roll flow), `base-game.ts` (handlers, settings, lobby), `base-rules.ts`, `expansion-ids.ts`, `attachments.ts`.
- Nội dung: `apps/worker/src/content/` (`expansion-*.ts`, `*-module.ts`, `set-catalog.ts`, `base-cards.ts`).
- Protocol: `packages/protocol/src/index.ts`, `src/game/base.ts`, `src/cards.ts`. Contract: `docs/contracts/GAME_ROOM_API.md`.
- Ghi chú mặt card (nếu còn): scratchpad `bn-faces.md`, `ds-faces.md`; ảnh gốc ở máy owner `E:\Code\here-to-slay-web\assets\cards\Expansion\...` (cần thiết bị liên kết).

## Prompt mở chat mới
"Tiếp tục dự án Here to Slay expansion. Đọc `docs/handoff/EXPANSION_EX_HANDOFF_20261105.md` và `CLAUDE.md` trong repo `scurvycatt-collab/Heretoslay`, nhánh `feat/expansion-ex-foundation`. Làm tiếp mục 'Còn lại' theo thứ tự. Trả lời ngắn kiểu caveman, tiếng Việt. Không push main, không deploy, không bịa luật."
