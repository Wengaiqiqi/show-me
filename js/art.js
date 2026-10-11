// 生成画框里的画面：没有截图的项目用一幅按项目名“播种”的抽象画。

function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function abstractPainting(project, w = 1024, h = 640) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const r = rng(project.id);
  const [a, b, light, dark] = project.palette;

  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, dark);
  bg.addColorStop(1, a);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // 大色块
  for (let i = 0; i < 7; i++) {
    g.globalAlpha = 0.25 + r() * 0.5;
    g.fillStyle = [a, b, light][i % 3];
    const x = r() * w, y = r() * h, s = 80 + r() * 320;
    if (r() > 0.5) {
      g.beginPath();
      g.arc(x, y, s / 2, 0, Math.PI * 2);
      g.fill();
    } else {
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI);
      g.fillRect(-s / 2, -s / 6, s, s / 3);
      g.restore();
    }
  }
  // 线条
  g.globalAlpha = 0.8;
  g.strokeStyle = light;
  for (let i = 0; i < 5; i++) {
    g.lineWidth = 2 + r() * 8;
    g.beginPath();
    g.moveTo(r() * w, r() * h);
    g.bezierCurveTo(r() * w, r() * h, r() * w, r() * h, r() * w, r() * h);
    g.stroke();
  }
  // 颗粒
  g.globalAlpha = 0.07;
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = r() > 0.5 ? '#fff' : '#000';
    g.fillRect(r() * w, r() * h, 2, 2);
  }
  g.globalAlpha = 1;

  // 标题
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, h - 170, w, 170);
  g.fillStyle = light;
  g.font = '700 76px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "WenQuanYi Zen Hei", sans-serif';
  g.fillText(project.title, 48, h - 80);
  g.font = '400 30px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "WenQuanYi Zen Hei", sans-serif';
  g.globalAlpha = 0.85;
  g.fillText(project.subtitle, 50, h - 34);
  g.globalAlpha = 1;
  return c;
}

export function plaque(project, index) {
  const w = 512, h = 192;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe6';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1c1917';
  g.font = '700 40px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "WenQuanYi Zen Hei", sans-serif';
  g.fillText(project.title, 28, 62);
  g.font = '400 22px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "WenQuanYi Zen Hei", sans-serif';
  g.fillStyle = '#57534e';
  g.fillText(project.music ? project.subtitle : project.tech.slice(0, 3).join(' · '), 30, 104);
  g.fillText(project.music ? '音乐作品  ·  走近按 E 查看' : `No.${String(index + 1).padStart(2, '0')}  ·  走近按 E 观看`, 30, 150);
  return c;
}

export function textPanel(lines, { w = 1024, h = 512, bg = '#111', fg = '#f5f5f4', size = 64 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 每行的字号和行距；整块文字在牌子上垂直居中，太长的行按宽度缩小，免得出框
  const rows = lines.map((t, i) => ({ t, px: i === 0 ? size : size * 0.45, weight: i === 0 ? 700 : 400 }));
  const font = (r) => `${r.weight} ${r.px}px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "WenQuanYi Zen Hei", sans-serif`;
  for (const r of rows) {
    g.font = font(r);
    r.px *= Math.min(1, (w * 0.9) / g.measureText(r.t).width);
  }
  const lh = (r) => r.px * 1.25;
  let y = (h - rows.reduce((sum, r) => sum + lh(r), 0)) / 2;
  for (const r of rows) {
    g.font = font(r);
    g.fillText(r.t, w / 2, y + lh(r) / 2);
    y += lh(r);
  }
  return c;
}
