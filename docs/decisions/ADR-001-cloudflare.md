# ADR-001 — Cloudflare Workers + Durable Objects

- **Status:** APPROVED FOR FOUNDATION — stack/scaffold only; không phải duyệt full gameplay hoặc release
- **Ngày:** 2026-10-28
- **Phạm vi:** base game, nickname + mã phòng, 2–6 người; expansion được hỗ trợ và bật mới có thể nâng tối đa 8

## Bối cảnh và quyết định

Chọn Cloudflare Worker làm cổng HTTP/WebSocket và một `Room` Durable Object (DO) cho mỗi mã phòng. Worker chuẩn hóa/rate-limit request rồi định tuyến bằng DO ID từ mã phòng; DO sở hữu state, kiểm tra command, tạo event và phát view riêng.

Cloudflare mô tả DO là instance duy nhất, single-threaded, có storage transactional/strongly consistent. State quan trọng nằm trong SQLite-backed DO vì memory có thể mất khi hibernate/evict. Dùng Hibernation WebSocket API. Alarm là at-least-once và có retry, nên timeout phải idempotent.

Frontend/tooling tối thiểu **PROPOSED**: React + TypeScript + Vite, static assets qua Workers; chưa cần meta-framework hay SSR. Cloudflare có hướng dẫn chính thức cho React + Vite. Chia sẻ TypeScript schema giữa web, Worker và engine, không chia sẻ hidden state object.

## State, danh tính và bảo mật

- Mã phòng random đủ khó đoán, chữ hoa không nhập nhằng; lần access đầu khởi tạo room theo transaction. Nickname chỉ là display name, duy nhất trong room sau normalize.
- Khi join, server tạo `playerId` và reconnect token bằng Web Crypto. Chỉ lưu hash token; token không xuất hiện trong log/event. Reconnect đổi token và thu hồi token cũ. Room code không phải credential; rate-limit join/reconnect ở Worker và DO.
- Persist snapshot chuẩn hóa, `revision`, phase/deadline, event/audit tối thiểu, token hash và idempotency record. Mỗi command có `commandId`, `expectedRevision`; command trùng trả lại kết quả cũ, revision stale bị reject/resync. Persist state + outcome trước broadcast.
- Mỗi socket gắn server-side với `playerId`. Public event không chứa hand/deck order/reconnect token; server tạo personalized snapshot/delta, chỉ chủ hand nhận card IDs. Người xem khác chỉ nhận count.
- RNG là server-authoritative: shuffle/dice/token dùng `crypto.getRandomValues`, kết quả được persist cùng transition trước khi công bố; không nhận random/result từ client. Với Challenge, server tự roll cho cả hai bên; client chỉ trình chiếu animation và ack không chặn transition. Thuật toán unbiased mapping và audit format cần test ở Foundation.
- Expansion giữ namespace content riêng (`hts.<set>.vN...`). Server suy ra room capacity từ các set được hỗ trợ và đang bật: base-only tối đa 6; tối đa 8 chỉ khi expansion tương ứng đã được triển khai và bật. Foundation base-first chưa có expansion nên không unlock 8; ADR này không thiết kế effect expansion.

## Tính đúng và vận hành

DO tuần tự hóa quyết định của một room, nhưng handler vẫn tránh external `await` giữa read/validate/write. Transition ghi nguyên tử rồi mới gửi WebSocket. Alarm đọc persisted phase/deadline; nếu phase đã đổi hoặc `resolvedWindowId` đã tồn tại thì no-op. Nếu alarm đến sớm, đặt lại alarm cho deadline; nếu muộn, resolve ngay. Alarm lỗi có retry, và handler có thể tự đặt alarm mới sau lỗi đã bắt.

Monster thứ ba được server commit vào Party và commit `GAME_OVER`/winner trong cùng transition trước broadcast. UI có thể phát animation sau event, nhưng ack/hoàn tất animation không điều khiển kết quả và reconnect luôn thấy game đã kết thúc.

### Transport của VS-001

Slice room/reaction local dùng HTTP command và personalized snapshot polling cùng origin dưới `/api`; Vite dev proxy route này sang Worker. Đây là lựa chọn giới hạn batch, không thay mục tiêu Durable Object/WebSocket Hibernation dài hạn. Server vẫn giữ toàn bộ authority cho identity, deadline, dice, hand/discard và resolution; polling response luôn là projection theo session.

## Hệ quả và nguồn

Ranh giới consistency trùng với room, không cần lock/database chung. Đổi lại, một room bị giới hạn bởi một DO và protocol phải chịu reconnect/duplicate/alarm retry. Chưa chọn analytics, retention, observability hay deployment topology.

Nguồn Cloudflare chính thức, truy cập 2026-10-28:

- [Durable Objects concepts](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)
- [Rules/best practices for Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Workers web application frameworks](https://developers.cloudflare.com/workers/framework-guides/web-apps/)

## Điều kiện duyệt

- QA chứng minh duplicate/stale command, alarm retry, reconnect và hidden-hand isolation.
- UI dùng `serverNow` + deadline để trình chiếu countdown; không tự quyết timeout/result.
- Owner duyệt các lựa chọn reaction còn PROPOSED trong protocol trước khi khóa schema.
