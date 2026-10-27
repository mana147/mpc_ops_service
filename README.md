# MPC Ops Service — AI Agent Handoff

## nhớ đọc CODEX.md

## 1. Đọc nhanh trước khi sửa code

Đây là ứng dụng nội bộ Node.js dùng **Express 5 + EJS + SQLite**, tổ chức theo MVC. Người dùng đăng nhập admin, vào dashboard `/admin`, sau đó mở các tool nghiệp vụ. Tool đầu tiên và hiện là tool duy nhất là **Berth Window** tại `/admin/berth-window`.

Trạng thái hiện tại:

- Authentication bằng username/password, mật khẩu hash với `bcryptjs`.
- Session 8 giờ được lưu trong chính SQLite, không dùng MemoryStore.
- Dashboard và admin shell đã sẵn sàng để gắn thêm tool.
- Berth Window đọc/ghi JSON snapshot riêng theo từng tuần trong SQLite qua API có bảo vệ đăng nhập.
- Đã có schema SQLite chuẩn hóa 11 bảng và CLI `npm run db:migrate` để import snapshot thành kế hoạch nháp theo tuần. API hiện tại chưa chuyển sang các bảng mới; xem mục 13.
- Frontend tự tính xung đột, KPI và vẽ SVG; backend hiện chỉ validate cấu trúc trước khi lưu.
- Berth Window có hai chế độ dùng chung dataset: biểu đồ không gian–thời gian trong khoảng ngày chọn và sơ đồ cầu bến 2D tại một thời điểm do người dùng chọn.
- Bấm nhãn thời gian trên topbar để mở lịch chọn từ 1 đến 30 ngày (tính cả hai đầu); mặc định là hôm nay theo giờ Việt Nam. Biểu đồ, danh sách, KPI và sơ đồ 2D cùng dùng khoảng được chọn, có thể đi qua nhiều tuần/tháng/năm.
- Có form cấu hình tuyến cầu/cầu ảo, danh mục tàu và thêm/sửa/xóa lượt tàu. Mặc định chưa có tên tuyến, thông số cầu bến hoặc đoạn cầu ảo; người dùng tự nhập cấu hình từ đầu.
- Mặc định không tạo dữ liệu demo: cấu hình cầu bến, danh mục tàu, lượt tàu và khung triều đều trống để người dùng nhập tay chạy thử nghiệm. Giao diện hiển thị “Chưa cấu hình cầu bến” và chỉ cho thêm lượt tàu sau khi lưu tuyến cầu hợp lệ.
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
│       ├── berth-dates.js          # Ngày lịch, múi giờ Việt Nam và giới hạn 1–30 ngày dùng chung Node/browser
│       └── berth-window.js         # Render biểu đồ tuần, sơ đồ cầu bến 2D, KPI và conflict
├── src/
│   ├── config/
│   │   ├── adminTools.js           # Registry tool hiển thị ở dashboard và sidebar
│   │   └── database.js             # Mở DB, pragma, tạo bảng, seed admin và berth data
│   ├── controllers/
│   │   ├── adminController.js      # Render dashboard và trang Berth Window
│   │   ├── authController.js       # Login/logout và tạo/hủy session
│   │   └── berthWindowApiController.js # GET/PUT/reset dữ liệu tool
│   ├── data/
│   │   └── seedBerthData.js        # Snapshot trống khi khởi tạo/reset
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
│   │   ├── berthDataValidator.js   # Validate payload trước khi ghi DB
│   │   └── berthRange.js           # Ghép khoảng ngày, ghi ngược về snapshot tuần trong transaction
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

Payload khởi tạo/reset khi chưa cấu hình:

```json
{ "terminal": "", "quay": null, "berths": [], "vessels": [], "tideWindows": [], "calls": [] }
```

Trạng thái này vẫn cho phép nhập danh mục tàu, nhưng không cho lập lượt tàu hoặc khung triều. Sau khi nhập tuyến cầu, `berths` có thể để trống nếu chưa cần chia đoạn cầu ảo. Snapshot legacy thiếu `quay` vẫn cần có `berths` để suy ra chiều dài.

Ví dụ payload đã được người dùng cấu hình (các giá trị dưới đây chỉ minh họa, không được tự điền khi khởi tạo):

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
- Tab **Sơ đồ cầu bến 2D** dùng một thanh thời gian liên tục cho cả tuần và đặt tàu theo tỷ lệ `from/to` trên toàn chiều dài tuyến. Khi phát mô phỏng, tàu xuất hiện và tiến vào cầu trong 60 phút trước `start`, nằm tại cầu khi `start <= thời điểm chọn < end`, rồi rời cầu và mờ dần trong 60 phút sau `end`. Đây là chuyển động minh họa theo kế hoạch, không phải vị trí tàu thực tế.
- Tàu xung đột tại đúng thời điểm đang xem được xếp sang làn phụ để cả hai vẫn nhìn thấy; màu cam là cảnh báo tiếp nhận và màu đỏ là xung đột không gian–thời gian.
- Lần đầu mở hệ thống, snapshot legacy được gắn cho tuần hiện tại. Tuần chưa có dữ liệu kế thừa cấu hình tuyến/danh mục nhưng bắt đầu với `calls` và `tideWindows` trống.
- Endpoint reset gọi server để lấy lại `seedBerthData.js` cho tuần được chọn.

### Khoảng ngày tùy chọn

- Nhãn ngày là nút mở calendar, hỗ trợ chọn hai ngày trên lưới hoặc nhập ngày trực tiếp; có nút **Hôm nay**, **Tuần này**, chuyển tháng và chọn tháng/năm. `01/10 → 01/10` là 1 ngày; `01/10 → 30/10` là 30 ngày; `01/10 → 31/10` bị từ chối.
- Trang mới mở luôn xem hôm nay (Asia/Ho_Chi_Minh); sơ đồ 2D bắt đầu tại giờ hiện tại nếu hôm nay nằm trong khoảng chọn. Hai mũi tên dịch khoảng theo đúng số ngày đang xem, ví dụ khoảng 7 ngày dịch 7 ngày.
- `/api/berth-window/range?start=YYYY-MM-DD&end=YYYY-MM-DD` ghép các snapshot tuần, đưa `day` về tọa độ tương đối từ ngày bắt đầu khoảng. Lượt tàu bắt đầu trước khoảng nhưng chưa kết thúc vẫn xuất hiện; mét·giờ chỉ tính phần giao với khoảng chọn. ID lượt trong phép chiếu có tiền tố tuần để tránh trùng giữa các tuần.
- PUT vào API khoảng ngày chuyển lượt về tuần chứa ngày bắt đầu thực của nó. Sửa/xóa chỉ tác động lượt trong phép chiếu; lịch và khung triều ngoài khoảng được giữ lại. Tất cả tuần thay đổi được validate rồi ghi trong một transaction. API tuần cũ tiếp tục hoạt động; không đổi schema lưu trữ và không chạy migration.
- Cấu hình tuyến hiển thị lấy từ tuần chứa ngày bắt đầu. Khi sửa cấu hình, các trường thay đổi được áp dụng cho mọi tuần giao với khoảng chọn; toàn bộ lịch từng tuần đều được kiểm tra, kể cả lượt ngoài khoảng. Danh mục giống nhau được gộp để chọn tàu; mục mới thuộc tuần đầu khoảng và được chép sang tuần đích khi tạo lượt liên kết. Sửa danh mục cập nhật những tuần chứa mục đó, giữ thông số các lượt đã lập.
- Không thay khoảng đang hiển thị nếu tải thất bại; khóa thao tác đổi khoảng trong lúc tải/lưu. Form lượt tàu chọn ngày lịch cụ thể thay cho danh sách thứ trong tuần.

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
| `GET` | `/api/berth-window/range?start=YYYY-MM-DD&end=YYYY-MM-DD` | Ghép dữ liệu giao với khoảng 1–30 ngày, trả `{ start, end, days, data }` |
| `PUT` | `/api/berth-window/range?start=YYYY-MM-DD&end=YYYY-MM-DD` | Lưu phép chiếu về các snapshot tuần, giữ lịch ngoài khoảng và rollback toàn bộ nếu có lỗi |
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

CSS landscape đưa 5 KPI lên một hàng và bố trí danh sách/chi tiết thành hai cột. Sơ đồ 2D giữ tỷ lệ mét và cuộn ngang trên màn hình hẹp. Khi sửa SVG, phải kiểm tra ít nhất desktop, mobile dọc và mobile ngang.

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
BERTH_DEMO_YEAR=
```

`BERTH_DEMO_YEAR` mặc định để trống: khởi động không tạo hoặc bổ sung dữ liệu demo, kể cả sau khi người dùng đã xóa hết danh mục/lượt tàu. Chỉ đặt `BERTH_DEMO_YEAR=2026` khi chủ động muốn tạo lại dữ liệu demo (53 tuần, 08 tàu giả lập, 3–5 lượt/tuần). Chế độ demo bổ sung các mảng danh mục/lượt tàu đang trống; cần để trống biến này khi nhập tay thử nghiệm. Thay đổi biến không tự xóa dữ liệu đã lưu. Trong code, `createDatabase()` cũng mặc định không seed demo; có thể truyền `demoYear: 2026` để bật hoặc `demoYear: null` để tắt khi tạo app/database.

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
node --check public/js/berth-dates.js
git diff --check
```

Test hiện chưa chạy trình duyệt thật, chưa kiểm tra pixel/layout và chưa mô phỏng Fullscreen API. Với thay đổi responsive, cần kiểm tra thủ công tối thiểu ở khoảng `390×844`, `844×390` và desktop.

`test/berth-range.test.js` kiểm tra giới hạn 1/30/31 ngày, lịch qua năm/năm nhuận, múi giờ Việt Nam, xác thực API, lượt kéo qua đầu khoảng, ID trùng giữa các tuần, ghi đúng tuần, giữ lịch ngoài khoảng và rollback khi một tuần không hợp lệ.

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

# Tạo một DB local riêng với schema và snapshot trống.
npm run db:migrate -- --database ./data/berth_demo.sqlite --schema-only
```

Mặc định dùng `DATABASE_PATH` từ `.env`, nếu thiếu thì dùng `data/mpc_ops.sqlite`. DB có sẵn được backup vào thư mục `backups/` cạnh file DB bằng SQLite backup API (bao gồm WAL). Schema và import chạy trong một transaction. Chạy lại cùng nguồn/tuần sẽ không tạo dữ liệu trùng; nguồn đã thay đổi hoặc tuần khác sẽ bị từ chối để tránh ghi đè lịch sử.

Thời gian tuyệt đối lưu dưới dạng Unix milliseconds UTC; `week_start`/ngày hiệu lực dùng `YYYY-MM-DD`; template tuần dùng phút nguyên. Import chuyển `ata` cũ thành `planned_start_at`, để trống ATA/ATB/ATD thực tế, giữ `line` trong `legacy_line_label` và chưa suy diễn hãng tàu. Window import chỉ hiệu lực trong tuần được chọn; khung triều mang nguồn `legacy-demo`. Dữ liệu được tạo ở trạng thái `draft`, chưa phải kế hoạch đã được xác nhận nghiệp vụ.

**Phạm vi hiện tại:** CLI tạo database/schema và import một lần. `npm start` không tự chạy migration. Giao diện và API tiếp tục dùng snapshot JSON theo tuần; sửa trên giao diện không cập nhật bảng chuẩn hóa. Bảng legacy `berth_window_datasets` cũng không còn là dữ liệu runtime sau khi snapshot tuần đầu tiên được tạo. Bước tiếp theo là repository/API theo plan và service validate/publish có optimistic locking; chưa có UI hoặc endpoint cho việc này.

Chi tiết ràng buộc, quy ước và truy vấn kiểm tra: [note/berth_window_sqlite.md](note/berth_window_sqlite.md). Kiểm thử database nằm ở `test/berth-database.test.js` và được chạy cùng `npm test`.

### Tương thích CLI import

CLI dùng `quay.length` và `quay.safetyGap` khi snapshot có cấu hình mới. Các thông số cảng, danh mục và DWT vẫn được bảo toàn trong JSON gốc lưu ở `berth_legacy_imports.source_json`; schema chuẩn hóa hiện chưa có cột DWT hoặc toàn bộ thông số công trình. UI/API tiếp tục thao tác snapshot, chưa đồng bộ danh mục mới sang các bảng chuẩn hóa.

## Cấu hình và nhập dữ liệu

Mở **Cấu hình và nhập dữ liệu** trên trang Berth Window:

1. **Tuyến cầu và các đoạn cầu ảo:** nhập tên tuyến, chiều dài, số cầu thực tế, khoảng cách an toàn và các thông số cảng nếu có; thêm/sửa/xóa đoạn bằng tọa độ. Không cần dựng ranh giới giả cho các cầu thực tế. Cầu ảo có thể để trống nhưng không chồng nhau, không làm tăng chiều dài tuyến.
2. **Danh mục tàu:** nhập tên và LOA; IMO (7 chữ số, duy nhất) và DWT có thể để trống. ID được tạo tự động. Sửa danh mục không sửa thông số các lượt đã lập.
3. **Danh sách lượt tàu:** bấm **Thêm lượt tàu** ngay trên bảng để mở form; từng dòng có **Xem / Sửa / Xóa**, xóa cần xác nhận. Form thêm/sửa nằm trong hộp thoại, đóng bằng Hủy hoặc Esc.

   **Thêm / sửa lượt tàu:** chọn tàu từ danh mục hoặc dùng thông số từ lượt legacy đang có, số chuyến, tuyến/hãng tàu, thời gian bắt đầu, số giờ chiếm cầu, vị trí và mớn nước lượt tàu, số cẩu/sản lượng. Chọn cầu ảo chỉ gợi ý vị trí bắt đầu; kết thúc = bắt đầu + LOA. Lượt có thể đi qua nhiều đoạn ảo. Có thể sửa trực tiếp lượt legacy chưa liên kết danh mục, giữ thông số tàu, chiều dài chiếm cầu, cửa sổ cam kết và giờ gốc nếu không thay đổi. Lỗi lưu giữ form mở và hiển thị tại hộp thoại.

Mỗi nút lưu gửi phép chiếu khoảng ngày qua API, server ghi ngược về JSON snapshot tuần tương ứng. Lượt mới chưa có cửa sổ cam kết (`window: null`); sửa lượt cũ giữ cửa sổ/tolerance. `ata` legacy được dùng làm bắt đầu kế hoạch, không xác nhận ATA/ATB/ATD thực tế. Chuyển khoảng ngày tải dữ liệu độc lập từ các tuần tương ứng.

LOA hoặc DWT vượt ngưỡng do người dùng nhập hiển thị cảnh báo kiểm tra tiếp nhận, không chặn lưu. DWT thiếu hiển thị “Chưa cung cấp”, không suy diễn. Các thông số công bố, độ sâu, vũng quay và nguồn đều do người dùng nhập; không tự dùng độ sâu/vũng quay để kết luận mớn nước/LOA cho phép.

Khởi động ứng dụng không tự thay đổi cấu hình đã nhập. Giảm chiều dài tuyến sẽ bị từ chối nếu còn vị trí tàu ngoài tuyến; cần điều chỉnh lịch trước. Endpoint reset đưa snapshot tuần được chỉ định về trạng thái hoàn toàn trống, gồm cả cấu hình cầu bến, danh mục và lịch. CLI import kế hoạch cần snapshot legacy đã có cấu hình cầu hợp lệ; database mới chưa cấu hình chỉ dùng `--schema-only`.
