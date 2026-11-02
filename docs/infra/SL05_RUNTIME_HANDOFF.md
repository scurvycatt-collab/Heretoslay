# SL-05 local runtime handoff

Ngày: 2026-10-29 (Asia/Saigon)  
Owner: Infrastructure  
Phạm vi: local runtime health-check; không sửa source/deps/lock.

## Runtime giữ cho QA

- Vite: `http://localhost:5173`, listener PID `10292`; `GET /` trả `200` qua elevated no-proxy curl. `127.0.0.1:5173` không phải bind address hiện tại (Vite đang bind `::1`).
- Worker Wrangler: launcher `15780`, workerd PID `6496`; log ghi `Ready` trên `127.0.0.1:8787`, nhưng listener đã biến mất khi diagnostic đọc lại và IPv4/localhost/no-proxy `/health` cùng explorer API đều timeout. Không coi log `Ready` là HTTP health.
- Một Vite thử nghiệm do lượt này khởi động đã tự chuyển sang 5174 vì 5173 đang có server khỏe; process PID `10508` đã dừng, không ảnh hưởng server 5173.

Checks dùng loopback בלבד, không remote/login/tunnel/deploy. Không chạy full test suite. Không kill process không xác định thuộc repo; server 5173 được giữ nguyên vì đã health-check và phản ánh source mới.

Stop sau review: xác minh PID/listener trước, rồi `Stop-Process -Id 19636` và dừng worker launcher/listener `42752,42708` nếu vẫn là các process Wrangler của workspace.

Boundary diagnostic 2026-11-01: trong cùng một elevated command, Hidden launch + probe, Vite `localhost:5173` trả HTTP 200; Worker listener `127.0.0.1:8787` tồn tại (PID 2520) nhưng `/health` timeout. Wrangler log cho biết Local Explorer đã tự chuyển sang `8789`, dù dev session báo `Ready` trên `8787`; đây là exact runtime evidence, không phải health pass. Blocker còn lại là Wrangler/AI-agent port allocation hoặc proxy path trên 8787, cần Architecture/owner điều tra. Không restart-loop.

Current read-only verification: both listeners are workspace `workerd.exe` processes (PID `25876` on `8787`, PID `6748` on `8789`). `GET http://127.0.0.1:8787/health` times out; `GET http://127.0.0.1:8789/health` returns HTTP 200 with `{"ok":true,"service":"here-to-slay-worker","scope":"foundation"}`. Treat `8789` as the currently healthy Worker URL; do not stop it before routing replacement. `8787` remains stale/unhealthy and needs owner-approved cleanup/routing normalization.

Normalization attempt 2026-11-01: verified/stopped repo `workerd` PID `25876`, preserved healthy PID `6748` on `8789`, and launched Wrangler with explicit `--port 8787` (launcher `20436`, listener `33332`). In the same elevated boundary, `/health` on `8787` still timed out. Vite `http://localhost:5173/api/health` returned HTTP 500. Wrangler logged `Ready` and explorer hint on `8787`, but this is not an HTTP health pass. No further restart loop.

Cleanup after UI handoff: verified/stopped diagnostic launcher `20436` and listener `33332`. Healthy Worker `8789/PID6748` remains untouched. Port `8787` still has PID `12992` with different parent/ownership evidence; it was not stopped. Wait for UI's `WORKER_PROXY_TARGET=http://127.0.0.1:8789` delta before restarting Vite.

Final runtime after UI proxy delta: verified/stopped old repo Vite PID `34052`; launched `npm run dev:web` Hidden with `WORKER_PROXY_TARGET=http://127.0.0.1:8789` (launcher `22972`, Vite listener `::1:5173`, PID `18020`). Same elevated boundary checks: `GET http://localhost:5173/` 200; `GET http://localhost:5173/api/health` 200 with reaction-slice JSON; direct `GET http://127.0.0.1:8789/health` 200 with foundation JSON. Keep `8789/PID6748`; do not use `8787`.

Cleanup: đã xác minh và dừng workerd PID `2520` thuộc đúng diagnostic command/repo; launcher `34652` đã kết thúc. Các workerd còn lại có parent khác, không đủ evidence thuộc lượt này nên không dừng. Vite không bị dừng. Owner nên chạy `npm run dev:worker` từ terminal host bình thường và kiểm tra trực tiếp `curl.exe --noproxy "*" -i http://127.0.0.1:8787/health`; chỉ coi `200` là pass.
