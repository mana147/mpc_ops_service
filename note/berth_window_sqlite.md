# SQLite Berth Window — schema đã triển khai

File SQL: `src/database/migrations/001_berth_window.sql`.
Runner: `src/database/migrate.js`.
Importer: `src/services/importLegacyBerthData.js`.
CLI: `scripts/migrate-berth-db.js`.

Đây là bước tạo cấu trúc database và import dữ liệu. API/giao diện hiện tại vẫn dùng `berth_window_datasets`; các bảng chuẩn hóa là bản dữ liệu tại thời điểm import, chưa phải nguồn runtime của ứng dụng.

## Các bảng

| Bảng | Nội dung / quan hệ |
|---|---|
| `terminals` | Đơn vị khai thác, IANA timezone, safety gap mặc định |
| `quays` | Tuyến cầu liên tục, chiều dài; thuộc một terminal |
| `berth_sections` | Đoạn B1/B2/B3 và giới hạn vật lý nếu đã biết |
| `shipping_lines` | Danh mục hãng tàu đã xác minh |
| `services` | Mã tuyến trong terminal, hãng vận hành chính tùy chọn |
| `vessels` | Con tàu, IMO tùy chọn và duy nhất, LOA, beam, draft thiết kế |
| `berth_windows` | Điều khoản lặp tuần cho service/quay, ngày hiệu lực, dung sai, cam kết |
| `tide_windows` | Khoảng thời gian theo ngày thực, nguồn và ghi chú |
| `vessel_calls` | Một lần tàu ghé terminal, chuyến, ETA/ATA/ATB/ATD và mớn nước chuyến |
| `berth_plans` | Một phiên bản kế hoạch tuần: draft/published/superseded |
| `berth_plan_items` | Thời gian, vị trí, cẩu và sản lượng xếp cho call trong một plan |
| `schema_migrations` | Tên migration, SHA-256, thời điểm áp dụng |
| `berth_legacy_imports` | Nguồn import, tuần, plan và JSON gốc để đối chiếu |

Các trường `created_by`/`published_by` tham chiếu bảng `users` hiện có của ứng dụng. Schema SQL này được chạy sau schema nền trong `src/config/database.js`; CLI xử lý việc đó khi tạo DB mới.

## Quy ước

- Bật `PRAGMA foreign_keys = ON` trên **mọi connection**, không chỉ connection migration.
- Các bảng mới là `STRICT`; số cẩu, moves, duration và timestamp cần đúng kiểu.
- `*_at` là INTEGER Unix milliseconds UTC. Ví dụ local `19/10/2026 07:42` được lưu thành `2026-10-19T00:42:00.000Z` dưới dạng epoch milliseconds.
- `week_start` phải là ngày Thứ 2 hợp lệ. Import bắt buộc chỉ rõ tuần, không lấy ngày của máy chạy.
- `valid_from` bao gồm ngày đầu; `valid_to` không bao gồm ngày cuối, NULL là chưa có ngày kết thúc.
- `weekday`: 0 = Thứ 2. `start_minute`: 08:30 = 510. `duration_minutes` có thể kéo sang ngày/tuần sau.
- Các khoảng thời gian và vị trí dùng quy ước `[start, end)`; thời gian rời của tàu A bằng thời gian bắt đầu của B không tạo giao thời gian.
- Allocation dùng `quay_id`, `quay_from_m`, `quay_to_m`, có thể đi qua nhiều section. `quay_from_m/to_m` là đoạn chiếm dụng/cấp phát trong dữ liệu legacy; cần thống nhất cách tính phần buffer trước khi làm validator LOA/safety gap.
- `planned_start_at/end_at` là nguồn thời gian xếp cầu của một phiên bản plan. `requested_etb_at/etd_at` là yêu cầu đầu vào nếu có, không phải bản sao cần đồng bộ của plan.
- Một call có tối đa một allocation trong một plan. Chưa mô tả nhiều lần chuyển cầu trong cùng một call.
- Call thuộc service nhưng không có window vẫn hợp lệ. Không dùng riêng `service_id IS NULL` để suy ra loại lượt tàu.

## Ràng buộc database

CHECK/UNIQUE/FK và trigger bảo đảm:

- Phạm vi, thứ tự thời gian, số lượng và kiểu dữ liệu cơ bản hợp lệ.
- Section không chồng nhau và các vị trí không vượt chiều dài quay.
- Plan, quay, service, window và call liên kết đúng terminal bằng khóa ngoại ghép.
- Window được chọn phải thuộc service của call.
- Không lặp `(terminal_id, week_start, version)` hoặc `(plan_id, vessel_call_id)`.
- Mỗi terminal/tuần có tối đa một bản `published`; có thể có nhiều draft/version lịch sử.
- Plan cha phải thuộc cùng terminal/tuần và có version nhỏ hơn.
- Mọi UPDATE của plan cần tăng `lock_version` đúng một đơn vị.
- Item chỉ được thêm/sửa/xóa khi plan còn draft. Plan published chỉ được chuyển thành superseded; các trường nội dung không được thay đổi.
- Publish cần có `snapshot_json` của plan và từng item. Snapshot là object JSON; nội dung nghiệp vụ phải do service publish tạo đúng.
- Thay điều khoản window phải tạo row mới. UPDATE chỉ cho phép đóng `valid_to` của một bản đang mở hoặc giữ nguyên giá trị.
- Nhật ký import không được UPDATE/DELETE.

Database không tự tạo snapshot hoặc quyết định một bản kế hoạch đủ điều kiện phát hành. Service publish cần validate overlap/safety gap, LOA, draft/tide, năng lực cẩu và window adherence, rồi ghi snapshot chứa tên tàu/tuyến, thông số hạ tầng và điều khoản cam kết. Các rule này chưa được hiện thực trong CLI.

Để cập nhật draft an toàn, service tương lai cần bắt đầu transaction và thực hiện:

```sql
UPDATE berth_plans
SET lock_version = lock_version + 1
WHERE id = :plan_id AND status = 'draft' AND lock_version = :expected_version;
```

Nếu `changes = 0`, từ chối request và yêu cầu tải lại. Chỉ sau khi claim thành công mới sửa item, validate và commit trong cùng transaction. Trigger không thay thế thao tác so sánh version từ client. Khi publish version kế tiếp, chuyển bản published trước sang superseded và publish bản mới trong cùng transaction.

## Import JSON cũ

```bash
npm run db:migrate -- --week-start 2026-10-19
```

CLI tạo backup nhất quán bằng SQLite backup API trước khi sửa DB có sẵn, kể cả khi ứng dụng đang dùng WAL. Không phục hồi bằng cách chép đè file DB trong lúc server đang chạy; backup là DB đầy đủ để mở riêng và kiểm tra. Các backup nằm trong `data/backups/` với đường dẫn mặc định, được gitignore vì chứa cả dữ liệu tài khoản/session.

Runner lưu checksum; migration đã áp dụng không được sửa lại. Thay schema về sau phải tạo `002_...sql` mới. Schema và import nằm trong cùng transaction; lỗi import rollback cả migration mới.

Quy tắc chuyển đổi:

- Terminal dùng code `LEGACY-T1`, có một quay Q1 dài bằng `max(berths.to)`. Nếu call vượt phạm vi đó, import thất bại thay vì tự nới cầu.
- Cùng tên tàu và LOA trong snapshot được gom vào một vessel. Không khẳng định đó là định danh đủ để tự ghép với tàu từ nguồn khác.
- `call.id` giữ trong `legacy_call_id`; `call_code` là `<id>@<weekStart>`.
- `call.ata` cũ chuyển thành thời điểm xếp cầu dự kiến; không tạo dữ liệu ATA/ATB/ATD thực tế.
- `draft` chuyển thành mớn nước khai báo của call, không suy diễn mớn nước thiết kế của vessel.
- `line` được giữ nguyên trong `legacy_line_label`. Chưa tạo hãng tàu từ các nhãn chưa phân loại; `shipping_lines` ban đầu rỗng.
- `window` thành mẫu lặp với hiệu lực giới hạn trong tuần import, nguồn `legacy-import`. Vị trí hiện lấy từ `call.from/to` vì JSON cũ không có vị trí cam kết riêng; cần rà soát trước khi dùng làm hợp đồng thật.
- `tideWindows` được gắn vào ngày thực trong tuần import và đánh dấu `legacy-demo`. Chưa có độ sâu, trạm triều hoặc ngưỡng cho tàu, chỉ đủ hiển thị.
- Giờ thập phân được làm tròn đến phút gần nhất; JSON gốc được lưu nguyên trong archive.
- Import tạo plan draft, không tự publish hoặc tự sửa xung đột/LOA của dữ liệu mẫu.
- Import chỉ một lần cho nguồn `berth_window_datasets:1`. Chạy lại cùng SHA-256 và tuần trả về `imported: false`; nguồn hoặc tuần khác bị từ chối để tránh ghi đè hoặc nhân bản lịch mẫu thành dữ liệu vận hành.

Để có DB demo độc lập, dùng `--database ./data/berth_demo.sqlite`. DB mới được khởi tạo với users/session/dataset nền và seed tài khoản như ứng dụng; đặt biến ADMIN_USERNAME/ADMIN_PASSWORD phù hợp trước khi tạo DB mới.

## Truy vấn kiểm tra

```sql
PRAGMA foreign_key_check;
PRAGMA integrity_check;

SELECT p.id, p.week_start, p.version, p.status,
       c.call_code, v.name AS vessel,
       datetime(i.planned_start_at / 1000.0, 'unixepoch', '+7 hours') AS start_vn,
       datetime(i.planned_end_at / 1000.0, 'unixepoch', '+7 hours') AS end_vn,
       q.code AS quay, i.quay_from_m, i.quay_to_m, i.crane_count
FROM berth_plans p
JOIN berth_plan_items i ON i.plan_id = p.id
JOIN vessel_calls c ON c.id = i.vessel_call_id
JOIN vessels v ON v.id = c.vessel_id
JOIN quays q ON q.id = i.quay_id
ORDER BY p.week_start, p.version, i.planned_start_at;
```

Query trên là view live cho draft. Khi hiển thị bản phát hành lịch sử, đọc các trường mô tả từ snapshot đã khóa, không lấy tên/điều khoản hiện tại từ danh mục.

Lọc lịch theo khoảng thời gian phải dùng `planned_start_at < :to AND planned_end_at > :from` để lấy cả tàu bắt đầu ở tuần trước hoặc kết thúc sang tuần sau.
