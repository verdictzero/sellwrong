# Part of the arc maw pipeline -- see THE ARC MAW in README.txt. Run order:
#   blender -b -P bake_metal.py -- wtfgun.glb Box_normal.png out 2048        (AO, curvature, distressed metal, bake)
#   blender -b out/wtfgun_metal.blend -P export_glb.py -- out normal.png textured.glb   (the full PBR model)
#   blender -b -P make_game_model.py -- wtfgun.glb out normal.png arcgun.glb 16000 1024 0   (the game copy)
# blender -b <baked.blend> -P export_glb.py -- <outdir> <normal.png> <out.glb>
import bpy, sys, os
import numpy as np

OUT, NORMAL, GLB = sys.argv[sys.argv.index('--') + 1:][:3]
obj = [o for o in bpy.data.objects if o.type == 'MESH'][0]
SIZE = bpy.data.images.load(f'{OUT}/albedo.png').size[0]

def load(path, cs):
    im = bpy.data.images.load(path); im.colorspace_settings.name = cs; return im

def px(im):
    a = np.empty(im.size[0] * im.size[1] * 4, np.float32); im.pixels.foreach_get(a)
    return a.reshape(im.size[1], im.size[0], 4)

# packed metallic-roughness: G roughness, B metallic (R = AO as occlusion)
rough, metal, ao = (load(f'{OUT}/{n}.png', 'Non-Color') for n in ('rough', 'metal', 'ao'))
orm = np.ones((SIZE, SIZE, 4), np.float32)
orm[..., 0], orm[..., 1], orm[..., 2] = px(ao)[..., 0], px(rough)[..., 0], px(metal)[..., 0]
ormi = bpy.data.images.new('wtfgun_orm', SIZE, SIZE, alpha=False)
ormi.colorspace_settings.name = 'Non-Color'
ormi.pixels.foreach_set(orm.ravel())
ormi.filepath_raw = f'{OUT}/orm.png'; ormi.file_format = 'PNG'; ormi.save()

# normal map at the texture size, 8-bit
nrm = load(NORMAL, 'Non-Color')
if nrm.size[0] != SIZE: nrm.scale(SIZE, SIZE)
nrm.filepath_raw = f'{OUT}/normal.png'; nrm.file_format = 'PNG'
nrm.save()
nrm = load(f'{OUT}/normal.png', 'Non-Color'); nrm.name = 'wtfgun_normal'
alb = load(f'{OUT}/albedo.png', 'sRGB'); alb.name = 'wtfgun_albedo'
ormi = load(f'{OUT}/orm.png', 'Non-Color'); ormi.name = 'wtfgun_orm'

mat = bpy.data.materials.new('wtfgun_distressed_metal'); mat.use_nodes = True
N, L = mat.node_tree.nodes, mat.node_tree.links
for n in list(N): N.remove(n)
out = N.new('ShaderNodeOutputMaterial'); b = N.new('ShaderNodeBsdfPrincipled')
L.new(b.outputs['BSDF'], out.inputs['Surface'])
def tex(im):
    t = N.new('ShaderNodeTexImage'); t.image = im; return t
L.new(tex(alb).outputs['Color'], b.inputs['Base Color'])
sep = N.new('ShaderNodeSeparateColor')
L.new(tex(ormi).outputs['Color'], sep.inputs['Color'])
L.new(sep.outputs['Green'], b.inputs['Roughness'])
L.new(sep.outputs['Blue'], b.inputs['Metallic'])
nm = N.new('ShaderNodeNormalMap')
L.new(tex(nrm).outputs['Color'], nm.inputs['Color'])
L.new(nm.outputs['Normal'], b.inputs['Normal'])
obj.data.materials.clear(); obj.data.materials.append(mat)
# the sculpt's leftover vertex colours
# (vertex colours are left on the mesh and not exported)

for o in bpy.data.objects: o.select_set(o == obj)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True,
                          export_tangents=False, export_image_format='AUTO',
                          export_extras=False, export_apply=True, export_vertex_color='NONE', export_texcoords=True, export_normals=True)
print('EXPORTED', GLB, os.path.getsize(GLB))
