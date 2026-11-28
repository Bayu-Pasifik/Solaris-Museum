"""Builds the Armillary Atlas, the walk of the Map room over little planets. Writes
src/assets/map/orrery.glb and src/assets/map/orrery.json.

    blender --background --factory-startup --python scripts/build-orrery.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Orrery", and
leaves every other scene alone. The models are original low-poly work and hold no game assets.

Every region is a small planet that hangs in a giant armillary sphere, and every area has a
landmark of its own on it, chosen from its name. The page spreads the landmarks over the planet,
turns the planet under the feet of the visitor, and lets a dragon, balloons, survey drones or
the northern lights circle it.

Positions in this script and in the JSON file are those of the page: x to the right, y up and z
toward the visitor. A landmark stands on the zero point and looks along z. "blender" turns the
corners into Blender's coordinates.

The meshes are painted with vertex colors. A name ends in what the page does with the mesh:
"_paint" is lit, "_glow" shines by itself, "_beam" is light that adds to what is behind it, and
"_move" turns or lifts about the pivot that the JSON file gives.
"""

import json
import math
import os
import random
import sys

# Blender does not put the folder of the script on the import path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from io_scene_gltf2.io.exp import meshopt  # noqa: E402
from mathutils import Matrix, Quaternion, Vector, noise  # noqa: E402

from lowpoly import TAU, Shape, add, export, linear, make_material, make_scene  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDER = os.path.join(ROOT, "src", "assets", "map")


def c(color):
    return linear(color)


def mix(a, b, share):
    share = min(max(share, 0.0), 1.0)
    return [x + (y - x) * share for x, y in zip(a, b)]


WHITE = c("#ffffff")
SNOW = c("#eef6ff")
ICE = c("#9fdcff")
ICE_DEEP = c("#4f8fd6")
CRYSTAL = c("#b9a6ff")
CYAN = c("#6df4ff")
VIOLET = c("#8f6bff")
GOLD = c("#ffc83d")
AMBER = c("#ff9f2e")
LAMP = c("#ffe28a")
RED = c("#d8423c")
CORAL = c("#ff7a45")
PINK = c("#ff9ac4")
BRASS = c("#d9a548")
BRASS_DARK = c("#8f6526")
BRASS_LIGHT = c("#ffd98a")
WOOD = c("#8a5a3a")
WOOD_DARK = c("#5a3826")
BARK = c("#6b4a38")
LEAF = c("#3f9a63")
LEAF_DARK = c("#246b4c")
LEAF_LIGHT = c("#86c85a")
GINKGO = c("#f2b632")
MOSS = c("#6f8f3f")
STONE = c("#a9a4b8")
STONE_DARK = c("#6d6884")
STONE_WARM = c("#c9b295")
ROCK = c("#8d7a6e")
ROCK_DARK = c("#5c4c4a")
SAND = c("#e8c27a")
SAND_DARK = c("#c9964e")
CREAM = c("#f6e8cc")
MARBLE = c("#f4efe6")
TERRA = c("#cf6a43")
TERRA_DARK = c("#9c4a30")
WATER = c("#2fb7d0")
WATER_DEEP = c("#12648c")
FOAM = c("#c9fbff")
NAVY = c("#16213f")
SLATE = c("#2c3a62")
STEEL = c("#8fa3c4")
JADE = c("#4fc9a0")
TILE_ROOF = c("#2f6f7a")
BLOOD = c("#8c1f3a")
BONE = c("#eadfca")
BLACK = c("#14101f")


# ---------------------------------------------------------------- the toolkit


def turn(rx=0.0, ry=0.0, rz=0.0):
    return (Matrix.Rotation(ry, 3, "Y") @ Matrix.Rotation(rx, 3, "X") @ Matrix.Rotation(rz, 3, "Z"))


_BALLS = {}


def ball_data(sub):
    if sub not in _BALLS:
        mesh = bmesh.new()
        bmesh.ops.create_icosphere(mesh, subdivisions=sub, radius=1.0)
        mesh.verts.ensure_lookup_table()
        _BALLS[sub] = (
            [v.co.copy() for v in mesh.verts],
            [[v.index for v in f.verts] for f in mesh.faces],
        )
        mesh.free()
    return _BALLS[sub]


class Kit(Shape):
    """A Shape in the coordinates of the page. Every face is a shade of its own, like paint."""

    def paint(self, points, color):
        shade = 1.0 + random.uniform(-0.07, 0.07)
        self.face(points, [color[0] * shade, color[1] * shade, color[2] * shade, 1.0])

    def solid(self, verts, faces, color):
        for face in faces:
            self.paint([verts[i] for i in face], color)

    def cyl(self, x, y, z, bottom, top, height, color, sides=8, rx=0.0, ry=0.0, rz=0.0, cap=True):
        """A round post that stands on (x, y, z) and tilts about that point."""
        m = turn(rx, ry, rz)
        at = Vector((x, y, z))

        def ring(radius, up):
            return [
                at + m @ Vector((radius * math.cos(TAU * i / sides), up, radius * math.sin(TAU * i / sides)))
                for i in range(sides)
            ]

        low, high = ring(bottom, 0.0), ring(max(top, 0.003), height)
        for i in range(sides):
            j = (i + 1) % sides
            self.paint([low[i], low[j], high[j], high[i]], color)
        if cap:
            self.paint(high[::-1], color)
            self.paint(low, color)

    def box(self, x, y, z, w, h, d, color, ry=0.0, rx=0.0, rz=0.0):
        """A block that stands on (x, y, z)."""
        m = turn(rx, ry, rz)
        at = Vector((x, y, z))
        p = [
            at + m @ Vector((sx * w / 2, up, sz * d / 2))
            for up in (0.0, h)
            for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))
        ]
        self.solid(p, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], color)

    def roof(self, x, y, z, w, h, d, color, ry=0.0):
        """A pitched roof; the ridge runs along x."""
        m = turn(0, ry, 0)
        at = Vector((x, y, z))
        p = [at + m @ Vector(v) for v in (
            (-w / 2, 0, -d / 2), (w / 2, 0, -d / 2), (w / 2, 0, d / 2), (-w / 2, 0, d / 2),
            (-w / 2, h, 0), (w / 2, h, 0))]
        self.solid(p, [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (0, 3, 2, 1)], color)

    def ball(self, x, y, z, rx, ry, rz, color, sub=2, jitter=0.0):
        verts, faces = ball_data(sub)
        moved = [
            Vector((x + v.x * rx, y + v.y * ry, z + v.z * rz))
            + (Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * jitter)
            for v in verts
        ]
        self.solid(moved, faces, color)

    def dome(self, x, y, z, radius, height, color, sides=12, steps=4):
        for k in range(steps):
            a, b = math.pi / 2 * k / steps, math.pi / 2 * (k + 1) / steps
            self.cyl(x, y + height * math.sin(a), z, radius * math.cos(a), radius * math.cos(b),
                     height * (math.sin(b) - math.sin(a)), color, sides, cap=False)

    def hoop(self, x, y, z, radius, thick, color, rx=0.0, ry=0.0, rz=0.0, seg=32, sides=5,
             start=0.0, span=TAU):
        """A ring that lies flat unless it is tilted."""
        m = turn(rx, ry, rz)
        at = Vector((x, y, z))
        rings = []
        for i in range(seg + 1):
            a = start + span * i / seg
            out = Vector((math.cos(a), 0.0, math.sin(a)))
            rings.append([
                at + m @ (out * (radius + thick * math.cos(TAU * s / sides))
                          + Vector((0.0, thick * math.sin(TAU * s / sides), 0.0)))
                for s in range(sides)
            ])
        for low, high in zip(rings, rings[1:]):
            for i in range(sides):
                j = (i + 1) % sides
                self.paint([low[i], low[j], high[j], high[i]], color)

    def line(self, points, thick, color, sides=5):
        self.tube([tuple(p) for p in points], thick, color, sides)

    def gem3(self, x, y, z, radius, height, color, rx=0.0, ry=0.0, rz=0.0, sides=5):
        """A pointed crystal that stands on (x, y, z)."""
        m = turn(rx, ry, rz)
        at = Vector((x, y, z))
        waist = [at + m @ Vector((radius * math.cos(TAU * i / sides), height * 0.34,
                                  radius * math.sin(TAU * i / sides))) for i in range(sides)]
        tip, foot = at + m @ Vector((0, height, 0)), at
        for i in range(sides):
            j = (i + 1) % sides
            self.paint([foot, waist[i], waist[j]], color)
            self.paint([waist[j], waist[i], tip], color)

    def peak(self, x, y, z, radius, height, color, sides=7, lean=0.0, cap=None):
        """A crag: rough rings that narrow to a point, with an optional cap of snow."""
        rings, steps = [], 5
        for k in range(steps):
            share = k / steps
            r = radius * (1 - share) ** 0.8
            rings.append([
                Vector((
                    x + lean * share * height + r * math.cos(TAU * i / sides) * random.uniform(0.75, 1.2),
                    y + height * share * random.uniform(0.94, 1.06),
                    z + r * math.sin(TAU * i / sides) * random.uniform(0.75, 1.2),
                ))
                for i in range(sides)
            ])
        tip = Vector((x + lean * height, y + height, z))
        for k, (low, high) in enumerate(zip(rings, rings[1:])):
            paint = cap if cap and k >= steps - 3 else color
            for i in range(sides):
                j = (i + 1) % sides
                self.paint([low[i], low[j], high[j], high[i]], paint)
        for i in range(sides):
            self.paint([rings[-1][i], rings[-1][(i + 1) % sides], tip], cap or color)

    # Small things that several landmarks share.

    def pine(self, x, z, h, leaf, trunk=BARK, snow=None, y=0.0):
        self.cyl(x, y, z, h * 0.07, h * 0.05, h * 0.3, trunk, 5)
        for k in range(3):
            low = y + h * (0.22 + k * 0.22)
            wide = h * (0.34 - k * 0.075)
            self.cyl(x, low, z, wide, 0.0, h * 0.36, snow if snow and k == 2 else leaf, 7)

    def tree(self, x, z, h, leaf, trunk=BARK, y=0.0):
        self.cyl(x, y, z, h * 0.09, h * 0.05, h * 0.55, trunk, 6)
        for _ in range(4):
            self.ball(x + random.uniform(-0.2, 0.2) * h, y + h * random.uniform(0.6, 0.82),
                      z + random.uniform(-0.2, 0.2) * h, h * 0.24, h * 0.2, h * 0.24, leaf, 1, h * 0.04)

    def boulder(self, x, z, r, color, y=0.0):
        self.ball(x, y + r * 0.5, z, r, r * 0.72, r * 0.9, color, 1, r * 0.18)

    def pagoda(self, x, z, y, wide, floors, wall=RED, roof=TILE_ROOF):
        for k in range(floors):
            w = wide * (1 - k * 0.17)
            low = y + k * wide * 0.62
            self.box(x, low, z, w * 0.72, wide * 0.44, w * 0.72, wall)
            self.cyl(x, low + wide * 0.44, z, w * 0.86, w * 0.3, wide * 0.2, roof, 4, ry=math.pi / 4)
            for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                self.gem3(x + sx * w * 0.6, low + wide * 0.42, z + sz * w * 0.6, 0.06, 0.26, GOLD)
        top = y + floors * wide * 0.62
        self.cyl(x, top - wide * 0.05, z, 0.1, 0.0, wide * 0.5, GOLD, 6)


# ---------------------------------------------------------------- the landmarks
# Every landmark fills a circle of about 2.8 m on the zero point. It returns what moves:
# (the pivot, the motion), or nothing. The front, toward the visitor, is +z.


def site_fortress(p, g, m):
    for k in range(8):
        a = TAU * (k + 0.5) / 8
        if k == 1:
            continue
        p.box(math.cos(a) * 2.2, 0, math.sin(a) * 2.2, 0.45, 1.25, 1.75, STONE_WARM, ry=-a)
        for s in (-0.55, 0, 0.55):
            p.box(math.cos(a) * 2.2 - math.sin(a) * s, 1.25, math.sin(a) * 2.2 + math.cos(a) * s,
                  0.45, 0.3, 0.3, STONE, ry=-a)
    p.box(0, 0, -0.3, 1.9, 1.8, 1.6, STONE_WARM)
    p.pagoda(0, -0.3, 1.8, 1.7, 2)
    g.box(0, 0.05, 0.52, 0.6, 0.9, 0.04, AMBER)
    for sx in (-1.5, 1.5):
        p.cyl(sx, 0, 1.5, 0.12, 0.1, 3.0, WOOD_DARK, 6)
    m.box(0.45, -0.5, 0, 0.8, 0.55, 0.04, RED)
    m.box(0.45, -0.34, 0.03, 0.3, 0.2, 0.02, GOLD)
    return (-1.5, 2.9, 1.5), "flag"


def site_peaks(p, g, m):
    for x, z, r, h in ((0, -0.7, 1.35, 6.2), (-1.5, 0.3, 0.9, 4.0), (1.45, 0.1, 0.95, 4.8), (0.6, 1.4, 0.55, 2.2)):
        p.peak(x, 0, z, r, h, JADE if h < 3 else LEAF_DARK, lean=random.uniform(-0.05, 0.05), cap=STONE_WARM)
        for _ in range(3):
            a = random.uniform(0, TAU)
            p.pine(x + math.cos(a) * r * 0.8, z + math.sin(a) * r * 0.8, 0.8, LEAF, y=0.1)
    p.pagoda(-1.5, 0.3, 3.7, 0.55, 2)
    for k in range(5):
        a = TAU * k / 5
        m.ball(math.cos(a) * 2.2, random.uniform(-0.2, 0.2), math.sin(a) * 2.2, 0.55, 0.2, 0.42, CREAM, 1, 0.05)
    return (0, 3.0, 0), "spin"


def site_pillars(p, g, m):
    for x, z, h in ((-1.4, -0.6, 5.4), (0.2, -1.3, 6.6), (1.55, 0.2, 4.2), (-0.7, 1.1, 2.6)):
        for k in range(int(h / 0.9)):
            p.cyl(x + random.uniform(-0.12, 0.12), k * 0.9, z + random.uniform(-0.12, 0.12),
                  random.uniform(0.5, 0.75), random.uniform(0.45, 0.7), 0.92, STONE if k % 2 else ROCK, 6)
        p.ball(x, int(h / 0.9) * 0.9 + 0.15, z, 0.75, 0.4, 0.75, LEAF, 1, 0.1)
        p.pine(x, z, 1.1, LEAF_DARK, y=int(h / 0.9) * 0.9 + 0.3)
    p.line([(-1.4, 4.9, -0.6), (-0.6, 4.55, -0.95), (0.2, 4.9, -1.3)], 0.06, WOOD)
    # A crane that circles the pillars.
    m.ball(2.3, 0, 0, 0.16, 0.14, 0.42, WHITE, 1)
    m.box(1.75, 0, 0, 0.9, 0.04, 0.3, WHITE, rz=0.25)
    m.box(2.85, 0, 0, 0.9, 0.04, 0.3, WHITE, rz=-0.25)
    m.cyl(2.3, 0.05, 0.4, 0.04, 0.03, 0.5, WHITE, 4, rx=1.2)
    return (0, 5.6, -0.4), "spin"


def site_hills(p, g, m):
    for x, z, r, h in ((-1.0, -0.8, 1.7, 1.9), (1.2, -0.3, 1.5, 1.4), (-0.3, 1.0, 1.2, 0.8)):
        for k in range(4):
            share = 1 - k * 0.22
            p.cyl(x, k * h / 4, z, r * share, r * share * 0.88, h / 4, LEAF_LIGHT if k % 2 else GINKGO, 11)
    p.tree(-1.0, -0.8, 1.8, CORAL, y=1.9)
    p.tree(1.2, -0.3, 1.2, GINKGO, y=1.4)
    for x, h in ((-1.8, 3.3), (0.4, 4.1), (1.9, 3.0)):
        m.line([(x, -h + 2.9, 0), (x + 0.15, 0.0, 0.1)], 0.012, MARBLE, 4)
        m.gem3(x + 0.15, -0.35, 0.1, 0.28, 0.75, RED if x < 0 else (CYAN if x > 1 else GOLD), sides=4)
    return (0, 4.2, 0.4), "sway"


def site_gorge(p, g, m):
    for side in (-1, 1):
        for k in range(5):
            z = -1.9 + k * 0.95
            h = 3.0 + math.sin(k * 1.7 + side) * 1.1
            p.box(side * (1.75 + 0.15 * math.cos(k)), 0, z, 1.0, h, 0.98, ROCK if k % 2 else ROCK_DARK,
                  rz=side * -0.08)
            p.ball(side * 1.8, h, z, 0.6, 0.2, 0.55, MOSS, 1, 0.08)
    g.box(0, 0.06, 0, 1.0, 0.04, 4.6, CYAN)
    p.line([(-1.4, 2.5, 0.4), (-0.5, 2.2, 0.4), (0.5, 2.2, 0.4), (1.4, 2.5, 0.4)], 0.07, WOOD)
    for k in range(9):
        p.box(-1.2 + k * 0.3, 2.12 + abs(k - 4) * 0.05, 0.4, 0.2, 0.05, 0.6, WOOD_DARK)
    for k in range(7):
        a = TAU * k / 7
        m.gem3(math.cos(a) * 1.0, math.sin(a * 2) * 0.5, math.sin(a) * 1.0, 0.1, 0.34, CYAN)
    return (0, 3.4, 0), "spin"


def site_pagoda(p, g, m):
    p.box(0, 0, 0, 4.0, 0.35, 3.4, STONE_WARM)
    p.pagoda(0, -0.5, 0.35, 2.2, 4)
    for sx in (-1.5, 1.5):
        p.cyl(sx, 0.35, 1.2, 0.5, 0.5, 0.9, RED, 4, ry=math.pi / 4)
        p.cyl(sx, 1.25, 1.2, 0.75, 0.1, 0.45, TILE_ROOF, 4, ry=math.pi / 4)
    for k in range(7):
        a = TAU * k / 7
        x, z = math.cos(a) * 2.35, math.sin(a) * 2.35
        m.ball(x, math.sin(a * 3) * 0.3, z, 0.17, 0.22, 0.17, AMBER, 1)
        m.cyl(x, math.sin(a * 3) * 0.3 + 0.2, z, 0.1, 0.05, 0.09, GOLD, 6)
    g.box(0, 0.4, 0.34, 0.5, 0.7, 0.04, LAMP)
    return (0, 3.2, -0.2), "spin"


def site_windmill(p, g, m):
    for x in range(-4, 5):
        for z in range(-1, 4):
            if x * x + z * z < 18 and (abs(x) > 1 or z > 1):
                p.cyl(x * 0.55, 0, z * 0.55, 0.14, 0.0, random.uniform(0.3, 0.55), GINKGO, 5)
    p.cyl(0, 0, -0.6, 1.25, 0.75, 3.4, CREAM, 8)
    p.cyl(0, 3.4, -0.6, 1.0, 0.0, 1.2, TERRA, 8)
    g.box(0, 0.1, 0.5, 0.5, 0.8, 0.12, AMBER)
    p.cyl(0, 3.1, -0.1, 0.18, 0.18, 0.9, WOOD_DARK, 6, rx=math.pi / 2)
    for k in range(4):
        a = TAU * k / 4
        m.box(-math.sin(a) * 0.1, math.cos(a) * 0.1, 0, 0.14, 2.5, 0.08, WOOD, rz=a)
        mat = turn(0, 0, a)
        quad = [mat @ Vector(v) for v in ((0.07, 0.7, 0), (0.62, 0.8, 0), (0.62, 2.45, 0), (0.07, 2.5, 0))]
        m.paint(quad, MARBLE)
    return (0, 3.1, 0.85), "wheel"


def site_mesa(p, g, m):
    for x, z, r, h in ((-0.4, -0.7, 1.9, 3.1), (1.5, 0.6, 1.0, 1.9), (-1.8, 0.9, 0.7, 1.2)):
        layers = 5
        for k in range(layers):
            p.cyl(x + random.uniform(-0.08, 0.08), k * h / layers, z, r * (1 - k * 0.07), r * (0.97 - k * 0.07),
                  h / layers, (TERRA, SAND_DARK, TERRA_DARK)[k % 3], 9)
    p.cyl(-0.4, 3.1, -0.7, 0.07, 0.05, 1.5, WOOD_DARK, 5)
    p.box(-0.4, 4.4, -0.7, 0.9, 0.5, 0.05, RED)
    for k in range(4):
        a = TAU * k / 4
        m.boulder(math.cos(a) * 2.1, math.sin(a) * 2.1, 0.28 + 0.08 * k % 0.3, ROCK, y=math.sin(a * 2) * 0.35)
        g.gem3(-1.8 + k * 0.2, 1.2, 0.9 - k * 0.1, 0.1, 0.45 + k * 0.08, AMBER)
    return (-0.4, 4.2, -0.7), "spin"


def site_port(p, g, m):
    p.cyl(0, 0, 0, 2.6, 2.6, 0.1, WATER, 20)
    p.box(-1.7, 0.1, -0.2, 1.2, 0.28, 3.4, WOOD)
    for k in range(5):
        p.cyl(-1.1, 0, -1.7 + k * 0.75, 0.1, 0.1, 0.75, WOOD_DARK, 6)
    p.box(-1.8, 0.38, -1.0, 0.9, 0.9, 1.1, CREAM)
    p.roof(-1.8, 1.28, -1.0, 1.3, 0.6, 1.5, TILE_ROOF)
    g.box(-1.32, 0.55, -1.0, 0.03, 0.45, 0.35, LAMP)
    for k in range(3):
        p.box(-1.9, 0.38 + 0.0, 0.2 + k * 0.45, 0.35, 0.35, 0.35, WOOD_DARK, ry=k * 0.5)
    # A junk that rocks at the pier.
    for k, (w, y) in enumerate(((0.55, -0.1), (0.85, 0.15), (1.0, 0.4))):
        m.box(0, y, 0, w, 0.27, 2.3 + k * 0.22, WOOD_DARK if k < 2 else RED)
    m.cyl(0, 0.6, -0.2, 0.07, 0.04, 3.0, WOOD, 6)
    for k in range(4):
        m.box(0.0, 1.15 + k * 0.55, -0.15, 0.05, 0.46, 1.5 - k * 0.22, SAND if k % 2 else CORAL)
    m.box(0, 0.65, 1.0, 0.7, 0.45, 0.45, CREAM)
    return (0.75, 0.15, -0.1), "rock"


def site_forest(p, g, m):
    spots = ((-1.9, -0.6, 3.6), (-0.9, -1.7, 4.6), (0.6, -1.5, 3.9), (1.8, -0.7, 4.3), (-1.6, 1.0, 2.2),
             (1.6, 1.1, 2.7), (0.1, -0.4, 2.6))
    for k, (x, z, h) in enumerate(spots):
        p.pine(x, z, h, LEAF_DARK if k % 2 else LEAF)
    for k in range(9):
        a = TAU * k / 9
        x, z = math.cos(a) * 1.5, math.sin(a) * 1.3 + 0.3
        p.cyl(x, 0, z, 0.04, 0.03, 0.22, MARBLE, 5)
        g.dome(x, 0.22, z, 0.16, 0.12, CYAN, 7, 2)
        m.gem3(math.cos(a * 4) * (0.6 + k * 0.18), math.sin(a * 3) * 0.7, math.sin(a * 4) * (0.5 + k * 0.15),
               0.05, 0.12, CYAN if k % 2 else LAMP)
    return (0, 1.6, 0.2), "spin"


def site_lighthouse(p, g, m):
    p.cyl(0, 0, 0, 2.6, 2.6, 0.08, WATER, 20)
    for k in range(6):
        a = TAU * k / 6 + 0.4
        p.boulder(math.cos(a) * 0.9, math.sin(a) * 0.9 - 0.4, 0.62, ROCK_DARK)
    for k in range(5):
        p.cyl(0, 0.5 + k * 0.85, -0.4, 0.8 - k * 0.08, 0.72 - k * 0.08, 0.85, RED if k % 2 else MARBLE, 10)
    p.cyl(0, 4.75, -0.4, 0.65, 0.65, 0.12, BRASS_DARK, 10)
    g.cyl(0, 4.87, -0.4, 0.34, 0.34, 0.6, LAMP, 8)
    for k in range(6):
        a = TAU * k / 6
        p.cyl(math.cos(a) * 0.45, 4.87, -0.4 + math.sin(a) * 0.45, 0.03, 0.03, 0.6, BRASS_DARK, 4)
    p.cyl(0, 5.47, -0.4, 0.62, 0.0, 0.6, RED, 10)
    for side in (-1, 1):
        m.cyl(0, 0, 0, 0.12, 0.5, 2.6, LAMP, 6, rz=side * math.pi / 2)
    return (0, 5.15, -0.4), "spin"


def site_barrens(p, g, m):
    for x, z, h, lean in ((-1.9, -0.3, 2.4, 0.5), (1.7, -1.0, 3.0, -0.4), (0.4, -1.9, 1.7, 0.1)):
        p.cyl(x, 0, z, 0.22, 0.07, h, BARK, 6, rz=lean * 0.4)
        for k in range(3):
            p.cyl(x - math.sin(lean * 0.4) * h * (0.5 + k * 0.18), h * (0.5 + k * 0.18), z, 0.07, 0.01,
                  0.9, BARK, 4, rz=(1 if k % 2 else -1) * 0.9)
    # The ribs of something very large.
    for k in range(6):
        z = -1.5 + k * 0.55
        r = 1.35 - abs(k - 2.5) * 0.16
        p.hoop(0, 0.0, z, r, 0.09, BONE, rx=math.pi / 2, seg=14, start=math.pi, span=math.pi * 0.86)
    p.line([(0, 1.35, -1.7), (0, 1.55, -0.4), (0, 1.25, 1.2)], 0.14, BONE)
    p.ball(0.1, 0.5, 1.9, 0.5, 0.42, 0.62, BONE, 1, 0.08)
    for sx in (-0.2, 0.38):
        g.ball(sx, 0.62, 2.42, 0.09, 0.09, 0.07, AMBER, 1)
    for k in range(8):
        a = TAU * k / 8
        m.boulder(math.cos(a) * 2.3, math.sin(a) * 2.3, 0.1, SAND_DARK, y=math.sin(a * 3) * 0.3)
    return (0, 0.9, 0), "spin"


def site_mire(p, g, m):
    p.cyl(0, 0, 0, 2.6, 2.6, 0.09, c("#4d6b3a"), 18)
    for x, z, h, r in ((-1.2, -0.8, 2.6, 1.15), (1.2, -1.0, 3.5, 1.35), (1.5, 0.9, 1.4, 0.7), (-1.6, 0.9, 1.0, 0.55)):
        p.cyl(x, 0, z, r * 0.28, r * 0.18, h, CREAM, 7)
        p.dome(x, h - 0.15, z, r, r * 0.68, VIOLET, 12, 4)
        p.cyl(x, h - 0.22, z, r * 0.9, r, 0.09, CREAM, 12)
        for k in range(5):
            a = TAU * k / 5 + x
            g.ball(x + math.cos(a) * r * 0.66, h + r * 0.36, z + math.sin(a) * r * 0.66, 0.12, 0.08, 0.12, LAMP, 1)
    for k in range(7):
        a = TAU * k / 7
        p.cyl(math.cos(a) * 2.2, 0, math.sin(a) * 2.2, 0.025, 0.02, random.uniform(0.7, 1.2), MOSS, 4)
        m.ball(math.cos(a) * 1.0, math.sin(a * 2) * 0.35, math.sin(a) * 1.1 + 0.4, 0.09, 0.09, 0.09, c("#b8ff9a"), 1)
    return (0, 1.3, 0.2), "spin"


def site_maw(p, g, m):
    # A cave in the shape of a tiger's head.
    p.ball(0, 1.5, -0.9, 2.4, 2.0, 1.5, AMBER, 2, 0.12)
    p.ball(0, 0.75, 0.2, 1.35, 1.0, 0.65, BLACK, 2)
    for sx in (-1, 1):
        p.cyl(sx * 1.45, 2.8, -0.8, 0.6, 0.05, 1.05, AMBER, 4, rz=-sx * 0.35)
        g.ball(sx * 0.9, 2.35, 0.42, 0.34, 0.2, 0.14, LAMP, 1)
        p.ball(sx * 0.9, 2.35, 0.56, 0.07, 0.17, 0.05, BLACK, 1)
        for k in range(3):
            p.box(sx * (1.9 - k * 0.12), 1.0 + k * 0.45, 0.05 - k * 0.08, 0.7, 0.13, 0.35, BLACK, rz=sx * 0.35)
        p.cyl(sx * 0.75, 1.65, 0.55, 0.19, 0.0, 0.8, BONE, 5, rz=math.pi)
        p.cyl(sx * 0.5, 0.0, 0.8, 0.14, 0.0, 0.55, BONE, 5)
    p.ball(0, 1.95, 0.55, 0.36, 0.22, 0.22, TERRA_DARK, 1)
    for k in range(3):
        p.box(0, 3.15 - k * 0.04, 0.0 - k * 0.15, 0.9 - k * 0.2, 0.11, 0.3, BLACK, rx=-0.5)
    g.ball(0, 0.5, 0.55, 0.45, 0.28, 0.12, CORAL, 1)
    # Behind the head: the stripes of its back, and its tail.
    for x in (-1.5, -0.75, 0.0, 0.75, 1.5):
        wide = math.sqrt(1 - (x / 2.55) ** 2)
        p.line([(x * (1 - 0.04 * k), 1.5 + math.sin(a) * 2.04 * wide, -0.9 - math.cos(a) * 1.54 * wide)
                for k, a in enumerate((-0.35, 0.0, 0.35, 0.7, 1.05))], 0.11, BLACK, 5)
    tail = [(0.5, 0.35, -2.2), (1.5, 0.55, -2.65), (2.35, 1.25, -2.2), (2.55, 2.3, -1.9), (2.15, 3.05, -1.85)]
    for k in range(len(tail) - 1):
        p.line(tail[k:k + 2], 0.3 - k * 0.04, BLACK if k % 2 else AMBER, 7)
    p.ball(2.1, 3.15, -1.85, 0.24, 0.24, 0.24, BONE, 1)
    for k in range(5):
        m.gem3(math.cos(TAU * k / 5) * 0.8, math.sin(k * 2.0) * 0.2, math.sin(TAU * k / 5) * 0.3, 0.09, 0.28, AMBER)
    return (0, 0.7, 1.3), "spin"


def site_summit(p, g, m):
    p.peak(0, 0, -0.5, 2.4, 6.4, STONE_DARK, 9, cap=SNOW)
    p.peak(-1.6, 0, 0.7, 0.9, 2.2, STONE, cap=SNOW)
    p.peak(1.6, 0, 0.5, 1.0, 2.8, STONE, cap=SNOW)
    last = None
    for k in range(22):
        a = math.pi * 0.5 + k * 0.42
        r = 2.0 * (1 - k / 27)
        here = (math.cos(a) * r, 0.25 + k * 0.2, math.sin(a) * r - 0.5)
        p.box(here[0], here[1], here[2], 0.42, 0.09, 0.3, STONE_WARM, ry=-a)
        last = here
    g.ball(0, 7.1, -0.5, 0.28, 0.28, 0.28, LAMP, 2)
    for k, (r, tilt) in enumerate(((1.15, 0.35), (0.85, -0.5))):
        m.hoop(0, k * 0.1, 0, r, 0.045, GOLD, rx=tilt, rz=tilt * 0.6)
    return (0, 7.1, -0.5), "spin"


def site_nexus(p, g, m):
    p.cyl(0, 0, 0, 2.5, 2.3, 0.25, SLATE, 8)
    for r in (2.0, 1.35, 0.7):
        g.hoop(0, 0.28, 0, r, 0.035, CYAN, seg=8 if r > 1 else 16)
    for k in range(6):
        a = TAU * k / 6
        h = 1.2 + (k % 3) * 0.7
        p.box(math.cos(a) * 2.1, 0.2, math.sin(a) * 2.1, 0.3, h, 0.3, NAVY, ry=-a)
        g.box(math.cos(a) * 2.1, 0.2 + h, math.sin(a) * 2.1, 0.34, 0.12, 0.34, CYAN, ry=-a)
    for k in range(3):
        s = 1.5 - k * 0.42
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.line([(sx * s / 2, sy * s / 2, -s / 2), (sx * s / 2, sy * s / 2, s / 2)], 0.035, CYAN if k != 1 else VIOLET, 4)
                m.line([(sx * s / 2, -s / 2, sy * s / 2), (sx * s / 2, s / 2, sy * s / 2)], 0.035, CYAN if k != 1 else VIOLET, 4)
                m.line([(-s / 2, sx * s / 2, sy * s / 2), (s / 2, sx * s / 2, sy * s / 2)], 0.035, CYAN if k != 1 else VIOLET, 4)
    m.gem3(0, -0.35, 0, 0.24, 0.7, WHITE, sides=4)
    return (0, 2.9, 0), "tumble"


def site_isles(p, g, m):
    p.cyl(0, 0, 0, 2.7, 2.7, 0.07, WATER_DEEP, 22)
    for x, z, r in ((-1.3, -0.9, 1.0), (1.3, -0.6, 0.85), (0.1, 1.1, 0.7), (-1.7, 1.0, 0.4), (1.8, 1.0, 0.35)):
        p.cyl(x, 0, z, r, r * 0.78, 0.32, NAVY, 9)
        p.cyl(x, 0.32, z, r * 0.78, r * 0.6, 0.14, SLATE, 9)
        g.hoop(x, 0.1, z, r * 1.08, 0.025, CYAN, seg=24)
        for _ in range(int(r * 4)):
            a = random.uniform(0, TAU)
            p.gem3(x + math.cos(a) * r * 0.4, 0.4, z + math.sin(a) * r * 0.4, 0.16, random.uniform(0.6, 1.9) * r,
                   BLACK if random.random() < 0.5 else SLATE, rz=random.uniform(-0.25, 0.25))
    for k in range(6):
        a = TAU * k / 6
        m.ball(math.cos(a) * 1.7, math.sin(a * 2) * 0.4, math.sin(a) * 1.7, 0.13, 0.04, 0.13, c("#ffffff"), 1)
        m.gem3(math.cos(a) * 1.7, math.sin(a * 2) * 0.4 + 0.03, math.sin(a) * 1.7, 0.05, 0.3, CYAN)
    return (0, 2.1, 0), "spin"


def site_tethys(p, g, m):
    p.cyl(0, 0, 0, 2.6, 2.2, 0.35, NAVY, 12)
    p.cyl(0, 0.35, 0, 1.5, 1.1, 0.3, SLATE, 12)
    for k in range(5):
        a = TAU * k / 5 + 0.3
        base = Vector((math.cos(a) * 2.0, 0.3, math.sin(a) * 2.0))
        mid = Vector((math.cos(a) * 2.35, 2.2, math.sin(a) * 2.35))
        tip = Vector((math.cos(a) * 1.35, 4.3, math.sin(a) * 1.35))
        p.line([base, mid, tip], 0.16, STEEL, 6)
        g.ball(tip.x, tip.y, tip.z, 0.2, 0.2, 0.2, CYAN, 1)
        g.line([(math.cos(a) * 1.45, 0.66, math.sin(a) * 1.45), (math.cos(a) * 0.3, 0.68, math.sin(a) * 0.3)], 0.03, CYAN, 4)
    m.ball(0, 0, 0, 0.75, 0.75, 0.75, CYAN, 2)
    m.hoop(0, 0, 0, 1.15, 0.05, WHITE, rx=0.4)
    m.hoop(0, 0, 0, 1.35, 0.04, VIOLET, rz=1.1)
    m.hoop(0, 0, 0, 1.55, 0.035, CYAN, rx=-0.9, rz=-0.4)
    return (0, 2.7, 0), "tumble"


def house(p, g, x, z, w, h, wall, roof=TERRA, ry=0.0):
    p.box(x, 0, z, w, h, w * 0.9, wall, ry=ry)
    p.roof(x, h, z, w * 1.15, w * 0.45, w * 1.1, roof, ry=ry)
    g.box(x + math.sin(ry) * w * 0.46, h * 0.45, z + math.cos(ry) * w * 0.46, w * 0.22, h * 0.25, 0.04, LAMP, ry=ry)


def site_dome(p, g, m):
    p.box(0, 0, -0.6, 2.2, 1.9, 1.8, MARBLE)
    p.cyl(0, 1.9, -0.6, 0.95, 0.95, 0.7, CREAM, 12)
    p.dome(0, 2.6, -0.6, 1.05, 1.35, TERRA, 12, 5)
    p.cyl(0, 3.92, -0.6, 0.18, 0.18, 0.4, MARBLE, 8)
    p.cyl(0, 4.3, -0.6, 0.22, 0.0, 0.5, GOLD, 8)
    for k in range(4):
        p.cyl(-0.9 + k * 0.6, 0, 0.45, 0.11, 0.09, 1.5, MARBLE, 8)
    p.roof(0, 1.5, 0.4, 2.3, 0.55, 0.6, CREAM)
    g.box(0, 0.05, 0.32, 0.5, 1.0, 0.04, AMBER)
    p.box(1.85, 0, -0.9, 0.8, 4.6, 0.8, SAND)
    p.box(1.85, 4.6, -0.9, 0.95, 0.12, 0.95, MARBLE)
    p.cyl(1.85, 4.72, -0.9, 0.68, 0.0, 1.1, TILE_ROOF, 4, ry=math.pi / 4)
    g.box(1.85, 3.7, -0.48, 0.34, 0.6, 0.04, LAMP)
    house(p, g, -1.85, -0.3, 0.9, 1.2, SAND_DARK, ry=0.4)
    house(p, g, -1.7, 1.0, 0.7, 0.8, CORAL, ry=0.7)
    house(p, g, 1.8, 0.7, 0.75, 1.0, CREAM, ry=-0.6)
    for k in range(7):
        a = TAU * k / 7
        m.ball(math.cos(a) * 1.5, math.sin(a * 2) * 0.3, math.sin(a) * 1.5, 0.07, 0.05, 0.17, WHITE, 1)
        m.box(math.cos(a) * 1.5, math.sin(a * 2) * 0.3, math.sin(a) * 1.5, 0.5, 0.02, 0.1, WHITE, ry=-a)
    return (0, 5.3, -0.6), "spin"


def site_vault(p, g, m):
    p.box(0, 0, -0.9, 4.2, 3.6, 1.2, STONE_WARM)
    p.box(0, 3.6, -0.9, 4.6, 0.35, 1.5, MARBLE)
    p.roof(0, 3.95, -0.9, 4.6, 0.9, 1.5, TERRA_DARK)
    for sx in (-1.8, 1.8):
        p.cyl(sx, 0, -0.1, 0.3, 0.26, 3.6, MARBLE, 10)
    p.cyl(0, 1.75, -0.35, 1.5, 1.5, 0.22, BRASS_DARK, 20, rx=math.pi / 2)
    p.cyl(0, 1.75, -0.18, 1.25, 1.2, 0.18, BRASS, 20, rx=math.pi / 2)
    for k in range(12):
        a = TAU * k / 12
        g.ball(math.cos(a) * 1.37, 1.75 + math.sin(a) * 1.37, -0.1, 0.07, 0.07, 0.07, LAMP, 1)
    m.hoop(0, 0, 0, 0.7, 0.08, GOLD, rx=math.pi / 2)
    for k in range(3):
        a = TAU * k / 6
        m.line([(math.cos(a) * -0.85, math.sin(a) * -0.85, 0), (math.cos(a) * 0.85, math.sin(a) * 0.85, 0)], 0.06, GOLD)
    for x, n in ((-1.5, 6), (-1.0, 3), (1.4, 8), (1.85, 4)):
        for k in range(n):
            p.cyl(x + random.uniform(-0.03, 0.03), k * 0.09, 1.1, 0.24, 0.24, 0.07, GOLD, 9)
    return (0, 1.75, 0.12), "wheel"


def arch(p, x, z, y, wide, high, color, thick=0.18, ry=0.0):
    ox, oz = math.cos(ry), -math.sin(ry)
    for s in (-1, 1):
        p.box(x + ox * s * wide / 2, y, z + oz * s * wide / 2, thick * 1.6, high, thick * 1.6, color, ry=ry)
    points = [(x + ox * math.cos(math.pi * k / 8) * wide / 2, y + high + math.sin(math.pi * k / 8) * wide / 2,
               z + oz * math.cos(math.pi * k / 8) * wide / 2) for k in range(9)]
    p.line(points, thick, color, 6)


def site_chapel(p, g, m):
    for k, high in enumerate((2.6, 1.9, 1.1)):
        arch(p, 0, -1.6 + k * 1.2, 0, 2.2 - k * 0.1, high, STONE if k else STONE_DARK)
    p.box(0, 0, -2.0, 2.8, 2.2, 0.25, STONE_DARK)
    g.cyl(0, 2.9, -1.9, 0.6, 0.6, 0.06, CRYSTAL, 12, rx=math.pi / 2)
    p.hoop(0, 2.9, -1.82, 0.62, 0.07, STONE, rx=math.pi / 2)
    for _ in range(12):
        x, z = random.choice((-1, 1)) * random.uniform(1.5, 2.4), random.uniform(-1.2, 1.4)
        p.box(x, 0, z, 0.32, random.uniform(0.35, 0.75), 0.12, STONE, ry=random.uniform(-0.5, 0.5), rz=random.uniform(-0.2, 0.2))
    m.hoop(0, 0.45, 0, 0.32, 0.04, LAMP)
    m.ball(0, 0, 0, 0.17, 0.26, 0.17, LAMP, 1)
    return (0, 2.2, 0.2), "bob"


def site_sanctuary(p, g, m):
    p.cyl(0, 0, 0, 2.6, 2.5, 0.18, MARBLE, 20)
    p.cyl(0, 0.18, 0, 1.9, 1.8, 0.18, CREAM, 20)
    for k in range(8):
        a = TAU * (k + 0.5) / 8
        if 0.5 < a % TAU < 2.6:
            continue
        p.cyl(math.cos(a) * 1.65, 0.36, math.sin(a) * 1.65, 0.17, 0.14, 2.5, MARBLE, 9)
        p.cyl(math.cos(a) * 1.65, 2.86, math.sin(a) * 1.65, 0.25, 0.25, 0.14, GOLD, 9)
    p.hoop(0, 3.1, 0, 1.65, 0.15, MARBLE, seg=24, start=math.pi * 0.85, span=math.pi * 1.3)
    p.cyl(0, 0.36, -0.3, 0.55, 0.4, 0.55, STONE_WARM, 10)
    g.gem3(0, 0.95, -0.3, 0.3, 1.1, LAMP)
    for k in range(3):
        m.hoop(0, k * 0.42, 0, 1.0 - k * 0.24, 0.04, GOLD, rz=0.12 * (k - 1))
    return (0, 3.4, -0.2), "spin"


def site_sails(p, g, m):
    p.cyl(0, 0, -0.4, 1.6, 1.3, 0.45, STONE_WARM, 12)
    for x, z, h, col in ((-1.1, -0.6, 4.0, MARBLE), (0.25, -1.2, 4.9, CORAL), (1.4, -0.2, 3.3, CREAM)):
        p.cyl(x, 0.3, z, 0.08, 0.04, h, WOOD, 6)
        points = [Vector((x, 0.9, z)), Vector((x + 1.0, h * 0.5, z + 0.35)), Vector((x, h + 0.2, z))]
        p.paint([points[0], points[1], points[2]], col)
        p.paint([points[2], Vector((x - 0.5, h * 0.6, z - 0.2)), points[0]], TILE_ROOF)
        g.ball(x, h + 0.35, z, 0.1, 0.1, 0.1, LAMP, 1)
    for k in range(9):
        a = TAU * k / 9
        x, z = math.cos(a) * 1.0, math.sin(a) * 1.0
        m.line([(x, 0, z), (x, -0.25 - (k % 3) * 0.12, z)], 0.008, MARBLE, 3)
        m.cyl(x, -0.75 - (k % 3) * 0.12, z, 0.07, 0.07, 0.5, BRASS_LIGHT, 6)
    m.hoop(0, 0, 0, 1.0, 0.04, WOOD)
    return (0, 2.5, 1.0), "sway"


def site_skytemple(p, g, m):
    p.cyl(0, 0, 0, 1.9, 1.7, 0.25, STONE, 12)
    g.hoop(0, 0.28, 0, 1.3, 0.04, CYAN)
    for k in range(3):
        g.cyl(math.cos(TAU * k / 3) * 0.7, 0.25, math.sin(TAU * k / 3) * 0.7, 0.07, 0.02, 2.2, FOAM, 5)
    # The temple that floats on its own cloud.
    for k in range(7):
        a = TAU * k / 7
        m.ball(math.cos(a) * 1.35, -0.15, math.sin(a) * 1.2, 0.8, 0.38, 0.7, WHITE, 1, 0.07)
    m.cyl(0, -0.9, 0, 0.05, 1.5, 0.85, STONE_WARM, 9)
    m.cyl(0, -0.05, 0, 1.5, 1.5, 0.16, MARBLE, 12)
    for k in range(6):
        a = TAU * k / 6
        m.cyl(math.cos(a) * 0.95, 0.1, math.sin(a) * 0.95, 0.11, 0.09, 1.2, MARBLE, 7)
    m.cyl(0, 1.3, 0, 1.2, 1.2, 0.15, CREAM, 12)
    m.dome(0, 1.45, 0, 0.9, 0.9, TILE_ROOF, 12, 4)
    m.gem3(0, 2.3, 0, 0.12, 0.6, GOLD)
    return (0, 3.0, -0.2), "bob"


def site_oak(p, g, m):
    p.cyl(0, 0, -0.7, 0.85, 0.5, 2.6, BARK, 9)
    for k in range(7):
        a = TAU * k / 7
        p.cyl(math.cos(a) * 0.55, 0, -0.7 + math.sin(a) * 0.55, 0.28, 0.04, 1.15, BARK, 5,
              rx=math.sin(a) * 1.35, rz=-math.cos(a) * 1.35)
    for x, y, z, r in ((0, 4.1, -0.8, 1.7), (-1.4, 3.3, -0.4, 1.1), (1.4, 3.5, -0.9, 1.15), (0.3, 3.2, 0.3, 0.85), (-0.4, 5.1, -0.9, 0.95)):
        p.line([(0, 2.2, -0.7), (x * 0.7, y - r * 0.4, z)], 0.16, BARK)
        p.ball(x, y, z, r, r * 0.7, r, random.choice((LEAF, LEAF_LIGHT, LEAF_DARK)), 2, 0.14)
    g.ball(0, 0.75, 0.1, 0.3, 0.5, 0.1, LAMP, 1)
    p.box(-1.5, 0.55, 0.8, 0.9, 0.08, 0.35, WOOD)
    for k in range(10):
        a = TAU * k / 10
        m.ball(math.cos(a) * (1.4 + (k % 3) * 0.35), math.sin(a * 3) * 0.8, math.sin(a) * 1.4, 0.13, 0.03, 0.09, GINKGO, 1)
    return (0, 2.4, -0.4), "spin"


def site_waterfall(p, g, m):
    for x, z, h in ((-1.5, -1.0, 3.2), (0.0, -1.4, 4.4), (1.5, -1.0, 2.6)):
        p.cyl(x, 0, z, 1.05, 0.85, h, STONE_DARK if x else ROCK, 7)
        p.cyl(x, h, z, 0.9, 0.75, 0.18, LEAF_LIGHT, 7)
        p.tree(x - 0.2, z - 0.2, 1.0, LEAF, y=h + 0.1)
    g.box(0.0, 0.1, -0.5, 0.75, 4.35, 0.08, FOAM, rx=-0.035)
    g.box(-1.35, 0.1, -0.05, 0.4, 3.05, 0.06, FOAM, rx=-0.06)
    p.cyl(0, 0, 0.5, 2.0, 2.0, 0.12, WATER, 18)
    for k in range(10):
        a = TAU * k / 10
        m.ball(math.cos(a) * (0.35 + (k % 3) * 0.22), 0.0, math.sin(a) * 0.45, 0.16, 0.12, 0.16, WHITE, 1, 0.03)
    return (0.0, 0.22, -0.2), "bob"


def site_curls(p, g, m):
    p.cyl(0, 0, 0, 2.7, 2.7, 0.07, WATER, 22)
    for x, z, size, spin, col in ((-0.2, -0.6, 1.0, 1, CREAM), (-1.6, 0.8, 0.5, -1, PINK), (1.6, 0.6, 0.62, 1, SAND)):
        points = []
        for k in range(42):
            a = k * 0.36 * spin
            r = size * 1.35 * (1 - k / 46)
            points.append((x + math.cos(a) * r, 0.2 + k * 0.095 * size, z + math.sin(a) * r))
        for k in range(41):
            p.line(points[k:k + 2], size * 0.3 * (1 - k / 50), col, 6)
        g.ball(points[-1][0], points[-1][1] + 0.15, points[-1][2], 0.13, 0.13, 0.13, LAMP, 1)
    for k in range(5):
        a = TAU * k / 5
        m.ball(math.cos(a) * 2.0, 0, math.sin(a) * 2.0, 0.12, 0.2, 0.42, CORAL, 1)
        m.cyl(math.cos(a) * 2.0 + math.sin(a) * 0.45, 0, math.sin(a) * 2.0 - math.cos(a) * 0.45, 0.2, 0.0, 0.25, CORAL, 4, rx=1.57)
    return (0, 0.25, 0), "spin"


def site_shaft(p, g, m):
    p.hoop(0, 0.22, 0, 1.75, 0.28, STONE, seg=16, sides=4)
    p.cyl(0, 0, 0, 1.6, 1.6, 0.08, BLACK, 16)
    for k, r in enumerate((1.25, 0.85, 0.45)):
        g.hoop(0, 0.1 + k * 0.006, 0, r, 0.045, (AMBER, CORAL, BLOOD)[k], seg=16, sides=4)
    for sx in (-1.9, 1.9):
        p.cyl(sx, 0, -0.4, 0.2, 0.15, 3.3, WOOD_DARK, 6, rz=sx * 0.07)
    p.box(0, 3.1, -0.4, 4.1, 0.28, 0.28, WOOD)
    p.hoop(0, 2.75, -0.4, 0.34, 0.07, BRASS_DARK, rx=math.pi / 2)
    m.line([(0, 1.1, 0), (0, 0.15, 0)], 0.03, WOOD_DARK)
    m.cyl(0, -0.65, 0, 0.42, 0.55, 0.75, WOOD, 8)
    m.hoop(0, 0.0, 0, 0.54, 0.04, BRASS)
    m.gem3(0, 0.0, 0, 0.2, 0.55, CYAN)
    return (0, 1.65, -0.4), "bob"


def site_aviary(p, g, m):
    p.cyl(0, 0, -0.5, 1.7, 1.5, 0.5, STONE_WARM, 12)
    for k in range(12):
        a = TAU * k / 12
        points = [(math.cos(a) * 1.4 * math.cos(math.pi / 2 * s / 7), 0.5 + (2.0 if s else 0) + math.sin(math.pi / 2 * s / 7) * 1.6,
                   -0.5 + math.sin(a) * 1.4 * math.cos(math.pi / 2 * s / 7)) for s in range(8)]
        p.line(points, 0.045, BRASS, 4)
    p.hoop(0, 2.5, -0.5, 1.4, 0.07, BRASS_DARK)
    p.cyl(0, 4.1, -0.5, 0.14, 0.0, 0.6, GOLD, 7)
    p.tree(0, -0.5, 2.3, LEAF_LIGHT, y=0.5)
    g.ball(0.45, 2.5, -0.1, 0.14, 0.17, 0.14, LAMP, 1)
    for k, col in enumerate((CORAL, CYAN, GINKGO, PINK, WHITE, VIOLET)):
        a = TAU * k / 6
        x, y, z = math.cos(a) * 2.2, math.sin(a * 2) * 0.55, math.sin(a) * 2.2
        m.ball(x, y, z, 0.1, 0.1, 0.2, col, 1)
        m.box(x, y, z, 0.62, 0.025, 0.16, col, ry=-a, rz=0.2)
    return (0, 2.7, -0.4), "spin"


def site_fountain(p, g, m):
    p.cyl(0, 0, 0, 2.5, 2.5, 0.5, MARBLE, 16)
    p.cyl(0, 0.5, 0, 2.25, 2.25, 0.06, WATER, 16)
    p.cyl(0, 0.5, 0, 0.35, 0.28, 1.4, MARBLE, 10)
    p.cyl(0, 1.9, 0, 0.4, 1.2, 0.35, CREAM, 14)
    p.cyl(0, 2.25, 0, 1.1, 1.1, 0.05, WATER, 14)
    p.cyl(0, 2.3, 0, 0.17, 0.13, 0.9, MARBLE, 8)
    p.cyl(0, 3.2, 0, 0.18, 0.62, 0.22, CREAM, 12)
    g.gem3(0, 3.5, 0, 0.18, 0.7, CYAN)
    for k in range(8):
        a = TAU * k / 8
        g.line([(math.cos(a) * 0.55, 3.4, math.sin(a) * 0.55), (math.cos(a) * 0.95, 3.3, math.sin(a) * 0.95),
                (math.cos(a) * 1.08, 2.32, math.sin(a) * 1.08)], 0.035, FOAM, 4)
        g.line([(math.cos(a) * 1.15, 2.2, math.sin(a) * 1.15), (math.cos(a) * 1.6, 1.8, math.sin(a) * 1.6),
                (math.cos(a) * 1.8, 0.58, math.sin(a) * 1.8)], 0.045, FOAM, 4)
        m.ball(math.cos(a) * 1.55, 0, math.sin(a) * 1.55, 0.2, 0.025, 0.2, LEAF_LIGHT, 1)
        m.gem3(math.cos(a) * 1.55, 0.02, math.sin(a) * 1.55, 0.09, 0.2, PINK)
    return (0, 0.62, 0), "spin"


def site_colosseum(p, g, m):
    for level, (r, count) in enumerate(((2.45, 16), (2.2, 14))):
        for k in range(count):
            a = TAU * k / count
            # The front is open, and the upper floor is broken.
            if abs(a - math.pi / 2) < 0.75 or (level and 3.4 < a < 4.5):
                continue
            x, z = math.cos(a) * r, math.sin(a) * r
            arch(p, x, z, level * 1.45, TAU * r / count * 0.78, 0.75, SAND if level else STONE_WARM, 0.12, ry=-a - math.pi / 2)
            p.box(x, level * 1.45 + 1.22, z, 0.35, 0.22, TAU * r / count, STONE_WARM, ry=-a)
    p.cyl(0, 0, 0, 1.8, 1.8, 0.08, SAND_DARK, 18)
    g.hoop(0, 0.1, 0, 1.2, 0.035, AMBER)
    m.box(0, -0.7, 0, 0.16, 1.5, 0.05, MARBLE)
    m.gem3(0, -0.72, 0, 0.14, 0.3, MARBLE, rz=math.pi)
    m.box(0, 0.8, 0, 0.75, 0.13, 0.14, GOLD)
    m.cyl(0, 0.9, 0, 0.06, 0.06, 0.42, WOOD_DARK, 6)
    m.ball(0, 1.4, 0, 0.12, 0.12, 0.12, GOLD, 1)
    return (0, 2.4, 0), "spin"


def gear(shape, x, y, z, r, color, teeth=10, thick=0.26):
    shape.cyl(x, y, z - thick / 2, r, r, thick, color, teeth * 2, rx=math.pi / 2)
    for k in range(teeth):
        a = TAU * k / teeth
        shape.box(x + math.cos(a) * r, y + math.sin(a) * r - r * 0.12, z, r * 0.34, r * 0.24, thick * 0.9, color, rz=a)
    shape.cyl(x, y, z + thick / 2, r * 0.28, r * 0.28, 0.08, BRASS_DARK, 10, rx=math.pi / 2)


def site_factory(p, g, m):
    p.box(-0.2, 0, -1.2, 3.2, 1.9, 1.4, SLATE)
    for k in range(3):
        p.roof(-1.25 + k * 1.05, 1.9, -1.2, 1.4, 0.55, 1.0, STEEL, ry=math.pi / 2)
    for sx, h in ((1.8, 4.6), (1.05, 3.8)):
        p.cyl(sx, 0, -1.7, 0.35, 0.27, h, TERRA_DARK, 10)
        p.cyl(sx, h, -1.7, 0.34, 0.34, 0.18, BRASS_DARK, 10)
        for k in range(3):
            p.ball(sx + 0.15 * k, h + 0.5 + k * 0.55, -1.7, 0.28 + k * 0.1, 0.24 + k * 0.08, 0.28, STONE, 1, 0.04)
    for k in range(4):
        g.box(-1.4 + k * 0.75, 0.55, -0.48, 0.38, 0.55, 0.04, CYAN)
    gear(p, -1.7, 0.85, 0.2, 0.75, BRASS)
    gear(p, 1.65, 0.6, 0.35, 0.5, BRASS_DARK, 8)
    gear(m, 0, 0, 0, 1.0, BRASS_LIGHT, 12)
    return (0.0, 1.5, 0.0), "wheel"


def site_thorns(p, g, m):
    for k in range(4):
        p.cyl(0, k * 0.32, -0.5, 2.2 - k * 0.35, 2.05 - k * 0.35, 0.32, BLOOD if k % 2 else TERRA_DARK, 10)
    for k in range(9):
        a = TAU * k / 9
        r = random.uniform(0.7, 1.6)
        base = (math.cos(a) * r, 0.6, -0.5 + math.sin(a) * r * 0.8)
        points = [base]
        for s in range(1, 6):
            curl = s * 0.55
            points.append((base[0] + math.cos(a) * math.sin(curl) * 0.55, 0.6 + s * 0.5,
                           base[2] + math.sin(a) * math.sin(curl) * 0.55))
        for s in range(5):
            p.line(points[s:s + 2], 0.17 - s * 0.028, c("#5a1630"), 5)
        g.ball(points[-1][0], points[-1][1], points[-1][2], 0.09, 0.09, 0.09, CORAL, 1)
    p.cyl(0, 1.25, -0.5, 0.18, 0.12, 1.4, BLOOD, 6)
    m.gem3(0, -0.6, 0, 0.45, 1.3, c("#ff4d6d"), sides=6)
    m.hoop(0, 0, 0, 0.85, 0.035, GOLD, rx=0.3)
    return (0, 3.9, -0.5), "spin"


def site_pad(p, g, m):
    p.cyl(0, 0, 0.1, 2.4, 2.3, 0.3, STEEL, 8)
    g.hoop(0, 0.33, 0.1, 1.75, 0.05, CYAN, seg=8, sides=4)
    g.box(-0.45, 0.31, 0.1, 0.16, 0.03, 1.1, LAMP)
    g.box(0.45, 0.31, 0.1, 0.16, 0.03, 1.1, LAMP)
    g.box(0, 0.31, 0.1, 0.9, 0.03, 0.16, LAMP)
    p.box(-1.85, 0, -1.4, 0.9, 2.4, 0.9, SLATE)
    p.cyl(-1.85, 2.4, -1.4, 0.65, 0.75, 0.6, STEEL, 8)
    g.hoop(-1.85, 2.72, -1.4, 0.74, 0.07, CYAN, seg=8, sides=4)
    p.cyl(-1.85, 3.0, -1.4, 0.03, 0.02, 1.4, STEEL, 4)
    for k in range(3):
        p.box(1.6 + k * 0.1, 0.0 + k * 0.42, -1.3, 0.75 - k * 0.1, 0.42, 0.75 - k * 0.1, CORAL if k % 2 else SNOW, ry=k * 0.4)
    # A shuttle that comes and goes.
    m.ball(0, 0, 0, 0.55, 0.42, 1.25, SNOW, 2)
    m.ball(0, 0.18, 0.7, 0.3, 0.24, 0.42, CYAN, 1)
    for sx in (-1, 1):
        m.box(sx * 0.85, -0.1, -0.25, 1.1, 0.07, 0.6, CORAL, rz=sx * -0.18)
        m.cyl(sx * 0.42, -0.1, -1.0, 0.18, 0.24, 0.55, STEEL, 8, rx=-math.pi / 2)
        m.cyl(sx * 0.42, -0.1, -1.55, 0.18, 0.0, 0.5, AMBER, 6, rx=-math.pi / 2)
    return (0, 2.2, 0.1), "bob"


def site_horn(p, g, m):
    p.peak(-0.6, 0, -1.0, 2.0, 4.2, ICE_DEEP, 8, cap=SNOW)
    p.peak(1.4, 0, -0.8, 1.3, 2.6, STONE_DARK, cap=SNOW)
    # The great horn that rests on the mountain.
    points = [(-1.7, 3.0, -0.3), (-1.0, 2.4, 0.35), (0.0, 2.15, 0.7), (1.0, 2.4, 0.8), (1.75, 3.1, 0.65), (2.1, 3.9, 0.35)]
    for k in range(len(points) - 1):
        p.line(points[k:k + 2], 0.09 + k * 0.1, BRASS if k % 2 else BRASS_LIGHT, 8)
    p.hoop(2.14, 4.0, 0.32, 0.68, 0.1, GOLD, rz=-0.42, rx=-0.25)
    for x in (-0.6, 0.8):
        p.cyl(x, 0, 0.7, 0.16, 0.12, 2.2, STONE, 6)
    for k, r in enumerate((0.45, 0.75, 1.05)):
        m.hoop(0, k * 0.38, 0, r, 0.035, CYAN, rx=0.0)
    return (2.3, 4.35, 0.25), "pulse"


def site_crash(p, g, m):
    p.hoop(0, 0.05, 0, 2.1, 0.32, SLATE, seg=18, sides=4)
    mat = turn(0.15, 0.5, 0.7)

    def at(x, y, z):
        return mat @ Vector((x, y, z)) + Vector((0.2, 1.1, -0.5))

    for k in range(6):
        w0, w1 = 0.85 - abs(k - 2) * 0.13, 0.85 - abs(k - 1) * 0.13
        low = [at(math.cos(TAU * i / 8) * w0, -1.6 + k * 0.62, math.sin(TAU * i / 8) * w0) for i in range(8)]
        high = [at(math.cos(TAU * i / 8) * w1, -0.98 + k * 0.62, math.sin(TAU * i / 8) * w1) for i in range(8)]
        for i in range(8):
            p.paint([low[i], low[(i + 1) % 8], high[(i + 1) % 8], high[i]], CORAL if k == 3 else STEEL)
    for sx in (-1, 1):
        p.paint([at(sx * 0.7, -1.0, 0), at(sx * 2.1, -1.6, 0), at(sx * 0.7, 0.4, 0)], SNOW)
    g.ball(*at(0, 0.9, 0.62), 0.28, 0.28, 0.2, CYAN, 1)
    for _ in range(14):
        a, r = random.uniform(0, TAU), random.uniform(1.0, 2.6)
        p.box(math.cos(a) * r, 0, math.sin(a) * r, random.uniform(0.15, 0.45), random.uniform(0.08, 0.25),
              random.uniform(0.15, 0.35), STEEL if a % 1 > 0.5 else SLATE, ry=a, rz=random.uniform(-0.4, 0.4))
    for k in range(3):
        g.gem3(-1.1 + k * 0.35, 0.0, 0.9 - k * 0.2, 0.14, 0.55 + k * 0.2, VIOLET, rz=0.2 - k * 0.2)
    for k in range(6):
        a = TAU * k / 6
        m.gem3(math.cos(a) * 1.8, math.sin(a * 2) * 0.5, math.sin(a) * 1.8, 0.08, 0.3, LAMP)
    return (0, 2.3, -0.3), "spin"


def site_runes(p, g, m):
    for k in range(9):
        a = TAU * k / 9
        if abs(a - math.pi / 2) < 0.3:
            continue
        h = 1.4 + (k * 7 % 4) * 0.45
        x, z = math.cos(a) * 2.2, math.sin(a) * 2.2
        p.box(x, 0, z, 0.35, h, 0.7, STONE_DARK, ry=-a, rz=0.05 * (k % 3 - 1))
        p.box(x, h, z, 0.4, 0.14, 0.75, SNOW, ry=-a)
        for s in range(3):
            g.box(x - math.cos(a) * 0.19, 0.4 + s * 0.35, z - math.sin(a) * 0.19, 0.04, 0.2, 0.08 + (s + k) % 3 * 0.1, CYAN, ry=-a)
    arch(p, 0, -0.9, 0, 1.6, 1.5, STONE, 0.17)
    for x, z in ((-1.0, 0.3), (1.2, -0.2)):
        p.pine(x, z, 1.7, LEAF_DARK, snow=SNOW)
    m.hoop(0, 0, 0, 0.55, 0.04, CYAN, rx=math.pi / 2)
    m.hoop(0, 0, 0, 0.33, 0.03, WHITE, rx=math.pi / 2)
    for k in range(6):
        a = TAU * k / 6
        m.box(math.cos(a) * 0.44 , math.sin(a) * 0.44 - 0.09, 0, 0.05, 0.18, 0.03, CYAN, rz=a)
    return (0, 1.65, -0.9), "wheel"


def site_frozenwood(p, g, m):
    p.cyl(0, 0, 0, 2.6, 2.6, 0.08, ICE, 18)
    for x, z, h in ((-1.7, -0.8, 3.4), (-0.5, -1.8, 4.2), (1.0, -1.4, 3.0), (1.9, -0.1, 3.8), (-1.5, 1.1, 2.0), (1.3, 1.2, 1.7)):
        p.cyl(x, 0, z, 0.19, 0.05, h, c("#3d5a78"), 6, rz=random.uniform(-0.1, 0.1))
        for k in range(4):
            side = 1 if k % 2 else -1
            y = h * (0.4 + k * 0.14)
            p.cyl(x, y, z, 0.06, 0.01, h * 0.28, c("#3d5a78"), 4, rz=side * 1.0, ry=k)
            g.gem3(x + math.cos(-k) * side * -h * 0.22, y + h * 0.1, z + math.sin(-k) * side * -h * 0.22, 0.09, 0.28, ICE)
    for k in range(3):
        p.hoop(0, 0.1, 0.1, 0.6 + k * 0.5, 0.05, FOAM, seg=22, sides=4)
    for k in range(5):
        a = TAU * k / 5
        m.ball(math.cos(a) * 1.2, math.sin(a * 2) * 0.35, math.sin(a) * 1.2, 0.07, 0.13, 0.35, CYAN, 1)
        m.cyl(math.cos(a) * 1.2 + math.sin(a) * 0.4, math.sin(a * 2) * 0.35, math.sin(a) * 1.2 - math.cos(a) * 0.4,
              0.13, 0.0, 0.2, CYAN, 4, rx=1.57, ry=-a)
    return (0, 1.5, 0), "spin"


def site_dock(p, g, m):
    p.box(0, 0, -0.8, 3.0, 0.4, 2.0, STEEL)
    p.cyl(-1.0, 0.4, -1.2, 0.85, 0.85, 0.9, SNOW, 10)
    p.dome(-1.0, 1.3, -1.2, 0.85, 0.65, CORAL, 10, 3)
    g.box(-1.0, 0.45, -0.34, 0.45, 0.6, 0.04, LAMP)
    p.cyl(1.1, 0.4, -1.0, 0.1, 0.07, 3.8, SLATE, 6)
    p.box(0.55, 3.8, -1.0, 1.4, 0.12, 0.12, SLATE)
    for k in range(5):
        g.ball(-1.6 + k * 0.8, 0.5, 0.35, 0.09, 0.09, 0.09, LAMP if k % 2 else CYAN, 1)
        p.cyl(-1.6 + k * 0.8, 0.0, 0.35, 0.04, 0.04, 0.45, SLATE, 5)
    # A balloon that is moored to the crane.
    m.ball(0, 0.9, 0, 0.8, 0.95, 0.8, CORAL, 2)
    for k in range(6):
        m.hoop(0, 0.9, 0, 0.81, 0.025, SNOW, rx=math.pi / 2, ry=TAU * k / 12)
    m.box(0, -0.55, 0, 0.55, 0.35, 0.55, WOOD)
    for sx in (-0.25, 0.25):
        m.line([(sx, -0.2, 0), (sx * 2.0, 0.4, 0)], 0.015, WOOD_DARK, 3)
    return (0.0, 2.3, -0.4), "bob"


def site_fissure(p, g, m):
    for side in (-1, 1):
        for k in range(6):
            z = -2.0 + k * 0.75
            x = side * (0.7 + 0.45 * math.sin(k * 2.2 + side) ** 2)
            p.box(x, 0, z, 0.9, 0.35 + (k % 3) * 0.35, 0.74, ICE_DEEP if k % 2 else STONE_DARK, rz=side * -0.28)
    g.box(0, 0.04, -0.2, 0.55, 0.05, 4.4, VIOLET)
    for k in range(5):
        g.gem3(math.sin(k * 3) * 0.3, 0.0, -1.7 + k * 0.8, 0.13, 0.5 + (k % 2) * 0.5, CRYSTAL, rz=math.sin(k) * 0.4)
    # The seals that hold it closed.
    for k, z in enumerate((-1.2, 0.4)):
        p.line([(-1.4, 0.5, z), (0, 1.3 + k * 0.15, z + 0.2), (1.4, 0.5, z + 0.35)], 0.05, BRASS_DARK, 5)
        g.cyl(0, 1.2 + k * 0.15, z + 0.22, 0.26, 0.26, 0.07, GOLD, 6, rx=math.pi / 2)
    m.hoop(0, 0, 0, 1.2, 0.05, CRYSTAL, seg=6, sides=4)
    m.hoop(0, 0, 0, 0.75, 0.04, GOLD, seg=3, sides=4)
    return (0, 2.7, -0.3), "spin"


def site_crag(p, g, m):
    p.peak(0.3, 0, -0.8, 1.7, 5.6, STONE_DARK, 7, lean=0.2, cap=SNOW)
    p.peak(-1.4, 0, -0.2, 0.9, 3.2, ROCK_DARK, 6, lean=-0.12, cap=SNOW)
    p.peak(1.6, 0, 0.8, 0.6, 1.5, STONE, 6, cap=SNOW)
    # A bell that does not ring.
    p.cyl(-0.5, 0, 1.2, 0.07, 0.07, 2.2, WOOD_DARK, 5)
    p.cyl(0.6, 0, 1.2, 0.07, 0.07, 2.2, WOOD_DARK, 5)
    p.box(0.05, 2.15, 1.2, 1.4, 0.14, 0.14, WOOD)
    m.cyl(0, -0.75, 0, 0.38, 0.2, 0.6, BRASS_DARK, 10)
    m.ball(0, -0.15, 0, 0.2, 0.15, 0.2, BRASS_DARK, 1)
    m.ball(0, -0.82, 0, 0.08, 0.08, 0.08, GOLD, 1)
    g.ball(1.45, 5.75, -0.8, 0.16, 0.16, 0.16, WHITE, 1)
    return (0.05, 2.15, 1.2), "sway"


def site_abyss(p, g, m):
    p.cyl(0, 0, 0, 2.5, 2.5, 0.07, NAVY, 24)
    for k in range(5):
        g.hoop(0, 0.09 + k * 0.004, 0, 2.2 - k * 0.45, 0.05 - k * 0.005, mix(CYAN, VIOLET, k / 4), seg=26, sides=4)
    for k in range(7):
        a = TAU * k / 7 + 0.2
        if abs(a - math.pi / 2) < 0.5:
            continue
        p.gem3(math.cos(a) * 2.35, 0, math.sin(a) * 2.35, 0.38, 1.4 + (k % 3) * 0.8, ICE_DEEP,
               rx=-math.sin(a) * 0.4, rz=math.cos(a) * 0.4)
    for k in range(26):
        a = k * 0.62
        r = 0.2 + k * 0.058
        m.gem3(math.cos(a) * r, k * 0.1 - 1.3, math.sin(a) * r, 0.07, 0.26, mix(VIOLET, FOAM, k / 25))
    return (0, 1.9, 0), "spin"


def site_etching(p, g, m):
    p.cyl(0, 0, 0, 2.6, 2.6, 0.1, SNOW, 6)
    pts = []
    for k in range(7):
        a = TAU * (k * 3 % 7) / 7
        pts.append((math.cos(a) * 2.2, 0.13, math.sin(a) * 2.2))
    for k in range(7):
        g.line([pts[k], pts[(k + 1) % 7]], 0.04, CYAN, 4)
    g.hoop(0, 0.13, 0, 2.2, 0.05, VIOLET, seg=40, sides=4)
    for x, z, h, a in ((-1.4, -1.2, 2.4, 0.5), (1.5, -1.1, 3.0, -0.4), (0.0, -2.0, 1.8, 0.0)):
        p.box(x, 0, z, 1.0, h, 0.28, STONE, ry=a)
        for s in range(4):
            g.box(x + math.sin(a) * 0.16, 0.35 + s * h * 0.2, z + math.cos(a) * 0.16, 0.2 + (s * 7 % 3) * 0.2, 0.07, 0.03, CYAN, ry=a)
    # A pen of light that writes by itself.
    m.cyl(1.1, 0.0, 0, 0.12, 0.12, 1.5, BRASS_LIGHT, 7, rz=0.35)
    m.cyl(1.1, 0.0, 0, 0.0, 0.12, 0.35, WHITE, 7, rz=0.35 + math.pi)
    m.gem3(1.1, -0.75, 0, 0.09, 0.35, CYAN)
    return (0, 1.05, 0.0), "spin"


def site_academy(p, g, m):
    p.box(0, 0, -1.0, 3.8, 1.6, 1.3, SNOW)
    p.roof(0, 1.6, -1.0, 4.1, 0.65, 1.6, SLATE)
    for k in range(6):
        g.box(-1.5 + k * 0.6, 0.55, -0.33, 0.24, 0.62, 0.04, LAMP)
    p.cyl(0, 0, -1.0, 0.85, 0.75, 3.3, STONE, 10)
    p.cyl(0, 3.3, -1.0, 1.0, 1.0, 0.18, BRASS, 12)
    p.dome(0, 3.48, -1.0, 0.85, 0.85, ICE_DEEP, 12, 4)
    p.cyl(0.35, 3.9, -0.65, 0.13, 0.2, 1.3, BRASS_DARK, 8, rx=0.75, rz=-0.35)
    for sx in (-1.75, 1.75):
        p.cyl(sx, 0, -0.3, 0.38, 0.34, 2.4, STONE, 8)
        p.cyl(sx, 2.4, -0.3, 0.5, 0.0, 1.0, SLATE, 8)
        g.ball(sx, 3.55, -0.3, 0.13, 0.13, 0.13, AMBER, 1)
    # The torch of stars.
    m.gem3(0, -0.45, 0, 0.35, 1.0, LAMP, sides=6)
    m.hoop(0, 0, 0, 0.85, 0.04, GOLD, rx=0.45)
    m.hoop(0, 0, 0, 1.1, 0.03, CYAN, rz=-0.5)
    for k in range(5):
        a = TAU * k / 5
        m.gem3(math.cos(a) * 1.4, math.sin(a * 2) * 0.35, math.sin(a) * 1.4, 0.09, 0.28, WHITE, sides=4)
    return (0, 5.7, -1.0), "spin"


def site_stairway(p, g, m):
    for k in range(18):
        a = math.pi * 0.5 + k * 0.5
        r = 1.8 - k * 0.025
        x, z = math.cos(a) * r, math.sin(a) * r - 0.3
        p.box(x, 0.15 + k * 0.3, z, 0.85, 0.11, 0.45, SNOW if k % 2 else ICE, ry=-a)
        g.box(x, 0.13 + k * 0.3, z, 0.7, 0.025, 0.3, CYAN, ry=-a)
    p.cyl(0, 0, -0.3, 0.3, 0.12, 5.6, SLATE, 8)
    for k in range(3):
        p.hoop(0, 1.4 + k * 1.6, -0.3, 0.45 - k * 0.07, 0.07, BRASS)
    for k in range(5):
        a = TAU * k / 5
        m.gem3(math.cos(a) * 0.75, math.sin(a * 2) * 0.2, math.sin(a) * 0.75, 0.13, 0.4, LAMP, sides=4)
    m.gem3(0, -0.3, 0, 0.35, 1.2, WHITE, sides=4)
    return (0, 6.1, -0.3), "spin"


def site_fangs(p, g, m):
    for side in (-1, 1):
        for k in range(5):
            z = -1.9 + k * 0.85
            h = 3.6 - abs(k - 1) * 0.55
            p.cyl(side * 2.2, 0, z, 0.5, 0.0, h, BONE if k % 2 else SNOW, 6, rz=side * 0.38)
        p.box(side * 2.2, 0, -0.2, 0.9, 0.5, 4.6, ICE_DEEP)
    g.box(0, 0.04, -0.2, 1.6, 0.04, 4.2, NAVY)
    for k in range(6):
        g.gem3(math.sin(k * 5) * 0.55, 0, -1.8 + k * 0.7, 0.12, 0.45, CYAN)
    m.gem3(0, -0.5, 0, 0.32, 1.2, CRYSTAL, sides=6)
    m.hoop(0, 0.1, 0, 0.7, 0.035, CYAN, rz=0.5)
    return (0, 2.2, -0.2), "bob"


def site_brightwood(p, g, m):
    for x, z, h, col in ((-1.7, -0.7, 3.0, PINK), (-0.4, -1.7, 4.4, CYAN), (1.2, -1.2, 3.5, LAMP), (1.9, 0.5, 2.4, PINK), (-1.4, 1.1, 1.8, LAMP)):
        p.cyl(x, 0, z, 0.2, 0.08, h * 0.72, SNOW, 6)
        for k in range(5):
            a = TAU * k / 5 + h
            tip = (x + math.cos(a) * h * 0.24, h * (0.66 + 0.08 * (k % 3)), z + math.sin(a) * h * 0.24)
            p.line([(x, h * 0.5, z), tip], 0.05, SNOW, 4)
            g.ball(tip[0], tip[1], tip[2], h * 0.09, h * 0.1, h * 0.09, col, 1)
        g.ball(x, h * 0.85, z, h * 0.15, h * 0.14, h * 0.15, col, 1)
    for k in range(12):
        a = TAU * k / 12
        m.gem3(math.cos(a) * (0.8 + (k % 3) * 0.55), math.sin(a * 3) * 0.9, math.sin(a) * (0.8 + (k % 2) * 0.5), 0.05, 0.15, WHITE)
    return (0, 1.8, 0), "spin"


def site_stagnant(p, g, m):
    p.cyl(0, 0, 0, 2.6, 2.6, 0.1, c("#3c6f77"), 18)
    for _ in range(11):
        a, r = random.uniform(0, TAU), random.uniform(0.7, 2.3)
        x, z = math.cos(a) * r, math.sin(a) * r - 0.2
        h = random.uniform(0.35, 1.5)
        p.cyl(x, 0, z, 0.24, 0.17, h, BARK, 7)
        p.cyl(x, h, z, 0.19, 0.19, 0.06, STONE_WARM, 7)
    for sx in (-1.4, -0.5, 0.4, 1.3):
        p.box(sx, 0.25, 0.4, 0.75, 0.09, 0.55, WOOD_DARK, ry=sx * 0.15)
    p.cyl(1.4, 0, -1.4, 0.09, 0.07, 3.0, WOOD_DARK, 5, rz=0.12)
    g.ball(1.05, 2.95, -1.4, 0.2, 0.28, 0.2, LAMP, 1)
    for k in range(8):
        a = TAU * k / 8
        m.hoop(math.cos(a) * 1.2, 0, math.sin(a) * 1.2, 0.12 + (k % 3) * 0.09, 0.015, FOAM, seg=14, sides=3)
    return (0, 0.13, 0), "pulse"


def site_sprout(p, g, m):
    p.cyl(0, 0, -0.5, 2.1, 1.4, 0.55, SNOW, 12)
    p.cyl(0, 0.55, -0.5, 1.4, 0.8, 0.3, MOSS, 12)
    stem = [(0, 0.7, -0.5), (-0.25, 1.8, -0.5), (0.15, 2.9, -0.5), (0.0, 3.9, -0.5)]
    for k in range(3):
        p.line(stem[k:k + 2], 0.34 - k * 0.08, LEAF, 7)
    for sx, y, size in ((-1, 2.3, 1.2), (1, 3.1, 1.0)):
        p.ball(sx * size * 0.85, y, -0.5, size, 0.12, size * 0.55, LEAF_LIGHT, 2)
        p.line([(0, y - 0.35, -0.5), (sx * size * 1.5, y + 0.12, -0.5)], 0.05, LEAF, 4)
    g.gem3(0, 3.85, -0.5, 0.45, 1.15, c("#b8ff9a"), sides=7)
    for k in range(8):
        a = TAU * k / 8
        p.cyl(math.cos(a) * 1.75, 0.3, -0.5 + math.sin(a) * 1.3, 0.03, 0.02, 0.45, LEAF, 4)
        g.ball(math.cos(a) * 1.75, 0.8, -0.5 + math.sin(a) * 1.3, 0.12, 0.1, 0.12, PINK if k % 2 else LAMP, 1)
        m.ball(math.cos(a) * 1.1, math.sin(a * 2) * 0.45, math.sin(a) * 1.1, 0.07, 0.07, 0.07, c("#b8ff9a"), 1)
    return (0, 4.4, -0.5), "spin"


def site_worm(p, g, m):
    for x, z, r in ((-1.4, -1.0, 1.3), (1.5, -0.7, 1.1), (0.2, 1.4, 0.8), (-1.7, 1.1, 0.6)):
        p.ball(x, 0, z, r, r * 0.34, r * 0.75, SAND, 2, 0.03)
    p.hoop(0.2, 0.14, -0.2, 0.95, 0.22, SAND_DARK, seg=14, sides=5)
    p.cyl(0.2, 0, -0.2, 0.85, 0.85, 0.12, BLACK, 14)
    for x, z in ((-1.9, 0.2), (1.95, 0.8)):
        p.cyl(x, 0, z, 0.18, 0.15, 1.0, LEAF_DARK, 7)
        p.cyl(x, 0.5, z, 0.09, 0.08, 0.55, LEAF_DARK, 5, rz=1.0)
    # The burrower looks out of its hole.
    pts = [(0, -0.9, 0), (0, 0.1, -0.1), (0, 0.9, 0.05), (0, 1.45, 0.45)]
    for k in range(3):
        m.line(pts[k:k + 2], 0.52 - k * 0.04, CORAL if k % 2 else TERRA, 9)
        m.hoop(0, pts[k + 1][1], pts[k + 1][2], 0.5 - k * 0.04, 0.07, SAND_DARK, rx=k * 0.3)
    m.cyl(0, 1.45, 0.45, 0.45, 0.5, 0.35, TERRA, 9, rx=0.95)
    for k in range(8):
        a = TAU * k / 8
        m.cyl(math.cos(a) * 0.36, 1.65 - math.sin(a) * 0.21, 0.74 + math.sin(a) * 0.29, 0.07, 0.0, 0.35, BONE, 4, rx=0.95)
    return (0.2, 0.55, -0.25), "rise"


def site_giant(p, g, m):
    p.ball(0, 1.6, -0.8, 1.7, 2.1, 1.4, STONE, 2, 0.1)
    p.ball(0, 3.3, -0.85, 1.75, 0.8, 1.45, MOSS, 2, 0.1)
    p.box(0, 2.3, 0.45, 2.3, 0.42, 0.42, STONE_DARK)
    p.cyl(0, 1.15, 0.6, 0.34, 0.14, 1.15, STONE, 4)
    p.box(0, 0.5, 0.35, 1.15, 0.22, 0.4, STONE_DARK)
    p.ball(-0.65, 1.95, 0.4, 0.34, 0.13, 0.16, STONE_DARK, 1)
    g.ball(0.65, 1.95, 0.42, 0.42, 0.3, 0.2, CYAN, 2)
    p.ball(0.65, 1.95, 0.62, 0.11, 0.16, 0.05, NAVY, 1)
    for x, z, h in ((-1.9, 0.6, 1.2), (1.9, 0.3, 1.7), (-0.6, -2.1, 1.4)):
        p.pine(x, z, h, LEAF_DARK, snow=SNOW)
    p.pine(0.4, -0.9, 1.2, LEAF_DARK, snow=SNOW, y=3.85)
    m.hoop(0, 0, 0, 0.62, 0.035, CYAN, rx=math.pi / 2)
    m.hoop(0, 0, 0, 0.82, 0.02, WHITE, rx=math.pi / 2, seg=10)
    return (0.65, 1.95, 0.75), "wheel"


def site_cairn(p, g, m):
    for k in range(6):
        p.boulder(random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1), 0.9 - k * 0.12, STONE if k % 2 else ROCK, y=k * 0.5)
    g.gem3(0, 3.2, 0, 0.2, 0.7, LAMP)
    for k in range(5):
        a = TAU * k / 5
        m.gem3(math.cos(a) * 1.3, 0, math.sin(a) * 1.3, 0.1, 0.35, CYAN)
    return (0, 2.2, 0), "spin"


SITES = {name[5:]: build for name, build in dict(globals()).items() if name.startswith("site_")}

# The landmark of every area, from its name.
AREAS = {
    44001: "fortress", 44002: "peaks", 44003: "hills", 44004: "pillars", 2: "gorge", 3: "pagoda",
    4: "windmill", 5: "mesa", 6: "port", 7: "forest", 8: "lighthouse", 9: "barrens", 10: "mire",
    12: "maw", 14: "summit", 46: "nexus",
    11: "isles", 15: "tethys",
    16: "dome", 17: "vault", 18: "chapel", 19: "sanctuary", 20: "sails", 21: "skytemple", 22: "oak",
    23: "waterfall", 28: "curls", 27: "shaft", 25: "aviary", 32: "fountain", 33: "colosseum",
    34: "factory", 36: "thorns",
    41001: "pad", 41002: "horn", 41004: "crash", 41005: "runes", 41006: "frozenwood",
    42001: "dock", 42002: "fissure", 42003: "crag", 42004: "abyss", 36109: "etching",
    36110: "academy", 36102: "stairway", 36105: "fangs", 36106: "brightwood", 36107: "stagnant",
    36108: "sprout", 36111: "worm", 36112: "giant",
}


# ---------------------------------------------------------------- the planets

REGIONS = (1, 900, 3, 4)
# The ground below a landmark, in the colors of its planet.
PLINTH = {1: c("#c9a24a"), 900: c("#1d2b52"), 3: c("#d9b98c"), 4: c("#cfe4fa")}


def planet(region, p, g):
    """A ball with a radius of one, painted in patches. The page scales it."""
    verts, faces = ball_data(5)
    offset = Vector((region % 13, region % 7, 3.1))
    for face in faces:
        corners = [verts[i] for i in face]
        d = (corners[0] + corners[1] + corners[2]).normalized()
        big = noise.noise(d * 2.1 + offset)
        small = noise.noise(d * 7.0 + offset)
        if region == 1:
            # Golden fields, terraces of jade and rivers.
            river = abs(noise.noise(d * 3.3 - offset))
            if river < 0.045:
                color = c("#35b8b0")
            elif big > 0.18:
                color = mix(c("#5c9a52"), c("#8fbc57"), small + 0.5)
            elif big < -0.2:
                color = mix(c("#c8793a"), c("#dd9a45"), small + 0.5)
            else:
                color = c("#e7bd4d") if int((big + small * 0.25) * 22) % 2 else c("#d4a63f")
        elif region == 900:
            # A black sea with a web of light.
            web = abs(noise.noise(d * 3.4 + offset))
            if web < 0.03:
                g.paint([x * 1.0015 for x in corners], c("#37d5ef"))
            color = mix(c("#0c1532"), c("#1f3260"), big + 0.5 + small * 0.4)
        elif region == 3:
            # Islands of warm stone between canals.
            if big < -0.08:
                color = mix(c("#1b8fb0"), c("#3cc6c9"), big * 2 + 0.9 + small * 0.3)
            elif big < 0.0:
                color = c("#f1ddae")
            elif small > 0.22:
                color = c("#7ca054")
            else:
                color = mix(c("#cf8a5c"), c("#e5b98c"), small * 1.4 + 0.5)
        else:
            # Snow, old ice and cracks that shine.
            crack = abs(noise.noise(d * 3.6 - offset))
            if crack < 0.022:
                g.paint([x * 1.0015 for x in corners], c("#8f7bff"))
            if big > 0.15:
                color = mix(c("#f2f8ff"), c("#dcecff"), small + 0.5)
            elif big < -0.25:
                color = mix(c("#5f9fd8"), c("#85c4ec"), small + 0.5)
            else:
                color = mix(c("#bcd8f5"), c("#d3e6fb"), small + 0.5)
        p.paint(corners, color)


def scatter(region, a, b, d):
    """Three small things of one planet, which the page strews over it by the hundred."""
    if region == 1:
        for k in range(5):
            a.cyl(math.cos(k * 1.3) * 0.18, 0, math.sin(k * 1.3) * 0.18, 0.06, 0.0, 0.28 + (k % 3) * 0.1, GINKGO if k % 2 else LEAF_LIGHT, 4, rz=math.cos(k) * 0.3)
        b.pine(0, 0, 1.15, LEAF_DARK)
        d.boulder(0, 0, 0.32, STONE)
        d.boulder(0.32, 0.15, 0.18, ROCK)
    elif region == 900:
        a.gem3(0, 0, 0, 0.1, 0.5, CYAN)
        a.gem3(0.2, 0, 0.05, 0.07, 0.3, VIOLET, rz=-0.4)
        b.gem3(0, 0, 0, 0.28, 1.15, BLACK, rz=0.15)
        b.gem3(-0.28, 0, 0.1, 0.18, 0.65, SLATE, rz=0.5)
        d.hoop(0, 0.04, 0, 0.35, 0.025, CYAN, seg=6, sides=3)
        d.box(0, 0, 0, 0.2, 0.1, 0.2, SLATE, ry=0.6)
    elif region == 3:
        for k in range(5):
            x, z = math.cos(k * 1.9) * 0.22, math.sin(k * 1.9) * 0.22
            a.cyl(x, 0, z, 0.015, 0.012, 0.22, LEAF, 4)
            a.ball(x, 0.25, z, 0.08, 0.06, 0.08, (CORAL, PINK, WHITE, LAMP, VIOLET)[k], 1)
        b.cyl(0, 0, 0, 0.06, 0.05, 0.3, BARK, 5)
        b.cyl(0, 0.2, 0, 0.24, 0.0, 1.4, LEAF_DARK, 7)
        d.cyl(0, 0, 0, 0.16, 0.14, 0.5, MARBLE, 8)
        d.cyl(0.35, 0.12, 0, 0.12, 0.12, 0.55, MARBLE, 8, rz=math.pi / 2)
    else:
        a.gem3(0, 0, 0, 0.12, 0.55, ICE)
        a.gem3(0.18, 0, 0.1, 0.08, 0.32, CRYSTAL, rz=-0.5)
        b.pine(0, 0, 1.2, c("#3f7f7a"), snow=SNOW)
        d.ball(0, 0.05, 0, 0.5, 0.22, 0.42, SNOW, 1, 0.04)


# ---------------------------------------------------------------- the sky and the kit


def sky(mesh, moving):
    # A dragon of Huanglong, in links that follow each other.
    head = mesh("or_dragon_head_paint")
    glow = mesh("or_dragon_head_glow")
    head.ball(0, 0, 0, 0.62, 0.52, 0.85, JADE, 2)
    head.ball(0, -0.08, 0.78, 0.42, 0.3, 0.55, c("#7fe0b8"), 1)
    head.ball(0, -0.4, 0.55, 0.34, 0.12, 0.55, GINKGO, 1)
    for sx in (-1, 1):
        glow.ball(sx * 0.4, 0.22, 0.6, 0.13, 0.13, 0.13, LAMP, 1)
        head.line([(sx * 0.28, 0.4, 0.0), (sx * 0.55, 0.9, -0.4), (sx * 0.42, 1.25, -0.9)], 0.08, GOLD, 5)
        head.line([(sx * 0.3, -0.1, 1.15), (sx * 1.0, 0.0, 0.8), (sx * 1.25, 0.35, -0.1)], 0.035, GOLD, 4)
    for k in range(5):
        head.cyl(0, 0.35, -0.55 + k * 0.17, 0.2, 0.0, 0.55, CORAL, 4, rx=-0.9)
    body = mesh("or_dragon_body_paint")
    body.ball(0, 0, 0, 0.45, 0.42, 0.62, JADE, 1)
    body.ball(0, -0.2, 0, 0.38, 0.27, 0.55, GINKGO, 1)
    body.cyl(0, 0.25, 0, 0.2, 0.0, 0.55, CORAL, 4, rx=-0.7)
    tail = mesh("or_dragon_tail_paint")
    tail.cyl(0, 0, 0.3, 0.35, 0.0, 1.5, JADE, 6, rx=-math.pi / 2)
    for k in range(3):
        tail.cyl(0, 0, -1.0, 0.18, 0.0, 1.0, CORAL, 4, rx=-math.pi / 2 + (k - 1) * 0.7)

    # Balloons of Rinascita.
    balloon = mesh("or_balloon_paint")
    for k in range(8):
        a, b = TAU * k / 8, TAU * (k + 1) / 8
        col = CORAL if k % 2 else CREAM
        rings = [(0.25, -0.9), (0.85, -0.35), (1.15, 0.35), (0.95, 1.0), (0.45, 1.35), (0.02, 1.45)]
        for (r0, y0), (r1, y1) in zip(rings, rings[1:]):
            balloon.paint([(math.cos(a) * r0, y0, math.sin(a) * r0), (math.cos(b) * r0, y0, math.sin(b) * r0),
                           (math.cos(b) * r1, y1, math.sin(b) * r1), (math.cos(a) * r1, y1, math.sin(a) * r1)], col)
    balloon.box(0, -1.85, 0, 0.5, 0.36, 0.5, WOOD)
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        balloon.line([(sx * 0.23, -1.5, sz * 0.23), (sx * 0.18, -0.88, sz * 0.18)], 0.016, WOOD_DARK, 3)
    mesh("or_balloon_glow").ball(0, -1.05, 0, 0.13, 0.22, 0.13, LAMP, 1)

    # Survey drones of the Black Shores.
    drone = mesh("or_drone_paint")
    drone.ball(0, 0, 0, 0.5, 0.2, 0.5, STEEL, 2)
    drone.ball(0, 0.15, 0, 0.25, 0.18, 0.25, NAVY, 1)
    shine = mesh("or_drone_glow")
    shine.hoop(0, 0, 0, 0.82, 0.04, CYAN)
    for k in range(3):
        a = TAU * k / 3
        drone.box(math.cos(a) * 0.62, -0.02, math.sin(a) * 0.62, 0.4, 0.06, 0.1, SLATE, ry=-a)
    shine.ball(0, -0.2, 0, 0.14, 0.1, 0.14, WHITE, 1)

    # The northern lights of the frostlands: curtains on a part of a ring of radius one.
    aurora = mesh("or_aurora_beam")
    for band, (high, color) in enumerate(((0.0, c("#4dffc3")), (0.1, c("#7c8cff")), (-0.09, c("#d07cff")))):
        for i in range(90):
            a, b = TAU * i / 90, TAU * (i + 1) / 90
            if math.sin(a * 3 + band * 2) < -0.35:
                continue

            def at(angle, up):
                r = 1.0 + 0.045 * math.sin(angle * 9 + band)
                return (math.cos(angle) * r, high + 0.05 * math.sin(angle * 5 + band) + up, math.sin(angle) * r)

            def tall(angle):
                return 0.06 + 0.035 * math.sin(angle * 13 + band)

            aurora.paint([at(a, 0), at(b, 0), at(b, tall(b)), at(a, tall(a))], color)

    cloud = mesh("or_cloud_paint")
    for x, r in ((-0.75, 0.55), (0.0, 0.85), (0.8, 0.6), (1.35, 0.35), (-1.3, 0.32)):
        cloud.ball(x, r * 0.22, random.uniform(-0.15, 0.15), r, r * 0.52, r * 0.7, WHITE, 1, 0.05)

    # The brass hoop of the armillary sphere, of radius one, with a mark at every few degrees.
    hoop = mesh("or_hoop_paint")
    hoop.hoop(0, 0, 0, 1.0, 0.007, BRASS, seg=160, sides=4)
    hoop.hoop(0, 0, 0, 1.028, 0.0025, BRASS_DARK, seg=160, sides=3)
    marks = mesh("or_hoop_glow")
    for k in range(72):
        a = TAU * k / 72
        long = 0.028 if k % 6 == 0 else 0.013
        hoop.box(math.cos(a) * (1.0 + long / 2), -0.0015, math.sin(a) * (1.0 + long / 2), long, 0.003, 0.004, BRASS_LIGHT, ry=-a)
        if k % 18 == 0:
            marks.ball(math.cos(a), 0, math.sin(a), 0.022, 0.022, 0.022, LAMP, 1)

    sun = mesh("or_sun_glow")
    sun.ball(0, 0, 0, 1.0, 1.0, 1.0, c("#ffd45a"), 3)
    rays = moving("or_sun_move", (0, 0, 0))
    rays.hoop(0, 0, 0, 1.45, 0.07, BRASS_LIGHT, rx=math.pi / 2, seg=48)
    for k in range(16):
        a = TAU * k / 16
        rays.cyl(math.cos(a) * 1.55, math.sin(a) * 1.55, 0, 0.17, 0.0, 0.9 if k % 2 else 0.5, GOLD, 4, rz=a - math.pi / 2)

    star = mesh("or_comet_glow")
    star.gem3(0, -0.25, 0, 0.2, 0.5, WHITE, sides=4)
    for k in range(7):
        star.gem3(0, -0.12 + k * 0.012, -0.3 - k * 0.38, 0.14 - k * 0.017, 0.26, mix(WHITE, CYAN, k / 6), sides=4)


def kit(mesh, moving):
    # The easel that holds the picture of an area.
    easel = mesh("or_easel_paint")
    for sx in (-1.3, 1.3):
        easel.cyl(sx, -0.25, 0.0, 0.09, 0.07, 3.2, WOOD, 6)
        easel.ball(sx, 3.0, 0, 0.13, 0.13, 0.13, GOLD, 1)
        easel.cyl(sx, -0.25, -0.7, 0.05, 0.05, 2.4, WOOD_DARK, 5, rx=0.3)
    for y in (0.9, 2.72):
        easel.box(0, y, -0.03, 2.75, 0.1, 0.1, BRASS_DARK)
    easel.box(0, 0.78, 0.07, 2.75, 0.12, 0.14, BRASS)

    # The flag that is planted on a surveyed area.
    pole = mesh("or_flag_paint")
    pole.cyl(0, -0.2, 0, 0.05, 0.035, 2.3, WOOD_DARK, 5)
    pole.ball(0, 2.15, 0, 0.09, 0.09, 0.09, GOLD, 1)
    for k in range(4):
        pole.boulder(math.cos(k * 1.6) * 0.18, math.sin(k * 1.6) * 0.18, 0.13, STONE)
    cloth = moving("or_flag_move", (0, 2.05, 0))
    cloth.paint([(0.04, 0, 0), (1.05, -0.27, 0), (0.04, -0.62, 0)], RED)
    cloth.paint([(0.14, -0.15, 0.012), (0.5, -0.27, 0.012), (0.14, -0.42, 0.012)], GOLD)

    # The needle on the ground that points to the next area without a flag. It points along -z.
    needle = mesh("or_needle_glow")
    needle.paint([(0, 0, -0.62), (0.2, 0, 0.02), (0, 0.07, 0)], RED)
    needle.paint([(0, 0, -0.62), (0, 0.07, 0), (-0.2, 0, 0.02)], CORAL)
    needle.paint([(0, 0, 0.42), (0, 0.07, 0), (0.2, 0, 0.02)], WHITE)
    needle.paint([(0, 0, 0.42), (-0.2, 0, 0.02), (0, 0.07, 0)], SNOW)

    # The compass rose where a visitor lands. It bends with a ball of 16 meters.
    rose = mesh("or_rose_paint")
    light = mesh("or_rose_glow")
    ball = 16.0

    def bent(radius, angle, up):
        return (math.cos(angle) * radius, math.sqrt(ball * ball - radius * radius) - ball + up, math.sin(angle) * radius)

    for inner, outer, color, up in ((1.95, 2.2, BRASS, 0.04), (2.3, 2.38, BRASS_DARK, 0.04), (0.42, 0.55, BRASS_DARK, 0.06)):
        for i in range(48):
            a, b = TAU * i / 48, TAU * (i + 1) / 48
            rose.paint([bent(inner, a, up), bent(outer, a, up), bent(outer, b, up), bent(inner, b, up)], color)
    for k in range(8):
        a = TAU * k / 8
        long = 1.9 if k % 2 == 0 else 1.15
        color = MARBLE if k % 2 == 0 else GOLD
        tip = bent(long, a, 0.05)
        left, right = bent(0.42, a - 0.45, 0.07), bent(0.42, a + 0.45, 0.07)
        rose.paint([bent(0.0, 0, 0.075), left, tip], color)
        rose.paint([bent(0.0, 0, 0.075), tip, right], mix(color, BRASS_DARK, 0.5))
    # North, where the walk begins.
    light.paint([bent(2.5, -math.pi / 2 - 0.12, 0.06), bent(2.95, -math.pi / 2, 0.06), bent(2.5, -math.pi / 2 + 0.12, 0.06)], RED)


# ---------------------------------------------------------------- put together


def blender(shape):
    """The corners of a shape turn from the page's coordinates into Blender's."""
    shape.verts = [(p[0], -p[2], p[1]) for p in shape.verts]
    return shape


def weld(scene):
    """Joins the corners that faces share, so each is stored once for every color it has."""
    for obj in scene.collection.objects:
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.remove_doubles(mesh, verts=mesh.verts, dist=0.00002)
        mesh.to_mesh(obj.data)
        mesh.free()


def preview(scene, radius=17.0):
    """Only for the pictures taken in Blender: the four planets with their landmarks."""
    originals = list(scene.collection.objects)

    def show(name, matrix):
        source = scene.collection.objects.get(name)
        if not source:
            return
        copy = bpy.data.objects.new(f"orrery_show_{name}", source.data)
        scene.collection.objects.link(copy)
        copy.matrix_world = matrix

    # Page coordinates to Blender's, as a matrix.
    turned = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    for column, region in enumerate(REGIONS):
        center = Vector((column * radius * 3.0, 0, 0))
        place = Matrix.Translation(turned @ center) @ Matrix.Scale(radius, 4)
        show(f"or_planet_{region}_paint", place)
        show(f"or_planet_{region}_glow", place)
        kinds = [kind for area, kind in AREAS.items()
                 if (region == 1 and (area < 11 or area in (12, 14, 46) or 44000 < area < 45000))
                 or (region == 900 and area in (11, 15))
                 or (region == 3 and area in range(16, 37) and area not in (11, 15))
                 or (region == 4 and (36100 < area < 36200 or 41000 < area < 43000))]
        count = len(kinds) + 1
        for k, kind in enumerate(kinds, 1):
            y = 1 - 2 * k / count
            ring = math.sqrt(max(0.0, 1 - y * y))
            a = k * 2.39996
            d = Vector((ring * math.cos(a), y, ring * math.sin(a)))
            spin = Vector((0, 1, 0)).rotation_difference(d)
            at = Matrix.Translation(center + d * radius) @ spin.to_matrix().to_4x4()
            for end in ("paint", "glow"):
                show(f"or_site_{kind}_{end}", turned @ at @ turned.inverted())
            if kind in PIVOTS:
                moved = at @ Matrix.Translation(PIVOTS[kind])
                show(f"or_site_{kind}_move", turned @ moved @ turned.inverted())
    for obj in originals:
        obj.hide_set(True)
        obj.hide_render = True
    bpy.context.view_layer.update()


PIVOTS = {}


def main():
    # The same planets at every run.
    random.seed(41)
    PIVOTS.clear()
    scene = make_scene("Solaris_Orrery", ("or_", "orrery_"))
    lit = make_material("orrery_paint")
    shine = make_material("orrery_glow")
    # Only for the pictures taken in Blender; the page draws these meshes unlit.
    shader = next(n for n in shine.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    source = next(n for n in shine.node_tree.nodes if n.type == "VERTEX_COLOR")
    shine.node_tree.links.new(source.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 1.0

    meshes = {}
    pivots = {}

    def mesh(name):
        meshes[name] = Kit()
        return meshes[name]

    def moving(name, at):
        """A thing that turns or lifts: built around the zero point, placed by the page."""
        pivots[name] = [round(value, 3) for value in at]
        return mesh(name)

    for region in REGIONS:
        planet(region, mesh(f"or_planet_{region}_paint"), mesh(f"or_planet_{region}_glow"))
        scatter(region, mesh(f"or_bit_{region}_0_paint"), mesh(f"or_bit_{region}_1_paint"), mesh(f"or_bit_{region}_2_paint"))

    sites = {}
    for area, kind in list(AREAS.items()) + [(None, "cairn")]:
        if kind in sites:
            continue
        region = (1 if area is None or area < 11 or area in (12, 14, 46) or 44000 < area < 45000
                  else 900 if area in (11, 15) else 3 if area < 100 else 4)
        paint, glow, move = Kit(), Kit(), Kit()
        # The ground under a landmark reaches into the planet, which curves away from it.
        paint.cyl(0, -0.75, 0, 3.05, 2.8, 0.77, PLINTH[region], 14)
        result = SITES[kind](paint, glow, move)
        meshes[f"or_site_{kind}_paint"] = paint
        meshes[f"or_site_{kind}_glow"] = glow
        meshes[f"or_site_{kind}_move"] = move
        pivot, motion = result
        PIVOTS[kind] = Vector(pivot)
        points = paint.verts + glow.verts + [tuple(Vector(v) + Vector(pivot)) for v in move.verts]
        sites[kind] = {"pivot": [round(v, 3) for v in pivot], "motion": motion,
                       "high": round(max(p[1] for p in points), 2)}

    sky(mesh, moving)
    kit(mesh, moving)

    # A thing without a part of a kind has no mesh of it.
    for name, shape in meshes.items():
        if shape.faces:
            glows = name.endswith(("_glow", "_beam")) or name in ("or_dragon_head_glow",)
            add(scene, shine if glows else lit, name, blender(shape))

    # With the default bits, the corners of a planet move far enough to open gaps.
    bits = meshopt.EXP_FILTER_BITS
    meshopt.EXP_FILTER_BITS = 17
    weld(scene)
    try:
        # The page works out the flat normals itself, which halves the file.
        export(os.path.join(FOLDER, "orrery.glb"), normals=False)
    finally:
        meshopt.EXP_FILTER_BITS = bits

    layout = {
        "sites": sites,
        "areas": {str(area): kind for area, kind in AREAS.items()},
        "planets": list(REGIONS),
        "pivots": pivots,
    }
    with open(os.path.join(FOLDER, "orrery.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(layout, handle, separators=(",", ":"))
        handle.write("\n")

    # After the export, so the file keeps every part around the zero point.
    preview(scene)
    print("[orrery] done:", len(sites), "landmarks")


main()
