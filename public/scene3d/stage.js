// The public face of the 3D shelf: window.Scene3D. Renders at a quarter of
// the screen resolution and lets the browser upscale with hard pixels.
(function (global) {
  const S3 = global.S3;
  const M = global.StashModel;
  const T = global.TapeLabel;
  if (!S3 || !S3.buildRoom || !S3.createJarView || !M || !T) return;
  const { THREE, mulberry32 } = S3;

  const PIX = 4;
  const HALF_W = 2.25;
  const YAW0 = -0.06;
  const reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let renderer = null, scene = null, camera = null, canvas = null, labelsEl = null;
  let root = null, cat = null, mode = 'sunset', shelves = 0;
  let views = new Map();      // jar id -> JarView
  let knownIds = null;        // ids seen by the previous setJars, null before the first
  let lastJars = [];
  let selected = null;
  let clickCb = null;
  const target = new THREE.Vector3(0.95, 1.6, 0.45);
  let halfH = 1.65, yaw = YAW0, pitch = 0.08, yawT = yaw, pitchT = pitch, dist = 8;

  // dust motes in the light
  const DN = 70, dustPos = new Float32Array(DN * 3), dr = mulberry32(7);
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xffe6b0, size: 1, sizeAttenuation: false, transparent: true, opacity: 0.6 });
  const dust = new THREE.Points(dustGeo, dustMat);
  let dustTop = 3.3;

  function shelfYs() {
    const ys = [];
    for (let i = shelves - 1; i >= 0; i--) ys.push(S3.shelfY(i, shelves)); // bottom to top
    return ys;
  }

  function fit() {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    dist = Math.max(halfH / t, HALF_W / (t * camera.aspect)) + 0.9;
  }
  function placeCamera() {
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
  }
  function resize() {
    const w = canvas.clientWidth || global.innerWidth, h = canvas.clientHeight || global.innerHeight;
    renderer.setSize(Math.max(1, Math.floor(w / PIX)), Math.max(1, Math.floor(h / PIX)), false);
    camera.aspect = w / h; fit(); camera.updateProjectionMatrix();
  }

  function rebuildRoom() {
    views.forEach((v) => S3.disposeJarView(v));
    views = new Map();
    if (root) scene.remove(root);
    root = new THREE.Group(); scene.add(root);
    const ys = shelfYs();
    const built = S3.buildRoom(root, scene, mode, ys);
    cat = built.cat;
    dustMat.color.setHex(built.sunset ? 0xffc890 : 0xdfe6ff);
    const top = ys[ys.length - 1];
    dustTop = top + 1;
    for (let i = 0; i < DN; i++) { dustPos[i * 3] = -0.9 + dr() * 3.2; dustPos[i * 3 + 1] = 0.1 + dr() * (dustTop - 0.1); dustPos[i * 3 + 2] = dr() * 1.3; }
    dustGeo.attributes.position.needsUpdate = true;
    root.add(dust);
    target.y = (ys[0] + top) / 2 + 0.5;
    halfH = (top - ys[0]) / 2 + 0.95;
    if (camera) fit();
  }

  function placeJars(jars, animateIds) {
    const { slots } = M.layoutShelves(jars);
    const keep = new Set(slots.map((s) => s.jar.id));
    views.forEach((v, id) => { if (!keep.has(id)) { S3.disposeJarView(v); views.delete(id); } });
    const now = performance.now();
    slots.forEach((s, k) => {
      const x = S3.SHELF_X[s.col], y = S3.shelfY(s.shelf, shelves) + 0.05;
      let v = views.get(s.jar.id);
      if (v && (v.group.position.x !== x || v.baseY !== y)) { S3.disposeJarView(v); views.delete(s.jar.id); v = null; }
      if (!v) {
        v = S3.createJarView(s.jar, x, y, labelsEl);
        root.add(v.group);
        views.set(s.jar.id, v);
      } else {
        if (v.dropAt != null) { v.dropAt = null; S3.settleBuds(v); }
        S3.updateJarView(v, s.jar);
      }
      if (animateIds.has(s.jar.id)) { v.dropAt = now + 500 + k * 280; S3.animateDrop(v, -1); }
    });
  }

  function setJars(jars) {
    if (!renderer) return;
    lastJars = jars || [];
    const animate = new Set(M.dropTargets(knownIds, lastJars, reduceMotion));
    knownIds = new Set(lastJars.map((j) => j.id));
    const need = M.shelfCount(lastJars.length);
    if (need !== shelves) { shelves = need; rebuildRoom(); }
    placeJars(lastJars, animate);
  }

  function setMode(next) {
    if (!renderer) return;
    mode = next === 'night' ? 'night' : 'sunset';
    rebuildRoom();
    placeJars(lastJars, new Set());
  }

  // ---------- pointer ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const glasses = [...views.values()].map((v) => v.glass);
    const hit = ray.intersectObjects(glasses, false)[0];
    return hit ? hit.object.userData.jarId : null;
  }
  function bindPointer() {
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw: yawT, pitch: pitchT, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) { down.moved = true; canvas.classList.add('dragging'); }
        yawT = THREE.MathUtils.clamp(down.yaw - dx * 0.006, YAW0 - 0.3, YAW0 + 0.3);
        pitchT = THREE.MathUtils.clamp(down.pitch + dy * 0.003, 0, 0.22);
      } else {
        canvas.classList.toggle('hover', pick(e) != null);
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      canvas.classList.remove('dragging');
      if (down && !down.moved) { const id = pick(e); if (id != null && clickCb) clickCb(id); }
      down = null;
    });
  }

  // ---------- loop ----------
  const clock = new THREE.Clock(), tmp = new THREE.Vector3();
  function tick() {
    const t = clock.getElapsedTime();
    yaw += (yawT - yaw) * 0.15; pitch += (pitchT - pitch) * 0.15;
    if (Math.abs(yawT - yaw) < 0.0005) yaw = yawT;
    if (Math.abs(pitchT - pitch) < 0.0005) pitch = pitchT;
    placeCamera();
    const w = canvas.clientWidth, h = canvas.clientHeight, now = performance.now();
    views.forEach((v) => {
      v.group.position.y = v.baseY + (v.id === selected ? 0.06 : 0);
      if (v.dropAt != null && S3.animateDrop(v, now - v.dropAt)) { v.dropAt = null; S3.settleBuds(v); }
      v.group.updateMatrixWorld();
      tmp.copy(v.anchor); v.group.localToWorld(tmp); tmp.project(camera);
      const lx = Math.round((tmp.x + 1) / 2 * w - (T.TAPE_W * T.CSS_SCALE) / 2);
      const ly = Math.round((1 - tmp.y) / 2 * h - (T.TAPE_H * T.CSS_SCALE) / 2);
      v.el.style.transform = `translate(${lx}px,${ly}px)`;
    });
    if (!reduceMotion && cat) {
      cat.tail.rotation.z = Math.sin(t * 1.3) * 0.25;
      cat.eyes.scale.y = (t % 4.3) < 0.14 ? 0.15 : 1;
      cat.chest.scale.y = 0.13 * (1 + Math.sin(t * 2.2) * 0.02);
    }
    if (!reduceMotion) {
      const p = dustGeo.attributes.position;
      for (let i = 0; i < DN; i++) { let y = p.getY(i) + 0.0015; if (y > dustTop) y = 0.1; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t + i) * 0.0008); }
      p.needsUpdate = true;
    }
    renderer.render(scene, camera);
    global.requestAnimationFrame(tick);
  }

  function mount(canvasEl, labels, opts) {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false });
    } catch (err) {
      renderer = null;
      return false;
    }
    renderer.setPixelRatio(1);
    canvas = canvasEl; labelsEl = labels;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    mode = opts && opts.mode === 'night' ? 'night' : 'sunset';
    shelves = M.MIN_SHELVES;
    rebuildRoom();
    bindPointer();
    global.addEventListener('resize', resize);
    resize();
    // tape labels are drawn with the pixel fonts: repaint once they arrive
    if (global.document.fonts) {
      Promise.all([global.document.fonts.load('600 10px "Pixelify Sans"'), global.document.fonts.load('15px "Jersey 10"')])
        .then(() => views.forEach((v) => S3.updateJarView(v, v.jar))).catch(() => {});
    }
    tick();
    return true;
  }

  global.Scene3D = {
    mount,
    isMounted: () => !!renderer,
    setJars,
    setMode,
    onJarClick(cb) { clickCb = cb; },
    select(id) { selected = id; },
  };
})(window);
