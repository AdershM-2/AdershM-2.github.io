/* ============================================================================
   Darkroom gallery — builds the photo grid from PHOTO_MANIFEST, runs the
   lightbox (click / arrows / Esc / swipe), and wires the two background
   frames (quote backdrop + darkroom banner). No libraries.
   ========================================================================== */
(function () {
  'use strict';
  const M = window.PHOTO_MANIFEST;
  if (!M || !M.photos) return;

  const photos = M.photos;
  const flat = photos.slice();     // lightbox order = manifest order

  // capacity line
  const cap = document.getElementById('dk-count');
  if (cap) cap.textContent = photos.length + ' FRAMES DEVELOPED · SHOT ON PHONE · NO FILTERS HARMED';

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
  window.__openLB = openLB;        // the 3D carousel opens frames through this
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
