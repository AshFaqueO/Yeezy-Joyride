"""Cuts the four Slim Shady poses out of tools/slim-source.jpg.

The sheet has a dark grid background and each pose is wrapped in a coloured glow
line, so: flood the background in from the box edge (the glow line stops it),
keep the blob around a seed point, then erode the glow line away.

Usage: python tools/cutout_slim.py
Outputs: src/assets/img/chars/slim_<pose>.png and tools/slim-check.png
"""
from collections import deque
from PIL import Image

SRC = 'tools/slim-source.jpg'
# name, box (x0, y0, x1, y1), seed, boxes where flame/spark colours are erased
POSES = [
    ('run',   (110, 600, 450, 1060),  (270, 850),  []),
    ('fly',   (520, 180, 1030, 960),  (800, 480),  [(520, 470, 700, 960)]),
    ('glide', (1040, 345, 1450, 860), (1250, 620), [(1040, 590, 1190, 760)]),
    ('crash', (1440, 720, 1960, 1060), (1700, 960), [(1440, 880, 1560, 1060), (1560, 1000, 1960, 1060), (1780, 840, 1960, 900)]),
]
GLOW = 5      # thickness of the coloured outline to erode, in source pixels

im = Image.open(SRC).convert('RGB')
px = im.load()

def is_bg(c):
    return max(c) - min(c) < 30 and (c[0] * 3 + c[1] * 6 + c[2]) // 10 < 105

def fiery(c):
    return c[0] > 170 and c[0] - c[2] > 95 and c[1] > 70

sheet = []
for name, (X0, Y0, X1, Y1), seed, burn in POSES:
    w, h = X1 - X0, Y1 - Y0
    solid = [[not is_bg(px[X0 + x, Y0 + y]) for x in range(w)] for y in range(h)]
    # Close hairline gaps in the glow line so the flood cannot leak inside.
    wall = [row[:] for row in solid]
    for y in range(h):
        for x in range(w):
            if solid[y][x]:
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w: wall[yy][xx] = True
    outside = [[False] * w for _ in range(h)]
    q = deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or outside[y][x] or wall[y][x]: continue
        outside[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    for bx0, by0, bx1, by1 in burn:
        for y in range(max(by0, Y0), min(by1, Y1)):
            for x in range(max(bx0, X0), min(bx1, X1)):
                c = px[x, y]
                if fiery(c) or min(c) > 185: outside[y - Y0][x - X0] = True
    keep = [[False] * w for _ in range(h)]
    q = deque([(seed[0] - X0, seed[1] - Y0)])
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or keep[y][x] or outside[y][x]: continue
        keep[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # Erode: distance-to-outside via BFS, drop everything within GLOW pixels of the edge.
    dist = [[-1] * w for _ in range(h)]
    q = deque()
    for y in range(h):
        for x in range(w):
            if not keep[y][x]:
                dist[y][x] = 0; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            xx, yy = x + dx, y + dy
            if 0 <= xx < w and 0 <= yy < h and dist[yy][xx] < 0:
                dist[yy][xx] = dist[y][x] + 1; q.append((xx, yy))
    # Keep only the eroded blob that still contains the seed (drops floating flame bits and dust).
    main = [[False] * w for _ in range(h)]
    q = deque([(seed[0] - X0, seed[1] - Y0)])
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or main[y][x] or dist[y][x] <= GLOW: continue
        main[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    cut = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    cp = cut.load()
    for y in range(h):
        for x in range(w):
            d = dist[y][x]
            if main[y][x]:
                cp[x, y] = px[X0 + x, Y0 + y] + (255 if d > GLOW + 1 else 150,)
    cut = cut.crop(cut.getbbox())
    cut.save('src/assets/img/chars/slim_%s.png' % name)
    print(name, cut.size)
    sheet.append(cut)

card = Image.new('RGBA', (sum(c.size[0] for c in sheet) + 20 * 5, max(c.size[1] for c in sheet) + 40), (110, 160, 215, 255))
x = 20
for c in sheet:
    card.alpha_composite(c, (x, 20)); x += c.size[0] + 20
card.save('tools/slim-check.png')
