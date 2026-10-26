'use strict';

const seedBerthData = require('../data/seedBerthData');
const { validateBerthData } = require('../services/berthDataValidator');
const { currentWeekStart, validateWeekStart } = require('../models/BerthWindow');

function requestWeekStart(req) {
  return validateWeekStart(req.query.weekStart || currentWeekStart());
}

function createBerthWindowApiController({ berthWindowModel }) {
  return {
    get(req, res) {
      try {
        res.json(berthWindowModel.get(requestWeekStart(req)));
      } catch (error) {
        res.status(400).json({ message: error.message });
      }
    },

    update(req, res) {
      try {
        const weekStart = requestWeekStart(req);
        const data = validateBerthData(req.body);
        const record = berthWindowModel.update(weekStart, data, req.session.user.id);
        res.json({ message: `Đã lưu ${data.calls.length} lượt tàu cho tuần ${weekStart}.`, ...record });
      } catch (error) {
        const invalidWeek = error.message.startsWith('weekStart');
        res.status(invalidWeek ? 400 : 422).json({ message: error.message });
      }
    },

    reset(req, res) {
      try {
        const weekStart = requestWeekStart(req);
        const data = structuredClone(seedBerthData);
        const record = berthWindowModel.update(weekStart, data, req.session.user.id);
        res.json({ message: `Đã khởi tạo lại dữ liệu tuần ${weekStart}.`, ...record });
      } catch (error) {
        res.status(400).json({ message: error.message });
      }
    }
  };
}

module.exports = createBerthWindowApiController;
