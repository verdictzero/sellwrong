"""Dress the employee sprites in a blue SellWrong apron.

Usage:  python3 tools/employee_apron.py <src_dir> <dst_dir> [overrides.json]

The torso (green armour) is modelled as two vertical cylinders, chest and hips,
whose centre/radius come from the widest green run of each block.  Every green
pixel gets a surface angle around the cylinder; the apron covers the front 200
degrees (bib on the chest is narrower), the waist tie wraps all the way round
with a bow at the back, and a 7x6 crunch of the SellWrong logo is stamped on
the bib.  Shading of the original armour is kept by re-tinting luminance, so
folds and highlights survive.  Only green pixels are painted, so hands, guns,
blood and muzzle flash stay in front of the apron.
"""
import glob, os, math, re, sys, json
import numpy as np
from PIL import Image

SRC = sys.argv[1]; DST = sys.argv[2]
OVR_PATH = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "employee_apron_overrides.json")
OVR = json.load(open(OVR_PATH)) if os.path.exists(OVR_PATH) else {}

APRON   = np.array([38, 72, 168], float)   # base blue
TIE     = np.array([22, 42, 110], float)   # darker band
BOW     = np.array([70, 110, 210], float)
R_ = (200, 24, 28); Y_ = (250, 200, 40); W_ = (245, 245, 240); K_ = (16, 12, 12); O_ = (255, 236, 120)
LOGO = [  # 7 wide x 6 tall, None = apron shows through
    [None, None, Y_,  O_,  Y_,  None, None],
    [None, None, Y_,  K_,  Y_,  None, None],
    [None, R_,   R_,  R_,  R_,  R_,   None],
    [R_,   W_,   W_,  W_,  W_,  W_,   R_  ],
    [R_,   R_,   R_,  W_,  W_,  R_,   R_  ],
    [None, R_,   R_,  R_,  R_,  R_,   None],
]
LOGO_HALF_ANGLE = 32.0   # degrees of torso surface the logo spans each side
BIB_ANGLE = 42.0         # bib half-width in degrees
SKIRT_ANGLE = 100.0      # apron half-wrap in degrees

def classify(a):
    r,g,b,al = [a[...,i].astype(int) for i in range(4)]
    opaque = al > 0
    green = opaque & (g > r+30) & (g > b+30)
    return opaque, green

def rot_of(name):
    m = re.match(r'(PLAY|PLYC)([A-Z])(\d)', name)
    return m.group(1), m.group(2), int(m.group(3))

def blocks(green, ymin):
    """split torso rows into contiguous green blocks (chest, hips); ignore antenna."""
    H,W = green.shape
    rows = [y for y in range(ymin, H) if green[y].sum() >= 3]
    out = []
    for y in rows:
        if out and y == out[-1][-1] + 1: out[-1].append(y)
        else: out.append([y])
    return [b for b in out if len(b) >= 2]

def cyl(green, rows):
    best = None
    for y in rows:
        xs = np.where(green[y])[0]
        w = xs.max() - xs.min() + 1
        if best is None or w > best[0]: best = (w, xs.min(), xs.max())
    w,x0,x1 = best
    return (x0 + x1 + 1) / 2.0, w / 2.0

def wrap(d):
    return (d + 180.0) % 360.0 - 180.0

def render(path):
    name = os.path.basename(path)[:-4]
    im = Image.open(path).convert('RGBA'); a = np.array(im)
    opaque, green = classify(a)
    pre, frame, rot = rot_of(name)
    yaw = {0:0.0, 1:0.0, 2:-45.0, 3:-90.0, 4:-135.0, 5:-180.0}[rot]
    p = dict(yaw=yaw, ymin=10, skip=False, logo=True, chest_max_top=22)
    p.update(OVR.get(name, {}))
    if p['skip']:
        im.save(os.path.join(DST, name + '.png')); return name, 0
    yaw = p['yaw']
    bl = blocks(green, p['ymin'])
    if not bl:
        im.save(os.path.join(DST, name + '.png')); return name, 0
    # a block that starts low on the sprite is the hips even if the chest is hidden
    if bl[0][0] > p['chest_max_top']:
        chest, hips = [], bl[0]
    else:
        chest = bl[0]; hips = bl[1] if len(bl) > 1 else []
    out = a.copy().astype(float)
    lum = a[...,:3].astype(float).mean(axis=2)
    gl = lum[green]; lmean = gl.mean() if len(gl) else 100.0
    n = 0
    for bi, rows in enumerate([chest, hips]):
        if not rows: continue
        cx, R = cyl(green, rows)
        top = rows[0]; bottom = rows[-1]
        for y in rows:
            for x in np.where(green[y])[0]:
                psi = math.degrees(math.asin(max(-1.0, min(1.0, (x + 0.5 - cx) / (R * 1.02)))))
                s = wrap(psi - yaw)                   # angle from front centre
                shade = min(1.35, max(0.55, lum[y,x] / lmean))
                col = None
                if bi == 0 and y == bottom:           # waist tie wraps all round
                    col = TIE * shade
                    if abs(abs(s) - 180.0) < 22.0: col = BOW * shade   # bow at the back
                elif bi == 0 and abs(s) <= BIB_ANGLE:
                    col = APRON * shade
                    if p['logo'] and 1 <= y - top <= 6 and abs(s) <= LOGO_HALF_ANGLE:
                        lc = int(round((s / LOGO_HALF_ANGLE) * 3.0 + 3.0))
                        lc = max(0, min(6, lc))
                        pix = LOGO[y - top - 1][lc]
                        if pix is not None: col = np.array(pix, float) * min(1.15, max(0.8, shade))
                elif bi == 1 and abs(s) <= SKIRT_ANGLE:
                    col = APRON * shade
                    if y == top and bi == 1: col = APRON * shade * 0.9
                if col is None: continue
                out[y,x,:3] = np.clip(col, 0, 255); n += 1
        # bow tail: one pixel hanging below the tie at the back
        if bi == 0 and abs(abs(yaw) - 180.0) < 50.0 and bottom + 1 < a.shape[0]:
            x = int(round(cx - 0.5))
            if opaque[bottom+1, x] and not green[bottom+1, x]:
                out[bottom+1, x, :3] = BOW * 0.8
    Image.fromarray(out.astype(np.uint8)).save(os.path.join(DST, name + '.png'))
    return name, n

if __name__ == '__main__':
    os.makedirs(DST, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
        name, n = render(f)
        print(f"{name:10s} painted={n}")
