# Here to Slay expansion framework for Claude Code

Target baseline is audited `main@309c58b31760f8678a022ffaf155f8cf50832366`. Apply the three `apps/worker/` files on a scoped branch. Review overlapping changes to `base-content.ts` before applying the adapter.

## Contract and evidence

1. Read [E01–E16](../decisions/EXPANSION_OWNER_DECISIONS_20261105.md), [M01–M08](../rules/EXPANSION_MODIFIERS_REVIEW_20261105.md) and [C01–C12](../decisions/RULES_AUDIT_OWNER_DECISIONS_20261104.md). The latest explicit owner decisions take precedence over earlier proposals.
2. Use the [84 reviewed faces](../rules/EXPANSION_CARD_REVIEW_20261105.md) and [JSON index](../rules/EXPANSION_CARD_REVIEW_20261105.json) to trace variants. Source URLs and hashes are retained. Verify physical quantities from edition-matched inventory evidence. Artwork rights are UNVERIFIED.

## Extend and merge

1. **EX-01** Build each pack as an `ExpansionModule<EngineRules>` using the scoped IDs in `EXPANSION_SET_IDS`. Supply sourced quantity and card references. Map each definition to a typed engine binding. Keep incomplete packs outside the live registry.
2. **EX-02** Implement shared behavior and saved-state migration. Then implement WD, BN and DS separately in **EX-03–05** using the [audit merge plan](../qa/EXPANSION_RULES_AUDIT_20261105.md#proposed-merge-sequence-for-claude).
3. **EX-06** Persist room pack IDs. Compose the profile for setup, validation and restoration. Use `leadersForPlayerCount` at start and enforce unique picks. Resolve expansion metadata and handlers through `expansionCard(definitionId)`. Connect profile caps and win thresholds to the engine. Keep existing saves base-only unless explicitly configured.
4. Run `npm run verify` on the resulting SHA. Before exposing a pack, pass its card and mixed-profile acceptance cases, including invalid actions, visibility, reconnect and deadline replay.

This package wires base deck construction through the registry. Worker dispatch, expansion gameplay and room activation are pending.
