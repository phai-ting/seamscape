// Phone page: take one photo of the calibration screens, measure it here,
// and hand the result to the desktop as a code or a link.
// The photo is decoded into a canvas in this tab and never sent anywhere.

import { decodeScreens, encodeCode, screensFromHash } from './handoff.js';
import { detectMarkers, toGray } from './detect.js';
import { measureLayout } from './measure.js';
import { applyH } from './homography.js';
import { boundingBox, diagonalInches, physicalLayout, round1 } from './layout.js';
import { hashForProfile } from './profile.js';

// Long edge the photo is measured at: a 12 MP phone photo is used as is.
const MAX_EDGE = 4032;
const INK = '#111111';
const MAGENTA = '#d1006c';
const FONT = 'Archivo, system-ui, sans-serif';

const $ = (sel) => document.querySelector(sel);

let job = null; // { text, info }
let busy = false;

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.dataset.kind = kind;
}

function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function folio(n) {
  return el('span', 'page-num', String(n));
}

// Let the status line paint before heavy work. Animation frames stop in a
// hidden tab, so a timer backs them up.
function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 100);
  });
}

// ---------- OpenCV, loaded on demand ----------

let opencv = null;

// Resolves to { cv }. The OpenCV module is a thenable that resolves to
// itself, so it is wrapped: awaiting it bare would never settle.
function loadOpenCV() {
  opencv ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'js/vendor/opencv.js';
    script.async = true;
    script.onload = () => {
      const cv = window.cv;
      if (!cv) { reject(new Error('The measuring tool did not start')); return; }
      if (cv.Mat) resolve({ cv });
      else cv.onRuntimeInitialized = () => resolve({ cv });
    };
    script.onerror = () => reject(new Error('The measuring tool could not be loaded. Check your connection and try again.'));
    document.head.append(script);
  });
  opencv.catch(() => { opencv = null; });
  return opencv;
}

// ---------- step 1: the photo ----------

function renderExpectation() {
  const ms = job.info.monitors;
  $('#expect-lede').textContent = `Your computer is showing a pattern on ${ms.length} ${ms.length === 1 ? 'screen' : 'screens'}:`;
  $('#expect').replaceChildren(...ms.map((m) => el('li', '',
    folio(m.n),
    el('span', '', `${m.w} × ${m.h}, ${round1(diagonalInches(m.pw, (m.pw * m.h) / m.w))} in`),
    m.primary ? el('span', 'muted', 'primary, with the QR code') : '')));
}

async function readPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const gray = toGray(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  return { canvas, gray };
}

async function analyse(file) {
  if (!file || busy) return;
  const status = $('#shoot-status');
  if (!file.type.startsWith('image/')) {
    setStatus(status, 'That file is not a photo.', 'error');
    return;
  }
  busy = true;
  $('#take-btn').classList.add('busy');
  try {
    setStatus(status, 'Opening the photo…');
    await nextFrame();
    const photo = await readPhoto(file);
    const ready = loadOpenCV();
    if (!window.cv?.Mat) {
      setStatus(status, 'Loading the measuring tool (about 10 MB, only the first time)…');
    }
    const { cv } = await ready;
    setStatus(status, 'Looking for the markers…');
    await nextFrame();
    const found = detectMarkers(cv, photo.gray, photo.canvas.width, photo.canvas.height);
    const result = measureLayout(job.info, found, { width: photo.canvas.width, height: photo.canvas.height });
    setStatus(status, '');
    showResult(result, found, photo.canvas);
  } catch (err) {
    setStatus(status, `Something went wrong: ${err.message}`, 'error');
  } finally {
    busy = false;
    $('#take-btn').classList.remove('busy');
    $('#take').value = '';
    $('#pick').value = '';
  }
}

// ---------- step 2: feedback ----------

function drawPhoto(canvas, source, result, found) {
  const cssW = canvas.parentElement.clientWidth - 2;
  const k = cssW / source.width;
  const cssH = source.height * k;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, cssW, cssH);
  // Dim the photo so the measurement marks read on any picture.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(0, 0, cssW, cssH);
  const P = ([x, y]) => [x * k, y * k];

  ctx.strokeStyle = MAGENTA;
  ctx.lineWidth = 1.5;
  for (const d of found) {
    ctx.beginPath();
    d.corners.map(P).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }

  ctx.font = `700 12px ${FONT}`;
  for (const s of result.screens) {
    if (!s.G) continue;
    const m = job.info.monitors.find((mm) => mm.n === s.n);
    const quad = [[0, 0], [m.w, 0], [m.w, m.h], [0, m.h]].map((c) => P(applyH(s.G, c)));
    ctx.setLineDash(s.status === 'ok' ? [] : [6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = MAGENTA;
    ctx.beginPath();
    quad.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // Folio at the screen's top-left corner, kept on the canvas.
    const label = String(m.n);
    const w = Math.max(20, ctx.measureText(label).width + 12);
    const x = Math.min(Math.max(quad[0][0], 0), cssW - w);
    const y = Math.min(Math.max(quad[0][1], 0), cssH - 20);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, w, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + w / 2 - ctx.measureText(label).width / 2, y + 14);
  }
}

function screenLine(s) {
  if (s.status === 'missing') return 'No markers found';
  const found = `${s.found.length} of 8 markers`;
  if (s.status === 'partial') return s.cut.length ? `Cut off on the ${s.cut.join(' and ')} (${found})` : `Hard to read (${found})`;
  return s.cut.length ? `Measured, partly cut off (${found})` : `Measured (${found})`;
}

// A small proof of the measured layout: pages, folios, magenta gap labels.
function drawLayout(canvas, profile) {
  const phys = physicalLayout(profile.monitors, profile.edges);
  const box = boundingBox(phys);
  const cssW = canvas.parentElement.clientWidth - 2;
  const pad = 28;
  const k = Math.min((cssW - 2 * pad) / box.w, 260 / box.h);
  const cssH = box.h * k + 2 * pad + 10;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);
  const ox = (cssW - box.w * k) / 2, oy = pad + 10;
  const X = (mm) => ox + (mm - box.x) * k, Y = (mm) => oy + (mm - box.y) * k;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.fillStyle = '#ecece7';
  for (const r of phys) {
    ctx.fillRect(X(r.x), Y(r.y), r.w * k, r.h * k);
    ctx.strokeRect(X(r.x) + 0.5, Y(r.y) + 0.5, r.w * k - 1, r.h * k - 1);
  }
  ctx.font = `700 12px ${FONT}`;
  for (const r of phys) {
    ctx.fillStyle = INK;
    ctx.fillRect(X(r.x), Y(r.y), 20, 20);
    ctx.fillStyle = '#ffffff';
    const t = String(r.n);
    ctx.fillText(t, X(r.x) + 10 - ctx.measureText(t).width / 2, Y(r.y) + 14);
  }
  const byN = new Map(phys.map((r) => [r.n, r]));
  ctx.font = `600 12px ${FONT}`;
  for (const e of profile.edges) {
    const a = byN.get(e.a), b = byN.get(e.b);
    const text = `${round1(e.gap)} mm`;
    const tw = ctx.measureText(text).width;
    let lx, ly;
    if (e.dir === 'h') {
      lx = (X(a.x + a.w) + X(b.x)) / 2 - tw / 2 - 6;
      ly = Y(Math.min(a.y, b.y)) - 24;
    } else {
      lx = X(Math.min(a.x, b.x)) + 26;
      ly = (Y(a.y + a.h) + Y(b.y)) / 2 - 10;
    }
    ctx.fillStyle = MAGENTA;
    ctx.fillRect(lx, ly, tw + 12, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, lx + 6, ly + 14);
  }
}

function gapLine(e) {
  const h = e.dir === 'h';
  const shift = round1(Math.abs(e.shift));
  const where = h ? (e.shift >= 0 ? 'lower' : 'higher') : (e.shift >= 0 ? 'further right' : 'further left');
  return el('li', '',
    folio(e.a), h ? 'left of' : 'above', folio(e.b),
    el('span', 'gap-figures', `gap ${round1(e.gap)} mm, ${e.b} sits ${shift} mm ${where}`));
}

let last = null;

function showResult(result, found, source) {
  last = { result, found, source };
  $('#check').hidden = false;
  $('#take-label').textContent = 'Retake the photo';
  const verdict = $('#verdict');
  if (result.ok) {
    verdict.textContent = 'All screens measured.';
    verdict.dataset.kind = 'ok';
  } else {
    verdict.textContent = 'Retake the photo.';
    verdict.dataset.kind = 'error';
  }
  drawPhoto($('#photo'), source, result, found);
  $('#screen-list').replaceChildren(...result.screens.map((s) => el('li', s.status === 'ok' ? '' : 'bad',
    folio(s.n), el('span', '', screenLine(s)))));
  $('#problems').replaceChildren(...result.problems.map((p) => el('li', '', p)));
  $('#notes').replaceChildren(...result.notes.map((p) => el('li', '', p)));

  $('#measured').hidden = !result.ok;
  $('#send').hidden = !result.ok;
  if (result.ok) {
    drawLayout($('#layout'), result.profile);
    $('#gap-list').replaceChildren(...result.profile.edges.map(gapLine));
    showHandoff(result.profile);
  }
  $('#check').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

// ---------- step 3: handoff ----------

function showHandoff(profile) {
  const link = `${location.origin}/${hashForProfile(profile)}`;
  const code = encodeCode(profile, job.text);
  $('#code-block').hidden = !code;
  $('#code').textContent = code || '';
  $('#link-lede').textContent = code
    ? 'Or send yourself the link and open it on your computer:'
    : 'This layout is too large for a short code. Send yourself the link and open it on your computer:';
  $('#link').value = link;
  $('#share-btn').hidden = typeof navigator.share !== 'function';
  setStatus($('#send-status'), '');
}

async function share() {
  try {
    await navigator.share({ title: 'Seamscape layout', text: 'Open this on the computer with your monitors.', url: $('#link').value });
  } catch (err) {
    if (err.name !== 'AbortError') setStatus($('#send-status'), 'Sharing did not work. Copy the link instead.', 'error');
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText($('#link').value);
    setStatus($('#send-status'), 'Link copied.', 'ok');
  } catch {
    $('#link').select();
    setStatus($('#send-status'), 'Copy the selected link.', 'ok');
  }
}

// ---------- start ----------

function init() {
  const text = screensFromHash(location.hash);
  try {
    if (!text) throw new Error('');
    job = { text, info: decodeScreens(text) };
  } catch (err) {
    $('#no-job').hidden = false;
    if (err.message) setStatus($('#no-job-detail'), err.message, 'error');
    return;
  }
  $('#shoot').hidden = false;
  renderExpectation();
  // Start fetching the measuring tool while the camera is open.
  $('#take').addEventListener('click', () => { loadOpenCV().catch(() => {}); });
  $('#pick').addEventListener('click', () => { loadOpenCV().catch(() => {}); });
  $('#take').addEventListener('change', (e) => analyse(e.target.files[0]));
  $('#pick').addEventListener('change', (e) => analyse(e.target.files[0]));
  $('#share-btn').addEventListener('click', share);
  $('#copy-btn').addEventListener('click', copy);
  window.addEventListener('resize', () => {
    if (!last) return;
    drawPhoto($('#photo'), last.source, last.result, last.found);
    if (last.result.ok) drawLayout($('#layout'), last.result.profile);
  });
}

init();
