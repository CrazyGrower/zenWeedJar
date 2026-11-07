// The shelf's rules, kept free of Three.js and the DOM so they can be tested
// in a vm: how full a jar looks, where each jar sits, what its tape says.
(function (global) {
  const CAPACITY_G = 80;
  const PER_SHELF = 3;
  const MIN_SHELVES = 2;
  const DEFAULT_CAP = '#79a67e';
  const NAME_MAX = 11;
  const DATE_MAX = 5;

  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // Every jar holds the same 80 g, so a given weight always looks the same.
  // Past 80 g the jar is just full; the tape still shows the real weight.
  function fillFraction(weight_g) {
    return Math.min(1, Math.max(0, toNumber(weight_g) / CAPACITY_G));
  }

  function shelfCount(n) {
    return Math.max(MIN_SHELVES, Math.ceil(toNumber(n) / PER_SHELF));
  }

  // Sorted by id, so editing a jar never moves it; only adding or removing
  // one shifts the jars after it.
  function layoutShelves(jars) {
    const list = [...(jars || [])].sort((a, b) => toNumber(a.id) - toNumber(b.id));
    return {
      shelves: shelfCount(list.length),
      slots: list.map((jar, i) => ({ jar, shelf: Math.floor(i / PER_SHELF), col: i % PER_SHELF })),
    };
  }

  function capColor(tag) {
    return typeof tag === 'string' && /^#[0-9a-fA-F]{6}$/.test(tag) ? tag : DEFAULT_CAP;
  }

  // Plum and violet caps get purple buds; everything else is green. Only for
  // jars saved before the weed colour could be picked (see budKey).
  function budTint(tag) {
    const hex = capColor(tag);
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 'green';
    const l = (max + min) / 2;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return h >= 255 && h <= 330 && s > 0.15 ? 'purple' : 'green';
  }

  // The weed colours a jar can show. Four shades and a frosted tip each; the
  // swatch in the form is the middle shade. Numbers, not strings, so the 3D
  // side can hand them straight to three.js.
  const BUD_PALETTES = {
    green: { label: 'Vert', colors: [0x3f7a2c, 0x4c8a33, 0x5e9c3c, 0x6fae46, 0x9fd15a] },
    lime: { label: 'Vert clair', colors: [0x6a9a2a, 0x7cad32, 0x8fbf3c, 0xa2cf4a, 0xd4ef86] },
    forest: { label: 'Vert foncé', colors: [0x22461c, 0x2c5623, 0x37662b, 0x437533, 0x79a85c] },
    purple: { label: 'Violet', colors: [0x4a2f68, 0x5d3d82, 0x6a4790, 0x7d58a6, 0xb394d6] },
    gold: { label: 'Doré', colors: [0x7a6a26, 0x907c2e, 0xa58f38, 0xb8a146, 0xe6cf80] },
    frost: { label: 'Givré', colors: [0x7f9f6c, 0x92b07e, 0xa6c191, 0xbad1a5, 0xf0f6e6] },
  };
  const BUD_KEYS = Object.keys(BUD_PALETTES);

  // A jar saved before the weed colour existed keeps the tint its cap gave it.
  function budKey(bud_color, tag) {
    return Object.prototype.hasOwnProperty.call(BUD_PALETTES, bud_color) ? bud_color : budTint(tag);
  }
  function budPalette(jar) {
    return BUD_PALETTES[budKey(jar && jar.bud_color, jar && jar.color_tag)].colors;
  }
  function budSwatch(key) {
    return `#${BUD_PALETTES[key].colors[2].toString(16).padStart(6, '0')}`;
  }

  // Which light the window shows: the sunset scene for dawn and dusk, day in
  // between, night otherwise. Sunrise and sunset come from the sunrise
  // equation for the shelf's town, so the scene follows the seasons.
  const SKY_LAT = 48.85, SKY_LON = 2.35;
  const DAY_MS = 86400000, J1970 = 2440587.5, J2000 = 2451545;
  const DAWN_BEFORE = 40, DAWN_AFTER = 60, DUSK_BEFORE = 60, DUSK_AFTER = 40; // minutes
  const rad = Math.PI / 180;

  // { rise, set } in ms for the solar day nearest to `ms`; 'day' or 'night'
  // when the sun never sets or never rises there.
  function sunTimes(ms, lat, lon) {
    const n = Math.round(ms / DAY_MS + J1970 - J2000 + 0.0008 + lon / 360);
    const jStar = n - lon / 360;
    const M = (357.5291 + 0.98560028 * jStar) % 360;
    const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    const lambda = (M + C + 180 + 102.9372) % 360;
    const transit = J2000 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
    const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec);
    if (cosW < -1) return 'day';
    if (cosW > 1) return 'night';
    const w = Math.acos(cosW) / rad / 360;
    return { rise: (transit - w - J1970) * DAY_MS, set: (transit + w - J1970) * DAY_MS };
  }

  function sceneAt(date, lat = SKY_LAT, lon = SKY_LON) {
    const ms = date.getTime();
    const sun = sunTimes(ms, lat, lon);
    if (typeof sun === 'string') return sun;
    const min = 60000;
    if (ms >= sun.rise - DAWN_BEFORE * min && ms <= sun.rise + DAWN_AFTER * min) return 'sunset';
    if (ms >= sun.set - DUSK_BEFORE * min && ms <= sun.set + DUSK_AFTER * min) return 'sunset';
    return ms > sun.rise && ms < sun.set ? 'day' : 'night';
  }

  function takeGrams(weight_g, n) {
    return Math.max(0, Math.round((toNumber(weight_g) - toNumber(n)) * 10) / 10);
  }

  function formatTapeGrams(g) {
    const r = Math.round(toNumber(g) * 10) / 10;
    return `${String(r).replace('.', ',')} g`;
  }

  // The tape is 64 px wide at ×1: clip with a full stop rather than an
  // ellipsis, which the pixel fonts may not carry.
  function clip(value, max) {
    const s = String(value == null ? '' : value).trim();
    return s.length > max ? `${s.slice(0, max - 1)}.` : s;
  }

  function tapeLines(jar) {
    return {
      name: clip(jar.name, NAME_MAX) || 'Sans nom',
      weight: formatTapeGrams(jar.weight_g),
      date: clip(jar.harvest_date, DATE_MAX),
      // someone else's jar: the tape gets a red edge
      ...(jar.owner === 'other' ? { other: true } : {}),
    };
  }

  // Which jars play the drop-in animation: all of them on the first render,
  // afterwards only jars that were not on the shelf before.
  function dropTargets(prevIds, jars, reduceMotion) {
    if (reduceMotion) return [];
    const ids = (jars || []).map((j) => j.id);
    if (!prevIds) return ids;
    return ids.filter((id) => !prevIds.has(id));
  }

  global.StashModel = {
    CAPACITY_G, PER_SHELF, MIN_SHELVES, DEFAULT_CAP,
    fillFraction, shelfCount, layoutShelves, capColor, budTint,
    BUD_PALETTES, BUD_KEYS, budKey, budPalette, budSwatch, sceneAt,
    takeGrams, formatTapeGrams, tapeLines, dropTargets,
  };
})(window);
