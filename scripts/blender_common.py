"""Steps that the character and the weapon converter share. Runs inside Blender."""

import json
import os
import re
import sys

import bmesh
import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "ueformat", "src"))

TEXTURE_SIZE = 1024


def log(*parts):
    print("[convert]", *parts, flush=True)


def read_manifest():
    """Loads the JSON file named after "--" on the command line."""
    with open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8") as handle:
        return json.load(handle)


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
