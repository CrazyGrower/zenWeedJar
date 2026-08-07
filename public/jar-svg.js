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

  function fillTop(weight, maxWeight) {
    const frac = maxWeight > 0 ? Math.min(1, Math.max(0, weight / maxWeight)) : 0;
    return 44 - frac * 27; // full (frac 1) -> 17, empty -> 44
  }

  function buildJar(jar, maxWeight) {
    const cap = jar.color_tag || '#79a67e';
    const disc = darken(cap, 0.18);
    const top = fillTop(jar.weight_g, maxWeight);
    const rnd = mulberry32((jar.id || 1) * 2654435761);

    let buds = '';
    const cols = [4, 9, 14, 19, 24];
    let row = 0;
    for (let y = 44 - 9; y > top - 5; y -= 4) {
      const off = row % 2 ? 2.5 : 0;
      for (const cx of cols) {
        const size = (9 + rnd() * 2).toFixed(1);
        const x = (cx + off + (rnd() * 2 - 1)).toFixed(1);
        const yy = (y + (rnd() * 2 - 1)).toFixed(1);
        const b = BUDS[Math.floor(rnd() * BUDS.length)];
        buds += `<use href="#${b}" x="${x}" y="${yy}" width="${size}" height="${size}"/>`;
      }
      row++;
    }

    return `
      <svg class="jar" data-id="${jar.id}" viewBox="0 0 32 46" shape-rendering="crispEdges">
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

  global.JarSvg = { fillTop, buildJar, darken };
})(window);
