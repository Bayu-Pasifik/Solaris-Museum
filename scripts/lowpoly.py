"""What the scripts that model the rooms share: low-poly meshes painted with vertex colors.

Runs inside Blender. The meshes are original work and hold no game assets.
"""

import math
import os

import bpy

TAU = math.tau


def linear(color):
    """"#rrggbb" in sRGB becomes the linear color that glTF stores."""
    channels = [int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels] + [1.0]


def polar(radius, angle, up=0.0):
    return (radius * math.cos(angle), radius * math.sin(angle), up)


class Shape:
    """Collects the faces of one mesh, one color per face."""

    def __init__(self):
        self.verts, self.faces, self.colors = [], [], []

    def face(self, points, color):
        start = len(self.verts)
        self.verts.extend(tuple(p) for p in points)
        self.faces.append(tuple(range(start, start + len(points))))
        self.colors.append(color)

    def band(self, inner, outer, up, color, start=0.0, span=TAU, steps=96):
        """A flat piece of a ring."""
        for i in range(steps):
            a, b = start + span * i / steps, start + span * (i + 1) / steps
            self.face([polar(inner, a, up), polar(outer, a, up), polar(outer, b, up), polar(inner, b, up)], color)

    def wall(self, radius, low, high, color, steps=96):
        for i in range(steps):
            a, b = TAU * i / steps, TAU * (i + 1) / steps
            self.face([polar(radius, a, low), polar(radius, b, low), polar(radius, b, high), polar(radius, a, high)], color)

    def ring(self, inner, outer, low, high, color, steps=96):
        """A ring with a square cross section."""
        self.band(inner, outer, low, color, steps=steps)
        self.band(inner, outer, high, color, steps=steps)
        self.wall(inner, low, high, color, steps)
        self.wall(outer, low, high, color, steps)

    def frustum(self, at, bottom, top, height, color, sides=12):
        x, y, z = at

        def circle(radius, up):
            return [
                (x + radius * math.cos(TAU * i / sides), y + radius * math.sin(TAU * i / sides), z + up)
                for i in range(sides)
            ]

        low, high = circle(bottom, 0), circle(max(top, 0.002), height)
        for i in range(sides):
            j = (i + 1) % sides
            self.face([low[i], low[j], high[j], high[i]], color)
        self.face(high, color)
        self.face(low[::-1], color)

    def gem(self, at, radius, height, color):
        """An octahedron that stands on "at"."""
        x, y, z = at
        waist = [(x + radius * math.cos(TAU * i / 4), y + radius * math.sin(TAU * i / 4), z + height / 2) for i in range(4)]
        for i in range(4):
            j = (i + 1) % 4
            self.face([(x, y, z), waist[j], waist[i]], color)
            self.face([waist[i], waist[j], (x, y, z + height)], color)

    def tube(self, points, thickness, color, sides=5):
        """A round line through "points", for ropes and arches."""
        rings = []
        for index, point in enumerate(points):
            before, after = points[max(index - 1, 0)], points[min(index + 1, len(points) - 1)]
            along = [a - b for a, b in zip(after, before)]
            length = math.hypot(*along)
            t = [c / length for c in along]
            # Any direction across the line, then the one across both.
            flat = math.hypot(t[0], t[1])
            u = (-t[1] / flat, t[0] / flat, 0.0) if flat > 1e-6 else (1.0, 0.0, 0.0)
            v = (t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0])
            rings.append(
                [
                    tuple(
                        point[k]
                        + thickness * (math.cos(TAU * s / sides) * u[k] + math.sin(TAU * s / sides) * v[k])
                        for k in range(3)
                    )
                    for s in range(sides)
                ]
            )
        for low, high in zip(rings, rings[1:]):
            for i in range(sides):
                j = (i + 1) % sides
                self.face([low[i], low[j], high[j], high[i]], color)


def make_scene(name, prefixes):
    """A clean scene of our own; whatever else is open stays as it is."""
    scene = bpy.data.scenes.get(name)
    if scene:
        for obj in list(scene.collection.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        scene = bpy.data.scenes.new(name)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.name.startswith(prefixes) and item.users == 0:
                block.remove(item)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene


def make_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    shader = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    paint = tree.nodes.new("ShaderNodeVertexColor")
    paint.layer_name = "Color"
    tree.links.new(paint.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.9
    material.use_backface_culling = False
    return material


def add(scene, material, name, shape):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(shape.verts, [], shape.faces)
    colors = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    flat = [c for face, color in zip(shape.faces, shape.colors) for _ in face for c in color]
    colors.data.foreach_set("color", flat)
    mesh.color_attributes.active_color = colors
    mesh.materials.append(material)
    mesh.update()
    scene.collection.objects.link(bpy.data.objects.new(name, mesh))
    print(f"[lowpoly] {name}: {len(shape.faces)} faces")


def export(path):
    """Writes the open scene as a Meshopt-compressed GLB."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_active_scene=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_texcoords=False,
        export_animations=False,
        export_meshopt_compression_enable=True,
    )
    print(f"[lowpoly] wrote {path} ({os.path.getsize(path) // 1024} KB)")
