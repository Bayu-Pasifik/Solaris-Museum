"""Builds the Spire, the walkable instrument of the Echo room. Writes src/assets/echo/spire.glb and
src/assets/echo/spire.json.

    blender --background --factory-startup --python scripts/build-spire.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Spire",
and leaves every other scene alone. The model is original low-poly work and holds no game assets.

A road winds inwards and upwards from a record on the ground floor to a stage at the top, where a
tuning fork as high as a tower stands. Around it float instruments that are far too large to play.

Positions in this script and in the JSON file are those of the page: x to the right, y up and z
toward the visitor. "at" turns them into Blender's coordinates. The page lays the keys of the road
and the stands of the echoes itself, from the numbers of the road in the JSON file.

The meshes are painted with vertex colors. "isle_*" meshes are lit, "glow_*" ones shine by
themselves, "spin_*" ones turn around (or swing about) the pivot that the JSON file gives them,
"pulse_*" ones stretch upwards to a beat, and "stand_*" ones are the stand that the page repeats
for every echo.
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
from mathutils import Matrix, Vector  # noqa: E402

from lowpoly import TAU, Shape, add, export, linear, make_material, make_scene  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDER = os.path.join(ROOT, "src", "assets", "echo")

# The road, in meters and radians. Its angle "t" starts at 0 in front of the middle and grows
# along the way up. Its middle line is "r0" from the middle of the map at the start and comes
# "pitch" closer with every turn. "lead" is where it begins, behind the start.
TURNS = 4
ROAD = {"r0": 60.0, "pitch": 11.0, "half": 3.5, "lead": -0.35, "end": TAU * TURNS, "climb": TAU * TURNS - 0.35, "rise": 36.0}
TOP = ROAD["rise"]
SUMMIT = {"radius": 9.8, "bridge": 2.4}
PLAZA_RADIUS = 8.6
# How far the middle of a stand is from the middle line of the road.
STAND = 5.4
ABYSS = -46.0


def c(color):
    return linear(color)


INK = c("#140f33")
LACQUER = c("#241b52")
LACQUER_LIGHT = c("#33276e")
PLUM = c("#4a2f7d")
IVORY = c("#f4efff")
IVORY_SHADE = c("#cfc6ee")
WHITE = c("#ffffff")
BRASS = (c("#ffcf5c"), c("#e8a53a"), c("#ffe39a"))
SILVER = (c("#d9e2ff"), c("#a9b6e8"), c("#f2f5ff"))
WOOD = (c("#7a3f5a"), c("#97506b"), c("#5e2f48"))
CYAN = c("#45e0ff")
VIOLET = c("#a374ff")
PINK = c("#ff6fb5")
GOLD = c("#ffd45a")
MINT = c("#5dffc4")
# The color of the road, from the start to the top: the climb is a crescendo.
CRESCENDO = ("#45e0ff", "#6f8cff", "#a374ff", "#ff6fb5", "#ffd45a")


def crescendo(share):
    share = min(max(share, 0.0), 1.0) * (len(CRESCENDO) - 1)
    index = min(int(share), len(CRESCENDO) - 2)
    a, b = linear(CRESCENDO[index]), linear(CRESCENDO[index + 1])
    mix = share - index
    return [x + (y - x) * mix for x, y in zip(a, b)]


# ---------------------------------------------------------------- the road


def at(x, y, z):
    """A point of the page in Blender's coordinates."""
    return (x, -z, y)


def radius_at(t):
    return ROAD["r0"] - ROAD["pitch"] * max(t, 0.0) / TAU


def height_at(t):
    return ROAD["rise"] * min(max(t / ROAD["climb"], 0.0), 1.0)


def road(t, across=0.0, up=0.0):
    """A point of the page beside the road: "across" goes away from the middle of the map."""
    phi = math.pi / 2 + t
    r = radius_at(t) + across
    return (r * math.cos(phi), height_at(t) + up, r * math.sin(phi))


def road_at(t, across=0.0, up=0.0):
    return at(*road(t, across, up))


def plaza_center():
    x, _, z = road(-0.3, 5.0)
    return x, z


# ---------------------------------------------------------------- shapes


def box(shape, center, size, color, top=None):
    """A box in Blender coordinates."""
    cx, cy, cz = center
    w, d, h = (value / 2 for value in size)
    low = [(cx - w, cy - d, cz - h), (cx + w, cy - d, cz - h), (cx + w, cy + d, cz - h), (cx - w, cy + d, cz - h)]
    high = [(x, y, cz + h) for x, y, _ in low]
    for i in range(4):
        j = (i + 1) % 4
        shape.face([low[i], low[j], high[j], high[i]], color)
    shape.face(high, top or color)
    shape.face(low[::-1], color)


def lathe(shape, profile, colors, sides=12, at_=(0.0, 0.0, 0.0), turn=0.0):
    """A round body: "profile" is a list of (radius, height) from the bottom up."""
    x, y, z = at_
    rings = [
        [(x + r * math.cos(turn + TAU * i / sides), y + r * math.sin(turn + TAU * i / sides), z + h) for i in range(sides)]
        for r, h in profile
    ]
    for row, (a, b) in enumerate(zip(rings, rings[1:])):
        color = colors[row % len(colors)]
        for i in range(sides):
            j = (i + 1) % sides
            shape.face([a[i], a[j], b[j], b[i]], color)


def orb(shape, center, radius, color, squash=1.0, sides=10, rows=6):
    profile = [
        (max(radius * math.sin(math.pi * k / rows), 0.002), -radius * squash * math.cos(math.pi * k / rows))
        for k in range(rows + 1)
    ]
    lathe(shape, profile, (color,), sides, center)


def circle(shape, center, radius, thickness, color, axis="z", steps=40, sides=5, start=0.0, span=TAU):
    """A round tube around "axis", in Blender coordinates."""
    x, y, z = center
    points = []
    for i in range(steps + 1):
        a = start + span * i / steps
        u, v = radius * math.cos(a), radius * math.sin(a)
        if axis == "z":
            points.append((x + u, y + v, z))
        elif axis == "y":
            points.append((x + u, y, z + v))
        else:
            points.append((x, y + u, z + v))
    shape.tube(points, thickness, color, sides)


def disc(shape, center, inner, outer, color, steps=64):
    x, y, z = center
    for i in range(steps):
        a, b = TAU * i / steps, TAU * (i + 1) / steps
        points = [(x + outer * math.cos(a), y + outer * math.sin(a), z), (x + outer * math.cos(b), y + outer * math.sin(b), z)]
        if inner > 0:
            points += [(x + inner * math.cos(b), y + inner * math.sin(b), z), (x + inner * math.cos(a), y + inner * math.sin(a), z)]
        else:
            points.append((x, y, z))
        shape.face(points, color)


def smooth(points, steps=8):
    """A Catmull-Rom curve through "points"."""
    out = []
    for i in range(len(points) - 1):
        p0, p1 = Vector(points[max(i - 1, 0)]), Vector(points[i])
        p2, p3 = Vector(points[i + 1]), Vector(points[min(i + 2, len(points) - 1)])
        for k in range(steps):
            t = k / steps
            v = 0.5 * (
                2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3
            )
            out.append(tuple(v))
    out.append(tuple(points[-1]))
    return out


def put(target, part, x, y, z, facing=None, scale=1.0, tilt=0.0, turn=0.0):
    """Adds "part", built around its own zero point with its front toward -Y, at a point of the
    page. "facing" is a point of the page that the front looks at."""
    if facing:
        bx, by = facing[0] - x, -(facing[1] - z)
        turn += math.atan2(bx, -by)
    matrix = (
        Matrix.Translation(at(x, y, z))
        @ Matrix.Rotation(turn, 4, "Z")
        @ Matrix.Rotation(tilt, 4, "Y")
        @ Matrix.Scale(scale, 4)
    )
    for face, color in zip(part.faces, part.colors):
        target.face([tuple(matrix @ Vector(part.verts[i])) for i in face], color)


# ---------------------------------------------------------------- instruments
# Each is built around its own zero point, front toward -Y, in Blender coordinates.


def eighth_note(color, double=False):
    shape = Shape()
    heads = (-1.6, 1.6) if double else (0.0,)
    for x in heads:
        orb(shape, (x - 0.55, 0.0, 0.0), 0.75, color, 0.72, 8, 4)
        shape.tube([(x, 0.0, 0.1), (x, 0.0, 3.6)], 0.13, color, 4)
    if double:
        for up in (3.55, 2.8):
            shape.tube([(-1.6, 0.0, up - 0.25), (1.6, 0.0, up + 0.15)], 0.22, color, 4)
    else:
        shape.tube(smooth([(0.0, 0.0, 3.6), (0.5, 0.0, 2.9), (1.15, 0.0, 2.35), (1.1, 0.0, 1.5)], 4), 0.14, color, 4)
    return shape


def treble_clef(color):
    """The sign at the start of a staff, as one tube."""
    points = [
        (0.15, 4.3), (-0.75, 3.55), (-1.55, 2.5), (-1.7, 1.4), (-1.1, 0.35), (0.05, 0.0), (1.15, 0.35),
        (1.5, 1.35), (1.0, 2.2), (0.0, 2.4), (-0.75, 1.85), (-0.7, 1.0), (0.0, 0.7), (0.55, 1.05),
    ]
    stem = [
        (0.55, 1.05), (0.1, 3.2), (-0.35, 5.4), (-0.4, 6.7), (0.15, 7.6), (0.75, 7.0), (0.7, 5.9), (0.15, 4.3),
    ]
    tail = [(0.1, 3.2), (0.6, 0.8), (0.9, -1.2), (0.35, -2.2), (-0.55, -2.05), (-0.8, -1.35)]
    shape = Shape()
    for line, width in ((points, 0.2), (stem, 0.17), (tail, 0.16)):
        shape.tube(smooth([(x, 0.0, z) for x, z in line], 5), width, color, 5)
    orb(shape, (-0.4, 0.0, -1.45), 0.45, color)
    return shape


def harp():
    paint, glow = Shape(), Shape()
    pillar = [(-3.2, 0.0), (-3.35, 4.0), (-3.2, 8.0), (-2.9, 10.4)]
    neck = [(-2.9, 10.4), (-1.5, 9.2), (0.3, 8.2), (1.9, 8.5), (3.4, 9.8), (4.0, 9.2)]
    sound = [(-3.2, 0.0), (-1.2, 1.4), (1.2, 4.2), (3.0, 7.0), (4.0, 9.2)]
    paint.tube(smooth([(x, 0.0, z) for x, z in pillar]), 0.42, BRASS[0], 8)
    paint.tube(smooth([(x, 0.0, z) for x, z in neck]), 0.34, BRASS[1], 8)
    paint.tube(smooth([(x, 0.0, z) for x, z in sound]), 0.5, BRASS[0], 8)
    orb(paint, (-2.9, 0.0, 10.7), 0.65, BRASS[2])
    box(paint, (-2.9, 0.0, -0.3), (2.2, 1.4, 0.6), BRASS[1])

    def along(line, x):
        for (ax, az), (bx, bz) in zip(line, line[1:]):
            if ax <= x <= bx:
                return az + (bz - az) * (x - ax) / (bx - ax)
        return line[-1][1]

    for i in range(13):
        x = -2.7 + i * 0.48
        glow.tube([(x, 0.0, along(sound, x) + 0.2), (x, 0.0, along(neck, x) - 0.15)], 0.035, (CYAN, WHITE, VIOLET)[i % 3], 3)
    return paint, glow


def bell(color, size=1.0):
    paint, glow = Shape(), Shape()
    profile = [(1.5, 0.0), (1.38, 0.16), (1.05, 0.55), (0.88, 1.35), (0.8, 2.05), (0.55, 2.5), (0.05, 2.65)]
    lathe(paint, [(r * size, h * size) for r, h in profile], color, 14)
    circle(glow, (0.0, 0.0, 0.1 * size), 1.45 * size, 0.07 * size, WHITE)
    circle(paint, (0.0, 0.0, 2.95 * size), 0.32 * size, 0.09 * size, color[0], "y", 16)
    orb(glow, (0.0, 0.0, -0.05 * size), 0.34 * size, GOLD)
    return paint, glow


def speaker(light):
    """A box with two cones, 4 wide and 6 high, standing on its zero point."""
    paint, glow = Shape(), Shape()
    box(paint, (0.0, 0.0, 3.0), (4.0, 2.6, 6.0), LACQUER, LACQUER_LIGHT)
    for up, radius in ((1.85, 1.5), (4.45, 0.95)):
        for ring, deep, color in ((radius, 0.0, INK), (radius * 0.72, 0.12, PLUM), (radius * 0.3, -0.06, INK)):
            points = [(ring * math.cos(TAU * i / 18), -1.31 - 0.02 + deep * 0.2, up + ring * math.sin(TAU * i / 18)) for i in range(18)]
            shift = {radius: 0.0, radius * 0.72: -0.015, radius * 0.3: -0.03}[ring]
            paint.face([(x, y + shift, z) for x, y, z in points], color)
        circle(glow, (0.0, -1.36, up), radius, 0.07, light, "y", 28, 4)
    for x in (-2.0, 2.0):
        glow.tube([(x, -1.32, 0.15), (x, -1.32, 5.85)], 0.06, light, 4)
    return paint, glow


def gramophone():
    """A horn as large as a house, on its box."""
    paint, glow = Shape(), Shape()
    box(paint, (0.0, 0.6, 0.9), (5.0, 5.0, 1.8), WOOD[0], WOOD[1])
    for x in (-2.52, 2.52):
        glow.tube([(x, -1.9, 0.25), (x, -1.9, 1.7)], 0.08, GOLD, 4)
    disc(paint, (0.0, 0.9, 1.82), 0.0, 2.0, INK, 32)
    for radius in (0.75, 1.2, 1.6):
        circle(glow, (0.0, 0.9, 1.84), radius, 0.025, VIOLET, "z", 32, 3)
    neck = smooth([(1.7, 1.7, 1.8), (1.9, 2.0, 3.6), (0.9, 1.8, 4.9), (0.0, 0.8, 5.4)], 8)
    paint.tube(neck, 0.38, BRASS[1], 8)
    # The flare opens toward the front and a little up.
    axis = Vector((0.0, -1.0, 0.38)).normalized()
    side = Vector((1.0, 0.0, 0.0))
    other = axis.cross(side).normalized()
    origin = Vector((0.0, 0.8, 5.4))
    sides = 16
    rings = []
    for k in range(9):
        s = k / 8
        radius = 0.4 + 3.6 * s ** 2.6
        middle = origin + axis * (4.6 * s)
        scallop = 1.0 + (0.08 if k == 8 else 0.0)
        rings.append(
            [
                tuple(middle + (side * math.cos(TAU * i / sides) + other * math.sin(TAU * i / sides)) * radius * (scallop if i % 2 else 1.0))
                for i in range(sides)
            ]
        )
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            paint.face([a[i], a[j], b[j], b[i]], BRASS[i % 3])
    glow.tube(rings[-1] + [rings[-1][0]], 0.1, WHITE, 5)
    # Rings of sound that leave the horn.
    for k in range(1, 4):
        middle = origin + axis * (4.6 + k * 1.7)
        radius = 3.4 - k * 0.5
        loop = [
            tuple(middle + (side * math.cos(TAU * i / 40) + other * math.sin(TAU * i / 40)) * radius) for i in range(41)
        ]
        glow.tube(loop, 0.09 - k * 0.015, (CYAN, VIOLET, PINK)[k - 1], 4)
    return paint, glow


def metronome():
    paint, glow = Shape(), Shape()
    low = [(-3.0, -1.8, 0.0), (3.0, -1.8, 0.0), (3.0, 1.8, 0.0), (-3.0, 1.8, 0.0)]
    high = [(-0.9, -0.6, 11.0), (0.9, -0.6, 11.0), (0.9, 0.6, 11.0), (-0.9, 0.6, 11.0)]
    for i in range(4):
        j = (i + 1) % 4
        paint.face([low[i], low[j], high[j], high[i]], WOOD[i % 3])
    paint.face(high, WOOD[1])
    paint.face(low[::-1], WOOD[2])
    paint.face([(-1.7, -1.86, 1.6), (1.7, -1.86, 1.6), (0.55, -0.75, 10.2), (-0.55, -0.75, 10.2)], INK)
    for k in range(9):
        up = 2.2 + k * 0.85
        y = -1.9 + (up - 1.6) * 0.13 - 0.02
        wide = 0.75 - k * 0.055
        glow.tube([(-wide, y, up), (wide, y, up)], 0.04, IVORY_SHADE, 3)
    lathe(paint, [(0.9, 11.0), (0.05, 12.4)], (BRASS[0],), 4, turn=math.pi / 4)
    # The arm swings around the zero point of its own shape.
    arm = Shape()
    arm.tube([(0.0, 0.0, -0.6), (0.0, 0.0, 9.6)], 0.14, SILVER[0], 6)
    lathe(arm, [(0.35, 5.6), (0.9, 6.0), (0.6, 7.1), (0.2, 7.25)], BRASS, 4, turn=math.pi / 4)
    orb(arm, (0.0, 0.0, 0.0), 0.45, BRASS[1])
    return paint, glow, arm


def record(label):
    """A record that floats; it faces up around its zero point."""
    shape = Shape()
    disc(shape, (0.0, 0.0, 0.0), 1.6, 6.0, INK, 48)
    disc(shape, (0.0, 0.0, 0.0), 0.35, 1.6, label, 32)
    disc(shape, (0.0, 0.0, 0.03), 0.7, 0.95, WHITE, 32)
    for k, radius in enumerate((2.2, 3.0, 3.7, 4.5, 5.3, 6.0)):
        circle(shape, (0.0, 0.0, 0.0), radius, 0.05, (VIOLET, CYAN, PINK)[k % 3], "z", 48, 3)
    # A shine, so the turning is seen.
    for a in (0.4, 0.4 + math.pi):
        shape.face(
            [(2.0 * math.cos(a), 2.0 * math.sin(a), 0.04), (5.7 * math.cos(a - 0.09), 5.7 * math.sin(a - 0.09), 0.04), (5.7 * math.cos(a + 0.09), 5.7 * math.sin(a + 0.09), 0.04)],
            PLUM,
        )
    return shape


def headphones(light):
    """Headphones that arch over the road: the cups stand 8.6 to both sides."""
    paint, glow = Shape(), Shape()
    band = [(8.6 * math.cos(math.pi * i / 24), 0.0, 1.9 + 5.6 * math.sin(math.pi * i / 24)) for i in range(25)]
    paint.tube(band, 0.34, LACQUER_LIGHT, 8)
    glow.tube([(x * 1.045, y, z + 0.34) for x, y, z in band], 0.07, light, 4)
    pad = [(x, y, z - 0.55) for x, y, z in band[7:18]]
    paint.tube(pad, 0.28, PLUM, 8)
    for side in (-1, 1):
        for out, radius, color in ((0.0, 1.55, PLUM), (0.45, 1.75, LACQUER), (1.05, 1.5, LACQUER_LIGHT)):
            lathe_x(paint, side * (8.35 + out), 1.6, radius, 0.55, color)
        circle(glow, (side * 9.98, 0.0, 1.6), 1.0, 0.1, light, "x", 28, 4)
        circle(glow, (side * 8.3, 0.0, 1.6), 1.35, 0.08, WHITE, "x", 28, 4)
    return paint, glow


def lathe_x(shape, x, up, radius, width, color, sides=16):
    """A drum on its side, along X."""
    a, b = [], []
    for i in range(sides):
        u, v = radius * math.cos(TAU * i / sides), radius * math.sin(TAU * i / sides)
        a.append((x - width / 2, u, up + v))
        b.append((x + width / 2, u, up + v))
    for i in range(sides):
        j = (i + 1) % sides
        shape.face([a[i], a[j], b[j], b[i]], color)
    shape.face(a, color)
    shape.face(b[::-1], color)


def bell_arch(light):
    paint, glow = Shape(), Shape()
    curve = [(8.5 * math.cos(math.pi * i / 20), 0.0, 3.2 + 4.4 * math.sin(math.pi * i / 20)) for i in range(21)]
    paint.tube([(8.5, 0.0, -0.6)] + curve + [(-8.5, 0.0, -0.6)], 0.24, BRASS[1], 7)
    glow.tube([(x, y, z + 0.32) for x, y, z in curve], 0.06, light, 4)
    for index in (4, 7, 10, 13, 16):
        x, _, z = curve[index]
        size = 0.5 if index == 10 else 0.4
        paint.tube([(x, 0.0, z), (x, 0.0, z - 0.45)], 0.05, INK, 4)
        body, shine = bell(BRASS, size)
        for source, target in ((body, paint), (shine, glow)):
            for face, color in zip(source.faces, source.colors):
                target.face([(source.verts[i][0] + x, source.verts[i][1], source.verts[i][2] + z - 0.45 - 3.0 * size) for i in face], color)
    for side in (-8.5, 8.5):
        orb(glow, (side, 0.0, 3.2), 0.5, light)
    return paint, glow


def wave_arch(light):
    """Three rings of a wave that stand around the road."""
    paint, glow = Shape(), Shape()
    for k, (wide, tall, swing) in enumerate(((8.4, 7.4, 0.35), (8.9, 7.9, 0.22), (9.3, 8.3, 0.12))):
        line = []
        for i in range(73):
            a = math.pi * i / 72
            ripple = 1.0 + swing / 8 * math.sin(a * (16 + k * 4))
            line.append((wide * ripple * math.cos(a), (k - 1) * 0.5, tall * ripple * math.sin(a)))
        glow.tube(line, 0.065 - k * 0.012, (light, WHITE, VIOLET)[k], 4)
    for side in (-1, 1):
        lathe(paint, [(0.8, -0.8), (0.55, 0.4), (0.25, 1.4)], (LACQUER_LIGHT, PLUM), 6, (side * 8.9, 0.0, 0.0))
        orb(glow, (side * 8.9, 0.0, 1.75), 0.35, light)
    return paint, glow


def pipes(count, low, high, width, colors, light):
    """A row of organ pipes that stands on its zero point."""
    paint, glow = Shape(), Shape()
    for i in range(count):
        s = i / max(count - 1, 1)
        x = (s - 0.5) * width
        tall = low + (high - low) * (1 - abs(s - 0.5) * 2) ** 0.7
        radius = width / count * 0.42
        lathe(paint, [(radius * 0.2, 0.0), (radius, 1.1), (radius, tall), (radius * 0.8, tall)], colors[i % len(colors) :] + colors[: i % len(colors)], 8, (x, 0.0, 0.0))
        glow.face([(x - radius * 0.65, -radius - 0.02, 1.5), (x + radius * 0.65, -radius - 0.02, 1.5), (x, -radius - 0.02, 2.4)], light)
        circle(glow, (x, 0.0, tall), radius * 0.92, 0.05, light, "z", 14, 3)
    return paint, glow


def tuning_fork():
    """The tower at the top: it stands on its zero point and is 24 high."""
    paint, glow = Shape(), Shape()
    lathe(paint, [(3.0, 0.0), (2.6, 0.7), (1.4, 1.1), (0.75, 2.0)], (LACQUER_LIGHT, PLUM, LACQUER), 12)
    circle(glow, (0.0, 0.0, 0.72), 2.65, 0.1, GOLD)
    paint.tube([(0.0, 0.0, 1.8), (0.0, 0.0, 8.4)], 0.75, SILVER[0], 10)
    bend = [(2.4 * math.cos(math.pi + math.pi * i / 20), 0.0, 10.8 + 2.6 * math.sin(math.pi + math.pi * i / 20)) for i in range(21)]
    paint.tube([(-2.4, 0.0, 24.0)] + bend + [(2.4, 0.0, 24.0)], 0.72, SILVER[0], 10)
    for side in (-2.4, 2.4):
        orb(paint, (side, 0.0, 24.0), 0.74, SILVER[2])
        for y in (-0.76, 0.76):
            glow.tube([(side, y, 11.4), (side, y, 23.4)], 0.09, CYAN, 4)
    orb(glow, (0.0, 0.0, 18.0), 0.85, WHITE)
    for k in range(3):
        circle(glow, (0.0, 0.0, 18.0), 1.25 + k * 0.28, 0.03, (CYAN, VIOLET, PINK)[k], "y", 36, 3)
    return paint, glow


# ---------------------------------------------------------------- the pieces of the map


def deck(paint, glow):
    """The road: a lacquered deck under the keys, waves along both edges, and chimes under it."""
    start, end = ROAD["lead"], ROAD["end"] + 0.14
    half = ROAD["half"] + 0.25
    steps = 420
    # The cross section: across and up.
    section = ((-half, -0.07), (half, -0.07), (half + 0.18, -0.35), (half - 0.7, -0.85), (-half + 0.7, -0.85), (-half - 0.18, -0.35))
    colors = (LACQUER, PLUM, LACQUER_LIGHT, INK, LACQUER_LIGHT, PLUM)
    rings = [[road_at(start + (end - start) * i / steps, a, u) for a, u in section] for i in range(steps + 1)]
    for a, b in zip(rings, rings[1:]):
        for k in range(6):
            j = (k + 1) % 6
            paint.face([a[k], a[j], b[j], b[k]], colors[k])
    paint.face(rings[0][::-1], PLUM)
    paint.face(rings[-1], PLUM)

    # A strip of light along both edges and one under the middle.
    fine = 600
    ts = [start + (end - start) * i / fine for i in range(fine + 1)]
    for side in (-1, 1):
        for i, (a, b) in enumerate(zip(ts, ts[1:])):
            color = crescendo(a / ROAD["end"])
            glow.face([road_at(a, side * half, -0.06), road_at(b, side * half, -0.06), road_at(b, side * (half + 0.2), -0.33), road_at(a, side * (half + 0.2), -0.33)], color)
    for a, b in zip(ts, ts[1:]):
        glow.face([road_at(a, -0.12, -0.87), road_at(a, 0.12, -0.87), road_at(b, 0.12, -0.87), road_at(b, -0.12, -0.87)], crescendo(a / ROAD["end"]))
    # The waves: a line that swings under each edge, loud and soft by turns.
    length = 0.0
    for side in (-1, 1):
        line, length = [], 0.0
        before = road(start)
        for i in range(1681):
            t = start + (end - start) * i / 1680
            here = road(t)
            length += math.dist(before, here)
            before = here
            loud = 0.12 + 0.5 * abs(math.sin(length * 0.085 + side)) * abs(math.sin(length * 0.031))
            line.append((road_at(t, side * (half + 0.55), -0.55 + loud * math.sin(length * 2.1)), t))
        for i in range(0, 1680, 48):
            piece = [point for point, _ in line[i : i + 49]]
            glow.tube(piece, 0.05, crescendo(line[i][1] / ROAD["end"]), 3)

    # Chimes of different lengths hang under the road.
    t = 0.05
    count = 0
    while t < end - 0.05:
        color = crescendo(t / ROAD["end"])
        for k, across in enumerate((-2.2, 0.0, 2.2)):
            long = 0.7 + 2.0 * abs(math.sin(count * 0.9 + k * 1.7))
            top = road(t, across, -0.85)
            paint.tube([at(*top), at(top[0], top[1] - long, top[2])], 0.14, SILVER[(count + k) % 3], 5)
            glow.gem(at(top[0], top[1] - long - 0.42, top[2]), 0.17, 0.42, color)
        t += 5.5 / radius_at(t)
        count += 1


def arches(paint, glow):
    """What spans the road on the way up."""
    kinds = (headphones, wave_arch, bell_arch)
    t, count = 0.62, 0
    while t < ROAD["end"] - 0.5:
        part, shine = kinds[count % 3](crescendo(t / ROAD["end"]))
        x, y, z = road(t)
        ahead = road(t + 0.02)
        facing = (x - (ahead[0] - x), z - (ahead[2] - z))
        for source, target in ((part, paint), (shine, glow)):
            put(target, source, x, y, z, facing)
        t += 52.0 / radius_at(t)
        count += 1


def plaza(paint, glow, circles):
    """The record on the ground floor, where the walk begins."""
    cx, cz = plaza_center()
    center = at(cx, -0.1, cz)
    radius = PLAZA_RADIUS + 0.9
    disc(paint, center, 0.0, radius, INK, 72)
    for k in range(14):
        circle(glow, at(cx, -0.1, cz), 3.2 + k * 0.4, 0.014, (PLUM, VIOLET)[k % 5 == 0], "z", 72, 3)
    disc(glow, at(cx, -0.085, cz), 0.0, 2.6, c("#ff6fb5"), 48)
    disc(glow, at(cx, -0.08, cz), 1.55, 1.95, WHITE, 48)
    disc(glow, at(cx, -0.075, cz), 0.0, 0.5, INK, 24)
    circle(glow, at(cx, -0.2, cz), radius, 0.16, CYAN, "z", 80, 5)
    lathe(paint, [(1.0, -7.0), (radius * 0.7, -2.6), (radius, -0.15)], (LACQUER, LACQUER_LIGHT), 24, at(cx, 0.0, cz))
    glow.gem(at(cx, -10.4, cz), 0.9, 2.6, CYAN)

    # The horn stands beside the start and plays toward the middle of the record.
    x, _, z = road(-0.3, 17.5)
    body, shine = gramophone()
    for source, target in ((body, paint), (shine, glow)):
        put(target, source, x, -1.9, z, (cx, cz), 1.15)
    ledge = at(x, -2.6, z)
    lathe(paint, [(0.6, -4.0), (4.8, -0.6), (5.2, 0.7)], (LACQUER, PLUM), 16, ledge)
    disc(paint, (ledge[0], ledge[1], ledge[2] + 0.7), 0.0, 5.2, LACQUER_LIGHT, 16)
    # Speakers around the rim, away from the road and from the way out.
    for angle, light in ((0.9, PINK), (-1.6, VIOLET)):
        phi = math.pi / 2 - 0.3 + angle
        x, z = cx + 10.8 * math.cos(phi), cz + 10.8 * math.sin(phi)
        body, shine = speaker(light)
        for source, target in ((body, paint), (shine, glow)):
            put(target, source, x, -1.2, z, (cx, cz), 0.85)


def summit(paint, glow, spin_parts, circles):
    """The stage at the top, and the tuning fork on it."""
    radius = SUMMIT["radius"] + 0.7
    disc(paint, at(0.0, TOP - 0.09, 0.0), 0.0, radius, INK, 72)
    for k in range(12):
        circle(glow, at(0.0, TOP - 0.085, 0.0), 4.0 + k * 0.5, 0.016, GOLD if k % 4 == 0 else PLUM, "z", 72, 3)
    circle(glow, at(0.0, TOP - 0.2, 0.0), radius, 0.18, GOLD, "z", 80, 5)
    # Rays of a sun toward the rim.
    for i in range(24):
        a = TAU * i / 24
        far = 8.2 if i % 2 else 9.8
        points = [
            at(3.4 * math.cos(a - 0.05), TOP - 0.07, 3.4 * math.sin(a - 0.05)),
            at(far * math.cos(a), TOP - 0.07, far * math.sin(a)),
            at(3.4 * math.cos(a + 0.05), TOP - 0.07, 3.4 * math.sin(a + 0.05)),
        ]
        glow.face(points, BRASS[i % 3])
    # The bridge from the end of the road.
    inner, outer = SUMMIT["radius"] - 0.6, radius_at(ROAD["end"]) - ROAD["half"] + 0.1
    half = SUMMIT["bridge"] + 0.25
    box(paint, (0.0, -(inner + outer) / 2, TOP - 0.45), (half * 2, outer - inner, 0.72), LACQUER, LACQUER_LIGHT)
    for side in (-half, half):
        glow.tube([at(side, TOP - 0.05, inner), at(side, TOP - 0.05, outer)], 0.1, GOLD, 4)
    body, shine = tuning_fork()
    for source, target in ((body, paint), (shine, glow)):
        put(target, source, 0.0, TOP - 0.1, 0.0)
    circles.append([0.0, 0.0, 3.5])
    # Four speakers look out over the edge.
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2 + math.pi / 2
        x, z = 12.0 * math.cos(a), 12.0 * math.sin(a)
        if k in (0, 3):
            continue
        body, shine = speaker(GOLD)
        for source, target in ((body, paint), (shine, glow)):
            put(target, source, x, TOP - 2.0, z, (x * 2, z * 2), 0.7)

    # Rings that turn around the prongs.
    for name, radius, up, tilt, speed, color in (
        ("spin_halo_a", 6.4, 15.0, 0.34, 0.35, CYAN),
        ("spin_halo_b", 8.2, 19.0, -0.26, -0.22, PINK),
        ("spin_halo_c", 4.8, 27.5, 0.18, 0.55, GOLD),
    ):
        ring = Shape()
        points = [(radius * math.cos(TAU * i / 72), radius * math.sin(TAU * i / 72), radius * math.sin(tilt) * math.sin(TAU * i / 72)) for i in range(73)]
        ring.tube(points, 0.14, color, 5)
        for k in range(8):
            spot = points[k * 9]
            note = eighth_note(color, k % 3 == 0)
            for face, shade in zip(note.faces, note.colors):
                ring.face([tuple(spot[j] + note.verts[i][j] * 0.34 for j in range(3)) for i in face], WHITE if k % 2 else shade)
        spin_parts[name] = (ring, True, {"at": [0.0, TOP + up, 0.0], "axis": "y", "speed": speed})


def core(paint, glow):
    """The trunk under the stage: drums on top of each other, and pipes around them."""
    floor = ABYSS
    height = TOP - 0.8 - floor
    count = 13
    for k in range(count):
        low = floor + height * k / count
        high = floor + height * (k + 1) / count
        wide = 5.0 + (k % 2) * 1.1
        lathe(paint, [(wide * 0.7, low), (wide, low + 0.9), (wide, high - 0.9), (wide * 0.7, high)], (LACQUER, LACQUER_LIGHT if k % 2 else PLUM, LACQUER), 16, turn=k * 0.13)
        color = crescendo(k / (count - 1))
        circle(glow, (0.0, 0.0, low + 0.95), wide + 0.05, 0.12, color, "z", 48, 4)
        for i in range(8):
            a = TAU * i / 8 + k * 0.4
            tall = (high - low) * 0.5
            glow.tube([((wide + 0.04) * math.cos(a), (wide + 0.04) * math.sin(a), low + tall * 0.6), ((wide + 0.04) * math.cos(a), (wide + 0.04) * math.sin(a), low + tall * (1.1 + 0.4 * (i % 2)))], 0.09, color, 3)
    lathe(paint, [(4.0, TOP - 4.0), (SUMMIT["radius"] + 0.6, TOP - 0.2)], (LACQUER, PLUM), 24)
    for i in range(12):
        a = TAU * i / 12
        x, z = 8.8 * math.cos(a), 8.8 * math.sin(a)
        body, shine = pipes(5, 7.0 + (i % 4) * 4.0, 13.0 + (i % 5) * 5.0, 3.6, SILVER if i % 2 else BRASS, crescendo(i / 11))
        for source, target in ((body, paint), (shine, glow)):
            put(target, source, x, floor + 2.0 + (i % 3) * 5.0, z, (x * 2, z * 2))


def sky(paint, glow, spin_parts):
    """What floats around the road."""
    # Organs on both sides far away, like cliffs.
    for angle, up, light in ((0.25, -18.0, CYAN), (2.5, -10.0, VIOLET), (4.1, -22.0, PINK)):
        x, z = 98.0 * math.cos(angle), 98.0 * math.sin(angle)
        body, shine = pipes(17, 12.0, 38.0, 30.0, SILVER if angle > 1 else BRASS, light)
        for source, target in ((body, paint), (shine, glow)):
            put(target, source, x, up, z, (0.0, 0.0))
        beam = Shape()
        box(beam, (0.0, 0.6, -0.6), (32.0, 3.0, 2.0), LACQUER, LACQUER_LIGHT)
        put(paint, beam, x, up, z, (0.0, 0.0))
    for angle, far, up, size in ((1.15, 84.0, 6.0, 1.5), (3.25, 82.0, 20.0, 1.25), (5.15, 88.0, 30.0, 1.7), (0.5, 100.0, 36.0, 1.0)):
        x, z = far * math.cos(angle), far * math.sin(angle)
        body, shine = harp()
        for source, target in ((body, paint), (shine, glow)):
            put(target, source, x, up, z, (0.0, 0.0), size, tilt=0.12 * math.sin(angle * 3))
    for i, (angle, far, up, size) in enumerate(((0.9, 76.0, 24.0, 2.0), (2.05, 90.0, 38.0, 1.6), (3.8, 74.0, -4.0, 1.7), (4.7, 78.0, 14.0, 2.4), (5.8, 80.0, -12.0, 1.5), (2.9, 70.0, -26.0, 1.3))):
        x, z = far * math.cos(angle), far * math.sin(angle)
        body, shine = bell(BRASS if i % 2 else SILVER, size)
        for source, target in ((body, paint), (shine, glow)):
            put(target, source, x, up, z, tilt=0.2 * math.sin(i * 2.2))
        for k in range(2):
            circle(glow, at(x, up + size * 0.4, z), size * (2.2 + k * 0.9), 0.05, (CYAN, VIOLET)[k], "z", 40, 3)
    # The sign at the start of a staff, taller than the road is wide.
    for angle, far, up, size, color in ((1.95, 71.0, 2.0, 2.0, PINK), (4.35, 92.0, 4.0, 2.8, CYAN), (0.05, 74.0, 16.0, 1.5, GOLD), (3.05, 96.0, 34.0, 1.8, VIOLET)):
        x, z = far * math.cos(angle), far * math.sin(angle)
        put(glow, treble_clef(color), x, up, z, (0.0, 0.0), size)
    # A staff of five lines that winds around everything, with notes on it.
    def staff(a, line):
        far = 66.0 + 5.0 * math.sin(a * 3) + line * 0.12 * math.sin(a * 7)
        up = 9.0 + 15.0 * math.sin(a * 2 + 0.6) + line * 0.75
        # It passes high above the record, where the walk begins.
        near = max(1.0 - abs(math.atan2(math.sin(a - math.pi / 2), math.cos(a - math.pi / 2))) / 0.9, 0.0)
        up += near * 16.0
        far += near * 12.0
        return far * math.cos(a), up, far * math.sin(a)

    for line in range(5):
        points = [at(*staff(TAU * i / 160, line)) for i in range(161)]
        for i in range(0, 160, 20):
            glow.tube(points[i : i + 21], 0.07, crescendo(i / 80 if i < 80 else 2 - i / 80), 3)
    for i in range(38):
        a = TAU * i / 38 + 0.04
        x, up, z = staff(a, 0.5 + (i * 7) % 4)
        put(glow, eighth_note((CYAN, WHITE, PINK, GOLD, VIOLET)[i % 5], i % 4 == 0), x, up, z, (0.0, 0.0), 0.62)
    # Records that turn, and notes that drift.
    for k, (angle, far, up, size, label, tip) in enumerate(((0.65, 79.0, -6.0, 1.3, PINK, 0.5), (2.35, 76.0, 17.0, 1.0, CYAN, -0.6), (3.55, 88.0, 40.0, 1.5, GOLD, 0.35), (5.45, 72.0, 5.0, 0.9, MINT, -0.4), (1.5, 94.0, 44.0, 1.2, VIOLET, 0.7))):
        x, z = far * math.cos(angle), far * math.sin(angle)
        part = record(label)
        scaled = Shape()
        for face, color in zip(part.faces, part.colors):
            scaled.face([tuple(Matrix.Rotation(tip, 4, "X") @ (Vector(part.verts[i]) * size)) for i in face], color)
        spin_parts[f"spin_record_{k}"] = (scaled, True, {"at": [x, up, z], "axis": "y", "speed": 0.25 if k % 2 else -0.3})
    for i in range(70):
        a = TAU * i / 70 + random.uniform(-0.03, 0.03)
        far = random.uniform(76, 125)
        up = random.uniform(-30, 55)
        put(glow if i % 3 else paint, eighth_note((CYAN, PINK, GOLD, VIOLET, IVORY)[i % 5], i % 5 == 0), far * math.cos(a), up, far * math.sin(a), (0.0, 0.0), random.uniform(0.35, 1.0), tilt=random.uniform(-0.4, 0.4))
    # Two metronomes keep the time.
    for k, (angle, far, up, size) in enumerate(((1.0, 72.0, -22.0, 1.5), (4.0, 70.0, 12.0, 1.2))):
        x, z = far * math.cos(angle), far * math.sin(angle)
        body, shine, arm = metronome()
        for source, target in ((body, paint), (shine, glow)):
            put(target, source, x, up, z, (0.0, 0.0), size)
        # In front of its face, toward the middle of the map.
        px, pz = x - math.cos(angle) * 2.3 * size, z - math.sin(angle) * 2.3 * size
        turned, scaled = Shape(), math.atan2(-math.cos(angle), math.sin(angle))
        for face, color in zip(arm.faces, arm.colors):
            turned.face([tuple(Matrix.Rotation(scaled, 4, "Z") @ (Vector(arm.verts[i]) * size)) for i in face], color)
        # The page swings it about the line that points at the middle.
        spin_parts[f"spin_arm_{k}"] = (turned, True, {"at": [px, up + 1.8 * size, pz], "axis": [-round(math.cos(angle), 4), 0, -round(math.sin(angle), 4)], "swing": 0.55, "speed": 1.7 + k * 0.4})


def abyss(paint, glow, pulses):
    """The sea of sound far below: rings around the trunk, and bars that rise to a beat."""
    for k in range(9):
        radius = 14.0 + k * 13.5
        circle(glow, (0.0, 0.0, ABYSS - 1.0 - k * 0.4), radius, 0.22 - k * 0.012, crescendo(1 - k / 8), "z", 140, 3)
    for ring, (radius, count) in enumerate(((22.0, 48), (40.0, 72), (79.0, 128), (112.0, 150))):
        for i in range(count):
            a = TAU * i / count
            beat = (i // 3 + ring) % 6
            swell = abs(math.sin(a * 5 + ring)) * abs(math.sin(a * 2.5))
            tall = 2.0 + swell * (7.0 + ring * 2.5) + random.uniform(0, 1.5)
            x, y = radius * math.cos(a), radius * math.sin(a)
            wide = radius * TAU / count * 0.32
            color = crescendo((i / count + ring * 0.23) % 1)
            lathe(pulses[beat], [(wide, 0.0), (wide * 0.8, tall)], (color,), 4, (x, y, 0.0), a)
            disc(pulses[beat], (x, y, tall), 0.0, wide * 0.8, WHITE, 4)


def stand(paint, glow):
    """The stand of one echo: a floating drum with a skin of light, 1.7 in radius, top at 0."""
    lathe(paint, [(0.35, -2.3), (1.15, -1.25), (1.62, -0.5), (1.72, -0.12), (1.6, 0.0)], (LACQUER, PLUM, LACQUER_LIGHT, SILVER[1]), 16)
    disc(paint, (0.0, 0.0, 0.0), 0.0, 1.6, LACQUER, 32)
    circle(glow, (0.0, 0.0, -0.5), 1.65, 0.05, WHITE, "z", 32, 3)
    for radius, width in ((1.42, 0.09), (0.98, 0.04), (0.5, 0.03)):
        disc(glow, (0.0, 0.0, 0.012), radius - width, radius, WHITE, 32)
    for i in range(8):
        a = TAU * i / 8
        glow.tube([(1.76 * math.cos(a), 1.76 * math.sin(a), -0.2), (1.5 * math.cos(a), 1.5 * math.sin(a), -0.95)], 0.035, WHITE, 3)
    glow.gem((0.0, 0.0, -3.1), 0.28, 0.7, WHITE)


# ---------------------------------------------------------------- everything together


def weld(scene):
    """Joins the corners that faces share, so each is stored once for every color it has."""
    for obj in scene.collection.objects:
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.remove_doubles(mesh, verts=mesh.verts, dist=0.0005)
        mesh.to_mesh(obj.data)
        mesh.free()


def main():
    # The same map at every run.
    random.seed(7)
    scene = make_scene("Solaris_Spire", ("isle_", "glow_", "spin_", "pulse_", "stand_", "spire_"))
    lit = make_material("spire_paint")
    shine = make_material("spire_glow")
    # Only for the pictures taken in Blender; the page draws these meshes unlit.
    shader = next(n for n in shine.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    source = next(n for n in shine.node_tree.nodes if n.type == "VERTEX_COLOR")
    shine.node_tree.links.new(source.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 1.0

    circles, spin_parts = [], {}
    pieces = {}

    def piece(name):
        pieces[name] = (Shape(), Shape())
        return pieces[name]

    deck(*piece("road"))
    arches(*piece("arches"))
    plaza(*piece("plaza"), circles)
    summit(*piece("summit"), spin_parts, circles)
    core(*piece("core"))
    sky(*piece("sky"), spin_parts)
    pulses = [Shape() for _ in range(6)]
    abyss(*piece("abyss"), pulses)
    stand_paint, stand_glow = Shape(), Shape()
    stand(stand_paint, stand_glow)

    for name, (paint, glow) in pieces.items():
        if paint.faces:
            add(scene, lit, f"isle_{name}", paint)
        add(scene, shine, f"glow_{name}", glow)
    for name, (shape, bright, _) in spin_parts.items():
        add(scene, shine if bright else lit, name, shape)
    for index, shape in enumerate(pulses):
        add(scene, shine, f"pulse_{index}", shape)
    add(scene, lit, "stand_paint", stand_paint)
    add(scene, shine, "stand_glow", stand_glow)

    # With the default bits, points this far from zero move by centimeters, and flat things on
    # the ground then flicker through it.
    bits = meshopt.EXP_FILTER_BITS
    meshopt.EXP_FILTER_BITS = 17
    weld(scene)
    try:
        # The page works out the flat normals itself, which halves the file.
        export(os.path.join(FOLDER, "spire.glb"), normals=False)
    finally:
        meshopt.EXP_FILTER_BITS = bits

    cx, cz = plaza_center()
    sx, _, sz = road(-0.22)
    ax, _, az = road(-0.16)
    # The way out stands behind a new visitor.
    heading = math.atan2(ax - sx, az - sz)
    ex, ez = sx - math.sin(heading) * 9.0, sz - math.cos(heading) * 9.0
    layout = {
        "road": {**{key: round(value, 6) for key, value in ROAD.items()}, "stand": STAND},
        "plaza": {"x": round(cx, 3), "z": round(cz, 3), "radius": PLAZA_RADIUS},
        "start": {"x": round(sx, 3), "z": round(sz, 3), "heading": round(heading, 4)},
        "exit": {"x": round(ex, 3), "z": round(ez, 3), "turn": round(math.atan2(sx - ex, sz - ez), 4)},
        "summit": SUMMIT,
        "circles": circles,
        "abyss": ABYSS,
        "spins": {
            name: {**spot, "at": [round(v, 3) for v in spot["at"]]} for name, (_, _, spot) in spin_parts.items()
        },
    }
    with open(os.path.join(FOLDER, "spire.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(layout, handle, indent=2)
        handle.write("\n")

    # After the export, so the file keeps the moving parts around the zero point.
    for name, (_, _, spot) in spin_parts.items():
        scene.collection.objects[name].location = at(*spot["at"])
    for index in range(len(pulses)):
        scene.collection.objects[f"pulse_{index}"].location.z = ABYSS
    for name in ("stand_paint", "stand_glow"):
        scene.collection.objects[name].location = at(*road(0.5, STAND))
    bpy.context.view_layer.update()
    print("[spire] done")


main()
