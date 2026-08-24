# Bank Statement Tracker (BST Manager)

Ứng dụng quản lý, phân tích và theo dõi lịch sử giao dịch từ file sao kê ngân hàng định dạng PDF trực tiếp trên trình duyệt web. 

Dự án hoạt động **100% offline và client-side** (trên trình duyệt của người dùng), đảm bảo an toàn bảo mật tuyệt đối cho dữ liệu tài chính cá nhân. Hỗ trợ lưu trữ và đồng bộ hóa đám mây riêng tư thông qua Google Drive của riêng bạn.

---

## Tính năng nổi bật
* **Phân tích PDF trực tiếp**: Đọc và trích xuất dữ liệu giao dịch từ file sao kê PDF của nhiều ngân hàng phổ biến (Shinhan, Vietcombank, Techcombank, MB Bank, ACB, VPBank,...) với tùy chọn giải mã file có mật khẩu.
* **Tự động phân loại chi tiêu**: Áp dụng các quy tắc tự động phân loại giao dịch theo từ khóa (Ví dụ: Grab, Shopee, Highlands...).
* **Báo cáo trực quan (Dashboard)**: Biểu đồ phân bổ chi tiêu theo danh mục, xu hướng chi tiêu theo tháng, và thống kê tổng hợp tiền hoàn/lợi ích.
* **Đồng bộ hóa Google Drive**: Tự động lưu trữ và đồng bộ dữ liệu cấu hình, quy tắc, danh mục giữa các thiết bị thông qua tài khoản Google Drive cá nhân.
* **Bảo mật tuyệt đối**: Hỗ trợ 3 chế độ bảo mật dữ liệu bao gồm: Lưu trữ toàn bộ (Full), Chỉ lưu số liệu tổng hợp (Aggregate - không lưu file gốc và chi tiết giao dịch), và Lưu trữ tạm thời (Temporary - xóa sạch khi F5/đóng trình duyệt).

---

## Cài đặt & Phát triển ở Local

### 1. Cài đặt các gói thư viện
```bash
npm install
```

### 2. Cấu hình file môi trường
Tạo file `.env` từ file mẫu `.env.example`:
```bash
cp .env.example .env
```
Cập nhật các khóa API tương ứng của bạn trong file `.env` (Client ID Google OAuth, API Key Google Drive, Firebase Project ID).

### 3. Chạy môi trường phát triển (Local Development)
Bạn nên chạy dự án bằng **Vercel CLI** để mô phỏng chính xác cả Frontend lẫn Backend Serverless API:
```bash
# Cài đặt vercel cli toàn cục (nếu chưa có)
npm i -g vercel

# Chạy dev server mô phỏng
vercel dev
```

Hoặc chỉ chạy riêng Frontend (không có API phân tích PDF cục bộ):
```bash
npm run dev
```

---

## Hướng dẫn Deploy lên Vercel

Dự án này đã được tối ưu hóa cấu hình cho Vercel Serverless. Để cấu hình Google Cloud API, Firebase Firestore và tiến hành deploy dự án lên môi trường production của Vercel:

👉 **Xem hướng dẫn chi tiết tại đây: [vercel-deployment-guide.md](file:///Users/bth/Documents/personal/bank-statement-tracker/vercel-deployment-guide.md)**

---

## Liên hệ & Đóng góp
Dự án được phát triển và vận hành bởi team **Bank Statement Tracker**. Mọi đóng góp ý kiến hoặc báo lỗi vui lòng tạo Issue trên repo này.
