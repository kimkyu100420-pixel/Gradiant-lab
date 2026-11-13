/* 계산된 이동 기록(xs)만 보고 결과 유형을 판정해요. 화면 코드는 이 결과를 그대로 쓰고, 다시 추정하지 않아요. */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {};

  var TYPES = {
    success:       { label: '목표 도달',          tone: 'ok' },
    one_step:      { label: '한 번에 도달',       tone: 'ok' },
    other_min:     { label: '다른 최솟값에 도달', tone: 'info' },
    oscillating:   { label: '진동하며 수렴 중',   tone: 'warn' },
    periodic:      { label: '같은 거리로 왕복',   tone: 'warn' },
    slow:          { label: '수렴 중',            tone: 'info' },
    max_iter:      { label: '반복 횟수 소진',     tone: 'info' },
    growing:       { label: '발산 경향',          tone: 'bad' },
    diverge:       { label: '발산',               tone: 'bad' },
    stuck_max:     { label: '극댓값에서 정지',    tone: 'warn' },
    stuck_flat:    { label: '기울기 0에서 정지',  tone: 'warn' },
    numeric_error: { label: '수치 오류',          tone: 'bad' }
  };
  var CONVERGING = ['success', 'one_step', 'other_min', 'oscillating', 'slow'];
  var DIVERGING = ['diverge', 'growing'];

  function flips(es) {
    var n = 0, prev = 0;
    es.forEach(function (e) {
      var s = e > 0 ? 1 : e < 0 ? -1 : 0;
      if (s !== 0) { if (prev !== 0 && s !== prev) n++; prev = s; }
    });
    return n;
  }

  function analyze(res, fn) {
    var n = res.iterations, xs = res.xs;
    var ref = res.target ? res.target.x : (fn.nearestMinimum(res.start) || { x: 0 }).x;
    var es = xs.map(function (x) { return x - ref; });
    var out = { type: 'max_iter', oscillated: flips(es) >= 1, reachedMinimum: null, detail: '' };

    function done(type, detail) { out.type = type; out.detail = detail; out.label = TYPES[type].label; out.tone = TYPES[type].tone; return out; }

    if (res.stopReason === 'numeric_error') return done('numeric_error', '계산 중 값이 너무 커져 안전하게 종료했어요.');
    if (res.overflow || res.stopReason === 'diverged') return done('diverge', '공이 목표에서 점점 멀어져 그래프 범위를 벗어났어요.');
    if (res.success) {
      var where = res.target.kind === 'global' ? '전역 최솟값' : '국소 최솟값';
      out.reachedMinimum = res.target;
      if (n === 1) return done('one_step', '한 번의 이동으로 목표 최솟값(' + where + ')에 도착했어요.');
      return done('success', (out.oscillated ? '좌우로 진동하다가 ' : '') + '목표 최솟값(' + where + ')에 도착했어요.');
    }
    if (res.stopReason === 'stationary_point' && fn.isMaximum(res.finalX, 1e-6)) {
      return done('stuck_max', '기울기가 0인 극댓값 위에서 시작해 움직이지 못했어요. 극댓값은 최솟값이 아니에요.');
    }
    var tol = Math.max(fn.tolX * 5, 1e-3);
    for (var i = 0; i < fn.minima.length; i++) {
      var m = fn.minima[i];
      if (Math.abs(res.finalX - m.x) < tol && (!res.target || m.x !== res.target.x)) {
        out.reachedMinimum = m;
        return done('other_min', '시작한 쪽이 아닌 ' + (m.kind === 'global' ? '전역' : '국소') + ' 최솟값(x ≈ ' + m.x.toFixed(3) + ')에 도착했어요. 이동이 봉우리를 넘어간 경우예요.');
      }
    }
    if (res.stopReason === 'stationary_point') return done('stuck_flat', '기울기가 0에 가까운 곳에서 멈췄어요.');
    var k = Math.min(n, 6), win = es.slice(es.length - 1 - k), d0 = Math.abs(win[0]), d1 = Math.abs(win[win.length - 1]);
    var ratio = d0 > 0 ? d1 / d0 : 1, wf = flips(win);
    if (n >= 3 && ratio > 1.5) return done('growing', '목표와의 거리가 계속 커지고 있어요. 학습률을 줄여 보세요.');
    if (wf >= 2 && ratio > 0.97 && ratio < 1.03) return done('periodic', '좌우로 오가지만 목표와의 거리가 줄어들지 않아요.');
    if (wf >= 1 && ratio <= 0.97) return done('oscillating', '목표를 넘나들며 거리가 점점 줄고 있어요. 반복 횟수를 늘리면 도착할 수 있어요.');
    if (ratio <= 0.97) return done('slow', '목표에 가까워지고 있어요. 반복 횟수를 늘리거나 학습률을 키워 보세요.');
    return done('max_iter', '정해진 반복 횟수 안에 목표에 도착하지 못했어요.');
  }

  GD.analyzer = {
    analyze: analyze, TYPES: TYPES,
    label: function (t) { return TYPES[t] ? TYPES[t].label : t; },
    isConverging: function (t) { return CONVERGING.indexOf(t) !== -1; },
    isDiverging: function (t) { return DIVERGING.indexOf(t) !== -1; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
