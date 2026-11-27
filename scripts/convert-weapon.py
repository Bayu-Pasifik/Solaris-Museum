"""Turns one downloaded weapon into a still, web-ready GLB.

Run by scripts/add-weapon.mjs:
    blender --background --factory-startup --python convert-weapon.py -- manifest.json
"""

import os
import sys

import bpy
from mathutils import Matrix, Vector

# Blender does not put the folder of the script on the import path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importing blender_common also puts the UEFormat addon on the path.
from blender_common import apply_materials, export_glb, log, read_manifest  # noqa: E402

import io_scene_ueformat  # noqa: E402
from io_scene_ueformat.importer.import_context import UEFormatImport  # noqa: E402
from io_scene_ueformat.options import UEModelOptions  # noqa: E402

# The longest side of the finished exhibit, in metres.
SIZE = 1.6
# Space between two parts (a sword and its scabbard, a pair of gauntlets), before scaling.
GAP = 0.2


def turn(x, y, z):
    """A rotation that moves the X, Y and Z axes of the model onto the given directions."""
    return Matrix((x, y, z)).transposed().to_4x4()


# In the game files a weapon lies the way the hand holds it. Here it is turned so that the
# visitor, who looks along +Y with +Z up, sees its broad side.
BLADE = turn((0, 0, 1), (-1, 0, 0), (0, -1, 0))  # grip down, tip up
TURNS = {
    "Broadblade": BLADE,
    "Sword": BLADE,
    "Pistols": turn((1, 0, 0), (0, 0, 1), (0, -1, 0)),  # barrel to the right
    "Gauntlets": Matrix.Identity(4),
    "Rectifier": turn((0, -1, 0), (1, 0, 0), (0, 0, 1)),  # face to the front
}


def import_part(path, rotation):
    """Imports one model file and returns its most detailed mesh, without the skeleton."""
    scene = bpy.context.scene
    before = set(scene.objects)
    UEFormatImport(UEModelOptions()).import_file(path)
    bpy.context.view_layer.update()
    added = [o for o in scene.objects if o not in before]
    mesh = max((o for o in added if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    matrix = rotation @ mesh.matrix_world
    mesh.parent = None
    mesh.modifiers.clear()
    mesh.data.transform(matrix)
    mesh.matrix_world = Matrix.Identity(4)
    for other in added:
        if other != mesh:
            bpy.data.objects.remove(other)
    return mesh


def bounds(meshes):
    points = [vertex.co for mesh in meshes for vertex in mesh.data.vertices]
    low = Vector(min(p[axis] for p in points) for axis in range(3))
    high = Vector(max(p[axis] for p in points) for axis in range(3))
    return low, high


def main():
    manifest = read_manifest()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    io_scene_ueformat.register()

    parts = []
    for path in manifest["models"]:
        mesh = import_part(path, TURNS.get(manifest["type"], Matrix.Identity(4)))
        apply_materials(mesh, manifest["materials"], manifest["textures"])
        if not mesh.data.vertices:
            log("empty part", mesh.name)
            bpy.data.objects.remove(mesh)
            continue
        parts.append(mesh)
    if not parts:
        raise RuntimeError("no textured geometry")

    # The parts share one origin in the game files, so they are lined up next to each other.
    right = None
    for mesh in parts:
        low, high = bounds([mesh])
        left = low.x if right is None else right + GAP * (high.x - low.x)
        mesh.data.transform(Matrix.Translation((left - low.x, 0, -(low.z + high.z) / 2)))
        right = left + high.x - low.x

    # Same size for every weapon, with its middle on the origin.
    low, high = bounds(parts)
    scale = SIZE / max(high - low)
    fit = Matrix.Scale(scale, 4) @ Matrix.Translation(-(low + high) / 2)
    for mesh in parts:
        mesh.data.transform(fit)

    export_glb(manifest["output"], export_animations=False, export_skins=False, export_morph=False)
    size = os.path.getsize(manifest["output"]) / 1e6
    log("exported", os.path.basename(manifest["output"]), f"{size:.2f} MB,", len(parts), "parts")


main()
