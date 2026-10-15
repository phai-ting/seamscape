// A simulated desk and phone camera for calibration tests.
// Monitors sit on one plane in millimetres; the camera is a homography from
// that plane to photo pixels with a little keystone, like a hand-held shot.

import { applyH, multiplyH } from '../../public/js/homography.js';
import { markerId, markerLayout } from '../../public/js/fiducials.js';
import { defaultEdges } from '../../public/js/layout.js';

// setup: [{ w, h, x, y, primary, X, Y, PW }] with X, Y, PW the true physical
// position and width in mm (height follows from the aspect ratio).
export function makeDesk(setup, { photoW = 4000, photoH = 3000, fill = 0.8, keystone = [6e-5, 3e-5] } = {}) {
  const rects = setup.map((s) => ({ X: s.X, Y: s.Y, PW: s.PW, PH: (s.PW * s.h) / s.w }));
  const x0 = Math.min(...rects.map((r) => r.X)), x1 = Math.max(...rects.map((r) => r.X + r.PW));
  const y0 = Math.min(...rects.map((r) => r.Y)), y1 = Math.max(...rects.map((r) => r.Y + r.PH));
  const k = Math.min((fill * photoW) / (x1 - x0), (fill * photoH) / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // Centre the desk, tilt it a little, then put it in the middle of the photo.
  const centre = [1, 0, -cx, 0, 1, -cy, 0, 0, 1];
  const tilt = [k, 0.02 * k, 0, 0.01 * k, 0.97 * k, 0, keystone[0], keystone[1], 1];
  const toPhoto = [1, 0, photoW / 2, 0, 1, photoH / 2, 0, 0, 1];
  const camera = multiplyH(toPhoto, multiplyH(tilt, centre));
  const screens = setup.map((s, i) => {
    const r = rects[i];
    const toMm = [r.PW / s.w, 0, r.X, 0, r.PH / s.h, r.Y, 0, 0, 1];
    return { n: i + 1, w: s.w, h: s.h, x: s.x, y: s.y, primary: !!s.primary, G: multiplyH(camera, toMm) };
  });
  const info = {
    monitors: screens.map(({ n, w, h, x, y, primary: p }, i) => ({ n, w, h, x, y, pw: setup[i].PW, primary: p })),
  };
  return { info, screens, rects, camera, photo: { width: photoW, height: photoH } };
}

// Exact marker corners in the photo, optionally with pixel noise and a crop.
export function detections(desk, { noise = 0, seed = 1, keep = () => true } = {}) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
  const out = [];
  for (const sc of desk.screens) {
    const project = sc.map || ((c) => applyH(sc.G, c));
    for (const m of markerLayout(sc.w, sc.h).markers) {
      const corners = m.corners.map((c) => {
        const [x, y] = project(c);
        return [x + noise * rand(), y + noise * rand()];
      });
      const inside = corners.every(([x, y]) => x >= 0 && y >= 0 && x < desk.photo.width && y < desk.photo.height);
      if (inside && keep(sc.n, m.pos, corners)) out.push({ id: markerId(sc.n, m.pos), corners });
    }
  }
  return out;
}

// Curved monitors (radius in mm, e.g. 1800R) in a row, photographed by a
// pinhole camera from the seat. Each screen bends about its own vertical
// centre line, edges towards the viewer. X, Y, PW are measured along the
// screen surface, as a spec sheet would give them.
export function makeCurvedDesk(setup, { radius = 1800, distance = 800, photoW = 4000, photoH = 3000 } = {}) {
  const rects = setup.map((s) => ({ X: s.X, Y: s.Y, PW: s.PW, PH: (s.PW * s.h) / s.w }));
  const x0 = Math.min(...rects.map((r) => r.X)), x1 = Math.max(...rects.map((r) => r.X + r.PW));
  const y0 = Math.min(...rects.map((r) => r.Y)), y1 = Math.max(...rects.map((r) => r.Y + r.PH));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const f = (0.8 * photoW * distance) / (x1 - x0);
  const screens = setup.map((s, i) => {
    const r = rects[i];
    const mid = r.X + r.PW / 2;
    // Edge points sit where a flat screen's would; the middle bows away.
    const sag = radius * (1 - Math.cos(r.PW / 2 / radius));
    const map = ([x, y]) => {
      const arc = (x / s.w - 0.5) * r.PW;
      const X = mid + radius * Math.sin(arc / radius) * (r.PW / 2) / (radius * Math.sin(r.PW / 2 / radius));
      const Z = distance + sag - radius * (1 - Math.cos(arc / radius));
      const Y = r.Y + (y / s.h) * r.PH;
      return [photoW / 2 + (f * (X - cx)) / Z, photoH / 2 + (f * (Y - cy)) / Z];
    };
    return { n: i + 1, w: s.w, h: s.h, x: s.x, y: s.y, primary: !!s.primary, map };
  });
  const info = {
    monitors: screens.map(({ n, w, h, x, y, primary: p }, i) => ({ n, w, h, x, y, pw: setup[i].PW, primary: p })),
  };
  return { info, screens, rects, photo: { width: photoW, height: photoH } };
}

// Flat monitors placed in 3D and photographed by a pinhole camera at the
// origin looking along +Z. Each monitor: { w, h, x, y, primary, PW, O, u }
// with O its top-left corner in mm and u the unit direction of its top edge
// (y runs straight down). Angle a side monitor by turning u in the XZ plane.
export function makeSpaceDesk(setup, { f = 1500, photoW = 4000, photoH = 3000 } = {}) {
  const screens = setup.map((s, i) => {
    const PH = (s.PW * s.h) / s.w;
    const map = ([x, y]) => {
      const a = (x / s.w) * s.PW, b = (y / s.h) * PH;
      const X = s.O[0] + a * s.u[0], Y = s.O[1] + b, Z = s.O[2] + a * s.u[2];
      return [photoW / 2 + (f * X) / Z, photoH / 2 + (f * Y) / Z];
    };
    return { n: i + 1, w: s.w, h: s.h, x: s.x, y: s.y, primary: !!s.primary, map };
  });
  const info = {
    monitors: setup.map((s, i) => ({ n: i + 1, w: s.w, h: s.h, x: s.x, y: s.y, pw: s.PW, primary: !!s.primary })),
  };
  return { info, screens, photo: { width: photoW, height: photoH } };
}

// The gaps and offsets the measurement should find, in defaultEdges order.
export function expectedEdges(desk) {
  const byN = new Map(desk.info.monitors.map((m, i) => [m.n, desk.rects[i]]));
  return defaultEdges(desk.info.monitors.map((m) => ({ ...m, pw: 1, ph: 1 })), 0).map((e) => {
    const a = byN.get(e.a), b = byN.get(e.b);
    return e.dir === 'h'
      ? { ...e, gap: b.X - (a.X + a.PW), shift: b.Y - a.Y }
      : { ...e, gap: b.Y - (a.Y + a.PH), shift: b.X - a.X };
  });
}
