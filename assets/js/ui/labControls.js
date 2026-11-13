/* 연구자모드·실험도전모드가 함께 쓰는 실험 설정 폼.
   함수마다 달라지는 값(시작 위치 범위, 학습률 범위, 반복 횟수 범위)은 함수 목록의 설정 데이터에서 읽어요. */
(function (root) {
  'use strict';
  var GD = root.GD, U = GD.ui, esc = U.esc;

  GD.ui.createControls = function (host, opt) {
    var id = opt.prefix || 'c', fn = opt.fn, vals = {}, handlers = { run: opt.onRun || function () {}, change: opt.onChange || function () {}, functionChange: opt.onFunctionChange || function () {} };

    function fnOptions() {
      return (opt.functions || GD.functions.list).map(function (f) { return '<option value="' + f.id + '"' + (f.id === fn.id ? ' selected' : '') + '>' + f.id + ' · ' + esc(f.name) + '</option>'; }).join('');
    }
    function build() {
      var a = fn.alpha, it = opt.iterations || fn.iterations, st = fn.start;
      host.innerHTML =
        (opt.showFunction ? '<div class="c-field"><label for="' + id + 'Fn">함수</label><select class="c-select" id="' + id + 'Fn">' + fnOptions() + '</select><span class="c-hint" id="' + id + 'FnExpr">' + esc(fn.expr) + ' · ' + esc(fn.dexpr) + '</span></div>' : '') +
        '<div class="c-field"><label for="' + id + 'Start">시작 위치 x</label>' +
          '<input class="c-input" type="number" id="' + id + 'Start" inputmode="decimal" step="any" min="' + st.min + '" max="' + st.max + '" value="' + st.default + '" aria-describedby="' + id + 'StartHint">' +
          '<div class="c-chips" role="group" aria-label="시작 위치 바로 고르기">' + st.options.map(function (o) { return '<button type="button" class="c-chip" data-start="' + o + '" aria-pressed="false">' + String(o).replace('-', '\u2212') + '</button>'; }).join('') + '</div>' +
          '<span class="c-hint" id="' + id + 'StartHint">' + st.min + ' 이상 ' + st.max + ' 이하로 입력해요.</span></div>' +
        '<div class="c-field"><label for="' + id + 'Alpha">학습률 α</label><div class="c-range-row"><input class="c-range" type="range" id="' + id + 'AlphaR" aria-label="학습률 슬라이더" min="' + a.min + '" max="' + a.max + '" step="' + a.step + '" value="' + a.default + '">' +
          '<input class="c-num" type="number" id="' + id + 'Alpha" inputmode="decimal" min="' + a.min + '" max="' + a.max + '" step="' + a.step + '" value="' + a.default + '" aria-describedby="' + id + 'AlphaHint"></div>' +
          '<span class="c-hint" id="' + id + 'AlphaHint">' + a.min + ' ~ ' + a.max + ' 사이, ' + a.step + ' 단위로 고를 수 있어요.</span></div>' +
        '<div class="c-field"><label for="' + id + 'Iter">최대 반복 횟수</label><div class="c-range-row"><input class="c-range" type="range" id="' + id + 'IterR" aria-label="반복 횟수 슬라이더" min="' + it.min + '" max="' + it.max + '" step="1" value="' + it.default + '">' +
          '<input class="c-num" type="number" id="' + id + 'Iter" inputmode="numeric" min="' + it.min + '" max="' + it.max + '" step="1" value="' + it.default + '" aria-describedby="' + id + 'IterHint"></div>' +
          '<span class="c-hint" id="' + id + 'IterHint">' + it.min + ' ~ ' + it.max + '회. 목표에 도착하면 일찍 끝나요.</span></div>' +
        '<button class="c-btn c-btn--primary c-btn--block" type="button" id="' + id + 'Run">' + U.icon('play', 18) + '실험 실행</button>';
      vals = { start: st.default, alpha: a.default, iter: it.default };
      wire(); syncChips();
    }
    function q(s) { return host.querySelector('#' + id + s); }
    function setHint(field, msg) {
      var h = q(field + 'Hint'), inp = q(field), base = h.dataset.base || (h.dataset.base = h.textContent);
      if (msg) { h.textContent = msg; h.setAttribute('role', 'alert'); h.style.color = 'var(--color-error)'; inp.setAttribute('aria-invalid', 'true'); }
      else { h.textContent = base; h.removeAttribute('role'); h.style.color = ''; inp.removeAttribute('aria-invalid'); }
    }
    function syncChips() { host.querySelectorAll('[data-start]').forEach(function (b) { b.setAttribute('aria-pressed', Number(b.dataset.start) === Number(q('Start').value) ? 'true' : 'false'); }); }
    function validate() {
      var st = fn.start, a = fn.alpha, it = opt.iterations || fn.iterations, ok = true;
      var sv = parseFloat(q('Start').value), av = parseFloat(q('Alpha').value), iv = parseFloat(q('Iter').value);
      if (!isFinite(sv) || sv < st.min || sv > st.max) { setHint('Start', st.min + ' 이상 ' + st.max + ' 이하의 숫자를 입력해 주세요.'); ok = false; } else setHint('Start', '');
      if (!isFinite(av) || av < a.min - 1e-9 || av > a.max + 1e-9) { setHint('Alpha', a.min + ' ~ ' + a.max + ' 사이의 숫자를 입력해 주세요.'); ok = false; } else setHint('Alpha', '');
      if (!isFinite(iv) || iv < it.min || iv > it.max || Math.floor(iv) !== iv) { setHint('Iter', it.min + ' ~ ' + it.max + ' 사이의 정수를 입력해 주세요.'); ok = false; } else setHint('Iter', '');
      return { valid: ok, start: sv, alpha: isFinite(av) ? U.snap(av, a.step) : av, maxIter: iv };
    }
    function wire() {
      var fnSel = q('Fn'); if (fnSel) fnSel.addEventListener('change', function () { handlers.functionChange(fnSel.value); });
      q('AlphaR').addEventListener('input', function () { q('Alpha').value = U.snap(q('AlphaR').value, fn.alpha.step); validate(); handlers.change(); });
      q('Alpha').addEventListener('input', function () { var v = parseFloat(q('Alpha').value); if (isFinite(v)) q('AlphaR').value = U.clamp(v, fn.alpha.min, fn.alpha.max); validate(); handlers.change(); });
      q('IterR').addEventListener('input', function () { q('Iter').value = q('IterR').value; validate(); handlers.change(); });
      q('Iter').addEventListener('input', function () { var v = parseFloat(q('Iter').value); if (isFinite(v)) q('IterR').value = U.clamp(v, fn.iterations.min, fn.iterations.max); validate(); handlers.change(); });
      q('Start').addEventListener('input', function () { validate(); syncChips(); handlers.change(); });
      host.querySelectorAll('[data-start]').forEach(function (b) { b.addEventListener('click', function () { q('Start').value = b.dataset.start; validate(); syncChips(); handlers.change(); }); });
      q('Run').addEventListener('click', function () { var v = validate(); if (!v.valid) { var bad = host.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; } handlers.run(v); });
    }
    build();
    return {
      el: host,
      values: validate,
      setFunction: function (f) { fn = f; build(); },
      setValues: function (v) { if (v.start != null) q('Start').value = v.start; if (v.alpha != null) { q('Alpha').value = v.alpha; q('AlphaR').value = v.alpha; } if (v.maxIter != null) { q('Iter').value = v.maxIter; q('IterR').value = v.maxIter; } syncChips(); validate(); },
      setBusy: function (b) { q('Run').disabled = !!b; },
      focusRun: function () { q('Run').focus(); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
