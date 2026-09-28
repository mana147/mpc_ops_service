'use strict';

module.exports = {
  terminal: 'Cầu bến container số 2',
  berths: [
    { code: 'B1', from: 0, to: 300 },
    { code: 'B2', from: 300, to: 600 },
    { code: 'B3', from: 600, to: 900 }
  ],
  tideWindows: [
    { day: 0, from: 2.5, to: 7 }, { day: 0, from: 14.5, to: 19 },
    { day: 1, from: 3.2, to: 7.8 }, { day: 1, from: 15.2, to: 19.8 },
    { day: 2, from: 4, to: 8.5 }, { day: 2, from: 16, to: 20.5 },
    { day: 3, from: 4.8, to: 9.2 }, { day: 3, from: 16.8, to: 21.2 },
    { day: 4, from: 5.5, to: 10 }, { day: 4, from: 17.5, to: 22 },
    { day: 5, from: 6.2, to: 10.8 }, { day: 5, from: 18.2, to: 22.8 },
    { day: 6, from: 7, to: 11.5 }, { day: 6, from: 19, to: 23.5 }
  ],
  calls: [
    { id: 'C1', vessel: 'MSC ANNA', service: 'CIX', line: 'Ocean Line', window: { day: 0, hour: 8, dur: 22 }, ata: { day: 0, hour: 7.7 }, dur: 22, from: 0, to: 350, loa: 294, draft: 11, cranes: 3, moves: 1450, tol: 3 },
    { id: 'C2', vessel: 'EVER LEADER', service: 'VTX', line: 'Trans Pacific', window: { day: 0, hour: 16, dur: 22 }, ata: { day: 0, hour: 21.5 }, dur: 22, from: 380, to: 700, loa: 300, draft: 12.2, cranes: 3, moves: 1620, tol: 3 },
    { id: 'C3', vessel: 'CMA LOTUS', service: 'MCS', line: 'Med Service', window: { day: 1, hour: 10, dur: 21 }, ata: { day: 1, hour: 10.2 }, dur: 21, from: 0, to: 300, loa: 255, draft: 10.4, cranes: 2, moves: 980, tol: 3 },
    { id: 'C4', vessel: 'ONE HARBOUR', service: 'FEX', line: 'Far East Exp', window: { day: 1, hour: 22, dur: 18 }, ata: { day: 1, hour: 21 }, dur: 18, from: 730, to: 900, loa: 172, draft: 8.6, cranes: 2, moves: 640, tol: 3 },
    { id: 'C5', vessel: 'HYUNDAI TERRA', service: 'NBX', line: 'North Bound', window: { day: 2, hour: 9, dur: 20 }, ata: { day: 2, hour: 13 }, dur: 20, from: 380, to: 680, loa: 277, draft: 11.6, cranes: 3, moves: 1310, tol: 3 },
    { id: 'C6', vessel: 'VAN LOI 09', service: null, line: 'Nội địa', window: null, ata: { day: 2, hour: 12 }, dur: 11, from: 0, to: 180, loa: 132, draft: 6.2, cranes: 1, moves: 210, tol: 0 },
    { id: 'C7', vessel: 'WAN HAI 316', service: 'SCX', line: 'South China', window: { day: 3, hour: 6, dur: 20 }, ata: { day: 3, hour: 6 }, dur: 20, from: 0, to: 330, loa: 268, draft: 10.8, cranes: 3, moves: 1120, tol: 3 },
    { id: 'C8', vessel: 'HAI AN VIEW', service: null, line: 'Feeder', window: null, ata: { day: 3, hour: 5 }, dur: 9, from: 300, to: 460, loa: 145, draft: 7.4, cranes: 1, moves: 290, tol: 0 },
    { id: 'C9', vessel: 'MAERSK KOTA', service: 'CMX', line: 'China Mainline', window: { day: 4, hour: 8, dur: 20 }, ata: { day: 4, hour: 9.3 }, dur: 20, from: 400, to: 720, loa: 299, draft: 12, cranes: 3, moves: 1540, tol: 3 },
    { id: 'C10', vessel: 'SITC HANSHIN', service: 'ANX', line: 'Asia Network', window: { day: 5, hour: 10, dur: 16 }, ata: { day: 5, hour: 10 }, dur: 16, from: 0, to: 280, loa: 172, draft: 9.1, cranes: 2, moves: 720, tol: 3 },
    { id: 'C11', vessel: 'KMTC JAKARTA', service: 'KTX', line: 'Korea Trunk', window: { day: 5, hour: 18, dur: 18 }, ata: { day: 6, hour: 1 }, dur: 18, from: 420, to: 760, loa: 262, draft: 11.2, cranes: 3, moves: 1180, tol: 3 },
    { id: 'C12', vessel: 'SÔNG CẤM 5', service: null, line: 'Sà lan', window: null, ata: { day: 6, hour: 6 }, dur: 8, from: 0, to: 120, loa: 92, draft: 4.8, cranes: 1, moves: 120, tol: 0 }
  ]
};
