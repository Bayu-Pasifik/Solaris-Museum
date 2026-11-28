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
    attach,
    export_glb,
    import_model,
    log,
    read_manifest,
    remove_root_motion,
    use_smooth_animation,
)

import io_scene_ueformat  # noqa: E402
from io_scene_ueformat.importer.import_context import UEFormatImport  # noqa: E402
from io_scene_ueformat.options import UEAnimOptions  # noqa: E402


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
