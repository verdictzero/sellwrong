# The police van's game copy -- see THE POLICE VAN in README.txt -- and the
# fire truck's, which is the same van repainted with a water cannon on its
# roof (THE FIRE TRUCK).
#   blender -b -P prep_swatvan.py -- <newSWATvan.glb> <out.glb> [texsize] [body ratio] [wheel ratio]
#   blender -b -P prep_swatvan.py -- <fireTruckVariant.glb> <out.glb> [texsize] [body ratio] [wheel ratio]
#
# 1. bake the file's node transforms into its vertices
# 2. half a turn about glTF y: the file faces -z (its front wheels and its
#    light bar are at -z, "wheelFrontRight" is at +x), and glTF and the
#    game both say the front of an asset is +z
# 3. the parts named for what the game does with them: `body`, one
#    `wheel_*` per axle or wheel (each turned about its own middle while
#    it drives) and `lightbar`, on its own flat material, which the game
#    replaces with the flashing red and blue
# 4. the body's and the wheels' colour sheets shrunk to [texsize] and
#    stacked into ONE sheet, body above wheels, with the wheels' UVs moved
#    to match -- a vehicle in this game is drawn off one picture; normal
#    and metal-rough maps dropped, since nothing reads them
# 5. the body and wheels decimated to [ratio]s of their triangles
# 6. the fire truck's water cannon: turret and barrel joined as `cannon`,
#    which the game turns about the middle of `cannon_base`; both keep their
#    flat colours and lose the photo their metal-rough slot pointed at
# 7. exported with one UV set, no normals' tangents, JPEG
import bpy, bmesh, sys, os, math
from mathutils import Matrix

a = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = a[0], a[1]
TEX = int(a[2]) if len(a) > 2 else 1024
BODY_RATIO = float(a[3]) if len(a) > 3 else 0.5
WHEEL_RATIO = float(a[4]) if len(a) > 4 else 0.25

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

# 1 + 2
turn = Matrix.Rotation(math.pi, 4, 'Z')
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
    o.data.transform(turn @ mw)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)

# 3
NAMES = {'newSWATvanChassis': 'body', 'newSWATvanLightDynamic': 'lightbar',
         'wheelFrontRight': 'wheel_fr', 'wheelFrontLeft': 'wheel_fl',
         'wheelMidPairSameAxle': 'wheel_mid', 'wheelRearPairSameAxle': 'wheel_rear'}
NAMES.update({'waterGunTurret': 'cannon', 'Sphere': 'cannon_barrel', 'waterGunBase': 'cannon_base'})
for o in meshes:
    o.name = o.data.name = NAMES[o.name]
# 6: the barrel rides on the turret
if 'cannon_barrel' in bpy.data.objects:
    bpy.ops.object.select_all(action='DESELECT')
    tur, bar_ = bpy.data.objects['cannon'], bpy.data.objects['cannon_barrel']
    tur.select_set(True); bar_.select_set(True)
    bpy.context.view_layer.objects.active = tur
    bpy.ops.object.join()
    tur.name = tur.data.name = 'cannon'
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in meshes:
        if not o.name.startswith('cannon'): continue
        uvs = o.data.uv_layers
        while len(uvs) > 1: uvs.remove(uvs[-1])
        for i, m in enumerate(o.data.materials):
            col = (0.2, 0.2, 0.2, 1)
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED': col = tuple(n.inputs['Base Color'].default_value)
            if m.name.endswith('_flat'): continue
            flat = bpy.data.materials.get(m.name + '_flat')
            if not flat:
                flat = bpy.data.materials.new(m.name + '_flat'); flat.use_nodes = True
                b_ = flat.node_tree.nodes['Principled BSDF']
                b_.inputs['Base Color'].default_value = col
                b_.inputs['Metallic'].default_value = 0; b_.inputs['Roughness'].default_value = 0.6
            o.data.materials[i] = flat
body = bpy.data.objects['body']
wheels = [o for o in meshes if o.name.startswith('wheel_')]
bar = bpy.data.objects['lightbar']

# 4: one sheet, body on top
def base_image(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            l = n.inputs['Base Color'].links
            if l: return l[0].from_node.image
img_body = base_image(body.data.materials[0])
img_wheel = base_image(wheels[0].data.materials[0])
print('SHEETS', img_body.size[:], img_wheel.size[:])
img_body.scale(TEX, TEX); img_wheel.scale(TEX, TEX)
sheet = bpy.data.images.new('policevan_sheet', TEX, TEX * 2, alpha=False)
px = list(img_wheel.pixels[:]) + list(img_body.pixels[:])   # Blender rows run bottom up
sheet.pixels[:] = px
sheet.pack()

def squeeze(o, v0):
    uv = o.data.uv_layers.active.data
    lo, hi = 9, -9
    for poly in o.data.polygons:
        # a face whose UVs sit in another tile is brought back into 0..1 whole
        us = [uv[i].uv.x for i in poly.loop_indices]; vs = [uv[i].uv.y for i in poly.loop_indices]
        du, dv = math.floor(min(us) + 1e-6), math.floor(min(vs) + 1e-6)
        for i in poly.loop_indices:
            u, v = uv[i].uv.x - du, uv[i].uv.y - dv
            lo, hi = min(lo, u, v), max(hi, u, v)
            uv[i].uv = (u, v0 + v * 0.5)
    print('UV', o.name, round(lo, 4), round(hi, 4))

paint = bpy.data.materials.new('policevan'); paint.use_nodes = True
b = paint.node_tree.nodes['Principled BSDF']
t = paint.node_tree.nodes.new('ShaderNodeTexImage'); t.image = sheet
paint.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
b.inputs['Metallic'].default_value = 0; b.inputs['Roughness'].default_value = 0.6
for o in [body] + wheels:
    uvs = o.data.uv_layers
    while len(uvs) > 1: uvs.remove(uvs[-1])
    squeeze(o, 0.5 if o is body else 0.0)
    o.data.materials.clear(); o.data.materials.append(paint)

old = bar.data.materials[0]; old.name = old.name + '_src'     # so the new one keeps the name
lamp = bpy.data.materials.new('DynamicPoliceLightMatEmissive'); lamp.use_nodes = True
lamp.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 0.01, 0, 1)
bar.data.materials.clear(); bar.data.materials.append(lamp)

# 5
for o, r in [(body, BODY_RATIO)] + [(w, WHEEL_RATIO) for w in wheels]:
    if r >= 1: continue
    m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = r; m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='dec')

extra = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('cannon')]
for o in [body, bar] + wheels + extra:
    vs = [v.co for v in o.data.vertices]
    # glTF (x, y, z) = Blender (x, z, -y)
    lo = (min(c.x for c in vs), min(c.z for c in vs), min(-c.y for c in vs))
    hi = (max(c.x for c in vs), max(c.z for c in vs), max(-c.y for c in vs))
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print('PART', o.name, 'tris', tris, 'min', [round(x, 3) for x in lo], 'max', [round(x, 3) for x in hi])

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_tangents=False, export_image_format='JPEG', export_jpeg_quality=88,
                          export_vertex_color='NONE', export_extras=False, export_apply=True)
print('EXPORTED', OUT, os.path.getsize(OUT))
