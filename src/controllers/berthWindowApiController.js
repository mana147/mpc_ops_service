'use strict';

const seedBerthData = require('../data/seedBerthData');
const { validateBerthData } = require('../services/berthDataValidator');
const { currentWeekStart, validateWeekStart } = require('../models/BerthWindow');
const BerthRange = require('../services/berthRange');
const dates = require('../../public/js/berth-dates');

function requestWeekStart(req) {
  return validateWeekStart(req.query.weekStart || currentWeekStart());
}

function createBerthWindowApiController({ berthWindowModel }) {
  const ranges = new BerthRange(berthWindowModel);
  return {
    getRange(req, res) {
      try {
        dates.range(req.query.start, req.query.end);
        res.json(ranges.get(req.query.start, req.query.end));
      } catch (error) { res.status(400).json({ message: error.message }); }
    },

    updateRange(req, res) {
      try { dates.range(req.query.start, req.query.end); }
      catch (error) { return res.status(400).json({ message: error.message }); }
      try {
        return res.json(ranges.update(req.query.start, req.query.end, req.body, req.session.user.id));
      } catch (error) { return res.status(422).json({ message: error.message }); }
    },
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
