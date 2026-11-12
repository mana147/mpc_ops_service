# MPC Ops Service — AI Agent Handoff

## nhớ đọc CODEX.md , use-agent-browser.md

## 1. Đọc nhanh trước khi sửa code

Đây là ứng dụng nội bộ Node.js dùng **Express 5 + EJS + SQLite**, tổ chức theo MVC. Người dùng đăng nhập admin, vào dashboard `/admin`, sau đó mở các tool nghiệp vụ. Công cụ hiện tại là **Berth Window** tại `/admin/berth-window`, với trang **Cấu hình Berth Window** riêng tại `/admin/berth-window/settings`.

Trạng thái hiện tại:

- Authentication bằng username/password, mật khẩu hash với `bcryptjs`.
- Session 8 giờ được lưu trong chính SQLite, không dùng MemoryStore.
- Dashboard và admin shell đã sẵn sàng để gắn thêm tool.
- Cấu hình cầu bến và danh mục tàu dùng chung cho mọi tuần, lưu trong `terminals`, `quays`, `berth_sections`, `vessels`. Lịch tàu/khung triều tiếp tục lưu JSON theo tuần qua API có bảo vệ đăng nhập.
- Schema chuẩn hóa có 11 bảng nghiệp vụ và migration `002` bổ sung cấu hình dùng chung. Runtime dùng 4 bảng master; các bảng plan/call chuẩn hóa vẫn thuộc luồng CLI riêng, chưa dùng cho lịch runtime. Xem mục 13–14.
- Frontend vẽ SVG và KPI; backend kiểm tra cùng tàu trùng giờ, xung đột vị trí của lịch đã xác nhận và tổng nhu cầu cẩu khai báo. Bản nháp lưu được cảnh báo; lượt hủy không chiếm tài nguyên.
- Berth Window có hai chế độ dùng chung dataset: biểu đồ không gian–thời gian trong khoảng ngày chọn và sơ đồ cầu bến 2D tại một thời điểm do người dùng chọn.
- Bấm nhãn thời gian trên topbar để mở lịch chọn từ 1 đến 30 ngày (tính cả hai đầu); mặc định là hôm nay theo giờ Việt Nam. Biểu đồ, danh sách, KPI và sơ đồ 2D cùng dùng khoảng được chọn, có thể đi qua nhiều tuần/tháng/năm.
- Có form cấu hình tuyến cầu/cầu ảo, danh mục tàu và thêm/sửa/xóa lượt tàu. Mặc định chưa có tên tuyến, thông số cầu bến hoặc đoạn cầu ảo; người dùng tự nhập cấu hình từ đầu.
- Mặc định không tạo dữ liệu demo: cấu hình cầu bến, danh mục tàu, lượt tàu và khung triều đều trống để người dùng nhập tay chạy thử nghiệm. Giao diện hiển thị “Chưa cấu hình cầu bến” và chỉ cho thêm lượt tàu sau khi lưu tuyến cầu hợp lệ.
- Có chế độ toàn màn hình chỉ hiển thị tool, cùng layout riêng cho điện thoại dọc/ngang.
- Test tích hợp dùng `node:test` + Supertest + SQLite in-memory.

Các quyết định quan trọng không được bỏ qua:

1. Cấu hình/danh mục có một nguồn trong các bảng master, quản lý bởi `berth_shared_settings`. API lịch ghép master với `calls`/`tideWindows` trong `berth_window_week_datasets`, khóa theo Thứ Hai. JSON cấu hình cũ và `berth_window_datasets` chỉ giữ để đối chiếu; không còn là nguồn cấu hình runtime. Mỗi lần lưu phải gửi phiên bản vừa đọc.
2. Chiều dài tuyến lấy từ `quay.length`; đoạn cầu ảo và vị trí tàu phải nằm trong phạm vi đó. Hàm domain vẫn hỗ trợ snapshot legacy thiếu `quay`; chuyển sang master cần cấu hình đầy đủ, không tự suy diễn số cầu thực tế.
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
- Không có ORM. Database mới được tạo schema và master trống khi khởi động; database đã tồn tại phải chạy `npm run db:shared-config` trước. Migration có version/checksum, CLI backup trước khi chuyển dữ liệu.
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
│       ├── berth-calls.js          # Timestamp, tương thích legacy, cửa sổ và trạng thái dùng chung
│       ├── berth-call-form.js      # Form lượt 5 nhóm và validation giao diện
│       ├── berth-api.js            # Gọi API dùng chung, xử lý hết phiên
│       ├── berth-settings.js       # Form master, tab, trạng thái tàu và dữ liệu chưa lưu
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
│   │   └── seedBerthData.js        # Snapshot trống khi khởi tạo
│   ├── middleware/
│   │   └── auth.js                 # requireAuth + redirectIfAuthenticated
│   ├── models/
│   │   ├── User.js                 # Query user bằng prepared statement
│   │   ├── BerthSettings.js        # Đọc/ghi master và validate toàn bộ lịch
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
│   │   ├── admin/                  # dashboard.ejs, berth-window.ejs, berth-settings.ejs
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

`src/config/database.js` bật `foreign_keys`, WAL và `busy_timeout = 5000`, sau đó tạo 4 bảng nền dưới đây. Migration `001` tạo schema nghiệp vụ; `002` thêm trường cấu hình, định danh UUID tàu, trạng thái sử dụng, revision tuần và bảng `berth_shared_settings`.

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
| `json_data` | Lịch riêng của tuần (`calls`, `tideWindows`); JSON cũ còn giữ trường cấu hình để đối chiếu |
| `revision` | Tăng mỗi lần lưu/reset lịch, dùng chống ghi đè phiên bản cũ |
| `updated_at` | Thời gian cập nhật gần nhất |
| `updated_by` | FK tới `users.id` |

### `berth_shared_settings` và master

Bản ghi `id = 1` xác định terminal/quay dùng chung, `version`, tuần nguồn chuyển đổi và thông tin cập nhật. Danh mục nằm trong `vessels` với `external_id` giữ UUID, DWT và trạng thái sử dụng. Các trường công trình bổ sung nằm trong `quays`; xem mục 14.

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

Payload đọc khi khởi tạo database mới, chưa cấu hình:

```json
{ "terminal": "", "quay": null, "berths": [], "vessels": [], "tideWindows": [], "calls": [] }
```

Trạng thái này vẫn cho phép nhập danh mục tàu, nhưng không cho lập lượt tàu hoặc khung triều. Sau khi nhập tuyến cầu, `berths` có thể để trống nếu chưa cần chia đoạn cầu ảo. Snapshot legacy thiếu `quay` vẫn cần có `berths` để suy ra chiều dài.

Ví dụ snapshot **legacy** đã được cấu hình (chỉ minh họa, không tự điền khi khởi tạo). Form mới dùng mẫu lượt `schemaVersion: 2` ở mục 15:

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

Quy ước thời gian **legacy** (không dùng cho lượt mới):

- `day`: `0` là Thứ 2, `6` là Chủ nhật.
- `hour`: giờ thập phân, ví dụ `7.5` là `07:30`.
- `window = null`: tàu vãng lai, không có cửa sổ cam kết.
- `ata` trong tool hiện đóng vai trò thời điểm bắt đầu khối tàu trên biểu đồ.
- `dur`: số giờ chiếm cầu; lượt tàu có thể kết thúc sang ngày kế tiếp.

Validator kiểm tra cấu trúc, giới hạn tuyến, LOA, danh mục, số cẩu nguyên và đơn vị/cơ cấu sản lượng. Mẫu mới phân biệt unknown bằng null, kiểm tra timestamp kế hoạch/thực tế và điều kiện xác nhận. Service kiểm tra lịch toàn bộ các tuần trong transaction; cùng tàu không trùng giờ, lịch đã xác nhận không chồng vị trí và không vượt tổng cẩu khả dụng đã khai báo. Chưa kiểm tra triều/luồng/UKC hoặc lịch cẩu theo ca; ngưỡng LOA/DWT công bố vẫn là cảnh báo.

Logic frontend đáng chú ý:

- Xung đột khi hai call vừa chồng thời gian vừa chồng không gian sau khi cộng safety gap từ `quay.safetyGap` (mặc định `25 m`).
- KPI gồm mét·giờ/số lượt theo kế hoạch, window adherence **thực tế chỉ khi có ATB và cửa sổ**, tổng giờ lệch trễ kế hoạch và số lượt có xung đột. Không có ATB đủ điều kiện thì hiển thị “Chưa có dữ liệu”, không suy ra 0%. Lượt hủy không tính vào biểu đồ/KPI.
- Chuyển tuần tải lịch riêng bằng `weekStart`; cấu hình và danh mục luôn dùng master chung. `day/hour` vẫn là tọa độ tương đối bên trong tuần đang chọn.
- Tab **Sơ đồ cầu bến 2D** dùng một thanh thời gian liên tục cho cả tuần và đặt tàu theo tỷ lệ `from/to` trên toàn chiều dài tuyến. Khi phát mô phỏng, tàu xuất hiện và tiến vào cầu trong 60 phút trước `start`, nằm tại cầu khi `start <= thời điểm chọn < end`, rồi rời cầu và mờ dần trong 60 phút sau `end`. Đây là chuyển động minh họa theo kế hoạch, không phải vị trí tàu thực tế.
- Tàu xung đột tại đúng thời điểm đang xem được xếp sang làn phụ để cả hai vẫn nhìn thấy; màu cam là cảnh báo tiếp nhận và màu đỏ là xung đột không gian–thời gian.
- Tuần chưa có lịch bắt đầu với `calls` và `tideWindows` trống, ghép master chung khi đọc. CLI chuyển dữ liệu giữ lịch legacy vào tuần hiện tại nếu chưa có snapshot tuần nào.
- Endpoint reset chỉ xóa `calls`/`tideWindows` tuần được chọn, giữ cấu hình và danh mục dùng chung; yêu cầu phiên bản vừa đọc.

### Khoảng ngày tùy chọn

- Nhãn ngày là nút mở calendar, hỗ trợ chọn hai ngày trên lưới hoặc nhập ngày trực tiếp; có nút **Hôm nay**, **Tuần này**, chuyển tháng và chọn tháng/năm. `01/10 → 01/10` là 1 ngày; `01/10 → 30/10` là 30 ngày; `01/10 → 31/10` bị từ chối.
- Trang mới mở luôn xem hôm nay (Asia/Ho_Chi_Minh); sơ đồ 2D bắt đầu tại giờ hiện tại nếu hôm nay nằm trong khoảng chọn. Hai mũi tên dịch khoảng theo đúng số ngày đang xem, ví dụ khoảng 7 ngày dịch 7 ngày.
- `/api/berth-window/range?start=YYYY-MM-DD&end=YYYY-MM-DD` ghép các snapshot tuần, đưa `day` về tọa độ tương đối từ ngày bắt đầu khoảng. Lượt tàu bắt đầu trước khoảng nhưng chưa kết thúc vẫn xuất hiện; mét·giờ chỉ tính phần giao với khoảng chọn. ID lượt trong phép chiếu có tiền tố tuần để tránh trùng giữa các tuần.
- PUT vào API khoảng ngày chuyển lượt về tuần chứa ngày bắt đầu thực của nó. Sửa/xóa chỉ tác động lượt trong phép chiếu; lịch và khung triều ngoài khoảng được giữ lại. Timestamp mẫu mới hỗ trợ lượt dài hơn 7 ngày, kể cả bắt đầu ở một tuần xa trước khoảng xem. Tất cả tuần thay đổi được validate rồi ghi trong một transaction. API tuần vẫn hoạt động. Mẫu mới lưu timestamp trong JSON; migration 003 chỉ bổ sung năng lực cẩu vào master, không tự viết lại lượt legacy.
- Cấu hình/danh mục luôn lấy từ master, không phụ thuộc khoảng chọn. API lịch không sửa chúng. Lưu cấu hình trên trang riêng kiểm tra lịch của tất cả tuần; sửa danh mục giữ nguyên thông số trên các lượt đã lập. Tàu ngừng sử dụng không được chọn cho lượt mới.
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
| `GET` | `/admin/berth-window` | Admin | Biểu đồ, sơ đồ 2D và danh sách lượt tàu |
| `GET` | `/admin/berth-window/settings` | Admin | Cấu hình cầu/danh mục tàu dùng chung, không có bộ chọn tuần |
| `GET` | `/health` | Không | `{ "status": "ok" }` |

### API routes

| Method | Route | Kết quả |
|---|---|---|
| `GET` | `/api/berth-window/range?start=YYYY-MM-DD&end=YYYY-MM-DD` | Ghép dữ liệu giao với khoảng 1–30 ngày, trả `{ start, end, days, data }` |
| `PUT` | `/api/berth-window/range?start=YYYY-MM-DD&end=YYYY-MM-DD` | Lưu phép chiếu về các snapshot tuần, giữ lịch ngoài khoảng và rollback toàn bộ nếu có lỗi |
| `GET` | `/api/berth-window?weekStart=YYYY-MM-DD` | Đọc snapshot của tuần, trả `{ weekStart, data, updatedAt, updatedBy }` |
| `PUT` | `/api/berth-window?weekStart=YYYY-MM-DD` | Validate và ghi snapshot của đúng tuần |
| `POST` | `/api/berth-window/reset?weekStart=YYYY-MM-DD` | Xóa lịch/triều của tuần, giữ master |
| `GET` | `/api/berth-window/settings` | Trả `{ version, updatedAt, updatedBy, data }` của master |
| `PUT` | `/api/berth-window/settings` | Nhận `{ version, data }`, validate mọi tuần rồi lưu master trong transaction |

API lịch trả thêm `versions: { settings, weeks: { "YYYY-MM-DD": revision } }`. PUT gửi lại `versions` cùng dữ liệu; reset gửi `{ versions }`. Không sửa token trên client. `409` nghĩa là phiên bản cũ/thiếu hoặc cố sửa master qua API lịch: tải lại trước khi lưu. Các lỗi khác: `400` tham số ngày sai, `401` chưa đăng nhập, `422` payload không hợp lệ, `404` route không có, `500` lỗi nội bộ.

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

CSS landscape đưa 5 KPI lên một hàng. Danh sách lượt tàu dùng toàn bộ chiều rộng; thông tin chi tiết mở bằng popup responsive từ bảng, biểu đồ hoặc sơ đồ 2D. Sơ đồ 2D giữ tỷ lệ mét và cuộn ngang trên màn hình hẹp. Khi sửa SVG hoặc popup chi tiết, phải kiểm tra ít nhất desktop, mobile dọc và mobile ngang.

## 10. Cài đặt và vận hành

Yêu cầu Node.js 20 trở lên:

```bash
npm install
cp .env.example .env
npm run dev
```

Mặc định chạy tại `http://localhost:3000`. Nếu database đã tồn tại và chưa chuyển cấu hình chung, chạy `npm run db:shared-config` trước khi khởi động; xem mục 14.

```dotenv
PORT=3000
NODE_ENV=development
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Mpc@123
DATABASE_PATH=./data/mpc_ops.sqlite
BERTH_DEMO_YEAR=
```

`BERTH_DEMO_YEAR` mặc định để trống: khởi động không tạo hoặc bổ sung dữ liệu demo, kể cả sau khi người dùng đã xóa hết danh mục/lượt tàu. Chỉ đặt `BERTH_DEMO_YEAR=2026` khi khởi tạo một database thử mới với dữ liệu demo (53 tuần, 08 tàu giả lập, 3–5 lượt/tuần). Chế độ demo bổ sung các mảng danh mục/lượt tàu đang trống; cần để trống biến này khi nhập tay thử nghiệm. Sau khi database đã dùng master chung, phải để trống biến này; hệ thống từ chối reseed để tránh trộn danh mục demo với dữ liệu chung. Thay đổi biến không tự xóa dữ liệu đã lưu. Trong code, `createDatabase()` cũng mặc định không seed demo; có thể truyền `demoYear: 2026` để bật hoặc `demoYear: null` để tắt khi tạo app/database.

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
node --check public/js/berth-settings.js
node --check public/js/berth-api.js
node --check public/js/berth-calls.js
node --check public/js/berth-call-form.js
git diff --check
```

Test hiện chưa chạy trình duyệt thật, chưa kiểm tra pixel/layout và chưa mô phỏng Fullscreen API. Với thay đổi responsive, cần kiểm tra thủ công tối thiểu ở khoảng `390×844`, `844×390` và desktop.

`test/berth-range.test.js` kiểm tra giới hạn 1/30/31 ngày, lịch qua năm/năm nhuận, múi giờ Việt Nam, xác thực API, lượt kéo qua đầu khoảng, ID trùng giữa các tuần, ghi đúng tuần, giữ lịch ngoài khoảng và rollback khi một tuần không hợp lệ.

## 12. Giới hạn hiện tại và hướng mở rộng

- Chỉ có một admin seed và chưa có màn hình quản lý user/đổi mật khẩu.
- Role được lưu nhưng chưa được dùng để phân quyền.
- Chưa có CSRF token và rate limit cho login; `sameSite=strict` chỉ giảm một phần rủi ro.
- Lịch là JSON theo tuần, chưa có endpoint CRUD riêng theo call. Đã có optimistic locking cho master và tuần; chưa có audit history hoặc đóng băng cấu hình cho lịch đã chốt.
- Backend đã validate trùng tàu, xung đột vị trí và tổng cẩu khai báo; chưa có lịch khả dụng từng cẩu/ca, kiểm tra điều kiện hàng hải hoặc tính năng suất thực tế từ giờ-cẩu.
- Chưa có tối ưu xếp cầu, kéo-thả, timestamp thật, AIS/EDI hoặc dữ liệu triều thực tế.
- Chưa có bộ browser E2E tự động trong repository.

Khi chuyển từ prototype sang vận hành thật, ưu tiên: quản lý user và CSRF/rate limit, chuyển lịch sang schema chuẩn hóa, audit trail/đóng băng kế hoạch, backend validation nghiệp vụ, sau đó mới thêm kéo-thả hoặc thuật toán tối ưu.

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

**Phạm vi hiện tại:** CLI kế hoạch tạo/import bản nháp vào các bảng plan/call chuẩn hóa. Runtime đã dùng `terminals`, `quays`, `berth_sections`, `vessels` cho master, nhưng lịch vẫn lưu JSON tuần và không đồng bộ với `berth_plans`/`vessel_calls`. Database mới tự khởi tạo; database có sẵn chuyển bằng CLI mục 14. Chưa có UI hoặc endpoint validate/publish kế hoạch chuẩn hóa.

Chi tiết ràng buộc, quy ước và truy vấn kiểm tra: [note/berth_window_sqlite.md](note/berth_window_sqlite.md). Kiểm thử database nằm ở `test/berth-database.test.js` và được chạy cùng `npm test`.

### Tương thích CLI import

CLI dùng `quay.length` và `quay.safetyGap` khi snapshot có cấu hình mới. Các thông số cảng, danh mục và DWT vẫn được bảo toàn trong JSON gốc lưu ở `berth_legacy_imports.source_json`; migration `002` đã bổ sung DWT và thông số công trình cho master. CLI import kế hoạch legacy vẫn giữ cách ánh xạ cũ và không phải lệnh chuyển cấu hình runtime; dùng mục 14 cho việc đó.

## 14. Chuyển cấu hình dùng chung

```bash
# Database cũ: backup bằng SQLite API (bao gồm WAL), migrate và chuyển master.
npm run db:shared-config

# Chọn cấu hình nguồn sau khi đối chiếu nếu có nhiều cấu hình khác nhau.
npm run db:shared-config -- --source-week 2026-10-26

# Chuyển một bản database riêng để thử trước.
npm run db:shared-config -- --database /path/to/trial.sqlite
```

CLI giữ nguyên JSON cũ, hợp nhất danh mục theo UUID và IMO. Một cấu hình không trống duy nhất được chọn tự động; nhiều cấu hình khác nhau cần `--source-week`. UUID có thông số mâu thuẫn hoặc IMO trùng giữa các UUID sẽ dừng và rollback. Nếu bảng master chuẩn hóa đã có dữ liệu từ CLI kế hoạch, phải đối chiếu trước; không tự trộn hai nguồn. Chạy lại không nhập trùng hoặc ghi đè master đã lưu.

`berth_shared_settings` lưu terminal/quay đang sử dụng, phiên bản, tuần nguồn và người/thời gian cập nhật. `vessels.external_id` giữ UUID cũ, `active = 0` là ngừng sử dụng. Các master cập nhật trong một transaction, kiểm tra toàn bộ lịch tuần trước khi lưu. API lịch chỉ ghi `calls` và `tideWindows`; JSON cấu hình cũ không còn tham gia đọc/ghi runtime.

Mọi tuần dùng cấu hình hiện hành, vì vậy đổi safety gap sẽ tính lại conflict/KPI khi xem lịch cũ. Thông số tàu trên từng call được giữ nguyên. Chưa có cơ chế đóng băng cấu hình lịch đã chốt. Test bổ sung: `test/shared-settings.test.js`.

## 15. Lượt tàu mẫu 2 và điều kiện xác nhận

Trước khi dùng phiên bản này trên database đã có, chạy `npm run db:shared-config`. CLI backup cả WAL và áp dụng migration `003_berth_crane_capacity.sql`; không nhập lại master hoặc viết lại JSON lịch cũ. Database mới tự khởi tạo đủ migration.

Lượt mới lưu JSON với `schemaVersion: 2`, không dùng `ata`, `dur`, `window` legacy:

- `plannedStartAt`, `plannedEndAt`, `etaAt`: Unix milliseconds UTC. Giao diện nhập/hiển thị giờ Việt Nam UTC+7; `etaLocation` ghi rõ cảng, vùng neo hoặc điểm chờ.
- `commitment`: null cho vãng lai, hoặc `{ startAt, endAt, earlyToleranceHours, lateToleranceHours }`. Ngày cửa sổ độc lập với ngày cập thực tế/kế hoạch, có thể đi qua tuần/năm.
- `voyageIn`, `voyageOut`, `service`, `line`, `agent`; `from`, `to`, `berthingSide`, `bowDirection`; `arrivalDraft`, `departureDraft`; `priority`, `notes`.
- `cargo`: `{ type, unit, total, discharge, load, restow }`. Container dùng moves nguyên; có thể nhập tổng trước hoặc đủ ba thành phần để cộng tự động. Hàng tổng hợp/rời dùng tấn, m³ hoặc đơn vị; không tự đổi TEU sang moves hoặc đổi số lượng khi đổi loại hàng/đơn vị.
- `cranes`: null khi chưa phân bổ, 0 cho lượt không làm hàng. `quay.availableCranes` là tổng cẩu cầu do người dùng nhập trong cấu hình; null/thiếu nghĩa là chưa biết.
- `actual`: các mốc `arrivalAt`, `berthAt`, `operationsStartAt`, `operationsEndAt`, `departureAt`, chỉ nhập khi chỉnh lượt đã có. Không lấy giờ kế hoạch làm giờ thực tế; kiểm tra trình tự, mốc phụ thuộc và không chấp nhận tương lai.
- Server cấp `callReference`, `createdAt/By`, `updatedAt/By`; chuyển tuần giữ mã và snapshot thông số tàu, kể cả danh mục sau đó thay đổi.

Trạng thái kế hoạch là `draft`, `confirmed`, `cancelled`; tình trạng khai thác được suy ra từ mốc thực tế. Nháp cho phép thiếu ETA, mớn, cẩu và sản lượng (null), có thể có cảnh báo vị trí/cẩu nhưng không cho trùng giờ cùng tàu. Xác nhận cần ETA không sau giờ cập (trừ cập nhật có ATB thực tế), mớn đến/mạn cập, sản lượng và cẩu làm hàng; tổng cẩu cần được cấu hình. Xung đột vị trí với lịch xác nhận/legacy hoặc vượt tổng cẩu đồng thời sẽ bị từ chối, rollback toàn bộ tuần liên quan. Lượt hủy được giữ trong bảng nhưng không chiếm vị trí/cẩu hoặc tham gia KPI. Ưu tiên cao cần lý do trong ghi chú.

GET khoảng ngày trả thêm `warnings` (week/callId/message) và `windowSuggestions` dùng gợi ý cửa sổ từ các lượt đã lưu. Lưu nháp trả cảnh báo nhưng vẫn thành công; các kiểm tra chặn trả 422. Cơ chế `versions`/409 vẫn áp dụng. Lịch tiếp tục lưu JSON tuần, chưa chuyển runtime sang `vessel_calls`/`berth_plans` chuẩn hóa; không tự chạy importer kế hoạch legacy để chuyển mẫu 2.

Giới hạn: tổng cẩu hiện là năng lực khai báo tĩnh cho toàn bộ kế hoạch, chưa phân cẩu theo ca/bảo dưỡng hoặc phân biệt cẩu tàu; chưa tự kiểm tra an toàn hàng hải theo độ sâu/triều/UKC. KPI năng suất hiển thị là bình quân dự kiến theo giờ chiếm cầu, không phải GCR/BMPH thực tế. Test nghiệp vụ nằm ở `test/berth-call-planning.test.js`.

## Cấu hình và nhập dữ liệu

Mở menu **Công cụ → Cấu hình Berth Window** (hoặc liên kết trên trang biểu đồ). Trang riêng có hai tab: **Tuyến cầu và cầu ảo**, **Danh mục tàu**. Hai trang giữ khoảng ngày qua URL khi chuyển bằng menu hoặc liên kết trong nội dung:

1. **Tuyến cầu và các đoạn cầu ảo:** nhập tên tuyến, chiều dài, số cầu thực tế, khoảng cách an toàn và các thông số cảng nếu có; thêm/sửa/xóa đoạn bằng tọa độ. Không cần dựng ranh giới giả cho các cầu thực tế. Cầu ảo có thể để trống nhưng không chồng nhau, không làm tăng chiều dài tuyến.
2. **Danh mục tàu:** nhập tên và LOA; IMO (7 chữ số, duy nhất) và DWT có thể để trống. ID được tạo tự động. Sửa danh mục không sửa thông số các lượt đã lập. **Ngừng sử dụng / Dùng lại** thay đổi khả năng chọn tàu cho lượt mới, không xóa lịch cũ.
3. **Danh sách lượt tàu:** bấm **Thêm lượt tàu** ngay trên bảng để mở form; từng dòng có **Xem / Sửa / Xóa**, xóa cần xác nhận. **Xem** hoặc chọn lượt trên bảng/biểu đồ/sơ đồ 2D mở popup chi tiết theo nhóm nghiệp vụ; đóng bằng nút Đóng, Esc hoặc bấm ra ngoài. Form thêm/sửa nằm trong hộp thoại, đóng bằng Hủy hoặc Esc.

   **Thêm / sửa lượt tàu:** form gồm 5 nhóm: thông tin lượt, kế hoạch thời gian, bố trí/cửa sổ, khai thác dự kiến và xác nhận/ghi chú. IMO/LOA/DWT/rộng lấy từ danh mục hoặc snapshot lượt đã lưu. Chọn cầu ảo chỉ gợi ý vị trí, có thể chỉnh chiều dài chiếm cầu đủ LOA. Có thể sửa legacy trực tiếp; khi lưu mới chuyển riêng lượt đó sang mẫu 2, giữ thông số tàu, chiều dài đoạn, cửa sổ/dung sai và thời điểm kế hoạch đến độ chính xác millisecond. Giờ thực tế không được suy diễn. Lỗi lưu giữ nguyên form; đóng hoặc Esc khi có thay đổi cần xác nhận.

Lưu cấu hình/danh mục gọi API settings độc lập với tuần. Thêm/sửa/xóa lượt tàu gửi phép chiếu khoảng ngày, server ghi lịch về JSON tuần tương ứng. Lượt mới có thể vãng lai hoặc theo cửa sổ cam kết; mặc định Nháp. Cửa sổ nhập trực tiếp hoặc lấy gợi ý từ lượt đã lưu (chưa phải thư viện hợp đồng có ngày hiệu lực). `ata` legacy chỉ là kế hoạch, không xác nhận ATA/ATB/ATD thực tế. Chuyển khoảng ngày tải dữ liệu độc lập từ các tuần tương ứng.

LOA hoặc DWT vượt ngưỡng do người dùng nhập hiển thị cảnh báo kiểm tra tiếp nhận, không chặn lưu. DWT thiếu hiển thị “Chưa cung cấp”, không suy diễn. Các thông số công bố, độ sâu, vũng quay và nguồn đều do người dùng nhập; không tự dùng độ sâu/vũng quay để kết luận mớn nước/LOA cho phép.

Khởi động ứng dụng không tự thay đổi cấu hình đã nhập. Giảm chiều dài tuyến sẽ bị từ chối nếu còn vị trí tàu ngoài tuyến ở bất kỳ tuần nào; thông báo chỉ rõ tuần/lượt cần điều chỉnh. Endpoint reset chỉ xóa lịch và khung triều tuần được chỉ định, giữ master chung. CLI import kế hoạch cần snapshot legacy đã có cấu hình cầu hợp lệ; database mới chưa cấu hình chỉ dùng `--schema-only`.
