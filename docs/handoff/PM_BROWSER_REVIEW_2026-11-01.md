# PM browser review — SETUP-LOCAL 2026-11-01

Evidence do PM trực tiếp quan sát trong IAB qua cua_repl,không phải native Chrome QA đã chạy. QA native sky.launch_app Chrome vẫn pending platform approval;không bypass/click approval. IAB là browser web riêng sẵn có,không cần native app control. Đây là PM review,không gán kết quả cho worker QA.

Setup phòngBDNP49,tabs1/2,nicknames PMHost1101/PMGuest1101:
- Create synthetic và join riêng tab PASS;Leader theo thứ tự,host chọn Leader3,guest chọn Leader5;Leader3 TAKEN disabled thật.
- HostStart:3 face-up fixtures,mỗi hand5,deck105,guest(lastselector)active,3AP;host actions disabled.
- GuestDraw:hand6,AP2,deck104;Redraw disabled.
- GuestReload:đúng guest/room/Leader/hand6/AP2,không join/thêm seat.
- GuestEndTurn:hostactive/3AP/turn2,không carry2AP.
- HostRedraw:hand5mới,deck99/discard5,guestactive/3AP/turn3.

Reaction phòngBBDFCM,tabs3/4,PMReactHost1101/PMReactGuest1101:
- HostChallenge20s;hostselfChallenge disabled,guestPlayChallenge PASS.
- Serverdice actor1+6/challenger3+6;Modifierwindow mở20s.
- GuestModifier:completed,nútModifier+Skipdisabled,fixture7+1=8,countdown15s không reset20.
- HostSkip:window CLOSED all_completed ở15s,cảhai completed,nútđãkhóa.

Findings UI được giao SL-02:Begin ngay sau guestJoin có thể stale và HTTP200 rejected outcome bịclientbỏqua/pollxóanotice;roster darktextondark unreadable. Reload đúngseat nhưngnoticeinitial Choose nickname sai. Source xác nhận api.outcome unknown/App.send bỏqua. UI đang sửa;chưa closed findings/chưa acceptedfinal cho tới reverify.

## Final reverify — 2026-11-02 (lượt bắt đầu01/11)

- UI handoff cuối typecheck/build PASS;PM đã đọc delta typed CommandOutcome/poll không xóa notice/roster wrap và nhãn LeaderX.
- PhòngVVKDUM 1player:Begin trả UI `Command rejected: NOT_ENOUGH_PLAYERS. Refreshed from the server.`;notice vẫn tồn tại sau polling và các lượt review khác,không đổi phase. Không auto retry gameplay.
- PhòngBDNP49 reload trên source cuối:đúngguest/Leader5/hand6/turn3/AP3,không còn Choose nickname. Screenshot xác nhận roster trắng-vàng rõ,LeaderX không tràn.
- EndTurn sau reload trên source cuối PASS:hostactive/turn4/AP3,guestcontrols disabled,success không để lại error.
- Screenshot artifact:C:/Users/hidey/.codex/visualizations/2026/10/29/01a185a2-a20f-7fa0-8aaa-0b9f63e172e5/setup-review-2026-11-01.jpg. PM đã view ảnh local.
- Kết luận PM:accepted phạm vi SETUP-LOCAL synthetic2–6 với root/server coverage và browser2clients IAB;không phải full base game/Chrome-native/mọi browser.
- Native QA sky.launch_app Chrome vẫn pending nền tảng;message đã gửi để không duplicate flow khi request kết thúc. Browser evidence ở đây là PM review IAB,không ghi là QA nativeChrome PASS. Worker report root/live giữ provenance riêng.
