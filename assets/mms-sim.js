/* ============================================================================
   MMS live sim v2 — "studio white" edition.
   A procedurally-built mobile manipulator (dimensions & joint tree transcribed
   from MMS_System.urdf) driving a figure-eight over undulating sand while its
   3-DOF arm holds the end-effector on a fixed reference path.
   Extras: terrain-following pose (pitch/roll), per-side rocker articulation,
   curvature-based corner steering, wheel grousers, dust particles, AprilTag
   deck decal, camera modes (orbit / chase / top), slip mode.
   Zero assets beyond three.js — every mesh is code.
   ========================================================================== */
(function () {
  'use strict';

  const mount = document.getElementById('mms-stage');
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

  // ---- key dimensions (from the URDF, tuned for legibility) ---------------
  const R_WHEEL = 0.10;
  const L1 = 0.20, L2 = 0.17;          // arm links
  const WX = { front: 0.21, mid: 0.0, rear: -0.21 };
  const HALF_W = 0.13, WHEEL_Z = 0.095;
  const RIDE = R_WHEEL + 0.055;

  // figure-eight drive path (lemniscate of Gerono): p(t) = (A sin t, B sin t cos t)
  const A = 1.55, B = 1.8;
  const V0 = 0.5;                       // target ground speed, m/s
  const LEAD_T = 0.7;                   // seconds of look-ahead for the EE target

  // ---- scene / camera / renderer ------------------------------------------
  const scene = new T.Scene();
  const BG = new T.Color(0xffffff);     // pure studio white
  scene.background = BG;
  scene.fog = new T.Fog(BG, 9, 24);

  const camera = new T.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(2.9, 1.8, 3.1);

  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;   // lift so the white stays white under ACES
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.5;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.3, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // ---- studio lighting -----------------------------------------------------
  scene.add(new T.HemisphereLight(0xffffff, 0xcfc4ae, 0.55));
  const key = new T.DirectionalLight(0xfff1dc, 1.5);
  key.position.set(3.5, 5.5, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new T.DirectionalLight(0xdfe9ff, 0.35);
  fill.position.set(-4, 2.5, -3);
  scene.add(fill);

  // ---- terrain: gentle analytic dunes, faded flat at the rim --------------
  function groundH(x, z) {
    const r = Math.hypot(x, z);
    const fade = r < 1.85 ? 1 : Math.max(0, 1 - (r - 1.85) / 0.35);
    if (fade === 0) return 0;
    return fade * (
      0.040 * Math.sin(x * 1.6 + 0.8) * Math.cos(z * 1.9) +
      0.022 * Math.sin((x + z) * 2.6) +
      0.012 * Math.cos(x * 3.4 - z * 2.2)
    );
  }
  function slopeAt(x, z, out) {   // out = {sx, sz}
    const e = 0.05;
    out.sx = (groundH(x + e, z) - groundH(x - e, z)) / (2 * e);
    out.sz = (groundH(x, z + e) - groundH(x, z - e)) / (2 * e);
    return out;
  }

  // infinite-looking studio floor
  const floor = new T.Mesh(
    new T.CircleGeometry(30, 48),
    new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  scene.add(floor);

  // the sand arena, displaced by the dune field
  const sandGeo = new T.CircleGeometry(2.2, 110);
  sandGeo.rotateX(-Math.PI / 2);
  {
    const p = sandGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, groundH(p.getX(i), p.getZ(i)));
    }
    sandGeo.computeVertexNormals();
  }
  const sand = new T.Mesh(sandGeo, new T.MeshStandardMaterial({
    color: 0xd9c193, roughness: 1, metalness: 0
  }));
  sand.receiveShadow = true;
  scene.add(sand);

  // arena boundary ring
  const ringGeo = new T.RingGeometry(2.13, 2.2, 96);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({
    color: 0x0e9b8d, transparent: true, opacity: 0.45, side: T.DoubleSide
  }));
  ring.position.y = 0.003;
  scene.add(ring);

  // ---- materials -----------------------------------------------------------
  const matBody  = new T.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.35, metalness: 0.25 });
  const matDark  = new T.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.6, metalness: 0.35 });
  const matAccent= new T.MeshStandardMaterial({ color: 0x0e9b8d, roughness: 0.4, metalness: 0.3 });
  const matTire  = new T.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.85, metalness: 0.15 });
  const matRim   = new T.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.3, metalness: 0.7 });
  const matArm   = new T.MeshStandardMaterial({ color: 0x11a396, roughness: 0.35, metalness: 0.4 });
  const matJoint = new T.MeshStandardMaterial({ color: 0xf0a400, roughness: 0.3, metalness: 0.55 });
  const matGrip  = new T.MeshStandardMaterial({ color: 0xe3503d, roughness: 0.4, metalness: 0.35 });

  function box(w, h, d, m) { const g = new T.Mesh(new T.BoxGeometry(w, h, d), m); g.castShadow = true; return g; }
  function cyl(r, h, m, seg, r2) {
    const g = new T.Mesh(new T.CylinderGeometry(r2 !== undefined ? r2 : r, r, h, seg || 20), m);
    g.castShadow = true; return g;
  }

  // ---- rover ---------------------------------------------------------------
  const rover = new T.Group();
  rover.rotation.order = 'YXZ';
  scene.add(rover);

  // chassis stack: tray + body + teal accent stripes + deck
  const tray = box(0.52, 0.035, 0.31, matDark);
  tray.position.y = RIDE - 0.05;
  rover.add(tray);
  const chassis = box(0.50, 0.11, 0.30, matBody);
  chassis.position.y = RIDE;
  rover.add(chassis);
  for (const s of [1, -1]) {
    const stripe = box(0.36, 0.022, 0.006, matAccent);
    stripe.position.set(0.02, RIDE + 0.02, s * 0.153);
    rover.add(stripe);
  }
  const deck = box(0.34, 0.05, 0.22, matDark);
  deck.position.set(-0.02, RIDE + 0.08, 0);
  rover.add(deck);

  // AprilTag decal on the deck (his Kinect+AprilTag localisation)
  (function addTag() {
    const c = document.createElement('canvas');
    c.width = c.height = 80;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 80, 80);
    g.fillStyle = '#111'; g.fillRect(0, 0, 80, 10); g.fillRect(0, 70, 80, 10);
    g.fillRect(0, 0, 10, 80); g.fillRect(70, 0, 10, 80);
    const bits = [1,0,1,1,0, 0,1,0,0,1, 1,1,0,1,0, 0,0,1,1,1, 1,0,0,1,0];
    for (let i = 0; i < 25; i++) {
      if (bits[i]) g.fillRect(10 + (i % 5) * 12, 10 + ((i / 5) | 0) * 12, 12, 12);
    }
    const tex = new T.CanvasTexture(c);
    tex.magFilter = T.NearestFilter;
    const tag = new T.Mesh(
      new T.PlaneGeometry(0.10, 0.10),
      new T.MeshBasicMaterial({ map: tex })
    );
    tag.rotation.x = -Math.PI / 2;
    tag.position.set(-0.11, RIDE + 0.106, 0);
    rover.add(tag);
  })();

  // sensor mast: pole + camera head with lens + status LED
  const mast = cyl(0.012, 0.20, matDark, 10);
  mast.position.set(-0.19, RIDE + 0.20, 0);
  rover.add(mast);
  const camHead = box(0.06, 0.045, 0.09, matDark);
  camHead.position.set(-0.19, RIDE + 0.315, 0);
  rover.add(camHead);
  const lens = cyl(0.014, 0.012, matRim, 14);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(-0.155, RIDE + 0.315, 0);
  rover.add(lens);
  const led = new T.Mesh(new T.SphereGeometry(0.008, 8, 8),
    new T.MeshStandardMaterial({ color: 0xf0a400, emissive: 0xcc7700, emissiveIntensity: 2 }));
  led.position.set(-0.19, RIDE + 0.345, 0);
  rover.add(led);

  // antenna with a coral pennant that sways
  const antenna = cyl(0.004, 0.24, matDark, 8);
  antenna.position.set(-0.235, RIDE + 0.22, -0.09);
  rover.add(antenna);
  const pennant = new T.Mesh(new T.ConeGeometry(0.02, 0.06, 4), matGrip);
  pennant.rotation.z = -Math.PI / 2;
  pennant.position.set(-0.205, RIDE + 0.33, -0.09);
  rover.add(pennant);

  // ---- suspension + wheels -------------------------------------------------
  const wheels = [], steers = [], rockers = [];

  function makeWheel() {
    const g = new T.Group();
    const tire = new T.Mesh(new T.CylinderGeometry(R_WHEEL, R_WHEEL, 0.075, 26), matTire);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    g.add(tire);
    // grousers — planetary-rover cleats around the circumference
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const cleat = box(0.02, 0.012, 0.08, matRim);
      cleat.position.set(Math.cos(a) * R_WHEEL, Math.sin(a) * R_WHEEL, 0);
      cleat.rotation.z = a;
      g.add(cleat);
    }
    const hub = new T.Mesh(new T.CylinderGeometry(R_WHEEL * 0.32, R_WHEEL * 0.32, 0.08, 14), matRim);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    for (let i = 0; i < 4; i++) {
      const sp = box(R_WHEEL * 1.45, 0.018, 0.018, matBody);
      sp.rotation.z = (i / 4) * Math.PI;
      g.add(sp);
    }
    return g;
  }

  function buildSide(sign) {
    const pivot = new T.Group();
    pivot.position.set(0, RIDE, 0);
    rover.add(pivot);
    rockers.push(pivot);

    const dy = R_WHEEL - RIDE;
    const beam = box(0.46, 0.03, 0.032, matBody);
    beam.position.set(-0.02, dy, sign * HALF_W);
    pivot.add(beam);
    const link = box(0.032, RIDE - R_WHEEL, 0.032, matBody);
    link.position.set(-0.02, dy / 2, sign * (HALF_W - 0.01));
    pivot.add(link);

    function mountWheel(x, steerable) {
      const station = new T.Group();
      station.position.set(x, dy, sign * HALF_W);
      pivot.add(station);
      let sp = station;
      if (steerable) {
        const st = new T.Group();
        station.add(st);
        steers.push(st);
        sp = st;
        // steering knuckle plate over the wheel, so the steer angle reads
        const knuckle = box(0.05, 0.014, 0.11, matDark);
        knuckle.position.set(0, R_WHEEL * 0.55, sign * (WHEEL_Z - 0.02));
        st.add(knuckle);
      }
      const stub = cyl(0.018, 0.10, matDark, 10);
      stub.rotation.x = Math.PI / 2;
      stub.position.z = sign * 0.05;
      sp.add(stub);
      const w = makeWheel();
      w.position.z = sign * WHEEL_Z;
      sp.add(w);
      wheels.push({ mesh: w });
    }
    mountWheel(WX.front, true);
    mountWheel(WX.mid, false);
    mountWheel(WX.rear, true);
  }
  buildSide(+1);
  buildSide(-1);

  // ---- arm (yaw + shoulder + elbow + gripper) ------------------------------
  const armYaw = new T.Group();
  armYaw.position.set(0.06, RIDE + 0.11, 0);
  rover.add(armYaw);
  armYaw.add(cyl(0.05, 0.045, matJoint, 18, 0.04));

  const shoulder = new T.Group();
  shoulder.position.y = 0.03;
  armYaw.add(shoulder);
  shoulder.add(new T.Mesh(new T.SphereGeometry(0.037, 18, 14), matJoint));

  const upper = cyl(0.020, L1, matArm, 14, 0.016);
  upper.rotation.z = -Math.PI / 2;         // lie along +X
  upper.position.x = L1 / 2;
  shoulder.add(upper);

  const elbow = new T.Group();
  elbow.position.set(L1, 0, 0);
  shoulder.add(elbow);
  elbow.add(new T.Mesh(new T.SphereGeometry(0.030, 16, 12), matJoint));

  const fore = cyl(0.016, L2, matArm, 14, 0.012);
  fore.rotation.z = -Math.PI / 2;
  fore.position.x = L2 / 2;
  elbow.add(fore);

  const eePivot = new T.Group();
  eePivot.position.set(L2, 0, 0);
  elbow.add(eePivot);
  eePivot.add(box(0.03, 0.05, 0.05, matGrip));
  const finger1 = box(0.05, 0.012, 0.012, matGrip);
  const finger2 = box(0.05, 0.012, 0.012, matGrip);
  finger1.position.set(0.035, 0, 0.02);
  finger2.position.set(0.035, 0, -0.02);
  eePivot.add(finger1); eePivot.add(finger2);

  // ---- drive path math -----------------------------------------------------
  function pathX(t)  { return A * Math.sin(t); }
  function pathZ(t)  { return B * Math.sin(t) * Math.cos(t); }
  function pathDX(t) { return A * Math.cos(t); }
  function pathDZ(t) { return B * Math.cos(2 * t); }
  function pathDDX(t){ return -A * Math.sin(t); }
  function pathDDZ(t){ return -2 * B * Math.sin(2 * t); }

  // reference EE height profile (fixed world frame, like his sinusoidal-z runs)
  function refY(t) { return 0.33 + 0.10 * Math.sin(t * 2.2); }

  // ---- path visuals --------------------------------------------------------
  // faint wheel-path guide hugging the dunes
  {
    const pts = [];
    for (let i = 0; i <= 300; i++) {
      const t = (i / 300) * Math.PI * 2;
      const x = pathX(t), z = pathZ(t);
      pts.push(new T.Vector3(x, groundH(x, z) + 0.006, z));
    }
    scene.add(new T.Line(
      new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({ color: 0xb9ad93, transparent: true, opacity: 0.8 })
    ));
  }
  // the violet EE reference path, floating above
  {
    const pts = [];
    for (let i = 0; i <= 300; i++) {
      const t = (i / 300) * Math.PI * 2;
      pts.push(new T.Vector3(pathX(t), refY(t), pathZ(t)));
    }
    scene.add(new T.Line(
      new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.8 })
    ));
  }

  const target = new T.Mesh(new T.SphereGeometry(0.028, 16, 12),
    new T.MeshBasicMaterial({ color: 0xe89b00 }));
  scene.add(target);
  const targetGlow = new T.Mesh(new T.SphereGeometry(0.055, 16, 12),
    new T.MeshBasicMaterial({ color: 0xf0a400, transparent: true, opacity: 0.3 }));
  target.add(targetGlow);

  // EE trail
  const TRAIL = 220;
  const trailGeo = new T.BufferGeometry();
  const trailPos = new Float32Array(TRAIL * 3);
  trailGeo.setAttribute('position', new T.BufferAttribute(trailPos, 3));
  const trail = new T.Line(trailGeo, new T.LineBasicMaterial({
    color: 0x0aa595, transparent: true, opacity: 1
  }));
  scene.add(trail);
  let trailN = 0;

  // ---- soft contact shadow under the rover (fake AO blob, always visible) --
  const blobTex = (function () {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(40,34,24,0.42)');
    grad.addColorStop(0.6, 'rgba(40,34,24,0.20)');
    grad.addColorStop(1, 'rgba(40,34,24,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const contactBlob = new T.Mesh(
    new T.PlaneGeometry(0.85, 0.62),
    new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  );
  contactBlob.rotation.x = -Math.PI / 2;
  scene.add(contactBlob);

  // ---- dust particles ------------------------------------------------------
  const dustTex = (function () {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(150,132,105,0.85)');
    grad.addColorStop(1, 'rgba(150,132,105,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();
  const DUST_N = 70;
  const dust = [];
  for (let i = 0; i < DUST_N; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({
      map: dustTex, transparent: true, opacity: 0, depthWrite: false
    }));
    s.visible = false;
    scene.add(s);
    dust.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
  }
  let dustAcc = 0, dustIdx = 0;
  function spawnDust(x, y, z, vigor) {
    const d = dust[dustIdx = (dustIdx + 1) % DUST_N];
    d.life = d.max = 0.6 + Math.random() * 0.5;
    d.vx = (Math.random() - 0.5) * 0.25 * vigor;
    d.vy = (0.15 + Math.random() * 0.25) * vigor;
    d.vz = (Math.random() - 0.5) * 0.25 * vigor;
    d.s.position.set(x, y, z);
    d.s.visible = true;
  }
  function updateDust(dt, slipAmt) {
    for (const d of dust) {
      if (d.life <= 0) { d.s.visible = false; continue; }
      d.life -= dt;
      const t01 = 1 - d.life / d.max;
      d.s.position.x += d.vx * dt;
      d.s.position.y += d.vy * dt;
      d.s.position.z += d.vz * dt;
      d.vy -= 0.25 * dt;
      const sc = 0.05 + 0.24 * t01;
      d.s.scale.set(sc, sc, 1);
      d.s.material.opacity = (0.4 + 0.3 * slipAmt) * (1 - t01);
    }
  }

  // ---- IK ------------------------------------------------------------------
  const _tmp = new T.Vector3();
  function solveArm(worldTarget) {
    armYaw.rotation.y = 0;
    armYaw.updateWorldMatrix(true, false);
    _tmp.copy(worldTarget);
    armYaw.worldToLocal(_tmp);
    const yaw = Math.atan2(_tmp.z, _tmp.x);
    armYaw.rotation.y = -yaw;
    const r = Math.hypot(_tmp.x, _tmp.z);
    const h = _tmp.y - shoulder.position.y;
    let d = Math.hypot(r, h);
    const dMax = L1 + L2 - 1e-3, dMin = Math.abs(L1 - L2) + 1e-3;
    d = Math.max(dMin, Math.min(dMax, d));
    const cE = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    const elbowInterior = Math.acos(Math.max(-1, Math.min(1, cE)));
    const cS = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const q1 = Math.atan2(h, r) + Math.acos(Math.max(-1, Math.min(1, cS)));
    shoulder.rotation.z = q1;
    elbow.rotation.z = elbowInterior - Math.PI;
    return { q1, elbowInterior };
  }

  // ---- UI: telemetry, slip, camera modes -----------------------------------
  const tele = document.getElementById('mms-tele');

  let slip = false;
  const slipBtn = document.getElementById('mms-slip');
  function setSlip(v) {
    slip = v;
    if (slipBtn) {
      slipBtn.textContent = 'TERRAIN SLIP: ' + (slip ? 'ON' : 'OFF');
      slipBtn.classList.toggle('on', slip);
    }
  }
  if (slipBtn) slipBtn.addEventListener('click', () => setSlip(!slip));

  const MODES = ['ORBIT', 'CHASE', 'TOP'];
  let mode = 0;
  const viewBtn = document.getElementById('mms-view');
  function setMode(i) {
    mode = ((i % MODES.length) + MODES.length) % MODES.length;
    if (viewBtn) viewBtn.textContent = 'VIEW: ' + MODES[mode];
    const orbit = MODES[mode] === 'ORBIT';
    controls.enabled = orbit;
    if (orbit) {
      controls.target.set(0, 0.3, 0);
      controls.autoRotate = true;
    }
  }
  if (viewBtn) viewBtn.addEventListener('click', () => setMode(mode + 1));
  addEventListener('keydown', e => {
    if (!inView) return;
    const k = e.key.toLowerCase();
    if (k === 's') setSlip(!slip);
    if (k === 'v') setMode(mode + 1);
  });

  // ---- main loop -----------------------------------------------------------
  const worldTarget = new T.Vector3();
  const eeWorld = new T.Vector3();
  const grad = { sx: 0, sz: 0 };
  const camPos = new T.Vector3(), camLook = new T.Vector3();
  let t = 0.4;                    // path parameter
  let wheelSpin = 0, slipAmt = 0, simTime = 0, teleTick = 0;
  let prevX = pathX(0.4), prevZ = pathZ(0.4);
  const clock = new T.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    simTime += dt;
    slipAmt += ((slip ? 1 : 0) - slipAmt) * Math.min(1, dt * 2);

    // advance along the lemniscate at ~constant ground speed
    const dx = pathDX(t), dz = pathDZ(t);
    const pv = Math.hypot(dx, dz);
    t += (V0 * dt) / Math.max(pv, 0.2);

    // nominal pose + slip drift (lateral wander off the ideal line)
    const heading = Math.atan2(pathDZ(t), pathDX(t));
    const nx = -Math.sin(heading), nz = Math.cos(heading);   // path normal
    const wander = slipAmt * (0.09 * Math.sin(t * 4.7) + 0.05 * Math.sin(t * 9.3));
    const px = pathX(t) + nx * wander;
    const pz = pathZ(t) + nz * wander;

    // terrain-following: height + pitch/roll from the local slope
    const gy = groundH(px, pz);
    slopeAt(px, pz, grad);
    const sF = grad.sx * Math.cos(heading) + grad.sz * Math.sin(heading);
    const sL = -grad.sx * Math.sin(heading) + grad.sz * Math.cos(heading);
    rover.position.set(px, gy + slipAmt * 0.012 * Math.sin(simTime * 11), pz);
    contactBlob.position.set(px, gy + 0.008, pz);
    contactBlob.rotation.z = -heading;
    rover.rotation.y = -heading;
    rover.rotation.z = T.MathUtils.clamp(Math.atan(sF) * 0.9, -0.14, 0.14);
    rover.rotation.x = T.MathUtils.clamp(-Math.atan(sL) * 0.9, -0.14, 0.14);

    // actual ground speed (for wheels + telemetry)
    const hx = px - prevX, hz = pz - prevZ;
    const speed = Math.hypot(hx, hz) / Math.max(dt, 1e-4);
    prevX = px; prevZ = pz;

    // wheels spin; under slip they over-spin visibly
    wheelSpin += (speed / R_WHEEL) * (1 + slipAmt * 0.9) * dt;
    for (const w of wheels) w.mesh.rotation.z = -wheelSpin;

    // corner steering from path curvature (both directions on a figure-eight)
    const curv = (pathDX(t) * pathDDZ(t) - pathDZ(t) * pathDDX(t)) / Math.pow(pv, 3);
    const steer = T.MathUtils.clamp(Math.atan(curv * WX.front * 2.2), -0.6, 0.6)
                + slipAmt * 0.12 * Math.sin(simTime * 6.3);
    // order: [L-front, L-rear, R-front, R-rear]
    steers[0].rotation.y = -steer; steers[2].rotation.y = -steer;
    steers[1].rotation.y =  steer; steers[3].rotation.y =  steer;

    // rocker-bogie articulation from real height difference under each side
    for (let sideI = 0; sideI < 2; sideI++) {
      const sign = sideI === 0 ? 1 : -1;
      const cf = Math.cos(-heading), sf = Math.sin(-heading);
      // world positions of this side's front & rear wheels (approx)
      const fx = px + WX.front * Math.cos(heading) - sign * HALF_W * Math.sin(heading);
      const fz = pz + WX.front * Math.sin(heading) + sign * HALF_W * Math.cos(heading);
      const rx = px + WX.rear * Math.cos(heading) - sign * HALF_W * Math.sin(heading);
      const rz = pz + WX.rear * Math.sin(heading) + sign * HALF_W * Math.cos(heading);
      const dh = groundH(fx, fz) - groundH(rx, rz);
      rockers[sideI].rotation.z =
        T.MathUtils.clamp(Math.atan(dh / (WX.front - WX.rear)) * 0.7, -0.1, 0.1)
        + slipAmt * 0.03 * Math.sin(simTime * 7 + sideI * 1.7);
      void cf; void sf;
    }

    // dust off the rear wheels while moving (heavier under slip)
    dustAcc += dt * (8 + slipAmt * 55) * Math.min(speed / V0, 1.4);
    while (dustAcc > 1) {
      dustAcc -= 1;
      const back = -0.26, sgn = Math.random() < 0.5 ? 1 : -1;
      spawnDust(
        px + back * Math.cos(heading) - sgn * HALF_W * Math.sin(heading),
        gy + 0.03,
        pz + back * Math.sin(heading) + sgn * HALF_W * Math.cos(heading),
        0.7 + slipAmt
      );
    }
    updateDust(dt, slipAmt);

    // EE reference: a point on the violet path, a bit ahead of the rover
    const tt = t + (V0 * LEAD_T) / Math.max(pv, 0.2);
    worldTarget.set(pathX(tt), refY(tt), pathZ(tt));
    target.position.copy(worldTarget);
    targetGlow.scale.setScalar(1 + 0.22 * Math.sin(simTime * 6));

    const sol = solveArm(worldTarget);

    // gripper breathes
    const fo = 0.02 + 0.007 * Math.sin(simTime * 3);
    finger1.position.z = fo; finger2.position.z = -fo;
    // pennant sways
    pennant.rotation.x = 0.25 * Math.sin(simTime * 2.6);

    // EE world position → trail + tracking error
    eePivot.updateWorldMatrix(true, false);
    eeWorld.setFromMatrixPosition(eePivot.matrixWorld);
    if (trailN < TRAIL) {
      trailPos[trailN * 3] = eeWorld.x; trailPos[trailN * 3 + 1] = eeWorld.y; trailPos[trailN * 3 + 2] = eeWorld.z;
      trailN++;
      trailGeo.setDrawRange(0, trailN);
    } else {
      trailPos.copyWithin(0, 3);
      trailPos[(TRAIL - 1) * 3] = eeWorld.x;
      trailPos[(TRAIL - 1) * 3 + 1] = eeWorld.y;
      trailPos[(TRAIL - 1) * 3 + 2] = eeWorld.z;
    }
    trailGeo.attributes.position.needsUpdate = true;
    const err = eeWorld.distanceTo(worldTarget) * 1000;

    // camera modes
    const m = MODES[mode];
    if (m === 'CHASE') {
      const fx2 = Math.cos(heading), fz2 = Math.sin(heading);
      camPos.set(px - fx2 * 1.15, gy + 0.55, pz - fz2 * 1.15);
      camLook.set(px + fx2 * 0.55, gy + 0.25, pz + fz2 * 0.55);
      const k = 1 - Math.exp(-3.5 * dt);
      camera.position.lerp(camPos, k);
      camera.lookAt(camLook);
    } else if (m === 'TOP') {
      camPos.set(0.02, 6.3, 0.02);
      camLook.set(0, 0, 0);
      const k = 1 - Math.exp(-3.0 * dt);
      camera.position.lerp(camPos, k);
      camera.lookAt(camLook);
    } else {
      controls.update();
    }

    // telemetry
    teleTick += dt;
    if (tele && teleTick > 0.1) {
      teleTick = 0;
      tele.innerHTML =
        'BASE&nbsp;&nbsp;v=' + speed.toFixed(2) + ' m/s&nbsp;&nbsp;ψ=' + (heading * 57.3).toFixed(0).padStart(4) + '°<br>' +
        'ARM&nbsp;&nbsp;&nbsp;q1=' + (sol.q1 * 57.3).toFixed(0).padStart(4) + '°&nbsp;&nbsp;q2=' + (sol.elbowInterior * 57.3).toFixed(0).padStart(4) + '°<br>' +
        'EE&nbsp;&nbsp;&nbsp;&nbsp;err=' + err.toFixed(1).padStart(5) + ' mm&nbsp;&nbsp;' + (slip ? '<b class="warn">SLIP</b>' : '<b class="ok">LOCK</b>');
    }

    renderer.render(scene, camera);
  }

  // ---- sizing + visibility gating ------------------------------------------
  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);           // also sets canvas CSS size — critical on high-DPR phones
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let running = false, inView = false, rafId = 0;
  function loop() { if (!running) return; frame(); rafId = requestAnimationFrame(loop); }
  function start() { if (running) return; running = true; clock.start(); loop(); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  setMode(0);
  resize(); frame();          // one static frame immediately

  if (!RM) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      inView = e.isIntersecting;
      if (inView) start(); else stop();
    }), { threshold: 0.05 });
    io.observe(mount);
  }
})();
