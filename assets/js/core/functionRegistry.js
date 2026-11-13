/* 함수 목록(설정 데이터)과 극값 계산.
   새 함수는 FUNCTION_DEFS 에 항목만 추가하면 세 모드 모두에서 쓸 수 있어요. 화면 코드는 수정하지 않아도 돼요.
   삼차함수는 명세에 따라 기본 목록에서 제외했어요. */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {};

  /* ---------- 함수 정의 (설정 데이터) ---------- */
  var FUNCTION_DEFS = [
    {
      id: 'F01', name: '기본 포물선', expr: 'f(x) = x²', dexpr: 'f′(x) = 2x',
      f: function (x) { return x * x; }, df: function (x) { return 2 * x; }, d2f: function () { return 2; },
      view: { xMin: -10, xMax: 10 },
      start: { default: 8, options: [-8, -4, 4, 8], min: -10, max: 10 },
      alpha: { min: 0.05, max: 1.5, step: 0.05, default: 0.8 },
      iterations: { min: 1, max: 10, default: 5 },
      compareAlphas: [0.3, 0.5, 0.8, 1.0, 1.2],
      tolX: 1e-5,
      feature: '골짜기가 하나뿐인 가장 기본적인 함수예요.',
      goal: '학습률을 바꾸며 수렴과 발산의 경계를 찾아보세요.',
      probe: '기본적인 수렴과 발산',
      guide: [
        ['0 < α < 0.5', '느리게 접근', '이동 폭이 작아 수렴이 느림'],
        ['α = 0.5', '한 번에 최솟값 도달', '시작점에서 한 번에 x = 0으로 이동'],
        ['0.5 < α < 1', '좌우로 진동하며 수렴', '최솟값을 넘지만 이동 폭이 점차 감소'],
        ['α = 1', '같은 거리로 왕복', '위치의 절댓값이 줄어들지 않음'],
        ['1 < α ≤ 1.5', '발산', '최솟값에서 점점 멀어짐']
      ]
    },
    {
      id: 'F02', name: '완만한 포물선', expr: 'f(x) = 0.25x²', dexpr: 'f′(x) = 0.5x',
      f: function (x) { return 0.25 * x * x; }, df: function (x) { return 0.5 * x; }, d2f: function () { return 0.5; },
      view: { xMin: -10, xMax: 10 },
      start: { default: 8, options: [-8, -4, 4, 8], min: -10, max: 10 },
      alpha: { min: 0.1, max: 4.5, step: 0.1, default: 1 },
      iterations: { min: 1, max: 40, default: 12 },
      compareAlphas: [1, 2, 3, 4, 4.4],
      tolX: 1e-5,
      feature: '곡률이 작아서 같은 학습률로도 움직임이 훨씬 작아요.',
      goal: '기본 포물선과 비교해 알맞은 학습률의 크기가 어떻게 달라지는지 찾아보세요.',
      probe: '곡률에 따른 이동 변화',
      guide: [
        ['0 < α < 2', '한쪽에서 접근', '이동 비율 1 − 0.5α 가 0과 1 사이'],
        ['α = 2', '한 번에 최솟값 도달', '이동 비율이 0이 됨'],
        ['2 < α < 4', '진동하며 수렴', '비율이 −1과 0 사이'],
        ['α = 4', '같은 거리로 왕복', '비율이 −1'],
        ['α > 4', '발산', '비율의 절댓값이 1보다 큼']
      ]
    },
    {
      id: 'F03', name: '가파른 포물선', expr: 'f(x) = 4x²', dexpr: 'f′(x) = 8x',
      f: function (x) { return 4 * x * x; }, df: function (x) { return 8 * x; }, d2f: function () { return 8; },
      view: { xMin: -4, xMax: 4 },
      start: { default: 3, options: [-3, -1.5, 1.5, 3], min: -4, max: 4 },
      alpha: { min: 0.01, max: 0.3, step: 0.01, default: 0.1 },
      iterations: { min: 1, max: 40, default: 12 },
      compareAlphas: [0.05, 0.125, 0.2, 0.25, 0.28],
      tolX: 1e-5,
      feature: '기울기가 커서 작은 학습률에도 공이 크게 움직여요.',
      goal: '큰 기울기에서 안정적으로 수렴하는 학습률의 범위를 찾아보세요.',
      probe: '큰 기울기와 학습률의 관계',
      guide: [
        ['0 < α < 0.125', '한쪽에서 접근', '이동 비율 1 − 8α 가 0과 1 사이'],
        ['α = 0.125', '한 번에 최솟값 도달', '이동 비율이 0이 됨'],
        ['0.125 < α < 0.25', '진동하며 수렴', '비율이 −1과 0 사이'],
        ['α = 0.25', '같은 거리로 왕복', '비율이 −1'],
        ['α > 0.25', '발산', '비율의 절댓값이 1보다 큼']
      ]
    },
    {
      id: 'F04', name: '이중 골짜기 사차함수', expr: 'f(x) = (x² − 1)²', dexpr: 'f′(x) = 4x(x² − 1)',
      f: function (x) { var u = x * x - 1; return u * u; },
      df: function (x) { return 4 * x * (x * x - 1); },
      d2f: function (x) { return 12 * x * x - 4; },
      view: { xMin: -2.4, xMax: 2.4 },
      start: { default: 2, options: [-2, -1.5, -0.5, 0.5, 1.5, 2], min: -2.4, max: 2.4 },
      alpha: { min: 0.01, max: 0.3, step: 0.01, default: 0.05 },
      iterations: { min: 1, max: 100, default: 30 },
      compareAlphas: [0.02, 0.05, 0.1, 0.15, 0.25],
      tolX: 1e-4,
      feature: '최솟값이 x = −1 과 x = 1 두 곳에 있고, 가운데 x = 0 은 봉우리예요.',
      goal: '시작한 쪽 골짜기의 최솟값에 도달해 보세요. 학습률에 따라 반대편 골짜기로 넘어가기도 해요.',
      probe: '두 개의 국소 최솟값과 초기 위치의 영향',
      guide: [
        ['시작 위치 x > 0', '목표는 x = 1', '오른쪽 골짜기가 목표'],
        ['시작 위치 x < 0', '목표는 x = −1', '왼쪽 골짜기가 목표'],
        ['시작 위치 x = 0', '움직이지 않음', '기울기가 0인 극댓값이라 멈춤'],
        ['학습률이 큰 경우', '반대편 골짜기로 이동', '첫 이동이 봉우리를 넘어가 버림'],
        ['학습률이 매우 큰 경우', '발산', '이동 폭이 계속 커짐']
      ]
    },
    {
      id: 'F05', name: '비대칭 이중 골짜기', expr: 'f(x) = (x² − 1)² + 0.2x', dexpr: 'f′(x) = 4x(x² − 1) + 0.2',
      f: function (x) { var u = x * x - 1; return u * u + 0.2 * x; },
      df: function (x) { return 4 * x * (x * x - 1) + 0.2; },
      d2f: function (x) { return 12 * x * x - 4; },
      view: { xMin: -2.4, xMax: 2.4 },
      start: { default: 1.5, options: [-2, -1.5, -0.5, 0.5, 1.5, 2], min: -2.4, max: 2.4 },
      alpha: { min: 0.01, max: 0.3, step: 0.01, default: 0.05 },
      iterations: { min: 1, max: 100, default: 40 },
      compareAlphas: [0.02, 0.05, 0.1, 0.15, 0.25],
      tolX: 1e-4,
      feature: '왼쪽 골짜기가 더 깊어요. 오른쪽 골짜기는 국소 최솟값이에요.',
      goal: '시작 위치에 따라 전역 최솟값에 가는지, 국소 최솟값에 머무는지 비교해 보세요.',
      probe: '비대칭적인 극값 구조와 시작 위치의 영향',
      guide: [
        ['시작 위치가 봉우리(x ≈ 0.05)의 왼쪽', '목표는 왼쪽 최솟값', '더 깊은 전역 최솟값'],
        ['시작 위치가 봉우리의 오른쪽', '목표는 오른쪽 최솟값', '국소 최솟값에서 멈출 수 있음'],
        ['학습률이 큰 경우', '반대편 골짜기로 이동', '첫 이동이 봉우리를 넘어가 버림'],
        ['학습률이 매우 큰 경우', '발산', '이동 폭이 계속 커짐']
      ]
    },
    {
      id: 'F06', name: '볼록 사차함수', expr: 'f(x) = x⁴ + 0.5x²', dexpr: 'f′(x) = 4x³ + x',
      f: function (x) { var s = x * x; return s * s + 0.5 * s; },
      df: function (x) { return 4 * x * x * x + x; },
      d2f: function (x) { return 12 * x * x + 1; },
      view: { xMin: -2.5, xMax: 2.5 },
      start: { default: 2, options: [-2, -1.5, -1, 1, 1.5, 2], min: -2.5, max: 2.5 },
      alpha: { min: 0.005, max: 0.12, step: 0.005, default: 0.02 },
      iterations: { min: 1, max: 150, default: 80 },
      compareAlphas: [0.01, 0.03, 0.06, 0.1, 0.12],
      tolX: 0.01,
      feature: '멀리서는 기울기가 매우 크고, 최솟값 근처에서는 매우 완만해요.',
      goal: '위치에 따라 달라지는 기울기를 관찰하고, 안정적으로 수렴하는 학습률을 찾아보세요.',
      probe: '위치에 따라 달라지는 기울기 크기',
      guide: [
        ['시작점이 멀 때', '큰 기울기', '처음에는 크게 이동'],
        ['최솟값 근처', '매우 완만', '이동 폭이 작아져 수렴이 느림'],
        ['학습률이 큰 경우', '진동 또는 발산', '시작점의 큰 기울기가 이동을 키움']
      ]
    }
  ];

  /* ---------- 극값 계산: 도함수의 부호 변화 지점을 이분법으로 찾음 ---------- */
  function findStationary(fn) {
    var lo = fn.view.xMin * 1.6, hi = fn.view.xMax * 1.6, n = 4000, out = [];
    var step = (hi - lo) / n, prevX = lo, prevG = fn.df(lo);
    for (var i = 1; i <= n; i++) {
      var x = lo + step * i, g = fn.df(x);
      if (prevG === 0 || prevG * g < 0) {
        var a = prevX, b = x, ga = prevG;
        for (var k = 0; k < 80; k++) {
          var m = (a + b) / 2, gm = fn.df(m);
          if (ga * gm <= 0) { b = m; } else { a = m; ga = gm; }
        }
        var r = Math.round(((a + b) / 2) * 1e12) / 1e12;   // 이분법의 아주 작은 오차(3e-27 등)를 정리
        if (r === 0) r = 0;
        if (!out.length || Math.abs(out[out.length - 1] - r) > 1e-9) out.push(r);
      }
      prevX = x; prevG = g;
    }
    return out;
  }

  function buildFunction(def) {
    var fn = def;
    var pts = findStationary(fn);
    fn.minima = []; fn.maxima = [];
    pts.forEach(function (x) { (fn.d2f(x) > 0 ? fn.minima : fn.maxima).push({ x: x, f: fn.f(x) }); });
    var best = Math.min.apply(null, fn.minima.map(function (m) { return m.f; }));
    fn.minima.forEach(function (m) { m.kind = Math.abs(m.f - best) < 1e-9 ? 'global' : 'local'; });
    fn.multiModal = fn.minima.length > 1;

    /* 시작 위치가 속한 골짜기의 최솟값이 목표. 극댓값 위에서 시작하면 목표가 없음 */
    fn.targetFor = function (start) {
      for (var i = 0; i < fn.maxima.length; i++) { if (Math.abs(start - fn.maxima[i].x) < 1e-9) return null; }
      var bounds = fn.maxima.map(function (m) { return m.x; }).sort(function (a, b) { return a - b; });
      var idx = 0; while (idx < bounds.length && start > bounds[idx]) idx++;
      var lo = idx === 0 ? -Infinity : bounds[idx - 1], hi = idx === bounds.length ? Infinity : bounds[idx];
      for (var j = 0; j < fn.minima.length; j++) { var m = fn.minima[j]; if (m.x > lo && m.x < hi) return m; }
      return null;
    };
    fn.isMaximum = function (x, tol) { return fn.maxima.some(function (m) { return Math.abs(m.x - x) <= tol; }); };
    fn.nearestMinimum = function (x) {
      var best = null, d = Infinity;
      fn.minima.forEach(function (m) { var dd = Math.abs(m.x - x); if (dd < d) { d = dd; best = m; } });
      return best;
    };
    return fn;
  }

  var byId = {};
  FUNCTION_DEFS.forEach(function (d) { buildFunction(d); byId[d.id] = d; });

  GD.functions = {
    list: FUNCTION_DEFS,
    get: function (id) { return byId[id] || null; },
    default: byId.F01
  };

  /* 도함수가 올바른지 수치 미분으로 확인(개발·검증용) */
  GD.functions.verifyDerivatives = function () {
    var report = [];
    FUNCTION_DEFS.forEach(function (fn) {
      var worst = 0, worst2 = 0;
      for (var x = fn.view.xMin; x <= fn.view.xMax; x += (fn.view.xMax - fn.view.xMin) / 80) {
        var h = 1e-5, num = (fn.f(x + h) - fn.f(x - h)) / (2 * h);
        worst = Math.max(worst, Math.abs(num - fn.df(x)) / Math.max(1, Math.abs(fn.df(x))));
        var num2 = (fn.df(x + h) - fn.df(x - h)) / (2 * h);
        worst2 = Math.max(worst2, Math.abs(num2 - fn.d2f(x)) / Math.max(1, Math.abs(fn.d2f(x))));
      }
      report.push({ id: fn.id, derivativeError: worst, secondDerivativeError: worst2, ok: worst < 1e-6 && worst2 < 1e-6 });
    });
    return report;
  };
})(typeof window !== 'undefined' ? window : globalThis);
