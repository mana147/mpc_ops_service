-- Thời điểm tuyệt đối: Unix milliseconds UTC. Ngày hiệu lực: YYYY-MM-DD.
-- Chạy sau schema nền của ứng dụng (users); bật PRAGMA foreign_keys ở connection.

CREATE TABLE terminals (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  default_safety_gap_m REAL NOT NULL DEFAULT 25 CHECK (default_safety_gap_m >= 0)
) STRICT;

CREATE TABLE quays (
  id INTEGER PRIMARY KEY,
  terminal_id INTEGER NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  length_m REAL NOT NULL CHECK (length_m > 0),
  UNIQUE (terminal_id, code),
  UNIQUE (id, terminal_id)
) STRICT;

CREATE TABLE berth_sections (
  id INTEGER PRIMARY KEY,
  quay_id INTEGER NOT NULL REFERENCES quays(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  quay_from_m REAL NOT NULL CHECK (quay_from_m >= 0),
  quay_to_m REAL NOT NULL CHECK (quay_to_m > quay_from_m),
  max_draft_m REAL CHECK (max_draft_m > 0),
  max_loa_m REAL CHECK (max_loa_m > 0),
  UNIQUE (quay_id, code)
) STRICT;

CREATE TABLE shipping_lines (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0)
) STRICT;

CREATE TABLE services (
  id INTEGER PRIMARY KEY,
  terminal_id INTEGER NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  operator_line_id INTEGER REFERENCES shipping_lines(id) ON DELETE RESTRICT,
  UNIQUE (terminal_id, code),
  UNIQUE (id, terminal_id)
) STRICT;

CREATE TABLE vessels (
  id INTEGER PRIMARY KEY,
  imo TEXT UNIQUE CHECK (imo IS NULL OR (length(imo) = 7 AND imo NOT GLOB '*[^0-9]*')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  loa_m REAL NOT NULL CHECK (loa_m > 0),
  beam_m REAL CHECK (beam_m > 0),
  design_draft_m REAL CHECK (design_draft_m > 0)
) STRICT;

CREATE TABLE berth_windows (
  id INTEGER PRIMARY KEY,
  terminal_id INTEGER NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  service_id INTEGER NOT NULL,
  quay_id INTEGER NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 10080),
  quay_from_m REAL NOT NULL CHECK (quay_from_m >= 0),
  quay_to_m REAL NOT NULL CHECK (quay_to_m > quay_from_m),
  tolerance_early_min INTEGER NOT NULL DEFAULT 0 CHECK (tolerance_early_min >= 0),
  tolerance_late_min INTEGER NOT NULL DEFAULT 0 CHECK (tolerance_late_min >= 0),
  min_cranes INTEGER CHECK (min_cranes > 0),
  committed_bmph REAL CHECK (committed_bmph > 0),
  min_moves INTEGER CHECK (min_moves >= 0),
  max_moves INTEGER CHECK (max_moves >= 0),
  valid_from TEXT NOT NULL CHECK (coalesce(date(valid_from, '+0 days') = valid_from, 0)),
  valid_to TEXT CHECK (valid_to IS NULL OR (coalesce(date(valid_to, '+0 days') = valid_to, 0) AND valid_to > valid_from)),
  source TEXT NOT NULL DEFAULT 'manual',
  CHECK (min_moves IS NULL OR max_moves IS NULL OR max_moves >= min_moves),
  UNIQUE (id, terminal_id),
  FOREIGN KEY (service_id, terminal_id) REFERENCES services(id, terminal_id),
  FOREIGN KEY (quay_id, terminal_id) REFERENCES quays(id, terminal_id)
) STRICT;

CREATE TABLE tide_windows (
  id INTEGER PRIMARY KEY,
  terminal_id INTEGER NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
  source TEXT NOT NULL,
  note TEXT
) STRICT;

CREATE TABLE vessel_calls (
  id INTEGER PRIMARY KEY,
  terminal_id INTEGER NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  call_code TEXT NOT NULL CHECK (length(trim(call_code)) > 0),
  vessel_id INTEGER NOT NULL REFERENCES vessels(id) ON DELETE RESTRICT,
  service_id INTEGER,
  voyage_in TEXT,
  voyage_out TEXT,
  eta_at INTEGER,
  ata_at INTEGER,
  requested_etb_at INTEGER,
  requested_etd_at INTEGER,
  atb_at INTEGER,
  atd_at INTEGER,
  declared_draft_m REAL CHECK (declared_draft_m >= 0),
  expected_moves INTEGER CHECK (expected_moves >= 0),
  status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected', 'arrived', 'berthed', 'departed', 'cancelled')),
  legacy_call_id TEXT,
  legacy_line_label TEXT,
  CHECK (atb_at IS NULL OR atd_at IS NULL OR atd_at > atb_at),
  CHECK (ata_at IS NULL OR atb_at IS NULL OR atb_at >= ata_at),
  CHECK (requested_etb_at IS NULL OR requested_etd_at IS NULL OR requested_etd_at > requested_etb_at),
  UNIQUE (terminal_id, call_code),
  UNIQUE (id, terminal_id),
  FOREIGN KEY (service_id, terminal_id) REFERENCES services(id, terminal_id)
) STRICT;

CREATE TABLE berth_plans (
  id INTEGER PRIMARY KEY,
  terminal_id INTEGER NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  week_start TEXT NOT NULL CHECK (coalesce(date(week_start, '+0 days') = week_start AND strftime('%w', week_start) = '1', 0)),
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded')),
  parent_plan_id INTEGER,
  safety_gap_m REAL NOT NULL DEFAULT 25 CHECK (safety_gap_m >= 0),
  lock_version INTEGER NOT NULL DEFAULT 0 CHECK (lock_version >= 0),
  change_reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  published_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  published_at INTEGER,
  snapshot_json TEXT CHECK (snapshot_json IS NULL OR CASE WHEN json_valid(snapshot_json) THEN json_type(snapshot_json) = 'object' ELSE 0 END),
  CHECK (parent_plan_id IS NULL OR parent_plan_id != id),
  CHECK ((status = 'draft' AND published_at IS NULL AND published_by IS NULL) OR
         (status IN ('published', 'superseded') AND published_at IS NOT NULL AND snapshot_json IS NOT NULL)),
  UNIQUE (terminal_id, week_start, version),
  UNIQUE (id, terminal_id),
  FOREIGN KEY (parent_plan_id, terminal_id) REFERENCES berth_plans(id, terminal_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE berth_plan_items (
  id INTEGER PRIMARY KEY,
  terminal_id INTEGER NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  plan_id INTEGER NOT NULL,
  vessel_call_id INTEGER NOT NULL,
  quay_id INTEGER NOT NULL,
  berth_window_id INTEGER,
  window_start_at INTEGER,
  window_end_at INTEGER,
  planned_start_at INTEGER NOT NULL,
  planned_end_at INTEGER NOT NULL CHECK (planned_end_at > planned_start_at),
  quay_from_m REAL NOT NULL CHECK (quay_from_m >= 0),
  quay_to_m REAL NOT NULL CHECK (quay_to_m > quay_from_m),
  crane_count INTEGER NOT NULL CHECK (crane_count > 0),
  planned_moves INTEGER CHECK (planned_moves >= 0),
  note TEXT,
  snapshot_json TEXT CHECK (snapshot_json IS NULL OR CASE WHEN json_valid(snapshot_json) THEN json_type(snapshot_json) = 'object' ELSE 0 END),
  CHECK ((berth_window_id IS NULL AND window_start_at IS NULL AND window_end_at IS NULL) OR
         (berth_window_id IS NOT NULL AND window_start_at IS NOT NULL AND window_end_at IS NOT NULL AND window_end_at > window_start_at)),
  UNIQUE (plan_id, vessel_call_id),
  FOREIGN KEY (plan_id, terminal_id) REFERENCES berth_plans(id, terminal_id) ON DELETE RESTRICT,
  FOREIGN KEY (vessel_call_id, terminal_id) REFERENCES vessel_calls(id, terminal_id) ON DELETE RESTRICT,
  FOREIGN KEY (quay_id, terminal_id) REFERENCES quays(id, terminal_id) ON DELETE RESTRICT,
  FOREIGN KEY (berth_window_id, terminal_id) REFERENCES berth_windows(id, terminal_id) ON DELETE RESTRICT
) STRICT;

-- Nhật ký import giữ cả nguồn gốc lẫn JSON gốc, không dùng làm dữ liệu runtime mới.
CREATE TABLE berth_legacy_imports (
  source_key TEXT PRIMARY KEY,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  week_start TEXT NOT NULL,
  plan_id INTEGER NOT NULL UNIQUE REFERENCES berth_plans(id) ON DELETE RESTRICT,
  source_updated_at TEXT,
  source_json TEXT NOT NULL CHECK (json_valid(source_json)),
  imported_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;

CREATE INDEX idx_sections_quay_position ON berth_sections(quay_id, quay_from_m, quay_to_m);
CREATE INDEX idx_vessels_name ON vessels(name);
CREATE INDEX idx_windows_service_validity ON berth_windows(service_id, valid_from, valid_to);
CREATE INDEX idx_windows_quay ON berth_windows(quay_id);
CREATE INDEX idx_tides_terminal_time ON tide_windows(terminal_id, starts_at, ends_at);
CREATE INDEX idx_calls_vessel ON vessel_calls(vessel_id);
CREATE INDEX idx_calls_service ON vessel_calls(service_id);
CREATE INDEX idx_calls_terminal_eta ON vessel_calls(terminal_id, eta_at);
CREATE INDEX idx_items_call ON berth_plan_items(vessel_call_id);
CREATE INDEX idx_items_window ON berth_plan_items(berth_window_id);
CREATE INDEX idx_items_quay_time ON berth_plan_items(quay_id, planned_start_at, planned_end_at);
CREATE UNIQUE INDEX idx_one_published_plan ON berth_plans(terminal_id, week_start) WHERE status = 'published';

-- Ràng buộc chéo bảng: chiều dài lấy từ quay thay vì hardcode 900 m.
CREATE TRIGGER sections_bounds_insert BEFORE INSERT ON berth_sections BEGIN
  SELECT RAISE(ABORT, 'Section exceeds quay length') WHERE NEW.quay_to_m > (SELECT length_m FROM quays WHERE id = NEW.quay_id);
  SELECT RAISE(ABORT, 'Sections overlap') WHERE EXISTS (
    SELECT 1 FROM berth_sections WHERE quay_id = NEW.quay_id AND quay_from_m < NEW.quay_to_m AND NEW.quay_from_m < quay_to_m
  );
END;
CREATE TRIGGER sections_bounds_update BEFORE UPDATE ON berth_sections BEGIN
  SELECT RAISE(ABORT, 'Section exceeds quay length') WHERE NEW.quay_to_m > (SELECT length_m FROM quays WHERE id = NEW.quay_id);
  SELECT RAISE(ABORT, 'Sections overlap') WHERE EXISTS (
    SELECT 1 FROM berth_sections WHERE id != OLD.id AND quay_id = NEW.quay_id AND quay_from_m < NEW.quay_to_m AND NEW.quay_from_m < quay_to_m
  );
END;
CREATE TRIGGER windows_bounds_insert BEFORE INSERT ON berth_windows BEGIN
  SELECT RAISE(ABORT, 'Window exceeds quay length') WHERE NEW.quay_to_m > (SELECT length_m FROM quays WHERE id = NEW.quay_id);
END;
CREATE TRIGGER windows_bounds_update BEFORE UPDATE ON berth_windows BEGIN
  SELECT RAISE(ABORT, 'Window exceeds quay length') WHERE NEW.quay_to_m > (SELECT length_m FROM quays WHERE id = NEW.quay_id);
END;
-- Điều khoản là lịch sử: chỉ được đóng một bản đang mở, thay đổi khác tạo row mới.
CREATE TRIGGER windows_history_update BEFORE UPDATE ON berth_windows BEGIN
  SELECT RAISE(ABORT, 'Create a new window revision') WHERE NOT (
    NEW.id IS OLD.id AND NEW.terminal_id IS OLD.terminal_id AND NEW.service_id IS OLD.service_id AND NEW.quay_id IS OLD.quay_id AND
    NEW.weekday IS OLD.weekday AND NEW.start_minute IS OLD.start_minute AND NEW.duration_minutes IS OLD.duration_minutes AND
    NEW.quay_from_m IS OLD.quay_from_m AND NEW.quay_to_m IS OLD.quay_to_m AND
    NEW.tolerance_early_min IS OLD.tolerance_early_min AND NEW.tolerance_late_min IS OLD.tolerance_late_min AND
    NEW.min_cranes IS OLD.min_cranes AND NEW.committed_bmph IS OLD.committed_bmph AND NEW.min_moves IS OLD.min_moves AND NEW.max_moves IS OLD.max_moves AND
    NEW.valid_from IS OLD.valid_from AND NEW.source IS OLD.source AND
    (NEW.valid_to IS OLD.valid_to OR (OLD.valid_to IS NULL AND NEW.valid_to IS NOT NULL))
  );
END;
CREATE TRIGGER quay_length_update BEFORE UPDATE OF length_m ON quays BEGIN
  SELECT RAISE(ABORT, 'Quay length is used by existing allocations') WHERE
    EXISTS (SELECT 1 FROM berth_sections WHERE quay_id = OLD.id AND quay_to_m > NEW.length_m) OR
    EXISTS (SELECT 1 FROM berth_windows WHERE quay_id = OLD.id AND quay_to_m > NEW.length_m) OR
    EXISTS (SELECT 1 FROM berth_plan_items WHERE quay_id = OLD.id AND quay_to_m > NEW.length_m);
END;

CREATE TRIGGER items_validate_insert BEFORE INSERT ON berth_plan_items BEGIN
  SELECT RAISE(ABORT, 'Plan is immutable') WHERE (SELECT status FROM berth_plans WHERE id = NEW.plan_id) != 'draft';
  SELECT RAISE(ABORT, 'Allocation exceeds quay length') WHERE NEW.quay_to_m > (SELECT length_m FROM quays WHERE id = NEW.quay_id);
  SELECT RAISE(ABORT, 'Window does not belong to call service') WHERE NEW.berth_window_id IS NOT NULL AND
    (SELECT service_id FROM berth_windows WHERE id = NEW.berth_window_id) IS NOT (SELECT service_id FROM vessel_calls WHERE id = NEW.vessel_call_id);
END;
CREATE TRIGGER items_validate_update BEFORE UPDATE ON berth_plan_items BEGIN
  SELECT RAISE(ABORT, 'Plan is immutable') WHERE
    (SELECT status FROM berth_plans WHERE id = OLD.plan_id) != 'draft' OR (SELECT status FROM berth_plans WHERE id = NEW.plan_id) != 'draft';
  SELECT RAISE(ABORT, 'Allocation exceeds quay length') WHERE NEW.quay_to_m > (SELECT length_m FROM quays WHERE id = NEW.quay_id);
  SELECT RAISE(ABORT, 'Window does not belong to call service') WHERE NEW.berth_window_id IS NOT NULL AND
    (SELECT service_id FROM berth_windows WHERE id = NEW.berth_window_id) IS NOT (SELECT service_id FROM vessel_calls WHERE id = NEW.vessel_call_id);
END;
CREATE TRIGGER items_delete BEFORE DELETE ON berth_plan_items BEGIN
  SELECT RAISE(ABORT, 'Plan is immutable') WHERE (SELECT status FROM berth_plans WHERE id = OLD.plan_id) != 'draft';
END;
CREATE TRIGGER calls_service_update BEFORE UPDATE OF service_id ON vessel_calls BEGIN
  SELECT RAISE(ABORT, 'Call service is used by window allocations') WHERE EXISTS (
    SELECT 1 FROM berth_plan_items i JOIN berth_windows w ON w.id = i.berth_window_id
    WHERE i.vessel_call_id = OLD.id AND w.service_id IS NOT NEW.service_id
  );
END;

CREATE TRIGGER plans_insert BEFORE INSERT ON berth_plans BEGIN
  SELECT RAISE(ABORT, 'Create a draft before publishing') WHERE NEW.status != 'draft';
  SELECT RAISE(ABORT, 'Invalid parent plan') WHERE NEW.parent_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM berth_plans WHERE id = NEW.parent_plan_id AND terminal_id = NEW.terminal_id AND week_start = NEW.week_start AND version < NEW.version
  );
END;
CREATE TRIGGER plans_update BEFORE UPDATE ON berth_plans BEGIN
  SELECT RAISE(ABORT, 'Increment lock_version on plan updates') WHERE NEW.lock_version != OLD.lock_version + 1;
  SELECT RAISE(ABORT, 'Plan is immutable') WHERE OLD.status != 'draft' AND NOT (
    OLD.status = 'published' AND NEW.status = 'superseded' AND
    NEW.id IS OLD.id AND NEW.terminal_id IS OLD.terminal_id AND NEW.week_start IS OLD.week_start AND NEW.version IS OLD.version AND
    NEW.parent_plan_id IS OLD.parent_plan_id AND NEW.safety_gap_m IS OLD.safety_gap_m AND NEW.change_reason IS OLD.change_reason AND
    NEW.created_by IS OLD.created_by AND NEW.created_at IS OLD.created_at AND NEW.published_by IS OLD.published_by AND
    NEW.published_at IS OLD.published_at AND NEW.snapshot_json IS OLD.snapshot_json
  );
  SELECT RAISE(ABORT, 'Invalid plan transition') WHERE OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'published');
  SELECT RAISE(ABORT, 'Invalid parent plan') WHERE NEW.parent_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM berth_plans WHERE id = NEW.parent_plan_id AND terminal_id = NEW.terminal_id AND week_start = NEW.week_start AND version < NEW.version
  );
  SELECT RAISE(ABORT, 'Snapshot every item before publishing') WHERE NEW.status = 'published' AND OLD.status = 'draft' AND
    EXISTS (SELECT 1 FROM berth_plan_items WHERE plan_id = OLD.id AND snapshot_json IS NULL);
END;
CREATE TRIGGER plans_delete BEFORE DELETE ON berth_plans BEGIN
  SELECT RAISE(ABORT, 'Plan is immutable') WHERE OLD.status != 'draft';
END;
CREATE TRIGGER imports_update BEFORE UPDATE ON berth_legacy_imports BEGIN
  SELECT RAISE(ABORT, 'Import archive is immutable');
END;
CREATE TRIGGER imports_delete BEFORE DELETE ON berth_legacy_imports BEGIN
  SELECT RAISE(ABORT, 'Import archive is immutable');
END;
