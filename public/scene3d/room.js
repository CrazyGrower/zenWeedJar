// The room around the shelves: wall, window over the hills (sunset, day or night),
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

  // Everything that changes with the light. 'sunset' serves dawn and dusk.
  const SKIES = {
    sunset: {
      bg: 0x24162a, ambient: [0x7a5a7a, 0.55], key: [0xff9a5a, 0.85], lamp: 0.8,
      wall: 0x3a2c44, stripe: 0x33263c,
      bands: [0x3b2a5c, 0x7a3a6e, 0xc4507a, 0xf08a4b, 0xffc46a],
      far: 0x8a3f6a, near: 0x3a1f40, trees: 0x2a1630, houseLit: true,
      beam: [0xffa060, 0.16], dust: 0xffc890,
    },
    day: {
      bg: 0x8fb8d8, ambient: [0xdcdcec, 0.5], key: [0xfff0d8, 0.72], lamp: 0.2,
      wall: 0x4e4458, stripe: 0x473e50,
      bands: [0x4f92d6, 0x64a6e0, 0x7cb8e8, 0x98caee, 0xbcdff2],
      far: 0x6ea456, near: 0x3f7a3a, trees: 0x2c5a2c, houseLit: false,
      beam: [0xfff0c0, 0.22], dust: 0xfff4d8,
    },
    night: {
      bg: 0x0f1222, ambient: [0x5a6290, 0.6], key: [0x9fb4ff, 0.55], lamp: 1.3,
      wall: 0x2b2a44, stripe: 0x25243c,
      bands: [0x0d1230, 0x141a40, 0x1d2a5a, 0x26346a, 0x2e3e78],
      far: 0x1a1f3c, near: 0x0e1128, trees: 0x0a0c1e, houseLit: true,
      beam: [0x9fb4ff, 0.12], dust: 0xdfe6ff,
    },
  };

  function buildRoom(root, scene, mode, shelfYs) {
    const sky = SKIES[mode] || SKIES.sunset;
    const topY = shelfYs[shelfYs.length - 1];
    // tall enough to fill a portrait screen above the top shelf
    const wallH = topY + 6;
    scene.background = new THREE.Color(sky.bg);
    root.add(new THREE.AmbientLight(sky.ambient[0], sky.ambient[1]));
    const key = new THREE.DirectionalLight(sky.key[0], sky.key[1]); key.position.set(-5, 2.2, 3); root.add(key);
    const lamp = new THREE.PointLight(0xffc37a, sky.lamp, 6 + shelfYs.length, 1.6); lamp.position.set(1.6, topY + 0.8, 1.2); root.add(lamp);

    // wide enough that the edges stay off screen when the camera backs away for more shelves
    box(root, 24, wallH, 0.1, sky.wall, 0.4, wallH / 2 - 1.2, -0.05);
    for (let x = -11.6; x < 12.4; x += 0.6) box(root, 0.06, wallH, 0.02, sky.stripe, x, wallH / 2 - 1.2, 0.01);
    box(root, 24, 0.1, 8, 0x3a2b34, 0.4, -0.45, 3.8);
    box(root, 24, 0.18, 0.06, 0x1d1c30, 0.4, -0.31, 0.03);
    box(root, 2.2, 0.02, 1.2, 0x7a3a3a, 1.1, -0.39, 1.4);
    box(root, 2.0, 0.025, 1.0, 0x9a5a48, 1.1, -0.385, 1.4);

    // window and the view through it
    const wx = -1.65, wy = 2.0, W = 1.3, H = 1.7, L = wx - W / 2, B = wy - H / 2;
    const view = new THREE.Group(); root.add(view);
    const bands = sky.bands;
    bands.forEach((c, i) => box(view, W, H / bands.length + 0.002, 0.01, basic(c), wx, wy + H / 2 - (i + 0.5) * H / bands.length, 0.02));
    const sr = mulberry32(3);
    if (mode === 'day') {
      const sun = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), basic(0xfff4c0)); sun.position.set(wx - 0.32, wy + 0.56, 0.026); view.add(sun);
      // chunky clouds: a long base with two puffs on top
      [[0.18, 0.42, 0.46], [-0.28, 0.1, 0.34], [0.38, -0.08, 0.26]].forEach(([dx, dy, w]) => {
        box(view, w, 0.06, 0.005, basic(0xffffff), wx + dx, wy + dy, 0.028);
        box(view, w * 0.45, 0.05, 0.005, basic(0xffffff), wx + dx - w * 0.12, wy + dy + 0.05, 0.028);
        box(view, w * 0.3, 0.04, 0.005, basic(0xf2f8ff), wx + dx + w * 0.18, wy + dy + 0.04, 0.028);
      });
      // two birds, each a pixel V
      [[-0.05, 0.3, 0.05], [0.08, 0.36, 0.04]].forEach(([dx, dy, w]) => [-1, 1].forEach((sd) => {
        const wing = box(view, w, 0.012, 0.005, basic(0x34405a), wx + dx + sd * w * 0.42, wy + dy, 0.029); wing.rotation.z = -sd * 0.5;
      }));
    } else if (mode === 'night') {
      const moon = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), basic(0xf4f1dc)); moon.position.set(wx + 0.3, wy + 0.5, 0.026); view.add(moon);
      for (let i = 0; i < 16; i++) box(view, 0.02, 0.02, 0.005, basic(0xdfe6ff), L + 0.05 + sr() * (W - 0.1), wy + sr() * 0.8, 0.027);
    } else {
      const sun = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), basic(0xffe08a)); sun.position.set(wx + 0.22, B + 0.45, 0.026); view.add(sun);
      [[0.35, 0.55, 0.5], [-0.3, 0.3, 0.38], [0.1, 0.72, 0.3]].forEach(([dx, dy, w]) => box(view, w, 0.035, 0.005, basic(0xff9fa0), wx + dx, wy + dy, 0.028));
    }
    const far = [[L, B + 0.42]]; for (let i = 0; i <= 8; i++) far.push([L + i * W / 8, B + 0.38 + Math.sin(i * 1.3) * 0.08 + 0.05]); far.push([L + W, B], [L, B]);
    flatShape(view, far, sky.far, 0.03);
    const near = [[L, B + 0.22]]; for (let i = 0; i <= 8; i++) near.push([L + i * W / 8, B + 0.2 + Math.cos(i * 0.9) * 0.07]); near.push([L + W, B], [L, B]);
    flatShape(view, near, sky.near, 0.032);
    [0.12, 0.2, 0.95, 1.05, 1.13].forEach((dx, i) => { const h = 0.16 + (i % 2) * 0.06, bx = L + dx, by = B + 0.2 + Math.cos((dx / W * 8) * 0.9) * 0.06; flatShape(view, [[bx - 0.05, by], [bx + 0.05, by], [bx, by + h]], sky.trees, 0.034); });
    box(view, 0.1, 0.07, 0.005, basic(mode === 'day' ? 0xb07a5a : sky.trees), L + 0.62, B + 0.31, 0.034);
    box(view, 0.025, 0.025, 0.005, basic(sky.houseLit ? 0xffd27a : 0x4a5a78), L + 0.62, B + 0.31, 0.036);
    const frame = 0x5a3422;
    box(root, W + 0.16, 0.1, 0.12, frame, wx, wy + H / 2 + 0.03, 0.06); box(root, W + 0.16, 0.1, 0.12, frame, wx, wy - H / 2 - 0.03, 0.06);
    box(root, 0.1, H + 0.16, 0.12, frame, L - 0.03, wy, 0.06); box(root, 0.1, H + 0.16, 0.12, frame, L + W + 0.03, wy, 0.06);
    box(root, 0.06, H, 0.08, frame, wx, wy, 0.05); box(root, W, 0.06, 0.08, frame, wx, wy + 0.1, 0.05);
    box(root, W + 0.3, 0.08, 0.5, 0x8a5434, wx, B - 0.1, 0.25);
    const cpot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 10), toon(0xc4614a)); cpot.position.set(wx - 0.3, B + 0.03, 0.25); root.add(cpot);
    const cac = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.28, 8), toon(0x5e9c5a)); cac.position.set(wx - 0.3, B + 0.25, 0.25); root.add(cac);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.7), basic(sky.beam[0], { transparent: true, opacity: sky.beam[1], depthWrite: false }));
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
    return { cat, dust: sky.dust };
  }

  Object.assign(S3, { SHELF_X, shelfY, buildRoom, SKY_MODES: Object.keys(SKIES) });
})(window);
