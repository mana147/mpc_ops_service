/* Quy tắc dùng chung giữa API và trình duyệt; không tự đổi snapshot cũ. */
(function (root) {
  'use strict';
  const domain = {
    quay(data) {
      return data.quay || {
        length: Math.max(0, ...(data.berths || []).map(b => b.to)),
        safetyGap: data.berths?.length ? 25 : null,
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
    },
    activeCallsAt(calls, moment) {
      return calls.filter(call => {
        const start = call.start ?? call.ata.day * 24 + call.ata.hour;
        const end = call.end ?? start + call.dur;
        return start <= moment && moment < end;
      });
    },
    berthMotionAt(call, moment, transitionHours = 1) {
      const start = call.start ?? call.ata.day * 24 + call.ata.hour;
      const end = call.end ?? start + call.dur;
      if (moment >= start - transitionHours && moment < start) {
        return { phase: 'approaching', progress: (moment - start + transitionHours) / transitionHours };
      }
      if (moment >= start && moment < end) return { phase: 'berthed', progress: 1 };
      if (moment >= end && moment < end + transitionHours) {
        return { phase: 'departing', progress: (moment - end) / transitionHours };
      }
      return null;
    },
    berthLanes(calls, safetyGap) {
      const laneEnds = [];
      return [...calls].sort((a, b) => a.from - b.from || a.to - b.to).map(call => {
        let lane = laneEnds.findIndex(end => call.from >= end + safetyGap);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = call.to;
        return { call, lane };
      });
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = domain;
  else root.BerthDomain = domain;
})(typeof window === 'object' ? window : globalThis);
