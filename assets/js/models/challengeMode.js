/* 실험도전모드: 미리 준비된 함수 중 하나를 골라 학습률을 직접 찾아보는 모드예요.
   - 함수 목록은 core/functionRegistry.js 의 설정 데이터에서 읽어요(사용자가 수식을 직접 입력하지 않아요).
   - 도전 과제는 이 브라우저에 저장된 내 기록으로 자동 판정해요. 서버로 보내거나 다른 사람과 합치지 않아요. */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, esc = U.esc;
  var host, listeners, mode, fn, ctl, graph, previews, loss, cmpGraph, cmpLoss, st;

  function on(t, ev, f, o) { t.addEventListener(ev, f, o); listeners.push([t, ev, f, o]); }
  function $(s) { return host.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(host.querySelectorAll(s)); }
  function nick() { return GD.storage.prefs().nickname || '익명'; }
  function fStar(f) { return Math.min.apply(null, f.minima.map(function (m) { return m.f; })); }
  function recsOf(f) { return GD.records.list({ mode: 'challenge', functionId: f.id }); }

  /* ---------- 도전 과제(내 기록으로 판정) ---------- */
  function tasksFor(f, recs) {
    var A = GD.analyzer, starts = {}, alphas = {}, mins = {};
    recs.forEach(function (r) { starts[r.start] = 1; alphas[r.alpha] = 1; if (r.reachedMin != null) mins[r.reachedMin] = 1; });
    var conv = recs.some(function (r) { return r.success || A.isConverging(r.statusType); }), div = recs.some(function (r) { return A.isDiverging(r.statusType); });
    return [
      { text: '선택한 함수의 목표 최솟값에 도달하기', done: recs.some(function (r) { return r.success; }) },
      { text: '수렴하는 학습률과 발산하는 학습률을 모두 실험해 보기', done: conv && div },
      { text: '진동하며 수렴하는 현상 찾기', done: recs.some(function (r) { return r.statusType === 'oscillating' || (r.success && r.oscillated); }) },
      f.multiModal ? { text: '시작 위치나 학습률을 바꿔 서로 다른 최솟값에 도달해 보기', done: Object.keys(mins).length >= 2 }
                   : { text: '시작 위치를 바꿔 결과가 어떻게 달라지는지 관찰하기', done: Object.keys(starts).length >= 2 },
      { text: '학습률을 3가지 이상 바꿔 반복 횟수와 최종 Loss 비교하기', done: Object.keys(alphas).length >= 3 }
    ];
  }

  /* ---------- 함수 선택 화면 ---------- */
  function listView() {
    destroyLab(); destroyPreviews(); fn = null;
    host.innerHTML = '<div class="home" style="padding-top:var(--space-lg)"><header class="page-head" style="margin-bottom:var(--space-lg)"><h1>실험도전모드</h1><p>준비된 함수 하나를 골라, 학습률을 직접 바꿔 가며 최적화를 탐구해요.</p></header>' +
      '<div class="fn-grid">' + GD.functions.list.map(function (f) {
        var t = tasksFor(f, recsOf(f)), n = t.filter(function (x) { return x.done; }).length;
        return '<article class="fn-card"><div class="fn-preview"><canvas data-fn="' + f.id + '" role="img" aria-label="' + esc(f.name) + ' 그래프 미리보기"></canvas></div><div class="fn-body">' +
          '<span class="fn-id">' + f.id + '</span><h2 class="fn-name">' + esc(f.name) + '</h2><p class="fn-expr">' + esc(f.expr) + '</p>' +
          '<dl><div><dt>특징</dt><dd>' + esc(f.feature) + '</dd></div><div><dt>실험 목표</dt><dd>' + esc(f.goal) + '</dd></div></dl>' +
          '<span class="fn-done">도전 과제 ' + n + ' / ' + t.length + ' 완료</span>' +
          '<a class="c-btn c-btn--primary" href="#/challenge/' + f.id + '" aria-label="' + esc(f.name) + ' 도전하기">도전하기' + U.icon('arrow', 18) + '</a></div></article>';
      }).join('') + '</div><p class="home-foot" style="margin-top:var(--space-lg)">' + esc(GD.storage.notice()) + '</p></div>';
    previews = $$('canvas[data-fn]').map(function (cv) {
      var g = GD.viz.createFunctionGraph(cv, { compact: true }); g.setFunction(GD.functions.get(cv.dataset.fn)); return g;
    });
  }
  function destroyPreviews() { (previews || []).forEach(function (g) { g.destroy(); }); previews = []; }

  /* ---------- 함수별 실험실 ---------- */
  function labHTML() {
    return '<div class="lab"><aside class="lab-side" aria-label="실험 설정"><a class="back-link" href="#/challenge">' + U.icon('back', 18) + '함수 목록</a>' +
      '<h2 style="margin-top:var(--space-xs)">' + esc(fn.name) + '</h2><p class="fn-expr">' + esc(fn.expr) + '</p><p class="c-note" style="margin-bottom:var(--space-md)">' + esc(fn.dexpr) + '</p>' +
      '<p class="c-note" style="margin-bottom:var(--space-md)">' + esc(fn.feature) + '</p><div id="cCtl"></div></aside>' +
      '<div class="lab-main"><header class="page-head"><h1>' + fn.id + ' · ' + esc(fn.name) + '</h1><p>' + esc(fn.goal) + '</p></header>' +
      '<div id="cTarget"></div>' +
      '<section class="graph-card" aria-label="이동 경로 그래프"><div class="graph-bar"><span class="graph-status" id="cStatus" data-phase="idle" role="status" aria-live="polite">준비 완료</span>' +
      '<div class="c-row"><label class="c-check"><input type="checkbox" id="cSteps"> 단계 번호 표시</label><button class="c-btn c-btn--sm" id="cAct" type="button" hidden></button></div></div>' +
      '<div class="graph-stage"><canvas id="cCv" role="img" aria-label="' + esc(fn.name) + ' 그래프"></canvas><div class="graph-empty" id="cEmpty">시작 위치와 학습률을 정하고 <strong>실험 실행</strong>을 눌러 보세요.</div></div>' +
      '<div class="legend" aria-hidden="true"><span><i></i>함수 곡선</span><span><i class="dotted"></i>이동 경로(방문 순서)</span><span><i class="dot"></i>방문한 위치</span><span><i class="star"></i>목표 최솟값</span></div></section>' +
      '<p class="sr-live" id="cPath"></p><section id="cSummary" class="c-stack" aria-live="polite"></section>' +
      '<section class="c-panel" aria-labelledby="cTaskH"><h2 class="c-subtitle" id="cTaskH">도전 과제</h2><p class="c-note" style="margin:var(--space-2xs) 0 var(--space-sm)">정답 학습률 하나를 찾는 게 아니에요. 여러 조건을 바꿔 보며 현상을 관찰해 보세요.</p><ul class="task-list" id="cTasks"></ul></section>' +
      '<section class="c-panel" aria-labelledby="cRecH"><h2 class="c-subtitle" id="cRecH">이 함수의 내 기록</h2><p class="c-note" id="cRecNote" style="margin:var(--space-2xs) 0 var(--space-sm)"></p><div id="cRec"></div><div id="cCmp"></div></section></div></div>';
  }
  function labView(id) {
    destroyPreviews(); destroyLab(); fn = GD.functions.get(id); st = { result: null, analysis: null, selected: -1, sel: [] };
    host.innerHTML = labHTML();
    ctl = GD.ui.createControls($('#cCtl'), { prefix: 'c', fn: fn, showFunction: false, onRun: runExperiment, onChange: renderTarget });
    graph = GD.viz.createFunctionGraph($('#cCv'), { onPhase: setPhase }); graph.setFunction(fn);
    on($('#cSteps'), 'change', function () { graph.setShowSteps($('#cSteps').checked); });
    on($('#cAct'), 'click', function () { if (graph.isPlaying()) graph.skip(); else if (st.result) graph.replay(); });
    setPhase('idle'); renderTarget(); renderTasks(); renderRecords();
  }
  function destroyLab() {
    if (graph) graph.destroy(); if (loss) loss.destroy(); if (cmpGraph) cmpGraph.destroy(); if (cmpLoss) cmpLoss.destroy();
    graph = loss = cmpGraph = cmpLoss = null; ctl = null;
  }

  function setPhase(p) {
    var s = $('#cStatus'), a = $('#cAct'); if (!s) return; s.dataset.phase = p;
    s.textContent = p === 'idle' ? '준비 완료' : p === 'play' ? '공이 굴러가는 중…' : '이동 완료';
    a.hidden = (p === 'idle' || !st.result || st.result.iterations === 0);
    a.innerHTML = p === 'play' ? U.icon('skip', 16) + '건너뛰기' : U.icon('replay', 16) + '다시 보기';
    a.setAttribute('aria-label', p === 'play' ? '애니메이션 건너뛰기' : '애니메이션 다시 보기');
    if (p === 'play') $('#cEmpty').hidden = true;
  }
  /* 시작 위치에 따라 달라지는 목표를 알려 줘요(이중 골짜기 함수에서 특히 중요) */
  function renderTarget() {
    var v = ctl ? ctl.values() : null, box = $('#cTarget'); if (!v || !isFinite(v.start)) { box.innerHTML = ''; return; }
    var t = fn.targetFor(v.start);
    if (!t) { box.innerHTML = U.callout('warn', '이 시작 위치에는 목표가 없어요', 'x = ' + U.fmtNum(v.start) + ' 는 기울기가 0인 극댓값이에요. 공이 움직이지 않으니 시작 위치를 바꿔 보세요.'); return; }
    var side = fn.multiModal ? (t.x < 0 ? '왼쪽' : '오른쪽') + ' 골짜기의 ' + (t.kind === 'global' ? '전역' : '국소') + ' 최솟값' : '최솟값';
    box.innerHTML = U.callout('info', '이번 목표: x ≈ ' + U.fmtNum(Number(t.x.toFixed(4))), '시작 위치 x = ' + U.fmtNum(v.start) + ' 에서는 ' + side + '에 도착하는 것이 목표예요. 성공 판정 오차는 ' + fn.tolX + ' 예요.');
  }

  function runExperiment(v) {
    var result = GD.engine.run(fn, { start: v.start, alpha: v.alpha, maxIter: v.maxIter }), a = GD.analyzer.analyze(result, fn);
    st.result = result; st.analysis = a; st.selected = -1;
    GD.records.add({ mode: 'challenge', functionId: fn.id, functionName: fn.name, nickname: nick(), alpha: result.alpha, start: result.start, maxIter: result.maxIter, iterations: result.iterations, finalX: result.finalX, finalLoss: result.finalLoss,
      statusLabel: a.label, statusType: a.type, oscillated: a.oscillated, reachedMin: a.reachedMinimum ? Number(a.reachedMinimum.x.toFixed(3)) : null, success: result.success });
    $('#cSummary').innerHTML = '';
    $('#cPath').textContent = '이동 기록(x 좌표): ' + result.xs.map(function (x) { return Number(x.toPrecision(4)); }).join(' → ');
    $('#cCv').setAttribute('aria-label', fn.name + ' 그래프. 공이 x = ' + result.start + '에서 출발해 ' + result.iterations + '번 이동했고 최종 위치는 x = ' + Number(result.finalX.toPrecision(5)) + '입니다.');
    graph.play(result, function () { renderSummary(); renderTasks(); renderRecords(); });
    setPhase('play');
  }
  function stat(k, v) { return '<div class="c-stat"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'; }
  function renderSummary() {
    var r = st.result, a = st.analysis; if (!r) return;
    var tgt = r.target ? 'x = ' + U.fmtNum(Number(r.target.x.toFixed(4))) : '없음';
    $('#cSummary').innerHTML = U.callout(a.tone, r.success ? '목표 달성: ' + a.label : a.label, a.detail) +
      '<dl class="c-stats">' + stat('최종 위치', U.fmtNum(r.finalX)) + stat('최종 Loss', U.fmtNum(r.finalLoss)) + stat('반복 횟수', r.iterations + '회') + stat('종료 사유', GD.engine.stopLabel(r.stopReason)) + stat('목표 최솟값', tgt) + '</dl>';
  }
  function renderTasks() {
    var t = tasksFor(fn, recsOf(fn));
    $('#cTasks').innerHTML = t.map(function (x) { return '<li class="' + (x.done ? 'is-done' : '') + '"><span class="mark" aria-hidden="true">' + (x.done ? U.icon('check', 13) : '') + '</span><span>' + esc(x.text) + '<span class="sr-live">' + (x.done ? ' (완료)' : ' (아직)') + '</span></span></li>'; }).join('');
  }

  /* ---------- 개인 기록 + 기록 비교 ---------- */
  function renderRecords() {
    var recs = recsOf(fn), box = $('#cRec'); $('#cRecNote').textContent = GD.storage.notice();
    if (!recs.length) { box.innerHTML = U.callout('info', '아직 이 함수의 기록이 없어요', '실험을 실행하면 이 브라우저에 저장돼요.'); $('#cCmp').innerHTML = ''; return; }
    st.sel = st.sel.filter(function (id) { return recs.some(function (r) { return r.id === id; }); });
    box.innerHTML = '<div class="c-stack"><div class="c-table-scroll" tabindex="0" role="region" aria-label="이 함수의 실험 기록(스크롤 가능)"><table class="c-table"><thead><tr><th class="left" scope="col">비교</th><th class="left" scope="col">날짜</th><th scope="col">학습률</th><th scope="col">시작 위치</th><th scope="col">반복</th><th scope="col">최종 위치</th><th scope="col">최종 Loss</th><th class="left" scope="col">결과</th></tr></thead><tbody>' +
      recs.slice().reverse().map(function (r) { return '<tr class="' + (st.sel.indexOf(r.id) !== -1 ? 'is-selected' : '') + '"><td class="left"><input type="checkbox" class="c-pick" data-id="' + r.id + '" aria-label="' + esc(GD.csv.localTime(r.createdAt)) + ' 기록 비교에 포함" ' + (st.sel.indexOf(r.id) !== -1 ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--color-accent)"></td><td class="left">' + esc(GD.csv.localTime(r.createdAt)) + '</td><td>' + r.alpha + '</td><td>' + U.fmtNum(r.start) + '</td><td>' + r.iterations + '</td><td>' + U.fmtNum(r.finalX) + '</td><td>' + U.fmtNum(r.finalLoss) + '</td><td class="left">' + esc(r.statusLabel) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="c-row"><button class="c-btn c-btn--primary" type="button" id="cCmpBtn" ' + (st.sel.length < 2 ? 'disabled' : '') + '>선택한 기록 비교 (' + st.sel.length + '/4)</button><button class="c-btn" type="button" id="cCsv">' + U.icon('download', 18) + 'CSV 내려받기</button><button class="c-btn c-btn--quiet" type="button" id="cClear">' + U.icon('trash', 18) + '이 함수 기록 지우기</button></div>' +
      '<p class="c-hint">비교하려면 2~4개를 고르세요. 같은 조건으로 다시 계산해서 보여 줘요.</p></div>';
    on($('#cCsv'), 'click', function () { GD.csv.download(recsOf(fn), 'challenge_' + fn.id + '_records.csv'); });
    on($('#cClear'), 'click', function () { if (root.confirm(fn.name + ' 기록을 모두 지울까요? 이 브라우저에서만 지워지고 되돌릴 수 없어요.')) { GD.records.clear({ mode: 'challenge', functionId: fn.id }); st.sel = []; $('#cCmp').innerHTML = ''; renderRecords(); renderTasks(); } });
    $$('.c-pick').forEach(function (cb) { on(cb, 'change', function () {
      var id = cb.dataset.id, i = st.sel.indexOf(id);
      if (cb.checked) { if (st.sel.length >= 4) { cb.checked = false; return; } st.sel.push(id); } else if (i !== -1) st.sel.splice(i, 1);
      cb.closest('tr').classList.toggle('is-selected', cb.checked); var b = $('#cCmpBtn'); b.disabled = st.sel.length < 2; b.textContent = '선택한 기록 비교 (' + st.sel.length + '/4)';
    }); });
    on($('#cCmpBtn'), 'click', renderCompare);
  }
  function renderCompare() {
    var cols = GD.viz.seriesColors(), items = st.sel.map(function (id, i) {
      var r = GD.records.get(id), res = GD.engine.run(fn, { start: r.start, alpha: r.alpha, maxIter: r.maxIter });   // 저장된 조건으로 다시 계산
      return { rec: r, result: res, analysis: GD.analyzer.analyze(res, fn), color: cols[i % cols.length], visible: true };
    });
    var scale = GD.viz.suggestLossScale(items.map(function (it) { return { values: it.result.losses.map(function (l) { return l - fStar(fn); }) }; })) === 'log' ? 'log' : 'linear';
    $('#cCmp').innerHTML = '<div class="c-stack" style="margin-top:var(--space-lg)"><h3 class="c-subtitle">선택한 실험 비교</h3>' +
      '<div class="compare-legend">' + items.map(function (it) { return '<span class="alpha-tag"><span class="swatch" style="--sw:' + it.color + '"></span>α ' + it.rec.alpha + ' · 시작 ' + U.fmtNum(it.rec.start) + '</span>'; }).join('') + '</div>' +
      '<div class="graph-card"><div class="graph-stage" style="height:clamp(260px,42vh,380px)"><canvas id="cCmpCv" role="img" aria-label="선택한 실험의 이동 경로 비교 그래프"></canvas></div></div>' +
      '<div class="loss-chart" id="cCmpLoss"></div>' +
      '<div class="c-table-scroll"><table class="c-table"><caption>선택한 실험 요약</caption><thead><tr><th scope="col">학습률</th><th scope="col">시작 위치</th><th class="left" scope="col">결과</th><th scope="col">반복</th><th scope="col">최종 Loss</th></tr></thead><tbody>' +
      items.map(function (it) { return '<tr><td>' + it.rec.alpha + '</td><td>' + U.fmtNum(it.rec.start) + '</td><td class="left">' + esc(it.analysis.label) + '</td><td>' + it.result.iterations + '</td><td>' + U.fmtNum(it.result.finalLoss) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    if (cmpGraph) cmpGraph.destroy(); if (cmpLoss) cmpLoss.destroy();
    cmpGraph = GD.viz.createFunctionGraph($('#cCmpCv'), {}); cmpGraph.setFunction(fn); cmpGraph.showMulti(items.map(function (it) { return { result: it.result, color: it.color, visible: true }; }));
    cmpLoss = GD.viz.createLossChart($('#cCmpLoss'), {});
    cmpLoss.render(items.map(function (it) { return { label: 'α ' + it.rec.alpha, color: it.color, values: it.result.losses }; }), { scale: scale, baseline: fStar(fn), label: '선택한 실험의 Loss 변화 비교 그래프' });
  }

  /* ---------- 마운트 / 주소 변경 ---------- */
  function show(params) { var id = params && params[0], f = id && GD.functions.get(id); if (f) labView(f.id); else listView(); }
  function mount(el, params) { host = el; listeners = []; previews = []; show(params); }
  function update(params) { (listeners || []).forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = []; show(params); }
  function unmount() { destroyLab(); destroyPreviews(); (listeners || []).forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = []; }

  GD.modes.challenge = { title: '실험도전모드', mount: mount, update: update, unmount: unmount, _tasksFor: tasksFor, _graph: function () { return graph; }, _state: function () { return st; } };
})(typeof window !== 'undefined' ? window : globalThis);
