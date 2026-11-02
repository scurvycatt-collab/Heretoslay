# QA-001 — Acceptance draft cho base game

**Owner:** QA worker  
**Phạm vi file:** `docs/qa/ACCEPTANCE_DRAFT.md`  
**Input:** `docs/rules/BASE_SPEC.md`, `docs/content/CONTENT_AUDIT.md`, `docs/decisions/product-decisions.md`, `docs/decisions/ADR-001-cloudflare.md`, `docs/architecture/PROTOCOL_DRAFT.md`  
**Đầu ra:** ma trận acceptance rủi ro chính; không phải test result  
**Tiêu chí nghiệm thu:** 12–16 ca có nguồn, trigger, expected result, priority, status; nêu blocker kiến trúc mà không sửa protocol  
**Phụ thuộc:** owner duyệt ADR/protocol và các lựa chọn reaction; cần code/test harness trước khi chạy  
**Trạng thái:** DRAFT; toàn bộ ca `NOT_RUN` vì checkout chưa có game code.

## Quy ước nguồn

- **CONFIRMED:** luật base đã đối chiếu rulebook hoặc product decision đã được owner chốt.
- **PROPOSED / OWNER_DECISION:** hành vi từ ADR/protocol draft, chưa phải contract ổn định.

## Ma trận acceptance

| ID | Nguồn requirement | Bước kích hoạt | Expected result | Priority | Status |
|---|---|---|---|---|---|
| QA-01 | `RULE-05`, `RULE-08`–`RULE-11` — CONFIRMED | Trong lượt, còn ≥1 AP: lần lượt thử chơi Hero, Item, Magic; đối thủ Challenge hợp lệ | Mỗi lần trừ 1 AP; chỉ ba loại này mở Challenge. Challenge thắng: lá vào discard, không hoàn AP. Item/Magic/Hero tuân thủ resolve riêng sau khi người chơi lá thắng hoặc không bị Challenge. | P0 | NOT_RUN |
| QA-02 | `RULE-06`, `RULE-10`, `RULE-14`–`RULE-15` — CONFIRMED + PROPOSED mapping | Chơi Hero thành công sau Challenge window | Hero resolve vào Party rồi người chơi được **tùy chọn** roll effect ngay, không tốn thêm AP. Roll Hero effect không mở Challenge; nếu roll thì đi qua Modifier window. | P0 | NOT_RUN |
| QA-03 | `RULE-13`, override `RULE-15` — CONFIRMED product | Sau một roll, nhiều người gửi mỗi người một Modifier; một người thử gửi lá thứ hai trong cùng `windowId` | Modifier hợp lệ đầu tiên của mỗi người được nhận, đánh dấu người đó completed/final, và tổng của nhiều người được cộng sau một window chung. Lá thứ hai bị reject bằng code ổn định, không bị consume/đưa vào discard và không đổi deadline hay tổng. | P0 | NOT_RUN |
| QA-04 | `RULE-12`, `RULE-15` — CONFIRMED | Mở reaction với cấu hình mặc định; gửi Modifier ở giây 5 và 19 | `deadlineAt = openedAt + 20s`; không submission nào reset/gia hạn deadline; client về 0 không tự quyết kết quả. | P0 | NOT_RUN |
| QA-05 | `RULE-15`; eligibility theo `RULE-16` — CONFIRMED product + PENDING eligibility | Mỗi eligible gửi đúng một Modifier hợp lệ hoặc Skip trước deadline | Mỗi lựa chọn đánh dấu người đó completed/final trong `windowId`; không thể reaction lại. Khi toàn bộ eligible completed, window đóng sớm đúng một lần. Reaction mới không reset deadline và không mở lại người đã completed. | P0 | NOT_RUN |
| QA-06 | `RULE-11`, `RULE-12`, `RULE-17` — CONFIRMED; ordering mapping PROPOSED | Hai đối thủ gửi Challenge gần đồng thời cho cùng lá/window | Request hợp lệ đầu tiên theo Room DO được accept; atomically đặt challenger và đóng window. Request sau bị `WINDOW_CLOSED`. Server tự roll cả hai bên, persist kết quả rồi mở Modifier window; client chỉ animate, không chờ nút roll/ack và disconnect không làm kẹt Challenge. | P0 | NOT_RUN |
| QA-07 | `RULE-12`, `RULE-15`; protocol deadline — PROPOSED mapping | Gửi reaction A để handler nhận ngay trước deadline; B được handler nhận khi `serverNow == deadlineAt`; alarm chưa chạy | A được xét hợp lệ. Trước khi xét B, server resolve window; B bị `WINDOW_CLOSED`. Timestamp/click time client không ảnh hưởng ordering. | P0 | NOT_RUN |
| QA-08 | `RULE-12`, `RULE-15`; ADR alarm/protocol resolve-once — PROPOSED mapping | Kích alarm sớm, muộn, rồi retry/duplicate cho cùng `windowId` | Alarm sớm schedule lại; alarm muộn resolve ngay; retry sau commit là no-op/trả outcome đã lưu. Chỉ một transition close và một kết quả gameplay có hiệu lực. | P0 | NOT_RUN |
| QA-09 | `RULE-12`, `RULE-15`–`RULE-16`; protocol revision — PROPOSED, addressed in draft | Hai eligible cùng nhìn revision N; một gửi Modifier, một gửi Modifier hoặc Skip, đều cho cùng window còn mở | Cả hai reaction hợp lệ không bị mất chỉ vì command đầu tăng global revision. Reaction không bắt equality global revision; server tuần tự hóa và kiểm tra `windowId`, phase, deadline, eligibility, Skip-finality. | P0 | NOT_RUN |
| QA-10 | `RULE-12`, `RULE-15`; protocol window/idempotency — PROPOSED, addressed in draft | (a) Gửi command với `windowId` cũ; (b) retry cùng `commandId` + cùng payload; (c) tái dùng `commandId` với payload khác | (a) reject ổn định, không mutate window mới; (b) cùng key và fingerprint trả đúng outcome cũ, không áp dụng lại; (c) cùng key nhưng fingerprint khác bị reject `IDEMPOTENCY_CONFLICT`, không trả cache của payload khác. | P0 | NOT_RUN |
| QA-11 | `RULE-12`, `RULE-15`; ADR reconnect — CONFIRMED product / PROPOSED mapping | Eligible chưa completed mất kết nối giữa window; reconnect trước deadline bằng token hợp lệ | Disconnect không tự complete/Skip và người chơi vẫn nằm trong eligible set đến hết deadline 20 giây, nên window không đóng sớm vì họ. Token cũ bị thu hồi khi rotate; snapshot mang revision/window/deadline hiện tại. Reconnect trước deadline có thể dùng một Modifier hoặc Skip; sau deadline nhận state đã resolve. | P0 | NOT_RUN |
| QA-12 | `RULE-12`, `RULE-15`; protocol resync — PROPOSED mapping | Client bỏ lỡ một event hoặc nhận duplicate/out-of-order revision | Duplicate bị bỏ; gap kích resync. Snapshot cá nhân hóa ở revision hiện tại được áp dụng, sau đó chỉ nhận delta mới hơn; không replay transition gameplay. | P1 | NOT_RUN |
| QA-13 | `RULE-16`; ADR privacy — PENDING eligibility / PROPOSED security | Quan sát event/snapshot/reject của đối thủ trong join, reaction, reconnect và resync | Không lộ card IDs trong hand, deck order, reconnect token hay khả năng có Challenge/Modifier. Đối thủ chỉ thấy hand count; eligibility trả `youAreEligible` và tổng phản hồi thiếu, không suy từ card phù hợp. | P0 | NOT_RUN |
| QA-14 | `RULE-23`, `RULE-24` — CONFIRMED; atomic commit PROPOSED | Người chơi SLAY Monster thứ ba rồi ngắt kết nối trước/trong animation | Server commit Monster vào Party và `GAME_OVER`/winner trong cùng transition; không đưa Monster vào hand. Animation chỉ trình chiếu; reconnect thấy game đã kết thúc, không thể phát sinh action tiếp. | P0 | NOT_RUN |
| QA-15 | `RULE-04`, `RULE-05`, `RULE-07` — CONFIRMED | Thử action khi thiếu AP; thử lại effect cùng Hero trong một lượt; kết thúc lượt còn AP | Action thiếu AP bị từ chối không mutate state. AP đã chi không hoàn khi roll thất bại; giới hạn Hero effect một lần/lượt được giữ; AP thừa không chuyển lượt. | P1 | NOT_RUN |
| QA-16 | `RULE-01`–`RULE-03` — CONFIRMED product; expansion setup UNVERIFIED | Thử join/start ở biên 1, 2, 6, 7, 8, 9; tại lobby 7–8 người thử tắt expansion cuối đang tạo capacity | Base: 1 người bị từ chối `START_GAME`; 2 và 6 được phép khi setup hợp lệ; 7 và 8 bị từ chối. Khi chọn expansion được hỗ trợ và đủ setup/Leader, 7 và 8 được phép; 9 luôn bị từ chối. **PROPOSED:** thay đổi làm capacity thấp hơn số ghế hiện tại bị reject nguyên tử, không tự kick người chơi. | P0 | NOT_RUN |

## Findings / blockers cần review

1. **F-01 — Strict `expectedRevision` có thể làm mất reaction hợp lệ (P0) — ADDRESSED_IN_DRAFT.** Trigger: hai client cùng gửi trên revision N; command đầu commit N+1. Ảnh hưởng: Modifier hoặc Skip thứ hai bị stale dù cùng `windowId` còn mở. Protocol nay bỏ equality global revision cho reaction và revalidate `windowId` + phase + deadline + eligibility + Skip; chưa runtime verified.
2. **F-02 — Envelope chưa bắt buộc `windowId` cho reaction (P0) — ADDRESSED_IN_DRAFT.** Trigger: retry muộn đến sau khi window kế tiếp mở. Ảnh hưởng: có nguy cơ áp command vào context mới nếu chỉ dựa phase/revision. Protocol nay bắt buộc `windowId` cho Challenge/Modifier/Skip và revalidate ID; chưa runtime verified.
3. **F-03 — Idempotency chưa định nghĩa reuse key với payload khác (P0) — ADDRESSED_IN_DRAFT.** Trigger: cùng `commandId`, payload/window khác. Ảnh hưởng: trả outcome cache sai hoặc che command lỗi. Protocol nay dùng key `(roomId, playerId, commandId)`, fingerprint canonical và `IDEMPOTENCY_CONFLICT` khi mismatch; chưa runtime verified.
4. **F-04 — Modifier có tự completed hay vẫn cần Skip — ADDRESSED_IN_DRAFT (P0).** `RULE-15` và protocol body đều ghi một Modifier hợp lệ **hoặc** Skip thì completed/final; toàn bộ eligible completed thì đóng sớm. Disconnect chưa completed vẫn eligible đến deadline 20 giây. Chưa runtime verified; tập eligible vẫn PENDING theo `RULE-16` và không được suy/leak từ hand.
5. **F-05 — Challenge roll/fallback — ADDRESSED_IN_DRAFT (P1).** `RULE-17` và protocol body đều ghi server tự roll cả hai bên, client chỉ animate và không đợi bấm/ack; manual fallback không còn pending. Chưa runtime verified.

## Handoff — gap theo gate

1. **Chặn reaction Foundation skeleton:** `RULE-16` chưa chốt tập eligible cho từng window; chưa thể khóa logic đóng sớm hay privacy contract, và QA không tự coi đề xuất protocol là owner-approved.
2. **Chỉ chặn full-game coverage:** 96 definition/115 standard-card copy trong audit đều là `secondary_discovery`, text/effect `NOT_CAPTURED`; cùng `RULE-27` chưa có tie-break trigger đồng thời. Các gap này không chặn dựng protocol/state-machine skeleton nhưng chặn engine effect hoàn chỉnh.
3. **Chỉ chặn expansion 7–8:** setup, Leader và rules expansion chưa đủ bằng chứng; không chặn base 2–6 Foundation.

Chưa chạy test, chưa có code và không có kết quả pass/fail. F-01–F-05 chỉ addressed trong draft, tất cả vẫn cần runtime verification; 16 ca giữ `NOT_RUN`.
