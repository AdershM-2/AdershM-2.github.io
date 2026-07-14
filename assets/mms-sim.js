/* ============================================================================
   MMS live sim — a procedurally-built mobile manipulator, driving.
   Kinematics & dimensions transcribed from MMS_System.urdf (collision
   primitives + joint tree); rebuilt as lightweight three.js primitives so it
   weighs ~0 instead of the 111 MB of Collada the real URDF ships.
   Six wheels · four steering corners · rocker-bogie suspension · 3-DOF arm
   doing live end-effector path tracking while the base drives.
   ========================================================================== */
(function () {
  'use strict';

  const mount = document.getElementById('mms-stage');
  if (!mount || !window.THREE) return;

  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // WebGL capability check → graceful fallback
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl') || test.getContext('experimental-webgl'))) throw 0;
  } catch (e) {
    mount.classList.add('nogl');
    return;
  }

  const T = window.THREE;
  const R_WHEEL = 0.10;           // wheel radius (urdf r=0.075; enlarged for legibility)
  const L1 = 0.20, L2 = 0.17;     // arm link lengths (upper, fore)
  const R_BASE = 1.15;            // rover driving-circle radius
  const R_REF  = R_BASE;          // reference path shares the ring; EE tracks a point just ahead
  const LEAD   = 0.17;            // how far ahead (rad) the tracked target leads the rover

  // ---- scene, camera, renderer -------------------------------------------
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(2.6, 1.7, 2.9);

  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.6;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI * 0.49;   // don't go under the floor
  controls.target.set(0, 0.4, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  // stop auto-rotate once the user grabs the camera
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // ---- lighting -----------------------------------------------------------
  scene.add(new T.HemisphereLight(0x9fd8ff, 0x3a2f22, 0.65));
  const key = new T.DirectionalLight(0xffe3b0, 1.15);
  key.position.set(3, 5, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
  scene.add(key);
  const rim = new T.DirectionalLight(0x3fd6c4, 0.4);
  rim.position.set(-3, 2, -3);
  scene.add(rim);

  // ---- the sand arena (his 5×7 m test bed, stylised as a disc) -----------
  const sand = new T.Mesh(
    new T.CircleGeometry(2.2, 64),
    new T.MeshStandardMaterial({ color: 0x5c4b32, roughness: 1, metalness: 0 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.receiveShadow = true;
  scene.add(sand);
  // arena boundary ring (teal, like the site accents)
  const ring = new T.Mesh(
    new T.RingGeometry(2.12, 2.2, 64),
    new T.MeshBasicMaterial({ color: 0x3fd6c4, transparent: true, opacity: 0.5, side: T.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);
  // faint polar grid on the sand
  const grid = new T.PolarGridHelper(2.1, 8, 6, 64, 0x2f6f68, 0x24413d);
  grid.position.y = 0.003;
  if (grid.material) { grid.material.transparent = true; grid.material.opacity = 0.35; }
  scene.add(grid);

  // ---- materials ----------------------------------------------------------
  const matBody  = new T.MeshStandardMaterial({ color: 0xc3c9dc, roughness: 0.5, metalness: 0.4 });
  const matDark  = new T.MeshStandardMaterial({ color: 0x2a3240, roughness: 0.7, metalness: 0.3 });
  const matTire  = new T.MeshStandardMaterial({ color: 0x39414f, roughness: 0.85, metalness: 0.2 });
  const matRim   = new T.MeshStandardMaterial({ color: 0x3fd6c4, roughness: 0.4, metalness: 0.5,
                     emissive: 0x155049, emissiveIntensity: 0.8 });
  const matArm   = new T.MeshStandardMaterial({ color: 0x3fd6c4, roughness: 0.4, metalness: 0.5,
                     emissive: 0x0d3d38, emissiveIntensity: 0.6 });
  const matJoint = new T.MeshStandardMaterial({ color: 0xffc233, roughness: 0.3, metalness: 0.6,
                     emissive: 0x5a3f00, emissiveIntensity: 0.7 });
  const matGrip  = new T.MeshStandardMaterial({ color: 0xff7d6b, roughness: 0.4, metalness: 0.4,
                     emissive: 0x4a1810, emissiveIntensity: 0.7 });

  function box(w, h, d, m) { const g = new T.Mesh(new T.BoxGeometry(w, h, d), m); g.castShadow = true; return g; }
  function cyl(r, h, m, seg) { const g = new T.Mesh(new T.CylinderGeometry(r, r, h, seg || 20), m); g.castShadow = true; return g; }

  // ---- build the rover ----------------------------------------------------
  // Local frame: +X forward (drive), +Y up, +Z right.
  const rover = new T.Group();
  scene.add(rover);

  const RIDE = R_WHEEL + 0.055;          // chassis-centre height → wheels flank the body
  const chassis = box(0.50, 0.11, 0.30, matBody);
  chassis.position.y = RIDE;
  rover.add(chassis);
  // electronics deck on top
  const deck = box(0.34, 0.05, 0.22, matDark);
  deck.position.set(-0.02, RIDE + 0.08, 0);
  rover.add(deck);

  const WX = { front: 0.21, mid: 0.0, rear: -0.21 };  // wheel longitudinal positions
  const HALF_W = 0.13;                                 // beam offset from centreline
  const WHEEL_Z = 0.095;                               // wheel offset outboard of beam

  const wheels = [];   // spinning wheel groups
  const steers = [];   // steering pivots: [L-front, L-rear, R-front, R-rear]
  const rockers = [];  // per-side suspension pivots

  function makeWheel() {
    const g = new T.Group();
    const R = R_WHEEL;
    const tire = new T.Mesh(new T.CylinderGeometry(R, R, 0.075, 26), matTire);
    tire.rotation.x = Math.PI / 2;          // cylinder axis → Z (the axle)
    tire.castShadow = true;
    g.add(tire);
    const rimRing = new T.Mesh(new T.TorusGeometry(R * 0.97, 0.014, 8, 28), matRim);
    g.add(rimRing);                          // torus lies in XY plane, axis Z → wheel rim
    const hub = new T.Mesh(new T.CylinderGeometry(R * 0.34, R * 0.34, 0.08, 14), matBody);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    for (let i = 0; i < 4; i++) {            // spokes make the spin readable
      const sp = box(R * 1.5, 0.02, 0.02, matBody);
      sp.rotation.z = (i / 4) * Math.PI;
      g.add(sp);
    }
    return g;
  }

  function buildSide(sign) {   // sign = +1 left (+Z), -1 right (-Z)
    const side = new T.Group();
    rover.add(side);
    const pivot = new T.Group();             // suspension articulation pivot at chassis
    pivot.position.set(0, RIDE, 0);
    side.add(pivot);
    rockers.push(pivot);

    const dy = R_WHEEL - RIDE;               // chassis centre → axle height (negative)
    // rocker beam running front→rear along the side, at axle height
    const beam = box(0.46, 0.03, 0.032, matBody);
    beam.position.set(-0.02, dy, sign * HALF_W);
    pivot.add(beam);
    // vertical link tying the beam up to the chassis
    const link = box(0.032, RIDE - R_WHEEL, 0.032, matBody);
    link.position.set(-0.02, dy / 2, sign * (HALF_W - 0.01));
    pivot.add(link);

    function mountWheel(x, steerable) {
      const station = new T.Group();
      station.position.set(x, dy, sign * HALF_W);
      pivot.add(station);
      let sp = station;
      if (steerable) { const st = new T.Group(); station.add(st); steers.push(st); sp = st; }
      const stub = cyl(0.018, 0.10, matDark, 10);
      stub.rotation.x = Math.PI / 2;         // axle stub along Z
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

  // ---- build the arm (3-DOF: yaw + shoulder + elbow, on the deck) ---------
  const armYaw = new T.Group();
  armYaw.position.set(0.0, RIDE + 0.11, 0);
  rover.add(armYaw);

  const armBaseMesh = cyl(0.05, 0.05, matJoint, 16);
  armYaw.add(armBaseMesh);

  const shoulder = new T.Group();
  shoulder.position.y = 0.03;
  armYaw.add(shoulder);
  const shoulderBall = new T.Mesh(new T.SphereGeometry(0.035, 16, 12), matJoint);
  shoulder.add(shoulderBall);

  const upper = box(L1, 0.035, 0.035, matArm);
  upper.geometry.translate(L1 / 2, 0, 0);   // pivot at proximal end
  shoulder.add(upper);

  const elbow = new T.Group();
  elbow.position.set(L1, 0, 0);
  shoulder.add(elbow);
  const elbowBall = new T.Mesh(new T.SphereGeometry(0.03, 16, 12), matJoint);
  elbow.add(elbowBall);

  const fore = box(L2, 0.03, 0.03, matArm);
  fore.geometry.translate(L2 / 2, 0, 0);
  elbow.add(fore);

  const eePivot = new T.Group();
  eePivot.position.set(L2, 0, 0);
  elbow.add(eePivot);
  // gripper: two little coral fingers
  const gripBase = box(0.03, 0.05, 0.05, matGrip);
  eePivot.add(gripBase);
  const f1 = box(0.05, 0.012, 0.012, matGrip); f1.position.set(0.03, 0, 0.018); eePivot.add(f1);
  const f2 = box(0.05, 0.012, 0.012, matGrip); f2.position.set(0.03, 0, -0.018); eePivot.add(f2);

  // ---- reference trajectory (the path the EE should track) ---------------
  // world-space loop: radius R_REF ring with sinusoidal height (his "sinusoidal-z")
  const refPts = [];
  for (let i = 0; i <= 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    refPts.push(new T.Vector3(
      R_REF * Math.cos(a),
      0.34 + 0.12 * Math.sin(a * 3),
      R_REF * Math.sin(a)
    ));
  }
  const refLine = new T.Line(
    new T.BufferGeometry().setFromPoints(refPts),
    new T.LineBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: 0.55 })
  );
  scene.add(refLine);

  // moving reference marker
  const target = new T.Mesh(
    new T.SphereGeometry(0.03, 16, 12),
    new T.MeshBasicMaterial({ color: 0xffc233 })
  );
  scene.add(target);
  const targetGlow = new T.Mesh(
    new T.SphereGeometry(0.06, 16, 12),
    new T.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.25 })
  );
  target.add(targetGlow);

  // EE actual-path trail (ring buffer of recent positions)
  const TRAIL = 160;
  const trailGeo = new T.BufferGeometry();
  const trailPos = new Float32Array(TRAIL * 3);
  trailGeo.setAttribute('position', new T.BufferAttribute(trailPos, 3));
  const trail = new T.Line(trailGeo, new T.LineBasicMaterial({
    color: 0x3fd6c4, transparent: true, opacity: 0.85
  }));
  scene.add(trail);
  let trailN = 0;

  // ---- IK: 2-link planar reach --------------------------------------------
  // Solve arm yaw + 2-link planar IK so the end-effector sits on worldTarget.
  // Yaw is solved in two steps for stability: zero the yaw, transform the
  // target into the arm-base frame, then apply the computed azimuth.
  const _tmp = new T.Vector3();
  function solveArmStable(worldTarget) {
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
    const clamped = d > dMax || d < dMin;
    d = Math.max(dMin, Math.min(dMax, d));
    const cE = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    const elbowInterior = Math.acos(Math.max(-1, Math.min(1, cE)));
    const cS = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const q1 = Math.atan2(h, r) + Math.acos(Math.max(-1, Math.min(1, cS)));
    shoulder.rotation.z = q1;
    elbow.rotation.z = elbowInterior - Math.PI;
    return { yaw, q1, elbowInterior, clamped };
  }

  // ---- telemetry overlay --------------------------------------------------
  const tele = document.getElementById('mms-tele');

  // ---- slip toggle (easter egg → his slip-adaptive MPC) -------------------
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
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 's' && inView) setSlip(!slip); });

  // ---- animation loop -----------------------------------------------------
  const worldTarget = new T.Vector3();
  const eeWorld = new T.Vector3();
  let theta = 0;            // rover angle around arena
  let prevX = R_BASE, prevZ = 0;
  let wheelSpin = 0;
  let slipAmt = 0;
  let clock = new T.Clock();
  let teleTick = 0;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);

    // drive the rover around the arena circle
    const omega = 0.32;                       // rad/s
    theta += omega * dt;
    slipAmt += ((slip ? 1 : 0) - slipAmt) * Math.min(1, dt * 2);  // ease slip in/out

    // slip: base drifts off the ideal circle + jitter
    const driftR = R_BASE + slipAmt * (0.12 * Math.sin(theta * 5.0) + 0.06 * Math.sin(theta * 11.0));
    const px = driftR * Math.cos(theta);
    const pz = driftR * Math.sin(theta);
    rover.position.set(px, slipAmt * 0.015 * Math.sin(theta * 9), pz);

    // heading from actual motion (robust under slip)
    const hx = px - prevX, hz = pz - prevZ;
    const heading = Math.atan2(hz, hx);
    // three.js yaw about Y: rotate so local +X points along heading
    rover.rotation.y = -heading;
    const speed = Math.hypot(hx, hz) / dt;   // m/s (actual ground speed)
    prevX = px; prevZ = pz;

    // wheels: spin (over-spin under slip → visible slip ratio)
    const slipRatio = 1 + slipAmt * 0.9;
    wheelSpin += (speed / R_WHEEL) * slipRatio * dt;
    for (const w of wheels) w.mesh.rotation.z = -wheelSpin;

    // steering: corners toward the turn (Ackermann-ish), front + / rear −
    const baseSteer = Math.atan((WX.front - WX.rear) / 2 / R_BASE);
    const wob = slipAmt * 0.16 * Math.sin(theta * 7);
    steers[0].rotation.y = steers[2].rotation.y = 0; // (re-set below per index)
    // steers order: [L-front, L-rear, R-front, R-rear]
    steers[0].rotation.y = baseSteer + wob;
    steers[2].rotation.y = baseSteer + wob;
    steers[1].rotation.y = -baseSteer - wob;
    steers[3].rotation.y = -baseSteer - wob;

    // rocker-bogie: gentle articulation (more under slip)
    const artA = 0.02 + slipAmt * 0.05;
    rockers[0].rotation.z = artA * Math.sin(theta * 6 + 0.0);
    rockers[1].rotation.z = artA * Math.sin(theta * 6 + 1.7);

    // reference target in WORLD space: inward ring, sinusoidal height,
    // phase-locked slightly ahead of the rover so the arm reaches inward
    const ta = theta + LEAD;                 // ideal ring (R_BASE), a step ahead of the rover
    worldTarget.set(
      R_REF * Math.cos(ta),
      0.34 + 0.12 * Math.sin(ta * 3),
      R_REF * Math.sin(ta)
    );
    target.position.copy(worldTarget);
    targetGlow.scale.setScalar(1 + 0.25 * Math.sin(performance.now ? theta * 20 : 0));

    // solve arm to keep end-effector on the reference
    const sol = solveArmStable(worldTarget);

    // actual EE world position → trail + tracking error
    eePivot.updateWorldMatrix(true, false);
    eeWorld.setFromMatrixPosition(eePivot.matrixWorld);
    // push into trail ring buffer
    if (trailN < TRAIL) {
      trailPos[trailN * 3] = eeWorld.x; trailPos[trailN * 3 + 1] = eeWorld.y; trailPos[trailN * 3 + 2] = eeWorld.z;
      trailN++;
      trailGeo.setDrawRange(0, trailN);
    } else {
      // shift left by one, append
      trailPos.copyWithin(0, 3);
      trailPos[(TRAIL - 1) * 3] = eeWorld.x;
      trailPos[(TRAIL - 1) * 3 + 1] = eeWorld.y;
      trailPos[(TRAIL - 1) * 3 + 2] = eeWorld.z;
    }
    trailGeo.attributes.position.needsUpdate = true;

    const err = eeWorld.distanceTo(worldTarget) * 1000; // mm

    // telemetry (throttled)
    teleTick += dt;
    if (tele && teleTick > 0.1) {
      teleTick = 0;
      tele.innerHTML =
        'BASE&nbsp;&nbsp;v=' + speed.toFixed(2) + ' m/s&nbsp;&nbsp;ψ=' + (heading * 57.3).toFixed(0).padStart(4) + '°<br>' +
        'ARM&nbsp;&nbsp;&nbsp;q1=' + (sol.q1 * 57.3).toFixed(0).padStart(4) + '°&nbsp;&nbsp;q2=' + (sol.elbowInterior * 57.3).toFixed(0).padStart(4) + '°<br>' +
        'EE&nbsp;&nbsp;&nbsp;&nbsp;err=' + err.toFixed(1).padStart(5) + ' mm&nbsp;&nbsp;' + (slip ? '<b class="warn">SLIP</b>' : '<b class="ok">LOCK</b>');
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // ---- sizing + visibility-gated loop ------------------------------------
  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let running = false, inView = false, rafId = 0;
  function loop() { if (!running) return; frame(); rafId = requestAnimationFrame(loop); }
  function start() { if (running) return; running = true; clock.start(); loop(); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  // render one static frame immediately (and for reduced-motion, stop there)
  resize(); frame();

  if (!RM) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      inView = e.isIntersecting;
      if (inView) start(); else stop();
    }), { threshold: 0.05 });
    io.observe(mount);
  }
})();
