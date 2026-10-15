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
import { detectOS, howToGuide, OS_LABELS, OSES } from './howto.js';

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
  guides: false,
  highlight: null, // monitor number lit in yellow, or null
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

// Static, trusted SVG markup from this file only.
function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  const node = t.content.firstElementChild;
  node.setAttribute('aria-hidden', 'true');
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

// A job ticket: one header row of column labels, then one row per monitor.
// Rows are a CSS grid so they can fold onto two lines on phones.
function renderMonitorTable() {
  const list = $('#monitor-list');
  const header = el('div', { className: 'ticket-row ticket-head', role: 'row' },
    ...['#', 'Resolution, px', 'Position, px', 'Diag, in', 'Primary', ''].map((t) =>
      el('span', { role: 'columnheader', className: 'cell' }, t)));
  const rows = state.monitors.map((m) => {
    const diag = diagonalInches(m.pw, m.ph);
    return el('div', { className: 'ticket-row monitor', role: 'row', dataset: { n: m.n } },
      el('span', { className: 'cell cell-num', role: 'cell' }, el('span', { className: 'page-num' }, String(m.n))),
      el('span', { className: 'cell pair', role: 'cell', dataset: { label: 'Resolution, px' } },
        numInput(m.w, { min: 1, step: 1, dataset: { field: 'w' }, ariaLabel: `Monitor ${m.n} width in pixels` }),
        el('span', { className: 'x' }, '×'),
        numInput(m.h, { min: 1, step: 1, dataset: { field: 'h' }, ariaLabel: `Monitor ${m.n} height in pixels` })),
      el('span', { className: 'cell pair', role: 'cell', dataset: { label: 'Position, px' } },
        numInput(m.x, { step: 1, dataset: { field: 'x' }, ariaLabel: `Monitor ${m.n} x position` }),
        el('span', { className: 'x' }, ','),
        numInput(m.y, { step: 1, dataset: { field: 'y' }, ariaLabel: `Monitor ${m.n} y position` })),
      el('span', { className: 'cell', role: 'cell', dataset: { label: 'Diag, in' } },
        numInput(Math.round(diag * 10) / 10, {
          min: 5, step: 0.1, dataset: { field: 'diag' }, ariaLabel: `Monitor ${m.n} diagonal in inches`,
        })),
      el('span', { className: 'cell cell-primary', role: 'cell', dataset: { label: 'Primary' } },
        el('input', {
          type: 'radio', name: 'primary', checked: !!m.primary, dataset: { field: 'primary' },
          ariaLabel: `Monitor ${m.n} is primary`,
        })),
      el('span', { className: 'cell cell-rm', role: 'cell' },
        el('button', {
          type: 'button', className: 'icon-btn', dataset: { action: 'remove' },
          disabled: state.monitors.length < 2, title: 'Remove', ariaLabel: `Remove monitor ${m.n}`,
        }, svg('<svg class="icon" viewBox="0 0 20 20"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg>'))),
    );
  });
  list.replaceChildren(header, ...rows);
  markHighlight();
}

// Yellow ties a ticket row to its trimmed page on the proof, both ways.
function setHighlight(n) {
  if (state.highlight === n) return;
  state.highlight = n;
  markHighlight();
  drawPreview();
}

function markHighlight() {
  document.querySelectorAll('.monitor').forEach((row) => {
    row.classList.toggle('lit', Number(row.dataset.n) === state.highlight);
  });
}

function onMonitorInput(e) {
  const input = e.target;
  const row = input.closest('.monitor');
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
  const n = Number(btn.closest('.monitor').dataset.n);
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
    list.replaceChildren(el('p', { className: 'empty-note' }, 'One screen, so there are no gaps to measure.'));
    return;
  }
  list.replaceChildren(...state.edges.map((e) => {
    const h = e.dir === 'h';
    const mark = h
      ? '<svg class="edge-mark" viewBox="0 0 30 18"><path d="M2 3v12M28 3v12M2 9h26"/></svg>'
      : '<svg class="edge-mark" viewBox="0 0 30 18"><path d="M8 1h14M8 17h14M15 1v16"/></svg>';
    return el('div', { className: 'edge', dataset: { key: edgeKey(e) } },
      svg(mark),
      el('div', { className: 'edge-title' },
        el('span', { className: 'page-num' }, String(e.a)),
        h ? 'left of' : 'above',
        el('span', { className: 'page-num' }, String(e.b))),
      el('div', { className: 'edge-fields' },
        el('label', {}, 'Gap',
          numInput(e.gap, { min: 0, step: 0.5, dataset: { field: 'gap' }, ariaLabel: `Gap between ${e.a} and ${e.b} in mm` }), 'mm'),
        el('label', {}, `${e.b} starts`,
          numInput(e.shift, { step: 0.5, dataset: { field: 'shift' }, ariaLabel: `Offset of ${e.b} in mm` }),
          h ? `mm lower than ${e.a}` : `mm further right than ${e.a}`)),
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

// The preview is a press proof: monitors are trimmed pages on a sheet, the
// picture bleeds faintly past each trim, crop marks sit outside every corner,
// and gaps carry magenta dimensions.
const PROOF = {
  sheet: '#ffffff',
  ink: '#111111',
  magenta: '#d1006c',
  cyan: '#0089c7',
  yellow: '#ffe500',
  bleedAlpha: 0.18,
  margin: 52, // css px of sheet around the trims: room for marks and targets
  markGap: 4,
  markLen: 12,
};

const preview = { k: 1, ox: 0, oy: 0, box: null };

function cropMarks(ctx, x, y, w, h) {
  const g = PROOF.markGap, l = PROOF.markLen;
  ctx.beginPath();
  for (const [cx, sx] of [[x, -1], [x + w, 1]]) {
    for (const [cy, sy] of [[y, -1], [y + h, 1]]) {
      ctx.moveTo(cx + sx * g, cy); ctx.lineTo(cx + sx * (g + l), cy);
      ctx.moveTo(cx, cy + sy * g); ctx.lineTo(cx, cy + sy * (g + l));
    }
  }
  ctx.stroke();
}

function registrationTarget(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y);
  ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12);
  ctx.stroke();
}

function dimension(ctx, x1, y1, x2, y2, text) {
  const horizontal = y1 === y2;
  ctx.strokeStyle = PROOF.magenta;
  ctx.fillStyle = PROOF.magenta;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  if (horizontal) {
    ctx.moveTo(x1, y1 - 6); ctx.lineTo(x1, y1 + 6);
    ctx.moveTo(x2, y2 - 6); ctx.lineTo(x2, y2 + 6);
  } else {
    ctx.moveTo(x1 - 6, y1); ctx.lineTo(x1 + 6, y1);
    ctx.moveTo(x2 - 6, y2); ctx.lineTo(x2 + 6, y2);
  }
  ctx.stroke();
  ctx.font = '600 12px Archivo, system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const lx = horizontal ? (x1 + x2) / 2 - tw / 2 - 6 : x1 - tw - 22;
  const ly = horizontal ? y1 - 28 : (y1 + y2) / 2 - 10;
  ctx.fillRect(lx, ly, tw + 12, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, lx + 6, ly + 14);
}

function drawPreview() {
  const canvas = $('#preview');
  const wrap = $('#drop-zone');
  const { phys, box } = layout();
  const pic = state.picture;
  const cssW = Math.max(200, wrap.clientWidth - 2);
  const M = cssW < 600 ? PROOF.margin * 0.65 : PROOF.margin;
  const maxH = Math.max(240, window.innerHeight * 0.62);
  const top = M + 34; // extra headroom for the gap dimension labels
  const k = Math.min((cssW - 2 * M) / box.w, (maxH - M - top) / box.h);
  const cssH = box.h * k + M + top;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ox = (cssW - box.w * k) / 2, oy = top;
  Object.assign(preview, { k, ox, oy, box });
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PROOF.sheet;
  ctx.fillRect(0, 0, cssW, cssH);
  const X = (mm) => ox + (mm - box.x) * k;
  const Y = (mm) => oy + (mm - box.y) * k;

  const img = { w: pic.w, h: pic.h };
  const place = placement(img, box, state.view);
  const drawPic = () => ctx.drawImage(pic.preview, X(place.x), Y(place.y), img.w * place.s * k, img.h * place.s * k);

  // Bleed: the whole picture, faint, as printed before trimming.
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = PROOF.bleedAlpha;
  drawPic();
  ctx.globalAlpha = 1;

  // Crop marks first, so a neighbouring page covers any mark that runs into it.
  ctx.strokeStyle = PROOF.ink;
  ctx.lineWidth = 0.75;
  for (const r of phys) cropMarks(ctx, X(r.x), Y(r.y), r.w * k, r.h * k);
  registrationTarget(ctx, M / 2, oy + (box.h * k) / 2);
  registrationTarget(ctx, cssW - M / 2, oy + (box.h * k) / 2);

  // Trimmed pages at full strength.
  for (const r of phys) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(X(r.x), Y(r.y), r.w * k, r.h * k);
    ctx.clip();
    drawPic();
    ctx.restore();
  }

  const lit = phys.find((r) => r.n === state.highlight);
  if (lit) {
    ctx.strokeStyle = PROOF.yellow;
    ctx.lineWidth = 3;
    ctx.strokeRect(X(lit.x) - 1.5, Y(lit.y) - 1.5, lit.w * k + 3, lit.h * k + 3);
  }

  if (state.guides) {
    ctx.strokeStyle = PROOF.cyan;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const y = Math.round(oy + (box.h * k * i) / 8) + 0.5;
      ctx.moveTo(M / 2 + 16, y); ctx.lineTo(cssW - M / 2 - 16, y);
    }
    ctx.stroke();
  }

  // Page numbers, set like folios in the corner of each page.
  ctx.font = '700 12px Archivo, system-ui, sans-serif';
  for (const r of phys) {
    const label = String(r.n);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = PROOF.ink;
    ctx.fillRect(X(r.x), Y(r.y), Math.max(20, tw + 12), 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, X(r.x) + Math.max(20, tw + 12) / 2 - tw / 2, Y(r.y) + 14);
  }

  // Gap dimensions in magenta, drawn like a drafting dimension: witness
  // lines from the facing page edges out past the pages, the dimension line
  // across the gap, and the value beside it.
  const byN = new Map(phys.map((r) => [r.n, r]));
  ctx.strokeStyle = PROOF.magenta;
  ctx.lineWidth = 0.75;
  for (const e of state.edges) {
    const a = byN.get(e.a), b = byN.get(e.b);
    if (!a || !b) continue;
    const text = `${fmt(e.gap)} mm`;
    if (e.dir === 'h') {
      const x1 = X(a.x + a.w), x2 = X(b.x);
      const y = Y(Math.min(a.y, b.y)) - 18;
      ctx.beginPath();
      ctx.moveTo(x1, Y(a.y) - 2); ctx.lineTo(x1, y - 4);
      ctx.moveTo(x2, Y(b.y) - 2); ctx.lineTo(x2, y - 4);
      ctx.stroke();
      dimension(ctx, x1, y, x2, y, text);
    } else {
      const y1 = Y(a.y + a.h), y2 = Y(b.y);
      const x = X(Math.min(a.x, b.x)) - 18;
      ctx.beginPath();
      ctx.moveTo(X(a.x) - 2, y1); ctx.lineTo(x - 4, y1);
      ctx.moveTo(X(b.x) - 2, y2); ctx.lineTo(x - 4, y2);
      ctx.stroke();
      dimension(ctx, x, y1, x, y2, text);
    }
    ctx.strokeStyle = PROOF.magenta;
    ctx.lineWidth = 0.75;
  }
}

function updateSlug(phys, box) {
  const names = positionNames(phys);
  const keep = (t) => t.replace(/ /g, ' '); // keep each item on one line
  const items = [
    `${phys.length} ${phys.length === 1 ? 'page' : 'pages'}`,
    `sheet ${Math.round(box.w)} × ${Math.round(box.h)} mm`,
    ...state.monitors.map((m) => `${m.n} ${names.get(m.n)} ${m.w} × ${m.h}`),
  ];
  if (state.edges.length) items.push(`gaps ${state.edges.map((e) => fmt(e.gap)).join(' / ')} mm`);
  $('#slug').textContent = items.map(keep).join('  ·  ');
}

function pageAt(evt) {
  const p = canvasToMm(evt);
  const r = layout().phys.find((q) => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h);
  return r ? r.n : null;
}

function canvasToMm(evt) {
  const rect = $('#preview').getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left - preview.ox) / preview.k + preview.box.x,
    y: (evt.clientY - rect.top - preview.oy) / preview.k + preview.box.y,
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
    if (!drag) {
      if (e.pointerType === 'mouse') setHighlight(pageAt(e));
      return;
    }
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
  canvas.addEventListener('pointerleave', () => { if (!drag) setHighlight(null); });
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

  const names = positionNames(phys);
  for (const r of phys) {
    const size = document.querySelector(`[data-size="${r.n}"]`);
    if (size) size.textContent = `${Math.round(r.w)} × ${Math.round(r.h)} mm`;
    const name = document.querySelector(`[data-name="${r.n}"]`);
    if (name) name.textContent = names.get(r.n);
  }
  drawPreview();
  updateSlug(phys, box);
  renderGuides();

  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    history.replaceState(null, '', hashForProfile({ monitors: state.monitors, edges: state.edges }));
    $('#profile-link').value = location.href;
  }, 250);
}

// ---------- how to apply ----------

function selectedOses() {
  return [...document.querySelectorAll('input[name="os"]:checked')].map((i) => i.value);
}

function renderGuide(os, plan, ext) {
  const guide = howToGuide(os, plan, ext);
  const parts = [
    el('h3', {}, OS_LABELS[os]),
    el('ul', { className: 'files' }, ...guide.files.map((f) => el('li', {},
      el('code', {}, f.name), el('span', { className: 'muted' }, f.desc)))),
  ];
  for (const b of guide.blocks) {
    if (b.type === 'heading') parts.push(el('h4', {}, b.text));
    else if (b.type === 'p') parts.push(el('p', {}, b.text));
    else if (b.type === 'steps') parts.push(el('ol', {}, ...b.items.map((t) => el('li', {}, t))));
    else if (b.type === 'code') parts.push(el('pre', {}, el('code', {}, b.lines.join('\n'))));
  }
  return el('div', { className: 'guide' }, ...parts);
}

function renderGuides() {
  const box = $('#apply-guides');
  const oses = OSES.filter((os) => selectedOses().includes(os));
  if (oses.length === 0) {
    box.replaceChildren(el('p', { className: 'muted' }, 'Pick an operating system under Download to see the steps.'));
    return;
  }
  const { phys } = layout();
  const plan = outputPlan(state.monitors, phys, state.picture, state.view);
  const ext = FORMATS[$('#format').value].ext;
  box.replaceChildren(...oses.map((os) => renderGuide(os, plan, ext)));
}

// ---------- download ----------

async function download() {
  const btn = $('#download-btn');
  const status = $('#download-status');
  const oses = selectedOses();
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
  $('#monitor-list').addEventListener('input', onMonitorInput);
  $('#monitor-list').addEventListener('change', (e) => {
    if (e.target.dataset.field === 'primary') onMonitorInput(e);
  });
  $('#monitor-list').addEventListener('click', onMonitorClick);
  const rowOf = (e) => e.target.closest?.('.monitor');
  $('#monitor-list').addEventListener('pointerover', (e) => setHighlight(rowOf(e) ? Number(rowOf(e).dataset.n) : null));
  $('#monitor-list').addEventListener('pointerleave', () => setHighlight(null));
  $('#monitor-list').addEventListener('focusin', (e) => setHighlight(rowOf(e) ? Number(rowOf(e).dataset.n) : null));
  $('#monitor-list').addEventListener('focusout', () => setHighlight(null));
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
  document.querySelectorAll('input[name="os"]').forEach((i) => i.addEventListener('change', renderGuides));
  $('#format').addEventListener('change', renderGuides);
  $('#copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#profile-link').value);
      $('#copy-btn').textContent = 'Copied';
    } catch {
      $('#profile-link').select();
    }
    setTimeout(() => { $('#copy-btn').textContent = 'Copy link'; }, 1500);
  });
  $('#guides-toggle').addEventListener('change', (e) => {
    state.guides = e.target.checked;
    drawPreview();
  });
  window.addEventListener('resize', () => drawPreview());
  // Canvas text needs the web font loaded before it draws in Archivo.
  document.fonts?.load('600 12px Archivo').then(() => drawPreview()).catch(() => {});
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
