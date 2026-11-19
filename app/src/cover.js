// Drawing engine for the GTA-style multi-panel cover maker.
// Everything is drawn with the plain 2D canvas API and system fonts — no
// external assets, no Rockstar artwork, logo or font. Photos bleed to the
// edges, the title overlaps the photos like a real movie poster, and the
// bottom strip carries palm silhouettes, a tagline and fine print.
//
// THE ILLUSTRATION ENGINE IS COLOUR-ONLY (Vicko's direction, 2026-11-19):
// the photos stay SHARP and detailed at every level — what changes is the
// COLOUR, like an overlay layer. No posterize/quantization, no heavy blur
// before quantization, nothing that flattens detail into blocks. The
// "unreal" game feel comes from colour + texture:
//   - a gradient map (duotone-style ramp per game palette) blended over
//     the photo by luminance, strength growing with the level;
//   - a smooth S-curve contrast lift (a LUT, never a step);
//   - split-toning through the same ramp (shadows one colour, highlights
//     another) — the CSS colour curve (saturate/contrast/sepia/hue) still
//     runs underneath, also smooth;
//   - film grain (deterministic hash noise, luminance only) and a very
//     thin halftone in deep shadows, both as texture that never hides
//     detail;
//   - a warm light-leak glow and a vignette as overlays;
//   - outlines only as a faint darkening on the strongest real contours
//     (1px, low alpha, never dilated) — never thick ink.
// Level 1 is almost the plain photo; Level 5 is the strongest colour
// grade + the most texture, but the photo is still sharp. Skin is
// protected (the grade is faded on skin-like pixels) so faces stay
// natural and photographic.
//
// Filters are ORIGINAL colour grades written here in canvas code. The
// game names only label palettes inspired by those games' covers; no
// official artwork, logo, character or font is copied, downloaded or
// embedded.

/** Filter catalogue: wash + sun + numeric colour curve + gradient-map
 *  ramp (shadow / mid / highlight RGB). The numbers are the FULL-strength
 *  grade for that game-inspired palette; the Level control interpolates
 *  them toward "plain photo" (see levelDef below), so the higher the
 *  level, the more the photo reads as that game's graphics. */
export const FILTERS = {
  gta6: {
    label: 'GTA VI — Ilustrasi Neon',
    wash: 'sunset', sun: true,
    sat: 1.30, con: 1.12, bri: 1.03, sepia: 0, hue: 0,
    ramp: [[30, 10, 54], [232, 110, 70], [255, 210, 110]],
  },
  sa: {
    label: 'GTA San Andreas — 90-an Hangat',
    wash: 'gold', sun: false,
    sat: 1.28, con: 1.10, bri: 1.0, sepia: 0.28, hue: -8,
    ramp: [[52, 32, 14], [206, 138, 44], [255, 240, 200]],
  },
  gtav: {
    label: 'GTA V — Teal & Oranye',
    wash: 'teal', sun: false,
    sat: 1.26, con: 1.11, bri: 1.0, sepia: 0, hue: 8,
    ramp: [[8, 42, 48], [38, 140, 138], [255, 178, 110]],
  },
  gta4: {
    label: 'GTA IV — Dingin',
    wash: 'cold', sun: false,
    sat: 0.72, con: 1.08, bri: 0.98, sepia: 0, hue: 0,
    ramp: [[14, 20, 28], [88, 104, 122], [222, 232, 238]],
  },
  vc: {
    label: 'GTA Vice City — Pastel 80-an',
    wash: 'pastel', sun: false,
    sat: 1.22, con: 1.06, bri: 1.06, sepia: 0, hue: -12,
    ramp: [[52, 38, 92], [255, 122, 184], [184, 255, 242]],
  },
  gta3: {
    label: 'GTA III — Gritty',
    wash: 'dark', sun: false,
    sat: 0.92, con: 1.20, bri: 0.94, sepia: 0, hue: 0,
    ramp: [[20, 16, 12], [138, 106, 74], [232, 216, 184]],
  },
};
export const DEFAULT_FILTER = 'gta6';
export function filterDef(key) { return FILTERS[key] || FILTERS[DEFAULT_FILTER]; }

/** Illustration levels 1..5 — a COLOUR-ONLY style transfer (Vicko's
 *  Naruto analogy: the higher the level, the more the photo becomes
 *  that game's graphics, as if it were a screenshot taken in-game).
 *  Level 1 is almost the plain photo; Level 5 is the strongest grade
 *  and the most texture — the photo itself never loses detail.
 *  - map: gradient-map blend 0..1 (colour ramp by luminance).
 *  - curve: smooth S-curve contrast strength 0..1.
 *  - grain: film-grain amplitude in 0..255 units (luminance noise).
 *  - halftone: thin halftone-dot strength in deep shadows 0..1.
 *  - edge: faint outline darkening on the strongest real contours only
 *    (edgeA = max alpha, edgeThreshold = gradient bar). 1px, no dilation.
 *  - cssT: how much of the filter's colour curve applies (1 = full
 *    grade). washT: how much of the colour wash applies. glowT: warm
 *    light-leak glow strength. sunT: neon-sun glow strength (GTA VI). */
export const LEVELS = {
  1: { name: 'Halus — hampir foto', map: 0.12, curve: 0.06, grain: 0, halftone: 0, edge: false, edgeThreshold: 0, edgeA: 0, cssT: 0.3, washT: 0.6, glowT: 0, sunT: 0 },
  2: { name: 'Ringan', map: 0.28, curve: 0.14, grain: 3, halftone: 0.15, edge: true, edgeThreshold: 70, edgeA: 0.06, cssT: 0.55, washT: 0.75, glowT: 0.4, sunT: 0.5 },
  3: { name: 'Sedang', map: 0.42, curve: 0.22, grain: 5, halftone: 0.3, edge: true, edgeThreshold: 60, edgeA: 0.09, cssT: 0.75, washT: 0.85, glowT: 0.7, sunT: 0.75 },
  4: { name: 'Kuat — mirip grafik game', map: 0.55, curve: 0.28, grain: 7, halftone: 0.45, edge: true, edgeThreshold: 52, edgeA: 0.12, cssT: 0.9, washT: 1, glowT: 0.9, sunT: 1 },
  5: { name: 'Maksimal — paling mirip grafik game', map: 0.68, curve: 0.34, grain: 9, halftone: 0.6, edge: true, edgeThreshold: 45, edgeA: 0.15, cssT: 1, washT: 1, glowT: 1, sunT: 1 },
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

/** Default poster dressing (original wording, drawn in code): role
 *  labels for the three panels and the press quote above the title. */
export const DEFAULT_ROLES = ['THE ANGLER', 'THE DRIVER', 'ONE LAST SUMMER'];
export const DEFAULT_QUOTE = '"CHASE THE LAST LIGHT" — SUNSET GAZETTE';
export const DEFAULT_TAGLINE = 'ONE LAST SUNSET • NO LOOKING BACK';
export const DEFAULT_FINEPRINT = 'SUNSET HEIST — A COVER STUDIO PICTURE • STARRING YOU • SHOT ON YOUR OWN CAMERA • CAT. SH-2626';

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
 *  a few pixels — over sky or hair tips at most, never over a face.
 *  Level 0 draws nothing. */
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

/** Layout of the three full-bleed panels, the title zone (overlapping
 *  the photos), the bottom strip and the seal, in 0..1 coordinates.
 *  Photos run edge to edge and meet the bottom strip — there is NO
 *  empty caption band anywhere. */
export function layoutFor(w, h) {
  const r = w / h;
  if (r < 0.9) {
    // Portrait (e.g. 1080x1350): hero across the top, two panels below it.
    return {
      panels: [
        { x: 0.02, y: 0.015, w: 0.96, h: 0.51 },
        { x: 0.02, y: 0.535, w: 0.47, h: 0.30 },
        { x: 0.51, y: 0.535, w: 0.47, h: 0.30 },
      ],
      title: { x: 0.03, y: 0.60, w: 0.94, h: 0.21 },
      strip: { x: 0, y: 0.845, w: 1, h: 0.14 },
      seal: { x: 0.93, y: 0.61 },
    };
  }
  if (r > 1.3) {
    // Landscape (e.g. 1920x1080): hero on the left, two panels stacked right.
    return {
      panels: [
        { x: 0.012, y: 0.015, w: 0.54, h: 0.86 },
        { x: 0.56, y: 0.015, w: 0.428, h: 0.42 },
        { x: 0.56, y: 0.445, w: 0.428, h: 0.43 },
      ],
      title: { x: 0.03, y: 0.58, w: 0.94, h: 0.26 },
      strip: { x: 0, y: 0.885, w: 1, h: 0.10 },
      seal: { x: 0.93, y: 0.59 },
    };
  }
  // Square (1080x1080): hero top-left, two panels top-right.
  return {
    panels: [
      { x: 0.015, y: 0.015, w: 0.60, h: 0.83 },
      { x: 0.625, y: 0.015, w: 0.36, h: 0.405 },
      { x: 0.625, y: 0.43, w: 0.36, h: 0.415 },
    ],
    title: { x: 0.03, y: 0.58, w: 0.94, h: 0.25 },
    strip: { x: 0, y: 0.855, w: 1, h: 0.13 },
    seal: { x: 0.93, y: 0.59 },
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

/** How skin-like a pixel is (0..1), from its colour: skin is warm, red
 *  above green above blue, with a moderate red-green gap. Used to protect
 *  faces: the gradient map is faded on skin-like pixels so faces keep
 *  their natural colour, and grain is softened there too. Hair and warm
 *  clothing score partly too, which is fine — they also look better
 *  natural than over-graded. */
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

/** Gradient-map LUT for a filter's ramp: 256 entries of RGB, shadow at
 *  luminance 0, mid at 128, highlight at 255, linearly interpolated —
 *  a smooth colour ramp, never a step. */
function buildRampLUT(filter) {
  const ramp = filter.ramp || [[0, 0, 0], [128, 128, 128], [255, 255, 255]];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a, b, f;
    if (t < 0.5) { a = ramp[0]; b = ramp[1]; f = t * 2; }
    else { a = ramp[1]; b = ramp[2]; f = (t - 0.5) * 2; }
    lut[i * 3] = a[0] + (b[0] - a[0]) * f;
    lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * f;
  }
  return lut;
}

/** Smooth S-curve contrast LUT: y = x + k * x*(1-x)*(x-0.5)*4 — a
 *  gentle lift of highlights and dip of shadows, no steps, no clipping. */
function buildCurveLUT(k) {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const y = x + k * x * (1 - x) * (x - 0.5) * 4;
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  return lut;
}

/** Deterministic integer hash in [0,1) — film grain that is identical
 *  on every render, so screenshots are stable. */
function hash01(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

/** One separable 3-tap box-blur pass on a single-channel Float32Array
 *  (luminance), in place. Only used to soften the edge map — never on
 *  the photo itself, so no detail is ever blurred away. */
function blurLumOnce(src, w, h) {
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0, xp = x + 1 < w ? x + 1 : w - 1;
      tmp[row + x] = (src[row + xm] + src[row + x] + src[row + xp]) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : 0, yp = y + 1 < h ? y + 1 : h - 1;
    const row = y * w, rm = ym * w, rp = yp * w;
    for (let x = 0; x < w; x++) {
      src[row + x] = (tmp[rm + x] + tmp[row + x] + tmp[rp + x]) / 3;
    }
  }
}

/** COLOUR-ONLY illustration grade, applied to one panel's pixels.
 *  The photo's detail is never touched: no quantization, no blur of
 *  the image, no flattening. What changes is colour and texture:
 *  1. Smooth S-curve contrast (LUT).
 *  2. Gradient map: each pixel's colour is mixed toward the filter's
 *     palette ramp by its luminance (shadows → shadow colour, highlights
 *     → highlight colour) — split-toning by construction. Faded on skin
 *     so faces stay natural.
 *  3. Faint outline darkening on the strongest real contours only
 *     (1px, low alpha, higher bar on skin) — a hint of drawn line that
 *     follows real edges, never ink that flattens the picture.
 *  4. Film grain: deterministic luminance noise, softened on skin.
 *  5. Thin halftone dots in deep shadows only, subtle.
 *  Level 1 is a whisper of grade; Level 5 is the full grade + texture
 *  — sharp at every level. */
function applyColorGrade(octx, w, h, filter, level) {
  const lp = levelDef(level);
  const img = octx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const ramp = buildRampLUT(filter);
  const curve = buildCurveLUT(lp.curve);
  const map = lp.map;
  let edgeLum = null;
  if (lp.edge) {
    edgeLum = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      edgeLum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    blurLumOnce(edgeLum, w, h);
  }
  const thr = lp.edgeThreshold || 0;
  const edgeA = lp.edgeA || 0;
  const grain = lp.grain || 0;
  const ht = lp.halftone || 0;
  const seed = 1234;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      // 1. Smooth contrast curve.
      r = curve[r]; g = curve[g]; b = curve[b];
      const sk = skinScore(r, g, b);
      // 2. Gradient map (colour only), faded on skin.
      if (map > 0) {
        const m = map * (1 - 0.6 * sk);
        const ri = lum * 3;
        r = r * (1 - m) + ramp[ri] * m;
        g = g * (1 - m) + ramp[ri + 1] * m;
        b = b * (1 - m) + ramp[ri + 2] * m;
      }
      // 3. Faint outline on the strongest contours only.
      if (edgeLum) {
        const xl = x > 0 ? edgeLum[p - 1] : edgeLum[p];
        const xr = x + 1 < w ? edgeLum[p + 1] : edgeLum[p];
        const yu = y > 0 ? edgeLum[p - w] : edgeLum[p];
        const yd = y + 1 < h ? edgeLum[p + w] : edgeLum[p];
        const mag = Math.max(Math.abs(xr - xl), Math.abs(yd - yu));
        const t = sk > 0.4 ? thr * 1.6 : thr;
        if (mag > t) {
          const a = Math.min(edgeA, edgeA * ((mag - t) / 60));
          r = r * (1 - a) + 22 * a;
          g = g * (1 - a) + 8 * a;
          b = b * (1 - a) + 30 * a;
        }
      }
      // 4. Film grain (luminance noise, softer on skin).
      if (grain > 0) {
        const nz = (hash01(x, y, seed) - 0.5) * 2 * grain * (1 - 0.5 * sk);
        r += nz; g += nz; b += nz;
      }
      // 5. Thin halftone in deep shadows only.
      if (ht > 0 && lum < 80) {
        const s = 7, c = s / 2;
        const dx = (x % s) - c, dy = (y % s) - c;
        const rad = s * 0.22 * ht;
        if (dx * dx + dy * dy < rad * rad) {
          r *= 0.9; g *= 0.9; b *= 0.9;
        }
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
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
  applyColorGrade(octx, w, h, filter, level);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, rect.x, rect.y, rect.w, rect.h);
}

/** The colour wash for a filter, plus a soft neon-sun GLOW when it has
 *  one (a radial gradient only — no hard disc, nothing sticker-like).
 *  `sunT` (0..1, from the level) fades the glow out at low levels. */
function applyWash(ctx, w, h, filter, strength, sunT) {
  const s = strength <= 0 ? 0 : strength;
  const stopsFor = (wash) => ({
    sunset: [[0, [255, 140, 60, 0.12]], [0.5, [255, 80, 140, 0.16]], [1, [120, 40, 180, 0.24]]],
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
    g.addColorStop(off, `rgba(${r},${gg},${b},${(a * s * 0.85).toFixed(3)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (filter.sun && s > 0 && (sunT ?? 1) > 0) {
    const st = s * (sunT ?? 1);
    const cx = w * 0.12, cy = h * 0.07, r = Math.min(w, h) * 0.10;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, `rgba(255,214,90,${(0.5 * st).toFixed(3)})`);
    glow.addColorStop(0.55, `rgba(255,120,80,${(0.22 * st).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Warm light-leak glow in the top-left corner (screen blend, so it
 *  only ever lightens) plus a faint magenta kiss bottom-right. */
function drawGlow(ctx, w, h, t) {
  if (t <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(w * 0.12, h * 0.05, 0, w * 0.12, h * 0.05, Math.max(w, h) * 0.45);
  g.addColorStop(0, `rgba(255,190,90,${(0.30 * t).toFixed(3)})`);
  g.addColorStop(0.5, `rgba(255,110,140,${(0.12 * t).toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,110,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(w * 0.95, h * 0.95, 0, w * 0.95, h * 0.95, Math.max(w, h) * 0.35);
  g2.addColorStop(0, `rgba(255,80,160,${(0.10 * t).toFixed(3)})`);
  g2.addColorStop(1, 'rgba(255,80,160,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
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
 *  or web fonts, everything offline. The white-to-warm-gold-to-orange
 *  sunset gradient, thick dark outline and soft drop shadow keep it
 *  readable over any photo. The script subtitle pairs with it: italic
 *  bold Georgia in neon pink with a glow, like the script on the
 *  top-ranked covers. */
const TITLE_FAMILY = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const SCRIPT_FAMILY = 'Georgia, "Times New Roman", serif';

/** A role label pill on a panel: white pill, dark bold caps, top-left
 *  inside the panel. */
function drawRoleLabel(ctx, rect, text) {
  if (!text) return;
  const size = Math.max(12, Math.round(rect.h * 0.055));
  const padX = size * 0.7, padY = size * 0.42;
  ctx.letterSpacing = '0px';
  ctx.font = `bold ${size}px sans-serif`;
  const tw = ctx.measureText(text).width;
  const pw = tw + padX * 2;
  const ph = size + padY * 2;
  const x = rect.x + Math.max(8, rect.w * 0.03);
  const y = rect.y + Math.max(8, rect.h * 0.04);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = size * 0.25;
  ctx.shadowOffsetY = size * 0.06;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  ctx.roundRect(x, y, pw, ph, ph * 0.28);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#1c0f2e';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + ph / 2 + size * 0.04);
  ctx.letterSpacing = '0px';
}

/** A scalloped gold seal (starburst badge), drawn in code: "SUNSET" /
 *  "'26" in dark plum on a gold disc. */
function drawSeal(ctx, cx, cy, r) {
  ctx.save();
  const bumps = 14;
  ctx.beginPath();
  for (let i = 0; i <= bumps * 2; i++) {
    const a = (i / (bumps * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.86;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#ffe27a');
  g.addColorStop(1, '#ffb62d');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.strokeStyle = '#2a0f3d';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.strokeStyle = 'rgba(42,15,61,0.55)';
  ctx.stroke();
  ctx.fillStyle = '#2a0f3d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '0px';
  ctx.font = `900 ${Math.round(r * 0.34)}px ${TITLE_FAMILY}`;
  ctx.fillText('SUNSET', cx, cy - r * 0.16);
  ctx.font = `900 ${Math.round(r * 0.44)}px ${TITLE_FAMILY}`;
  ctx.fillText("'26", cx, cy + r * 0.32);
  ctx.restore();
}

/** One palm silhouette: a leaning trunk and five fronds, drawn in code. */
function drawPalm(ctx, x, baseY, s, lean, color) {
  const topX = x + lean * s;
  const topY = baseY - 2.3 * s;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, s * 0.13);
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * s * 0.3, baseY - 1.2 * s, topX, topY);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, s * 0.10);
  const fronds = [-2.6, -1.9, -1.2, -0.5, 0.2];
  for (const a of fronds) {
    const ex = topX + Math.cos(a) * 1.7 * s;
    const ey = topY + Math.sin(a) * 1.7 * s + 0.55 * s;
    const cxp = topX + Math.cos(a) * 0.9 * s;
    const cyp = topY + Math.sin(a) * 0.9 * s - 0.35 * s;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(cxp, cyp, ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}

/** A small barcode-like mark: white plate with dark vertical bars. */
function drawBarcode(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1c0f2e';
  let bx = x + w * 0.08;
  let i = 0;
  while (bx < x + w * 0.92) {
    const bw = ((i * 37) % 3 + 1) * w * 0.03;
    if (i % 3 !== 2) ctx.fillRect(bx, y + h * 0.08, bw, h * 0.84);
    bx += bw + w * 0.035;
    i++;
  }
  ctx.restore();
}

/** The bottom strip: sunset gradient band with palm silhouettes, the
 *  tagline in wide-tracked caps, fine print, and a barcode mark. */
function drawStrip(ctx, w, h, strip, tagline, fineprint) {
  const y = strip.y * h;
  const sh = strip.h * h;
  const g = ctx.createLinearGradient(0, y, 0, y + sh);
  g.addColorStop(0, '#3a1150');
  g.addColorStop(0.45, '#a11e63');
  g.addColorStop(1, '#ff7a3d');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, w, sh);
  const palmColor = 'rgba(24,8,38,0.92)';
  const n = Math.max(5, Math.round(w / (sh * 1.05)));
  for (let i = 0; i < n; i++) {
    const px = (i + 0.5) * (w / n) + (i % 2 ? sh * 0.10 : -sh * 0.07);
    drawPalm(ctx, px, y + sh * 0.72, sh * 0.26, (i % 3 - 1) * 0.35, palmColor);
  }
  const tag = (tagline || '').trim().toUpperCase();
  if (tag) {
    const size = fitFont(ctx, tag, w * 0.84, sh * 0.30, { weight: 800, tracking: Math.max(1, Math.round(sh * 0.06)) });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = size * 0.2;
    ctx.fillText(tag, w / 2, y + sh * 0.52);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = '0px';
  }
  const fp = (fineprint || '').trim();
  if (fp) {
    const size = fitFont(ctx, fp, w * 0.86, sh * 0.14, { weight: 600, tracking: Math.max(0.5, Math.round(sh * 0.02)) });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(fp, w / 2, y + sh * 0.86);
    ctx.letterSpacing = '0px';
  }
  drawBarcode(ctx, w * 0.955, y + sh * 0.62, w * 0.032, sh * 0.28);
}

/**
 * Draws the whole cover onto `canvas` from a state object:
 * { panels: [{img, zoom, ox, oy}], caption, subcaption, roles, quote,
 *   tagline, filter, filterStrength, level, wanted }
 * `level` (1..5, default 4) is the illustration level: the higher it is,
 *  the more the photo looks like it was taken from that game's graphics —
 *  through colour only, never by flattening detail.
 * `wanted` (0..5, default 3) is the wanted level: that many of the five
 *  HUD stars in the top-right corner are lit gold.
 * The title overlaps the photos and IS the poster; the bottom strip
 *  closes the frame — there is no empty caption band.
 */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.letterSpacing = '0px';
  const filter = filterDef(state.filter);
  const level = levelDef(state.level);
  const layout = layoutFor(w, h);
  // Base: deep dusk purple, visible only at the outer edge.
  ctx.fillStyle = '#1c0f2e';
  ctx.fillRect(0, 0, w, h);
  const gutter = Math.max(3, w * 0.006);
  const radius = Math.max(4, w * 0.008);
  const panelRects = layout.panels.map((p) => ({ x: p.x * w, y: p.y * h, w: p.w * w, h: p.h * h }));
  panelRects.forEach((rect, i) => {
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
  // Colour wash over the panels, scaled by the level.
  applyWash(ctx, w, h, filter, (state.filterStrength ?? 1) * level.washT, level.sunT);
  // Warm light-leak glow, scaled by the level.
  drawGlow(ctx, w, h, level.glowT ?? 0);
  // Vignette to pull the eye to the middle.
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(10,4,20,0.32)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  // Wanted HUD in the top-right corner (over the photo tops, never a face).
  drawWanted(ctx, w, h, state.wanted ?? DEFAULT_WANTED);
  // Role labels on the panels.
  const roles = state.roles || DEFAULT_ROLES;
  panelRects.forEach((rect, i) => drawRoleLabel(ctx, rect, roles[i]));
  // ---- Title block, overlapping the photos ----
  const tz = layout.title;
  const tx = tz.x * w, ty = tz.y * h, tw = tz.w * w, th = tz.h * h;
  // Soft dark shade behind the title so it reads over bright photos
  // without a band — the photo still shows through.
  const shade = ctx.createRadialGradient(w / 2, ty + th * 0.55, th * 0.1, w / 2, ty + th * 0.55, Math.max(tw, th) * 0.55);
  shade.addColorStop(0, 'rgba(16,5,28,0.38)');
  shade.addColorStop(0.6, 'rgba(16,5,28,0.20)');
  shade.addColorStop(1, 'rgba(16,5,28,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(tx, ty - th * 0.06, tw, th * 1.1);
  // Press quote with gold stars, above the title.
  const quote = (state.quote ?? DEFAULT_QUOTE).trim();
  if (quote) {
    const qSize = Math.max(11, Math.round(h * 0.018));
    ctx.font = `bold ${qSize}px sans-serif`;
    ctx.letterSpacing = '0px';
    const qw = ctx.measureText(quote).width;
    const starR = qSize * 0.42;
    const starsW = 5 * starR * 2 + 4 * starR * 0.5;
    const totalW = starsW + qSize * 0.7 + qw;
    let sx = w / 2 - totalW / 2 + starR;
    const sy = ty + th * 0.03;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 5; i++) {
      starPath(ctx, sx, sy, starR, starR * 0.45);
      ctx.fillStyle = '#ffd23d';
      ctx.fill();
      sx += starR * 2 + starR * 0.5;
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(quote, sx + qSize * 0.35, sy);
    ctx.letterSpacing = '0px';
  }
  // Title: huge extra-bold condensed poster caps OVER the photos,
  // sunset gradient fill, thick dark outline, soft drop shadow.
  const title = (state.caption || '').trim().toUpperCase();
  let titleSize = 0;
  if (title) {
    const maxW = tw * 0.92;
    const startSize = Math.min(w * 0.13, th * 0.70);
    titleSize = fitFont(ctx, title, maxW, startSize, { weight: 900, family: TITLE_FAMILY, tracking: Math.max(1, Math.round(h * 0.002)) });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = Math.max(4, titleSize * 0.14);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(16,5,28,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = titleSize * 0.16;
    ctx.shadowOffsetY = titleSize * 0.05;
    const tyBase = ty + th * 0.66;
    ctx.strokeText(title, w / 2, tyBase);
    const grad = ctx.createLinearGradient(0, tyBase - titleSize * 0.85, 0, tyBase + titleSize * 0.1);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#fff6d8');
    grad.addColorStop(0.8, '#ffd23d');
    grad.addColorStop(1, '#ff8a3d');
    ctx.fillStyle = grad;
    ctx.fillText(title, w / 2, tyBase);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.letterSpacing = '0px';
  }
  // Script subtitle: neon-pink italic serif under the title.
  const sub = (state.subcaption || '').trim();
  if (sub && titleSize > 0) {
    const sSize = Math.max(14, Math.round(titleSize * 0.34));
    ctx.font = `italic bold ${sSize}px ${SCRIPT_FAMILY}`;
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = '#ff4f8c';
    ctx.shadowBlur = sSize * 0.55;
    ctx.fillStyle = '#ff5e9c';
    ctx.fillText(sub, w / 2, ty + th * 0.92);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = '0px';
  }
  // Gold seal at the title zone's top-right.
  drawSeal(ctx, layout.seal.x * w, layout.seal.y * h, h * 0.036);
  // Bottom strip: palms, tagline, fine print, barcode.
  drawStrip(ctx, w, h, layout.strip, state.tagline ?? DEFAULT_TAGLINE, DEFAULT_FINEPRINT);
  // Thin inner frame, poster style.
  ctx.lineWidth = Math.max(3, w * 0.004);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeRect(w * 0.012, h * 0.012, w * 0.976, h * 0.976);
}
