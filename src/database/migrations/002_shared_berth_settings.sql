ALTER TABLE quays ADD COLUMN physical_berth_count INTEGER CHECK (physical_berth_count > 0);
ALTER TABLE quays ADD COLUMN depth REAL CHECK (depth <= 0);
ALTER TABLE quays ADD COLUMN depth_datum TEXT NOT NULL DEFAULT '';
ALTER TABLE quays ADD COLUMN turning_basin REAL CHECK (turning_basin > 0);
ALTER TABLE quays ADD COLUMN turning_basin_measurement TEXT NOT NULL DEFAULT 'unconfirmed'
  CHECK (turning_basin_measurement IN ('unconfirmed', 'diameter'));
ALTER TABLE quays ADD COLUMN max_loa_m REAL CHECK (max_loa_m > 0);
ALTER TABLE quays ADD COLUMN max_dwt REAL CHECK (max_dwt > 0);
ALTER TABLE quays ADD COLUMN capacity_source TEXT NOT NULL DEFAULT '';
ALTER TABLE vessels ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX idx_vessels_external_id ON vessels(external_id);
ALTER TABLE vessels ADD COLUMN dwt REAL CHECK (dwt > 0);
ALTER TABLE vessels ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));

CREATE TABLE berth_shared_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  terminal_id INTEGER REFERENCES terminals(id) ON DELETE RESTRICT,
  quay_id INTEGER REFERENCES quays(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  source_week_start TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((terminal_id IS NULL) = (quay_id IS NULL))
) STRICT;

ALTER TABLE berth_window_week_datasets ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);
