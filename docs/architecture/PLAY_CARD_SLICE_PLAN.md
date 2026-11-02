# EG-PREP-001 — PLAY_CARD slice plan

Ngày: 2026-11-02. **Plan only**, không phải API freeze. Chỉ `Critical Boost` và `Dodgy Dealer`; source `secondary_discovery`, rights/text `UNVERIFIED`. Edge cases là **project-minimal**, không phải official rulings.

## State / flow / commands

Room giữ `pendingPlay`: `attemptId`, actor, `cardInstanceId`, locked target, phase và reaction/roll refs. Phase: `challenge` → `critical_boost_discard` hoặc `dodgy_roll_choice`/`dodgy_modifier` → `complete`; không cho attempt khác chen vào.

Commands dùng Bearer actor, `commandId`, `expectedRevision`: `PLAY_CARD`, `CHOOSE_CRITICAL_BOOST_DISCARD`, `CHOOSE_DODGY_DEALER_ROLL`; Challenge/Modifier/Skip tái dùng reaction contract. Invalid auth/turn/ownership/AP/phase/target reject atomically. Stale/idempotency giữ nguyên; replay không lặp move/draw/roll/swap. Play tốn 1 AP; last AP chỉ advance khi pending complete.

## Resolution

- Challenge success: attempted card discard, AP không hoàn; **PC-CH-04:** Challenge card cũng discard sau use.
- Critical Boost tiếp tục: Magic rời hand; draw 3 tuần tự theo partial-draw policy, rồi chọn một card hiện có để discard. **PC-CB-04:** nếu hand rỗng, discard 0 và complete.
- Dodgy Dealer tiếp tục: Hero vào Party; Skip hoặc immediate roll 9+. **PC-DD-04:** lock valid other-player target trước server roll. Success swaps entire hands atomically. **PC-DD-06:** empty hand valid. **PC-DD-07:** disconnected retained room record vẫn swap; missing record no-op, không retarget/reroll.

## Projection / invariants / QA gate

Snapshot chỉ lộ own hand IDs; others handCount, phase/actor/target/roll/deadline; không deck order/other hands/token. Bảo toàn instances qua hand/deck/discard/Party; swap không clone/drop.

QA: Challenge win/loss/first-valid/destinations; Critical full/partial/zero/impossible-discard; Dodgy skip/fail/success/self-target/empty/disconnect-retained/missing; stale/conflict/replay, last-AP, privacy, conservation. Dependencies: protocol/API delta, pending persistence, catalog authority review. Không mở full base, Leader triggers, MOD-SELECT, art/effects khác.
