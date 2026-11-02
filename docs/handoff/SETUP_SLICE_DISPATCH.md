# SETUP-LOCAL — implementation batch

Ngày 2026-10-29. Owner yêu cầu tiếp tục sau PREP và giao PM tự xét permission hợp lý. PM mở phạm vi local dưới đây; không gọi đây là owner đã chọn từng phương án kỹ thuật/gameplay.

## Quyết định phạm vi của PM

- Implement `setup_demo` synthetic, 2–6 người; base mode giữ readiness gate. Không dùng inventory secondary làm authoritative runtime catalog.
- Chọn Leader tuần tự theo join order đã persist; mỗi người một Leader không trùng, người chọn cuối đi trước; turn order tiếp theo theo join order quay vòng. Đây là lựa chọn số hóa do PM chốt theo quyền điều phối, không phải rule bắt buộc trong rulebook.
- Setup: host khóa lobby/mở selection; chọn đủ Leader rồi host start; server shuffle/deal 5/player, 3 face-up Monster. Dùng namespace `fixture.setup.*`, không abilities/effects.
- Turn: 3 AP; Draw1/1 AP, Redraw toàn hand/3 AP, EndTurn bỏ AP dư; hết AP tự sang lượt. Reshuffle discard khi cần theo quyết định có sẵn. Nếu tổng nguồn không đủ, reject atomically với stable error; đây là lỗi precondition của fixture, không đặt ruling cho bản base.
- Không triển khai Play/Hero/Attack/win/effects/expansion/art. Reaction demo hiện có phải tiếp tục dùng được qua mode riêng, không mở reaction fixture trong setup game.

## Tickets / ownership

| Ticket / owner | Phạm vi ghi | Input / đầu ra / nghiệm thu | Phụ thuộc |
|---|---|---|---|
| SL-01 / Architecture | packages/protocol/**, apps/worker/**, docs/architecture/** | PREP contract + dispatch; freeze typed DTO/commands/route vào SETUP_API.md trước, rồi implement state/guards/private projection/persistence/idempotency. Scope tests trong workspace riêng. Pass typecheck và tests liên quan; không sửa root deps. | Không |
| SL-02 / UI | apps/web/**, docs/ui/** | SETUP_API và SL-01 DTO freeze; mode picker/create, sequential selection, host start, private hand/turn/AP, Draw/Redraw/EndTurn + rõ synthetic. Pass web typecheck/build, giữ reaction flow. | SL-01 DTO freeze |
| SL-03 / QA | tests/**, docs/qa/** | SETUP_ACCEPTANCE + SETUP_API; server invariants 2/6, invalid/duplicate/auth/stale/retry/privacy/reload/atomicity/depletion; browser nhiều client Draw/EndTurn/selection và reaction regression. Báo PASS/SKIP đúng evidence mới. | SL-01/02 implementation |
| SL-04 / Content | docs/content/** | SETUP_DATA_READINESS/index/audit; xác minh hẹp publisher card-ID/copy/Leader ability nguồn hiện có hoặc nguồn official liên quan; ghi source/page/edition/status từng mục. Không art, không runtime catalog. | Độc lập; không chặn demo |
| SL-05 / Infrastructure nếu cần | root manifests/lock/CI, docs/infra/**, local runtime | Health-check/restart local service và báo URL; không đổi deps nếu không cần. | Runtime cần cho QA |
| PM | STATUS/RESUME/dispatch/decisions | Review, tích hợp tracker; chỉ mở việc trong batch này. | Các handoff |

Giữ worker/model/effort CHAT_ASSIGNMENTS. Prompt ngắn theo ticket/delta. Các worker không sửa tracker hoặc file owner khác. PM chờ freeze trước giao UI; QA chạy sau code ổn định. Mỗi handoff <=250 từ; nêu files/checks thật/blocker/bước kế. Không commit/push/deploy. MOD-SELECT deferred. Unknown effects không chặn Draw/EndTurn nhưng không tự đặt ruling. Source research không được mở thành đọc lịch sử/toàn repo. Usage checkpoint theo AGENTS.

## Checkpoint cuối lượt

Usage83%/5h,58%/tuần; worker idle, không dispatch mới. SL-01 implementation+SL-F01 guard fix có Worker14/14 và root setup5/5 PASS theo Architecture; SL-02 typecheck/build PASS. QA report vẫn pre-fix: root9PASS1FAIL1SKIP/live corePASS/configFAIL, chưa post-fix independent reverify; browser NOT RUN. PM residual UI: roster dùng leaderId ?? HAND count nên đã có Leader sẽ ẩn handCount; cần sửa trong SL-02 rồi QA browser. Không ghi final accepted trước các checks này.