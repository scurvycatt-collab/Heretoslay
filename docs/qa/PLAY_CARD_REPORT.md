# PC-IMPL-BOTH — QA report

Ngày: 2026-11-02 (Asia/Saigon)  
Owner: QA  
Phạm vi: `tests/**`, `docs/qa/**`

## Kết quả

**PASS trong bounded independent coverage; không có finding.** Đây là synthetic `effect_demo`, không phải base/catalog/card-rights acceptance.

## Commands / counts

- `node --test --experimental-strip-types tests/effect-demo.integration.test.ts` — **4 PASS / 0 FAIL / 0 SKIP** sau assertion privacy cuối.
- `npm run test:integration` — **14 PASS / 0 FAIL / 1 SKIP**. SKIP duy nhất: live reaction harness vì `REACTION_SLICE_BASE_URL` unset.
- Root gate chạy trước assertion privacy cuối; targeted đã rerun sau delta và PASS. Không rerun toàn root vì chỉ thêm snapshot assertions trong test mới.

## Evidence đã chạy

1. Router/auth/privacy/idempotency: invalid Bearer, stale no mutation, exact replay, payload conflict, private hand IDs, personalized `youMustChoose`, conservation.
2. Critical Boost: full draw3; main1+discard1 partial2; zero source + empty hand discard0; chosen discard; Challenge win ngăn effect/Challenge loss tiếp effect; Magic final discard; AP giữ.
3. Dodgy Dealer: immediate Skip giữ allowance; paid roll dùng last AP, ≥9 swap và advance đúng một lần; immediate roll dùng allowance; raw `<9` không swap; empty-hand swap với target record còn persisted dù target không gửi thêm request.
4. Deadline/restart: Critical fallback first persisted hand instance và Dodgy fallback Skip; restart giữ state, settle đúng một lần, Dodgy không roll khi timeout.

Các source exhaustion/empty-hand scenarios dùng deterministic storage fixture control nhưng mọi action/observation đi qua router→Room HTTP envelope. Roll, clock, UUID, shuffle và restart được điều khiển độc lập với Worker tests.

## Chưa claim test

- Từng boundary create config/default, 2–6 capacity/mode gate.
- Modifier card làm thay đổi Challenge/Hero total quanh threshold.
- Locked target record bị xóa thật sự và no-op; test chỉ cover disconnected/non-participating target còn record.
- Restart giữa active Challenge/Modifier; hiện cover restart ở card-specific choice deadline.
- Live runtime/browser/UI; không cần cho ticket backend này.

## Handoff

- Files: `tests/effect-demo.integration.test.ts`, `docs/qa/PLAY_CARD_ACCEPTANCE.md`, `docs/qa/PLAY_CARD_REPORT.md`.
- Blocker/finding: không có trong coverage đã chạy; limitations ở trên còn PLANNED.
- Không sửa Worker/protocol/tracker/deps; không native Chrome/live restart/commit/push/deploy.
