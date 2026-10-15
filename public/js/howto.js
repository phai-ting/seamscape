// Text for the HOW-TO-APPLY.txt files in the ZIP. Pure functions only.

import { monitorFileName } from './crop.js';

export const OSES = ['windows', 'macos', 'linux'];

export const OS_LABELS = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

export const SPAN_NAME = 'seamscape-span';

export function detectOS(platform = '') {
  const p = platform.toLowerCase();
  if (p.includes('mac')) return 'macos';
  if (p.includes('win')) return 'windows';
  if (p.includes('linux') || p.includes('x11') || p.includes('cros')) return 'linux';
  return 'windows';
}

function monitorLines(plan, ext) {
  return plan.perMonitor.map(
    (p) => `  ${monitorFileName(p, ext)}  ->  monitor ${p.n} (${p.name}, ${p.w} x ${p.h})`,
  );
}

const REBUILD_NOTE = [
  'If you move a monitor, change its resolution or scaling, or rearrange the',
  'displays in your OS settings, open your Seamscape bookmark and build again.',
];

export function howToText(os, plan, ext) {
  const span = `${SPAN_NAME}.${ext}`;
  if (os === 'windows') {
    return [
      'Seamscape wallpaper for Windows',
      '===============================',
      '',
      `File: ${span}  (${plan.span.w} x ${plan.span.h}, covers all monitors)`,
      '',
      '1. Copy the file somewhere it will stay (for example Pictures).',
      '2. Open Settings > Personalization > Background.',
      '3. Set "Personalize your background" to Picture and click "Browse photos".',
      `4. Pick ${span}.`,
      '5. Set "Choose a fit for your desktop image" to Span.',
      '',
      'Span lays the image over the monitor arrangement from Settings > System >',
      'Display, so keep that arrangement as it was when you built this wallpaper.',
      '',
      ...REBUILD_NOTE,
      '',
    ].join('\r\n');
  }
  if (os === 'macos') {
    return [
      'Seamscape wallpaper for macOS',
      '=============================',
      '',
      'One image per display:',
      ...monitorLines(plan, ext),
      '',
      '1. Copy the files somewhere they will stay (for example Pictures).',
      '2. Open System Settings > Wallpaper.',
      '3. Drag the System Settings window onto the display you want to set.',
      '4. Click "Add Photo..." and pick the file for that display.',
      '5. Set the fit to "Fill Screen".',
      '6. Repeat for each display.',
      '',
      'The name says where the display sits (left, center, right, top, ...)',
      'and its number matches the number Seamscape showed for it.',
      '',
      ...REBUILD_NOTE,
      '',
    ].join('\n');
  }
  return [
    'Seamscape wallpaper for Linux',
    '=============================',
    '',
    `Spanned image: ${span}  (${plan.span.w} x ${plan.span.h})`,
    'One image per monitor:',
    ...monitorLines(plan, ext),
    '',
    'GNOME (one spanned image):',
    `  gsettings set org.gnome.desktop.background picture-uri "file://$PWD/${span}"`,
    `  gsettings set org.gnome.desktop.background picture-uri-dark "file://$PWD/${span}"`,
    '  gsettings set org.gnome.desktop.background picture-options spanned',
    '',
    'KDE Plasma (one image per monitor):',
    '  Right-click the desktop on each monitor > Configure Desktop and Wallpaper,',
    '  pick the matching file, and set Positioning to "Scaled and Cropped".',
    '',
    'feh (X11 window managers):',
    `  feh --no-xinerama --bg-fill ${span}`,
    '',
    'With mixed scaling some desktops lay out the spanned image differently;',
    'if it looks off, use the per-monitor images instead.',
    '',
    ...REBUILD_NOTE,
    '',
  ].join('\n');
}

// The list of files to put in the ZIP for the chosen OSes.
// kind 'span' | 'monitor' | 'text'.
export function zipManifest(oses, plan, ext) {
  const files = [];
  for (const os of OSES) {
    if (!oses.includes(os)) continue;
    if (os === 'windows' || os === 'linux') {
      files.push({ path: `${os}/${SPAN_NAME}.${ext}`, kind: 'span' });
    }
    if (os === 'macos' || os === 'linux') {
      for (const p of plan.perMonitor) {
        files.push({ path: `${os}/${monitorFileName(p, ext)}`, kind: 'monitor', n: p.n });
      }
    }
    files.push({ path: `${os}/HOW-TO-APPLY.txt`, kind: 'text', text: howToText(os, plan, ext) });
  }
  return files;
}
