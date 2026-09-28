'use strict';

function createAdminController({ berthWindowModel }) {
  return {
    showBerthWindow(req, res) {
      const record = berthWindowModel.get();
      res.render('admin/berth-window', {
        title: 'Bảng cửa sổ cầu bến',
        user: req.session.user,
        updatedAt: record.updatedAt
      });
    }
  };
}

module.exports = createAdminController;
