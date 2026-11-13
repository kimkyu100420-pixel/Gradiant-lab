// node tests/core.test.js  — 계산 엔진·함수 목록·분석기 검증
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.window = undefined;
for (const f of ['functionRegistry.js', 'gradientDescent.js', 'resultAnalyzer.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../assets/js/core', f), 'utf8'), { filename: f });
}
const GD = globalThis.GD; let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('1) 도함수(수치 미분 대조)');
GD.functions.verifyDerivatives().forEach(r => { ok(r.ok, `${r.id} 도함수 오차 ${r.derivativeError.toExponential(2)} / ${r.secondDerivativeError.toExponential(2)}`); });

console.log('2) 기존 게임(원본 파이썬 로직)과 F01 결과 동일성');
function original(x0, alpha, epochs) { // app_10b431.py run_gradient_descent 를 그대로 옮김
  let x = x0; const xs = [x]; let overflow = false, steps = 0; const T = 1e-5, CLIP = 1e5;
  if (Math.abs(x) < T) return { xs, overflow, steps };
  for (let i = 0; i < epochs; i++) {
    let nx = x - alpha * (2 * x);
    if (!isFinite(nx) || Math.abs(nx) > CLIP) {
      overflow = true;
      const dir = isFinite(nx) ? (nx >= 0 ? 1 : -1) : ((x >= 0 ? 1 : -1) * (alpha > 1 ? -1 : 1));
      xs.push(dir * CLIP); steps++; break;
    }
    x = nx; xs.push(x); steps++;
    if (Math.abs(x) < T) break;
  }
  return { xs, overflow, steps };
}
let cmp = 0, bad = 0; const F01 = GD.functions.get('F01');
for (let a = 5; a <= 150; a += 5) for (let e = 1; e <= 10; e++) {
  const alpha = a / 100, o = original(8, alpha, e), r = GD.engine.run(F01, { start: 8, alpha, maxIter: e });
  cmp++; const same = o.xs.length === r.xs.length && o.xs.every((v, i) => v === r.xs[i]) && o.overflow === r.overflow && o.steps === r.iterations;
  if (!same) { bad++; if (bad < 4) console.log('  차이:', alpha, e, o.xs, r.xs); }
}
ok(bad === 0, `F01 결과가 원본과 다른 경우 ${bad}/${cmp}`); console.log(`   ${cmp}개 조건 비교, 불일치 ${bad}`);

console.log('3) 극값·목표 정의');
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;
const F04 = GD.functions.get('F04'), F05 = GD.functions.get('F05'), F06 = GD.functions.get('F06');
ok(F04.minima.length === 2 && near(F04.minima[0].x, -1) && near(F04.minima[1].x, 1), 'F04 최솟값 ±1');
ok(F04.maxima.length === 1 && near(F04.maxima[0].x, 0), 'F04 극댓값 0');
ok(F05.minima.length === 2 && F05.minima[0].kind === 'global' && F05.minima[1].kind === 'local', 'F05 전역/국소 구분');
ok(F05.minima[0].x < -1 && F05.minima[0].x > -1.05 && F05.minima[1].x > 0.95 && F05.minima[1].x < 1, `F05 최솟값 위치 ${F05.minima.map(m => m.x.toFixed(4))}`);
ok(F05.maxima.length === 1 && F05.maxima[0].x > 0.04 && F05.maxima[0].x < 0.06, 'F05 극댓값 ≈ 0.05');
ok(F06.minima.length === 1 && near(F06.minima[0].x, 0), 'F06 최솟값 0');
ok(F04.targetFor(2).x > 0 && F04.targetFor(-0.5).x < 0 && F04.targetFor(0) === null, 'F04 시작 위치별 목표');
ok(F05.targetFor(1.5).kind === 'local' && F05.targetFor(-0.5).kind === 'global', 'F05 시작 위치별 목표');
ok(!GD.functions.list.some(f => /x³/.test(f.expr)), '삼차함수 제외');
console.log('   F05 최솟값:', F05.minima.map(m => `${m.kind} x=${m.x.toFixed(4)} f=${m.f.toFixed(4)}`).join(' | '), '· 극댓값 x=' + F05.maxima[0].x.toFixed(4));

console.log('4) 결과 유형 판정');
const A = GD.analyzer, run = (id, start, alpha, maxIter) => { const fn = GD.functions.get(id), r = GD.engine.run(fn, { start, alpha, maxIter }); return { r, a: A.analyze(r, fn) }; };
const cases = [
  ['F01 α=0.5 한 번에 도달', run('F01', 8, 0.5, 5), 'one_step'],
  ['F01 α=0.3 5회 느린 접근', run('F01', 8, 0.3, 5), 'slow'],
  ['F01 α=0.8 진동 수렴', run('F01', 8, 0.8, 5), 'oscillating'],
  ['F01 α=0.8 10회(도달 못함)', run('F01', 8, 0.8, 10), 'oscillating'],
  ['F01 α=1.0 왕복', run('F01', 8, 1.0, 6), 'periodic'],
  ['F01 α=1.5 발산', run('F01', 8, 1.5, 10), 'growing'],
  ['F01 α=1.5 오버플로', run('F01', 8, 1.5, 10), null],
  ['F04 시작 0 → 극댓값 정지', run('F04', 0, 0.05, 20), 'stuck_max'],
  ['F04 시작 2 α=0.05 → 목표 도달', run('F04', 2, 0.05, 100), 'success'],
  ['F04 시작 2 α=0.1 → 반대편 골짜기', run('F04', 2, 0.1, 100), 'other_min'],
  ['F02 α=2 한 번에', run('F02', 8, 2, 5), 'one_step'],
  ['F03 α=0.125 한 번에', run('F03', 3, 0.125, 5), 'one_step'],
  ['F06 α=0.02 느린 수렴', run('F06', 2, 0.02, 80), 'slow'],
];
cases.forEach(([n, c, want]) => { if (want) ok(c.a.type === want, `${n}: 기대 ${want}, 실제 ${c.a.type}`); console.log(`   ${n.padEnd(28)} → ${c.a.type.padEnd(11)} (${c.a.label}, ${c.r.iterations}회, 종료: ${c.r.stopReason})`); });
const big = run('F01', 8, 1.5, 10); ok(big.r.overflow === false || big.r.overflow === true, '발산 처리'); console.log('   F01 α=1.5 10회 최종:', big.r.finalX, '오버플로', big.r.overflow);
const huge = run('F06', 2, 0.12, 150); console.log('   F06 α=0.12 →', huge.a.type, huge.r.stopReason, huge.r.iterations + '회', 'overflow', huge.r.overflow);
ok(huge.r.xs.every(Number.isFinite) && huge.r.losses.every(Number.isFinite), '발산 시에도 유한한 값만 기록');
console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`); process.exit(fail ? 1 : 0);
