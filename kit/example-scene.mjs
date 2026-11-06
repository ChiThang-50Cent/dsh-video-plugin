export const meta = { id: 'continuity-example', durationSec: 10, width: 1920, height: 1080, fps: 30 };

// Every colour and font comes from api.theme (the active visual style); switching
// project/production `visualStyle` restyles this scene without editing it.
export function draw(ctx, t, api) {
  const { colors } = api.theme;
  const { incoming, outgoing } = api.crossfade(t, 5.7, 0.8);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, meta.width, meta.height);

  ctx.save();
  ctx.globalAlpha = outgoing;
  ctx.save();
  ctx.globalAlpha *= api.fade(t, 0, 0.8);
  api.text('Hàm số liên tục là gì?', 125, 150, { size: 80, weight: 'bold' });
  ctx.restore();
  api.formula('\\lim_{x \\to a} f(x) = f(a)', 140, 225, { size: 108 });
  api.text('Giới hạn và giá trị tại điểm', 145, 420, { size: 38, color: colors.muted });
  const graph = { x: 740, y: 320, width: 980, height: 650, xMin: -4.3, xMax: 5.5, yMin: -2.1, yMax: 4.4 };
  api.axes({ ...graph, labels: false, color: colors.line, lineWidth: 4 });
  api.plot((x) => 1.8 * Math.sin(x / 2.2) + 0.4, { ...graph, progress: api.fade(t, 1, 3), color: colors.structure, lineWidth: 8 });
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = incoming;
  api.text('Điều kiện liên tục', 150, 205, { size: 76, weight: 'bold' });
  api.text('Giá trị của hàm tại điểm bằng giới hạn', 155, 320, { size: 42, color: colors.muted });
  api.formula('\\lim_{x \\to a} f(x) = f(a)', 230, 420, { size: 140 });
  api.formula('f(x)=f(a)\\quad \\text{nếu}\\quad x=a', 230, 680, { size: 120 });
  ctx.restore();
}
