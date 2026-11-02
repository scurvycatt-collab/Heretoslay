# Content worker checkpoint

State: **idle**; EG-PREP-001 source slice complete, no active task.

Input: `docs/content/PLAY_CARD_SOURCE_SLICE.md`; pinned manifest revisions `32728`/`42555`.

Output: two base artifacts — `Critical Boost` (Magic, quantity 2; threshold N/A; draw 3 then discard 1) and `Dodgy Dealer` (Hero: Bard, quantity 1; threshold 9+; trade hands with another player).

Checks: CSV mapping exact; both public base scans and card pages visually/read-source checked; no art downloaded, no effect sweep, no code/runtime/tests/tracker changes.

Blocker: action cost/timing, target edge cases and full retail/authenticity/license authority remain unknown; rows stay `secondary_discovery`, rights `UNVERIFIED`.

Next/dependency: Rules reviews the two mechanics and supplies contract fields before any further PLAY_CARD work. PM owns board integration.

This is a compact working-state handoff, not confirmed native context compaction.
