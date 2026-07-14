/* ============================================================================
   FIELD UNIT LUKE — 3D interlude.
   A WebGL farm field: ridged crop rows, butterflies, and a twin-drum-wheel
   LUKE (modelled on the real prototype) patrolling the lanes. Click the soil
   to plant a weed; LUKE drives over, extends its tool and removes it
   mechanically. Herbicide used: 0 mL, forever. Built on the same vendored
   three.js as the Sandwalker sim.
   ========================================================================== */
(function () {
  'use strict';

  const mount = document.getElementById('luke-stage');
  if (!mount || !window.THREE) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl') || test.getContext('experimental-webgl'))) throw 0;
  } catch (e) {
    mount.classList.add('nogl');
    return;
  }

  const T = window.THREE;
  const scoreEl = document.getElementById('lm-score');

  // field geometry constants
  const FX = 2.6;                       // half-length of the field in x
  const LANES = [-0.8, 0, 0.8];         // drivable lanes (valleys)
  const ROWS = [-1.2, -0.4, 0.4, 1.2];  // crop rows (ridges)
  const ridgeH = z => 0.035 * Math.pow(Math.cos((z - 0.4) * Math.PI / 0.8), 2);

  // ---- scene / camera / renderer ------------------------------------------
  const scene = new T.Scene();
  const BG = new T.Color(0xffffff);
  scene.background = BG;
  scene.fog = new T.Fog(BG, 9, 22);

  const camera = new T.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(3.1, 2.0, 3.4);

  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.8;
  controls.maxDistance = 8.5;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.15, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // ---- golden field light ---------------------------------------------------
  scene.add(new T.HemisphereLight(0xfff6e6, 0xc9b490, 0.45));
  const sun = new T.DirectionalLight(0xffe9c4, 1.5);
  sun.position.set(4, 5, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 18;
  sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new T.DirectionalLight(0xdfe9ff, 0.3);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  // ---- ground: white studio floor + ridged soil field ----------------------
  const floor = new T.Mesh(
    new T.CircleGeometry(28, 48),
    new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.003;
  floor.receiveShadow = true;
  scene.add(floor);

  const fieldGeo = new T.PlaneGeometry(FX * 2 + 0.8, 3.8, 64, 40);
  fieldGeo.rotateX(-Math.PI / 2);
  {
    const p = fieldGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const edge = Math.max(0, 1 - Math.max(0, Math.abs(x) - FX) / 0.4) *
                   Math.max(0, 1 - Math.max(0, Math.abs(z) - 1.6) / 0.3);
      p.setY(i, ridgeH(z) * edge);
    }
    fieldGeo.computeVertexNormals();
  }
  const field = new T.Mesh(fieldGeo, new T.MeshStandardMaterial({
    color: 0xa87b4c, roughness: 1
  }));
  field.receiveShadow = true;
  scene.add(field);

  // ---- crops ----------------------------------------------------------------
  const leafMat = new T.MeshStandardMaterial({ color: 0x3fa34d, roughness: 0.8 });
  const leafMat2 = new T.MeshStandardMaterial({ color: 0x57b657, roughness: 0.8 });
  let seed = 31;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const crops = [];
  for (const rz of ROWS) {
    for (let x = -FX + 0.15; x <= FX - 0.1; x += 0.36) {
      const plant = new T.Group();
      const n = 4 + (rand() * 2 | 0);
      for (let i = 0; i < n; i++) {
        const leaf = new T.Mesh(new T.ConeGeometry(0.028, 0.15, 5), rand() > 0.5 ? leafMat : leafMat2);
        const a = (i / n) * Math.PI * 2 + rand();
        leaf.position.set(Math.cos(a) * 0.03, 0.07, Math.sin(a) * 0.03);
        leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        leaf.castShadow = true;
        plant.add(leaf);
      }
      plant.position.set(x + (rand() - 0.5) * 0.06, ridgeH(rz), rz + (rand() - 0.5) * 0.08);
      const s = 0.8 + rand() * 0.5;
      plant.scale.setScalar(s);
      plant.userData.ph = rand() * 6.28;
      scene.add(plant);
      crops.push(plant);
    }
  }

  // ---- LUKE (twin finned drum wheels, white + green livery) ----------------
  const matWhite = new T.MeshStandardMaterial({ color: 0xf4f6f9, roughness: 0.35, metalness: 0.2 });
  const matGreen = new T.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.45, metalness: 0.2 });
  const matDark  = new T.MeshStandardMaterial({ color: 0x23282f, roughness: 0.6, metalness: 0.3 });
  const matSteel = new T.MeshStandardMaterial({ color: 0xb9c0cc, roughness: 0.3, metalness: 0.7 });
  const matRed   = new T.MeshStandardMaterial({ color: 0xd52b1e, roughness: 0.4,
                     emissive: 0x550000, emissiveIntensity: 0.6 });

  const luke = new T.Group();
  scene.add(luke);

  const R = 0.22;                 // drum wheel radius
  function drumWheel() {
    const g = new T.Group();
    const drumGeo = new T.CylinderGeometry(R, R, 0.16, 24);
    drumGeo.rotateX(Math.PI / 2);          // axis → Z (lateral)
    const drum = new T.Mesh(drumGeo, matSteel);
    drum.castShadow = true;
    g.add(drum);
    for (let i = 0; i < 10; i++) {         // turbine fins like the prototype
      const a = (i / 10) * Math.PI * 2;
      const finGeo = new T.BoxGeometry(0.035, 0.012, 0.17);
      const fin = new T.Mesh(finGeo, matDark);
      fin.position.set(Math.cos(a) * (R - 0.01), Math.sin(a) * (R - 0.01), 0);
      fin.rotation.z = a + 0.5;
      g.add(fin);
    }
    const hubGeo = new T.CylinderGeometry(0.06, 0.06, 0.18, 12);
    hubGeo.rotateX(Math.PI / 2);
    g.add(new T.Mesh(hubGeo, matDark));
    return g;
  }
  const wheelF = drumWheel(); wheelF.position.set(0.34, R, 0); luke.add(wheelF);
  const wheelB = drumWheel(); wheelB.position.set(-0.34, R, 0); luke.add(wheelB);

  // body spanning the wheels
  const body = new T.Mesh(new T.BoxGeometry(0.6, 0.2, 0.26), matWhite);
  body.position.set(0, 0.34, 0);
  body.castShadow = true;
  luke.add(body);
  const nose = new T.Mesh(new T.BoxGeometry(0.22, 0.16, 0.24), matWhite);
  nose.position.set(0.36, 0.4, 0);
  nose.rotation.z = -0.35;
  nose.castShadow = true;
  luke.add(nose);
  const deck = new T.Mesh(new T.BoxGeometry(0.3, 0.03, 0.3), matWhite);
  deck.position.set(-0.4, 0.42, 0);
  deck.rotation.z = 0.12;
  deck.castShadow = true;
  luke.add(deck);
  // green livery
  for (const s of [1, -1]) {
    const stripe = new T.Mesh(new T.BoxGeometry(0.42, 0.03, 0.005), matGreen);
    stripe.position.set(0.02, 0.38, s * 0.133);
    stripe.rotation.z = -0.12;
    luke.add(stripe);
    const chev = new T.Mesh(new T.BoxGeometry(0.14, 0.05, 0.005), matGreen);
    chev.position.set(-0.2, 0.3, s * 0.133);
    chev.rotation.z = 0.6;
    luke.add(chev);
  }
  const deckEdge = new T.Mesh(new T.BoxGeometry(0.3, 0.012, 0.31), matGreen);
  deckEdge.position.set(-0.4, 0.437, 0);
  deckEdge.rotation.z = 0.12;
  luke.add(deckEdge);
  // glass electronics window
  const glass = new T.Mesh(new T.BoxGeometry(0.3, 0.06, 0.2),
    new T.MeshStandardMaterial({ color: 0x30363f, roughness: 0.15, metalness: 0.6 }));
  glass.position.set(0.02, 0.46, 0);
  luke.add(glass);
  // carry handles
  for (const [hx, hz] of [[0.12, 0.09], [0.12, -0.09], [-0.1, 0.09], [-0.1, -0.09]]) {
    const handle = new T.Mesh(new T.BoxGeometry(0.09, 0.025, 0.02), matDark);
    handle.position.set(hx, 0.505, hz);
    luke.add(handle);
  }
  // e-stop
  const estop = new T.Mesh(new T.CylinderGeometry(0.028, 0.032, 0.035, 12), matRed);
  estop.position.set(-0.02, 0.51, 0);
  luke.add(estop);
  // status LED
  const led = new T.Mesh(new T.SphereGeometry(0.014, 8, 8),
    new T.MeshStandardMaterial({ color: 0xffb300, emissive: 0xcc7700, emissiveIntensity: 2 }));
  led.position.set(0.44, 0.48, 0);
  luke.add(led);

  // under-belly weeding tool
  const tool = new T.Mesh(new T.CylinderGeometry(0.014, 0.006, 0.3, 8), matSteel);
  tool.position.set(0, 0.3, 0);
  luke.add(tool);

  // soft contact blob
  const blobTex = (function () {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    gr.addColorStop(0, 'rgba(60,40,20,0.35)');
    gr.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const blob = new T.Mesh(new T.PlaneGeometry(1.0, 0.55),
    new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // scanning ring (disease detection sweep)
  const scanRing = new T.Mesh(
    new T.RingGeometry(0.16, 0.21, 32),
    new T.MeshBasicMaterial({ color: 0x0e9b8d, transparent: true, opacity: 0.5, side: T.DoubleSide })
  );
  scanRing.rotation.x = -Math.PI / 2;
  scene.add(scanRing);

  // ---- butterflies -----------------------------------------------------------
  function butterfly(color) {
    const g = new T.Group();
    const wingGeo = new T.PlaneGeometry(0.09, 0.07);
    wingGeo.translate(0.045, 0, 0);
    const m = new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity: 0.9 });
    const w1 = new T.Mesh(wingGeo, m);
    const w2 = new T.Mesh(wingGeo, m);
    w2.rotation.y = Math.PI;
    g.add(w1); g.add(w2);
    g.userData = { w1, w2, ph: Math.random() * 6.28 };
    scene.add(g);
    return g;
  }
  const flies = [butterfly(0xe3503d), butterfly(0x6f56e8)];

  // ---- weeds -----------------------------------------------------------------
  const weedMat = new T.MeshStandardMaterial({ color: 0xd9422e, roughness: 0.7 });
  const weeds = [];
  function plantWeed(x, z) {
    if (weeds.length >= 6) return;
    x = Math.max(-FX + 0.2, Math.min(FX - 0.2, x));
    // snap to the nearest lane so it stays reachable
    let lane = LANES[0];
    for (const l of LANES) if (Math.abs(z - l) < Math.abs(z - lane)) lane = l;
    z = lane + (Math.random() - 0.5) * 0.2;
    const g = new T.Group();
    for (let i = 0; i < 6; i++) {
      const blade = new T.Mesh(new T.ConeGeometry(0.014, 0.17, 4), weedMat);
      const a = (i / 6) * Math.PI * 2;
      blade.position.set(Math.cos(a) * 0.025, 0.07, Math.sin(a) * 0.025);
      blade.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      blade.castShadow = true;
      g.add(blade);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(0.01);
    scene.add(g);
    weeds.push({ g, grow: 0, shake: 0 });
  }

  // click / tap the soil to plant
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY, performance.now()]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    const dtms = performance.now() - downAt[2];
    downAt = null;
    if (moved > 8 || dtms > 400) return;          // it was a drag, not a tap
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([field, floor]);
    if (hits.length) plantWeed(hits[0].point.x, hits[0].point.z);
  });
  const plantBtn = document.getElementById('lk-plant');
  if (plantBtn) plantBtn.addEventListener('click', () => {
    plantWeed(-FX + 0.3 + Math.random() * (FX * 2 - 0.6), LANES[(Math.random() * 3) | 0]);
  });

  // ---- particles + floaters --------------------------------------------------
  const partMat = new T.MeshBasicMaterial({ color: 0x6b4a26 });
  const parts = [];
  for (let i = 0; i < 36; i++) {
    const m = new T.Mesh(new T.BoxGeometry(0.02, 0.02, 0.02), partMat);
    m.visible = false;
    scene.add(m);
    parts.push({ m, v: new T.Vector3(), life: 0 });
  }
  let partIdx = 0;
  function burst(x, z) {
    for (let i = 0; i < 14; i++) {
      const p = parts[partIdx = (partIdx + 1) % parts.length];
      p.m.position.set(x, 0.06, z);
      p.v.set((Math.random() - 0.5) * 1.4, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4);
      p.life = 0.6 + Math.random() * 0.3;
      p.m.visible = true;
    }
  }
  const plusTex = (function () {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '700 34px monospace'; g.textAlign = 'center'; g.fillStyle = '#0e9b8d';
    g.fillText('+1', 32, 42);
    return new T.CanvasTexture(c);
  })();
  const floats = [];
  function plusOne(x, z) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: plusTex, transparent: true }));
    s.scale.setScalar(0.3);
    s.position.set(x, 0.35, z);
    scene.add(s);
    floats.push({ s, t: 0 });
  }

  // ---- LUKE brain -------------------------------------------------------------
  let removed = 0;
  function updateScore() {
    if (scoreEl) scoreEl.textContent = 'WEEDS REMOVED: ' + removed + ' · HERBICIDE USED: 0 mL';
  }
  updateScore();

  const WPS = [];
  for (let i = 0; i < LANES.length; i++) {
    const z = LANES[i];
    if (i % 2 === 0) { WPS.push([FX - 0.3, z]); WPS.push([-FX + 0.3, z]); }
    else { WPS.push([-FX + 0.3, z]); WPS.push([FX - 0.3, z]); }
  }
  let wpIdx = 0, mode = 'patrol', pullT = 0, targetWeed = null;
  let heading = Math.PI, wheelSpin = 0, simTime = 0;
  luke.position.set(FX - 0.3, 0, LANES[0]);

  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function step(dt) {
    simTime += dt;

    // grow weeds
    for (const w of weeds) {
      w.grow = Math.min(1, w.grow + dt * 2);
      w.g.scale.setScalar(0.01 + w.grow * (0.99 + 0.04 * Math.sin(simTime * 3)));
      if (w.shake > 0) w.g.rotation.z = Math.sin(simTime * 45) * 0.12 * w.shake;
    }
    // keep LUKE busy for idle viewers
    if (weeds.length < 2 && Math.random() < dt / 6) {
      plantWeed(-FX + 0.3 + Math.random() * (FX * 2 - 0.6), LANES[(Math.random() * 3) | 0]);
    }

    // pick target
    if (mode !== 'pull') {
      targetWeed = null;
      let best = 1e9;
      for (const w of weeds) {
        if (w.grow < 0.5) continue;
        const d = luke.position.distanceTo(w.g.position);
        if (d < best) { best = d; targetWeed = w; }
      }
      mode = targetWeed ? 'hunt' : 'patrol';
    }

    let tx, tz, speed;
    if (mode === 'hunt') { tx = targetWeed.g.position.x; tz = targetWeed.g.position.z; speed = 0.9; }
    else { tx = WPS[wpIdx][0]; tz = WPS[wpIdx][1]; speed = 0.55; }

    if (mode !== 'pull') {
      const want = Math.atan2(tz - luke.position.z, tx - luke.position.x);
      const d = angDiff(want, heading);
      heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, d));
      const go = Math.abs(d) < 1.1 ? speed : 0.12;
      luke.position.x += Math.cos(heading) * go * dt;
      luke.position.z += Math.sin(heading) * go * dt;
      wheelSpin += (go / R) * dt;

      const dist = Math.hypot(tx - luke.position.x, tz - luke.position.z);
      if (mode === 'patrol' && dist < 0.3) wpIdx = (wpIdx + 1) % WPS.length;
      if (mode === 'hunt' && dist < 0.34) { mode = 'pull'; pullT = 0; }
    } else if (targetWeed) {
      pullT += dt;
      targetWeed.shake = Math.min(1, pullT * 1.6);
      const ext = Math.sin(Math.min(1, pullT / 0.75) * Math.PI);
      tool.position.y = 0.3 - ext * 0.17;
      if (pullT > 0.8) {
        const wp = targetWeed.g.position;
        burst(wp.x, wp.z);
        plusOne(wp.x, wp.z);
        scene.remove(targetWeed.g);
        weeds.splice(weeds.indexOf(targetWeed), 1);
        targetWeed = null;
        removed++;
        updateScore();
        tool.position.y = 0.3;
        mode = 'patrol';
      }
    }

    // pose on ridged ground + gentle bob
    const gy = 0;
    luke.position.y = gy + 0.006 * Math.sin(simTime * 7);
    luke.rotation.y = -heading;
    luke.rotation.z = 0.02 * Math.sin(simTime * 5);
    wheelF.rotation.z = -wheelSpin;
    wheelB.rotation.z = -wheelSpin;
    led.material.emissiveIntensity = mode === 'pull' ? 3 : (Math.sin(simTime * 5) > 0 ? 2 : 0.4);

    blob.position.set(luke.position.x, 0.012, luke.position.z);
    blob.rotation.z = -heading;

    // scan ring sweeps ahead while patrolling
    if (mode === 'patrol' || mode === 'hunt') {
      scanRing.visible = true;
      const lead = 0.55 + 0.1 * Math.sin(simTime * 3);
      scanRing.position.set(
        luke.position.x + Math.cos(heading) * lead, 0.02,
        luke.position.z + Math.sin(heading) * lead);
      const pulse = 0.9 + 0.2 * Math.sin(simTime * 6);
      scanRing.scale.setScalar(pulse);
      scanRing.material.opacity = 0.28 + 0.2 * Math.sin(simTime * 6);
    } else scanRing.visible = false;

    // crops sway
    for (let i = 0; i < crops.length; i += 2) {
      const c = crops[i];
      c.rotation.z = 0.06 * Math.sin(simTime * 1.4 + c.userData.ph);
    }

    // butterflies
    flies.forEach((f, i) => {
      const t = simTime * (0.24 + i * 0.07) + i * 3;
      f.position.set(Math.sin(t) * 2.1, 0.5 + 0.18 * Math.sin(t * 2.7), Math.cos(t * 0.8) * 1.3);
      f.rotation.y = -t;
      const flap = Math.sin(simTime * 14 + f.userData.ph) * 0.9;
      f.userData.w1.rotation.y = flap;
      f.userData.w2.rotation.y = Math.PI - flap;
    });

    // particles fall
    for (const p of parts) {
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.life -= dt;
      p.v.y -= 4 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.01) { p.m.position.y = 0.01; p.v.set(0, 0, 0); }
    }
    // "+1" floats rise & fade
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      f.s.position.y += dt * 0.5;
      f.s.material.opacity = 1 - f.t / 1.2;
      if (f.t > 1.2) { scene.remove(f.s); f.s.material.dispose(); floats.splice(i, 1); }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // ---- sizing + visibility gating ---------------------------------------------
  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let running = false, rafId = 0;
  const clock = new T.Clock();
  function loop() {
    if (!running) return;
    step(Math.min(clock.getDelta(), 0.05));
    rafId = requestAnimationFrame(loop);
  }
  function start() { if (running) return; running = true; clock.start(); loop(); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  resize(); step(0.016);          // static first frame

  if (!RM) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) start(); else stop();
    }), { threshold: 0.05 });
    io.observe(mount);
  }
})();
