"""Turns one downloaded character into a web-ready GLB.

Run by scripts/add-character.mjs:
    blender --background --factory-startup --python convert-character.py -- manifest.json
"""

import json
import os
import sys

import bmesh
import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "ueformat", "src"))

import io_scene_ueformat  # noqa: E402
from io_scene_ueformat.importer.create import anim  # noqa: E402
from io_scene_ueformat.importer.import_context import UEFormatImport  # noqa: E402
from io_scene_ueformat.options import UEAnimOptions, UEModelOptions  # noqa: E402
from io_scene_gltf2.io.exp import meshopt  # noqa: E402

TEXTURE_SIZE = 1024
# Blender's meshopt defaults (8 bits for rotations, 12 for the rest) make bones move in
# visible steps and shift keyframe times, so the animation stutters.
QUAT_BITS = 16
EXP_BITS = 18


def log(*parts):
    print("[convert]", *parts, flush=True)


def exact_match(items, key, goal, default=None):
    return next((item for item in items or () if key(item) == goal), default)


# The addon also matches a face curve to any shape key whose name is part of the curve
# name ("keepweaponout" drives the mouth shape "A"), which distorts the face.
anim.best = exact_match


def fcurves(action):
    return [
        curve
        for layer in action.layers
        for strip in layer.strips
        for bag in strip.channelbags
        for curve in bag.fcurves
    ]


def remove_root_motion(action):
    """Keeps the character on the podium: attacks and jumps move the root bone metres away."""
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in list(bag.fcurves):
                    if curve.data_path.lower() == 'pose.bones["root"].location':
                        bag.fcurves.remove(curve)


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


def main():
    with open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8") as handle:
        manifest = json.load(handle)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    io_scene_ueformat.register()
    scene = bpy.context.scene
    scene.render.fps = 30

    UEFormatImport(UEModelOptions()).import_file(manifest["model"])
    armature = next(o for o in scene.objects if o.type == "ARMATURE")
    mesh = max((o for o in scene.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    for other in [o for o in scene.objects if o.type == "MESH" and o != mesh]:
        bpy.data.objects.remove(other)
    log("mesh", mesh.name, len(mesh.data.vertices), "vertices,", len(armature.data.bones), "bones")

    # Materials: one unlit image texture each. Overlays without a texture are removed.
    # Slot names and file names can differ in case ("Bailian" and "BaiLian").
    textures = {item["name"].lower(): item["texture"] for item in manifest["materials"]}
    os.makedirs(manifest["textures"], exist_ok=True)
    for index in reversed(range(len(mesh.data.materials))):
        material = mesh.data.materials[index]
        path = textures.get(material.name.lower())
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
        node.image = web_texture(path, manifest["textures"])
        output = tree.nodes.new("ShaderNodeOutputMaterial")
        tree.links.new(node.outputs["Color"], output.inputs["Surface"])
    log("materials", len(mesh.data.materials))

    names = []
    for item in manifest["animations"]:
        bpy.context.view_layer.objects.active = armature
        armature.select_set(True)
        action = UEFormatImport(UEAnimOptions(override_skeleton=armature)).import_file(item["file"])
        action.name = item["name"]
        action.use_fake_user = True
        remove_root_motion(action)
        names.append((item["name"], action))

    keys = mesh.data.shape_keys
    curves_of = {name: bpy.data.actions.get(name + "_Curves") for name, _ in names}

    # Keep only the shape keys that the chosen animations move.
    if keys:
        used = set()
        for action in filter(None, curves_of.values()):
            for curve in fcurves(action):
                if any(abs(k.co.y) > 0.01 for k in curve.keyframe_points):
                    used.add(curve.data_path.split('"')[1])
        for key in reversed(list(keys.key_blocks)[1:]):
            if key.name not in used:
                mesh.shape_key_remove(key)
        keys = mesh.data.shape_keys
        log("shape keys", len(keys.key_blocks) - 1 if keys else 0)

    def push(owner, action, name, end):
        track = owner.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.name = name
        if action.slots:
            strip.action_slot = action.slots[0]
        # Face curves can run one frame past the bones, which stalls the loop.
        strip.action_frame_end = end

    owners = [armature.animation_data] + ([keys.animation_data] if keys and keys.animation_data else [])
    for owner in owners:
        owner.action = None
        for track in list(owner.nla_tracks):
            owner.nla_tracks.remove(track)
    for name, action in names:
        end = action.frame_range[1]
        push(armature.animation_data, action, name, end)
        if keys and keys.animation_data and curves_of[name]:
            push(keys.animation_data, curves_of[name], name, end)

    scene.frame_set(0)
    # Without this the face keeps the first frame of the last clip, which clips without
    # face curves (walk, run, jump) then show.
    if keys:
        if keys.animation_data:
            keys.animation_data.use_nla = False
        for key in keys.key_blocks[1:]:
            key.value = 0.0
        bpy.context.view_layer.update()
        log("neutral face", sum(abs(k.value) for k in keys.key_blocks[1:]))
    meshopt.QUAT_FILTER_BITS = QUAT_BITS
    meshopt.EXP_FILTER_BITS = EXP_BITS
    bpy.ops.export_scene.gltf(
        filepath=manifest["output"],
        export_format="GLB",
        use_active_scene=True,
        export_animation_mode="NLA_TRACKS",
        export_image_format="WEBP",
        export_image_quality=85,
        export_morph=True,
        export_morph_normal=False,
        export_try_sparse_sk=True,
        export_vertex_color="NONE",
        export_optimize_animation_size=True,
        export_apply=False,
        export_meshopt_compression_enable=True,
        export_meshopt_extension="EXT_meshopt_compression",
    )
    size = os.path.getsize(manifest["output"]) / 1e6
    log("exported", os.path.basename(manifest["output"]), f"{size:.2f} MB,", len(names), "clips")


main()
