"""Builds the Resonance Express, the walkable train of the Resonator Hall. Writes
src/assets/express/express.glb and src/assets/express/express.json.

    blender --background --factory-startup --python scripts/build-express.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Express",
and leaves every other scene alone. The model is original low-poly work and holds no game assets.

A train crosses the sky country, one carriage for every element, each furnished in its own way.
The page lays the carriages end to end, as long as the Resonators of the element need, and lets
the land, the gates and a whale of the sky pass the windows.

Positions in this script and in the JSON file are those of the page: x to the right, y up and z
toward the visitor, so the train drives toward -z. "to_blender" turns them into Blender's
coordinates at the end.

Every part is built around its own zero point:
- "car_<element>_*" is one length of a carriage, from z 0 to -MODULE, and "rotor_<element>" the
  thing that turns below its roof.
- "berth_<element>_*" is the place where one Resonator stands.
- "land_<element>_*" is one length of the country, from z 0 to -CHUNK, and "track_*" the rails.
- "joint_*" is the bridge between two carriages, "tail_*" the open deck at the end of the train,
  "nose_*" the one before the engine, "loco_*" the engine, "bogie_*" and "wheel_*" what it
  rolls on, "gate_*" a ring that the train drives through, "whale_*" and "moon_*" the sky.
"*_paint" meshes are lit and "*_glow" ones shine by themselves.
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

from lowpoly import TAU, Shape, add, export, linear, make_material, make_scene  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDER = os.path.join(ROOT, "src", "assets", "express")

# The length of one piece of a carriage, which holds one Resonator at each side.
MODULE = 4.8
# The bridge between two carriages, and the open decks at both ends of the train.
JOINT = 3.2
TAIL = 8.0
NOSE = 6.0
# Where the Resonators stand: how far from the middle, how far into a piece, and from each other.
BERTH = {"x": 2.55, "first": 1.2, "step": 2.4}
# How far from the middle a visitor can walk: in a carriage, on a bridge and on a deck.
WALK = {"car": 3.4, "joint": 1.25, "deck": 3.2}
WALL = 4.3
GROUND = -4.4
RAIL = -3.0
WHEEL = {"radius": 0.8, "x": 2.2, "y": RAIL + 0.8, "axles": (-0.95, 0.95)}
CHUNK = 40.0


def c(color):
    return linear(color)


INK = c("#1d1a4a")
NIGHT = c("#2a2760")
WHITE = c("#ffffff")
CREAM = c("#fff3d6")
BRASS = c("#ffcf5c")
BRASS_DARK = c("#c98a2e")
BRASS_PALE = c("#ffe8a6")
IRON = c("#3a3566")
IRON_LIGHT = c("#57518c")
STEEL = c("#aab4de")
RED = c("#ff5470")
LAMP = c("#ffe9a8")


# ---------------------------------------------------------------- shapes, in page coordinates


def box(s, x0, x1, y0, y1, z0, z1, color, top=None):
    p = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)]
    q = [(x, y1, z) for x, _, z in p]
    for i in range(4):
        j = (i + 1) % 4
        s.face([p[i], p[j], q[j], q[i]], color)
    s.face(q, top or color)
    s.face(p[::-1], color)


def block(s, center, size, color, top=None):
    (x, y, z), (w, h, d) = center, size
    box(s, x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2, color, top)


def lathe(s, at, profile, color, sides=10, axis="y", turn=0.0):
    """A round body: "profile" is a list of (radius, distance along "axis") from "at"."""
    x, y, z = at

    def ring(radius, along):
        points = []
        for i in range(sides):
            a = turn + TAU * i / sides
            u, v = radius * math.cos(a), radius * math.sin(a)
            if axis == "y":
                points.append((x + u, y + along, z + v))
            elif axis == "z":
                points.append((x + u, y + v, z + along))
            else:
                points.append((x + along, y + u, z + v))
        return points

    rings = [ring(max(r, 0.002), h) for r, h in profile]
    colors = color if isinstance(color[0], list) else [color]
    for row, (a, b) in enumerate(zip(rings, rings[1:])):
        for i in range(sides):
            j = (i + 1) % sides
            s.face([a[i], a[j], b[j], b[i]], colors[row % len(colors)])


def cyl(s, at, radius, height, color, sides=10, axis="y", top=None):
    """A closed cylinder, or a cone when "top" is another radius."""
    r = radius if top is None else top
    lathe(s, at, [(0, 0), (radius, 0), (r, height), (0, height)], color, sides, axis)


def ball(s, at, radius, color, squash=1.0, sides=8, rows=5):
    profile = [
        (radius * math.sin(math.pi * k / rows), -radius * squash * math.cos(math.pi * k / rows))
        for k in range(rows + 1)
    ]
    lathe(s, at, profile, color, sides)


def crystal(s, at, radius, height, color, lean=(0.0, 0.0), sides=5):
    """A pointed stone that stands on "at" and leans by "lean" in x and z."""
    x, y, z = at
    lx, lz = lean
    waist = [
        (x + lx * 0.7 + radius * math.cos(TAU * i / sides), y + height * 0.7, z + lz * 0.7 + radius * math.sin(TAU * i / sides))
        for i in range(sides)
    ]
    foot = [(x + radius * 0.6 * math.cos(TAU * i / sides), y, z + radius * 0.6 * math.sin(TAU * i / sides)) for i in range(sides)]
    tip = (x + lx, y + height, z + lz)
    for i in range(sides):
        j = (i + 1) % sides
        s.face([foot[i], foot[j], waist[j], waist[i]], color)
        s.face([waist[i], waist[j], tip], color)


def hoop(s, center, radius, thickness, color, plane="xy", steps=32, sides=5, start=0.0, span=TAU):
    x, y, z = center
    points = []
    for i in range(steps + 1):
        a = start + span * i / steps
        u, v = radius * math.cos(a), radius * math.sin(a)
        if plane == "xy":
            points.append((x + u, y + v, z))
        elif plane == "xz":
            points.append((x + u, y, z + v))
        else:
            points.append((x, y + v, z + u))
    s.tube(points, thickness, color, sides)


def disc(s, center, inner, outer, color, steps=32, plane="xz"):
    x, y, z = center

    def point(r, a):
        u, v = r * math.cos(a), r * math.sin(a)
        if plane == "xz":
            return (x + u, y, z + v)
        if plane == "xy":
            return (x + u, y + v, z)
        return (x, y + v, z + u)

    for i in range(steps):
        a, b = TAU * i / steps, TAU * (i + 1) / steps
        if inner > 0:
            s.face([point(inner, a), point(outer, a), point(outer, b), point(inner, b)], color)
        else:
            s.face([point(0, 0), point(outer, a), point(outer, b)], color)


def smooth(points, steps=6):
    """A Catmull-Rom curve through "points"."""
    out = []
    for i in range(len(points) - 1):
        p0, p1 = points[max(i - 1, 0)], points[i]
        p2, p3 = points[i + 1], points[min(i + 2, len(points) - 1)]
        for k in range(steps):
            t = k / steps
            out.append(
                tuple(
                    0.5
                    * (
                        2 * b
                        + (c_ - a) * t
                        + (2 * a - 5 * b + 4 * c_ - d) * t * t
                        + (3 * b - a - 3 * c_ + d) * t ** 3
                    )
                    for a, b, c_, d in zip(p0, p1, p2, p3)
                )
            )
    out.append(tuple(points[-1]))
    return out


def line(s, points, thickness, color, sides=5, steps=6):
    s.tube(smooth(points, steps), thickness, color, sides)


# ---------------------------------------------------------------- the elements


class Look:
    def __init__(self, name, **colors):
        self.name = name
        for key, value in colors.items():
            setattr(self, key, c(value))


LOOKS = {
    look.name: look
    for look in (
        Look("glacio", floor="#d6f0ff", tile="#b4defb", rug="#4f9ef0", wall="#eef9ff", trim="#79c8ff",
             deep="#2a6fd0", light="#8fe6ff", roof="#3f7fd8"),
        Look("fusion", floor="#8a3a34", tile="#a4483a", rug="#ffb04a", wall="#ffd9b0", trim="#e8703a",
             deep="#8e2430", light="#ff8a30", roof="#b8343a"),
        Look("electro", floor="#2c2466", tile="#3a2f80", rug="#5b3fc0", wall="#cdbcff", trim="#8a5cf0",
             deep="#3c1f8f", light="#d58cff", roof="#4b2aa8"),
        Look("aero", floor="#e8d6a8", tile="#d9c28c", rug="#3fbf8f", wall="#e6fff0", trim="#5fd6a8",
             deep="#0f7f6a", light="#8dffcf", roof="#1f9d7e"),
        Look("spectro", floor="#fff6df", tile="#f0d9a0", rug="#c43a56", wall="#fffaf0", trim="#ffcf4a",
             deep="#a86c10", light="#fff09a", roof="#d99a1c"),
        Look("havoc", floor="#231232", tile="#331a45", rug="#7a1f52", wall="#5a3560", trim="#c23a76",
             deep="#2a0c28", light="#ff4f98", roof="#4a1646"),
    )
}


# ---------------------------------------------------------------- the carriage


def car_floor(look, paint, glow):
    # Tiles in two shades, and the carpet in the middle.
    for i in range(10):
        for j in range(6):
            x0, z0 = -WALL + i * WALL / 5, -j * 0.8
            color = look.floor if (i + j) % 2 else look.tile
            paint.face([(x0, 0, z0), (x0 + WALL / 5, 0, z0), (x0 + WALL / 5, 0, z0 - 0.8), (x0, 0, z0 - 0.8)], color)
    box(paint, -1.15, 1.15, -0.02, 0.012, -MODULE, 0, look.rug)
    for side in (-1, 1):
        box(glow, side * 1.18 - 0.04, side * 1.18 + 0.04, 0.0, 0.025, -MODULE, 0, look.light)
        box(paint, side * 0.95 - 0.05, side * 0.95 + 0.05, 0.0, 0.018, -MODULE, 0, BRASS)
    for k in range(2):
        z = -1.2 - k * 2.4
        for size, color, up in ((0.62, BRASS_PALE, 0.02), (0.46, look.deep, 0.024), (0.2, BRASS, 0.028)):
            glow_or = paint
            glow_or.face([(0, up, z + size), (size * 0.7, up, z), (0, up, z - size), (-size * 0.7, up, z)], color)
    # Below the floor: the frame, the skirt and its line of light.
    box(paint, -WALL - 0.15, WALL + 0.15, -0.45, -0.03, -MODULE, 0, IRON)
    box(paint, -2.8, 2.8, -0.95, -0.45, -MODULE, 0, NIGHT)
    for side in (-1, 1):
        box(paint, side * (WALL + 0.1) - 0.12, side * (WALL + 0.1) + 0.12, -0.9, -0.05, -MODULE, 0, look.roof)
        box(glow, side * (WALL + 0.24) - 0.025, side * (WALL + 0.24) + 0.025, -0.58, -0.46, -MODULE, 0, look.light)
        for k in range(6):
            ball(paint, (side * (WALL + 0.23), -0.22, -0.4 - k * 0.8), 0.07, BRASS, 1.0, 6, 3)


def car_walls(look, paint, glow, broken=False):
    for side in (-1, 1):
        x = side * WALL
        inner, outer = x - side * 0.12, x + side * 0.12
        lo, hi = min(inner, outer), max(inner, outer)
        face = x - side * 0.14
        # The lower wall with its panels, and the sill.
        box(paint, lo, hi, 0.0, 0.95, -MODULE, 0, look.wall)
        for k in range(4):
            z = -0.2 - k * 1.2
            box(paint, min(face, inner), max(face, inner), 0.15, 0.75, z - 0.8, z, look.trim)
        box(paint, x - 0.24, x + 0.24, 0.95, 1.07, -MODULE, 0, BRASS)
        # A post at the start of every window.
        for k in range(2):
            z = -k * 2.4
            height = 2.2 if broken and k == 1 and side < 0 else 3.45
            box(paint, lo - 0.06, hi + 0.06, 1.07, height, z - 0.17, z + 0.02, look.wall)
            cyl(paint, (x - side * 0.2, 1.07, z - 0.075), 0.09, height - 1.07, BRASS_DARK, 6)
            ball(glow, (x - side * 0.34, 2.6, z - 0.075), 0.12, look.light, 1.3, 6, 4)
            cyl(paint, (x - side * 0.34, 2.74, z - 0.075), 0.16, 0.12, BRASS, 6, top=0.03)
            # The round top of the window.
            for flip in (-1, 1):
                mid = z - 1.2 - k * 0.0
                corner = mid + flip * 1.03
                arc = [(x, 3.45, corner)] + [
                    (x, 2.75 + 0.7 * math.sin(t), mid + flip * 1.03 * math.cos(t))
                    for t in (i * math.pi / 2 / 6 for i in range(7))
                ]
                if not (broken and side < 0):
                    paint.face(arc, look.wall)
                    line(paint, arc[1:], 0.045, BRASS, 4, 2)
        # The frieze above the windows.
        if broken and side < 0:
            for k, (z0, z1, top) in enumerate(((0.0, -1.1, 3.95), (-1.5, -2.2, 3.7), (-3.3, -4.8, 3.9))):
                box(paint, lo, hi, 3.45, top, z1, z0, look.wall if k % 2 else look.deep)
        else:
            box(paint, lo, hi, 3.45, 3.9, -MODULE, 0, look.wall)
        box(paint, x - side * 0.2 - 0.06, x - side * 0.2 + 0.06, 3.52, 3.62, -MODULE, 0, BRASS)
        box(glow, x - side * 0.15 - 0.02, x - side * 0.15 + 0.02, 3.72, 3.8, -MODULE, 0, look.light)
        # The eaves of the roof; the middle stays open to the sky.
        profile = [(WALL + 0.35, 3.86), (WALL, 4.2), (3.55, 4.55), (3.05, 4.72)]
        for (ax, ay), (bx, by) in zip(profile, profile[1:]):
            paint.face([(side * ax, ay, 0), (side * bx, by, 0), (side * bx, by, -MODULE), (side * ax, ay, -MODULE)], look.roof)
        box(paint, side * 3.05 - 0.08, side * 3.05 + 0.08, 4.66, 4.8, -MODULE, 0, BRASS)
    # The ribs that span the car.
    for k in range(2):
        z = -k * 2.4 - 0.08
        rib = [(-WALL, 3.9, z), (-3.2, 4.7, z), (-1.7, 5.2, z), (0, 5.38, z), (1.7, 5.2, z), (3.2, 4.7, z), (WALL, 3.9, z)]
        line(paint, rib, 0.09, look.deep, 6)
        line(glow, [(px * 0.97, py - 0.14, pz) for px, py, pz in rib], 0.025, look.light, 4)
    box(paint, -0.09, 0.09, 5.34, 5.46, -MODULE, 0, BRASS)


def prop_places():
    """The places beside the walls that have no Resonator: the side, and the middle in z."""
    return ((1, -1.2), (-1, -3.6))


def glacio_car(look, paint, glow, spin):
    for side, z in prop_places():
        x = side * 3.86
        # A bench of ice, and crystals that grew beside it.
        box(paint, x - 0.3, x + 0.3, 0.0, 0.45, z - 0.6, z + 0.6, look.tile)
        box(paint, x + side * 0.14, x + side * 0.3, 0.45, 1.0, z - 0.6, z + 0.6, look.trim)
        box(paint, x - 0.32, x + 0.28, 0.45, 0.55, z - 0.58, z + 0.58, WHITE)
        for dz, h in ((-0.86, 1.5), (0.86, 1.1), (0.98, 0.65)):
            crystal(glow if h > 1.3 else paint, (x + side * 0.08, 0, z + dz), 0.17, h, look.light if h > 1.3 else look.trim, (side * 0.1, dz * 0.12))
    for side in (-1, 1):
        for k in range(15):
            z = -0.2 - k * 0.32
            h = 0.22 + 0.4 * random.random()
            cyl(paint, (side * (WALL - 0.22), 3.46, z), 0.07, -h, WHITE if k % 2 else look.light, 5, top=0.0)
    # A snowflake that turns below the roof.
    for i in range(6):
        a = TAU * i / 6
        tip = (math.cos(a) * 0.95, 0, math.sin(a) * 0.95)
        spin.tube([(0, 0, 0), tip], 0.035, WHITE, 4)
        for share in (0.45, 0.72):
            for d in (-0.7, 0.7):
                base = (tip[0] * share, 0, tip[2] * share)
                end = (base[0] + math.cos(a + d) * 0.28, 0, base[2] + math.sin(a + d) * 0.28)
                spin.tube([base, end], 0.025, look.light, 4)
        crystal(spin, (tip[0], -0.15, tip[2]), 0.09, 0.32, WHITE)
    crystal(spin, (0, -0.55, 0), 0.2, 0.75, look.light, sides=6)
    paint.tube([(0, 5.36, -2.4), (0, 4.4, -2.4)], 0.02, STEEL, 4)


def fusion_car(look, paint, glow, spin):
    for side, z in prop_places():
        x = side * 3.86
        # A stove with its fire, a pot and a pipe up to the roof.
        box(paint, x - 0.32, x + 0.3, 0.0, 0.95, z - 0.65, z + 0.65, look.deep)
        box(paint, x - 0.36, x + 0.32, 0.95, 1.05, z - 0.7, z + 0.7, IRON)
        disc(glow, (x - side * 0.33, 0.45, z), 0.0, 0.3, look.light, 8, "yz")
        for dz, h in ((-0.12, 0.34), (0.1, 0.26), (0.0, 0.5)):
            crystal(glow, (x - side * 0.34, 0.3, z + dz), 0.07, h, LAMP, (0, dz * 0.3))
        lathe(paint, (x, 1.05, z + 0.3), [(0, 0), (0.18, 0.02), (0.24, 0.18), (0.2, 0.34), (0.08, 0.38), (0, 0.38)], BRASS, 8)
        cyl(paint, (x + side * 0.12, 1.05, z - 0.35), 0.11, 2.4, BRASS_DARK, 8)
        for y in (1.8, 2.7):
            cyl(paint, (x + side * 0.12, y, z - 0.35), 0.15, 0.1, BRASS, 8)
        # Barrels beside it.
        for dz in (-0.98, 1.0):
            lathe(paint, (x, 0, z + dz), [(0, 0), (0.22, 0), (0.28, 0.3), (0.22, 0.62), (0, 0.62)], [look.trim, IRON, look.trim], 9)
    for side in (-1, 1):
        for y, r, color in ((3.28, 0.07, BRASS), (3.1, 0.045, BRASS_DARK)):
            paint.tube([(side * (WALL - 0.24), y, 0), (side * (WALL - 0.24), y, -MODULE)], r, color, 6)
    for x in (-2.2, 2.2):
        for z in (-1.2, -3.6):
            paint.tube([(x, 4.98, z), (x, 4.15, z)], 0.015, IRON, 4)
            lathe(glow, (x, 3.72, z), [(0, 0), (0.17, 0.08), (0.22, 0.22), (0.15, 0.38), (0, 0.42)], [look.light, LAMP], 8)
            cyl(paint, (x, 4.12, z), 0.13, 0.08, IRON, 8)
    # A great cog with flames on its teeth.
    hoop(spin, (0, 0, 0), 0.78, 0.09, BRASS, "xz", 24, 5)
    hoop(spin, (0, 0, 0), 0.3, 0.07, BRASS_DARK, "xz", 16, 5)
    for i in range(8):
        a = TAU * i / 8
        u, v = math.cos(a), math.sin(a)
        spin.tube([(u * 0.3, 0, v * 0.3), (u * 0.78, 0, v * 0.78)], 0.05, BRASS_DARK, 4)
        block(spin, (u * 0.94, 0, v * 0.94), (0.16, 0.14, 0.16), BRASS)
        crystal(spin, (u * 0.94, 0.07, v * 0.94), 0.07, 0.36, look.light)
    ball(spin, (0, 0, 0), 0.2, LAMP)
    paint.tube([(0, 5.36, -2.4), (0, 4.35, -2.4)], 0.025, IRON, 4)


def electro_car(look, paint, glow, spin):
    for side, z in prop_places():
        x = side * 3.84
        # A coil that stands in a box of switches, with a spark on top.
        box(paint, x - 0.34, x + 0.3, 0.0, 0.5, z - 0.75, z + 0.75, look.deep)
        for k in range(5):
            block(glow, (x - side * 0.35, 0.28, z - 0.52 + k * 0.26), (0.04, 0.1, 0.13), look.light if k % 2 else c("#45e0ff"))
        cyl(paint, (x, 0.5, z), 0.13, 1.45, IRON_LIGHT, 8)
        for k in range(7):
            hoop(paint, (x, 0.68 + k * 0.18, z), 0.26 - k * 0.012, 0.045, BRASS if k % 2 else BRASS_DARK, "xz", 14, 4)
        hoop(paint, (x, 2.04, z), 0.28, 0.09, STEEL, "xz", 16, 6)
        ball(glow, (x, 2.3, z), 0.19, look.light)
        for dz in (-0.55, 0.6):
            zig = [(x, 2.3, z), (x - side * 0.1, 2.55, z + dz * 0.4), (x, 2.42, z + dz * 0.7), (x - side * 0.05, 2.75, z + dz)]
            glow.tube(zig, 0.018, c("#9ef4ff"), 4)
    for side in (-1, 1):
        for sag, y, color in ((0.35, 4.55, IRON), (0.55, 4.45, look.deep)):
            for k in range(2):
                z = -k * 2.4
                line(paint, [(side * 2.6, y, z), (side * 2.75, y - sag, z - 1.2), (side * 2.6, y, z - 2.4)], 0.035, color, 4)
        for k in range(6):
            block(glow, (side * (WALL - 0.16), 3.28, -0.4 - k * 0.8), (0.05, 0.14, 0.4), c("#45e0ff") if k % 2 else look.light)
    # Rings around a spark, turned against each other.
    hoop(spin, (0, 0, 0), 0.8, 0.05, look.light, "xy", 28, 5)
    hoop(spin, (0, 0, 0), 0.62, 0.045, c("#45e0ff"), "yz", 24, 5)
    hoop(spin, (0, 0, 0), 0.45, 0.04, BRASS, "xz", 20, 5)
    ball(spin, (0, 0, 0), 0.22, WHITE)
    for i in range(6):
        a = TAU * i / 6
        ball(spin, (math.cos(a) * 0.8, math.sin(a) * 0.8, 0), 0.09, WHITE, 1.0, 6, 4)
    paint.tube([(0, 5.36, -2.4), (0, 4.9, -2.4)], 0.025, STEEL, 4)


def aero_car(look, paint, glow, spin):
    leaf = (c("#2fbf6b"), c("#49d886"), c("#1f9d6a"), c("#8be88a"))
    petals = (c("#ff8fc2"), c("#fff07a"), c("#ffffff"), c("#8fd8ff"))
    for side, z in prop_places():
        x = side * 3.82
        # A long planter with shrubs, flowers and one young tree.
        box(paint, x - 0.34, x + 0.34, 0.0, 0.5, z - 0.9, z + 0.9, c("#b97a52"))
        box(paint, x - 0.37, x + 0.37, 0.46, 0.56, z - 0.94, z + 0.94, CREAM)
        for k in range(5):
            dz = -0.68 + k * 0.34
            ball(paint, (x, 0.68 + 0.08 * (k % 2), z + dz), 0.24, leaf[k % 4], 0.9, 7, 4)
            for j in range(3):
                ball(glow, (x - side * 0.2, 0.78 + 0.14 * random.random(), z + dz + (j - 1) * 0.13), 0.05, petals[(k + j) % 4], 1.0, 5, 3)
        line(paint, [(x + side * 0.1, 0.5, z), (x, 1.35, z + 0.12), (x + side * 0.05, 2.1, z)], 0.06, c("#8a5a3c"), 5)
        for dx, dy, dz, r in ((0, 2.35, 0, 0.42), (-0.1, 2.15, 0.36, 0.28), (0.05, 2.1, -0.38, 0.3)):
            ball(paint, (x + side * dx, dy, z + dz), r, leaf[int(r * 10) % 4], 0.85, 8, 5)
    for side in (-1, 1):
        for k in range(8):
            z = -0.3 - k * 0.6
            drop = 0.35 + 0.8 * random.random()
            x = side * (3.1 + 0.2 * (k % 3))
            vine = [(x, 4.66, z), (x - side * 0.1, 4.66 - drop * 0.5, z + 0.08), (x, 4.66 - drop, z)]
            line(paint, vine, 0.018, leaf[2], 4, 4)
            for j in range(3):
                ball(paint, (x + 0.07 * (j - 1), 4.66 - drop * (0.4 + 0.3 * j), z), 0.09, leaf[(k + j) % 4], 0.5, 5, 3)
    # A fan of leaves, like a pinwheel.
    for i in range(6):
        a = TAU * i / 6
        u, v = math.cos(a), math.sin(a)
        mid = (u * 0.6 - v * 0.26, 0.06, v * 0.6 + u * 0.26)
        spin.face([(0, 0, 0), mid, (u * 1.15, -0.04, v * 1.15), (u * 0.55 + v * 0.08, -0.06, v * 0.55 - u * 0.08)], leaf[i % 2 * 2] if i % 3 else leaf[3])
    ball(spin, (0, 0, 0), 0.17, petals[1])
    paint.tube([(0, 5.36, -2.4), (0, 4.35, -2.4)], 0.02, c("#8a5a3c"), 4)


def spectro_car(look, paint, glow, spin):
    velvet, velvet_dark = c("#d23c5c"), c("#9c2446")
    for side, z in prop_places():
        x = side * 3.86
        # A golden column with a small figure of light, between two seats of velvet.
        lathe(paint, (x, 0, z), [(0, 0), (0.28, 0), (0.28, 0.14), (0.17, 0.24), (0.14, 1.15), (0.26, 1.28), (0.26, 1.36), (0, 1.36)], [BRASS, BRASS_PALE], 10)
        crystal(glow, (x, 1.5, z), 0.2, 0.7, look.light, sides=4)
        hoop(glow, (x, 1.86, z), 0.36, 0.022, BRASS_PALE, "yz", 20, 4)
        for dz in (-0.72, 0.72):
            box(paint, x - 0.28, x + 0.28, 0.16, 0.48, z + dz - 0.28, z + dz + 0.28, velvet)
            box(paint, x + side * 0.14, x + side * 0.3, 0.48, 1.12, z + dz - 0.28, z + dz + 0.28, velvet_dark)
            ball(paint, (x + side * 0.22, 1.18, z + dz), 0.1, BRASS, 1.0, 6, 4)
            for lx in (-0.22, 0.22):
                cyl(paint, (x + lx, 0, z + dz), 0.04, 0.16, BRASS_DARK, 6)
    for side in (-1, 1):
        x = side * (WALL - 0.24)
        # Curtains that hang in a bow above every window.
        for k in range(2):
            z = -k * 2.4 - 0.18
            for j in range(3):
                sag = 0.5 - j * 0.12
                line(paint, [(x, 3.5 - j * 0.04, z), (x - side * 0.05, 3.5 - sag, z - 1.02), (x, 3.5 - j * 0.04, z - 2.04)], 0.075, velvet if j % 2 else velvet_dark, 5)
            line(paint, [(x, 3.45, z), (x, 2.7, z - 0.1), (x - side * 0.05, 1.9, z)], 0.09, velvet, 5)
            ball(paint, (x, 3.5, z), 0.12, BRASS)
    for x in (-2.3, 2.3):
        z = -2.4
        paint.tube([(x, 4.9, z), (x, 4.35, z)], 0.015, BRASS, 4)
        hoop(paint, (x, 4.25, z), 0.36, 0.03, BRASS, "xz", 16, 4)
        for i in range(6):
            a = TAU * i / 6
            crystal(glow, (x + math.cos(a) * 0.36, 4.27, z + math.sin(a) * 0.36), 0.045, 0.22, LAMP, sides=4)
            crystal(glow, (x + math.cos(a) * 0.2, 4.22, z + math.sin(a) * 0.2), 0.035, -0.28, WHITE, sides=4)
    # A star of prisms.
    for i in range(8):
        a = TAU * i / 8
        long = 0.95 if i % 2 == 0 else 0.55
        u, v = math.cos(a), math.sin(a)
        tip = (u * long, v * long, 0)
        left = (math.cos(a + 0.45) * 0.24, math.sin(a + 0.45) * 0.24, 0)
        right = (math.cos(a - 0.45) * 0.24, math.sin(a - 0.45) * 0.24, 0)
        for depth in (-0.16, 0.16):
            spin.face([(0, 0, depth), left, tip], BRASS_PALE)
            spin.face([(0, 0, depth), tip, right], BRASS)
    hoop(spin, (0, 0, 0), 0.72, 0.022, WHITE, "xy", 32, 4)
    paint.tube([(0, 5.36, -2.4), (0, 4.95, -2.4)], 0.02, BRASS, 4)


def havoc_car(look, paint, glow, spin):
    stone = (c("#4a2756"), c("#361b44"), c("#63336b"))
    for side, z in prop_places():
        x = side * 3.84
        # A broken pillar with shards of the dark floating above it.
        lathe(paint, (x, 0, z), [(0, 0), (0.34, 0), (0.34, 0.16), (0.2, 0.28), (0.19, 0.9), (0.24, 1.0), (0, 1.12)], [stone[0], stone[2]], 6)
        for dy, dz, r, h in ((1.45, 0.0, 0.2, 0.6), (1.25, 0.6, 0.1, 0.32), (2.05, -0.45, 0.13, 0.4), (2.4, 0.3, 0.08, 0.25)):
            crystal(paint, (x, dy, z + dz), r, h, stone[1], (side * 0.1, dz * 0.2), 4)
            hoop(glow, (x, dy + h * 0.45, z + dz), r * 1.5, 0.012, look.light, "xz", 12, 3)
        for dz in (-0.85, 0.85):
            crystal(glow, (x, 0, z + dz), 0.12, 0.7, look.light, (side * 0.15, dz * 0.25), 4)
    # Cracks that shine through the floor.
    for side in (-1, 1):
        points = [(side * (1.5 + random.random() * 1.6), 0.014, -k * 0.6) for k in range(9)]
        glow.tube(points, 0.016, look.light, 3)
        for k in (2, 5, 7):
            p = points[k]
            glow.tube([p, (p[0] + side * 0.55, 0.014, p[2] - 0.35)], 0.012, look.light, 3)
    # Pieces of the broken wall that never fell.
    for _ in range(16):
        x = -WALL - 0.2 - random.random() * 0.9
        at = (x, 1.4 + random.random() * 2.8, -random.random() * MODULE)
        crystal(paint, at, 0.08 + random.random() * 0.16, 0.2 + random.random() * 0.4, stone[int(random.random() * 3)], (random.random() * 0.3 - 0.15, 0.1), 4)
    # An eye of the void.
    crystal(spin, (0, 0, 0), 0.3, 0.55, c("#160820"), sides=4)
    crystal(spin, (0, 0, 0), 0.3, -0.55, c("#160820"), sides=4)
    hoop(spin, (0, 0, 0), 0.7, 0.04, look.light, "xy", 28, 4)
    hoop(spin, (0, 0, 0), 0.95, 0.022, c("#8a5cff"), "xz", 32, 4)
    ball(spin, (0, 0, 0.3), 0.1, look.light)
    for i in range(5):
        a = TAU * i / 5
        crystal(spin, (math.cos(a) * 0.95, -0.12, math.sin(a) * 0.95), 0.08, 0.3, look.light, sides=4)


CARS = {
    "glacio": (glacio_car, 4.2, "y", 0.35),
    "fusion": (fusion_car, 4.2, "y", 0.5),
    "electro": (electro_car, 4.25, "y", 1.1),
    "aero": (aero_car, 4.25, "y", 1.8),
    "spectro": (spectro_car, 4.1, "y", 0.6),
    "havoc": (havoc_car, 4.15, "y", -0.45),
}


def berth(look, paint, glow):
    """The place of one Resonator, with its front toward +z and a bow of light behind."""
    lathe(paint, (0, 0, 0), [(0, 0), (0.82, 0), (0.82, 0.07), (0.72, 0.1), (0.68, 0.22), (0, 0.22)], [BRASS, look.deep, WHITE], 12)
    disc(glow, (0, 0.224, 0), 0.5, 0.62, look.light, 24)
    disc(glow, (0, 0.225, 0), 0.2, 0.24, look.light, 16)
    hoop(paint, (0, 1.2, -0.7), 0.95, 0.055, BRASS, "xy", 28, 5, -0.5, math.pi + 1.0)
    hoop(glow, (0, 1.2, -0.7), 0.82, 0.02, look.light, "xy", 28, 4, -0.4, math.pi + 0.8)
    for a in (-0.5, math.pi + 0.5):
        x = 0.95 * math.cos(a)
        paint.tube([(x, 0.0, -0.7), (x, 1.2 + 0.95 * math.sin(a), -0.7)], 0.045, BRASS, 5)
    for i in range(5):
        a = math.pi * (i + 1) / 6
        crystal(glow, (math.cos(a) * 0.95, 1.2 + math.sin(a) * 0.95, -0.7), 0.06, 0.2, look.light, (math.cos(a) * 0.08, 0), 4)


# ---------------------------------------------------------------- the rest of the train


def portal_frame(paint, glow, z):
    """The open front of a carriage: two posts beside the way, and an arch above."""
    for side in (-1, 1):
        for x, r in ((side * (WALL - 0.05), 0.16), (side * 1.85, 0.085)):
            cyl(paint, (x, 0, z), r, 3.9, BRASS_DARK, 8)
            cyl(paint, (x, 0, z), r * 1.6, 0.18, BRASS, 8)
            ball(glow, (x, 4.05, z), r * 1.1, LAMP)
        # A low rail between them, which the eyes pass over.
        box(paint, side * 1.85 - 0.01, side * (WALL - 0.05) + 0.01, 0.9, 1.0, z - 0.05, z + 0.05, BRASS)
        for k in range(1, 6):
            x = side * (1.85 + k * 0.4)
            paint.tube([(x, 0, z), (x, 0.9, z)], 0.03, BRASS_DARK, 5)
        hoop(paint, (side * 3.0, 3.35, z), 0.5, 0.035, BRASS, "xy", 18, 4)
        crystal(glow, (side * 3.0, 3.1, z), 0.16, 0.5, WHITE, sides=4)
    line(paint, [(-WALL, 3.9, z), (-2.6, 4.45, z), (0, 4.75, z), (2.6, 4.45, z), (WALL, 3.9, z)], 0.13, BRASS_DARK, 6)
    line(paint, [(-1.85, 3.75, z), (-0.9, 4.05, z), (0, 4.15, z), (0.9, 4.05, z), (1.85, 3.75, z)], 0.07, BRASS, 5)


def joint(paint, glow):
    portal_frame(paint, glow, -0.06)
    portal_frame(paint, glow, -JOINT + 0.06)
    half = WALK["joint"] + 0.3
    for k in range(8):
        z = -k * JOINT / 8
        box(paint, -half, half, -0.16, 0.0, z - JOINT / 8 + 0.03, z, IRON_LIGHT if k % 2 else STEEL)
    for side in (-1, 1):
        x = side * half
        # Folds of leather, low enough to look over.
        crest = []
        for k in range(9):
            z = -0.2 - k * (JOINT - 0.4) / 8
            out = 0.12 if k % 2 else -0.04
            paint.tube([(x + side * out, -0.12, z), (x + side * out, 0.4, z)], 0.07, c("#8e4a8a"), 5)
            crest.append((x + side * out, 0.4, z))
        paint.tube(crest, 0.05, BRASS, 5)
        line(paint, [(x, 1.05, -0.1), (x, 0.82, -JOINT / 2), (x, 1.05, -JOINT + 0.1)], 0.035, BRASS, 5)
        box(glow, x - side * 0.1 - 0.03, x - side * 0.1 + 0.03, 0.0, 0.03, -JOINT, 0, LAMP)
    box(paint, -0.35, 0.35, -1.5, -0.9, -JOINT - 0.4, 0.4, IRON)
    cyl(paint, (0, -1.2, -JOINT / 2 - 0.2), 0.55, 0.4, IRON_LIGHT, 10, "z")


def railing(paint, glow, points, height=1.05):
    line(paint, [(x, height, z) for x, z in points], 0.07, BRASS, 6)
    line(paint, [(x, height * 0.55, z) for x, z in points], 0.035, BRASS_DARK, 5)
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        count = max(int(math.hypot(bx - ax, bz - az) / 0.6), 1)
        for k in range(count + 1):
            x, z = ax + (bx - ax) * k / count, az + (bz - az) * k / count
            paint.tube([(x, 0, z), (x, height, z)], 0.035, BRASS_DARK, 5)
    for x, z in points:
        cyl(paint, (x, 0, z), 0.1, height + 0.15, BRASS_DARK, 8)
        ball(glow, (x, height + 0.3, z), 0.15, LAMP)


def deck_floor(paint, glow, length, outline):
    """A deck from z 0 to +length, whose far corners are cut."""
    wood = (c("#b9714f"), c("#a45f46"))
    half = WALL + 0.15
    count = int(length / 0.5)
    for k in range(count):
        z0, z1 = k * length / count, (k + 1) * length / count
        a, b = outline(z0), outline(z1)
        paint.face([(-a, 0, z0), (a, 0, z0), (b, 0, z1), (-b, 0, z1)], wood[k % 2])
        for side in (-1, 1):
            paint.face([(side * a, 0, z0), (side * a, -0.5, z0), (side * b, -0.5, z1), (side * b, 0, z1)], IRON)
            glow.tube([(side * a, -0.28, z0), (side * b, -0.28, z1)], 0.045, LAMP, 4)
    end = outline(length)
    paint.face([(-end, 0, length), (end, 0, length), (end, -0.5, length), (-end, -0.5, length)], IRON)
    box(paint, -2.8, 2.8, -0.95, -0.5, 0, length * 0.85, NIGHT)
    return half


def tail(paint, glow):
    def outline(z):
        return WALL + 0.15 - max(z - TAIL * 0.55, 0) * 0.45

    deck_floor(paint, glow, TAIL, outline)
    box(paint, -1.15, 1.15, 0.0, 0.012, 0, TAIL - 1.2, c("#4f55b8"))
    for side in (-1, 1):
        box(glow, side * 1.18 - 0.04, side * 1.18 + 0.04, 0.0, 0.025, 0, TAIL - 1.2, LAMP)
        railing(paint, glow, [(side * 4.15, 0.1), (side * 4.15, TAIL * 0.55), (side * 2.95, TAIL - 0.25), (side * 1.4, TAIL - 0.12)])
        # Red lamps at the very end, and flags.
        ball(glow, (side * 3.3, -0.1, TAIL + 0.02), 0.22, RED)
        cyl(paint, (side * 3.85, 0, TAIL * 0.55), 0.06, 4.2, IRON_LIGHT, 6)
        paint.face([(side * 3.85, 4.2, TAIL * 0.55), (side * 3.85, 3.45, TAIL * 0.55), (side * 3.85, 3.8, TAIL * 0.55 + 1.5)], RED if side < 0 else c("#6f8cff"))
        # Luggage that waits to be taken in.
        for z, w, h, color in ((1.2, 0.8, 0.55, "#7a4fc0"), (2.15, 0.65, 0.4, "#2fa88a")):
            box(paint, side * 3.75 - 0.3, side * 3.75 + 0.3, 0, h, z - w / 2, z + w / 2, c(color))
            box(paint, side * 3.75 - 0.31, side * 3.75 + 0.31, h * 0.4, h * 0.55, z - w / 2 - 0.01, z + w / 2 + 0.01, BRASS)
        box(paint, side * 3.75 - 0.24, side * 3.75 + 0.24, 0.55, 0.9, 0.95, 1.4, c("#d2566a"))
    railing(paint, glow, [(-1.4, TAIL - 0.12), (1.4, TAIL - 0.12)])


def nose(paint, glow):
    """The deck before the engine, from z 0 to -NOSE."""
    mirrored, shining = Shape(), Shape()

    def outline(z):
        return WALL + 0.15 - max(z - NOSE * 0.55, 0) * 0.5

    deck_floor(mirrored, shining, NOSE, outline)
    for side in (-1, 1):
        railing(mirrored, shining, [(side * 4.15, 0.1), (side * 4.15, NOSE * 0.55), (side * 2.9, NOSE - 0.15)])
    railing(mirrored, shining, [(-2.9, NOSE - 0.15), (2.9, NOSE - 0.15)])
    for source, target in ((mirrored, paint), (shining, glow)):
        for face, color in zip(source.faces, source.colors):
            target.face([(x, y, -z) for x, y, z in (source.verts[i] for i in face)], color)
    box(paint, -0.35, 0.35, -1.5, -0.9, -NOSE - 1.8, -NOSE + 0.6, IRON)
    # A brass wheel to steer by, though the train knows its way.
    cyl(paint, (-2.4, 0, -NOSE + 1.1), 0.09, 1.05, BRASS_DARK, 8)
    hoop(paint, (-2.4, 1.25, -NOSE + 1.1), 0.42, 0.045, BRASS, "xy", 20, 5)
    for i in range(6):
        a = TAU * i / 6
        paint.tube([(-2.4, 1.25, -NOSE + 1.1), (-2.4 + math.cos(a) * 0.54, 1.25 + math.sin(a) * 0.54, -NOSE + 1.1)], 0.025, BRASS_DARK, 4)


def locomotive(paint, glow, ring_paint, ring_glow):
    """The engine, from z -1.5 to -22, with its front toward -z."""
    body, band = c("#4a42b8"), BRASS
    dark = c("#2f2a80")
    # The cab, open so the way ahead is seen.
    box(paint, -3.4, 3.4, -1.0, 0.1, -6.4, -1.6, dark)
    for side in (-1, 1):
        box(paint, side * 3.2 - 0.18, side * 3.2 + 0.18, 0.1, 1.5, -6.2, -1.8, body)
        box(paint, side * 3.2 - 0.22, side * 3.2 + 0.22, 1.5, 1.62, -6.25, -1.75, band)
        for z in (-1.9, -6.1):
            cyl(paint, (side * 3.2, 1.6, z), 0.16, 3.0, body, 8)
    box(paint, -2.6, 2.6, 0.1, 1.15, -6.4, -6.1, body)
    box(paint, -2.65, 2.65, 1.15, 1.27, -6.45, -6.05, band)
    roof = [(-3.7, 4.45), (-2.6, 5.0), (0, 5.3), (2.6, 5.0), (3.7, 4.45)]
    for (ax, ay), (bx, by) in zip(roof, roof[1:]):
        paint.face([(ax, ay, -1.4), (bx, by, -1.4), (bx, by, -6.6), (ax, ay, -6.6)], c("#ff5f7f"))
    for z in (-1.4, -6.6):
        line(paint, [(x, y, z) for x, y in roof], 0.1, band, 6)
    # The boiler with its bands.
    lathe(paint, (0, 0.55, -6.4), [(0, 0), (2.15, 0), (2.15, -9.2), (2.3, -9.4), (2.3, -12.4), (1.95, -12.7), (0, -12.7)], [body, body, band, dark, band, dark], 18, "z")
    for z in (-8.2, -10.6, -13.0, -15.4):
        hoop(paint, (0, 0.55, z), 2.18, 0.09, band, "xy", 36, 5)
    # The face that the visitor sees from the deck: the fire door, the dials, pipes and levers.
    disc(glow, (0, 0.55, -6.06), 0.0, 0.46, c("#ff8a30"), 16, "xy")
    hoop(paint, (0, 0.55, -6.04), 0.52, 0.09, band, "xy", 24, 5)
    for x, h in ((-0.22, 0.45), (0.0, 0.66), (0.2, 0.38)):
        crystal(glow, (x, 0.2, -6.0), 0.11, h, LAMP, (x * 0.2, 0))
    for x in (-0.22, 0.0, 0.22):
        paint.tube([(x, 0.12, -5.94), (x, 0.98, -5.94)], 0.022, dark, 4)
    hoop(paint, (0, 0.55, -6.36), 2.2, 0.09, band, "xy", 36, 5)
    for x, y, r, turn in ((-1.15, 1.75, 0.34, 2.3), (0.0, 2.1, 0.42, 1.1), (1.15, 1.75, 0.34, 0.5)):
        disc(glow, (x, y, -6.34), 0.0, r, CREAM, 18, "xy")
        hoop(paint, (x, y, -6.32), r, 0.07, band, "xy", 24, 5)
        paint.tube([(x, y, -6.3), (x + math.cos(turn) * r * 0.75, y + math.sin(turn) * r * 0.75, -6.3)], 0.025, RED, 4)
        ball(paint, (x, y, -6.29), 0.06, dark, 1.0, 6, 4)
        paint.tube([(x, y - r, -6.32), (x, 1.27, -6.32)], 0.045, BRASS_DARK, 5)
    for side in (-1, 1):
        line(paint, [(side * 0.55, 0.55, -6.06), (side * 1.4, 0.55, -6.04), (side * 1.75, 0.85, -6.04), (side * 1.75, 1.2, -6.2)], 0.06, BRASS_DARK, 5)
        paint.tube([(side * 2.2, 1.27, -6.2), (side * 2.05, 2.0, -5.9)], 0.05, STEEL, 5)
        ball(glow, (side * 2.05, 2.08, -5.88), 0.14, RED)
    # The chimney, the dome and the bell.
    lathe(paint, (0, 2.6, -17.4), [(0, 0), (0.6, 0), (0.45, 0.4), (0.45, 1.5), (0.8, 2.1), (0.85, 2.35), (0.6, 2.35), (0, 2.2)], [dark, body, body, band, band, dark], 12)
    lathe(paint, (0, 2.55, -10.0), [(0, 0), (0.85, 0), (0.8, 0.45), (0.55, 0.8), (0.15, 0.98), (0, 1.0)], band, 12)
    lathe(paint, (0, 2.8, -13.9), [(0, 0.62), (0.18, 0.56), (0.3, 0.2), (0.45, 0.0), (0, 0.05)], BRASS_PALE, 10)
    # The great lamp, and the face around it.
    hoop(paint, (0, 0.55, -19.15), 1.15, 0.2, band, "xy", 28, 6)
    disc(glow, (0, 0.55, -19.2), 0.0, 1.0, LAMP, 24, "xy")
    disc(glow, (0, 0.55, -19.24), 0.0, 0.5, WHITE, 18, "xy")
    for i in range(8):
        a = TAU * i / 8
        glow.tube([(math.cos(a) * 1.5, 0.55 + math.sin(a) * 1.5, -19.0), (math.cos(a) * 1.85, 0.55 + math.sin(a) * 1.85, -18.9)], 0.06, LAMP, 4)
    # The frame, the rods of light and the plough.
    box(paint, -2.7, 2.7, -1.5, -0.7, -19.4, -6.4, dark)
    for side in (-1, 1):
        box(glow, side * 2.74 - 0.03, side * 2.74 + 0.03, -1.15, -1.0, -19.3, -6.5, c("#45e0ff"))
        paint.tube([(side * 2.95, -1.75, -7.6), (side * 2.95, -1.75, -17.0)], 0.1, STEEL, 6)
        box(paint, side * 2.6 - 0.5, side * 2.6 + 0.5, -0.35, -0.15, -18.8, -6.8, band)
    for k in range(7):
        x = -2.7 + k * 0.9
        paint.tube([(x, -0.95, -19.4), (x * 0.35, -2.75, -21.8)], 0.13, c("#ff5f7f"), 5)
    line(paint, [(-2.8, -1.0, -19.4), (-1.1, -2.65, -21.5), (0, -2.8, -22.0), (1.1, -2.65, -21.5), (2.8, -1.0, -19.4)], 0.14, band, 6)
    # The ring of the resonance, which turns around the boiler.
    hoop(ring_paint, (0, 0, 0), 3.5, 0.14, band, "xy", 56, 6)
    hoop(ring_glow, (0, 0, 0), 3.15, 0.045, c("#45e0ff"), "xy", 56, 4)
    for i in range(12):
        a = TAU * i / 12
        crystal(ring_glow, (math.cos(a) * 3.5, math.sin(a) * 3.5, 0), 0.16, 0.55, c("#a374ff") if i % 2 else c("#45e0ff"), (math.cos(a) * 0.35, 0), 4)


def bogie(paint, glow):
    for side in (-1, 1):
        x = side * (WHEEL["x"] + 0.32)
        box(paint, x - 0.12, x + 0.12, -1.85, -1.4, -1.75, 1.75, IRON_LIGHT)
        for z in WHEEL["axles"]:
            cyl(glow, (x - 0.15, -1.62, z), 0.16, 0.3, LAMP, 8, "x")
    box(paint, -2.2, 2.2, -1.5, -0.9, -0.4, 0.4, IRON)


def wheel(paint, glow):
    """Both wheels of an axle, around their zero point."""
    r = WHEEL["radius"]
    for side in (-1, 1):
        x = side * WHEEL["x"]
        lathe(paint, (x - 0.12, 0, 0), [(r - 0.18, 0), (r, 0), (r, 0.24), (r - 0.18, 0.24), (r - 0.18, 0)], [STEEL, IRON, STEEL, IRON], 16, "x")
        cyl(paint, (x - 0.16, 0, 0), 0.2, 0.32, BRASS, 8, "x")
        for i in range(6):
            a = TAU * i / 6
            paint.tube([(x, 0, 0), (x, math.sin(a) * (r - 0.15), math.cos(a) * (r - 0.15))], 0.05, BRASS_DARK, 4)
        hoop(glow, (x + side * 0.14, 0, 0), r * 0.55, 0.022, c("#45e0ff"), "yz", 18, 3)
    paint.tube([(-WHEEL["x"], 0, 0), (WHEEL["x"], 0, 0)], 0.09, IRON, 6)


# ---------------------------------------------------------------- the country outside


def track(paint, glow):
    bed = c("#3b3568")
    box(paint, -3.3, 3.3, RAIL - 0.75, RAIL - 0.35, -CHUNK, 0, bed)
    for k in range(32):
        z = -k * CHUNK / 32
        box(paint, -2.9, 2.9, RAIL - 0.35, RAIL - 0.17, z - 0.55, z, c("#6b4a5e"))
    for side in (-1, 1):
        box(paint, side * WHEEL["x"] - 0.09, side * WHEEL["x"] + 0.09, RAIL - 0.17, RAIL, -CHUNK, 0, STEEL)
        box(glow, side * 3.34 - 0.05, side * 3.34 + 0.05, RAIL - 0.5, RAIL - 0.4, -CHUNK, 0, LAMP)
    # A pier of the viaduct, down into the haze.
    for z in (-10.0, -30.0):
        for side in (-1, 1):
            paint.tube([(side * 2.4, RAIL - 0.7, z), (side * 3.6, GROUND - 9, z)], 0.5, bed, 6)
        paint.tube([(-3.0, GROUND - 3, z), (3.0, GROUND - 3, z)], 0.25, bed, 5)


def land_base(paint, near, far, shade):
    """Two banks of ground beside the track, in rows that are a little uneven."""
    xs = (7.0, 14.0, 24.0, 38.0, 58.0, 92.0)
    rows = 8
    for side in (-1, 1):
        heights = {}
        for i in range(len(xs)):
            for j in range(rows):
                rough = random.random() * (0.4 + i * 0.55)
                heights[i, j] = GROUND + (rough if i else -3.5)
        for j in range(rows + 1):
            for i in range(len(xs)):
                # The last row is the first one again, so one length meets the next.
                heights[i, rows] = heights[i, 0]
        for i in range(len(xs) - 1):
            for j in range(rows):
                z0, z1 = -j * CHUNK / rows, -(j + 1) * CHUNK / rows
                quad = [
                    (side * xs[i], heights[i, j], z0),
                    (side * xs[i + 1], heights[i + 1, j], z0),
                    (side * xs[i + 1], heights[i + 1, j + 1], z1),
                    (side * xs[i], heights[i, j + 1], z1),
                ]
                color = near if i < 2 else far
                paint.face(quad[:3], color)
                paint.face([quad[0], quad[2], quad[3]], shade if (i + j) % 3 == 0 else color)


def spots(count, low, high):
    """Places beside the track, at both sides, inside one length."""
    for index in range(count):
        side = -1 if index % 2 else 1
        yield (
            side * (low + random.random() * (high - low)),
            -(index + random.random()) * CHUNK / count,
            side,
        )


def glacio_land(look, paint, glow):
    land_base(paint, c("#e8f7ff"), c("#c3e4fb"), c("#a9d4f6"))
    for x, z, _ in spots(6, 44, 80):
        h = 14 + random.random() * 18
        r = h * 0.55
        cyl(paint, (x, GROUND, z), r, h * 0.62, c("#6fa8e4"), 6, top=r * 0.38)
        cyl(paint, (x, GROUND + h * 0.62, z), r * 0.38, h * 0.38, WHITE, 6, top=0.0)
    for x, z, side in spots(12, 9, 32):
        h = 3 + random.random() * 3.5
        cyl(paint, (x, GROUND, z), 0.22, 0.8, c("#5b6aa8"), 5)
        for k in range(3):
            y = GROUND + 0.7 + k * h * 0.23
            cyl(paint, (x, y, z), h * 0.28 * (1 - k * 0.24), h * 0.36, c("#2f8fb8") if k % 2 else c("#4fb0d8"), 6, top=0.0)
            cyl(paint, (x, y + h * 0.2, z), h * 0.14 * (1 - k * 0.24), h * 0.17, WHITE, 6, top=0.0)
    for x, z, side in spots(8, 8, 22):
        for j in range(3):
            crystal(glow if j == 0 else paint, (x + j * 0.7, GROUND, z + j * 0.5), 0.45 - j * 0.1, 3.4 - j, look.light if j == 0 else look.trim, (side * j * 0.5, 0.3 * j))


def fusion_land(look, paint, glow):
    land_base(paint, c("#5a2838"), c("#3f1b30"), c("#7a3438"))
    for x, z, _ in spots(4, 42, 72):
        h = 15 + random.random() * 14
        lathe(paint, (x, GROUND, z), [(h * 0.85, 0), (h * 0.45, h * 0.5), (h * 0.22, h * 0.86), (h * 0.17, h)], [c("#4a1f34"), c("#682a36"), c("#8c3636")], 8)
        disc(glow, (x, GROUND + h - 0.3, z), 0.0, h * 0.18, c("#ffb030"), 8)
        for a in (0.4, 2.5, 4.3):
            glow.tube(
                [(x + math.cos(a) * h * r, GROUND + h * y, z + math.sin(a) * h * r) for r, y in ((0.18, 1.01), (0.27, 0.8), (0.5, 0.48), (0.86, 0.02))],
                0.35, look.light, 4,
            )
        for k in range(3):
            ball(paint, (x + k * 2.2, GROUND + h + 3 + k * 3.4, z + k), 2.0 + k * 0.8, c("#7a4a62"), 0.7, 7, 4)
    for x, z, side in spots(8, 9, 30):
        flow = [(x + side * k * 0.8 * math.sin(k * 1.7), GROUND + 1.3, z + k * 2.2) for k in range(-2, 3)]
        glow.tube(flow, 0.45, c("#ff7a1c"), 4)
    for x, z, side in spots(14, 8, 34):
        for j in range(3):
            crystal(paint, (x + j * 0.9, GROUND, z - j * 0.7), 0.7 - j * 0.16, 4.5 - j * 1.1, c("#33142a") if j else c("#4e1e32"), (side * (0.4 + j * 0.4), 0.2), 4)
        ball(glow, (x, GROUND + 1.0, z + 1.2), 0.35, look.light, 1.0, 6, 4)


def electro_land(look, paint, glow):
    land_base(paint, c("#33246e"), c("#231a56"), c("#46308a"))
    # Masts with lines between them, one at every half length, so the lines meet.
    for side in (-1, 1):
        for z in (0.0, -CHUNK / 2):
            x = side * 12.0
            for leg in (-1, 1):
                paint.tube([(x + leg * 1.4, GROUND, z), (x + leg * 0.35, GROUND + 11, z)], 0.16, c("#8a7ad8"), 4)
            for y in (3.5, 7.0, 9.5):
                paint.tube([(x - 1.9 + y * 0.09, GROUND + y, z), (x + 1.9 - y * 0.09, GROUND + y, z)], 0.1, c("#8a7ad8"), 4)
            ball(glow, (x, GROUND + 11.5, z), 0.5, look.light)
            for dx in (-1.1, 1.1):
                line(glow, [(x + dx, GROUND + 9.5, z), (x + dx, GROUND + 8.0, z - CHUNK / 4), (x + dx, GROUND + 9.5, z - CHUNK / 2)], 0.045, c("#7fe8ff"), 3)
    for x, z, _ in spots(9, 24, 72):
        h = 9 + random.random() * 17
        cyl(paint, (x, GROUND, z), 1.8, h, c("#2c1f66"), 5, top=0.9)
        crystal(glow, (x, GROUND + h + 0.8, z), 1.2, 3.8, look.light, sides=4)
        for k in range(3):
            hoop(glow, (x, GROUND + h * (0.3 + 0.22 * k), z), 2.0 - k * 0.3, 0.09, c("#7fe8ff") if k % 2 else look.light, "xz", 16, 3)
    for x, z, _ in spots(4, 20, 55):
        y = 16 + random.random() * 12
        for dx, dy, r in ((0, 0, 3.2), (3.2, -0.5, 2.3), (-3.0, -0.3, 2.5)):
            ball(paint, (x + dx, y + dy, z), r, c("#4a3a8f"), 0.55, 8, 4)
        bolt = [(x, y - 1.5, z), (x + 1.2, y - 5, z), (x - 0.4, y - 5.6, z), (x + 0.8, y - 10, z)]
        glow.tube(bolt, 0.18, c("#fff6a0"), 4)


def aero_land(look, paint, glow):
    land_base(paint, c("#8fe08a"), c("#66cc8c"), c("#a8ec8a"))
    for x, z, _ in spots(6, 34, 76):
        r = 9 + random.random() * 9
        ball(paint, (x, GROUND, z), r, c("#4fbf8a") if random.random() > 0.5 else c("#79d68f"), 0.5, 12, 6)
    for x, z, side in spots(3, 16, 30):
        # A windmill.
        cyl(paint, (x, GROUND, z), 1.8, 9.0, CREAM, 8, top=1.0)
        cyl(paint, (x, GROUND + 9.0, z), 1.35, 1.8, c("#ff7a6a"), 8, top=0.0)
        hub = (x - side * 1.4, GROUND + 8.4, z)
        for i in range(4):
            a = TAU * i / 4 + 0.4
            u, v = math.cos(a), math.sin(a)
            paint.face(
                [hub, (hub[0], hub[1] + v * 5.6, hub[2] + u * 5.6), (hub[0], hub[1] + v * 5.0 + u * 1.3, hub[2] + u * 5.0 - v * 1.3)],
                WHITE,
            )
        ball(paint, hub, 0.45, BRASS)
    for x, z, _ in spots(16, 8, 34):
        h = 1.8 + random.random() * 1.8
        cyl(paint, (x, GROUND, z), 0.24, h, c("#8a5a3c"), 5)
        ball(paint, (x, GROUND + h + 0.8, z), 1.0 + random.random() * 0.8, c(random.choice(("#35c07a", "#59d98a", "#ff9ec8", "#2fa878"))), 0.85, 8, 5)
    for x, z, _ in spots(26, 7.5, 20):
        ball(glow, (x, GROUND + 1.0, z), 0.22, c(random.choice(("#ff8fc2", "#fff07a", "#ffffff"))), 0.8, 5, 3)
    for x, z, _ in spots(3, 18, 50):
        y = 18 + random.random() * 10
        for dx, r in ((0, 2.6), (2.7, 1.8), (-2.5, 2.0)):
            ball(paint, (x + dx, y, z), r, WHITE, 0.55, 8, 4)


def spectro_land(look, paint, glow):
    land_base(paint, c("#ffe08a"), c("#f6c75e"), c("#fff0ac"))
    white = c("#fff8e8")
    for x, z, side in spots(5, 14, 34):
        # An arch of white stone that stands alone in the field.
        for dz in (-2.6, 2.6):
            cyl(paint, (x, GROUND, z + dz), 0.65, 7.0, white, 8, top=0.52)
            cyl(paint, (x, GROUND + 7.0, z + dz), 0.9, 0.45, BRASS, 8)
        line(paint, [(x, GROUND + 7.4, z - 2.6), (x, GROUND + 9.4, z - 1.5), (x, GROUND + 10.0, z), (x, GROUND + 9.4, z + 1.5), (x, GROUND + 7.4, z + 2.6)], 0.5, white, 6)
        crystal(glow, (x, GROUND + 11.2, z), 0.7, 2.4, look.light, sides=4)
    for x, z, _ in spots(4, 44, 74):
        h = 8 + random.random() * 6
        cyl(paint, (x, GROUND, z), 6.0, h, white, 10)
        ball(paint, (x, GROUND + h, z), 5.6, c("#ffca45"), 0.9, 12, 6)
        crystal(glow, (x, GROUND + h + 5.0, z), 0.8, 4.0, LAMP, sides=4)
    for x, z, _ in spots(18, 8, 32):
        h = 3.0 + random.random() * 3.0
        lathe(paint, (x, GROUND, z), [(0, 0), (0.6, 0.6), (0.75, h * 0.4), (0.4, h * 0.75), (0, h)], c("#b8902a") if random.random() > 0.4 else c("#5f9a54"), 7)
    for x, z, _ in spots(5, 18, 48):
        y = 11 + random.random() * 12
        hoop(glow, (x, y, z), 2.2, 0.16, look.light, "xy", 28, 4)
        hoop(glow, (x, y, z), 1.4, 0.09, WHITE, "yz", 20, 4)


def havoc_land(look, paint, glow):
    land_base(paint, c("#2c1236"), c("#1c0a26"), c("#42184a"))
    rock = (c("#3a1844"), c("#52245c"), c("#251030"))
    for x, z, _ in spots(8, 16, 60):
        # A rock that has left the ground.
        y = 3 + random.random() * 18
        r = 1.6 + random.random() * 3.2
        crystal(paint, (x, y, z), r, r * 0.8, rock[1], sides=6)
        crystal(paint, (x, y, z), r, -r * 1.7, rock[0], sides=6)
        crystal(glow, (x, y + r * 0.7, z), r * 0.16, r * 0.9, look.light, sides=4)
    for x, z, side in spots(10, 8, 30):
        h = 2.5 + random.random() * 6
        cyl(paint, (x, GROUND, z), 0.8, h, rock[1], 6, top=0.62)
        crystal(paint, (x, GROUND + h, z), 0.6, 1.1, rock[0], (side * 0.5, 0.2), 4)
    for x, z, side in spots(10, 8, 40):
        crack = [(x + (k % 2) * 1.6, GROUND + 1.5, z + k * 1.8) for k in range(-2, 3)]
        glow.tube(crack, 0.2, look.light, 3)
    for x, z, side in spots(2, 34, 52):
        y = 12 + random.random() * 8
        hoop(glow, (x, y, z), 5.0, 0.22, look.light, "xy", 36, 4)
        hoop(glow, (x, y, z), 3.4, 0.12, c("#8a5cff"), "xy", 28, 4)
        ball(glow, (x, y, z), 1.1, c("#ff9ac4"), 1.0, 10, 6)


LANDS = {
    "glacio": glacio_land,
    "fusion": fusion_land,
    "electro": electro_land,
    "aero": aero_land,
    "spectro": spectro_land,
    "havoc": havoc_land,
}


def gate(paint, glow):
    """A ring around the whole train. Its light is white; the page gives it a color."""
    hoop(paint, (0, 1.0, 0), 11.5, 0.55, c("#6a62b8"), "xy", 64, 6)
    hoop(glow, (0, 1.0, 0), 10.6, 0.16, WHITE, "xy", 64, 4)
    hoop(glow, (0, 1.0, 0), 12.5, 0.08, WHITE, "xy", 64, 3)
    for i in range(16):
        a = TAU * i / 16
        crystal(glow, (math.cos(a) * 12.6, 1.0 + math.sin(a) * 12.6, 0), 0.4, 1.6, WHITE, (math.cos(a) * 1.1, 0), 4)
    for side in (-1, 1):
        paint.tube([(side * 9.2, -5.5, 0), (side * 9.8, GROUND - 6, 0)], 0.8, c("#4a4494"), 6)


def whale(paint, glow, tail_paint, tail_glow):
    """A whale of the sky, with its head toward -z."""
    skin, belly = c("#5a6ee0"), c("#c7d2ff")
    profile = [(0, -11), (1.6, -10.4), (2.9, -8.4), (3.5, -4.5), (3.2, 0), (2.3, 4.0), (1.25, 7.2), (0.65, 9.0)]
    lathe(paint, (0, 0, 0), profile, skin, 14, "z")
    lathe(paint, (0, -0.55, 0), [(r * 0.92, z) for r, z in profile], belly, 14, "z")
    for side in (-1, 1):
        paint.face([(side * 2.9, -0.8, -5.0), (side * 8.2, -2.4, -1.0), (side * 7.4, -2.3, 0.4), (side * 2.9, -0.9, -2.0)], skin)
        ball(glow, (side * 2.55, 0.4, -8.4), 0.35, WHITE)
        for k in range(8):
            z = -6.0 + k * 1.6
            ball(glow, (side * (3.1 - max(z, 0) * 0.28), 1.5 - max(z, 0) * 0.12, z), 0.18 + 0.05 * (k % 2), c("#7ff4ff"), 1.0, 6, 4)
    paint.face([(0, 3.2, -1.5), (0, 5.6, 2.2), (0, 2.6, 1.8)], skin)
    # The tail, around the point where it moves.
    lathe(tail_paint, (0, 0, 0), [(0.68, -0.2), (0.3, 2.4), (0, 2.8)], skin, 10, "z")
    for side in (-1, 1):
        tail_paint.face([(0, 0, 1.8), (side * 4.6, 0.1, 4.6), (side * 2.0, 0.0, 4.2), (0, 0, 3.0)], skin)
        ball(tail_glow, (side * 4.3, 0.15, 4.45), 0.22, c("#7ff4ff"), 1.0, 6, 4)


def moon(paint, glow):
    ball(glow, (0, 0, 0), 20.0, c("#fff4d0"), 1.0, 24, 14)
    for x, y, r in ((-7.0, 6.0, 3.6), (6.5, -3.0, 5.0), (-3.0, -9.0, 2.2), (9.0, 9.0, 1.8)):
        depth = math.sqrt(max(20.0 ** 2 - x * x - y * y, 0))
        disc(glow, (x, y, depth + 0.25), 0.0, r, c("#f2dca8"), 14, "xy")
    for radius, thickness, color in ((29.0, 0.5, "#ffd0e8"), (33.0, 1.1, "#bfe4ff"), (37.5, 0.35, "#ffd0e8")):
        points = [
            (radius * math.cos(TAU * i / 80), radius * 0.22 * math.sin(TAU * i / 80) + 0.2 * radius * math.cos(TAU * i / 80), radius * math.sin(TAU * i / 80))
            for i in range(81)
        ]
        glow.tube(points, thickness, c(color), 4)


# ---------------------------------------------------------------- everything together


def to_blender(shape):
    shape.verts = [(x, -z, y) for x, y, z in shape.verts]


def weld(scene):
    """Joins the corners that faces share, so each is stored once for every color it has."""
    for obj in scene.collection.objects:
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.remove_doubles(mesh, verts=mesh.verts, dist=0.0005)
        mesh.to_mesh(obj.data)
        mesh.free()


def main():
    # The same train at every run.
    random.seed(11)
    scene = make_scene(
        "Solaris_Express",
        ("express_", "car_", "berth_", "land_", "track_", "joint_", "tail_", "nose_", "ring_", "loco_", "bogie_", "wheel_", "gate_", "whale", "moon_", "rotor_"),
    )
    lit = make_material("express_paint")
    shine = make_material("express_glow")
    # Only for the pictures taken in Blender; the page draws these meshes unlit.
    shader = next(n for n in shine.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    source = next(n for n in shine.node_tree.nodes if n.type == "VERTEX_COLOR")
    shine.node_tree.links.new(source.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 1.0

    pieces = {}

    def piece(name):
        pieces[name] = (Shape(), Shape())
        return pieces[name]

    spins = {}
    for name, (furnish, height, axis, speed) in CARS.items():
        look = LOOKS[name]
        paint, glow = piece(f"car_{name}")
        car_floor(look, paint, glow)
        car_walls(look, paint, glow, broken=name == "havoc")
        spin = Shape()
        furnish(look, paint, glow, spin)
        spins[name] = (spin, {"at": [0, height, -2.4], "axis": axis, "speed": speed})
        berth(look, *piece(f"berth_{name}"))
        LANDS[name](look, *piece(f"land_{name}"))

    track(*piece("track"))
    joint(*piece("joint"))
    tail(*piece("tail"))
    nose(*piece("nose"))
    ring_paint, ring_glow = piece("ring")
    locomotive(*piece("loco"), ring_paint, ring_glow)
    bogie(*piece("bogie"))
    wheel(*piece("wheel"))
    gate(*piece("gate"))
    whale_tail = piece("whaletail")
    whale(*piece("whale"), *whale_tail)
    moon(*piece("moon"))

    for name, (paint, glow) in pieces.items():
        for shape, material, kind in ((paint, lit, "paint"), (glow, shine, "glow")):
            if shape.faces:
                to_blender(shape)
                add(scene, material, f"{name}_{kind}", shape)
    for name, (shape, _) in spins.items():
        to_blender(shape)
        add(scene, shine if name in ("electro", "spectro") else lit, f"rotor_{name}", shape)

    # With the default bits, points this far from zero move by centimeters, and flat things on
    # the ground then flicker through it.
    bits = meshopt.EXP_FILTER_BITS
    meshopt.EXP_FILTER_BITS = 17
    weld(scene)
    try:
        os.makedirs(FOLDER, exist_ok=True)
        # The page works out the flat normals itself, which halves the file.
        export(os.path.join(FOLDER, "express.glb"), normals=False)
    finally:
        meshopt.EXP_FILTER_BITS = bits

    layout = {
        "module": MODULE,
        "joint": JOINT,
        "tail": TAIL,
        "nose": NOSE,
        "berth": BERTH,
        "walk": WALK,
        "chunk": CHUNK,
        "wheel": {"radius": WHEEL["radius"], "y": round(WHEEL["y"], 3), "axles": WHEEL["axles"]},
        # Measured from the front end of the deck before the engine.
        "engine": {"ring": [0, 0.55, -12.0], "chimney": [0, 5.1, -17.4], "bogies": [-4.0, -9.5, -16.5]},
        "spins": {name: spot for name, (_, spot) in spins.items()},
        "whaletail": [0, 0, 9.0],
    }
    with open(os.path.join(FOLDER, "express.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(layout, handle, indent=2)
        handle.write("\n")

    arrange(scene, layout)
    print("[express] done")


def arrange(scene, layout):
    """After the export, lays out a short train in Blender, so the pictures taken there show it.
    The file keeps every part around its zero point."""
    objects = {obj.name: obj for obj in scene.collection.objects}

    def place(name, x=0.0, y=0.0, z=0.0, copy=False):
        for full, obj in list(objects.items()):
            if full not in (f"{name}_paint", f"{name}_glow", name):
                continue
            target = obj
            if copy:
                target = obj.copy()
                target.name = f"{full}_show"
                scene.collection.objects.link(target)
            target.location = (x, -z, y)

    z = 0.0
    place("tail")
    for index, name in enumerate(CARS):
        place(f"car_{name}", z=z)
        place(f"rotor_{name}", y=layout["spins"][name]["at"][1], z=z - 2.4)
        place(f"berth_{name}", x=-BERTH["x"], z=z - 1.2)
        for axle, bz in enumerate((z - 1.9, z - MODULE + 1.9)):
            place("bogie", z=bz, copy=True)
        # The country and the rails lie beside the train, far enough apart to be seen one by one.
        place(f"land_{name}", x=220.0 + index * 200.0)
        z -= MODULE
        place("joint", z=z, copy=True)
        z -= JOINT
    place("nose", z=z)
    z -= NOSE
    place("loco", z=z)
    ring = layout["engine"]["ring"]
    place("ring", y=ring[1], z=z + ring[2])
    place("track", z=0.0)
    for k in range(1, 3):
        place("track", z=-k * CHUNK, copy=True)
    place("gate", z=-130.0)
    place("whale", x=-45.0, y=14.0, z=-30.0)
    place("whaletail", x=-45.0, y=14.0, z=-21.0)
    place("moon", x=80.0, y=70.0, z=-220.0)
    # The pieces that stand for the copies are hidden, so they do not lie over the train.
    for name in ("joint", "bogie", "wheel"):
        for kind in ("paint", "glow"):
            obj = objects.get(f"{name}_{kind}")
            if obj:
                obj.hide_set(True)
                obj.hide_render = True
    bpy.context.view_layer.update()


main()
