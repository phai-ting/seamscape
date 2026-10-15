// Reading the monitor setup from the browser.

export function hasWindowManagement() {
  return typeof window.getScreenDetails === 'function';
}

// 'granted' | 'prompt' | 'denied' | 'unsupported'
export async function windowManagementPermission() {
  if (!hasWindowManagement()) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'window-management' });
    return status.state;
  } catch {
    return 'prompt';
  }
}

// The screens in monitor-number order: the same order monitorsFromScreens
// (layout.js) numbers them in, so screen i here is monitor i + 1.
export function screensInNumberOrder(details) {
  return [...details.screens].sort((s, t) => s.left - t.left || s.top - t.top);
}

// All screens via the Window Management API (Chrome/Edge). May show a prompt.
export async function detectScreens(details) {
  details ||= await window.getScreenDetails();
  return details.screens.map((s) => ({
    left: s.left,
    top: s.top,
    width: s.width,
    height: s.height,
    dpr: s.devicePixelRatio || 1,
    primary: !!s.isPrimary,
    label: s.label || '',
  }));
}

// Only the screen this window is on: the fallback for Firefox and Safari.
// Hidden or headless windows can report 0 x 0; assume 1080p then.
export function currentScreen() {
  const ok = window.screen.width > 0 && window.screen.height > 0;
  return [{
    left: 0,
    top: 0,
    width: ok ? window.screen.width : 1920,
    height: ok ? window.screen.height : 1080,
    dpr: window.devicePixelRatio || 1,
    primary: true,
    label: '',
  }];
}
