"""Cuts the character out of tools/ye-source.jpg and writes the game sprite.

Usage: python tools/cutout_ye.py
Outputs: src/assets/img/ye-photo.png (game sprite), tools/ye-cutout.png (full-size check).
"""
from collections import deque
from PIL import Image

SRC = 'tools/ye-source.jpg'
X0, Y0, X1, Y1 = 150, 88, 378, 472   # loose box around the figure
import sys
SPRITE_H = int(sys.argv[1]) if len(sys.argv) > 1 else 36   # sprite height in logical pixels
OUT = sys.argv[2] if len(sys.argv) > 2 else 'src/assets/img/ye-photo.png'

im = Image.open(SRC).convert('RGB')
W, H = im.size
px = im.load()

def lum(c): return (c[0] * 3 + c[1] * 6 + c[2]) // 10
def skin(c): return c[0] > c[1] + 25 and c[1] > c[2] and c[0] > 90
def yellow(c): return c[0] > 185 and c[1] > 140 and c[2] < 135

def solid(x, y):
    c = px[x, y]
    if yellow(c): return False
    if y > 385: return lum(c) < 50          # lower rows: background is dark too
    return lum(c) < 78 or skin(c)

w, h = X1 - X0, Y1 - Y0
base = [[solid(X0 + x, Y0 + y) for x in range(w)] for y in range(h)]
# Dilate by one pixel so JPEG gaps in the outline cannot leak the flood.
wall = [[False] * w for _ in range(h)]
for y in range(h):
    for x in range(w):
        if base[y][x]:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w: wall[yy][xx] = True

outside = [[False] * w for _ in range(h)]
q = deque()
for x in range(w):
    q.append((x, 0)); q.append((x, h - 1))
for y in range(h):
    q.append((0, y)); q.append((w - 1, y))
while q:
    x, y = q.popleft()
    if not (0 <= x < w and 0 <= y < h) or outside[y][x] or wall[y][x]: continue
    outside[y][x] = True
    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

# Keep only the blob connected to the torso.
keep = [[False] * w for _ in range(h)]
q = deque([(300 - X0, 300 - Y0)])
while q:
    x, y = q.popleft()
    if not (0 <= x < w and 0 <= y < h) or keep[y][x] or outside[y][x]: continue
    if y + Y0 > 385 and not wall[y][x]: continue
    keep[y][x] = True
    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

cut = Image.new('RGBA', (w, h), (0, 0, 0, 0))
cp = cut.load()
for y in range(h):
    for x in range(w):
        c = px[X0 + x, Y0 + y]
        if keep[y][x] and not yellow(c): cp[x, y] = c + (255,)

# Morphological opening (radius 2) drops hairline leftovers such as flame streaks.
def morph(grid, r, grow):
    out = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            hit = not grow
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    yy, xx = y + dy, x + dx
                    v = 0 <= yy < h and 0 <= xx < w and grid[yy][xx]
                    if grow and v: hit = True
                    if not grow and not v: hit = False
            out[y][x] = hit
    return out
opened = morph(morph(keep, 2, False), 2, True)
def ember(c): return c[0] > 175 and c[1] > 120 and c[2] < 95
for y in range(h):
    for x in range(w):
        if not (opened[y][x] and keep[y][x]) or ember(px[X0 + x, Y0 + y]): cp[x, y] = (0, 0, 0, 0)
cut = cut.crop(cut.getbbox())
# Hand-picked leftovers in cut-out coordinates: motion line by the fist, sparks under the nozzle.
cp = cut.load()
for bx0, by0, bx1, by1 in ((214, 176, 999, 196), (0, 246, 46, 300), (0, 362, 60, 999)):
    for y in range(max(0, by0), min(cut.size[1], by1)):
        for x in range(max(0, bx0), min(cut.size[0], bx1)):
            cp[x, y] = (0, 0, 0, 0)
cut = cut.crop(cut.getbbox())
cut.save('tools/ye-cutout.png')
print('cutout', cut.size)

# Downscale: premultiplied box filter, hard alpha, then a 1px dark outline like the baked sprites.
scale = (SPRITE_H - 2) / cut.size[1]
sw, sh = max(1, round(cut.size[0] * scale)), SPRITE_H - 2
small = cut.convert('RGBa').resize((sw, sh), Image.LANCZOS).convert('RGBA')
out = Image.new('RGBA', (sw + 2, sh + 2), (0, 0, 0, 0))
op, sp = out.load(), small.load()
for y in range(sh):
    for x in range(sw):
        r, g, b, a = sp[x, y]
        if a >= 110: op[x + 1, y + 1] = (r, g, b, 255)
ink = (11, 11, 18, 255)
snap = out.copy().load()
for y in range(sh + 2):
    for x in range(sw + 2):
        if snap[x, y][3]: continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            xx, yy = x + dx, y + dy
            if 0 <= xx < sw + 2 and 0 <= yy < sh + 2 and snap[xx, yy][3]:
                op[x, y] = ink; break
out.save(OUT)
print('sprite', out.size)
# Enlarged check sheet over a sky-blue card.
card = Image.new('RGBA', (cut.size[0] + out.size[0] * 10 + 60, max(cut.size[1], out.size[1] * 10) + 40), (110, 160, 215, 255))
card.alpha_composite(cut, (20, 20))
big = out.resize((out.size[0] * 10, out.size[1] * 10), Image.NEAREST)
card.alpha_composite(big, (cut.size[0] + 40, 20))
card.save(OUT.replace('.png', '-check.png') if len(sys.argv) > 2 else 'tools/ye-check.png')
