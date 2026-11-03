# Asset import adapter — 2026-11-03 (Claude)

Ticket ASSET-IMPORT-UI-001. Chi tiết: `docs/contracts/ASSET_IMPORT_WORKBENCH.md` §0.3–§0.6.

Xong: browser adapter (`apps/web/src/asset-import/adapters/{core,browser}.ts`) nối vào workbench (`/?asset-import`, chỉ dev); overlay crop (`SheetOverlay.tsx`); resume draft theo SHA-256; export PNG + manifest + ZIP có kiểm lại; CLI `tools/import-card-art.ts` dùng chung core.

Delta cho Codex (contract.ts, optional): `ImportDraft.rejected`, `export(..., onProgress)`, `sourcePreview()`, `dispose()` không terminal. Route workbench chỉ nạp ở dev (trước đó bản build kéo theo 3 ảnh Kickstarter).

Checks: typecheck + tools tsc + vite build sạch; test:integration 49/0/1 skip; e2e Chromium trên sheet tổng hợp → 69 PNG (45 poker / 24 tarot), crop/contentRect khớp tham chiếu 69/69, ZIP/hashes kiểm độc lập.

Blocker / chờ owner: chạy với 5 sheet thật trên máy owner (`npm run dev:web` → `/?asset-import` → chọn folder `UPDATED Here to Slay Kickstarter Exclusive Pack`). Artwork composite chưa có. Resolver complete_face chưa nối (Codex).
