# AUDIT-001 — Independent QA of the base game engine

Branch `agent/qa/AUDIT-001`. Scope: `apps/worker/src/game/{base-engine,base-rules,base-game,setup-core}.ts`, `content/base-cards.json`, `packages/protocol/src/cards.ts`. **No engine/source code was modified**; only tests and this report were added.

New tests

| File | What |
|---|---|
| `apps/worker/tests/audit-fuzz.test.ts` | Seeded full-game simulation (default 300 games, 2–6 players), invariants after every transition. Env: `AUDIT_GAMES=n`, `AUDIT_SEED=s` (replay one game), `AUDIT_TRACE=1`, `AUDIT_OUT=file.json`. Known-bug registry `KNOWN_BUGS` (empty). |
| `apps/worker/tests/audit-rules.test.ts` | 12 deterministic rule-conformance tests (one per owner decision) + 2 `test.todo` for the mismatches below. |

## Part 1 — randomized simulation

### Method
Each game: random CONFIGURE_GAME (reactionSeconds 5–44, choiceSeconds 10–49, `leaderFillsClassSlot`, `maskMode`, 15 % `leaderPassiveUsesModifierSlot`), leader selection (Shadow Claw ban in 2p probed), START_GAME, then a policy picks a random legal command for whoever must act: turn actions (PLAY_HAND_CARD with generated legal targets, USE_HERO_EFFECT, ATTACK_MONSTER, DRAW, REDRAW, LEADER_ACTION, END_TURN), Challenge / Modifier (random value, side, Protecting-Horn `leaderBonus`) / Skip, IMMEDIATE_ROLL, and every pending choice kind (answered from the chooser's own projection `options`). Three play styles (slayer / builder / mixed) so both win paths are exercised. About 7 % of steps are deliberately illegal probes (wrong player, stale window/choice ids, double response, self-Challenge, Modifier/Challenge card played as a turn action, commands during a chain) which must be rejected with no state change; ~3.5 % of steps jump the clock to the next deadline and run the alarm path (`settleBaseGame`), plus 8 % choice timeouts. The harness mirrors the Durable Object: settle first, then apply, revision +1 per settle-with-change and per accepted command. Shuffle, dice and ids are seeded/injected (`seed = 1000 + i`, players = 2 + i % 5).

Invariants checked after every transition (command **and** settle): card conservation (115 main-deck + 15 monster instances each in exactly one zone: deck/discard/hand/party/attached item/pending-attempt/pending-Magic/monster deck/face-up/slain; no duplicates) · AP integer, ≥ 0, ≤ 3 (4 only for a Mega Slime holder), reset on new turn, never rises in a turn, only the active player spends it, turn auto-ends when AP ≤ 0 and nothing pending · turn order, heroRollsUsed reset · ≤ 3 face-up, Monster deck never grows / never receives a new id · hero roll at most once per (turn, hero) incl. immediate roll · Challenge window only for Hero/Item/Cursed/Magic, owner excluded, ≥ 1 pending responder while open, ≤ 1 Modifier per player per window · window deadline = creation time + reactionSeconds (choices: choiceSeconds) and never moves · a Modifier window closes early only when every other responder is done · Challenge outcome (tie → challenger → discard; defender win → Hero in Party) recomputed independently from dice+modifiers+passives · attack outcome (slay ⇔ total meets `slay`) recomputed independently · projection per viewer: no foreign hand ids, no deck / monster-deck ids, no `hand`/`mainDeck` fields, no token keys, handCount and yourHand correct, choice `options` only to the chooser (explicit allowance for the intended reveals Sharp Fox / Silent Shadow / Bullseye) · rejected command ⇒ byte-identical state; accepted ⇒ state changed · settle returns true iff state changed, and is a no-op before the deadline · no deadlock (any chain has a deadline; END_TURN always accepted in `turn_active` without chain) · GAME_OVER: winner = the player who was active, `slay_3` ⇒ ≥ 3 slain, jumped from exactly 2, previous chain was the attack Modifier window with every responder done or deadline passed (Q-03); `six_classes` ⇒ ≥ 6 distinct classes computed independently (Leader counted, Mask per setting); chain/queue cleared; no deadline; 9 kinds of command from all players return `GAME_OVER` and leave state byte-identical; settle 10 min later is a no-op; and the reverse (a player ending a turn with 6 classes, or anyone holding 3 slain, without the game ending, is a failure).

Mutation check (scratch copy, not committed): inverting Challenge tie, dropping the Modifier discard, and adding a `hand` field to the projection were each detected by the first seed.

### Results

| Run | Games | slay_3 | six_classes | turn cap (400) | stuck / livelock | invariant failures |
|---|---:|---:|---:|---:|---:|---:|
| Default (committed) | 300 | 141 | 159 | 0 | 0 | **0** |
| Extended (`AUDIT_GAMES=1500`) | 1500 | 769 | 731 | 0 | 0 | **0** |

Extended run: 1,372,621 steps; by player count slay/class = 2p 150/150, 3p 150/150, 4p 165/135, 5p 149/151, 6p 155/145; average 71 turns per game (max 269 in the 300-game run, so the 400-turn cap was never reached); 5,856 slays, 10,228 Challenges, 25,972 Modifiers, 24,368 immediate rolls, 36,988 deadline expiries, 4,620 choice timeouts, every choice kind exercised (`take_from_top`/`order_top` ~1.7–1.9 k each, `destroy_hero` 410). No believed-legal command was ever rejected (zero "anomaly" codes). Runtime: ~58 s for 300 games.

**Bugs found by the simulation: none.** The few failures seen while developing the harness (seeds 1002/1005/1007/1012/1033/1041) were harness errors (stale roll snapshot, class check taken before the party changed, window-closing command legitimately ending a chain) and were fixed in the test, not the engine.

Not reachable by random play (covered by deterministic tests instead): Monster deck exhaustion (Q-09) and simultaneous win candidates (Q-02). `KNOWN_BUGS` is empty, hence no `test.todo` for the fuzz.

## Part 2 — rule conformance

Read against `product-decisions.md` (later sections override earlier), `RULES-001_TURN_LOOP_SPEC.md` and `GAME_ROOM_API.md`. Items marked ✔ are asserted in `audit-rules.test.ts` and/or the fuzz.

| Decision | Result | Evidence |
|---|---|---|
| Q-01 (lần 2) Leader fills **class** slot, never "any" | ✔ | `base-rules.ts:meetsRequirement` l.88–117; `settings.leaderFillsClassSlot` default true |
| Q-04 (lần 2) Mask **replaces** class (win + requirement) | ✔ | `base-rules.ts:heroClasses` l.60–67; projection `classes` follows |
| Q-02 tie → active player | ✔ | `base-game.ts:checkSlayWin` l.267–274 (unit-tested with two 3-slain seats); class win is checked for the active player only |
| Q-03 win only after reactions resolve | ✔ | `resolveRoll` slays only at window close (`base-engine.ts:1376`); fuzz checks every responder done or deadline passed; `declareWinner` drops chain/queue, no refill |
| Q-09 no refill, ATTACK rejected when none face-up | ✔ | `base-engine.ts:1385–1389`, `base-game.ts:419` |
| Q-10 player presses Roll, server generates | ✔ (interpretation) | `USE_HERO_EFFECT`, `IMMEDIATE_ROLL`, `ATTACK_MONSTER` are the "Roll" commands and dice are drawn inside them; nothing is rolled by merely playing a Hero. There is no separate Roll step after ATTACK is declared — fine if "press Roll" = pressing Attack, to be confirmed by UI |
| Q-11 passive separate, switch default off | ✔ | `roll.passives` labelled "passive của Leader: …"; `leaderPassiveUsesModifierSlot` |
| Q-05/Q-07/Q-12 | ✔ | penalties do what they can (`openChoice` max 0 ⇒ skip); Item target revalidated, discard without AP refund; requirement not re-checked after the roll |
| Q-06, Q-08 | ✔ | `playTargetError`, `validateTargets` re-run at resolve |
| Choice timeout = skip, "may" = ask | ✔ | `settleDeadlines` l.1437–1442; every "may" is a `confirm` choice (timeout = `otherwise`/nothing) |
| Challenge only on Hero/Item/Magic, one per card, first valid wins | ✔ | window opened only from `openChallengeWindow`; second challenger → not accepted; no Challenge window for rolls/attacks/draws |
| 20 s windows not reset | ✔ | deadline set once at creation; playing a Modifier does not move it; new Modifier window after a Challenge gets its own 20 s (by design) |
| Hero once per turn incl. immediate roll | ✔ | `heroRollsUsed`; Skip does not consume the allowance, a roll does |
| G-03 last AP | ✔ | turn auto-ends once, after chain/queue empty |

### Mismatches / observations (no Critical/High found)

1. **MISMATCH-1 (Low, rule) — card owner cannot Skip the Challenge window.** `base-engine.ts:1083` builds `responders` without `attempt.actorId`; `pass()` (l.1207) then returns `NOT_ELIGIBLE` for the owner (verified). Decision "Duyệt Foundation và reaction participation" (2026-10-28): *every* player participates in the Challenge and Modifier windows, "người chơi lá cũng có thể Skip trong window chung; gửi self-Challenge bị từ chối". Expected: owner REACT_PASS accepted and counted for early close (or an explicit owner decision that the owner is not a participant). Actual: owner Skip rejected; window closes when all *others* passed. Gameplay-neutral for rules, but a UI that shows the owner a Skip button would get an error. `GAME_ROOM_API.md` ("any non-actor") agrees with the code, so one of the two documents needs the owner's call.
2. **MISMATCH-2 (Low, doc/contract) — choice and immediate-roll deadlines use `choiceSeconds` (30 s)** (`base-engine.ts:622, 664, 1272`), whereas PC-CONTRACT-001-PM says choice deadlines reuse the same duration as `reactionSeconds` (20 s). `GAME_ROOM_API.md` documents the 30 s split (MOD-005), so this is a superseded contract rather than a bug; the product-decisions file has no decision for it.
3. **Stale documentation (Info).** `base-cards.json` carries 15 provenance notes (first at l.341) saying "Leader does not fill a slot in engine by owner decision Q-01" — superseded by "lần 2"; `RULES-001_TURN_LOOP_SPEC.md` MON-04 / EC-07 / Q-01 still show the old default ("Reject"); `base-engine.ts:1417` doc comment for `settleDeadlines` still says "choice → first `min` eligible cards" (code correctly skips). No behaviour impact.
4. **Mega Slime** makes AP 4 on its holder's turns (`base-game.ts:207`); the "AP ≤ 3" invariant has this single, card-driven exception. Intended per card text, not in RULES-001.
5. **Data**: Dracos has inverted ranges (slay ≤ 5, penalty ≥ 8) — documented in the card's `notes` and unit-tested; engine classifies slay first. Looks odd but is sourced (S/J/L agree).
6. **Q-11 remains "CẦN XÁC NHẬN"** in product-decisions; default (does not occupy the slot) is implemented and switchable.

## What could not be checked
* Durable Object layer (`room.ts`: auth, idempotency receipts, STALE_REVISION, rate limits, persistence/recovery, disconnect handling, real alarm scheduling) — the simulation drives the pure game module with a harness that mimics settle-then-apply; the 30 integration tests cover the DO only on a small number of paths.
* Per-card effect *correctness* against the printed card text (data is secondary-source, rights UNVERIFIED); the fuzz proves effects never break conservation/privacy/turn flow, not that, e.g., Bear Claw matches the real card.
* Retail rulebook PDF (not accessible); RB-derived rules are taken from the repo's own spec.
* Disconnect-waits-until-deadline behaviour and 7–8 player expansion capacity (out of base scope).
