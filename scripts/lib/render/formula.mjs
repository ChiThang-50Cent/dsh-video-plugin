import { Path2D } from 'skia-canvas';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams'] }),
  OutputJax: new SVG({ fontCache: 'none', mtextFont: 'sans-serif' }),
});
const cache = new Map();

function compile(node) {
  const tag = adaptor.kind(node);
  const attr = (name) => adaptor.getAttribute(node, name);
  const d = attr('d');
  return {
    tag, transform: attr('transform') || '', path: d ? new Path2D(d) : null,
    text: tag === 'text' ? adaptor.textContent(node) : null,
    fontSize: parseFloat(attr('font-size')) || 1000,
    x: Number(attr('x') || 0), y: Number(attr('y') || 0),
    width: Number(attr('width') || 0), height: Number(attr('height') || 0),
    children: tag === 'text' ? [] : adaptor.childNodes(node)
      .filter((child) => adaptor.kind(child) !== '#text').map(compile),
  };
}

function getFormula(tex) {
  if (!cache.has(tex)) {
    const container = document.convert(tex, { display: true });
    const svg = adaptor.firstChild(container);
    const viewBox = (adaptor.getAttribute(svg, 'viewBox') || '').trim().split(/[ ,]+/).map(Number);
    if (viewBox.length !== 4 || viewBox.some((v) => !Number.isFinite(v)) || viewBox[2] <= 0 || viewBox[3] <= 0) {
      throw new Error(`MathJax could not render formula: ${tex}`);
    }
    cache.set(tex, { viewBox, root: compile(svg) });
  }
  return cache.get(tex);
}

function drawNode(ctx, node, bodyFont) {
  ctx.save();
  for (const match of node.transform.matchAll(/(translate|scale|matrix|rotate)\s*\(([^)]*)\)/g)) {
    const p = match[2].trim().split(/[\s,]+/).map(Number);
    if (match[1] === 'translate') ctx.translate(p[0], p[1] ?? 0);
    else if (match[1] === 'scale') ctx.scale(p[0], p[1] ?? p[0]);
    else if (match[1] === 'matrix') ctx.transform(...p);
    else {
      const angle = p[0] * Math.PI / 180;
      if (p.length > 2) ctx.translate(p[1], p[2]);
      ctx.rotate(angle);
      if (p.length > 2) ctx.translate(-p[1], -p[2]);
    }
  }
  if (node.path) ctx.fill(node.path);
  if (node.tag === 'rect') ctx.fillRect(node.x, node.y, node.width, node.height);
  if (node.text) {
    ctx.font = `${node.fontSize}px ${bodyFont}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(node.text, node.x, node.y);
  }
  for (const child of node.children) drawNode(ctx, child, bodyFont);
  ctx.restore();
}

// x/y locate the top-left of the MathJax viewBox; size is the TeX em size in pixels.
export function drawFormula(ctx, tex, x, y, options = {}) {
  const { size = 48, color = '#ffffff', bodyFont = 'sans-serif' } = options;
  const { viewBox, root } = getFormula(tex);
  const scale = size / 1000;
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x - viewBox[0] * scale, y - viewBox[1] * scale);
  ctx.scale(scale, scale);
  drawNode(ctx, root, bodyFont);
  ctx.restore();
  return { x, y, width: viewBox[2] * scale, height: viewBox[3] * scale, baseline: y - viewBox[1] * scale };
}
