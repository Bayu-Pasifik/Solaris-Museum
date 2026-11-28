"""Turns one downloaded character into a web-ready GLB.

Run by scripts/add-character.mjs:
    blender --background --factory-startup --python convert-character.py -- manifest.json
"""

import os
import sys

import bpy

# Blender does not put the folder of the script on the import path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importing blender_common also puts the UEFormat addon on the path.
from blender_common import (  # noqa: E402
    apply_materials,
    export_glb,
    log,
    read_manifest,
    remove_root_motion,
    use_smooth_animation,
)

import io_scene_ueformat  # noqa: E402
from io_scene_ueformat.importer.create import anim  # noqa: E402
from io_scene_ueformat.importer.import_context import UEFormatImport  # noqa: E402
from io_scene_ueformat.options import UEAnimOptions, UEModelOptions  # noqa: E402


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


def main():
    manifest = read_manifest()

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

    apply_materials(mesh, manifest["materials"], manifest["textures"])
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
    use_smooth_animation()
    export_glb(
        manifest["output"],
        export_animation_mode="NLA_TRACKS",
        export_morph=True,
        export_morph_normal=False,
        export_try_sparse_sk=True,
        export_optimize_animation_size=True,
    )
    size = os.path.getsize(manifest["output"]) / 1e6
    log("exported", os.path.basename(manifest["output"]), f"{size:.2f} MB,", len(names), "clips")


main()
