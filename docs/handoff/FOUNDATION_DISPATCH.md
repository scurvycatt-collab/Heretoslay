# Foundation — owner đã duyệt phạm vi

Owner lập kế hoạch/review: PM. Chưa dispatch implementation. Input: BASE_SPEC (27 requirements), ADR-001, protocol draft, UI REFERENCE_REVISION đã owner duyệt, QA acceptance và CONTENT_AUDIT. Quyền asset UNVERIFIED; bước này dùng placeholder, không download/public artwork.

## Phạm vi bước kế

Khung local để review UI và kiểm tra protocol/Worker; chưa phải game chơi được. Đề xuất React + TypeScript + Vite, npm workspaces và Cloudflare Worker/Room DO theo ADR. Không chọn thêm database/backend framework. Chưa commit/push/deploy.

| Thứ tự / owner | File ownership implementation dự kiến | Đầu ra / nghiệm thu | Phụ thuộc |
|---|---|---|---|
| 1 / Infrastructure | Root manifests, lockfile, tsconfig base, CI config, docs/infra/; metadata Git chỉ sau xác nhận backup | Nếu sửa Git: sao lưu nguyên trạng, init bổ sung metadata tối thiểu, không reset/xóa/move working files, kiểm tra root/status; lệnh ghi Git phải tuân thủ permission tool. Tạo workspace/root scripts; chưa sửa app/package của owner khác | Owner duyệt Foundation/stack và bước Git; runtime/dependency download nếu cần approval theo tool |
| 2 / Architecture | packages/protocol/, apps/worker/ (bao gồm package config riêng), docs/architecture/ và ADR | Schema command/event, capacity config, test reaction reducer/deadline/idempotency bằng fixture có nhãn; Worker/Room DO scaffold có đường local kiểm chứng. Không giả full effect engine đã tồn tại | Root scaffold xong; chốt eligibility hoặc để mock fixture có nhãn chưa gameplay |
| 2 / UI/UX | apps/web/ bao gồm config/package riêng, docs/ui/ | UI static/mock theo design đã duyệt, 4 trạng thái tabletop/reaction; controls đổi mock state, bố trí 2–6 chỗ và indication expansion max8. Build local được; dữ liệu demo phân biệt với gameplay thực | Root scaffold; DTO từ protocol khi cần |
| 3 / QA | tests/ contract/integration và docs/qa/; không sửa source owner khác | Kiểm tra đúng scope: typecheck/build, DTO invalid/stale window/duplicate command, reaction fixture1Modifier-orSkip, 20s/no-reset/disconnect; ghi pass/fail thực chạy. Rà UI các state và clipping | Output Architecture/UI đã tích hợp |

Root scripts do Infrastructure tích hợp đề xuất từ owner khác; PM điều phối thứ tự để tránh ghi đè root files. Tests package-local do owner source sở hữu, QA root tests không trùng phạm vi. Rules/Content/Assets chưa mở coding/acquisition mới trong batch này.

## Gate review hiện tại

- UI direction: owner APPROVED, placeholder và capacity copy đã sync.
- Rules: base spec có nguồn và product overrides, card-specific effects/trigger tie cases còn thiếu; không chặn scaffold/mocks nhưng chặn tuyên bố full gameplay complete.
- Content: 96 definitions secondary-discovery, 115 standard copies đối chiếu, text NOT_CAPTURED. Không đủ nguồn để implement full effects; không tính artwork coverage.
- ADR: Workers/DO đã có nguồn/PM review, frontend và protocol vẫn PROPOSED chờ review scope này; không tự đánh approved vì tài liệu đã viết.
- Reaction đã chốt: mỗi player1Modifier hoặc Skip = completed, mọi eligible completed đóng sớm, deadline20s no-reset, disconnect chờ deadline, Challenge server auto-roll cả2. Eligibility chi tiết còn đề xuất: Challenge mọi đối thủ, Modifier mọi người, không lọc theo hand để tránh leak. Cần chốt trước implementation gameplay thực.
- Git: baseline không được nhận diện, metadata object database thiếu; chỉ có chẩn đoán. Không coi đã sửa trước khi thực hiện/verify.
- QA: acceptance NOT_RUN; chưa có runtime tests. Kết quả test không thể là tiền điều kiện để tạo code lần đầu, nhưng phải có trước khi đóng Foundation.

## Điểm duyệt

Owner review phạm vi scaffold/mock, React/TS/Vite + Workers/DO và bước Git có backup. Đây là yêu cầu duyệt bước kế theo quy trình từng bước của owner; đợt nghiên cứu hiện tại không tự mở code. Full Wave 1B/engine game không được đánh đạt nếu còn các dependency chưa xử lý. Sau Foundation, PM trình vertical slice có card/effect được xác minh, không mở rộng expansion chỉ để lấp coverage.

## Approval và dispatch thực tế

Owner đã duyệt trong chat PM: bắt đầu Foundation giới hạn ở scaffold/mock/protocol/Worker và QA. Mọi player tham gia reaction kể cả không có card, có Skip; không còn eligibility blocker cho phạm vi này. Submit vẫn validate legal hand/card; không self-Challenge. Các dòng gate lịch sử phía trên đã được thay bằng approval này ở mức scope Foundation, không phải full gameplay/release.

Giao Infrastructure đợt đầu: root manifests/config/CI và Git backup/repair. Chưa cho owner khác ghi code tới khi root scaffold có handoff. Root lockfile/node_modules install chỉ Infrastructure sở hữu; Architecture/UI không npm install root hoặc ghi root config. Sau khi app/package manifests có, Infrastructure tích hợp lockfile/install rồi QA chạy checks. Không coi check --if-present không có package là test pass.
