# Card render — 2026-11-03

Ticket resolveCardFace; owner Codex. Scope chỉ cards resolver/UI, docs và tests.

Output: apps/web/src/cards/{resolveCardFace.ts,cardFaceResolver.ts,placeholder-card.svg}; CardRenderer.tsx tích hợp whole-face + CardFaceImage error fallback. Docs: docs/contracts/CARD_FACE_RESOLVER.md. Tests: tools/card-render/card-face-resolver.test.ts.

Service synchronous đọc manifest69PNG build-time, Vite resolve URL thật. Hỗ trợ legacy cards và contract assets. Chỉ default variant; thiếu/trùng/sai/rawart/back -> placeholder. Pack hiện definitionId=null, chỉ resolve previewId; không tự map expansion sang base. CardRenderer giữ template khi chưa có face.

Checks: web build/typecheck PASS;14tests PASS (7resolver+7importcontract), gồm69file thật; dist đủ69PNG; diffcheck PASS. Chưa browser QA mới.

Bước kế: Claude nối manifest mapping thật; xem CARD_FACE_RESOLVER.md. Source schema/engine không đổi; rights UNVERIFIED. Owner yêu cầu đóng gói delta resolver trên codex/card-render-import-workbench, sau668a506. Tracker/package-lock/tmp ngoài scope không kèm.
