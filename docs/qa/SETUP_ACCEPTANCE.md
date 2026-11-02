# PS-04 — Setup / turn / AP acceptance

Ngày: 2026-10-29 (Asia/Saigon)  
Owner: QA  
Phạm vi ghi: `docs/qa/**`; PREP-SETUP documentation-only  
Input: `docs/rules/SETUP_VERIFIED.md`, `docs/content/SETUP_DATA_READINESS.md`, `docs/architecture/SETUP_CONTRACT_PLAN.md`  
Output: acceptance matrix và review consistency; không sửa runtime, source, tracker hoặc MOD-SELECT

## Trạng thái và cách đọc

- **REVIEWED:** chỉ đối chiếu tài liệu trong ticket này; không phải runtime test.
- **PLANNED:** acceptance phải chạy sau khi có implementation/fixture tương ứng.
- **BLOCKED:** cần owner/PM duyệt product proposal hoặc content gate; không được báo runtime FAIL.
- **UNKNOWN:** nguồn chưa chốt ruling; test phải giữ riêng, không tự đặt expected gameplay.
- **PRIOR BASELINE:** kết quả VS trước đây chỉ chứng minh session/reaction envelope trên checkout lúc chạy; không chứng minh setup/AP.

Ticket này không chạy lại typecheck/build/unit/integration cũ vì chỉ tạo tài liệu. Hiện chưa có setup runtime để báo PASS/FAIL cho các case PLANNED.

## Consistency review

Ba input nhất quán ở các điểm chính:

- base cho 2–6 người; expansion không được dùng để mở 7–8;
- sáu Leader ID tồn tại nhưng identity/ability vẫn `secondary_discovery`; duplicate Leader bị cấm;
- 115 standard-card copies, deal 5/người; 15 Monster, 3 face-up và 12 face-down là quantity/rule/derived count tương ứng;
- 74 main card IDs/115 copies và 15 Monster IDs chỉ đủ inventory arithmetic, chưa phải edition-aligned authoritative manifest;
- `START_GAME mode=base` phải bị content gate chặn; `fixture.*` không được đổi nhãn thành base;
- 3 AP/lượt và costs 1/1/1/2/3/0 khớp giữa Rules và Architecture.

### QA-DOC-01 — CLOSED / contract verified, chưa phải runtime PASS

Architecture đã bổ sung persisted `paidHeroEffectAttempts{turnId -> heroInstanceId[]}`. Paid attempt hợp lệ atomically deduct 1 AP, mark immutable Hero instance và server-roll; failed roll vẫn giữ mark. Attempt thứ hai không trừ AP/không gọi RNG; exact retry dùng receipt cũ; reconnect/reload trong cùng `turnId` không reset; `START_TURN` tạo `turnId` mới với ledger rỗng. Contract đủ để thực thi và quan sát `AP-06`; runtime acceptance vẫn PLANNED tới khi có implementation.

### Không coi là defect

- Leader selection ordering/tie-break là **BLOCKED product proposal**. Sequential `joinIndex` hay free-for-all first-valid đều chưa được owner duyệt; QA không chọn phương án.
- Immediate roll khi vừa chơi Hero có tính vào giới hạn paid attempt của chính lượt đó hay không là **UNKNOWN interaction**. Chỉ xác nhận immediate roll cost 0 và paid attempt cost 1; không gộp hai rule.
- Thiếu bài khi setup/draw/redraw sau khi áp dụng nguồn hiện có là **UNKNOWN** ở các nhánh không đủ tổng card. Không tự partial-deal hoặc invent loss/end condition.

## Acceptance matrix — setup và readiness

| ID | Scenario / input | Expected authoritative result | Status / gate |
|---|---|---|---|
| `SET-01` | Host bắt đầu selection với đúng 2 player, base | Cho vào `LEADER_SELECTION` khi room/config hợp lệ; khóa join/config theo contract. | PLANNED |
| `SET-02` | Host bắt đầu selection với đúng 6 player, base | Cho phép; không suy expansion. | PLANNED |
| `SET-03` | 0–1 hoặc 7–8 player ở base | Reject; phase/revision/gameplay state không đổi. | PLANNED |
| `SET-04` | Expansion chưa hỗ trợ được gửi trong config/start | `EXPANSION_UNSUPPORTED`; không mở cap 8. | PLANNED |
| `SET-05` | Hai player chọn cùng `leaderId` | Tối đa một selection được persist; request duplicate reject và không đổi state. Không assert client timestamp thắng. | PLANNED; winner ordering phụ thuộc contract đã duyệt |
| `SET-06` | Chọn Leader ID ngoài pool/version | Reject; không ghi selection hoặc consume turn chọn. | PLANNED |
| `SET-07` | `START_GAME` khi thiếu selection, duplicate, sai phase hoặc non-host | Reject nguyên tử; không shuffle/deal/lật Monster/cấp AP. | PLANNED |
| `SET-08` | `START_GAME mode=base` khi manifest/edition/content validation chưa đạt | Bị gate; không trình bày room như base game hoàn chỉnh. | PLANNED; hiện BLOCKED bởi readiness |
| `SET-09` | Setup commit hợp lệ sau khi gate đạt | Một transaction tạo deck order server-side, deal 5/người, lật 3 Monster, xác lập turn/current player và 3 AP. Không có snapshot setup nửa chừng. | PLANNED |
| `SET-10` | 2 player, manifest 115 copies | Hands tổng 10; main deck còn 105; không duplicate/mất card ngoài manifest. | PLANNED sau authoritative manifest |
| `SET-11` | 6 player, manifest 115 copies | Hands tổng 30; main deck còn 85. | PLANNED sau authoritative manifest |
| `SET-12` | Monster manifest 15 | 3 unique face-up; face-down Monster deck còn 12. | PLANNED sau authoritative manifest |
| `SET-13` | RNG/storage failure giữa setup commit | Rollback toàn transition hoặc retry trả cùng committed outcome; không partial hands/decks/phase. | PLANNED, fault injection |
| `SET-14` | Chọn thứ tự Leader và xác định người đi trước | Phải theo thuật toán owner duyệt; người hoàn tất chọn cuối đi trước theo verified rule. | BLOCKED: ordering/tie-break chưa duyệt |

## Acceptance matrix — turn và Action Points

| ID | Scenario / input | Expected authoritative result | Status / gate |
|---|---|---|---|
| `AP-01` | Bắt đầu lượt hợp lệ | Active player có đúng 3 AP; player khác không có quyền action. | PLANNED |
| `AP-02` | `DRAW_CARD`, đủ AP/deck | Trừ 1 AP và move đúng top card vào own hand trong cùng transaction. | PLANNED |
| `AP-03` | `PLAY_CARD` Hero/Item/Magic hợp lệ | Trừ 1 AP, move card khỏi hand và tạo pending/reaction theo loại; invalid card/target không trừ AP. | PLANNED; effect cụ thể gated |
| `AP-04` | Optional immediate Hero roll sau play thành công | Cost 0; chỉ mở từ pending action hợp lệ, server roll. | PLANNED; effect data gated |
| `AP-05` | Paid Hero-effect attempt của Hero đã ở Party | Trừ 1 AP và server roll khi Hero/turn hợp lệ. | PLANNED; effect data gated |
| `AP-06` | Retry cùng paid attempt hoặc attempt thứ hai cùng Hero trong cùng lượt | Exact retry trả receipt cũ, không roll/trừ AP lần nữa; command mới cho paid attempt thứ hai reject, không mark/RNG/AP lần nữa, kể cả attempt đầu fail. Reload giữ cùng ledger; turn mới dùng ledger rỗng. | PLANNED; contract REVIEWED |
| `AP-07` | Immediate roll rồi paid attempt cùng Hero trong lượt play | Không đặt expected allow/reject cho tới khi ruling được chốt. | UNKNOWN interaction |
| `AP-08` | `ATTACK_MONSTER`, đủ 2 AP và data gate đạt | Trừ 2 AP atomically; server roll. Requirement/outcome cụ thể không thuộc ticket. | PLANNED sau Monster/effect gate |
| `AP-09` | `REDRAW_HAND`, đủ 3 AP | Atomically discard toàn hand nếu có rồi draw 5; hand rỗng vẫn hợp lệ theo rule. | PLANNED; depletion branch gated |
| `AP-10` | Effect yêu cầu action “immediately” | Action được thực hiện với cost 0; ordering/effect cụ thể không được suy. | PLANNED sau effect contract |
| `AP-11` | Lặp cùng action khi còn AP | Cho phép nếu từng action độc lập hợp lệ; AP không âm. | PLANNED |
| `AP-12` | Không đủ AP / out-of-turn / stale revision / invalid target | Reject; AP, hand, deck, party, pending/reaction, turn và gameplay revision không đổi. | PLANNED |
| `AP-13` | `END_TURN` khi còn AP | Bỏ AP còn lại, advance clockwise, tăng turn và cấp 3 AP cho player kế; AP không carry. | PLANNED |
| `AP-14` | Client gửi AP result, dice, deck order hoặc `playerId` | Bỏ qua/reject client authority; server/session quyết định actor, RNG và transition. | PLANNED |

## Acceptance matrix — auth, privacy, reload, idempotency và atomicity

| ID | Scenario / input | Expected authoritative result | Status |
|---|---|---|---|
| `SEC-01` | Thiếu/sai Bearer token | Reject trước gameplay mutation; không tiết lộ room private state. | PLANNED |
| `SEC-02` | Payload spoof `playerId` hoặc action cho player khác | Actor lấy từ session; spoof không đổi ownership/turn. | PLANNED |
| `SEC-03` | Snapshot của hai sessions | Mỗi session chỉ thấy own hand/own pending choice; chỉ thấy hand counts của người khác. | PLANNED |
| `SEC-04` | Snapshot/public response | Không có token/hash, other hands, main/Monster deck order, RNG material hoặc idempotency records. | PLANNED |
| `SEC-05` | Reload bằng session hợp lệ | Giữ đúng seat, Leader, own hand, phase/turn/AP; không tạo player mới. | PLANNED; PRIOR BASELINE chỉ cover reaction room |
| `IDEM-01` | Cùng command ID + fingerprint | Trả outcome/receipt cũ; không RNG, cost hoặc mutation lần hai. | PLANNED |
| `IDEM-02` | Cùng command ID + payload khác | `IDEMPOTENCY_CONFLICT`; state/revision không đổi. | PLANNED |
| `ATOM-01` | Invalid command ở bất kỳ validation gate | Không trừ AP, move card, đổi deck/turn hoặc mở reaction; không tăng gameplay revision. | PLANNED |
| `ATOM-02` | Persist/response retry sau successful action | Gameplay state, private zones và receipt đã commit cùng transaction; retry quan sát một outcome. | PLANNED, fault injection |

## Acceptance matrix — depletion, fixture migration và content gate

| ID | Scenario / input | Expected authoritative result | Status / gate |
|---|---|---|---|
| `DEP-01` | Main deck hết nhưng discard có card | Reshuffle discard theo owner decision tại `docs/decisions/product-decisions.md:32` và `BASE_SPEC.md` `RULE-25`; server RNG, không lộ order. Contract cần chỉ rõ transaction trước implementation. | PLANNED; architecture detail pending |
| `DEP-02` | Tổng main deck + discard không đủ cho setup deal hoặc redraw 5 | Không tự đặt partial-draw/end-game outcome; nếu command được hỗ trợ, failure phải atomic. | UNKNOWN ruling |
| `DEP-03` | Draw 1 khi mọi nguồn đều rỗng | Không tự invent result; state không được corrupt hoặc AP âm trong mọi implementation. | UNKNOWN ruling |
| `FIX-01` | Room VS cũ `reaction_demo` | Giữ `fixture.*`; migration metadata idempotent hoặc yêu cầu room mới, không silent replace bằng base IDs. | PLANNED |
| `FIX-02` | Tạo `setup_demo` | Chỉ dùng `fixture.setup.*`, nhãn synthetic rõ; được test state/turn/AP nhưng không execute ability/effect base. | PLANNED sau PM/owner duyệt proposal |
| `FIX-03` | Tạo room `base` trước readiness gate | Reject/không expose như supported. | PLANNED |
| `READY-01` | Main inventory 74 IDs / 115 copies, tất cả secondary | Arithmetic có thể validate; không dùng làm authoritative deck manifest. | REVIEWED |
| `READY-02` | 15 Monster IDs và 6 Leader IDs, secondary identity/ability | Count/uniqueness có thể validate; Monster deck/Leader abilities không execute như verified content. | REVIEWED |
| `READY-03` | Edition-aligned manifests + checksums + validation pass về sau | Room base mới persist edition/set/contentVersion/checksum; room cũ không đổi nghĩa. | PLANNED |
| `READY-04` | Expansion IDs/counts xuất hiện | Không tự unlock 7–8 hoặc hiển thị expansion supported. | PLANNED |

## Test đã chạy và test planned

### Đã chạy trong PS-04

- REVIEWED ba input và đối chiếu số lượng/cost/gate/nhãn authority.
- Xác nhận bằng đọc tài liệu: 74 main IDs ánh xạ 115 copies; 15 Monster; 6 Leader; chưa authoritative theo edition.
- Targeted delta review đã đóng `QA-DOC-01` ở mức contract; không chạy code, browser, typecheck, build hoặc test suite.

### Prior evidence, không nâng thành setup PASS

- VS reaction đã có auth/session/privacy/reload/idempotency/atomicity coverage ở layer riêng theo `REACTION_SLICE_REPORT.md`.
- Evidence đó chỉ là baseline envelope; chưa có `RoomSetupState`, Leader selection, deal, AP hoặc depletion runtime.

### Planned execution order

1. Contract review: owner chốt Leader ordering/tie-break; Architecture đóng depletion transaction. Paid-attempt ledger contract đã REVIEWED.
2. Schema/fixture gate: chạy `SET-*`, `SEC-*`, `IDEM-*`, `ATOM-*`, `FIX-*` trên `setup_demo` synthetic.
3. Turn/AP gate: chỉ chạy Hero/Monster/effect cases khi corresponding data/contract đạt readiness; giữ unknown cases excluded với lý do.
4. Base gate: chỉ chạy exact 115/15 manifest assertions sau edition-aligned manifests pass validation.

## Handoff

- File: `docs/qa/SETUP_ACCEPTANCE.md`.
- Checks: docs-only consistency review; không chạy lại code checks cũ.
- Blocker: Leader ordering/tie-break chưa duyệt; edition-aligned main/Monster manifests và abilities/effects chưa authoritative; immediate-roll/paid-attempt interaction và insufficient-card outcomes vẫn UNKNOWN.
- Closed finding: `QA-DOC-01` — persisted per-turn/per-Hero paid-attempt ledger/reset invariant đã đủ ở contract; chưa claim runtime PASS.
- Bước kế: PM/owner xét proposal ordering; Architecture chỉ mở `setup_demo` sau approval. QA chạy `AP-06` khi có implementation/test hook phù hợp.
