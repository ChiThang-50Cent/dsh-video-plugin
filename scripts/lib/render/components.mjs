import { drawFormula } from './formula.mjs';

const clamp = (value) => Math.max(0, Math.min(1, value));
const linear = (value) => clamp(value);
const easeInOut = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const fade = (t, start = 0, duration = 1) => duration <= 0 ? Number(t >= start) : easeInOut((t - start) / duration);
const crossfade = (t, start = 0, duration = 1) => { const incoming = fade(t, start, duration); return { incoming, outgoing: 1 - incoming }; };

export function createComponents(ctx, options = {}) {
  const theme = options.theme;
  const colors = theme?.colors ?? {};
  const bodyFont = options.bodyFont || theme?.bodyFont || 'sans-serif';
  function text(value, x, y, settings = {}) {
    const { size = 48, color = colors.ink ?? '#ffffff', font = bodyFont, weight = 'normal', maxWidth = Infinity, lineHeight = size * 1.2 } = settings;
    ctx.save();
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const lines = [];
    for (const paragraph of String(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
        else line = candidate;
      }
      lines.push(line);
    }
    let width = 0;
    let top = y;
    let bottom = y;
    lines.forEach((line, i) => {
      const baseline = y + i * lineHeight;
      const metrics = ctx.measureText(line);
      width = Math.max(width, metrics.width);
      top = Math.min(top, baseline - (metrics.actualBoundingBoxAscent || size));
      bottom = Math.max(bottom, baseline + (metrics.actualBoundingBoxDescent || 0));
      ctx.fillText(line, x, baseline);
    });
    ctx.restore();
    return { x, y: top, width, height: bottom - top, baseline: y };
  }
  function formula(tex, x, y, settings = {}) {
    return drawFormula(ctx, tex, x, y, { bodyFont, color: colors.ink ?? '#ffffff', ...settings });
  }
  function axes(settings = {}) {
    const { x = 0, y = 0, width = 400, height = 300, xMin = -5, xMax = 5, yMin = -3, yMax = 3, xStep = 1, yStep = 1, color = colors.muted ?? '#a5bbda', lineWidth = 2, labels = true, fontSize = 18 } = settings;
    const px = (v) => x + (v - xMin) * width / (xMax - xMin);
    const py = (v) => y + height - (v - yMin) * height / (yMax - yMin);
    const axisX = Math.max(x, Math.min(x + width, px(0)));
    const axisY = Math.max(y, Math.min(y + height, py(0)));
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lineWidth; ctx.font = `${fontSize}px ${bodyFont}`; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    ctx.beginPath(); ctx.moveTo(x, axisY); ctx.lineTo(x + width, axisY); ctx.moveTo(axisX, y); ctx.lineTo(axisX, y + height);
    if (xStep > 0) for (let i = Math.ceil(xMin / xStep), end = Math.floor(xMax / xStep); i <= end; i++) { const v = i * xStep, p = px(v); ctx.moveTo(p, axisY - 5); ctx.lineTo(p, axisY + 5); if (labels && Math.abs(v) > 1e-10) ctx.fillText(String(Number(v.toPrecision(8))), p, axisY + 8); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    if (yStep > 0) for (let i = Math.ceil(yMin / yStep), end = Math.floor(yMax / yStep); i <= end; i++) { const v = i * yStep, p = py(v); ctx.moveTo(axisX - 5, p); ctx.lineTo(axisX + 5, p); if (labels && Math.abs(v) > 1e-10) ctx.fillText(String(Number(v.toPrecision(8))), axisX - 9, p); }
    ctx.stroke(); ctx.restore();
    return { x, y, width, height, mapX: px, mapY: py };
  }
  function plot(fn, settings = {}) {
    const { x = 0, y = 0, width = 400, height = 300, xMin = -5, xMax = 5, yMin = -3, yMax = 3, progress = 1, samples = 200, color = colors.structure ?? '#55e2c1', lineWidth = 4 } = settings;
    const count = Math.max(1, Math.floor(samples));
    const reveal = clamp(progress) * count;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath();
    let started = false;
    for (let i = 0; i <= Math.ceil(reveal); i++) {
      const at = Math.min(i, reveal) / count;
      const value = fn(xMin + at * (xMax - xMin));
      if (!Number.isFinite(value)) { started = false; continue; }
      const sx = x + at * width, sy = y + height - (value - yMin) * height / (yMax - yMin);
      if (started) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); started = true; }
    }
    ctx.stroke(); ctx.restore();
    return { x, y, width, height };
  }
  function arrow(x1, y1, x2, y2, settings = {}) {
    const { color = colors.ink ?? '#ffffff', lineWidth = 3, headSize = 14 } = settings;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.moveTo(x2 - headSize * Math.cos(angle - Math.PI / 6), y2 - headSize * Math.sin(angle - Math.PI / 6)); ctx.lineTo(x2, y2); ctx.lineTo(x2 - headSize * Math.cos(angle + Math.PI / 6), y2 - headSize * Math.sin(angle + Math.PI / 6)); ctx.stroke(); ctx.restore();
  }
  function highlight(x, y, width, height, settings = {}) {
    ctx.save(); ctx.strokeStyle = settings.color || colors.accent || '#ffcc66'; ctx.lineWidth = settings.lineWidth || 3; ctx.strokeRect(x, y, width, height); ctx.restore();
    return { x, y, width, height };
  }
  return { easing: { linear, easeInOut }, fade, crossfade, text, formula, axes, plot, arrow, highlight, theme };
}
