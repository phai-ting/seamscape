// Desktop side of the phone calibration: a calibration window on every
// monitor, and memory of the screen list the phone was given.
//
// With the Window Management API the page fills its own screen with an
// overlay and opens a placed window on each other screen. Browsers allow one
// pop-up per click, so any window the browser blocks gets its own button on
// the overlay. Without the API, the user opens one window per monitor from
// the Gaps step and drags each into place.

import { captureUrl } from './handoff.js';
import { markerLayout } from './fiducials.js';
import { renderCalibration } from './pattern.js';
import { screensInNumberOrder } from './screens.js';

const SESSION_KEY = 'seamscape-calibration';
const windows = new Map(); // monitor number -> Window
let overlay = null;
let remembered = null;

// The screen list the phone received, kept so a typed code can be decoded.
// sessionStorage keeps it across a reload of this tab only.
export function rememberScreens(text) {
  remembered = text;
  try { sessionStorage.setItem(SESSION_KEY, text); } catch { /* private mode: memory only */ }
}

export function rememberedScreens() {
  if (remembered) return remembered;
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}

function windowUrl(n, screensText) {
  return `calibrate.html#n=${n}&s=${screensText}`;
}

function openWindow(n, screensText, screen) {
  const features = screen
    ? `popup,left=${screen.left},top=${screen.top},width=${screen.width},height=${screen.height}`
    : 'popup,width=960,height=600';
  const w = window.open(windowUrl(n, screensText), `seamscape-calibration-${n}`, features);
  if (w) windows.set(n, w);
  return !!w;
}

// One window per monitor, without placement (no Window Management API).
export function openWindowFor(n, screensText) {
  return openWindow(n, screensText, null);
}

function sameScreen(a, b) {
  return a === b || (a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);
}

function closeOverlay() {
  if (!overlay) return;
  window.removeEventListener('resize', overlay.draw);
  overlay.el.remove();
  overlay = null;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Buttons for windows the browser blocked, set in the free band above the
// bottom markers so they never cover one.
function renderBlocked(o) {
  o.bar.replaceChildren();
  const missing = o.others.filter(({ n }) => !windows.get(n) || windows.get(n).closed);
  o.bar.hidden = missing.length === 0;
  if (!missing.length) return;
  const names = missing.map(({ n }) => n).join(', ');
  o.bar.append(el('span', '', `The browser held back the ${missing.length === 1 ? 'window' : 'windows'} for monitor ${names}.`));
  for (const { n, screen } of missing) {
    const b = el('button', 'btn', `Open monitor ${n}`);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openWindow(n, o.screensText, screen);
      renderBlocked(o);
    });
    o.bar.append(b);
  }
  const lay = markerLayout(o.monitor.w, o.monitor.h);
  const dpr = window.devicePixelRatio || 1;
  o.bar.style.bottom = `${(lay.inset + lay.size + lay.cell * 2) / dpr}px`;
}

// Fill this screen with its pattern and open a window on every other screen.
// details: ScreenDetails; monitors: numbered as screensInNumberOrder(details).
// Returns { fullscreen, blocked: [n] }.
export async function openOnAllScreens(details, monitors, screensText) {
  const ordered = screensInNumberOrder(details);
  const hereIndex = Math.max(0, ordered.findIndex((s) => sameScreen(s, details.currentScreen)));
  const here = monitors[hereIndex];
  const others = ordered
    .map((screen, i) => ({ n: monitors[i].n, screen }))
    .filter(({ n }) => n !== here.n);

  closeOverlay();
  const root = el('div', 'cal-overlay');
  const canvas = el('canvas');
  canvas.setAttribute('aria-label', `Calibration pattern for monitor ${here.n}`);
  const bar = el('div', 'cal-blocked');
  root.append(canvas, bar);
  document.body.append(root);
  const o = {
    el: root, bar, monitor: here, others, screensText,
    draw: () => {
      const state = renderCalibration(canvas, {
        monitor: here,
        count: monitors.length,
        qrText: captureUrl(location.origin, screensText),
        full: document.fullscreenElement === root,
      });
      root.dataset.state = state;
      renderBlocked(o);
    },
  };
  overlay = o;
  window.addEventListener('resize', o.draw);
  root.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== root) closeOverlay();
    else o.draw();
  });

  const launch = async () => {
    let fullscreen = false;
    try {
      await root.requestFullscreen({ screen: details.currentScreen, navigationUI: 'hide' });
      fullscreen = true;
    } catch {
      // The click's activation ran out (for example behind a permission
      // prompt). The overlay asks for one more click, which runs this again.
    }
    for (const { n, screen } of others) {
      const w = windows.get(n);
      if (!w || w.closed) openWindow(n, screensText, screen);
    }
    o.draw();
    return fullscreen;
  };
  root.addEventListener('click', () => { if (!document.fullscreenElement) launch(); });
  o.draw();
  document.fonts?.load('800 100px Archivo').then(() => overlay === o && o.draw()).catch(() => {});

  const fullscreen = await launch();
  const blocked = others.filter(({ n }) => !windows.get(n) || windows.get(n).closed).map(({ n }) => n);
  return { fullscreen, blocked };
}

// Close every calibration window and the overlay.
export function closeCalibration() {
  for (const w of windows.values()) {
    try { w.close(); } catch { /* already gone */ }
  }
  windows.clear();
  if (overlay && document.fullscreenElement === overlay.el) document.exitFullscreen().catch(() => {});
  closeOverlay();
}
