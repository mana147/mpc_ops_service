**Berth window** (cửa sổ cầu bến) là một khoảng thời gian cố định, lặp lại theo chu kỳ — thường là hàng tuần — mà cảng cam kết dành sẵn một đoạn cầu bến cho một tuyến dịch vụ cụ thể của hãng tàu. Ví dụ: "tuyến CIX được cấp cửa sổ Thứ 2 08:00 → Thứ 3 06:00, tại mét 0–350 của cầu số 2".

Berth window management là toàn bộ hoạt động thương lượng, phân bổ, giám sát và điều chỉnh các cửa sổ đó. Cách trực quan nhất để hình dung là biểu đồ không gian–thời gian: trục ngang là thời gian, trục dọc là chiều dài cầu bến, mỗi con tàu là một hình chữ nhật.Chú ý hai điểm trong hình: khoảng trống dọc giữa các khối là *safety gap* giữa hai tàu (thường 15–30 m tùy cỡ tàu), và khối CIX 01 lặp lại đúng vị trí ở tuần kế tiếp — đó là bản chất "chu kỳ" của cửa sổ.

## Nội dung một berth window agreement

Đây là thỏa thuận hai chiều, không phải cảng ban phát cho hãng tàu:

**Cảng cam kết**: thời điểm bắt đầu/kết thúc cửa sổ, đoạn cầu bến, số cẩu bố trí (crane intensity), năng suất tối thiểu (moves/crane-hour hoặc berth moves per hour), quyền ưu tiên cập cầu.

**Hãng tàu cam kết**: đến trong cửa sổ (thường có dung sai ±2–4 giờ), khối lượng xếp dỡ tối thiểu và tối đa, gửi bayplan/danh sách container trước hạn (cut-off), thông báo ETA cập nhật.

**Điều khoản xử lý vi phạm**: tàu đến trễ ngoài cửa sổ thì mất quyền ưu tiên và chuyển sang first-come-first-served; nếu cảng không đáp ứng năng suất cam kết thì có thể phải chịu chi phí phát sinh.

## Chu kỳ lập kế hoạch

Thực tế vận hành chia làm bốn tầng, càng gần thời điểm thực càng chi tiết:

1. **Kế hoạch năm / mùa** — đàm phán cùng hợp đồng dịch vụ, xác định số cửa sổ cấp cho mỗi liên minh (alliance) và tuyến.
2. **Kế hoạch tuần** — chốt danh sách tàu, kiểm tra xung đột, phát hành berth plan cho 7 ngày.
3. **Rolling plan 24–72 giờ** — cập nhật theo ETA thực (từ AIS/VTS), điều chỉnh vị trí cập, phân bổ lại cẩu.
4. **Thời gian thực** — xử lý tàu trễ, hỏng cẩu, thời tiết; quyết định cho tàu vãng lai chèn vào hay bắt chờ.

Người phụ trách thường là berth planner trong phòng Kế hoạch, làm việc sát với vessel planner (xếp bay tàu) và yard planner (bãi).

## Chỉ số theo dõi

- **Berth occupancy ratio (BOR)** — quan trọng nhất. Theo lý thuyết hàng đợi, vượt khoảng 70–75% thì thời gian chờ tăng phi tuyến rất nhanh. Nhiều cảng hiểu nhầm rằng BOR càng cao càng tốt.
- **Window adherence / berth on arrival** — tỷ lệ tàu cập đúng cửa sổ.
- **Waiting time ratio** — thời gian chờ / thời gian làm hàng.
- **Berth moves per hour (BMPH)** và **gross crane rate (GCR)** — đo cam kết năng suất.
- **Schedule reliability** — hãng tàu dùng chỉ số này để đánh giá cảng.

## Ràng buộc thực tế phải đưa vào bài toán

Chiều dài và mớn nước cầu bến; **cửa sổ thủy triều** (tàu lớn chỉ vào/ra được trong khung giờ triều cường — với cảng sông như khu vực Hải Phòng đây là ràng buộc rất nặng); lịch hoa tiêu và tàu lai; số cẩu khả dụng và việc cẩu không thể vượt qua nhau trên cùng ray; ca kíp công nhân; tình trạng bãi (nếu bãi đầy thì cầu bến rảnh cũng vô nghĩa).

## Góc nhìn hệ thống

Vì bạn làm mảng hạ tầng CNTT, đây là phần có thể liên quan trực tiếp đến công việc:

- **Module berth planning trong TOS** là nơi cửa sổ được cấu hình và hiển thị đúng dạng biểu đồ trên. Các TOS phổ biến: Navis N4, CyberLogitec OPUS Terminal, RBS TOPS, Tideworks. Nhiều cảng Việt Nam còn dùng hệ thống tự phát triển.
- **Nguồn dữ liệu đầu vào**: ETA từ AIS/VTS, EDI từ hãng tàu (BAPLIE cho bayplan, COPRAR cho lệnh xếp dỡ, VESDEP/BERMAN cho khai báo tàu), Port Community System / Cổng thông tin một cửa quốc gia.
- **Bài toán tối ưu** phía sau gọi là **Berth Allocation Problem (BAP)**, có ba biến thể: discrete (cầu bến chia thành các bến rời rạc), continuous (tàu đặt ở vị trí bất kỳ dọc cầu — đúng như hình trên), và hybrid. Thường kết hợp với Quay Crane Assignment Problem thành BACAP. Mô hình hóa bằng MILP, giải thực tế bằng heuristic/metaheuristic vì bài toán NP-hard.
- **Vấn đề tích hợp hay gặp**: đồng bộ thời gian giữa các hệ thống, xử lý ETA thay đổi liên tục, versioning của berth plan, và audit trail khi có tranh chấp hợp đồng.


Tôi sẽ làm cả hai: phần nghiệp vụ viết thành các quy tắc mà hệ thống phải mã hóa, rồi dựng luôn một web app xem berth window chạy được để bạn mở ra và sửa theo dữ liệu thật.File chạy được ngay, không cần build hay server — mở bằng trình duyệt là xong. Bấm nút **Dữ liệu JSON** để xem và thay dữ liệu mẫu bằng dữ liệu thật của bạn.

Trong dữ liệu mẫu tôi cố tình cài một tình huống dây chuyền có thật ngoài hiện trường: HYUNDAI TERRA cập trễ 4 giờ so với cửa sổ, phần đuôi tràn sang khung mà HAI AN VIEW (tàu vãng lai) đã được xếp, và HAI AN VIEW lại chồng tiếp lên WAN HAI 316. Một lượt trễ tạo ra hai xung đột — đó chính là thứ mà berth window sinh ra để ngăn chặn.

---

# Phần A — Nghiệp vụ

## 1. Cửa sổ được cấp dựa trên cái gì

Không phải chia đều. Thứ tự ưu tiên trong thực tế:

**Khối lượng cam kết.** Tuyến mang 1.500 moves/chuyến được ưu tiên hơn tuyến 400 moves. Cảng tính theo doanh thu mét·giờ cầu bến chứ không theo số lượt tàu.

**Vị thế của liên minh.** 2M, Ocean Alliance, THE Alliance đàm phán theo cả nhóm tuyến, không đàm phán từng tàu.

**Tính khớp với luồng công việc bãi.** Tàu vào cùng lúc với cao điểm giao nhận cổng sẽ làm nghẽn bãi. Berth planner phải né.

**Ràng buộc vật lý** (không thương lượng được): mớn nước, LOA so với chiều dài đoạn cầu, khung thủy triều, tĩnh không nếu có cầu vượt luồng.

## 2. Công thức tính chiều dài cửa sổ

Đây là phép tính berth planner làm mỗi lần cấp cửa sổ:

```
Thời gian làm hàng  =  Tổng moves ÷ (Số cẩu × Năng suất cẩu × Hệ số hiệu dụng)
Chiều dài cửa sổ    =  Thời gian làm hàng + Thời gian cập/rời + Buffer
Chiều dài đoạn bến  =  LOA + Khoảng an toàn (thường 20–30 m)
```

Ví dụ: 1.450 moves, 3 cẩu, 28 moves/cẩu/giờ, hệ số hiệu dụng 0,85 → 1450 ÷ (3 × 28 × 0,85) ≈ 20,3 giờ. Cộng 1 giờ cập/rời và 1 giờ buffer → cửa sổ 22 giờ. Tàu LOA 294 m cần đoạn 294 + 25 = 319 m, làm tròn cấp 350 m.

Hệ số hiệu dụng là chỗ hay bị bỏ sót và cũng là chỗ hay gây tranh cãi hợp đồng. Nó gộp: thời gian đổi ca, di chuyển cẩu dọc ray, chờ xe nâng/đầu kéo, mở/đóng nắp hầm, container tái xếp trên tàu.

## 3. Số cẩu bố trí bị chặn trên bởi vật lý

Cẩu chạy chung ray, không vượt qua nhau được. Số cẩu tối đa cho một tàu ≈ LOA ÷ khoảng cách làm việc tối thiểu giữa hai cẩu (khoảng 35–40 m tùy loại cẩu). Tàu 294 m về lý thuyết chứa được 7–8 cẩu, nhưng thực tế bố trí 3–4 vì còn phải chia cẩu cho tàu bên cạnh và vì hiệu suất biên giảm dần khi thêm cẩu (mỗi cẩu thêm vào chỉ đóng góp khoảng 70–85% năng suất của cẩu trước).

## 4. Quy tắc xử lý tàu đến ngoài cửa sổ

Đây là phần phải viết thành logic trong hệ thống:

| Tình huống | Xử lý phổ biến |
|---|---|
| ATA trong dung sai (±2–4 h) | Giữ nguyên quyền ưu tiên, cập theo cửa sổ |
| Đến sớm hơn dung sai | Cập nếu cầu bến trống, nhưng không được đẩy tàu khác; nếu không thì neo chờ |
| Đến trễ trong ngưỡng chấp nhận (thường ≤ 6–8 h) | Vẫn giữ ưu tiên, cửa sổ trượt theo, cảng nén thời gian bằng cách tăng cẩu nếu có |
| Trễ quá ngưỡng | Mất quyền ưu tiên, chuyển sang first-come-first-served, xếp vào chỗ trống gần nhất |
| Bỏ chuyến / omit | Cửa sổ được giải phóng, mở cho tàu vãng lai |

## 5. Ngưỡng khai thác cầu bến

Berth occupancy ratio là chỉ số dễ hiểu sai nhất. Vì tàu đến ngẫu nhiên (mô hình hàng đợi M/E<sub>k</sub>/c), thời gian chờ trung bình tăng phi tuyến theo BOR:

- Cầu bến 1 bến độc lập: giữ dưới ~50%
- 2–3 bến liên thông: 60–65%
- 4–5 bến: 70%
- Trên 75%: thời gian chờ bùng nổ, cửa sổ mất ý nghĩa vì không còn buffer để hấp thụ tàu trễ

Cửa sổ cầu bến chính là cơ chế chuyển một hệ thống ngẫu nhiên thành hệ thống có lịch — nhờ đó cảng khai thác được ở mức BOR cao hơn mà thời gian chờ vẫn thấp. Đó là toàn bộ lý do kinh tế của nó.

## 6. Bộ KPI đối chiếu với hãng tàu

Hai bên đo lẫn nhau, thường rà soát hằng quý:

- **Cảng đo hãng tàu**: window adherence %, độ chính xác ETA (72h / 24h / 6h trước), tỷ lệ gửi bayplan đúng cut-off, độ lệch khối lượng so với cam kết.
- **Hãng tàu đo cảng**: berth on arrival %, waiting time ratio, GCR và BMPH thực tế so với cam kết, số giờ cẩu hỏng, tỷ lệ tàu rời cảng đúng ETD.

---

# Phần B — Hệ thống

## 1. Mô hình dữ liệu

Đây là bộ bảng tối thiểu để chạy được nghiệp vụ trên. Bốn nhóm thực thể:

**Cấu hình hạ tầng** — thay đổi rất ít, nhưng là gốc của mọi ràng buộc.
```
berth        (berth_id, code, quay_from_m, quay_to_m, max_draft_m, max_loa_m)
crane        (crane_id, code, rail_id, min_spacing_m, nominal_moves_ph, status)
tide_window  (tide_id, start_ts, end_ts, min_depth_m)   -- sinh từ lịch triều
```

**Hợp đồng cửa sổ** — bản mẫu lặp theo tuần, không phải sự kiện cụ thể.
```
service            (service_id, code, carrier_id, alliance, rotation, direction)
berth_window       (window_id, service_id, dow, start_hh24, duration_h,
                    quay_from_m, quay_to_m, tolerance_h, valid_from, valid_to)
window_commitment  (window_id, min_cranes, committed_bmph, min_moves, max_moves)
```
`dow + start_hh24` chứ không phải timestamp — vì đây là mẫu lặp. Có `valid_from`/`valid_to` để giữ lịch sử khi tái đàm phán, không ghi đè.

**Lượt tàu thực tế** — cái sinh ra hằng tuần.
```
vessel       (vessel_id, imo, name, loa_m, beam_m, max_draft_m)
vessel_call  (call_id, vessel_id, service_id, voyage_in, voyage_out,
              window_id,                 -- NULL nếu là tàu vãng lai
              eta, etb, etd, ata, atb, atd,
              planned_quay_from_m, planned_quay_to_m, actual_quay_from_m,
              declared_draft_m, status)
call_crane   (call_id, crane_id, from_ts, to_ts)
```
Tách rõ **ETA** (đến vùng neo), **ETB** (cập cầu), **ETD** (rời cầu) — ba mốc khác nhau, hay bị gộp làm một và gây sai lệch KPI.

**Phiên bản kế hoạch** — phần quan trọng nhất và hay bị bỏ sót.
```
berth_plan         (plan_id, horizon, published_at, published_by, status)
berth_plan_item    (plan_id, call_id, etb, etd, quay_from_m, quay_to_m, cranes)
berth_plan_change  (change_id, plan_id, call_id, field, old_value, new_value,
                    reason_code, changed_at, changed_by)
```
Vì kế hoạch thay đổi liên tục, bạn cần **snapshot bất biến** của bản đã phát hành cho hãng tàu. Khi có tranh chấp demurrage sáu tháng sau, câu hỏi luôn là "bản kế hoạch phát hành lúc 14:00 ngày X nói gì". Không có bảng này thì không trả lời được.

## 2. API

```
GET  /api/berth-plans?from=&to=&status=published
GET  /api/berth-plans/{plan_id}          → toàn bộ item + metadata
GET  /api/calls?from=&to=&service=       → dữ liệu vẽ biểu đồ
GET  /api/calls/{call_id}
GET  /api/windows?valid_at=              → mẫu cửa sổ đang hiệu lực
POST /api/calls/{call_id}/reschedule     → {etb, etd, quay_from_m, quay_to_m, reason_code}
POST /api/plans/{plan_id}/validate       → trả về danh sách vi phạm
POST /api/plans/{plan_id}/publish
GET  /api/kpi/berth?from=&to=            → BOR, adherence, waiting time
```

Endpoint `validate` là trái tim hệ thống. Nó trả về danh sách vi phạm có phân loại mức độ:

| Mã | Mức | Kiểm tra |
|---|---|---|
| `OVERLAP` | chặn | Chồng lấn không–thời gian sau khi cộng khoảng an toàn |
| `DRAFT` | chặn | Mớn nước khai báo vượt độ sâu đoạn cầu |
| `LOA` | chặn | Vị trí cấp ngắn hơn LOA + khoảng an toàn |
| `TIDE` | chặn | Thời điểm cập/rời nằm ngoài khung triều với tàu mớn sâu |
| `CRANE_CROSS` | chặn | Phân cẩu yêu cầu hai cẩu vượt nhau trên cùng ray |
| `WINDOW_MISS` | cảnh báo | ETB lệch khỏi cửa sổ quá dung sai |
| `BMPH_SHORT` | cảnh báo | Số cẩu bố trí không đạt được năng suất cam kết |
| `BOR_HIGH` | cảnh báo | Khai thác cầu bến trong ngày vượt ngưỡng |

Cho chạy validate ở cả hai phía: realtime khi planner kéo thả trên UI, và bắt buộc trước khi `publish`. Không bao giờ chỉ validate ở frontend.

## 3. Nguồn dữ liệu đầu vào

| Nguồn | Nội dung | Đặc điểm cần lưu ý |
|---|---|---|
| AIS / VTS | Vị trí, tốc độ, ETA suy ra | Cập nhật liên tục, nhiễu nhiều, cần lọc và làm mượt |
| EDI từ hãng tàu | BAPLIE (sơ đồ tàu), COPRAR (lệnh xếp dỡ), COARRI/CODECO (xác nhận) | Chuẩn UN/EDIFACT, thường qua SFTP hoặc VAN |
| Cảng vụ / Một cửa quốc gia | Thủ tục tàu vào/rời, xác nhận cấp phép | Ràng buộc pháp lý, không thể bỏ qua |
| Hoa tiêu, tàu lai | Lịch điều động | Thường là điện thoại/email, khó tự động hóa |
| Lịch triều | Bảng thủy triều theo trạm | Tính trước được cả năm, nên nạp sẵn |
| Nội bộ | Tình trạng cẩu, ca kíp, tồn bãi | Lấy từ TOS |

Với ETA từ AIS: đừng ghi đè trực tiếp lên trường `eta` trong `vessel_call`. Lưu vào bảng riêng `eta_feed(call_id, source, eta, received_at, confidence)` rồi để một quy tắc nghiệp vụ quyết định khi nào ETA mới đủ tin cậy để kích hoạt tái lập kế hoạch. AIS ETA do thuyền trưởng nhập tay, sai rất thường xuyên.

## 4. Thuật toán, nếu bạn muốn đi xa hơn view

Bài toán gốc là **Berth Allocation Problem**, biến thể liên tục (continuous BAP) — đúng như biểu đồ trong app. Kết hợp với phân cẩu thành **BACAP**. Bài toán NP-hard, nên thực tế:

- **Dưới ~30 tàu/tuần**: giải MILP trực tiếp bằng CBC hoặc HiGHS (miễn phí), OR-Tools CP-SAT cũng rất phù hợp. Chạy vài giây đến vài phút.
- **Lớn hơn**: heuristic dựng nghiệm ban đầu (xếp theo mức ưu tiên cửa sổ) rồi cải thiện bằng local search hoặc simulated annealing.

Hàm mục tiêu điển hình là tổng có trọng số của: độ lệch khỏi cửa sổ cam kết, độ lệch khỏi vị trí cập ưu tiên (vị trí gần bãi chứa hàng của tuyến đó giúp giảm quãng đường xe nâng), thời gian chờ, và chi phí phạt.

Nhưng lời khuyên thực tế: **đừng bắt đầu bằng tối ưu hóa**. Bắt đầu bằng đúng cái bạn đang định làm — một view tốt, cộng với validate tự động. Chỉ riêng việc planner nhìn thấy xung đột ngay khi kéo thả đã lấy được phần lớn giá trị. Tối ưu tự động là bước sau, và thường bị planner từ chối nếu họ không hiểu tại sao máy xếp như vậy.

## 5. Đề xuất lộ trình

1. **Read-only view** — đúng file trên, nối vào dữ liệu thật qua API. Đây là bước rẻ nhất và tạo niềm tin nhanh nhất.
2. **Validate tự động** — thêm bộ quy tắc ở mục 2. Vẫn chưa cho sửa, chỉ cảnh báo.
3. **Kéo thả + versioning** — planner sửa được, mọi thay đổi ghi vào `berth_plan_change`.
4. **Phát hành và chia sẻ** — xuất bản plan cho hãng tàu qua portal hoặc PDF/EDI.
5. **Bảng KPI** — window adherence, BOR, waiting time theo tuyến và theo tháng.
6. **Gợi ý tự động** — chỉ khi ba bước trên đã ổn định.

---

Bạn muốn tôi làm tiếp phần nào: bổ sung tính năng kéo thả và bộ validate vào file này, hay viết backend mẫu (schema SQL đầy đủ + API) để nối vào?




-------------------

File chạy được ngay, không cần build hay server — mở bằng trình duyệt là xong. Bấm nút Dữ liệu JSON để xem và thay dữ liệu mẫu bằng dữ liệu thật của bạn.

Trong dữ liệu mẫu tôi cố tình cài một tình huống dây chuyền có thật ngoài hiện trường: HYUNDAI TERRA cập trễ 4 giờ so với cửa sổ, phần đuôi tràn sang khung mà HAI AN VIEW (tàu vãng lai) đã được xếp, và HAI AN VIEW lại chồng tiếp lên WAN HAI 316. Một lượt trễ tạo ra hai xung đột — đó chính là thứ mà berth window sinh ra để ngăn chặn.
