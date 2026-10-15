// Finding calibration markers in a photo.
// OpenCV.js does the heavy image work (thresholding and contour tracing); the
// corner refinement and marker reading are plain JS so they can be tested
// without it. detectMarkers takes the OpenCV instance as an argument, so this
// module never loads OpenCV by itself.

import { decodeGrid, GRID } from './fiducials.js';
import { applyH, solveHomography } from './homography.js';

// RGBA bytes to 8-bit luma.
export function toGray(rgba, width, height) {
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return out;
}

function shoelace(q) {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// Clockwise on screen (y down) means a positive shoelace sum.
export function clockwise(q) {
  return shoelace(q) >= 0 ? q : [q[0], q[3], q[2], q[1]];
}

// Total-least-squares line through points: { cx, cy, dx, dy }.
function fitLine(points) {
  let cx = 0, cy = 0;
  for (const [x, y] of points) { cx += x; cy += y; }
  cx /= points.length; cy /= points.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of points) {
    sxx += (x - cx) ** 2; sxy += (x - cx) * (y - cy); syy += (y - cy) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { cx, cy, dx: Math.cos(angle), dy: Math.sin(angle) };
}

function intersect(a, b) {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b.cx - a.cx) * b.dy - (b.cy - a.cy) * b.dx) / det;
  return [a.cx + t * a.dx, a.cy + t * a.dy];
}

// Sub-pixel corners for a quad found on a traced contour: fit a line to the
// middle of each side and intersect neighbours.
// Coordinates: pixel i covers [i, i + 1), so its centre is i + 0.5. Contour
// points are the centres of the outermost dark pixels, half a pixel inside the
// real edge, so each line moves half a pixel outward.
// contour: flat pixel indices [x0, y0, x1, y1, ...]; corners: 4 of those points.
export function refineQuad(contour, corners) {
  const n = contour.length / 2;
  const idx = corners.map(([x, y]) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (contour[2 * i] - x) ** 2 + (contour[2 * i + 1] - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  });
  const order = [0, 1, 2, 3].sort((a, b) => idx[a] - idx[b]);
  const quadCx = corners.reduce((s, c) => s + c[0], 0) / 4 + 0.5;
  const quadCy = corners.reduce((s, c) => s + c[1], 0) / 4 + 0.5;
  const lines = [];
  for (let k = 0; k < 4; k++) {
    const i0 = idx[order[k]], i1 = idx[order[(k + 1) % 4]];
    const len = (i1 - i0 + n) % n;
    const trim = Math.floor(len * 0.15);
    const pts = [];
    for (let t = trim; t <= len - trim; t++) {
      const i = (i0 + t) % n;
      pts.push([contour[2 * i] + 0.5, contour[2 * i + 1] + 0.5]);
    }
    if (pts.length < 3) return clockwise(order.map((o) => corners[o].map((v) => v + 0.5)));
    const line = fitLine(pts);
    // Normal pointing away from the quad centre.
    let nx = -line.dy, ny = line.dx;
    if ((line.cx - quadCx) * nx + (line.cy - quadCy) * ny < 0) { nx = -nx; ny = -ny; }
    lines.push({ ...line, cx: line.cx + 0.5 * nx, cy: line.cy + 0.5 * ny });
  }
  const out = [];
  for (let k = 0; k < 4; k++) {
    const p = intersect(lines[(k + 3) % 4], lines[k]);
    if (!p) return clockwise(order.map((o) => corners[o].map((v) => v + 0.5)));
    out.push(p);
  }
  return clockwise(out);
}

function sample(gray, width, height, x, y) {
  const xi = Math.min(width - 1, Math.max(0, Math.floor(x)));
  const yi = Math.min(height - 1, Math.max(0, Math.floor(y)));
  return gray[yi * width + xi];
}

// Read the 6 x 6 cells inside a quad and decode them.
// Returns { id, corners } with corners clockwise from the marker's top-left.
export function readMarker(gray, width, height, quad) {
  let H;
  try {
    H = solveHomography([[0, 0], [GRID, 0], [GRID, GRID], [0, GRID]], quad);
  } catch {
    return null;
  }
  const means = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      let s = 0;
      for (const dy of [-0.2, 0, 0.2]) {
        for (const dx of [-0.2, 0, 0.2]) {
          const [x, y] = applyH(H, [c + 0.5 + dx, r + 0.5 + dy]);
          s += sample(gray, width, height, x, y);
        }
      }
      means.push(s / 9);
    }
  }
  const lo = Math.min(...means), hi = Math.max(...means);
  if (hi - lo < 25) return null;
  const mid = (lo + hi) / 2;
  const grid = [];
  for (let r = 0; r < GRID; r++) grid.push(means.slice(r * GRID, r * GRID + GRID).map((v) => (v < mid ? 1 : 0)));
  const hit = decodeGrid(grid);
  if (!hit) return null;
  const corners = [0, 1, 2, 3].map((k) => quad[(hit.start + k) % 4]);
  return { id: hit.id, corners };
}

function odd(v) {
  const r = Math.round(v);
  return r % 2 ? r : r + 1;
}

// All markers in a grayscale photo. Two threshold scales catch both small
// distant markers and large near ones; the largest sighting of an id wins.
// cv: an initialised OpenCV.js instance.
export function detectMarkers(cv, gray, width, height) {
  const long = Math.max(width, height);
  const minSide = Math.max(12, long / 400);
  const src = new cv.Mat(height, width, cv.CV_8UC1);
  src.data.set(gray);
  const bin = new cv.Mat();
  const found = new Map();
  try {
    for (const block of [odd(Math.max(15, long / 80)), odd(Math.max(31, long / 30))]) {
      cv.adaptiveThreshold(src, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, block, 7);
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        if (c.rows < 4 * minSide) { c.delete(); continue; }
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.04 * cv.arcLength(c, true), true);
        if (approx.rows === 4 && cv.isContourConvex(approx) && Math.abs(cv.contourArea(approx)) > minSide * minSide) {
          const a = approx.data32S;
          const corners = [[a[0], a[1]], [a[2], a[3]], [a[4], a[5]], [a[6], a[7]]];
          const quad = refineQuad(c.data32S, corners);
          const hit = readMarker(gray, width, height, quad);
          const prev = hit && found.get(hit.id);
          if (hit && (!prev || shoelace(hit.corners) > shoelace(prev.corners))) found.set(hit.id, hit);
        }
        approx.delete();
        c.delete();
      }
      contours.delete();
      hierarchy.delete();
    }
  } finally {
    src.delete();
    bin.delete();
  }
  return [...found.values()];
}
