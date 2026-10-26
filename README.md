# MPC Ops Service — AI Agent Handoff

## 1. Đọc nhanh trước khi sửa code

Đây là ứng dụng nội bộ Node.js dùng **Express 5 + EJS + SQLite**, tổ chức theo MVC. Người dùng đăng nhập admin, vào dashboard `/admin`, sau đó mở các tool nghiệp vụ. Tool đầu tiên và hiện là tool duy nhất là **Berth Window** tại `/admin/berth-window`.

Trạng thái hiện tại:

- Authentication bằng username/password, mật khẩu hash với `bcryptjs`.
- Session 8 giờ được lưu trong chính SQLite, không dùng MemoryStore.
- Dashboard và admin shell đã sẵn sàng để gắn thêm tool.
- Berth Window đọc/ghi JSON snapshot riêng theo từng tuần trong SQLite qua API có bảo vệ đăng nhập.
- Đã có schema SQLite chuẩn hóa 11 bảng và CLI `npm run db:migrate` để import snapshot thành kế hoạch nháp theo tuần. API hiện tại chưa chuyển sang các bảng mới; xem mục 13.
- Frontend tự tính xung đột, KPI và vẽ SVG; backend hiện chỉ validate cấu trúc trước khi lưu.
- Có form cấu hình tuyến cầu/cầu ảo, danh mục tàu và thêm/sửa/xóa lượt tàu. Seed nền là tuyến 380 m, 02 cầu thực tế và một đoạn ảo V1.
- Có dữ liệu demo theo tuần phủ tháng 01–12/2026: 08 tàu giả lập và 3–5 lượt tàu mỗi tuần. Tên/ID đều có dấu hiệu `DEMO`, không phải dữ liệu khai thác thật.
- Có chế độ toàn màn hình chỉ hiển thị tool, cùng layout riêng cho điện thoại dọc/ngang.
- Test tích hợp dùng `node:test` + Supertest + SQLite in-memory.

Các quyết định quan trọng không được bỏ qua:

1. API runtime đọc/ghi `berth_window_week_datasets`, khóa bằng ngày Thứ Hai `week_start`. Bảng `berth_window_datasets` (`id = 1`) được giữ làm nguồn chuyển tiếp legacy; các bảng vessel/call/window/plan tạo bằng CLI chưa tự đồng bộ với snapshot tuần.
2. Chiều dài tuyến lấy từ `quay.length`; đoạn cầu ảo và vị trí tàu phải nằm trong phạm vi đó. Snapshot cũ thiếu `quay` được suy ra chiều dài từ `berths`, không tự chuyển hoặc ghi đè dữ liệu cũ.
3. Cấu hình seed nền nằm ở `src/data/seedBerthData.js`; dữ liệu demo năm nằm ở `src/data/demoBerthData.js`. Frontend chờ API, không dùng dữ liệu mẫu dự phòng. `public/js/berth-domain.js` chia sẻ cách đọc cấu hình và cảnh báo năng lực giữa Node/trình duyệt.
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
- Không có ORM. Schema nền được tạo idempotently lúc khởi động; schema Berth Window chuẩn hóa dùng SQL migration có version/checksum, chạy riêng bằng CLI.
- JavaScript frontend thuần, không bundler và không framework UI.
- Asset tĩnh được phục vụ trực tiếp từ `public/`.
- Tên field API đang dùng camelCase; field nghiệp vụ trong JSON chủ yếu là tên ngắn theo tool cũ.
- Toàn bộ route admin và API nghiệp vụ phải đi qua `requireAuth`.

## 4. Cấu trúc và trách nhiệm từng file

```text
.
├── public/
│   ├── css/
│   │   ├── app.css                 # Login, dashboard và admin shell
│   │   └── berth-window.css        # Thành phần riêng của tool và responsive mobile
│   └── js/
│       ├── berth-domain.js         # Cấu hình tương thích snapshot cũ và cảnh báo năng lực
│       └── berth-window.js         # Render SVG, KPI và conflict theo dữ liệu snapshot
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
│   │   └── BerthWindow.js          # Đọc/ghi JSON snapshot theo week_start
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

`src/config/database.js` bật `foreign_keys`, WAL và `busy_timeout = 5000`, sau đó tạo ba bảng nền dưới đây. CLI ở mục 13 bổ sung các bảng Berth Window chuẩn hóa.

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

### `berth_window_week_datasets`

| Field | Ý nghĩa |
|---|---|
| `week_start` | Primary key, ngày Thứ Hai dạng `YYYY-MM-DD` |
| `json_data` | Snapshot Berth Window riêng của tuần |
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
  "terminal": "Tuyến cầu cảng",
  "quay": {
    "length": 380, "physicalBerthCount": 2,
    "depth": -9.5, "depthDatum": "",
    "turningBasin": 365, "turningBasinMeasurement": "unconfirmed",
    "maxLoa": 225, "maxDwt": 40000, "safetyGap": 25,
    "capacitySource": "Thông tin website cảng do người dùng cung cấp"
  },
  "vessels": [],
  "berths": [
    { "code": "V1", "from": 0, "to": 380 }
  ],
  "tideWindows": [
    { "day": 0, "from": 2.5, "to": 7 }
  ],
  "calls": [
    {
      "id": "C1",
      "vessel": "TÀU VÍ DỤ",
      "service": "CIX",
      "line": "Ocean Line",
      "window": { "day": 0, "hour": 8, "dur": 22 },
      "ata": { "day": 0, "hour": 7.7 },
      "dur": 22,
      "from": 0,
      "to": 225,
      "loa": 225,
      "draft": 8,
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

Validator backend kiểm tra kiểu dữ liệu, khoảng ngày/giờ, ID call không trùng, `from < to`, cẩu là số nguyên dương và mọi vị trí nằm trong chiều dài tuyến cấu hình. Với lượt liên kết danh mục (`vesselId`), đoạn chiếm cầu phải đủ LOA. Cầu ảo không được trùng mã hoặc chồng lấn. Nó chưa kiểm tra xung đột nghiệp vụ, điều kiện thủy triều hoặc năng lực cẩu; ngưỡng LOA/DWT công bố chỉ tạo cảnh báo trên giao diện.

Logic frontend đáng chú ý:

- Xung đột khi hai call vừa chồng thời gian vừa chồng không gian sau khi cộng safety gap từ `quay.safetyGap` (mặc định `25 m`).
- KPI gồm mét·giờ khai thác, số lượt tàu, window adherence, tổng giờ trễ và số tàu có xung đột.
- Chuyển tuần tải snapshot riêng bằng `weekStart`; `day/hour` vẫn là tọa độ tương đối bên trong tuần đang chọn.
- Lần đầu mở hệ thống, snapshot legacy được gắn cho tuần hiện tại. Tuần chưa có dữ liệu kế thừa cấu hình tuyến/danh mục nhưng bắt đầu với `calls` và `tideWindows` trống.
- Endpoint reset gọi server để lấy lại `seedBerthData.js` cho tuần được chọn.

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
| `GET` | `/api/berth-window?weekStart=YYYY-MM-DD` | Đọc snapshot của tuần, trả `{ weekStart, data, updatedAt, updatedBy }` |
| `PUT` | `/api/berth-window?weekStart=YYYY-MM-DD` | Validate và ghi snapshot của đúng tuần |
| `POST` | `/api/berth-window/reset?weekStart=YYYY-MM-DD` | Ghi lại seed server cho đúng tuần |

Mã lỗi chính: `400` khi `weekStart` không hợp lệ, `401` khi chưa đăng nhập, `422` khi payload không hợp lệ, `404` khi route không tồn tại, `500` cho lỗi nội bộ.

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

## 9. Responsive Berth Window

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
ADMIN_PASSWORD=Mpc@123
DATABASE_PATH=./data/mpc_ops.sqlite
BERTH_DEMO_YEAR=2026
```

`BERTH_DEMO_YEAR` mặc định là `2026`. Khi khởi động, ứng dụng tạo 53 snapshot tuần bao phủ các tuần có ngày thuộc năm 2026. Tuần chưa tồn tại được tạo mới; tuần đã tồn tại chỉ được bổ sung danh mục tàu hoặc danh sách lượt tàu khi mảng tương ứng đang trống. Cấu hình tuyến và dữ liệu không rỗng của người dùng được giữ nguyên. Có thể truyền `demoYear: null` khi tạo app trong kiểm thử để tắt seed demo.

Tài khoản mặc định chỉ dành cho local: `admin / Mpc@123`. Trước khi chạy lần đầu ở môi trường thật, phải thay `SESSION_SECRET` và `ADMIN_PASSWORD`. Production sẽ từ chối khởi động nếu không có `SESSION_SECRET`.

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
- Render dashboard và Berth Window.
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
- Berth data là các snapshot JSON theo tuần; chưa có endpoint CRUD riêng theo call (form hiện lưu toàn snapshot) và chưa có version/audit history.
- Conflict/KPI chạy ở frontend; backend chưa validate các quy tắc này trước khi lưu.
- Chưa có tối ưu xếp cầu, kéo-thả, timestamp thật, AIS/EDI hoặc dữ liệu triều thực tế.
- Chưa có bộ browser E2E tự động trong repository.

Khi chuyển từ prototype sang vận hành thật, ưu tiên: quản lý user và CSRF/rate limit, chuẩn hóa schema berth data, versioning/audit trail, backend validation nghiệp vụ, sau đó mới thêm kéo-thả hoặc thuật toán tối ưu.

## 13. SQLite Berth Window chuẩn hóa

Schema đã được hiện thực ở `src/database/migrations/001_berth_window.sql`, gồm 11 bảng nghiệp vụ:

```text
terminals, quays, berth_sections, shipping_lines, services, vessels,
berth_windows, tide_windows, vessel_calls, berth_plans, berth_plan_items
```

Hai bảng kỹ thuật là `schema_migrations` (version/checksum) và `berth_legacy_imports` (nguồn import, SHA-256, JSON gốc).

```bash
# Import JSON id=1 vào tuần cụ thể (ngày Thứ 2, giờ Việt Nam).
npm run db:migrate -- --week-start 2026-10-19

# Chỉ tạo schema, không import JSON.
npm run db:migrate -- --schema-only

# Tạo một DB local riêng; DB mới được seed tài khoản/dataset như ứng dụng.
npm run db:migrate -- --database ./data/berth_demo.sqlite --week-start 2026-10-19
```

Mặc định dùng `DATABASE_PATH` từ `.env`, nếu thiếu thì dùng `data/mpc_ops.sqlite`. DB có sẵn được backup vào thư mục `backups/` cạnh file DB bằng SQLite backup API (bao gồm WAL). Schema và import chạy trong một transaction. Chạy lại cùng nguồn/tuần sẽ không tạo dữ liệu trùng; nguồn đã thay đổi hoặc tuần khác sẽ bị từ chối để tránh ghi đè lịch sử.

Thời gian tuyệt đối lưu dưới dạng Unix milliseconds UTC; `week_start`/ngày hiệu lực dùng `YYYY-MM-DD`; template tuần dùng phút nguyên. Import chuyển `ata` cũ thành `planned_start_at`, để trống ATA/ATB/ATD thực tế, giữ `line` trong `legacy_line_label` và chưa suy diễn hãng tàu. Window import chỉ hiệu lực trong tuần được chọn; khung triều mang nguồn `legacy-demo`. Dữ liệu được tạo ở trạng thái `draft`, chưa phải kế hoạch đã được xác nhận nghiệp vụ.

**Phạm vi hiện tại:** CLI tạo database/schema và import một lần. `npm start` không tự chạy migration. Giao diện và API tiếp tục dùng snapshot JSON theo tuần; sửa trên giao diện không cập nhật bảng chuẩn hóa. Bảng legacy `berth_window_datasets` cũng không còn là dữ liệu runtime sau khi snapshot tuần đầu tiên được tạo. Bước tiếp theo là repository/API theo plan và service validate/publish có optimistic locking; chưa có UI hoặc endpoint cho việc này.

Chi tiết ràng buộc, quy ước và truy vấn kiểm tra: [note/berth_window_sqlite.md](note/berth_window_sqlite.md). Kiểm thử database nằm ở `test/berth-database.test.js` và được chạy cùng `npm test`.

### Tương thích CLI import

CLI dùng `quay.length` và `quay.safetyGap` khi snapshot có cấu hình mới. Các thông số cảng, danh mục và DWT vẫn được bảo toàn trong JSON gốc lưu ở `berth_legacy_imports.source_json`; schema chuẩn hóa hiện chưa có cột DWT hoặc toàn bộ thông số công trình. UI/API tiếp tục thao tác snapshot, chưa đồng bộ danh mục mới sang các bảng chuẩn hóa.

## Cấu hình và nhập dữ liệu

Mở **Cấu hình và nhập dữ liệu** trên trang Berth Window:

1. **Tuyến cầu và các đoạn cầu ảo:** nhập chiều dài, số cầu thực tế và thông số cảng; thêm/sửa/xóa đoạn bằng tọa độ. Không cần dựng ranh giới giả cho 02 cầu thực tế. Cầu ảo có thể để khoảng trống nhưng không chồng nhau, không làm tăng chiều dài tuyến.
2. **Danh mục tàu:** nhập tên và LOA; IMO (7 chữ số, duy nhất) và DWT có thể để trống. ID được tạo tự động. Sửa danh mục không sửa thông số các lượt đã lập.
3. **Danh sách lượt tàu:** bấm **Thêm lượt tàu** ngay trên bảng để mở form; từng dòng có **Xem / Sửa / Xóa**, xóa cần xác nhận. Form thêm/sửa nằm trong hộp thoại, đóng bằng Hủy hoặc Esc.

   **Thêm / sửa lượt tàu:** chọn tàu từ danh mục hoặc dùng thông số từ lượt legacy đang có, số chuyến, tuyến/hãng tàu, thời gian bắt đầu, số giờ chiếm cầu, vị trí và mớn nước lượt tàu, số cẩu/sản lượng. Chọn cầu ảo chỉ gợi ý vị trí bắt đầu; kết thúc = bắt đầu + LOA. Lượt có thể đi qua nhiều đoạn ảo. Có thể sửa trực tiếp lượt legacy chưa liên kết danh mục, giữ thông số tàu, chiều dài chiếm cầu, cửa sổ cam kết và giờ gốc nếu không thay đổi. Lỗi lưu giữ form mở và hiển thị tại hộp thoại.

Mỗi nút lưu ghi JSON snapshot của tuần đang mở qua API. Lượt mới chưa có cửa sổ cam kết (`window: null`); sửa lượt cũ giữ cửa sổ/tolerance. `ata` legacy được dùng làm bắt đầu kế hoạch trong tuần, không xác nhận ATA/ATB/ATD thực tế. Chuyển tuần tải dữ liệu độc lập của tuần tương ứng.

LOA >225 m hoặc DWT >40.000 hiển thị cảnh báo kiểm tra tiếp nhận, không chặn lưu. DWT thiếu hiển thị “Chưa cung cấp”, không suy diễn. Thông số công bố do người dùng trích website cảng, chưa đối chiếu nguồn trực tiếp. Độ sâu -9,5 m chưa có mốc chuẩn; kích thước vũng quay 365 m chưa xác nhận đường kính. Không tự dùng hai thông số này để kết luận mớn nước/LOA cho phép.

Database đang có giữ nguyên snapshot và lịch cũ. Đổi cấu hình sang 380 m sẽ bị từ chối nếu còn vị trí tàu ngoài tuyến; cần điều chỉnh lịch trước. Endpoint reset thay snapshot của tuần được chỉ định bằng cấu hình mới với danh mục/lịch trống, vì vậy chỉ dùng khi muốn xóa dữ liệu tuần đó.
