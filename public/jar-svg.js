(function (global) {
  const BUDS = ['bud1', 'bud2', 'bud3', 'bud4', 'bud5'];

  function darken(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 255) * (1 - amt));
    const g = Math.max(0, ((n >> 8) & 255) * (1 - amt));
    const b = Math.max(0, (n & 255) * (1 - amt));
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  // deterministic RNG so a jar's buds stay put across re-renders
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One jar holds this much. Fill is measured against it rather than against
  // the heaviest jar on the shelf, so a given weight always looks the same.
  const CAPACITY_G = 50;

  // The interior clip (#jarInner) starts at y=19. A full jar used to fill to
  // y=17, above that line, so its surface was sliced off flat by the clip
  // instead of showing a ragged top of buds. Full now stops at 19.5, just
  // inside the glass — and the surface row only ever jitters downwards (see
  // pack), so no bud can stray back over the clip edge.
  function fillTop(weight, maxWeight) {
    const frac = maxWeight > 0 ? Math.min(1, Math.max(0, weight / maxWeight)) : 0;
    return 44 - frac * 24.5; // full (frac 1) -> 19.5, empty -> 44
  }

  function jarSvg(jar, grams, { seedSalt = 0, extraClass = '' } = {}) {
    const cap = /^#[0-9a-fA-F]{6}$/.test(jar.color_tag) ? jar.color_tag : '#79a67e';
    const disc = darken(cap, 0.18);
    const top = fillTop(grams, CAPACITY_G);
    const rnd = mulberry32(((jar.id || 1) + seedSalt) * 2654435761);

    // Two passes of smaller, tighter buds instead of one sparse pass of big
    // ones: the back layer fills the gaps you used to see the glass through,
    // and a shadow veil between the layers gives the pile some depth.
    // Rows are laid from the surface downwards, not from the bottom up: the
    // surface is the edge you actually see, so it has to land exactly on the
    // fill line. Stepping up from the bottom left it wherever the last row
    // happened to fall, which showed as a band of empty glass above the pile.
    const pack = (offsetX, offsetY, step) => {
      const cols = [3, 7, 11, 15, 19, 23];
      let out = '';
      let row = 0;
      for (let y = top + offsetY; y <= 41; y += step) {
        const off = (row % 2 ? 2 : 0) + offsetX;
        for (const cx of cols) {
          const size = (7 + rnd() * 2).toFixed(1);
          const x = (cx + off + (rnd() * 2 - 1)).toFixed(1);
          // The surface row dips below the fill line but never rises above it,
          // so the top stays ragged without any bud crossing the clip edge.
          const yy = (y + (row === 0 && offsetY === 0 ? rnd() * 1.6 : rnd() * 1.6 - 0.8)).toFixed(1);
          const b = BUDS[Math.floor(rnd() * BUDS.length)];
          out += `<use href="#${b}" x="${x}" y="${yy}" width="${size}" height="${size}"/>`;
        }
        row++;
      }
      return out;
    };

    // A dark mass under everything, starting just below the pile's surface so
    // the top row keeps its ragged silhouette against the empty glass.
    const massTop = (top + 2.5).toFixed(1);
    const mass = top < 43
      ? `<rect x="5" y="${massTop}" width="22" height="${(44 - Number(massTop)).toFixed(1)}" fill="#33512b"/>`
      : '';

    const buds = mass
      + pack(-1.5, 1.5, 3.4)
      + `<rect x="5" y="${massTop}" width="22" height="${(44 - Number(massTop)).toFixed(1)}" fill="#16290f" opacity=".34"/>`
      + pack(0, 0, 3.4);

    return `
      <svg class="jar${extraClass}" data-id="${jar.id}" viewBox="0 0 32 46" shape-rendering="crispEdges">
        <use href="#sil" fill="#e4f1ec" stroke="#b3ccc5" stroke-width="0.7"/>
        <g clip-path="url(#jarInner)">${buds}
          <rect x="8" y="21" width="2" height="18" fill="#fff" opacity=".3"/>
        </g>
        <rect x="9" y="2" width="14" height="3" fill="${disc}"/>
        <rect x="7" y="5" width="18" height="6" fill="${cap}"/>
        <rect x="7" y="7" width="18" height="1" fill="${disc}" opacity=".6"/>
        <rect x="7" y="9" width="18" height="1" fill="${disc}" opacity=".6"/>
        <rect x="8" y="5.6" width="12" height="1" fill="#fff" opacity=".3"/>
      </svg>`;
  }

  // Past one jar's worth, a second jar appears behind holding the overflow.
  // It only ever doubles: 150g shows a full jar behind a full jar, same as
  // 500g would. The stash is the number in the HUD, not a jar count.
  function buildJar(jar) {
    const grams = Math.max(0, Number(jar.weight_g) || 0);
    const front = jarSvg(jar, Math.min(grams, CAPACITY_G));
    if (grams <= CAPACITY_G) return front;

    const overflow = Math.min(grams - CAPACITY_G, CAPACITY_G);
    // A different seed so the second jar's buds don't mirror the first's.
    const back = jarSvg(jar, overflow, { seedSalt: 977, extraClass: ' jar--back' });
    return back + front;
  }

  global.JarSvg = { fillTop, buildJar, darken, CAPACITY_G };
})(window);
