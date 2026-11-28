"""Builds the exhibition hall of the Gallery room and writes src/assets/gallery/hall.glb.

    blender --background --factory-startup --python scripts/build-gallery.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Gallery",
and leaves every other scene alone. The hall is original low-poly work and holds no game assets.

The hall is a round colonnade around the vertical axis, so the page can turn it without end.
It has two meshes that are painted with vertex colors: "hall", and "accent", which is white so
that the page can give it the color of the open collection.
"""

import math
import os

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "src", "assets", "gallery", "hall.glb")
SCENE = "Solaris_Gallery"
TAU = math.tau

BAYS = 24
BAY = TAU / BAYS
# The exhibits of the page hang at a radius of 12, so everything here stays clear of that.
COLUMNS = 16.5
ROPES = 10.4


def linear(color):
    """"#rrggbb" in sRGB becomes the linear color that glTF stores."""
    channels = [int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels] + [1.0]


INK = linear("#2b2866")
STONE = linear("#fbfaff")
SHADE = linear("#d9d6f4")
FLOOR = (linear("#f4f2ff"), linear("#e2defa"))
GOLD = linear("#ffc85a")
LIGHT = linear("#fff2b8")
WHITE = linear("#ffffff")


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


def floor(hall, accent):
    # Two rows of tiles around a medallion, with thin lines of color between the rows.
    for inner, outer, count, shift in ((0, 4.0, BAYS, 0), (4.0, 9.0, BAYS * 2, 1), (9.0, 14.4, BAYS * 2, 0), (14.4, 18.6, BAYS, 1)):
        for i in range(count):
            hall.band(inner, outer, 0.0, FLOOR[(i + shift) % 2], TAU * i / count, TAU / count, 4)
    for radius, width, color in ((4.0, 0.16, GOLD), (9.0, 0.1, INK), (14.4, 0.22, GOLD), (18.2, 0.4, INK)):
        hall.band(radius, radius + width, 0.012, color)
    accent.band(9.25, 9.75, 0.014, WHITE)
    accent.band(15.4, 15.65, 0.014, WHITE)
    for i in range(8):
        a = TAU * i / 8
        hall.face([polar(0.6, a - 0.35, 0.016), polar(3.7, a, 0.016), polar(0.6, a + 0.35, 0.016)], GOLD if i % 2 else INK)
    # The edge of the floating floor.
    hall.wall(18.6, -0.5, 0.0, SHADE)
    accent.wall(18.62, -0.75, -0.5, WHITE)
    hall.wall(18.0, -1.5, -0.75, INK)
    hall.band(18.0, 18.62, -0.75, SHADE)


def column(hall, accent, angle):
    x, y, _ = polar(COLUMNS, angle)
    hall.frustum((x, y, 0.0), 0.85, 0.85, 0.35, INK, 8)
    hall.frustum((x, y, 0.35), 0.72, 0.56, 0.4, STONE)
    hall.frustum((x, y, 0.75), 0.5, 0.42, 6.6, STONE)
    accent.frustum((x, y, 1.5), 0.53, 0.52, 0.28, WHITE)
    hall.frustum((x, y, 7.35), 0.44, 0.78, 0.45, SHADE)
    hall.frustum((x, y, 7.8), 0.8, 0.8, 0.22, GOLD, 8)
    hall.frustum((x, y, 8.02), 0.36, 0.36, 1.9, STONE, 8)
    hall.gem((x, y, 11.25), 0.34, 1.1, GOLD)


def arch(hall, angle):
    """A round arch from the column at "angle" to the next one."""
    steps = 20
    points = []
    for i in range(steps + 1):
        t = i / steps
        a = angle + BAY * t
        points.append(polar(COLUMNS, a, 7.95 + 1.85 * math.sin(math.pi * t)))
    hall.tube(points, 0.19, STONE, 6)
    hall.tube([(x, y, z - 0.32) for x, y, z in points], 0.055, GOLD)


def banner(hall, accent, angle):
    """A hanging cloth in the middle of a bay, with a swallow tail and a gold mark."""
    radius, half = COLUMNS - 0.1, 0.052

    def at(side, up, depth=0.0):
        return polar(radius - depth, angle + side * half, up)

    accent.face([at(-1, 9.5), at(1, 9.5), at(1, 4.6), at(0, 5.4), at(-1, 4.6)], WHITE)
    hall.face([at(0, 8.1, 0.03), at(-0.5, 7.2, 0.03), at(0, 6.3, 0.03), at(0.5, 7.2, 0.03)], GOLD)
    hall.tube([at(-1.25, 9.55), at(0, 9.55), at(1.25, 9.55)], 0.08, INK)


def lamp(hall, angle):
    x, y, _ = polar(COLUMNS - 0.25, angle)
    hall.tube([(x, y, 9.7), (x, y, 8.45)], 0.025, INK)
    hall.frustum((x, y, 8.25), 0.3, 0.06, 0.28, INK, 8)
    hall.gem((x, y, 7.55), 0.27, 0.72, LIGHT)


def post(hall, angle):
    x, y, _ = polar(ROPES, angle)
    hall.frustum((x, y, 0.0), 0.24, 0.18, 0.09, INK, 10)
    hall.frustum((x, y, 0.09), 0.06, 0.06, 0.86, GOLD, 8)
    hall.gem((x, y, 0.93), 0.12, 0.24, GOLD)


def rope(accent, angle):
    steps = 8
    points = []
    for i in range(steps + 1):
        t = i / steps
        points.append(polar(ROPES, angle + BAY / 2 * t, 0.9 - 0.3 * math.sin(math.pi * t)))
    accent.tube(points, 0.05, WHITE)


def make_scene():
    """A clean scene of our own; whatever else is open stays as it is."""
    scene = bpy.data.scenes.get(SCENE)
    if scene:
        for obj in list(scene.collection.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        scene = bpy.data.scenes.new(SCENE)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.name.startswith(("hall", "accent", "gallery_")) and item.users == 0:
                block.remove(item)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene


def make_material():
    material = bpy.data.materials.new("gallery_paint")
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
    print(f"[gallery] {name}: {len(shape.faces)} faces")


def main():
    scene = make_scene()
    material = make_material()
    hall, accent = Shape(), Shape()
    floor(hall, accent)
    for i in range(BAYS):
        angle = BAY * i
        column(hall, accent, angle)
        arch(hall, angle)
        if i % 3 == 1:
            banner(hall, accent, angle + BAY / 2)
        else:
            lamp(hall, angle + BAY / 2)
        for half in range(2):
            post(hall, angle + BAY / 2 * half)
            rope(accent, angle + BAY / 2 * half)
    hall.ring(COLUMNS - 0.5, COLUMNS + 0.5, 9.9, 10.5, STONE)
    accent.ring(COLUMNS - 0.58, COLUMNS + 0.58, 10.5, 10.75, WHITE)
    hall.ring(COLUMNS - 0.45, COLUMNS + 0.45, 10.75, 11.2, SHADE)
    add(scene, material, "hall", hall)
    add(scene, material, "accent", accent)
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format="GLB",
        use_active_scene=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_texcoords=False,
        export_animations=False,
        export_meshopt_compression_enable=True,
    )
    print(f"[gallery] wrote {OUTPUT} ({os.path.getsize(OUTPUT) // 1024} KB)")


main()
