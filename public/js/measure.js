// From detected markers to a measured layout, plus feedback on the photo.
// Pure functions only (no DOM).
//
// Each screen gets a homography G (its native pixels -> photo pixels) fitted
// to the corners of its markers. Mapping every screen through the primary's
// inverse puts all of them in the primary's pixel space: one physical canvas.
// Millimetres come from the primary's physical width, which the desktop sends.
//
// Curved monitors are not flat, so one homography per screen cannot fit all
// of its markers. Each edge is therefore placed from the markers along that
// edge (left column, right column, top row, bottom row), which are close to
// flat; the whole-screen fit is only used to judge the photo.

import { applyH, fitRobust, invertH, multiplyH, solveHomography } from './homography.js';
import { markerLayout, markerOwner, MARKERS_PER_SCREEN } from './fiducials.js';
import { buildProfile, halfMm } from './handoff.js';
import { defaultEdges } from './layout.js';

// Row and column of each marker position on the 3 x 3 grid of the screen.
const ROW = [0, 0, 2, 2, 0, 1, 2, 1];
const COL = [0, 2, 2, 0, 1, 2, 1, 0];

// Marker positions along each edge of a screen.
const SIDES = { left: [0, 7, 3], right: [1, 5, 2], top: [0, 4, 1], bottom: [3, 6, 2] };

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
  const result = { n: screen.n, found: [], missing: [], status: 'missing', G: null, groups: [], error: 0, cut: [] };
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
  // Only a misread lands cells away from where the others predict it; a
  // curved screen or a wide lens bends a marker by a cell or so, not more.
  const fit = fitRobust(groups, { tolerance: Math.max(3, 3 * cellPx), minGroups: 2 });
  result.G = fit.H;
  result.groups = fit.kept;
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

// A homography from the markers along one edge, or the whole-screen fit when
// fewer than two of them were found.
function sideFit(r, side) {
  const along = r.groups.filter((g) => SIDES[side].includes(g.key));
  if (along.length < 2) return r.G;
  try {
    return solveHomography(along.flatMap((g) => g.src), along.flatMap((g) => g.dst));
  } catch {
    return r.G;
  }
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
    const one = missing.length === 1;
    problems.push(`No markers found on ${one ? 'monitor' : 'monitors'} ${list(missing.map(String))}. Check that ${one ? 'it shows' : 'each shows'} the black square markers: if a screen says “Click to fill”, click it on your computer. Then make sure every screen is in the photo.`);
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
      notes.push(`Monitor ${r.n} is not flat in the photo: a curved screen, or a wide lens. Its edges were measured from the markers next to each edge.`);
    }
  }
  if (problems.length) return { ok: false, screens: per, problems, notes, profile: null, rects: null };

  // Every screen into the primary's pixel space, edge by edge.
  const ref = screens.find((s) => s.primary);
  const toRef = invertH(per.find((r) => r.n === ref.n).G);
  const edgesOf = (s) => {
    const r = per.find((p) => p.n === s.n);
    const at = (side, ends) => {
      const P = multiplyH(toRef, sideFit(r, side));
      return ends.map((c) => applyH(P, c));
    };
    const [l0, l1] = at('left', [[0, 0], [0, s.h]]);
    const [r0, r1] = at('right', [[s.w, 0], [s.w, s.h]]);
    const [t0, t1] = at('top', [[0, 0], [s.w, 0]]);
    return { left: (l0[0] + l1[0]) / 2, right: (r0[0] + r1[0]) / 2, top: (t0[1] + t1[1]) / 2 };
  };
  const refEdges = edgesOf(ref);
  const mmPerPx = refMm / (refEdges.right - refEdges.left);
  const rects = screens.map((s) => {
    const e = edgesOf(s);
    const quad = [[0, 0], [s.w, 0], [s.w, s.h], [0, s.h]]
      .map((c) => applyH(multiplyH(toRef, per.find((r) => r.n === s.n).G), c));
    const w = (e.right - e.left) * mmPerPx;
    const h = (w * s.h) / s.w;
    const top = Math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]);
    const bottom = Math.atan2(quad[2][1] - quad[3][1], quad[2][0] - quad[3][0]);
    return { n: s.n, x: e.left * mmPerPx, y: e.top * mmPerPx, w, h, tilt: ((top + bottom) / 2) * (180 / Math.PI), quad };
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
