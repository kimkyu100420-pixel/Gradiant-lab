/* 개인 기록을 CSV 로 내려받아요. 엑셀에서 한글이 깨지지 않도록 BOM 을 붙여요. */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {};
  var MODE_NAMES = { game: '게임모드', research: '연구자모드', challenge: '실험도전모드' };
  var COLUMNS = [
    ['모드', function (r) { return MODE_NAMES[r.mode] || r.mode; }],
    ['함수 ID', function (r) { return r.functionId; }],
    ['함수 이름', function (r) { return r.functionName; }],
    ['실험 날짜', function (r) { return localTime(r.createdAt); }],
    ['닉네임', function (r) { return r.nickname || ''; }],
    ['학습률', function (r) { return r.alpha; }],
    ['시작 위치', function (r) { return r.start; }],
    ['최대 반복 횟수', function (r) { return r.maxIter; }],
    ['반복 횟수', function (r) { return r.iterations; }],
    ['최종 위치', function (r) { return r.finalX; }],
    ['최종 Loss', function (r) { return r.finalLoss; }],
    ['결과', function (r) { return r.statusLabel; }],
    ['성공 여부', function (r) { return r.success ? '성공' : '미도달'; }],
    ['점수', function (r) { return r.score == null ? '' : r.score; }]
  ];
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function localTime(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function cell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function toCSV(records) {
    var lines = [COLUMNS.map(function (c) { return cell(c[0]); }).join(',')];
    records.forEach(function (r) { lines.push(COLUMNS.map(function (c) { return cell(c[1](r)); }).join(',')); });
    return lines.join('\r\n');
  }
  function download(records, filename) {
    var blob = new Blob(['\ufeff' + toCSV(records)], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename || 'gradient_descent_records.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  GD.csv = { toCSV: toCSV, download: download, localTime: localTime, columns: COLUMNS.map(function (c) { return c[0]; }) };
})(typeof window !== 'undefined' ? window : globalThis);
