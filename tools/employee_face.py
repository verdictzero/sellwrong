"""Paint a disturbing smiley face over the helmet visor of the Freedoom player sprites.

Usage:  python3 tools/employee_face.py <src_dir> <dst_dir> [overrides.json]

The helmet is modelled as a sphere; the face lives on a spherical cap centred on
the visor, so it foreshortens correctly for the 45/90/135 degree rotations and
wraps to a sliver at the silhouette edge.  Only opaque, low-saturation (helmet)
and blue (visor) pixels are painted, so skin, armour, blood and muzzle flash stay
on top.  Head position/rotation is estimated from the visor and helmet outline;
frames with tilted or hidden heads are hand-tuned in the overrides file.
"""
import glob, os, math, re, sys, json
import numpy as np
from PIL import Image

SRC = sys.argv[1]; DST = sys.argv[2]
OVR_PATH = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "employee_face_overrides.json")
ALPHA = math.radians(74)      # cap half-angle
SIN_A = math.sin(ALPHA)

# ---- colour classes -------------------------------------------------------
def classify(a):
    r,g,b,al = [a[...,i].astype(int) for i in range(4)]
    mx = np.maximum(np.maximum(r,g),b); mn = np.minimum(np.minimum(r,g),b)
    opaque = al > 0
    blue = opaque & (b>=60) & (b>r+30) & (b>g+30)
    green = opaque & (g>r+30) & (g>b+30)
    warm = opaque & (r>b+40) & (r>100)          # skin, blood, muzzle flash
    lowsat = opaque & ~green & ~warm & ~blue
    return opaque, blue, lowsat, green

# ---- face template (u,v in tangent plane, unit disc) ------------------------
YEL = np.array([222,198,84]); BLACK=np.array([12,10,10]); WHITE=np.array([236,236,222])
RED=np.array([150,0,0]); BLOOD=np.array([118,6,6]); RIM=np.array([120,96,32])
EYES = [(-0.40,-0.34,0.30),(0.42,-0.26,0.21)]   # (u,v,radius) – deliberately uneven

def in_face(u,v):
    return u*u + ((v+0.1)/0.82)**2 <= 1.0

def mouth_v(u):
    return 0.46 - 0.52*(u/0.95)**2

def face_px(u,v):
    """returns colour or None for template point"""
    if not in_face(u,v): return None
    # eyes
    for (eu,ev,er) in EYES:
        if (u-eu)**2 + ((v-ev)/1.15)**2 <= er*er: return BLACK
    # blood tear from left eye
    if -0.47 <= u <= -0.35 and -0.06 <= v <= 0.30: return BLOOD
    # grin
    if abs(u) <= 0.96:
        d = v - mouth_v(u)
        t = 1.0 - 0.5*u*u
        if -0.20*t <= d <= 0.18*t:
            if d < 0.0 and abs(u) <= 0.82 and int(math.floor(u*5.6+50)) % 2 == 0: return WHITE
            return BLACK
    # base with shading
    e = u*u + ((v+0.1)/0.82)**2
    shade = 1.0 + 0.16*(-0.45*u - 0.6*v)
    if e > 0.70: shade *= 0.78
    if e > 0.90: return RIM
    return np.clip(YEL*shade,0,255)

# ---- helmet estimation ----------------------------------------------------
def rot_of(name):
    m = re.match(r'(PLAY|PLYC)([A-Z])(\d)', name)
    return m.group(1), m.group(2), int(m.group(3))

def head_geom(opaque, blue, lowsat, green, rot):
    H,W = opaque.shape
    ys,xs = np.where(blue)
    nblue = len(xs)
    if nblue >= 4:
        vx = (xs.min()+xs.max()+1)/2; vy = (ys.min()+ys.max()+1)/2
        seedx = int(vx)
    else:
        vx = vy = None
        # topmost low-sat pixel of the sprite (dome top), pick centre of its row run
        cand = np.where(lowsat.any(axis=1))[0]
        ytop0 = cand.min()
        run = np.where(lowsat[ytop0])[0]
        seedx = int(run.mean())
    # top of head above seed column
    col = np.where(opaque[:, seedx] & ~green[:, seedx])[0]
    ytop = int(col.min())
    # widest horizontal run of non-green opaque pixels through the seed column, rows ytop+1..ytop+4
    best = None
    for y in range(ytop+1, min(H, ytop+4)):
        row = opaque[y] & ~green[y]
        if not row[seedx]: continue
        x0 = seedx
        while x0-1 >= 0 and row[x0-1]: x0 -= 1
        x1 = seedx
        while x1+1 < W and row[x1+1]: x1 += 1
        w = x1-x0+1
        if best is None or w > best[0]: best = (w, x0, x1)
    if best is None: return None
    w,x0,x1 = best
    cx = (x0+x1+1)/2; R = min(7.0, max(5.5, w/2.0))
    cy = vy if vy is not None else ytop + 7.0
    return dict(cx=cx, cy=cy, R=R, vx=vx, vy=vy, nblue=nblue, ytop=ytop)

OVR = json.load(open(OVR_PATH)) if os.path.exists(OVR_PATH) else {}

def render(path):
    name = os.path.basename(path)[:-4]
    im = Image.open(path).convert('RGBA'); a = np.array(im)
    opaque, blue, lowsat, green = classify(a)
    pre, frame, rot = rot_of(name)
    g = head_geom(opaque, blue, lowsat, green, rot)
    if g is None: g = dict(cx=0,cy=0,R=0,nblue=0)
    if rot == 0 and name not in OVR:
        im.save(os.path.join(DST,name+'.png')); return name, dict(cx=0,cy=0,R=0,yaw=0,pitch=0,skip=True), -1
    if rot == 0:
        yaw = 0.0; pitch = 0.0
    else:
        yaw = {1:0.0,2:-42.0,3:-78.0,4:-128.0,5:-180.0}[rot]; pitch = 0.0
    p = dict(cx=g['cx'], cy=g['cy'], R=g['R'], yaw=yaw, pitch=pitch, skip=False)
    if rot == 1 and g['nblue'] >= 10:           # front view: anchor on the visor, fixed size
        p.update(cx=g['vx'], cy=g['vy'], R=6.0)
    if rot == 3 and g['nblue'] < 4:             # visor fully hidden: head turned past 90
        p['yaw'] = -100.0
    p.update(OVR.get(name, {}))
    if p['skip']:
        im.save(os.path.join(DST,name+'.png')); return name, p, 0
    cx,cy,R = p['cx'],p['cy'],p['R']
    yw = math.radians(p['yaw']); pt = math.radians(p['pitch'])
    # basis of face-local frame (columns): forward = Ry(yaw) Rx(-pitch) e_z
    def Ry(v):  # rotate about y
        x,y,z=v; return (x*math.cos(yw)+z*math.sin(yw), y, -x*math.sin(yw)+z*math.cos(yw))
    def Rx(v):
        x,y,z=v; c=math.cos(-pt); s=math.sin(-pt); return (x, y*c - z*s, y*s + z*c)
    ex = Ry(Rx((1,0,0))); ey = Ry(Rx((0,1,0))); ez = Ry(Rx((0,0,1)))
    n=0
    H,W = opaque.shape
    out = a.copy()
    Rl = R*1.04
    for y in range(H):
        for x in range(W):
            if not (lowsat[y,x] or blue[y,x]): continue
            px = (x+0.5-cx)/Rl; py = (y+0.5-cy)/Rl
            rr = px*px+py*py
            if rr > 1.0: continue
            pz = math.sqrt(1.0-rr)
            lx = px*ex[0]+py*ex[1]+pz*ex[2]
            ly = px*ey[0]+py*ey[1]+pz*ey[2]
            lz = px*ez[0]+py*ez[1]+pz*ez[2]
            if lz <= 0: continue
            u = lx/SIN_A; v = ly/SIN_A
            c = face_px(u,v)
            if c is None: continue
            out[y,x,:3] = c; out[y,x,3]=255; n+=1
    # red pupils: nearest painted pixel to each eye centre
    for (eu,ev,er) in EYES:
        # eye centre in local frame -> world
        lz = math.sqrt(max(0.0, 1-(eu*SIN_A)**2-(ev*SIN_A)**2))
        vec = [eu*SIN_A*ex[i] + ev*SIN_A*ey[i] + lz*ez[i] for i in range(3)]
        if vec[2] <= 0.05: continue
        wx = cx + vec[0]*Rl - 0.5; wy = cy + vec[1]*Rl - 0.5
        xi, yi = int(round(wx)), int(round(wy))
        if 0<=yi<H and 0<=xi<W and tuple(out[yi,xi,:3])==tuple(BLACK):
            out[yi,xi,:3] = RED
    # leftover visor pixels: face colour if touching the face, else helmet grey
    if n > 0:
        painted = np.zeros((H,W),bool)
        painted[(out[...,:3] != a[...,:3]).any(axis=2)] = True
        greys = a[lowsat & (a[...,0]>=100)][:,:3]
        grey = np.median(greys,axis=0) if len(greys) else np.array([120,120,120])
        for y,x in zip(*np.where(blue)):
            if painted[y,x]: continue
            nb = painted[max(0,y-1):y+2, max(0,x-1):x+2]
            out[y,x,:3] = (YEL*0.78) if nb.any() else grey
    Image.fromarray(out).save(os.path.join(DST,name+'.png'))
    return name, p, n

if __name__ == '__main__':
    for f in sorted(glob.glob(os.path.join(SRC,'*.png'))):
        name,p,n = render(f)
        print(f"{name:10s} cx={p['cx']:5.1f} cy={p['cy']:5.1f} R={p['R']:4.1f} yaw={p['yaw']:6.1f} pitch={p['pitch']:5.1f} painted={n}")
