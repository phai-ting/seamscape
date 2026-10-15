// Layout math: monitors, adjacency, and the physical canvas.
// Pure functions only (no DOM), so they run in Node tests too.
//
// Monitor (as stored in a profile):
//   { n, w, h, x, y, pw, ph, primary }
//   n      1-based monitor number shown to the user
//   w, h   native resolution in device pixels
//   x, y   native position in the OS virtual desktop (primary at 0,0; may be negative)
//   pw, ph physical size of the lit area in millimetres
//
// Edge (one link between neighbouring monitors):
//   { a, b, dir, gap, shift }
//   dir 'h': a is left of b.  gap = mm between a's right edge and b's left edge.
//            shift = mm that b's top edge sits below a's top edge.
//   dir 'v': a is above b.    gap = mm between a's bottom edge and b's top edge.
//            shift = mm that b's left edge sits right of a's left edge.

export const MM_PER_INCH = 25.4;

// Rough guess for a desktop monitor's density when nothing better is known.
const ASSUMED_CSS_PPI = 105;

export function sizeFromDiagonal(w, h, inches) {
  const d = Math.hypot(w, h);
  const mm = inches * MM_PER_INCH;
  return { pw: (mm * w) / d, ph: (mm * h) / d };
}

export function diagonalInches(pw, ph) {
  return Math.hypot(pw, ph) / MM_PER_INCH;
}

export function estimateDiagonal(w, h, dpr = 1) {
  const inches = Math.hypot(w, h) / dpr / ASSUMED_CSS_PPI;
  return Math.max(10, Math.round(inches * 2) / 2);
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

export function boundingBox(rects) {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function overlap(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

// All pairs of rects that touch (within tol) and share part of an edge.
// rects: [{ id, x, y, w, h }]
export function findAdjacencies(rects, tol = 2) {
  const out = [];
  for (const a of rects) {
    for (const b of rects) {
      if (a === b) continue;
      if (Math.abs(a.x + a.w - b.x) <= tol) {
        const ov = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
        if (ov > 0) out.push({ a: a.id, b: b.id, dir: 'h', overlap: ov });
      }
      if (Math.abs(a.y + a.h - b.y) <= tol) {
        const ov = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
        if (ov > 0) out.push({ a: a.id, b: b.id, dir: 'v', overlap: ov });
      }
    }
  }
  return out;
}

// Orient a forced link between two rects that do not touch, using the
// dominant axis between their centres.
function forcedEdge(p, q) {
  const dx = q.x + q.w / 2 - (p.x + p.w / 2);
  const dy = q.y + q.h / 2 - (p.y + p.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { a: p.id, b: q.id, dir: 'h' } : { a: q.id, b: p.id, dir: 'h' };
  }
  return dy >= 0 ? { a: p.id, b: q.id, dir: 'v' } : { a: q.id, b: p.id, dir: 'v' };
}

// A spanning tree over the rects: one edge per non-root rect, so every rect
// has exactly one path back to the root. Prefers real adjacencies with the
// longest shared edge; links any detached rect to its nearest placed rect.
export function spanningTree(rects, rootId, tol = 2) {
  if (rects.length === 0) return [];
  const byId = new Map(rects.map((r) => [r.id, r]));
  const root = byId.has(rootId) ? rootId : rects[0].id;
  const candidates = findAdjacencies(rects, tol).sort((e, f) => f.overlap - e.overlap);
  const placed = new Set([root]);
  const tree = [];

  while (placed.size < rects.length) {
    const next = candidates.find(
      (e) => placed.has(e.a) !== placed.has(e.b),
    );
    if (next) {
      tree.push({ a: next.a, b: next.b, dir: next.dir });
      placed.add(next.a);
      placed.add(next.b);
      continue;
    }
    // Nothing touches the placed group: link the closest pair.
    let best = null;
    for (const p of rects) {
      if (!placed.has(p.id)) continue;
      for (const q of rects) {
        if (placed.has(q.id)) continue;
        const d = Math.hypot(
          q.x + q.w / 2 - (p.x + p.w / 2),
          q.y + q.h / 2 - (p.y + p.h / 2),
        );
        if (!best || d < best.d) best = { d, p, q };
      }
    }
    tree.push(forcedEdge(best.p, best.q));
    placed.add(best.q.id);
  }
  return tree;
}

function primaryOf(monitors) {
  return (monitors.find((m) => m.primary) || monitors[0]).n;
}

// Build monitors from Window Management API screens.
// screens: [{ left, top, width, height, dpr, primary }] in CSS pixels.
// Native positions are rebuilt by walking neighbours from the primary, since
// CSS-pixel positions do not convert cleanly with mixed scaling.
export function monitorsFromScreens(screens) {
  const sorted = [...screens].sort((s, t) => s.left - t.left || s.top - t.top);
  const dip = sorted.map((s, i) => ({
    id: i + 1, x: s.left, y: s.top, w: s.width, h: s.height, dpr: s.dpr || 1,
  }));
  const monitors = sorted.map((s, i) => {
    const dpr = s.dpr || 1;
    const w = Math.round(s.width * dpr);
    const h = Math.round(s.height * dpr);
    const { pw, ph } = sizeFromDiagonal(w, h, estimateDiagonal(w, h, dpr));
    return { n: i + 1, w, h, x: 0, y: 0, pw: round1(pw), ph: round1(ph), primary: !!s.primary };
  });
  if (!monitors.some((m) => m.primary) && monitors.length) monitors[0].primary = true;

  const root = primaryOf(monitors);
  const tree = spanningTree(dip, root);
  const byN = new Map(monitors.map((m) => [m.n, m]));
  const dipById = new Map(dip.map((d) => [d.id, d]));
  const placed = new Set([root]);
  let progress = true;
  while (progress) {
    progress = false;
    for (const e of tree) {
      const [from, to, sign] = placed.has(e.a) && !placed.has(e.b) ? [e.a, e.b, 1]
        : placed.has(e.b) && !placed.has(e.a) ? [e.b, e.a, -1] : [null];
      if (from == null) continue;
      const F = byN.get(from), T = byN.get(to);
      const fd = dipById.get(from), td = dipById.get(to);
      if (e.dir === 'h') {
        T.x = sign > 0 ? F.x + F.w : F.x - T.w;
        T.y = F.y + Math.round((td.y - fd.y) * fd.dpr);
      } else {
        T.y = sign > 0 ? F.y + F.h : F.y - T.h;
        T.x = F.x + Math.round((td.x - fd.x) * fd.dpr);
      }
      placed.add(to);
      progress = true;
    }
  }
  return monitors;
}

function nativeRects(monitors) {
  return monitors.map((m) => ({ id: m.n, x: m.x, y: m.y, w: m.w, h: m.h }));
}

// Default edges from the OS arrangement, with every gap set to gapMm.
// Shifts carry over the OS alignment, converted to mm using monitor a's size.
export function defaultEdges(monitors, gapMm) {
  const byN = new Map(monitors.map((m) => [m.n, m]));
  return spanningTree(nativeRects(monitors), primaryOf(monitors)).map((e) => {
    const a = byN.get(e.a), b = byN.get(e.b);
    const shift = e.dir === 'h'
      ? (b.y - a.y) * (a.ph / a.h)
      : (b.x - a.x) * (a.pw / a.w);
    return { a: e.a, b: e.b, dir: e.dir, gap: gapMm, shift: round1(shift) };
  });
}

export function edgeKey(e) {
  return `${e.a}${e.dir}${e.b}`;
}

// Recompute the edge structure after monitors change, keeping measured values
// for links that still exist.
export function reconcileEdges(monitors, oldEdges, gapMm) {
  const old = new Map(oldEdges.map((e) => [edgeKey(e), e]));
  return defaultEdges(monitors, gapMm).map((e) => {
    const prev = old.get(edgeKey(e));
    return prev ? { ...e, gap: prev.gap, shift: prev.shift } : e;
  });
}

// Physical rects in mm: [{ n, x, y, w, h }], normalised so the bounding box
// starts at 0,0. Monitors not reached by any edge are placed to the right.
export function physicalLayout(monitors, edges) {
  if (monitors.length === 0) return [];
  const byN = new Map(monitors.map((m) => [m.n, m]));
  const pos = new Map([[primaryOf(monitors), { x: 0, y: 0 }]]);
  let progress = true;
  while (progress) {
    progress = false;
    for (const e of edges) {
      const ma = byN.get(e.a), mb = byN.get(e.b);
      if (!ma || !mb) continue;
      const A = pos.get(e.a), B = pos.get(e.b);
      if (A && !B) {
        pos.set(e.b, e.dir === 'h'
          ? { x: A.x + ma.pw + e.gap, y: A.y + e.shift }
          : { x: A.x + e.shift, y: A.y + ma.ph + e.gap });
        progress = true;
      } else if (B && !A) {
        pos.set(e.a, e.dir === 'h'
          ? { x: B.x - e.gap - ma.pw, y: B.y - e.shift }
          : { x: B.x - e.shift, y: B.y - e.gap - ma.ph });
        progress = true;
      }
    }
  }
  for (const m of monitors) {
    if (pos.has(m.n)) continue;
    const box = boundingBox([...pos].map(([n, p]) => ({ ...p, w: byN.get(n).pw, h: byN.get(n).ph })));
    pos.set(m.n, { x: box.x + box.w, y: box.y });
  }
  const rects = monitors.map((m) => ({ n: m.n, ...pos.get(m.n), w: m.pw, h: m.ph }));
  const box = boundingBox(rects);
  return rects.map((r) => ({ ...r, x: r.x - box.x, y: r.y - box.y }));
}

// Bounding box of the native rects: the Windows "Span" image covers this.
export function virtualDesktop(monitors) {
  return boundingBox(monitors);
}

// Human position names for file names: "left", "center", "top-right", ...
export function positionNames(rects) {
  const names = new Map();
  if (rects.length === 1) {
    names.set(rects[0].n, 'main');
    return names;
  }
  const box = boundingBox(rects);
  for (const r of rects) {
    const others = rects.filter((o) => o !== r);
    const hasSideNeighbour = others.some((o) => o.x >= r.x + r.w - 1e-6 || o.x + o.w <= r.x + 1e-6);
    const hasStackNeighbour = others.some((o) => o.y >= r.y + r.h - 1e-6 || o.y + o.h <= r.y + 1e-6);
    const u = (r.x + r.w / 2 - box.x) / box.w;
    const v = (r.y + r.h / 2 - box.y) / box.h;
    const horiz = hasSideNeighbour ? (u < 0.4 ? 'left' : u > 0.6 ? 'right' : 'center') : null;
    const vert = hasStackNeighbour ? (v < 0.4 ? 'top' : v > 0.6 ? 'bottom' : 'middle') : null;
    let parts = [vert, horiz].filter(Boolean);
    if (parts.length === 2) parts = parts.filter((p) => p !== 'center' && p !== 'middle');
    names.set(r.n, parts.join('-') || 'center');
  }
  return names;
}
