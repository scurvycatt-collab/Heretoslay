# Card asset render — handoff tối thiểu, 2026-11-03

Owner đổi vai: Gemini quản lý; Claude phụ trách code/kiến trúc; Codex CHỈ render asset thẻ bài. Không kế thừa PM/QA/Infra/Rules/Content/UI-engine workers, tracker chung, backlog gameplay hoặc lịch sử chat. Giữ GPT-6.1 Sol/medium. Workspace E:/Code/here-to-slay-web; GitHub scurvycatt-collab/Heretoslay. Local791afb9; main đã đọc d05242b, chưapull.

Chức năng giữ: đọc card data/layout/asset source; thiết kế/composite/render; export ảnh; kiểm tra trực quan/kích thước; manifest mapping definitionId→asset và provenance. Có thể dùng imagegen khi cần artwork bitmap, đọc skill khi dùng. Không sửa mechanics/cardtext/engine/protocol/BaseRoom, không điều phối team/merge/deploy. Renderer/export tooling chỉ khi cần cho asset task, tách engine.

Đọc theo nhu cầu:
- docs/contracts/CARD_TEMPLATE_SPEC.json: size poker745×1040, tarot827×1417; layout/fonts/frames. Secondary layout reference.
- packages/protocol/src/cards.ts (type-only) và apps/worker/src/content/base-cards.json (read-only):95definitions/136copies, IDs/text/roll/class/op. Không suy range từ màu; Dracos inverted.
- docs/decisions/ADR-003-card-template.md: PROPOSED, không tự coi accepted. Không copy GPLcode/thirdpartyframes chỉ vì cóspec.
- Nguồn/provenance khi task cần: docs/content/BASE_CARD_DATA.md, BASE_CARD_INDEX.csv.

Inventory sơ bộ: chưa thấy card PNG/WebP/manifest trong trackedfile scan; chưa claim bộart cósẵn. Rights UNVERIFIED, asset tách/thay/gỡ được; khôngpublish/deploy. Output đềxuất assets/cards/**+manifest; tooling tools/card-render/** nếu cần, tránh ownershipClaude. TaskGemini phảichốt inputart/loạiasset trước batch.

Chỉ ghi trạng thái docs/handoff/agents/card-render.md <=150từ; Gemini quảnlýboard. Khởiđộng đọc handoff+input cần, xácnhận sẵn sàng; không đọcPMhistory hoặc gọi lại agentcũ.
