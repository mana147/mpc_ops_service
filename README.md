# MPC Ops Service

Ứng dụng Node.js quản trị **berth window** theo mô hình MVC, dùng Express, EJS và SQLite. Tool biểu đồ ban đầu đã được tích hợp vào trang admin; dữ liệu JSON giờ được đọc/ghi qua API và lưu bền vững trong SQLite.

## Chức năng

- Đăng nhập/đăng xuất admin bằng session lưu trong SQLite.
- Xem biểu đồ không gian–thời gian theo tuần.
- Lọc tuyến, bật/tắt cửa sổ hợp đồng và khung thủy triều.
- Tự phát hiện xung đột thời gian/vị trí và tính KPI.
- Sửa JSON, kiểm tra dữ liệu ở backend và lưu vào SQLite.
- Khôi phục bộ dữ liệu mẫu.

## Cài đặt và chạy

Yêu cầu Node.js 20 trở lên.

```bash
npm install
cp .env.example .env
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

Tài khoản khởi tạo mặc định:

- Username: `admin`
- Password: `Admin@123`

Hãy đổi `SESSION_SECRET` và `ADMIN_PASSWORD` trong `.env` **trước lần chạy đầu tiên**. Tài khoản admin chỉ được seed khi bảng `users` đang rỗng; đổi biến môi trường sau đó không tự đổi mật khẩu đã lưu.

## Cấu trúc MVC

```text
src/
├── config/        # Khởi tạo schema và kết nối SQLite
├── controllers/   # Auth, trang admin và API berth window
├── data/          # Dữ liệu mẫu
├── middleware/    # Kiểm tra session đăng nhập
├── models/        # Truy vấn users và berth window
├── routes/        # Route web và API
├── services/      # Session store, validate nghiệp vụ đầu vào
├── views/         # EJS cho login/admin/error
├── app.js         # App factory
└── server.js      # HTTP entrypoint
```

Các asset của tool nằm tại `public/css/berth-window.css` và `public/js/berth-window.js`; giao diện EJS tương ứng nằm tại `src/views/admin/berth-window.ejs`.

## API nội bộ

Tất cả API dưới đây yêu cầu session admin:

| Method | Endpoint | Mục đích |
|---|---|---|
| `GET` | `/api/berth-window` | Đọc dữ liệu hiện tại |
| `PUT` | `/api/berth-window` | Validate và lưu toàn bộ dữ liệu JSON |
| `POST` | `/api/berth-window/reset` | Khôi phục dữ liệu mẫu |

Health check không cần đăng nhập: `GET /health`.

## Kiểm thử

```bash
npm test
```

Test dùng SQLite in-memory, bao phủ đăng nhập, bảo vệ API, lưu dữ liệu, validate và đăng xuất.
