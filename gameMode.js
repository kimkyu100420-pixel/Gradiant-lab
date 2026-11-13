/* 게임모드: 이전 Streamlit 버전의 화면·퀘스트·효과를 그대로 옮겼어요.
   바뀐 점은 두 가지뿐이에요. 계산은 공통 엔진(F01 기본 포물선)을 쓰고, 기록·진행 상황은 LocalStorage 에 저장해요. */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, esc = U.esc, fmtInt = U.fmtInt, fmtNum = U.fmtNum, icon = function (n, s) { return U.icon(n, s); };
  var START_X = 8.0, THRESH = 1e-5, TARGET_XP = 10000;
  var ANIM = { startHold: 350, move: 480, hold: 200 }, EFFECT_GAP = 450, EFFECT_MS = 5800;
  var FN = GD.functions.get('F01');

  var QUESTS = [
    { id: 'first_success', title: '첫 번째 착륙', desc: '공을 목표 지점에 성공적으로 착륙시켜라.', reward: 1000 },
    { id: 'slow', title: '거북이의 비밀', desc: '학습률을 낮춰 공이 천천히 접근하는 실험을 완료하라.', reward: 1300 },
    { id: 'one_step', title: '원샷 착륙', desc: '한 번의 실제 이동으로 목표에 도착하라.', reward: 3000 },
    { id: 'zigzag', title: '지그재그 탐정', desc: '목표를 넘나들며 점점 가까워지는 움직임을 관찰하라.', reward: 1500 },
    { id: 'pingpong', title: '무한 핑퐁 실험', desc: '공이 같은 거리로 왕복하는 움직임을 재현하라.', reward: 1300 },
    { id: 'diverge', title: '폭주 경보', desc: '공이 목표에서 점점 멀어지는 실험을 실행하라.', reward: 1900 }
  ];
  var QUEST_BY_ID = {}; QUESTS.forEach(function (q) { QUEST_BY_ID[q.id] = q; });

  /* ---------- 상태 ---------- */
  var DEFAULTS = { done: [], claimed: [], masterShown: false, introSeen: false, tipDismissed: false, alpha: 0.8, epochs: 5 };
  var S, view, listeners, attemptId, lastResult, questNotice, pending, activeFx, openModalEl, lastFocus, frameKey;

  function loadState() { var g = GD.storage.game(); S = Object.assign({}, DEFAULTS, g && typeof g === 'object' ? g : {}); }
  function save() { GD.storage.setGame(S); }
  function $(s) { return view.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(view.querySelectorAll(s)); }
  function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); }
  function currentXP() { return QUESTS.reduce(function (a, q) { return a + (S.claimed.indexOf(q.id) !== -1 ? q.reward : 0); }, 0); }
  function isMaster() { return QUESTS.every(function (q) { return S.done.indexOf(q.id) !== -1 && S.claimed.indexOf(q.id) !== -1; }); }
  function gameRecords() { return GD.records.list({ mode: 'game' }); }
  function nickname() { return GD.storage.prefs().nickname || '익명'; }

  /* ---------- 원본 규칙(학습률 기준 분류·점수) ---------- */
  function classify(alpha, fx, overflow) {
    if (overflow || !isFinite(fx) || alpha > 1) return ['우주폭발', 'explode'];
    if (Math.abs(alpha - 1) < 1e-8) return ['무한 핑퐁', 'pingpong'];
    if (Math.abs(fx) < THRESH) return ['착륙 성공', 'success'];
    if (alpha > 0.5) return ['지그재그 수렴 중', 'oscillating'];
    return ['아직 착륙 중', 'landing'];
  }
  function calcScore(fx, code) { return code === 'success' ? 100 : !isFinite(fx) ? 0 : Math.max(0, Math.min(99, Math.floor(99 * Math.exp(-Math.abs(fx) / 2)))); }

  /* ---------- 공용 조각 ---------- */
  function callout(kind, title, sub, ic) { return '<div class="callout callout-' + kind + '" role="status"><span class="co-ic">' + icon(ic || 'info', 18) + '</span><div><div class="co-t">' + title + '</div>' + (sub ? '<div class="co-s">' + sub + '</div>' : '') + '</div></div>'; }
  function xpBar(xp) { return '<div class="xp-bar" role="progressbar" aria-label="경험치 진행도" aria-valuemin="0" aria-valuemax="' + TARGET_XP + '" aria-valuenow="' + xp + '"><i style="width:' + Math.max(0, Math.min(100, xp / TARGET_XP * 100)).toFixed(1) + '%"></i></div>'; }
  var GI = { check: 'check', lock: 'lock', trophy: 'trophy', gift: 'gift', zap: 'zap', repeat: 'repeat', activity: 'activity', info: 'info', flask: 'flask', x: 'x' };
  var GPATHS = {
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>', check: '<path d="M20 6 9 17l-5-5"/>', repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', flask: '<path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5l-5.1-10.1a2 2 0 0 1-.2-.9V2"/><path d="M8.5 2h7"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  };
  icon = function (n, s) { s = s || 18; return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (GPATHS[n] || '') + '</svg>'; };

  /* ---------- 화면 틀 ---------- */
  function layoutHTML() {
    return '<aside class="side" id="gameSide" aria-label="실험 설정"><h2>🎮 연구소 컨트롤러</h2>' +
      '<div class="field"><label for="gNick">연구원 닉네임</label><input type="text" id="gNick" maxlength="20" autocomplete="nickname" spellcheck="false"></div>' +
      '<div class="start-chip"><span class="sc-ic">' + icon('info', 20) + '</span><div><div class="sc-k">시작 위치</div><div class="sc-v">x = 8.0<small>(고정)</small></div></div></div>' +
      '<div class="field" style="margin-top:16px"><div class="lbl"><label for="gAlpha">학습률 α</label><span class="help-tip" tabindex="0" role="button" aria-label="도움말" data-tip="학습률이 높아질수록 축구공이 한 번에 더 많이 이동해요.">?</span></div>' +
      '<div class="rng" id="gAlphaRng"><output class="rng-val" id="gAlphaOut" for="gAlpha">0.80</output><input type="range" id="gAlpha" min="0.05" max="1.5" step="0.05" value="0.8" aria-describedby="gAlphaCap"></div>' +
      '<div class="range-ends" aria-hidden="true"><span>0.05</span><span>1.50</span></div><p class="caption" id="gAlphaCap">학습률이 높아질수록 축구공이 한 번에 더 많이 이동해요.</p></div>' +
      '<div class="field"><div class="lbl"><label for="gEpochs">최대 이동 횟수</label><span class="help-tip" tabindex="0" role="button" aria-label="도움말" data-tip="공이 최대 몇 번까지 이동할지 정해요. 목표에 도착하면 일찍 끝나요.">?</span></div>' +
      '<div class="rng" id="gEpochsRng"><output class="rng-val" id="gEpochsOut" for="gEpochs">5</output><input type="range" id="gEpochs" min="1" max="10" step="1" value="5"></div><div class="range-ends" aria-hidden="true"><span>1</span><span>10</span></div></div>' +
      '<button class="btn btn-primary btn-block" id="gRunSide" type="button">⚽ 실험 실행</button></aside>' +
      '<div class="scrim" id="gScrim" hidden></div>' +
      '<main class="main" id="gameMain">' +
      '<section class="hero"><svg class="hero-art" viewBox="0 0 320 150" aria-hidden="true" focusable="false"><path d="M20 8 Q160 290 300 8" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/><path d="M48 59 L90 114 L126 141 L149 148" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-dasharray="4 5" stroke-linecap="round"/><circle cx="48" cy="59" r="8" fill="#fff"/><circle cx="90" cy="114" r="6.5" fill="rgba(255,255,255,.85)"/><circle cx="126" cy="141" r="5" fill="rgba(255,255,255,.7)"/><circle cx="149" cy="148" r="3.6" fill="rgba(255,255,255,.55)"/><circle cx="161" cy="146" r="8" fill="#38D5E8"/></svg>' +
      '<h1>⚽ 경사하강법 시뮬레이터</h1><p>퀘스트에 도전하며 학습률에 따라 공이 어떻게 움직이는지 직접 발견해 보세요.</p>' +
      '<ol class="hero-steps"><li><b>1</b>학습률 α 고르기</li><li><b>2</b>실험 실행</li><li><b>3</b>결과 분석 · 규칙 탐구</li></ol></section>' +
      '<div id="gBanner"></div><nav class="nav-row" aria-label="게임 메뉴"><button class="btn btn-primary btn-block" id="gQuestBtn" type="button" aria-haspopup="dialog">🧪 퀘스트</button></nav>' +
      '<div id="gTip"></div><div id="gHud"></div>' +
      '<div class="mobile-run"><button class="btn btn-primary btn-block" id="gRunMobile" type="button">⚽ 실험 실행</button><p class="caption" id="gMobileCap" style="margin-top:.4rem"></p></div><hr>' +
      '<div class="work"><section aria-labelledby="gGraphH"><h3 class="sec-h3" id="gGraphH" tabindex="-1">🏔️ 공의 이동 경로</h3><iframe class="graph-frame" id="gFrame" title="공의 이동 경로 그래프"></iframe><p class="caption" id="gGraphCap"></p><div id="gWarn" style="margin-top:.8rem"></div></section>' +
      '<section aria-labelledby="gResH"><h3 class="sec-h3" id="gResH">📟 이번 실험 결과</h3><div class="res-wrap" id="gResult"></div></section></div><hr>' +
      '<section class="records" aria-labelledby="gRecH"><h2 class="sec-h2" id="gRecH" style="margin-bottom:0">📒 내 개인 기록</h2><p class="caption" id="gRecNote"></p><div id="gRecBody" class="records"></div></section><hr>' +
      '<p class="caption page-foot">경사하강법 시뮬레이터 · 실험하고 발견하고 해금하세요!</p></main>' +
      '<div class="modal" id="gIntro" hidden role="dialog" aria-modal="true" aria-labelledby="gIntroT"><div class="modal-box"><div class="dlg-head"><h2 id="gIntroT">🔬 연구소 미션 브리핑</h2><button class="btn icon-btn" type="button" data-close aria-label="닫기">✕</button></div><div class="dlg-body"><div class="brief-emoji" aria-hidden="true">⚽ 🔎 📈</div><div class="brief">' +
      '<div class="brief-card"><span class="bc-n">1</span><div><div class="bc-t">한 번의 이동으로 최솟값에 도착하는 학습률을 찾아라!</div><div class="bc-s">학습률을 바꿔가며 공의 움직임을 관찰하고, 가장 알맞은 값을 직접 찾아보세요.</div></div></div>' +
      '<div class="brief-card"><span class="bc-n">2</span><div><div class="bc-t">여섯 개의 퀘스트를 완료하고 경사하강법 마스터가 되어라!</div><div class="bc-s">실험을 통해 미션을 완료하고 보상을 모아 연구소를 정복하세요.</div></div></div></div><button class="btn btn-primary btn-block" type="button" data-close>미션 시작하기 🚀</button></div></div></div>' +
      '<div class="modal" id="gQuest" hidden role="dialog" aria-modal="true" aria-labelledby="gQuestT"><div class="modal-box"><div class="dlg-head"><h2 id="gQuestT">🧪 퀘스트 센터</h2><button class="btn icon-btn" type="button" data-close aria-label="닫기">✕</button></div><div class="dlg-body" id="gQuestBody"></div></div></div>' +
      '<div class="modal" id="gMaster" hidden role="dialog" aria-modal="true" aria-labelledby="gMasterT"><div class="modal-box"><div class="dlg-head"><h2 id="gMasterT">🏆 경사하강법 마스터 달성!</h2><button class="btn icon-btn" type="button" data-close aria-label="닫기">✕</button></div><div class="dlg-body"><div class="master-dialog md-pending" id="gMasterCard"><div class="md-emoji" aria-hidden="true">🏆</div><div class="md-kicker">MASTER UNLOCKED</div><div class="md-title">경사하강법 마스터가 되었습니다!</div><p>퀘스트 6개 완료 · 모든 미션 클리어</p><div class="md-chip">+10,000 XP · MASTER RANK</div><div class="md-note">수렴과 발산의 규칙을 찾아냈어요.</div></div><button class="btn btn-block" type="button" data-close>닫기</button></div></div></div>';
  }

  /* ---------- 화면 갱신 ---------- */
  function renderBanner() {
    $('#gBanner').innerHTML = isMaster() ? '<section class="master-banner"><div class="mb-badge" aria-hidden="true">🏆</div><h2>경사하강법 마스터</h2><p>여섯 개의 퀘스트를 모두 완료하고, 움직임 연구를 마쳤습니다.</p><div class="mb-chip">ALL QUESTS COMPLETE · ' + fmtInt(TARGET_XP) + ' XP</div></section>' : '';
  }
  function renderTip() {
    var a = $('#gTip');
    if (!S.introSeen || S.tipDismissed) { a.innerHTML = ''; return; }
    a.innerHTML = '<div class="tip-row"><div class="gd-quick-tip" role="note" aria-label="실험 방법 안내"><div class="qt-label">💬 첫 실험 가이드</div><div class="qt-title">설정하고, 실행하고, 움직임을 관찰하세요.</div><div class="qt-copy">학습률은 한 번에 움직이는 크기, 이동 횟수는 반복할 최대 횟수예요. 값을 바꿔 공의 경로와 Loss를 비교해 보세요.</div><div class="qt-steps"><span>1 · 학습률 설정</span><span>2 · 실험 실행</span><span>3 · 결과 확인</span></div></div><button class="btn tip-x" id="gTipX" type="button" aria-label="실험 안내 닫기" title="실험 안내 닫기">×</button></div>';
    on($('#gTipX'), 'click', function () { S.tipDismissed = true; save(); renderTip(); });
  }
  function renderHUD() {
    var xp = currentXP(), doneN = QUESTS.filter(function (q) { return S.done.indexOf(q.id) !== -1; }).length, claimedN = QUESTS.filter(function (q) { return S.claimed.indexOf(q.id) !== -1; }).length;
    $('#gHud').innerHTML = '<section class="hud" aria-label="연구소 진행 현황"><div class="hud-top"><div class="hud-title">🏆 연구소 진행 현황</div><div class="hud-xp"><b>' + fmtInt(xp) + '</b> / ' + fmtInt(TARGET_XP) + ' XP</div></div>' + xpBar(xp) +
      '<div class="stat-grid"><div class="stat"><span class="st-ic">' + icon('check') + '</span><div><div class="st-k">완료한 퀘스트</div><div class="st-v">' + doneN + ' / ' + QUESTS.length + '</div></div></div><div class="stat"><span class="st-ic">' + icon('gift') + '</span><div><div class="st-k">수령한 보상</div><div class="st-v">' + claimedN + ' / ' + QUESTS.length + '</div></div></div></div></section>';
  }
  function renderResult() {
    var box = $('#gResult'), r = lastResult;
    if (!r) { box.innerHTML = callout('info', '아직 실험 기록이 없어요', '사이드바에서 설정하고 실험을 시작하세요.', 'flask'); $('#gWarn').innerHTML = ''; return; }
    var ui = { success: ['ok', '성공!', '최솟값에 도착했어요.', 'check'], explode: ['bad', '발산!', '공이 목표에서 멀어졌어요.', 'zap'], pingpong: ['warn', '왕복 반복', '거리가 줄지 않아요.', 'repeat'], oscillating: ['warn', '진동하며 수렴 중', '점점 가까워져요.', 'activity'], landing: ['info', '수렴 중', '이동 횟수를 늘려 보세요.', 'info'] }[r.code];
    box.innerHTML = callout(ui[0], ui[1], ui[2], ui[3]) + '<div class="res-score"><div class="lbl">🏅 점수</div><div class="val">' + r.score + '<small>/ 100</small></div><div class="xp-bar" role="progressbar" aria-label="점수" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + r.score + '"><i style="width:' + r.score + '%"></i></div></div>' +
      '<div class="res-rows"><div class="res-row"><span class="k">📍 최종 위치</span><span class="v">' + fmtNum(r.finalX) + '</span></div><div class="res-row"><span class="k">📉 최종 Loss</span><span class="v">' + fmtNum(r.finalLoss) + '</span></div><div class="res-row"><span class="k">🔁 실제 이동 횟수<small>목표에 도착하면 일찍 끝나요</small></span><span class="v">' + r.steps + '회</span></div></div>' +
      '<p class="res-note">최대 이동 횟수 ' + r.epochs + '회 · 성공 기준 |x| &lt; ' + THRESH.toFixed(5) + '</p>';
    $('#gWarn').innerHTML = Math.abs(r.finalX) > 12 ? callout('warn', '공이 시작점보다 훨씬 멀리 날아갔어요', '공이 멀어지면 실험 중 그래프 범위도 실시간으로 넓어져요. 정확한 위치는 오른쪽 결과에서 확인하세요.', 'zap') : '';
  }
  function scoreChart(recs) {
    var W = 640, H = 250, L = 44, R = 16, T = 14, B = 36, pw = W - L - R, ph = H - T - B, n = recs.length;
    function X(i) { return L + (n === 1 ? pw / 2 : i / (n - 1) * pw); } function Y(v) { return T + (1 - v / 100) * ph; }
    var g = ''; for (var v = 0; v <= 100; v += 25) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#E6EEF6"/><text x="' + (L - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="12" fill="#586A82">' + v + '</text>';
    var step = Math.max(1, Math.ceil(n / 10)); for (var i = 0; i < n; i += step) g += '<text x="' + X(i) + '" y="' + (H - 14) + '" text-anchor="middle" font-size="12" fill="#586A82">' + (i + 1) + '</text>';
    g += '<text x="' + (L + pw / 2) + '" y="' + (H - 1) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#142B4A">도전 번호</text>';
    var pts = recs.map(function (r, k) { return X(k).toFixed(1) + ',' + Y(r.score).toFixed(1); }).join(' ');
    var dots = recs.map(function (r, k) { return '<circle cx="' + X(k).toFixed(1) + '" cy="' + Y(r.score).toFixed(1) + '" r="5" fill="#fff" stroke="#1769AA" stroke-width="2.5"><title>' + (k + 1) + '번째 도전 · α ' + Number(r.alpha).toFixed(2) + ' · ' + r.score + '점 · ' + esc(r.statusLabel) + '</title></circle>'; }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="도전 번호별 점수 꺾은선 그래프. 최근 ' + recs[n - 1].score + '점"><desc>자세한 값은 위의 기록 표에서 확인할 수 있어요.</desc>' + g + '<polyline points="' + pts + '" fill="none" stroke="#1769AA" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' + dots + '</svg>';
  }
  function renderRecords() {
    var body = $('#gRecBody'), recs = gameRecords();
    $('#gRecNote').textContent = GD.storage.notice();
    if (!recs.length) { body.innerHTML = callout('info', '아직 개인 기록이 없어요', '실험을 실행하면 결과가 저장됩니다.', 'flask'); return; }
    var best = Math.max.apply(null, recs.map(function (r) { return r.score; })), wins = recs.filter(function (r) { return r.success; }).length;
    var rows = recs.slice().reverse().map(function (r) { return '<tr><td>' + esc(r.nickname) + '</td><td>' + Number(r.alpha).toFixed(2) + '</td><td>' + r.maxIter + '</td><td>' + r.iterations + '</td><td>' + fmtNum(r.finalX) + '</td><td>' + fmtNum(r.finalLoss) + '</td><td><span class="sbar"><i><b style="width:' + r.score + '%"></b></i>' + r.score + '</span></td><td>' + esc(r.statusLabel) + '</td></tr>'; }).join('');
    body.innerHTML = '<div class="stat-grid" style="margin-bottom:.4rem"><div class="stat"><span class="st-ic">' + icon('flask') + '</span><div><div class="st-k">총 플레이</div><div class="st-v">' + recs.length + '회</div></div></div><div class="stat"><span class="st-ic">' + icon('trophy') + '</span><div><div class="st-k">최고 점수</div><div class="st-v">' + best + '점</div></div></div><div class="stat"><span class="st-ic">' + icon('check') + '</span><div><div class="st-k">성공 횟수</div><div class="st-v">' + wins + '회</div></div></div></div>' +
      '<div class="table-wrap" tabindex="0" role="region" aria-label="실험 기록 표(스크롤 가능)"><table class="rec-table"><thead><tr><th scope="col">닉네임</th><th scope="col">학습률</th><th scope="col">최대 이동 횟수</th><th scope="col">실제 이동 횟수</th><th scope="col">최종 위치</th><th scope="col">최종 Loss</th><th scope="col">점수</th><th scope="col">결과</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<button class="btn btn-block" id="gCsv" type="button">📥 내 기록 CSV 다운로드</button><button class="btn btn-ghost" id="gReset" type="button" style="align-self:flex-start">기록과 퀘스트 진행 초기화</button>' +
      '<h3 class="sec-h3" style="margin:.6rem 0 0">도전할수록 점수가 어떻게 달라질까?</h3><div class="chart-card">' + scoreChart(recs) + '</div>';
    on($('#gCsv'), 'click', function () { GD.csv.download(gameRecords(), 'game_mode_records.csv'); });
    on($('#gReset'), 'click', resetAll);
  }
  function resetAll() {
    if (!root.confirm('이 브라우저에 저장된 게임모드 기록과 퀘스트·경험치 진행을 모두 지울까요?')) return;
    cancelPending(); closeEffect(true); GD.records.clear({ mode: 'game' }); GD.storage.clearGame(); loadState(); lastResult = null; frameKey = ''; applyControls();
    $('#gGraphCap').textContent = idleCap; renderGraph([START_X], 0, true); renderAll(); U.toast('처음 상태로 되돌렸어요.');
  }

  /* ---------- 그래프(원본 canvas 를 iframe 으로) ---------- */
  var idleCap = '공은 y = x² 곡선 위를 따라 이동하고, 멈춘 위치마다 번호가 남아요. 실험을 실행하면 자동으로 재생됩니다.';
  function renderGraph(xs, id, idle) {
    var points = xs.map(function (x) { return { x: x, y: x * x }; }), n = points.length - 1;
    var aria = idle ? '이차함수 y = x² 그래프입니다. 공이 x = ' + START_X + '에서 출발을 기다리고 있어요.' : '이차함수 y = x² 위에서 공이 x = ' + points[0].x + '에서 출발해 ' + n + '번 이동했고 최종 위치는 x = ' + Number(points[n].x.toPrecision(6)) + '입니다.';
    var sr = idle ? '실험을 실행하면 공이 곡선을 따라 목표 지점 x = 0으로 이동합니다.' : '이동 기록(x 좌표): ' + points.map(function (p) { return Number(p.x.toPrecision(4)); }).join(' → ');
    var key = idle ? 'idle' : 'run' + id; if (key === frameKey && idle) return; frameKey = key;
    function rep(s, a, b) { return s.split(a).join(b); }
    var page = GD.gameGraphHtml; page = rep(page, '__POINTS__', JSON.stringify(points)); page = rep(page, '__ATTEMPT__', String(id)); page = rep(page, '__IDLE__', idle ? 'true' : 'false');
    page = rep(page, '__MOVE_MS__', ANIM.move); page = rep(page, '__HOLD_MS__', ANIM.hold); page = rep(page, '__START_HOLD__', ANIM.startHold); page = rep(page, '__ARIA__', esc(aria)); page = rep(page, '__SR__', esc(sr));
    $('#gFrame').srcdoc = page;
  }

  /* ---------- 특수효과(그래프 애니메이션이 끝난 뒤에만 시작) ---------- */
  function failureSpec(alpha) {
    function same(x) { return Object.assign({ label: '실험 결과: 착륙 실패', meta: '실험 상황 · 학습률 α=' + alpha }, x); }
    if (alpha > 0 && alpha < 0.5) return same({ kind: 'turtle', kicker: 'SLOW CONVERGENCE', hero: '🐢 ↘', head: '느리지만 수렴 중', copy: '작은 이동으로 최솟값에 가까워지고 있어요.', particles: [['🐢', '-34vw', '-28vh'], ['🫧', '34vw', '-22vh'], ['🍃', '-38vw', '20vh'], ['✦', '38vw', '22vh'], ['🌱', '-18vw', '34vh'], ['✨', '20vw', '-36vh']] });
    if (alpha > 0.5 && alpha < 1) return same({ kind: 'zigzag', kicker: 'OSCILLATING', hero: '⚡', head: '진동하며 수렴 중', copy: '최솟값을 넘나들며 점점 가까워져요.', particles: [['⚡', '-36vw', '-25vh'], ['✦', '35vw', '-30vh'], ['🔹', '-40vw', '18vh'], ['⚡', '39vw', '22vh'], ['✧', '-16vw', '35vh'], ['💠', '18vw', '-36vh']] });
    if (Math.abs(alpha - 1) < 1e-8) return same({ kind: 'pingpong', kicker: 'PERIODIC MOTION', hero: '↔', head: '같은 거리에서 왕복 중', copy: 'α=1에서는 거리가 줄지 않아요.', particles: [['↔', '-38vw', '-20vh'], ['◉', '36vw', '-25vh'], ['⟷', '-40vw', '20vh'], ['✦', '40vw', '24vh'], ['◌', '-18vw', '34vh'], ['✧', '20vw', '-35vh']] });
    if (alpha > 1) return same({ kind: 'explode', kicker: 'DIVERGENCE', hero: '↗', head: '발산 중!', copy: '학습률을 낮춰 다시 시도해 보세요.', particles: [['💥', '-37vw', '-25vh'], ['⚠️', '36vw', '-28vh'], ['🔥', '-40vw', '20vh'], ['✹', '39vw', '22vh'], ['💢', '-18vw', '35vh'], ['⚡', '19vw', '-35vh'], ['✦', '0vw', '38vh']] });
    return same({ kind: 'failure', kicker: 'EXPERIMENT INCOMPLETE', hero: '!', head: '아직 도착하지 못했어요', copy: '학습률이나 이동 횟수를 조정해 보세요.', particles: [['✦', '-34vw', '-28vh'], ['!', '34vw', '-22vh'], ['⚡', '-38vw', '20vh'], ['✧', '38vw', '22vh']] });
  }
  function effectSpec(res) {
    if (res.code !== 'success') return failureSpec(res.alpha);
    if (res.alpha < 0.5) return { kind: 'turtle', label: '실험 결과: 느린 수렴', kicker: 'SLOW CONVERGENCE', hero: '🐢 ↘', head: '천천히, 꾸준하게', copy: '작은 이동으로 최솟값에 접근 중이에요.', meta: '', particles: [['🐢', '-42vw', '-22vh'], ['🐢', '38vw', '-28vh'], ['🍃', '-40vw', '24vh'], ['✦', '40vw', '18vh'], ['🌿', '-24vw', '-34vh'], ['✧', '27vw', '32vh'], ['🍃', '-36vw', '8vh'], ['·', '30vw', '-16vh'], ['✦', '-8vw', '36vh']] };
    return { kind: 'success', label: '실험 결과: 착륙 성공', kicker: 'SUCCESS', hero: '🏆 ⚽', head: '최솟값에 도착했어요!', copy: 'α=0.5면 한 번에 도착합니다.<br>점수 +100점!', meta: '', particles: [['🎆', '-34vw', '-35vh'], ['🎇', '30vw', '-30vh'], ['🎉', '-38vw', '20vh'], ['✨', '36vw', '28vh'], ['🎊', '-42vw', '-4vh'], ['⭐', '40vw', '-8vh'], ['🥳', '-24vw', '34vh'], ['🪅', '22vw', '36vh'], ['💫', '-12vw', '-38vh'], ['🌟', '14vw', '-37vh'], ['🎈', '-30vw', '-20vh'], ['🎊', '32vw', '-22vh']] };
  }
  function toastTextFor(notices) {
    var done = (notices || []).filter(function (n) { return n.indexOf('퀘스트 완료') !== -1; });
    if (done.length > 1) return '퀘스트 ' + done.length + '개 완료! 퀘스트 센터에서 보상을 수령하세요.';
    if (done.length === 1) return '퀘스트 완료! 퀘스트 센터에서 보상을 수령하세요.';
    return (notices && notices.length) ? '연구 기록이 저장되었습니다.' : '기록되었습니다.';
  }
  var EXTRA_IDS = ['gd-failure-flashes', 'gd-explosion-impact', 'gd-electric-flash', 'gd-turtle-effect', 'gd-zigzag-effect', 'gd-pingpong-effect', 'gd-fireworks'];
  function closeEffect(silent) {
    var fx = activeFx; if (!fx || fx.closed) return; fx.closed = true; activeFx = null;
    clearTimeout(fx.timer); document.removeEventListener('keydown', fx.onKey, true);
    fx.el.classList.add('is-closing'); setTimeout(function () { fx.el.remove(); }, 200);
    EXTRA_IDS.forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
    var stage = document.querySelector('.gd-screen-shaking, .gd-screen-shaking-hard'); if (stage) stage.classList.remove('gd-screen-shaking', 'gd-screen-shaking-hard');
    if (!silent && fx.toastText && fx.toastText.indexOf('퀘스트') !== -1) setTimeout(function () { try { root.gdToast(document, fx.toastText, 'gift'); } catch (e) {} }, 260);
  }
  function startEffect(p) {
    closeEffect(true);
    var sp = p.spec, el = document.createElement('div');
    el.className = 'gd-overlay keep-motion gd-' + sp.kind; el.id = sp.kind + '-' + p.id; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', sp.label);
    var parts = sp.particles.map(function (q, i) { return '<span class="gd-particle" style="--dx:' + q[1] + ';--dy:' + q[2] + ';--d:' + (i * 0.05).toFixed(2) + 's" aria-hidden="true">' + esc(q[0]) + '</span>'; }).join('');
    el.innerHTML = parts + '<div class="gd-card"><button class="gd-close" type="button" aria-label="알림 닫기">' + icon('x', 22) + '</button><div class="gd-kicker">' + sp.kicker + '</div><div class="gd-emoji" aria-hidden="true">' + sp.hero + '</div><div class="gd-head">' + esc(sp.head) + '</div><div class="gd-copy">' + (sp.kind === 'success' ? sp.copy : esc(sp.copy)) + '</div>' + (sp.meta ? '<div class="gd-meta">' + esc(sp.meta) + '</div>' : '') + '</div><div class="gd-hint">화면을 누르면 닫혀요<span class="gd-hint-k"> (Esc 키도 가능)</span></div>';
    var fx = { el: el, closed: false, toastText: p.toastText, timer: 0, onKey: null };
    function dismiss(ev) { if (fx.closed) return; if (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } closeEffect(false); }
    fx.onKey = function (ev) { if (ev.key === 'Escape') dismiss(ev); };
    document.addEventListener('keydown', fx.onKey, true); el.addEventListener('pointerdown', dismiss, true); el.addEventListener('click', dismiss, true);
    activeFx = fx; document.body.appendChild(el);
    if (sp.kind === 'success') root.gdFireworks(root, { big: true, frames: 140 });
    else {
      var old = document.getElementById('gd-fireworks'); if (old) old.remove();
      if (sp.kind === 'failure') root.gdFailureEffect(root, 'normal'); else if (sp.kind === 'turtle') root.gdTurtleEffect(root); else if (sp.kind === 'zigzag') root.gdZigzagEffect(root);
      else if (sp.kind === 'pingpong') root.gdPingPongEffect(root); else if (sp.kind === 'explode') root.gdFailureEffect(root, 'explode');
    }
    fx.timer = setTimeout(function () { closeEffect(false); }, EFFECT_MS + 100);
  }
  function cancelPending() { if (pending) { clearTimeout(pending.timer); pending = null; } }
  function scheduleEffect(p) {
    if (!pending || pending !== p || p.fired) return; p.fired = true; clearTimeout(p.timer);
    p.timer = setTimeout(function () { if (pending === p) { pending = null; startEffect(p); } }, EFFECT_GAP);
  }
  function onStarted(ev) { var p = pending; if (p && ev.detail && ev.detail.attemptId === p.id && !p.fired) { clearTimeout(p.timer); p.timer = setTimeout(function () { scheduleEffect(p); }, p.animMs + 3000); } }
  function onFinished(ev) { var p = pending; if (p && ev.detail && ev.detail.attemptId === p.id) scheduleEffect(p); }

  /* ---------- 실험 실행 ---------- */
  function runExperiment() {
    cancelPending(); closeEffect(true);
    var nick = ($('#gNick').value.trim() || '익명').slice(0, 20), alpha = Math.round(parseFloat($('#gAlpha').value) * 100) / 100, epochs = parseInt($('#gEpochs').value, 10);
    GD.storage.setPrefs({ nickname: nick });
    var run = GD.engine.run(FN, { start: START_X, alpha: alpha, maxIter: epochs });     // 공통 계산 엔진
    var cl = classify(alpha, run.finalX, run.overflow), label = cl[0], code = cl[1], score = calcScore(run.finalX, code);
    attemptId++; lastResult = { alpha: alpha, epochs: epochs, steps: run.iterations, finalX: run.finalX, finalLoss: run.finalLoss, label: label, code: code, score: score, id: attemptId };
    GD.records.add({ mode: 'game', functionId: 'F01', functionName: FN.name, nickname: nick, alpha: alpha, start: START_X, maxIter: epochs, iterations: run.iterations, finalX: run.finalX, finalLoss: run.finalLoss, statusLabel: label, success: code === 'success', score: score });
    var notices = [];
    function complete(qid) { if (S.done.indexOf(qid) === -1) { S.done.push(qid); var q = QUEST_BY_ID[qid]; notices.push(q.title + ' 퀘스트 완료! 보상 ' + fmtInt(q.reward) + ' XP 수령 가능'); } }
    if (code === 'success') complete('first_success');
    if (alpha > 0 && alpha < 0.5 && run.iterations > 0) complete('slow');
    if (Math.abs(alpha - 0.5) < 1e-9 && code === 'success' && run.iterations === 1) complete('one_step');
    if (alpha > 0.5 && alpha < 1 && run.iterations >= 2) complete('zigzag');
    if (Math.abs(alpha - 1) < 1e-9) complete('pingpong');
    if (alpha > 1) complete('diverge');
    questNotice = notices; S.alpha = alpha; S.epochs = epochs; save();
    renderResult(); renderHUD(); renderRecords(); renderBanner();
    $('#gGraphCap').textContent = '공은 y = x² 곡선 위를 따라 이동하고, 멈춘 위치마다 번호가 남아요. ‘건너뛰기’로 바로 결과를 볼 수 있어요.';
    var animMs = ANIM.startHold + Math.max(0, run.xs.length - 1) * (ANIM.move + ANIM.hold) + 500;
    var p = { id: attemptId, spec: effectSpec(lastResult), toastText: toastTextFor(questNotice), animMs: animMs, fired: false, timer: 0 };
    pending = p; p.timer = setTimeout(function () { scheduleEffect(p); }, animMs + 8000);
    renderGraph(run.xs, attemptId, false);
    function go() { var h = $('#gGraphH'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    setTimeout(go, 250); setTimeout(go, 900); closeDrawer();
  }

  /* ---------- 팝업(모달) ---------- */
  var focusables = function (r) { return Array.prototype.slice.call(r.querySelectorAll('button:not([disabled]),[href],input,[tabindex]:not([tabindex="-1"])')).filter(function (e) { return e.offsetParent !== null; }); };
  function setInert(on_) { ['#gameMain', '#gameSide'].forEach(function (s) { var e = $(s); if (e) { if (on_) e.setAttribute('inert', ''); else e.removeAttribute('inert'); } }); }
  function openModal(m) {
    if (openModalEl && openModalEl !== m) closeModal(openModalEl, true);
    lastFocus = document.activeElement; m.hidden = false; openModalEl = m; document.body.classList.add('modal-open'); setInert(true);
    var f = focusables(m); (f.filter(function (e) { return e.classList.contains('btn-primary'); })[0] || f[0] || m).focus();
  }
  function closeModal(m, quiet) {
    m.hidden = true; if (openModalEl === m) openModalEl = null; document.body.classList.remove('modal-open'); setInert(false);
    if (!quiet && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    if (m.id === 'gIntro') { S.introSeen = true; save(); renderTip(); }
    renderHUD(); renderBanner();
  }
  function questCard(q) {
    var done = S.done.indexOf(q.id) !== -1, claimed = S.claimed.indexOf(q.id) !== -1, st = claimed ? 'claimed' : done ? 'ready' : 'locked';
    var badge = icon(claimed ? 'trophy' : done ? 'gift' : 'lock', 20);
    var foot = claimed ? '<span class="quest-state is-claimed">' + icon('check', 16) + ' 보상 수령 완료</span>' : done ? '<button class="btn btn-primary btn-block" type="button" data-claim="' + q.id + '">🎁 ' + fmtInt(q.reward) + ' XP 받기</button>' : '<span class="quest-state is-locked">' + icon('lock', 14) + ' 미완료 — 실험 조건을 바꾸어 도전하세요.</span>';
    return '<article class="qcard ' + (done && !claimed ? 'q-ready' : '') + '"><div class="quest-head q-' + st + '"><span class="quest-badge">' + badge + '</span><div class="quest-main"><div class="quest-title">' + q.title + '</div><div class="quest-desc">' + q.desc + '</div></div><span class="xp-chip">' + fmtInt(q.reward) + ' XP</span></div>' + foot + '</article>';
  }
  function renderQuest() {
    var body = $('#gQuestBody'), keep = body.scrollTop, xp = currentXP(), doneN = QUESTS.filter(function (q) { return S.done.indexOf(q.id) !== -1; }).length, claimedN = QUESTS.filter(function (q) { return S.claimed.indexOf(q.id) !== -1; }).length;
    body.innerHTML = '<div class="panel-heading"><div class="ph-row"><span class="ph-kicker">QUEST CENTER</span><span class="ph-xp"><b>' + fmtInt(xp) + '</b> / ' + fmtInt(TARGET_XP) + ' XP</span></div>' + xpBar(xp) + '<p class="ph-sub">미션을 완료하고 보상을 수령하세요 · 완료 ' + doneN + '/' + QUESTS.length + ' · 수령 ' + claimedN + '/' + QUESTS.length + '</p></div>' + QUESTS.map(questCard).join('') + '<button class="btn btn-block" type="button" data-close>닫기</button>';
    body.scrollTop = keep;
  }
  function openQuest() { renderQuest(); openModal($('#gQuest')); }
  function showMaster() {
    var m = $('#gMaster'), card = $('#gMasterCard'); card.className = 'master-dialog md-pending'; openModal(m);
    setTimeout(function () { if (m.hidden) return; card.classList.remove('md-pending'); card.classList.add('md-reveal'); root.gdFireworks(root, { big: true, frames: 190, center: true, colors: ['#38D5E8', '#1769AA', '#F4B400', '#FF7DA8', '#6FD3A0', '#9B8CFF'] }); }, 1500);
  }
  function onClaim(e) {
    var b = e.target.closest('[data-claim]'); if (!b) return; var qid = b.dataset.claim;
    if (S.claimed.indexOf(qid) !== -1 || S.done.indexOf(qid) === -1) return;
    S.claimed.push(qid); save(); renderHUD(); renderBanner();
    if (isMaster() && !S.masterShown) { S.masterShown = true; save(); closeModal($('#gQuest'), true); showMaster(); }
    else { renderQuest(); root.gdFireworks(root, { mini: true, frames: 65, label: '🎁 REWARD CLAIMED!' }); root.gdToast(document, '퀘스트 보상을 수령했습니다.', 'gift'); }
  }

  /* ---------- 사이드바(좁은 화면에서는 위쪽 '설정' 버튼으로 열기) ---------- */
  function openDrawer() { $('#gameSide').classList.add('open'); $('#gScrim').hidden = false; var t = document.getElementById('settingsToggle'); if (t) t.setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { if (!view) return; $('#gameSide').classList.remove('open'); $('#gScrim').hidden = true; var t = document.getElementById('settingsToggle'); if (t) t.setAttribute('aria-expanded', 'false'); }
  function syncRange(id, out, fmt) { var el = $(id), wrap = el.closest('.rng'), p = (el.value - el.min) / (el.max - el.min); wrap.style.setProperty('--p', p); wrap.style.setProperty('--pct', (p * 100) + '%'); $(out).textContent = fmt(el.value); }
  function syncMobileCap() { $('#gMobileCap').textContent = '현재 설정 · α ' + Number($('#gAlpha').value).toFixed(2) + ' · 최대 ' + $('#gEpochs').value + '회 — 설정은 위쪽 ‘설정’ 버튼에서 바꿀 수 있어요.'; }
  function applyControls() {
    $('#gNick').value = nickname(); $('#gAlpha').value = S.alpha; $('#gEpochs').value = S.epochs;
    syncRange('#gAlpha', '#gAlphaOut', function (v) { return Number(v).toFixed(2); }); syncRange('#gEpochs', '#gEpochsOut', String); syncMobileCap();
  }
  function renderAll() { renderBanner(); renderTip(); renderHUD(); renderResult(); renderRecords(); }

  function mount(rootEl) {
    listeners = []; attemptId = 0; lastResult = null; questNotice = null; pending = null; activeFx = null; openModalEl = null; frameKey = ''; loadState();
    rootEl.innerHTML = '<div class="game-view app-root" id="gameView">' + layoutHTML() + '</div>'; view = rootEl.querySelector('#gameView');
    applyControls(); $('#gGraphCap').textContent = idleCap; renderAll(); renderGraph([START_X], 0, true);
    on($('#gAlpha'), 'input', function () { syncRange('#gAlpha', '#gAlphaOut', function (v) { return Number(v).toFixed(2); }); S.alpha = Number($('#gAlpha').value); save(); syncMobileCap(); });
    on($('#gEpochs'), 'input', function () { syncRange('#gEpochs', '#gEpochsOut', String); S.epochs = Number($('#gEpochs').value); save(); syncMobileCap(); });
    on($('#gNick'), 'change', function () { GD.storage.setPrefs({ nickname: $('#gNick').value.trim() || '익명' }); });
    on($('#gRunSide'), 'click', runExperiment); on($('#gRunMobile'), 'click', runExperiment); on($('#gQuestBtn'), 'click', openQuest);
    on($('#gQuestBody'), 'click', onClaim);
    ['#gIntro', '#gQuest', '#gMaster'].forEach(function (s) { var m = $(s); on(m, 'click', function (e) { if (e.target.closest('[data-close]') || e.target === m) closeModal(m); });
      on(m, 'keydown', function (e) { if (e.key !== 'Tab') return; var f = focusables(m); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }); });
    on(document, 'keydown', function (e) { if (e.key === 'Escape' && !activeFx) { if (openModalEl) closeModal(openModalEl); else if ($('#gameSide').classList.contains('open')) closeDrawer(); } });
    on(document, 'gd-experiment-animation-started', onStarted); on(document, 'gd-experiment-animation-finished', onFinished);
    on($('#gScrim'), 'click', closeDrawer);
    var tg = document.getElementById('settingsToggle'); if (tg) on(tg, 'click', function () { if ($('#gameSide').classList.contains('open')) closeDrawer(); else openDrawer(); });
    $$('.help-tip').forEach(function (t) { on(t, 'click', function (e) { e.stopPropagation(); var o = t.classList.contains('open'); $$('.help-tip.open').forEach(function (x) { x.classList.remove('open'); }); if (!o) t.classList.add('open'); }); on(t, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); } }); });
    on(document, 'click', function () { $$('.help-tip.open').forEach(function (x) { x.classList.remove('open'); }); });
    if (!S.introSeen) openModal($('#gIntro'));
  }
  function unmount() {
    cancelPending(); closeEffect(true);
    EXTRA_IDS.concat(['gd-toast']).forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
    document.body.classList.remove('modal-open'); closeDrawer();
    (listeners || []).forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = []; view = null;
  }

  GD.modes.game = { title: '게임모드', mount: mount, unmount: unmount, _classify: classify, _calcScore: calcScore, QUESTS: QUESTS };
})(typeof window !== 'undefined' ? window : globalThis);
