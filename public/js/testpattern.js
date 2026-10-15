// A built-in picture made of straight lines and circles, so misalignment
// across the gaps is easy to spot before picking a real photo.

export function drawTestPattern(canvas, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const u = Math.min(w, h) / 100;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#13243f');
  sky.addColorStop(0.6, '#2d4f7c');
  sky.addColorStop(1, '#e0a45a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, u * 0.15);
  const step = u * 8;
  ctx.beginPath();
  for (let x = w / 2 % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = h / 2 % step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();

  ctx.lineWidth = u * 0.6;
  ctx.strokeStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(w, h);
  ctx.moveTo(w, 0); ctx.lineTo(0, h);
  ctx.stroke();

  ctx.strokeStyle = '#ef476f';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62); ctx.lineTo(w, h * 0.62);
  ctx.stroke();

  ctx.strokeStyle = '#06d6a0';
  for (let r = u * 12; r < Math.max(w, h); r += u * 12) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 ${u * 4}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Seamscape test pattern', w / 2, h * 0.62 - u * 2);
  return canvas;
}
