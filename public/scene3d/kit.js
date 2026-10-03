// Shared building blocks for the 3D shelf. Every scene3d file is a classic
// script that adds to window.S3; without three.js they all bow out quietly
// and app.js falls back to a plain list.
(function (global) {
  const THREE = global.THREE;
  if (!THREE) return;

  // 3-step toon ramp: light falls in bands, like hand-shaded pixel art
  const ramp = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.LuminanceFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });
  const basic = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));

  function box(parent, w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? toon(mat) : mat);
    m.position.set(x, y, z); parent.add(m); return m;
  }
  function flatShape(parent, pts, color, z) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), basic(color)); m.position.z = z; parent.add(m); return m;
  }
  const blobGeo = new THREE.SphereGeometry(1, 10, 8);
  function blob(parent, sx, sy, sz, x, y, z, mat) {
    const m = new THREE.Mesh(blobGeo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BUD_COLORS = {
    green: [0x3f7a2c, 0x4c8a33, 0x5e9c3c, 0x6fae46, 0x9fd15a],
    purple: [0x4a2f68, 0x5d3d82, 0x6a4790, 0x7d58a6, 0xb394d6],
  };

  global.S3 = {
    THREE, ramp, toon, basic, box, flatShape, blob, mulberry32, BUD_COLORS,
    budGeo: new THREE.IcosahedronGeometry(1, 0),
    pistilGeo: new THREE.BoxGeometry(1, 1, 1),
    budMat: toon(0xffffff),
    pistilMat: basic(0xec8a35),
  };
})(window);
