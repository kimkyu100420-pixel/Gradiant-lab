/* 세 모드가 함께 쓰는 경사하강법 계산 엔진.
   x(n+1) = x(n) − α·f′(x(n))
   같은 함수·시작 위치·학습률·반복 제한이면 어느 모드에서든 같은 결과가 나와요. */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {};
  var CLIP = 1e5;          // 이 값을 넘으면 발산으로 보고 안전하게 종료
  var STATIONARY_EPS = 1e-12;

  function run(fn, opts) {
    var start = Number(opts.start), alpha = Number(opts.alpha);
    var maxIter = Math.max(0, Math.floor(Number(opts.maxIter)));
    var target = Number.isFinite(start) ? fn.targetFor(start) : null;
    var xs = [], fs = [], gs = [];
    var stop = 'max_iterations', overflow = false;

    function push(x) { xs.push(x); fs.push(fn.f(x)); gs.push(fn.df(x)); }
    function reached(x) { return !!target && Math.abs(x - target.x) < fn.tolX; }

    if (!Number.isFinite(start) || !Number.isFinite(alpha)) {
      return finish(fn, opts, [start], [NaN], [NaN], 'numeric_error', false, target);
    }
    push(start);
    if (reached(start)) {
      stop = 'target_reached';
    } else if (Math.abs(gs[0]) < STATIONARY_EPS) {
      stop = 'stationary_point';            // 기울기가 0인 곳에서 시작(예: 극댓값) → 움직이지 않음
    } else {
      var x = start;
      for (var i = 0; i < maxIter; i++) {
        var g = fn.df(x), next = x - alpha * g;
        if (!Number.isFinite(next) || Math.abs(next) > CLIP) {
          overflow = true;
          var dir = Number.isFinite(next) ? (next >= 0 ? 1 : -1) : ((-alpha * g) >= 0 ? 1 : -1);
          push(dir * CLIP); stop = 'diverged'; break;
        }
        x = next; push(x);
        if (!Number.isFinite(fs[fs.length - 1])) { stop = 'numeric_error'; break; }
        if (reached(x)) { stop = 'target_reached'; break; }
        if (Math.abs(gs[gs.length - 1]) < STATIONARY_EPS) { stop = 'stationary_point'; break; }
      }
    }
    return finish(fn, opts, xs, fs, gs, stop, overflow, target);
  }

  function finish(fn, opts, xs, fs, gs, stop, overflow, target) {
    var last = xs.length - 1;
    return {
      functionId: fn.id,
      alpha: Number(opts.alpha),
      start: xs[0],
      maxIter: Math.max(0, Math.floor(Number(opts.maxIter))),
      xs: xs, losses: fs, grads: gs,
      iterations: last,
      finalX: xs[last], finalLoss: fs[last], finalGrad: gs[last],
      stopReason: stop,
      overflow: overflow,
      target: target ? { x: target.x, kind: target.kind } : null,
      success: stop === 'target_reached'
    };
  }

  var STOP_LABELS = {
    target_reached: '목표 도달', max_iterations: '최대 반복 도달', diverged: '발산으로 종료',
    numeric_error: '수치 오류', stationary_point: '기울기 0에서 정지'
  };

  GD.engine = { run: run, CLIP: CLIP, stopLabel: function (s) { return STOP_LABELS[s] || s; } };
})(typeof window !== 'undefined' ? window : globalThis);
