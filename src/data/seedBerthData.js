'use strict';

module.exports = {
  terminal: 'Tuyến cầu cảng',
  quay: {
    length: 380, physicalBerthCount: 2, depth: -9.5, depthDatum: '',
    turningBasin: 365, turningBasinMeasurement: 'unconfirmed',
    maxLoa: 225, maxDwt: 40000, safetyGap: 25,
    capacitySource: 'Thông tin website cảng do người dùng cung cấp; chưa đối chiếu nguồn trực tiếp.'
  },
  // Một đoạn mặc định trên toàn tuyến; quản lý chia thêm theo nhu cầu.
  berths: [{ code: 'V1', from: 0, to: 380 }],
  vessels: [], tideWindows: [], calls: []
};
