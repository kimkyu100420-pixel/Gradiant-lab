/* 첫 화면: 두 가지 모드 선택 + 실제 계산 엔진으로 움직이는 데모. */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, timer = 0, graph = null, userPicked = false, alive = false;
  var ALPHAS = [0.3, 0.5, 0.8, 1.0, 1.5];

  function html() {
    return '<section class="home" aria-labelledby="homeTitle">' +
      '<div class="home-hero"><div>' +
        '<h1 id="homeTitle" tabindex="-1">공을 굴리며 경사하강법을 이해해요</h1>' +
        '<p class="home-lede">학습률을 바꾸면 공의 움직임이 달라져요.</p>' +
        '<div class="home-actions"><a class="c-btn c-btn--primary" href="#/game">게임모드로 시작</a><a class="c-btn" href="#/research">연구자모드 보기</a></div>' +
      '</div>' +
      '<div class="demo-card"><div class="demo-stage"><canvas id="demoCv" role="img" aria-label="공이 포물선을 따라 최솟값으로 굴러가는 미리보기"></canvas></div>' +
        '<div class="demo-foot"><p class="demo-read" id="demoRead" aria-live="polite"></p>' +
        '<div class="c-chips" role="group" aria-label="미리볼 학습률">' + ALPHAS.map(function (a) { return '<button class="c-chip" type="button" data-a="' + a + '" aria-pressed="false">α ' + a.toFixed(1) + '</button>'; }).join('') + '</div></div></div></div>' +
      '<div class="mode-grid">' +
        card('#/game', 'ball', '게임모드', '축구공을 굴리고 퀘스트를 깨며 XP를 모아요.', '게임 시작하기') +
        card('#/research', 'chart', '연구자모드', '2차·4차함수 6종을 골라 이동 경로와 Loss를 분석하고 학습률을 비교해요.', '분석하러 가기') +
      '</div>' +
      '<p class="home-foot">' + U.esc(GD.storage.notice()) + '</p></section>';
  }
  function card(href, ic, title, text, go) {
    return '<a class="mode-card" href="' + href + '"><span class="mode-icon">' + U.icon(ic, 26) + '</span><h2>' + title + '</h2><p>' + text + '</p><span class="go">' + go + ' →</span></a>';
  }

  function play(alpha, auto) {
    var fn = GD.functions.get('F01'), r = GD.engine.run(fn, { start: 8, alpha: alpha, maxIter: 6 }), a = GD.analyzer.analyze(r, fn);
    U.$$('.c-chip[data-a]').forEach(function (b) { b.setAttribute('aria-pressed', Number(b.dataset.a) === alpha ? 'true' : 'false'); });
    U.$('#demoRead').innerHTML = '학습률 α = <strong>' + alpha.toFixed(1) + '</strong> · ' + U.esc(a.label);
    graph.play(r, function () {
      if (!alive || userPicked || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
      timer = setTimeout(function () { var i = ALPHAS.indexOf(alpha); play(ALPHAS[(i + 1) % ALPHAS.length], true); }, 2600);
    });
  }

  GD.modes.home = {
    title: '경사하강법 시뮬레이터',
    mount: function (rootEl) {
      alive = true; userPicked = false; rootEl.innerHTML = html();
      graph = GD.viz.createFunctionGraph(U.$('#demoCv'), { compact: true });
      graph.setFunction(GD.functions.get('F01'));
      U.$$('.c-chip[data-a]').forEach(function (b) { b.addEventListener('click', function () { userPicked = true; clearTimeout(timer); play(Number(b.dataset.a), false); }); });
      play(0.8, true);
    },
    unmount: function () { alive = false; clearTimeout(timer); if (graph) graph.destroy(); graph = null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
