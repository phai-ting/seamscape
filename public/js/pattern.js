// Draws one monitor's calibration pattern onto a full-screen canvas: markers
// at known pixel positions, a magenta line along the exact lit edge, a large
// monitor number, and on the primary a QR code for the phone.

import { markerGrid, markerId, markerLayout } from './fiducials.js';
import qrcode from './vendor/qrcode.mjs';

const INK = '#111111';
const SOFT = '#45484d';
const MAGENTA = '#d1006c';
const WHITE = '#ffffff';
const RULE_SOFT = '#d4d4ce';
const FONT = 'Archivo, system-ui, sans-serif';

// Size the canvas backing store to the device pixels it covers.
export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  return { width: canvas.width, height: canvas.height };
}

// True when the canvas covers the monitor's native pixels (within rounding).
export function coversMonitor(canvas, m) {
  return Math.abs(canvas.width - m.w) <= 2 && Math.abs(canvas.height - m.h) <= 2;
}

function drawQr(ctx, text, x, y, size) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const mod = Math.floor(size / (count + 2 * quiet));
  const total = mod * (count + 2 * quiet);
  const ox = Math.round(x + (size - total) / 2) + quiet * mod;
  const oy = Math.round(y + (size - total) / 2) + quiet * mod;
  ctx.fillStyle = WHITE;
  ctx.fillRect(ox - quiet * mod, oy - quiet * mod, total, total);
  ctx.fillStyle = INK;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) if (qr.isDark(r, c)) ctx.fillRect(ox + c * mod, oy + r * mod, mod, mod);
  }
  return { size: total, bottom: oy - quiet * mod + total };
}

function fitText(ctx, text, weight, size, maxW, stretch = '') {
  let s = size;
  do {
    ctx.font = `${weight} ${stretch}${Math.round(s)}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) break;
    s *= 0.92;
  } while (s > 8);
  return s;
}

// In the QR code's place: what still has to happen before scanning.
function drawPending(ctx, pending, x, y, w, h, cell) {
  const rowSize = Math.max(cell * 0.75, 16);
  const titleSize = Math.max(cell * 1.1, 22);
  const rowH = rowSize * 2.4;
  const rule = Math.max(1, cell / 18);
  let top = y + Math.max(0, (h - (titleSize * 1.8 + pending.length * rowH)) / 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `650 ${Math.round(titleSize)}px ${FONT}`;
  ctx.fillText('Before you scan', x, top + titleSize, w);
  top += titleSize * 1.8;
  ctx.fillRect(x, top, w, rule);
  ctx.font = `500 ${Math.round(rowSize)}px ${FONT}`;
  for (const line of pending) {
    ctx.fillStyle = INK;
    ctx.fillText(line, x, top + rowH * 0.62, w);
    top += rowH;
    ctx.fillStyle = RULE_SOFT;
    ctx.fillRect(x, top, w, rule);
  }
  ctx.textAlign = 'center';
}

// opts: { monitor: { n, w, h, primary }, count, qrText, markers: boolean,
//         headline, lines: [string], pending: [string] }
// With markers false the pattern shows only the number and a large headline
// (used until the window fills its screen, so nobody photographs a wrong scale).
// On the primary, pending lists the screens that are not ready yet; it takes
// the QR code's place so nobody scans before every screen shows its markers.
export function drawPattern(canvas, opts) {
  const { monitor: m, count, qrText, markers = true } = opts;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  // Work in the monitor's native pixels even if the canvas is a pixel off.
  ctx.setTransform(W / m.w, 0, 0, H / m.h, 0, 0);
  const lay = markerLayout(m.w, m.h);
  const { cell } = lay;

  if (markers) {
    ctx.fillStyle = INK;
    for (const mk of lay.markers) {
      const grid = markerGrid(markerId(m.n, mk.pos));
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid.length; c++) if (grid[r][c]) ctx.fillRect(mk.x + c * cell, mk.y + r * cell, cell, cell);
      }
    }
    // The exact lit edge, in measurement magenta.
    const t = Math.max(2, Math.round(cell / 8));
    ctx.fillStyle = MAGENTA;
    ctx.fillRect(0, 0, m.w, t);
    ctx.fillRect(0, m.h - t, m.w, t);
    ctx.fillRect(0, 0, t, m.h);
    ctx.fillRect(m.w - t, 0, t, m.h);
  }

  const box = lay.content;
  const showQr = markers && m.primary && qrText;
  const qrSize = showQr ? Math.min(box.h * 0.92, box.w * 0.42) : 0;
  const gutter = showQr ? cell * 2 : 0;
  const textW = box.w - qrSize - gutter;
  const cx = box.x + textW / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const headline = opts.headline || `Monitor ${m.n} of ${count}`;
  const lines = opts.lines || [];
  const numSize = fitText(ctx, String(m.n), 800, Math.min(box.h * 0.5, textW * 0.6), textW, 'expanded ');
  const headSize = fitText(ctx, headline, 650, markers ? Math.max(cell * 0.9, 18) : Math.max(cell * 1.8, 28), textW);
  const lineSize = Math.max(cell * 0.7, 14);
  const block = numSize * 0.8 + headSize * 1.6 + lines.length * lineSize * 1.5;
  let y = box.y + Math.max(0, (box.h - block) / 2) + numSize * 0.75;

  ctx.fillStyle = INK;
  // The wide cut, as for step numbers. Canvas takes only the keyword: expanded = 125%.
  ctx.font = `800 expanded ${Math.round(numSize)}px ${FONT}`;
  ctx.fillText(String(m.n), cx, y);
  y += headSize * 1.6;
  ctx.font = `650 ${Math.round(headSize)}px ${FONT}`;
  ctx.fillText(headline, cx, y);
  ctx.fillStyle = SOFT;
  ctx.font = `500 ${Math.round(lineSize)}px ${FONT}`;
  for (const line of lines) {
    y += lineSize * 1.5;
    ctx.fillText(line, cx, y, textW);
  }

  const pending = opts.pending || [];
  if (showQr && pending.length) {
    drawPending(ctx, pending, box.x + textW + gutter, box.y, qrSize, box.h, cell);
  } else if (showQr) {
    const qx = box.x + textW + gutter;
    const qy = box.y + (box.h - qrSize) / 2;
    drawQr(ctx, qrText, qx, qy, qrSize);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// The whole calibration window for monitor m: the pattern once the canvas
// fills the monitor, otherwise what to do to get there.
// opts: { monitor, count, qrText, full, others } with full = the canvas is in
// full screen and others = Map of other monitor numbers to their window state
// (calibration-sync.js), or null when the windows cannot talk to each other.
export function renderCalibration(canvas, { monitor: m, count, qrText, full, others = null }) {
  fitCanvas(canvas);
  if (full && coversMonitor(canvas, m)) {
    const pending = [];
    if (m.primary && others) {
      for (let n = 1; n <= count; n++) {
        if (n === m.n) continue;
        const state = others.get(n);
        if (state === 'waiting') pending.push(`Monitor ${n}: click its window to fill the screen.`);
        else if (state === 'wrong-screen') pending.push(`Monitor ${n}: its window is on the wrong screen.`);
        else if (state !== 'pattern') pending.push(`Monitor ${n}: no calibration window is open.`);
      }
    }
    let lines;
    if (!m.primary) lines = ['Keep this showing until your phone has measured your screens.', 'Press Esc to close.'];
    else if (pending.length) lines = ['Every screen must show its black markers before you scan.', 'The code appears here when they do.'];
    else lines = ['Scan the code with your phone’s camera, then photograph all your screens.', 'Press Esc when your phone has measured them.'];
    drawPattern(canvas, { monitor: m, count, qrText, pending, lines });
    return 'pattern';
  }
  if (full) {
    drawPattern(canvas, {
      monitor: m,
      count,
      markers: false,
      headline: `This is not monitor ${m.n}`,
      lines: [
        `This screen is ${canvas.width} × ${canvas.height} pixels; monitor ${m.n} is ${m.w} × ${m.h}.`,
        `Press Esc, drag this window to monitor ${m.n}, then click it.`,
      ],
    });
    return 'wrong-screen';
  }
  drawPattern(canvas, {
    monitor: m,
    count,
    markers: false,
    headline: `Click to fill monitor ${m.n}`,
    lines: [`If this window is not on monitor ${m.n}, drag it there first.`],
  });
  return 'waiting';
}
