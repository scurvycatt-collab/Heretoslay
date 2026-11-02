# VS-003 — Targeted QA plan cho Reaction Slice

**Owner:** QA worker  
**Phạm vi:** local DO + browser hai tab; chưa chạy test  
**Input:** `docs/architecture/REACTION_API.md`  
**Nghiệm thu:** identity/privacy, concurrency/idempotency, F-04, reaction lifecycle; không phải full-game coverage  
**Phụ thuộc:** VS-001/VS-002 final, local Worker + Vite sẵn sàng

## Cách chạy

- Ưu tiên local DO thật. Browser dùng hai tab qua launch route; mỗi tab giữ `sessionStorage` riêng, không dựa cookie chung.
- Không chép token/direct request để giả participant ngoài create/join. Negative API dùng session do route cấp.
- Poll snapshot khoảng 1 giây. Token không được xuất hiện trong URL, snapshot, console/network log ứng dụng hoặc error text.

## Cases

| ID | P | Lớp | Trigger | Expected |
|---|---|---|---|---|
| RS-01 | P0 | DO/API | Create/join với nickname trim; thử rỗng, >24, trùng khác hoa/thường | Hợp lệ trả 201/token/profile riêng; lỗi stable, không tạo ghế. |
| RS-02 | P0 | DO/API | Join từ 2 đến 6 rồi ghế 7 | 2–6 hợp lệ; ghế 7 `ROOM_FULL`; expansion bị `EXPANSION_UNSUPPORTED`. |
| RS-03 | P0 | Browser 2 tab | A create, B join; reload từng tab; poll ~1 giây | Identity/hand tách biệt; reload giữ identity, không thêm ghế; hai tab hội tụ revision. |
| RS-04 | P0 | DO/API | Token A lấy snapshot/command; payload gắn `playerId` B; token sai | Identity từ Bearer; không xem/điều khiển B; token sai `UNAUTHORIZED`. |
| RS-05 | P0 | Browser/API | So snapshot A/B và URL/log/error | Chỉ `yourHand`; hand khác chỉ count; không token/hash/deck order hay token trong URL/log. |
| RS-06 | P0 | DO/API | Guest/host gọi `OPEN_REACTION_DEMO`; host dùng stale revision | Guest `FORBIDDEN`; host hợp lệ; stale `STALE_REVISION`, không mutate. |
| RS-07 | P0 | DO concurrency | Hai đối thủ Challenge cùng window | First valid consume một lá; server roll hai bên; request sau `WINDOW_CLOSED`; mở Modifier 20 giây. |
| RS-08 | P0 | DO/API | Retry cùng commandId/payload; reuse ID với payload khác | Retry replay, không consume/revision thêm; mismatch `IDEMPOTENCY_CONFLICT`, state giữ nguyên. |
| RS-09 | P0 | DO/API — F-04 | Modifier đầu, retry, rồi lá thứ hai | Lá đầu rời hand/discard +1 đúng một lần; retry không thêm; lá hai reject, state/card zones không đổi. |
| RS-10 | P0 | Browser 2 tab | Player không có card bấm Skip; mọi player Modifier-or-Skip | Skip luôn enabled; mỗi lựa chọn final; tất cả completed đóng sớm đúng một lần, timer không reset. |
| RS-11 | P0 | DO/alarm | Disconnect chưa completed; command tại `now >= deadlineAt`; alarm retry | Chờ 20 giây; late `WINDOW_CLOSED`; deadline close-once; retry alarm no-op. |
| RS-12 | P1 | API negative | JSON lỗi, >4 KiB, card không sở hữu, self-Challenge | Stable code/safe message; không mutate, consume hoặc leak. |

## Handoff

Chưa chạy. Chỉ automation sau source final; polling mock không phải runtime integration.
