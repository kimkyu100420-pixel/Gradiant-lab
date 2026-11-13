/* 주소(#/…)에 따라 모드를 바꿔 보여 주는 라우터. 새로고침·직접 접속·뒤로가기가 모두 동작해요. */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, current = null, currentName = null;
  var TITLES = { '': '경사하강법 시뮬레이터', game: '게임모드', research: '연구자모드', challenge: '실험도전모드' };

  function parse() {
    var h = (location.hash || '').replace(/^#\/?/, ''), parts = h.split('/').filter(Boolean);
    var name = parts[0] || ''; if (name === 'challenge') { name = 'research'; parts = ['research']; } if (!GD.modes[name || 'home']) name = '';
    return { name: name, params: parts.slice(1) };
  }
  function setTabs(name) {
    U.$$('.route-tab').forEach(function (a) { if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var t = U.$('#settingsToggle'); t.classList.toggle('is-available', name === 'game');
  }
  function route() {
    var r = parse(), app = U.$('#app'), mod = GD.modes[r.name || 'home'];
    var sameMode = current && currentName === r.name && typeof current.update === 'function';
    if (sameMode) { current.update(r.params); }
    else {
      if (current && current.unmount) { try { current.unmount(); } catch (e) { if (root.console) console.error(e); } }
      app.innerHTML = ''; current = mod; currentName = r.name;
      mod.mount(app, r.params);
    }
    setTabs(r.name);
    document.title = (mod.title || TITLES[r.name]) + (r.name ? ' · 경사하강법 시뮬레이터' : '');
    root.scrollTo(0, 0);
    var h1 = app.querySelector('h1'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }
  root.addEventListener('hashchange', route);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', route); else route();
  GD.router = { go: function (h) { location.hash = h; }, current: function () { return currentName; } };
})(typeof window !== 'undefined' ? window : globalThis);
