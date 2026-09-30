# Part of the arc maw pipeline -- see THE ARC MAW in README.txt. Run order:
#   blender -b -P bake_metal.py -- wtfgun.glb Box_normal.png out 2048        (AO, curvature, distressed metal, bake)
#   blender -b out/wtfgun_metal.blend -P export_glb.py -- out normal.png textured.glb   (the full PBR model)
#   blender -b -P make_game_model.py -- wtfgun.glb out normal.png arcgun.glb 16000 1024 0   (the game copy)
# Headless: blender -b -P bake_metal.py -- <in.glb> <normal.png> <outdir> [size]
#
# 1. import the sculpt, hook up its (unused) tangent-space normal map
# 2. bake AO (through the normal map) and macro curvature (pointiness)
# 3. add micro curvature from the normal map itself (numpy divergence)
# 4. a node-based distressed gunmetal driven by AO + curvature + noise
# 5. bake albedo / roughness / metallic, and a "game" albedo with AO in it
# 6. render preview shots with the baked maps + normal map
import bpy, sys, os, math
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, NORMAL, OUT = argv[0], argv[1], argv[2]
SIZE = int(argv[3]) if len(argv) > 3 else 2048
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

# weld the seams so pointiness is continuous (UVs live on loops, so they survive)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.object.mode_set(mode='OBJECT')
if obj.data.has_custom_normals:
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
bpy.ops.object.shade_smooth()

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.render.threads_mode = 'FIXED'
sc.render.threads = os.cpu_count()
sc.render.bake.margin = 16
sc.render.bake.use_selected_to_active = False

dims = obj.dimensions
LONG = max(dims)
print('dims', tuple(round(d, 3) for d in dims))

nimg = bpy.data.images.load(NORMAL)
nimg.colorspace_settings.name = 'Non-Color'

mat = bpy.data.materials.new('distressed')
mat.use_nodes = True
obj.data.materials.clear()
obj.data.materials.append(mat)
nt = mat.node_tree
N, L = nt.nodes, nt.links


def reset():
    for n in list(N):
        N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    return out


def normal_map():
    uv = N.new('ShaderNodeUVMap')
    t = N.new('ShaderNodeTexImage'); t.image = nimg; t.interpolation = 'Linear'
    nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0
    L.new(uv.outputs['UV'], t.inputs['Vector'])
    L.new(t.outputs['Color'], nm.inputs['Color'])
    return nm.outputs['Normal']


def target(name, colorspace='Non-Color'):
    img = bpy.data.images.new(name, SIZE, SIZE, alpha=False, float_buffer=True)
    img.colorspace_settings.name = colorspace
    t = N.new('ShaderNodeTexImage'); t.image = img
    for n in N: n.select = False
    t.select = True; N.active = t
    return img


def bake_emit(img, samples):
    sc.cycles.samples = samples
    bpy.ops.object.bake(type='EMIT')
    return img


def emit(sock, out):
    e = N.new('ShaderNodeEmission')
    L.new(sock, e.inputs['Color'])
    L.new(e.outputs['Emission'], out.inputs['Surface'])


def save(img, path, colorspace='Non-Color'):
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


def pixels(img):
    a = np.empty(SIZE * SIZE * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(SIZE, SIZE, 4)


def put(img, arr):
    img.pixels.foreach_set(arr.astype(np.float32).ravel())


# ---------------------------------------------------------------- AO
out = reset()
ao = N.new('ShaderNodeAmbientOcclusion')
ao.samples = 16
ao.inputs['Distance'].default_value = LONG * 0.03
L.new(normal_map(), ao.inputs['Normal'])
emit(ao.outputs['AO'], out)
aoimg = target('ao')
bake_emit(aoimg, 12)
save(aoimg, f'{OUT}/ao.png')
print('baked ao')

# ---------------------------------------------------------------- macro curvature
out = reset()
geo = N.new('ShaderNodeNewGeometry')
emit(geo.outputs['Pointiness'], out)
ptimg = target('point')
bake_emit(ptimg, 1)
P = pixels(ptimg)[..., 0]

# micro curvature: divergence of the normal map's xy (convex > 0)
nsrc = bpy.data.images.load(NORMAL)
nsrc.colorspace_settings.name = 'Non-Color'
nsrc.scale(SIZE, SIZE)
na = np.empty(SIZE * SIZE * 4, dtype=np.float32); nsrc.pixels.foreach_get(na)
na = na.reshape(SIZE, SIZE, 4)
nx, ny = na[..., 0] * 2 - 1, na[..., 1] * 2 - 1
div = (np.roll(nx, -1, 1) - np.roll(nx, 1, 1)) + (np.roll(ny, -1, 0) - np.roll(ny, 1, 0))
# blur a little so it reads as bands, not pixel noise
def blur(a, r=2):
    k = np.ones(2 * r + 1) / (2 * r + 1)
    a = np.apply_along_axis(lambda m: np.convolve(m, k, 'same'), 0, a)
    return np.apply_along_axis(lambda m: np.convolve(m, k, 'same'), 1, a)
micro = blur(div, 1)
micro = np.clip(micro * 6.0, -1, 1)
macro = np.clip((P - 0.5) * 8.0, -1, 1)
curv = np.clip(0.5 + 0.5 * (0.55 * micro + 0.45 * macro), 0, 1)
cimg = bpy.data.images.new('curv', SIZE, SIZE, alpha=False, float_buffer=True)
cimg.colorspace_settings.name = 'Non-Color'
c4 = np.ones((SIZE, SIZE, 4), np.float32); c4[..., 0] = c4[..., 1] = c4[..., 2] = curv
put(cimg, c4)
save(cimg, f'{OUT}/curvature.png')
print('curvature done')

# ---------------------------------------------------------------- the material
def material(channel):
    """channel: 'albedo' | 'rough' | 'metal' -> socket"""
    out = reset()
    uv = N.new('ShaderNodeUVMap')
    tA = N.new('ShaderNodeTexImage'); tA.image = aoimg
    tC = N.new('ShaderNodeTexImage'); tC.image = cimg
    L.new(uv.outputs['UV'], tA.inputs['Vector']); L.new(uv.outputs['UV'], tC.inputs['Vector'])
    tc = N.new('ShaderNodeTexCoord')
    obj_co = tc.outputs['Object']

    def noise(scale, detail=6, rough=0.6, dist=0.0):
        n = N.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale / LONG
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = dist
        L.new(obj_co, n.inputs['Vector'])
        return n.outputs['Fac']

    def ramp(sock, stops):
        r = N.new('ShaderNodeValToRGB')
        cr = r.color_ramp
        cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
        cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
        for p, c in stops[1:-1]:
            e = cr.elements.new(p); e.color = (*c, 1)
        L.new(sock, r.inputs['Fac'])
        return r.outputs['Color']

    def math_(op, a, b=None, clamp=True):
        m = N.new('ShaderNodeMath'); m.operation = op; m.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): m.inputs[i].default_value = v
            else: L.new(v, m.inputs[i])
        return m.outputs[0]

    def mix(fac, a, b):
        m = N.new('ShaderNodeMix'); m.data_type = 'RGBA'
        for sock, v in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
            if isinstance(v, (int, float)): sock.default_value = v if sock is m.inputs[0] else (v, v, v, 1)
            elif isinstance(v, tuple): sock.default_value = (*v, 1)
            else: L.new(v, sock)
        return m.outputs[2]

    AO = tA.outputs['Color']
    CV = tC.outputs['Color']
    # masks ---------------------------------------------------------
    grit = noise(160, 8, 0.7)
    blot = noise(14, 5, 0.55, 0.4)
    # edge wear: convex curvature, broken up by grit
    edge = math_('SUBTRACT', CV, 0.58)
    edge = math_('MULTIPLY', edge, 6.0)
    edge = math_('MULTIPLY', edge, ramp(grit, [(0.35, (0, 0, 0)), (0.65, (1, 1, 1))]))
    # cavities: low AO and concave curvature
    cav = math_('SUBTRACT', 1.0, AO)
    cav = math_('MULTIPLY', cav, 1.8)
    conc = math_('MULTIPLY', math_('SUBTRACT', 0.46, CV), 5.0)
    cav = math_('MAXIMUM', cav, conc)
    # rust: cavities plus big noisy patches
    patches = ramp(blot, [(0.60, (0, 0, 0)), (0.68, (1, 1, 1))])
    rustm = math_('MAXIMUM', math_('MULTIPLY', cav, ramp(grit, [(0.3, (0.3, 0.3, 0.3)), (0.7, (1, 1, 1))])),
                  math_('MULTIPLY', patches, 0.8))
    rustm = ramp(rustm, [(0.30, (0, 0, 0)), (0.55, (1, 1, 1))])
    # scratches: stretched noise lines
    sc_n = N.new('ShaderNodeTexWave')
    sc_n.wave_type = 'BANDS'; sc_n.bands_direction = 'DIAGONAL'
    sc_n.inputs['Scale'].default_value = 90 / LONG
    sc_n.inputs['Distortion'].default_value = 14
    sc_n.inputs['Detail'].default_value = 3
    L.new(obj_co, sc_n.inputs['Vector'])
    scratch = ramp(sc_n.outputs['Fac'], [(0.0, (1, 1, 1)), (0.06, (0, 0, 0))])
    scratch = math_('MULTIPLY', scratch, ramp(noise(30, 3), [(0.5, (0, 0, 0)), (0.6, (1, 1, 1))]))

    if channel == 'albedo':
        steel = ramp(noise(40, 6, 0.6), [(0.3, (0.07, 0.075, 0.08)), (0.7, (0.15, 0.155, 0.16))])
        col = mix(math_('MULTIPLY', scratch, 0.7), steel, (0.42, 0.42, 0.43))
        rust = ramp(grit, [(0.25, (0.16, 0.055, 0.02)), (0.5, (0.36, 0.13, 0.04)), (0.8, (0.52, 0.27, 0.10))])
        col = mix(rustm, col, rust)
        col = mix(math_('MULTIPLY', cav, 0.55), col, (0.025, 0.02, 0.015))   # grime
        col = mix(edge, col, (0.62, 0.61, 0.60))                             # worn to bright metal
        return col
    if channel == 'rough':
        r = mix(rustm, 0.38, 0.85)
        r = mix(math_('MULTIPLY', cav, 0.5), r, 0.95)
        r = mix(edge, r, 0.18)
        return r
    if channel == 'metal':
        m = math_('SUBTRACT', 1.0, math_('MULTIPLY', rustm, 1.6))
        m = math_('MAXIMUM', m, edge)
        return m


maps = {}
for ch, cs in (('albedo', 'sRGB'), ('rough', 'Non-Color'), ('metal', 'Non-Color')):
    out = N['Material Output'] if False else None
    sock = material(ch)
    out = [n for n in N if n.type == 'OUTPUT_MATERIAL'][0]
    emit(sock, out)
    img = target(ch, 'Non-Color')    # emission bakes linear values
    bake_emit(img, 1)
    maps[ch] = img
    print('baked', ch)

# albedo to sRGB for the PNG
A = pixels(maps['albedo'])
AOp = pixels(aoimg)[..., :1]
def to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
for name, arr in (('albedo', A[..., :3]), ('albedo_game', A[..., :3] * (0.35 + 0.65 * AOp))):
    img = bpy.data.images.new(name + '_out', SIZE, SIZE, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    o = np.ones((SIZE, SIZE, 4), np.float32); o[..., :3] = to_srgb(arr)
    put(img, o); save(img, f'{OUT}/{name}.png')
for ch in ('rough', 'metal'):
    save(maps[ch], f'{OUT}/{ch}.png')
print('saved maps')

# ---------------------------------------------------------------- preview render
reset()
out = [n for n in N if n.type == 'OUTPUT_MATERIAL'][0]
bsdf = N.new('ShaderNodeBsdfPrincipled')
uv = N.new('ShaderNodeUVMap')
def tex(path, cs):
    t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path); t.image.colorspace_settings.name = cs
    L.new(uv.outputs['UV'], t.inputs['Vector']); return t.outputs['Color']
L.new(tex(f'{OUT}/albedo.png', 'sRGB'), bsdf.inputs['Base Color'])
L.new(tex(f'{OUT}/rough.png', 'Non-Color'), bsdf.inputs['Roughness'])
L.new(tex(f'{OUT}/metal.png', 'Non-Color'), bsdf.inputs['Metallic'])
L.new(normal_map(), bsdf.inputs['Normal'])
L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.55, 0.57, 0.6, 1)
bg.inputs['Strength'].default_value = 0.45
key = bpy.data.lights.new('key', 'AREA'); key.energy = 900 * (LONG / 10) ** 2; key.size = LONG * 0.8
ko = bpy.data.objects.new('key', key); sc.collection.objects.link(ko)
rim = bpy.data.lights.new('rim', 'AREA'); rim.energy = 500 * (LONG / 10) ** 2; rim.size = LONG * 0.5
ro = bpy.data.objects.new('rim', rim); sc.collection.objects.link(ro)

cam = bpy.data.cameras.new('cam'); cam.lens = 50
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
ctr = obj.matrix_world @ (sum((__import__('mathutils').Vector(b) for b in obj.bound_box), __import__('mathutils').Vector()) / 8)
def look(o, pos):
    o.location = pos
    d = ctr - o.location
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x, sc.render.resolution_y = int(os.environ.get("RW", 1280)), int(os.environ.get("RH", 720))
sc.cycles.samples = int(os.environ.get("RS", 64))
sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'
from mathutils import Vector
views = {'side': Vector((1.0, 0.15, 0.25)), 'three_quarter': Vector((0.75, -0.65, 0.45)), 'rear': Vector((-0.55, -0.8, 0.35))}
for name, d in views.items():
    look(co, ctr + d.normalized() * LONG * 1.45)
    look(ko, ctr + Vector((d.x * 0.6 - 0.4, d.y * 0.6 + 0.3, 1.0)).normalized() * LONG * 1.2)
    look(ro, ctr + Vector((-d.x, -d.y, 0.5)).normalized() * LONG * 1.2)
    sc.render.filepath = f'{OUT}/render_{name}.png'
    bpy.ops.render.render(write_still=True)
    print('rendered', name)
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/wtfgun_metal.blend')
print('ALL DONE')
