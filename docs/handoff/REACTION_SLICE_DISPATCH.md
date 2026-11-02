# Đợt room/reaction nối server — 2026-10-29

PM ghi nhận owner trả lời “ok” sau review Foundation và đề xuất nối phòng chơi/reaction phía server. Phạm vi đợt này là bản local có nhiều client chia sẻ state thật; chưa mở engine/card effects đầy đủ, expansion, artwork acquisition hoặc deploy.

## Đầu vào và quyết định kỹ thuật của đợt

- Foundation đã có source và checks: 14 tests, build/typecheck, local Worker smoke, browser QA cho UI mock.
- BASE_SPEC và quyết định sản phẩm: nickname + mã phòng, base 2–6, mọi player tham gia window, Skip không cần card, một Modifier hoặc Skip là completed, tất cả completed đóng sớm, 20s không reset, disconnect chờ deadline. Challenge chỉ lá người khác, first-valid-wins, server roll hai bên.
- Để giữ batch nhỏ, chấp nhận HTTP commands + personalized snapshot polling cho đợt local này; WebSocket/hibernation có thể triển khai sau. Đây là lựa chọn transport của PM/Architecture, không thay luật hoặc authority. Không gọi polling là WebSocket/realtime transport đã triển khai.
- Chưa có card text/effects chính thức đủ để chạy ván base. Bản reaction demo dùng fixture tổng hợp có namespace riêng `fixture.*`, được ghi nhãn demo rõ; không dùng tên/effect tự bịa làm card gốc. Dữ liệu fixture thuộc code/test, không đưa vào base manifest.
- Token identity do server phát, không phải account. Bảo vệ hand/discard và idempotency theo session; room code/nickname không được dùng thay credential. Đợt này cần reload/resume session tối thiểu, chưa tự hứa full reconnect/token-rotation production nếu chưa làm/test.

## Ownership và phân công

| Ticket / owner | Phạm vi ghi | Đầu ra | Nghiệm thu / phụ thuộc |
|---|---|---|---|
| VS-001 / Architecture | packages/protocol/**, apps/worker/**, docs/architecture/**, ADR liên quan | API contract sớm, room tạo/join/session/snapshot/commands; DO authoritative reaction, alarm, hand/discard, server dice | Giữ Foundation tests; bổ sung tests auth/isolation, capacity, deadline/idempotency/card consumption. Contract handoff trước UI integration; không sửa root/lock |
| VS-002 / UI/UX | apps/web/**, docs/ui/** | Nickname + create/join room, lobby và bảng/reaction dùng snapshot server; giữ design đã duyệt | Loại client tự quyết dice/timeout/completion ở mode nối server; nhiều tab nhận cùng state; giữ mock preview riêng nếu cần. Chờ contract VS-001; không ghi source backend |
| VS-003 / QA | tests/**, docs/qa/** | Kiểm nhiều session/client, hand privacy, state/idempotency/expiry/consumption và browser 2 tab | Tests assertion có nghĩa, runtime local Worker và browser evidence; báo finding cho owner, không tự sửa source |
| VS-004 / Infrastructure | Root tooling/lock/CI, docs/infra/**, runtime local | Install/root scripts nếu manifests đổi; chạy build/checks và Worker/Vite local có PID/log/HTTP proof | Chỉ owner này sửa root/lock; không install lúc source/manifests đang đổi. Không remote/deploy |

PM chỉ điều phối, review và tổng hợp STATUS/decision/handoff. Rules/Content/Assets chờ scope riêng. Không tạo chat/subagent thêm; giữ model/effort đã owner chọn cho từng chat.

## Luồng nghiệm thu nhỏ nhất

1. Client A tạo phòng bằng nickname; client B nhập nickname + mã vào đúng phòng. Nickname trùng/room sai/quá capacity phải có phản hồi rõ; không giả tạo player ở client.
2. Host mở một reaction demo có fixture được ghi nhãn. Cả hai client nhận cùng window ID và deadline server, riêng hand theo identity; client không được nhìn hand/token của người khác.
3. Người không có card vẫn Skip được; Modifier hợp lệ chỉ dùng một lần và chuyển khỏi hand vào discard trên server. Request trùng trả outcome cũ; payload khác dùng cùng key bị reject.
4. All-completed đóng sớm; disconnect không tự Skip; alarm/command tại deadline không resolve hai lần; Challenge đầu tiên hợp lệ được server nhận và roll, rồi mở Modifier window mới nếu flow fixture cần.
5. Reload dùng session hợp lệ trở về state hiện tại, không tạo ghế mới. Client tự gửi player ID/kết quả dice/deadline không thay được authoritative state.

## Kết thúc đợt

Kiểm tra scope local và trình owner review bản chạy được; ghi rành mạch phần fixture/demo, phần room/reaction thật và phần full gameplay còn thiếu. Không chuyển “done Foundation” thành “done game”.
