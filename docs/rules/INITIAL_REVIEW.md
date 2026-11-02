# RULE-001 — Rà soát luật base ban đầu

Ngày rà soát: 2026-10-28. Đây là discovery ngắn, **không phải gameplay spec đầy đủ**.

## Nguồn đã xác minh

- [Trang sản phẩm Asmodee Canada](https://www.asmodee.ca/en/product/here-to-slay/) và [rulebook base PDF](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf) được trang đó liên kết. Tham chiếu `p.1`/`p.2` là trang PDF.

Không dùng `heretoslay.io`, `heretoslay.online` hoặc card text riêng lẻ để suy luật chung.

## Tối đa 12 quy tắc cốt lõi

1. **Thiết lập:** mỗi người chọn 1 Party Leader; trộn main deck và chia 5 lá/người; lật 3 Monster; người chọn Party Leader cuối cùng đi trước (p.1).
2. **Lượt và action points (AP):** lượt theo chiều kim đồng hồ; mỗi lượt có 3 AP, dùng hành động theo bất kỳ thứ tự và có thể lặp nếu đủ AP. Lượt kết thúc khi hết AP hoặc người chơi dừng; AP thừa không chuyển sang lượt sau (p.1).
3. **Hành động 1 AP:** DRAW 1 lá; chơi Hero/Item/Magic từ tay; hoặc roll 2 dice để thử effect của một Hero trong Party (p.1).
4. **Giới hạn Hero effect:** khi chơi Hero, có thể roll effect ngay mà không trả thêm AP. Sau đó, việc thử effect tốn 1 AP và mỗi Hero chỉ được thử một lần mỗi lượt, kể cả lần roll thất bại; thất bại không hoàn AP (p.1).
5. **Hành động 2/3 AP:** ATTACK một Monster tốn 2 AP. Bỏ toàn bộ bài trên tay (nếu có) rồi DRAW 5 lá mới tốn 3 AP. Hành động do effect yêu cầu thực hiện “immediately” không tốn AP bổ sung (p.1).
6. **Item và Magic:** Item phải được gắn ngay vào một Hero; không gắn Party Leader; mỗi Hero tối đa 1 Item và không được thay Item. Cursed Item có thể gắn vào Hero đối phương. Magic có effect một lần rồi vào discard pile (p.1).
7. **Modifier:** có thể chơi tức thời từ tay khi bất kỳ người chơi nào roll, không tốn AP, rồi bỏ. Có thể chờ mục tiêu được chọn trước khi quyết định; mọi người có thể chơi nhiều Modifier trên cùng roll, sau đó cộng tổng thay đổi vào roll (p.2).
8. **Challenge:** khi người khác đang thử chơi Hero, Item hoặc Magic trong lượt của họ, có thể chơi Challenge, không tốn AP. Hai bên roll 2 dice; challenger thắng cả khi hòa, lá bị challenge vào discard và AP của người chơi không được hoàn. Nếu người chơi lá thắng, lá tiếp tục được chơi. Mỗi lá chỉ bị Challenge một lần (p.2).
9. **Modifier trong Challenge:** có thể đợi cả hai bên roll xong mới quyết định dùng Modifier; sau đó áp dụng quy tắc cộng tổng Modifier (p.2).
10. **ATTACK/SLAY Monster:** chỉ attack Monster đang face-up và phải đáp ứng Party requirement in trên lá. Roll đạt ngưỡng SLAY thì lấy Monster vào Party; rơi vào ngưỡng phản công thì chịu hậu quả; khoảng giữa không có kết quả. Dù kết quả nào cũng không hoàn 2 AP (p.2).
11. **Party Leader và Monster skill:** Party Leader không phải Hero; skill kích hoạt mỗi khi điều kiện xảy ra, không bị giới hạn một lần/lượt như Hero effect. Party Leader không thể bị sacrifice/destroy/steal/return. Monster đã slay cho skill lâu dài, không thể bị steal/destroy/attack/return; sau khi slay, lật Monster mới (p.2).
12. **Điều kiện thắng base:** thắng khi SLAY 3 Monster; hoặc kết thúc lượt với Party có 6 class khác nhau, tính cả Party Leader (p.2).

## Timer phản ứng: quyết định sản phẩm, không phải luật gốc

Rulebook cho phép Challenge và Modifier phản ứng nhưng không có timer. Owner chốt ngày 2026-10-28 và PM đã đồng bộ D-07: mọi player tham gia reaction window 20 giây và luôn có thể `Skip`, kể cả không có card. Timer không reset.

## Edge cases — định hướng sản phẩm ngày 2026-10-28

Các mục sau là **product/house rules**, không phải trích dẫn từ rulebook:

1. Khi nhiều người muốn Challenge, request hợp lệ đến hệ thống đầu tiên được proceed; các request còn lại bị bỏ qua.
2. Modifier mở window chung 20 giây cho mọi player. Mỗi người dùng tối đa một Modifier hợp lệ hoặc `Skip`, rồi completed/final. Hết giờ hoặc tất cả completed thì đóng và cộng tổng.
3. Chỉ mở Challenge window 20 giây khi một người thử chơi Hero, Item hoặc Magic. Không được Challenge việc roll Hero effect. Challenge thành công đưa lá đang chơi vào discard.
4. Main deck hết thì reshuffle discard pile thành main deck mới.
5. Nếu Monster penalty yêu cầu SACRIFICE nhưng không có Hero hợp lệ, không có ảnh hưởng thêm.
6. Khi SLAY Monster thứ ba, hoàn tất animation đưa Monster vào Party của người chơi rồi mới conclude game; không đưa Monster vào hand.
7. Effect/trigger xử lý theo thứ tự kích hoạt. Case chưa rõ sẽ được QA đưa cho owner quyết định khi test.
8. Timeout áp dụng cho toàn window và không reset. Disconnect chưa completed chờ deadline. Challenge đóng ở request hợp lệ đầu tiên, toàn bộ player `Skip`, hoặc deadline; Modifier đóng khi tất cả dùng một lá/`Skip` hoặc deadline. Server kiểm tra sở hữu card; self-Challenge bị từ chối.

Quy tắc Challenge ở mục 3 nay khớp phạm vi rulebook base. Cơ chế timer/`Skip` là lớp điều phối số hóa, không phải luật board game gốc.

## Handoff

- Owner/phạm vi: Rules worker; `docs/rules/INITIAL_REVIEW.md`.
- Kiểm tra: mở trang sản phẩm và PDF; đối chiếu AP, win conditions, Challenge, Modifier, Monster và Party Leader ngày 2026-10-28.
- Đầu ra: 12 quy tắc có nguồn và 8 định hướng edge case, tách product override khỏi luật gốc.
- Phụ thuộc bước sau: Architecture/QA đặc tả ordering, timestamp và đóng sớm theo participation đã chốt. Chưa đủ bằng chứng để đóng toàn bộ RULE-001.
