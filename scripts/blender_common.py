"""Steps that the character and the weapon converter share. Runs inside Blender."""

import json
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from io_scene_gltf2.io.exp import meshopt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "ueformat", "src"))

TEXTURE_SIZE = 1024

# Blender's meshopt defaults (8 bits for rotations, 12 for the rest) make bones move in
# visible steps and shift keyframe times, so the animation stutters.
QUAT_BITS = 16
EXP_BITS = 18

# A part is only joined to the body when this share of its bones is in the body already.
# A part below it has a skeleton of its own, and would stay on the floor.
SHARED_BONES = 0.5


def log(*parts):
    print("[convert]", *parts, flush=True)


def read_manifest():
    """Loads the JSON file named after "--" on the command line."""
    with open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8") as handle:
        return json.load(handle)


def remove_root_motion(action):
    """Keeps the model in its place: attacks and jumps move the root bone metres away."""
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in list(bag.fcurves):
                    if curve.data_path.lower() == 'pose.bones["root"].location':
                        bag.fcurves.remove(curve)


def use_smooth_animation():
    """Makes the exporter keep enough bits for animations that do not stutter."""
    meshopt.QUAT_FILTER_BITS = QUAT_BITS
    meshopt.EXP_FILTER_BITS = EXP_BITS


def import_model(path):
    """Imports one .uemodel and returns its skeleton and its meshes."""
    # The addon is only found once the path above is set.
    from io_scene_ueformat.importer.import_context import UEFormatImport
    from io_scene_ueformat.options import UEModelOptions

    before = set(bpy.context.scene.objects)
    UEFormatImport(UEModelOptions()).import_file(path)
    new = [o for o in bpy.context.scene.objects if o not in before]
    armature = next((o for o in new if o.type == "ARMATURE"), None)
    return armature, [o for o in new if o.type == "MESH"]


def add_missing_bones(body, part):
    """Copies the bones that only the part has into the skeleton of the body."""
    known = {bone.name.lower() for bone in body.data.bones}
    # Parents come before their children in this list.
    missing = [
        (
            bone.name,
            bone.parent.name if bone.parent else None,
            bone.head_local.copy(),
            bone.matrix_local.copy(),
            bone.length,
            # The animation importer reads its correction values from these.
            {key: bone[key] for key in bone.keys()},
        )
        for bone in part.data.bones
        if bone.name.lower() not in known
    ]
    if not missing:
        return 0
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="EDIT")
    bones = body.data.edit_bones
    lower = {bone.name.lower(): bone for bone in bones}
    for name, parent, head, matrix, length, _ in missing:
        bone = bones.new(name)
        bone.head = head
        bone.tail = (head[0], head[1], head[2] + length)
        bone.matrix = matrix
        bone.length = length
        bone.parent = lower.get(parent.lower()) if parent else None
        lower[name.lower()] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    for name, *_, properties in missing:
        for key, value in properties.items():
            body.data.bones[name][key] = value
    return len(missing)


def attach(body, path):
    """Moves the meshes of a part onto the skeleton of the body."""
    armature, meshes = import_model(path)
    name = os.path.basename(path)
    if not armature:
        log("part without a skeleton, left out:", name)
        for mesh in meshes:
            bpy.data.objects.remove(mesh)
        return []
    known = {bone.name.lower() for bone in body.data.bones}
    shared = sum(bone.name.lower() in known for bone in armature.data.bones)
    share = shared / max(len(armature.data.bones), 1)
    if share < SHARED_BONES:
        log(f"part with a skeleton of its own ({share:.0%} shared), left out:", name)
        for mesh in meshes:
            bpy.data.objects.remove(mesh)
        bpy.data.objects.remove(armature)
        return []
    added = add_missing_bones(body, armature)
    for mesh in meshes:
        # Bone names can differ in case between the two files.
        names = {bone.name.lower(): bone.name for bone in body.data.bones}
        for group in mesh.vertex_groups:
            group.name = names.get(group.name.lower(), group.name)
        world = mesh.matrix_world.copy()
        mesh.parent = body
        mesh.matrix_world = world
        for modifier in mesh.modifiers:
            if modifier.type == "ARMATURE":
                modifier.object = body
    bpy.data.objects.remove(armature)
    log("part", name, "joined,", added, "bones added")
    return meshes


def web_texture(source_path, folder):
    """Downscales a texture and drops alpha, which these textures use as a data mask."""
    source = bpy.data.images.load(source_path, check_existing=True)
    name = os.path.splitext(os.path.basename(source_path))[0] + "_web"
    if name in bpy.data.images:
        return bpy.data.images[name]
    copy = source.copy()
    copy.alpha_mode = "CHANNEL_PACKED"
    copy.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    pixels = np.empty(TEXTURE_SIZE * TEXTURE_SIZE * 4, dtype=np.float32)
    copy.pixels.foreach_get(pixels)
    pixels[3::4] = 1.0
    image = bpy.data.images.new(name, TEXTURE_SIZE, TEXTURE_SIZE, alpha=False)
    image.pixels.foreach_set(pixels)
    image.filepath_raw = os.path.join(folder, name + ".png")
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(copy)
    return image


def apply_materials(mesh, materials, texture_folder):
    """One unlit image texture per material. Overlays without a texture are removed."""
    # Slot names and file names can differ in case ("Bailian" and "BaiLian").
    textures = {item["name"].lower(): item["texture"] for item in materials}
    os.makedirs(texture_folder, exist_ok=True)
    for index in reversed(range(len(mesh.data.materials))):
        material = mesh.data.materials[index]
        # A second part that uses the same material gets it as "name.001".
        path = textures.get(re.sub(r"\.\d{3}$", "", material.name).lower())
        if not path:
            log("removing untextured material", material.name)
            data = bmesh.new()
            data.from_mesh(mesh.data)
            faces = [f for f in data.faces if f.material_index == index]
            bmesh.ops.delete(data, geom=faces, context="FACES")
            data.to_mesh(mesh.data)
            data.free()
            mesh.data.materials.pop(index=index)
            continue
        material.use_nodes = True
        tree = material.node_tree
        tree.nodes.clear()
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = web_texture(path, texture_folder)
        output = tree.nodes.new("ShaderNodeOutputMaterial")
        tree.links.new(node.outputs["Color"], output.inputs["Surface"])


def export_glb(path, **options):
    """Writes the scene as a Meshopt-compressed GLB with WebP textures."""
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_active_scene=True,
        export_image_format="WEBP",
        export_image_quality=85,
        export_vertex_color="NONE",
        export_apply=False,
        export_meshopt_compression_enable=True,
        export_meshopt_extension="EXT_meshopt_compression",
        **options,
    )
