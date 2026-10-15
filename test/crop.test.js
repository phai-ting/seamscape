import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coverScale, placement, clampView, panView, zoomView, cropRect, outputPlan, defaultView,
} from '../public/js/crop.js';
import { physicalLayout } from '../public/js/layout.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

const box = { x: 0, y: 0, w: 1000, h: 250 };

test('cover fit fills the box and centres the picture', () => {
  const img = { w: 4000, h: 2000 };
  near(coverScale(img, box), 0.25);
  const p = placement(img, box, defaultView());
  near(p.s, 0.25);
  near(p.x, 0);
  near(p.y, -125); // 500 mm tall picture, 250 mm box, centred
});

test('clampView keeps the box covered', () => {
  const img = { w: 4000, h: 2000 };
  const v = clampView(img, box, { zoom: 0.5, cx: 0, cy: 0 });
  assert.equal(v.zoom, 1);
  near(v.cx, 0.5); // picture exactly as wide as the box: no room to pan sideways
  near(v.cy, 0.25);
});

test('panView moves the picture with the pointer, within limits', () => {
  const img = { w: 4000, h: 2000 };
  const v = panView(img, box, defaultView(), 0, 50);
  const p = placement(img, box, v);
  near(p.y, -75);
  const far = panView(img, box, defaultView(), 0, 10000);
  near(placement(img, box, far).y, 0);
});

test('zoomView keeps the anchor point fixed', () => {
  const img = { w: 4000, h: 2000 };
  const anchor = { x: 250, y: 100 };
  const v0 = defaultView();
  const p0 = placement(img, box, v0);
  const u = (anchor.x - p0.x) / p0.s;
  const v1 = zoomView(img, box, v0, 2, anchor);
  const p1 = placement(img, box, v1);
  near(v1.zoom, 2);
  near((anchor.x - p1.x) / p1.s, u);
});

test('cropRect maps physical rects to image pixels', () => {
  const place = { s: 0.5, x: -100, y: -20 };
  assert.deepEqual(cropRect(place, { x: 0, y: 0, w: 600, h: 340 }), { sx: 200, sy: 40, sw: 1200, sh: 680 });
});

test('outputPlan: gap hides part of the picture between monitors', () => {
  const monitors = [
    { n: 1, w: 1920, h: 1080, x: 0, y: 0, pw: 480, ph: 270, primary: true },
    { n: 2, w: 1920, h: 1080, x: 1920, y: 0, pw: 480, ph: 270 },
  ];
  const phys = physicalLayout(monitors, [{ a: 1, b: 2, dir: 'h', gap: 40, shift: 0 }]);
  // Box is 1000 x 270 mm. A 10000 x 2700 picture fits exactly: 0.1 mm per pixel.
  const plan = outputPlan(monitors, phys, { w: 10000, h: 2700 }, defaultView());
  const [c1, c2] = plan.perMonitor.map((p) => p.crop);
  near(c1.sx, 0);
  near(c1.sw, 4800);
  near(c2.sx, 5200); // 400 px (40 mm) skipped for the gap
  assert.deepEqual(plan.perMonitor.map((p) => p.name), ['left', 'right']);
  assert.equal(plan.span.w, 3840);
  assert.deepEqual(plan.span.tiles.map((t) => [t.dx, t.dy]), [[0, 0], [1920, 0]]);
});

test('outputPlan: span tiles handle a monitor left of and above the primary', () => {
  const monitors = [
    { n: 1, w: 1920, h: 1080, x: -1920, y: -300, pw: 530, ph: 300 },
    { n: 2, w: 2560, h: 1440, x: 0, y: 0, pw: 600, ph: 340, primary: true },
  ];
  const phys = physicalLayout(monitors, [{ a: 1, b: 2, dir: 'h', gap: 20, shift: 50 }]);
  const plan = outputPlan(monitors, phys, { w: 6000, h: 3000 }, defaultView());
  assert.equal(plan.span.w, 4480);
  assert.equal(plan.span.h, 1740);
  assert.deepEqual(plan.span.tiles.map((t) => [t.n, t.dx, t.dy, t.dw, t.dh]), [
    [1, 0, 0, 1920, 1080],
    [2, 1920, 300, 2560, 1440],
  ]);
});

test('outputPlan: mixed densities crop the same physical scale', () => {
  // Same physical size, different resolution: crops are the same size in the picture.
  const monitors = [
    { n: 1, w: 3840, h: 2160, x: 0, y: 0, pw: 600, ph: 337.5, primary: true },
    { n: 2, w: 1920, h: 1080, x: 3840, y: 0, pw: 600, ph: 337.5 },
  ];
  const phys = physicalLayout(monitors, [{ a: 1, b: 2, dir: 'h', gap: 0, shift: 0 }]);
  const plan = outputPlan(monitors, phys, { w: 8000, h: 2250 }, defaultView());
  near(plan.perMonitor[0].crop.sw, plan.perMonitor[1].crop.sw);
  assert.equal(plan.perMonitor[0].w, 3840);
  assert.equal(plan.perMonitor[1].w, 1920);
});
