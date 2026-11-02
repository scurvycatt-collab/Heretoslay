# PS-03 — Setup / turn / AP contract plan

Ngày: 2026-10-29. **Status:** PREP contract đã được SL-01 dùng cho `setup_demo`; base runtime vẫn gated. Phạm vi base 2–6, nối tiếp HTTP/session contract trong `REACTION_API.md`. Không mở expansion, MOD-SELECT, card effect engine hoặc artwork.

## Nhãn quyết định

- **VERIFIED RULE:** input từ `SETUP_VERIFIED.md`.
- **OWNER DECISION:** base 2–6; Leader không trùng; expansion chưa hỗ trợ; session/hidden-state authority giữ ở server.
- **TECHNICAL CONTRACT:** invariant cần để server transition an toàn; không trình bày như rulebook.
- **PROPOSED:** cần owner/PM duyệt trước implementation.
- **UNKNOWN / GATE:** thiếu dữ liệu hoặc ruling; không tự chọn.

## Authoritative state dự kiến

```text
RoomSetupState
  schemaVersion, contentVersion, mode, revision, phase
  players[]: playerId, nickname, joinIndex, sessionTokenHash
  leaderPool[], leaderSelections{playerId -> leaderId}, selectionOrder[]
  turnOrder[], currentPlayerIndex, turnNumber, turnId, actionPoints
  paidHeroEffectAttempts{turnId -> heroInstanceId[]}
  mainDeck[], monsterDeck[], faceUpMonsters[], discard[]
  hands{playerId -> cardId[]}, parties{playerId -> leaderId + hero/item refs}
  pendingAction?, reaction?, idempotencyReceipts[]
```

Phases: `LOBBY → LEADER_SELECTION → SETUP_COMMITTING → TURN_ACTIVE`. `SETUP_COMMITTING` là transition nguyên tử: kiểm gate, shuffle server-side, deal 5/người, lật 3 Monster, ghi turn order/current player/AP rồi mới trả snapshot. Lỗi không được để room ở setup nửa chừng.

**OWNER DECISION:** cùng một `leaderId` không thể thuộc hai player. **PROPOSED:** chọn Leader tuần tự theo `joinIndex`; người hoàn tất lựa chọn cuối đi trước, các lượt sau theo `turnOrder`. Đây là thuật toán số hóa đề xuất, không phải thuật toán bắt buộc từ rulebook. **UNKNOWN:** owner chưa duyệt selection ordering/tie-break. Nếu dùng free-for-all thay thế, Room DO chỉ có thể nhận first-valid theo server order và phải persist acceptance order; không dùng timestamp client.

## Commands và transition

Mọi command dùng Bearer identity, `commandId`, `expectedRevision` (trừ reaction theo contract hiện có), payload không nhận `playerId`, deck order, dice hoặc AP result từ client.

| Command | Phase / cost | Contract |
|---|---|---|
| `BEGIN_LEADER_SELECTION` | Lobby, host | Khóa join/config; tạo selection order từ player hiện tại. |
| `SELECT_PARTY_LEADER` | Leader selection | Active selector chọn một ID còn trống; duplicate reject, không đổi state. |
| `START_GAME` | Setup ready, host | Chỉ chạy khi 2–6 player, mọi Leader hợp lệ và content gate đạt. Setup/deal/turn start ghi atomically. |
| `DRAW_CARD` | Active turn, 1 AP | Validate turn/AP/deck, rồi deduct AP + move top card vào own hand cùng transaction. |
| `PLAY_CARD` | Active turn, 1 AP | Validate ownership/target; deduct AP, tạo `pendingAction`, rồi dùng Challenge flow. Challenge thắng vẫn không hoàn AP. Effect cụ thể chờ verified card data. |
| `ROLL_HERO_EFFECT` | Active turn, 1 AP | Mỗi `heroInstanceId` tối đa một paid attempt trong `turnId`, kể cả roll thất bại. Validate ledger trước; khi hợp lệ, atomically deduct 1 AP + mark attempted + server roll. Lần hai reject, không trừ AP/RNG. |
| `ATTACK_MONSTER` | Active turn, 2 AP | Chỉ enable khi Monster requirement/outcome data đạt gate; server roll. |
| `REDRAW_HAND` | Active turn, 3 AP | Atomically discard toàn hand nếu có rồi draw 5; cần deck manifest/reshuffle contract sẵn sàng. |
| `END_TURN` | Active turn | Bỏ AP còn lại, advance clockwise, increment turn và cấp 3 AP cho player kế. |

`START_TURN`/resolution là server event nội bộ, không phải client authority. Action “immediately” có cost 0 theo verified rule, nhưng command/effect cụ thể vẫn bị khóa tới khi effect data được xác minh.

**VERIFIED RULE:** paid Hero-effect attempt tối đa một lần cho mỗi Hero trong một lượt, kể cả attempt thất bại. Ledger dùng immutable `heroInstanceId`, không chỉ `cardId`, và key theo persisted `turnId`. `START_TURN` tạo `turnId` mới với ledger rỗng cho active player; retry, reconnect hoặc reload trong cùng lượt phải đọc lại cùng ledger và không reset. Ledger cũ có thể prune sau khi turn transition đã persist, nhưng không được clear bởi request/session lifecycle.

**UNKNOWN:** optional immediate roll sau khi Hero được chơi thành công có tính vào giới hạn paid attempt của Hero đó trong cùng lượt hay không. Contract giữ `attemptOrigin: immediate | paid` tách biệt và chưa suy quan hệ giữa hai loại; implementation phải gate case kết hợp cho tới khi có ruling, thay vì tự cho phép hoặc tự consume paid attempt.

## Invalid-action atomicity và idempotency

**TECHNICAL CONTRACT:** thứ tự xử lý là authenticate → idempotency lookup → phase/revision/turn/ownership/target/AP/content validation → RNG/transition → persist → response. Invalid command:

- không trừ AP, move card, đổi deck/turn hoặc mở reaction;
- với paid Hero-effect attempt thứ hai trong cùng `turnId`, không mark ledger lại và không gọi RNG;
- không tăng gameplay revision;
- có thể persist idempotent rejection receipt để retry trả đúng outcome cũ;
- cùng `(roomId, playerId, commandId)` + cùng canonical fingerprint trả receipt cũ; payload khác trả `IDEMPOTENCY_CONFLICT`;
- mọi successful transition ghi gameplay state, private zones và receipt trong một DO storage transaction trước response.

`PLAY_CARD` được accept mới deduct AP và đưa card vào `pendingAction`; Challenge/resolve tiếp tục từ pending state. Cách này bảo toàn rule “Challenge thất bại không hoàn AP” mà không trừ AP cho action invalid.

## Personalized projection

Public snapshot: phase/revision/server time, player/nickname/join order, selected public Leader IDs, turn order/current player, AP của lượt hiện tại, hand counts, face-up Monsters, discard count, pending/reaction/deadline/result công khai.

Private cho session: own hand IDs và own pending choice. Không bao giờ trả token/hash, other hands, main/Monster deck order, server RNG material hoặc idempotency records. Leader ability text không xuất hiện như verified effect khi readiness còn `secondary_discovery`. Snapshot reload không tạo player/seat mới và tiếp tục dùng route/session envelope của `REACTION_API.md`.

## Content readiness gate

PS-02 hiện chỉ cho phép chuẩn bị schema/prototype:

1. Có 6 Leader IDs trong index; duplicate bị cấm. Identity/ability source và edition alignment chưa đủ để gọi publisher-verified. Ability summaries là `secondary_discovery`, **không execute** trong base runtime.
2. Quantity 115 standard cards, hand 5, 15 Monster và 3 face-up đã verified; **complete edition-aligned card-ID multiset/deck composition chưa verified**. Count không thay thế manifest.
3. `START_GAME` ở `mode=base` bị gate cho tới khi có versioned main-deck + Monster manifests, copy counts, edition ID và content validation pass. Không gọi base setup hoàn chỉnh trước gate này.
4. Expansion luôn `EXPANSION_UNSUPPORTED`; count expansion không unlock 8.

## Fixture migration plan

**PROPOSED:** nâng persisted schema và thêm `mode: reaction_demo | setup_demo | base` cùng `contentVersion`.

- Room VS hiện có `fixture.*` giữ `reaction_demo`; không tự đổi fixture hand/discard thành base IDs.
- `setup_demo` dùng namespace `fixture.setup.*`, nhãn synthetic rõ, chỉ kiểm state/turn/AP contract; không mô phỏng ability/effect base.
- Room cũ được đọc/migrate metadata idempotently hoặc yêu cầu tạo room mới; không silent replace deck/card IDs.
- Chỉ tạo room `base` mới sau readiness gate; persist edition/set IDs và manifest checksum. Migration về sau không sửa nghĩa của room đang chạy.

## Acceptance và blocker

QA sau implementation cần kiểm: duplicate Leader; unauthorized/out-of-turn/stale/insufficient-AP không đổi gameplay state; retry/conflict; setup commit không nửa chừng; hand/deck privacy; 3 AP/cost/end-turn/no carry; paid attempt lần hai không trừ AP/RNG; failed roll vẫn khóa Hero instance tới turn kế; reload/retry không reset ledger; turn mới reset đúng scope; fixture mode không bị trình bày như base.

Blocker cần quyết định: Leader selection ordering/tie-break và quan hệ immediate Hero roll với paid-attempt limit. Blocker dữ liệu: edition alignment, complete main/Monster ID manifests và verified abilities/effects. Các blocker này không ngăn schema/fixture setup demo, nhưng ngăn `mode=base` và tuyên bố base game complete.

## Handoff

- File: `docs/architecture/SETUP_CONTRACT_PLAN.md`; documentation-only, không sửa code/test.
- Check: đối chiếu `SETUP_VERIFIED.md`, `SETUP_DATA_READINESS.md`, `REACTION_API.md`; rà nhãn VERIFIED/OWNER/TECHNICAL/PROPOSED/UNKNOWN và gate base.
- Blocker: owner chọn Leader ordering/tie-break và ruling immediate-vs-paid Hero attempt; Content cung cấp edition-aligned deck/Monster manifests và nâng trạng thái ability/effect khi có nguồn.
- Bước kế: QA lập acceptance từ command/invariant; Architecture chỉ implement `setup_demo` sau khi PM/owner duyệt đề xuất và xác định gate đầu vào.
