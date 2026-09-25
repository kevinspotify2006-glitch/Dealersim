"""Draws the app icon (a tachometer with the needle in the redline) at every size
the web manifest and Android launcher need. Run: python3 tools/icons/make_icons.py"""
import math, os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'assets', 'icons')
os.makedirs(OUT, exist_ok=True)

def draw(size, maskable=False, round_bg=True):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 0 if maskable else int(S * 0.04)
    radius = int(S * 0.22)
    # background gradient
    bg = Image.new('RGBA', (S, S))
    bd = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / S
        c = (int(26 - 12 * t), int(29 - 13 * t), int(34 - 14 * t), 255)
        bd.line([(0, y), (S, y)], fill=c)
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    if maskable:
        md.rectangle([0, 0, S, S], fill=255)
    else:
        md.rounded_rectangle([pad, pad, S - pad, S - pad], radius=radius, fill=255)
    img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S * 0.58
    scale = 0.72 if maskable else 1.0
    r = S * 0.33 * scale
    w = int(S * 0.055 * scale)
    # gauge arc (grey) and redline (orange)
    box = [cx - r, cy - r, cx + r, cy + r]
    d.arc(box, start=150, end=390, fill=(70, 76, 86, 255), width=w)
    d.arc(box, start=320, end=390, fill=(255, 122, 26, 255), width=w)
    # ticks
    for i in range(9):
        a = math.radians(150 + i * 30)
        r1, r2 = r * 0.72, r * 0.84
        d.line([(cx + r1 * math.cos(a), cy + r1 * math.sin(a)), (cx + r2 * math.cos(a), cy + r2 * math.sin(a))], fill=(160, 168, 178, 255), width=max(2, w // 3))
    # needle into the redline
    a = math.radians(338)
    nl = r * 0.9
    d.line([(cx, cy), (cx + nl * math.cos(a), cy + nl * math.sin(a))], fill=(255, 154, 77, 255), width=int(w * 0.7))
    hub = r * 0.14
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=(255, 122, 26, 255))
    # little car silhouette under the gauge
    cw, ch = S * 0.34 * scale, S * 0.09 * scale
    x0, y0 = cx - cw / 2, cy + r * 0.38
    d.rounded_rectangle([x0, y0 + ch * 0.35, x0 + cw, y0 + ch], radius=int(ch * 0.3), fill=(238, 241, 244, 255))
    d.polygon([(x0 + cw * 0.22, y0 + ch * 0.4), (x0 + cw * 0.35, y0), (x0 + cw * 0.68, y0), (x0 + cw * 0.82, y0 + ch * 0.4)], fill=(238, 241, 244, 255))
    for fx in (0.25, 0.75):
        wx = x0 + cw * fx
        wr = ch * 0.32
        d.ellipse([wx - wr, y0 + ch - wr, wx + wr, y0 + ch + wr], fill=(12, 13, 15, 255))
    return img.resize((size, size), Image.LANCZOS)

draw(192).save(os.path.join(OUT, 'icon-192.png'))
draw(512).save(os.path.join(OUT, 'icon-512.png'))
draw(512, maskable=True).save(os.path.join(OUT, 'maskable-512.png'))
draw(180).save(os.path.join(OUT, 'apple-touch-icon.png'))
# Android launcher densities
for name, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    d = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res', f'mipmap-{name}')
    os.makedirs(d, exist_ok=True)
    draw(px).save(os.path.join(d, 'ic_launcher.png'))
print('icons written')
