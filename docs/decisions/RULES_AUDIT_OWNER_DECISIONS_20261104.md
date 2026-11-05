# Owner-approved interaction contract — 4 November 2026

Latest delta: [5 November expansion owner contract](EXPANSION_OWNER_DECISIONS_20261105.md) overrides conflicting earlier rules, notably ordinary Item equip ownership and the named sacrifice exceptions. Grimoire modifies paid rolls only. Keep other C decisions unless explicitly changed; do not use C08 to block an approved printed-card retry exception.

Authority: the owner's numbered C01–C12 responses in this chat, followed by explicit clarification of C05, C08, and C10. This records project behavior; it does not claim new publisher rulings. Latest instructions here supersede earlier project decisions only for the cases below. No implementation, merge, or deployment is claimed.

Audit input: [review of main@7527f6b](../qa/RULES_AUDIT_20261104.md). Implementation owner: Claude. Document owner: Codex for this review. Shared board/priority remains with PM.

## Adopted rules and acceptance cases

### C01 — Required payment gates its dependent benefit

Owner approved the proposal. Entangling Trap requires the full discard payment before STEAL; Destructive Spell requires its discard before DESTROY. Timeout or incomplete payment must not grant the dependent benefit. Already spent AP and the Magic card are not refunded. Completed unrelated work remains completed; pending-card cleanup must still run.

Acceptance: full payment succeeds; insufficient cards or timeout does not grant STEAL/DESTROY; invalid/duplicate selections do not pay or resolve twice. Do not apply the mandatory-penalty fallback of C02 to an elective card payment.

Source wording: [Entangling Trap](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Entangling_Trap), [Destructive Spell](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Destructive_Spell). Timeout handling is owner policy.

### C02 — Mandatory penalties cannot be avoided by timeout

Owner approved the proposal: distinguish optional choices, required payments, and mandatory penalties. A mandatory sacrifice/discard timeout invokes a published server fallback over legal targets, rather than skipping the penalty. Resolve the possible part when insufficient legal targets exist. Optional `may` timeout remains decline; C01 payments remain gated rather than automatically paid.

Implementation recommendation, not a separately quoted owner choice: choose from persisted eligible-card order for deterministic fallback. Claude must document the exact order used, share legality with normal selection, and test it. Do not use future cards or invent a target when none is legal.

Acceptance: multiple/one/zero legal options; partial penalty; disconnect; Decoy Doll replacement; repeated alarm and state restore produce exactly one outcome.

### C03 — Resolve a child play before its parent continues

Owner approved the proposed order: a nested play resolves its Challenge, effect, and cleanup before the parent's remaining continuation. Snowball's second draw must not precede resolution of the Magic played through Snowball. Preserve pending cards and AP across nested choices and recovery.

Acceptance: Snowball → Destructive Spell; Orthus nested Magic; accepted/declined immediate play; successful/failed Challenge; last AP; restart mid-chain. Document conditional continuations explicitly rather than globally reordering every queue append.

Source: [Snowball](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Snowball). Adopted resolution ordering is the owner's project contract.

### C04 — Successful attack, reward draw, Monster award, win, then passives

Owner's explicit order overrides the earlier audit proposal:

1. Resolve the successful attack / SLAY instruction and its printed immediate DRAW reward, if that Monster has one.
2. After those operations complete, transfer the Monster to the player's Party.
3. Immediately check the win condition caused by receiving that Monster. If met, stop gameplay at this point.
4. Otherwise resolve applicable passive triggers and continue normal resolution/refill.

In particular, the third Corrupted Sabretooth slay still performs its printed reward DRAW **before** the Monster is awarded and the win is declared. Do not keep the audit's old recommendation to skip that reward on the third slay. No passive executes between that reward draw and Monster award. Eligible draw-trigger events must survive the deferred processing; avoid granting a newly acquired passive retroactive eligibility merely because trigger execution is delayed. Normal trigger eligibility follows when the triggering event occurred.

Engine invariant: while resolving success/reward but before award, hold the Monster in an explicit pending/resolving zone so it cannot be attacked again, disappear, or count as already owned. A terminal transition preserves card accounting and performs non-gameplay cleanup without running more gameplay effects.

Acceptance: first/second/third slay; third-slay reward draw happens before GAME_OVER; pre-award Party does not yet contain the Monster; award triggers immediate win; no subsequent passives/refill after win; empty draw sources; reward draw with pre-existing draw passives; restore/duplicate command at every boundary. Do not award a draw to Monsters whose printed success instruction does not include it.

Source: [Corrupted Sabretooth](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Corrupted_Sabretooth). This sequence is the owner's explicit decision, superseding previous Q-03 application where it conflicts.

### C05 — Titan Wyvern benefits its holder on either Challenge side

Clarified by owner: only the player who owns the slain Monster gains its bonus, on both their challenger roll and their defender roll. It does not buff an opponent's roll. The Fist of Reason remains challenger-only.

Acceptance: holder initiates Challenge; holder defends; nonholder gets no Titan bonus; both players independently own applicable bonuses; correctly sided totals and UI labels.

Sources: [Titan Wyvern](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Titan_Wyvern), [The Fist of Reason](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_The_Fist_of_Reason).

### C06 — Explicit public reveal, private inspection

Owner approved the proposal: reveal the selected qualifying card to all players and spectators while keeping other hand cards hidden. `Look at` remains private to its authorized viewer. Use a bounded reveal event/card payload that the UI can display, not a permanent exposure of the entire hand.

Presentation details such as exact display duration may be selected during implementation; they were not separately fixed by the owner. Specify a lifetime and retention limit and avoid permanent hand tracking by default.

Acceptance: Pan Chucks and Rex Major accepted/declined reveals; exact disclosed card; spectator visibility; unrelated hand privacy; bounded history; restore without duplicate gameplay.

### C07 — Quick Draw permits only a drawn Item

Owner explicitly chose Item-only. If both drawn cards are Items, the player may choose either one, but play at most one. A drawn Hero/Magic is not eligible through Quick Draw. Existing Cursed-Item-is-Item policy remains applicable. Equipping must satisfy C09 and have a legal empty Item slot. Playing remains optional.

Acceptance: Item + Hero offers only Item; two Items offer both but allow one; Cursed Item inclusion; no Item means no offer; no legal equip target means no invalid play; choose none is allowed.

The historical audit R06 test expecting the drawn Hero to be offered is **superseded and must not be implemented**. Reverse that expectation and add the two-Item selection case.

Source wording under owner interpretation: [Quick Draw](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Quick_Draw).

### C08 — PLAY grants an optional free roll; shared once-per-turn allowance

Owner confirmed: a Hero successfully PLAYed into the Party receives an optional immediate roll without additional AP, including a PLAY granted by another Hero's effect. Clarification: the same Hero may be attempted at most once per turn, including this free attempt; it cannot then be rolled again for 1 AP in that turn. An unsuccessful attempt still consumes the allowance. Skipping the free attempt does not consume it.

Do not infer a free roll from a generic STEAL/MOVE alone; an explicit effect granting a roll, such as Wiggles, remains a separate instruction subject to its applicable rules. Leaving/re-entering reset behavior was not separately decided here; preserve current behavior and do not silently introduce a reset.

Acceptance: direct PLAY and effect-granted PLAY; successful/failed free attempt blocks a subsequent paid attempt; free-roll Skip permits a later paid attempt; next turn resets; Challenge preventing PLAY gives no entry roll; no extra AP cost on nested Hero PLAY/entry roll.

Sources: [English rulebook](https://unstablegameswiki.com/images/7/73/Here-to-Slay-Rules.pdf), [Hero reference](https://unstablegameswiki.com/index.php?title=HtS_Hero_Card).

### C09 — Keep equip ownership; attached Items follow the Hero

Owner retained current behavior: ordinary Items → own Hero only; Cursed Items → any player's eligible Hero. An equipped Item follows its Hero on STEAL and goes to discard with its Hero on DESTROY, unless a specific replacement/effect explicitly changes that movement. Do not generalize normal Item attachment to opponents.

Acceptance: equip legality/occupied slot/Leader exclusion; STEAL transfers Hero+Item once; DESTROY discards both once; Decoy Doll and explicit Item-retrieval exceptions remain functional. Keep frontend, bots, data, and server legality consistent.

This equip restriction remains a project override; [Item reference](https://unstablegameswiki.com/index.php?title=HtS_Item_Card) provides the broader tabletop comparison.

### C10 — Multiple Modifiers, final Skip, fixed deadline

Owner approved multiple Modifier cards per player on the same roll. Clarification adopted:

- A valid Modifier play does **not** complete that player's participation; they may submit another legal Modifier before the deadline.
- Skip is final for that player in this window. Another player's Modifier does not reopen them.
- Close early only when every participant has Skipped; otherwise close at the original absolute deadline.
- Playing cards does not reset/extend the deadline. C12's all-humans-offline pause remains the explicit exception.
- Keep default reaction duration 20 seconds, configurable before the game; keep server card ownership/value/Challenge-side checks and idempotency.

Supersedes the former one-card-or-Skip-completed policy and the corresponding wording in AGENTS/old specs where conflicting. All players still participate in Modifier windows. Challenge remains first-valid-wins, excluding the player of their own pending card.

Acceptance: one player submits two or more distinct cards; duplicates/replayed requests never reuse a card; third parties modify either Challenge side; passives apply per qualifying card; played player remains pending until Skip; Skipped player cannot resume; final Skip closes early; last-moment submission/deadline race; no clock reset; bots eventually Skip. Review `leaderPassiveUsesModifierSlot`: a legacy one-card slot option must not silently complete a participant under the new rule. Do not invent replacement semantics for that legacy option; remove/deprecate it or propose an explicit migration before retaining incompatible behavior.

Source: [Modifier reference](https://unstablegameswiki.com/index.php?title=HtS_Modifier_Card). Skip finality and digital timing are owner policy.

### C11 — Forced Exchange selects the return Hero after a successful steal

Owner approved sequential behavior: attempt STEAL first; after success, select a Hero currently in the acting player's Party to move back to the victim's Party. The just-stolen Hero is eligible, so an initially empty Party is not itself a reason to reject the effect. If STEAL is blocked or fails, do not transfer a Hero back. Preserve the original victim as the return destination.

Acceptance: initially empty Party; choose an existing Hero or the just-stolen one; blocked STEAL creates no return choice/movement; attached Items follow; invalid return selection is rejected; duplicate/recovery does not repeat either leg. A required return-selection timeout uses the adopted mandatory-resolution fallback, rather than allowing a successful steal without its return leg.

Source wording under adopted ordering: [Forced Exchange](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Forced_Exchange).

### C12 — Only all-human absence pauses the game

Owner approved: a single disconnected player does not pause deadlines while another human remains present. When all human players are offline, pause the whole game, including bots, then resume with shifted deadlines preserving the remaining durations. Spectators do not keep the game active. Room expiry/recovery policies remain in force unless separately changed.

Acceptance: one/all humans offline; spectators only; human reconnect; bot turn; window/choice/turn timers; alarm retry; token rotation; preservation of remaining time without duplicated transitions. This is a documented exception to older blanket no-reset/disconnect wording.

## Claude merge plan — supersedes the audit's earlier gated plan

Do not reimplement already-correct behavior merely because it has a case ID. Branch from current origin/main and inspect only the relevant delta from audited `7527f6b`. No code changes or deployment are authorized by this documentation handoff itself beyond the user's existing work instructions.

| Stage | Owner / scope | Input → output / acceptance | Dependencies |
|---|---|---|---|
| **RA-00** | PM/Claude; this contract, decision links, acceptance specs | All 12 choices recorded. Replace historical R06 assertion with Item-only tests; retain C08/C09 safeguards. RA-00 decision gate is complete. | None |
| **RA-01** | Claude engine; `base-engine.ts`, `base-game.ts`, tests | C01–03 and C11: typed payment/mandatory outcomes, nested continuations, post-steal return choice and guaranteed cleanup. Restore/alarm replay tests at each boundary. | RA-00 |
| **RA-02** | Claude protocol/data/engine; card schema/JSON/validator, `base-rules.ts`, slay resolver | C04/C05: success reward separate from owned-Monster skill; explicit pending Monster; reward draw before award; award→win before passives; holder's Titan bonus both sides. | RA-01 for frame/event sequencing |
| **RA-03** | Claude engine/protocol/UI/bots; reaction state/projection, `BaseRoom.tsx`, tests | C06/C10: bounded public reveals, multi-Modifier participation with final Skip/fixed deadline, compatible persisted-state migration and bot completion. Retain C07–09. | RA-01; coordinate C04 trigger queue |
| **RA-04** | Claude QA; engine/room/integration/browser tests | Cross-case regression, privacy/spectators, disconnect/pause, stale/duplicate commands, restart/alarms, no pending-card loss; typecheck/build/test plus live two-human+bot review. | RA-01..03 |

Merge sequentially where files overlap. Any state schema change includes migration of old persisted windows/frames, including legacy `played` responders, and must not leave old windows stuck. Existing historical 138-pass evidence describes the old SHA only; rerun checks on the final correction checkout.

## Claude handoff prompt

Read docs/decisions/RULES_AUDIT_OWNER_DECISIONS_20261104.md first; it supersedes audit proposals. Audit baseline 7527f6b; inspect relevant newer main deltas. Implement sequential RA-01..04, preserving unrelated WIP. Key changes: unpaid benefits blocked; mandatory penalties fallback; nested child resolution; Forced Exchange returns only after successful STEAL; Monster reward DRAW before Party award, award→win stops before passives; holder-only Titan on either Challenge side; explicit public reveal; multiple Modifiers with final Skip and fixed deadline. Keep Quick Draw Item-only, shared once-per-turn Hero roll including free entry roll, and ordinary Item→own Hero. Reverse historical R06's broad selection assertion. Include state migration, replay/conservation/privacy/timer/bot regressions. Report checks on the final SHA. No deployment from this handoff.
