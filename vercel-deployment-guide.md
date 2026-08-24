# Hướng dẫn Cấu hình & Deploy Bank Statement Tracker lên Vercel

Tài liệu này hướng dẫn chi tiết cách cấu hình **Google Cloud Console**, **Firebase/Firestore** và **Vercel** để deploy ứng dụng Bank Statement Tracker (BST Manager) thành công.

---

## Tổng quan Kiến trúc
Dự án được xây dựng dưới dạng **Full-stack Serverless App**:
* **Frontend**: React + Vite + TypeScript (chạy tĩnh hoàn toàn trên CDN).
* **Backend**: Vercel Serverless Functions (Node.js) nằm trong thư mục `/api` để giao tiếp bảo mật với database Firestore REST API.

---

## 1. Cấu hình Google Cloud Console (Dành cho Google Drive Sync)

Ứng dụng sử dụng Google Drive API để đồng bộ dữ liệu giao dịch của người dùng một cách riêng tư.

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một dự án mới (hoặc chọn dự án hiện tại của bạn).
3. **Kích hoạt Google Drive API**:
   - Vào mục **APIs & Services** > **Library**.
   - Tìm kiếm `"Google Drive API"` và nhấn **Enable**.
4. **Cấu hình OAuth Consent Screen**:
   - Vào mục **OAuth consent screen**.
   - Chọn **User Type** (thường chọn **External** đối với ứng dụng cá nhân/phổ thông).
   - Điền các thông tin bắt buộc (App name, User support email, Developer contact information).
   - Thêm các Scopes sau:
     - `.../auth/drive.file` (cho phép ứng dụng tạo và sửa đổi các file do chính ứng dụng tạo ra trên Drive của người dùng).
   - Ở mục **Test users**, hãy thêm email Google của bạn (và các email test khác) để có thể đăng nhập trong chế độ thử nghiệm (Testing mode).
5. **Tạo thông tin đăng nhập (Credentials)**:
   - Vào mục **Credentials** > Nhấn **Create Credentials** > Chọn **OAuth client ID**.
   - **Application type**: Chọn **Web application**.
   - **Name**: Điền tên ứng dụng (ví dụ: `Bank Statement Tracker Client`).
   - **Authorized JavaScript origins**:
     - Local phát triển: `http://localhost:5173` và `http://localhost:5174`
     - Production: Thêm tên miền Vercel của bạn (ví dụ: `https://bank-statement-tracker.vercel.app`).
   - Nhấn **Create** để nhận **Client ID** (dạng `xxx.apps.googleusercontent.com`).
6. **Tạo API Key**:
   - Nhấn **Create Credentials** lần nữa > Chọn **API key**.
   - Để bảo mật, hãy nhấn **Restrict key** (chỉ cho phép gọi API Google Drive).
   - Copy mã **API Key** này.

---

## 2. Cấu hình Firebase & Cloud Firestore (Dành cho Template)

Ứng dụng lưu trữ các định dạng mẫu (templates) phân tích bảng sao kê của các ngân hàng trên Firestore.

1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Tạo một dự án Firebase mới (hoặc liên kết với dự án Google Cloud ở Bước 1).
3. Lưu lại **Firebase Project ID** (ví dụ: `bank-statement-tracker-3add2`).
4. **Kích hoạt Firestore Database**:
   - Chọn **Firestore Database** ở thanh menu bên trái.
   - Nhấn **Create database**.
   - Chọn chế độ **Production mode** hoặc **Test mode**.
   - Chọn vị trí server gần bạn nhất (ví dụ: `asia-southeast1` ở Singapore).
5. **Tạo Collection**:
   - Nhấn **Start collection**.
   - Đặt tên collection là: `bank_templates`.
   - Lưu trữ một tài liệu mẫu bất kỳ hoặc để trống.
6. **Cấu hình Rules cho Firestore** để đảm bảo bảo mật (chỉ cho phép đọc công khai hoặc viết bởi các Admin):
   - Vào tab **Rules** trên Firestore Dashboard.
   - Sử dụng luật bảo mật sau:
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /bank_templates/{templateId} {
           // Cho phép bất kỳ ai đăng nhập đều có thể đọc mẫu
           allow read: if request.auth != null;
           // Chỉ cho phép admin ghi/xóa
           allow write, delete: if request.auth != null && request.auth.token.email in ['vubao.93@gmail.com']; // Thay bằng danh sách admin email của bạn
         }
       }
     }
     ```

---

## 3. Cấu hình & Deploy lên Vercel

1. Đảm bảo mã nguồn của bạn đã được push lên một repository Git (GitHub, GitLab, hoặc Bitbucket).
2. Truy cập [Vercel Dashboard](https://vercel.com/) và đăng nhập.
3. Nhấn **Add New** > **Project** và import repository của bạn.
4. **Cấu hình Project Settings**:
   - **Framework Preset**: Vercel sẽ tự động phát hiện là **Vite** (nếu không, hãy chọn Vite).
   - **Root Directory**: `./` (để mặc định).
   - **Build Command**: `tsc -b && vite build` (để mặc định).
   - **Output Directory**: `dist` (để mặc định).
5. **Cấu hình Environment Variables (Biến môi trường)**:
   Mở rộng phần **Environment Variables** và điền 4 biến sau từ file `.env` của bạn:

   | Tên biến | Mô tả | Ví dụ |
   | :--- | :--- | :--- |
   | `VITE_GOOGLE_CLIENT_ID` | Client ID OAuth 2.0 từ Google Cloud | `722211353542-xxx.apps.googleusercontent.com` |
   | `VITE_GOOGLE_API_KEY` | API Key của Google Drive | `AIzaSyB1B_...` |
   | `VITE_ADMIN_EMAILS` | Danh sách email quản trị (phân cách bằng dấu phẩy) | `your-email@gmail.com` |
   | `VITE_FIREBASE_PROJECT_ID` | ID của dự án Firebase | `bank-statement-tracker-3add2` |

6. Nhấn **Deploy**. Quá trình build sẽ mất khoảng dưới 1 phút.
7. Sau khi hoàn tất, Vercel sẽ cấp cho bạn một tên miền miễn phí dạng `https://ten-du-an.vercel.app`.

---

## 4. Cấu hình lại Google Cloud sau khi có Domain Production
Khi đã có domain chính thức từ Vercel (ví dụ: `https://bank-statement-tracker.vercel.app`):
1. Quay lại **Google Cloud Console** > **Credentials**.
2. Chọn Client ID bạn đã tạo.
3. Thêm domain Vercel của bạn vào danh sách **Authorized JavaScript origins** và **Authorized redirect URIs**.
4. Lưu thay đổi. (Có thể mất từ 5-10 phút để Google cập nhật cấu hình).

---

## 5. Phát triển và chạy thử nghiệm ở Local (Development)

Để kiểm tra các hàm API cục bộ hoạt động chính xác với cơ chế rewrite của Vercel mà không cần deploy lên server:

1. Cài đặt Vercel CLI (nếu chưa có):
   ```bash
   npm i -g vercel
   ```
2. Khởi chạy môi trường giả lập Vercel ở local thay vì `npm run dev`:
   ```bash
   vercel dev
   ```
   Lệnh này sẽ tự động liên kết với project Vercel của bạn, tải các biến môi trường và chạy cả Frontend Vite lẫn Backend API Serverless trên cùng một cổng (thường là `http://localhost:3000`).
