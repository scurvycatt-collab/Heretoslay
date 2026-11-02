# SL-01 setup_demo handoff

Ngày: 2026-11-02. Owner: Architecture. Không sửa root deps/tracker, commit, push hoặc deploy.

## Files/output

- Frozen contract: `docs/architecture/SETUP_API.md`; reaction contract bổ sung discriminator `mode`.
- Protocol: typed `RoomCreateMode`, `SetupSliceCommand`, `SetupDemoSnapshot`, validation; reaction DTO/commands vẫn giữ.
- Worker Room DO: create mode; legacy room đọc như `reaction_demo`; `setup_demo` synthetic schema/state/private projection và exact-command receipts.
- Commands: `BEGIN_LEADER_SELECTION`, `SELECT_PARTY_LEADER`, `START_GAME`, `DRAW_CARD`, `REDRAW_HAND`, `END_TURN`.

Setup demo khóa join khi selection bắt đầu, chọn Leader tuần tự theo persisted join order, cấm duplicate, người chọn cuối đi trước. Server shuffle/deal synthetic `fixture.setup.*` (115 main, 15 Monster), hand riêng, 3 AP; Draw1/1 AP, Redraw/3 AP, EndTurn và auto-advance ở 0 AP. DEPL-001 rút tuần tự; deck hết thì shuffle discard và tiếp tục, cả hai hết thì dừng. Full/partial/zero đều accepted và giữ AP/turn cost; Redraw discard hand trước. Exact retries không lặp mutation; conservation được test. `reaction_demo` regressions vẫn pass. `base`/expansion/effects/art không được enable.

## Checks

- Protocol typecheck/build: PASS; tests **10/10 PASS**.
- Worker typecheck: PASS; tests **14/14 PASS**. Create chỉ nhận `nickname`/`mode`; expansion hoặc config/capacity bị reject trước khi cấp session.
- Root targeted setup integration: **5/5 PASS**.
- Wrangler dry-run build: PASS; Room DO binding nhận diện; bundle `44.23 KiB / gzip 9.64 KiB`; không deploy.

## Blocker/next

DEPL-001 code-ready; root `tests/**` thuộc QA nên chưa sửa. PM phối hợp QA thêm/rerun regression depletion. Base mode vẫn khóa bởi edition-aligned manifests/effects/art; không đổi DTO.
