# EG-PREP-001 — PLAY_CARD rule slice

Ngày lập: 2026-11-02. Phạm vi chỉ gồm hai candidate base-scan: `Critical Boost` và `Dodgy Dealer`. Đây là contract chuẩn bị implementation, không nâng card scan thành publisher-verified retail text.

## Authority và nguồn

| Lớp | Nguồn / trang | Proposition dùng trong slice |
|---|---|---|
| Official | [Asmodee Canada — Here to Slay rulebook](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf), p.1 `HOW TO PLAY`, `HERO CARDS`, `MAGIC CARDS` | 3 AP/lượt; play Hero/Item/Magic từ hand tốn 1 AP; Hero có optional immediate roll; cùng Hero effect không được roll quá một lần/lượt; Magic vào discard ngay sau khi dùng effect. |
| Official | Cùng PDF, p.2 `GAMEPLAY TERMS`, `MODIFIER CARDS`, `CHALLENGE CARDS` | `DRAW` top main deck→hand; `DISCARD` hand→discard; Challenge áp dụng khi đối thủ attempt play Hero/Item/Magic; tie thuộc challenger; Challenge thành công làm attempted card vào discard và AP không hoàn; thất bại cho play tiếp; một card chỉ bị Challenge một lần. Modifier có thể theo mọi dice roll, không tốn AP, vào discard sau dùng; target có thể được chọn trước khi người khác quyết định Modifier; rulebook cho phép mỗi player dùng bất kỳ số Modifier trên cùng roll. |
| Candidate card evidence | [`PLAY_CARD_SOURCE_SLICE.md`](../content/PLAY_CARD_SOURCE_SLICE.md) | Secondary visual scan: `Critical Boost` Magic — `DRAW 3`, rồi `DISCARD` một card; `Dodgy Dealer` Bard Hero — threshold 9+, trade hands with another player. Rights/source status vẫn `UNVERIFIED`/`secondary_discovery`. |
| Project policy | `BASE_RULE_GATES.md`; owner reaction rules trong `AGENTS.md` | `DRAW N` tuần tự, deck hết thì reshuffle discard và tiếp tục số còn thiếu, cả hai pile rỗng thì partial-stop; mọi player có Skip; Challenge first-valid-wins; Modifier tối đa 1 lá/player hoặc Skip, all-completed đóng sớm; server roll cả hai bên Challenge; deadline/disconnect rules giữ nguyên. |

## Common PLAY_CARD / Challenge contract

| Case ID | Input / precondition | Expected outcome | Authority |
|---|---|---|---|
| `PC-COM-01` | Active player, đúng lượt, card Hero/Magic nằm trong hand và còn ít nhất 1 AP | Có thể tạo valid play attempt với cost 1 AP. Challenge window xảy ra trước card effect/immediate Hero roll. | Official AP/play + Challenge timing. Exact server reserve/commit timing là kỹ thuật, không do rulebook định nghĩa. |
| `PC-COM-02` | Sai lượt, card không ở hand, không đủ AP, hoặc card type ngoài Hero/Item/Magic | Không được mở Challenge/effect window. AP/card không đổi là **MINIMAL PROPOSAL**, cần Architecture chốt atomic validation; publisher không mô tả invalid transaction. | BLOCKED on technical contract. |
| `PC-CH-01` | Valid play attempt; nhiều đối thủ submit Challenge | Chỉ first-valid Challenge được nhận; card không thể bị Challenge lần hai. Tất cả player trong window có thể Skip kể cả không giữ Challenge. | Official one-Challenge-per-card + PROJECT POLICY first-valid/all-player Skip. |
| `PC-CH-02` | Challenger roll ≥ actor roll sau Modifier | Attempted Hero/Magic đi từ actor hand→discard; effect không resolve, Hero không vào Party, không có immediate Hero roll; 1 AP không hoàn. | Official p.2. |
| `PC-CH-03` | Actor roll > challenger roll sau Modifier, hoặc mọi eligible player Skip Challenge | Card tiếp tục được play như dự định; sau đó đi vào card-specific resolution. | Official Challenge failure; PROJECT POLICY Skip. |
| `PC-CH-04` | Challenge đã resolve | Destination của chính Challenge card không được đoạn rulebook đã pin nói rõ. **MINIMAL PROPOSAL:** Challenge card đi hand→discard sau use để bảo toàn zone accounting. | UNKNOWN / PM-owner decision needed before code. |

## Modifier / reaction acceptance

| Case ID | Input | Expected outcome | Authority |
|---|---|---|---|
| `PC-MOD-01` | Có dice roll (Challenge hoặc Hero); mọi player tham gia Modifier window | Mỗi player có đúng một completion choice trong digital window: play tối đa 1 valid Modifier hoặc Skip. Modifier chọn option/roll target, áp delta rồi vào discard. | PROJECT POLICY giới hạn 1/player; official cho phép Modifier trên mọi roll và discard sau use. **Divergence:** official tabletop cho phép bất kỳ số Modifier/player. |
| `PC-MOD-02` | Challenge roll | Server roll hai phía trước; player được thấy cả hai roll trước quyết định Modifier. | PROJECT POLICY server dice + official p.2 wait for both Challenge rolls. |
| `PC-MOD-03` | Tất cả player, kể cả no-card player, submit Skip | Đóng window sớm `all_completed`; tổng Modifier = 0; resolve bằng raw roll(s). | PROJECT POLICY. |
| `PC-MOD-04` | Một số player play Modifier, số còn lại Skip; mọi player completed | Đóng sớm, cộng tất cả delta hợp lệ đúng một lần rồi resolve. Không reset timer; disconnect chờ deadline nếu chưa completed. | PROJECT POLICY; official combine modifier total. |

## Critical Boost — candidate Magic

Resolution candidate: `DRAW 3` theo thứ tự, sau đó `DISCARD` một card từ hand; sau khi effect hoàn tất, Magic card vào discard.

| Case ID | Input | Expected outcome | Authority / status |
|---|---|---|---|
| `PC-CB-01` | Play bị Challenge thành công | Áp `PC-CH-02`; không draw/discard effect. Critical Boost hand→discard, conservation delta: hand −1, discard +1. | Official Challenge; candidate identity/text. |
| `PC-CB-02` | Không bị Challenge hoặc Challenge thất bại; có ≥3 lá khả dụng để draw | Critical Boost rời hand cho play; draw đúng 3 tuần tự vào hand; sau đó actor chọn đúng 1 card trong current hand để hand→discard; Critical Boost vào discard sau effect. Lá discard có thể là một lá vừa draw vì official `DISCARD` chỉ yêu cầu card ở hand. | Candidate scan order + official DRAW/DISCARD/Magic zone definitions. |
| `PC-CB-03` | Tổng main deck+discard khả dụng chỉ còn `M`, `0≤M<3` | Draw đúng `M`, dừng khi cả hai pile rỗng, rồi tiếp tục bước `DISCARD 1`; không reject/rollback Magic hoặc draw đã làm. | OWNER-DECIDED partial-draw policy; card order from candidate scan. |
| `PC-CB-04` | Sau partial draw, actor hand rỗng tại bước `DISCARD 1` | Publisher/card inputs không quy định cách resolve instruction bất khả thi. **MINIMAL PROPOSAL:** discard 0 và hoàn tất effect; không rollback draw/play. | BLOCKED pending PM-owner decision. |
| `PC-CB-05` | Resolution hoàn tất | Conservation: mỗi drawn instance chuyển main deck→hand đúng một lần; chosen discard hand→discard đúng một lần; Magic hand→discard đúng một lần; không clone/drop instance. | Derived invariant; requires Architecture/QA acceptance, not a publisher sentence. |

## Dodgy Dealer — candidate Hero 9+

| Case ID | Input | Expected outcome | Authority / status |
|---|---|---|---|
| `PC-DD-01` | Play bị Challenge thành công | Áp `PC-CH-02`; Dodgy Dealer hand→discard, không vào Party và không mở immediate roll. | Official Challenge; candidate identity. |
| `PC-DD-02` | Play tiếp tục sau Challenge window | Dodgy Dealer hand→Party. Actor có thể Skip immediate effect roll; nếu Skip, Hero vẫn ở Party, chưa dùng roll allowance và có thể paid-roll Hero đó một lần sau trong cùng lượt. | Official Hero rule. |
| `PC-DD-03` | Actor chọn immediate roll | Roll hai dice; mở Modifier window. Immediate roll tiêu thụ once-per-turn allowance dù success/fail; không được paid-roll Dodgy Dealer lần nữa trong lượt đó. Final total ≥9 thì effect candidate thành công; <9 thì hands không đổi. | Official p.1 + verified `BASE_RULE_GATES.md`; threshold/effect từ candidate scan. |
| `PC-DD-04` | Effect attempt cần target | Target phải là “another player”, nên self-target invalid. Official chỉ đảm bảo target được biết trước khi Modifier decisions kết thúc; không nói target lock trước hay sau raw roll. **MINIMAL PROPOSAL:** chọn và khóa một valid other-player target trước dice roll để modifier context deterministic. | Partly candidate scan/official Modifier timing; BLOCKED target-lock contract. |
| `PC-DD-05` | Final total ≥9 và target hợp lệ | Swap hai complete hand collections atomically; mỗi card instance đổi owner/hand zone đúng một lần, tổng instance của hai hands không đổi. Dodgy Dealer đang ở Party không thuộc swap. | Candidate effect + derived conservation invariant. |
| `PC-DD-06` | Actor hoặc target có empty hand | Card text không loại trừ empty hand, nhưng source đã pin không có explicit ruling. **MINIMAL PROPOSAL:** empty hand là valid collection và swap bình thường, kể cả một/both sides rỗng. | UNKNOWN / PM-owner decision needed. |
| `PC-DD-07` | Target mất eligibility/disconnect giữa lock và resolution | Publisher inputs không định nghĩa. **MINIMAL PROPOSAL:** revalidate target at resolve; nếu player record vẫn thuộc room, resolve atomic swap; nếu không còn valid, effect no-op, không reroll/retarget sau Modifier. | BLOCKED technical/product contract. |

## Explicit unknowns và implementation gate

- Card mechanics là candidate secondary visual evidence, không publisher-verified card text hoặc license clearance.
- Cần PM/owner chốt `PC-CH-04`, `PC-CB-04`, `PC-DD-04`, `PC-DD-06`, `PC-DD-07` trước deterministic implementation.
- Project Modifier cap 1/player là intentional digital policy nhưng khác official “any number”; không được mô tả là publisher rule.
- Không xác định trigger ordering rộng hơn hai card, Party Leader/Monster triggers, nested immediate effects hoặc MOD-SELECT.

## Handoff

- File: `docs/rules/PLAY_CARD_RULE_SLICE.md`.
- Checks: đối chiếu đúng hai artifacts trong Content slice; mở lại Asmodee PDF p.1–2; đối chiếu `BASE_RULE_GATES.md` và owner reaction policy.
- Blockers: Challenge-card destination; impossible discard; Dodgy target-lock/empty-hand/disconnect semantics.
- Bước kế: PM/owner chốt năm proposal có nhãn; sau đó Architecture chuyển các case không blocked thành PLAY_CARD/resolve acceptance contract. Không code/API/test/tracker trong ticket này.
