#!/usr/bin/env python3
"""Software rasteriser for drive-mode QA without a GPU.

Renders the drive renderer's exact triangle format (interleaved 9 floats
per vertex: position xyz, normal xyz, colour rgb) to a PNG with the same
camera maths and the same lighting as the WebGL scene shader, so mesh
and matrix bugs are visible in an image instead of imagined. This tool
caught the featureless-brick car mesh in v8.

Input JSON shape (all arrays optional):
  {"world": [f, ...], "car": [f, ...], "wheel": [f, ...],
   "aM": 1.3, "bM": 1.2}
Car and wheels are placed at the origin heading +x; world is drawn as
given. Use --pixel to render small and upscale NEAREST, approximating
the in-game pixel pipeline.

Usage:
  python3 render_preview.py meshes.json out.png \
    --eye -9 0 4.2 --look 8 0 1.1 [--pixel] [--car-only]

Producing meshes.json: the mesh builders are pure; the proven route is
to extract them from the artifact (they are plain JS there) or to
copy the TS builders into a scratch .mjs and dump Float32Arrays with
JSON.stringify(Array.from(mesh)). See README.md.
"""
import argparse
import json
import math

from PIL import Image


def look_at(ex, ey, ez, cx, cy, cz):
    zx, zy, zz = ex - cx, ey - cy, ez - cz
    zl = math.hypot(zx, zy, zz)
    zx, zy, zz = zx / zl, zy / zl, zz / zl
    # World up is +z; right = up x forward for this basis.
    xx, xy, xz = (0 * zz - 1 * zy), (1 * zx - 0 * zz), (0 * zy - 0 * zx)
    xl = math.hypot(xx, xy, xz)
    xx, xy, xz = xx / xl, xy / xl, xz / xl
    yx, yy, yz = zy * xz - zz * xy, zz * xx - zx * xz, zx * xy - zy * xx
    return (xx, xy, xz, yx, yy, yz, zx, zy, zz, ex, ey, ez)


def tris_of(arr, model=None):
    out = []
    for i in range(0, len(arr), 27):
        v = []
        for k in range(3):
            x, y, z = arr[i + k * 9], arr[i + k * 9 + 1], arr[i + k * 9 + 2]
            if model:
                x, y, z = model(x, y, z)
            v.append((x, y, z))
        n = (arr[i + 3], arr[i + 4], arr[i + 5])
        col = (arr[i + 6], arr[i + 7], arr[i + 8])
        out.append((v[0], v[1], v[2], n, col))
    return out


def render(tris, cam, w, h, name, fov=62 * math.pi / 180, scale=1):
    xx, xy, xz, yx, yy, yz, zx, zy, zz, ex, ey, ez = cam
    f = (h / 2) / math.tan(fov / 2)
    img = [[(18, 18, 30)] * w for _ in range(h)]
    zbuf = [[1e9] * w for _ in range(h)]
    light = (-0.35, 0.45, 0.82)
    ll = math.hypot(*light)
    light = tuple(c / ll for c in light)
    for (p1, p2, p3, n, col) in tris:
        pts = []
        ok = True
        for (px, py, pz) in (p1, p2, p3):
            dx, dy, dz = px - ex, py - ey, pz - ez
            cz2 = dx * zx + dy * zy + dz * zz
            if cz2 > -0.4:
                ok = False
                break
            pts.append((w / 2 + f * (dx * xx + dy * xy + dz * xz) / -cz2,
                        h / 2 - f * (dx * yx + dy * yy + dz * yz) / -cz2, -cz2))
        if not ok:
            continue
        sh = 0.55 + 0.45 * max(0.0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2])
        c = tuple(min(255, int(v * sh * 255)) for v in col)
        (x1, y1, z1), (x2, y2, z2), (x3, y3, z3) = pts
        den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
        if abs(den) < 1e-9:
            continue
        for py in range(max(0, int(min(y1, y2, y3))), min(h - 1, int(max(y1, y2, y3))) + 1):
            for px in range(max(0, int(min(x1, x2, x3))), min(w - 1, int(max(x1, x2, x3))) + 1):
                w1 = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / den
                w2 = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / den
                w3 = 1 - w1 - w2
                if w1 < 0 or w2 < 0 or w3 < 0:
                    continue
                z = w1 * z1 + w2 * z2 + w3 * z3
                if z < zbuf[py][px]:
                    zbuf[py][px] = z
                    img[py][px] = c
    im = Image.new('RGB', (w, h))
    im.putdata([p for row in img for p in row])
    if scale > 1:
        im = im.resize((w * scale, h * scale), Image.NEAREST)
    im.save(name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('meshes')
    ap.add_argument('out')
    ap.add_argument('--eye', nargs=3, type=float, default=[-9, 0, 4.2])
    ap.add_argument('--look', nargs=3, type=float, default=[8, 0, 1.1])
    ap.add_argument('--pixel', action='store_true', help='160x100 internal, x3 NEAREST upscale')
    ap.add_argument('--car-only', action='store_true')
    args = ap.parse_args()
    d = json.load(open(args.meshes))
    tris = []
    if not args.car_only and 'world' in d:
        tris += tris_of(d['world'])
    if 'car' in d:
        tris += tris_of(d['car'])
    if 'wheel' in d and 'aM' in d:
        for (lx, ly) in [(d['aM'], -0.74), (d['aM'], 0.74), (-d['bM'], -0.74), (-d['bM'], 0.74)]:
            tris += tris_of(d['wheel'], lambda x, y, z, lx=lx, ly=ly: (x + lx, y + ly, z))
    cam = look_at(*args.eye, *args.look)
    if args.pixel:
        render(tris, cam, 160, 100, args.out, scale=3)
    else:
        render(tris, cam, 480, 320, args.out)
    print('wrote', args.out)


if __name__ == '__main__':
    main()
