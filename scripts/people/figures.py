# Synthetic people for Chrome's fake camera (docs/50 §10). No real footage (AGENTS.md).
# python3 figures.py <pose.json> <out.y4m> <people 1..3> [seconds=20]
# Each figure replays the same recording with a different frame lag, position and size;
# figure 2 is mirrored. 0-6s standing, then moving (real recording frames).
import json, math, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

W, H, FPS = 640, 480, 30
d = json.load(open(sys.argv[1])); frames = d['frames']
out = sys.argv[2]
n_people = max(1, min(3, int(sys.argv[3])))
SECS = int(sys.argv[4]) if len(sys.argv) > 4 else 20
ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                       '-i', '-', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
bg = Image.new('RGB', (W, H), (150, 145, 135)); bd = ImageDraw.Draw(bg)
bd.rectangle([0, int(H * 0.72), W, H], fill=(95, 85, 75))
for x in range(0, W, 80): bd.line([x, 0, x, int(H * 0.72)], fill=(140, 135, 125), width=2)

# (center x, scale px/m, lag frames, mirror, shirt colour)
SLOTS = [(W * 0.5, 170, 0, False, (40, 70, 140)), (W * 0.2, 140, 97, True, (140, 60, 40)), (W * 0.8, 120, 211, False, (50, 120, 70))]
PAIRS = [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16), (17, 18), (19, 20), (21, 22), (23, 24), (25, 26), (27, 28), (29, 30), (31, 32)]
SKIN = (224, 172, 140); PANTS = (35, 35, 40)
n = len(frames)

def limb(dr, a, b, w, c):
    dr.line([a, b], fill=c, width=int(max(2, w))); r = w / 2
    for p in (a, b): dr.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=c)

def figure(dr, lm, ox, oy, s, mirror, shirt):
    pts = [(-(l['x']) if mirror else l['x'], l['y']) for l in lm]
    if mirror:
        for a, b in PAIRS: pts[a], pts[b] = pts[b], pts[a]
    g = lambda i: (ox + pts[i][0] * s, oy + pts[i][1] * s)
    k = s / 200
    for a, b in ((23, 25), (25, 27), (24, 26), (26, 28)): limb(dr, g(a), g(b), 26 * k, PANTS)
    for a, b in ((27, 31), (28, 32)): limb(dr, g(a), g(b), 14 * k, (20, 20, 20))
    dr.polygon([g(11), g(12), g(24), g(23)], fill=shirt)
    limb(dr, g(11), g(12), 24 * k, shirt); limb(dr, g(23), g(24), 26 * k, PANTS)
    for a, b in ((11, 13), (12, 14)): limb(dr, g(a), g(b), 20 * k, shirt)
    for a, b in ((13, 15), (14, 16)): limb(dr, g(a), g(b), 16 * k, SKIN)
    sh = ((g(11)[0] + g(12)[0]) / 2, (g(11)[1] + g(12)[1]) / 2); nx, ny = g(0)
    limb(dr, sh, (nx, ny + 18 * k), 16 * k, SKIN)
    dr.ellipse([nx - 24 * k, ny - 32 * k, nx + 24 * k, ny + 28 * k], fill=SKIN)
    dr.ellipse([nx - 26 * k, ny - 36 * k, nx + 26 * k, ny - 8 * k], fill=(50, 35, 25))

for f in range(FPS * SECS):
    t = f / FPS
    img = bg.copy(); dr = ImageDraw.Draw(img)
    # 远的（小的）先画：近的人压在上面
    for (cx, s, lag, mirror, shirt) in sorted(SLOTS[:n_people], key=lambda z: z[1]):
        if t < 6: lm = frames[lag % n]['world']; ox = cx + 3 * math.sin(t * 1.3 + lag)
        else:
            lm = frames[(int((t - 6) * FPS) + lag) % n]['world']
            ox = cx + 20 * math.sin((t - 6) * 0.9 + lag)
        figure(dr, lm, ox, H * 0.47 + (200 - s) * 0.25, s, mirror, shirt)
    ff.stdin.write(np.asarray(img, dtype=np.uint8).tobytes())
ff.stdin.close(); ff.wait(); print('ok', out, n_people)
