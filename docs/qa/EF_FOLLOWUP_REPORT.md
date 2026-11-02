# EF-FOLLOWUP-001 — QA report

Ngày: 2026-11-02 (Asia/Saigon)  
Owner: QA · scope `tests/**`, `docs/qa/**`

## Kết quả

**PASS; không có product finding.** Independent router→Room assertions mở rộng trong `tests/effect-demo.integration.test.ts`.

## Checks

- `node --test --experimental-strip-types tests/effect-demo.integration.test.ts`: final **6 PASS / 0 FAIL / 0 SKIP**.
- `npm run test:integration`: **16 PASS / 0 FAIL / 1 SKIP**; SKIP duy nhất là live reaction harness vì `REACTION_SLICE_BASE_URL` unset.
- Targeted lần đầu 5 PASS/1 FAIL do các runtime test tái dùng IP namespace và chạm router rate limit 429; sửa harness thêm runtime serial, rerun green. Không phải product defect.

## Evidence delta

- Inert-only guest `END_TURN`: active actor only; bỏ AP cũ, next host có 3 AP, new turnId và Dodgy allowance fresh; conservation giữ.
- Wrong actor, pending play và stale reject không mutation. Exact replay không double-advance; changed command cùng ID trả conflict không mutation.
- Own-hand Modifier metadata đúng fixture: host actor/hero +1; guest challenger/hero +1. Challenge không có modifier field; hand đối thủ không lộ instance/metadata.
- Actor +1 thực sự đổi tie 8–8 từ Challenge success thành actor thắng và Critical Boost tiếp tục. Sau một Modifier, player completed; Modifier thứ hai reject và state giữ nguyên.

## Limitations

Không browser/UI/runtime live; UI verification thuộc owner UI/PM. Fixture hiện chỉ có `+1`, nên không claim negative delta rendering. Không thêm effects, option selection hoặc full-base behavior.
