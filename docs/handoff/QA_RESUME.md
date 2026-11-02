# QA — handoff cho fresh chat

Owner QA, GPT-5.6 Sol/medium. Chỉ tests/**,docs/qa/**. Không source/root/tracker. Shared rules WORKER_MIGRATION_2026-10-29.md, AGENTS. Chờ PM ticket, không tự chạy checks onboarding.

Current SL-03: tests/setup-slice.integration.test.ts và docs/qa/SETUP_SLICE_REPORT.md. Contract docs/architecture/SETUP_API.md, scope SETUP_SLICE_DISPATCH.md; acceptance docs/qa/SETUP_ACCEPTANCE.md. Setup synthetic2–6,Leader sequential join-order,last selector first,deal5/3Monsters,3AP,Draw/Redraw/EndTurn,privacy/idempotency/atomicity/depletion/mode isolation.

QA PRE-FIX: targeted4PASS1FAIL; root9PASS1FAIL1SKIP(URLunset); live core create→join→selection→start→draw PASS, enabledSetIds create201 FAIL(SL-F01). Harness depletion viewer comparison đã sửa, giữ assertion. Architecture sau đó đã fix create allowlist nickname/mode, báo Worker14/14,typecheck và targeted setup5/5 PASS; QA độc lập chưa reverify. Không sửa report pre-fix thành final PASS.

Bước kế khi giao: post-fix affected root/live config probe; browser2 clients Leader options/duplicate disabled/roster handcounts/turn/AP/Draw/Redraw/EndTurn/reload và reaction regression. UI còn cần sửa handCount khi đã có Leader. Browser batch này NOT RUN. QA-DOC-01 ledger closed mức contract, effects chưa implemented.

Runtime lúc check Vite5173/PID19636,Worker8787/listener42708/launcher42752; health-check khi dùng. Dùng task-specific PowerShell variables, không $Host. Không commit/push/deploy; source secondary không thành authoritative.
