# Handoff — UI-005 + deploy (2026-11-04)

Trạng thái: **done, deploy được rồi** → https://game.nauagency.asia/herotoslay/
Repo: scurvycatt-collab/Heretoslay · main `7c0b291` (nhánh `ui-005-scale-pacing` đã merge ff).
Verify: `npm run typecheck` PASS · `npm run test:integration` 82 pass / 0 fail / 1 skip.

## Đã làm (UI-005)
- UI +10%; Monster và Discard +15%, căn giữa bàn; player trên về góc, seat mình sát hand.
- Màn tương tác (Challenge/Modifier/Hero ability/đánh quái) phóng to, cân màn hình.
- Ctrl + hover: thẻ lớn giữa màn hình (Inspector). Panel hover Party Leader phóng to.
- Bỏ nút Attack cố định; bấm Monster → nút Attack slide từ sau thẻ xuống cạnh dưới.
- Challenge render được: pack `assets/cards/packs/04-base-challenge` (art clone từ Kickstarter preview Sorcerer Challenge, đã xoá silhouette class — thay được).
- Animation chậm hơn, xúc xắc đầy đủ (lăn → đáp → Rolled/Modifier/Total).
- Bot: `botPaceAt` + `BOT_STEP_MS 3200`, `BOT_REACT_MS 2600`, `BOT_RESULT_HOLD_MS 9000` (apps/worker/src/game/base-game.ts); không hành động mới khi kết quả trước chưa xong.
- Hero chơi từ tay không có mục tiêu hợp lệ → tự bỏ qua ability, vẫn triển khai (base-engine.ts `offerHeroRoll`).
- Test cập nhật: tests/base-e2e.integration.test.ts, tests/base-lobby-bots.integration.test.ts.

## Lưu ý
- Worker unit test: 5 fail có sẵn từ trước (fuzz + base-game.test.ts "deps.now is not a function"), không do UI-005.
- Không dùng Challenge theo class / giá trị Modifier của Kickstarter preview (không bịa luật).
- Repo local owner dùng CRLF; xem diff bằng `git diff -w`.
- Bản duy nhất giữ lại: E:\Code\heretoslay-deploy. Bản cũ chuyển vào E:\Code\_to_delete (here-to-slay-web còn bị khoá, chưa chuyển).

## Việc tiếp theo
- Chuyển nốt `here-to-slay-web` vào `_to_delete` khi đóng chương trình đang mở nó.
- Chơi thử thật để chỉnh nhịp bot nếu cần.
