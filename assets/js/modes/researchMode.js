/* 연구자모드: 실험을 실행하고 결과를 분석해요.
   - 실험 중에는 공이 곡선 위를 따라 움직이고, 끝나면 방문한 모든 좌표를 순서대로 이은 점선 경로가 남아요.
   - 분석 도구(Loss 변화, 학습률 비교, 관찰 가이드)는 버튼을 눌렀을 때만 열려요.
   - 실시간 수식·계산 과정 표시는 만들지 않았어요(명세). */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, esc = U.esc;
  var family, fn, ctl, graph, loss, cmpGraph, cmpLoss, host, st, listeners;

  function on(t, ev, f, o) { t.addEventListener(ev, f, o); listeners.push([t, ev, f, o]); }
  function $(s) { return host.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(host.querySelectorAll(s)); }
  function nick() { return GD.storage.prefs().nickname || '익명'; }
  function newState() { return { result: null, analysis: null, tab: null, showSteps: false, lossScale: 'linear', selected: -1, cmp: { alphas: [], items: [], conds: null, scale: 'linear' } }; }
  function resetCompareAlphas() { st.cmp.alphas = fn.compareAlphas.filter(function (a) { return a >= fn.alpha.min - 1e-9 && a <= fn.alpha.max + 1e-9; }); st.cmp.items = []; st.cmp.conds = null; }
  function fStar() { return Math.min.apply(null, fn.minima.map(function (m) { return m.f; })); }

  function layout() {
    return '<div class="lab"><aside class="lab-side" aria-label="실험 설정"><h2>실험 설정</h2><div id="rCtl"></div></aside>' +
      '<div class="lab-main"><nav class="c-row" aria-label="함수 선택"><a class="c-btn c-btn--sm" href="#/research">2차 / 4차 다시 선택</a><a class="c-btn c-btn--sm" href="#/research/' + family + '">함수 종류 다시 선택</a></nav><header class="page-head"><h1>연구자모드</h1><p>이동 경로와 Loss 변화를 분석하고, 학습률을 비교해요.</p></header>' +
      '<section class="graph-card" aria-label="이동 경로 그래프"><div class="graph-bar"><span class="graph-status" id="rStatus" data-phase="idle" role="status" aria-live="polite">준비 완료</span>' +
      '<div class="c-row"><label class="c-check"><input type="checkbox" id="rSteps"> 단계 번호 표시</label><button class="c-btn c-btn--sm" id="rAct" type="button" hidden></button></div></div>' +
      '<div class="graph-stage"><canvas id="rCv" role="img" aria-label="함수 그래프"></canvas><div class="graph-empty" id="rEmpty">왼쪽에서 조건을 정하고 <strong>실험 실행</strong>을 눌러 보세요.</div></div>' +
      '<div class="legend" aria-hidden="true"><span><i></i>함수 곡선</span><span><i class="dotted"></i>이동 경로(방문 순서)</span><span><i class="dot"></i>방문한 위치</span><span><i class="star"></i>최솟값</span></div></section>' +
      '<p class="sr-live" id="rPath"></p><section id="rSummary" class="c-stack" aria-live="polite"></section>' +
      '<section class="c-panel" aria-labelledby="rToolsH"><h2 class="c-subtitle" id="rToolsH" style="margin-bottom:var(--space-sm)">분석 도구</h2>' +
      '<div class="c-tablist" role="tablist" aria-label="분석 도구">' +
      '<button class="c-tab" role="tab" id="tabLoss" aria-controls="panLoss" aria-selected="false" data-tab="loss" disabled>Loss 변화</button>' +
      '<button class="c-tab" role="tab" id="tabCompare" aria-controls="panCompare" aria-selected="false" data-tab="compare">학습률 비교</button>' +
      '<button class="c-tab" role="tab" id="tabGuide" aria-controls="panGuide" aria-selected="false" data-tab="guide">관찰 가이드</button></div>' +
      '<p class="c-note" id="rToolsHint">실험이 끝나면 Loss 변화를 볼 수 있어요. 학습률 비교와 관찰 가이드는 바로 열 수 있어요.</p>' +
      '<div role="tabpanel" id="panLoss" aria-labelledby="tabLoss" hidden></div><div role="tabpanel" id="panCompare" aria-labelledby="tabCompare" hidden></div><div role="tabpanel" id="panGuide" aria-labelledby="tabGuide" hidden></div></section>' +
      '<section class="c-panel" aria-labelledby="rRecH"><h2 class="c-subtitle" id="rRecH">내 연구자모드 기록</h2><p class="c-note" id="rRecNote" style="margin:var(--space-2xs) 0 var(--space-sm)"></p><div id="rRec"></div></section></div></div>';
  }

  /* ---------- 상태 표시 / 요약 ---------- */
  function setPhase(p) {
    var s = $('#rStatus'), a = $('#rAct'); if (!s) return; s.dataset.phase = p;
    s.textContent = p === 'idle' ? '준비 완료' : p === 'play' ? '공이 굴러가는 중…' : '이동 완료';
    a.hidden = (p === 'idle' || !st.result || st.result.iterations === 0);
    a.innerHTML = p === 'play' ? U.icon('skip', 16) + '건너뛰기' : U.icon('replay', 16) + '다시 보기';
    a.setAttribute('aria-label', p === 'play' ? '애니메이션 건너뛰기' : '애니메이션 다시 보기');
    if (p === 'play') $('#rEmpty').hidden = true;
  }
  function stat(k, v) { return '<div class="c-stat"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'; }
  function renderSummary() {
    var r = st.result, a = st.analysis, box = $('#rSummary');
    if (!r) { box.innerHTML = ''; return; }
    var tgt = r.target ? 'x = ' + U.fmtNum(r.target.x) + (fn.multiModal ? (r.target.kind === 'global' ? ' (전역)' : ' (국소)') : '') : '없음';
    box.innerHTML = U.callout(a.tone, a.label, a.detail) +
      '<dl class="c-stats">' + stat('최종 위치', U.fmtNum(r.finalX)) + stat('최종 Loss', U.fmtNum(r.finalLoss)) + stat('반복 횟수', r.iterations + '회') + stat('종료 사유', GD.engine.stopLabel(r.stopReason)) + stat('목표 최솟값', tgt) + '</dl>';
  }

  /* ---------- 실험 실행 ---------- */
  function runExperiment(v) {
    var result = GD.engine.run(fn, { start: v.start, alpha: v.alpha, maxIter: v.maxIter }), a = GD.analyzer.analyze(result, fn);
    st.result = result; st.analysis = a; st.selected = -1;
    st.lossScale = GD.viz.suggestLossScale([{ values: result.losses.map(function (l) { return l - fStar(); }) }]) === 'log' ? 'log' : 'linear';
    GD.records.add({ mode: 'research', functionId: fn.id, functionName: fn.name, nickname: nick(), alpha: result.alpha, start: result.start, maxIter: result.maxIter, iterations: result.iterations, finalX: result.finalX, finalLoss: result.finalLoss, statusLabel: a.label, statusType: a.type, oscillated: a.oscillated, success: result.success });
    $('#rSummary').innerHTML = ''; $('#tabLoss').disabled = true;
    $('#rPath').textContent = '이동 기록(x 좌표): ' + result.xs.map(function (x) { return Number(x.toPrecision(4)); }).join(' → ');
    $('#rCv').setAttribute('aria-label', fn.name + ' 그래프. 공이 x = ' + result.start + '에서 출발해 ' + result.iterations + '번 이동했고 최종 위치는 x = ' + Number(result.finalX.toPrecision(5)) + '입니다.');
    graph.play(result, function () { onFinished(); });
    setPhase('play');
  }
  function onFinished() {
    renderSummary(); $('#tabLoss').disabled = false; renderRecords();
    $('#rToolsHint').textContent = 'Loss 변화, 학습률 비교, 관찰 가이드 중 하나를 눌러 분석해 보세요.';
    if (st.tab === 'loss') renderLoss();
  }

  /* ---------- 단계 선택(이동 경로 ↔ Loss 그래프) ---------- */
  function readoutHTML() {
    var r = st.result; if (!r) return '';
    var k = st.selected;
    if (k < 0) return '최종 Loss <strong>' + U.fmtNum(r.finalLoss) + '</strong> · 점이나 그래프 위의 위치를 누르면 해당 단계를 볼 수 있어요.';
    return '<strong>' + k + '번째</strong> · 위치 x = ' + U.fmtNum(r.xs[k]) + ' · Loss ' + U.fmtNum(r.losses[k]) + ' · 기울기 ' + U.fmtNum(r.grads[k]);
  }
  function selectStep(k, from) {
    st.selected = k;
    if (from !== 'graph' && graph) graph.select(k);
    if (from !== 'loss' && loss && st.tab === 'loss') loss.select(k);
    var ro = $('#lossRead'); if (ro) ro.innerHTML = readoutHTML();
  }

  /* ---------- 분석 도구 ---------- */
  function selectTab(name) {
    st.tab = st.tab === name ? null : name;
    $$('.c-tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === st.tab ? 'true' : 'false'); });
    [['loss', '#panLoss'], ['compare', '#panCompare'], ['guide', '#panGuide']].forEach(function (p) { $(p[1]).hidden = p[0] !== st.tab; });
    if (st.tab === 'loss') renderLoss(); if (st.tab === 'compare') renderCompare(); if (st.tab === 'guide') renderGuide();
  }
  function scaleChips(cur, id) {
    return '<div class="c-chips" role="group" aria-label="그래프 눈금"><button type="button" class="c-chip" data-scale="linear" data-for="' + id + '" aria-pressed="' + (cur === 'linear') + '">선형</button>' +
      '<button type="button" class="c-chip" data-scale="log" data-for="' + id + '" aria-pressed="' + (cur === 'log') + '">로그 (목표와의 차이)</button></div>';
  }
  function renderLoss() {
    var r = st.result, p = $('#panLoss'); if (!r) { p.innerHTML = ''; return; }
    p.innerHTML = '<div class="c-stack"><div class="toolbar"><h3 class="c-subtitle">반복 횟수에 따른 Loss</h3>' + scaleChips(st.lossScale, 'loss') + '</div><div class="loss-chart" id="lossBox"></div><p class="c-note" id="lossRead" aria-live="polite">' + readoutHTML() + '</p>' +
      '<p class="c-note">Loss는 f(x) 값이에요. 로그 눈금은 목표 최솟값(f*)과의 차이를 보여 줘서 수렴 속도를 비교하기 쉬워요.</p></div>';
    if (loss) loss.destroy();
    loss = GD.viz.createLossChart($('#lossBox'), { onSelect: function (k) { selectStep(k, 'loss'); } });
    loss.render([{ label: 'Loss', color: GD.viz.seriesColors()[0], values: r.losses }], { scale: st.lossScale, baseline: fStar(), selected: st.selected, label: fn.name + '의 반복 횟수별 Loss 변화 그래프' });
  }
  function renderGuide() {
    $('#panGuide').innerHTML = '<div class="c-stack"><h3 class="c-subtitle">' + esc(fn.name) + ' 관찰 가이드</h3><p class="c-note">' + esc(fn.expr) + ' · ' + esc(fn.dexpr) + '</p><p>' + esc(fn.feature) + ' ' + esc(fn.goal) + '</p>' +
      '<h4>이 순서로 비교해 보세요</h4><ol><li>기본 설정으로 실행하고, 점선 경로의 이동 폭과 최종 위치를 확인해요. 단계 번호를 켜면 이동 순서를 알 수 있어요.</li><li>시작 위치와 최대 이동 횟수를 고정하고 학습률만 바꿔요. 학습률 비교에서 같은 조건의 여러 결과를 한 번에 볼 수 있어요.</li><li>Loss 변화를 열어 값이 줄어드는지 확인해요. 좌우로 움직여도 폭과 Loss가 줄어들면 진동하며 수렴하는 중이에요. 같은 폭으로 왕복하면 수렴하지 않아요.</li><li>학습률을 고정하고 시작 위치만 바꿔요. 특히 4차함수에서는 도착하는 골짜기나 발산 여부가 달라질 수 있어요.</li></ol>' +
      '<p class="c-note">이동 한도에 도달했다는 것만으로 발산은 아니에요. Loss와 이동 폭이 줄고 있다면 천천히 수렴 중일 수 있어요. 로그 눈금은 전역 최솟값과의 차이를 보여 주므로, 국소 최솟값에 멈추면 0까지 내려가지 않을 수 있어요. 기울기가 0이라 멈춰도 최솟값인지 그래프를 함께 확인해요.</p>' +
      '<div class="c-table-scroll"><table class="c-table guide-table"><thead><tr><th class="left" scope="col">조건</th><th class="left" scope="col">관찰되는 현상</th><th class="left" scope="col">해석</th></tr></thead><tbody>' +
      fn.guide.map(function (g) { return '<tr><td class="left">' + esc(g[0]) + '</td><td class="left">' + esc(g[1]) + '</td><td class="left">' + esc(g[2]) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }

  /* ---------- 학습률 비교 실험실 ---------- */
  function tagsHTML() {
    var cols = GD.viz.seriesColors();
    return st.cmp.alphas.map(function (a, i) { return '<span class="alpha-tag"><span class="swatch" style="--sw:' + cols[i % cols.length] + '"></span>α ' + a + '<button type="button" data-rm="' + a + '" aria-label="학습률 ' + a + ' 빼기">×</button></span>'; }).join('');
  }
  function renderCompare() {
    var p = $('#panCompare');
    p.innerHTML = '<div class="c-stack"><div><h3 class="c-subtitle">학습률 비교 실험실</h3><p class="c-note">학습률만 다르게 하고, 함수·시작 위치·반복 제한·성공 판정은 모두 같게 실행해요.</p></div>' +
      '<div class="c-field" style="margin:0"><span class="c-label">비교할 학습률 (최대 8개)</span><div class="alpha-tags" id="cmpTags">' + tagsHTML() + '</div>' +
      '<div class="c-row"><input class="c-num" style="width:96px" type="number" id="cmpAdd" aria-label="추가할 학습률" min="' + fn.alpha.min + '" max="' + fn.alpha.max + '" step="' + fn.alpha.step + '" placeholder="α">' +
      '<button class="c-btn c-btn--sm" type="button" id="cmpAddBtn">' + U.icon('plus', 16) + '추가</button><button class="c-btn c-btn--sm c-btn--quiet" type="button" id="cmpReset">기본값으로</button></div>' +
      '<span class="c-hint" id="cmpHint">' + fn.alpha.min + ' ~ ' + fn.alpha.max + ' 사이의 값을 넣을 수 있어요.</span></div>' +
      '<div><button class="c-btn c-btn--primary" type="button" id="cmpRun">' + U.icon('play', 18) + '비교 실행</button></div><div id="cmpOut"></div></div>';
    if (st.cmp.items.length) renderCompareOut();
    on($('#cmpAddBtn'), 'click', addAlpha); on($('#cmpAdd'), 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addAlpha(); } });
    on($('#cmpReset'), 'click', function () { resetCompareAlphas(); renderCompare(); });
    on($('#cmpRun'), 'click', runCompare);
    on($('#cmpTags'), 'click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; var a = Number(b.dataset.rm); st.cmp.alphas = st.cmp.alphas.filter(function (x) { return x !== a; }); $('#cmpTags').innerHTML = tagsHTML(); });
  }
  function addAlpha() {
    var inp = $('#cmpAdd'), hint = $('#cmpHint'), v = parseFloat(inp.value), a = fn.alpha, msg = '';
    if (!isFinite(v)) msg = '숫자를 입력해 주세요.'; else if (v < a.min - 1e-9 || v > a.max + 1e-9) msg = a.min + ' ~ ' + a.max + ' 사이의 값만 쓸 수 있어요.';
    else { v = U.snap(v, a.step); if (st.cmp.alphas.indexOf(v) !== -1) msg = '이미 들어 있는 학습률이에요.'; else if (st.cmp.alphas.length >= 8) msg = '최대 8개까지 비교할 수 있어요.'; }
    if (msg) { hint.textContent = msg; hint.setAttribute('role', 'alert'); hint.style.color = 'var(--color-error)'; return; }
    hint.textContent = a.min + ' ~ ' + a.max + ' 사이의 값을 넣을 수 있어요.'; hint.removeAttribute('role'); hint.style.color = '';
    st.cmp.alphas.push(v); st.cmp.alphas.sort(function (x, y) { return x - y; }); inp.value = ''; $('#cmpTags').innerHTML = tagsHTML();
  }
  function runCompare() {
    var v = ctl.values(); if (!v.valid) { var bad = host.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
    if (!st.cmp.alphas.length) { var h = $('#cmpHint'); h.textContent = '비교할 학습률을 하나 이상 넣어 주세요.'; h.setAttribute('role', 'alert'); return; }
    var cols = GD.viz.seriesColors();
    st.cmp.conds = { start: v.start, maxIter: v.maxIter, fnId: fn.id };
    st.cmp.items = st.cmp.alphas.map(function (a, i) {
      var r = GD.engine.run(fn, { start: v.start, alpha: a, maxIter: v.maxIter });   // 같은 공통 엔진으로 각각 따로 계산
      return { alpha: a, result: r, analysis: GD.analyzer.analyze(r, fn), color: cols[i % cols.length], visible: true };
    });
    st.cmp.scale = GD.viz.suggestLossScale(st.cmp.items.map(function (it) { return { values: it.result.losses.map(function (l) { return l - fStar(); }) }; })) === 'log' ? 'log' : 'linear';
    renderCompareOut();
  }
  function renderCompareOut() {
    var out = $('#cmpOut'), c = st.cmp, items = c.items;
    out.innerHTML = '<div class="c-stack"><p class="c-note" id="cmpConds">조건 · ' + esc(fn.expr) + ' · 시작 x = ' + U.fmtNum(c.conds.start) + ' · 최대 반복 ' + c.conds.maxIter + '회 · 같은 성공 판정</p>' +
      '<div class="compare-legend" role="group" aria-label="보이는 학습률 선택">' + items.map(function (it, i) { return '<button type="button" class="c-chip" data-vis="' + i + '" aria-pressed="' + it.visible + '" style="--sw:' + it.color + '"><span class="swatch"></span>α ' + it.alpha + '</button>'; }).join('') + '</div>' +
      '<div class="graph-card"><div class="graph-stage" style="height:clamp(260px,42vh,380px)"><canvas id="cmpCv" role="img" aria-label="학습률별 이동 경로 비교 그래프"></canvas></div></div>' +
      '<div class="toolbar"><h3 class="c-subtitle">학습률별 Loss 변화</h3>' + scaleChips(c.scale, 'cmp') + '</div><div class="loss-chart" id="cmpLossBox"></div>' +
      '<div class="c-table-scroll"><table class="c-table" id="cmpTable"><caption>학습률별 결과 요약</caption><thead><tr><th scope="col">학습률</th><th class="left" scope="col">결과</th><th scope="col">반복 횟수</th><th scope="col">최종 위치</th><th scope="col">최종 Loss</th><th class="left" scope="col">종료 사유</th></tr></thead><tbody>' +
      items.map(function (it) { var r = it.result; return '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:8px;background:' + it.color + '"></span>' + it.alpha + '</td><td class="left">' + esc(it.analysis.label) + '</td><td>' + r.iterations + '</td><td>' + U.fmtNum(r.finalX) + '</td><td>' + U.fmtNum(r.finalLoss) + '</td><td class="left">' + esc(GD.engine.stopLabel(r.stopReason)) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    if (cmpGraph) cmpGraph.destroy(); if (cmpLoss) cmpLoss.destroy();
    cmpGraph = GD.viz.createFunctionGraph($('#cmpCv'), {}); cmpGraph.setFunction(fn);
    cmpLoss = GD.viz.createLossChart($('#cmpLossBox'), {});
    refreshCompareViz();
    on(out, 'click', function (e) {
      var v = e.target.closest('[data-vis]'); if (v) { var it = items[Number(v.dataset.vis)]; it.visible = !it.visible; v.setAttribute('aria-pressed', String(it.visible)); refreshCompareViz(); }
      var s = e.target.closest('[data-for="cmp"]'); if (s) { c.scale = s.dataset.scale; $$('[data-for="cmp"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.scale === c.scale)); }); refreshCompareViz(); }
    });
  }
  function refreshCompareViz() {
    var items = st.cmp.items; cmpGraph.showMulti(items.map(function (it) { return { result: it.result, color: it.color, visible: it.visible }; }));
    var vis = items.filter(function (it) { return it.visible; });
    cmpLoss.render(vis.map(function (it) { return { label: 'α ' + it.alpha, color: it.color, values: it.result.losses }; }), { scale: st.cmp.scale, baseline: fStar(), label: '학습률별 Loss 변화 비교 그래프' });
  }

  /* ---------- 개인 기록 ---------- */
  function renderRecords() {
    var recs = GD.records.list({ mode: 'research' }), box = $('#rRec'); $('#rRecNote').textContent = GD.storage.notice();
    if (!recs.length) { box.innerHTML = U.callout('info', '아직 기록이 없어요', '실험을 실행하면 이 브라우저에 저장돼요.'); return; }
    box.innerHTML = '<div class="c-stack"><div class="c-table-scroll" tabindex="0" role="region" aria-label="연구자모드 실험 기록(스크롤 가능)"><table class="c-table" id="rTable"><thead><tr><th class="left" scope="col">날짜</th><th class="left" scope="col">함수</th><th scope="col">학습률</th><th scope="col">시작</th><th scope="col">반복</th><th scope="col">최종 위치</th><th scope="col">최종 Loss</th><th class="left" scope="col">결과</th></tr></thead><tbody>' +
      recs.slice().reverse().map(function (r) { return '<tr><td class="left">' + esc(GD.csv.localTime(r.createdAt)) + '</td><td class="left">' + esc(r.functionId) + ' · ' + esc(r.functionName) + '</td><td>' + r.alpha + '</td><td>' + U.fmtNum(r.start) + '</td><td>' + r.iterations + '</td><td>' + U.fmtNum(r.finalX) + '</td><td>' + U.fmtNum(r.finalLoss) + '</td><td class="left">' + esc(r.statusLabel) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="c-row"><button class="c-btn" type="button" id="rCsv">' + U.icon('download', 18) + 'CSV 내려받기</button><button class="c-btn c-btn--quiet" type="button" id="rClear">' + U.icon('trash', 18) + '기록 지우기</button></div></div>';
    on($('#rCsv'), 'click', function () { GD.csv.download(GD.records.list({ mode: 'research' }), 'research_mode_records.csv'); });
    on($('#rClear'), 'click', function () { if (root.confirm('연구자모드 기록을 모두 지울까요? 이 브라우저에서만 지워지고 되돌릴 수 없어요.')) { GD.records.clear({ mode: 'research' }); renderRecords(); } });
  }

  /* ---------- 함수 바꾸기 ---------- */
  function changeFunction(id) {
    location.hash = '#/research/' + family + '/' + id;
  }

  function familyFunctions(group) { return GD.functions.list.filter(function (f) { return group === 'quadratic' ? Number(f.id.slice(1)) <= 3 : Number(f.id.slice(1)) > 3; }); }
  function picker(params) {
    var group = params[0], valid = group === 'quadratic' || group === 'quartic';
    host.innerHTML = '<section class="home"><header class="page-head"><h1>연구자모드</h1><p>' + (valid ? '2단계 · 실험할 함수 종류를 선택하세요.' : '1단계 · 실험할 함수의 차수를 선택하세요.') + '</p></header>' +
      (valid ? '<a class="c-btn" href="#/research">← 차수 다시 선택</a>' : '') + '<div class="mode-grid">' +
      (valid ? familyFunctions(group).map(function (f) { return '<a class="mode-card" href="#/research/' + group + '/' + f.id + '"><h2>' + esc(f.name) + '</h2><p>' + esc(f.expr) + '</p><p>' + esc(f.feature) + '</p><span class="go">실험 시작 →</span></a>'; }).join('') :
      '<a class="mode-card" href="#/research/quadratic"><h2>2차함수</h2><p>기본·완만한·가파른 포물선 3종으로 학습률과 곡률의 관계를 관찰해요.</p><span class="go">종류 선택 →</span></a><a class="mode-card" href="#/research/quartic"><h2>4차함수</h2><p>이중 골짜기·비대칭 이중 골짜기·볼록 사차함수 3종으로 시작 위치와 수렴을 탐구해요.</p><span class="go">종류 선택 →</span></a>') + '</div></section>';
  }
  function mount(el, params) {
    host = el; listeners = []; st = newState(); params = params || []; family = params[0];
    if ((family !== 'quadratic' && family !== 'quartic') || !familyFunctions(family).some(function (f) { return f.id === params[1]; })) { picker(params); return; }
    fn = GD.functions.get(params[1]); resetCompareAlphas();
    host.innerHTML = layout();
    ctl = GD.ui.createControls($('#rCtl'), { prefix: 'r', fn: fn, showFunction: true, functions: familyFunctions(family), iterations: { min: 1, max: Math.min(fn.iterations.max, 50), default: Math.min(fn.iterations.default, 30) }, onRun: runExperiment, onFunctionChange: changeFunction });
    graph = GD.viz.createFunctionGraph($('#rCv'), { onSelectStep: function (k) { selectStep(k, 'graph'); }, onPhase: setPhase });
    graph.setFunction(fn); setPhase('idle'); renderRecords();
    on($('#rSteps'), 'change', function () { st.showSteps = $('#rSteps').checked; graph.setShowSteps(st.showSteps); });
    on($('#rAct'), 'click', function () { if (graph.isPlaying()) graph.skip(); else if (st.result) graph.replay(); });
    $$('.c-tab').forEach(function (b) { on(b, 'click', function () { if (!b.disabled) selectTab(b.dataset.tab); });
      on(b, 'keydown', function (e) {   // 탭 목록은 좌우 방향키로 이동해요(Enter/Space 로 열기)
        var tabs = $$('.c-tab').filter(function (t) { return !t.disabled; }), i = tabs.indexOf(b), n = -1;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1;
        if (n >= 0) { e.preventDefault(); tabs[n].focus(); } }); });
    on($('#panLoss'), 'click', function (e) { var s = e.target.closest('[data-for="loss"]'); if (!s) return; st.lossScale = s.dataset.scale; renderLoss(); });
  }
  function unmount() {
    if (graph) graph.destroy(); if (cmpGraph) cmpGraph.destroy(); if (loss) loss.destroy(); if (cmpLoss) cmpLoss.destroy();
    graph = cmpGraph = loss = cmpLoss = null; (listeners || []).forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = [];
  }
  GD.modes.research = { title: '연구자모드', mount: mount, unmount: unmount, _state: function () { return st; }, _graph: function () { return graph; }, _cmpGraph: function () { return cmpGraph; } };
})(typeof window !== 'undefined' ? window : globalThis);
