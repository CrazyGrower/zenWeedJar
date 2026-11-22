// The icon: the black cat of the top shelf in front of the moon, a small jar
// beside it, on a 32x32 pixel grid. draw(f) is pure, so scripts/make-icons.mjs
// renders the PNG files from it; in a browser tab the icon also blinks and
// flicks its tail (the iPhone home screen only ever shows the still PNG).
(function (global) {
  const S = 32, FRAMES = 32, FPS = 6;
  const BLINK = [10, 12], FLICK = [20, 24];   // frame ranges, end excluded
  const K = '#150d1c';

  function draw(f) {
    const g = Array.from({ length: S }, () => Array(S).fill('#3a2350'));
    const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = c; };
    const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, c); };
    // dusk sky, moon
    rect(0, 0, S, 6, '#2a1a3e'); rect(0, 18, S, 9, '#5a2f55');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x - 16.5) ** 2 + (y - 13.5) ** 2 <= 121) px(x, y, '#f6e7c8');
    rect(9, 9, 2, 2, '#e0cfa4'); rect(23, 16, 2, 1, '#e0cfa4'); px(22, 7, '#e0cfa4');
    // shelf
    rect(0, 27, S, 1, '#9a6238'); rect(0, 28, S, 4, '#4a2a1a'); rect(0, 30, S, 1, '#3a2014');
    // tail
    const tail = f >= FLICK[0] && f < FLICK[1]
      ? [[22, 26], [23, 26], [24, 25], [25, 24], [26, 23], [26, 22], [27, 21]]
      : [[22, 26], [23, 25], [24, 24], [25, 23], [25, 22], [25, 21], [24, 20]];
    for (const [x, y] of tail) { px(x, y, K); px(x, y - 1, K); }
    // body, head, ears
    rect(11, 18, 10, 5, K); rect(10, 21, 12, 6, K); rect(9, 24, 14, 3, K);
    rect(11, 11, 10, 7, K); rect(12, 10, 8, 1, K); rect(10, 12, 12, 5, K);
    rect(11, 8, 1, 3, K); rect(12, 9, 1, 2, K); px(13, 10, K);
    rect(20, 8, 1, 3, K); rect(19, 9, 1, 2, K); px(18, 10, K);
    // eyes: yellow at the rim, green towards the pupil
    if (f >= BLINK[0] && f < BLINK[1]) { rect(12, 14, 3, 1, '#8a8a34'); rect(17, 14, 3, 1, '#8a8a34'); }
    else {
      rect(12, 13, 3, 2, '#e2cf4c'); rect(17, 13, 3, 2, '#e2cf4c');
      px(13, 13, '#86c24e'); px(18, 13, '#86c24e');
      px(13, 14, K); px(18, 14, K);
    }
    rect(15, 16, 2, 1, '#e79a9a');
    // the jar
    rect(2, 19, 5, 2, '#f0b860'); rect(2, 20, 5, 1, '#a86a2a');
    rect(1, 21, 7, 6, '#a9cfc8'); rect(2, 22, 5, 4, '#33263f');
    rect(2, 23, 5, 3, '#4c8f3f'); px(3, 23, '#6fb04e'); px(5, 24, '#6fb04e'); px(4, 25, '#e8853a'); px(2, 24, '#2f6b34');
    return g;
  }

  // which of the three poses frame f shows: the icon only changes with it
  const pose = (f) => (f >= BLINK[0] && f < BLINK[1] ? 'blink' : f >= FLICK[0] && f < FLICK[1] ? 'flick' : 'rest');

  global.StashIcon = { S, FRAMES, FPS, draw, pose };

  const doc = global.document;
  if (!doc || !doc.querySelector) return;
  const link = doc.querySelector('link[rel="icon"]');
  if (!link) return;
  if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const urls = {};
  function urlFor(f) {
    const p = pose(f);
    if (!urls[p]) {
      const cv = doc.createElement('canvas'); cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const g = draw(f);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { ctx.fillStyle = g[y][x]; ctx.fillRect(x, y, 1, 1); }
      urls[p] = cv.toDataURL('image/png');
    }
    return urls[p];
  }
  let f = 0, shown = 'rest';
  global.setInterval(() => {
    if (doc.hidden) return;
    f = (f + 1) % FRAMES;
    const p = pose(f);
    if (p === shown) return;
    shown = p;
    try { link.href = urlFor(f); } catch (err) { /* a canvas that cannot export: keep the still icon */ }
  }, 1000 / FPS);
})(typeof window !== 'undefined' ? window : globalThis);
