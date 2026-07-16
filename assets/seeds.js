/* ============================================================================
   Seed trail — as the cursor travels the page, tiny plants sprout in its
   wake, sway for a moment, and fade back into the paper. At night they grow
   as softly glowing teal shoots instead. Desktop / fine pointers only.
   ========================================================================== */
(function () {
  'use strict';
  if (!matchMedia('(pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cv = document.createElement('canvas');
  cv.id = 'seeds';
  cv.style.cssText =
    'position:fixed;inset:0;z-index:-1;pointer-events:none;';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');

  let W = 0, H = 0;
  const DPR = Math.min(devicePixelRatio || 1, 2);
  function resize() {
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  const night = () => document.documentElement.getAttribute('data-shift') === 'night';

  const sprouts = [];
  let lastX = null, lastY = null, travelled = 0, lastSpawn = 0;

  addEventListener('mousemove', e => {
    if (lastX !== null) travelled += Math.hypot(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
    const now = performance.now();
    if (travelled > 130 && now - lastSpawn > 140 && sprouts.length < 36) {
      travelled = 0; lastSpawn = now;
      sprouts.push({
        x: e.clientX + (Math.random() - 0.5) * 24,
        y: e.clientY + 10 + Math.random() * 14,
        born: now,
        dur: 2600 + Math.random() * 1400,
        ph: Math.random() * 6.28,
        s: 0.7 + Math.random() * 0.7,
        lean: (Math.random() - 0.5) * 0.6
      });
      start();
    }
  }, { passive: true });

  function drawSprout(sp, now) {
    const age = now - sp.born;
    if (age > sp.dur) return false;
    const grow = Math.min(1, age / 420);
    const ease = 1 - Math.pow(1 - grow, 3);
    const fade = Math.min(1, (sp.dur - age) / 700);
    const sway = Math.sin(now / 500 + sp.ph) * 2 * ease;
    const h = 16 * sp.s * ease;
    const a = 0.5 * fade;
    const col = night() ? 'rgba(63,214,196,' : 'rgba(63,163,77,';

    ctx.save();
    ctx.translate(sp.x, sp.y);
    if (night()) { ctx.shadowColor = 'rgba(63,214,196,0.8)'; ctx.shadowBlur = 5; }
    ctx.strokeStyle = col + a + ')';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    // stem
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(sp.lean * 6 + sway * 0.4, -h * 0.6, sp.lean * 10 + sway, -h);
    ctx.stroke();
    // two leaves
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sp.lean * 5 + sway * 0.3, -h * 0.55);
      ctx.quadraticCurveTo(
        side * 7 * sp.s * ease + sway * 0.3, -h * 0.55 - 3,
        side * 10 * sp.s * ease + sway * 0.4, -h * 0.45);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  let running = false, rafId = 0;
  function frame() {
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);
    for (let i = sprouts.length - 1; i >= 0; i--) {
      if (!drawSprout(sprouts[i], now)) sprouts.splice(i, 1);
    }
    if (sprouts.length) rafId = requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }
  addEventListener('pagehide', () => cancelAnimationFrame(rafId));
})();
