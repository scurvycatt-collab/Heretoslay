# DB-02 — Base rule gates

Ngày xác minh: 2026-11-02. Phạm vi: base retail; chỉ hai gate immediate Hero roll và thiếu tổng số lá khi `DRAW`/đổi hand. Quyết định dự án về reshuffle discard đã có và không được đánh giá lại ở đây.

## Nguồn và proposition

| Nguồn | Trang/mục | Proposition liên quan | Authority / kết quả |
|---|---|---|---|
| [Asmodee Canada — Here to Slay rulebook](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf) | p.1, `HOW TO PLAY` | Chơi Hero tốn 1 AP và người chơi có thể roll effect ngay. Một action khác là roll Hero trong Party; cùng đoạn ghi không được roll để dùng effect của cùng Hero quá một lần mỗi lượt, kể cả lần đầu fail. | Publisher/distributor-hosted retail rulebook; primary cho ticket. |
| Cùng PDF | p.1, `HERO CARDS` | Khi Hero được chơi vào Party, người chơi có thể ngay lập tức roll hai dice để dùng effect; sau khi Hero ở Party, có thể dùng 1 AP để attempt effect một lần mỗi lượt. | Primary; xác nhận immediate roll là một lần “roll … to use its effect”. |
| Cùng PDF | p.1, `HOW TO PLAY` | Đổi hand: discard toàn bộ hand (nếu có), rồi `DRAW` năm lá mới. | Primary; chỉ nêu số lượng và thứ tự, không nêu hành vi khi thiếu lá. |
| Cùng PDF | p.2, `GAMEPLAY TERMS` | `DRAW` là lấy lá trên cùng của main deck và thêm vào hand; discard pile được định nghĩa riêng. | Primary; không có fallback, partial-draw, failure hay rollback khi không có đủ lá. |
| [Here to Slay BackerKit project FAQ](https://here-to-slay.backerkit.com/faq) | Toàn bộ Project FAQ hiện có, truy cập 2026-11-02 | FAQ chỉ có player count, duration, fulfillment/components/accessories; không có ruling cho hai gate. | Publisher-project FAQ, corroboration âm tính có giới hạn; không dùng để suy “không có ruling ở nơi khác”. |

Search bounded ngày 2026-11-02: truy vấn giới hạn trên domain Unstable Games, Asmodee/CDN và publisher-linked BackerKit cho `immediately`, `once per turn`, `main deck`, `discard pile`, `run out`/`reshuffle`. Không tìm thấy FAQ chính thức liên quan ngoài rulebook trên. Unstable Games Wiki chỉ được dùng để discovery; không nâng thành authority và không dùng ruling card/expansion/community.

## Gate 1 — Immediate Hero roll và once-per-turn

**VERIFIED — immediate roll có tính vào giới hạn một roll để dùng effect của cùng Hero trong lượt đó.**

Chuỗi proposition trực tiếp từ p.1:

1. Immediate roll khi chơi Hero là roll để dùng effect của Hero đó.
2. Rulebook cấm roll để dùng effect của cùng Hero quá một lần trong một lượt; câu cấm không giới hạn riêng cho paid action.
3. Vì vậy, nếu đã chọn immediate roll, người chơi không thể chi thêm 1 AP để roll chính Hero đó lần nữa trong cùng lượt. Thành công hay thất bại của immediate roll không đổi kết quả này.

Đây là kết luận từ hai câu rulebook cùng trang, không phải một FAQ diễn đạt nguyên văn “consumes the attempt”. Không mở rộng kết luận sang effect/card đặc biệt có wording cho phép roll thêm.

### Acceptance cases

| ID | Tình huống | Kết quả bắt buộc | Trạng thái |
|---|---|---|---|
| `RG-HERO-01` | Chơi Hero, chọn immediate roll, roll thành công; sau đó còn AP và yêu cầu roll chính Hero đó | Từ chối lần roll thứ hai; không trừ AP cho action không hợp lệ. | Rule outcome VERIFIED; transaction/no-AP-loss là acceptance kỹ thuật cần Architecture giữ atomic. |
| `RG-HERO-02` | Chơi Hero, chọn immediate roll, roll thất bại; sau đó yêu cầu roll chính Hero đó | Từ chối lần roll thứ hai như trên. | VERIFIED. |
| `RG-HERO-03` | Chơi Hero nhưng bỏ qua immediate roll; sau đó chi 1 AP để roll Hero đó lần đầu trong lượt | Cho phép nếu action hợp lệ theo các rule khác. | VERIFIED. |
| `RG-HERO-04` | Hero đã ở Party; paid roll lần đầu fail rồi yêu cầu paid roll lần hai cùng lượt | Từ chối lần hai. | VERIFIED; rulebook nêu rõ cả trường hợp lần đầu fail. |

## Gate 2 — Tổng main deck + discard không đủ cho DRAW/đổi hand

**Publisher status: UNKNOWN.** Nguồn chính thức đã kiểm tra không quy định phải partial draw, reject action, kết thúc game, hay rollback khi tổng số lá có thể rút thấp hơn số lượng yêu cầu.

**Product policy: OWNER-DECIDED ngày 2026-11-02.** Với yêu cầu `DRAW N`, rút tuần tự đến khi đủ `N` hoặc cả main deck và discard pile đều rỗng:

1. Nếu main deck còn lá, rút một lá và tăng số đã rút; không reset target hay số đã rút.
2. Nếu main deck hết, kiểm tra discard pile. Nếu discard có lá, reshuffle discard thành main deck rồi tiếp tục cùng vòng rút với **số còn thiếu**, không bắt đầu lại `DRAW N`.
3. Nếu main deck và discard đều rỗng, dừng ngay với số lá thực tế đã rút. Không reject hoặc rollback toàn action và không tiếp tục loop.
4. Với đổi hand, discard toàn bộ hand trước, rồi áp dụng cùng policy để cố rút 5 lá; các lá vừa discard thuộc discard pile khi bước depletion kiểm tra nó.

Policy này không thay đổi AP cost của action. PM/Architecture áp dụng chi phí hiện hành của rule action tương ứng; đây là ghi chú tích hợp, không phải trích nguyên văn thêm từ quyết định owner.

### Acceptance cases

| ID | Tình huống | Kết quả bắt buộc | Trạng thái |
|---|---|---|---|
| `RG-DEPL-01` | `DRAW N`; main deck có ít nhất `N` lá | Rút đúng `N`; không đụng discard. | OWNER-DECIDED policy; publisher không có depletion ruling riêng. |
| `RG-DEPL-02` | Cần rút 5; main deck còn 2, discard có ít nhất 3 | Rút 2, reshuffle discard, rồi chỉ rút **3 lá còn thiếu**. Tổng nhận 5, không rút lại 5 sau reshuffle. | OWNER-DECIDED. |
| `RG-DEPL-03` | `DRAW N`; tổng main deck + discard là `M`, với `0 < M < N` | Rút toàn bộ `M`; khi cả hai pile rỗng thì dừng và resolve action với partial result. Không reject/rollback. | OWNER-DECIDED. |
| `RG-DEPL-04` | `DRAW N`; main deck và discard đều rỗng ngay từ đầu | Rút 0 và dừng ngay; action resolve, không loop vô hạn. | OWNER-DECIDED. |
| `RG-DEPL-05` | Đổi hand với target 5; hand được discard trước, rồi tổng khả dụng vẫn dưới 5 | Các lá hand vào discard trước; chạy cùng vòng rút, nhận tối đa số khả dụng rồi dừng. Không restore hand hoặc rollback toàn action. | Thứ tự discard→draw từ publisher; shortage behavior OWNER-DECIDED. |
| `RG-DEPL-06` | Main deck hết nhiều lần trong cùng `DRAW N` do các bước resolve | Mỗi lần chỉ kiểm tra discard tại lúc deck hết; nếu cả hai rỗng thì terminate. Counter đã rút và target còn thiếu được giữ xuyên suốt, nên không double-draw/double-loop. | OWNER-DECIDED. |

## Gate cho implementation

- Hero once-per-turn: đủ source để Architecture/QA triển khai và test `RG-HERO-01`–`04`, trừ ngoại lệ card-specific chưa thuộc scope.
- Insufficient-total draw/redraw: publisher source vẫn UNKNOWN, nhưng owner policy đã đủ deterministic cho `RG-DEPL-01`–`06`: sequential draw, reshuffle-and-continue, partial stop khi cả hai pile rỗng, không reject/rollback/loop vô hạn. Architecture vẫn cần giữ AP cost hiện hành của rule action.

## Handoff

- File: `docs/rules/BASE_RULE_GATES.md`.
- Checks: mở Asmodee retail PDF và BackerKit project FAQ; search bounded official-domain/publisher-linked cho hai gate; đối chiếu p.1–2.
- Blocker: không còn blocker product-policy cho hai gate; publisher provenance của shortage vẫn phải ghi UNKNOWN, không nâng owner decision thành official ruling.
- Bước kế: PM review và chuyển `RG-HERO-01`–`04`, `RG-DEPL-01`–`06` sang Architecture/QA acceptance contract.
