// From detected markers to a measured layout, plus feedback on the photo.
// Pure functions only (no DOM).
//
// Each screen gets a homography G (its native pixels -> photo pixels) fitted
// to the corners of its markers. Mapping every screen through the primary's
// inverse puts all of them in the primary's pixel space: one physical canvas.
// Millimetres come from the primary's physical width, which the desktop sends.

import { applyH, fitRobust, invertH, multiplyH } from './homography.js';
import { markerLayout, markerOwner, MARKERS_PER_SCREEN } from './fiducials.js';
import { buildProfile, halfMm } from './handoff.js';
import { defaultEdges } from './layout.js';

// Row and column of each marker position on the 3 x 3 grid of the screen.
const ROW = [0, 0, 2, 2, 0, 1, 2, 1];
const COL = [0, 2, 2, 0, 1, 2, 1, 0];

function quadArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function sideLength(q) {
  let s = 0;
  for (let i = 0; i < 4; i++) s += Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
  return s / 4;
}

function list(words) {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

// One detection per id: the biggest wins (a reflection is usually smaller).
function dedupe(detections) {
  const best = new Map();
  for (const d of detections) {
    const prev = best.get(d.id);
    if (!prev || Math.abs(quadArea(d.corners)) > Math.abs(quadArea(prev.corners))) best.set(d.id, d);
  }
  return [...best.values()];
}

// Which sides of the photo a set of points falls off.
function offSides(points, photo) {
  const sides = new Set();
  const m = 0.01 * Math.max(photo.width, photo.height);
  for (const [x, y] of points) {
    if (x < m) sides.add('left');
    if (x > photo.width - m) sides.add('right');
    if (y < m) sides.add('top');
    if (y > photo.height - m) sides.add('bottom');
  }
  return ['left', 'right', 'top', 'bottom'].filter((s) => sides.has(s));
}

// Fit one screen. Returns its status and, when usable, its homography.
function analyseScreen(screen, found, photo) {
  const lay = markerLayout(screen.w, screen.h);
  const result = { n: screen.n, found: [], missing: [], status: 'missing', G: null, error: 0, cut: [] };
  if (found.length === 0) {
    result.missing = lay.markers.map((m) => m.pos);
    return result;
  }
  const groups = found.map((d) => ({
    key: markerOwner(d.id).pos,
    src: lay.markers[markerOwner(d.id).pos].corners,
    dst: d.corners,
  }));
  const cellPx = Math.max(...found.map((d) => sideLength(d.corners))) / 6;
  const fit = fitRobust(groups, { tolerance: Math.max(1.5, 0.2 * cellPx), minGroups: 2 });
  result.G = fit.H;
  result.error = fit.error / cellPx; // in marker cells: comparable across photos
  result.found = fit.kept.map((g) => g.key).sort((a, b) => a - b);
  result.missing = lay.markers.map((m) => m.pos).filter((p) => !result.found.includes(p));

  // Missing markers whose predicted spot is off the photo mean the screen is cut off.
  const lost = result.missing.flatMap((p) => lay.markers[p].corners.map((c) => applyH(fit.H, c)));
  result.cut = offSides(lost, photo);

  const rows = new Set(result.found.map((p) => ROW[p]));
  const cols = new Set(result.found.map((p) => COL[p]));
  result.status = result.found.length >= 3 && rows.size >= 2 && cols.size >= 2 ? 'ok' : 'partial';
  return result;
}

// screensInfo: { refMm, monitors: [{ n, w, h, x, y, primary }] } (handoff.decodeScreens)
// detections: [{ id, corners: [[x, y] x 4] }] in photo pixels, clockwise from
//             each marker's top-left
// photo: { width, height }
// Returns { ok, screens, problems, notes, profile, rects }.
export function measureLayout(screensInfo, detections, photo) {
  const { monitors: screens, refMm } = screensInfo;
  const count = screens.length;
  const valid = dedupe(detections).filter((d) => d.id < count * MARKERS_PER_SCREEN);
  const per = screens.map((s) => analyseScreen(s, valid.filter((d) => markerOwner(d.id).n === s.n), photo));
  const problems = [];
  const notes = [];

  if (valid.length === 0) {
    problems.push('No calibration markers found. Check that every screen shows its pattern, then try again with less glare.');
    return { ok: false, screens: per, problems, notes, profile: null, rects: null };
  }

  const missing = per.filter((r) => r.status === 'missing').map((r) => r.n);
  if (missing.length) {
    problems.push(`${missing.length === 1 ? 'Monitor' : 'Monitors'} ${list(missing.map(String))} ${missing.length === 1 ? 'is' : 'are'} not in the photo. Step back so every screen fits.`);
  }
  for (const r of per) {
    if (r.status === 'missing') continue;
    if (r.status === 'partial') {
      problems.push(r.cut.length
        ? `Monitor ${r.n} is cut off on the ${list(r.cut)}. Step back or aim more to the ${r.cut[0]}.`
        : `Monitor ${r.n} is hard to read: only ${r.found.length} of 8 markers were found. Try again with less glare, or hold the phone steadier.`);
    } else if (r.cut.length) {
      notes.push(`Monitor ${r.n} is partly cut off on the ${list(r.cut)}, but its other markers were enough to measure it.`);
    }
    if (r.status === 'ok' && r.error > 0.35) {
      notes.push(`Monitor ${r.n} looks bent in the photo. If the result seems off, retake it with the main camera (1×), not the wide lens.`);
    }
  }
  if (problems.length) return { ok: false, screens: per, problems, notes, profile: null, rects: null };

  // Every screen into the primary's pixel space.
  const ref = screens.find((s) => s.primary);
  const refFit = per.find((r) => r.n === ref.n);
  const toRef = invertH(refFit.G);
  const mmPerPx = refMm / ref.w;
  const rects = screens.map((s) => {
    const P = multiplyH(toRef, per.find((r) => r.n === s.n).G);
    const quad = [[0, 0], [s.w, 0], [s.w, s.h], [0, s.h]].map((c) => applyH(P, c));
    const scale = s === ref ? 1 : Math.sqrt(Math.abs(quadArea(quad)) / (s.w * s.h));
    const [cx, cy] = s === ref ? [s.w / 2, s.h / 2] : applyH(P, [s.w / 2, s.h / 2]);
    const w = s.w * scale * mmPerPx, h = s.h * scale * mmPerPx;
    const top = Math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]);
    const bottom = Math.atan2(quad[2][1] - quad[3][1], quad[2][0] - quad[3][0]);
    return { n: s.n, x: cx * mmPerPx - w / 2, y: cy * mmPerPx - h / 2, w, h, tilt: ((top + bottom) / 2) * (180 / Math.PI), quad };
  });

  for (const r of rects) {
    if (Math.abs(r.tilt) >= 1.5) {
      notes.push(`Monitor ${r.n} sits about ${Math.round(Math.abs(r.tilt))}° off level. The wallpaper treats it as level.`);
    }
  }

  // Gaps along the links the desktop builder uses, so its Gaps list matches.
  const byN = new Map(rects.map((r) => [r.n, r]));
  const links = defaultEdges(screens.map((s) => ({ ...s, pw: 1, ph: 1 })), 0);
  const edges = [];
  for (const e of links) {
    const a = byN.get(e.a), b = byN.get(e.b);
    if (e.dir === 'h') {
      if (b.x + b.w / 2 < a.x + a.w / 2) {
        problems.push(`Your display settings put monitor ${e.b} to the right of monitor ${e.a}, but in the photo it is on the left. Fix the order in your display settings, then start the calibration again.`);
      }
      edges.push({ gap: b.x - (a.x + a.w), shift: b.y - a.y });
    } else {
      if (b.y + b.h / 2 < a.y + a.h / 2) {
        problems.push(`Your display settings put monitor ${e.b} below monitor ${e.a}, but in the photo it is above. Fix the order in your display settings, then start the calibration again.`);
      }
      edges.push({ gap: b.y - (a.y + a.h), shift: b.x - a.x });
    }
  }
  if (problems.length) return { ok: false, screens: per, problems, notes, profile: null, rects };

  const pw = {};
  for (const r of rects) if (r.n !== ref.n) pw[r.n] = halfMm(r.w);
  const profile = buildProfile(screensInfo, { pw, edges });
  return { ok: true, screens: per, problems, notes, profile, rects };
}
