/* 게임모드 특수효과(토스트·폭죽·번개·폭발·거북이·지그재그·핑퐁): 이전 버전의 코드를 그대로 가져왔어요. */

function gdToast(doc, text, kind) {
  try {
    if (!doc) return;
    if (!doc.getElementById('gd-toast-style')) {
      const st = doc.createElement('style'); st.id = 'gd-toast-style';
      st.textContent = '#gd-toast{position:fixed;top:18px;left:18px;z-index:2147483647;display:flex;align-items:center;gap:12px;max-width:min(440px,calc(100vw - 36px));box-sizing:border-box;padding:12px 10px 12px 14px;background:#fff;color:#142B4A;border:1px solid #CFE0EE;border-left:5px solid #38D5E8;border-radius:14px;box-shadow:0 10px 30px rgba(20,43,74,.18);font:600 15px/1.45 "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;opacity:0;transform:translateY(-8px);transition:opacity .2s ease,transform .2s ease}'
        + '#gd-toast.show{opacity:1;transform:none}'
        + '#gd-toast .gd-toast-ic{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#E4F8FC;color:#0B7A8F}'
        + '#gd-toast .gd-toast-x{flex:none;width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:#586A82;cursor:pointer;display:grid;place-items:center}'
        + '#gd-toast .gd-toast-x:hover{background:#EEF4FA}'
        + '@media (prefers-reduced-motion:reduce){#gd-toast{transition:none}}';
      doc.head.appendChild(st);
    }
    const old = doc.getElementById('gd-toast'); if (old) old.remove();
    const svg = function (p) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
    const ic = kind === 'gift'
      ? svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>')
      : svg('<path d="M20 6 9 17l-5-5"/>');
    const t = doc.createElement('div');
    t.id = 'gd-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    t.innerHTML = '<span class="gd-toast-ic">' + ic + '</span><span class="gd-toast-msg"></span><button type="button" class="gd-toast-x" aria-label="알림 닫기">' + svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>') + '</button>';
    t.querySelector('.gd-toast-msg').textContent = text;
    const closeButton = t.querySelector('.gd-toast-x');
    const dismissToast = function (ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); }
      if (t.isConnected) t.remove();
    };
    // Pointerdown handles touch and mouse immediately; click remains as a fallback.
    closeButton.addEventListener('pointerdown', dismissToast, true);
    closeButton.addEventListener('click', dismissToast, true);
    closeButton.onclick = dismissToast;
    doc.body.appendChild(t);
    requestAnimationFrame(function () { if (t.isConnected) t.classList.add('show'); });
    setTimeout(function () { if (t.isConnected) { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 240); } }, 7600);
  } catch (e) {}
}


function gdFireworks(win, opts) {
  try {
    opts = opts || {};
    if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const doc = win.document;
    const old = doc.getElementById('gd-fireworks'); if (old) old.remove();
    const root = doc.createElement('div');
    root.id = 'gd-fireworks'; root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483100;pointer-events:none;overflow:hidden;background:transparent';
    const canvas = doc.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    root.appendChild(canvas);
    if (opts.label) {
      const l = doc.createElement('div');
      l.textContent = opts.label;
      l.style.cssText = 'position:absolute;left:50%;bottom:11%;transform:translateX(-50%);padding:10px 22px;border-radius:999px;background:rgba(255,255,255,.96);color:#142B4A;border:2px solid #38D5E8;box-shadow:0 10px 30px rgba(20,43,74,.22);font:800 clamp(16px,2.6vw,24px)/1.3 "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;white-space:nowrap;max-width:92vw';
      root.appendChild(l);
    }
    doc.body.appendChild(root);
    const ctx = canvas.getContext('2d');
    const dpr = win.devicePixelRatio || 1;
    const big = !!opts.big, mini = !!opts.mini;
    // 기존보다 짧게 재생: 큰 폭죽 150프레임, 미니 65프레임
    const maxFrames = opts.frames || (mini ? 65 : big ? 150 : 100);
    let w = 0, h = 0, frame = 0;
    function resize() {
      w = win.innerWidth; h = win.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const colors = opts.colors || ['#38D5E8', '#1769AA', '#F4B400', '#FF7DA8', '#6FD3A0', '#9B8CFF', '#FF8A5C'];
    const rockets = [], sparks = [];
    function launch() {
      if (opts.center) {
        const ang = Math.random() * Math.PI * 2, rad = Math.min(w, h) * (.18 + Math.random() * .30);
        rockets.push({ x: w / 2, y: h * .46, tx: w / 2 + Math.cos(ang) * rad * 1.5, ty: h * .46 + Math.sin(ang) * rad, color: colors[Math.floor(Math.random() * colors.length)] });
        return;
      }
      const side = Math.random() < .58;
      rockets.push({
        x: side ? (Math.random() < .5 ? -8 : w + 8) : w * Math.random(),
        y: side ? h * (.55 + Math.random() * .35) : h + 8,
        tx: w * (.08 + Math.random() * .84), ty: h * (.10 + Math.random() * .50),
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    function burst(r) {
      // 폭죽 하나당 입자 수도 줄임
      const n = mini ? 18 + Math.floor(Math.random() * 8) : (big ? 42 : 32) + Math.floor(Math.random() * 18);
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 2 * i / n, s = 1.2 + Math.random() * (mini ? 2.6 : big ? 3.8 : 3.2);
        sparks.push({
          x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 34 + Math.random() * 34, color: r.color,
          size: (mini ? 1.1 : big ? 1.6 : 1.3) + Math.random() * (mini ? 1.2 : big ? 2.0 : 1.7)
        });
      }
    }
    function draw() {
      if (!root.isConnected) return;
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = mini ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.20)'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over';
      // 발사 빈도를 낮춰 화면을 가득 채우지 않음
      if (big) { if (frame % 8 === 0) launch(); }
      else if (mini) { if (frame % 30 === 0) launch(); }
      else if (frame % 22 === 0) { launch(); }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i], dx = r.tx - r.x, dy = r.ty - r.y;
        if (Math.hypot(dx, dy) < 10) { burst(r); rockets.splice(i, 1); continue; }
        r.x += dx * .075; r.y += dy * .075;
        ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx; p.y += p.vy; p.vy += .034; p.vx *= .992; p.life--;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life / 17); ctx.fillStyle = p.color;
        // 강한 번짐 대신 작은 glow만 적용
        if (big) { ctx.shadowColor = p.color; ctx.shadowBlur = 4; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1; frame++;
      if (frame < maxFrames) win.requestAnimationFrame(draw);
      else { if (root.isConnected) root.remove(); win.removeEventListener('resize', resize); }
    }
    win.addEventListener('resize', resize);
    // 시작할 때 화면 전체에 동시에 많이 발사하지 않음
    for (let i = 0; i < (mini ? 1 : big ? 4 : 2); i++) launch();
    win.requestAnimationFrame(draw);
    win.setTimeout(function () { if (root.isConnected) root.remove(); win.removeEventListener('resize', resize); }, Math.round(maxFrames / 60 * 1000) + 1200);
  } catch (e) {}
}


function gdFailureEffect(win, mode) {
  try {
    const doc = win.document;
    const lingeringFireworks = doc.getElementById('gd-fireworks');
    if (lingeringFireworks) lingeringFireworks.remove();
    if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const isExplode = mode === 'explode';
    const styleId = 'gd-failure-effect-style';
    if (!doc.getElementById(styleId)) {
      const style = doc.createElement('style'); style.id = styleId;
      style.textContent = '@keyframes gdScreenShake{0%,100%{transform:translate3d(0,0,0)}20%{transform:translate3d(-5px,2px,0)}40%{transform:translate3d(4px,-2px,0)}60%{transform:translate3d(-3px,1px,0)}80%{transform:translate3d(3px,0,0)}}'
        + '@keyframes gdHardShake{0%,100%{transform:translate3d(0,0,0)}12%{transform:translate3d(-10px,4px,0) rotate(-.15deg)}25%{transform:translate3d(9px,-4px,0) rotate(.15deg)}38%{transform:translate3d(-8px,3px,0)}51%{transform:translate3d(8px,-3px,0)}64%{transform:translate3d(-5px,2px,0)}78%{transform:translate3d(4px,-2px,0)}}'
        + '.gd-screen-shaking{animation:gdScreenShake .075s ease-in-out 0s 6!important}.gd-screen-shaking-hard{animation:gdHardShake .06s ease-in-out 0s 9!important}'
        + '@keyframes gdFlashFlight{0%{opacity:0;transform:translate3d(0,0,0) rotate(var(--angle,-18deg)) scaleX(.15)}10%{opacity:1}48%{opacity:.9}100%{opacity:0;transform:translate3d(var(--dx,35vw),var(--dy,-20vh),0) rotate(var(--angle,-18deg)) scaleX(1.3)}}'
        + '.gd-flash-layer{position:fixed;inset:0;z-index:2147483100;overflow:hidden;pointer-events:none}'
        + '.gd-flash-streak{position:absolute;width:clamp(130px,24vw,340px);height:4px;border-radius:999px;opacity:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),#fff,rgba(255,190,130,.98),transparent);box-shadow:0 0 7px rgba(255,255,255,.95),0 0 18px rgba(255,90,50,.9),0 0 34px rgba(255,36,25,.5);transform-origin:center;animation:gdFlashFlight .68s cubic-bezier(.2,.8,.2,1) var(--delay,0s) both}'
        + '.gd-explode-streak{height:5px;background:linear-gradient(90deg,transparent,#FFF4BF,#fff,rgba(255,55,34,1),transparent);box-shadow:0 0 10px #fff,0 0 23px rgba(255,65,38,1),0 0 42px rgba(255,20,12,.75);animation-duration:.58s!important}'
        + '.gd-flash-streak:after{content:"";position:absolute;left:20%;top:-5px;width:55%;height:13px;border-radius:999px;background:rgba(255,255,255,.86);filter:blur(6px)}'
        + '@keyframes gdImpactFlash{0%,100%{opacity:0}7%{opacity:.8}15%{opacity:.08}25%{opacity:.62}34%{opacity:.06}43%{opacity:.25}58%{opacity:0}}'
        + '@keyframes gdShockRing{0%{transform:translate(-50%,-50%) scale(.08);opacity:.95;border-width:9px}65%{opacity:.6}100%{transform:translate(-50%,-50%) scale(2.7);opacity:0;border-width:1px}}'
        + '@keyframes gdDebris{0%{opacity:0;transform:translate(0,0) rotate(0) scale(.35)}12%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--rot)) scale(.08)}}'
        + '.gd-explosion-impact{position:fixed;inset:0;z-index:2147483101;overflow:hidden;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(circle at 50% 46%,rgba(255,250,220,.4),rgba(255,75,24,.18) 24%,transparent 67%);animation:gdImpactFlash .82s steps(1,end) 1 both}'
        + '.gd-shock-ring{position:absolute;left:50%;top:46%;width:min(48vw,520px);aspect-ratio:1;border:5px solid rgba(255,228,158,.95);border-radius:50%;box-shadow:0 0 22px rgba(255,110,30,.95),inset 0 0 18px rgba(255,70,22,.65);animation:gdShockRing .95s cubic-bezier(.1,.65,.2,1) var(--delay,0s) both}'
        + '.gd-debris{position:absolute;left:50%;top:46%;width:clamp(5px,.7vw,10px);height:clamp(14px,1.6vw,24px);border-radius:2px;background:linear-gradient(#fff6bf,#ff3f25);box-shadow:0 0 12px rgba(255,85,22,.95);animation:gdDebris .9s cubic-bezier(.1,.7,.2,1) var(--delay,0s) both}'
        + '@media(prefers-reduced-motion:reduce){.gd-screen-shaking,.gd-screen-shaking-hard,.gd-flash-streak,.gd-explosion-impact,.gd-shock-ring,.gd-debris{animation:none!important}.gd-flash-layer,.gd-explosion-impact{display:none!important}}';
      doc.head.appendChild(style);
    }
    const stage = doc.querySelector('.game-view') || doc.body;
    stage.classList.remove('gd-screen-shaking', 'gd-screen-shaking-hard');
    void stage.offsetWidth;
    stage.classList.add(isExplode ? 'gd-screen-shaking-hard' : 'gd-screen-shaking');
    win.setTimeout(function () { stage.classList.remove('gd-screen-shaking', 'gd-screen-shaking-hard'); }, isExplode ? 1100 : 650);

    ['gd-failure-flashes', 'gd-explosion-impact'].forEach(function (id) { const old = doc.getElementById(id); if (old) old.remove(); });
    const layer = doc.createElement('div'); layer.id = 'gd-failure-flashes'; layer.className = 'gd-flash-layer';
    layer.setAttribute('aria-hidden', 'true');
    const count = isExplode ? 26 : 12;
    for (let i = 0; i < count; i++) {
      const streak = doc.createElement('span');
      streak.className = 'gd-flash-streak' + (isExplode ? ' gd-explode-streak' : '');
      streak.style.left = (-12 + Math.random() * 105) + 'vw';
      streak.style.top = (5 + Math.random() * 90) + 'vh';
      streak.style.setProperty('--dx', (-24 + Math.random() * 48) + 'vw');
      streak.style.setProperty('--dy', (-34 + Math.random() * 68) + 'vh');
      streak.style.setProperty('--angle', (-48 + Math.random() * 96) + 'deg');
      streak.style.setProperty('--delay', (i * (isExplode ? .024 : .055)) + 's');
      layer.appendChild(streak);
    }
    doc.body.appendChild(layer);
    if (isExplode) {
      const impact = doc.createElement('div'); impact.id = 'gd-explosion-impact'; impact.className = 'gd-explosion-impact'; impact.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) { const ring = doc.createElement('span'); ring.className = 'gd-shock-ring'; ring.style.setProperty('--delay', (i * .11) + 's'); impact.appendChild(ring); }
      for (let i = 0; i < 32; i++) { const debris = doc.createElement('span'); debris.className = 'gd-debris'; const angle = (Math.PI * 2 * i / 32) + (Math.random() - .5) * .18; const distance = 22 + Math.random() * 42; debris.style.setProperty('--dx', (Math.cos(angle) * distance) + 'vw'); debris.style.setProperty('--dy', (Math.sin(angle) * distance) + 'vh'); debris.style.setProperty('--rot', (Math.random() * 800 - 400) + 'deg'); debris.style.setProperty('--delay', (Math.random() * .14) + 's'); impact.appendChild(debris); }
      doc.body.appendChild(impact);
      win.setTimeout(function () { if (impact.isConnected) impact.remove(); }, 1900);
    }
    win.setTimeout(function () { if (layer.isConnected) layer.remove(); }, isExplode ? 1900 : 1500);
  } catch (e) {}
}
function gdZigzagEffect(win) {
  try {
    const doc = win.document;
    const old = doc.getElementById('gd-zigzag-effect'); if (old) old.remove();
    const oldFlash = doc.getElementById('gd-electric-flash'); if (oldFlash) oldFlash.remove();
    if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const styleId = 'gd-zigzag-effect-style';
    if (!doc.getElementById(styleId)) {
      const style = doc.createElement('style'); style.id = styleId;
      style.textContent = '@keyframes gdBoltReveal{0%{opacity:0;transform:scale(.72) rotate(var(--rot,0deg))}10%{opacity:1}24%{opacity:.45}32%{opacity:1}48%{opacity:.9}100%{opacity:0;transform:scale(1.12) rotate(var(--rot,0deg))}}'
        + '@keyframes gdBoltDraw{to{stroke-dashoffset:0}}'
        + '@keyframes gdElectricPulse{0%,100%{opacity:0}10%{opacity:.28}18%{opacity:.03}27%{opacity:.24}35%{opacity:.02}50%{opacity:.10}65%{opacity:0}}'
        + '.gd-zigzag-layer{position:fixed;inset:0;z-index:2147483100;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse at 50% 42%,rgba(25,92,255,.13),rgba(8,12,42,.08) 55%,transparent 80%)}'
        + '.gd-zigzag-bolt{position:absolute;width:clamp(62px,9vw,116px);height:clamp(132px,28vh,250px);animation:gdBoltReveal 1.42s steps(1,end) var(--delay,0s) both;filter:drop-shadow(0 0 4px #fff) drop-shadow(0 0 10px rgba(62,160,255,.98)) drop-shadow(0 0 24px rgba(42,75,255,.75))}'
        + '.gd-zigzag-bolt .gd-bolt-main{fill:rgba(93,174,255,.22);stroke:#E8FAFF;stroke-width:3.2;stroke-linejoin:bevel;stroke-dasharray:1;stroke-dashoffset:1;animation:gdBoltDraw .35s ease-out var(--delay,0s) forwards}'
        + '.gd-zigzag-bolt .gd-bolt-branch{fill:none;stroke:#79F5FF;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:bevel;stroke-dasharray:1;stroke-dashoffset:1;animation:gdBoltDraw .3s ease-out var(--delay,0s) forwards}'
        + '.gd-electric-flash{position:fixed;inset:0;z-index:2147483099;pointer-events:none;background:linear-gradient(118deg,rgba(92,210,255,.22),rgba(74,65,255,.12),rgba(255,255,255,.06));mix-blend-mode:screen;animation:gdElectricPulse .78s steps(1,end) 1 both}'
        + '@media(prefers-reduced-motion:reduce){.gd-zigzag-layer,.gd-electric-flash{display:none!important}.gd-zigzag-bolt{animation:none!important}}';
      doc.head.appendChild(style);
    }
    const flash = doc.createElement('div'); flash.id = 'gd-electric-flash'; flash.className = 'gd-electric-flash'; flash.setAttribute('aria-hidden', 'true'); doc.body.appendChild(flash);
    const layer = doc.createElement('div'); layer.id = 'gd-zigzag-effect'; layer.className = 'gd-zigzag-layer'; layer.setAttribute('aria-hidden', 'true');
    const ns = 'http://www.w3.org/2000/svg';
    const mainPoints = 'M60 2 L36 47 L57 47 L23 96 L44 96 L12 151 L79 76 L54 76 L77 38 L55 38 Z';
    const branches = ['M36 47 L19 38 L9 49', 'M57 47 L76 58 L86 51', 'M44 96 L62 108 L69 99'];
    for (let i = 0; i < 9; i++) {
      const svg = doc.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 92 155'); svg.setAttribute('class', 'gd-zigzag-bolt');
      svg.style.left = (2 + i * 11.2 + Math.random() * 3) + 'vw';
      svg.style.top = (-4 + Math.random() * 62) + 'vh';
      svg.style.setProperty('--rot', (-23 + Math.random() * 46) + 'deg');
      svg.style.setProperty('--delay', (i * .075) + 's');
      const path = doc.createElementNS(ns, 'path'); path.setAttribute('d', mainPoints); path.setAttribute('pathLength', '1'); path.setAttribute('class', 'gd-bolt-main'); svg.appendChild(path);
      for (let b = 0; b < 2; b++) { const branch = doc.createElementNS(ns, 'path'); branch.setAttribute('d', branches[(i + b) % branches.length]); branch.setAttribute('pathLength', '1'); branch.setAttribute('class', 'gd-bolt-branch'); branch.style.animationDelay = (i * .075 + .08 + b * .04) + 's'; svg.appendChild(branch); }
      layer.appendChild(svg);
    }
    doc.body.appendChild(layer);
    win.setTimeout(function () { if (layer.isConnected) layer.remove(); if (flash.isConnected) flash.remove(); }, 2200);
  } catch (e) {}
}
function gdPingPongEffect(win) {
  try {
    const doc = win.document;
    const old = doc.getElementById('gd-pingpong-effect'); if (old) old.remove();
    if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const styleId = 'gd-pingpong-effect-style';
    if (!doc.getElementById(styleId)) {
      const style = doc.createElement('style'); style.id = styleId;
      style.textContent = '@keyframes gdBounceAcross{0%,100%{transform:translateX(-39vw);opacity:.25}8%,92%{opacity:1}50%{transform:translateX(39vw);opacity:1}}'
        + '.gd-pingpong-layer{position:fixed;inset:0;z-index:2147483100;overflow:hidden;pointer-events:none}'
        + '.gd-pingpong-track{position:absolute;left:0;top:49%;width:100vw;height:2px;background:linear-gradient(90deg,transparent,rgba(174,143,255,.4),rgba(105,215,255,.65),rgba(174,143,255,.4),transparent);box-shadow:0 0 18px rgba(147,119,255,.35)}'
        + '.gd-pingpong-runner{position:absolute;left:50%;top:-8px;width:17px;height:17px;margin-left:-8px;border-radius:50%;background:#fff;border:2px solid #BBA8FF;box-shadow:0 0 12px 4px rgba(153,126,255,.8),0 0 28px rgba(89,199,255,.55);animation:gdBounceAcross 1.05s cubic-bezier(.45,0,.55,1) var(--delay,0s) 2 both}'
        + '@media(prefers-reduced-motion:reduce){.gd-pingpong-layer{display:none!important}}';
      doc.head.appendChild(style);
    }
    const layer = doc.createElement('div'); layer.id = 'gd-pingpong-effect'; layer.className = 'gd-pingpong-layer';
    layer.setAttribute('aria-hidden', 'true');
    const track = doc.createElement('div'); track.className = 'gd-pingpong-track'; layer.appendChild(track);
    for (let i = 0; i < 3; i++) {
      const runner = doc.createElement('span'); runner.className = 'gd-pingpong-runner';
      runner.style.setProperty('--delay', (i * .16) + 's');
      runner.style.top = (-8 + i * 5) + 'px'; runner.style.opacity = String(1 - i * .15);
      track.appendChild(runner);
    }
    doc.body.appendChild(layer);
    win.setTimeout(function () { if (layer.isConnected) layer.remove(); }, 2450);
  } catch (e) {}
}

function gdTurtleEffect(win) {
  try {
    const doc = win.document;
    const old = doc.getElementById('gd-turtle-effect'); if (old) old.remove();
    if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const styleId = 'gd-turtle-effect-style';
    if (!doc.getElementById(styleId)) {
      const style = doc.createElement('style'); style.id = styleId;
      style.textContent = '@keyframes gdTurtleRing{0%{transform:translate(-50%,-50%) scale(.25);opacity:.65}100%{transform:translate(-50%,-50%) scale(1.7);opacity:0}}'
        + '@keyframes gdTurtleFloat{0%{transform:translate3d(0,18px,0) scale(.7) rotate(-12deg);opacity:0}18%{opacity:.75}100%{transform:translate3d(var(--dx,20vw),var(--dy,-18vh),0) scale(1.05) rotate(18deg);opacity:0}}'
        + '@keyframes gdTurtleCrawl{0%{transform:translate3d(0,0,0) rotate(-7deg) scale(.9)}8%{transform:translate3d(4vw,-5px,0) rotate(5deg) scale(1)}18%{transform:translate3d(10vw,2px,0) rotate(-6deg)}28%{transform:translate3d(18vw,-5px,0) rotate(6deg)}38%{transform:translate3d(27vw,2px,0) rotate(-5deg)}48%{transform:translate3d(38vw,-5px,0) rotate(5deg)}58%{transform:translate3d(50vw,2px,0) rotate(-5deg)}70%{transform:translate3d(65vw,-4px,0) rotate(5deg)}84%{transform:translate3d(84vw,2px,0) rotate(-3deg)}100%{transform:translate3d(calc(100vw + 22vw),-3px,0) rotate(4deg) scale(1)}}'
        + '@keyframes gdTurtleLegs{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}'
        + '.gd-turtle-extra{position:fixed;inset:0;z-index:2147483100;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,rgba(72,190,135,.19),transparent 50%)}'
        + '.gd-turtle-ring{position:absolute;left:50%;top:52%;width:min(64vw,500px);aspect-ratio:1;border:2px solid rgba(80,190,140,.43);border-radius:50%;box-shadow:0 0 24px rgba(80,208,150,.14);animation:gdTurtleRing 1.3s ease-out var(--delay,0s) both}'
        + '.gd-turtle-float{position:absolute;font-size:clamp(18px,2.8vw,30px);filter:drop-shadow(0 4px 9px rgba(31,122,77,.16));animation:gdTurtleFloat 1.8s ease-out var(--delay,0s) both}'
        + '.gd-turtle-crawler{position:absolute;left:-16vw;top:calc(50% - 42px);bottom:auto;font-size:clamp(54px,8vw,92px);line-height:1;white-space:nowrap;filter:drop-shadow(0 9px 12px rgba(20,74,52,.34));transform-origin:55% 80%;animation:gdTurtleCrawl 2.6s cubic-bezier(.35,.08,.2,1) .08s both}'
        + '.gd-turtle-crawler:after{content:"";position:absolute;left:6%;right:6%;bottom:-8px;height:9px;border-radius:50%;background:rgba(31,122,77,.17);filter:blur(4px);z-index:-1}'
        + '@media(prefers-reduced-motion:reduce){.gd-turtle-extra{display:none!important}}';
      doc.head.appendChild(style);
    }
    const layer = doc.createElement('div'); layer.id = 'gd-turtle-effect'; layer.className = 'gd-turtle-extra';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) {
      const ring = doc.createElement('span'); ring.className = 'gd-turtle-ring';
      ring.style.setProperty('--delay', (i * .24) + 's'); layer.appendChild(ring);
    }
    // 메인 거북이는 화면 한쪽에서 반대편으로 느릿느릿 기어옵니다.
    const crawler = doc.createElement('span'); crawler.className = 'gd-turtle-crawler'; crawler.textContent = '🐢';
    layer.appendChild(crawler);
    const symbols = ['🍃', '✦', '◦', '🌿', '·', '🍃'];
    for (let i = 0; i < 6; i++) {
      const leaf = doc.createElement('span'); leaf.className = 'gd-turtle-float';
      leaf.textContent = symbols[i % symbols.length];
      leaf.style.left = (10 + Math.random() * 78) + 'vw';
      leaf.style.top = (13 + Math.random() * 65) + 'vh';
      leaf.style.setProperty('--dx', (-13 + Math.random() * 26) + 'vw');
      leaf.style.setProperty('--dy', (-10 + Math.random() * 20) + 'vh');
      leaf.style.setProperty('--delay', (i * .08) + 's');
      layer.appendChild(leaf);
    }
    doc.body.appendChild(layer);
    win.setTimeout(function () { if (layer.isConnected) layer.remove(); }, 4300);
  } catch (e) {}
}

