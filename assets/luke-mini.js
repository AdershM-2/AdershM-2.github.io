/* ============================================================================
   Mini LUKE — the hero artefact. A tiny side-view field unit patrols a crop
   row; visitors tap the soil to plant weeds and LUKE drives over and removes
   them mechanically. Weeds removed: counted. Herbicide used: 0 mL, always.
   Plain canvas 2D, no libraries.
   ========================================================================== */
(function () {
  'use strict';

  const cv = document.getElementById('luke-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const scoreEl = document.getElementById('lm-score');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // logical size; canvas CSS-scales responsively, we render at DPR
  const W = 340, H = 250;
  const DPR = Math.min(devicePixelRatio || 1, 2);
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const SOIL_Y = 192;               // top edge of the soil
  const X_MIN = 28, X_MAX = 312;    // patrol bounds

  // palette (matches the site)
  const C = {
    soil: '#dcc79c', soilEdge: '#c9b184', body: '#ffffff', bodyEdge: '#c9d0dc',
    green: '#3fa34d', dark: '#2c3440', wheel: '#3a4250', rim: '#9aa3b2',
    crop: '#3fa34d', weed: '#d9422e', amber: '#e0a400', text: '#0b7d70'
  };

  // crops: fixed row (drawn behind LUKE), gentle sway
  const crops = [];
  for (let x = 40; x <= 305; x += 44) crops.push({ x, ph: Math.random() * 6.28 });

  // weeds
  const weeds = [];   // {x, grow(0..1), shake, dead}
  let removed = 0;

  // particles + floaters
  const parts = [];   // {x,y,vx,vy,life}
  const floats = [];  // {x,y,t}

  // LUKE state
  let lx = 120, dir = 1, mode = 'patrol', pullT = 0, target = null;
  let wheelA = 0, time = 0, spawnT = 2.5;

  function updateScore() {
    if (scoreEl) scoreEl.textContent =
      'WEEDS REMOVED: ' + removed + ' · HERBICIDE USED: 0 mL';
  }
  updateScore();

  function plantWeed(x) {
    if (weeds.length >= 5) return;
    x = Math.max(X_MIN + 6, Math.min(X_MAX - 6, x));
    // not right on top of LUKE
    if (Math.abs(x - lx) < 18) x += 24 * (x > lx ? 1 : -1);
    weeds.push({ x, grow: 0, shake: 0 });
  }

  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    plantWeed(x);
  });

  // ---------- drawing ----------
  function drawBackdrop() {
    // soft sun + cloud
    ctx.fillStyle = 'rgba(224,164,0,0.35)';
    ctx.beginPath(); ctx.arc(292, 40, 16, 0, 6.29); ctx.fill();
    ctx.fillStyle = 'rgba(26,35,48,0.06)';
    const cx2 = 70 + 14 * Math.sin(time * 0.12);
    ctx.beginPath();
    ctx.arc(cx2, 52, 10, 0, 6.29); ctx.arc(cx2 + 13, 48, 13, 0, 6.29); ctx.arc(cx2 + 27, 53, 9, 0, 6.29);
    ctx.fill();
    // soil
    ctx.fillStyle = C.soil;
    ctx.fillRect(0, SOIL_Y, W, H - SOIL_Y);
    ctx.fillStyle = C.soilEdge;
    ctx.fillRect(0, SOIL_Y, W, 2.5);
    // a few soil flecks
    ctx.fillStyle = 'rgba(120,95,60,0.35)';
    for (let i = 0; i < 14; i++) {
      const fx = (i * 53.7) % W, fy = SOIL_Y + 12 + ((i * 31.3) % 40);
      ctx.fillRect(fx, fy, 2.4, 2.4);
    }
  }

  function drawCrop(c) {
    const sway = Math.sin(time * 1.6 + c.ph) * 2.2;
    ctx.strokeStyle = C.crop;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(c.x, SOIL_Y + 1);
      ctx.quadraticCurveTo(c.x + a * 8 + sway * 0.4, SOIL_Y - 12,
                           c.x + a * 14 + sway, SOIL_Y - 21 + Math.abs(a) * 5);
      ctx.stroke();
    }
  }

  function drawWeed(w) {
    const g = Math.min(1, w.grow);
    const sh = Math.sin(w.shake * 40) * w.shake * 3;
    ctx.save();
    ctx.translate(w.x + sh, SOIL_Y + 1);
    ctx.scale(g, g);
    ctx.strokeStyle = C.weed;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = -1.35 + i * 0.55;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(a) * 15, -Math.cos(a) * 14 - 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLuke() {
    const y = SOIL_Y - 14;              // body baseline
    ctx.save();
    ctx.translate(lx, 0);
    if (dir < 0) ctx.scale(-1, 1);

    // removal prong (front underside)
    if (mode === 'pull') {
      const ext = Math.sin(Math.min(1, pullT / 0.55) * Math.PI) * 14;
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(22, y + 4); ctx.lineTo(26, y + 6 + ext); ctx.stroke();
      ctx.strokeStyle = C.weed;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(23, y + 6 + ext); ctx.lineTo(29, y + 6 + ext); ctx.stroke();
    }

    // body
    ctx.fillStyle = C.body;
    ctx.strokeStyle = C.bodyEdge;
    ctx.lineWidth = 1.5;
    roundRect(-32, y - 18, 64, 24, 7); ctx.fill(); ctx.stroke();
    // green livery
    ctx.fillStyle = C.green;
    ctx.beginPath();
    ctx.moveTo(-6, y - 18); ctx.lineTo(6, y - 18); ctx.lineTo(-2, y + 6); ctx.lineTo(-14, y + 6);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(14, y - 10, 14, 3);
    // sensor head
    ctx.fillStyle = C.dark;
    roundRect(18, y - 26, 12, 9, 2.5); ctx.fill();
    ctx.fillStyle = C.rim;
    ctx.fillRect(29, y - 23, 3, 3);
    // blinking LED
    ctx.fillStyle = (Math.sin(time * 6) > 0) ? C.amber : 'rgba(224,164,0,0.25)';
    ctx.beginPath(); ctx.arc(-24, y - 21, 2.6, 0, 6.29); ctx.fill();

    // wheels
    for (const wx of [-19, 19]) {
      ctx.fillStyle = C.wheel;
      ctx.beginPath(); ctx.arc(wx, SOIL_Y - 6, 11, 0, 6.29); ctx.fill();
      ctx.fillStyle = C.rim;
      ctx.beginPath(); ctx.arc(wx, SOIL_Y - 6, 4.6, 0, 6.29); ctx.fill();
      ctx.strokeStyle = C.rim;
      ctx.lineWidth = 1.6;
      for (let s = 0; s < 3; s++) {
        const a = wheelA + s * 2.094;
        ctx.beginPath();
        ctx.moveTo(wx, SOIL_Y - 6);
        ctx.lineTo(wx + Math.cos(a) * 9.5, SOIL_Y - 6 + Math.sin(a) * 9.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- simulation ----------
  function step(dt) {
    time += dt;

    // weed growth / occasional natural spawn
    for (const w of weeds) w.grow += dt * 2.2;
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 3.5 + Math.random() * 3.5;
      plantWeed(X_MIN + Math.random() * (X_MAX - X_MIN));
    }

    // choose target
    if (mode !== 'pull') {
      target = null;
      let best = 1e9;
      for (const w of weeds) {
        if (w.grow < 0.5) continue;
        const d = Math.abs(w.x - lx);
        if (d < best) { best = d; target = w; }
      }
      mode = target ? 'hunt' : 'patrol';
    }

    const speed = mode === 'hunt' ? 92 : 46;
    if (mode === 'patrol') {
      lx += dir * speed * dt;
      if (lx > X_MAX) { lx = X_MAX; dir = -1; }
      if (lx < X_MIN) { lx = X_MIN; dir = 1; }
    } else if (mode === 'hunt' && target) {
      const dx = target.x - 26 * Math.sign(target.x - lx) - lx; // stop just beside it
      const want = target.x > lx ? 1 : -1;
      dir = want;
      if (Math.abs(target.x - lx) > 28) {
        lx += dir * speed * dt;
      } else {
        mode = 'pull';
        pullT = 0;
      }
      lx = Math.max(X_MIN, Math.min(X_MAX, lx));
      void dx;
    } else if (mode === 'pull' && target) {
      pullT += dt;
      target.shake = Math.min(1, pullT * 2);
      if (pullT > 0.65) {
        // pop!
        const ix = weeds.indexOf(target);
        if (ix >= 0) weeds.splice(ix, 1);
        for (let i = 0; i < 10; i++) {
          parts.push({
            x: target.x, y: SOIL_Y,
            vx: (Math.random() - 0.5) * 70,
            vy: -40 - Math.random() * 60,
            life: 0.5 + Math.random() * 0.4
          });
        }
        floats.push({ x: target.x, y: SOIL_Y - 26, t: 0 });
        removed++;
        updateScore();
        target = null;
        mode = 'patrol';
      }
    }

    if (mode !== 'pull') wheelA += dir * (speed / 11) * dt;

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      if (floats[i].t > 1.1) floats.splice(i, 1);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    for (const c of crops) drawCrop(c);
    for (const w of weeds) drawWeed(w);
    drawLuke();
    // soil particles
    ctx.fillStyle = 'rgba(120,95,60,0.8)';
    for (const p of parts) ctx.fillRect(p.x, p.y, 3, 3);
    // "+1" floaters
    ctx.font = '700 12px "Space Mono", monospace';
    ctx.textAlign = 'center';
    for (const f of floats) {
      ctx.fillStyle = 'rgba(11,125,112,' + (1 - f.t / 1.1).toFixed(2) + ')';
      ctx.fillText('+1', f.x, f.y - f.t * 22);
    }
  }

  // ---------- loop, gated by visibility ----------
  let running = false, rafId = 0, last = 0;
  function loop(ts) {
    if (!running) return;
    const dt = Math.min((ts - last) / 1000 || 0.016, 0.05);
    last = ts;
    step(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }
  function start() { if (running) return; running = true; last = performance.now(); rafId = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  step(0.016); draw();          // static first frame

  if (!RM) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) start(); else stop();
    }), { threshold: 0.1 });
    io.observe(cv);
  }
})();
