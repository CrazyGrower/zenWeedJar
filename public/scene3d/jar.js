// One screw-top jar: glass, coloured lid with a gold rim, buds you can see
// through the glass, a tape label, and the drop-in animation.
(function (global) {
  const S3 = global.S3;
  const M = global.StashModel;
  const T = global.TapeLabel;
  if (!S3 || !M || !T) return;
  const { THREE, toon, basic, mulberry32, BUD_COLORS, budGeo, pistilGeo, budMat, pistilMat, shared, disposeTree } = S3;

  const glassMat = shared(new THREE.MeshPhongMaterial({ color: 0xcfe8e2, transparent: true, opacity: 0.2, shininess: 90, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false }));
  const jarGeo = shared(new THREE.LatheGeometry([[0, 0], [0.36, 0], [0.4, 0.04], [0.4, 0.86], [0.36, 0.93], [0.31, 0.97], [0.31, 1.06]].map(([x, y]) => new THREE.Vector2(x, y)), 18));
  const JAR_R = 0.33, JAR_TOP = 0.9;
  const LABEL_ANCHOR = [0, 0.66, 0.41];

  function createJarView(jar, x, y, labelsEl) {
    const g = new THREE.Group();
    g.position.set(x, y, 0.35);
    const capHex = parseInt(M.capColor(jar.color_tag).slice(1), 16);
    const glass = new THREE.Mesh(jarGeo, glassMat); glass.renderOrder = 2; g.add(glass);
    const lidG = new THREE.Group(); g.add(lidG);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.13, 18), toon(capHex)); band.position.y = 1.08; lidG.add(band);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.018, 3, 18), toon(0xc9a24a)); rim.rotation.x = Math.PI / 2; rim.position.y = 1.02; lidG.add(rim);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 18), toon(capHex)); disc.position.y = 1.155; lidG.add(disc);
    [0.99, 1.02].forEach((ty) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.01, 3, 18), basic(0xdff2ec, { transparent: true, opacity: 0.45 })); t.rotation.x = Math.PI / 2; t.position.y = ty; g.add(t); });
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.55), basic(0xffffff, { transparent: true, opacity: 0.45, depthWrite: false }));
    shine.position.set(-0.22, 0.48, 0.35); shine.rotation.y = -0.6; shine.renderOrder = 3; g.add(shine);

    // buds: generated once up to the brim, seeded by id so they never jump,
    // and shown up to the current fill level
    const palette = BUD_COLORS[M.budTint(jar.color_tag)];
    const rnd = mulberry32(Number(jar.id) * 2654435761);
    const buds = [];
    for (let by = 0.07; by < JAR_TOP + 0.06; by += 0.07) for (let i = 0; i < 11; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (JAR_R - 0.04);
      buds.push({ x: Math.cos(a) * r, y: by + rnd() * 0.03, z: Math.sin(a) * r, s: 0.06 + rnd() * 0.035, rx: rnd() * 6, ry: rnd() * 6, c: palette[Math.floor(rnd() * 4)], frost: rnd() < 0.15 });
    }
    buds.sort((a, b) => a.y - b.y);
    const inst = new THREE.InstancedMesh(budGeo, budMat, buds.length);
    const pist = new THREE.InstancedMesh(pistilGeo, pistilMat, buds.length);
    const col = new THREE.Color();
    buds.forEach((b, i) => inst.setColorAt(i, col.setHex(b.frost ? palette[4] : b.c)));
    g.add(inst, pist);

    const el = T.createCanvas(global.document);
    labelsEl.appendChild(el);

    glass.userData.jarId = jar.id;
    const view = { id: jar.id, jar, group: g, glass, lidG, inst, pist, buds, el, baseY: y, anchor: new THREE.Vector3().fromArray(LABEL_ANCHOR), dropAt: null };
    settleBuds(view);
    updateJarView(view, jar);
    return view;
  }

  function updateJarView(view, jar) {
    view.jar = jar;
    const level = 0.05 + M.fillFraction(jar.weight_g) * (JAR_TOP - 0.05);
    let n = 0;
    while (n < view.buds.length && view.buds[n].y <= level) n++;
    if (!(Number(jar.weight_g) > 0)) n = 0;
    view.inst.count = n; view.pist.count = n;
    T.paint(view.el, M.tapeLines(jar));
  }

  const mtx = new THREE.Object3D();
  function placeBud(v, i, x, y, z, spin, k) {
    const b = v.buds[i];
    mtx.position.set(x, y, z); mtx.rotation.set(b.rx + spin, b.ry + spin * 0.7, 0); mtx.scale.set(b.s * k, b.s * 1.25 * k, b.s * k); mtx.updateMatrix();
    v.inst.setMatrixAt(i, mtx.matrix);
    mtx.position.set(x + Math.cos(b.ry) * b.s * 0.9, y + b.s * 0.5, z + Math.sin(b.ry) * b.s * 0.9);
    mtx.rotation.set(0, 0, 0); mtx.scale.setScalar(0.018 * k); mtx.updateMatrix(); v.pist.setMatrixAt(i, mtx.matrix);
  }
  function settleBuds(v) {
    v.buds.forEach((b, i) => placeBud(v, i, b.x, b.y, b.z, 0, 1));
    v.inst.instanceMatrix.needsUpdate = true; v.pist.instanceMatrix.needsUpdate = true;
    v.lidG.visible = true; v.lidG.position.y = 0; v.lidG.rotation.y = 0; v.el.style.opacity = '';
  }

  // Drop-in: buds fall through the open neck one after another at a steady
  // pace (so a heavier jar pours longer) and bounce into place, then the lid
  // pops in and screws down and the tape appears.
  const BUD_STEP_MS = 13, BUD_MS = 420, LID_MS = 500;
  function bounce(p) {
    const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
    return n * (p -= 2.625 / d) * p + 0.984375;
  }
  function animateDrop(v, e) {
    const n = v.inst.count;
    for (let i = 0; i < n; i++) {
      const b = v.buds[i], p = Math.min(1, Math.max(0, (e - i * BUD_STEP_MS) / BUD_MS));
      if (p <= 0) { placeBud(v, i, 0, 1.15, 0, 0, 0); continue; }
      const sy = 1.12 + (i % 3) * 0.02, q = bounce(p);
      const spread = 0.25 + 0.75 * Math.min(1, p * 1.6);
      placeBud(v, i, b.x * spread, sy + (b.y - sy) * q, b.z * spread, (1 - p) * 5, 1);
    }
    v.inst.instanceMatrix.needsUpdate = true; v.pist.instanceMatrix.needsUpdate = true;
    const fallEnd = (n ? (n - 1) * BUD_STEP_MS : 0) + BUD_MS;
    const q = Math.min(1, Math.max(0, (e - fallEnd) / LID_MS)), ease = 1 - Math.pow(1 - q, 3);
    v.lidG.visible = q > 0; v.lidG.position.y = 0.1 * (1 - ease); v.lidG.rotation.y = (1 - ease) * 6;
    v.el.style.opacity = String(q);
    return q >= 1;
  }

  function disposeJarView(view) {
    if (view.group.parent) view.group.parent.remove(view.group);
    disposeTree(view.group);
    view.el.remove();
  }

  Object.assign(S3, { createJarView, updateJarView, settleBuds, animateDrop, disposeJarView });
})(window);
