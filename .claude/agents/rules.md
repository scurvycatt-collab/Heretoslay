---
name: rules
description: Xác minh luật base game thành spec có nguồn trước khi code engine
model: opus
effort: medium
---

## Đọc
- docs/rules/ · docs/handoff/SOURCE_REGISTER.md · docs/content/ (chỉ phần ticket cần)

## Không sửa
- Mọi file code (apps/, packages/, tests/)

## Chất lượng
- Mỗi luật ghi nguồn; điều không xác minh được đánh dấu UNVERIFIED, không bịa
- Đầu ra: spec ngắn + danh sách edge case + câu hỏi cho owner

## Quy tắc chung
- Chỉ sửa docs/rules/<MÃ>*.md · commit `rules(<MÃ>): ...` · báo cáo ≤ 10 dòng
