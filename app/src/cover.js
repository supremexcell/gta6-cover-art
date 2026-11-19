// Drawing engine for the GTA-style multi-panel cover maker.
// Everything is drawn with the plain 2D canvas API and system fonts — no
// external assets, no Rockstar artwork, logo or font. Panels are clipped
// rectangles with a white gutter; the caption is bold uppercase lettering
// with an outline so it stays readable over any photo.
//
// Filters are ORIGINAL colour grades + illustration effects written here
// in canvas code (saturation/contrast curves, flat-colour quantization,
// hard cel-shading, bold ink outlines, halftone dots, vignette) — a
// comic key-art treatment in the spirit of Rockstar's GTA VI key art.
// The game names only label palettes inspired by those games' covers;
// no official artwork, logo, character or font is copied, downloaded
// or embedded.

/** Filter catalogue: wash + sun + numeric colour curve. The numbers are the
 *  FULL-strength grade for that game-inspired palette; the Level control
 *  interpolates them toward "plain photo" (see levelDef below), so the
 *  higher the level, the more the photo reads as that game's graphics.
 *  sat/con/bri are multipliers around 1, sepia 0..1, hue in degrees. The
 *  grades are pushed toward the vivid key-art palette (hot pink, orange,
 *  teal, purple, warm sunset) — strong enough to read as game art, but
 *  kept controlled so skin never goes red or purple. */
export const FILTERS = {
  gta6: {
    label: 'GTA VI — Ilustrasi Neon',
    wash: 'sunset', sun: true,
    sat: 1.38, con: 1.16, bri: 1.03, sepia: 0, hue: 0,
  },
  sa: {
    label: 'GTA San Andreas — 90-an Hangat',
    wash: 'gold', sun: false,
    sat: 1.32, con: 1.12, bri: 1.0, sepia: 0.28, hue: -8,
  },
  gtav: {
    label: 'GTA V — Teal & Oranye',
    wash: 'teal', sun: false,
    sat: 1.30, con: 1.14, bri: 1.0, sepia: 0, hue: 8,
  },
  gta4: {
    label: 'GTA IV — Dingin',
    wash: 'cold', sun: false,
    sat: 0.68, con: 1.10, bri: 0.98, sepia: 0, hue: 0,
  },
  vc: {
    label: 'GTA Vice City — Pastel 80-an',
    wash: 'pastel', sun: false,
    sat: 1.26, con: 1.08, bri: 1.06, sepia: 0, hue: -12,
  },
  gta3: {
    label: 'GTA III — Gritty',
    wash: 'dark', sun: false,
    sat: 0.90, con: 1.26, bri: 0.94, sepia: 0, hue: 0,
  },
};
export const DEFAULT_FILTER = 'gta6';
export function filterDef(key) { return FILTERS[key] || FILTERS[DEFAULT_FILTER]; }

/** Illustration levels 1..5 — a STYLE TRANSFER, not a filter getting
 *  stronger (Vicko's Naruto analogy: the higher the level, the more the
 *  photo becomes that game's graphics, as if it were a screenshot taken
 *  in-game). Level 1 is almost the plain photo; Levels 4-5 are the full
 *  comic key-art treatment: bold ink outlines, flat vibrant colour
 *  blocks, hard cel-shading, halftone dots in the shadows.
 *
 *  The old engines failed two ways, and this table fixes both:
 *  - The FIRST engine posterized to 4-6 levels after one blur: skin
 *    collapsed into flat red/orange/purple patches, noise became
 *    speckles — weird, not game-like.
 *  - The SECOND engine went too far the other way (10-16 posterize
 *    levels, thin subtle edges): gradients stayed smooth, but the result
 *    was still just a filtered photo — Vicko called it ugly ("Jelek!").
 *    It had no bold outlines, no flat colour blocks, no hard cel
 *    shading — nothing that reads as Rockstar key art.
 *
 *  This engine gets the key-art look from STRUCTURE, not from crushing
 *  colours:
 *  - posterize: colour levels per channel for the flat blocks (5 at
 *    Level 5). Flat, but the image is HEAVILY blurred first (blur
 *    passes) so blocks follow real shapes instead of noise, and skin is
 *    protected (see applyIllustration).
 *  - cel: hard cel-shading strength 0..1. Each flat region is split
 *    into a lit tone and a shadow tone with a HARD edge between them
 *    (luminance vs its local mean), like comic-book shading — the
 *    shading has a visible shape, not a smooth gradient.
 *  - edge: bold ink outlines on major contours only. The edge map is
 *    computed from a MODERATELY blurred luminance (2 passes: JPEG noise
 *    and skin texture already gone, but real contours still carry a
 *    strong gradient — on the heavily blurred image the gradients are
 *    spread so thin no threshold catches them), so only real contours
 *    (jawline, hair silhouette, hat brim, clothing edges, railing) get
 *    lines — never speckles on skin or sky. `line` is the dilation
 *    radius in px (lines ~2*line+1 px thick, clearly visible at export
 *    resolution); `ink` is how close to near-black the line goes.
 *  - halftone: dot texture in shadow areas only, 0..1. Dots are drawn
 *    in code; density grows with the level and sells the printed-comic
 *    feel of key art.
 *  - blur: how many separable blur passes run before any of this — more
 *    blur at high levels means flatter blocks and cleaner outlines.
 *  - cssT: how much of the filter's colour curve applies (1 = full
 *    grade). washT: how much of the colour wash applies. sunT: neon-sun
 *    strength (GTA VI). */
export const LEVELS = {
  1: { name: 'Halus — hampir foto', posterize: 0, edge: false, edgeThreshold: 0, ink: 0, line: 0, cel: 0, halftone: 0, blur: 0, cssT: 0.3, washT: 0.6, sunT: 0 },
  2: { name: 'Ringan', posterize: 8, edge: true, edgeThreshold: 70, ink: 0.55, line: 0, cel: 0.35, halftone: 0, blur: 2, cssT: 0.55, washT: 0.75, sunT: 0.5 },
  3: { name: 'Sedang', posterize: 7, edge: true, edgeThreshold: 55, ink: 0.7, line: 1, cel: 0.6, halftone: 0.4, blur: 3, cssT: 0.75, washT: 0.85, sunT: 0.75 },
  4: { name: 'Kuat — mirip grafik game', posterize: 6, edge: true, edgeThreshold: 45, ink: 0.85, line: 1, cel: 0.85, halftone: 0.7, blur: 4, cssT: 0.9, washT: 1, sunT: 1 },
  5: { name: 'Maksimal — paling mirip grafik game', posterize: 5, edge: true, edgeThreshold: 35, ink: 0.95, line: 1, cel: 1, halftone: 1, blur: 4, cssT: 1, washT: 1, sunT: 1 },
};
export const DEFAULT_LEVEL = 4;
export function levelDef(level) {
  const l = Math.round(Number(level) || DEFAULT_LEVEL);
  return LEVELS[Math.min(5, Math.max(1, l))];
}
export function levelNumber(level) {
  const l = Math.round(Number(level) || DEFAULT_LEVEL);
  return Math.min(5, Math.max(1, l));
}

/** Wanted level 0..5: how many of the five HUD stars are lit.
 *  0 = clean, no stars at all; 5 = most wanted. */
export const DEFAULT_WANTED = 3;
export function wantedNumber(wanted) {
  const n = Math.round(Number(wanted));
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : DEFAULT_WANTED;
}

/** A five-pointed star path, drawn in code — an original shape, not a
 *  Rockstar asset or downloaded image. */
function starPath(ctx, cx, cy, rOuter, rInner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** The wanted HUD: a small dark pill in the top-right corner holding the
 *  word WANTED (system font, bold) and five star slots. Lit stars are
 *  filled gold with a dark outline; unlit slots are dim outlines, so the
 *  row always reads as five stars. The pill is deliberately COMPACT and
 *  sits high in the top margin strip, overlapping the panel tops by only
 *  a few pixels — over sky or hair tips at most, never over a face: in
 *  every layout the faces sit well below the pill's bottom edge. Level 0
 *  draws nothing. */
function drawWanted(ctx, w, h, wanted) {
  const n = wantedNumber(wanted);
  if (n <= 0) return;
  const R = Math.max(9, w * 0.0115);
  const gap = R * 0.55;
  const pad = R * 0.75;
  ctx.letterSpacing = '0px';
  ctx.font = `bold ${Math.round(R * 1.05)}px sans-serif`;
  const textW = ctx.measureText('WANTED').width;
  const starsW = 5 * R * 2 + 4 * gap;
  const badgeW = pad * 2 + textW + gap * 2 + starsW;
  const badgeH = R * 2 + pad * 1.4;
  const bx = w - w * 0.012 - badgeW;
  const by = h * 0.008;
  ctx.save();
  ctx.fillStyle = 'rgba(18,7,30,0.62)';
  ctx.beginPath();
  ctx.roundRect(bx, by, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, w * 0.0015);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.fillStyle = '#ffd23d';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('WANTED', bx + pad, by + badgeH / 2 + R * 0.05);
  let sx = bx + pad + textW + gap * 2 + R;
  const sy = by + badgeH / 2;
  for (let i = 0; i < 5; i++) {
    starPath(ctx, sx, sy, R, R * 0.45);
    if (i < n) {
      ctx.fillStyle = '#ffd23d';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, R * 0.12);
      ctx.strokeStyle = 'rgba(20,8,32,0.9)';
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, R * 0.12);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.stroke();
    }
    sx += R * 2 + gap;
  }
  ctx.restore();
}
/** Builds the CSS colour curve for a filter at a given level: the grade
 *  fades toward a plain photo as the level drops. */
export function buildCss(filter, level) {
  const t = levelDef(level).cssT;
  const lerp = (v) => (1 + (v - 1) * t).toFixed(3);
  const parts = [
    `saturate(${lerp(filter.sat)})`,
    `contrast(${lerp(filter.con)})`,
    `brightness(${lerp(filter.bri)})`,
  ];
  if (filter.sepia * t > 0.01) parts.push(`sepia(${(filter.sepia * t).toFixed(3)})`);
  if (filter.hue && Math.abs(filter.hue * t) >= 1) parts.push(`hue-rotate(${(filter.hue * t).toFixed(0)}deg)`);
  return parts.join(' ');
}

/** Layout of the three panels plus the caption band, in 0..1 coordinates. */
export function layoutFor(w, h) {
  const r = w / h;
  if (r < 0.9) {
    // Portrait (e.g. 1080x1350): hero across the top, two panels below it.
    return {
      panels: [
        { x: 0.03, y: 0.025, w: 0.94, h: 0.52 },
        { x: 0.03, y: 0.565, w: 0.46, h: 0.24 },
        { x: 0.51, y: 0.565, w: 0.46, h: 0.24 },
      ],
      caption: { x: 0.03, y: 0.815, w: 0.94, h: 0.16 },
    };
  }
  if (r > 1.3) {
    // Landscape (e.g. 1920x1080): hero on the left, two panels stacked right.
    return {
      panels: [
        { x: 0.025, y: 0.04, w: 0.52, h: 0.92 },
        { x: 0.565, y: 0.04, w: 0.41, h: 0.44 },
        { x: 0.565, y: 0.52, w: 0.41, h: 0.44 },
      ],
      caption: { x: 0.025, y: 0.72, w: 0.52, h: 0.24 },
    };
  }
  // Square (1080x1080): hero top-left, two panels top-right, caption band below.
  return {
    panels: [
      { x: 0.03, y: 0.03, w: 0.60, h: 0.60 },
      { x: 0.65, y: 0.03, w: 0.32, h: 0.29 },
      { x: 0.65, y: 0.34, w: 0.32, h: 0.29 },
    ],
    caption: { x: 0.03, y: 0.66, w: 0.94, h: 0.31 },
  };
}

/** Cover-fits an image into a rect, with zoom and a pan offset (-1..1).
 *  High-quality smoothing, and the pan is clamped so the image always
 *  covers the rect — a face can be panned fully into frame, never out. */
function drawFitted(ctx, img, rect, zoom, ox, oy) {
  const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
  const scale = base * (zoom || 1);
  const pw = img.naturalWidth * scale;
  const ph = img.naturalHeight * scale;
  const maxOx = Math.max(0, (pw - rect.w) / 2);
  const maxOy = Math.max(0, (ph - rect.h) / 2);
  const cx = rect.x + rect.w / 2 + Math.max(-maxOx, Math.min(maxOx, (ox || 0) * rect.w * 0.5));
  const cy = rect.y + rect.h / 2 + Math.max(-maxOy, Math.min(maxOy, (oy || 0) * rect.h * 0.5));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph);
}

/** A simple two-tone placeholder panel (diagonal sunset stripes + label). */
function drawPlaceholder(ctx, rect, label, i) {
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  const hues = [['#ff9a3d', '#c62b7e'], ['#2bd4ff', '#7a2bff'], ['#ffd23d', '#ff5e3d']][i % 3];
  g.addColorStop(0, hues[0]);
  g.addColorStop(1, hues[1]);
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y + rect.h);
  ctx.lineTo(rect.x + rect.w, rect.y);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h * 0.45);
  ctx.lineTo(rect.x, rect.y + rect.h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold ${Math.max(14, rect.h * 0.11)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
}

/** One separable 3-tap box-blur pass (horizontal then vertical, in place).
 *  Two passes give a smooth, wide falloff that kills JPEG noise and skin
 *  texture before any quantization — the old single 3x3 pass left noise
 *  that posterize then turned into speckles and blotches. */
function boxBlurPass(data, w, h, tmp) {
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0, xp = x + 1 < w ? x + 1 : w - 1;
      const i = row + x * 4, im = row + xm * 4, ip = row + xp * 4;
      for (let c = 0; c < 3; c++) tmp[i + c] = (data[im + c] + data[i + c] + data[ip + c]) / 3;
      tmp[i + 3] = data[i + 3];
    }
  }
  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : 0, yp = y + 1 < h ? y + 1 : h - 1;
    const row = y * w * 4, rm = ym * w * 4, rp = yp * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4, im = rm + x * 4, ip = rp + x * 4;
      for (let c = 0; c < 3; c++) data[i + c] = (tmp[im + c] + tmp[i + c] + tmp[ip + c]) / 3;
    }
  }
}

/** How skin-like a pixel is (0..1), from its colour: skin is warm, red
 *  above green above blue, with a moderate red-green gap. Used to protect
 *  faces: skin pixels are blended back toward the smooth blurred colour
 *  instead of being posterized into flat patches, and edge lines on skin
 *  are softened. Hair and warm clothing score partly too, which is fine —
 *  they also look better smooth than posterized. */
function skinScore(r, g, b) {
  if (r < 70 || r <= g || g < b) return 0;
  const rg = r - g, gb = g - b;
  if (rg > 115 || gb > 85) return 0;
  let s = 1;
  s *= Math.min(1, (r - 70) / 30);
  s *= rg < 18 ? rg / 18 : 1;
  s *= rg > 95 ? Math.max(0, 1 - (rg - 95) / 20) : 1;
  s *= gb > 70 ? Math.max(0, 1 - (gb - 70) / 15) : 1;
  return Math.max(0, Math.min(1, s));
}

/** Separable 3-tap box blur for a single-channel Float32Array
 *  (luminance), run `passes` times for a smooth falloff. Used for the
 *  local-mean map that drives the hard cel-shading split: a pixel is in
 *  shadow when it is clearly darker than its neighbourhood, lit when
 *  clearly brighter — the boundary between the two is a HARD edge, like
 *  comic-book cel shading. */
function blurLum(src, w, h, passes) {
  const tmp = new Float32Array(w * h);
  let a = src, b = tmp;
  for (let k = 0; k < passes; k++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : 0, xp = x + 1 < w ? x + 1 : w - 1;
        b[row + x] = (a[row + xm] + a[row + x] + a[row + xp]) / 3;
      }
    }
    for (let y = 0; y < h; y++) {
      const ym = y > 0 ? y - 1 : 0, yp = y + 1 < h ? y + 1 : h - 1;
      const row = y * w, rm = ym * w, rp = yp * w;
      for (let x = 0; x < w; x++) {
        a[row + x] = (b[rm + x] + b[row + x] + b[rp + x]) / 3;
      }
    }
  }
  return a;
}

/** Comic key-art illustration, applied to one panel's pixels so a photo
 *  reads as Rockstar-style key art — bold ink outlines, flat vibrant
 *  colour blocks, hard cel-shading, halftone dots. The pipeline:
 *  1. HEAVY blur (several separable passes): JPEG noise and skin
 *     texture are gone before any quantization, so flat blocks follow
 *     real shapes instead of noise — this is what keeps coarse
 *     quantization from turning into blotchy patches.
 *  2. Flat colour blocks: per-channel quantization to a few levels
 *     (5 at Level 5), then a HARD cel split — each region becomes a
 *     lit tone or a shadow tone depending on whether its luminance is
 *     clearly above or below its local mean, with a sharp boundary.
 *     Skin-like pixels are protected: finer steps, a gentler two-tone
 *     split, and a 55% blend back toward the smooth blurred colour, so
 *     faces keep warm, natural two-tone shading and never collapse
 *     into flat red/purple patches.
 *  3. Bold ink outlines: gradient magnitude on the HEAVILY blurred
 *     luminance, high threshold, so only major contours (jawline, hair
 *     silhouette, hat brim, clothing edges, railing) get lines — never
 *     speckles on skin or sky. The edge mask is dilated so lines are
 *     clearly visible at export resolution, then painted near-black
 *     (softened on skin).
 *  4. Halftone dots in shadow areas only (never on skin): a dot grid
 *     drawn in code, density growing with the level — the printed-comic
 *     feel of key art.
 *  Level 1 skips the pass entirely (almost a plain photo); higher
 *  levels are the style transfer toward key art. */
function applyIllustration(octx, w, h, filter, level) {
  const lp = levelDef(level);
  const img = octx.getImageData(0, 0, w, h);
  const d = img.data;
  const tmp = new Float32Array(d.length);
  const n = w * h;
  // Blur passes. After the 2nd pass, snapshot a MODERATELY blurred
  // luminance for the edge map: 2 passes already kill JPEG noise and
  // skin texture, but real contours still have a strong gradient there.
  // (On the heavily blurred image the same gradients are spread so thin
  // that no threshold catches them — the first version's outlines were
  // nearly invisible. The heavy blur still drives the quantization and
  // the cel split, so speckles never appear.)
  let edgeLum = null;
  for (let k = 0; k < (lp.blur || 0); k++) {
    boxBlurPass(d, w, h, tmp);
    if (k === 1) {
      edgeLum = new Float32Array(n);
      for (let p = 0; p < n; p++) {
        const i = p * 4;
        edgeLum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
    }
  }
  // Keep a copy of the heavily blurred pixels: quantization, cel split
  // and edges all read from it.
  const blurred = new Uint8ClampedArray(d);
  const lum = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    lum[p] = 0.299 * blurred[i] + 0.587 * blurred[i + 1] + 0.114 * blurred[i + 2];
  }
  if (!edgeLum) edgeLum = lum;
  // Local mean luminance (extra-blurred copy) for the hard cel split.
  const mean = blurLum(lum.slice(), w, h, 2);
  // Pass 1 — flat colour blocks + hard cel-shading.
  const Q = lp.posterize;
  const step = 255 / (Q - 1);
  const skinQ = Math.min(16, Q + 5);
  const skinStep = 255 / (skinQ - 1);
  const cel = lp.cel ?? 0;
  const shadowMask = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = blurred[i], g = blurred[i + 1], b = blurred[i + 2];
    const sk = skinScore(r, g, b);
    const ratio = lum[p] / (mean[p] + 1);
    const inShadow = ratio < 0.94;
    const inLight = ratio > 1.06;
    if (inShadow && sk < 0.3) shadowMask[p] = 1;
    if (sk > 0) {
      // Faces: finer steps, gentler two-tone split, mostly the smooth
      // blurred colour — warm natural shading, never flat patches.
      let fs = 1;
      if (inShadow) fs = 1 - 0.12 * cel;
      else if (inLight) fs = 1 + 0.04 * cel;
      const keep = sk * 0.55;
      const m = 1 - keep;
      d[i] = Math.round(r / skinStep) * skinStep * fs * m + r * keep;
      d[i + 1] = Math.round(g / skinStep) * skinStep * fs * m + g * keep;
      d[i + 2] = Math.round(b / skinStep) * skinStep * fs * m + b * keep;
    } else {
      // Flat block + hard cel split: shadow tone or lit tone, sharp edge.
      let f = 1;
      if (inShadow) f = 1 - 0.30 * cel;
      else if (inLight) f = 1 + 0.10 * cel;
      d[i] = Math.round(r / step) * step * f;
      d[i + 1] = Math.round(g / step) * step * f;
      d[i + 2] = Math.round(b / step) * step * f;
    }
  }
  // Pass 2 — bold ink outlines on major contours only.
  // The gradient uses CENTRAL differences (lum[x+1]-lum[x-1]), so a real
  // contour gives a 2px-wide continuous response instead of a 1px line
  // that fires intermittently — the first version's lines came out
  // dashed. Thresholds are scaled to the ~2x larger central-difference
  // magnitudes.
  let inkMask = null;
  if (lp.edge) {
    const thr = lp.edgeThreshold;
    const edge = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const xl = x > 0 ? edgeLum[p - 1] : edgeLum[p];
        const xr = x + 1 < w ? edgeLum[p + 1] : edgeLum[p];
        const yu = y > 0 ? edgeLum[p - w] : edgeLum[p];
        const yd = y + 1 < h ? edgeLum[p + w] : edgeLum[p];
        const mag = Math.max(Math.abs(xr - xl), Math.abs(yd - yu));
        const i = p * 4;
        // On skin the bar is higher, so faces get outlines only on
        // their real contours (jawline, hairline) — never speckles.
        const t = skinScore(blurred[i], blurred[i + 1], blurred[i + 2]) > 0.4 ? thr * 1.8 : thr;
        if (mag > t) edge[p] = 1;
      }
    }
    // Dilate so lines read bold at export resolution.
    const r = lp.line || 0;
    const dil = new Uint8Array(n);
    if (r === 0) {
      dil.set(edge);
    } else {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!edge[y * w + x]) continue;
          for (let dy = -r; dy <= r; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -r; dx <= r; dx++) {
              const xx = x + dx;
              if (xx >= 0 && xx < w) dil[yy * w + xx] = 1;
            }
          }
        }
      }
    }
    const ink = lp.ink ?? 0.8;
    const IR = 22, IG = 8, IB = 30; // near-black plum ink
    inkMask = dil; // kept so the halftone pass never punches dots into ink
    for (let p = 0; p < n; p++) {
      if (!dil[p]) continue;
      const i = p * 4;
      const sk = skinScore(blurred[i], blurred[i + 1], blurred[i + 2]);
      const a = ink * (sk > 0.4 ? 0.35 : 1);
      d[i] = d[i] * (1 - a) + IR * a;
      d[i + 1] = d[i + 1] * (1 - a) + IG * a;
      d[i + 2] = d[i + 2] * (1 - a) + IB * a;
    }
  }
  // Pass 3 — halftone dots in shadow areas only (never on skin, never
  // on ink lines — the dots must texture flat shadow areas, not punch
  // holes into the outlines). Kept subtle so it reads as print texture,
  // not speckle.
  if ((lp.halftone ?? 0) > 0) {
    const s = lp.halftone >= 1 ? 6 : lp.halftone >= 0.7 ? 7 : 9;
    const rad = s * 0.26 * lp.halftone;
    const c = s / 2;
    for (let y = 0; y < h; y++) {
      const dy = (y % s) - c;
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!shadowMask[p]) continue;
        if (inkMask && inkMask[p]) continue;
        const dx = (x % s) - c;
        if (dx * dx + dy * dy < rad * rad) {
          const i = p * 4;
          d[i] *= 0.72;
          d[i + 1] *= 0.72;
          d[i + 2] *= 0.72;
        }
      }
    }
  }
  octx.putImageData(img, 0, 0);
}

/** Renders one panel (photo or placeholder) through the active filter
 *  onto the main canvas, at the panel's full canvas resolution. */
function drawPanel(ctx, panel, rect, i, filter, level) {
  const w = Math.max(2, Math.round(rect.w));
  const h = Math.max(2, Math.round(rect.h));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  const local = { x: 0, y: 0, w, h };
  if (panel.img) {
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.filter = buildCss(filter, level);
    drawFitted(octx, panel.img, local, panel.zoom, panel.ox, panel.oy);
    octx.filter = 'none';
  } else {
    drawPlaceholder(octx, local, `PANEL ${i + 1}`, i);
  }
  const lp = levelDef(level);
  if (lp.posterize > 1 || lp.edge) applyIllustration(octx, w, h, filter, level);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, rect.x, rect.y, rect.w, rect.h);
}

/** The colour wash for a filter, plus its sun disc when it has one.
 *  `sunT` (0..1, from the level) fades the neon sun out at low levels. */
function applyWash(ctx, w, h, filter, strength, sunT) {
  const s = strength <= 0 ? 0 : strength;
  const stopsFor = (wash) => ({
    sunset: [[0, [255, 140, 60, 0.12]], [0.5, [255, 80, 140, 0.20]], [1, [120, 40, 180, 0.30]]],
    gold: [[0, [255, 190, 80, 0.15]], [0.55, [255, 120, 50, 0.15]], [1, [0, 110, 120, 0.18]]],
    teal: [[0, [60, 200, 170, 0.12]], [0.5, [255, 140, 60, 0.14]], [1, [10, 60, 50, 0.18]]],
    cold: [[0, [140, 170, 200, 0.14]], [1, [20, 30, 50, 0.24]]],
    pastel: [[0, [255, 150, 200, 0.14]], [0.5, [90, 220, 210, 0.11]], [1, [255, 120, 180, 0.16]]],
    dark: [[0, [30, 20, 10, 0.18]], [1, [0, 0, 0, 0.28]]],
  })[wash] || [];
  const stops = stopsFor(filter.wash);
  if (!stops.length || s <= 0) return;
  const g = filter.wash === 'cold' || filter.wash === 'dark'
    ? ctx.createLinearGradient(0, 0, 0, h)
    : ctx.createLinearGradient(0, 0, w, h);
  for (const [off, [r, gg, b, a]] of stops) {
    g.addColorStop(off, `rgba(${r},${gg},${b},${a * s})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (filter.sun && s > 0 && (sunT ?? 1) > 0) {
    const st = s * (sunT ?? 1);
    // Sun disc tucked into the top-left sky corner, never on a face.
    const cx = w * 0.12, cy = h * 0.07, r = Math.min(w, h) * 0.04;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.8);
    glow.addColorStop(0, `rgba(255,210,61,${0.55 * st})`);
    glow.addColorStop(0.5, `rgba(255,94,61,${0.28 * st})`);
    glow.addColorStop(1, 'rgba(255,94,61,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    const disc = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    disc.addColorStop(0, `rgba(255,220,90,${0.9 * st})`);
    disc.addColorStop(1, `rgba(255,120,60,${0.9 * st})`);
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Fits one line of text, shrinking it until it fits the given width.
 *  `opts`: { weight, family, tracking } — tracking is canvas
 *  letterSpacing in px, applied while measuring so the shrink accounts
 *  for it. Callers must reset ctx.letterSpacing to '0px' after drawing. */
function fitFont(ctx, text, maxWidth, startSize, opts = {}) {
  const { weight = 'bold', family = 'sans-serif', tracking = 0 } = opts;
  let size = startSize;
  const set = () => {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.letterSpacing = tracking ? `${tracking}px` : '0px';
  };
  set();
  while (ctx.measureText(text).width > maxWidth && size > 10) {
    size -= 2;
    set();
  }
  return size;
}

/** The cover title style (final, chosen by the agent — Vicko delegated
 *  the choice, with one rule: do NOT force a GTA look-alike font, and
 *  never use Rockstar's font, which the bounty forbids anyway).
 *  Heavy extra-bold condensed system stack: 'Arial Narrow' gives the
 *  tall, narrow poster feel on systems that have it (Windows/macOS) and
 *  falls back cleanly to plain bold sans-serif elsewhere — no downloaded
 *  or web fonts, everything offline. The white-to-warm-gold vertical
 *  gradient echoes the neon sunset wash, the thick dark outline and soft
 *  drop shadow keep it readable over any photo, and a touch of tracking
 *  keeps the caps airy like a movie-poster title. The tagline pairs with
 *  it: same gold as the wanted stars, wide-tracked small caps. */
const TITLE_FAMILY = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';

/**
 * Draws the whole cover onto `canvas` from a state object:
 * { panels: [{img, zoom, ox, oy}], caption, subcaption, filter, filterStrength, level, wanted }
 * `level` (1..5, default 4) is the illustration level: the higher it is,
 * the more the photo looks like it was taken from that game's graphics.
 * `wanted` (0..5, default 3) is the wanted level: that many of the five
 * HUD stars in the top-right corner are lit gold.
 */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.letterSpacing = '0px';
  const filter = filterDef(state.filter);
  const level = levelDef(state.level);
  const layout = layoutFor(w, h);
  // Base: deep dusk purple, so empty space still looks like a poster.
  ctx.fillStyle = '#241533';
  ctx.fillRect(0, 0, w, h);
  const gutter = Math.max(4, w * 0.008);
  const radius = Math.max(6, w * 0.012);
  layout.panels.forEach((p, i) => {
    const rect = { x: p.x * w, y: p.y * h, w: p.w * w, h: p.h * h };
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
    drawPanel(ctx, state.panels[i] || {}, rect, i, filter, levelNumber(state.level));
    ctx.restore();
    ctx.lineWidth = gutter;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.stroke();
  });
  // Colour wash over the panels, scaled by the level (lighter at level 1).
  applyWash(ctx, w, h, filter, (state.filterStrength ?? 1) * level.washT, level.sunT);
  // Vignette to pull the eye to the middle.
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(10,4,20,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  // Wanted HUD in the top-right corner (over the photo tops, never a face).
  drawWanted(ctx, w, h, state.wanted ?? DEFAULT_WANTED);
  // Caption band: dark-to-transparent wash so the title always reads.
  const cb = layout.caption;
  // Horizon glow strip at the top of the caption band — a warm sunset
  // line that fills the gap between the panels and the title.
  const horizon = ctx.createLinearGradient(0, cb.y * h - h * 0.02, 0, cb.y * h + h * 0.05);
  horizon.addColorStop(0, 'rgba(255,140,60,0)');
  horizon.addColorStop(0.5, 'rgba(255,120,80,0.55)');
  horizon.addColorStop(1, 'rgba(255,80,140,0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, cb.y * h - h * 0.02, w, h * 0.07);
  const band = ctx.createLinearGradient(0, cb.y * h - h * 0.06, 0, (cb.y + cb.h) * h);
  band.addColorStop(0, 'rgba(20,8,32,0)');
  band.addColorStop(0.35, 'rgba(20,8,32,0.82)');
  band.addColorStop(1, 'rgba(20,8,32,0.95)');
  ctx.fillStyle = band;
  ctx.fillRect(0, cb.y * h - h * 0.06, w, (cb.h + 0.06) * h);
  // Title: extra-bold condensed poster caps, auto-shrink, white-to-warm-
  // gold sunset gradient with a thick dark outline + soft drop shadow.
  const title = (state.caption || '').trim().toUpperCase();
  if (title) {
    const maxW = cb.w * w * 0.96;
    const size = fitFont(ctx, title, maxW, h * 0.105, { weight: 900, family: TITLE_FAMILY, tracking: Math.max(1, Math.round(h * 0.002)) });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20,8,32,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.05;
    const ty = (cb.y + cb.h * 0.52) * h;
    ctx.strokeText(title, w / 2, ty);
    const grad = ctx.createLinearGradient(0, ty - size * 0.85, 0, ty + size * 0.1);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.65, '#fff6d8');
    grad.addColorStop(1, '#ffd23d');
    ctx.fillStyle = grad;
    ctx.fillText(title, w / 2, ty);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.letterSpacing = '0px';
  }
  // Sub-caption / tagline: gold, wide-tracked small caps, thin dark
  // outline so it reads over any photo.
  const sub = (state.subcaption || '').trim();
  if (sub) {
    const size = fitFont(ctx, sub.toUpperCase(), cb.w * w * 0.9, h * 0.032, { weight: 700, tracking: Math.max(1, Math.round(h * 0.014)) });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20,8,32,0.85)';
    ctx.strokeText(sub.toUpperCase(), w / 2, (cb.y + cb.h * 0.82) * h);
    ctx.fillStyle = '#ffd23d';
    ctx.fillText(sub.toUpperCase(), w / 2, (cb.y + cb.h * 0.82) * h);
    ctx.letterSpacing = '0px';
  }
  // Thin inner frame, poster style.
  ctx.lineWidth = Math.max(3, w * 0.004);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeRect(w * 0.012, h * 0.012, w * 0.976, h * 0.976);
}
