"""用 Blender 生成「作品馆」展馆模型，烘焙光照，导出给网页使用。

运行方式（任选其一）：
  blender -b -P blender/build_gallery.py          # 命令行无界面
  python blender/build_gallery.py                 # 装了 bpy 模块的 Python（pip install bpy）
  在 Blender 的 Scripting 面板打开本文件点「运行」   # 想在 Blender 里看 / 改模型时用

环境变量：
  BAKE=0        不烘焙光照（只想看场景时更快；在 Blender 界面里运行默认不烘焙、不导出）
  EXPORT=1      在 Blender 界面里运行时也导出到 assets/
  LM_SIZE=2048  光照贴图分辨率
  SAMPLES=256   烘焙采样数
  SAVE_BLEND=1  另存一份 blender/gallery.blend 方便手动编辑

输出（都在 assets/ 下）：
  gallery.glb           展馆模型（墙、地面、柱子、长椅…，画框和画由网页生成）
  gallery-light.jpg     烘焙好的光照贴图（第二套 UV）
  gallery.json          画位、灯位、可行走区域、障碍物、出生点等布局数据

所有坐标都按网页（Three.js）坐标书写：x 向右、y 向上、z 朝向入口；导出时换算成 Blender 的 Z 轴向上。
"""
import json
import math
import os
import sys
import time
from contextlib import contextmanager

import bpy  # noqa: I001  先导入 bpy，pip 版 bpy 才会提供 bmesh / mathutils
import bmesh
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
sys.path.insert(0, HERE)

# 在 Blender 界面里运行时只把场景搭出来给你看 / 改，不烘焙也不覆盖网站文件
INTERACTIVE = not bpy.app.background
BAKE = os.environ.get('BAKE', '0' if INTERACTIVE else '1') != '0'
EXPORT = os.environ.get('EXPORT', '0' if INTERACTIVE else '1') != '0'
LM_SIZE = int(os.environ.get('LM_SIZE', 2048))
SAMPLES = int(os.environ.get('SAMPLES', 256))
TEX_DIR = os.path.join(HERE, 'textures')

T = 0.2  # 每个房间自己那一侧墙的厚度（相邻房间之间总共 0.4m）


def B(x, y, z):
    """网页坐标 → Blender 坐标"""
    return Vector((x, -z, y))


def W(v):
    """Blender 坐标 → 网页坐标"""
    return (v.x, v.z, -v.y)


# ------------------------------------------------------------------ 场景
def reset():
    if INTERACTIVE:
        # 不清空你当前打开的文件，新建一个场景放展馆
        sc = bpy.data.scenes.new('作品馆')
        bpy.context.window.scene = sc
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 0
    sc.cycles.sample_clamp_indirect = 6
    world = bpy.data.worlds.new('Sky')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.62, 0.76, 1.0, 1)
    bg.inputs['Strength'].default_value = 2.2


# ------------------------------------------------------------------ 材质
MATS = {}
TEX = {}


def hexcol(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def material(name, color='#ffffff', rough=0.7, metal=0.0, tex=None, tile=1.0, emit=None, emit_strength=1.0, spec=0.5):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = hexcol(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in p.inputs:
        p.inputs['Specular IOR Level'].default_value = spec
    if tex:
        img = bpy.data.images.load(TEX[tex], check_existing=True)
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UV0'
        nt.links.new(uv.outputs['UV'], n.inputs['Vector'])
        nt.links.new(n.outputs['Color'], p.inputs['Base Color'])
    if emit:
        p.inputs['Emission Color'].default_value = hexcol(emit)
        p.inputs['Emission Strength'].default_value = emit_strength
    m['tile'] = tile
    MATS[name] = m
    return m


def define_materials():
    material('marble', '#ffffff', 0.18, tex='marble_checker.jpg', tile=1.6, spec=0.6)
    material('medallion', '#ffffff', 0.2, tex='medallion.jpg', tile=8.4, spec=0.6)
    material('chevron', '#ffffff', 0.38, tex='chevron.jpg', tile=1.4)
    material('planks', '#ffffff', 0.42, tex='planks.jpg', tile=1.8)
    material('rug', '#ffffff', 0.95, tex='rug.jpg', tile=1.0, spec=0.1)
    material('damask', '#ffffff', 0.85, tex='damask.jpg', tile=0.9, spec=0.2)
    material('plaster_cream', '#e9dcc5', 0.92, spec=0.2)
    material('plaster_stone', '#d6c4a4', 0.85, spec=0.2)
    material('plaster_light', '#efe7d8', 0.92, spec=0.2)
    material('plaster_green', '#2c4a40', 0.9, spec=0.2)
    material('plaster_grey', '#c9bcaa', 0.9, spec=0.2)
    material('ceiling', '#f6f3ee', 0.95, spec=0.1)
    material('trim_white', '#f4efe6', 0.5)
    material('walnut', '#4a2e1c', 0.45)
    material('dark_marble', '#2b2a28', 0.25, spec=0.6)
    material('white_marble', '#ece6dc', 0.3, spec=0.6)
    material('stone', '#cdbb9b', 0.7)
    material('brass', '#b8914f', 0.3, 0.9)
    material('black_metal', '#1c1b1a', 0.4, 0.6)
    material('leather', '#5a2a1e', 0.55)
    material('velvet', '#7a1020', 0.9, spec=0.1)
    material('terracotta', '#8f4a2c', 0.8)
    material('leaf', '#2f5a2a', 0.65)
    material('leaf_light', '#4f7d38', 0.65)
    material('bronze', '#6d4a2a', 0.35, 0.8)
    # 不参与烘焙的发光件
    material('glow_sky', '#000000', 1.0, emit='#dbe9f7', emit_strength=1.6)
    material('glow_laylight', '#000000', 1.0, emit='#fff6e6', emit_strength=1.4)
    material('glow_bulb', '#000000', 1.0, emit='#ffe2b0', emit_strength=3.0)
    material('glow_daylight', '#000000', 1.0, emit='#eaf2fb', emit_strength=1.8)
    material('glow_red', '#000000', 1.0, emit='#ff2a2a', emit_strength=4.0)


# ------------------------------------------------------------------ 网格
# 参与烘焙的几何分两层，各自一张光照贴图：
#   arch    墙、地面、顶棚、柱子等大面，贴图精度高
#   detail  线脚、家具、植物等小件，岛多面积小，单独一张避免挤占大面的精度
BAKED = {'arch': [], 'detail': []}
UNBAKED = []   # 发光件，单独导出
LIGHTS = []


class Mesh:
    """在一个 bmesh 里累积同一材质的几何体。"""

    def __init__(self):
        self.bm = bmesh.new()

    def quad(self, pts, normal):
        vs = [self.bm.verts.new(B(*p)) for p in pts]
        a, b, c = (v.co for v in vs[:3])
        n = (b - a).cross(c - a)
        if n.dot(B(*normal)) < 0:
            vs.reverse()
        self.bm.faces.new(vs)

    def box(self, x0, x1, y0, y1, z0, z1, keep='+x-x+y-y+z-z'):
        if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
            return
        if '+x' in keep:
            self.quad([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0))
        if '-x' in keep:
            self.quad([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0))
        if '+y' in keep:
            self.quad([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0))
        if '-y' in keep:
            self.quad([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0))
        if '+z' in keep:
            self.quad([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1))
        if '-z' in keep:
            self.quad([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1))

    def floor(self, x0, x1, z0, z1, y=0.0, down=False):
        self.quad([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], (0, -1 if down else 1, 0))

    def cyl(self, x, y0, y1, z, r0, r1=None, seg=24, caps=True):
        r1 = r0 if r1 is None else r1
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, segments=seg, radius1=r0, radius2=r1, depth=y1 - y0)
        bmesh.ops.translate(self.bm, verts=res['verts'], vec=B(x, (y0 + y1) / 2, z))
        for f in {f for v in res['verts'] for f in v.link_faces}:
            f.smooth = len(f.verts) == 4

    def tube(self, a, b, r, seg=10):
        a, b = B(*a), B(*b)
        d = b - a
        res = bmesh.ops.create_cone(self.bm, cap_ends=False, segments=seg, radius1=r, radius2=r, depth=d.length)
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.transform(self.bm, verts=res['verts'], matrix=Matrix.Translation((a + b) / 2) @ rot)
        for f in {f for v in res['verts'] for f in v.link_faces}:
            f.smooth = True

    def sphere(self, x, y, z, r, sub=2, scale=(1, 1, 1)):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r)
        bmesh.ops.scale(self.bm, verts=res['verts'], vec=(scale[0], scale[2], scale[1]))
        bmesh.ops.translate(self.bm, verts=res['verts'], vec=B(x, y, z))
        for f in {f for v in res['verts'] for f in v.link_faces}:
            f.smooth = True


GEO = {}
LAYER = ['detail']
DECALS = {}  # 材质名 → (cx, cz, sx, sz)，只铺一次的地面贴图


@contextmanager
def arch():
    LAYER.append('arch')
    try:
        yield
    finally:
        LAYER.pop()


def geo(mat_name, baked=True):
    key = (mat_name, LAYER[-1] if baked else 'emit')
    if key not in GEO:
        GEO[key] = Mesh()
    return GEO[key]


def ageo(mat_name):
    """大面几何（墙、地、顶、柱）用的 geo。"""
    with arch():
        return geo(mat_name)


def project_uv(bm, tile, decal=None, lightmap=True):
    """按世界坐标做立方体投影，让平铺贴图在所有墙 / 地面上保持真实尺寸。
    decal=(cx, cz, sx, sz) 时整张贴图只铺一次，正好盖住以 (cx, cz) 为中心、sx × sz 的地面（地毯、拼花）。"""
    uv0 = bm.loops.layers.uv.new('UV0')
    if lightmap:
        bm.loops.layers.uv.new('UV1')
    for f in bm.faces:
        n = W(f.normal)
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            x, y, z = W(loop.vert.co)
            if ax == 1:
                u, v = x, -z
            elif ax == 0:
                u, v = (-z if n[0] > 0 else z), y
            else:
                u, v = (x if n[2] > 0 else -x), y
            if decal:
                cx, cz, sx, sz = decal
                loop[uv0].uv = ((x - cx) / sx + 0.5, -(z - cz) / sz + 0.5)
            else:
                loop[uv0].uv = (u / tile, v / tile)


def finalize_meshes():
    for (mat_name, layer), m in GEO.items():
        bm = m.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        mt = MATS[mat_name]
        project_uv(bm, mt['tile'], DECALS.get(mat_name), layer != 'emit')
        me = bpy.data.meshes.new(mat_name)
        bm.to_mesh(me)
        bm.free()
        if layer == 'detail':
            # 两层各自烘焙到不同贴图，材质不能共用
            mt = bpy.data.materials.get(mat_name + '.d') or mt.copy()
            mt.name = mat_name + '.d'
        me.materials.append(mt)
        ob = bpy.data.objects.new(f'{layer}_{mat_name}', me)
        bpy.context.scene.collection.objects.link(ob)
        (UNBAKED if layer == 'emit' else BAKED[layer]).append(ob)


# ------------------------------------------------------------------ 平面图
ROOMS = {
    'lobby': dict(x0=-8, x1=8, z0=0.4, z1=10.4, h=7.0),
    'atrium': dict(x0=-11, x1=11, z0=-22, z1=0, h=11.0),
    'west': dict(x0=-29, x1=-11.4, z0=-19, z1=-3, h=6.5),
    'east': dict(x0=11.4, x1=29, z0=-19, z1=-3, h=6.5),
    'grand': dict(x0=-7, x1=7, z0=-48.4, z1=-22.4, h=8.0),
}
for _k, _r in ROOMS.items():
    _r['name'] = _k
    _r['cx'] = (_r['x0'] + _r['x1']) / 2
    _r['cz'] = (_r['z0'] + _r['z1']) / 2

DOOR_H = 4.6
DOORS = [
    dict(a=('lobby', '-z'), b=('atrium', '+z'), c=0.0, w=5.0, h=DOOR_H),
    dict(a=('atrium', '-x'), b=('west', '+x'), c=-11.0, w=5.0, h=DOOR_H),
    dict(a=('atrium', '+x'), b=('east', '-x'), c=-11.0, w=5.0, h=DOOR_H),
    dict(a=('atrium', '-z'), b=('grand', '+z'), c=0.0, w=5.0, h=DOOR_H),
    dict(a=('lobby', '+z'), b=None, c=0.0, w=4.0, h=3.8, entrance=True),
]


def openings(room, side):
    out = []
    for d in DOORS:
        for end in ('a', 'b'):
            if d[end] == (room, side):
                out.append(d)
    return out


def side_frame(r, side):
    """返回 (沿墙方向的范围, 一个把 (沿墙坐标 s, 高度 y, 离墙深度 d) 换成网页坐标的函数, 朝房间内的法线)。"""
    if side in ('-z', '+z'):
        lo, hi = r['x0'], r['x1']
        zw = r['z0'] if side == '-z' else r['z1']
        sgn = 1 if side == '-z' else -1
        return lo, hi, (lambda s, y, d: (s, y, zw + sgn * d)), (0, 0, sgn)
    lo, hi = r['z0'], r['z1']
    xw = r['x0'] if side == '-x' else r['x1']
    sgn = 1 if side == '-x' else -1
    return lo, hi, (lambda s, y, d: (xw + sgn * d, y, s)), (sgn, 0, 0)


def wbox(mesh, r, side, s0, s1, y0, y1, d0, d1, keep=('in', 'out', 'top', 'bottom', 's', 'e')):
    """按「墙的局部坐标」放一个盒子：s 沿墙，y 高度，d 离墙面的深度（正数朝房间里）。"""
    lo, hi, P, n = side_frame(r, side)
    a, b = P(s0, y0, d0), P(s1, y1, d1)
    x0, x1 = sorted((a[0], b[0]))
    z0, z1 = sorted((a[2], b[2]))
    m = {}
    if side in ('-z', '+z'):
        inward = '+z' if side == '-z' else '-z'
        m = {'in': inward, 'out': '-z' if inward == '+z' else '+z', 's': '-x', 'e': '+x'}
    else:
        inward = '+x' if side == '-x' else '-x'
        m = {'in': inward, 'out': '-x' if inward == '+x' else '+x', 's': '-z', 'e': '+z'}
    m['top'], m['bottom'] = '+y', '-y'
    mesh.box(x0, x1, y0, y1, z0, z1, ''.join(m[k] for k in keep))


def intervals(lo, hi, holes):
    """[lo,hi] 去掉若干 (a,b) 区间后剩下的实心段。"""
    segs, cur = [], lo
    for a, b in sorted(holes):
        if a > cur:
            segs.append((cur, a))
        cur = max(cur, b)
    if cur < hi:
        segs.append((cur, hi))
    return segs


ARCH = 0.24  # 门套宽度


def build_wall(r, side, bands, trims):
    """bands: [(y0, y1, 材质)] 从下到上的墙面分段；trims: 墙脚线 / 护墙板等装饰配置。"""
    lo, hi, P, n = side_frame(r, side)
    ops = openings(r['name'], side)
    holes = [(d['c'] - d['w'] / 2, d['c'] + d['w'] / 2) for d in ops]
    for (y0, y1, mat) in bands:
        with arch():
            mesh = geo(mat)
        cut = [(a, b) for (a, b), d in zip(holes, ops) if d['h'] > y0]
        for s0, s1 in intervals(lo - T, hi + T, cut):
            keep = ['in']
            if any(abs(s0 - b) < 1e-6 for _, b in cut):
                keep.append('s')
            if any(abs(s1 - a) < 1e-6 for a, _ in cut):
                keep.append('e')
            wbox(mesh, r, side, s0, s1, y0, y1, -T, 0, keep)
        for (a, b), d in zip(holes, ops):
            if d['h'] > y0 and d['h'] < y1:
                wbox(mesh, r, side, a, b, d['h'], y1, -T, 0, ('in', 'bottom'))
    # 门洞处的门槛（地面）
    for (a, b), d in zip(holes, ops):
        wbox(geo('dark_marble'), r, side, a, b, -0.02, 0.0, -T, 0, ('top',))

    # 装饰线条：门套两侧留出空间
    trim_holes = [(a - ARCH, b + ARCH) for a, b in holes]
    segs = intervals(lo, hi, trim_holes)
    H = r['h']
    for s0, s1 in segs:
        wbox(geo(trims.get('base', 'walnut')), r, side, s0, s1, 0, 0.2, 0, 0.03, ('in', 'top', 's', 'e'))
        if trims.get('dado'):
            wbox(geo(trims['dado']), r, side, s0, s1, 0.2, 1.05, 0, 0.015, ('in', 's', 'e'))
            wbox(geo(trims.get('rail', 'walnut')), r, side, s0, s1, 1.05, 1.13, 0, 0.05, ('in', 'top', 'bottom', 's', 'e'))
            # 护墙板上的方框线
            k = max(1, int((s1 - s0) / 1.3))
            step = (s1 - s0) / k
            for i in range(k):
                a, b = s0 + i * step + 0.12, s0 + (i + 1) * step - 0.12
                for (ya, yb) in ((0.34, 0.38), (0.88, 0.92)):
                    wbox(geo(trims.get('rail', 'walnut')), r, side, a, b, ya, yb, 0.015, 0.035, ('in', 'top', 'bottom', 's', 'e'))
                for sa in (a, b - 0.04):
                    wbox(geo(trims.get('rail', 'walnut')), r, side, sa, sa + 0.04, 0.38, 0.88, 0.015, 0.035, ('in', 's', 'e'))
        if trims.get('picture'):
            wbox(geo('brass'), r, side, s0, s1, H - 0.95, H - 0.92, 0, 0.03, ('in', 'top', 'bottom'))
    # 顶角线（整面墙连续）
    if not trims.get('no_crown'):
        cm = trims.get('crown', 'trim_white')
        wbox(geo(cm), r, side, lo, hi, H - 0.32, H - 0.16, 0, 0.08, ('in', 'bottom'))
        wbox(geo(cm), r, side, lo, hi, H - 0.16, H, 0, 0.17, ('in', 'bottom'))
    # 门套 + 门楣
    for d in ops:
        a, b = d['c'] - d['w'] / 2, d['c'] + d['w'] / 2
        am = trims.get('arch', 'trim_white')
        wbox(geo(am), r, side, a - ARCH, a, 0, d['h'] + ARCH, 0, 0.07, ('in', 'top', 's', 'e'))
        wbox(geo(am), r, side, b, b + ARCH, 0, d['h'] + ARCH, 0, 0.07, ('in', 'top', 's', 'e'))
        wbox(geo(am), r, side, a, b, d['h'], d['h'] + ARCH, 0, 0.07, ('in', 'bottom', 'top'))
        if d['h'] + 0.6 < H - 0.4:
            wbox(geo(am), r, side, a - ARCH - 0.12, b + ARCH + 0.12, d['h'] + ARCH, d['h'] + ARCH + 0.16, 0, 0.16, ('in', 'top', 'bottom', 's', 'e'))
            wbox(geo(am), r, side, a - ARCH - 0.06, b + ARCH + 0.06, d['h'] + ARCH + 0.16, d['h'] + ARCH + 0.22, 0, 0.1, ('in', 'top', 's', 'e'))


def build_ceiling(r, mat='ceiling', holes=()):
    """顶棚（朝下的面），holes 里的矩形留空给天窗 / 灯箱。"""
    m = ageo(mat)
    x0, x1, z0, z1, y = r['x0'], r['x1'], r['z0'], r['z1'], r['h']
    if not holes:
        m.floor(x0, x1, z0, z1, y, down=True)
        return
    (hx0, hx1, hz0, hz1), = holes
    m.floor(x0, x1, z0, hz0, y, down=True)
    m.floor(x0, x1, hz1, z1, y, down=True)
    m.floor(x0, hx0, hz0, hz1, y, down=True)
    m.floor(hx1, x1, hz0, hz1, y, down=True)


def light_well(x0, x1, z0, z1, y0, depth, mat='ceiling'):
    """顶棚开口往上的一圈侧壁。"""
    m = ageo(mat)
    m.box(x0 - 0.01, x1 + 0.01, y0, y0 + depth, z0 - 0.2, z0, '+z')
    m.box(x0 - 0.01, x1 + 0.01, y0, y0 + depth, z1, z1 + 0.2, '-z')
    m.box(x0 - 0.2, x0, y0, y0 + depth, z0, z1, '+x')
    m.box(x1, x1 + 0.2, y0, y0 + depth, z0, z1, '-x')


def area_light(name, x, y, z, sx, sz, power, color=(1.0, 0.96, 0.9), up=False):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = 'RECTANGLE'
    ld.size, ld.size_y = sx, sz
    ld.energy = power
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    ob.location = B(x, y, z)
    if up:
        ob.rotation_euler = (math.pi, 0, 0)
    bpy.context.scene.collection.objects.link(ob)
    LIGHTS.append(ob)


def cove_lights(r, power):
    """顶角线后面朝上打的暗藏灯带，把顶棚洗亮，不然顶棚只有地板反上去的暖色光。"""
    y = r['h'] - 0.4
    lx, lz = r['x1'] - r['x0'] - 0.8, r['z1'] - r['z0'] - 0.8
    area_light(f"Cove_{r['name']}_n", r['cx'], y, r['z0'] + 0.3, lx, 0.2, power * lx / 10, up=True)
    area_light(f"Cove_{r['name']}_s", r['cx'], y, r['z1'] - 0.3, lx, 0.2, power * lx / 10, up=True)
    area_light(f"Cove_{r['name']}_w", r['x0'] + 0.3, y, r['cz'], 0.2, lz, power * lz / 10, up=True)
    area_light(f"Cove_{r['name']}_e", r['x1'] - 0.3, y, r['cz'], 0.2, lz, power * lz / 10, up=True)


def point_light(name, x, y, z, power, radius=0.2, color=(1.0, 0.85, 0.65)):
    ld = bpy.data.lights.new(name, 'POINT')
    ld.energy = power
    ld.color = color
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld)
    ob.location = B(x, y, z)
    bpy.context.scene.collection.objects.link(ob)
    LIGHTS.append(ob)


def sun(elev_deg, azim_deg, strength):
    ld = bpy.data.lights.new('Sun', 'SUN')
    ld.energy = strength
    ld.angle = math.radians(1.2)
    ld.color = (1.0, 0.93, 0.82)
    ob = bpy.data.objects.new('Sun', ld)
    ob.rotation_euler = (math.radians(90 - elev_deg), 0, math.radians(azim_deg))
    bpy.context.scene.collection.objects.link(ob)
    LIGHTS.append(ob)


# ------------------------------------------------------------------ 布局数据（给网页）
LAYOUT = dict(slots=[], sculptures=[], labels=[], obstacles=[], walkable=[], rooms=[])


def slot(room, side, s, y, w, h, tier=1):
    r = ROOMS[room]
    lo, hi, P, n = side_frame(r, side)
    pos = P(s, y, 0.06)
    spot = P(s, r['h'] - 0.25, 2.4)
    LAYOUT['slots'].append(dict(room=room, pos=pos, normal=n, w=w, h=h, spot=spot, tier=tier))
    if tier != 1:
        return
    # 顶棚上的轨道射灯外壳
    m = geo('black_metal')
    sx, sy, sz = P(s, r['h'], 2.4)
    if side in ('-z', '+z'):
        m.box(sx - 1.2, sx + 1.2, r['h'] - 0.05, r['h'], sz - 0.03, sz + 0.03, '-y+z-z+x-x')
    else:
        m.box(sx - 0.03, sx + 0.03, r['h'] - 0.05, r['h'], sz - 1.2, sz + 1.2, '-y+x-x+z-z')
    for o in (-0.6, 0.6):
        cx, cz = (sx + o, sz) if side in ('-z', '+z') else (sx, sz + o)
        m.cyl(cx, r['h'] - 0.22, r['h'] - 0.05, cz, 0.012, seg=6, caps=False)
        m.cyl(cx, r['h'] - 0.4, r['h'] - 0.22, cz, 0.07, 0.06, seg=12)


def label(id_, room, side, s, y, w, h):
    r = ROOMS[room]
    lo, hi, P, n = side_frame(r, side)
    LAYOUT['labels'].append(dict(id=id_, pos=P(s, y, 0.04), normal=n, w=w, h=h))
    # 文字牌的深色木框
    m = geo('walnut')
    wbox(m, r, side, s - w / 2 - 0.08, s + w / 2 + 0.08, y - h / 2 - 0.08, y + h / 2 + 0.08, 0, 0.03, ('in', 'top', 'bottom', 's', 'e'))


def obstacle_box(x0, x1, z0, z1):
    LAYOUT['obstacles'].append(dict(type='box', x0=x0, x1=x1, z0=z0, z1=z1))


def obstacle_circle(x, z, r):
    LAYOUT['obstacles'].append(dict(type='circle', x=x, z=z, r=r))


# ------------------------------------------------------------------ 家具 / 陈设
def bench(x, z, along='x', length=2.4):
    hw, hd = (length / 2, 0.3) if along == 'x' else (0.3, length / 2)
    w = geo('walnut')
    lth = geo('leather')
    lth.box(x - hw, x + hw, 0.36, 0.48, z - hd, z + hd, '+x-x+y+z-z')
    w.box(x - hw + 0.02, x + hw - 0.02, 0.3, 0.36, z - hd + 0.02, z + hd - 0.02, '+x-x-y+z-z')
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx = x + sx * (hw - 0.12)
            lz = z + sz * (hd - 0.08)
            geo('brass').box(lx - 0.03, lx + 0.03, 0, 0.3, lz - 0.03, lz + 0.03, '+x-x+z-z')
    obstacle_box(x - hw, x + hw, z - hd, z + hd)


def pedestal(x, z, w=0.7, h=1.1, sculpture=None):
    geo('white_marble').box(x - w / 2, x + w / 2, 0.08, h - 0.06, z - w / 2, z + w / 2, '+x-x+z-z')
    geo('dark_marble').box(x - w / 2 - 0.05, x + w / 2 + 0.05, 0, 0.08, z - w / 2 - 0.05, z + w / 2 + 0.05, '+x-x+y+z-z')
    geo('dark_marble').box(x - w / 2 - 0.04, x + w / 2 + 0.04, h - 0.06, h, z - w / 2 - 0.04, z + w / 2 + 0.04, '+x-x+y-y+z-z')
    obstacle_box(x - w / 2 - 0.05, x + w / 2 + 0.05, z - w / 2 - 0.05, z + w / 2 + 0.05)
    if sculpture:
        LAYOUT['sculptures'].append(dict(pos=(x, h, z), **sculpture))


def plant(x, z, seed=0, s=1.0):
    rng = np.random.default_rng(seed)
    geo('terracotta').cyl(x, 0, 0.62 * s, z, 0.27 * s, 0.36 * s, seg=16)
    geo('dark_marble').cyl(x, 0.6 * s, 0.66 * s, z, 0.38 * s, seg=16)
    geo('walnut').cyl(x, 0.62 * s, 1.6 * s, z, 0.03, 0.02, seg=6, caps=False)
    for i in range(14):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.05, 0.42) * s
        y = rng.uniform(1.0, 2.1) * s
        sz = rng.uniform(0.2, 0.32) * s
        geo('leaf' if i % 3 else 'leaf_light').sphere(x + rr * math.cos(a), y, z + rr * math.sin(a), sz, sub=1, scale=(1.0, 0.55, 1.3))
    obstacle_circle(x, z, 0.5 * s)


def bust(x, z, facing):
    pedestal(x, z, 0.55, 1.25)
    m = geo('white_marble')
    m.box(x - 0.22, x + 0.22, 1.25, 1.45, z - 0.13, z + 0.13, '+x-x+y+z-z')
    m.cyl(x, 1.25, 1.33, z, 0.2, seg=16)
    m.cyl(x, 1.42, 1.56, z, 0.07, seg=12, caps=False)
    m.sphere(x, 1.7, z + 0.02 * facing, 0.15, sub=2, scale=(0.85, 1.15, 1.0))
    m.box(x - 0.24, x + 0.24, 1.33, 1.5, z - 0.12, z + 0.12, '+x-x+y+z-z')


def stanchion_ring(cx, cz, radius, n=8):
    pts = []
    for i in range(n):
        a = i / n * 2 * math.pi + math.pi / n
        x, z = cx + radius * math.cos(a), cz + radius * math.sin(a)
        pts.append((x, z))
        geo('brass').cyl(x, 0, 0.03, z, 0.16, seg=16)
        geo('brass').cyl(x, 0.03, 0.92, z, 0.03, seg=10, caps=False)
        geo('brass').sphere(x, 0.95, z, 0.05, sub=1)
    for i in range(n):
        (x0, z0), (x1, z1) = pts[i], pts[(i + 1) % n]
        prev = None
        for k in range(9):
            t = k / 8
            y = 0.86 - 0.18 * math.sin(math.pi * t)
            p = (x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t)
            if prev:
                geo('velvet').tube(prev, p, 0.022, seg=8)
            prev = p


def column(x, z, h):
    geo('stone').box(x - 0.47, x + 0.47, 0, 0.22, z - 0.47, z + 0.47, '+x-x+y+z-z')
    geo('stone').cyl(x, 0.22, 0.36, z, 0.44, 0.4, seg=32)
    ageo('plaster_light').cyl(x, 0.36, h - 0.55, z, 0.36, 0.32, seg=32, caps=False)
    geo('stone').cyl(x, h - 0.55, h - 0.25, z, 0.32, 0.47, seg=32)
    geo('stone').box(x - 0.52, x + 0.52, h - 0.25, h, z - 0.52, z + 0.52, '+x-x-y+z-z')
    obstacle_circle(x, z, 0.5)


# ------------------------------------------------------------------ 各个房间
def build_lobby():
    r = ROOMS['lobby']
    trims = dict(dado='dark_marble', rail='trim_white', base='dark_marble')
    for side in ('-x', '+x', '-z', '+z'):
        build_wall(r, side, [(0, r['h'], 'plaster_cream')], trims)
    ageo('marble').floor(r['x0'], r['x1'], r['z0'], r['z1'])
    ageo('rug').floor(-2.0, 2.0, 2.2, 8.6, 0.006)
    DECALS['rug'] = (0.0, 5.4, 4.0, 6.4)
    # 藻井式天花：横竖梁
    build_ceiling(r)
    for x in np.arange(-6, 6.1, 2.0):
        ageo('trim_white').box(x - 0.13, x + 0.13, r['h'] - 0.36, r['h'], r['z0'], r['z1'], '+x-x-y')
    for z in np.arange(2.4, 9.5, 2.0):
        ageo('trim_white').box(r['x0'], r['x1'], r['h'] - 0.34, r['h'], z - 0.13, z + 0.13, '+z-z-y')
    # 吊灯
    for x in (-4.0, 4.0):
        z = 5.4
        geo('brass').cyl(x, 4.9, r['h'], z, 0.018, seg=8, caps=False)
        geo('brass').cyl(x, 4.75, 4.9, z, 0.12, 0.05, seg=16)
        geo('glow_bulb', baked=False).sphere(x, 4.4, z, 0.36, sub=3)
        point_light(f'Pendant{x}', x, 4.4, z, 900, 0.36)
    # 入口玻璃门（发光表示门外的日光）
    e = r['z1']
    geo('glow_daylight', baked=False).quad([(-2, 0, e + 0.12), (2, 0, e + 0.12), (2, 3.8, e + 0.12), (-2, 3.8, e + 0.12)], (0, 0, -1))
    fm = geo('black_metal')
    for x in (-2, -0.04, 1.96):
        fm.box(x, x + 0.08, 0, 3.8, e + 0.05, e + 0.12, '-z+x-x')
    fm.box(-2, 2, 2.9, 2.98, e + 0.05, e + 0.12, '-z+y-y')
    for x in (-0.25, 0.17):
        fm.box(x, x + 0.08, 1.0, 1.6, e - 0.02, e + 0.05, '-z+x-x+y-y')
    # 前台
    desk = geo('walnut')
    desk.box(5.2, 6.4, 0, 1.02, 3.2, 7.2, '+x-x+z-z')
    geo('white_marble').box(5.1, 6.5, 1.02, 1.1, 3.1, 7.3, '+x-x+y-y+z-z')
    geo('brass').box(5.18, 5.2, 0.15, 0.2, 3.2, 7.2, '-x')
    obstacle_box(5.1, 6.5, 3.1, 7.3)
    # 前台后面的展厅导览牌
    geo('black_metal').cyl(-5.6, 0, 0.04, 8.6, 0.25, seg=16)
    geo('black_metal').cyl(-5.6, 0.04, 1.2, 8.6, 0.025, seg=8, caps=False)
    geo('trim_white').box(-6.1, -5.1, 1.2, 1.9, 8.55, 8.62)
    obstacle_circle(-5.6, 8.6, 0.35)
    # 监控摄像头（致敬参考地图里入口上方的那台）
    cx, cy, cz = 6.4, 5.7, e
    geo('black_metal').box(cx - 0.05, cx + 0.05, cy - 0.05, cy + 0.05, cz - 0.35, cz, '+x-x+y-y-z')
    geo('trim_white').box(cx - 0.12, cx + 0.12, cy - 0.2, cy + 0.02, cz - 0.75, cz - 0.3)
    geo('black_metal').cyl(cx, cy - 0.12, cy - 0.06, cz - 0.78, 0.06, seg=12)
    geo('glow_red', baked=False).sphere(cx + 0.08, cy - 0.02, cz - 0.76, 0.012, sub=1)
    plant(-6.9, 9.5, 1)
    plant(6.9, 9.5, 2)
    plant(-6.9, 1.4, 3)
    bench(-6.6, 4.8, 'z', 2.2)
    label('title', 'lobby', '-z', 0, 5.95, 6.0, 1.1)
    label('thanks', 'lobby', '+z', 0, 5.4, 5.2, 1.1)


def build_atrium():
    r = ROOMS['atrium']
    cx, cz = r['cx'], r['cz']
    trims = dict(base='dark_marble', no_crown=False, crown='stone', arch='stone')
    for side in ('-x', '+x', '-z', '+z'):
        build_wall(r, side, [(0, 6.6, 'plaster_stone'), (6.6, r['h'], 'plaster_light')], trims)
        lo, hi, P, n = side_frame(r, side)
        mid = (lo + hi) / 2
        # 壁柱 + 一圈腰檐
        for o in (-9.4, -5.6, 5.6, 9.4):
            wbox(ageo('stone'), r, side, mid + o - 0.35, mid + o + 0.35, 0.2, 6.6, 0, 0.16, ('in', 's', 'e'))
        wbox(ageo('stone'), r, side, lo, hi, 6.6, 6.85, 0, 0.32, ('in', 'top', 'bottom'))
        wbox(ageo('stone'), r, side, lo, hi, 6.85, 7.0, 0, 0.42, ('in', 'top', 'bottom'))
    ageo('marble').floor(r['x0'], r['x1'], r['z0'], r['z1'])
    ageo('medallion').floor(cx - 4.2, cx + 4.2, cz - 4.2, cz + 4.2, 0.004)
    DECALS['medallion'] = (cx, cz, 8.4, 8.4)
    # 大天窗
    hole = (cx - 6, cx + 6, cz - 6, cz + 6)
    build_ceiling(r, holes=[hole])
    light_well(*hole, r['h'], 1.4)
    m = geo('trim_white')
    top = r['h'] + 1.4
    for k in range(9):
        t = -6 + k * 1.5
        m.box(cx - 6, cx + 6, top - 0.18, top, cz + t - 0.05, cz + t + 0.05, '-y+z-z')
        m.box(cx + t - 0.05, cx + t + 0.05, top - 0.18, top, cz - 6, cz + 6, '-y+x-x')
    geo('glow_sky', baked=False).floor(cx - 6, cx + 6, cz - 6, cz + 6, top + 0.02, down=True)
    # 开口边的檐口
    ageo('stone').box(cx - 6.4, cx + 6.4, r['h'] - 0.35, r['h'], cz - 6.4, cz - 6, '+z-z-y+x-x')
    ageo('stone').box(cx - 6.4, cx + 6.4, r['h'] - 0.35, r['h'], cz + 6, cz + 6.4, '+z-z-y+x-x')
    ageo('stone').box(cx - 6.4, cx - 6, r['h'] - 0.35, r['h'], cz - 6, cz + 6, '+x-x-y')
    ageo('stone').box(cx + 6, cx + 6.4, r['h'] - 0.35, r['h'], cz - 6, cz + 6, '+x-x-y')
    # 柱廊
    offs = (-6, -2.4, 2.4, 6)
    cols = {(x, z) for x in (-6, 6) for z in offs} | {(x, z) for z in (-6, 6) for x in offs}
    for ox, oz in sorted(cols):
        column(cx + ox, cz + oz, 6.6)
    eb = ageo('stone')
    for oz in (-6, 6):
        eb.box(cx - 6.52, cx + 6.52, 6.6, 7.35, cz + oz - 0.52, cz + oz + 0.52, '+y-y+z-z+x-x')
    for ox in (-6, 6):
        eb.box(cx + ox - 0.52, cx + ox + 0.52, 6.6, 7.35, cz - 5.48, cz + 5.48, '+y-y+x-x')
    # 中央展台 + 围栏
    geo('dark_marble').cyl(cx, 0, 0.25, cz, 1.75, seg=48)
    geo('white_marble').cyl(cx, 0.25, 0.85, cz, 1.35, 1.3, seg=48)
    geo('brass').cyl(cx, 0.85, 0.89, cz, 1.33, seg=48)
    stanchion_ring(cx, cz, 2.45, 8)
    obstacle_circle(cx, cz, 2.6)
    LAYOUT['sculptures'].append(dict(pos=(cx, 0.89, cz), scale=2.6, color='#c2410c', kind='knot'))
    # 角落的植物、长椅、胸像
    for sx in (-1, 1):
        for sz in (-1, 1):
            plant(cx + sx * 9.9, cz + sz * 9.9, 10 + sx + 3 * sz, 1.25)
        bench(cx + sx * 7.2, r['z1'] - 1.3, 'x', 2.4)
        bench(cx + sx * 7.2, r['z0'] + 1.3, 'x', 2.4)
        for oz in (-4.4, 4.4):
            bust(cx + sx * 10.35, cz + oz, sx)
    label('west', 'atrium', '-x', cz, 5.75, 3.4, 0.8)
    label('east', 'atrium', '+x', cz, 5.75, 3.4, 0.8)
    label('grand', 'atrium', '-z', cx, 5.75, 3.4, 0.8)
    LAYOUT['spawn'] = dict(pos=(0, 0, 8.4), yaw=0.0)
    sun(58, 35, 4.0)


def build_wing(name, wall_mat, accent):
    r = ROOMS[name]
    cx, cz = r['cx'], r['cz']
    trims = dict(dado='walnut', rail='walnut', base='walnut', picture=True, arch='walnut')
    for side in ('-x', '+x', '-z', '+z'):
        build_wall(r, side, [(0, r['h'], wall_mat)], trims)
    ageo('chevron').floor(r['x0'], r['x1'], r['z0'], r['z1'])
    # 灯箱天花（柔光顶）
    hole = (cx - 5, cx + 5, cz - 2.6, cz + 2.6)
    build_ceiling(r, holes=[hole])
    light_well(*hole, r['h'], 0.45)
    ageo('ceiling').floor(*hole, r['h'] + 0.45, down=True)
    g = geo('trim_white')
    for k in range(1, 5):
        t = cx - 5 + k * 2
        g.box(t - 0.04, t + 0.04, r['h'] - 0.06, r['h'], cz - 2.6, cz + 2.6, '-y+x-x')
    g.box(cx - 5, cx + 5, r['h'] - 0.06, r['h'], cz - 0.04, cz + 0.04, '-y+z-z')
    geo('glow_laylight', baked=False).floor(*hole, r['h'] - 0.005, down=True)
    area_light(f'Laylight_{name}', cx, r['h'] + 0.3, cz, 10, 5.2, 900)
    cove_lights(r, 220)
    # 外侧的墙在门的对面
    outer = '-x' if name == 'west' else '+x'
    first, second = ('-z', '+z') if name == 'west' else ('+z', '-z')
    for side, s in ((first, cx), (outer, cz), (second, cx)):
        slot(name, side, s, 2.55, 4.2, 2.6)
    bench(cx, cz, 'x', 2.6)
    sgn = -1 if name == 'west' else 1
    pedestal(cx - 5.2 * sgn, cz + 4.6, sculpture=dict(scale=1.0, color=accent, kind='knot'))
    pedestal(cx + 5.2 * sgn, cz - 4.6, sculpture=dict(scale=1.0, color=accent, kind='rings'))
    plant(r['x1'] - 1.0 if name == 'west' else r['x0'] + 1.0, r['z0'] + 1.0, 30 + sgn)
    plant(r['x1'] - 1.0 if name == 'west' else r['x0'] + 1.0, r['z1'] - 1.0, 40 + sgn)


def build_grand():
    r = ROOMS['grand']
    cx = r['cx']
    trims = dict(dado='walnut', rail='walnut', base='walnut', picture=True, arch='walnut')
    for side in ('-x', '+x', '-z', '+z'):
        build_wall(r, side, [(0, r['h'], 'plaster_grey')], trims)
    b = 0.7
    ageo('planks').floor(r['x0'] + b, r['x1'] - b, r['z0'] + b, r['z1'] - b)
    dm = ageo('dark_marble')
    dm.floor(r['x0'], r['x1'], r['z0'], r['z0'] + b)
    dm.floor(r['x0'], r['x1'], r['z1'] - b, r['z1'])
    dm.floor(r['x0'], r['x0'] + b, r['z0'] + b, r['z1'] - b)
    dm.floor(r['x1'] - b, r['x1'], r['z0'] + b, r['z1'] - b)
    hole = (cx - 2.2, cx + 2.2, r['z0'] + 2.2, r['z1'] - 2.2)
    build_ceiling(r, holes=[hole])
    light_well(*hole, r['h'], 0.45)
    ageo('ceiling').floor(*hole, r['h'] + 0.45, down=True)
    geo('glow_laylight', baked=False).floor(*hole, r['h'] - 0.005, down=True)
    area_light('Laylight_grand', cx, r['h'] + 0.3, (hole[2] + hole[3]) / 2, 4.4, hole[3] - hole[2], 1500)
    cove_lights(r, 220)
    # 横梁
    z = r['z1'] - 2.2
    while z > r['z0'] + 1:
        ageo('trim_white').box(r['x0'], r['x1'], r['h'] - 0.55, r['h'], z - 0.18, z + 0.18, '-y+z-z')
        z -= 3.6
    for zz in (-29.6, -40.6):
        for side in ('-x', '+x'):
            slot('grand', side, zz, 2.75, 4.4, 2.75)
    bench(cx, -29.6, 'z', 2.6)
    bench(cx, -40.6, 'z', 2.6)
    pedestal(cx, -35.1, 0.8, 1.0, sculpture=dict(scale=1.3, color='#0e7490', kind='knot'))
    pedestal(cx - 4.4, r['z0'] + 2.0, sculpture=dict(scale=1.0, color='#b08d57', kind='rings'))
    pedestal(cx + 4.4, r['z0'] + 2.0, sculpture=dict(scale=1.0, color='#b08d57', kind='rings'))
    label('hero', 'grand', '-z', cx, 3.6, 7.0, 3.5)
    for x in (-5.4, 5.4):
        plant(x, r['z1'] - 1.2, 50 + int(x))


def build_extra_slots():
    """中庭四面墙上的备用画位：作品多于 10 件时才会用到。"""
    r = ROOMS['atrium']
    for side, s in (('+z', -7.5), ('+z', 7.5), ('-z', -7.5), ('-z', 7.5)):
        slot('atrium', side, s, 3.0, 3.2, 2.0, tier=2)


def walkable():
    pad = 0.35
    for r in ROOMS.values():
        LAYOUT['rooms'].append(dict(name=r['name'], x0=r['x0'], x1=r['x1'], z0=r['z0'], z1=r['z1'], h=r['h']))
        LAYOUT['walkable'].append(dict(x0=r['x0'] + pad, x1=r['x1'] - pad, z0=r['z0'] + pad, z1=r['z1'] - pad))
    for d in DOORS:
        if not d['b']:
            continue
        room, side = d['a']
        r = ROOMS[room]
        a, b = d['c'] - d['w'] / 2 + pad, d['c'] + d['w'] / 2 - pad
        if side in ('-z', '+z'):
            zw = r['z0'] if side == '-z' else r['z1']
            LAYOUT['walkable'].append(dict(x0=a, x1=b, z0=zw - 1.0, z1=zw + 1.0))
        else:
            xw = r['x0'] if side == '-x' else r['x1']
            LAYOUT['walkable'].append(dict(x0=xw - 1.0, x1=xw + 1.0, z0=a, z1=b))


# ------------------------------------------------------------------ 烘焙 + 导出
def join_layer(layer, name):
    obs = BAKED[layer]
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35), keep_sharp_edges=True)
    return ob


def lightmap_uv(ob, margin):
    """第二套 UV：按世界尺寸展开、统一密度后排进一张贴图。"""
    ob.data.uv_layers['UV1'].active = True
    ob.data.uv_layers['UV0'].active_render = True
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=margin, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')


def blur_masked(rgb, mask, radius=2):
    """只在烘焙到的像素之间做模糊，去掉采样噪点。"""
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / (radius * 0.6)) ** 2)
    k /= k.sum()

    def conv(a):
        out = np.zeros_like(a)
        for i, w in enumerate(k):
            out += w * np.roll(a, i - radius, axis=0)
        a2 = out
        out = np.zeros_like(a2)
        for i, w in enumerate(k):
            out += w * np.roll(a2, i - radius, axis=1)
        return out

    m = mask[..., None].astype(np.float32)
    num = conv(rgb * m)
    den = conv(m)
    res = np.where(den > 1e-4, num / np.maximum(den, 1e-4), rgb)
    return np.where(m > 0, res, rgb)


def save_jpeg(rgb, path, quality=90):
    """用 Blender 自己存 JPEG（Blender 自带的 Python 没有 Pillow）。rgb 按 Blender 的习惯从下往上排。"""
    h, w = rgb.shape[:2]
    img = bpy.data.images.new('save_' + os.path.basename(path), w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = rgb
    img.pixels.foreach_set(px.ravel())
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = quality
    img.save_render(path, scene=sc)
    bpy.data.images.remove(img)


def load_textures():
    """贴图已经生成好放在 blender/textures/；缺了的话用 textures.py 重新生成（需要 Pillow）。"""
    for name in ('marble_checker.jpg', 'chevron.jpg', 'planks.jpg', 'damask.jpg', 'medallion.jpg', 'rug.jpg'):
        TEX[name] = os.path.join(TEX_DIR, name)
    if not all(os.path.exists(p) for p in TEX.values()):
        import textures
        textures.build_all(TEX_DIR)


def bake(ob, filename):
    img = bpy.data.images.new('LM_' + ob.name, LM_SIZE, LM_SIZE, float_buffer=True, alpha=True)
    img.pixels.foreach_set(np.zeros(LM_SIZE * LM_SIZE * 4, np.float32))
    nodes = []
    for m in ob.data.materials:
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UV1'
        nt.links.new(uv.outputs['UV'], n.inputs['Vector'])
        nt.nodes.active = n
        nodes.append((nt, n, uv))
    for o in UNBAKED:
        o.hide_render = True
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    t = time.time()
    print(f'[bake] {ob.name}: {LM_SIZE}px × {SAMPLES} spp …', flush=True)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=4, margin_type='EXTEND', use_clear=True)
    print(f'[bake] done in {time.time() - t:.0f}s', flush=True)
    for o in UNBAKED:
        o.hide_render = False
    for nt, n, uv in nodes:
        nt.nodes.remove(n)
        nt.nodes.remove(uv)

    px = np.array(img.pixels[:], dtype=np.float32).reshape(LM_SIZE, LM_SIZE, 4)
    rgb, alpha = px[..., :3], px[..., 3]
    mask = alpha > 0.5
    rgb = blur_masked(rgb, mask, 2)
    vals = rgb[mask].max(-1)
    scale = float(np.percentile(vals, 99.7)) if vals.size else 1.0
    enc = np.clip(rgb / scale, 0, 1) ** (1 / 2.2)
    save_jpeg(enc, os.path.join(ASSETS, filename))
    print(f'[bake] saved {filename}, scale={scale:.3f}', flush=True)
    return dict(file='assets/' + filename, scale=round(scale, 4))


def export(lightmaps):
    for ob in LIGHTS:
        ob.hide_set(True)
    bpy.ops.object.select_all(action='DESELECT')
    path = os.path.join(ASSETS, 'gallery.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False, export_apply=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_image_format='JPEG', export_jpeg_quality=85,
        export_lights=False, export_cameras=False, export_yup=True,
    )
    print('[export]', path, os.path.getsize(path) // 1024, 'KB')
    LAYOUT['lightmaps'] = lightmaps
    LAYOUT['model'] = 'assets/gallery.glb'
    # 作品按这个顺序上墙：先长廊（进门就能看到），再西展厅、东展厅，最后才用中庭的备用位
    order = {'grand': 0, 'west': 1, 'east': 2, 'atrium': 3}
    LAYOUT['slots'].sort(key=lambda s: (s['tier'], order[s['room']]))
    with open(os.path.join(ASSETS, 'gallery.json'), 'w', encoding='utf-8') as f:
        json.dump(LAYOUT, f, ensure_ascii=False, indent=1, default=lambda v: round(float(v), 4))


def main():
    t0 = time.time()
    load_textures()
    reset()
    define_materials()
    build_lobby()
    build_atrium()
    build_wing('west', 'damask', '#d6a65c')
    build_wing('east', 'plaster_green', '#e2e8f0')
    build_grand()
    build_extra_slots()
    walkable()
    finalize_meshes()
    layers = {'Gallery': ('arch', 0.003, 'gallery-light.jpg'), 'Details': ('detail', 0.002, 'gallery-light-detail.jpg')}
    objs = {}
    for name, (layer, margin, _) in layers.items():
        objs[name] = join_layer(layer, name)
        lightmap_uv(objs[name], margin)
        print(f'[build] {name}: {len(objs[name].data.polygons)} faces, {len(objs[name].data.materials)} materials')
    lightmaps = {}
    if BAKE:
        for name, (_, _, filename) in layers.items():
            lightmaps[name] = bake(objs[name], filename)
    if EXPORT:
        export(lightmaps)
    if os.environ.get('SAVE_BLEND') == '1':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'gallery.blend'))
    print(f'[done] {time.time() - t0:.0f}s')


main()
