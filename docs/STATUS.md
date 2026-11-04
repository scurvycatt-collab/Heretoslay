# Task board — Here to Slay
2026-11-02 · Lead system setup. Board: https://claude.ai/artifact/1efXb5aNZ26Y6GwgsGjQyh

| Task | Owner | State | Evidence / next |
|---|---|---|---|
| ROLE-MIGRATE-ASSET | Codex | done / ready for asset ticket | Gemini quản lý; Claude code/kiến trúc; new chat01a19fa0-3f59-7372-b895-99dba0548c71 onlycardrender, GPT6.1Sol/medium; handoff CARD_ASSET_RENDER_RESUME.md +agents/card-render.md. |
| GH-READ-20261103 | PM | done | main d05242b; local791afb9 behind5commits/9files; [read report](handoff/GITHUB_REVIEW_2026-11-03.md). No pull/tests. |
| EF-TURN-001 | arch+ui+qa | done | Effect END_TURN, guards/replay; handoffs accepted |
| EF-UI-001 | ui | done | Modifier kind/delta/target labels; webtypecheck PASS |
| EF-BROWSER-001 | lead | done | 2-client browser review PASS |
| EF-UI-CLEANUP-001 | ui | done | One renderer; webtypecheck/build PASS |
| GAME-001 | arch | done | Base room thật (merged trước session cloud) |
| UI-001 | ui | done | apps/web/src/BaseRoom.tsx: tạo/vào phòng mode base, chọn Leader, bàn chơi, hand, PLAY/ROLL/ATTACK/DRAW/REDRAW/END, window Challenge/Modifier/choice, log, winner. Chưa style (Codex). typecheck+build PASS; chưa chạy thử trên trình duyệt |
| GAME-002 | arch-heavy | done | Turn loop base: PLAY/Challenge/Modifier window, hero roll, ATTACK, choice, deadline qua DO alarm; review 0 critical, MAJOR đã sửa; worker 46 / integ 25 |
| GAME-003 | arch | done | Win 3 slay (ngay, Q-03) / 6 class cuối lượt mình (Leader tính, Mask Q-04), tie → active (Q-02), GAME_OVER khoá room; review 0 finding chính |
| MOD-005 | arch | done | REACT_MODIFIER theo cardId + option, side cho Challenge, Protecting Horn ±1; passive Leader hiển thị riêng, Q-11 switch (default không chiếm suất); CONFIGURE_GAME host trước ván |
| GAME-004 | arch-heavy | done | Card schema + data 95 def/136 copy có provenance, validator, CARD_TEMPLATE_SPEC.json; review sửa xong; verify worker 34 / protocol 11 / integ 22+1skip |
| QA-001 | qa | done | tests/base-e2e.integration.test.ts: 2 người thắng 6 class, 3 người thắng 3 slay qua HTTP; nit GAME-001 (END_TURN sai người, STALE replay, stale/replay BEGIN/SELECT/START, reshuffle, privacy reconnect, DRAW rỗng) |
| GAME-005 | arch-heavy | done | Mọi effect Hero/Magic + skill Monster slain có handler |
| OWNER-2 | arch | done | Leader thỏa slot class, Mask thay class, timeout choice = skip, \"may\" hỏi người chơi; fix Arctic Aries |
| DEPL-001 | arch | done | Worker + assets phát hành qua service binding; gateway thương hiệu `/herotoslay/` trả UI, health và tạo phòng production thành công (2026-11-03) |
| UI-005 | ui+arch | done | UI +10% (Monster/Discard +15%), seat góc/gần hand, màn tương tác phóng to, Ctrl-hover inspector, Monster click → nút Attack slide, Leader panel lớn, art Challenge (pack 04-base-challenge), animation chậm + xúc xắc; bot pacing (BOT_STEP_MS 3200 / BOT_REACT_MS 2600 / BOT_RESULT_HOLD_MS 9000), hero không mục tiêu tự bỏ qua ability. typecheck PASS, integ 82 pass/1 skip; main 7c0b291 |
| DEPL-002 | owner | done | Deploy UI-005 lên https://game.nauagency.asia/herotoslay/ — deploy được rồi (2026-11-04) |
| UI-009 | Codex | ready to deploy | Gộp lobby thành một box Tạo/Vào/Xem; EN mặc định + VI toàn ứng dụng, glossary chung và rules text thẻ Việt. Target i18n tests 3/3, web typecheck/build PASS. Full verify còn 8 lỗi backend baseline không thuộc thay đổi; xem `docs/ui/LOCALIZATION.md`. |

Lead system: CLAUDE.md + docs/LEAD.md + docs/BOARD.md + .claude/agents/{arch,ui,qa}.md
Operating model: one task at a time per role; PM owns board; workers own role cards.
