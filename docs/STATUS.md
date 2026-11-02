# Task board — Here to Slay
2026-11-02 · Lead system setup. Board: https://claude.ai/artifact/1efXb5aNZ26Y6GwgsGjQyh

| Task | Owner | State | Evidence / next |
|---|---|---|---|
| EF-TURN-001 | arch+ui+qa | done | Effect END_TURN, guards/replay; handoffs accepted |
| EF-UI-001 | ui | done | Modifier kind/delta/target labels; webtypecheck PASS |
| EF-BROWSER-001 | lead | done | 2-client browser review PASS |
| EF-UI-CLEANUP-001 | ui | done | One renderer; webtypecheck/build PASS |
| GAME-001 | arch | todo | **Next** — real room create/join, no demo mode |
| UI-001 | ui | todo | Lobby UI (deps: GAME-001) |
| GAME-002 | arch | todo | Turn loop: play hero/monster/rest (deps: GAME-001) |
| GAME-003 | arch | todo | Win condition (deps: GAME-002) |
| MOD-005 | arch | todo | MOD-SELECT picker (deps: GAME-001) |
| GAME-004 | arch | todo | Base card catalog (deps: GAME-002) |
| QA-001 | qa | todo | Game loop integration tests (deps: GAME-002+003) |
| DEPL-001 | arch | todo | Cloudflare deploy — blocked on owner account |

Lead system: CLAUDE.md + docs/LEAD.md + docs/BOARD.md + .claude/agents/{arch,ui,qa}.md
Operating model: one task at a time per role; PM owns board; workers own role cards.
