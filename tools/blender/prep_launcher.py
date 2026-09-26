# The quad launcher's game copy -- see THE QUAD LAUNCHER in README.txt.
#   blender -b -P prep_launcher.py -- <xm222.glb> <out.glb> [texsize]
#
# 1. bake the file's node transforms into its vertices
# 2. half a turn about glTF y, so the four rocket noses (glTF -z in the file,
#    with the screen facing back at the gunner from the sight) point +z,
#    which is the way every gun in the rack is modelled
# 3. the ordnance, which is one mesh of four rockets, split into four
#    objects named rocket_0..3 in firing order -- top left, top right,
#    bottom left, bottom right as the gunner sees them -- so a fired tube
#    can be drawn empty
# 4. the gun's and the rockets' colour sheets shrunk to [texsize] and kept;
#    normal, metal-rough and specular maps dropped (the game's gun shader
#    reads colour and nothing else); the display surface kept, flat and
#    under its own name, for the thermal feed to be drawn on
# 5. exported with one UV set, no tangents, JPEG
import bpy, bmesh, sys, os, math
from mathutils import Matrix

a = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = a[0], a[1]
TEX = int(a[2]) if len(a) > 2 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

# 1 + 2: world matrices into the vertices, then the half turn (glTF y is Blender z)
turn = Matrix.Rotation(math.pi, 4, 'Z')
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
    o.data.transform(turn @ mw)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)

def mat_of(o): return o.data.materials[0].name if o.data.materials else ''
gun = next(o for o in meshes if mat_of(o) == 'XM222_mat')
ord_ = next(o for o in meshes if mat_of(o) == 'ordinance_mat')
disp = next(o for o in meshes if 'display' in mat_of(o))
gun.name, disp.name = 'xm222', 'display'

# 3: the rockets, by which quarter of the box each loose part is in
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = ord_; ord_.select_set(True)
bpy.ops.mesh.separate(type='LOOSE')
parts = [o for o in bpy.context.scene.objects if o.type == 'MESH' and mat_of(o) == 'ordinance_mat']
cx = sum(v.co.x for o in parts for v in o.data.vertices) / sum(len(o.data.vertices) for o in parts)
cz = sum(v.co.z for o in parts for v in o.data.vertices) / sum(len(o.data.vertices) for o in parts)
quads = {}
for o in parts:
    n = len(o.data.vertices)
    mx = sum(v.co.x for v in o.data.vertices) / n; mz = sum(v.co.z for v in o.data.vertices) / n
    # glTF x = Blender x; after the half turn and the game's own half turn
    # model +x is the gunner's LEFT. Blender z is up.
    left, top = mx > cx, mz > cz
    quads.setdefault((top, left), []).append(o)
order = [(True, True), (True, False), (False, True), (False, False)]
tubes = []
for i, k in enumerate(order):
    group = quads[k]
    bpy.ops.object.select_all(action='DESELECT')
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    if len(group) > 1: bpy.ops.object.join()
    r = bpy.context.view_layer.objects.active
    r.name = r.data.name = f'rocket_{i}'
    vs = r.data.vertices
    # glTF (x, y, z) = Blender (x, z, -y)
    front = max(-v.co.y for v in vs)
    ring = [v.co for v in vs if -v.co.y > front - 0.6]
    tubes.append((sum(c.x for c in ring) / len(ring), sum(c.z for c in ring) / len(ring), front))
    print('ROCKET', i, 'parts', len(group), 'verts', len(vs))

allv = [o.matrix_world @ v.co for o in bpy.context.scene.objects if o.type == 'MESH' for v in o.data.vertices]
lo = [min(c[k] for c in allv) for k in range(3)]; hi = [max(c[k] for c in allv) for k in range(3)]
print('BOX_GLTF min', (lo[0], lo[2], -hi[1]), 'max', (hi[0], hi[2], -lo[1]))
for i, t in enumerate(tubes): print('TUBE_GLTF', i, [round(t[0], 4), round(t[1], 4), round(t[2], 4)])
dv = [v.co for v in disp.data.vertices]
print('DISPLAY_GLTF x', min(c.x for c in dv), max(c.x for c in dv), 'y', min(c.z for c in dv), max(c.z for c in dv),
      'z', min(-c.y for c in dv), max(-c.y for c in dv))

# 4: colour only
def colour_material(name, src):
    img = None
    for n in src.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            l = n.inputs['Base Color'].links
            if l: img = l[0].from_node.image
    img.scale(TEX, TEX)
    src.name = name + '_src'
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img
    m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = 0; b.inputs['Roughness'].default_value = 0.6
    return m
for o in bpy.context.scene.objects:
    if o.type != 'MESH': continue
    src = o.data.materials[0]
    if src.name in ('XM222_mat', 'ordinance_mat') and not bpy.data.materials.get(src.name + '_src'):
        new = colour_material(src.name, src)
        o.data.materials.clear(); o.data.materials.append(new)
    uvs = o.data.uv_layers
    while len(uvs) > 1: uvs.remove(uvs[-1])
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and o.data.materials[0].name.endswith('_src'):
        o.data.materials[0] = bpy.data.materials[o.data.materials[0].name[:-4]]

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_tangents=False, export_image_format='JPEG', export_jpeg_quality=88,
                          export_vertex_color='NONE', export_extras=False, export_apply=True)
print('EXPORTED', OUT, os.path.getsize(OUT))
