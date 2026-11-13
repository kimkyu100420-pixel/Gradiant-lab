/* 함수 그래프 + 축구공 이동 + 이동 경로 점선.
   - 공은 함수 곡선 위를 따라 움직여요(기존 게임모드와 같은 방식).
   - 실험이 끝나면 공이 실제로 방문한 좌표(xs)를 방문 순서대로 직선으로 이은 점선을 보여 줘요.
     시작점과 끝점만 잇지 않고, 기록된 모든 좌표를 순서대로 연결해요.
   - 색은 CSS 변수(토큰)에서 읽어 와서 디자인 시스템과 어긋나지 않아요. */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {}; GD.viz = GD.viz || {};

  function cssVar(name, fallback) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
    catch (e) { return fallback; }
  }
  function palette() {
    return {
      curve: cssVar('--curve', '#1F6FB5'), path: cssVar('--path', '#C4471C'), ink: cssVar('--ink', '#142B4A'),
      muted: cssVar('--muted', '#586A82'), grid: cssVar('--grid', '#E3ECF5'), axis: cssVar('--axis', '#8CA0B6'),
      gold: cssVar('--gold', '#F4B400'), goldInk: cssVar('--gold-ink', '#7A4E00'), paper: cssVar('--paper', '#FBFDFF'),
      accent: cssVar('--blue', '#1769AA'), sky: cssVar('--sky-100', '#E5F6FD'), skyLine: cssVar('--sky-300', '#B5E0F0'),
      ball: cssVar('--ball', '#1B2A3F'), font: cssVar('--font-body', 'system-ui, sans-serif')
    };
  }
  function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
  }
  function niceCeil(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e, s = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < s.length; i++) if (m <= s[i] + 1e-9) return s[i] * e;
    return 10 * e;
  }
  var nf = null; try { nf = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }); } catch (e) { nf = null; }
  function fmtTick(v) {
    if (Math.abs(v) < 1e-12) return '0';
    var s = (Math.abs(v) >= 10000 && nf) ? nf.format(v) : String(Number(v.toPrecision(4)));
    if (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e15) s = v.toExponential(0);
    return s.replace('-', '\u2212');
  }
  function reducedMotion() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  var ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  GD.viz.nice = { step: niceStep, ceil: niceCeil, fmt: fmtTick };
  GD.viz.cssVar = cssVar;
  GD.viz.seriesColors = function () {
    var out = []; for (var i = 1; i <= 8; i++) out.push(cssVar('--series-' + i, '#1769AA')); return out;
  };

  GD.viz.createFunctionGraph = function (canvas, options) {
    var opt = Object.assign({ compact: false, previewOnly: false, onSelectStep: null, onFinish: null, onFrame: null }, options || {});
    var ctx = canvas.getContext('2d'), P = palette();
    var fn = GD.functions.default, res = null, multi = null, idleStart = fn.start.default;
    var st = { phase: 'idle', k: 0, prog: 0, moving: false, showSteps: false, selected: -1 };
    var W = 0, H = 0, M = { l: 58, r: 18, t: 16, b: 46 }, pw = 1, ph = 1;
    var view = { xMin: -10, xMax: 10, yLo: 0, yHi: 80, ys: 10, xs: 2 };
    var raf = 0, last = null, elapsed = 0, timing = { startHold: 300, move: 480, hold: 200, reduced: false }, finishCb = null, destroyed = false;

    function margins() { M = opt.compact ? { l: 10, r: 10, t: 10, b: 10 } : { l: W < 460 ? 46 : 58, r: 18, t: 16, b: 46 }; pw = Math.max(1, W - M.l - M.r); ph = Math.max(1, H - M.t - M.b); }
    function X(x) { return M.l + (x - view.xMin) / (view.xMax - view.xMin) * pw; }
    function Y(y) { return M.t + (1 - (y - view.yLo) / (view.yHi - view.yLo)) * ph; }

    function pointsOf() {
      var xs = []; if (res) xs = xs.concat(res.xs);
      if (multi) multi.forEach(function (it) { xs = xs.concat(it.result.xs); });
      if (!xs.length) xs = [idleStart];
      return xs.filter(isFinite);
    }
    function computeView() {
      var base = fn.view, xs = pointsOf(), xMin = base.xMin, xMax = base.xMax;
      xs.forEach(function (x) { if (x < xMin) xMin = x; if (x > xMax) xMax = x; });
      var span = xMax - xMin;
      if (xMin < base.xMin) xMin -= span * 0.06;
      if (xMax > base.xMax) xMax += span * 0.06;
      var fs = xs.map(fn.f).filter(isFinite), top = fs.length ? Math.max.apply(null, fs) : 1;
      var mins = fn.minima.map(function (m) { return m.f; }), lo = Math.min(0, Math.min.apply(null, mins.concat(fs)));
      var barrier = fn.maxima.length ? Math.max.apply(null, fn.maxima.map(function (m) { return m.f; })) - Math.min.apply(null, mins) : 0;
      var flats = (fn.stationaryInflections || []).map(function (p) { return p.f; });
      var hi = Math.max(top * 1.15, barrier * 2.2 + Math.min.apply(null, mins), (fn.f(base.xMax) + fn.f(base.xMin)) * 0.12, Math.max.apply(null, flats.concat([0])) * 1.55);
      if (fn.id === 'F01') hi = Math.max(hi, 70);
      hi = niceCeil(hi - 0) ; if (lo < 0) hi = niceCeil(Math.max(hi, -lo * 3));
      var yLo = lo < 0 ? lo - (hi - lo) * 0.06 : -hi * 0.045;
      view = { xMin: xMin, xMax: xMax, yLo: yLo, yHi: hi };
      view.xs = niceStep((xMax - xMin) / Math.max(4, Math.floor(pw / 62)));
      view.ys = niceStep((hi - Math.max(0, yLo)) / Math.max(3, Math.floor(ph / 52)));
    }

    function pill(text, cx, cy, fg, bg, border) {
      ctx.font = '600 12px ' + P.font; var w = ctx.measureText(text).width + 16, h = 20;
      cx = Math.min(Math.max(cx, M.l + w / 2), W - 4 - w / 2);
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 10); else ctx.rect(cx - w / 2, cy - h / 2, w, h);
      ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = border; ctx.stroke();
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy + 0.5);
    }
    function star(cx, cy, R, r) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) { var rr = i % 2 ? r : R, a = -Math.PI / 2 + i * Math.PI / 5, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
    }
    function pent(cx, cy, r, rot) {
      ctx.beginPath();
      for (var i = 0; i < 5; i++) { var a = rot + i * 2 * Math.PI / 5, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
    }
    function ball(cx, cy, r) {
      ctx.save(); ctx.shadowColor = 'rgba(20,43,74,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fillStyle = P.paper; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();
      ctx.fillStyle = P.ball; pent(cx, cy, r * 0.36, -Math.PI / 2); ctx.fill(); ctx.strokeStyle = P.ball; ctx.lineWidth = 1.3;
      for (var i = 0; i < 5; i++) {
        var a = -Math.PI / 2 + i * 2 * Math.PI / 5, b = a + Math.PI / 5;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36); ctx.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72); ctx.stroke();
        pent(cx + Math.cos(b) * r, cy + Math.sin(b) * r, r * 0.27, b + Math.PI); ctx.fill();
      }
      ctx.restore(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.lineWidth = 1.6; ctx.strokeStyle = P.ball; ctx.stroke();
    }

    function drawGrid() {
      ctx.lineWidth = 1; ctx.font = '12px ' + P.font; ctx.textBaseline = 'middle';
      var y0 = Math.ceil(Math.max(view.yLo, 0 - 1e9) / view.ys) * view.ys; if (view.yLo < 0) y0 = Math.ceil(view.yLo / view.ys) * view.ys;
      for (var y = y0; y <= view.yHi + 1e-9; y += view.ys) {
        var yy = Y(y); ctx.strokeStyle = P.grid; ctx.beginPath(); ctx.moveTo(M.l, yy); ctx.lineTo(M.l + pw, yy); ctx.stroke();
        ctx.fillStyle = P.muted; ctx.textAlign = 'right'; ctx.fillText(fmtTick(y), M.l - 8, yy);
      }
      for (var x = Math.ceil(view.xMin / view.xs) * view.xs; x <= view.xMax + 1e-9; x += view.xs) {
        var xx = X(x); ctx.strokeStyle = P.grid; ctx.beginPath(); ctx.moveTo(xx, M.t); ctx.lineTo(xx, M.t + ph); ctx.stroke();
        ctx.fillStyle = P.muted; ctx.textAlign = 'center'; ctx.fillText(fmtTick(Math.abs(x) < 1e-9 ? 0 : x), xx, M.t + ph + 15);
      }
      ctx.fillStyle = P.ink; ctx.font = '600 12.5px ' + P.font; ctx.textAlign = 'center';
      ctx.fillText('공의 위치 x', M.l + pw / 2, H - 9);
      ctx.save(); ctx.translate(13, M.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('함숫값 f(x)', 0, 0); ctx.restore();
    }
    function curvePath(x0, x1) {
      var n = Math.max(24, Math.ceil(Math.abs(X(x1) - X(x0)) / 2));
      for (var i = 0; i <= n; i++) { var x = x0 + (x1 - x0) * i / n, px = X(x), py = Y(fn.f(x)); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    }
    function drawChord(a, b, color, arrows) {
      var ax = X(a), ay = Y(fn.f(a)), bx = X(b), by = Y(fn.f(b));
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      var len = Math.hypot(bx - ax, by - ay);
      if (arrows && len >= 34 && isFinite(len)) {
        var mx = ax + (bx - ax) * 0.55, my = ay + (by - ay) * 0.55, ang = Math.atan2(by - ay, bx - ax), s = 6;
        ctx.save(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.translate(mx, my); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s, -s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    function drawPath(xs, upto, color, arrows) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = opt.compact ? 2.4 : 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash(opt.compact ? [1, 6] : [1.5, 7]);
      for (var i = 0; i < upto; i++) drawChord(xs[i], xs[i + 1], color, false);
      ctx.restore();
      if (arrows) { ctx.save(); ctx.strokeStyle = color; for (var j = 0; j < upto; j++) drawChord(xs[j], xs[j + 1], color, true); ctx.restore(); }
    }
    function dot(x, color, r, fill) {
      var px = X(x), py = Y(fn.f(x)); ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = color; ctx.stroke();
    }
    function inPlot(px, py) { return px >= M.l - 2 && px <= M.l + pw + 2 && py >= M.t - 2 && py <= M.t + ph + 2; }

    function draw() {
      if (destroyed || !W) return; P = palette();
      ctx.clearRect(0, 0, W, H); ctx.textBaseline = 'middle';
      if (!opt.compact) drawGrid();
      ctx.save(); ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
      ctx.strokeStyle = P.axis; ctx.lineWidth = 1.2;
      if (view.xMin < 0 && view.xMax > 0 && !opt.compact) { ctx.beginPath(); ctx.moveTo(X(0), M.t); ctx.lineTo(X(0), M.t + ph); ctx.stroke(); }
      if (view.yLo < 0 && view.yHi > 0 && !opt.compact) { ctx.beginPath(); ctx.moveTo(M.l, Y(0)); ctx.lineTo(M.l + pw, Y(0)); ctx.stroke(); }
      ctx.beginPath(); curvePath(view.xMin, view.xMax); ctx.strokeStyle = P.curve; ctx.lineWidth = opt.compact ? 2.4 : 3; ctx.lineJoin = 'round'; ctx.stroke();
      // 최솟값 표시(별): 이번 실험의 목표는 크게
      var targetX = res && res.target ? res.target.x : (!res && !multi && fn.targetFor(idleStart) ? fn.targetFor(idleStart).x : (multi && multi[0] && multi[0].result.target ? multi[0].result.target.x : null));
      fn.minima.forEach(function (m) {
        var isT = targetX !== null && Math.abs(m.x - targetX) < 1e-9;
        star(X(m.x), Y(m.f), isT ? 11 : 8, isT ? 4.8 : 3.4);
        if (isT) { ctx.fillStyle = P.gold; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = P.goldInk; ctx.stroke(); }
        else { ctx.fillStyle = P.paper; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = P.goldInk; ctx.stroke(); }
      });
      // 기울기 0이지만 극솟값이 아닌 수평변곡점은 파란 테두리 원으로 표시해요.
      (fn.stationaryInflections || []).forEach(function (p) {
        var xx = X(p.x), yy = Y(p.f);
        ctx.beginPath(); ctx.arc(xx, yy, opt.compact ? 6.5 : 8, 0, 2 * Math.PI);
        ctx.fillStyle = P.paper; ctx.fill(); ctx.strokeStyle = P.accent; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(xx, yy, 2.2, 0, 2 * Math.PI); ctx.fillStyle = P.accent; ctx.fill();
      });
      // 선택용 미리보기에는 출발 공을 덮어씌우지 않고 함수의 모양·특징점만 보여 줘요.
      if (opt.previewOnly) { ctx.restore(); return; }
      // 이동 경로(점선): 기록된 모든 좌표를 방문 순서대로 연결
      if (multi) {
        multi.forEach(function (it) { if (it.visible === false) return; drawPath(it.result.xs, it.result.xs.length - 1, it.color, !opt.compact); });
      } else if (res) {
        var n = res.iterations, upto = st.phase === 'done' ? n : Math.min(st.k, n);
        drawPath(res.xs, upto, P.path, !opt.compact);
      }
      ctx.restore();
      if (multi) {
        multi.forEach(function (it) {
          if (it.visible === false) return; var xs = it.result.xs, fx = xs[xs.length - 1];
          if (!isFinite(fx)) return; var px = X(fx), py = Y(fn.f(fx)); if (!inPlot(px, py)) return;
          ctx.beginPath(); ctx.arc(px, py, 6.5, 0, 6.2832); ctx.fillStyle = it.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = P.paper; ctx.stroke();
        });
        var s0 = multi.length ? multi[0].result.start : idleStart;
        dot(s0, P.ink, 6.5, P.paper);
        if (!opt.compact) { var px0 = X(s0), py0 = Y(fn.f(s0)); if (inPlot(px0, py0)) pill('시작', px0 + 28, Math.max(M.t + 12, py0 - 14), P.accent, P.sky, P.skyLine); }
        return;
      }
      var xsP = res ? res.xs : [idleStart], n2 = xsP.length - 1;
      var reached = st.phase === 'done' ? n2 : Math.min(st.k, n2);
      if (res) {
        var lastLabel = null;
        for (var i = 0; i <= reached; i++) {
          var px = X(xsP[i]), py = Y(fn.f(xsP[i])); if (!inPlot(px, py)) continue;
          if (i > 0 && i < n2 || (i === n2 && st.phase !== 'done')) dot(xsP[i], P.path, 4.6, P.paper);
          if (st.showSteps && i > 0 && (!lastLabel || Math.hypot(px - lastLabel[0], py - lastLabel[1]) > 22)) {
            var ly = py - 17 < M.t + 8 ? py + 17 : py - 17;
            ctx.beginPath(); ctx.arc(px, ly, 9, 0, 6.2832); ctx.fillStyle = P.path; ctx.fill();
            ctx.fillStyle = P.paper; ctx.font = '700 11px ' + P.font; ctx.textAlign = 'center'; ctx.fillText(String(i), px, ly + 0.5); lastLabel = [px, ly];
          }
        }
      }
      // 시작점
      var sx = X(xsP[0]), sy = Y(fn.f(xsP[0]));
      if (inPlot(sx, sy)) {
        dot(xsP[0], P.ink, 7, P.paper);
        if (!opt.compact && (res || true)) pill('시작', sx + 28 + 20 > W ? sx - 28 : sx + 28, Math.max(M.t + 12, sy - 14), P.accent, P.sky, P.skyLine);
      }
      // 공: 재생 중에는 곡선 위를 미끄러지고, 끝나면 최종 위치에 머뭄
      var bx = xsP[reached];
      if (st.phase === 'play' && st.moving && res) bx = xsP[st.k] + (xsP[st.k + 1] - xsP[st.k]) * st.prog;
      var ballX = X(bx), ballY = Y(fn.f(bx)), r = opt.compact ? 9 : 12.5;
      if (!inPlot(ballX, ballY)) { ballX = Math.min(Math.max(ballX, M.l + 12), M.l + pw - 12); ballY = Math.min(Math.max(ballY, M.t + 12), M.t + ph - 12); r = opt.compact ? 8 : 11; }
      if (!res) { ctx.beginPath(); ctx.arc(ballX, ballY, r + 7, 0, 6.2832); ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; }
      if (st.selected >= 0 && res && st.selected <= reached) {
        var sp = X(xsP[st.selected]), sq = Y(fn.f(xsP[st.selected]));
        ctx.beginPath(); ctx.arc(sp, sq, 12, 0, 6.2832); ctx.lineWidth = 3; ctx.strokeStyle = P.accent; ctx.stroke();
      }
      ball(ballX, ballY, r);
      if (res && st.phase === 'done' && !opt.compact && n2 > 0) pill('최종', ballX + 30 + 20 > W ? ballX - 30 : ballX + 30, Math.min(M.t + ph - 12, ballY + 16), P.paper, P.accent, P.accent);
      if (opt.onFrame) opt.onFrame(st);
    }

    /* ---------- 재생 ---------- */
    function stateAt(ms) {
      var n = res.iterations; if (n <= 0) return { k: 0, prog: 1, moving: false, done: true };
      var t = ms - timing.startHold; if (t < 0) return { k: 0, prog: 0, moving: false, done: false };
      if (timing.reduced) { var idx = Math.floor(t / timing.move) + 1; return idx >= n ? { k: n, prog: 1, moving: false, done: true } : { k: idx, prog: 1, moving: false, done: false }; }
      var per = timing.move + timing.hold, k = Math.floor(t / per);
      if (k >= n) return { k: n, prog: 1, moving: false, done: true };
      var inK = t - k * per;
      return inK < timing.move ? { k: k, prog: ease(inK / timing.move), moving: true, done: false } : { k: k + 1, prog: 1, moving: false, done: false };
    }
    function loop(ts) {
      if (destroyed) return;
      if (last === null) last = ts; elapsed += Math.min(ts - last, 100); last = ts;
      var s = stateAt(elapsed); st.k = s.k; st.prog = s.prog; st.moving = s.moving;
      if (s.done) { finish(false); return; }
      draw(); raf = requestAnimationFrame(loop);
    }
    function setPhase(p) { st.phase = p; canvas.dataset.phase = p; if (opt.onPhase) opt.onPhase(p); }
    function startPlay(cb) {
      cancelAnimationFrame(raf); finishCb = cb || null; st.selected = -1; elapsed = 0; last = null;
      var n = Math.max(1, res.iterations); timing.reduced = reducedMotion();
      timing.move = timing.reduced ? Math.min(600, Math.max(80, 6500 / n)) : Math.min(480, Math.max(60, 6500 / n)); timing.hold = timing.move * 0.4;
      st.k = 0; st.prog = 0; st.moving = false; setPhase('play'); computeView(); draw(); raf = requestAnimationFrame(loop);
    }
    function finish(skipped) {
      cancelAnimationFrame(raf); st.k = res ? res.iterations : 0; st.moving = false; st.prog = 1; setPhase('done'); draw();
      var cb = finishCb; finishCb = null; if (cb) cb(skipped);
    }

    function resize() {
      var r = canvas.getBoundingClientRect(), dpr = root.devicePixelRatio || 1;
      W = Math.max(0, r.width); H = Math.max(0, r.height); if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      margins(); computeView(); draw();
    }
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas); else root.addEventListener('resize', resize);
    if (root.document && document.fonts && document.fonts.ready) document.fonts.ready.then(function () { draw(); });

    function nearestStep(ev) {
      if (!res || st.phase !== 'done') return -1;
      var r = canvas.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, best = -1, bd = 18;
      res.xs.forEach(function (x, i) { var d = Math.hypot(X(x) - mx, Y(fn.f(x)) - my); if (d < bd) { bd = d; best = i; } });
      return best;
    }
    function onMove(ev) { canvas.style.cursor = nearestStep(ev) >= 0 ? 'pointer' : 'default'; }
    function onClick(ev) { var k = nearestStep(ev); if (k >= 0) { st.selected = k; draw(); if (opt.onSelectStep) opt.onSelectStep(k); } }
    if (opt.onSelectStep) { canvas.addEventListener('pointermove', onMove); canvas.addEventListener('click', onClick); }

    return {
      setFunction: function (f) { cancelAnimationFrame(raf); fn = f; res = null; multi = null; idleStart = f.start.default; st.selected = -1; setPhase('idle'); computeView(); draw(); },
      showIdle: function (start) { cancelAnimationFrame(raf); res = null; multi = null; if (isFinite(start)) idleStart = start; st.selected = -1; setPhase('idle'); computeView(); draw(); },
      play: function (result, cb) { multi = null; res = result; startPlay(cb); },
      replay: function () { if (res) startPlay(null); },
      skip: function () { if (st.phase === 'play') finish(true); },
      showResult: function (result) { cancelAnimationFrame(raf); multi = null; res = result; st.selected = -1; st.k = result.iterations; setPhase('done'); computeView(); draw(); },
      showMulti: function (items) { cancelAnimationFrame(raf); res = null; multi = items; setPhase('multi'); computeView(); draw(); },
      setShowSteps: function (b) { st.showSteps = !!b; draw(); },
      select: function (k) { st.selected = k; draw(); },
      redraw: function () { computeView(); draw(); },
      isPlaying: function () { return st.phase === 'play'; },
      getState: function () { return { phase: st.phase, k: st.k, selected: st.selected, view: Object.assign({}, view) }; },
      project: function (x) { return { x: X(x), y: Y(fn.f(x)) }; },
      /* 지금 화면에 그려진 점선 구간(검증용): 기록된 모든 좌표를 순서대로 연결한 구간 목록 */
      drawnSegments: function () {
        if (!res || !GD.viz.trajectory) return [];
        var n = st.phase === 'done' ? res.iterations : Math.min(st.k, res.iterations);
        return GD.viz.trajectory.segments(res.xs.slice(0, n + 1), fn.f);
      },
      destroy: function () { destroyed = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); else root.removeEventListener('resize', resize); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('click', onClick); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
