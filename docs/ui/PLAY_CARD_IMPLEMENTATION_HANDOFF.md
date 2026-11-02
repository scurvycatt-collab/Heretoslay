# PC-IMPL-BOTH UI handoff

Scope: `apps/web/**`, `docs/ui/**`. The create form now offers clearly labelled synthetic `effect_demo`; existing `reaction_demo` and `setup_demo` flows remain separate.

`EffectRoom` consumes `EffectDemoSnapshot` from the protocol. It renders private hand, public Party/hand counts, turn/AP, deck/discard counts, pending attempt phase, server deadline countdown, server roll, and the synthetic/UNVERIFIED status. The UI sends only contract commands: start, play supported hand Magic/Hero, Critical Boost discard choice, Dodgy Dealer immediate skip or another-player roll, reaction Challenge/Modifier/Skip, and paid Dodgy roll only while the server snapshot marks the owned Party Hero allowance available. It does not mutate AP, zones, dice, target, deadline, allowance, or retry commands locally.

Checks: `npm run typecheck --workspace=@here-to-slay/web` PASS and `npm run build --workspace=@here-to-slay/web` PASS on 2026-11-02. No browser/runtime test was run. Limitations: fixture-only presentation; no art, full base catalog, other effects, modifier-option selection, expansion, or deployment. QA should verify all pending/reaction/deadline and allowance states against a live effect-demo Worker snapshot.
