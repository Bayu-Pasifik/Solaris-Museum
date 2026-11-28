"""Turns one downloaded monster into a web-ready GLB.

Run by scripts/add-monster.mjs:
    blender --background --factory-startup --python convert-monster.py -- manifest.json

Unlike a character, a monster can be made of several model files (a second body half, a
weapon, a second head), and all of them follow one skeleton.
"""

import json
import os
import sys

import bpy
import numpy as np

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
from io_scene_ueformat.importer.import_context import UEFormatImport  # noqa: E402
from io_scene_ueformat.options import UEAnimOptions, UEModelOptions  # noqa: E402

# A part is only joined to the body when this share of its bones is in the body already.
# A part below it has a skeleton of its own, and would stay on the floor.
SHARED_BONES = 0.5


def import_model(path):
    """Imports one .uemodel and returns its skeleton and its meshes."""
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


def bounds(meshes):
    """The box around the posed meshes, in the axes of the web page (Y up)."""
    graph = bpy.context.evaluated_depsgraph_get()
    low, high = np.full(3, np.inf), np.full(3, -np.inf)
    for mesh in meshes:
        posed = mesh.evaluated_get(graph)
        data = posed.to_mesh()
        points = np.empty(len(data.vertices) * 3, dtype=np.float32)
        data.vertices.foreach_get("co", points)
        matrix = np.array(posed.matrix_world)
        points = points.reshape(-1, 3) @ matrix[:3, :3].T + matrix[:3, 3]
        posed.to_mesh_clear()
        if len(points):
            low, high = np.minimum(low, points.min(0)), np.maximum(high, points.max(0))
    size, center = high - low, (high + low) / 2
    return {
        "size": [round(float(v), 3) for v in (size[0], size[2], size[1])],
        "center": [round(float(v), 3) for v in (center[0], center[2], -center[1])],
    }


def main():
    manifest = read_manifest()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    io_scene_ueformat.register()
    scene = bpy.context.scene
    scene.render.fps = 30

    body, meshes = import_model(manifest["models"][0])
    for path in manifest["models"][1:]:
        meshes += attach(body, path)

    for mesh in list(meshes):
        # The faces of monsters hardly move, and shape keys are heavy.
        if mesh.data.shape_keys:
            mesh.shape_key_clear()
        apply_materials(mesh, manifest["materials"], manifest["textures"])
        if not mesh.data.polygons:
            meshes.remove(mesh)
            bpy.data.objects.remove(mesh)
    if not meshes:
        raise RuntimeError("no mesh has a texture")
    vertices = sum(len(mesh.data.vertices) for mesh in meshes)
    log("meshes", len(meshes), "with", vertices, "vertices,", len(body.data.bones), "bones")

    names = []
    for item in manifest["animations"]:
        bpy.context.view_layer.objects.active = body
        body.select_set(True)
        options = UEAnimOptions(override_skeleton=body, import_curves=False)
        action = UEFormatImport(options).import_file(item["file"])
        action.name = item["name"]
        action.use_fake_user = True
        remove_root_motion(action)
        names.append((item["name"], action))

    owner = body.animation_data
    for track in list(owner.nla_tracks):
        owner.nla_tracks.remove(track)

    # The first clip is the idle one, and its first frame is what the visitor sees first.
    idle = names[0][1]
    owner.action = idle
    if idle.slots:
        owner.action_slot = idle.slots[0]
    scene.frame_set(0)
    box = bounds(meshes)
    log("size", box["size"])
    with open(manifest["info"], "w", encoding="utf-8") as handle:
        json.dump(box, handle)

    owner.action = None
    for name, action in names:
        track = owner.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.name = name
        if action.slots:
            strip.action_slot = action.slots[0]

    scene.frame_set(0)
    use_smooth_animation()
    export_glb(
        manifest["output"],
        export_animation_mode="NLA_TRACKS",
        export_morph=False,
        export_optimize_animation_size=True,
    )
    size = os.path.getsize(manifest["output"]) / 1e6
    log("exported", os.path.basename(manifest["output"]), f"{size:.2f} MB,", len(names), "clips")


main()
