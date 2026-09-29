# MPC Ops Service — AI Agent Handoff

## 1. Đọc nhanh trước khi sửa code

Đây là ứng dụng nội bộ Node.js dùng **Express 5 + EJS + SQLite**, tổ chức theo MVC. Người dùng đăng nhập admin, vào dashboard `/admin`, sau đó mở các tool nghiệp vụ. Tool đầu tiên và hiện là tool duy nhất là **Berth Window** tại `/admin/berth-window`.

Trạng thái hiện tại:

- Authentication bằng username/password, mật khẩu hash với `bcryptjs`.
- Session 8 giờ được lưu trong chính SQLite, không dùng MemoryStore.
- Dashboard và admin shell đã sẵn sàng để gắn thêm tool.
- Berth Window đọc/ghi một JSON snapshot trong SQLite qua API có bảo vệ đăng nhập.
- Frontend tự tính xung đột, KPI và vẽ SVG; backend hiện chỉ validate cấu trúc trước khi lưu.
- Có chế độ toàn màn hình chỉ hiển thị tool, cùng layout riêng cho điện thoại dọc/ngang.
- Test tích hợp dùng `node:test` + Supertest + SQLite in-memory.

Các quyết định quan trọng không được bỏ qua:

1. Dữ liệu Berth Window hiện lưu trong **một row duy nhất** (`id = 1`) dưới dạng JSON, chưa chuẩn hóa thành các bảng vessel/call/window.
2. Giới hạn cầu bến `900 m` đang xuất hiện ở cả `public/js/berth-window.js` và `src/services/berthDataValidator.js`. Nếu đổi chiều dài cầu, phải cập nhật đồng bộ.
3. Dữ liệu mẫu có hai bản: bản chính ở `src/data/seedBerthData.js` và bản fallback trình duyệt trong `public/js/berth-window.js`. Khi đổi schema hoặc sample data, phải cập nhật cả hai.
4. CSS của trang Berth Window được load theo thứ tự `berth-window.css` rồi `app.css`; `app.css` cố ý override phần admin shell và focus mode.
5. Không đưa style của Berth Window vào dashboard/admin toàn cục. Dashboard chỉ dùng `public/css/app.css`.

## 2. Luồng chính

```text
GET / hoặc GET /login
        │
        ▼
POST /login ── sai ──► render lại login (HTTP 401)
        │ đúng
        ▼
SQLite session + redirect /admin
        │
        ├──► Dashboard: danh sách tool
        │
        └──► /admin/berth-window
                 │
                 ├── GET  /api/berth-window
                 ├── PUT  /api/berth-window
                 └── POST /api/berth-window/reset
```

`requireAuth` xử lý khác nhau theo loại request:

- Web chưa đăng nhập: redirect `/login`.
- API chưa đăng nhập: JSON HTTP `401`.
- Người đã đăng nhập truy cập `/login`: redirect `/admin`.

## 3. Công nghệ và quy ước

- Node.js `>= 20`, CommonJS (`require/module.exports`).
- Express 5, EJS, `better-sqlite3`, `express-session`, `bcryptjs`, Helmet.
- Không có ORM và chưa có migration framework; schema được tạo idempotently lúc khởi động.
- JavaScript frontend thuần, không bundler và không framework UI.
- Asset tĩnh được phục vụ trực tiếp từ `public/`.
- Tên field API đang dùng camelCase; field nghiệp vụ trong JSON chủ yếu là tên ngắn theo tool cũ.
- Toàn bộ route admin và API nghiệp vụ phải đi qua `requireAuth`.

## 4. Cấu trúc và trách nhiệm từng file

```text
.
├── public/
│   ├── css/
│   │   ├── app.css                 # Login, dashboard, admin shell, fullscreen/focus mode
│   │   └── berth-window.css        # Thành phần riêng của tool và responsive mobile
│   └── js/
│       └── berth-window.js         # Render SVG, KPI, conflict, JSON editor, fullscreen
├── src/
│   ├── config/
│   │   ├── adminTools.js           # Registry tool hiển thị ở dashboard và sidebar
│   │   └── database.js             # Mở DB, pragma, tạo bảng, seed admin và berth data
│   ├── controllers/
│   │   ├── adminController.js      # Render dashboard và trang Berth Window
│   │   ├── authController.js       # Login/logout và tạo/hủy session
│   │   └── berthWindowApiController.js # GET/PUT/reset dữ liệu tool
│   ├── data/
│   │   └── seedBerthData.js        # Dữ liệu mẫu canonical phía server
│   ├── middleware/
│   │   └── auth.js                 # requireAuth + redirectIfAuthenticated
│   ├── models/
│   │   ├── User.js                 # Query user bằng prepared statement
│   │   └── BerthWindow.js          # Đọc/ghi JSON snapshot id=1
│   ├── routes/
│   │   ├── authRoutes.js           # /login, /logout
│   │   ├── adminRoutes.js          # /admin, /admin/berth-window
│   │   └── apiRoutes.js            # /api/berth-window...
│   ├── services/
│   │   ├── SQLiteSessionStore.js   # express-session store tự viết
│   │   └── berthDataValidator.js   # Validate payload trước khi ghi DB
│   ├── views/
│   │   ├── admin/                  # dashboard.ejs, berth-window.ejs
│   │   ├── auth/login.ejs
│   │   ├── partials/               # Sidebar và topbar dùng chung
│   │   └── error.ejs
│   ├── app.js                      # App factory, middleware, dependency wiring
│   └── server.js                   # dotenv, listen, graceful shutdown
├── test/app.test.js                # Integration tests
├── note/berth_window.md            # Tài liệu nghiệp vụ tham khảo, không dùng runtime
└── data/mpc_ops.sqlite             # DB local sinh lúc chạy, bị gitignore
```

## 5. Database

`src/config/database.js` bật `foreign_keys`, WAL và `busy_timeout = 5000`, sau đó tạo ba bảng:

### `users`

| Field | Ý nghĩa |
|---|---|
| `id` | Primary key |
| `username` | Unique, so sánh không phân biệt hoa thường |
| `password_hash` | bcrypt hash, cost 12 khi seed |
| `role` | Hiện mặc định là `admin`; chưa có authorization theo role |
| `created_at` | Thời gian tạo |

### `berth_window_datasets`

| Field | Ý nghĩa |
|---|---|
| `id` | Bị giới hạn luôn bằng `1` |
| `json_data` | Toàn bộ dataset Berth Window dạng JSON string |
| `updated_at` | Thời gian cập nhật gần nhất |
| `updated_by` | FK tới `users.id` |

### `sessions`

| Field | Ý nghĩa |
|---|---|
| `sid` | Session ID |
| `sess` | Session JSON |
| `expires_at` | Unix time milliseconds |

Session có TTL mặc định 8 giờ, rolling cookie và cleanup session hết hạn mỗi 15 phút. Cookie tên `mpc.sid`, `httpOnly`, `sameSite=strict`; `secure=true` khi `NODE_ENV=production`.

Lưu ý seed:

- Admin chỉ được tạo khi bảng `users` đang rỗng.
- Dataset chỉ được tạo khi bảng `berth_window_datasets` đang rỗng.
- Đổi `ADMIN_PASSWORD` sau lần chạy đầu tiên **không** thay mật khẩu trong DB hiện có.
- Chưa có UI hoặc CLI đổi mật khẩu.

## 6. Dữ liệu Berth Window

Payload tối thiểu:

```json
{
  "terminal": "Cầu bến container số 2",
  "berths": [
    { "code": "B1", "from": 0, "to": 300 }
  ],
  "tideWindows": [
    { "day": 0, "from": 2.5, "to": 7 }
  ],
  "calls": [
    {
      "id": "C1",
      "vessel": "MSC ANNA",
      "service": "CIX",
      "line": "Ocean Line",
      "window": { "day": 0, "hour": 8, "dur": 22 },
      "ata": { "day": 0, "hour": 7.7 },
      "dur": 22,
      "from": 0,
      "to": 350,
      "loa": 294,
      "draft": 11,
      "cranes": 3,
      "moves": 1450,
      "tol": 3
    }
  ]
}
```

Quy ước thời gian:

- `day`: `0` là Thứ 2, `6` là Chủ nhật.
- `hour`: giờ thập phân, ví dụ `7.5` là `07:30`.
- `window = null`: tàu vãng lai, không có cửa sổ cam kết.
- `ata` trong tool hiện đóng vai trò thời điểm bắt đầu khối tàu trên biểu đồ.
- `dur`: số giờ chiếm cầu; lượt tàu có thể kết thúc sang ngày kế tiếp.

Validator backend kiểm tra kiểu dữ liệu, khoảng ngày/giờ, ID call không trùng, `from < to`, cẩu là số nguyên dương và mọi vị trí nằm trong `0–900 m`. Nó chưa kiểm tra xung đột nghiệp vụ, thủy triều, LOA hoặc năng lực cẩu.

Logic frontend đáng chú ý:

- Xung đột khi hai call vừa chồng thời gian vừa chồng không gian sau khi cộng safety gap `25 m`.
- KPI gồm mét·giờ khai thác, số lượt tàu, window adherence, tổng giờ trễ và số tàu có xung đột.
- Chuyển tuần chỉ đổi nhãn ngày; dữ liệu vẫn là lịch mẫu theo `day/hour`, không phải timestamp thật.
- Nút “Dữ liệu JSON” cho phép sửa toàn bộ snapshot rồi `PUT` về server.
- Nút khôi phục gọi server để lấy lại `seedBerthData.js`.

## 7. Route và API

### Web routes

| Method | Route | Auth | Kết quả |
|---|---|---|---|
| `GET` | `/` | Không | Redirect `/login` hoặc `/admin` |
| `GET` | `/login` | Guest | Form đăng nhập |
| `POST` | `/login` | Guest | Tạo session, redirect `/admin` |
| `POST` | `/logout` | Admin | Hủy session, redirect `/login` |
| `GET` | `/admin` | Admin | Dashboard tool |
| `GET` | `/admin/berth-window` | Admin | Giao diện Berth Window |
| `GET` | `/health` | Không | `{ "status": "ok" }` |

### API routes

| Method | Route | Kết quả |
|---|---|---|
| `GET` | `/api/berth-window` | `{ data, updatedAt, updatedBy }` |
| `PUT` | `/api/berth-window` | Validate, ghi snapshot, trả `{ message, data, updatedAt, updatedBy }` |
| `POST` | `/api/berth-window/reset` | Ghi lại seed server và trả record mới |

Mã lỗi chính: `401` khi chưa đăng nhập, `422` khi payload không hợp lệ, `404` khi route không tồn tại, `500` cho lỗi nội bộ.

## 8. Dashboard và cách thêm tool mới

`src/config/adminTools.js` là registry dùng chung cho dashboard và sidebar. Một item gồm:

```js
{
  id: 'berth-window',
  name: 'Berth Window',
  shortName: 'BW',
  description: '...',
  href: '/admin/berth-window',
  category: 'Khai thác cầu bến'
}
```

Để thêm tool mới:

1. Thêm metadata vào `adminTools.js`.
2. Tạo model/service nếu tool có dữ liệu riêng.
3. Tạo controller trang và/hoặc API controller.
4. Khai báo web route trong `adminRoutes.js`, API route trong `apiRoutes.js`.
5. Tạo EJS view và truyền tối thiểu `user`, `activePage`, `navigationTools` để dùng các partial admin.
6. Đặt asset riêng dưới `public/css` và `public/js`; chỉ load ở view của tool đó.
7. Wire dependency trong `createApp()` thay vì import singleton DB trực tiếp, để test được với SQLite in-memory.
8. Thêm integration test cho auth, render route và API của tool.

Nếu số tool tăng nhiều, nên tách `adminController.js` thành dashboard controller và controller trang riêng cho từng tool; hiện file này vẫn nhỏ nên chưa tách.

## 9. Responsive và fullscreen Berth Window

Nút `#fullscreenToggle` bật class `berth-focus-mode` trên `<body>`:

- Ẩn sidebar và admin topbar.
- Giữ nút thoát trong tool.
- Thử dùng Fullscreen API; nếu Safari/iOS từ chối thì CSS focus mode vẫn hoạt động.
- Có thể thoát bằng nút hoặc phím `Esc`.

JavaScript tự đổi tỷ lệ SVG:

- Desktop: `HOUR_PX = 9`, `M_PX = 0.45`.
- Mobile dọc: `HOUR_PX = 8`, `M_PX = 0.36`.
- Mobile ngang thấp hơn `560 px`: `HOUR_PX = 7`, `M_PX = 0.28`.

CSS landscape đưa 5 KPI lên một hàng và bố trí danh sách/chi tiết thành hai cột. Khi sửa SVG, phải kiểm tra ít nhất desktop, mobile dọc và mobile ngang.

## 10. Cài đặt và vận hành

Yêu cầu Node.js 20 trở lên:

```bash
npm install
cp .env.example .env
npm run dev
```

Mặc định chạy tại `http://localhost:3000`.

```dotenv
PORT=3000
NODE_ENV=development
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@123
DATABASE_PATH=./data/mpc_ops.sqlite
```

Tài khoản mặc định chỉ dành cho local: `admin / Admin@123`. Trước khi chạy lần đầu ở môi trường thật, phải thay `SESSION_SECRET` và `ADMIN_PASSWORD`. Production sẽ từ chối khởi động nếu không có `SESSION_SECRET`.

Các script:

```bash
npm run dev   # node --watch
npm start     # chạy thông thường
npm test      # integration tests
```

`server.js` bắt `SIGINT/SIGTERM`, đóng HTTP server, cleanup timer và SQLite connection trước khi thoát.

## 11. Kiểm thử

`test/app.test.js` tạo app qua `createApp({...})` với `databasePath: ':memory:'`. Hiện test bao phủ:

- Health check.
- Static assets.
- API từ chối request chưa đăng nhập.
- Login sai và login đúng.
- Redirect vào dashboard.
- Render dashboard và Berth Window, bao gồm nút fullscreen.
- Đọc, ghi và đọc lại snapshot SQLite.
- Payload không hợp lệ trả `422`.
- Logout hủy session.

Sau mọi thay đổi backend/frontend liên quan tool, chạy:

```bash
npm test
node --check public/js/berth-window.js
git diff --check
```

Test hiện chưa chạy trình duyệt thật, chưa kiểm tra pixel/layout và chưa mô phỏng Fullscreen API. Với thay đổi responsive, cần kiểm tra thủ công tối thiểu ở khoảng `390×844`, `844×390` và desktop.

## 12. Giới hạn hiện tại và hướng mở rộng

- Chỉ có một admin seed và chưa có màn hình quản lý user/đổi mật khẩu.
- Role được lưu nhưng chưa được dùng để phân quyền.
- Chưa có CSRF token và rate limit cho login; `sameSite=strict` chỉ giảm một phần rủi ro.
- Berth data là một snapshot JSON duy nhất; chưa có CRUD theo call và chưa có version/audit history.
- Conflict/KPI chạy ở frontend; backend chưa validate các quy tắc này trước khi lưu.
- Chưa có tối ưu xếp cầu, kéo-thả, timestamp thật, AIS/EDI hoặc dữ liệu triều thực tế.
- Không có browser E2E test.

Khi chuyển từ prototype sang vận hành thật, ưu tiên: quản lý user và CSRF/rate limit, chuẩn hóa schema berth data, versioning/audit trail, backend validation nghiệp vụ, sau đó mới thêm kéo-thả hoặc thuật toán tối ưu.
