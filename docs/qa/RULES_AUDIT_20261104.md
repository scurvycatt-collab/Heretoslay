# Rules and interaction audit — main@7527f6b

**Owner decisions received after this audit:** [Approved C01–C12 contract](../decisions/RULES_AUDIT_OWNER_DECISIONS_20261104.md) takes precedence over the historical proposals below. In particular, C04 requires reward DRAW before Monster award and terminal win; C07 keeps Quick Draw Item-only (historical R06 is not a required fix); C10 now permits multiple Modifiers. C05/C08 and Skip finality were explicitly clarified. Use the new contract's merge plan and prompt; the original observations/test outputs remain historical evidence for the audited SHA.

Date: 4 November 2026. Owner: Codex, review only. Implementation owner proposed: Claude. Scope: base game; no gameplay changes, commits, merges, pushes, or deployment performed.

## Conclusion

Keep the existing server-authoritative room, command validation, idempotency, and reaction machinery. Correct the effect-resolution contracts in small dependent changes. Do not rewrite the whole engine or merge the glossary directly into runtime rules.

The current tests are green for the audited game suites, but targeted examples expose gaps in effect sequencing, conditional costs, Monster rewards, and card-specific behavior. Some gaps require a product/wording decision before implementation; a reproducible difference alone does not prove a publisher ruling.

## Baseline and evidence

- Reviewed commit: [`7527f6b30835089cc1a75c835bc92b76987770c3`](https://github.com/scurvycatt-collab/Heretoslay/commit/7527f6b30835089cc1a75c835bc92b76987770c3), GitHub `main` when this audit began.
- Workspace branch was `codex/card-render-import-workbench@2dcdcfb`, with unrelated uncommitted work. Local `main@791afb9` was 29 commits behind the reviewed commit. It was not used as the current backend baseline.
- Fetched Git objects and extracted a separate source snapshot under `tmp/rules-audit-7527f6b/source`. The active checkout was not switched, reset, rebased, or merged.
- Read current committed product decisions through owner confirmation 7, including lobby Leader selection, bots, turn timers, spectators, and recovery. Earlier STATUS text and earlier decisions are not treated as current contracts when superseded.
- Audited `base-engine.ts`, relevant `base-game.ts`/`base-rules.ts`/`setup-core.ts`, card schema/catalog, room command/deadline/projection paths, and frontend target/choice handling. This is not a complete visual/browser/deployed-Cloudflare audit or a fresh scan verification of every card.

### Checks actually run

| Check | Result |
|---|---|
| Existing base engine/catalog/rules suites | **64 passed**, including the existing 60-game fuzz test. |
| Broader game/room/protocol/integration selection on the pinned source | **138 passed, 0 failed, 0 skipped**, including the same 60-game fuzz test. These counts overlap; do not add them together. |
| New targeted review specifications | **6 failed at their intended assertions**. R01 and R06 are explicitly gated specifications; R05 specifies a stronger public reveal representation. They are not six equally certain official-rule defects. |
| New fuzz run detail | 60 games, 52,658 transitions, no violations of the existing invariant checks. This does not establish correct card semantics. |
| Full dependency install/build/typecheck | **Not verified**: offline install lacked a cached package; subsequent installation failed with npm's `Exit handler never called`. |
| Live browser / deployed Durable Object behavior | Not run. Room/integration tests use mock storage. |

The broader selection used a small Node `registerHooks` resolver to point `@here-to-slay/protocol` directly to the **same pinned snapshot's** `packages/protocol/src/index.ts`. This avoided accidentally testing against the active checkout's older workspace link. Node: v24.15.0. Earlier runs with incomplete snapshot fixtures/module resolution were setup attempts, not product failures; only the final corrected run supports the 138-pass result.

Evidence: [targeted specifications](RULES_AUDIT_20261104_REPRO.test.ts), [targeted output](RULES_AUDIT_20261104_REPRO_OUTPUT.txt), [verified game suites](RULES_AUDIT_20261104_BASELINE_OUTPUT.txt).

## Findings, ordered by consequence

All source paths and line numbers below refer to **7527f6b**, not the older active checkout. Permanent source links use that exact SHA.

### R01 — P1: an unpaid discard can still grant the following benefit

**Observed:** play Entangling Trap while holding two cards available for its discard. Let the discard choice expire. Neither card is discarded, but the selected opposing Hero is still stolen. The new test fails because the victim leaves its Party despite the unpaid step.

**Cause:** the effect is a flat queue: discard choice, then steal. Timeout clears only the current choice and resumes the remaining queue. `openChoice` also reduces required counts to the number available. The engine does not distinguish an optional choice, a mandatory penalty, an effect instruction, and a prerequisite cost.

**Source:** [`base-engine.ts:613`](https://github.com/scurvycatt-collab/Heretoslay/blob/7527f6b30835089cc1a75c835bc92b76987770c3/apps/worker/src/game/base-engine.ts#L613), `openChoice` at 638–673 and `settleDeadlines` at 1479–1505. Destructive Spell has the same structural risk.

**Policy gate:** owner decision says choice timeout means skip, no selection, no effect. It does not explicitly settle whether dependent benefits survive a skipped required payment. Do not silently replace this policy with automatic discards. Recommended clarification: an unpaid prerequisite cancels its dependent benefit while leaving unrelated completed effects intact. Mandatory penalties need a separate explicit timeout policy; under current policy, they can also be avoided by waiting.

**Fix direction:** introduce explicit payment results and dependent continuations. A global `min = available` or global `queue = []` is insufficient: the former grants benefits without full payment; the latter can drop unrelated effects and pending-card cleanup.

### R02 — P1: a nested Magic resolves after its parent's continuation

**Observed:** Snowball draws Destructive Spell and offers to play it. Accept, choose an opposing Hero, and close the Challenge window. Snowball's second drawn card is already in hand when Destructive Spell asks for its discard. The parent continuation executed before the nested Magic's effect.

**Cause:** the free-play choice puts `thenIfPicked` at the front, but `resolveAttempt` appends the Magic's steps at the tail of the shared queue. A nested effect is not isolated from its parent's remaining work. This also affects interactions through Orthus and can prematurely run parent discards/cleanup.

**Source:** [`base-engine.ts:955`](https://github.com/scurvycatt-collab/Heretoslay/blob/7527f6b30835089cc1a75c835bc92b76987770c3/apps/worker/src/game/base-engine.ts#L955), [`base-engine.ts:1340`](https://github.com/scurvycatt-collab/Heretoslay/blob/7527f6b30835089cc1a75c835bc92b76987770c3/apps/worker/src/game/base-engine.ts#L1340). Snowball's continuation is built at 526.

**Fix direction:** persist a resolution frame/continuation boundary. Resolve the child play, its Challenge, effect, and cleanup before resuming the parent. Preserve AP, absolute reaction deadlines, and exactly-once movement. A small prepend correction may repair this reproduction, but must be checked against pending Magic cleanup and other nested paths; do not globally replace every queue append.

### R03 — P1: Monster schema/resolution omits an immediate slay reward

**Observed:** successfully slaying Corrupted Sabretooth adds the Monster but draws zero cards. Its printed successful-attack instruction also awards a card. The reproduction expects hand size +1 and gets +0. This was checked against its [card entry](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Corrupted_Sabretooth) and the committed face image.

**Cause:** `MonsterCardData` models the success threshold, penalty, and persistent slain skill, but has no representation for an additional successful-attack effect. The resolver handles the slay and refill only.

**Source:** [`packages/protocol/src/cards.ts:75`](https://github.com/scurvycatt-collab/Heretoslay/blob/7527f6b30835089cc1a75c835bc92b76987770c3/packages/protocol/src/cards.ts#L75), [`base-engine.ts:1419`](https://github.com/scurvycatt-collab/Heretoslay/blob/7527f6b30835089cc1a75c835bc92b76987770c3/apps/worker/src/game/base-engine.ts#L1419).

**Fix direction:** add sourced `onSlay`/success instructions separate from the persistent slain skill. Add the specific verified reward and review the other Monster success boxes, rather than assuming every Monster grants a draw. Preserve Q-03: the third slay ends the game immediately; do not process additional gameplay after GAME_OVER. Test ordinary slay reward, empty deck/reshuffle, draw triggers, and the third-slay terminal boundary separately.

### R04 — P2: Titan Wyvern is restricted to the challenger branch

**Observed:** a defender holding slain Titan Wyvern receives no bonus. Its recorded wording refers to rolling for a Challenge card, while The Fist of Reason specifically refers to initiating a Challenge.

**Cause:** both bonuses sit under `kind === "challenge_challenger"`.

**Source:** [`base-rules.ts:152`](https://github.com/scurvycatt-collab/Heretoslay/blob/7527f6b30835089cc1a75c835bc92b76987770c3/apps/worker/src/game/base-rules.ts#L152). The [Fist of Reason entry](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_The_Fist_of_Reason) explicitly limits that Leader to the initiating player. Titan's wording was also inspected in its committed face image; its web entry could not be fetched in this run.

**Fix direction:** give each passive its own trigger predicate. Based on the different wording, Titan should cover both Challenge rolls; this is a textual inference, not a newly obtained publisher support ruling. Retain Fist of Reason's challenger-only behavior. Lock the expected rule with the exact edition/source in the correction PR.

### R05 — P2: Pan Chucks has no concrete public reveal representation

**Observed:** accepting Pan Chucks proceeds to a Destroy choice, but other viewers get no revealed-card payload/reference for the drawn Challenge. The queue checks that a Challenge was drawn and asks for confirmation, then moves directly to target selection.

**Source:** [`base-engine.ts:539`](https://github.com/scurvycatt-collab/Heretoslay/blob/7527f6b30835089cc1a75c835bc92b76987770c3/apps/worker/src/game/base-engine.ts#L539), `runStep(draw)` at 690–705; the private choice projection is in `base-game.ts:887–902`.

**Qualification:** the public confirmation prompt identifies the Challenge *type*, and the base game has one Challenge definition. The failing specification intentionally requires a concrete revealed card reference so viewers can see the reveal. It is evidence of a missing explicit reveal/UI contract, not proof that a physical card ID is required by tabletop rules.

**Fix direction:** a bounded public reveal event containing only the revealed card(s), with a clear lifetime. Keep inspection (`Look at`) private. Rex Major already logs a revealed card name; align the presentation without serializing the rest of a hand. Add positive reveal tests and negative privacy tests for other players and spectators.

### R06 — P2, wording gate: Quick Draw condition and selection use the same filter

**Observed:** drawing an Item and a Hero offers only the Item for immediate play. The [English card text](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Quick_Draw) checks whether either drawn card is an Item, then refers to playing one of the drawn cards. The implementation filters the offer to Items/Cursed Items.

**Source:** [`base-engine.ts:527`](https://github.com/scurvycatt-collab/Heretoslay/blob/7527f6b30835089cc1a75c835bc92b76987770c3/apps/worker/src/game/base-engine.ts#L527), 697–699.

**Fix direction:** separate `eligibility condition` from `selection pool`. Record the adopted interpretation first; the new test represents the broader reading and must not be treated as a publisher ruling. Even under that reading, a drawn Modifier/Challenge is not automatically playable as a normal Hero/Item/Magic play. Preserve reaction-only restrictions and Cursed Item inclusion.

## Baseline corrections and decisions before calling this “official mode”

1. **The English glossary overstates the free-roll rule.** It says the later paid activation is distinct from the entry roll, which can imply two attempts with the same Hero in one turn. Current source and an existing explicit test consume one shared allowance. The rule sheet's general once-per-turn language and the wiki explanation do not justify silently changing this implementation. Treat the glossary as an explanatory draft and resolve the exact rule/source before changing the allowance. The new glossary is not itself authoritative evidence.
2. **Normal Items:** the published category reference permits equipping another player's Hero; current code and Q-06 restrict ordinary Items to your own Party. This is a recorded product override, not an accidental regression. A strict-official profile would need a coordinated decision and changes to `playTargetError`, `resolveAttempt`, `canPlaySomewhere`, catalog equip metadata, frontend `ruleFor`/target options, bots, and tests.
3. **Modifier count:** tabletop rules allow multiple cards per player on a roll. Current one-card-or-Skip finality is deliberate owner policy. Keep it unless a strict-official profile is explicitly approved. Do not expand this into an engine rewrite in the bugfix PR.
4. **Timing and offline play:** reaction 20s, choice 30s, own-card actor excluded from Challenge, first-valid Challenge, turn countdown, bot pacing, and all-humans-offline pause are application policies. Current room lifecycle tests intentionally preserve pause/resume with shifted deadlines. Clarify that this is an exception to the older disconnect/no-reset wording; do not “fix” it from the glossary alone.
5. **Forced Exchange and target timing:** the implementation preselects an already-owned Hero for the return leg. Printed sequencing may allow choosing after the steal. Existing locked-target policy affects the answer. Resolve this card-specific question before changing target timing globally.

Publisher baseline: [English rule sheet](https://unstablegameswiki.com/images/7/73/Here-to-Slay-Rules.pdf). Supplementary references: [Hero](https://unstablegameswiki.com/index.php?title=HtS_Hero_Card), [Item](https://unstablegameswiki.com/index.php?title=HtS_Item_Card), [Modifier](https://unstablegameswiki.com/index.php?title=HtS_Modifier_Card). Wiki clarifications and imported face images are supplementary evidence, not automatically new publisher rulings.

## Recommended merge sequence for Claude

Start a correction branch from **current `origin/main`**, not the old local main or an asset branch. If main advanced beyond the audited SHA, review only the delta in the files named here before applying these findings. Preserve existing uncommitted work. No need to re-merge already integrated asset/UI branches or cherry-pick whole historical audit branches.

| Ticket / owner | Inputs and owned files | Output and acceptance | Dependency |
|---|---|---|---|
| **RA-00 / PM + owner** | This report; current decision register; glossary only where discussed | A compact rule matrix: publisher rule, current product override, unresolved point, adopted behavior. Resolve payment timeout; document free-roll ambiguity, Quick Draw, and profile scope. No gameplay change. | None. Does not block independent R03 preparation. |
| **RA-01 / Claude engine** | R01/R02; `base-engine.ts`, relevant `base-game.ts`; engine tests | Persisted effect frames/continuations, typed payment outcome, guaranteed cleanup. R01 follows approved policy; R02 becomes green. Add Destructive Spell, nested Orthus, Challenge success/failure, last-AP, serialization/recovery, conservation checks. | RA-00 for payment policy. |
| **RA-02 / Claude data + engine** | R03/R04; `packages/protocol/src/cards.ts`, content loader/JSON, `base-rules.ts`, slay resolution/tests | Sourced success-reward field and handler; separated passive predicates. R03/R04 green with documented rule source. Validate all 15 Monster success instructions. Defaults/migration for old persisted instances; third slay remains terminal. | RA-01 if reward triggers use the new frames; data/source preparation can precede it. |
| **RA-03 / Claude protocol + UI** | R05 and approved R06; protocol base snapshot, `base-engine.ts`, `base-game.ts`, `BaseRoom.tsx` | Public reveal event plus private inspection; eligibility separate from allowed selection. R05 and adopted R06 green. UI shows only server-authorized targets, including protection restrictions where applicable. Bots use the same legality helpers. | RA-01; approved R06 interpretation. |
| **RA-04 / Claude QA** | Merged correction branch; tests/integration harness | Restart during nested payment/reveal/Challenge; duplicate request, stale window/revision, concurrent responses, reconnect/token rotation, spectator privacy, deadline/alarm retry, all-offline pause, and bounded bot progress. No state duplication/loss; no timer extension except approved pause; exactly one AP/card movement per accepted operation. | RA-01..03. |
| **RA-05 / PM release review** | CI outputs, regression evidence, state migration notes | Merge only after required checks pass; inspect the final combined diff. State exactly what was tested and retain unresolved policy gates. Stage deployment separately with rollback/migration readiness. | RA-04. |

Use sequential PRs where the same engine file is touched. Keep data/presentation-only work independent until its integration point. Each PR should include its failing-before/passing-after case; avoid mixing a rule-profile change, assets, localization, and engine corrections in one merge.

The review tests live outside the normal suite intentionally. First adopt each rule, then move the applicable regression into maintained engine/integration suites. Do not simply merge the six failing specifications into required CI, mark them skipped, or weaken their assertions to get a green build.

### Required validation after corrections

- `npm ci`, `npm run typecheck`, `npm run build`, `npm test` on the actual correction checkout.
- Targeted corrected regressions plus the existing seeded fuzz. Keep an independent card-rule oracle; invariant fuzz alone will not detect omitted rewards or wrong order.
- Live local Worker/browser test with two humans and a bot; reconnect during a nested choice, spectator watching, deadlines crossing while a client is offline. Mock persistence tests do not prove production alarm behavior.
- Persisted state includes pending cards, frame-local choices/collections, payment outcomes, continuation order, and absolute deadlines. A restart must not replay draws, costs, or rewards. Terminal cleanup must preserve card accounting without continuing gameplay after GAME_OVER.

### Short prompt for Claude

> Audit baseline main@7527f6b; read docs/qa/RULES_AUDIT_20261104.md and its repro file. Rebase your understanding onto current origin/main by reviewing only relevant deltas. Preserve product overrides. First prepare RA-00's rule matrix and flag payment-timeout/Quick Draw/free-roll decisions; do not invent publisher rulings. Implement RA-01..04 as sequential scoped PRs: payment-dependent continuations and nested resolution, sourced Monster success rewards/passives, reveal/private projection and selection legality, then persistence/concurrency regressions. Preserve pending-card conservation, AP/idempotency, deadlines, bots, spectators, and third-slay terminal behavior. Run checks on the final checkout. Do not merge failing review specs into required CI without resolving their gates. Report failing-before/passing-after evidence and any unresolved contract. No deployment in this task.

No finite audit can guarantee a bug-free game. The proposed gate is reproducible rule behavior plus integration/persistence evidence, not the absence of test failures in a generic simulation.
