// Image fit and crop math. Pure functions only (no DOM).
//
// The picture is laid over the physical canvas (mm). A view is
//   { zoom, cx, cy }
// zoom 1 = the picture just covers the bounding box of all monitors;
// cx, cy = the point of the picture (0..1 of its width/height) that sits at
// the centre of the bounding box.
//
// A placement is the resolved transform: { s, x, y } where s = mm per image
// pixel and x, y = the picture's top-left corner on the canvas in mm.

import { boundingBox, positionNames } from './layout.js';

export const MAX_ZOOM = 8;

export function defaultView() {
  return { zoom: 1, cx: 0.5, cy: 0.5 };
}

export function coverScale(img, box) {
  return Math.max(box.w / img.w, box.h / img.h);
}

export function placement(img, box, view) {
  const s = coverScale(img, box) * view.zoom;
  return {
    s,
    x: box.x + box.w / 2 - view.cx * img.w * s,
    y: box.y + box.h / 2 - view.cy * img.h * s,
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Keep the picture covering the whole bounding box: no empty monitor areas.
export function clampView(img, box, view) {
  const zoom = clamp(view.zoom, 1, MAX_ZOOM);
  const s = coverScale(img, box) * zoom;
  const hx = box.w / 2 / (img.w * s);
  const hy = box.h / 2 / (img.h * s);
  return { zoom, cx: clamp(view.cx, hx, 1 - hx), cy: clamp(view.cy, hy, 1 - hy) };
}

// Move the picture by (dx, dy) mm on the canvas.
export function panView(img, box, view, dx, dy) {
  const { s } = placement(img, box, view);
  return clampView(img, box, {
    ...view,
    cx: view.cx - dx / (img.w * s),
    cy: view.cy - dy / (img.h * s),
  });
}

// Zoom by factor while keeping the picture point under anchor (mm) fixed.
export function zoomView(img, box, view, factor, anchor = null) {
  const at = anchor || { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const before = placement(img, box, view);
  const u = (at.x - before.x) / (img.w * before.s);
  const v = (at.y - before.y) / (img.h * before.s);
  const zoom = clamp(view.zoom * factor, 1, MAX_ZOOM);
  const s = coverScale(img, box) * zoom;
  // Solve for cx, cy so that picture point (u, v) lands on the anchor again.
  const cx = u - (at.x - (box.x + box.w / 2)) / (img.w * s);
  const cy = v - (at.y - (box.y + box.h / 2)) / (img.h * s);
  return clampView(img, box, { zoom, cx, cy });
}

// The part of the picture (image pixels) that falls under a physical rect.
export function cropRect(place, rect) {
  return {
    sx: (rect.x - place.x) / place.s,
    sy: (rect.y - place.y) / place.s,
    sw: rect.w / place.s,
    sh: rect.h / place.s,
  };
}

// Everything the exporter needs to draw the output files.
// monitors: profile monitors; phys: physicalLayout(); img: { w, h }; view.
export function outputPlan(monitors, phys, img, view) {
  const box = boundingBox(phys);
  const place = placement(img, box, clampView(img, box, view));
  const physByN = new Map(phys.map((r) => [r.n, r]));
  const names = positionNames(phys);
  const desk = boundingBox(monitors);

  const perMonitor = monitors.map((m) => ({
    n: m.n,
    name: names.get(m.n),
    w: m.w,
    h: m.h,
    crop: cropRect(place, physByN.get(m.n)),
  }));

  const span = {
    w: desk.w,
    h: desk.h,
    tiles: perMonitor.map((p) => {
      const m = monitors.find((mm) => mm.n === p.n);
      return { n: p.n, dx: m.x - desk.x, dy: m.y - desk.y, dw: m.w, dh: m.h, crop: p.crop };
    }),
  };

  return { perMonitor, span };
}

export function monitorFileName(p, ext) {
  return `seamscape-${p.n}-${p.name}.${ext}`;
}
