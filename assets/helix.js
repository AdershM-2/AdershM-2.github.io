/* ============================================================================
   The Carousel — all darkroom photographs arranged on a slowly turning 3D
   helix. Drag to spin it, click a frame to develop it in the lightbox,
   filter by roll (year). Built on the vendored three.js; textures are the
   640px thumbs, loaded lazily when the section approaches the viewport.
   ========================================================================== */
(function () {
  'use strict';

  const mount = document.getElementById('helix-stage');
  const M = window.PHOTO_MANIFEST;
  if (!mount || !window.THREE || !M || !M.photos) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl') || test.getContext('experimental-webgl'))) throw 0;
  } catch (e) {
    mount.classList.add('nogl');
    return;
  }

  const T = window.THREE;
  const photos = M.photos;
  let built = false;

  // lazy init when the section approaches
  const lazyIO = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) { lazyIO.disconnect(); init(); }
  }, { rootMargin: '600px' });
  lazyIO.observe(mount);

  function init() {
    if (built) return;
    built = true;

    // ---- scene ------------------------------------------------------------
    const scene = new T.Scene();
    const isNight = () => document.documentElement.getAttribute('data-shift') === 'night';
    function bgColor() { return new T.Color(isNight() ? 0x0d1220 : 0xffffff); }
    scene.background = bgColor();

    const camera = new T.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 0.15, 7.1);
    camera.lookAt(0, 0, 0);

    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    mount.appendChild(renderer.domElement);

    addEventListener('shiftchange', () => { scene.background = bgColor(); kick(); });

    const group = new T.Group();
    scene.add(group);

    // ---- build the frames ---------------------------------------------------
    const loader = new T.TextureLoader();
    const backMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const items = [];
    const Hp = 0.6;                          // photo plane height

    photos.forEach((p, idx) => {
      const ratio = p.w / p.h;
      const w = Math.min(1.1, Hp * ratio);
      const holder = new T.Group();

      const backing = new T.Mesh(new T.PlaneGeometry(w + 0.07, Hp + 0.07), backMat);
      backing.position.z = -0.005;
      holder.add(backing);

      const mat = new T.MeshBasicMaterial({ color: 0xe8e4da });  // placeholder until loaded
      loader.load('assets/photos/thumb/' + p.n, tex => {
        tex.anisotropy = 4;
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
        kick();
      });
      const plane = new T.Mesh(new T.PlaneGeometry(w, Hp), mat);
      holder.add(plane);
      holder.userData = { idx, y: p.y };
      group.add(holder);
      items.push(holder);
    });

    // ---- helix layout: two graceful turns whatever the count ----------------
    const RADIUS = 2.6;
    let visible = items.slice();

    function layout() {
      const n = Math.max(visible.length, 2);
      const step = (Math.PI * 4) / n;              // two full turns
      const span = Math.min(2.2, n * 0.045);       // total height
      const rise = span / (n - 1);
      visible.forEach((it, i) => {
        const a = i * step;
        const y = -span / 2 + i * rise;
        it.position.set(Math.sin(a) * RADIUS, y, Math.cos(a) * RADIUS);
        it.lookAt(Math.sin(a) * RADIUS * 2, y, Math.cos(a) * RADIUS * 2);
        it.visible = true;
        it.scale.setScalar(1);
      });
      items.forEach(it => { if (!visible.includes(it)) it.visible = false; });
    }
    layout();

    // ---- filters --------------------------------------------------------------
    const filterWrap = document.getElementById('hx-filters');
    const countEl = document.getElementById('hx-count');
    if (filterWrap) {
      const years = ['ALL', ...new Set(photos.map(p => p.y))];
      years.forEach(y => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mms-btn hx-btn' + (y === 'ALL' ? ' on' : '');
        b.textContent = y;
        b.addEventListener('click', () => {
          filterWrap.querySelectorAll('.hx-btn').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          visible = y === 'ALL' ? items.slice() : items.filter(it => it.userData.y === y);
          layout();
          rot = targetRot = 0;
          if (countEl) countEl.textContent = visible.length;
          kick();
        });
        filterWrap.appendChild(b);
      });
      if (countEl) countEl.textContent = items.length;
    }

    // ---- spin: drag + inertia + idle autorotate --------------------------------
    let rot = 0, targetRot = 0, vel = 0, lastInteract = 0;
    let dragging = false, downX = 0, downY = 0, downRot = 0, downT = 0, moved = 0;

    const el = renderer.domElement;
    el.addEventListener('pointerdown', e => {
      dragging = true; moved = 0;
      downX = e.clientX; downY = e.clientY; downRot = targetRot; downT = performance.now();
      lastInteract = performance.now();
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - downX;
      moved = Math.max(moved, Math.abs(dx), Math.abs(e.clientY - downY));
      const nrot = downRot + dx * 0.006;
      vel = nrot - targetRot;
      targetRot = nrot;
      lastInteract = performance.now();
      kick();
    });
    el.addEventListener('pointerup', e => {
      dragging = false;
      lastInteract = performance.now();
      if (moved < 7 && performance.now() - downT < 400) tryClick(e);
    });
    el.addEventListener('pointercancel', () => { dragging = false; });

    const ray = new T.Raycaster();
    const ndc = new T.Vector2();
    function tryClick(e) {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(group.children, true);
      for (const h of hits) {
        let o = h.object;
        while (o && o.userData.idx === undefined) o = o.parent;
        if (o && o.visible) {
          if (window.__openLB) window.__openLB(o.userData.idx);
          return;
        }
      }
    }

    // ---- render loop (visibility-gated, sleeps when settled) -------------------
    let running = false, rafId = 0, inView = false, needFrames = 60;
    const clock = new T.Clock();

    function kick() { needFrames = Math.max(needFrames, 30); if (inView) start(); }

    function frame() {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      // inertia + idle spin
      if (!dragging) {
        targetRot += vel;
        vel *= 0.94;
        if (performance.now() - lastInteract > 2500 && !RM) targetRot += 0.06 * dt;
      }
      rot += (targetRot - rot) * 0.12;
      group.rotation.y = rot;
      // camera bobs very gently
      camera.position.y = 0.1 + (RM ? 0 : 0.05 * Math.sin(performance.now() / 2400));
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      if (Math.abs(vel) < 0.0004 && Math.abs(targetRot - rot) < 0.001 && RM) {
        needFrames--;
        if (needFrames <= 0) { running = false; return; }
      }
      rafId = requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; clock.start(); rafId = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(rafId); }

    function resize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      kick();
    }
    addEventListener('resize', resize);
    resize();
    frame(); renderer.render(scene, camera);   // first paint

    const io = new IntersectionObserver(es => es.forEach(e => {
      inView = e.isIntersecting;
      if (inView) start(); else stop();
    }), { threshold: 0.05 });
    io.observe(mount);
  }
})();
