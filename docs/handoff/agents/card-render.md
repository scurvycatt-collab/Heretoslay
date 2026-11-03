# Card render — 2026-11-03

Ticket ASSET-IMPORT-UI-001; owner Codex dựng framework, Claude nối importer hiện có.

Output: apps/web/src/asset-import/{AssetImportWorkbench.tsx,contract.ts,fixtures.ts,workbench.css}; route ?asset-import trong main.tsx. Contract + prompt giao Claude: docs/contracts/ASSET_IMPORT_WORKBENCH.md.

UI demo3thẻ: nguồn/crop/mapping/export, chỉnh draft, stale-preview, validator, tải draftJSON. Adapter chưa nối: folder/crop thật/exportPNG bị khóa rõ. Contract quy định complete-face/artwork, PNG Poker/Tarot, provenance/hash, preview/mapped, cancel/dispose.

Checks trước commit: web build/typecheck PASS;7contract tests PASS; diffcheck PASS. Browser: UI render, crop âm hiện lỗi/stale và khóa review; mapped chặn unknownID; exportdemo khóa. Preview /?asset-import.

Bàn giao nhánh codex/card-render-import-workbench, base791afb9; remote main được kiểm tra d05242b. Chỉ commit scope session; tracker/package-lock/tmp/ZIP không kèm. Claude tích hợp nhánh rồi nối adapter/overlay/grid/preview thật/draftresume/export/QA theo contract. Không sửa engine/schema; rights UNVERIFIED; không deploy. Bộ69PNG: assets/cards/kickstarter-preview/png-webgame.
