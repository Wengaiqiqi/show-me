"""把 build_gallery.py 导出的展馆模型和光照贴图压小，网页加载更快（画面几乎无差别）。

  python3 blender/compress_assets.py      # 需要 Pillow 和 Node（用 npx 跑 gltfpack）

- 模型里的 6 张材质贴图 JPEG → WebP，几何体用 meshopt 压缩（网页端由 meshopt_decoder 解压）
- 光照贴图 gallery-light*.jpg → .webp
- 更新 gallery.json 里的文件名和大小（网页进度条要用）
重新烘焙导出后跑一次就行；已经压过的文件会跳过。
"""
import io
import json
import os
import struct
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
QUALITY = 90
GLTFPACK = ['npx', '--yes', 'gltfpack@0.22.0']


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack('<I', b[20 + jl:24 + jl])[0]
    return j, b[28 + jl:28 + jl + bl]


def write_glb(path, j, binary):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    binary = bytes(binary) + b'\0' * (-len(binary) % 4)
    head = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
    with open(path, 'wb') as f:
        f.write(head + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binary), 0x004E4942) + binary)


def webp(data):
    out = io.BytesIO()
    Image.open(io.BytesIO(data)).save(out, 'WEBP', quality=QUALITY, method=6)
    return out.getvalue()


def compress_model(path):
    j, binary = read_glb(path)
    if 'EXT_meshopt_compression' in j.get('extensionsUsed', []):
        print('[model] 已经压缩过，跳过')
        return
    # 1. 内嵌贴图换成 WebP（EXT_texture_webp），重新排布二进制块
    views = j['bufferViews']
    new = {}
    for img in j.get('images', []):
        v = views[img['bufferView']]
        o = v.get('byteOffset', 0)
        new[img['bufferView']] = webp(binary[o:o + v['byteLength']])
        img['mimeType'] = 'image/webp'
    for t in j.get('textures', []):
        t.setdefault('extensions', {})['EXT_texture_webp'] = {'source': t.pop('source')}
    for k in ('extensionsUsed', 'extensionsRequired'):
        j[k] = sorted(set(j.get(k, [])) | {'EXT_texture_webp'})
    packed = bytearray()
    for i, v in enumerate(views):
        o = v.get('byteOffset', 0)
        data = new.get(i, binary[o:o + v['byteLength']])
        packed += b'\0' * (-len(packed) % 4)
        v['byteOffset'], v['byteLength'] = len(packed), len(data)
        packed += data
    packed += b'\0' * (-len(packed) % 4)
    j['buffers'][0]['byteLength'] = len(packed)
    # 2. gltfpack 压几何体。-kn/-km 保留物体和材质名（网页按名字贴光照贴图），-kv 保留第二套 UV，
    #    UV 用浮点（光照贴图对 UV 精度敏感），位置用 16 位量化
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'in.glb')
        write_glb(src, j, packed)
        subprocess.run(GLTFPACK + ['-i', src, '-o', path, '-cc', '-kn', '-km', '-kv', '-vp', '16', '-vtf'], check=True)
    print(f'[model] {os.path.getsize(path) // 1024} KB')


def compress_lightmaps(layout):
    for lm in layout.get('lightmaps', {}).values():
        if not lm['file'].endswith('.jpg'):
            continue
        src = os.path.join(ROOT, lm['file'])
        dst = src[:-4] + '.webp'
        Image.open(src).save(dst, 'WEBP', quality=QUALITY, method=6)
        os.remove(src)
        lm['file'] = lm['file'][:-4] + '.webp'
        print(f'[lightmap] {lm["file"]} {os.path.getsize(dst) // 1024} KB')
        lm['bytes'] = os.path.getsize(dst)


def main():
    layout_path = os.path.join(ASSETS, 'gallery.json')
    layout = json.load(open(layout_path, encoding='utf-8'))
    model = os.path.join(ROOT, layout['model'])
    compress_model(model)
    layout['modelBytes'] = os.path.getsize(model)
    compress_lightmaps(layout)
    with open(layout_path, 'w', encoding='utf-8') as f:
        json.dump(layout, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sys.exit(main())
