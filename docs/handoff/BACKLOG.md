# Backlog — chỉ đọc ticket được giao

## MOD-SELECT — chọn lá và lựa chọn trên Modifier

Trạng thái: DEFERRED theo owner ngày 2026-10-29. Không chen vào batch đang dở hoặc PREP-SETUP. PM xếp lịch sau; phải xử lý trước khi nghiệm thu Modifier của gameplay base hoàn chỉnh.

Hiện trạng đã đọc source: apps/web/src/App.tsx lấy yourHand.find(kind=modifier), tức lá đầu tiên, không random. apps/worker/src/room.ts fixtureHand cấp hai lá +1; fixtureTotals cộng một tổng. PLAY_MODIFIER trong packages/protocol/src/index.ts chỉ có windowId/cardId. Demo chưa đại diện đủ Modifier base.

Yêu cầu: người chơi chọn lá cụ thể trong hand; các lựa chọn giá trị/dấu trên lá và roll bị tác động phải theo luật được xác minh. Giữ tối đa một Modifier/player/window, dùng lá hoặc Skip là completed. Server kiểm card ownership/value/target và consume đúng một lần.

Thứ tự khi dispatch: Rules xác minh semantics bằng nguồn → Architecture chốt protocol/server → UI card/value/target picker → QA. Phạm vi file theo CHAT_ASSIGNMENTS; PM tích hợp tracker. Không sửa source trước khi ticket được mở.

Nghiệm thu đề xuất: hand có ít nhất hai Modifier khác cặp giá trị, chọn đúng cardId/giá trị hợp lệ; âm/dương và target trong Challenge theo luật; sai card/value/target bị reject; retry không consume hai lần; completed/Skip/closed controls đúng. Ghi PASS/FAIL/SKIP riêng cho fixture và card data verified.

Nguồn concern: owner nêu các lá như +1/−4 và +1/−1. Đây là ví dụ owner cung cấp, chưa phải xác minh inventory/card text.

## EF-TURN-001 — implemented/tested EF-FOLLOWUP-001; effect demo turn progression

Problem: after host plays both effects and last AP advances, guest owns only Challenge/Modifier/inert; UI has no legal play/paid Hero action or EndTurn. Observed PM IAB room ETA3C8 turn2/AP3. Source apps/web/src/App.tsx EffectRoom actions; apps/worker/src/room.ts isEffectCommand/applyEffectCommand and protocol EffectSliceCommand; PLAY_CARD_API currently defines only effect actions, not normal turn progression.
Requirements: keep synthetic two-card demo, no fullbase/catalog/other effects; provide legal END_TURN (and separately consider DRAW_CARD) for no-pending active actor so repeatable demo can progress. Unknown: whether draw is included in narrow follow-up; PM choose minimal EndTurn first. Dependencies PC-IMPL-BOTH baseline. Owners Architecture protocol/worker; UI web; QA tests; PM freeze contract delta. Acceptance: guest can end inert-only turn, next actor3AP/new allowance; reject wrong actor/pending/stale, replay once; both effects remain playable when held. No history sweep needed. Deferred because outside frozen effect commands; not full-game acceptance.

## EF-UI-001 — accepted EF-BROWSER-001 live review; fixed Modifier identity labels

Problem: EffectRoom renders a modifier whose fixtureDefinitionId contains challenge as CHALLENGE, and multiple PLAY MODIFIER buttons have indistinguishable labels without fixed delta/target. PM screenshot effect-demo-review-2026-11-02.png and App.tsx EffectRoom. State DTO currently has instanceId/fixtureDefinitionId/kind only; inspect fixture definitions in room.ts for exact mapping, do not invent values.
Requirements: kind-correct label plus fixed delta/roll target to make selecting existing fixture meaningful; no MOD-SELECT/multi-option engine. Unknown: minimal display metadata in DTO versus shared fixture mapping. Owners UI labels; Architecture DTO if needed; QA targeted selection/accessible-name case. Dependencies effect-demo DTO stable. Acceptance: modifier never labelled Challenge, each button identifies delta/target; existing kind/commands/privacy preserved. Deferred independent presentation work, source only listed files needed.

## EF-UI-CLEANUP-001 — accepted2026-11-02; remove superseded effect renderers

Current App.tsx renders EffectRoomV2 at effect_demo entrypoint, while previous EffectRoom and intermediate EffectEndTurn remain unused (around lines46–84). New behavior source-reviewed; no functional finding from this duplication. UI owner scope apps/web/src/App.tsx only; remove unused implementations/rename active renderer without behavior change when next touching this component. Unknown: none beyond confirming imports/references. Dependency EF-FOLLOWUP-001; acceptance one active effect renderer, no dead duplicate, webtypecheck/build. No broad refactor/history read or new engine scope.

## EF-BROWSER-001 — accepted PM live review2026-11-02; follow-up live UI acceptance

EF-FOLLOWUP-001 backend protocol11/Worker8/QA6/root16PASS1SKIP; webtypecheck/buildPASS, PMsource reviewed active EffectRoomV2 entrypoint/labels/completion/EndTurn. Browser NOTRUN thisdelta: existing IAB binding reload and reacquire known127.0.0.1tab both failed browser.user is unavailable. No runtime-restart/firewall/security attempts. PM owner when browser provider usable: existing effectroom guest inertturn→EndTurn→next3AP/newHeroallowance; Modifier kind/signeddelta/target/distinctactions; completed buttonsdisabled. Save screenshot/actualUI evidence. Need only cards/handoffs + liveUI, no broadhistory or oldtests rerun. Source/rights gates unchanged. If preview service unavailable, separate narrow Infra ticket; no daemon/retryloop.
