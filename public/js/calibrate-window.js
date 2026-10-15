// A calibration window for one monitor, opened by the desktop page as
// calibrate.html#n=<monitor number>&s=<screen list>.

import { captureUrl, decodeScreens, screensFromHash } from './handoff.js';
import { renderCalibration } from './pattern.js';

const canvas = document.querySelector('#pattern');

function parse() {
  const text = screensFromHash(location.hash);
  const n = Number(/(?:^#|&)n=(\d+)/.exec(location.hash)?.[1]);
  if (!text || !n) return null;
  try {
    const info = decodeScreens(text);
    const monitor = info.monitors.find((m) => m.n === n);
    return monitor ? { monitor, count: info.monitors.length, qrText: captureUrl(location.origin, text) } : null;
  } catch {
    return null;
  }
}

const job = parse();

function draw() {
  const state = renderCalibration(canvas, { ...job, full: !!document.fullscreenElement });
  document.body.dataset.state = state;
}

async function fill() {
  if (document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Needs a click in this window; the page says so.
  }
}

if (!job) {
  canvas.hidden = true;
  document.querySelector('#message').hidden = false;
} else {
  document.title = `Seamscape calibration: monitor ${job.monitor.n}`;
  draw();
  document.fonts?.load('800 100px Archivo').then(draw).catch(() => {});
  window.addEventListener('resize', draw);
  document.addEventListener('fullscreenchange', draw);
  document.addEventListener('click', fill);
  fill();
}
