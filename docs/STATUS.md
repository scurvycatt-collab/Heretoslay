# Task board — Here to Slay
2026-11-02 · Lead system setup. Board: https://claude.ai/artifact/1efXb5aNZ26Y6GwgsGjQyh

| Task | Owner | State | Evidence / next |
|---|---|---|---|
| EF-TURN-001 | arch+ui+qa | done | Effect END_TURN, guards/replay; handoffs accepted |
| EF-UI-001 | ui | done | Modifier kind/delta/target labels; webtypecheck PASS |
| EF-BROWSER-001 | lead | done | 2-client browser review PASS |
| EF-UI-CLEANUP-001 | ui | done | One renderer; webtypecheck/build PASS |
| GAME-001 | arch | done | Base room thật (merged trước session cloud) |
| UI-001 | ui | todo | Lobby UI (deps: GAME-001) |
| GAME-002 | arch-heavy | done | Turn loop base: PLAY/Challenge/Modifier window, hero roll, ATTACK, choice, deadline qua DO alarm; review 0 critical, MAJOR đã sửa; worker 46 / integ 25 |
| GAME-003 | arch | done | Win 3 slay (ngay, Q-03) / 6 class cuối lượt mình (Leader tính, Mask Q-04), tie → active (Q-02), GAME_OVER khoá room; review 0 finding chính |
| MOD-005 | arch | todo | MOD-SELECT picker (deps: GAME-001) |
| GAME-004 | arch-heavy | done | Card schema + data 95 def/136 copy có provenance, validator, CARD_TEMPLATE_SPEC.json; review sửa xong; verify worker 34 / protocol 11 / integ 22+1skip |
| QA-001 | qa | todo | Game loop integration tests (deps: GAME-002+003) |
| DEPL-001 | arch | todo | Cloudflare deploy — blocked on owner account |

Lead system: CLAUDE.md + docs/LEAD.md + docs/BOARD.md + .claude/agents/{arch,ui,qa}.md
Operating model: one task at a time per role; PM owns board; workers own role cards.
