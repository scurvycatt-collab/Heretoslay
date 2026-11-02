# ASSET-001 — bàn giao khôi phục

Trạng thái: REPORTED_IMPLEMENTED / SOURCE_MISSING / LIVE_ACQUISITION_UNVERIFIED.

Chat cũ báo: crawler tìm ảnh qua HTML/CSS/JS, download, SHA-256 dedupe, manifest/report; 2/2 tests passed. Live run bị DNS block và chưa tải được ảnh gốc nào. Các kết quả này chưa được kiểm chứng lại.

Thiếu: tools/asset_acquisition_agent.py, tests, báo cáo gốc và ZIP v0.4. Không có agent đang chạy trong phiên này.

Sau khi nhập và review mã nguồn gốc, lệnh được chat cũ cung cấp (CHƯA chạy ở đây):

```powershell
py -3 tools/asset_acquisition_agent.py --base https://heretoslay.online/ --seed https://heretoslay.online/assets/img/hts-logo.png --output assets/source-candidate-01 --zip-assets
```

Nghiệm thu đề xuất: test local chạy lại có kết quả; manifest ghi URL, file, SHA-256, kích thước và mapping card ID khi biết; report phân biệt tải được, lỗi, trùng và thiếu; coverage so với inventory CONTENT-001. Không suy ra đủ bộ bài từ việc tải logo. Rights = UNVERIFIED; giữ asset dễ thay/gỡ.
