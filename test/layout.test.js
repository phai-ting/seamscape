import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sizeFromDiagonal, diagonalInches, boundingBox, findAdjacencies, spanningTree,
  monitorsFromScreens, defaultEdges, reconcileEdges, physicalLayout, positionNames,
  virtualDesktop,
} from '../public/js/layout.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// 27" 2560x1440 is about 596.7 x 335.6 mm.
function mon(n, w, h, x, y, pw, ph, primary = false) {
  return { n, w, h, x, y, pw, ph, primary };
}

test('sizeFromDiagonal keeps aspect and diagonal', () => {
  const { pw, ph } = sizeFromDiagonal(2560, 1440, 27);
  near(pw / ph, 16 / 9);
  near(diagonalInches(pw, ph), 27);
  near(pw, 597.7, 0.1);
});

test('boundingBox handles negative coordinates', () => {
  assert.deepEqual(
    boundingBox([{ x: -1920, y: -200, w: 1920, h: 1080 }, { x: 0, y: 0, w: 2560, h: 1440 }]),
    { x: -1920, y: -200, w: 4480, h: 1640 },
  );
});

test('findAdjacencies finds side-by-side and stacked neighbours only', () => {
  const rects = [
    { id: 1, x: 0, y: 0, w: 100, h: 50 },
    { id: 2, x: 100, y: 10, w: 100, h: 50 },
    { id: 3, x: 0, y: 50, w: 100, h: 50 },
    { id: 4, x: 500, y: 500, w: 10, h: 10 },
  ];
  const adj = findAdjacencies(rects);
  assert.deepEqual(
    adj.map((e) => `${e.a}${e.dir}${e.b}`).sort(),
    ['1h2', '1v3', '3h2'],
  );
});

test('spanningTree links detached monitors to the nearest one', () => {
  const rects = [
    { id: 1, x: 0, y: 0, w: 100, h: 50 },
    { id: 2, x: 150, y: 0, w: 100, h: 50 }, // 50px OS gap
  ];
  assert.deepEqual(spanningTree(rects, 1), [{ a: 1, b: 2, dir: 'h' }]);
  assert.deepEqual(spanningTree(rects, 2), [{ a: 1, b: 2, dir: 'h' }]);
});

test('monitorsFromScreens numbers left to right and rebuilds native positions', () => {
  // Left monitor at 100% scaling, primary 4K at 150% (2560x1440 CSS).
  const screens = [
    { left: 0, top: 0, width: 2560, height: 1440, dpr: 1.5, primary: true },
    { left: -1920, top: 360, width: 1920, height: 1080, dpr: 1, primary: false },
  ];
  const ms = monitorsFromScreens(screens);
  assert.equal(ms.length, 2);
  assert.deepEqual(ms.map((m) => [m.n, m.w, m.h, m.x, m.y, m.primary]), [
    [1, 1920, 1080, -1920, 540, false],
    [2, 3840, 2160, 0, 0, true],
  ]);
});

test('physicalLayout: side by side with gap and shift', () => {
  const ms = [mon(1, 2560, 1440, 0, 0, 600, 340, true), mon(2, 2560, 1440, 2560, 0, 600, 340)];
  const phys = physicalLayout(ms, [{ a: 1, b: 2, dir: 'h', gap: 20, shift: 5 }]);
  assert.deepEqual(phys, [
    { n: 1, x: 0, y: 0, w: 600, h: 340 },
    { n: 2, x: 620, y: 5, w: 600, h: 340 },
  ]);
});

test('physicalLayout: works outward from a primary on the right', () => {
  const ms = [mon(1, 1920, 1080, -1920, 0, 530, 300), mon(2, 2560, 1440, 0, 0, 600, 340, true)];
  const phys = physicalLayout(ms, [{ a: 1, b: 2, dir: 'h', gap: 25, shift: -10 }]);
  // Normalised so the bbox starts at 0,0: monitor 2 is the reference but sits higher.
  assert.deepEqual(phys, [
    { n: 1, x: 0, y: 10, w: 530, h: 300 },
    { n: 2, x: 555, y: 0, w: 600, h: 340 },
  ]);
});

test('physicalLayout: three monitors, mixed resolutions, portrait', () => {
  const ms = [
    mon(1, 1080, 1920, -1080, -420, 300, 530), // portrait, left
    mon(2, 3840, 2160, 0, 0, 600, 340, true),
    mon(3, 1920, 1080, 3840, 0, 530, 300),
  ];
  const edges = defaultEdges(ms, 22);
  assert.deepEqual(edges.map((e) => `${e.a}${e.dir}${e.b}`).sort(), ['1h2', '2h3']);
  const phys = physicalLayout(ms, edges);
  const byN = Object.fromEntries(phys.map((r) => [r.n, r]));
  near(byN[2].x - (byN[1].x + byN[1].w), 22);
  near(byN[3].x - (byN[2].x + byN[2].w), 22);
  // Portrait top sits 420 native px of monitor 1 above monitor 2: 420 * 530/1920 mm.
  near(byN[2].y - byN[1].y, 115.9, 0.06);
  assert.equal(Math.min(...phys.map((r) => r.y)), 0);
});

test('physicalLayout: monitor above the primary (negative y)', () => {
  const ms = [mon(1, 1920, 1080, 0, -1080, 530, 300), mon(2, 1920, 1080, 0, 0, 530, 300, true)];
  const edges = defaultEdges(ms, 30);
  assert.deepEqual(edges, [{ a: 1, b: 2, dir: 'v', gap: 30, shift: 0 }]);
  assert.deepEqual(physicalLayout(ms, edges), [
    { n: 1, x: 0, y: 0, w: 530, h: 300 },
    { n: 2, x: 0, y: 330, w: 530, h: 300 },
  ]);
});

test('physicalLayout: unlinked monitor is still placed', () => {
  const ms = [mon(1, 100, 100, 0, 0, 100, 100, true), mon(2, 100, 100, 100, 0, 100, 100)];
  const phys = physicalLayout(ms, []);
  assert.deepEqual(phys.map((r) => [r.x, r.y]), [[0, 0], [100, 0]]);
});

test('reconcileEdges keeps measured values for links that still exist', () => {
  const ms = [mon(1, 1920, 1080, 0, 0, 530, 300, true), mon(2, 1920, 1080, 1920, 0, 530, 300)];
  const measured = [{ a: 1, b: 2, dir: 'h', gap: 17.5, shift: -3 }];
  const three = [...ms, mon(3, 1920, 1080, 3840, 0, 530, 300)];
  const edges = reconcileEdges(three, measured, 20);
  assert.deepEqual(edges.find((e) => e.b === 2), measured[0]);
  assert.equal(edges.find((e) => e.b === 3).gap, 20);
});

test('positionNames', () => {
  const row = [
    { n: 1, x: 0, y: 0, w: 10, h: 10 },
    { n: 2, x: 11, y: 0, w: 10, h: 10 },
    { n: 3, x: 22, y: 0, w: 10, h: 10 },
  ];
  assert.deepEqual([...positionNames(row).values()], ['left', 'center', 'right']);
  const stack = [{ n: 1, x: 0, y: 0, w: 10, h: 10 }, { n: 2, x: 0, y: 11, w: 10, h: 10 }];
  assert.deepEqual([...positionNames(stack).values()], ['top', 'bottom']);
  assert.deepEqual([...positionNames([row[0]]).values()], ['main']);
  // Two monitors on top, laptop centred below.
  const desk = [
    { n: 1, x: 0, y: 0, w: 10, h: 6 },
    { n: 2, x: 11, y: 0, w: 10, h: 6 },
    { n: 3, x: 6, y: 7, w: 9, h: 5 },
  ];
  assert.deepEqual([...positionNames(desk).values()], ['top-left', 'top-right', 'bottom']);
});

test('virtualDesktop covers negative coordinates', () => {
  const ms = [mon(1, 1920, 1080, -1920, 200, 1, 1), mon(2, 2560, 1440, 0, 0, 1, 1, true)];
  assert.deepEqual(virtualDesktop(ms), { x: -1920, y: 0, w: 4480, h: 1440 });
});
