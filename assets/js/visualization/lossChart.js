/* 반복 횟수에 따른 Loss 변화 그래프. 실제 계산한 반복별 Loss(f(x))만 그려요.
   - 선형 보기: Loss 값 그대로
   - 로그 보기: 목표 최솟값과의 차이(f − f*)를 로그 눈금으로 보여 줘서, 수렴 속도 차이를 알아보기 쉬워요.
   - 점을 누르면 같은 단계가 이동 경로 그래프에서도 강조돼요(onSelect). */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {}; GD.viz = GD.viz || {};
  var W = 640, H = 280, L = 62, R = 18, T = 16, B = 46;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function css(n, f) { return GD.viz.cssVar(n, f); }

  GD.viz.suggestLossScale = function (series) {
    var all = []; series.forEach(function (s) { s.values.forEach(function (v) { if (isFinite(v)) all.push(Math.abs(v)); }); });
    if (!all.length) return 'linear';
    var mx = Math.max.apply(null, all), mn = Math.min.apply(null, all.filter(function (v) { return v > 0; }).concat([mx]));
    return mx / Math.max(mn, 1e-300) > 1e4 ? 'log' : 'linear';
  };

  GD.viz.createLossChart = function (container, options) {
    var opt = Object.assign({ onSelect: null }, options || {});
    var cur = { series: [], scale: 'linear', baseline: 0, selected: -1, label: '' };

    function transform(v) {
      if (cur.scale === 'log') return Math.max(v - cur.baseline, 1e-12);
      return v;
    }
    function render(series, o) {
      cur = Object.assign(cur, { series: series || cur.series }, o || {});
      var s = cur.series, nPts = Math.max.apply(null, s.map(function (x) { return x.values.length; }).concat([1]));
      if (!s.length) { container.innerHTML = ''; return; }
      var ink = css('--ink', '#142B4A'), muted = css('--muted', '#586A82'), grid = css('--grid', '#E3ECF5'), paper = css('--paper', '#FBFDFF'), accent = css('--blue', '#1769AA');
      var pw = W - L - R, ph = H - T - B, log = cur.scale === 'log';
      var vals = []; s.forEach(function (x) { x.values.forEach(function (v) { if (isFinite(v)) vals.push(transform(v)); }); });
      var yMin, yMax, yTicks = [];
      if (log) {
        var lo = Math.floor(Math.log10(Math.min.apply(null, vals))), hi = Math.ceil(Math.log10(Math.max.apply(null, vals)));
        if (hi === lo) hi = lo + 1; var stepDec = Math.max(1, Math.ceil((hi - lo) / 6));
        yMin = lo; yMax = hi; for (var e = lo; e <= hi; e += stepDec) yTicks.push(e);
      } else {
        yMin = Math.min(0, Math.min.apply(null, vals)); yMax = Math.max.apply(null, vals); if (yMax === yMin) yMax = yMin + 1;
        var st = GD.viz.nice.step((yMax - yMin) / 5); yMin = Math.floor(yMin / st) * st; yMax = Math.ceil(yMax / st) * st;
        for (var y = yMin; y <= yMax + st * 1e-6; y += st) yTicks.push(y);
      }
      function X(i) { return L + (nPts <= 1 ? pw / 2 : i / (nPts - 1) * pw); }
      function Y(v) { var t = log ? Math.log10(transform(v)) : v; return T + (1 - (t - yMin) / (yMax - yMin)) * ph; }
      var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(cur.label || 'Loss 변화 그래프') + '" focusable="false">';
      yTicks.forEach(function (t) {
        var yy = T + (1 - (t - yMin) / (yMax - yMin)) * ph;
        out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="' + grid + '"/>';
        out += '<text x="' + (L - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" font-size="12" fill="' + muted + '">' + esc(log ? '1e' + t : GD.viz.nice.fmt(t)) + '</text>';
      });
      var xStep = Math.max(1, Math.ceil((nPts - 1) / 8));
      for (var i = 0; i < nPts; i += xStep) out += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 24) + '" text-anchor="middle" font-size="12" fill="' + muted + '">' + i + '</text>';
      out += '<text x="' + (L + pw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="12.5" font-weight="600" fill="' + ink + '">반복 횟수</text>';
      out += '<text transform="translate(14 ' + (T + ph / 2) + ') rotate(-90)" text-anchor="middle" font-size="12.5" font-weight="600" fill="' + ink + '">' + (log ? '목표와의 Loss 차이 (f − f*)' : 'Loss f(x)') + '</text>';
      if (cur.selected >= 0 && cur.selected < nPts) out += '<line x1="' + X(cur.selected).toFixed(1) + '" x2="' + X(cur.selected).toFixed(1) + '" y1="' + T + '" y2="' + (T + ph) + '" stroke="' + accent + '" stroke-width="1.5" stroke-dasharray="4 4"/>';
      s.forEach(function (ser, si) {
        var pts = ser.values.map(function (v, k) { return X(k).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
        out += '<polyline points="' + pts + '" fill="none" stroke="' + ser.color + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"' + (ser.dashed ? ' stroke-dasharray="7 5"' : '') + '/>';
        if (ser.values.length <= 80) ser.values.forEach(function (v, k) {
          var sel = k === cur.selected;
          out += '<circle cx="' + X(k).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + (sel ? 6.5 : 4) + '" fill="' + (sel ? ser.color : paper) + '" stroke="' + ser.color + '" stroke-width="2.2"><title>' + esc((ser.label ? ser.label + ' · ' : '') + k + '회 · Loss ' + GD.viz.nice.fmt(v)) + '</title></circle>';
          out += '<circle class="hit" data-step="' + k + '" data-series="' + si + '" cx="' + X(k).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="11" fill="transparent" style="cursor:pointer"/>';
        });
      });
      container.innerHTML = out + '</svg>';
    }
    function onClick(ev) {
      var t = ev.target.closest ? ev.target.closest('[data-step]') : null; if (!t) return;
      var k = Number(t.getAttribute('data-step')); cur.selected = k; render(); if (opt.onSelect) opt.onSelect(k, Number(t.getAttribute('data-series')));
    }
    container.addEventListener('click', onClick);
    return {
      render: render,
      select: function (k) { cur.selected = k; render(); },
      setScale: function (sc) { cur.scale = sc; render(); },
      getScale: function () { return cur.scale; },
      destroy: function () { container.removeEventListener('click', onClick); container.innerHTML = ''; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
