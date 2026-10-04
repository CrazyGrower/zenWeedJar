// Masking-tape labels for the 3D jars. Drawn on a canvas (never HTML, so a
// jar name can't inject markup), then snapped to a four-colour palette with no
// anti-aliasing so the text reads as crisp pixel art at ×1.
(function (global) {
  const TAPE_W = 64;
  const TAPE_H = 27;
  const CSS_SCALE = 2;
  // [r, g, b, alpha out]: tape, tape shade, ink, date brown
  const PALETTE = [[239, 228, 196, 235], [214, 198, 156, 235], [42, 22, 16, 255], [120, 84, 52, 255]];

  function quantizeToPalette(data, palette, alphaCut = 110) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < alphaCut) { data[i + 3] = 0; continue; }
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < palette.length; k++) {
        const c = palette[k];
        const d = (data[i] - c[0]) ** 2 + (data[i + 1] - c[1]) ** 2 + (data[i + 2] - c[2]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      const c = palette[best];
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3];
    }
  }

  const NAME_FONT = '600 10px "Stash Digits", "Pixelify Sans", monospace';
  const WEIGHT_FONT = '15px "Jersey 10", monospace';
  // Jersey, not Pixelify: Pixelify's 5 and 6 read as S and 8 at this size
  const DATE_FONT = '11px "Jersey 10", monospace';
  // one notch down, so a decimal weight ("59,4 g") still has room for its date
  const SMALL_FONTS = [['13px "Jersey 10", monospace', '10px "Jersey 10", monospace'],
    ['12px "Jersey 10", monospace', '9px "Jersey 10", monospace']];
  const TEXT_L = 7;
  const TEXT_R = TAPE_W - 7;
  const TEXT_GAP = 2;

  // Where the text goes, measured rather than counted: the date sits beside
  // the weight, both a notch smaller when the weight is too wide (a "12,5 g"
  // is common since the -0.5 g button), then beside the name, and is dropped
  // only when no line has room. The name is never clipped for the date.
  function layoutTape(lines, measure) {
    let name = String(lines.name);
    if (measure(name, NAME_FONT) > TEXT_R - TEXT_L) {
      while (name.length > 1 && measure(`${name}.`, NAME_FONT) > TEXT_R - TEXT_L) name = name.slice(0, -1);
      name = `${name.trimEnd()}.`;
    }
    const date = lines.date || '';
    const fits = (left, leftFont, dateFont) => TEXT_L + measure(left, leftFont) + TEXT_GAP + measure(date, dateFont) <= TEXT_R;
    const out = { name, weight: lines.weight, date, dateLine: null, weightFont: WEIGHT_FONT, dateFont: DATE_FONT };
    if (!date) return out;
    for (const [weightFont, dateFont] of [[WEIGHT_FONT, DATE_FONT], ...SMALL_FONTS]) {
      if (fits(lines.weight, weightFont, dateFont)) return Object.assign(out, { dateLine: 'weight', weightFont, dateFont });
    }
    if (fits(name, NAME_FONT, DATE_FONT)) out.dateLine = 'name';
    return out;
  }

  function createCanvas(doc) {
    const c = doc.createElement('canvas');
    c.width = TAPE_W * CSS_SCALE;
    c.height = TAPE_H * CSS_SCALE;
    c.style.width = `${TAPE_W * CSS_SCALE}px`;
    c.style.height = `${TAPE_H * CSS_SCALE}px`;
    c.className = 'tape';
    return c;
  }

  function paint(canvas, lines) {
    const x = canvas.getContext('2d');
    const k = canvas.width / TAPE_W;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.save();
    x.scale(k, k);
    x.translate(TAPE_W / 2, TAPE_H / 2); x.rotate(-0.05); x.translate(-TAPE_W / 2, -TAPE_H / 2);
    // torn ends
    x.beginPath(); x.moveTo(3, 3);
    for (let i = 0; i <= 4; i++) x.lineTo(i % 2 ? 3 : 5, 3 + i * 5);
    x.lineTo(TAPE_W - 4, TAPE_H - 3);
    for (let i = 4; i >= 0; i--) x.lineTo(TAPE_W - (i % 2 ? 2 : 5), 3 + i * 5);
    x.closePath(); x.fillStyle = 'rgb(239,228,196)'; x.fill();
    x.fillStyle = 'rgb(214,198,156)'; x.fillRect(4, 3, TAPE_W - 8, 1); x.fillRect(4, TAPE_H - 4, TAPE_W - 8, 1);
    x.fillStyle = 'rgb(42,22,16)'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    const l = layoutTape(lines, (text, font) => { x.font = font; return x.measureText(text).width; });
    x.font = NAME_FONT; x.fillText(l.name, TEXT_L, 12);
    x.font = l.weightFont; x.fillText(l.weight, TEXT_L, 22);
    if (l.dateLine) {
      x.fillStyle = 'rgb(120,84,52)'; x.font = l.dateFont; x.textAlign = 'right';
      x.fillText(l.date, TEXT_R, l.dateLine === 'name' ? 11 : 21);
    }
    x.restore();
    const img = x.getImageData(0, 0, canvas.width, canvas.height);
    quantizeToPalette(img.data, PALETTE);
    x.putImageData(img, 0, 0);
  }

  // On a narrow screen neighbouring jars sit closer than one tape width: shrink
  // the tapes just enough to leave a 4 px gap, but never below half size.
  const TAPE_GAP = 4;
  function tapeScale(spacingPx) {
    const s = Number(spacingPx) / (TAPE_W * CSS_SCALE + TAPE_GAP);
    if (!Number.isFinite(s)) return 1;
    return Math.min(1, Math.max(0.5, s));
  }

  global.TapeLabel = { TAPE_W, TAPE_H, CSS_SCALE, PALETTE, quantizeToPalette, createCanvas, layoutTape, paint, tapeScale, WEIGHT_FONT, DATE_FONT };
})(window);
