# Part of the arc maw pipeline -- see THE ARC MAW in README.txt. Run order:
#   blender -b -P bake_metal.py -- wtfgun.glb Box_normal.png out 2048        (AO, curvature, distressed metal, bake)
#   blender -b out/wtfgun_metal.blend -P export_glb.py -- out normal.png textured.glb   (the full PBR model)
#   blender -b -P make_game_model.py -- wtfgun.glb out normal.png arcgun.glb 16000 1024 0   (the game copy)
# blender -b -P make_game_model.py -- <sculpt.glb> <bakedir> <normal.png> <out.glb> [tris] [texsize] [flip]
# The game's copy of the arc gun: decimated (UVs kept), prongs to +z, and one
# diffuse sheet with the AO and the normal map's relief multiplied into it,
# because the game's gun shader reads colour and nothing else.
import bpy, sys, os, math
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
GLB, BAKE, NORMAL, OUT = a[:4]
TRIS = int(a[4]) if len(a) > 4 else 16000
TEX = int(a[5]) if len(a) > 5 else 1024
FLIP = (a[6] == '1') if len(a) > 6 else False

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = obj; obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.object.mode_set(mode='OBJECT')
if obj.data.has_custom_normals:
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
n0 = sum(len(p.vertices) - 2 for p in obj.data.polygons)
m = obj.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'
m.ratio = TRIS / n0; m.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.shade_smooth()
if FLIP:
    # half a turn about the (Blender) z axis = glTF y: prongs to glTF +z
    obj.rotation_euler = (0, 0, math.pi)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
# the file's node turns the mesh a quarter and lifts it: bake that in, and
# put the prongs' axis on glTF x = y = 0 so the maw is just (0, 0, z)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data
gz = [-v.co.y for v in me.vertices]                      # glTF z is Blender -y
zmax = max(gz)
front = [v.co for v in me.vertices if -v.co.y > zmax - 1.1]
cx = sum(c.x for c in front) / len(front); cz = sum(c.z for c in front) / len(front)
for v in me.vertices: v.co.x -= cx; v.co.z -= cz
me.update()
print('MAW_AXIS_SHIFT', cx, cz, 'ZMAX', zmax)
n1 = sum(len(p.vertices) - 2 for p in obj.data.polygons)
print('TRIS', n0, '->', n1)

def load_np(path, size):
    im = bpy.data.images.load(path); im.colorspace_settings.name = 'Non-Color'
    if im.size[0] != size: im.scale(size, size)
    arr = np.empty(size * size * 4, np.float32); im.pixels.foreach_get(arr)
    return arr.reshape(size, size, 4)

S = 2048
alb = load_np(f'{BAKE}/albedo.png', S)[..., :3]          # sRGB-encoded values
ao = load_np(f'{BAKE}/ao.png', S)[..., :1]
nrm = load_np(NORMAL, S)
nz = np.clip(nrm[..., 2:3] * 2 - 1, 0, 1)                # how far the relief tilts
def lin(x): return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
def srgb(x):
    x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055)
game = lin(alb) * (0.30 + 0.70 * ao) * (0.45 + 0.55 * nz ** 3)
game = srgb(game)
img = bpy.data.images.new('arcgun', S, S, alpha=False)
o4 = np.ones((S, S, 4), np.float32); o4[..., :3] = game
img.pixels.foreach_set(o4.ravel())
img.scale(TEX, TEX)
img.filepath_raw = f'{BAKE}/arcgun_{TEX}.png'; img.file_format = 'PNG'; img.save()
img = bpy.data.images.load(f'{BAKE}/arcgun_{TEX}.png'); img.name = 'arcgun'

mat = bpy.data.materials.new('arcgun'); mat.use_nodes = True
N, L = mat.node_tree.nodes, mat.node_tree.links
b = N['Principled BSDF']
t = N.new('ShaderNodeTexImage'); t.image = img
L.new(t.outputs['Color'], b.inputs['Base Color'])
b.inputs['Metallic'].default_value = 0; b.inputs['Roughness'].default_value = 0.6
obj.data.materials.clear(); obj.data.materials.append(mat)
for o in bpy.data.objects: o.select_set(o == obj)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_tangents=False, export_image_format='JPEG', export_jpeg_quality=90,
                          export_vertex_color='NONE', export_extras=False, export_apply=True)
print('EXPORTED', OUT, os.path.getsize(OUT))
