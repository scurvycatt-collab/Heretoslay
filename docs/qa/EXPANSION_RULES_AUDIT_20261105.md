# Expansion interaction audit and owner review cases — 5 November 2026

**Later owner decisions:** [EXPANSION_OWNER_DECISIONS_20261105.md](../decisions/EXPANSION_OWNER_DECISIONS_20261105.md) supersedes conflicting proposals below. E01–E16 are adopted with owner changes: ordinary Items can equip any Hero; Maegisty/Decoy credit sacrifice; seven-Hero expansion cap; Brawling Spirit counts Heroes+Items only; independent Shaman popup; Grimoire changes paid rolls only. E09/[M01–M08](../rules/EXPANSION_MODIFIERS_REVIEW_20261105.md) is also approved: post-roll draw, final-total conditions, own-attack +4/-2, empty-hand +7 and separately paid ±6. The original audit is retained as historical source/implementation evidence; its earlier pending/immediate-effect proposals are not current instructions.

Scope: Warriors & Druids (WD), Berserkers & Necromancers (BN), Dragon Sorcerer (DS). Owner: Codex, research/review; proposed implementer: Claude. **No expansion behavior is approved by this document.** Existing [C01–C12 owner decisions](../decisions/RULES_AUDIT_OWNER_DECISIONS_20261104.md) remain the base contract, subject to explicit printed-card exceptions and the unresolved cases below.

## Baseline, evidence and limits

Pinned GitHub main: [`309c58b31760f8678a022ffaf155f8cf50832366`](https://github.com/scurvycatt-collab/Heretoslay/commit/309c58b31760f8678a022ffaf155f8cf50832366). Active workspace remained on `codex/card-render-import-workbench@2dcdcfb`; its unrelated WIP was preserved. Source was extracted to `tmp/expansion-audit-309c58b/source`; no checkout switch, merge, commit, push, or deployment.

**Runtime status:** `room.ts:274–277,1226–1230` explicitly rejects expansion configuration. These are unsupported features, not deployed expansion gameplay bugs. Newer main contains RA-01..04 base changes; the old audit's six failing assertions must not be presented as current failures.

Local asset manifests supply **84 source-face records**: WD 35, BN 33, DS 16. They say `gameplaySupported: false` and `definitionId: null`. These counts describe acquired face records, **not verified physical quantities** or new unique definitions across all sets. Some equally named Modifiers have different effects. DS faces select second edition; spelling aliases/earlier editions require mapping.

All 84 faces' rule regions were inspected using five temporary contact sheets, with originals preserved. [Per-card review matrix](../rules/EXPANSION_CARD_REVIEW_20261105.md) and [machine-readable evidence index](../rules/EXPANSION_CARD_REVIEW_20261105.json) retain names, source URLs, original hashes and case coverage. This visual review is not a production catalog certification: validate full faces, exact icons, edition, physical quantities and every schema field before enablement.

### Source hierarchy

- WD: [published English rules PDF location](https://www.unstablegameswiki.com/images/f/fb/Warrior-Druid-Expansion-Rules.pdf); [English expansion instructions reproduced on Unstable Games Wiki](https://unstablegameswiki.com/index.php?title=Here_To_Slay_Dragon_Warrior_and_Druid_Expansion_-_Expansion_Instructions).
- BN: [English expansion instructions reproduced on Unstable Games Wiki](https://unstablegameswiki.com/index.php?title=Here_To_Slay_Dragon_Berserkers_and_Necromancers_Expansion_-_Expansion_Instructions).
- Individual English card faces and wiki card entries, linked per case and in the 84-row matrix. Wiki clarifications are distinguished from card wording and publisher instructions.
- Direct WD PDF retrieval returned 403. No claim is made that this session downloaded/rendered the official PDF. DS-only and combined-set win thresholds were **not established by a publisher instruction retrieved here**. Blogs/Reddit assertions are not used to close those gates.

### Current-source gaps

| Area | Pinned source evidence | Expansion consequence |
|---|---|---|
| Enabled sets | `room.ts:277,1230` | No expansion deck/config integration. |
| Classes | `packages/protocol/src/cards.ts:6`; loader `HERO_CLASSES` | Only six base classes; five new classes need schema, validation, UI and matching. Dragon is not a separate sixth new class; DS uses Sorcerer. |
| Hero roll | `base-engine.ts:1520` uses `total >= threshold`; Hero schema stores only a number | Druids require an explicit lower-or-equal comparator. |
| Equipment | `base-rules.ts:8–10` uses `item: BaseCard | null` | Two-Item Heroes, exact Item selection and transfer bundles cannot be represented safely. |
| Activation | `base-game.ts` Hero guard; `base-engine.ts:1483` | A global used-Hero list needs card-specific repeat/retry exceptions. |
| Class win | `base-game.ts:277,303`, `six_classes` reason | Six is hardcoded; enabled-set profile and projection text need configuration. |
| Party limit | `base-engine.ts:30` sets six Heroes; play/steal/move guards at 865,878,1407,1430 | This new project cap affects revival, stealing, temporary entry and multi-step effects. It is not automatically an official expansion rule. |
| Reactions | Modifier schema has only options; Challenge schema no prerequisite/bonus fields | Expansion costs, follow-ups, special values and class-gated +3 Challenges require data and handlers. |
| Capacity | generic helper `protocol/index.ts:751–756` supports 6/8; `setup-core.ts:9` still six | Generic helper is not proof that real 7–8-player expansion rooms work. |

Source links for implementer: [schema](https://github.com/scurvycatt-collab/Heretoslay/blob/309c58b31760f8678a022ffaf155f8cf50832366/packages/protocol/src/cards.ts), [engine](https://github.com/scurvycatt-collab/Heretoslay/blob/309c58b31760f8678a022ffaf155f8cf50832366/apps/worker/src/game/base-engine.ts), [rules](https://github.com/scurvycatt-collab/Heretoslay/blob/309c58b31760f8678a022ffaf155f8cf50832366/apps/worker/src/game/base-rules.ts), [game](https://github.com/scurvycatt-collab/Heretoslay/blob/309c58b31760f8678a022ffaf155f8cf50832366/apps/worker/src/game/base-game.ts), [room](https://github.com/scurvycatt-collab/Heretoslay/blob/309c58b31760f8678a022ffaf155f8cf50832366/apps/worker/src/room.ts).

## Cases for owner review

Each case below is a proposed contract/test family, **not a claim of a failing implemented expansion**. "Source-backed" means the core printed behavior is known; integration/timeout/collision choices may still need approval.

### E01 — Enabled-set profile and victory threshold

**Sources:** WD/BN instructions above each specify three Monsters or **seven different classes at the end of your turn**, counting the Leader. With base plus all requested classes, the available class universe is eleven, not a requirement to collect all eleven.

**Proposal:** base-only stays six; a profile including WD or BN uses seven. Do not add one required class per expansion automatically. DS-only and all combinations need an explicit approved table rather than a guessed publisher ruling; proposed product default is seven whenever any requested expansion is enabled.

**Tests:** all eight subset profiles (base, three singles, three pairs, all three); six vs seven distinct classes; Leader/Mask inclusion; end-of-own-turn timing; third-slay C04 terminal sequence. **Decision needed:** DS-only/combined threshold table.

### E02 — Two Item slots belong to a printed Hero trait

**Sources:** WD and BN instructions permit two Items only on Heroes with the printed symbol; Cursed Items count. Each normal equip action still costs one AP; at most one title containing Mask on the same Hero.

**Proposal:** explicit per-definition equipment capacity, not `class === warrior/berserker`. Preserve that trait through Mask changes; a Mask must not grant a second slot to an unmarked Hero. Replace `item` with an ordered attachment collection, with stable IDs. C09 ownership restrictions remain in force. STEAL/DESTROY/return carry all attached Items unless a specific effect changes the destination.

**Tests:** eight visibly marked Heroes in this inventory; unmarked Warrior/Berserker; two ordinary/Cursed Items; second Mask rejection; one-item removal; Decoy Doll+another Item; class change; Luut stealing a selected attachment. **Decision:** approve printed capacity independent of effective class and the one-Mask interpretation across all Mask titles.

### E03 — Low-roll success, signed bonuses and scoped adjustments

WD Druid instructions explicitly use low successful rolls. A Druid Mask changes class; it does not rewrite another Hero's printed roll comparator. Rings and ordinary + bonuses are still additions and may hurt a low-roll attempt.

[The Noble Shaman](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_The_Noble_Shaman) has one optional -1 use on each player's turn. Majestelk supplies a signed five-point adjustment through the owner's next turn; its exact sign-choice timing needs a contract.

**Proposal:** persist `{op: gte|lte, value}` for Hero checks and show it in UI. Keep raw dice, Modifier sums, temporary buffs and passives separate. Shaman usage is once per game turn, not once per roll/window; do not reset by opening another window. **Decisions:** lock Majestelk's sign once or choose per roll; define optional passive interaction with final Modifier Skip.

**Tests:** Druid threshold−1/equal/+1; same dice with ± modifiers; modified totals outside 2..12; Mask on a non-Druid; Shaman on own/opponent/Challenge-side rolls; next-turn expiry vs current-turn buffs.

### E04 — Explicit extra attempts override the base allowance

Sources: [Bottomless Bag](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Bottomless_Bag) permits repeated paid attempts; [Goblet of Caffeination](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Goblet_of_Caffeination) offers an immediate retry after failure by sacrificing that Item. [Mirroryu's wiki clarification](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Mirroryu) allows selecting an already-used Hero, excluding Mirroryu itself; its +3 belongs to the selected Hero's new roll, not Mirroryu's qualifying roll.

**Proposal:** preserve base C08, but attach an explicit permission/retry token to the qualifying card effect. Removing Bag ends its repeat permission. New roll gets its own Modifier window; do not mutate/reuse the previous dice. Do not award repeat rolls merely because a generic Hero moved or was stolen.

**Decisions:** re-PLAY after a Hero leaves/re-enters in the same turn; interaction of temporary entry via Shamanaga with an already-used Hero. Do not treat a wiki clarification as a new owner-approved exception without recording it.

**Tests:** Bag repeated failures/successes/AP exhaustion; Bag+Temporal Hourglass can create long legal sequences—budget execution without silently deleting effects; Goblet sacrifice/replacement/fresh roll; Mirroryu two separate rolls, already-used target, no self-loop; reconnect midway.

### E05 — PLAY, bring, recover and temporary resurrection

Compare [Magus Moose](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Magus_Moose), which recovers to hand then explicitly PLAYs, with [Buck Omens](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Buck_Omens), which brings a Hero from an inspected hand. [Shamanaga](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Shamanaga) brings a discarded Hero, expressly rolls its effect, then sacrifices it.

**Proposal:** explicit PLAY uses the Challenge procedure and optional free entry roll under C08. Bring/STEAL/move alone does not emit a PLAY event or free roll; Shamanaga gets its printed roll instruction. Glowing Antler/Agile Dagger resolve up to two plays **sequentially**, with each child completely resolving before the next choice. Renovern's discard-to-play move must keep the card in one zone.

**Tests:** Challenge each explicit PLAY; no self-generated Challenge on bring; last AP; declined optional play; missing targets; Hero entry when Party capped; Shamanaga target moves/destroys itself, fails, or triggers a nested chain before scheduled sacrifice. **Decisions:** cap interaction and re-entry allowance are E15/E04, not assumptions here.

### E06 — Sacrifice is a payment or event, not just discard

BN instructions state that an effect's initial cost must be paid to use its remainder. Bone Collector sacrifices an **Item**, Perfect Vessel its **source Hero**, Grim Pupper a **card**, Rabid Beast a chosen number of **cards**. Do not hardcode every sacrifice/destroy as Hero-only. A generic operation still cannot affect an immutable Leader/slain Monster without a specific permitted effect.

**Proposal:** typed costs and actual paid-result events. Preserve C01: no paid cost → no dependent benefit. Preserve C02 fallback only for mandatory penalties, not elective payments. Reserve pending cards; selections cannot pay the same Item/Hero twice, especially when a sacrificed Hero takes attached Items with it. Actual sacrifice can trigger Feral Dragon/Doombringer/Silent Shield; a prevented or replaced event is not automatically that same event.

**Decisions:** whether a replacement by Decoy Doll/Maegisty fulfills each printed cost; whether a recovered card can be the just-sacrificed source; legal categories for generic Party-card costs.

**Tests:** Item-only vs Hero-only vs source-only costs; zero/partial payment; cost replacement; source self-sacrifice; two-Item Hero sacrifice bundles; per-card counts without duplicate targeting; recovery choices after payment; finite persisted choice chains.

### E07 — Replacement ordering, triggers and attachment cascades

[Maegisty](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Maegisty) replaces a would-be sacrifice/destruction with a return to hand until next turn. Soul Tether can cause another sacrifice, Cursed Glove can move an additional Hero after a theft, and Luut steals an Item independently of its Hero.

**Proposal:** persist cause→replacement→final movement→trigger events. Carry attachments according to the final event. Do not fire DESTROY or SACRIFICE listeners if the final operation was RETURN; do not call a generic MOVE a STEAL. Stop a self-referential Soul Tether chain when its source/target is no longer eligible.

**Decision needed:** priority when Maegisty, Decoy Doll and Corrupted Sabretooth all could replace an event; whether the acting player chooses among competing replacements. This is not established by a card image alone.

**Tests:** each replacement alone and in pairs; source leaves play; simultaneous/multi-target events; recovery during a cascade; Item movements; no duplicate disposal, recursion or stale passive use.

### E08 — Class-gated Challenge cards and new classes

Sources: [Warrior](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Warrior_Challenge), [Druid](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Druid_Challenge), [Berserker](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Berserker_Challenge), [Necromancer](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Necromancer_Challenge), [Sorcerer](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Sorcerer_Challenge). Each has a printed class prerequisite and +3 to its own Challenge roll.

**Proposal:** schema fields for prerequisite and intrinsic Challenge bonus; server checks card possession and current eligible class before consuming the first valid Challenge. Keep passive/Modifier bonuses separate; +3 is not an extra Modifier play. Effective Mask class participates where the rule permits.

**Decision needed:** whether a same-class Party Leader alone satisfies these Challenge prerequisites. Wiki annotations say Hero in Party, while the face uses a class glyph; do not silently import Monster-slot Leader rules.

**Tests:** no qualifying class/only Leader/actual Hero/Masked Hero; challenger only +3; expired or duplicate request; failed prerequisite never consumes the card or wins first-valid arbitration; eligible responders still include players without cards.

### E09 — Modifier variants, costs, follow-ups and disabled reactions

WD Modifier faces with base-like labels have extra behavior: +1/-1 draws two, +2/-1 draws one, +4 can draw above twelve, -4 can retrieve below two. BN +2/-2 has an attack-specific +4 instruction; [BN +7](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Modifier_%2B7) discards the remaining hand. DS ±6 requires another discard. Numeric value/label is not sufficient identity.

**Proposal:** set+definition identity and a Modifier resolution pipeline (reserve card, pay, adjust selected roll, emit allowed follow-ups). Retain C10 multiple plays, final Skip and fixed reaction deadline; new draws do not reopen a Skipped participant. Stagguard/Shadow Saint prohibit opponents' Modifier cards, not every possible Leader/passive effect. Biggest Ring Ever and Fearless Flame are paid abilities, not Modifier cards.

**Decisions:** threshold follow-ups use the total immediately after that card or final window total; BN attack +4 replaces both printed choices or only an applicable choice; whether reaction windows pause for mandatory/optional draw follow-ups while preserving their absolute deadline. Recommend no deadline reset, final Skip retained, explicit causal event processing.

**Tests:** same-name variants coexist; additional costs cannot use the played card; +7 with empty remaining hand; effect-drawn new Modifier before deadline; follow-up after final Skip; blocking effects/expiry; Challenger-side vs defender-side; C05 Titan unaffected by a Modifier-card prohibition.

### E10 — AP gains, changed action costs and last-AP continuations

Temporal Hourglass, Unbridled Fury, Beast Call and Smok can grant an extra AP. Soulbound Grimoire changes the equipped Hero's effect-roll AP cost. Gnawing Dread has a once-on-own-turn two-AP recovery action.

**Proposal:** explicit AP grant events and an action-cost resolver; don't end a turn at AP zero until its queued effects, additional AP and choices finish. Each AP-grant trigger resolves once; no retroactive refund of an unrelated action.

**Decisions:** Grimoire on free entry rolls/Goblet retries/Mirroryu-granted rolls; interaction of Bag's printed one-AP repeat with Grimoire's two-AP text. These require a precedence rule, not a guessed arithmetic sum. Current main also has a turn-timer +5-second-per-Modifier policy; preserve it unless owner changes it, without extending the reaction deadline.

**Tests:** AP zero→gain→same turn; no gain→one turn advance; cost rejection atomicity; fail-trigger AP; newly received Monster skill once action; Bot uses actual costs and eventually yields.

### E11 — Exchange Party Leaders despite base permanence

[Dystortivern](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_Dystortivern) explicitly trades Party Leaders. This specific exchange is not generic STEAL/DESTROY/return. [Fearless Flame](https://unstablegameswiki.com/index.php?title=Here_To_Slay_-_The_Fearless_Flame) has an optional discard for a +1 on its holder's roll.

**Proposal:** exchange two existing unique Leader instances atomically. Recompute class/skills for each Party; do not copy Leaders or move hands. Preserve a roll's previously established bonus snapshot unless the approved timing model says otherwise.

**Decisions:** usage counters when a once-per-turn Leader has already been used and is exchanged; whether a player can choose newly gained Leader skills in a still-open chain; Shadow Claw's two-player setup ban vs a possible in-game exchange. Gate configuration rather than inventing a rule.

**Tests:** class-win at own turn end after exchange; old skill gone/new skill available at the approved time; Leader uniqueness; once-use swap-away/swap-back; reconnect and replay cannot duplicate Leaders.

### E12 — Dragalter copying a Modifier's effect

[Dragalter](https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_Dragalter) discards a Modifier and applies its effect to rolls for the remainder of the turn. Base numeric-only cards are simpler than expansion cards containing draws, conditional effects and discard requirements.

**Do not implement by parsing a label or re-PLAYing the discarded card on every roll. Decision needed:** copy only the numeric selected adjustment, or all qualifying effect instructions? When choosing a dual-sign card, is the sign locked or chosen each roll? Are copied costs repeated? Do effects triggered by PLAYing a Modifier fire when no Modifier is being played? No publisher ruling resolving these combinations was retrieved here.

**Tests once decided:** base numeric card, two-option card, WD draw/threshold variant, BN context-dependent +4, +7 discard-hand, DS ±6 cost; several rolls and both Challenge sides; expiry; no duplicated discarded card; privacy/conservation.

### E13 — Free attack, direct slay and Monster-row manipulation

Big Buckley explicitly retains the target Monster's Party requirement for its free attack. Vicious Wildcat directly slays a Monster then ends the turn. Beast Call reorders the available Monster row through the deck and reveals replacements.

**Proposal:** distinguish ATTACK (requirement+dice+attack passives) from direct SLAY (no invented Monster attack roll). Propose Wildcat targets a currently face-up Monster; no attacking/slaying an already-owned Monster or selecting hidden deck contents. Preserve approved C04 reward→award→win→passives ordering. Raging Manticore's two draws are a Leader passive, separate from a Monster's printed success reward; terminal award stops before that passive.

**Decisions:** Wildcat target scope/requirement exemption; exact location of end-turn relative to nonterminal slay passives; Monster-row bottom ordering when multiple cards move. Do not infer that Wildcat skips the separate award/win lifecycle.

**Tests:** Big Buckley free attack has no 2-AP charge but still checks requirements; Wildcat third-slay terminal; fewer than three replacement Monsters available; Beast Call bottom order; pending Monster cannot be retargeted; replay applies reward/award once.

### E14 — Trigger scope, privacy and expiration

Feral Dragon responds to any player's actual sacrifice; Doombringer to its holder's; Silent Shield distinguishes acting sacrifice/destruction; Piercing Howl counts equipped Items. Noble Shaman resets each player's turn, Muscipula Rex/Gnawing Dread only on their holder's turn, while Maegisty/Majestelk expire at the holder's next turn. Hollow Husk/Gruesome Gladiator inspect hands privately; Smok reveals only a qualifying drawn Magic.

**Proposal:** typed event context (actor, owner, source, card IDs, cause, turn) and duration owner, not a single global boolean/buff. Separate DRAW, PULL, recover, reveal, PLAY and brought-to-Party triggers. Defer C04 draw passives until after award without retrospectively changing which skills existed at event time. Retain C06 reveal-vs-inspection privacy and C12 pause behavior.

**Tests:** off-turn events; multiple Item counts; partial targets; event replacement; owner/source moves; negative privacy tests for every other player and spectator; deadline/expiry through resume; nonterminal slay vs GAME_OVER. Follow the 84-row matrix so less prominent cards are not omitted.

### E15 — Generic Party counts, effective classes and the six-Hero cap

Brawling Spirit checks number of **cards** in a Party, rather than just Heroes. Rabid Beast/Grim Pupper use generic-card sacrifice/destruction; Roaryal Guard/Extraga act by class. Current main has a six-Hero cap, which affects steals, resurrection and temporary entries.

**Decisions:** which owned Party cards count for generic size checks (Leader, Heroes, each Item, slain Monsters), and which are legal generic cost targets; retain/exempt/change the six-Hero cap for these sets; handle Shamanaga's temporary entry into a full Party; treatment when one operation both frees and requires a slot. Do not sacrifice immutable cards merely because they count toward Party size.

**Proposal:** separate countable-card scope, legal-movement scope and Hero-capacity scope. Count effective class after Mask for class-targeting effects; do not change a printed two-Item trait or roll comparator when the class changes. Resolve E07 replacements before counting actual successful costs.

**Tests:** identical Hero count with different attachments/Leaders/Monsters; Masked target mass return; self excluded where text says another; bundle return; all capacity boundaries; no partial payment solely because the destination was illegally full.

### E16 — Actual set support, 7–8 players and edition identity

Owner previously set base-only 2–6, supported enabled expansion up to eight, no duplicate Leaders. DS adds one Leader to six base Leaders: **DS-only provides seven unique choices**, so eight seats conflict with unique-Leader setup unless another approved Leader source is enabled.

**Proposal requiring approval:** room capacity `min(8, available unique supported Leaders)` for expansion profiles; never solve the DS-only eighth seat by duplicating a Leader. A preview/asset folder does not count as a supported set. Lock enabled sets before start; preserve set/definition identity in saved games, restart and reconnection. Source physical copy counts before constructing decks; do not use the 84-image count as deck composition.

**Tests:** each enabled-set combination with 2/6/7/8 seats, DS-only eighth rejection, disabled/unimplemented pack rejection, no duplicate physical IDs across variants, deterministic composition counts, host config changes, restart, old saves and spectator projections. Cross-set tests must include WD two-slot Hero+BN Item+DS effect.

## Checks actually run

On pinned source with Node v24.15.0 and an explicit same-snapshot protocol resolver: `packages/protocol/tests/*.test.ts`, capacity-contract integration, RA-01/02/03/04 regression suites. **33 passed, zero failed/skipped**. [Captured output](EXPANSION_RULES_AUDIT_20261105_CHECKS.txt). This validates selected existing base/guard behavior only; no expansion game, visual UI, production Durable Object, full build, or complete test suite was run. An initial relative-path hook setup failed and was corrected before the reported run.

## Proposed merge sequence for Claude

These are preparation tickets, not approved dispatch or a new global priority. Keep any currently assigned work intact. Base C01–C12 is an input dependency; relevant newer main deltas must be reviewed rather than restarting the base audit.

| Ticket / proposed owner | File scope / inputs | Output / acceptance | Dependency |
|---|---|---|---|
| **EX-00 / owner + PM** | This report, base owner contract, per-card matrix | Decisions E01–E16; explicit rules-vs-product-override table. Unknown ruling remains blocked per field, not silently guessed. | None |
| **EX-01 / Claude content/protocol** | Card schema, set registry, sourced data, acquisition index read-only | Edition-aligned manifests with physical quantities, comparator, intrinsic capacity, costs/permissions/Challenge metadata; validators and stable IDs. | EX-00 fields needed by schema |
| **EX-02 / Claude engine** | Equipment/zone movement, event/frame/choice/roll-cost model | Attachment arrays, replacements, repeat permissions, AP lifecycle, scoped triggers and migration. Base regression remains green. | EX-01; approved E02–07/E10/E14–15 |
| **EX-03 / Claude engine** | WD data/handlers, typed shared primitives, tests | All 35 WD face records mapped to correct definitions/handlers; low-roll, two-slot, variants, free attack and mass movement acceptance. No generic no-op fallback for enabled cards. | EX-02 |
| **EX-04 / Claude engine** | BN data/handlers/tests | All 33 BN face records covered; typed sacrifice costs, replacements, retries, generic targets and direct slay. | EX-02; EX-03 cross-set regression |
| **EX-05 / Claude engine** | DS second-edition data/handlers/tests | All 16 DS face records covered; Leader swap, copied Modifier semantics, explicit repeat permission, temporary resurrection and paid reactions. | EX-02; E11–12/E16 approved |
| **EX-06 / Claude UI/room/QA** | Room/set config, setup, protocol projection, targets, bots, integration tests | Select only fully supported packs; seven-class profile, 7–8-seat constraints, multi-item UI and privacy; mixed-set/restart/deadline tests. Enable only when the chosen profile's entire card contract works. | EX-03..05 for selected packs |

Migration must be staged across worker and web: old `item` saves need unambiguous conversion to attachments; old Hero threshold numbers default to gte; base six-class profiles remain six; old rooms must not silently gain expansion cards. Do not expose one pack as playable because its schema or artwork imports successfully. Do not merge all historical branches or mix artwork changes into the interaction kernel PR.

### Claude handoff prompt (under 150 words)

Read docs/qa/EXPANSION_RULES_AUDIT_20261105.md and docs/rules/EXPANSION_CARD_REVIEW_20261105.md. Baseline main@309c58b; inspect relevant newer deltas only. All three expansions remain unsupported; asset presence is not implementation. Existing C01–C12 stays authoritative, with expansion-specific printed exceptions requiring EX-00 decisions. Prepare schema/data contracts and scoped PRs EX-01..06 after those decisions. Preserve variants/physical quantities, low-roll comparators, intrinsic two-Item capacity, repeat-roll permissions, typed sacrifice costs/replacements, class-gated Challenges, paid/conditional Modifiers, Leader exchange, direct slay, privacy and persisted-state migration. Do not guess DS-only/mixed win requirements, copy semantics, replacement precedence or DS-only eighth Leader. Inventory has 84 visually reviewed source faces, not certified deck quantities. No deployment or expansion enablement until the selected profile's full acceptance passes. Report tests on the actual final SHA.
