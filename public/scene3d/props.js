// The weed plant in the foreground and the black cat on the top shelf,
// ported unchanged from the validated prototype.
(function (global) {
  const S3 = global.S3;
  if (!S3) return;
  const { THREE, toon, basic, box, blob, ramp, mulberry32, budGeo, pistilGeo, pistilMat } = S3;
  // the prototype keys bud colours by 'G' / 'P'
  const BUD_COLORS = { G: S3.BUD_COLORS.green, P: S3.BUD_COLORS.purple };

  function makeCat(parent, x, y, z) {
    const C = new THREE.Group(); C.position.set(x, y, z); C.rotation.y = Math.PI / 2;
    const fur = toon(0x1a141c);
    blob(C, 0.16, 0.15, 0.19, 0, 0.14, 0.06, fur);                       // haunches
    const chest = blob(C, 0.11, 0.13, 0.1, 0, 0.24, -0.08, fur); chest.rotation.x = -0.35;
    [-1, 1].forEach((sd) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.17, 6), fur); leg.position.set(sd * 0.045, 0.085, -0.13); C.add(leg);
      blob(C, 0.036, 0.022, 0.045, sd * 0.045, 0.02, -0.14, fur);       // paws
      blob(C, 0.05, 0.03, 0.09, sd * 0.11, 0.03, 0.07, fur);            // tucked back feet
    });
    const head = new THREE.Group(); head.position.set(0, 0.39, -0.11); head.rotation.y = 1.3; C.add(head);
    blob(head, 0.115, 0.1, 0.105, 0, 0, 0, fur);
    blob(head, 0.125, 0.065, 0.085, 0, -0.035, -0.015, fur);            // cheeks
    blob(head, 0.045, 0.03, 0.03, 0, -0.045, -0.085, toon(0x2a222c));   // muzzle
    const nose = new THREE.Mesh(new THREE.CircleGeometry(0.013, 3), basic(0xd98a9a)); nose.rotation.set(0, Math.PI, Math.PI / 2); nose.position.set(0, -0.025, -0.112); head.add(nose);
    const eyes = new THREE.Group(); head.add(eyes);
    [-1, 1].forEach((sd) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.085, 4), fur); ear.position.set(sd * 0.068, 0.095, 0.005); ear.rotation.set(0, Math.PI / 4, -sd * 0.28); head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.045, 4), toon(0x3a2430)); inner.position.set(sd * 0.068, 0.088, -0.03); inner.rotation.set(0, Math.PI / 4, -sd * 0.28); head.add(inner);
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), basic(0xffd34d)); eye.rotation.y = Math.PI; eye.position.set(sd * 0.046, 0.012, -0.1); eyes.add(eye);
      const pupil = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.042), basic(0x0c090c)); pupil.rotation.y = Math.PI; pupil.position.set(sd * 0.046, 0.012, -0.102); eyes.add(pupil);
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), basic(0xfff6d8)); glint.rotation.y = Math.PI; glint.position.set(sd * 0.046 + 0.012, 0.024, -0.103); eyes.add(glint);
    });
    // tail: a chain of beads hanging over the shelf edge
    const tail = new THREE.Group(); tail.position.set(-0.2, 0.05, 0.12); C.add(tail);
    let seg = tail;
    for (let i = 0; i < 6; i++) { const sg = new THREE.Group(); sg.position.y = i ? -0.075 : 0; sg.rotation.x = i ? 0.12 : 0; seg.add(sg); blob(sg, 0.03, 0.045, 0.03, 0, -0.035, 0, fur); seg = sg; }
    parent.add(C);
    return { tail, eyes, chest };
  }

  function makeLeaf(scale, color) {
    const leaf = new THREE.Group(), mat = new THREE.MeshToonMaterial({ color, gradientMap: ramp, side: THREE.DoubleSide });
    [[-1.3, 0.45], [-0.85, 0.68], [-0.42, 0.88], [0, 1], [0.42, 0.88], [0.85, 0.68], [1.3, 0.45]].forEach(([a, l]) => {
      const len = 0.42 * l * scale;
      const w = 0.045 * scale;
      const lf = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(w, len * 0.4), new THREE.Vector2(0, len), new THREE.Vector2(-w, len * 0.4)])), mat);
      const piv = new THREE.Group(); piv.rotation.z = a; piv.add(lf); leaf.add(piv);
    });
    return leaf;
  }

  function makePlant(parent, x, y, z) {
    const P = new THREE.Group(); P.position.set(x, y, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.6, 12), toon(0x3a3438)); pot.position.y = 0.3; P.add(pot);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.03, 4, 12), toon(0x4a4448)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; P.add(rim);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.02, 12), toon(0x2a1a10)); soil.position.y = 0.58; P.add(soil);
    const stemH = 2.0;
    // stem: thin, darker, and kinked a little at each node instead of one straight pole
    const stemMat = toon(0x40602a), up = new THREE.Vector3(0, 1, 0);
    let prev = new THREE.Vector3(0, 0.58, 0);
    for (let k = 1; k <= 9; k++) {
      const next = new THREE.Vector3(k === 9 ? 0 : (k % 2 ? 0.03 : -0.03), 0.58 + k * stemH / 9, 0);
      const dir = next.clone().sub(prev), len = dir.length();
      const r0 = 0.03 * (1 - (k - 1) / 9) + 0.004, r1 = 0.03 * (1 - k / 9) + 0.004;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 5), stemMat);
      seg.position.copy(prev).addScaledVector(dir, 0.5); seg.quaternion.setFromUnitVectors(up, dir.normalize()); P.add(seg);
      prev = next;
    }
    const rnd = mulberry32(42), leafCols = [0x3f7a2c, 0x4c8a33, 0x2f6324];
    const budC = BUD_COLORS.G;
    function budCluster(at, count, spread, size) {
      for (let i = 0; i < count; i++) {
        const b = new THREE.Mesh(budGeo, toon(budC[Math.floor(rnd() * 5)]));
        b.position.set(at.x + (rnd() - 0.5) * spread, at.y + rnd() * spread * 1.6, at.z + (rnd() - 0.5) * spread);
        b.scale.set(size, size * 1.3, size); b.rotation.set(rnd() * 6, rnd() * 6, 0); P.add(b);
        if (rnd() < 0.6) { const p = new THREE.Mesh(pistilGeo, pistilMat); p.scale.setScalar(0.02); p.position.copy(b.position).add(new THREE.Vector3(size * 0.8, size * 0.5, 0)); P.add(p); }
      }
    }
    const NODES = 8;
    for (let i = 0; i < NODES; i++) {
      const y0 = 0.72 + i * 0.235, a = i * 2.4, len = 0.62 - i * 0.06;
      const br = new THREE.Group(); br.position.y = y0; br.rotation.y = a; P.add(br);
      const tilt = 0.75;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, len, 5), toon(0x4a6e30));
      stick.rotation.z = -tilt; stick.position.set(Math.sin(tilt) * len / 2, Math.cos(tilt) * len / 2, 0); br.add(stick);
      const tip = new THREE.Vector3(Math.sin(tilt) * len, Math.cos(tilt) * len, 0);
      // fan leaf drooping off the branch tip
      const holder = new THREE.Group(); holder.position.copy(tip); holder.rotation.set(0, 0, -1.1); br.add(holder);
      const leaf = makeLeaf(1.4 - i * 0.08, leafCols[i % 3]); leaf.rotation.x = -1.0; holder.add(leaf);
      // second leaf straight off the stem, opposite side
      const h2 = new THREE.Group(); h2.position.y = 0.05; h2.rotation.set(0, Math.PI, -1.25); br.add(h2);
      const leaf2 = makeLeaf(1.1 - i * 0.06, leafCols[(i + 1) % 3]); leaf2.rotation.x = -0.9; h2.add(leaf2);
      // small bud site at the tip
      const w = tip.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(new THREE.Vector3(0, y0, 0));
      budCluster(w, 3 + (i % 3), 0.1, 0.05);
    }
    // main cola: fat at the base, narrowing to a point, with sugar leaves poking out
    const topY = 0.6 + stemH;
    for (let i = 0; i < 22; i++) {
      const f = i / 21, y = topY - 0.6 + f * 0.62, rad = 0.13 * (1 - f) + 0.02, a = i * 2.3;
      const b = new THREE.Mesh(budGeo, toon(budC[Math.floor(rnd() * 5)]));
      const sz = 0.07 * (1 - f * 0.6);
      b.position.set(Math.cos(a) * rad * rnd(), y, Math.sin(a) * rad * rnd()); b.scale.set(sz, sz * 1.3, sz); b.rotation.set(rnd() * 6, rnd() * 6, 0); P.add(b);
      if (rnd() < 0.7) { const pp = new THREE.Mesh(pistilGeo, pistilMat); pp.scale.setScalar(0.02); pp.position.copy(b.position).add(new THREE.Vector3(sz * 0.8, sz * 0.6, 0)); P.add(pp); }
    }
    [0, 2.1, 4.2].forEach((a, i) => {
      const h = new THREE.Group(); h.position.y = topY - 0.35 + i * 0.12; h.rotation.set(0, a, -0.5); P.add(h);
      const sl = makeLeaf(0.45, leafCols[1]); sl.rotation.x = -0.4; h.add(sl);
    });
    parent.add(P);
    return P;
  }


  Object.assign(S3, { makeCat, makeLeaf, makePlant });
})(window);
