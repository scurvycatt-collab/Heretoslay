# ADR-002 — Real game mode as a pure module behind the Room Durable Object

- **Status:** ACCEPTED (GAME-001, 2026-11-02)
- **Scope:** mode `base` (real base game); demo modes unchanged in behaviour.

## Context

`room.ts` (~1700 lines) holds three demo slices inline: state types, rules, projection and persistence mixed in one class. The owner approved the real game; GAME-002+ will add the full play/attack/reaction loop. Adding another inline slice would make the file unreviewable and the rules untestable without HTTP plumbing. ADR-001 requires sharing schemas, not hidden state, with the client.

## Decision

1. **Game logic lives in `apps/worker/src/game/`**, as pure functions with injected randomness/ids:
   - `setup-core.ts` — generic setup + basic turn/AP rules (leader selection, deal, first player, DRAW, REDRAW, END_TURN). Used by **both** `setup_demo` (fixture decks) and `base` (catalog decks), so the verified setup rules exist once.
   - `base-content.ts` — builds main deck (115), monster deck (15) and leader pool (6) from the CAT-001 catalog.
   - `base-game.ts` — `BaseGameState`, `applyBaseCommand` (command table `BASE_TURN_HANDLERS`), `projectBaseGame` (per-viewer snapshot).
2. **Protocol holds only the wire contract** (`packages/protocol/src/game/base.ts`: `BaseGameSnapshot`, `BaseGameCommand`, card view), exported type-only.
3. **The Durable Object is persistence + dispatch** for `base`: auth/session, rate limits, `commandId` receipts, `expectedRevision` check, revision bump, transaction write, projection call. Game state is a separate `game` field in the persisted room record.

### Why worker, not protocol, for the state/reducers

- The authoritative state contains hidden information (hands, deck order); ADR-001 says not to share hidden state objects with the client, and CLAUDE.md says the client must not compute game state. Keeping it in the worker keeps it out of the web bundle and type surface.
- The card catalog already lives in `apps/worker/src/content/`; protocol would otherwise need to depend on content data.
- It stays pure and runtime-free, so it is unit-tested directly (`apps/worker/tests/base-game.test.ts`) and could be moved to a shared engine package later without API change.

## Consequences

- New turn actions in GAME-002 = protocol union + validator + one handler entry; `room.ts` does not grow.
- Reaction windows/alarms for `base` will need a small DO hook (deadline → `settle` call into the module); not designed here.
- `setup_demo` now runs through `setup-core`; its existing tests are the regression guard for the refactor.
- Open/unverified, carried from SETUP_VERIFIED: leader pick order is join order (ambiguity #1); empty-deck draw reshuffles discard (ambiguity #2).
- Catalog is `reference_only` / rights UNVERIFIED; snapshots carry IDs/kinds only.
