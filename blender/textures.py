"""展馆用到的贴图，全部用代码生成（无外部素材）。

被 build_gallery.py 调用，也可以单独运行：python blender/textures.py <输出目录>
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def _rng(seed):
    return np.random.default_rng(seed)


def noise(size, cells, seed, octaves=4, aspect=(1, 1)):
    """可平铺的分形噪声，返回 0..1 的 size×size 数组。aspect 用来拉长纹理（木纹）。"""
    r = _rng(seed)
    out = np.zeros((size, size), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cx = max(1, int(cells * aspect[0] * 2**o))
        cy = max(1, int(cells * aspect[1] * 2**o))
        g = r.random((cy, cx)).astype(np.float32)
        big = np.tile(g, (3, 3))
        img = Image.fromarray(big).resize((size * 3, size * 3), Image.BICUBIC)
        a = np.asarray(img)[size:2 * size, size:2 * size]
        out += a * amp
        total += amp
        amp *= 0.5
    out /= total
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def _save(arr, path, quality=86):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    img.save(path, quality=quality, optimize=True)


def marble_checker(path, size=1024):
    """2×2 块大理石棋盘格：奶白 + 墨绿灰，带纹理和细缝。"""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    n = noise(size, 3, 1, 5)
    n2 = noise(size, 6, 2, 4)
    veins = np.abs(np.sin((xx * 3 + yy * 5 + n * 6) * math.pi)) ** 0.25
    fine = np.abs(np.sin((xx * 9 - yy * 4 + n2 * 8) * math.pi)) ** 0.15
    v = np.minimum(veins, 0.6 + 0.4 * fine)
    half = size // 2
    light = (yy * size // half + xx * size // half) % 2 == 0
    cream = np.array([238, 230, 215], np.float32)
    dark = np.array([58, 64, 62], np.float32)
    out = np.where(light[..., None], cream * (0.86 + 0.14 * v[..., None]) - (1 - v[..., None]) * 40,
                   dark * (0.8 + 0.25 * n[..., None]) + (1 - v[..., None]) * 70)
    grout = (np.mod(xx * size, half) < 2) | (np.mod(yy * size, half) < 2)
    out[grout] = out[grout] * 0.55
    _save(out, path)


def chevron_parquet(path, size=1024, cols=4, plank=64):
    """人字（chevron）拼花木地板。"""
    r = _rng(7)
    yy, xx = np.mgrid[0:size, 0:size]
    cw = size // cols
    col = xx // cw
    lx = xx % cw
    d = np.where(col % 2 == 0, 1, -1)
    n_str = size // plank
    stripe = ((yy + d * lx) // plank) % n_str
    tones = r.uniform(0.78, 1.12, (cols, n_str))
    t = tones[col, stripe]
    base = np.array([150, 98, 58], np.float32)
    grain = noise(size, 24, 8, 3)
    out = base * t[..., None] * (0.85 + 0.3 * grain[..., None])
    edge = ((yy + d * lx) % plank < 2) | (lx < 2)
    out[edge] *= 0.55
    _save(out, path)


def wood_planks(path, size=1024, rows=8):
    """长廊的长条木地板，错缝排列。"""
    r = _rng(11)
    rh = size // rows
    out = np.zeros((size, size, 3), np.float32)
    grain = noise(size, 4, 12, 4, aspect=(0.15, 3))
    base = np.array([122, 82, 50], np.float32)
    for row in range(rows):
        cuts = sorted(r.choice(np.arange(64, size - 64, 32), 2, replace=False))
        cuts = [0] + list(cuts) + [size]
        y0, y1 = row * rh, (row + 1) * rh
        for k in range(len(cuts) - 1):
            tone = r.uniform(0.8, 1.15)
            out[y0:y1, cuts[k]:cuts[k + 1]] = base * tone
        for c in cuts[1:-1]:
            out[y0:y1, c:c + 2] *= 0.5
        out[y0:y0 + 2] *= 0.5
    out *= (0.82 + 0.35 * grain[..., None])
    _save(out, path)


def damask(path, size=512, base=(112, 34, 46)):
    """酒红色锦缎壁纸：菱形格 + 花饰。"""
    s = size * 2
    img = Image.new('RGB', (s, s), base)
    g = ImageDraw.Draw(img)
    hi = tuple(int(c * 1.28) for c in base)
    lo = tuple(int(c * 0.82) for c in base)
    # 菱形格
    for k in range(-2, 3):
        g.line([(k * s // 2, 0), (k * s // 2 + s, s)], fill=lo, width=6)
        g.line([(k * s // 2 + s, 0), (k * s // 2, s)], fill=lo, width=6)

    def motif(cx, cy, rad):
        pts = []
        for i in range(181):
            a = i / 180 * 2 * math.pi
            rr = rad * (0.55 + 0.45 * abs(math.cos(2 * a))) * (0.85 + 0.15 * math.cos(8 * a))
            pts.append((cx + rr * math.sin(a), cy - rr * math.cos(a) * 1.25))
        g.polygon(pts, fill=hi)
        g.ellipse([cx - rad * 0.16, cy - rad * 0.16, cx + rad * 0.16, cy + rad * 0.16], fill=lo)

    for cx, cy in [(0, 0), (s, 0), (0, s), (s, s), (s // 2, s // 2)]:
        motif(cx, cy, s * 0.2)
    img = img.filter(ImageFilter.GaussianBlur(1.2)).resize((size, size), Image.LANCZOS)
    arr = np.asarray(img).astype(np.float32)
    arr *= (0.93 + 0.12 * noise(size, 32, 3, 2)[..., None])
    _save(arr, path)


def medallion(path, size=1024, marble='marble_checker.jpg', center=(0.0, -11.0), extent=8.4, tile=1.6):
    """中庭地面中心的大理石拼花罗盘。

    贴图铺在以 center 为中心、extent 见方的地面上；圆外的四个角用和周围地面对齐的棋盘格大理石填上，
    这样接缝看不出来（参数要和 build_gallery.py 里的 DECALS / 大理石 tile 一致）。"""
    s = size * 2
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    g = ImageDraw.Draw(img)
    c = s / 2
    cream, black, rust, gold, green = (236, 228, 212), (40, 38, 36), (150, 62, 38), (190, 150, 82), (52, 82, 70)

    def ring(r0, col):
        g.ellipse([c - r0, c - r0, c + r0, c + r0], fill=col)

    ring(c * 0.999, black)
    ring(c * 0.95, cream)
    # 外圈的锯齿带
    n = 64
    for i in range(n):
        a0, a1 = i / n * 2 * math.pi, (i + 1) / n * 2 * math.pi
        col = rust if i % 2 else green
        pts = [(c + c * 0.95 * math.cos(a0), c + c * 0.95 * math.sin(a0)),
               (c + c * 0.95 * math.cos(a1), c + c * 0.95 * math.sin(a1)),
               (c + c * 0.83 * math.cos((a0 + a1) / 2), c + c * 0.83 * math.sin((a0 + a1) / 2))]
        g.polygon(pts, fill=col)
    ring(c * 0.8, black)
    ring(c * 0.77, cream)

    def star(points, r_out, r_in, col, rot=0):
        pts = []
        for i in range(points * 2):
            a = rot + i / (points * 2) * 2 * math.pi - math.pi / 2
            rr = r_out if i % 2 == 0 else r_in
            pts.append((c + rr * math.cos(a), c + rr * math.sin(a)))
        g.polygon(pts, fill=col)

    star(16, c * 0.74, c * 0.3, gold, math.pi / 16)
    star(8, c * 0.74, c * 0.22, black)
    star(4, c * 0.74, c * 0.16, rust)
    ring(c * 0.16, cream)
    ring(c * 0.11, green)
    ring(c * 0.05, gold)
    img = img.resize((size, size), Image.LANCZOS)
    rgba = np.asarray(img).astype(np.float32)
    arr = rgba[..., :3] * (0.9 + 0.15 * noise(size, 8, 5, 3)[..., None])
    alpha = rgba[..., 3:] / 255

    # 圆外：按世界坐标从棋盘格大理石里取色
    mpath = os.path.join(os.path.dirname(path), marble)
    if not os.path.exists(mpath):
        marble_checker(mpath)
    m = np.asarray(Image.open(mpath).convert('RGB')).astype(np.float32)
    mh, mw = m.shape[:2]
    row, col = np.mgrid[0:size, 0:size].astype(np.float32) + 0.5
    x = (col / size - 0.5) * extent + center[0]
    z = center[1] - ((1 - row / size) - 0.5) * extent
    mu, mv = np.mod(x / tile, 1.0), np.mod(-z / tile, 1.0)
    bg = m[np.clip(((1 - mv) * mh).astype(int), 0, mh - 1), np.clip((mu * mw).astype(int), 0, mw - 1)]
    _save(arr * alpha + bg * (1 - alpha), path)


def rug(path, w=1024, h=640):
    """大堂地毯：深红底、金色边框、中间菱形纹样。"""
    img = Image.new('RGB', (w, h), (118, 26, 30))
    g = ImageDraw.Draw(img)
    gold, navy, cream = (196, 156, 84), (28, 34, 60), (226, 210, 180)
    g.rectangle([18, 18, w - 18, h - 18], outline=gold, width=10)
    g.rectangle([46, 46, w - 46, h - 46], fill=navy)
    g.rectangle([70, 70, w - 70, h - 70], fill=(118, 26, 30))
    for k in range(8):
        x = 70 + k * (w - 140) / 8
        g.polygon([(x, 58), (x + (w - 140) / 16, 50), (x + (w - 140) / 8, 58), (x + (w - 140) / 16, 66)], fill=gold)
        g.polygon([(x, h - 58), (x + (w - 140) / 16, h - 50), (x + (w - 140) / 8, h - 58), (x + (w - 140) / 16, h - 66)], fill=gold)
    cx, cy = w / 2, h / 2
    for r_, col in [(220, gold), (196, navy), (150, cream), (120, (118, 26, 30)), (70, gold)]:
        g.polygon([(cx - r_ * 1.6, cy), (cx, cy - r_), (cx + r_ * 1.6, cy), (cx, cy + r_)], fill=col)
    # 地毯在大堂里是纵向铺的，转成竖图
    img = img.filter(ImageFilter.GaussianBlur(0.8)).transpose(Image.ROTATE_90)
    arr = np.asarray(img).astype(np.float32)
    fib = noise(512, 64, 9, 2)
    fib = np.asarray(Image.fromarray(fib).resize((h, w)))
    arr *= (0.88 + 0.2 * fib[..., None])
    _save(arr, path)


ALL = {
    'marble_checker.jpg': marble_checker,
    'chevron.jpg': chevron_parquet,
    'planks.jpg': wood_planks,
    'damask.jpg': damask,
    'medallion.jpg': medallion,
    'rug.jpg': rug,
}


def build_all(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    paths = {}
    for name, fn in ALL.items():
        p = os.path.join(out_dir, name)
        fn(p)
        paths[name] = p
    return paths


if __name__ == '__main__':
    print(build_all(sys.argv[1] if len(sys.argv) > 1 else 'textures'))
