# RULE-001 — Base gameplay specification (draft)

Ngày: 2026-10-28. Phạm vi: base game 2–6 người và các override sản phẩm đã duyệt. Đây là đầu vào Foundation, **chưa phải gameplay spec complete**: card-specific text/effect và expansion rules chưa được xác minh.

## Phân loại và source map

| Nhãn | Ý nghĩa |
|---|---|
| `RULEBOOK` | Hành vi từ rulebook/base material chính thức. |
| `PRODUCT` | Quyết định của owner cho bản web; không trình bày như luật board game gốc. |
| `PENDING` | Cần owner quyết định; implementation không được tự chọn. |

| Source ID | Nguồn | Phạm vi |
|---|---|---|
| `RB-P1` | [Here-to-Slay-Rules.pdf](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/10/Here-to-Slay-Rules.pdf), p.1 | setup, turn/AP, Hero/Item/Magic |
| `RB-P2` | Cùng PDF, p.2 | Modifier, Challenge, Leader, Monster, win |
| `PUB` | [Asmodee Canada — Here to Slay](https://www.asmodee.ca/en/product/here-to-slay/) | base 2–6 người; link rulebook |
| `PD` | `docs/decisions/product-decisions.md`, D-01/D-02/D-07, “Đồng bộ review đợt 1” và “Chốt reaction trong đợt 3” | base-first, reaction, edge-case overrides |

## Requirements

### Setup và vòng lượt

| ID | Loại | Requirement | Nguồn |
|---|---|---|---|
| `RULE-01` | RULEBOOK | Base-only nhận 2–6 người chơi. | PUB |
| `RULE-02` | PRODUCT | Chỉ khi chọn ít nhất một expansion đã được build hỗ trợ mới mở lobby tối đa 8 người; không hiển thị expansion chưa hỗ trợ và không cho trùng Party Leader. | PD |
| `RULE-03` | RULEBOOK | Mỗi người chọn một Party Leader và đặt vào Party. Trộn main deck, chia 5 lá/người; đặt phần còn lại face-down. Trộn Monster deck, lật 3 Monster face-up. Người chọn Leader cuối đi trước; lượt theo chiều kim đồng hồ. | RB-P1 |
| `RULE-04` | RULEBOOK | Mỗi lượt cấp 3 AP. Người chơi dùng action theo thứ tự tùy chọn, được lặp khi đủ AP. Lượt kết thúc khi hết AP hoặc chủ động dừng; AP thừa không carry over. | RB-P1 |
| `RULE-05` | RULEBOOK | 1 AP: DRAW 1; chơi Hero/Item/Magic; hoặc roll 2 dice thử effect của Hero trong Party. 2 AP: ATTACK Monster. 3 AP: DISCARD toàn bộ hand nếu có rồi DRAW 5. Action được card yêu cầu làm “immediately” không tốn AP thêm. | RB-P1 |

### Hero, Item và Magic

| ID | Loại | Requirement | Nguồn |
|---|---|---|---|
| `RULE-06` | RULEBOOK | Khi Hero được chơi thành công vào Party, người chơi **có thể** roll 2 dice dùng effect ngay, không tốn AP thêm. | RB-P1 |
| `RULE-07` | RULEBOOK | Với Hero đã ở Party, thử effect tốn 1 AP và tối đa một lần/Hero/lượt; roll thất bại không hoàn AP. Không giới hạn số Hero trong Party. | RB-P1 |
| `RULE-08` | RULEBOOK | Item phải gắn ngay vào một Hero, không gắn Leader; mỗi Hero tối đa một Item và không thay Item. Cursed Item có thể gắn Hero đối phương. Khi Hero bị destroy/steal/return, Item đi cùng theo cùng destination. | RB-P1 |
| `RULE-09` | RULEBOOK | Magic resolve effect một lần rồi chuyển vào discard pile. Nội dung/target cụ thể của Hero, Item, Magic lấy từ card data đã xác minh, không suy từ type. | RB-P1 |

### Challenge và Modifier

| ID | Loại | Requirement | Nguồn |
|---|---|---|---|
| `RULE-10` | RULEBOOK | Chỉ được Challenge khi đối thủ thử chơi Hero, Item hoặc Magic; không Challenge roll Hero effect, Modifier, Challenge khác hoặc một effect. Challenge không tốn AP và mỗi lá đang được chơi chỉ bị Challenge một lần. | RB-P2; PD |
| `RULE-11` | RULEBOOK | Người chơi lá và challenger cùng roll 2 dice. Challenger thắng khi hòa hoặc cao hơn: lá vào discard, AP không hoàn. Nếu người chơi lá cao hơn, lá tiếp tục resolve. Modifier chỉ được quyết định sau khi cả hai đã roll. | RB-P2 |
| `RULE-12` | PRODUCT | Challenge window tối đa 20 giây và gồm mọi player, kể cả người không có Challenge card; ai cũng có thể `Skip`. Request Challenge hợp lệ đầu tiên đóng window; request cạnh tranh sau bị bỏ. Nếu không có request, toàn bộ player `Skip` hoặc deadline đóng window. Disconnect chưa completed chờ deadline; timer không reset. | PD/D-07 |
| `RULE-13` | RULEBOOK | Khi bất kỳ ai roll, người chơi có thể dùng Modifier từ hand, không tốn AP; lá vào discard sau dùng. Một người được dùng nhiều Modifier và nhiều người cùng tham gia; hệ thống cộng tất cả thay đổi vào roll. Với Modifier hai lựa chọn, người chơi phải khai báo lựa chọn. | RB-P2 |
| `RULE-14` | RULEBOOK | Trước khi dùng Modifier trên roll của người khác, có thể chờ người roll chọn target nếu có. Với Challenge, Modifier window chỉ mở sau khi cả hai dice result tồn tại. | RB-P2 |
| `RULE-15` | PRODUCT | Override `RULE-13`: mỗi player trong Modifier window hoàn tất/final bằng đúng một Modifier hợp lệ **hoặc** `Skip`, kể cả khi không có Modifier card. Khi tất cả completed thì đóng sớm và resolve tổng. Disconnect chưa completed chờ deadline 20 giây. Modifier mới không reset timer hoặc mở lại người đã completed. | PD/D-07 |
| `RULE-16` | PRODUCT | Participation của Challenge/Modifier là toàn bộ player trong game tại lúc mở window, không lọc theo hand. Server vẫn phải xác minh người gửi sở hữu card và target hợp lệ. Challenge chỉ nhắm lá do người khác chơi; self-Challenge bị từ chối, nhưng người chơi lá vẫn được `Skip`. | PD |
| `RULE-17` | PRODUCT | Khi Challenge được chấp nhận, server tự roll 2 dice cho cả hai bên và xác lập kết quả; client chỉ phát animation, không cần người chơi bấm Roll hoặc ack. | PD |

### Monster, invariants và kết thúc game

| ID | Loại | Requirement | Nguồn |
|---|---|---|---|
| `RULE-18` | RULEBOOK | ATTACK chỉ nhắm Monster face-up và chỉ hợp lệ nếu Party đáp ứng requirement in trên Monster. Party Leader không phải Hero khi kiểm requirement Hero; một card không thỏa hai slot requirement cùng lúc. | RB-P2 |
| `RULE-19` | RULEBOOK | Roll đạt ngưỡng SLAY: đưa Monster vào Party. Roll thuộc range phản công: áp penalty in trên lá. Khoảng giữa: không có kết quả. Mọi outcome đều không hoàn 2 AP. Sau SLAY, lật Monster mới. | RB-P2 |
| `RULE-20` | PRODUCT | Nếu Monster penalty yêu cầu SACRIFICE Hero nhưng không có Hero hợp lệ, không phát sinh ảnh hưởng thêm. | PD |
| `RULE-21` | RULEBOOK | Leader không phải Hero; skill của Leader kích hoạt mỗi lần điều kiện xảy ra và phải dùng đúng thời điểm. Leader không thể sacrifice/destroy/steal/return. | RB-P2 |
| `RULE-22` | RULEBOOK | Monster đã SLAY cấp skill lâu dài như Leader skill và không thể steal/destroy/attack/return. | RB-P2 |
| `RULE-23` | RULEBOOK | Thắng khi SLAY 3 Monster; hoặc kết thúc lượt với 6 class khác nhau trong Party, tính cả Leader. | RB-P2 |
| `RULE-24` | PRODUCT | Với Monster thứ ba, authoritative state phải đưa Monster vào Party rồi conclude game; animation chỉ trình bày kết quả đó, không đưa Monster vào hand. | PD |
| `RULE-25` | PRODUCT | Main deck hết thì reshuffle discard pile thành main deck mới. | PD |
| `RULE-26` | PRODUCT | Effect/trigger xử lý theo thứ tự kích hoạt. | PD |
| `RULE-27` | PENDING | Khi nhiều trigger cùng thời điểm hoặc thứ tự “kích hoạt trước” không xác định duy nhất, engine phải dừng ở case chưa có ruling; QA cung cấp case cụ thể để owner quyết định. | PD |

## Handoff — gaps ảnh hưởng implementation

1. Simultaneous trigger ordering chưa có tie-break (`RULE-27`); cần case từ card index/QA.
2. Card-specific text, target, effect và roll requirement chưa verified; chưa thể coi engine effect coverage hoàn chỉnh.
3. Expansion setup/rules chưa nghiên cứu; `RULE-02` chỉ là capacity gate sản phẩm, không chứng minh expansion readiness.

