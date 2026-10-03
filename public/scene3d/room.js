// The room around the shelves: wall, window over the hills (sunset or night),
// floor, shelves, props. Rebuilt whenever the mode or the shelf count changes.
(function (global) {
  const S3 = global.S3;
  if (!S3) return;
  const { THREE, toon, basic, box, flatShape, mulberry32, makeCat, makePlant } = S3;

  const SHELF_X = [0, 0.98, 1.96];
  const SHELF_BASE = 0.9;
  const SHELF_GAP = 1.4;
  // index 0 is the top shelf
  function shelfY(index, shelves) { return SHELF_BASE + (shelves - 1 - index) * SHELF_GAP; }

  function buildRoom(root, scene, mode, shelfYs) {
    const sunset = mode !== 'night';
    const topY = shelfYs[shelfYs.length - 1];
    // tall enough to fill a portrait screen above the top shelf
    const wallH = topY + 6;
    scene.background = new THREE.Color(sunset ? 0x24162a : 0x0f1222);
    root.add(new THREE.AmbientLight(sunset ? 0x7a5a7a : 0x5a6290, sunset ? 0.55 : 0.6));
    const key = new THREE.DirectionalLight(sunset ? 0xff9a5a : 0x9fb4ff, sunset ? 0.85 : 0.55); key.position.set(-5, 2.2, 3); root.add(key);
    const lamp = new THREE.PointLight(0xffc37a, sunset ? 0.8 : 1.3, 6 + shelfYs.length, 1.6); lamp.position.set(1.6, topY + 0.8, 1.2); root.add(lamp);

    // wide enough that the edges stay off screen when the camera backs away for more shelves
    box(root, 24, wallH, 0.1, sunset ? 0x3a2c44 : 0x2b2a44, 0.4, wallH / 2 - 1.2, -0.05);
    for (let x = -11.6; x < 12.4; x += 0.6) box(root, 0.06, wallH, 0.02, sunset ? 0x33263c : 0x25243c, x, wallH / 2 - 1.2, 0.01);
    box(root, 24, 0.1, 8, 0x3a2b34, 0.4, -0.45, 3.8);
    box(root, 24, 0.18, 0.06, 0x1d1c30, 0.4, -0.31, 0.03);
    box(root, 2.2, 0.02, 1.2, 0x7a3a3a, 1.1, -0.39, 1.4);
    box(root, 2.0, 0.025, 1.0, 0x9a5a48, 1.1, -0.385, 1.4);

    // window and the view through it
    const wx = -1.65, wy = 2.0, W = 1.3, H = 1.7, L = wx - W / 2, B = wy - H / 2;
    const view = new THREE.Group(); root.add(view);
    const bands = sunset ? [0x3b2a5c, 0x7a3a6e, 0xc4507a, 0xf08a4b, 0xffc46a] : [0x0d1230, 0x141a40, 0x1d2a5a, 0x26346a, 0x2e3e78];
    bands.forEach((c, i) => box(view, W, H / bands.length + 0.002, 0.01, basic(c), wx, wy + H / 2 - (i + 0.5) * H / bands.length, 0.02));
    const sr = mulberry32(3);
    if (sunset) {
      const sun = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), basic(0xffe08a)); sun.position.set(wx + 0.22, B + 0.45, 0.026); view.add(sun);
      [[0.35, 0.55, 0.5], [-0.3, 0.3, 0.38], [0.1, 0.72, 0.3]].forEach(([dx, dy, w]) => box(view, w, 0.035, 0.005, basic(0xff9fa0), wx + dx, wy + dy, 0.028));
    } else {
      const moon = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), basic(0xf4f1dc)); moon.position.set(wx + 0.3, wy + 0.5, 0.026); view.add(moon);
      for (let i = 0; i < 16; i++) box(view, 0.02, 0.02, 0.005, basic(0xdfe6ff), L + 0.05 + sr() * (W - 0.1), wy + sr() * 0.8, 0.027);
    }
    const far = [[L, B + 0.42]]; for (let i = 0; i <= 8; i++) far.push([L + i * W / 8, B + 0.38 + Math.sin(i * 1.3) * 0.08 + 0.05]); far.push([L + W, B], [L, B]);
    flatShape(view, far, sunset ? 0x8a3f6a : 0x1a1f3c, 0.03);
    const near = [[L, B + 0.22]]; for (let i = 0; i <= 8; i++) near.push([L + i * W / 8, B + 0.2 + Math.cos(i * 0.9) * 0.07]); near.push([L + W, B], [L, B]);
    flatShape(view, near, sunset ? 0x3a1f40 : 0x0e1128, 0.032);
    [0.12, 0.2, 0.95, 1.05, 1.13].forEach((dx, i) => { const h = 0.16 + (i % 2) * 0.06, bx = L + dx, by = B + 0.2 + Math.cos((dx / W * 8) * 0.9) * 0.06; flatShape(view, [[bx - 0.05, by], [bx + 0.05, by], [bx, by + h]], sunset ? 0x2a1630 : 0x0a0c1e, 0.034); });
    box(view, 0.1, 0.07, 0.005, basic(sunset ? 0x2a1630 : 0x0a0c1e), L + 0.62, B + 0.31, 0.034);
    box(view, 0.025, 0.025, 0.005, basic(0xffd27a), L + 0.62, B + 0.31, 0.036);
    const frame = 0x5a3422;
    box(root, W + 0.16, 0.1, 0.12, frame, wx, wy + H / 2 + 0.03, 0.06); box(root, W + 0.16, 0.1, 0.12, frame, wx, wy - H / 2 - 0.03, 0.06);
    box(root, 0.1, H + 0.16, 0.12, frame, L - 0.03, wy, 0.06); box(root, 0.1, H + 0.16, 0.12, frame, L + W + 0.03, wy, 0.06);
    box(root, 0.06, H, 0.08, frame, wx, wy, 0.05); box(root, W, 0.06, 0.08, frame, wx, wy + 0.1, 0.05);
    box(root, W + 0.3, 0.08, 0.5, 0x8a5434, wx, B - 0.1, 0.25);
    const cpot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 10), toon(0xc4614a)); cpot.position.set(wx - 0.3, B + 0.03, 0.25); root.add(cpot);
    const cac = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.28, 8), toon(0x5e9c5a)); cac.position.set(wx - 0.3, B + 0.25, 0.25); root.add(cac);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.7), basic(sunset ? 0xffa060 : 0x9fb4ff, { transparent: true, opacity: sunset ? 0.16 : 0.12, depthWrite: false }));
    beam.rotation.x = -Math.PI / 2; beam.position.set(-1.1, -0.38, 1.1); root.add(beam);

    // shelves
    const sx = 1.25;
    shelfYs.forEach((y) => {
      box(root, 3.7, 0.1, 0.7, 0x8a5434, sx, y, 0.35);
      box(root, 3.7, 0.025, 0.025, 0xb5723f, sx, y + 0.05, 0.7);
      box(root, 0.06, 0.25, 0.06, 0x1a1214, sx - 1.5, y - 0.15, 0.08); box(root, 0.06, 0.25, 0.06, 0x1a1214, sx + 1.5, y - 0.15, 0.08);
    });
    const cat = makeCat(root, 2.78, topY + 0.05, 0.5);
    const lowY = shelfYs[0];
    [[0x6fa3c7, 0.42], [0xc4614a, 0.36], [0xd9cfa8, 0.4]].forEach(([c, h], i) => box(root, 0.1, h, 0.45, c, 2.72 + i * 0.12, lowY + 0.05 + h / 2, 0.35));
    const lean = box(root, 0.1, 0.38, 0.45, 0x79a67e, 3.0, lowY + 0.23, 0.35); lean.rotation.z = -0.35;
    const grinder = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 12), toon(0x9aa0a8)); grinder.position.set(2.55, lowY + 0.12, 0.55); root.add(grinder);

    makePlant(root, 3.3, -0.4, 1.2);
    return { cat, sunset };
  }

  Object.assign(S3, { SHELF_X, shelfY, buildRoom });
})(window);
