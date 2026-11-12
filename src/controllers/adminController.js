'use strict';

const adminTools = require('../config/adminTools');

function createAdminController({ berthWindowModel }) {
  return {
    showDashboard(req, res) {
      const berthWindow = berthWindowModel.get();
      const tools = adminTools.map(tool => tool.id === 'berth-window'
        ? {
            ...tool,
            meta: `${berthWindow.data.calls.length} lượt tàu trong dữ liệu hiện tại`,
            updatedAt: berthWindow.updatedAt
          }
        : tool);

      res.render('admin/dashboard', {
        title: 'Dashboard',
        user: req.session.user,
        activePage: 'dashboard',
        navigationTools: adminTools,
        tools
      });
    },

    showBerthSettings(req, res) {
      res.render('admin/berth-settings', {
        title: 'Cấu hình Berth Window', user: req.session.user,
        activePage: 'berth-settings', navigationTools: adminTools
      });
    },

    showBerthWindow(req, res) {
      const record = berthWindowModel.get();
      res.render('admin/berth-window', {
        title: 'Bảng cửa sổ cầu bến',
        user: req.session.user,
        activePage: 'berth-window',
        navigationTools: adminTools,
        updatedAt: record.updatedAt
      });
    }
  };
}

module.exports = createAdminController;
