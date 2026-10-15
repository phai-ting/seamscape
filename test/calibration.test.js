import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODES, decodeGrid, markerGrid, markerLayout, markerOwner, markerId } from '../public/js/fiducials.js';
import { applyH, fitRobust, invertH, multiplyH, solveHomography } from '../public/js/homography.js';
import { measureLayout } from '../public/js/measure.js';
import {
  captureUrl, decodeCode, decodeScreens, encodeCode, encodeScreens, screensFromHash,
} from '../public/js/handoff.js';
import { physicalLayout } from '../public/js/layout.js';
import { decodeProfile, encodeProfile } from '../public/js/profile.js';
import { detections, expectedEdges, makeCurvedDesk, makeDesk } from './fixtures/desk.js';

const near = (a, b, eps, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} != ${b} (±${eps})`);

// Physical widths: 27" 16:9 = 597.7 mm, 24" 16:9 = 531.4 mm, 24" portrait = 298.9 mm.
const LAYOUTS = {
  'side by side': [
    { w: 2560, h: 1440, x: 0, y: 0, primary: true, X: 0, Y: 0, PW: 597.7 },
    { w: 2560, h: 1440, x: 2560, y: 0, X: 619.7, Y: 6, PW: 597.7 },
  ],
  'three monitors': [
    { w: 1920, h: 1080, x: -1920, y: 180, X: -549.4, Y: 40, PW: 531.4 },
    { w: 2560, h: 1440, x: 0, y: 0, primary: true, X: 0, Y: 0, PW: 597.7 },
    { w: 1920, h: 1080, x: 2560, y: 180, X: 622.7, Y: 35, PW: 531.4 },
  ],
  'mixed resolutions': [
    { w: 3840, h: 2160, x: 0, y: 0, primary: true, X: 0, Y: 0, PW: 597.7 },
    { w: 1920, h: 1080, x: 3840, y: 0, X: 617.7, Y: 20, PW: 531.4 },
  ],
  portrait: [
    { w: 2560, h: 1440, x: 0, y: 0, primary: true, X: 0, Y: 0, PW: 597.7 },
    { w: 1080, h: 1920, x: 2560, y: -240, X: 612.7, Y: -100, PW: 298.9 },
  ],
  'above and left of the primary': [
    { w: 1920, h: 1080, x: -1920, y: 0, X: -551.4, Y: 8, PW: 531.4 },
    { w: 2560, h: 1440, x: -320, y: -1440, X: -33, Y: -366.2, PW: 597.7 },
    { w: 1920, h: 1080, x: 0, y: 0, primary: true, X: 0, Y: 0, PW: 531.4 },
  ],
};

// ---------- markers ----------

const turn = (g) => g.map((row, r) => row.map((_, c) => g[c][5 - r]));
const bits = (x) => { let n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };
const rotCode = (code) => {
  let out = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((code >> ((3 - c) * 4 + r)) & 1) out |= 1 << (r * 4 + c);
  return out;
};

test('marker codes stay apart under every rotation', () => {
  assert.equal(new Set(CODES).size, 64);
  for (let i = 0; i < CODES.length; i++) {
    let r = CODES[i];
    for (let k = 1; k < 4; k++) {
      r = rotCode(r);
      assert.ok(bits(CODES[i] ^ r) >= 4, `code ${i} too close to its own rotation`);
    }
    for (let j = i + 1; j < CODES.length; j++) {
      let q = CODES[j];
      for (let k = 0; k < 4; k++) {
        assert.ok(bits(CODES[i] ^ q) >= 4, `codes ${i} and ${j} too close`);
        q = rotCode(q);
      }
    }
  }
});

test('decodeGrid reads a marker from any starting corner', () => {
  for (const id of [0, 7, 31, 63]) {
    const truth = markerGrid(id);
    // Sampling from corner s gives the true grid turned back s times.
    let sampled = truth;
    for (let s = 0; s < 4; s++) {
      const got = decodeGrid(sampled);
      assert.deepEqual(got, { id, start: s });
      sampled = turn(turn(turn(sampled)));
    }
  }
});

test('decodeGrid rejects a broken border and unknown codes', () => {
  const g = markerGrid(5);
  g[0][3] = 0;
  assert.equal(decodeGrid(g), null);
  const blank = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => (r === 0 || c === 0 || r === 5 || c === 5 ? 1 : 0)));
  assert.equal(decodeGrid(blank), null);
});

test('marker ids map to monitor and position', () => {
  assert.equal(markerId(3, 5), 21);
  assert.deepEqual(markerOwner(21), { n: 3, pos: 5 });
});

test('markerLayout keeps markers on screen, apart, and clear of the middle', () => {
  for (const [w, h] of [[2560, 1440], [1080, 1920], [1366, 768], [3840, 2160]]) {
    const lay = markerLayout(w, h);
    for (const m of lay.markers) {
      assert.ok(m.x >= lay.cell && m.y >= lay.cell, `${w}x${h} marker ${m.pos} too close to the edge`);
      assert.ok(m.x + lay.size <= w - lay.cell && m.y + lay.size <= h - lay.cell);
      for (const o of lay.markers) {
        if (o === m) continue;
        const apart = m.x + lay.size + lay.cell <= o.x || o.x + lay.size + lay.cell <= m.x
          || m.y + lay.size + lay.cell <= o.y || o.y + lay.size + lay.cell <= m.y;
        assert.ok(apart, `${w}x${h} markers ${m.pos} and ${o.pos} touch`);
      }
    }
    assert.ok(lay.content.w > 0.4 * w && lay.content.h > 0.3 * h, `${w}x${h} leaves too little middle`);
  }
});

// ---------- homography ----------

test('solveHomography recovers a known perspective map', () => {
  const H = [1.2, 0.1, 30, -0.05, 0.9, 12, 2e-4, -1e-4, 1];
  const src = [[0, 0], [100, 0], [100, 80], [0, 80], [50, 40], [20, 70]];
  const dst = src.map((p) => applyH(H, p));
  const got = solveHomography(src, dst);
  for (let i = 0; i < 9; i++) near(got[i], H[i], 1e-9, `h${i}`);
  const back = multiplyH(invertH(got), got);
  for (let i = 0; i < 9; i++) near(back[i] / back[8], [1, 0, 0, 0, 1, 0, 0, 0, 1][i], 1e-9);
});

test('fitRobust drops a marker that does not fit', () => {
  const H = [2, 0.1, 5, 0.02, 1.9, 8, 1e-4, 5e-5, 1];
  const groups = [[0, 0], [300, 0], [300, 200], [0, 200], [150, 0]].map(([x, y], i) => {
    const src = [[x, y], [x + 20, y], [x + 20, y + 20], [x, y + 20]];
    const dst = src.map((p) => applyH(H, p)).map(([u, v]) => (i === 2 ? [u + 40, v - 30] : [u, v]));
    return { key: i, src, dst };
  });
  const fit = fitRobust(groups, { tolerance: 1 });
  assert.deepEqual(fit.dropped.map((g) => g.key), [2]);
  assert.ok(fit.error < 1e-6);
});

// ---------- measuring ----------

for (const [name, setup] of Object.entries(LAYOUTS)) {
  test(`measureLayout: ${name}`, () => {
    const desk = makeDesk(setup);
    const res = measureLayout(desk.info, detections(desk), desk.photo);
    assert.equal(res.ok, true, res.problems.join(' / '));
    assert.deepEqual(res.problems, []);
    const { monitors, edges } = res.profile;
    setup.forEach((s, i) => {
      near(monitors[i].pw, s.PW, 0.3, `monitor ${i + 1} width`);
      near(monitors[i].ph, (s.PW * s.h) / s.w, 0.3, `monitor ${i + 1} height`);
      assert.equal(monitors[i].x, s.x);
      assert.equal(monitors[i].y, s.y);
    });
    const want = expectedEdges(desk);
    assert.equal(edges.length, want.length);
    edges.forEach((e, i) => {
      assert.equal(`${e.a}${e.dir}${e.b}`, `${want[i].a}${want[i].dir}${want[i].b}`);
      near(e.gap, want[i].gap, 0.3, `gap ${e.a}-${e.b}`);
      near(e.shift, want[i].shift, 0.3, `shift ${e.a}-${e.b}`);
    });
    // The profile places every monitor where it really is.
    const phys = physicalLayout(monitors, edges);
    const ox = phys[0].x - setup[0].X, oy = phys[0].y - setup[0].Y;
    phys.forEach((r, i) => {
      near(r.x - ox, setup[i].X, 0.8, `monitor ${i + 1} x`);
      near(r.y - oy, setup[i].Y, 0.8, `monitor ${i + 1} y`);
    });
    // And it survives the URL fragment.
    assert.deepEqual(decodeProfile(encodeProfile(res.profile)), res.profile);
  });
}

test('measureLayout copes with pixel noise and a bad marker', () => {
  const desk = makeDesk(LAYOUTS['three monitors']);
  const dets = detections(desk, { noise: 1.5, seed: 7 });
  // A misread: a marker reported far from where it really is.
  dets.find((d) => d.id === markerId(2, 6)).corners.forEach((c) => { c[0] += 300; c[1] -= 200; });
  const res = measureLayout(desk.info, dets, desk.photo);
  assert.equal(res.ok, true, res.problems.join(' / '));
  const want = expectedEdges(desk);
  res.profile.edges.forEach((e, i) => {
    near(e.gap, want[i].gap, 1.5, 'gap');
    near(e.shift, want[i].shift, 1.5, 'shift');
  });
  assert.ok(!res.screens[1].found.includes(6), 'the damaged marker is dropped');
});

test('measureLayout keeps every marker on curved monitors and measures their gaps', () => {
  const desk = makeCurvedDesk([
    { w: 2560, h: 1440, x: -2560, y: 0, X: -617.7, Y: 4, PW: 597.7 },
    { w: 2560, h: 1440, x: 0, y: 0, primary: true, X: 0, Y: 0, PW: 597.7 },
    { w: 2560, h: 1440, x: 2560, y: 0, X: 614.7, Y: -6, PW: 597.7 },
  ], { radius: 1500 });
  const res = measureLayout(desk.info, detections(desk, { noise: 0.8, seed: 5 }), desk.photo);
  assert.equal(res.ok, true, res.problems.join(' / '));
  for (const s of res.screens) assert.equal(s.found.length, 8, `monitor ${s.n} kept every marker`);
  assert.match(res.notes.join(' '), /not flat in the photo/);
  const want = expectedEdges(desk);
  res.profile.edges.forEach((e, i) => {
    near(e.gap, want[i].gap, 1.5, `gap ${e.a}-${e.b}`);
    near(e.shift, want[i].shift, 1.5, `shift ${e.a}-${e.b}`);
  });
  for (const m of res.profile.monitors) near(m.pw, 597.7, 6, `monitor ${m.n} width`);
});

test('measureLayout tells the user which monitor is cut off', () => {
  const desk = makeDesk(LAYOUTS['three monitors'], { fill: 1.6 });
  const res = measureLayout(desk.info, detections(desk), desk.photo);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /Monitor 1 is cut off on the left/.test(p)), res.problems.join(' / '));
  assert.ok(res.problems.some((p) => /Monitor 3 is cut off on the right/.test(p)), res.problems.join(' / '));
});

test('measureLayout accepts a slightly cut-off monitor with a note', () => {
  const desk = makeDesk(LAYOUTS['three monitors'], { fill: 1.12 });
  const res = measureLayout(desk.info, detections(desk), desk.photo);
  assert.equal(res.ok, true, res.problems.join(' / '));
  assert.ok(res.notes.some((n) => /Monitor 1 is partly cut off/.test(n)), res.notes.join(' / '));
});

test('measureLayout reports a missing monitor and an empty photo', () => {
  const desk = makeDesk(LAYOUTS['three monitors']);
  const res = measureLayout(desk.info, detections(desk, { keep: (n) => n !== 2 }), desk.photo);
  assert.equal(res.ok, false);
  assert.match(res.problems.join(' '), /No markers found on monitor 2\./);
  const none = measureLayout(desk.info, [], desk.photo);
  assert.match(none.problems[0], /No calibration markers/);
});

test('measureLayout flags a display order that does not match the desk', () => {
  const setup = [
    { w: 2560, h: 1440, x: 0, y: 0, primary: true, X: 0, Y: 0, PW: 597.7 },
    { w: 2560, h: 1440, x: 2560, y: 0, X: -620, Y: 0, PW: 597.7 },
  ];
  const desk = makeDesk(setup);
  const res = measureLayout(desk.info, detections(desk), desk.photo);
  assert.equal(res.ok, false);
  assert.match(res.problems.join(' '), /monitor 2 to the right of monitor 1, but in the photo it is on the left/);
});

test('measureLayout notes a monitor that sits off level', () => {
  const desk = makeDesk(LAYOUTS['side by side']);
  // Turn monitor 2 by 3 degrees about its centre, on the desk plane.
  const a = (3 * Math.PI) / 180, s2 = desk.screens[1], r = desk.rects[1];
  const cx = r.X + r.PW / 2, cy = r.Y + r.PH / 2;
  const rot = multiplyH([1, 0, cx, 0, 1, cy, 0, 0, 1],
    multiplyH([Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1], [1, 0, -cx, 0, 1, -cy, 0, 0, 1]));
  const toMm = [r.PW / s2.w, 0, r.X, 0, r.PH / s2.h, r.Y, 0, 0, 1];
  s2.G = multiplyH(desk.camera, multiplyH(rot, toMm));
  const res = measureLayout(desk.info, detections(desk), desk.photo);
  assert.equal(res.ok, true);
  assert.match(res.notes.join(' '), /Monitor 2 sits about 3° off level/);
});

// ---------- handoff ----------

test('screen list round-trips through the QR payload', () => {
  const info = {
    refMm: 597.7,
    monitors: [
      { n: 1, w: 1920, h: 1080, x: -1920, y: 180, primary: false },
      { n: 2, w: 2560, h: 1440, x: 0, y: 0, primary: true },
      { n: 3, w: 1080, h: 1920, x: 2560, y: -240, primary: false },
    ],
  };
  const text = encodeScreens(info);
  assert.equal(text, '1_597.7_1920x1080-1920+180_2560x1440+0+0p_1080x1920+2560-240');
  assert.deepEqual(decodeScreens(text), info);
  const url = captureUrl('https://seamscape.phaiting.com', text);
  assert.equal(url, `https://seamscape.phaiting.com/capture#s=${text}`);
  assert.equal(screensFromHash(new URL(url).hash), text);
  assert.equal(screensFromHash('#x=1'), null);
  assert.throws(() => decodeScreens('2_597.7_1920x1080+0+0p'), /different version/);
  assert.throws(() => decodeScreens('1_597.7_19x20x1'), /damaged/);
});

function measuredProfile(name) {
  const desk = makeDesk(LAYOUTS[name]);
  const res = measureLayout(desk.info, detections(desk), desk.photo);
  return { desk, profile: res.profile, screens: encodeScreens(desk.info) };
}

test('short code rebuilds exactly the measured profile', () => {
  for (const name of Object.keys(LAYOUTS)) {
    const { profile, screens } = measuredProfile(name);
    const code = encodeCode(profile, screens);
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{1,4}(-[0-9A-HJKMNP-TV-Z]{1,4})*$/);
    assert.deepEqual(decodeCode(code, screens), profile, name);
  }
});

test('short code is short and forgiving to type', () => {
  const { profile, screens } = measuredProfile('three monitors');
  const code = encodeCode(profile, screens);
  assert.equal(code.replace(/-/g, '').length, 18);
  const typed = code.toLowerCase().replace(/-/g, ' ').replace(/1/g, 'l').replace(/0/g, 'o');
  assert.deepEqual(decodeCode(typed, screens), profile);
});

test('short code catches typos and codes from another calibration', () => {
  const { profile, screens } = measuredProfile('three monitors');
  const code = encodeCode(profile, screens).replace(/-/g, '');
  const swapped = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
  assert.throws(() => decodeCode(swapped, screens), /does not match/);
  assert.throws(() => decodeCode(code.slice(0, -1), screens), /too short/);
  const other = screens.replace('597.7', '600');
  assert.throws(() => decodeCode(code, other), /does not match/);
});

test('short code gives up on values it cannot hold', () => {
  const { profile, screens } = measuredProfile('side by side');
  const far = { ...profile, edges: profile.edges.map((e) => ({ ...e, gap: 900 })) };
  assert.equal(encodeCode(far, screens), null);
});
