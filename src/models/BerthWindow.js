'use strict';

class BerthWindow {
  constructor(db) {
    this.getStatement = db.prepare(`
      SELECT json_data, updated_at, updated_by
      FROM berth_window_datasets
      WHERE id = 1
    `);
    this.updateStatement = db.prepare(`
      UPDATE berth_window_datasets
      SET json_data = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
      WHERE id = 1
    `);
  }

  get() {
    const row = this.getStatement.get();
    return {
      data: JSON.parse(row.json_data),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by
    };
  }

  update(data, userId) {
    this.updateStatement.run(JSON.stringify(data), userId);
    return this.get();
  }
}

module.exports = BerthWindow;
