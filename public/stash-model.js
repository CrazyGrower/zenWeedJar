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

  // Plum and violet caps get purple buds; everything else is green. Derived
  // from the cap so the database needs no new column.
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
    takeGrams, formatTapeGrams, tapeLines, dropTargets,
  };
})(window);
