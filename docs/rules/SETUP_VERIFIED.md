# PS-01 — Setup, turn và Action Points đã xác minh

Ngày xác minh: 2026-10-29. Phạm vi: base game, `BASE_SPEC.md` `RULE-03`–`RULE-05`; không xác minh card-specific effects hoặc expansion.

## Nguồn

1. [Asmodee Canada — Here to Slay](https://www.asmodee.ca/en/product/here-to-slay/): trang publisher ghi **2–6 players**, thành phần base và liên kết “Download the rulebook”. Truy cập 2026-10-29.
2. [Here-to-Slay-Rules.pdf](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf), **p.1**:
   - “HOW TO START”: chọn Party Leader, chia 5 lá, lật 3 Monster, người chọn Leader cuối đi trước.
   - “HOW TO PLAY”: 3 AP/lượt, chi phí action, kết thúc lượt và AP không carry over.
   - “HERO CARDS”: Hero mới chơi có thể roll effect ngay; lần roll này không yêu cầu AP bổ sung ngoài action chơi Hero.

## Setup contract đã xác minh

| Case | Input / hành động | Kết quả bắt buộc | Chứng cứ |
|---|---|---|---|
| `SETUP-01` | Bắt đầu base game với 2–6 người | Setup được phép. Base-only ngoài khoảng này không thuộc rulebook/base product. | Asmodee product page |
| `SETUP-02` | Mỗi người chọn Party Leader | Đặt Leader đã chọn vào Party của người đó; Leader/reference dư trở lại hộp. | PDF p.1, HOW TO START |
| `SETUP-03` | Chuẩn bị main deck | Trộn toàn bộ standard-sized cards, chia 5 lá cho mỗi người; phần còn lại face-down thành main deck; chừa discard pile. | PDF p.1, HOW TO START |
| `SETUP-04` | Chuẩn bị Monster deck | Trộn Monster cards, lật 3 lá face-up ở giữa; phần còn lại face-down thành Monster deck. | PDF p.1, HOW TO START |
| `SETUP-05` | Xác định lượt đầu | Người chọn Party Leader cuối cùng đi trước; sau đó lượt theo chiều kim đồng hồ. | PDF p.1, HOW TO START/HOW TO PLAY |

## Turn/AP contract đã xác minh

| Case | Input / hành động | AP / kết quả bắt buộc | Chứng cứ |
|---|---|---|---|
| `TURN-01` | Bắt đầu lượt | Người chơi có 3 AP để dùng theo thứ tự tùy chọn. | PDF p.1, HOW TO PLAY |
| `TURN-02` | Còn đủ AP | Có thể lặp cùng một action trong lượt. | PDF p.1, HOW TO PLAY |
| `AP-01` | DRAW từ main deck | Tốn 1 AP; lấy lá trên cùng vào hand. | PDF p.1, HOW TO PLAY; p.2, DRAW definition |
| `AP-02` | Chơi Hero, Item hoặc Magic từ hand | Tốn 1 AP. Nếu là Hero, người chơi **có thể** roll effect ngay, không tốn AP bổ sung. | PDF p.1, HOW TO PLAY/HERO CARDS |
| `AP-03` | Paid attempt dùng effect của Hero đã ở Party | Tốn 1 AP và roll 2 dice. Không được roll cùng Hero effect quá một lần trong một lượt, kể cả lần đầu thất bại. Đây là paid attempt, phân biệt với optional immediate roll khi chơi Hero ở `AP-02`. | PDF p.1, HOW TO PLAY/HERO CARDS |
| `AP-04` | ATTACK Monster | Tốn 2 AP. Điều kiện attack và outcome thuộc phần Monster, ngoài ticket này. | PDF p.1, HOW TO PLAY |
| `AP-05` | Đổi hand | Tốn 3 AP; discard toàn bộ hand **nếu có**, rồi draw 5 lá mới. Wording bao gồm trường hợp hand rỗng. | PDF p.1, HOW TO PLAY |
| `AP-06` | Card effect yêu cầu action “immediately” | Không tốn AP bổ sung để thực hiện action được yêu cầu. | PDF p.1, HOW TO PLAY |
| `TURN-03` | Hết AP hoặc người chơi chọn dừng | Lượt kết thúc; AP chưa dùng không chuyển sang lượt sau. | PDF p.1, HOW TO PLAY |

## Ambiguity / UNKNOWN

1. **Leader selection ordering:** rulebook cho phép roll để chọn ai pick Leader trước hoặc “free-for-all”, nhưng không quy định một thuật toán bắt buộc, tie-break hay xử lý hai client chọn cùng Leader. Digital setup cần product/architecture quyết định; không tự suy.
2. **Thiếu bài khi setup/draw:** p.1 không nêu cách xử lý nếu main deck không đủ chia 5 lá/người hoặc không đủ thực hiện DRAW 5. Ticket chỉ xác minh p.1 và định nghĩa DRAW liên quan ở p.2, chưa rà toàn bộ rulebook/ruling về depletion; không kết luận game không có quy tắc đó.
3. **Invalid action transaction:** rulebook nêu chi phí nhưng không mô tả server phải trừ AP trước/sau validation hoặc rollback thế nào. Đây là contract kỹ thuật cần Architecture/QA định nghĩa; không phải ruling từ rulebook.
4. **Chuỗi “immediately”:** p.1 chỉ xác nhận không tốn AP bổ sung; ordering khi nhiều effect/reaction cùng phát sinh không được giải quyết tại đây.
5. **Immediate roll so với paid attempt:** nguồn nêu cả optional roll ngay khi chơi Hero và paid attempt một lần/Hero/lượt, nhưng chưa được ticket này xác minh ruling về việc immediate roll có tính vào giới hạn paid attempt trong chính lượt chơi Hero hay không. Không tự chọn interaction.

## Handoff

- File: `docs/rules/SETUP_VERIFIED.md`.
- Check thực: mở lại trang Asmodee và PDF chính thức; PDF nhận diện 2 trang; đối chiếu p.1 setup/HOW TO PLAY và p.2 định nghĩa DRAW.
- Blocker: 5 ambiguity trên; không chặn dựng setup/AP cơ bản nhưng chặn deterministic selection và interaction free-roll/paid-attempt.
- Bước kế: Content xác minh card/set đầu vào; Architecture chuyển contract đã xác minh thành state/command validation; QA tạo acceptance cases từ các ID trên. Không coi card effects hoặc expansion đã verified.
