// Draws the output images and packs them into a ZIP, all in the browser.

import { zipManifest } from './howto.js';
import { createZip } from './zip.js';

export const FORMATS = {
  png: { type: 'image/png', ext: 'png' },
  jpg: { type: 'image/jpeg', ext: 'jpg', quality: 0.93 },
};

function drawCrop(ctx, source, scale, crop, dx, dy, dw, dh) {
  ctx.drawImage(
    source,
    crop.sx * scale, crop.sy * scale, crop.sw * scale, crop.sh * scale,
    dx, dy, dw, dh,
  );
}

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

async function encode(canvas, format) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), format.type, format.quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

// source: full-resolution image (ImageBitmap or canvas).
// imgW: the image width the plan's crops were computed for.
export async function buildZip({ source, imgW, plan, oses, format, onProgress = () => {} }) {
  const scale = source.width / imgW;
  const manifest = zipManifest(oses, plan, format.ext);
  const cache = new Map();
  const files = [];

  const render = async (key) => {
    if (cache.has(key)) return cache.get(key);
    let bytes;
    if (key === 'span') {
      const { c, ctx } = newCanvas(plan.span.w, plan.span.h);
      for (const t of plan.span.tiles) drawCrop(ctx, source, scale, t.crop, t.dx, t.dy, t.dw, t.dh);
      bytes = await encode(c, format);
    } else {
      const p = plan.perMonitor.find((m) => m.n === key);
      const { c, ctx } = newCanvas(p.w, p.h);
      drawCrop(ctx, source, scale, p.crop, 0, 0, p.w, p.h);
      bytes = await encode(c, format);
    }
    cache.set(key, bytes);
    return bytes;
  };

  for (const [i, f] of manifest.entries()) {
    onProgress(i, manifest.length, f.path);
    const data = f.kind === 'text' ? f.text : await render(f.kind === 'span' ? 'span' : f.n);
    files.push({ name: f.path, data });
  }
  onProgress(manifest.length, manifest.length, '');
  return new Blob([createZip(files)], { type: 'application/zip' });
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
