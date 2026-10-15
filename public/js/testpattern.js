// A built-in picture made of straight lines and circles, so misalignment
// across the gaps is easy to spot before picking a real photo. Drawn as a
// press calibration chart to match the proof sheet.

// Neutral steps plus non-process hues, so the UI's cyan guides and magenta
// dimensions stay distinct on top of the pattern.
const PATCHES = ['#111111', '#444444', '#777777', '#aaaaaa', '#e8641b', '#2f7d4f', '#3b3f8f', '#d9d9d9'];

export function drawTestPattern(canvas, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const u = Math.min(w, h) / 100;
  const horizon = h * 0.62;

  ctx.fillStyle = '#c9d2d6';
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = '#e2ded3';
  ctx.fillRect(0, horizon, w, h - horizon);

  // Fine grid, centred so it is symmetric across the sheet.
  ctx.strokeStyle = 'rgba(17,17,17,0.14)';
  ctx.lineWidth = Math.max(1, u * 0.12);
  const step = u * 8;
  ctx.beginPath();
  for (let x = (w / 2) % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = (h / 2) % step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(17,17,17,0.45)';
  ctx.lineWidth = u * 0.4;
  for (let r = u * 12; r < Math.max(w, h); r += u * 12) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = u * 0.6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(w, h);
  ctx.moveTo(w, 0); ctx.lineTo(0, h);
  ctx.stroke();

  ctx.strokeStyle = '#e8641b';
  ctx.lineWidth = u * 0.8;
  ctx.beginPath();
  ctx.moveTo(0, horizon); ctx.lineTo(w, horizon);
  ctx.stroke();

  // A row of process patches along the bottom, repeated across the width.
  const ph = u * 5, pw = u * 8, py = h - ph - u * 4;
  for (let i = 0, x = u * 4; x + pw < w - u * 4; i++, x += pw) {
    ctx.fillStyle = PATCHES[i % PATCHES.length];
    ctx.fillRect(x, py, pw, ph);
  }

  ctx.fillStyle = '#111111';
  ctx.font = `800 ${u * 4}px Archivo, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Seamscape test pattern', w / 2, horizon - u * 2.5);
  return canvas;
}
