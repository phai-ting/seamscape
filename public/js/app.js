// Desktop page: screens, gaps, preview, profile link, and download.

import {
  boundingBox, defaultEdges, diagonalInches, edgeKey, monitorsFromScreens, physicalLayout,
  positionNames, reconcileEdges, round1, sizeFromDiagonal, virtualDesktop,
} from './layout.js';
import { clampView, defaultView, outputPlan, panView, placement, zoomView, MAX_ZOOM } from './crop.js';
import { hashForProfile, profileFromHash } from './profile.js';
import { currentScreen, detectScreens, hasWindowManagement, windowManagementPermission } from './screens.js';
import { drawTestPattern } from './testpattern.js';
import { buildZip, FORMATS, saveBlob } from './export.js';
import { detectOS } from './howto.js';

const DEFAULT_GAP = 20;
const PREVIEW_MAX = 2400;
const EXPORT_MAX = 16384;

const $ = (sel) => document.querySelector(sel);

const state = {
  monitors: [],
  edges: [],
  // { kind: 'image' | 'pattern', w, h, full, preview, name }
  picture: null,
  view: defaultView(),
};

// ---------- helpers ----------

function fmt(v) {
  return String(round1(v));
}

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.dataset.kind = kind;
}

function layout() {
  const phys = physicalLayout(state.monitors, state.edges);
  return { phys, box: boundingBox(phys) };
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function numInput(value, attrs) {
  return el('input', { type: 'number', value: String(value), inputMode: 'decimal', ...attrs });
}

// ---------- monitors ----------

function setMonitors(monitors, oldEdges = state.edges) {
  state.monitors = monitors;
  state.edges = reconcileEdges(monitors, oldEdges, currentDefaultGap());
  renderMonitorTable();
  renderEdges();
  updateDerived();
}

function currentDefaultGap() {
  const v = parseFloat($('#all-gaps').value);
  return Number.isFinite(v) ? v : DEFAULT_GAP;
}

function renderMonitorTable() {
  const tbody = $('#monitor-table tbody');
  tbody.replaceChildren(...state.monitors.map((m) => {
    const diag = diagonalInches(m.pw, m.ph);
    return el('tr', { dataset: { n: m.n } },
      el('td', {}, el('span', { className: 'badge' }, String(m.n))),
      el('td', {}, el('input', {
        type: 'radio', name: 'primary', checked: !!m.primary, dataset: { field: 'primary' },
        ariaLabel: `Monitor ${m.n} is primary`,
      })),
      el('td', { className: 'pair' },
        numInput(m.w, { min: 1, step: 1, dataset: { field: 'w' }, ariaLabel: `Monitor ${m.n} width in pixels` }),
        ' × ',
        numInput(m.h, { min: 1, step: 1, dataset: { field: 'h' }, ariaLabel: `Monitor ${m.n} height in pixels` })),
      el('td', { className: 'pair' },
        numInput(m.x, { step: 1, dataset: { field: 'x' }, ariaLabel: `Monitor ${m.n} x position` }),
        ', ',
        numInput(m.y, { step: 1, dataset: { field: 'y' }, ariaLabel: `Monitor ${m.n} y position` })),
      el('td', {}, numInput(Math.round(diag * 10) / 10, {
        min: 5, step: 0.1, dataset: { field: 'diag' }, ariaLabel: `Monitor ${m.n} diagonal in inches`,
      })),
      el('td', { className: 'size muted', dataset: { size: m.n } }),
      el('td', {}, el('button', {
        type: 'button', className: 'icon', dataset: { action: 'remove' },
        disabled: state.monitors.length < 2, title: 'Remove', ariaLabel: `Remove monitor ${m.n}`,
      }, '×')),
    );
  }));
}

function onMonitorInput(e) {
  const input = e.target;
  const row = input.closest('tr');
  if (!row || !input.dataset.field) return;
  const m = state.monitors.find((mm) => mm.n === Number(row.dataset.n));
  const field = input.dataset.field;

  if (field === 'primary') {
    // Positions are relative to the primary, so move the origin to it.
    const dx = m.x, dy = m.y;
    state.monitors.forEach((mm) => { mm.primary = mm === m; mm.x -= dx; mm.y -= dy; });
    renderMonitorTable();
  } else {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) return;
    if (field === 'diag') {
      if (v <= 0) return;
      Object.assign(m, roundedSize(m.w, m.h, v));
    } else if (field === 'w' || field === 'h') {
      if (v < 1) return;
      const diag = diagonalInches(m.pw, m.ph);
      m[field] = Math.round(v);
      Object.assign(m, roundedSize(m.w, m.h, diag));
    } else {
      m[field] = Math.round(v);
    }
  }

  const before = state.edges.map(edgeKey).join();
  state.edges = reconcileEdges(state.monitors, state.edges, currentDefaultGap());
  if (state.edges.map(edgeKey).join() !== before) renderEdges();
  updateDerived();
}

function roundedSize(w, h, inches) {
  const { pw, ph } = sizeFromDiagonal(w, h, inches);
  return { pw: round1(pw), ph: round1(ph) };
}

function onMonitorClick(e) {
  const btn = e.target.closest('button[data-action="remove"]');
  if (!btn || state.monitors.length < 2) return;
  const n = Number(btn.closest('tr').dataset.n);
  const kept = state.monitors.filter((m) => m.n !== n);
  if (!kept.some((m) => m.primary)) kept[0].primary = true;
  // Renumber 1..k and carry measured gaps across to the new numbers.
  const renumber = new Map(kept.map((m, i) => [m.n, i + 1]));
  const oldEdges = state.edges
    .filter((ed) => renumber.has(ed.a) && renumber.has(ed.b))
    .map((ed) => ({ ...ed, a: renumber.get(ed.a), b: renumber.get(ed.b) }));
  setMonitors(kept.map((m) => ({ ...m, n: renumber.get(m.n) })), oldEdges);
}

function addMonitor() {
  const desk = virtualDesktop(state.monitors);
  const n = Math.max(0, ...state.monitors.map((m) => m.n)) + 1;
  setMonitors([...state.monitors, {
    n, w: 1920, h: 1080, x: desk.x + desk.w, y: 0, ...roundedSize(1920, 1080, 24), primary: false,
  }]);
}

async function detect() {
  const status = $('#detect-status');
  try {
    const screens = await detectScreens();
    const found = monitorsFromScreens(screens);
    // Keep sizes the user already entered for monitors that look the same.
    for (const m of found) {
      const prev = state.monitors.find((p) => p.n === m.n && p.w === m.w && p.h === m.h);
      if (prev) Object.assign(m, { pw: prev.pw, ph: prev.ph });
    }
    setMonitors(found);
    setStatus(status, `Found ${found.length} screen${found.length === 1 ? '' : 's'}. Check each diagonal: Seamscape can only guess it.`, 'ok');
  } catch (err) {
    setStatus(status, `Could not read your screens (${err.message}). Allow "window management" for this site, or enter your monitors by hand.`, 'error');
  }
}

// ---------- edges ----------

function renderEdges() {
  const list = $('#edge-list');
  if (state.edges.length === 0) {
    list.replaceChildren(el('p', { className: 'muted' }, 'Only one screen: there are no gaps to measure.'));
    return;
  }
  list.replaceChildren(...state.edges.map((e) => {
    const h = e.dir === 'h';
    return el('div', { className: 'edge', dataset: { key: edgeKey(e) } },
      el('div', { className: 'edge-title' },
        el('span', { className: 'badge' }, String(e.a)),
        h ? ' left of ' : ' above ',
        el('span', { className: 'badge' }, String(e.b))),
      el('label', {}, 'Gap ',
        numInput(e.gap, { min: 0, step: 0.5, dataset: { field: 'gap' } }), ' mm'),
      el('label', {}, `Screen ${e.b}'s picture starts `,
        numInput(e.shift, { step: 0.5, dataset: { field: 'shift' } }),
        h ? ` mm lower than screen ${e.a}'s` : ` mm further right than screen ${e.a}'s`),
    );
  }));
}

function onEdgeInput(e) {
  const input = e.target;
  const row = input.closest('.edge');
  if (!row || !input.dataset.field) return;
  const v = parseFloat(input.value);
  if (!Number.isFinite(v)) return;
  const edge = state.edges.find((ed) => edgeKey(ed) === row.dataset.key);
  edge[input.dataset.field] = v;
  updateDerived();
}

// ---------- picture ----------

function downscale(source, max) {
  const k = Math.min(1, max / Math.max(source.width, source.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(source.width * k));
  c.height = Math.max(1, Math.round(source.height * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

function patternSize(box, longEdge) {
  if (!(box.w > 0 && box.h > 0)) return { w: longEdge, h: Math.round(longEdge / 2) };
  return box.w >= box.h
    ? { w: longEdge, h: Math.max(1, Math.round((longEdge * box.h) / box.w)) }
    : { w: Math.max(1, Math.round((longEdge * box.w) / box.h)), h: longEdge };
}

function usePattern(resetView = true) {
  const { box } = layout();
  const { w, h } = patternSize(box, PREVIEW_MAX);
  const preview = drawTestPattern(document.createElement('canvas'), w, h);
  state.picture = { kind: 'pattern', w, h, preview, full: null, name: 'Test pattern', aspect: box.w / box.h };
  if (resetView) state.view = defaultView();
  setStatus($('#image-status'), 'Showing the test pattern. Lines should run straight across the gaps.');
}

// Full-resolution pattern, sized to the sharpest monitor.
function fullPattern(box) {
  const pxPerMm = Math.max(...state.monitors.map((m) => m.w / m.pw));
  const long = Math.min(EXPORT_MAX, Math.ceil(Math.max(box.w, box.h) * pxPerMm));
  const { w, h } = patternSize(box, long);
  return drawTestPattern(document.createElement('canvas'), w, h);
}

async function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    setStatus($('#image-status'), 'That file is not a picture.', 'error');
    return;
  }
  setStatus($('#image-status'), `Opening ${file.name}…`);
  try {
    const full = await createImageBitmap(file);
    state.picture = {
      kind: 'image', w: full.width, h: full.height, full, preview: downscale(full, PREVIEW_MAX), name: file.name,
    };
    state.view = defaultView();
    setStatus($('#image-status'), `${file.name}: ${full.width} × ${full.height} px. Stays on this computer.`);
    updateDerived();
  } catch {
    setStatus($('#image-status'), `Could not open ${file.name}. Try a JPEG or PNG.`, 'error');
  }
}

// ---------- preview ----------

const preview = { k: 1, margin: 0, box: null };

function drawPreview() {
  const canvas = $('#preview');
  const wrap = $('#drop-zone');
  const { phys, box } = layout();
  const pic = state.picture;
  const margin = Math.max(box.w, box.h) * 0.05;
  const vw = box.w + margin * 2, vh = box.h + margin * 2;
  const maxH = window.innerHeight * 0.6;
  const cssW = Math.min(wrap.clientWidth, (maxH * vw) / vh);
  const cssH = (cssW * vh) / vw;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const k = cssW / vw;
  Object.assign(preview, { k, margin, box });
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, cssW, cssH);
  const X = (mm) => (mm - box.x + margin) * k;
  const Y = (mm) => (mm - box.y + margin) * k;

  const img = { w: pic.w, h: pic.h };
  const place = placement(img, box, state.view);
  const drawPic = () => ctx.drawImage(pic.preview, X(place.x), Y(place.y), img.w * place.s * k, img.h * place.s * k);

  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.28;
  drawPic();
  ctx.globalAlpha = 1;

  const names = positionNames(phys);
  for (const r of phys) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(X(r.x), Y(r.y), r.w * k, r.h * k);
    ctx.clip();
    drawPic();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(X(r.x), Y(r.y), r.w * k, r.h * k);

    const label = `${r.n} · ${names.get(r.n)}`;
    ctx.font = '600 13px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(X(r.x) + 6, Y(r.y) + 6, tw + 12, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, X(r.x) + 12, Y(r.y) + 22);
  }

  // Gap sizes, drawn in the gap.
  const byN = new Map(phys.map((r) => [r.n, r]));
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const e of state.edges) {
    const a = byN.get(e.a), b = byN.get(e.b);
    if (!a || !b) continue;
    let cx, cy;
    if (e.dir === 'h') {
      cx = (a.x + a.w + b.x) / 2;
      cy = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2;
    } else {
      cx = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
      cy = (a.y + a.h + b.y) / 2;
    }
    const text = `${fmt(e.gap)} mm`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255,209,102,0.95)';
    ctx.fillRect(X(cx) - tw / 2 - 5, Y(cy) - 10, tw + 10, 20);
    ctx.fillStyle = '#111';
    ctx.fillText(text, X(cx), Y(cy) + 4);
  }
  ctx.textAlign = 'start';
}

function canvasToMm(evt) {
  const rect = $('#preview').getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) / preview.k - preview.margin + preview.box.x,
    y: (evt.clientY - rect.top) / preview.k - preview.margin + preview.box.y,
  };
}

function setupPreviewInput() {
  const canvas = $('#preview');
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / preview.k, dy = (e.clientY - drag.y) / preview.k;
    drag = { x: e.clientX, y: e.clientY };
    state.view = panView(state.picture, layout().box, state.view, dx, dy);
    drawPreview();
  });
  const end = () => {
    drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    state.view = zoomView(state.picture, layout().box, state.view, factor, canvasToMm(e));
    $('#zoom').value = String(state.view.zoom);
    drawPreview();
  }, { passive: false });

  $('#zoom').max = String(MAX_ZOOM);
  $('#zoom').addEventListener('input', (e) => {
    const z = parseFloat(e.target.value);
    state.view = zoomView(state.picture, layout().box, state.view, z / state.view.zoom);
    drawPreview();
  });

  const zone = $('#drop-zone');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    loadImage(e.dataTransfer.files[0]);
  });
}

// ---------- derived output ----------

let hashTimer = 0;

function updateDerived() {
  const { phys, box } = layout();
  const pic = state.picture;
  if (pic.kind === 'pattern' && Math.abs(pic.aspect - box.w / box.h) > 1e-3) usePattern(false);
  state.view = clampView(state.picture, box, state.view);
  $('#zoom').value = String(state.view.zoom);

  for (const r of phys) {
    const cell = document.querySelector(`[data-size="${r.n}"]`);
    if (cell) cell.textContent = `${Math.round(r.w)} × ${Math.round(r.h)} mm`;
  }
  drawPreview();

  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    history.replaceState(null, '', hashForProfile({ monitors: state.monitors, edges: state.edges }));
    $('#profile-link').value = location.href;
  }, 250);
}

// ---------- download ----------

async function download() {
  const btn = $('#download-btn');
  const status = $('#download-status');
  const oses = [...document.querySelectorAll('input[name="os"]:checked')].map((i) => i.value);
  if (oses.length === 0) {
    setStatus(status, 'Pick at least one operating system.', 'error');
    return;
  }
  btn.disabled = true;
  try {
    const { phys, box } = layout();
    const pic = state.picture;
    const plan = outputPlan(state.monitors, phys, pic, state.view);
    const source = pic.kind === 'image' ? pic.full : fullPattern(box);
    const blob = await buildZip({
      source,
      imgW: pic.w,
      plan,
      oses,
      format: FORMATS[$('#format').value],
      onProgress: (i, total, path) => setStatus(status, path ? `Building ${path} (${i + 1} of ${total})…` : 'Packing ZIP…'),
    });
    saveBlob(blob, 'seamscape-wallpaper.zip');
    setStatus(status, `Done: ${(blob.size / 1e6).toFixed(1)} MB. Open HOW-TO-APPLY.txt in the folder for your OS.`, 'ok');
  } catch (err) {
    setStatus(status, `Something went wrong: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------- start ----------

async function init() {
  const os = detectOS(navigator.userAgentData?.platform || navigator.platform || '');
  document.querySelector(`input[name="os"][value="${os}"]`).checked = true;

  $('#detect-btn').addEventListener('click', detect);
  $('#add-btn').addEventListener('click', addMonitor);
  $('#monitor-table tbody').addEventListener('input', onMonitorInput);
  $('#monitor-table tbody').addEventListener('change', (e) => {
    if (e.target.dataset.field === 'primary') onMonitorInput(e);
  });
  $('#monitor-table tbody').addEventListener('click', onMonitorClick);
  $('#edge-list').addEventListener('input', onEdgeInput);
  $('#all-gaps-btn').addEventListener('click', () => {
    const g = currentDefaultGap();
    state.edges.forEach((e) => { e.gap = g; });
    renderEdges();
    updateDerived();
  });
  $('#reset-edges-btn').addEventListener('click', () => {
    state.edges = defaultEdges(state.monitors, currentDefaultGap());
    renderEdges();
    updateDerived();
  });
  $('#image-input').addEventListener('change', (e) => loadImage(e.target.files[0]));
  $('#pattern-btn').addEventListener('click', () => {
    usePattern();
    updateDerived();
  });
  $('#reset-view-btn').addEventListener('click', () => {
    state.view = defaultView();
    updateDerived();
  });
  $('#download-btn').addEventListener('click', download);
  $('#copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#profile-link').value);
      $('#copy-btn').textContent = 'Copied';
    } catch {
      $('#profile-link').select();
    }
    setTimeout(() => { $('#copy-btn').textContent = 'Copy link'; }, 1500);
  });
  window.addEventListener('resize', () => drawPreview());
  setupPreviewInput();

  const detectStatus = $('#detect-status');
  if (!hasWindowManagement()) {
    $('#detect-btn').disabled = true;
    setStatus(detectStatus, 'This browser can only see the screen this window is on. Add your other monitors by hand, or open Seamscape in Chrome or Edge to detect them.');
  }

  let profile = null;
  try {
    profile = profileFromHash(location.hash);
  } catch (err) {
    setStatus(detectStatus, `Your saved link could not be read (${err.message}). Starting fresh.`, 'error');
  }

  if (profile) {
    state.monitors = profile.monitors;
    state.edges = profile.edges;
    setStatus(detectStatus, 'Loaded your saved layout.', 'ok');
  } else {
    state.monitors = monitorsFromScreens(currentScreen());
    state.edges = defaultEdges(state.monitors, DEFAULT_GAP);
  }
  usePattern();
  renderMonitorTable();
  renderEdges();
  updateDerived();

  if (!profile && (await windowManagementPermission()) === 'granted') await detect();
}

init();
