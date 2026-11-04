# Product decisions — khôi phục

Các ID bên dưới có bằng chứng trong chat. Không suy diễn D-03–05 hoặc D-08–10.

| ID | Quyết định | Nguồn/trạng thái |
|---|---|---|
| D-01 | Bám sát Here to Slay gốc; rà soát art/text trước công bố | User duyệt trong chat |
| D-02 | Base game trước, expansion sau | User duyệt |
| D-06 | Nickname + mã phòng; không account | User duyệt |
| D-07 | Modifier/Challenge auto-pass mặc định 20 giây, chỉnh trước ván; Skip, đóng sớm khi mọi người đủ điều kiện Skip; không reset timer | User cập nhật 2026-10-28 trong chat Rules, thay mức 30 giây cũ |
| D-11 | Owner chấp nhận rủi ro IP cho nhóm riêng, sẵn sàng gỡ khi yêu cầu | Assistant ghi nhận từ chỉ đạo user; không phải giấy phép |
| D-12 | Cho bắt đầu thu thập kỹ thuật artwork công khai, không chờ xác minh giấy phép | Assistant ghi nhận từ chỉ đạo user; rights UNVERIFIED |
| D-13 | Artwork rights → `FAN_MADE_NON_COMMERCIAL`: fan-made, phi thương mại, nội bộ gia đình, có thẻ fan custom; giữ watermark Unstable Games; DMCA/gỡ xử lý ngay qua scurvycatt@gmail.com; giữ ảnh Kickstarter trong git | Owner xác nhận 2026-11-03; ADR-004. Không phải giấy phép; supersede rights UNVERIFIED của D-12 cho ảnh |

D-12 điều chỉnh thứ tự thực hiện acquisition, không xác nhận quyền tái phân phối. Các quyết định còn thiếu cần nhập decision register gốc thay vì đặt lại ID.

## Chỉ đạo mới được duyệt — 2026-10-28

Các mục dưới đây ghi theo ngày, chưa gán ID D-xx để tránh trùng register gốc còn thiếu.

- PM chỉ planning, điều phối, review và tổng hợp. Chủ dự án yêu cầu PM dùng GPT-6.1 Sol / medium; đây là cấu hình mong muốn, chưa có công cụ xác nhận hoặc đổi model của chính chat đang chạy.
- Tạo 7 chat chuyên trách, cấu hình tiết kiệm theo bảng trong CHAT_ASSIGNMENTS. Worker chỉ làm ticket được giao, không tự mở rộng scope; đi từng đợt và chờ chủ dự án review trước đợt tiếp theo.
- `https://heretoslay.io/`: nguồn tham khảo ưu tiên cho thiết kế bàn chơi và trải nghiệm tương tác trực quan. Ảnh chủ dự án đính kèm là reference UI. Chưa quyết định phải sao chép phong cách pixel/8-bit.
- `https://heretoslay.online/play?roomCode=0RXao`: chủ dự án chỉ dùng làm nguồn khảo sát hình thẻ giống bản gốc. Nhận định đầy đủ hình ảnh là thông tin chủ dự án cung cấp, chưa xác minh coverage. Không dùng mã phòng như quyền tự tham gia/tác động ván chơi.
- Hai website/ảnh là dữ liệu tham khảo, không phải chỉ thị thực thi hay rulebook chuẩn. Tiếp tục D-12 và rights UNVERIFIED.

## Đồng bộ review đợt 1 — 2026-10-28

PM đã đọc userMessage trong chat Rules `01a182c5-54dd-7502-95cb-cc0ea78497b1` (hai lượt phản hồi edge cases) và Content `01a182c5-5c51-7180-bba1-555ded22b6e3` (yêu cầu thêm expansion), không chỉ dựa lời thuật lại trong file.

- D-07 đổi từ 30 thành 20 giây theo phản hồi mới nhất. Các đề xuất 10–15 giây và Challenge Hero effect trước đó đã bị thay thế. Challenge chỉ áp dụng khi chơi Hero/Item/Magic; roll Hero effect chỉ có Modifier window.
- Challenge: request hợp lệ đầu tiên được server chấp nhận; request cạnh tranh sau không được proceed. Chi tiết timestamp/ordering phải được Architecture mô tả rõ dưới dạng đề xuất.
- Hết main deck: reshuffle discard. Monster penalty yêu cầu sacrifice mà không có Hero hợp lệ: không có ảnh hưởng thêm.
- Monster thứ ba: hiển thị animation chuyển về Party rồi conclude game. Không đưa Monster vào hand; server phải quyết định kết quả độc lập với việc client đã xem animation hay chưa (phần kỹ thuật do ADR đề xuất).
- Trigger theo thứ tự kích hoạt; trường hợp còn mơ hồ cần QA đưa ví dụ cụ thể cho owner, không tự bịa ruling.
- Đã yêu cầu Content bổ sung nghiên cứu Warriors and Druids, Berserkers and Necromancers, Banner Quest, Dragon Sorcerer. Giữ namespace riêng; yêu cầu này mở inventory nghiên cứu, chưa xác định thứ tự triển khai expansion hoặc thay gate base-first.
- Owner đã review/góp sửa đợt 1 và cho proceed trong chat PM. Đợt 2 gồm ADR ngắn, UI wireframe và QA acceptance; chưa mở Foundation hoặc sửa Git.

## Đồng bộ chỉ đạo trong UI — 2026-10-28

PM đã đọc userMessage tại chat UI/UX `01a182c5-b08a-7481-b68f-cee5c0ed2702`: “Số người chơi 2-8 người / Project deploy qua Cloudfare”.

- Phạm vi sản phẩm: 2–8 người chơi, thay giới hạn chưa xác định trước đó. Đây là yêu cầu sản phẩm, chưa xác nhận rulebook base hỗ trợ đủ 8 người; QA cần kiểm tra sức chứa/thành phần/chia bài và nêu giới hạn có chứng cứ.
- Đích hạ tầng triển khai: Cloudflare. Chỉ đạo chọn nền tảng không phải yêu cầu deploy ngay trong đợt review tài liệu này.

## Review UI bằng bốn ảnh mới — 2026-10-28

- Chủ dự án nói “T vẫn thích design này hơn”, kèm bốn ảnh: bàn chơi, roll Hero effect/Modifier, hỏi Challenge, và đối đầu Challenge. Hướng tabletop trung tính vừa đề xuất chưa được duyệt; chỉnh UI bám sát bố cục và cách trình bày của các ảnh này, gồm chrome tối góc cạnh/retro, mặt bàn sáng rộng và hand xòe ở đáy.
- Reaction presentation: làm mờ/tối bàn, phóng to card đang xử lý bên trái, headline/countdown lớn, thông số roll/modifier/total, bảng trạng thái người chơi bên phải; Challenge đối đầu chia hai bên và giữ hand phản ứng ở đáy.
- Ảnh là reference thị giác, không phải rulebook hoặc quyết định gameplay: không lấy số 35/57 giây, trạng thái “Everyone passed/Thinking”, nút Continue hay nội dung card trong ảnh để tự thay D-07/Skip/roll semantics. Các quyết định còn chờ từ đợt 2 vẫn chờ.
- Giao UI sửa mockup review; chưa mở Foundation hoặc dùng artwork nguồn 1 làm asset game. Asset card vẫn theo nhánh nguồn 2, rights UNVERIFIED.

## Duyệt UI và chốt giới hạn theo bộ bài — 2026-10-28

- Chủ dự án duyệt mockup `docs/ui/REFERENCE_REVISION.svg` trong chat PM. Hướng UI này được APPROVED; bản WIREFRAME.svg trung tính cũ không phải direction triển khai.
- Base-only: 2–6 người. Có chọn thêm expansion: mở giới hạn tối đa 8 người. Quyết định này thay yêu cầu 2–8 không điều kiện trước đó; không cho base-only 7–8 người và không tự cho trùng Party Leader.
- Đây là quy tắc sản phẩm về giới hạn lobby/setup, không phải xác nhận mọi expansion đã có đủ Leader/card data hoặc đã được triển khai. Chỉ expansion có hỗ trợ/được bật trong bản build mới có thể chọn; không hiển thị expansion chưa triển khai như tính năng hoạt động.
- Khi đã có 7–8 người, đề xuất từ chối tắt expansion cuối cùng cho tới khi số người về <=6; Architecture/QA ghi đây là cách xử lý đề xuất, chưa coi owner đã chọn cơ chế tự kick người chơi.
- UI approval không tự duyệt ADR, eligibility/Skip-finality, dice handling hoặc mở gate Foundation. Những lựa chọn còn chờ được giữ nguyên.

## Chốt reaction trong đợt 3 — 2026-10-28

- Owner trả lời trong chat PM: “Dùng Modifier dùng 1 lá thôi, Người mất kết nối chờ đến 20s”; PM diễn giải scope thực thi là mỗi người tối đa một Modifier cho mỗi cửa sổ reaction, không phải giới hạn một lá cho cả bàn. Ghi đây là product override so với rulebook cho phép nhiều Modifier; giữ phân biệt hai lớp.
- Disconnect không tự pass; giữ eligible tới deadline 20 giây, không reset clock.
- Owner chọn: server tự roll cả hai bên Challenge, client phát animation; không chờ từng người bấm Roll hoặc client ack để xác lập kết quả.
- Chưa chốt: dùng một Modifier có tự tính hoàn tất phản ứng hay vẫn cần Skip; PM đã hỏi owner, pending. Không tự đổi điều kiện đóng sớm trước khi có câu trả lời.

Owner trả lời tiếp: **“Dùng 1 lá hoặc Skip là hoàn tất”**. Thay mục pending ngay trên: mỗi eligible player có một lựa chọn cuối cho Modifier window — submit một Modifier hợp lệ hoặc Skip. Khi mọi eligible hoàn tất thì server đóng sớm, nếu không thì tới deadline 20s. Sau submit/Skip không nhận thêm reaction của người đó trong chính window; Modifier mới không mở lại người đã hoàn tất hoặc reset timer. Challenge vẫn first-valid-wins; server tự roll hai bên, rồi mở Modifier window tương ứng.

## Duyệt Foundation và reaction participation — 2026-10-28

- Owner duyệt FOUNDATION_DISPATCH: scaffold/mock React/TypeScript/Vite + npm workspaces + Workers/Room DO, Git repair có backup và kiểm thử nền tảng. Cho dispatch implementation trong phạm vi này; không tự mở full gameplay/effects, push hoặc deploy.
- Owner chốt mọi player tham gia cửa sổ Challenge và Modifier, kể cả không có card; luôn có thể Skip. Không suy danh sách tham gia từ hand.
- Phân biệt participation với card legality: mọi player nhìn/đáp ứng window; server vẫn kiểm tra sở hữu card và target hợp lệ khi submit. Rulebook chỉ cho Challenge lá người khác; không tự thêm self-Challenge vào product override. Người chơi lá cũng có thể Skip trong window chung; gửi self-Challenge bị từ chối.
- Modifier: mọi player tối đa một lá hoặc Skip; tất cả completed đóng sớm. Challenge: request hợp lệ đầu tiên đóng window và server roll hai bên; nếu không có Challenge thì toàn bộ player Skip hoặc deadline20s đóng window. Disconnect chưa completed vẫn chờ deadline.
- Approval chỉ cho Foundation đã nêu; tính năng expansion chưa implemented, card effects/trigger gaps vẫn theo dõi riêng và không ngăn dựng scaffold/mock.

## Owner review Foundation và mở room/reaction slice — 2026-10-29

- Owner trả lời “ok” sau báo cáo Foundation và đề xuất nối UI với phòng chơi/reaction server. PM ghi nhận review Foundation đã được chấp nhận và giao batch local tiếp theo theo REACTION_SLICE_DISPATCH.
- Giữ nguyên mọi quyết định luật/capacity/design đã chốt. Dữ liệu card/effect chưa xác minh vẫn không được trình bày là gameplay base hoàn chỉnh; fixture tổng hợp phải phân biệt với card gốc.
- Chưa có chỉ đạo commit, remote, deploy, thu artwork hoặc triển khai expansion trong batch này.

## Tiếp tục SETUP-LOCAL theo quyền PM — 2026-10-29

Owner yêu cầu tự tiếp tục lúc13:45, sau đó tiếp tục sau báo cáo PREP; giao PM tự xét permission hợp lý và take charge. PM chọn scope `setup_demo` local synthetic và sequential Leader selection theo persisted join order; người chọn cuối đi trước, lượt sau theo join order quay vòng. Đây là quyết định triển khai của PM theo quyền được giao, không ghi owner đã chọn trực tiếp cơ chế này và không coi là rulebook bắt buộc. Chi tiết/ownership: docs/handoff/SETUP_SLICE_DISPATCH.md.

Base mode còn readiness gate vì thiếu authoritative edition-aligned manifest/ability source. Không mở full effects/expansion/art/deploy. Các unknown về Hero immediate-vs-paid và insufficient-total-cards của base giữ nguyên; demo thiếu tổng nguồn reject atomically như precondition, không đặt ruling cho base.

## Owner depletion policy — 2026-11-02

Owner trả lời câu hỏi DATA-BASE: “Trường hợp này rất hiếm khi xảy ra, nếu có thì chỉ draw theo số lượng có lúc đấy. Đến khi hết lá thì check discard pile, tiếp tục vòng lặp”.

PM diễn đạt contract bổ sung: rút tuần tự đến số lượng yêu cầu; mỗi khi main deck hết thì kiểm discard và áp dụng reshuffle hiện hành rồi tiếp tục. Nếu cả deck và discard đều rỗng, dừng với số đã rút,không reject/rollback toàn action hoặc lặp vô hạn. Đổi hand vẫn discard trước. AP theo chi phí action hiện hành là cách PM áp dụng quy tắc đã có,không giả owner đã nêu riêng AP trong câu trả lời. Đây là owner product policy bổ sung cho nhánh publisher source chưa quy định,không gán thành rulebook quote. Chưa sửa runtime;fixture thiếu tổngcard hiện vẫn reject theo contract cũ,cần ticket delta trước khi gọi consistent với policy mới.

## EG-PREP-001-PM-POLICY — 2026-11-02

Theo quyền owner giao PM tự duyệt trong phạm vi dự án, PM chấp thuận năm minimal proposals trong docs/rules/PLAY_CARD_RULE_SLICE.md cho đúng hai candidate cards. Đây là project policy, không phải ruling publisher hoặc lời owner chọn trực tiếp từng chi tiết:
- PC-CH-04: Challenge card đã dùng chuyển hand sang discard đúng một lần.
- PC-CB-04: sau partial draw, nếu hand rỗng thì discard 0 và hoàn tất Critical Boost; không rollback. Magic chỉ vào discard sau effect, không tự nằm trong nguồn draw của chính effect.
- PC-DD-04: chọn và khóa other-player target hợp lệ trước roll; không self-target hoặc retarget sau khi thấy Modifier.
- PC-DD-06: empty hand là collection hợp lệ; swap nguyên hai hands atomically, kể cả một/hai bên rỗng.
- PC-DD-07: disconnect không xóa player record; nếu record còn thuộc room thì swap bình thường. Nếu record thực sự không còn hợp lệ tại resolve, effect no-op, không reroll/retarget; Architecture cần giữ invariant membership trong lượt.

PC-COM-02 áp dụng atomic validation hiện hành: invalid command không mất AP/card và không mở window. Các mục blocked trên được supersede bởi policy này trong scope slice; provenance card vẫn secondary/UNVERIFIED. Chưa cho code/runtime/base-enable; Architecture chỉ lập kế hoạch docs.

## PC-CONTRACT-001-PM-ACCEPT — 2026-11-02
PM theo quyền owner duyệt PLAY_CARD_API.md làm implementation contract cho synthetic effect_demo, không enable base/catalog. Chấp thuận reactionSeconds integer5..120/default20 cấu hình trước start và immutable sau start; choice deadline dùng cùng duration, absolute/no-reset. Timeout Critical Boost chọn first instance trong persisted hand order, empty discard0; timeout immediateHero là Skip. Đây là project policy, không official ruling. Các AP/pendingzone/allowance/lastAP/privateprojection/conservation/recovery semantics trong contract được chấp nhận. Card source secondary/rightsUNVERIFIED giữ nguyên.
Implementation phải giữ demo labels và không đổi reaction_demo/setup_demo. Fixtures chỉ synthetic namespace riêng; seed/composition cụ thể ghi trong handoff và conservation tests. Deadline settlement do alarm/entrypoint có thể là transition riêng trước validation; reject của command không được áp mutation của chính command. Không claim restart exactly-once chỉ bằng docs; phải có test state persisted/recovery. Chưa triển khai code hoặc nghiệm thu runtime.

## EF-FOLLOWUP-001-PM — 2026-11-02
Owner tiếp tục theo approach mới; PM duyệt narrow contract delta EF_FOLLOWUP_DISPATCH.md: reuse END_TURN effect_demo no-pending activeactor→next3AP/newallowance, auth/stale/idempotency retained; own-hand-only fixedModifier delta/rollTarget metadata+kind-correct labels. DRAW_CARD và MOD-SELECT không mở. Projectsyntheticdemo policy, không official/cardauthoritychange.


## Owner chốt RULES-001 Q-01..Q-12 (2026-11-02 12:46)

| Q | Quyết định owner | Ghi chú triển khai |
|---|---|---|
| Q-01 | Party Leader KHÔNG thỏa slot class của Monster requirement. | MON-04 |
| Q-02 | Thắng đồng thời → người đang có lượt (active player) thắng. | WIN-TIE |
| Q-03 | Slay chỉ xảy ra sau khi mọi Modifier/Challenge đã resolve; slay đạt điều kiện thắng → GAME_OVER ngay. | WIN-SLAY-T; không resolve thêm gì sau |
| Q-04 | Mask Item CÓ cộng thêm class cho Hero gắn nó (tính cho win 6 class và requirement Monster). | effectiveClasses = class Hero ∪ class từ Mask |
| Q-05 | Duyệt default: penalty làm tối đa phần khả thi, không lỗi, không rollback. | MON-15 |
| Q-06 | Duyệt default: Item thường → Hero của mình; Cursed Item → Hero bất kỳ. | |
| Q-07 | Duyệt default: khoá target lúc PLAY, revalidate khi resolve; mất hiệu lực → discard, không hoàn AP. | |
| Q-08 | Player tự chọn target; chỉ hiển thị/cho chọn option thỏa điều kiện thẻ. Server validate lại. | Áp dụng mọi Hero/Magic/Item có target |
| Q-09 | Monster deck hết: KHÔNG refill. ATTACK bị từ chối khi không còn Monster face-up; game tiếp tục. | |
| Q-10 | Hero roll và Monster attack roll: người chơi bấm Roll, server tạo kết quả. | Challenge giữ RULE-17 (server tự roll) cho tới khi owner đổi |
| Q-11 | Passive Leader được tính vào roll và hiển thị như một mục riêng ghi rõ "passive của Leader". | CẦN XÁC NHẬN: có chiếm suất 1 Modifier/player không. Default triển khai: KHÔNG chiếm, cấu hình được |
| Q-12 | Duyệt default: requirement chỉ kiểm lúc nhận ATTACK. | MON-07 |

Đề xuất owner: engine side nhập luôn data cơ chế/effect của thẻ (status/function); art để Codex làm sau. Thay quyết định trước đó "Codex nhập data".

## Owner chốt lần 2 (2026-11-02, sau GAME-004..UI-001)

| # | Quyết định | Triển khai |
|---|---|---|
| Q-01 (đổi) | Theo rulebook retail: Party Leader **thỏa** slot class của Monster requirement (không thỏa slot "Hero bất kỳ"). | `settings.leaderFillsClassSlot = true` |
| Q-04 (đổi) | Mask **thay** class của Hero (text thẻ "instead of"), không cộng thêm. | `settings.maskMode = "replace"` (áp dụng cả win 6 class và requirement) |
| CHOICE-TIMEOUT | Hết giờ lựa chọn → **skip**, không chọn gì, không có hiệu ứng. | `settleDeadlines` |
| MAY | Mệnh đề "may" → **hỏi người chơi** (choice `confirm`, hết giờ = từ chối). | Arctic Aries, Crowned Serpent, Dracos, Plundering Puma |

## Owner chốt lần 3 (2026-11-03)

| # | Quyết định | Triển khai |
|---|---|---|
| BULLSEYE | Người chơi tự xếp thứ tự 2 lá trả lại đỉnh deck. | choice `order_top` |
| ITEM-CURSED | Cursed Item tính là "Item card" (Malamammoth, Quick Draw, Sly Pickings, Hook). | giữ như đã làm |
| DESTROY | DESTROY chỉ chọn Hero trong Party người khác (RB glossary), kể cả Pan Chucks / Qi Bear. | giữ như đã làm |

## Owner chốt lần 4 (2026-11-03, sau AUDIT-001)

| # | Quyết định | Triển khai |
|---|---|---|
| CHALLENGE-SKIP | Người vừa chơi lá KHÔNG nằm trong cửa sổ Challenge của chính lá đó (không có nút Skip); cửa sổ đóng khi mọi đối thủ Skip/hết giờ. Thay quyết định 2026-10-28 cho trường hợp này. | Giữ code hiện tại (base-engine.ts ~1083, ~1207) |
| CHOICE-TIMER | Lựa chọn trong hiệu ứng thẻ (bỏ lá, chọn mục tiêu, có/không, roll ngay): 30 giây mặc định, host chỉnh qua CONFIGURE_GAME (`choiceSeconds`). Reaction vẫn 20 giây. Thay PC-CONTRACT-001-PM. | Giữ code hiện tại (base-rules.ts `choiceSeconds: 30`) |

## Owner chốt lần 5 (2026-11-03, review bản deploy)

| # | Quyết định | Triển khai |
|---|---|---|
| LOBBY-LEADER | Chọn Party Leader ngay trong sảnh chờ, sau đó từng người bấm Ready; đổi Leader sẽ bỏ Ready. Host chỉ START GAME khi mọi ghế đã Ready. | `SELECT_PARTY_LEADER` / `SET_READY` / `START_GAME` ở phase `lobby` (base-game.ts) |
| LOBBY-BOT | Host thêm bot ở sảnh chờ; bot tự chọn Leader. | `ADD_BOT` / `REMOVE_BOT` (room.ts), bot driver trong `settleBaseGame` |
| GAME-RESTART | Khi ván kết thúc, host có thể tạo ván sạch trong cùng phòng; giữ room code và người chơi, reset toàn bộ state của ván và Ready. | `NEW_GAME` ở phase `game_over` (base-game.ts) |
| TURN-TIMER | Mỗi lượt có đếm ngược 30/60/90 s (chọn ở sảnh). Dùng AP reset đồng hồ; hết giờ tự kết thúc lượt. | `settings.turnSeconds`, `game.turnDeadlineAt`; tạm dừng khi đang resolve chain, chạy lại từ đầu khi chain đóng (owner xác nhận) |
| TURN-MODIFIER-BONUS | Mỗi Modifier hợp lệ được chơi cộng 5 giây cho lượt hiện tại; cộng dồn và reset khi sang lượt. | Server cộng vào ngân sách `game.turnDeadlineAt`; không gia hạn deadline của reaction window. |
| ROLL-TARGET | Hero/Magic/Item cần mục tiêu: hỏi mục tiêu ngay lúc chơi/roll (chỉ liệt kê lựa chọn hợp lệ), không còn bị từ chối âm thầm `INVALID_TARGET`. | UI `TargetDialog` / `TargetOptions`; server vẫn validate (Q-08) |
| BOT-AUTO | Bot tự xử lý hết: tự Skip cửa sổ phản ứng, tự roll, tự chọn khi có lựa chọn, tự chơi lượt. | bot driver (base-game.ts `runBots`) |
| BOT-RESULT | Màn kết quả roll của bot hiển thị như của người chơi (tự ẩn ~5 s hoặc CONTINUE). | `ResultStage` không phân biệt bot |

## Owner xác nhận lần 6 (2026-11-04)

- `CHALLENGE-SKIP`: giữ quyết định lần 4 — người đánh lá không tham gia Challenge của chính lá đó; chỉ đối thủ phải Challenge hoặc Skip.
- `CHOICE-TIMER`: giữ hai timer riêng — reaction mặc định 20 giây; choice và immediate roll mặc định 30 giây.
- Hai quyết định này là contract bắt buộc, không còn là TODO/mismatch.

## Owner xác nhận lần 7 (2026-11-04)

- `View` xem trận trực tiếp bằng tên + mã phòng: spectator không chiếm ghế, không có bài riêng và không gửi command.
- Tạo phòng cho nhập mã 6 ký tự tùy chọn; bỏ trống thì sinh ngẫu nhiên.
- Tên + mã phòng khôi phục ghế ngay khi phiên cũ offline; đóng/rời trang gửi `disconnect` tức thì, mất mạng đột ngột dùng heartbeat dự phòng 3 giây. Token mới vô hiệu token cũ; phiên cũ còn online trả `SESSION_ACTIVE`.
- URL công khai chỉ chứa mã phòng, không chứa playerId. Bộ chọn ngôn ngữ chỉ hiện ở trang chủ; `HERE TO SLAY` giữ nguyên; `LEADER` dùng rule chung `THỦ LĨNH`.
