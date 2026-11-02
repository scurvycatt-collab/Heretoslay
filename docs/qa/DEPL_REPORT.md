# DEPL-001 — QA report

Ngày: 2026-11-02 (Asia/Saigon)  
Owner: QA  
Phạm vi: `tests/**`, `docs/qa/**`

## Kết quả

**PASS.** Không có finding mới. Owner policy `RG-DEPL-01`–`06` được kiểm bằng workspace injected-state của Architecture và root public HTTP của QA; không suy policy này thành publisher ruling.

## Evidence

- QA targeted: `node --test --experimental-strip-types tests/setup-slice.integration.test.ts` — **5 PASS / 0 FAIL / 0 SKIP**.
- QA root gate: `npm run test:integration` — **10 PASS / 0 FAIL / 1 SKIP**. SKIP duy nhất là live reaction harness vì `REACTION_SLICE_BASE_URL` unset; không liên quan DEPL-001.
- Architecture handoff: Worker typecheck PASS, tests **14/14 PASS**, dry-run build PASS. Handoff xác nhận injected-state cover full/partial/zero, repeated deck-empty counter, Redraw discard-first, AP/turn cost, exact retry và conservation; QA không lặp workspace suite.

## Root acceptance

`tests/setup-slice.integration.test.ts` thay shortage expectation cũ bằng:

- conservation 115 main cards qua hands + main deck + discard;
- main còn 2 rồi Redraw: discard current hand trước, rút tuần tự main→reshuffle tới đúng 5;
- Redraw tốn 3 AP, auto-advance/no-carry; exact replay không double draw/AP/revision; changed payload trả `IDEMPOTENCY_CONFLICT` không mutation;
- main và discard cùng rỗng: Draw accepted với 0 card, revision/action AP vẫn resolve và terminate; replay/conflict giữ state;
- out-of-turn, stale, insufficient AP, auth/mode/capacity và reaction guards vẫn PASS trong root gate.

Public fixture luôn deal ít nhất 5/player và không có Play/discard riêng, nên root HTTP không tạo được Redraw hand `<5`/empty hand; nhánh partial này thuộc injected-state Worker 14/14 đã ghi trong Architecture handoff.

## Handoff

- Files: `tests/setup-slice.integration.test.ts`, `docs/qa/DEPL_REPORT.md`.
- Checks: targeted 5/5 PASS; root 10 PASS, 1 unrelated SKIP.
- Blocker: không có trong DEPL-001.
- Không browser/live/runtime restart; không commit/push/deploy.
