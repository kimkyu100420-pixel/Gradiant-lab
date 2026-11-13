/* 연구자모드: 실험을 실행하고 결과를 분석해요.
   - 실험 중에는 공이 곡선 위를 따라 움직이고, 끝나면 방문한 모든 좌표를 순서대로 이은 점선 경로가 남아요.
   - 분석 도구(Loss 변화, 학습률 비교, 관찰 가이드)는 버튼을 눌렀을 때만 열려요.
   - Loss 점을 누르면 해당 반복의 수치 계산을 간단히 확인할 수 있어요. */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, esc = U.esc;
  var family, fn, ctl, graph, loss, cmpGraph, cmpLoss, host, st, listeners, previews = [];

  function on(t, ev, f, o) { t.addEventListener(ev, f, o); listeners.push([t, ev, f, o]); }
  function $(s) { return host.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(host.querySelectorAll(s)); }
  function nick() { return GD.storage.prefs().nickname || '익명'; }
  function newState() { return { result: null, analysis: null, tab: null, showSteps: false, lossScale: 'linear', selected: -1, cmp: { alphas: [], items: [], conds: null, scale: 'linear' } }; }
  function resetCompareAlphas() { st.cmp.alphas = fn.compareAlphas.filter(function (a) { return a >= fn.alpha.min - 1e-9 && a <= fn.alpha.max + 1e-9; }); st.cmp.items = []; st.cmp.conds = null; }
  function fStar() { return Math.min.apply(null, fn.minima.map(function (m) { return m.f; })); }
  // 연구자모드는 고학습률 발산 실험까지 허용하고, 다른 모드에는 영향을 주지 않아요.
  function researchAlpha() { return { min: fn.alpha.min, max: 30, step: fn.id === 'F03' ? 0.005 : fn.alpha.step, default: fn.alpha.default }; }
  // 기본 포물선은 최대 10회, 나머지 2차는 20회, 4차는 최대 30회만 관찰해요.
  function researchIterations() {
    var max = fn.id === 'F01' ? 10 : (Number(fn.id.slice(1)) <= 3 ? 20 : 30);
    return { min: 1, max: max, default: Math.min(fn.iterations.default, fn.id === 'F01' ? 5 : (Number(fn.id.slice(1)) <= 3 ? 12 : 18)) };
  }

  function layout() {
    return '<div class="lab"><aside class="lab-side" aria-label="실험 설정"><h2>실험 설정</h2><div id="rCtl"></div></aside>' +
      '<div class="lab-main"><nav class="r-breadcrumbs" aria-label="현재 함수 선택 경로"><a href="#/research">차수 선택</a><span aria-hidden="true">›</span><a href="#/research/' + family + '">' + (family === 'quadratic' ? '2차함수' : '4차함수') + '</a><span aria-hidden="true">›</span><span aria-current="page">' + esc(fn.name) + '</span></nav><header class="page-head"><h1>연구자모드</h1><p><strong>' + esc(fn.name) + '</strong> · 이동 경로, Loss 변화, 학습률을 분석해요.</p></header>' +
      '<section class="graph-card" aria-label="이동 경로 그래프"><div class="graph-bar"><span class="graph-status" id="rStatus" data-phase="idle" role="status" aria-live="polite">준비 완료</span>' +
      '<div class="c-row"><label class="c-check"><input type="checkbox" id="rSteps"> 단계 번호 표시</label><button class="c-btn c-btn--sm" id="rAct" type="button" hidden></button></div></div>' +
      '<div class="graph-stage"><canvas id="rCv" role="img" aria-label="함수 그래프"></canvas><div class="graph-empty" id="rEmpty">실험 조건을 정하고 <strong>실험 실행</strong>을 눌러 보세요.</div></div>' +
      '<div class="legend" aria-hidden="true"><span><i></i>함수 곡선</span><span><i class="dotted"></i>이동 경로</span><span><i class="dot"></i>방문한 위치</span><span><i class="star"></i>극솟값</span>' + ((fn.stationaryInflections || []).length ? '<span><i class="flat"></i>수평변곡점(기울기 0)</span>' : '') + '</div></section>' +
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
  // Loss 점을 누르면 해당 단계의 x 갱신식과 함수값 대입식을 보여 줘요.
  function valueFormula(x) {
    var t = '(' + U.fmtNum(x) + ')';
    switch (fn.id) {
      case 'F01': return t + '²';
      case 'F02': return '0.25 × ' + t + '²';
      case 'F03': return '4 × ' + t + '²';
      case 'F04': return t + '⁴ / 4 − 4 × ' + t + '³ / 3 + 2 × ' + t + '²';
      case 'F05': return '3 × ' + t + '⁴ − 4 × ' + t + '³ + 1';
      case 'F06': return t + '⁴ + 0.5 × ' + t + '²';
      default: return 'f(' + U.fmtNum(x) + ')';
    }
  }
  function stepCalcHTML(r, k) {
    if (!r || k < 0 || k >= r.xs.length) return '';
    var x = r.xs[k], v = r.losses[k];
    var val = '<div class="loss-calc-line">Loss' + k + ' = f(x' + k + ') = ' + esc(valueFormula(x)) + ' ≈ <strong>' + U.fmtNum(v) + '</strong></div>';
    if (k === 0) return '<strong>0번째 · 시작 위치 x₀ = ' + U.fmtNum(x) + '</strong>' + val;
    var prev = r.xs[k - 1], grad = r.grads[k - 1];
    var move = '<div class="loss-calc-line">x' + k + ' = x' + (k - 1) + ' − α × f′(x' + (k - 1) + ') = ' + U.fmtNum(prev) + ' − ' + U.fmtNum(r.alpha) + ' × (' + U.fmtNum(grad) + ') ≈ <strong>' + U.fmtNum(x) + '</strong></div>';
    return '<strong>' + k + '번째 이동 · ' + esc(fn.dexpr) + '</strong>' + move + val;
  }
  function readoutHTML() {
    var r = st.result; if (!r) return '';
    return st.selected < 0
      ? '그래프의 점을 누르면 그 단계의 수치 계산식이 나와요. (최종 Loss: ' + U.fmtNum(r.finalLoss) + ')'
      : stepCalcHTML(r, st.selected);
  }
  function selectStep(k, from) {
    st.selected = k;
    if (from !== 'graph' && graph) graph.select(k);
    if (from !== 'loss' && loss && st.tab === 'loss') loss.select(k);
    var ro = $('#lossRead'); if (ro) ro.innerHTML = readoutHTML();
    var picker = $('#lossStepSelect'); if (picker) picker.value = String(k);
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
    p.innerHTML = '<div class="c-stack"><div class="toolbar"><h3 class="c-subtitle">반복 횟수에 따른 Loss</h3>' + scaleChips(st.lossScale, 'loss') + '</div><div class="loss-chart" id="lossBox"></div><div class="loss-step-row"><label for="lossStepSelect">계산을 볼 단계</label><select class="c-select" id="lossStepSelect" aria-label="계산을 볼 이동 단계">' + r.xs.map(function (x, i) { return '<option value="' + i + '"' + (i === st.selected ? ' selected' : '') + '>' + i + '단계 · x = ' + U.fmtNum(x) + '</option>'; }).join('') + '</select></div><div class="loss-calc" id="lossRead" aria-live="polite">' + readoutHTML() + '</div>' +
      '<p class="c-note">Loss는 f(x) 값이에요. 로그 눈금은 목표 최솟값(f*)과의 차이를 보여 줘서 수렴 속도를 비교하기 쉬워요.</p></div>';
    if (loss) loss.destroy();
    loss = GD.viz.createLossChart($('#lossBox'), { onSelect: function (k) { selectStep(k, 'loss'); } });
    on($('#lossStepSelect'), 'change', function () { selectStep(Number(this.value), 'loss'); });
    loss.render([{ label: 'Loss', color: GD.viz.seriesColors()[0], values: r.losses }], { scale: st.lossScale, baseline: fStar(), selected: st.selected, label: fn.name + '의 반복 횟수별 Loss 변화 그래프' });
  }
  function renderGuide() {
    // 같은 시작점에서 학습률만 바꾼 실제 첫 이동 수치를 비교해요.
    var examples = {
      F01: [[8, 0.3], [8, 0.5], [8, 0.8], [8, 1], [8, 1.2]],
      F02: [[8, 1], [8, 2], [8, 3], [8, 4], [8, 4.5]],
      F03: [[3, 0.05], [3, 0.125], [3, 0.2], [3, 0.25], [3, 0.3]],
      F04: [[1.2, 0.1], [1.2, 0.3], [1.2, 0.5], [2, 0.3], [2.8, 0.3]],
      F05: [[1.3, 0.01], [1.3, 0.025], [1.3, 0.04], [0, 0.025], [-0.5, 0.025]],
      F06: [[2, 0.01], [2, 0.02], [2, 0.06], [2, 0.12]]
    }[fn.id] || [];
    var rows = examples.map(function (ex) {
      var x0 = ex[0], alpha = ex[1], gradient = fn.df(x0), x1 = x0 - alpha * gradient;
      var before = fn.f(x0), after = fn.f(x1), delta = after - before;
      var verdict = Math.abs(delta) < 1e-9 ? '그대로' : delta < 0 ? '감소' : '증가';
      return '<tr><td class="left">x₀ ' + U.fmtNum(x0) + '<span class="guide-muted"> · α ' + U.fmtNum(alpha) + '</span></td>' +
        '<td class="left">' + U.fmtNum(x0) + ' − ' + U.fmtNum(alpha) + ' × (' + U.fmtNum(gradient) + ') = <strong>' + U.fmtNum(x1) + '</strong></td>' +
        '<td class="left">' + U.fmtNum(before) + ' → ' + U.fmtNum(after) + ' <strong>(' + verdict + ')</strong></td></tr>';
    }).join('');
    var special = {
      F01: '<strong>핵심 수치:</strong> xₙ₊₁ = (1 − 2α)xₙ. α = 0.5이면 한 번에 x = 0, α = 0.8이면 위치가 매번 −0.6배로 바뀌며 수렴해요. α = 1은 −1배라 왕복하고, 1보다 크면 점점 멀어져요.',
      F02: '<strong>핵심 수치:</strong> xₙ₊₁ = (1 − 0.5α)xₙ. α = 2에서 한 번에 x = 0, 0보다 크고 4보다 작을 때 수렴해요. α = 4는 왕복, 4보다 크면 발산해요.',
      F03: '<strong>핵심 수치:</strong> xₙ₊₁ = (1 − 8α)xₙ. α = 0.125에서 한 번에 x = 0, 0보다 크고 0.25보다 작으면 수렴해요. α = 0.25는 왕복, 0.25보다 크면 발산해요.',
      F04: '<strong>핵심 수치:</strong> f′(x) = x(x − 2)²이므로 정지점은 x = 0과 2예요. x = 0은 극솟값(Loss = 0), x = 2는 수평변곡점(Loss = 4/3)이에요. x₀ = 2에서는 α에 관계없이 움직이지 않아요.',
      F05: '<strong>핵심 수치:</strong> f′(x) = 12x²(x − 1)이므로 정지점은 x = 0과 1이에요. x = 0에서는 기울기가 0이어도 Loss = 1이고, x = 1에서만 Loss = 0인 극솟값을 가져요.',
      F06: '<strong>핵심 수치:</strong> x₀ = 2일 때 f′(2) = 34이므로 α = 0.02면 x₁ = 1.32예요. 출발점이 멀수록 기울기가 가파르므로 같은 α라도 처음에 크게 움직여요.'
    }[fn.id] || '';
    var extra = Number(fn.id.slice(1)) <= 3
      ? '2차함수는 같은 비율로 위치가 변하므로 위의 수렴 범위를 반복해서 확인해 보세요.'
      : '4차함수는 위치에 따라 기울기가 달라져요. 기울기가 0인 점이 반드시 최솟값은 아니므로 결과와 Loss를 함께 확인하세요.';
    $('#panGuide').innerHTML = '<div class="c-stack"><h3 class="c-subtitle">' + esc(fn.name) + ' · 관찰 가이드</h3>' +
      '<p class="c-note">' + esc(fn.expr) + ' · ' + esc(fn.dexpr) + '</p>' +
      '<p><strong>탐구 목표</strong> · ' + esc(fn.goal) + '</p>' +
      '<p class="c-note">이동 공식: <strong>xₙ₊₁ = xₙ − α × f′(xₙ)</strong>. 아래 수치는 첫 번째 이동의 실제 계산값이며, 함수값 f(x)를 Loss로 표시했어요.</p>' +
      '<div class="c-table-scroll"><table class="c-table guide-table"><thead><tr><th class="left">설정</th><th class="left">첫 이동 x₁ 계산</th><th class="left">Loss f(x₀) → f(x₁)</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="c-note">' + special + '</p>' +
      '<h4>직접 비교해 보기</h4><ol>' +
      '<li>표에 있는 <strong>학습률 두 개</strong>를 골라 같은 시작 위치·반복 횟수로 실행하세요. 점선이 왼쪽·오른쪽을 번갈아 건너는지 관찰하세요.</li>' +
      '<li><strong>Loss 변화</strong>를 열어 각 점을 눌러 보세요. 숫자가 감소하면 그 단계의 Loss가 줄어든 것이고, 증가하면 커진 거예요.</li>' +
      '<li><strong>학습률 비교</strong>에서 두 결과를 겹쳐 보세요. 도착 위치가 같더라도 속도와 이동 경로가 다를 수 있어요.</li>' +
      ((fn.stationaryInflections || []).length ? '<li><strong>극솟값과 수평변곡점</strong>에서 각각 시작해 보세요. 둘 다 f′(x) = 0이지만 Loss가 서로 달라요.</li>' : (Number(fn.id.slice(1)) > 3 ? '<li>시작 위치를 바꿔 같은 α로 다시 실행하세요. 최솟값 근처에서 이동이 어떻게 달라지는지 비교해 보세요.</li>' : '')) +
      '</ol>' +
      '<p class="c-note">' + extra + ' 반복 한도에 도달했다는 사실만으로 발산을 뜻하지는 않아요.</p>' +
      '<div class="c-table-scroll"><table class="c-table guide-table"><thead><tr><th class="left">조건</th><th class="left">관찰 결과</th><th class="left">이유</th></tr></thead><tbody>' +
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
      '<div class="c-row"><input class="c-num" style="width:96px" type="number" id="cmpAdd" aria-label="추가할 학습률" min="' + researchAlpha().min + '" max="' + researchAlpha().max + '" step="' + researchAlpha().step + '" placeholder="α">' +
      '<button class="c-btn c-btn--sm" type="button" id="cmpAddBtn">' + U.icon('plus', 16) + '추가</button><button class="c-btn c-btn--sm c-btn--quiet" type="button" id="cmpReset">기본값으로</button></div>' +
      '<span class="c-hint" id="cmpHint">' + researchAlpha().min + ' ~ ' + researchAlpha().max + ' 사이의 값을 넣을 수 있어요.</span></div>' +
      '<div><button class="c-btn c-btn--primary" type="button" id="cmpRun">' + U.icon('play', 18) + '비교 실행</button></div><div id="cmpOut"></div></div>';
    if (st.cmp.items.length) renderCompareOut();
    on($('#cmpAddBtn'), 'click', addAlpha); on($('#cmpAdd'), 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addAlpha(); } });
    on($('#cmpReset'), 'click', function () { resetCompareAlphas(); renderCompare(); });
    on($('#cmpRun'), 'click', runCompare);
    on($('#cmpTags'), 'click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; var a = Number(b.dataset.rm); st.cmp.alphas = st.cmp.alphas.filter(function (x) { return x !== a; }); $('#cmpTags').innerHTML = tagsHTML(); });
  }
  function addAlpha() {
    var inp = $('#cmpAdd'), hint = $('#cmpHint'), v = parseFloat(inp.value), a = researchAlpha(), msg = '';
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
      '<div class="loss-calc" id="cmpLossRead" aria-live="polite">비교 그래프에서 점을 누르면 해당 학습률의 계산식을 볼 수 있어요.</div>' +
      '<div class="c-table-scroll"><table class="c-table" id="cmpTable"><caption>학습률별 결과 요약</caption><thead><tr><th scope="col">학습률</th><th class="left" scope="col">결과</th><th scope="col">반복 횟수</th><th scope="col">최종 위치</th><th scope="col">최종 Loss</th><th class="left" scope="col">종료 사유</th></tr></thead><tbody>' +
      items.map(function (it) { var r = it.result; return '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:8px;background:' + it.color + '"></span>' + it.alpha + '</td><td class="left">' + esc(it.analysis.label) + '</td><td>' + r.iterations + '</td><td>' + U.fmtNum(r.finalX) + '</td><td>' + U.fmtNum(r.finalLoss) + '</td><td class="left">' + esc(GD.engine.stopLabel(r.stopReason)) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    if (cmpGraph) cmpGraph.destroy(); if (cmpLoss) cmpLoss.destroy();
    cmpGraph = GD.viz.createFunctionGraph($('#cmpCv'), {}); cmpGraph.setFunction(fn);
    cmpLoss = GD.viz.createLossChart($('#cmpLossBox'), { onSelect: function (k, i) {
      var picked = st.cmp.items.filter(function (it) { return it.visible; })[i];
      if (!picked) return;
      $('#cmpLossRead').innerHTML = '<div><strong>학습률 α = ' + U.fmtNum(picked.alpha) + '</strong></div>' + stepCalcHTML(picked.result, k);
    } });
    refreshCompareViz();
    on(out, 'click', function (e) {
      var v = e.target.closest('[data-vis]'); if (v) { var it = items[Number(v.dataset.vis)]; it.visible = !it.visible; v.setAttribute('aria-pressed', String(it.visible)); refreshCompareViz(); }
      var s = e.target.closest('[data-for="cmp"]'); if (s) { c.scale = s.dataset.scale; $$('[data-for="cmp"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.scale === c.scale)); }); refreshCompareViz(); }
    });
  }
  function refreshCompareViz() {
    var items = st.cmp.items; cmpGraph.showMulti(items.map(function (it) { return { result: it.result, color: it.color, visible: it.visible }; }));
    var vis = items.filter(function (it) { return it.visible; });
    cmpLoss.render(vis.map(function (it) { return { label: 'α ' + it.alpha, color: it.color, values: it.result.losses }; }), { scale: st.cmp.scale, baseline: fStar(), selected: -1, label: '학습률별 Loss 변화 비교 그래프' });
    var read = $('#cmpLossRead'); if (read) read.textContent = '비교 그래프에서 점을 누르면 해당 학습률의 계산식을 볼 수 있어요.';
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
    host.innerHTML = '<section class="home"><header class="page-head"><h1>연구자모드</h1><p>' + (valid ? '2단계 · 그래프를 보고 실험할 함수를 고르세요.' : '1단계 · 2차함수 또는 4차함수를 선택하세요.') + '</p></header>' +
      (valid ? '<a class="c-btn" href="#/research">← 차수 다시 선택</a>' : '') + '<div class="mode-grid">' +
      (valid ? familyFunctions(group).map(function (f) { var pts = f.stationaryInflections || []; return '<a class="mode-card research-fn-card" href="#/research/' + group + '/' + f.id + '"><div class="research-fn-preview"><canvas data-r-preview="' + f.id + '" role="img" aria-label="' + esc(f.name) + ' 함수 그래프 미리보기"></canvas></div><div class="research-fn-meta"><span class="fn-id">' + esc(f.id) + '</span><span>' + (pts.length ? '★ 극솟값 1개 · ◉ 수평변곡점 1개' : '★ 극솟값 ' + f.minima.length + '개') + '</span></div><h2>' + esc(f.name) + '</h2><p class="fn-expr">' + esc(f.expr) + '</p><p>' + esc(f.feature) + '</p><span class="go">이 함수로 실험하기 →</span></a>'; }).join('') :
      '<a class="mode-card" href="#/research/quadratic"><h2>2차함수</h2><p>기본·완만한·가파른 포물선 3종으로 학습률과 곡률의 관계를 관찰해요.</p><span class="go">종류 선택 →</span></a><a class="mode-card" href="#/research/quartic"><h2>4차함수</h2><p>이중 골짜기·비대칭 이중 골짜기·볼록 사차함수 3종으로 시작 위치와 수렴을 탐구해요.</p><span class="go">종류 선택 →</span></a>') + '</div></section>'
    if (valid) previews = $$('canvas[data-r-preview]').map(function (canvas) {
      var g = GD.viz.createFunctionGraph(canvas, { compact: true, previewOnly: true });
      g.setFunction(GD.functions.get(canvas.dataset.rPreview));
      return g;
    });
  }
  function mount(el, params) {
    host = el; listeners = []; st = newState(); previews = []; params = params || []; family = params[0];
    if ((family !== 'quadratic' && family !== 'quartic') || !familyFunctions(family).some(function (f) { return f.id === params[1]; })) { picker(params); return; }
    fn = GD.functions.get(params[1]); resetCompareAlphas();
    host.innerHTML = layout();
    ctl = GD.ui.createControls($('#rCtl'), { prefix: 'r', fn: fn, alpha: researchAlpha(), showFunction: true, functions: familyFunctions(family), iterations: researchIterations(), alphaPresets: fn.id === 'F04' ? [0.1, 0.3, 0.5, 1, 30] : fn.id === 'F05' ? [0.01, 0.025, 0.05, 1, 30] : fn.id === 'F06' ? [0.01, 0.02, 0.1, 1, 30] : [fn.alpha.default, fn.id === 'F03' ? 0.125 : 0.5, 1, 5, 30], onRun: runExperiment, onFunctionChange: changeFunction });
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
    previews.forEach(function (g) { g.destroy(); }); previews = [];
    if (graph) graph.destroy(); if (cmpGraph) cmpGraph.destroy(); if (loss) loss.destroy(); if (cmpLoss) cmpLoss.destroy();
    graph = cmpGraph = loss = cmpLoss = null; (listeners || []).forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = [];
  }
  GD.modes.research = { title: '연구자모드', mount: mount, unmount: unmount, _state: function () { return st; }, _graph: function () { return graph; }, _cmpGraph: function () { return cmpGraph; } };
})(typeof window !== 'undefined' ? window : globalThis);
