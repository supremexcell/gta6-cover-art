// Wires the cover maker: three photo panels (upload or sample), crop/zoom/
// position per panel, editable caption, six original GTA-series-inspired
// filters (GTA VI illustration is the default) with an illustration Level
// 1..5 (higher = more like that game's graphics) and a Wanted Level 0..5
// (HUD stars in the top-right corner), and PNG export at
// 1080x1080, 1080x1350 and 1920x1080. A `?shot=` query sets up a fixed
// scene for a screenshot instead (./shots.js).
import { drawCover, FILTERS, DEFAULT_FILTER, LEVELS, DEFAULT_LEVEL, levelNumber, DEFAULT_WANTED, wantedNumber } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const captionEl = document.getElementById('caption');
const subEl = document.getElementById('subcaption');
const filterEl = document.getElementById('filter');
const strengthEl = document.getElementById('strength');
const levelEl = document.getElementById('level');
const wantedEl = document.getElementById('wanted');
const sizeEl = document.getElementById('size');

const state = {
  panels: [
    { img: null, zoom: 1, ox: 0, oy: 0, label: 'Panel 1' },
    { img: null, zoom: 1, ox: 0, oy: 0, label: 'Panel 2' },
    { img: null, zoom: 1, ox: 0, oy: 0, label: 'Panel 3' },
  ],
  caption: 'Sunset Heist',
  subcaption: 'Sunset Nights',
  filter: DEFAULT_FILTER,
  filterStrength: 1,
  level: DEFAULT_LEVEL,
  wanted: DEFAULT_WANTED,
  selectedPanel: 0,
};

function redraw() {
  drawCover(canvas, state);
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ---- Panel controls -------------------------------------------------------
const panelTabs = document.getElementById('panel-tabs');
state.panels.forEach((p, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tab';
  b.textContent = p.label;
  b.addEventListener('click', () => {
    state.selectedPanel = i;
    syncPanelControls();
  });
  panelTabs.appendChild(b);
});

const zoomEl = document.getElementById('zoom');
const oxEl = document.getElementById('ox');
const oyEl = document.getElementById('oy');
function syncPanelControls() {
  [...panelTabs.children].forEach((b, i) => b.classList.toggle('active', i === state.selectedPanel));
  const p = state.panels[state.selectedPanel];
  zoomEl.value = p.zoom;
  oxEl.value = p.ox;
  oyEl.value = p.oy;
  document.getElementById('zoom-val').textContent = `${Math.round(p.zoom * 100)}%`;
  document.getElementById('ox-val').textContent = `${Math.round(p.ox * 100)}`;
  document.getElementById('oy-val').textContent = `${Math.round(p.oy * 100)}`;
}
zoomEl.addEventListener('input', () => { state.panels[state.selectedPanel].zoom = +zoomEl.value; syncPanelControls(); redraw(); });
oxEl.addEventListener('input', () => { state.panels[state.selectedPanel].ox = +oxEl.value; syncPanelControls(); redraw(); });
oyEl.addEventListener('input', () => { state.panels[state.selectedPanel].oy = +oyEl.value; syncPanelControls(); redraw(); });

async function setPanelPhoto(i, url) {
  state.panels[i].img = await loadImage(url);
  state.selectedPanel = i;
  syncPanelControls();
  redraw();
}
document.getElementById('photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await setPanelPhoto(state.selectedPanel, URL.createObjectURL(file));
  statusEl.textContent = `Foto dimuat ke ${state.panels[state.selectedPanel].label}.`;
});
document.querySelectorAll('[data-sample]').forEach((b) => {
  b.addEventListener('click', async () => {
    await setPanelPhoto(state.selectedPanel, b.dataset.sample);
    statusEl.textContent = `Foto contoh dimuat ke ${state.panels[state.selectedPanel].label}.`;
  });
});
document.getElementById('clear-panel').addEventListener('click', () => {
  state.panels[state.selectedPanel].img = null;
  redraw();
});

// ---- Caption, filter, size -------------------------------------------------
captionEl.addEventListener('input', () => { state.caption = captionEl.value; redraw(); });
subEl.addEventListener('input', () => { state.subcaption = subEl.value; redraw(); });
for (const [key, f] of Object.entries(FILTERS)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = f.label;
  if (key === DEFAULT_FILTER) o.selected = true;
  filterEl.appendChild(o);
}
filterEl.addEventListener('change', () => { state.filter = filterEl.value; redraw(); });
strengthEl.addEventListener('input', () => {
  state.filterStrength = +strengthEl.value;
  document.getElementById('strength-val').textContent = `${Math.round(state.filterStrength * 100)}%`;
  redraw();
});
function syncLevelLabel() {
  const n = levelNumber(state.level);
  document.getElementById('level-val').textContent = `Level ${n} — ${LEVELS[n].name}`;
}
levelEl.addEventListener('input', () => {
  state.level = levelNumber(levelEl.value);
  syncLevelLabel();
  redraw();
});
syncLevelLabel();
function syncWantedLabel() {
  const n = wantedNumber(state.wanted);
  document.getElementById('wanted-val').textContent = n === 0 ? '0 — bersih' : `${n} bintang`;
}
wantedEl.addEventListener('input', () => {
  state.wanted = wantedNumber(wantedEl.value);
  syncWantedLabel();
  redraw();
});
syncWantedLabel();
sizeEl.addEventListener('change', () => {
  const [w, h] = sizeEl.value.split('x').map(Number);
  canvas.width = w;
  canvas.height = h;
  redraw();
});

// Drag on the preview: drag the selected panel to pan its photo.
let drag = null;
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}
canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  drag = { i: state.selectedPanel, start: p, ox: state.panels[state.selectedPanel].ox, oy: state.panels[state.selectedPanel].oy };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  const panel = state.panels[drag.i];
  panel.ox = Math.min(1, Math.max(-1, drag.ox + (p.x - drag.start.x) * 2));
  panel.oy = Math.min(1, Math.max(-1, drag.oy + (p.y - drag.start.y) * 2));
  syncPanelControls();
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });

// ---- Export -----------------------------------------------------------------
const SIZES = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1920x1080': [1920, 1080] };
export function exportPNG(sizeKey) {
  const [w, h] = SIZES[sizeKey] || SIZES['1080x1080'];
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  drawCover(off, state);
  return new Promise((resolve) => {
    off.toBlob((blob) => resolve({ w, h, blob }), 'image/png');
  });
}
document.getElementById('export').addEventListener('click', async () => {
  const key = sizeEl.value;
  const { w, h, blob } = await exportPNG(key);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cover-${w}x${h}.png`;
  a.click();
  statusEl.textContent = `Tersimpan cover-${w}x${h}.png (${Math.round(blob.size / 1024)} KB).`;
});

// ---- Screenshot scenes -------------------------------------------------------
const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  runShot(shot, new URLSearchParams(location.search), {
    loadImage,
    setPanelPhoto,
    setCaption: (t) => { captionEl.value = t; state.caption = t; },
    setSubcaption: (t) => { subEl.value = t; state.subcaption = t; },
    setFilter: (f) => { filterEl.value = f; state.filter = f; },
    setLevel: (l) => {
      state.level = levelNumber(l);
      levelEl.value = state.level;
      syncLevelLabel();
    },
    setWanted: (n) => {
      state.wanted = wantedNumber(n);
      wantedEl.value = state.wanted;
      syncWantedLabel();
    },
    setSize: (key) => { sizeEl.value = key; sizeEl.dispatchEvent(new Event('change')); },
    setPanelPan: (i, ox, oy) => {
      state.panels[i].ox = ox;
      state.panels[i].oy = oy;
      state.selectedPanel = i;
      syncPanelControls();
    },
    exportPNG,
    redraw,
    state,
  });
} else {
  syncPanelControls();
  redraw();
}
