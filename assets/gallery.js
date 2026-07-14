/* ============================================================================
   Darkroom gallery — builds the photo grid from PHOTO_MANIFEST, runs the
   lightbox (click / arrows / Esc / swipe), and wires the two background
   frames (quote backdrop + darkroom banner). No libraries.
   ========================================================================== */
(function () {
  'use strict';
  const M = window.PHOTO_MANIFEST;
  const grid = document.getElementById('dk-grid');
  if (!M || !M.photos || !grid) return;

  const photos = M.photos;

  // capacity line
  const cap = document.getElementById('dk-count');
  if (cap) cap.textContent = photos.length + ' FRAMES DEVELOPED · SHOT ON PHONE · NO FILTERS HARMED';

  // ---- build one horizontal "film roll" per year ---------------------------
  const years = [...new Set(photos.map(p => p.y))].sort();
  const flat = [];
  for (const y of years) {
    const group = photos.filter(q => q.y === y);

    const head = document.createElement('div');
    head.className = 'dk-roll-head';
    head.innerHTML =
      '<span class="dk-roll-title mono">ROLL ' + y + ' · ' + group.length +
      ' EXPOSURE' + (group.length === 1 ? '' : 'S') + '</span>' +
      '<span class="dk-roll-hint mono">← drag →</span>';
    grid.appendChild(head);

    const roll = document.createElement('div');
    roll.className = 'dk-roll';
    grid.appendChild(roll);

    for (const p of group) {
      const idx = flat.length;
      flat.push(p);
      const img = document.createElement('img');
      img.src = 'assets/photos/thumb/' + p.n;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = 'photograph ' + (idx + 1) + ' of ' + photos.length;
      img.addEventListener('click', () => openLB(idx));
      roll.appendChild(img);
    }
  }

  // ---- lightbox ------------------------------------------------------------
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbCount = document.getElementById('lb-count');
  let cur = 0;

  function render() {
    const p = flat[cur];
    lbImg.src = 'assets/photos/large/' + p.n;
    lbCount.textContent = (cur + 1) + ' / ' + flat.length;
  }
  function openLB(i) { cur = i; render(); lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeLB() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function nav(d) { cur = (cur + d + flat.length) % flat.length; render(); }

  document.getElementById('lb-close').addEventListener('click', e => { e.stopPropagation(); closeLB(); });
  document.getElementById('lb-prev').addEventListener('click', e => { e.stopPropagation(); nav(-1); });
  document.getElementById('lb-next').addEventListener('click', e => { e.stopPropagation(); nav(1); });
  lb.addEventListener('click', e => { if (e.target === lb) closeLB(); });
  addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLB();
    else if (e.key === 'ArrowRight') nav(1);
    else if (e.key === 'ArrowLeft') nav(-1);
  });
  // swipe on touch
  let tx = null;
  lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 40) nav(dx < 0 ? 1 : -1);
    tx = null;
  }, { passive: true });

  // ---- background frames ----------------------------------------------------
  const bgQuote = photos.find(p => p.bg === 'quote');
  if (bgQuote) {
    const q = document.querySelector('.quote');
    if (q) {
      q.classList.add('has-photo');
      q.style.backgroundImage =
        'linear-gradient(rgba(9,12,19,0.72), rgba(9,12,19,0.8)), url(assets/photos/large/' + bgQuote.n + ')';
    }
  }
  const bgDk = photos.find(p => p.bg === 'darkroom');
  if (bgDk) {
    const b = document.getElementById('dk-banner');
    if (b) {
      b.style.backgroundImage =
        'linear-gradient(rgba(9,12,19,0.25), rgba(12,17,24,0.65)), url(assets/photos/large/' + bgDk.n + ')';
    }
  }
})();
