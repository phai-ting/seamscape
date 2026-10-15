import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';
import { detectMarkers, readMarker, refineQuad, toGray } from '../public/js/detect.js';
import { markerGrid, markerId, markerLayout } from '../public/js/fiducials.js';
import { applyH, invertH, solveHomography } from '../public/js/homography.js';
import { measureLayout } from '../public/js/measure.js';
import { expectedEdges, makeDesk } from './fixtures/desk.js';

const near = (a, b, eps, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} != ${b} (±${eps})`);

const WHITE = 235, BLACK = 25, DESK = 55;

// Paint into a gray image: for every pixel (2 x 2 supersampled), ask paint(x, y)
// in the frame of homography toPhoto's source, inside the given photo box.
function paint(img, width, height, toPhoto, srcW, srcH, colourAt) {
  const back = invertH(toPhoto);
  const box = [[0, 0], [srcW, 0], [srcW, srcH], [0, srcH]].map((c) => applyH(toPhoto, c));
  const x0 = Math.max(0, Math.floor(Math.min(...box.map((p) => p[0]))));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...box.map((p) => p[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...box.map((p) => p[1]))));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...box.map((p) => p[1]))));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let sum = 0, hits = 0;
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const [u, v] = applyH(back, [x + dx, y + dy]);
        if (u < 0 || v < 0 || u >= srcW || v >= srcH) continue;
        sum += colourAt(u, v);
        hits++;
      }
      if (hits) img[y * width + x] = Math.round((img[y * width + x] * (4 - hits) + sum) / 4);
    }
  }
}

// A screen showing its calibration pattern, plus clutter that must not read
// as a marker: a QR finder pattern and a solid block.
function screenColour(n, w, h) {
  const lay = markerLayout(w, h);
  const grids = lay.markers.map((m) => markerGrid(markerId(n, m.pos)));
  const c = lay.content;
  const finder = { x: c.x + c.w * 0.6, y: c.y + c.h * 0.3, s: lay.cell * 7 };
  return (u, v) => {
    for (let i = 0; i < lay.markers.length; i++) {
      const m = lay.markers[i];
      if (u >= m.x && v >= m.y && u < m.x + lay.size && v < m.y + lay.size) {
        return grids[i][Math.floor((v - m.y) / lay.cell)][Math.floor((u - m.x) / lay.cell)] ? BLACK : WHITE;
      }
    }
    const fu = Math.floor((u - finder.x) / lay.cell), fv = Math.floor((v - finder.y) / lay.cell);
    if (fu >= 0 && fv >= 0 && fu < 7 && fv < 7) {
      const ring = Math.min(fu, fv, 6 - fu, 6 - fv);
      return ring === 1 ? WHITE : BLACK;
    }
    if (u > c.x && u < c.x + c.w * 0.3 && v > c.y && v < c.y + c.h * 0.4) return BLACK;
    return WHITE;
  };
}

function photoOf(desk, { noise = 6 } = {}) {
  const { width, height } = desk.photo;
  const img = new Uint8Array(width * height).fill(DESK);
  for (const s of desk.screens) paint(img, width, height, s.G, s.w, s.h, screenColour(s.n, s.w, s.h));
  // Sensor noise.
  let seed = 3;
  for (let i = 0; i < img.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    img[i] = Math.max(0, Math.min(255, img[i] + Math.round(((seed / 2 ** 32) - 0.5) * 2 * noise)));
  }
  return img;
}

test('toGray weights green the most', () => {
  const g = toGray(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]), 3, 1);
  assert.ok(g[1] > g[0] && g[0] > g[2]);
});

test('refineQuad finds sub-pixel corners of a traced square', () => {
  // Contour of the dark pixels of a square spanning x 10..49, y 20..59.
  const pts = [];
  for (let x = 10; x <= 49; x++) pts.push(x, 20);
  for (let y = 21; y <= 59; y++) pts.push(49, y);
  for (let x = 48; x >= 10; x--) pts.push(x, 59);
  for (let y = 58; y >= 21; y--) pts.push(10, y);
  const q = refineQuad(pts, [[10, 20], [49, 20], [49, 59], [10, 59]]);
  // Pixel i covers [i, i + 1), so the square's real edges are at 10, 50 and 20, 60.
  const want = [[10, 20], [50, 20], [50, 60], [10, 60]];
  q.forEach((p, i) => { near(p[0], want[i][0], 1e-6); near(p[1], want[i][1], 1e-6); });
});

test('readMarker reads a turned marker and returns its true top-left first', () => {
  const W = 200, H = 200;
  const id = 13;
  const grid = markerGrid(id);
  // Marker turned by about 120 degrees and seen at a slant.
  const truth = [[150, 60], [130, 160], [40, 140], [60, 40]];
  const toPhoto = solveHomography([[0, 0], [6, 0], [6, 6], [0, 6]], truth);
  const img = new Uint8Array(W * H).fill(WHITE);
  paint(img, W, H, toPhoto, 6, 6, (u, v) => (grid[Math.floor(v)][Math.floor(u)] ? BLACK : WHITE));
  for (let s = 0; s < 4; s++) {
    const quad = [0, 1, 2, 3].map((k) => truth[(s + k) % 4]);
    const hit = readMarker(img, W, H, quad);
    assert.equal(hit?.id, id, `start ${s}`);
    assert.deepEqual(hit.corners, truth);
  }
  assert.equal(readMarker(new Uint8Array(W * H).fill(WHITE), W, H, truth), null);
});

// Resolves to { cv }: the OpenCV module is a thenable that resolves to itself,
// so returning it bare from an async function would never settle.
let loaded;
async function opencv() {
  if (loaded) return loaded;
  // package.json says "type": "module", so load the CommonJS build by hand.
  const file = fileURLToPath(new URL('../public/js/vendor/opencv.js', import.meta.url));
  const wrapper = compileFunction(readFileSync(file, 'utf8'), ['module', 'exports', 'require', '__dirname', '__filename']);
  const module = { exports: {} };
  wrapper(module, module.exports, createRequire(file), dirname(file), file);
  const mod = module.exports;
  // The module is a thenable that resolves to itself; wait for the runtime instead.
  if (!mod.Mat) await new Promise((resolve) => { mod.onRuntimeInitialized = resolve; });
  loaded = { cv: mod };
  return loaded;
}

test('detectMarkers + measureLayout measure a rendered photo', async () => {
  const setup = [
    { w: 1920, h: 1080, x: -1920, y: 180, X: -549.4, Y: 40, PW: 531.4 },
    { w: 2560, h: 1440, x: 0, y: 0, primary: true, X: 0, Y: 0, PW: 597.7 },
    { w: 1080, h: 1920, x: 2560, y: -240, X: 620, Y: -110, PW: 298.9 },
  ];
  const desk = makeDesk(setup, { photoW: 2400, photoH: 1500, fill: 0.85 });
  const gray = photoOf(desk);
  const found = detectMarkers((await opencv()).cv, gray, desk.photo.width, desk.photo.height);
  const ids = found.map((d) => d.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [...Array(24).keys()], 'every marker, and nothing else');

  // Corners land within about a pixel of the truth, on markers only ~50 px wide.
  const errs = [];
  for (const d of found) {
    const n = Math.floor(d.id / 8) + 1;
    const s = desk.screens[n - 1];
    const m = markerLayout(s.w, s.h).markers[d.id % 8];
    m.corners.forEach((c, k) => {
      const [x, y] = applyH(s.G, c);
      errs.push(Math.hypot(d.corners[k][0] - x, d.corners[k][1] - y));
      near(d.corners[k][0], x, 1.5, `marker ${d.id} corner ${k} x`);
      near(d.corners[k][1], y, 1.5, `marker ${d.id} corner ${k} y`);
    });
  }

  assert.ok(errs.reduce((a, b) => a + b) / errs.length < 0.6, 'mean corner error');

  const res = measureLayout(desk.info, found, desk.photo);
  assert.equal(res.ok, true, res.problems.join(' / '));
  const want = expectedEdges(desk);
  res.profile.edges.forEach((e, i) => {
    near(e.gap, want[i].gap, 1, `gap ${e.a}-${e.b}`);
    near(e.shift, want[i].shift, 1, `shift ${e.a}-${e.b}`);
  });
  setup.forEach((s, i) => near(res.profile.monitors[i].pw, s.PW, 1, `monitor ${i + 1} width`));
});
