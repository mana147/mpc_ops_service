'use strict';

const seedBerthData = require('../data/seedBerthData');
const { validateBerthData } = require('../services/berthDataValidator');

function createBerthWindowApiController({ berthWindowModel }) {
  return {
    get(req, res) {
      res.json(berthWindowModel.get());
    },

    update(req, res) {
      try {
        const data = validateBerthData(req.body);
        const record = berthWindowModel.update(data, req.session.user.id);
        res.json({ message: `Đã lưu ${data.calls.length} lượt tàu.`, ...record });
      } catch (error) {
        res.status(422).json({ message: error.message });
      }
    },

    reset(req, res) {
      const data = structuredClone(seedBerthData);
      const record = berthWindowModel.update(data, req.session.user.id);
      res.json({ message: 'Đã khôi phục dữ liệu mẫu.', ...record });
    }
  };
}

module.exports = createBerthWindowApiController;
