# QA Foundation implementation review

Ngày: 2026-10-29 (Asia/Saigon)  
Owner: QA worker  
Phạm vi ghi: `tests/**`, `docs/qa/FOUNDATION_REPORT.md`  
Input: Foundation dispatch, `BASE_SPEC.md`, product decisions, Architecture/UI handoff, source hiện tại trong `packages/protocol`, `apps/worker`, `apps/web`  
Đầu ra: review source, hai root integration tests và bằng chứng chạy lại  
Phụ thuộc còn lại: browser automation có thể bind được local Chrome/Vite; full Worker/WebSocket integration chưa thuộc scaffold này.

## Kết quả ngắn

Protocol reducer/helper và Worker route tests hiện hữu chạy thành công. QA bổ sung:

- `tests/capacity-contract.integration.test.ts`: khóa biên base 1/2/6/7, expansion supported/enabled 7/8/9, expansion enabled nhưng unsupported vẫn giữ capacity 6, downgrade 7→base bị từ chối.
- `tests/worker-room.integration.test.ts`: dùng storage/clock mock để kiểm tra Room initialization persist, alarm sớm schedule lại, deadline resolve một lần và retry không tăng revision.

Hai test mới không phải Miniflare/live Durable Object. Chúng không chứng minh Cloudflare transaction/alarm thực, WebSocket, reconnect token rotation hoặc full gameplay/effect engine.

## Lệnh và bằng chứng

| Lệnh | Kết quả checkout hiện tại |
|---|---|
| `node --version` | `v24.15.0` |
| `node --test --experimental-strip-types packages/protocol/tests/*.test.ts` | PASS 10/10 |
| `node --test --experimental-strip-types apps/worker/tests/*.test.ts` | PASS 2/2 |
| `node --test --experimental-strip-types tests/*.test.ts` | PASS 2/2 |
| Một lượt gộp ba nhóm test trên | PASS 14/14; có warning `MODULE_TYPELESS_PACKAGE_JSON` cho hai root `.ts` tests, không làm command fail |
| `npm --workspace packages/protocol run typecheck` | PASS sau Infra install |
| `npm --workspace apps/worker run typecheck` | PASS sau Infra install |
| `npm run typecheck` (final, sau UI fix) | PASS; web + worker + protocol, exit 0 |
| `npm test` (final, sau UI fix) | PASS 14/14; 2 Worker + 10 protocol + 2 root integration, exit 0; root `.ts` warning như trên |

UI handoff ghi web typecheck/build PASS và PM ghi Worker dry-run PASS; QA không rerun build vì source không đổi. Hai attempt cũ xảy ra trước khi Infra restart stale Vite, nên không còn là evidence hiện tại. Final IAB reverify sau restart truy cập thành công `http://127.0.0.1:5173/`, title `Here to Slay — UI review mock`; F-01–F-03 được kiểm bằng click/state thật. Mobile dùng viewport 390×844 rồi reset; `scrollWidth === clientWidth === 375`, vertical scroll là expected, reaction heading/card/roster/controls/hand đều visible và roster có 6 player. Không phát hiện clipping hoặc horizontal overflow actionable trong viewport đã kiểm.

Screenshot evidence:

- [Modifier — đủ 6 completed](screenshots/foundation-modifier-all-completed.jpg)
- [Challenge prompt](screenshots/foundation-challenge-prompt.jpg)
- [Challenge versus](screenshots/foundation-challenge-versus.jpg)
- [Deadline closed](screenshots/foundation-deadline-closed.jpg)
- [Mobile modifier 390×844](screenshots/foundation-mobile-modifier.jpg)

## Findings actionable (tối đa 5)

### F-01 — P1 — Challenge prompt cho dùng Modifier

- File: source trước fix tại `apps/web/src/App.tsx:84`, `apps/web/src/App.tsx:91`.
- Trigger: chọn scene `Challenge prompt`, chọn player có `hasModifier=true`.
- Expected: Challenge window chỉ cho Challenge hợp lệ hoặc Skip; Modifier chỉ xuất hiện sau server roll hai bên.
- Actual: nút `USE 1 MODIFIER` được enable và có thể completed Challenge window.
- Source-fix evidence: code hiện tại tách `PLAY CHALLENGE`, disable actor/no-card, giữ `SKIP`, và chuyển sang `versus` (`apps/web/src/App.tsx:44`, `apps/web/src/App.tsx:59`); final typecheck PASS.
- Browser evidence: Challenge prompt không có nút Modifier; `You` không có Challenge và actor `Mica` đều bị disable `PLAY CHALLENGE` nhưng `SKIP` enabled; đối thủ `Sol` có Challenge được enable và click chuyển sang `CHALLENGE VERSUS` với copy server rolls/display-only.
- Status: **RESOLVED_BROWSER_VERIFIED** trong UI mock Foundation.

### F-02 — P1 — Deadline 0 không chuyển UI sang closed

- File: source trước fix tại `apps/web/src/App.tsx:45`, `apps/web/src/App.tsx:51`, `apps/web/src/App.tsx:85`.
- Trigger: để reaction countdown chạy từ 20 xuống 0 mà chưa all-completed.
- Expected: mock chuyển sang trạng thái closed/deadline; controls khóa và heading báo window closed.
- Actual: `live=false` khóa controls nhưng `closed=false`; heading vẫn hiện `0s` và copy như window còn mở.
- Source-fix evidence: code hiện tại set `closeReason="deadline"` khi `seconds===0` và render `WINDOW CLOSED · DEADLINE` (`apps/web/src/App.tsx:51`–`apps/web/src/App.tsx:54`); final typecheck PASS.
- Browser evidence: countdown quan sát `10s → 9s` qua Skip và Modifier, không reset về 20; tại deadline render `WINDOW CLOSED · DEADLINE` và `SKIP` disabled.
- Status: **RESOLVED_BROWSER_VERIFIED** trong UI mock Foundation.

### F-03 — P1 — Base 6 chỉ có 4 người trong reaction roster

- File: source trước fix tại `apps/web/src/App.tsx:6`, `apps/web/src/App.tsx:34`, `apps/web/src/App.tsx:90`.
- Trigger: chọn `Base seats = 6`, mở một reaction scene.
- Expected: cả 6 player, gồm người không có card, xuất hiện và phải Modifier-or-Skip/completed.
- Actual: `initialPlayers` chỉ có 4 record nên roster/all-completed chỉ tính 4, trong khi bàn vẽ 5 opponent.
- Source-fix evidence: fixture hiện có 6 player và roster slice theo capacity (`apps/web/src/App.tsx:7`–`apps/web/src/App.tsx:14`, `apps/web/src/App.tsx:32`); final typecheck PASS.
- Browser evidence: roster có đúng 6 player. `Mica` không có Modifier: Modifier disabled, Skip enabled và completed sau click. `You` dùng một Modifier xong thì cả Modifier/Skip disabled. Sau khi cả 6 completed, UI đóng sớm với `WINDOW CLOSED · ALL COMPLETED`; mobile 390×844 không có horizontal overflow và controls/roster vẫn visible.
- Status: **RESOLVED_BROWSER_VERIFIED** trong UI mock Foundation.

### F-04 — P2 — Assertion “second Modifier không consume” chưa kiểm được authoritative hand/discard

- File: `packages/protocol/tests/protocol.test.ts:204`; reducer tại `packages/protocol/src/index.ts:378`.
- Trigger: chạy test Modifier thứ hai.
- Expected coverage: Modifier đầu rời authoritative hand/đi discard; lá thứ hai bị reject và vẫn ở hand.
- Actual coverage: reducer nhận `hand` readonly và chỉ ghi submission; assertion `hand.length === 2` luôn đúng vì reducer không consume bất kỳ lá nào. Test chứng minh limit/state không đổi, chưa chứng minh card movement.
- Handoff: thêm integration assertion khi gameplay command được nối vào Room DO; không phải blocker của protocol scaffold hiện tại.

## Coverage theo yêu cầu Foundation

- Có assertion: one-Modifier-or-Skip/completed, no-card Skip, self/illegal Challenge, first-valid Challenge + server dice, `now >= deadline`, idempotent replay/conflict, cùng revision nhiều player, safe hand projection, base capacity và unsupported expansion.
- Root DO mock bổ sung persistence/alarm early/deadline/retry; đây là in-memory approximation, không phải Worker runtime integration.
- Chưa triển khai theo nhãn handoff nên không nâng thành blocker full-game: authenticated WebSocket, reconnect, gameplay dispatch vào DO, card effects/trigger ordering và expansion runtime.
- `docs/STATUS.md` chưa sửa vì PM giữ ownership tracker/integration.

## Handoff

Không sửa source finding, root manifest/lockfile hay package config; không install, commit hoặc deploy. F-01–F-03 **RESOLVED_BROWSER_VERIFIED** cho UI mock Foundation trên desktop IAB và viewport mobile 390×844. Đây không phải bằng chứng multiplayer/Worker integration hay full gameplay. F-04 tiếp tục theo dõi cho vertical slice khi authoritative hand/discard được nối. Source không đổi sau lượt test cuối nên không rerun 14 tests.
