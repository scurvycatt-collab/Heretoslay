# VS-001 room/reaction slice handoff

Ngày: 2026-10-29. Owner: Architecture. Phạm vi: `packages/protocol/**`, `apps/worker/**`, `docs/architecture/**`, ADR. Không sửa root manifest/lock, không install, commit, push hoặc deploy.

## Contract và source

Contract UI: `docs/architecture/REACTION_API.md`. Same-origin routes:

- `POST /api/rooms` — tạo room code server-side và host session.
- `POST /api/rooms/{code}/join` — nickname unique, base capacity 6.
- `GET /api/rooms/{code}/snapshot` — Bearer, personalized polling DTO.
- `POST /api/rooms/{code}/commands` — Bearer, `OPEN_REACTION_DEMO`, `PLAY_CHALLENGE`, `PLAY_MODIFIER`, `SKIP_REACTION`.

`@here-to-slay/protocol` export `RoomSliceCommand`, `ReactionSliceSnapshot`, validation/reducer/deadline helpers. Snapshot có `serverNow`, host/actor, own hand + hand count khác, reaction deadline/close reason, server Challenge dice và synthetic fixture totals. Token/hash/deck/hand khác không xuất hiện.

Room DO lưu SHA-256 session token, authoritative hand/discard, reaction, rate buckets và scoped idempotency trong storage transaction trước response. Reload bằng token không tạo ghế. Reaction fixture dùng `fixture.*`, nhãn `Reaction demo — fixture data`; modifier delta `+1` là metadata synthetic server-side, không phải base card effect và client không gửi value/dice/deadline. Challenge hợp lệ đầu tiên consume đúng một card, server roll hai bên rồi mở Modifier 20 giây. Một Modifier hoặc Skip hoàn tất; toàn bộ completed đóng sớm; deadline không reset; alarm/late command đóng một lần. Expansion command trả `EXPANSION_UNSUPPORTED`.

## Kiểm tra thực chạy

- Protocol typecheck: PASS; build: PASS; tests: **10/10 PASS**.
- Worker typecheck: PASS; tests: **10/10 PASS**.
- Worker Wrangler dry-run bundle: PASS, `30.84 KiB / gzip 7.29 KiB`, Room DO binding nhận diện; không deploy.
- Tests bao phủ auth/session isolation, duplicate nickname, capacity 6, reload, same-revision reaction, first-valid Challenge, server dice, idempotent retry/conflict, hand→discard đúng một lần, second Modifier không consume, close-all, exact deadline/alarm, body bound và polling 1 giây.
- Lượt Architecture chạy `wrangler dev --port 8790` bị sandbox `EPERM` trước startup. QA sau đó chạy live local Wrangler/DO **5/5 PASS** với quyền loopback; xem `docs/qa/REACTION_SLICE_REPORT.md`.

## Follow-up QA F-01

Đã sửa POST gateway forwarding trong `apps/worker/src/router.ts`: clone từ `Request` gốc với headers đã sanitize, thay vì dựng `Request` mới từ raw body stream cần Node-only `duplex`. Auth/method/body được giữ nguyên.

- Worker typecheck: PASS.
- Root `npm test`: PASS, exit 0; workspace Protocol/Worker **20/20 PASS**; root integration **5 PASS, 1 SKIP** vì `REACTION_SLICE_BASE_URL` không đặt.
- Ba gateway assertions trước đó bị F-01 chặn nay PASS: auth/profile isolation, authoritative discard/idempotency và concurrent Challenge/server dice.
- Node chỉ còn warning `MODULE_TYPELESS_PACKAGE_JSON`; không sửa root manifest vì ngoài ownership.

## Gap/handoff QA

Worker hiện dùng HTTP polling, chưa WebSocket/hibernation. Chưa có production token rotation, leave/host transfer, AP/full card-effect/win engine hoặc expansion. Root QA cần gọi envelope `{ outcome, snapshot }` và fixture IDs `fixture.*`; nếu schema cũ khác, báo PM/Architecture, không sửa backend ngoài ownership. UI/QA nên test hai tab qua routes trên sau khi local Wrangler chạy được.
