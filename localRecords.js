/* 개인 실험 기록: 이 브라우저의 LocalStorage 에만 저장해요. 서버로 보내거나 다른 사람과 합치지 않아요.
   저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 메모리에만 두고 안내 문구를 바꿔 보여 줘요. */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {};
  var KEY_RECORDS = 'gd.v2.records', KEY_GAME = 'gd.v2.game', KEY_PREFS = 'gd.v2.prefs';
  var MAX_RECORDS = 500, memory = {}, persistent = true;

  function probe() {
    try { var k = '__gd_probe__'; root.localStorage.setItem(k, '1'); root.localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  }
  persistent = typeof root.localStorage !== 'undefined' && probe();

  function read(key, fallback) {
    if (persistent) {
      try { var raw = root.localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { /* 손상된 값은 무시 */ }
    }
    return key in memory ? memory[key] : fallback;
  }
  function write(key, value) {
    memory[key] = value;
    if (persistent) { try { root.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { persistent = false; } }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  GD.storage = {
    read: read, write: write, isPersistent: function () { return persistent; },
    notice: function () {
      return persistent
        ? '기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 다른 기기를 쓰면 사라질 수 있어요. 필요하면 CSV로 내려받아 보관하세요.'
        : '이 브라우저에서는 기록을 저장할 수 없어요. 지금 화면을 닫기 전까지만 유지되니, 필요하면 CSV로 내려받으세요.';
    },
    prefs: function () { return read(KEY_PREFS, { nickname: '익명' }); },
    setPrefs: function (p) { write(KEY_PREFS, Object.assign(read(KEY_PREFS, { nickname: '익명' }), p)); },
    game: function () { return read(KEY_GAME, null); },
    setGame: function (g) { write(KEY_GAME, g); },
    clearGame: function () { write(KEY_GAME, null); }
  };

  function all() { var r = read(KEY_RECORDS, []); return Array.isArray(r) ? r : []; }
  function matches(rec, f) {
    f = f || {};
    return (!f.mode || rec.mode === f.mode) && (!f.functionId || rec.functionId === f.functionId);
  }

  GD.records = {
    add: function (rec) {
      var full = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, rec);
      var list = all(); list.push(full);
      if (list.length > MAX_RECORDS) list.splice(0, list.length - MAX_RECORDS);
      write(KEY_RECORDS, list); return full;
    },
    list: function (filter) { return all().filter(function (r) { return matches(r, filter); }); },
    get: function (id) { return all().filter(function (r) { return r.id === id; })[0] || null; },
    count: function (filter) { return this.list(filter).length; },
    clear: function (filter) {
      var keep = all().filter(function (r) { return !matches(r, filter || {}); });
      write(KEY_RECORDS, keep);
    },
    max: MAX_RECORDS
  };
})(typeof window !== 'undefined' ? window : globalThis);
