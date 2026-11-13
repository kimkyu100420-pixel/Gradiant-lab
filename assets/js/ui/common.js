/* 모드 공통 UI 도우미: 이스케이프, 숫자 표기, SVG 아이콘, 알림 상자. */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {};

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtInt(n) { return Number(n).toLocaleString('ko-KR'); }
  function fmtNum(v) {
    v = Number(v); if (!isFinite(v)) return '∞'; if (v === 0) return '0';
    if (Math.abs(v) < 1e12 && Number.isInteger(v)) return fmtInt(v);
    if (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e6) return String(Number(v.toPrecision(6)));
    return v.toExponential(3).replace('e+', 'e');
  }
  var PATHS = {
    check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    ball: '<circle cx="12" cy="12" r="10"/><path d="m12 8 3.8 2.8-1.4 4.4H9.6l-1.4-4.4z"/><path d="M12 2v6M20.8 9l-5 1.8M17.5 20l-3.1-4.8M6.5 20l3.1-4.8M3.2 9l5 1.8"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
    flag: '<path d="M4 22V4"/><path d="M4 4h14l-3 4.5L18 13H4"/>',
    play: '<path d="M6 4v16l14-8z"/>', skip: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>', replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>', trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', flask: '<path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5l-5.1-10.1a2 2 0 0 1-.2-.9V2"/><path d="M8.5 2h7"/>'
  };
  function icon(name, size) {
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (PATHS[name] || '') + '</svg>';
  }
  var TONE_ICON = { ok: 'check', bad: 'alert', warn: 'activity', info: 'info' };
  function callout(tone, title, text) {
    return '<div class="c-callout is-' + tone + '" role="status">' + icon(TONE_ICON[tone] || 'info') + '<div><strong>' + esc(title) + '</strong>' + (text ? '<span>' + esc(text) + '</span>' : '') + '</div></div>';
  }
  function toast(text, kind) { if (typeof root.gdToast === 'function') { try { root.gdToast(document, text, kind || 'check'); return; } catch (e) {} } }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  /* 슬라이더 값 → 소수 자릿수에 맞춰 부동소수 오차 제거 */
  function snap(v, step) { var d = (String(step).split('.')[1] || '').length; return Number(Number(v).toFixed(d)); }
  function decimals(step) { return (String(step).split('.')[1] || '').length; }

  GD.ui = { esc: esc, fmtInt: fmtInt, fmtNum: fmtNum, icon: icon, callout: callout, toast: toast, $: $, $$: $$, clamp: clamp, snap: snap, decimals: decimals };
  GD.modes = GD.modes || {};
})(typeof window !== 'undefined' ? window : globalThis);
