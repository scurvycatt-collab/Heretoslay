# RULES-001 — Turn loop + win condition spec (engine-ready)

Ngày lập: 2026-11-02. Owner: `rules`. Đầu vào cho `GAME-002` (full base turn loop) và `GAME-003` (win condition). Phạm vi: base game 2–6 người. Không code, không card effect cụ thể ngoài phần đã có trong `PLAY_CARD_RULE_SLICE.md`.

Spec này **build trên** `BASE_SPEC.md` (`RULE-01`..`RULE-27`), `SETUP_VERIFIED.md` (`TURN-*`, `AP-*`), `BASE_RULE_GATES.md` (`RG-HERO-*`, `RG-DEPL-*`), `PLAY_CARD_RULE_SLICE.md` (`PC-*`) và `product-decisions.md`. Không lặp lại chứng minh đã có; chỉ tham chiếu ID.

## 0. Nhãn trạng thái và nguồn

| Nhãn | Ý nghĩa |
|---|---|
| `VERIFIED-RB` | Có trong rulebook retail Asmodee (`RB-P1`/`RB-P2`, xem `BASE_SPEC.md`) qua rule ID đã xác minh trước đó. |
| `VERIFIED-PD` | Product/PM policy đã chốt trong `product-decisions.md` / `AGENTS.md`. Không phải luật gốc. |
| `DERIVED` | Suy trực tiếp từ hai câu nguồn đã VERIFIED, không thêm giả định (ghi rõ chuỗi suy luận). |
| `UNVERIFIED` | Không có trong nguồn đã cite. Có **proposed default** để Architecture dựng skeleton, nhưng phải được owner/PM chốt (mục 7). Không trình bày như luật gốc. |

Nguồn bổ sung trong ticket này:

| Source ID | Nguồn | Authority |
|---|---|---|
| `RB-P1`, `RB-P2` | [Asmodee retail rulebook PDF](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf) | Primary. **Lưu ý:** ngày 2026-11-02 session này **không truy cập được** PDF (egress proxy chặn `cdn.svc.asmodee.net`); mọi trích `RB-*` dựa trên rule ID đã được các ticket trước xác minh, không đọc lại. |
| `KS-RB` | [HTS_Rules_for-KS-1_v1.pdf](https://cdn.shopify.com/s/files/1/2003/4581/files/HTS_Rules_for-KS-1_v1.pdf) (Shopify CDN, truy cập 2026-11-02 qua WebFetch tóm tắt) | **Corroboration only.** Bản rule Kickstarter v1, không phải retail; chủ sở hữu store Shopify chưa xác lập là publisher. Kết quả WebFetch là tóm tắt bằng model, có ít nhất một chỗ tóm tắt sai rõ ràng (gán giới hạn 2 người cho mọi Leader), nên **không** dùng để nâng bất kỳ mục nào lên VERIFIED; chỉ dùng để chỉ ra điểm cần đối chiếu lại PDF retail. |

Search bounded 2026-11-02 (publisher/distributor + community discovery) không tìm thấy FAQ chính thức về Monster deck rỗng hoặc win đồng thời.

## 1. Action table của một lượt

Quy ước chung (áp dụng mọi dòng):

- `G-01` `VERIFIED-RB` (`RULE-04`, `TURN-01..03`): đầu lượt `ap = 3`; action theo thứ tự tùy ý, lặp được khi đủ AP; AP thừa mất khi hết lượt.
- `G-02` `VERIFIED-PD` (`PC-COM-02`, PLAY_CARD_API): validation atomic — command không hợp lệ bị reject, **không** trừ AP, không di chuyển card, không mở window. Chỉ actor đúng lượt, `phase = turn_active`, không có `pendingPlay`/reaction chưa đóng mới được gửi turn command.
- `G-03` `VERIFIED-PD` (PLAY_CARD_API “last AP”): AP về 0 **không** advance ngay khi còn chain (pending/reaction/choice); hoàn tất chain rồi mới chạy `END_TURN` tự động đúng một lần.
- `G-04` `VERIFIED-RB` (`AP-06`): action mà card yêu cầu làm “immediately” không tốn AP và không phải turn command; engine thực hiện nó trong resolution của card.
- `G-05` `VERIFIED-RB`/`VERIFIED-PD` (`RULE-10`, `RULE-12`): **Challenge window** chỉ mở khi actor *attempt* chơi Hero, Item hoặc Magic từ hand. Không mở cho DRAW, roll Hero effect, ATTACK, redraw, Modifier, Challenge.
- `G-06` `VERIFIED-RB`/`VERIFIED-PD` (`RULE-13..17`): **Modifier window** mở sau **mọi** dice roll 2d6 (Challenge roll đôi, Hero effect roll, Monster attack roll). Mọi player tham gia, mỗi người 1 Modifier hoặc Skip, all-completed đóng sớm, deadline 20s không reset.

| ID | Action (command gợi ý) | AP | Preconditions (ngoài `G-02`) | State transitions | Challenge win.? | Modifier win.? | Nguồn / nhãn |
|---|---|---:|---|---|---|---|---|
| `TL-DRAW` | DRAW (`DRAW_CARD`) | 1 | `ap ≥ 1` | `ap -= 1`; `DRAW 1` theo policy depletion (`DECK-01`). Nếu deck+discard rỗng: rút 0, action vẫn resolve, AP vẫn trừ. | Không | Không | `AP-01`, `RG-DEPL-01..04` — VERIFIED-RB + VERIFIED-PD. AP vẫn trừ khi rút 0: `DERIVED` từ “policy không đổi AP cost” (`BASE_RULE_GATES.md`). |
| `TL-PLAY-HERO` | PLAY Hero (`PLAY_CARD`) | 1 | `ap ≥ 1`; card là Hero trong hand actor | `ap -= 1`; hand→`pending`; mở Challenge. Challenge thắng → pending→discard, AP không hoàn (`PC-CH-02`). Không bị Challenge/Challenge thua → pending→Party; actor chọn **optional immediate roll** hoặc Skip (`RULE-06`). Immediate roll tiêu thụ allowance của Hero đó trong lượt (`RG-HERO-01..03`). | **Có** | Có, nếu Challenge xảy ra (sau 2 roll) và nếu immediate roll | `RULE-05/06/10/11`, `PC-DD-01..03` |
| `TL-PLAY-ITEM` | PLAY Item/Cursed Item (`PLAY_CARD` + `targetHeroInstanceId`) | 1 | `ap ≥ 1`; card là Item/Cursed Item trong hand; target là Hero (không phải Leader) **chưa có Item**; Item thường → Hero trong Party actor; Cursed Item → Hero bất kỳ Party (xem `Q-06`) | `ap -= 1`; hand→pending; khóa target; mở Challenge. Thắng Challenge → discard. Ngược lại revalidate target (`Q-07`) rồi pending→gắn vào Hero target (Item đi cùng Hero khi Hero đổi zone, `RULE-08`). | **Có** | Chỉ trong Challenge | `RULE-08/10`; target lock lúc play = `UNVERIFIED` (`Q-07`) |
| `TL-PLAY-MAGIC` | PLAY Magic (`PLAY_CARD`) | 1 | `ap ≥ 1`; Magic trong hand | `ap -= 1`; hand→pending; Challenge. Thắng → discard, không effect. Ngược lại resolve effect theo card data rồi pending→discard. | **Có** | Chỉ trong Challenge (và nếu effect có roll) | `RULE-09/10`, `PC-CB-*` |
| `TL-ROLL` | Roll Hero effect (`ROLL_HERO_EFFECT`) | 1 | `ap ≥ 1`; Hero ở **Party actor**; allowance `(turnId, heroInstanceId)` chưa dùng; target hợp lệ nếu effect cần | `ap -= 1`; tiêu thụ allowance **trước** dice; khóa target (`Q-08`); server roll 2d6; Modifier window; `final ≥ heroRollThreshold` → resolve effect; ngược lại không gì xảy ra, AP không hoàn. | **Không** | **Có** | `RULE-07`, `RG-HERO-04`, `RULE-10` (không Challenge roll); threshold `≥`: `VERIFIED-RB` (`RULE-07` “roll requirement”; KS-RB corroborate “equal to or higher”) |
| `TL-ATTACK` | ATTACK Monster (`ATTACK_MONSTER` + `monsterInstanceId`) | 2 | `ap ≥ 2`; Monster **face-up** ở khu giữa; Party actor thỏa requirement (mục 2) tại thời điểm command | `ap -= 2`; server roll 2d6; Modifier window; tính `final`; phân loại SLAY / PENALTY / NONE (mục 2). SLAY → Monster→Party actor, lật Monster mới (`DECK-03`), check `WIN-SLAY` **ngay**. PENALTY → resolve penalty effect. Mọi outcome không hoàn AP. | **Không** | **Có** | `RULE-18/19/20/24`, `AP-04` |
| `TL-REDRAW` | Discard hand + draw 5 (`REDRAW_HAND`) | 3 | `ap = 3` (tương đương `ap ≥ 3`) ; hand có thể rỗng | `ap -= 3`; toàn bộ hand→discard; `DRAW 5` theo policy depletion (discard vừa bỏ thuộc nguồn reshuffle). | Không | Không | `AP-05`, `RG-DEPL-05` |
| `TL-LEADER` | Leader skill có cost AP (vd. The Shadow Claw) | theo card | Chỉ Leader có wording “spend an action point”; base: The Shadow Claw 1 AP, 1 lần/lượt, cấm trong game 2 người | Card-specific; ngoài GAME-002 core. Engine cần hook `LEADER_ACTION`. | Không (không phải play Hero/Item/Magic) | Không (không roll) | `BASE_LEADER_ARTIFACT_CHECK.md` (secondary), 2-player ban: RB qua `BASE_SOURCE_EVIDENCE.md`. Wording chính xác: `UNVERIFIED` text |
| `TL-END` | END_TURN (`END_TURN`) | 0 | Actor, `turn_active`, không chain pending | Forfeit AP; check `WIN-CLASS` cho **actor** (mục 3) **trước** khi advance; nếu không thắng → next player theo thứ tự (`TL-ORDER`), `ap = 3`, `turnId` mới, allowance Hero reset. | Không | Không | `TURN-03`, EF-FOLLOWUP-001-PM; vị trí check win: `VERIFIED-RB` (`RULE-23` “kết thúc lượt”) |
| `TL-AUTO-END` | Auto end khi `ap = 0` | — | `ap = 0` và chain đã đóng | Giống `TL-END` (cùng check `WIN-CLASS`). | — | — | `TURN-03`, `G-03` |
| `TL-ORDER` | Thứ tự lượt | — | — | Người chọn Leader cuối đi trước, sau đó theo chiều kim đồng hồ = persisted join order quay vòng. | — | — | `RULE-03`, `SETUP-05` (RB) + SETUP-LOCAL PM decision (mapping “clockwise” → join order) |

Không phải turn action (không được nhận như command 1 AP): chơi Modifier hoặc Challenge từ hand ngoài window (`VERIFIED-RB`, `RULE-10/13`: chúng chỉ là reaction, không tốn AP).

### 1.1 Thứ tự sub-state cho PLAY Hero (chuẩn cho engine)

```
turn_active
 └─ PLAY_CARD(hero) accepted: ap-1, hand→pending
    └─ challenge_window (all players, first-valid-wins, 20s)
       ├─ no challenge → hero pending→party
       └─ challenge accepted → server rolls both → modifier_window → compare (tie → challenger)
            ├─ challenger wins → pending→discard (END of attempt)
            └─ actor wins → pending→party
    └─ immediate_roll_choice (actor: ROLL | SKIP; timeout = SKIP per PC-CONTRACT-001-PM)
       └─ ROLL → allowance consumed → dice → modifier_window → effect if final ≥ threshold
 └─ back to turn_active (or auto END_TURN if ap = 0)
```

## 2. Monster attack

### 2.1 Requirement check — semantics

| ID | Rule | Nhãn |
|---|---|---|
| `MON-01` | Chỉ ATTACK Monster face-up; Party actor phải đáp ứng **Party requirement** in trên Monster. | `VERIFIED-RB` (`RULE-18`) |
| `MON-02` | Requirement “N Hero”: đếm **Hero card trong Party actor**. Party Leader không phải Hero và **không** tính vào số Hero. Slain Monster cũng không phải Hero. Card đang ở `pending` không tính. | Leader: `VERIFIED-RB` (`RULE-18/21`). Monster/pending không tính: `DERIVED` (chỉ Hero card được đếm). |
| `MON-03` | Requirement class (vd. 1 Wizard): cần Hero có class đó. Một card **không** thỏa hai slot requirement cùng lúc (Hero class X dùng cho slot class X thì không còn tính cho slot “any Hero”). | `VERIFIED-RB` (`RULE-18`); KS-RB corroborate ví dụ Wizard. |
| `MON-04` | Party Leader có tính cho **slot class** không (vd. Leader Wizard thỏa “1 Wizard”)? | **`UNVERIFIED`** → `Q-01`. Proposed default: **không** — mọi slot requirement là slot Hero; Leader không thỏa slot nào. |
| `MON-05` | Ký hiệu xám = Hero class bất kỳ (slot `any`). | `UNVERIFIED` (chỉ thấy trong KS-RB tóm tắt; cần đối chiếu PDF retail). Default: slot `any` = 1 Hero bất kỳ class. |
| `MON-06` | Thuật toán: với requirement là list slot `{kind: "class", class} | {kind: "any"}`, hợp lệ khi tồn tại phép gán injective Hero→slot. Khi mỗi Hero có đúng 1 class: gán slot class trước (theo class), rồi `heroesRemaining ≥ anySlots` — greedy là đủ. Nếu sau này Item (Mask) cho Hero thêm class (`DATA-H05`) thì phải dùng bipartite matching. | `DERIVED` từ `MON-03` |
| `MON-07` | Requirement chỉ kiểm tại lúc nhận command ATTACK; không kiểm lại sau roll/Modifier (Modifier không đổi Party). | `UNVERIFIED` (nguồn không nói thời điểm) → default như trên. |

### 2.2 Roll outcome

| ID | Rule | Nhãn |
|---|---|---|
| `MON-10` | Roll 2d6 bởi server; Modifier window (`G-06`); `final = d1 + d2 + Σmodifier + Σpassive` (passive: Leader như The Divine Arrow +1 khi attack, slain Monster skill nếu có). | 2d6 + Modifier: `VERIFIED-RB` (`RULE-13/19`; KS-RB “including Modifier cards”). Server roll: `VERIFIED-PD` (mở rộng D-07 server dice — `UNVERIFIED` cho non-Challenge roll, xem `Q-10`). Leader bonus: card data secondary. |
| `MON-11` | `final ≥ slayMin` → **SLAY**. `final ≤ penaltyMax` → **PENALTY**. Ngược lại → **NONE** (không gì xảy ra). Ranges in trên card dạng “N+” và “M-”, inclusive. | `VERIFIED-RB` (`RULE-19`); inclusive: KS-RB ví dụ 8+/5-/6–7 nothing. |
| `MON-12` | Mọi outcome: 2 AP không hoàn. | `VERIFIED-RB` |
| `MON-13` | SLAY: Monster face-up→Party actor (zone `slainMonsters`), cấp skill lâu dài; không thể steal/destroy/attack/return. Rồi lật Monster mới từ Monster deck vào khu giữa. | `VERIFIED-RB` (`RULE-19/22`) |
| `MON-14` | PENALTY: resolve `penaltyEffectId` của card. Nếu penalty là SACRIFICE Hero mà actor không có Hero hợp lệ → không có ảnh hưởng thêm. | `VERIFIED-RB` + `VERIFIED-PD` (`RULE-20`) |
| `MON-15` | Penalty khác không thực hiện được đầy đủ (vd. DISCARD 2 khi hand có 1). | `UNVERIFIED` → `Q-05`. Default: làm tối đa phần làm được, không lỗi. |
| `MON-16` | Không clamp `final` vào 2..12 (Modifier âm/dương có thể vượt). | `UNVERIFIED` → default no clamp. |
| `MON-17` | Monster bị attack nhưng NONE/PENALTY vẫn face-up ở giữa, có thể bị attack tiếp (cùng lượt nếu đủ AP, hoặc người khác). | `DERIVED` (rule không di chuyển Monster ngoài SLAY). |

### 2.3 Data fields per Monster card

| Field | Kiểu | Bắt buộc | Có trong `BASE_CARD_INDEX.csv`? |
|---|---|---|---|
| `card_id`, `canonical_name`, `kind=monster`, `quantity` | string/int | Có | **Có** (15 rows, secondary) |
| `requirement` | list slot `{kind:"any"} \| {kind:"class", class}` | Có | **Thiếu** |
| `slayMin` (N trong “N+”) | int | Có | **Thiếu** |
| `penaltyMax` (M trong “M-”) | int | Có | **Thiếu** |
| `penaltyEffectId` (+ params, vd. `SACRIFICE_HERO 1`, `DISCARD 2`) | enum/id | Có | **Thiếu** |
| `slainSkillEffectId` (passive sau SLAY, trigger + params) | enum/id | Có | **Thiếu** |
| `text_status` / rights | enum | Có | Có (`NOT_CAPTURED`, `UNVERIFIED`) |

Kết luận: CSV chỉ đủ identity/quantity; **không có bất kỳ field gameplay nào của Monster**. GAME-002 chỉ có thể dùng synthetic Monster fixtures cho tới khi Content capture 15 Monster.

## 3. Win conditions

| ID | Rule | Nhãn |
|---|---|---|
| `WIN-SLAY` | Thắng khi có **3 Monster đã SLAY** trong Party. | `VERIFIED-RB` (`RULE-23`) |
| `WIN-SLAY-T` | Check **ngay** sau transition đưa Monster thứ 3 vào Party, trong cùng transaction; game `GAME_OVER`, winner = người đó; không chờ END_TURN, không resolve tiếp AP/chain còn lại. Animation chỉ trình bày. | Monster→Party rồi conclude: `VERIFIED-PD` (`RULE-24`, QA-14). “Ngay, bỏ phần còn lại của lượt”: `DERIVED` từ rulebook không gắn điều kiện thời điểm cho slay-win (khác class-win “end your turn”) + RULE-24 “conclude game”. Xem `Q-03` cho chain còn mở. |
| `WIN-CLASS` | Thắng khi **kết thúc lượt của mình** với Party có **6 class khác nhau**, **tính cả class của Party Leader**. | `VERIFIED-RB` (`RULE-23`; KS-RB corroborate “End your turn with a complete Party … six different classes”). |
| `WIN-CLASS-SET` | Base có đúng 6 class: Bard, Fighter, Guardian, Ranger, Thief, Wizard ⇒ “6 class khác nhau” = đủ cả 6. Đếm theo **class distinct**; trùng class không cộng. Nguồn class: Leader class + class của mỗi Hero trong Party. Monster không có class. | 6 class names: Leader artifact check (6 Leader = 6 class) + KS-RB list; retail per-card `UNVERIFIED` nhưng tập 6 class nhất quán. |
| `WIN-CLASS-T` | Chỉ check cho **actor** tại `TL-END`/`TL-AUTO-END`, sau khi chain đóng, trước advance. Có 6 class giữa lượt nhưng mất trước khi kết thúc lượt → không thắng. Đạt 6 class trong lượt người khác → không thắng lúc đó; phải còn đủ tại cuối lượt kế của mình. | `DERIVED` từ wording “end your turn”. |
| `WIN-TIE` | Base không mô tả win đồng thời. Với `WIN-SLAY-T` immediate + `WIN-CLASS-T` chỉ cho actor, trong luật core chỉ có thể xảy ra một winner mỗi transition. Nếu card effect làm **người khác** slay Monster thứ 3 ngoài lượt, hoặc nhiều người cùng đạt trong một transition: default = **người đầu tiên đạt điều kiện theo thứ tự resolve** (`RULE-26`); nếu cùng một bước atomic: active player thắng, rồi theo thứ tự lượt. | **`UNVERIFIED`** → `Q-02`. |
| `WIN-END` | Sau `GAME_OVER`: reject mọi turn/reaction command; đóng window đang mở không resolve; state đóng băng. | `VERIFIED-PD` (QA-14: “không thể phát sinh action tiếp”); chi tiết đóng window `UNVERIFIED` (`Q-03`). |

Class có do Item (vd. `Bard Mask`) tính không? Xem `DATA-H05`/`Q-04` — card text NOT_CAPTURED.

## 4. Card data engine cần

### 4.1 Hero (48 rows trong CSV)

| ID | Field | Ghi chú | Có trong CSV? |
|---|---|---|---|
| `DATA-H01` | `card_id`, `name`, `kind=hero`, `quantity` | — | **Có** |
| `DATA-H02` | `class` ∈ {Bard, Fighter, Guardian, Ranger, Thief, Wizard} | Cần cho `MON-03`, `WIN-CLASS`. CSV xếp 48 Hero theo nhóm 8 (thứ tự trùng thứ tự class) nhưng **không được suy class từ thứ tự**. Chỉ Dodgy Dealer = Bard có scan secondary (`PLAY_CARD_SOURCE_SLICE.md`). | **Thiếu** |
| `DATA-H03` | `heroRollThreshold` (N trong “N+”) | So sánh `final ≥ N`. Chỉ Dodgy Dealer 9+ có scan. | **Thiếu** |
| `DATA-H04` | `effectId` + params + `targetSpec` (none/self/otherPlayer/heroInParty/…) + `choiceSpec` | Target lock trước roll (`Q-08`). | **Thiếu** |
| `DATA-H05` | `classOverrideFromItem` (từ Item, không phải Hero) | Engine cần `effectiveClasses(hero)` = class gốc ∪ class từ Item đang gắn. | — |

### 4.2 Item / Cursed Item (12 rows / 15 copies)

| ID | Field | Có trong CSV? |
|---|---|---|
| `DATA-I01` | `card_id`, `name`, `kind ∈ {item, cursed_item}`, `quantity` | **Có** (`kind` phân biệt Cursed) |
| `DATA-I02` | `equipTarget` ∈ {ownHero, anyHero} | **Thiếu** (default theo `Q-06`) |
| `DATA-I03` | `itemEffectId` + trigger (passive: roll bonus, class grant, protection, …) | **Thiếu** (text NOT_CAPTURED). Các Mask (`Bard/Fighter/Guardian/Ranger/Thief/Wizard Mask`) nhiều khả năng ảnh hưởng class → ảnh hưởng `WIN-CLASS` và `MON-03`; **UNVERIFIED** cho tới khi capture text. |

### 4.3 Magic (8 rows / 13 copies)

| ID | Field | Có trong CSV? |
|---|---|---|
| `DATA-M01` | `card_id`, `name`, `kind=magic`, `quantity` | **Có** |
| `DATA-M02` | `effectId` + `targetSpec` + `choiceSpec` (+ có roll không) | **Thiếu** (chỉ Critical Boost có scan secondary) |

### 4.4 Modifier / Challenge / Leader

| ID | Field | Có trong CSV? |
|---|---|---|
| `DATA-X01` | Modifier `options: int[]` (vd. `[+2,-2]`, `[+4]`) | **Có gián tiếp** qua `canonical_name` (“Modifier +2/-2”); cần field có cấu trúc thay vì parse tên. |
| `DATA-X02` | Challenge: không cần field ngoài identity (14 copies) | Có |
| `DATA-X03` | Leader `class`, `skillEffectId`, trigger, `bannedPlayerCounts` (Shadow Claw: 2) | **Thiếu trong CSV**; class + skill summary có ở `BASE_LEADER_ARTIFACT_CHECK.md` (secondary). |
| `DATA-X04` | `Rule Card` quantity | `UNKNOWN`; không vào main deck (`BASE_SOURCE_EVIDENCE.md`). |

## 5. Deck-out

| ID | Rule | Nhãn |
|---|---|---|
| `DECK-01` | Main deck hết → reshuffle discard thành main deck mới; `DRAW N` tuần tự, tiếp tục số còn thiếu, dừng partial khi cả deck và discard rỗng; không reject/rollback. | `VERIFIED-PD` (`RULE-25`, `RG-DEPL-01..06`, Owner depletion policy 2026-11-02). Publisher: UNKNOWN. |
| `DECK-02` | Reshuffle chỉ xảy ra khi cần rút và deck rỗng (lazy), không chủ động khi deck vừa về 0. Card ở `pending` (Magic đang resolve) không thuộc discard khi reshuffle. | Lazy: `VERIFIED-PD` (“mỗi khi main deck hết thì kiểm discard” trong lúc rút). Pending: `VERIFIED-PD` (PC-CB-04 policy). |
| `DECK-03` | Sau SLAY, lật 1 Monster từ Monster deck vào khu giữa để giữ 3 face-up. | `VERIFIED-RB` (`RULE-19`) |
| `DECK-04` | Monster deck rỗng khi cần lật sau SLAY. | **`UNVERIFIED`** → `Q-09`. Default: không lật; số Monster face-up giảm dần; không reshuffle slain Monster (chúng ở Party, không thể return — `RULE-22`). |
| `DECK-05` | Không còn Monster face-up nào. | **`UNVERIFIED`** → `Q-09`. Default: ATTACK không hợp lệ (precondition fail); game tiếp tục, chỉ còn `WIN-CLASS` (và slay-win không còn khả thi nếu tổng slain chưa đủ). Không có “draw game” tự động. |
| `DECK-06` | Monster bị discard bởi effect (nếu card nào làm vậy) không vào main discard pile. | `UNVERIFIED` (không có card base đã capture làm vậy) — chỉ ghi nhận để Architecture giữ zone `monsterDiscard` riêng nếu cần. |

## 6. Edge cases + acceptance

| ID | Tình huống | Kết quả bắt buộc | Nhãn |
|---|---|---|---|
| `EC-01` | Actor còn 1 AP, gửi ATTACK | Reject, AP=1 giữ nguyên, Monster không đổi. | VERIFIED-RB + VERIFIED-PD (`G-02`) |
| `EC-02` | Actor còn 2 AP, gửi REDRAW_HAND | Reject, không discard hand. | VERIFIED-RB |
| `EC-03` | REDRAW_HAND khi hand rỗng, 3 AP | Hợp lệ; discard 0, DRAW 5; AP=0; auto END_TURN. | VERIFIED-RB (`AP-05`) |
| `EC-04` | Party = Leader + 1 Hero; Monster cần 2 Hero | Reject ATTACK (Leader không tính). | VERIFIED-RB (`MON-02`) |
| `EC-05` | Monster cần 1 Wizard + 1 Hero bất kỳ; Party có đúng 1 Wizard Hero | Reject (một card không thỏa hai slot). | VERIFIED-RB (`MON-03`) |
| `EC-06` | Monster cần 1 Wizard + 1 Hero; Party có Wizard Hero + Fighter Hero | Hợp lệ. | VERIFIED-RB |
| `EC-07` | Monster cần 1 Wizard; Party Leader là The Cloaked Sage (Wizard), không có Wizard Hero | Default: Reject. | **UNVERIFIED** (`Q-01`) |
| `EC-08` | Attack roll raw 7, slay 8+, Modifier +1 → final 8 | SLAY. | VERIFIED-RB (`MON-10/11`) |
| `EC-09` | Attack final = penaltyMax+1 .. slayMin−1 | NONE; Monster ở lại; 2 AP mất. | VERIFIED-RB |
| `EC-10` | Penalty SACRIFICE Hero, Party chỉ có Leader | Không có ảnh hưởng thêm; lượt tiếp tục. | VERIFIED-PD (`RULE-20`) |
| `EC-11` | Penalty SACRIFICE Hero có Item gắn | Hero + Item cùng vào discard. | VERIFIED-RB (`RULE-08`) |
| `EC-12` | SLAY Monster thứ 3, actor còn 1 AP | Cùng transaction: Monster→Party, `GAME_OVER`, winner=actor; mọi command sau reject; không lật Monster thay thế bắt buộc (Q-03). | VERIFIED-PD (`RULE-24`, QA-14) + DERIVED |
| `EC-13` | SLAY Monster thứ 2, Monster deck rỗng | Monster→Party; không lật; còn 2 face-up. | **UNVERIFIED** (`Q-09`) |
| `EC-14` | Có 6 class giữa lượt (sau PLAY Hero), sau đó Penalty sacrifice Hero làm mất 1 class, rồi END_TURN | Không thắng. | DERIVED (`WIN-CLASS-T`) |
| `EC-15` | Player B đạt 6 class trong lượt A (vd. effect của A trao Hero) | Không thắng tại cuối lượt A; nếu còn 6 class khi B kết thúc lượt của B → B thắng. | DERIVED |
| `EC-16` | Actor đủ 6 class, AP về 0 bằng PLAY Hero cuối, immediate roll đang chờ | Chưa check; sau khi chain (choice/roll/Modifier/effect) đóng → auto END_TURN → check `WIN-CLASS` với Party sau effect. | VERIFIED-PD (`G-03`) + VERIFIED-RB |
| `EC-17` | Actor 5 Hero class khác nhau + Leader class thứ 6 khác | Thắng tại END_TURN (Leader tính class). | VERIFIED-RB (`RULE-23`) |
| `EC-18` | Actor có 6 Hero đủ 6 class nhưng Leader trùng một class | Thắng (đếm distinct). | DERIVED |
| `EC-19` | Hero vừa bị Challenge thành công | Không vào Party; không tính class/Hero count; không có immediate roll. | VERIFIED-RB (`PC-CH-02`) |
| `EC-20` | Paid roll Hero lần 2 cùng lượt (lần 1 fail) | Reject, AP giữ nguyên. | VERIFIED-RB (`RG-HERO-04`) |
| `EC-21` | Hero A được roll (allowance dùng) bởi P1, sau đó bị P1 effect chuyển sang Party P2 trong cùng lượt P1 | Allowance key theo `(turnId, heroInstanceId)`: P2 không có lượt nên không roll; lượt P2 kế tiếp có allowance mới. | DERIVED (`RULE-07` một lần/Hero/lượt; chỉ actor được roll Hero trong Party mình) |
| `EC-22` | PLAY Item lên Hero đã có Item | Reject trước Challenge, AP giữ nguyên. | VERIFIED-RB (`RULE-08`) |
| `EC-23` | PLAY Item lên Party Leader | Reject. | VERIFIED-RB |
| `EC-24` | PLAY Item (không Cursed) khi actor không có Hero trong Party | Reject. | VERIFIED-RB (Item phải gắn ngay) + default `Q-06` cho Hero đối phương |
| `EC-25` | PLAY Item target Hero; trong Challenge window Hero đó rời Party (không thể trong base core; chỉ qua effect) | Default: Item vào discard, AP không hoàn. | **UNVERIFIED** (`Q-07`) |
| `EC-26` | DRAW khi deck=0, discard=0 | Rút 0; AP −1; lượt tiếp tục. | VERIFIED-PD + DERIVED |
| `EC-27` | Gửi Modifier/Challenge như turn action ngoài window | Reject. | VERIFIED-RB |
| `EC-28` | Không có Monster face-up; actor gửi ATTACK | Reject. | **UNVERIFIED** (`Q-09`) |
| `EC-29` | END_TURN khi `pendingPlay`/window đang mở | Reject. | VERIFIED-PD |
| `EC-30` | Monster roll final < 2 hoặc > 12 do Modifier | Không clamp; phân loại theo `MON-11`. | **UNVERIFIED** (`MON-16`) |
| `EC-31` | Game 2 người chọn The Shadow Claw | Setup reject Leader này. | VERIFIED-RB (via `BASE_SOURCE_EVIDENCE.md`) |
| `EC-32` | Attack roll có The Divine Arrow Leader | `final` += 1 (passive, không phải Modifier, không chiếm slot Modifier của actor). | Card skill secondary; “không chiếm slot” **UNVERIFIED** (`Q-11`) |

## 7. UNVERIFIED / owner questions

> **Đã chốt:** xem docs/decisions/product-decisions.md — các mục "Owner chốt" (RULES-001, lần 2, lần 3). Q-01 và Q-04 đã ĐỔI ở lần 2 (Leader thỏa slot class; Mask thay class). Bảng dưới là câu hỏi gốc, không còn là luật hiện hành.

Mọi mục dưới đây không có trong nguồn đã cite. Proposed default dùng được cho skeleton/synthetic fixture, **không** enable base mode cho tới khi PM/owner chốt.

| Q | Câu hỏi | Proposed default | Ảnh hưởng |
|---|---|---|---|
| `Q-01` | Party Leader có thỏa **slot class** của Monster requirement không? | Không (Leader không phải Hero; mọi slot là slot Hero). Cần đối chiếu lại PDF retail p.2 vì session này không mở được PDF. | `MON-04`, `EC-07` |
| `Q-02` | Win đồng thời / người không phải actor đạt slay-win do effect | Người đạt trước theo thứ tự resolve; cùng bước atomic → active player, rồi theo thứ tự lượt. | `WIN-TIE` |
| `Q-03` | Khi slay-win, chain còn mở (Modifier window khác, trigger slain-skill, refill Monster) | Dừng toàn bộ; không refill, không resolve trigger sau; `GAME_OVER` cùng transaction. | `WIN-SLAY-T`, `WIN-END` |
| `Q-04` | Mask Item có cho Hero tính class khác cho `WIN-CLASS`/`MON-03` không? (text NOT_CAPTURED) | Engine hỗ trợ `effectiveClasses` (union), giá trị chỉ đến từ card data đã capture; chưa có data → không có class override. | `DATA-H05`, `DATA-I03` |
| `Q-05` | Penalty Monster không thực hiện đủ (ngoài SACRIFICE đã chốt) | Thực hiện tối đa phần khả thi, không lỗi, không rollback. | `MON-15` |
| `Q-06` | Item thường có gắn được lên Hero đối phương không? | Không: Item thường → Hero của actor; Cursed Item → Hero bất kỳ (kể cả của actor). | `TL-PLAY-ITEM`, `EC-24` |
| `Q-07` | Target Item khóa lúc play hay sau Challenge; target mất hiệu lực giữa chừng | Khóa lúc PLAY; revalidate khi resolve; mất hiệu lực → Item vào discard, AP không hoàn (tương tự `PC-DD-07` no-op). | `TL-PLAY-ITEM`, `EC-25` |
| `Q-08` | Mở rộng `PC-DD-04` (khóa target trước roll) cho **mọi** Hero/Magic có target | Có, áp dụng chung. | `TL-ROLL` |
| `Q-09` | Monster deck rỗng / không còn Monster face-up | Không refill; ATTACK reject khi 0 face-up; game tiếp tục; không draw-game. | `DECK-04/05`, `EC-13/28` |
| `Q-10` | Server roll (đã chốt cho Challenge) áp dụng cho Hero roll và Monster roll | Có: server roll mọi dice, client chỉ animation. | `TL-ROLL`, `TL-ATTACK` |
| `Q-11` | Passive bonus (Leader/slain Monster/Item) cộng vào `final` có tính là “Modifier” cho giới hạn 1 Modifier/player không? | Không; passive tự động, ngoài window. | `MON-10`, `EC-32` |
| `Q-12` | Requirement chỉ kiểm lúc nhận ATTACK | Có (`MON-07`). | `MON-07` |

Data gaps cần Content (không phải câu hỏi owner): `DATA-H02..H04`, `DATA-I02..I03`, `DATA-M02`, Monster `requirement/slayMin/penaltyMax/penaltyEffectId/slainSkillEffectId`, structured Modifier `options`, Leader `class/skill` vào CSV.

## 8. Tổng kết trạng thái

Đếm trên các rule ID của file này (`G-*`, `TL-*`, `MON-*`, `WIN-*`, `DECK-*`; không tính `DATA-*`, `EC-*`, `Q-*`):

| Trạng thái | Số | ID |
|---|---:|---|
| VERIFIED (RB hoặc PD, kể cả DERIVED trực tiếp) | 32 (+2 partial) | `G-01..06`, `TL-DRAW/PLAY-HERO/PLAY-MAGIC/ROLL/ATTACK/REDRAW/END/AUTO-END/ORDER`, `MON-01/02/03/06/11/12/13/14/17`, `WIN-SLAY/SLAY-T/CLASS/CLASS-T/END`, `DECK-01/02/03` ; partial: `TL-PLAY-ITEM` (cost/Challenge verified, target `Q-06/07`), `MON-10` (2d6+Modifier verified, server roll `Q-10`) |
| UNVERIFIED (có default, chờ `Q-*`) | 11 | `MON-04/05/07/15/16`, `WIN-TIE`, `WIN-CLASS-SET` (per-card class), `DECK-04/05/06`, `TL-LEADER` (text) |

## Handoff

- File: `docs/rules/RULES-001_TURN_LOOP_SPEC.md`.
- Checks: đọc BASE_SPEC/BASE_RULE_GATES/SETUP_VERIFIED/PLAY_CARD_RULE_SLICE/product-decisions/card CSV/evidence; đối chiếu PLAY_CARD_API command names. PDF Asmodee **không mở được** từ session (proxy 403); KS v1 rule PDF chỉ dùng corroboration.
- Blockers cho base mode: `Q-01`, `Q-09` và toàn bộ Monster/Hero gameplay fields thiếu trong CSV. GAME-002/003 dựng được skeleton với synthetic fixtures.
- Bước kế: PM/owner trả lời `Q-01..12`; Content capture Monster/Hero/Item/Magic fields; Rules đối chiếu lại `MON-04/05` với PDF retail khi có quyền truy cập.
