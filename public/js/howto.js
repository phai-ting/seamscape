// How to apply the wallpaper on each OS. One structured guide feeds both the
// HOW-TO-APPLY.txt files in the ZIP and the instructions shown on the page.
// Pure functions only.

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

const REBUILD_NOTE = 'If you move a monitor, change its resolution or scaling, or rearrange the '
  + 'displays in your OS settings, open your Seamscape bookmark and build again.';

function spanFile(plan, ext) {
  return { name: `${SPAN_NAME}.${ext}`, desc: `all monitors (${plan.span.w} x ${plan.span.h})` };
}

function monitorFiles(plan, ext) {
  return plan.perMonitor.map((p) => ({
    name: monitorFileName(p, ext),
    desc: `monitor ${p.n} (${p.name}, ${p.w} x ${p.h})`,
  }));
}

// Guide: { title, files: [{ name, desc }], blocks }
// blocks: { type: 'heading' | 'p', text } | { type: 'steps', items } | { type: 'code', lines }
export function howToGuide(os, plan, ext) {
  const span = `${SPAN_NAME}.${ext}`;
  if (os === 'windows') {
    return {
      title: 'Seamscape wallpaper for Windows',
      files: [spanFile(plan, ext)],
      blocks: [
        {
          type: 'steps',
          items: [
            'Copy the file somewhere it will stay (for example Pictures).',
            'Open Settings > Personalization > Background.',
            'Set "Personalize your background" to Picture and click "Browse photos".',
            `Pick ${span}.`,
            'Set "Choose a fit for your desktop image" to Span.',
          ],
        },
        {
          type: 'p',
          text: 'Span lays the image over the monitor arrangement from Settings > System > Display, '
            + 'so keep that arrangement as it was when you built this wallpaper.',
        },
        { type: 'p', text: REBUILD_NOTE },
      ],
    };
  }
  if (os === 'macos') {
    return {
      title: 'Seamscape wallpaper for macOS',
      files: monitorFiles(plan, ext),
      blocks: [
        {
          type: 'steps',
          items: [
            'Copy the files somewhere they will stay (for example Pictures).',
            'Open System Settings > Wallpaper.',
            'Drag the System Settings window onto the display you want to set.',
            'Click "Add Photo..." and pick the file for that display.',
            'Set the fit to "Fill Screen".',
            'Repeat for each display.',
          ],
        },
        {
          type: 'p',
          text: 'Each file name says where its display sits (left, center, right, top, ...), '
            + 'and its number matches the number Seamscape showed for that display.',
        },
        { type: 'p', text: REBUILD_NOTE },
      ],
    };
  }
  return {
    title: 'Seamscape wallpaper for Linux',
    files: [spanFile(plan, ext), ...monitorFiles(plan, ext)],
    blocks: [
      { type: 'heading', text: 'GNOME (one spanned image)' },
      { type: 'p', text: 'Run these in the folder that holds the files:' },
      {
        type: 'code',
        lines: [
          `gsettings set org.gnome.desktop.background picture-uri "file://$PWD/${span}"`,
          `gsettings set org.gnome.desktop.background picture-uri-dark "file://$PWD/${span}"`,
          'gsettings set org.gnome.desktop.background picture-options spanned',
        ],
      },
      { type: 'heading', text: 'KDE Plasma (one image per monitor)' },
      {
        type: 'steps',
        items: [
          'Right-click the desktop on a monitor and choose "Configure Desktop and Wallpaper".',
          'Pick the matching file and set Positioning to "Scaled and Cropped".',
          'Repeat on each monitor.',
        ],
      },
      { type: 'heading', text: 'feh (X11 window managers)' },
      { type: 'code', lines: [`feh --no-xinerama --bg-fill ${span}`] },
      {
        type: 'p',
        text: 'With mixed scaling some desktops lay out the spanned image differently; '
          + 'if it looks off, use the per-monitor images instead.',
      },
      { type: 'p', text: REBUILD_NOTE },
    ],
  };
}

export function howToText(os, plan, ext) {
  const guide = howToGuide(os, plan, ext);
  const lines = [guide.title, '='.repeat(guide.title.length), '', 'Files:'];
  for (const f of guide.files) lines.push(`  ${f.name}  ->  ${f.desc}`);
  for (const b of guide.blocks) {
    lines.push('');
    if (b.type === 'heading') lines.push(`${b.text}:`);
    else if (b.type === 'p') lines.push(b.text);
    else if (b.type === 'steps') b.items.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    else if (b.type === 'code') b.lines.forEach((l) => lines.push(`  ${l}`));
  }
  lines.push('');
  // Notepad on older Windows needs CRLF.
  return lines.join(os === 'windows' ? '\r\n' : '\n');
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
