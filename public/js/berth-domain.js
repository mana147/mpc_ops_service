/* Quy tắc dùng chung giữa API và trình duyệt; không tự đổi snapshot cũ. */
(function (root) {
  'use strict';
  const domain = {
    quay(data) {
      return data.quay || {
        length: Math.max(...data.berths.map(b => b.to)), safetyGap: 25,
        physicalBerthCount: null, depth: null, depthDatum: '', turningBasin: null,
        turningBasinMeasurement: 'unconfirmed', maxLoa: null, maxDwt: null, capacitySource: ''
      };
    },
    warnings(vessel, quay) {
      const warnings = [];
      if (quay.maxLoa != null && vessel.loa > quay.maxLoa) warnings.push(`LOA ${vessel.loa} m vượt mức công bố ${quay.maxLoa} m.`);
      if (quay.maxDwt != null && vessel.dwt != null && vessel.dwt > quay.maxDwt) warnings.push(`DWT ${vessel.dwt} vượt mức công bố ${quay.maxDwt}.`);
      if (vessel.dwt == null) warnings.push('Chưa cung cấp DWT.');
      return warnings;
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = domain;
  else root.BerthDomain = domain;
})(typeof window === 'object' ? window : globalThis);
