"""Builds the Wilds, the walkable map of the Bestiary room. Writes src/assets/bestiary/wilds.glb
and src/assets/bestiary/wilds.json.

    blender --background --factory-startup --python scripts/build-wilds.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Wilds",
and leaves every other scene alone. The map is original low-poly work and holds no game assets.

A camp floats in the middle, and around it one island for every element. A bridge leads from
the camp to every island, and short bridges join each island to the next one. Visitors walk on
the plane at height 0, so everything that rises from it stands outside the walkable ground, or
inside one of the circles that the JSON file lists as in the way.

Positions in this script and in the JSON file are those of the page: x to the right and z toward
the visitor. "at" turns them into Blender's coordinates.

The meshes are painted with vertex colors. "isle_*" meshes are lit, "glow_*" ones shine by
themselves, and "spin_*" ones turn around the pivot that the JSON file gives them.
"""

import json
import math
import os
import random
import sys

# Blender does not put the folder of the script on the import path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from io_scene_gltf2.io.exp import meshopt  # noqa: E402

from lowpoly import TAU, Shape, add, export, linear, make_material, make_scene  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDER = os.path.join(ROOT, "src", "assets", "bestiary")

# The islands in the order around the camp. The first one is straight ahead of a new visitor.
ELEMENTS = ("Aero", "Glacio", "Electro", "Havoc", "Fusion", "Spectro", "Physical")

# Meters. "walk" is how far from its middle a piece of ground can be walked on.
CAMP = {"radius": 17.0, "walk": 15.5}
ISLE = {"radius": 30.0, "walk": 27.0}
DISTANCE = 74.0
BRIDGE = 2.4  # half of the width that can be walked on
# Where the camp fire burns.
FIRE = (-4.6, 1.4)
# What stands in the middle of an island stays inside this.
CORE = 6.6


def c(color):
    return linear(color)


# Ground (two shades), rim stone, underside, path.
GROUND = {
    "Aero": ("#4fbf8b", "#68d29a", "#b9e6cf", "#1f5f5c", "#e8f6d8"),
    "Glacio": ("#dcefff", "#c3e2fb", "#9cc7ee", "#2c4f8c", "#8fd0f5"),
    "Electro": ("#4a3a78", "#574592", "#8b72c8", "#221648", "#b08cf0"),
    "Havoc": ("#33203a", "#432a49", "#6b3d68", "#170b1c", "#8a2f5e"),
    "Fusion": ("#4b302f", "#5d3a34", "#8d5443", "#2a1312", "#a8603f"),
    "Spectro": ("#f2e2ac", "#f8ecc4", "#fff7df", "#8a6420", "#ffffff"),
    "Physical": ("#c99a6b", "#d9ad7c", "#e8c79c", "#6a4330", "#f0dcb8"),
}

BONE = c("#f3ead6")
WHITE = c("#ffffff")
WOOD = c("#8a5a3c")
WOOD_LIGHT = c("#b57d52")
INK = c("#1d1a3a")


def at(x, z, up=0.0):
    """A point of the page in Blender's coordinates."""
    return (x, -z, up)


def around(cx, cz, radius, angle, up=0.0):
    return at(cx + radius * math.cos(angle), cz + radius * math.sin(angle), up)


def center(index):
    angle = -math.pi / 2 + TAU * index / len(ELEMENTS)
    return DISTANCE * math.cos(angle), DISTANCE * math.sin(angle)


def apart(a, b):
    """The angle between two directions."""
    return abs(math.atan2(math.sin(a - b), math.cos(a - b)))


def clear(angle, bridges, width):
    """Whether a direction keeps away from every bridge mouth."""
    return all(apart(angle, bridge) > width for bridge in bridges)


# ---------------------------------------------------------------- shared shapes


def prism(shape, cx, cz, low, high, bottom, top, color, sides=6, turn=0.0, cap=None, lean=(0.0, 0.0)):
    """A column from "low" to "high" with its own radius at both ends."""
    def circle(radius, up, dx=0.0, dz=0.0):
        return [around(cx + dx, cz + dz, radius, turn + TAU * i / sides, up) for i in range(sides)]

    a, b = circle(bottom, low), circle(max(top, 0.003), high, *lean)
    for i in range(sides):
        j = (i + 1) % sides
        shape.face([a[i], a[j], b[j], b[i]], color[i % len(color)] if isinstance(color, tuple) else color)
    shape.face(b, cap or (color[0] if isinstance(color, tuple) else color))


def crystal(shape, cx, cz, low, radius, height, colors, lean=(0.0, 0.0), sides=6, turn=0.0):
    """A pointed crystal that stands on "low"."""
    waist = low + height * 0.72
    prism(shape, cx, cz, low, waist, radius * 0.7, radius, colors, sides, turn, lean=(lean[0] * 0.72, lean[1] * 0.72))
    ring = [around(cx + lean[0] * 0.72, cz + lean[1] * 0.72, radius, turn + TAU * i / sides, waist) for i in range(sides)]
    tip = at(cx + lean[0], cz + lean[1], low + height)
    for i in range(sides):
        shape.face([ring[i], ring[(i + 1) % sides], tip], colors[(i + 1) % len(colors)])


def rock(shape, cx, cz, up, radius, height, colors, sides=7):
    """A lumpy boulder."""
    rings = []
    for level, size in ((0.0, 0.75), (0.45, 1.0), (0.85, 0.6)):
        rings.append(
            [
                around(cx, cz, radius * size * random.uniform(0.75, 1.2), TAU * i / sides, up + height * level)
                for i in range(sides)
            ]
        )
    for row, (a, b) in enumerate(zip(rings, rings[1:])):
        for i in range(sides):
            j = (i + 1) % sides
            shape.face([a[i], a[j], b[j], b[i]], colors[(i + row) % len(colors)])
    top = at(cx, cz, up + height)
    for i in range(sides):
        shape.face([rings[-1][i], rings[-1][(i + 1) % sides], top], colors[i % len(colors)])


def hoop(shape, cx, cz, up, radius, thickness, color, tilt=0.0, turn=0.0, span=TAU, steps=48, sides=5):
    """A ring that floats. "tilt" 0 lies flat, a quarter turn stands up facing along "turn"."""
    points = []
    for i in range(steps + 1):
        a = span * i / steps
        across, deep = radius * math.cos(a), radius * math.sin(a)
        rise = deep * math.sin(tilt)
        deep *= math.cos(tilt)
        x = cx + across * math.cos(turn) - deep * math.sin(turn)
        z = cz + across * math.sin(turn) + deep * math.cos(turn)
        points.append(at(x, z, up + rise))
    shape.tube(points, thickness, color, sides)


def strip(shape, points, width, up, color):
    """A flat band on the ground through points of the page."""
    sides = []
    for index, (x, z) in enumerate(points):
        bx, bz = points[max(index - 1, 0)]
        ax, az = points[min(index + 1, len(points) - 1)]
        length = math.hypot(ax - bx, az - bz) or 1.0
        nx, nz = -(az - bz) / length, (ax - bx) / length
        w = width(index / (len(points) - 1)) if callable(width) else width
        sides.append((at(x + nx * w / 2, z + nz * w / 2, up), at(x - nx * w / 2, z - nz * w / 2, up)))
    for (a, b), (d, e) in zip(sides, sides[1:]):
        shape.face([a, b, e, d], color)


def disc(shape, cx, cz, up, inner, outer, color, steps=48, start=0.0, span=TAU):
    for i in range(steps):
        a, b = start + span * i / steps, start + span * (i + 1) / steps
        points = [around(cx, cz, outer, a, up), around(cx, cz, outer, b, up)]
        if inner > 0:
            points += [around(cx, cz, inner, b, up), around(cx, cz, inner, a, up)]
        else:
            points.append(at(cx, cz, up))
        shape.face(points, color)


def crack(shape, cx, cz, angle, start, end, width, up, color, wander=0.12):
    """A jagged line from the middle of an island outwards, thin at its end."""
    points = []
    radius = start
    while radius < end:
        a = angle + random.uniform(-wander, wander)
        points.append((cx + radius * math.cos(a), cz + radius * math.sin(a)))
        radius += random.uniform(1.6, 3.0)
    points.append((cx + end * math.cos(angle), cz + end * math.sin(angle)))
    strip(shape, points, lambda t: width * (1 - 0.75 * t), up, color)


def ground(shape, cx, cz, radius, colors, depth, steps=64):
    """The top of a floating island as a patchwork, its rim, and the rock that hangs under it."""
    shades = [c(colors[0]), c(colors[1])]
    stone, under = c(colors[2]), c(colors[3])
    fractions = (0.0, 0.16, 0.33, 0.5, 0.66, 0.81, 0.92, 1.0)
    rings = []
    for row, fraction in enumerate(fractions):
        ring = []
        for i in range(steps):
            a = TAU * i / steps + (row % 2) * TAU / steps / 2
            jitter = random.uniform(-0.55, 0.55) if 0 < row < len(fractions) - 1 else 0.0
            r = radius * fraction + jitter
            if row == len(fractions) - 1:
                r = radius + random.uniform(-0.9, 0.9)
            ring.append(around(cx, cz, r, a, 0.0))
        rings.append(ring)
    for row in range(1, len(rings)):
        low, high = rings[row - 1], rings[row]
        for i in range(steps):
            j = (i + 1) % steps
            # Odd rows sit half a step further around, so the triangles mesh.
            if row % 2:
                a, b = (low[i], low[j], high[i]), (high[i], low[j], high[j])
            else:
                a, b = (low[i], high[j], high[i]), (low[i], low[j], high[j])
            # The innermost ring is one point, so one triangle of each pair there is empty.
            for face in (b,) if row == 1 else (a, b):
                shape.face(face, shades[random.random() < 0.38])
    rim = rings[-1]
    lip = [(p[0], p[1], -0.9) for p in rim]
    deep = []
    for i in range(steps):
        a = TAU * i / steps
        deep.append(around(cx, cz, radius * random.uniform(0.55, 0.72), a, -random.uniform(depth * 0.25, depth * 0.5)))
    tip = at(cx + random.uniform(-3, 3), cz + random.uniform(-3, 3), -depth)
    for i in range(steps):
        j = (i + 1) % steps
        shape.face([rim[i], rim[j], lip[j], lip[i]], stone)
        shape.face([lip[i], lip[j], deep[j], deep[i]], under if i % 3 else stone)
        shape.face([deep[i], deep[j], tip], under)
    # Stone teeth that hang from the rock.
    for _ in range(16):
        a, r = random.uniform(0, TAU), random.uniform(0.2, 0.7) * radius
        size = random.uniform(1.0, 2.8)
        top = -depth * 0.28 - random.uniform(0, 2)
        prism(shape, cx + r * math.cos(a), cz + r * math.sin(a), top, top - size * random.uniform(2.5, 4.5), size, 0.05, under, 5)


def tufts(shape, cx, cz, count, inner, outer, color, height=0.28):
    """Low things on the ground that a walker passes through, such as grass or flowers."""
    for _ in range(count):
        a, r = random.uniform(0, TAU), random.uniform(inner, outer)
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        for k in range(3):
            turn = TAU * k / 3 + random.random()
            lean = (0.16 * math.cos(turn), 0.16 * math.sin(turn))
            prism(shape, x + lean[0] * 0.4, z + lean[1] * 0.4, 0.0, height * random.uniform(0.6, 1.2), 0.06, 0.003, color, 3, lean=lean)


# ---------------------------------------------------------------- the islands


def aero(paint, glow, spin, cx, cz, mouths, front):
    """A great windmill tree, a stream that falls off the edge, and rings of wind."""
    trunk = (c("#7a5238"), c("#915f40"))
    leaves = (c("#2fae7d"), c("#49c98f"), c("#7fe0a8"), c("#c9f5b8"))
    prism(paint, cx, cz, 0.0, 3.0, 3.6, 2.0, trunk, 9)
    prism(paint, cx, cz, 3.0, 10.5, 2.0, 1.1, trunk, 9, 0.2)
    for i in range(7):
        a = TAU * i / 7 + 0.4
        points = [around(cx, cz, 2.2, a, 1.6), around(cx, cz, 4.4, a + 0.15, 0.45), around(cx, cz, 6.2, a + 0.3, 0.05)]
        paint.tube(points, 0.34, trunk[0], 5)
    # No branch grows toward the camp, where the windmill turns.
    for i in range(5):
        a = front + TAU * (i + 1) / 6
        end =(cx + 5.2 * math.cos(a), cz + 5.2 * math.sin(a))
        up = 9.0 + (i % 3) * 1.2
        paint.tube([at(cx, cz, 8.0), at(*end, up)], 0.42, trunk[1], 5)
        rock(paint, *end, up - 1.0, 2.9, 2.8, leaves[:3], 9)
    rock(paint, cx, cz, 10.2, 4.4, 4.2, leaves[1:], 10)
    # The windmill on the side that faces the camp. It is built around its own middle.
    for i in range(4):
        a = TAU * i / 4
        out = (math.cos(a), math.sin(a))
        across = (-out[1], out[0])

        def p(r, s):
            return (out[0] * r + across[0] * s, 0.0, out[1] * r + across[1] * s)

        spin.face([p(0.6, 0.05), p(4.2, 0.15), p(4.2, 1.5), p(1.1, 0.85)], c("#fff3d6") if i % 2 else c("#ffcf6e"))
        spin.tube([p(0.0, 0.0), p(4.4, 0.1)], 0.13, WOOD_LIGHT, 4)
    spin.gem((0.0, 0.0, -0.55), 0.6, 1.1, c("#35dcab"))
    # The axle that holds it to the trunk.
    paint.tube([around(cx, cz, 1.4, front, 5.1), around(cx, cz, 5.3, front, 5.1)], 0.28, WOOD_LIGHT, 6)
    # The stream runs from the roots to the edge, and falls.
    way = front + math.pi + 0.55
    stream = [
        (cx + r * math.cos(way + 0.12 * math.sin(r * 0.35)), cz + r * math.sin(way + 0.12 * math.sin(r * 0.35)))
        for r in (5.0, 8.0, 11.0, 14.0, 17.0, 20.0, 23.0, 26.0, 29.0, 30.4)
    ]
    strip(glow, stream, 1.5, 0.025, c("#7fe6f2"))
    end = stream[-1]
    for drop, width in ((0, 1.5), (1, 0.5)):
        x, z = end[0] + drop * 0.7 * -math.sin(way), end[1] + drop * 0.7 * math.cos(way)
        half = (-math.sin(way) * width / 2, math.cos(way) * width / 2)
        length = 16 - drop * 6
        glow.face(
            [
                at(x + half[0], z + half[1], 0.02),
                at(x - half[0], z - half[1], 0.02),
                at(x - half[0] * 0.3 + math.cos(way) * 1.2, z - half[1] * 0.3 + math.sin(way) * 1.2, -length),
                at(x + half[0] * 0.3 + math.cos(way) * 1.2, z + half[1] * 0.3 + math.sin(way) * 1.2, -length),
            ],
            c("#a9f0f6") if drop else c("#6fd9ee"),
        )
    for radius, up, tilt in ((8.5, 13.5, 0.25), (11.0, 8.5, -0.18)):
        hoop(glow, cx, cz, up, radius, 0.09, c("#d6fff0"), tilt, radius, TAU * 0.72)
    for i in range(46):
        a = TAU * i / 46
        if not clear(a, mouths, 0.17) or apart(a, way) < 0.12:
            continue
        r = ISLE["walk"] + random.uniform(0.8, 2.2)
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        if i % 3 == 0:
            tall = random.uniform(2.6, 5.2)
            prism(paint, x, z, 0.0, tall, 0.32, 0.16, trunk, 5)
            rock(paint, x, z, tall - 0.5, random.uniform(1.0, 1.7), random.uniform(1.4, 2.2), leaves, 7)
        else:
            rock(paint, x, z, 0.0, random.uniform(0.5, 1.2), random.uniform(0.4, 1.1), leaves[:2], 6)
    tufts(paint, cx, cz, 170, CORE, ISLE["walk"], c("#2f9e6e"))
    tufts(glow, cx, cz, 40, CORE, ISLE["walk"], c("#f4ffb0"), 0.2)
    return {"spin_aero": {"at": [cx + 5.4 * math.cos(front), 5.1, cz + 5.4 * math.sin(front)], "turn": math.pi / 2 - front, "axis": "z", "speed": 0.45}}


def glacio(paint, glow, spin, cx, cz, mouths, front):
    """A crown of ice over a frozen lake, snow pines, and an aurora."""
    ice = (c("#8fd4ff"), c("#bfe9ff"), c("#63b4f2"), c("#e4f7ff"))
    disc(glow, cx, cz, 0.012, 6.4, 8.8, c("#a6dcf7"), 40)
    disc(glow, cx, cz, 0.016, 7.3, 7.42, WHITE, 40)
    for i in range(9):
        crack(glow, cx, cz, TAU * i / 9 + 0.2, 8.8, random.uniform(14, 23), 0.22, 0.02, c("#8fd0f5"))
    crystal(paint, cx, cz, 0.0, 2.3, 14.0, ice)
    for count, radius, size, height, tip in ((6, 2.9, 1.15, 8.0, 1.8), (9, 5.0, 0.75, 4.6, 1.4)):
        for i in range(count):
            a = TAU * i / count + radius
            crystal(
                paint,
                cx + radius * math.cos(a),
                cz + radius * math.sin(a),
                0.0,
                size,
                height * random.uniform(0.7, 1.15),
                ice,
                (tip * math.cos(a), tip * math.sin(a)),
                turn=a,
            )
    for i in range(7):
        a = TAU * i / 7
        crystal(glow, cx + 6.0 * math.cos(a), cz + 6.0 * math.sin(a), 0.0, 0.28, 1.5, (c("#d9fbff"), c("#7fe4ff")))
    for i in range(6):
        a = TAU * i / 6
        crystal(spin, 7.5 * math.cos(a), 7.5 * math.sin(a), math.sin(a * 2) * 1.2, 0.42, 1.9, (c("#e4f7ff"), c("#8fd4ff")))
    # Ribbons of light high above.
    for k, color in enumerate((c("#8dffd8"), c("#8fd4ff"), c("#c7a8ff"))):
        points = []
        for i in range(41):
            t = i / 40
            a = front + math.pi - 1.5 + 3.0 * t
            r = 24 + k * 3.5 + 2.2 * math.sin(t * 11 + k)
            points.append(around(cx, cz, r, a, 17 + k * 2.4 + 2.0 * math.sin(t * 7 + k * 2)))
        for i, (a, b) in enumerate(zip(points, points[1:])):
            # Gaps make it look like a curtain of light.
            if i % 4 != 3:
                glow.face([a, b, (b[0], b[1], b[2] + 2.0 - k * 0.4), (a[0], a[1], a[2] + 2.0 - k * 0.4)], color)
        glow.tube(points, 0.09, color, 4)
    snow = (c("#ffffff"), c("#dcefff"))
    pine = (c("#3d6f9c"), c("#4f87b5"))
    for i in range(48):
        a = TAU * i / 48
        if not clear(a, mouths, 0.17):
            continue
        r = ISLE["walk"] + random.uniform(0.8, 2.2)
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        if i % 2:
            tall = random.uniform(2.4, 5.0)
            prism(paint, x, z, 0.0, tall * 0.3, 0.2, 0.2, WOOD, 5)
            for k in range(3):
                base = tall * (0.2 + 0.24 * k)
                size = 1.25 - 0.3 * k
                prism(paint, x, z, base, base + tall * 0.36, size, 0.02, pine, 7, k, cap=snow[0])
                prism(paint, x, z, base + tall * 0.2, base + tall * 0.37, size * 0.5, 0.02, snow, 7, k)
        else:
            rock(paint, x, z, 0.0, random.uniform(0.7, 1.6), random.uniform(0.4, 1.0), snow, 8)
    tufts(glow, cx, cz, 70, 9.0, ISLE["walk"], c("#eafcff"), 0.16)
    return {"spin_glacio": {"at": [cx, 7.5, cz], "turn": 0.0, "axis": "y", "speed": 0.18}}


def electro(paint, glow, spin, cx, cz, mouths, front):
    """A storm spire, pylons that throw lightning at each other, and circuits in the ground."""
    metal = (c("#3c2d6e"), c("#57429a"), c("#2d2052"))
    bolt = c("#d9b8ff")
    core = c("#a54fff")

    def lightning(a, b, jitter, thickness, color, parts=8):
        points = [a]
        for i in range(1, parts):
            t = i / parts
            points.append(tuple(a[k] + (b[k] - a[k]) * t + random.uniform(-jitter, jitter) for k in range(3)))
        points.append(b)
        glow.tube(points, thickness, color, 4)

    for level, radius in enumerate((5.8, 4.4, 3.1)):
        prism(paint, cx, cz, level * 0.8, (level + 1) * 0.8, radius, radius - 0.3, metal, 8, level * 0.3)
        disc(glow, cx, cz, (level + 1) * 0.8 + 0.02, radius - 0.75, radius - 0.55, core, 8, level * 0.3)
    prism(paint, cx, cz, 2.4, 12.0, 1.5, 0.45, metal, 4, math.pi / 4)
    crystal(glow, cx, cz, 12.6, 1.0, 3.2, (core, bolt))
    for i in range(4):
        a = TAU * i / 4
        x, z = cx + 4.6 * math.cos(a), cz + 4.6 * math.sin(a)
        prism(paint, x, z, 0.0, 5.0, 0.55, 0.25, metal, 4, a)
        crystal(glow, x, z, 5.1, 0.35, 1.0, (bolt, core))
        lightning(at(x, z, 5.9), at(cx, cz, 13.4), 0.7, 0.07, bolt)
    for radius, up in ((2.6, 8.0), (3.6, 5.2)):
        hoop(spin, 0.0, 0.0, up - 8.0, radius, 0.14, core, 0.22, radius)
    for i in range(10):
        a = TAU * i / 10
        crystal(spin, 6.4 * math.cos(a), 6.4 * math.sin(a), math.sin(a * 3) * 1.5, 0.25, 1.0, (bolt, core))
    tips = []
    for i in range(14):
        a = TAU * i / 14 + 0.1
        if not clear(a, mouths, 0.2):
            tips.append(None)
            continue
        r = ISLE["walk"] + 1.6
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        tall = 6.0 + (i % 3) * 1.6
        prism(paint, x, z, 0.0, 1.0, 1.3, 1.0, metal, 6)
        prism(paint, x, z, 1.0, tall, 0.55, 0.2, metal, 4, a)
        for k in range(3):
            hoop(paint, x, z, 1.8 + k * (tall - 2.6) / 3, 0.85 - k * 0.14, 0.09, metal[1], steps=10, sides=4)
        crystal(glow, x, z, tall, 0.42, 1.3, (bolt, core))
        tips.append(at(x, z, tall + 0.8))
    for a, b in zip(tips, tips[1:] + tips[:1]):
        if a and b:
            lightning(a, b, 0.55, 0.05, core, 12)
    # Circuits that run from the spire to the rim.
    for i in range(16):
        a = TAU * i / 16 + 0.05
        points, r = [], CORE - 0.4
        while r < ISLE["walk"] - 1:
            points.append((cx + r * math.cos(a), cz + r * math.sin(a)))
            r += random.uniform(2.5, 5.0)
            points.append((cx + r * math.cos(a), cz + r * math.sin(a)))
            a += random.choice((-0.16, 0.16))
        strip(glow, points, 0.13, 0.015, c("#8c5ae0"))
        x, z = points[-1]
        disc(glow, x, z, 0.02, 0.18, 0.34, bolt, 8)
    for i in range(36):
        a = TAU * i / 36 + 0.04
        if clear(a, mouths, 0.17):
            r = ISLE["walk"] + random.uniform(1.0, 2.4)
            crystal(paint, cx + r * math.cos(a), cz + r * math.sin(a), 0.0, random.uniform(0.35, 0.8), random.uniform(1.2, 3.2), (c("#7d4fd0"), c("#a77cf0"), c("#5a35a8")), (math.cos(a) * 0.7, math.sin(a) * 0.7))
    return {"spin_electro": {"at": [cx, 8.0, cz], "turn": 0.0, "axis": "y", "speed": 0.6}}


def havoc(paint, glow, spin, cx, cz, mouths, front):
    """A torn gate to nowhere, thorns that curl over the edge, and a floor that splits."""
    black = (c("#1b0d22"), c("#2c1633"), c("#432247"))
    red = c("#e0407c")
    dark = c("#7a1850")
    side = front + math.pi / 2
    disc(glow, cx, cz, 0.012, 5.6, 6.0, red, 36)
    disc(glow, cx, cz, 0.016, 6.9, 7.05, dark, 36)
    for i in range(13):
        crack(glow, cx, cz, TAU * i / 13 + 0.1, 6.0, random.uniform(13, 25.5), 0.45, 0.02, red if i % 2 else dark, 0.16)
    for level, radius in enumerate((5.2, 4.0)):
        prism(paint, cx, cz, level * 0.6, (level + 1) * 0.6, radius, radius - 0.4, black, 7, level)
    # The gate faces the camp: its blocks stand on a circle, with gaps where it broke.
    middle, radius = 6.4, 5.0
    for i in range(26):
        if i in (4, 5, 17):
            continue
        a = TAU * i / 26
        across, rise = radius * math.cos(a), radius * math.sin(a)
        x, z = cx + across * math.cos(side), cz + across * math.sin(side)
        size = random.uniform(0.55, 0.9)
        rock(paint, x, z, middle + rise - size * 0.6, size, size * 1.3, black, 6)
    # The swirl inside it.
    for arm in range(4):
        points = []
        for i in range(26):
            t = i / 25
            a = TAU * arm / 4 + t * 5.0
            across, rise = 4.2 * (1 - t) * math.cos(a), 4.2 * (1 - t) * math.sin(a)
            points.append(at(cx + across * math.cos(side), cz + across * math.sin(side), middle + rise))
        for low, high in zip(range(25), range(1, 26)):
            glow.tube([points[low], points[high]], 0.26 * (1 - low / 27), red if arm % 2 else dark, 4)
    spin.gem((0.0, 0.0, -0.8), 0.55, 1.6, red)
    for i in range(18):
        a = TAU * i / 18
        r = random.uniform(6.6, 9.0)
        rock(spin, r * math.cos(a), r * math.sin(a), random.uniform(-3.5, 3.5), random.uniform(0.2, 0.65), random.uniform(0.3, 0.9), black, 5)
    for i in range(34):
        a = TAU * i / 34 + 0.07
        if not clear(a, mouths, 0.18):
            continue
        r = ISLE["walk"] + random.uniform(1.2, 2.6)
        tall = random.uniform(2.5, 7.5)
        points = []
        for k in range(9):
            t = k / 8
            # A thorn bends inward and curls at its tip.
            bend = r - 2.2 * t * t
            twist = a + 0.14 * math.sin(t * 3.2) * (1 if i % 2 else -1)
            points.append(around(cx, cz, bend, twist, tall * math.sin(t * 2.1)))
        for k in range(8):
            paint.tube(points[k : k + 2], 0.55 * (1 - k / 8.6), black[k % 2], 5)
        glow.gem((points[-1][0], points[-1][1], points[-1][2] - 0.2), 0.14, 0.55, red)
    tufts(paint, cx, cz, 90, CORE + 1, ISLE["walk"], black[2], 0.32)
    tufts(glow, cx, cz, 30, CORE + 1, ISLE["walk"], red, 0.2)
    return {"spin_havoc": {"at": [cx, 6.4, cz], "turn": 0.0, "axis": "y", "speed": -0.25}}


def fusion(paint, glow, spin, cx, cz, mouths, front):
    """A volcano that bleeds lava to the edges, and walls of basalt."""
    stone = (c("#3a2122"), c("#52302b"), c("#2a171b"), c("#66392d"))
    lava = (c("#ff7a2a"), c("#ffb23a"), c("#ff4d1f"))
    steps = 22
    profile = ((6.5, 0.0), (5.0, 2.4), (3.6, 5.2), (2.7, 7.8), (2.25, 9.4))
    rings = [
        [around(cx, cz, r * random.uniform(0.9, 1.08), TAU * i / steps, up) for i in range(steps)]
        for r, up in profile
    ]
    for row, (a, b) in enumerate(zip(rings, rings[1:])):
        for i in range(steps):
            j = (i + 1) % steps
            glowing = i % 6 == 1 and row >= 1 or i % 11 == 4
            shape = glow if glowing else paint
            color = lava[(row + i) % 3] if glowing else stone[(i + row) % 4]
            shape.face([a[i], a[j], b[j], b[i]], color)
    top = rings[-1]
    for i in range(steps):
        glow.face([top[i], top[(i + 1) % steps], at(cx, cz, 8.6)], lava[i % 3])
    for i in range(14):
        a = random.uniform(0, TAU)
        r = random.uniform(0.2, 2.2)
        glow.gem(around(cx, cz, r, a, random.uniform(9.6, 14.5)), random.uniform(0.12, 0.42), random.uniform(0.3, 1.0), lava[i % 3])
    for i in range(12):
        a = random.uniform(0, TAU)
        r = random.uniform(1.0, 5.5)
        rock(spin, r * math.cos(a), r * math.sin(a), random.uniform(-1.5, 2.5), random.uniform(0.25, 0.6), random.uniform(0.3, 0.7), stone, 5)
    disc(glow, cx, cz, 0.014, 6.3, 7.6, lava[2], 30)
    disc(glow, cx, cz, 0.018, 6.5, 7.0, lava[1], 30)
    # Rivers that reach the rim and fall.
    rivers = [
        way if clear(way, mouths, 0.2) else way + 0.35
        for way in (front + 1.9, front - 2.2, front + math.pi + 0.15)
    ]
    for way in rivers:
        points = []
        for r in (7.0, 10.0, 13.0, 16.0, 19.0, 22.0, 25.0, 28.0, 30.4):
            a = way + 0.1 * math.sin(r * 0.5)
            points.append((cx + r * math.cos(a), cz + r * math.sin(a)))
        strip(glow, points, 1.35, 0.025, lava[0])
        strip(glow, points, 0.5, 0.032, lava[1])
        x, z = points[-1]
        half = (-math.sin(way) * 0.68, math.cos(way) * 0.68)
        out = (math.cos(way) * 1.4, math.sin(way) * 1.4)
        glow.face(
            [
                at(x + half[0], z + half[1], 0.02),
                at(x - half[0], z - half[1], 0.02),
                at(x + out[0] - half[0] * 0.2, z + out[1] - half[1] * 0.2, -13),
                at(x + out[0] + half[0] * 0.2, z + out[1] + half[1] * 0.2, -13),
            ],
            lava[0],
        )
    for i in range(11):
        crack(glow, cx, cz, TAU * i / 11, 7.6, random.uniform(12, 21), 0.18, 0.018, lava[2])
    for i in range(40):
        a = TAU * i / 40
        if not clear(a, mouths, 0.18) or not clear(a, rivers, 0.12):
            continue
        for k in range(random.randint(2, 4)):
            r = ISLE["walk"] + 0.9 + random.uniform(0, 1.8)
            b = a + random.uniform(-0.06, 0.06)
            tall = random.uniform(0.8, 4.4)
            prism(paint, cx + r * math.cos(b), cz + r * math.sin(b), 0.0, tall, 0.62, 0.62, stone[:2], 6, k, cap=stone[3])
        if i % 4 == 0:
            disc(glow, cx + (ISLE["walk"] - 0.6) * math.cos(a), cz + (ISLE["walk"] - 0.6) * math.sin(a), 0.02, 0.0, 0.7, lava[0], 8)
    tufts(glow, cx, cz, 45, 8.0, ISLE["walk"], lava[1], 0.18)
    return {"spin_fusion": {"at": [cx, 12.0, cz], "turn": 0.0, "axis": "y", "speed": 0.35}}


def spectro(paint, glow, spin, cx, cz, mouths, front):
    """A temple of light: a floating prism between columns, halos, and golden trees."""
    marble = (c("#fffaf0"), c("#f1e6cd"), c("#ffffff"))
    gold = (c("#ffd02e"), c("#ffe784"), c("#f2a900"))
    for level, radius in enumerate((6.5, 5.3, 4.1)):
        prism(paint, cx, cz, level * 0.45, (level + 1) * 0.45, radius, radius, marble, 12, cap=marble[level % 2])
        disc(glow, cx, cz, (level + 1) * 0.45 + 0.015, radius - 0.42, radius - 0.28, gold[0], 12)
    for i in range(8):
        a = TAU * i / 8 + TAU / 16
        x, z = cx + 4.7 * math.cos(a), cz + 4.7 * math.sin(a)
        broken = i % 3 == 2
        tall = 4.4 if broken else 7.2
        prism(paint, x, z, 0.9, 1.3, 0.7, 0.55, marble, 8)
        prism(paint, x, z, 1.3, tall, 0.4, 0.34, marble, 8)
        if broken:
            crystal(glow, x, z, tall + 0.7, 0.3, 0.9, gold)
        else:
            prism(paint, x, z, tall, tall + 0.4, 0.4, 0.68, gold, 8)
            glow.gem(at(x, z, tall + 0.5), 0.24, 0.8, gold[1])
    # The prism turns above the middle.
    crystal(spin, 0.0, 0.0, 0.0, 1.5, 3.6, gold, turn=0.4)
    for i in range(6):
        ring = [(1.5 * math.cos(TAU * k / 6 + 0.4), 1.5 * math.sin(TAU * k / 6 + 0.4)) for k in (i, i + 1)]
        spin.face([at(*ring[1], 2.59), at(*ring[0], 2.59), at(0.0, 0.0, -2.1)], gold[(i + 2) % 3])
    for radius, tilt, turn in ((3.0, 1.25, 0.0), (3.7, 0.5, 2.0)):
        hoop(spin, 0.0, 0.0, 1.0, radius, 0.09, gold[1], tilt, turn)
    hoop(glow, cx, cz, 13.0, 9.0, 0.16, gold[1])
    for i in range(24):
        a = TAU * i / 24
        glow.tube([around(cx, cz, 9.3, a, 13.0), around(cx, cz, 10.2 + (i % 2), a, 13.0)], 0.07, gold[0], 4)
    for radius, width, color in ((8.4, 0.35, gold[0]), (13.0, 0.1, gold[2]), (25.8, 0.18, gold[0])):
        disc(glow, cx, cz, 0.012, radius, radius + width, color, 72)
    for i in range(12):
        a = TAU * i / 12
        glow.face([around(cx, cz, 8.9, a - 0.05, 0.016), around(cx, cz, 12.8 if i % 2 else 11.2, a, 0.016), around(cx, cz, 8.9, a + 0.05, 0.016)], gold[0])
    for i in range(36):
        a = TAU * i / 36 + 0.05
        if not clear(a, mouths, 0.18):
            continue
        r = ISLE["walk"] + random.uniform(1.0, 2.2)
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        if i % 2:
            tall = random.uniform(2.4, 4.4)
            prism(paint, x, z, 0.0, tall, 0.28, 0.12, marble, 5)
            for k in range(5):
                b = TAU * k / 5
                end = (x + 1.1 * math.cos(b), z + 1.1 * math.sin(b))
                paint.tube([at(x, z, tall * 0.75), at(*end, tall + 0.2)], 0.07, marble[1], 4)
                glow.gem(at(*end, tall), 0.36, 0.9, gold[k % 3])
            glow.gem(at(x, z, tall - 0.1), 0.45, 1.2, gold[1])
        else:
            crystal(paint, x, z, 0.0, random.uniform(0.4, 0.8), random.uniform(1.4, 3.0), (c("#fff1b8"), c("#ffe06a"), WHITE))
    tufts(paint, cx, cz, 110, 8.0, ISLE["walk"] - 1.5, WHITE, 0.22)
    tufts(glow, cx, cz, 45, 8.0, ISLE["walk"] - 1.5, gold[0], 0.2)
    return {"spin_spectro": {"at": [cx, 7.0, cz], "turn": 0.0, "axis": "y", "speed": 0.5}}


def physical(paint, glow, spin, cx, cz, mouths, front):
    """The bones of a giant in a canyon: a skull on a mound, ribs, and walls of layered stone."""
    sand = (c("#b77f52"), c("#d5a06c"), c("#9c6443"), c("#e6bd88"))
    bone = (BONE, c("#e2d4b6"), c("#fbf6ea"))
    prism(paint, cx, cz, 0.0, 0.9, 6.4, 4.8, sand, 11)
    ahead = (math.cos(front), math.sin(front))
    side = (-ahead[1], ahead[0])

    def p(a, s, up):
        """"a" toward the camp, "s" to the side."""
        return at(cx + ahead[0] * a + side[0] * s, cz + ahead[1] * a + side[1] * s, up)

    # The skull looks toward the camp.
    sections = ((-1.8, 1.9, 1.3, 4.9), (0.2, 2.7, 1.0, 5.6), (2.0, 2.1, 1.3, 4.9), (3.6, 1.0, 1.4, 3.4), (4.9, 0.7, 1.3, 2.5))
    rings = []
    for a, half, low, high in sections:
        rings.append(
            [
                p(a, -half * 0.7, low),
                p(a, half * 0.7, low),
                p(a, half, low + (high - low) * 0.45),
                p(a, half * 0.55, high),
                p(a, -half * 0.55, high),
                p(a, -half, low + (high - low) * 0.45),
            ]
        )
    for a, b in zip(rings, rings[1:]):
        for i in range(6):
            paint.face([a[i], a[(i + 1) % 6], b[(i + 1) % 6], b[i]], bone[i % 3])
    paint.face(rings[0], bone[1])
    paint.face(rings[-1], bone[1])
    for s in (-1, 1):
        # Eyes that still shine, horns, and teeth.
        glow.face([p(2.75, s * 1.0, 3.5), p(2.75, s * 1.75, 3.2), p(2.9, s * 1.45, 2.7), p(2.95, s * 0.95, 2.9)], c("#ff5fa8"))
        horn = [p(-0.6, s * 2.1, 4.6), p(-1.6, s * 3.7, 6.2), p(-0.9, s * 4.8, 8.2), p(0.8, s * 4.9, 9.6), p(2.2, s * 4.2, 10.0)]
        for k in range(4):
            paint.tube(horn[k : k + 2], 0.62 - k * 0.14, bone[k % 3], 6)
        for k in range(5):
            a = 1.9 + k * 0.7
            half = 2.0 - k * 0.32
            tip = p(a, s * half * 0.75, 0.55)
            paint.face([p(a - 0.28, s * half * 0.72, 1.35), p(a + 0.28, s * half * 0.68, 1.35), tip], bone[2])
        jaw = [p(-0.8, s * 2.2, 2.0), p(1.2, s * 2.0, 0.75), p(4.4, s * 0.55, 0.65)]
        paint.tube(jaw[:2], 0.34, bone[1], 6)
        paint.tube(jaw[1:], 0.28, bone[1], 6)
    # The spine trails behind, with ribs that arch over it.
    spine = [p(-2.0 - k * 0.55, 0.0, 3.4 - k * 0.42) for k in range(8)]
    for k, spot in enumerate(spine):
        paint.gem((spot[0], spot[1], spot[2] - 0.5), 0.62 - k * 0.05, 1.2 - k * 0.07, bone[k % 3])
    for k in range(4):
        for s in (-1, 1):
            base = -2.4 - k * 1.05
            rib = [
                p(base, s * (0.4 + 4.2 * math.sin(t * 1.9)) * (1 - k * 0.08), (3.2 - k * 0.45) + 4.2 * math.sin(t * math.pi) - t * (3.0 - k * 0.45))
                for t in (0, 0.2, 0.4, 0.6, 0.8, 1.0)
            ]
            for j in range(5):
                paint.tube(rib[j : j + 2], 0.3 - j * 0.045, bone[j % 3], 5)
    for i in range(9):
        a = TAU * i / 9
        rock(spin, 8.5 * math.cos(a), 8.5 * math.sin(a), random.uniform(-1, 1.5), random.uniform(0.2, 0.45), random.uniform(0.3, 0.7), sand, 5)
    # Mesas in layers around the edge.
    for i in range(30):
        a = TAU * i / 30
        if not clear(a, mouths, 0.24):
            continue
        r = ISLE["walk"] + random.uniform(1.8, 2.6)
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        up, size = 0.0, random.uniform(1.4, 2.4)
        for k in range(random.randint(2, 5)):
            tall = random.uniform(0.6, 1.5)
            prism(paint, x, z, up, up + tall, size, size * 0.9, sand[k % 4], 7, random.random(), cap=sand[3])
            up += tall
            size *= random.uniform(0.72, 0.92)
    for i in range(10):
        a = TAU * i / 10 + 0.33
        if clear(a, mouths, 0.2):
            r = ISLE["walk"] - 0.2
            base = a + math.pi / 2
            hoop(paint, cx + r * math.cos(a), cz + r * math.sin(a), 0.0, 0.9, 0.12, bone[0], math.pi / 2, base, math.pi, 12)
    tufts(paint, cx, cz, 110, CORE + 0.5, ISLE["walk"], c("#a8743f"), 0.26)
    for i in range(40):
        a, r = random.uniform(0, TAU), random.uniform(CORE + 1, ISLE["walk"] - 1)
        rock(paint, cx + r * math.cos(a), cz + r * math.sin(a), 0.0, random.uniform(0.12, 0.3), random.uniform(0.08, 0.2), sand, 5)
    return {"spin_physical": {"at": [cx, 3.5, cz], "turn": 0.0, "axis": "y", "speed": 0.12}}


BIOMES = {
    "Aero": aero,
    "Glacio": glacio,
    "Electro": electro,
    "Havoc": havoc,
    "Fusion": fusion,
    "Spectro": spectro,
    "Physical": physical,
}

# The color of a bridge and of the arch before it: strong, then pale.
BANNER = {
    "Aero": ("#35dcab", "#c9fbe9"),
    "Glacio": ("#46bdff", "#d8f3ff"),
    "Electro": ("#b061ff", "#ecd6ff"),
    "Havoc": ("#e0407c", "#f4b6cd"),
    "Fusion": ("#ff7438", "#ffe2b0"),
    "Spectro": ("#ffd02e", "#fff6cc"),
    "Physical": ("#ff5fa8", "#f6e3c6"),
}


# ---------------------------------------------------------------- the camp and the bridges


def camp(paint, glow, circles):
    ground(paint, 0.0, 0.0, CAMP["radius"], ("#b9aede", "#c9c0ea", "#efeaff", "#3b3268"), 20.0, 48)
    # A compass in the floor: every ray points at an island.
    for radius, width, color in ((3.1, 0.16, "#ffffff"), (8.4, 0.28, "#ffffff"), (14.2, 0.12, "#6d62b0")):
        disc(glow, 0.0, 0.0, 0.012, radius, radius + width, c(color), 72)
    for index, element in enumerate(ELEMENTS):
        x, z = center(index)
        a = math.atan2(z, x)
        glow.face([around(0, 0, 3.4, a - 0.2, 0.02), around(0, 0, 9.8, a, 0.02), around(0, 0, 3.4, a + 0.2, 0.02)], c(BANNER[element][0]))
        glow.face([around(0, 0, 3.4, a - 0.06, 0.026), around(0, 0, 7.6, a, 0.026), around(0, 0, 3.4, a + 0.06, 0.026)], c(BANNER[element][1]))
    # The fire, beside the straight way from where a visitor starts to the first bridge.
    fx, fz = FIRE
    for i in range(10):
        a = TAU * i / 10
        rock(paint, fx + 1.15 * math.cos(a), fz + 1.15 * math.sin(a), 0.0, 0.34, 0.36, (c("#6d679a"), c("#8d87b8")), 6)
    for i in range(5):
        a = TAU * i / 5
        paint.tube([around(fx, fz, 0.95, a, 0.14), around(fx, fz, 0.1, a + 0.4, 0.55)], 0.13, WOOD, 5)
    for radius, height, up, color in ((0.5, 1.7, 0.2, "#ff7438"), (0.32, 1.15, 0.25, "#ffb23a"), (0.16, 0.7, 0.3, "#fff0a0")):
        crystal(glow, fx, fz, up, radius, height, (c(color), c(color)), sides=5)
    circles.append([fx, fz, 1.55])
    # Tents, crates and lanterns between the bridges.
    mouths = [math.atan2(*reversed(center(i))) for i in range(len(ELEMENTS))]
    gaps = [mouths[i] + TAU / len(ELEMENTS) / 2 for i in range(len(ELEMENTS))]
    cloth = (("#ff5fa8", "#ffffff"), ("#5a4fd8", "#cfcbff"), ("#ffd02e", "#ffffff"), ("#35dcab", "#ffffff"))
    tent = 0
    for i, a in enumerate(gaps):
        # The way out stands in the gap behind a new visitor.
        if apart(a, math.pi / 2) < 0.2:
            continue
        x, z = 12.6 * math.cos(a), 12.6 * math.sin(a)
        if i % 2 == 0 or i == 5:
            colors = cloth[tent % len(cloth)]
            tent += 1
            sides = 8
            for k in range(sides):
                first, second = TAU * k / sides + a, TAU * (k + 1) / sides + a
                wall = [around(x, z, 1.7, first), around(x, z, 1.7, second), around(x, z, 1.55, second, 1.2), around(x, z, 1.55, first, 1.2)]
                paint.face(wall, c(colors[k % 2]))
                paint.face([around(x, z, 2.05, first, 1.15), around(x, z, 2.05, second, 1.15), at(x, z, 2.9)], c(colors[k % 2]))
            # The door looks at the fire.
            door = a + math.pi
            glow.face([around(x, z, 1.74, door - 0.28, 0.02), around(x, z, 1.74, door + 0.28, 0.02), around(x, z, 1.66, door, 1.12)], c("#2a2250"))
            paint.tube([at(x, z, 2.8), at(x, z, 3.7)], 0.05, WOOD, 4)
            paint.face([at(x, z, 3.7), at(x + 0.75, z, 3.45), at(x, z, 3.2)], c(colors[0]))
            circles.append([x, z, 2.2])
        else:
            for dx, dz, size, up in ((0, 0, 0.62, 0), (1.15, 0.35, 0.48, 0), (0.35, 0.15, 0.38, 1.24)):
                prism(paint, x + dx, z + dz, up, up + size * 2, size * 1.2, size * 1.2, (WOOD, WOOD_LIGHT), 4, math.pi / 4 + a + dx, cap=WOOD_LIGHT)
            for k in range(3):
                prism(paint, x - 1.1 + k * 0.2, z + 0.9 - k * 0.55, 0.0, 0.85, 0.3, 0.26, (c("#6b4a8c"), c("#7d5aa0")), 9, cap=WOOD_LIGHT)
            circles.append([x, z, 1.9])
    for a in gaps:
        if apart(a, math.pi / 2) < 0.2:
            continue
        x, z = 8.9 * math.cos(a), 8.9 * math.sin(a)
        prism(paint, x, z, 0.0, 2.1, 0.13, 0.09, INK, 6)
        crystal(glow, x, z, 2.15, 0.26, 0.7, (c("#fff0a0"), c("#ffd02e")))
        prism(paint, x, z, 2.85, 3.05, 0.34, 0.05, INK, 6)
        circles.append([x, z, 0.35])
    ring = (c("#efeaff"), c("#b9aede"))
    for i in range(60):
        a = TAU * i / 60
        if clear(a, mouths, 0.2) and apart(a, math.pi / 2) > 0.12:
            r = CAMP["walk"] + 0.6
            prism(paint, r * math.cos(a), r * math.sin(a), 0.0, 0.75 if i % 3 else 1.15, 0.24, 0.17, ring, 6)


def bridge(paint, glow, start, end, colors, planks):
    """A deck of planks between two points of the page, with posts and sagging ropes."""
    dx, dz = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dz)
    ahead = (dx / length, dz / length)
    side = (-ahead[1], ahead[0])
    half = BRIDGE + 0.35

    def p(t, s, up):
        return at(start[0] + ahead[0] * t + side[0] * s, start[1] + ahead[1] * t + side[1] * s, up)

    count = max(int(length / 0.85), 1)
    step = length / count
    for i in range(count):
        a, b = i * step + 0.04, (i + 1) * step - 0.04
        wide = half + random.uniform(-0.08, 0.08)
        # A little above the ground of the islands, so the two never fight for the same pixels.
        top = [p(a, -wide, 0.03), p(a, wide, 0.03), p(b, wide, 0.03), p(b, -wide, 0.03)]
        paint.face(top, planks[i % 2])
        under = [(x, y, -0.25) for x, y, _ in top]
        for k in range(4):
            j = (k + 1) % 4
            paint.face([top[k], top[j], under[j], under[k]], planks[1])
        paint.face(under, planks[1])
    posts = max(int(length / 4), 2)
    for s in (-1, 1):
        edge = s * (half + 0.2)
        for i in range(posts + 1):
            t = length * i / posts
            x, y, _ = p(t, edge, 0)
            paint.frustum((x, y, -0.4), 0.17, 0.11, 1.55, planks[1], 6)
            glow.gem((x, y, 1.15), 0.16, 0.42, colors[0])
        for i in range(posts):
            rope = [p(length * (i + k / 6) / posts, edge, 1.0 - 0.35 * math.sin(math.pi * k / 6)) for k in range(7)]
            glow.tube(rope, 0.045, colors[1], 4)
        glow.tube([p(0, s * half, -0.3), p(length / 2, s * half * 0.6, -2.6), p(length, s * half, -0.3)], 0.09, colors[0], 4)


def arch(paint, glow, x, z, angle, colors):
    """A gate over the start of a bridge. "angle" is the way the bridge leads."""
    side = (-math.sin(angle), math.cos(angle))
    for s in (-1, 1):
        px, pz = x + side[0] * s * 3.35, z + side[1] * s * 3.35
        prism(paint, px, pz, 0.0, 0.6, 0.65, 0.5, INK, 6)
        prism(paint, px, pz, 0.6, 4.4, 0.38, 0.28, (c("#efeaff"), c("#cfc8f0")), 6)
        crystal(glow, px, pz, 4.5, 0.34, 1.15, (colors[0], colors[1]))
        flag = [at(px - side[0] * s * 0.4, pz - side[1] * s * 0.4, 3.9), at(px - side[0] * s * 1.3, pz - side[1] * s * 1.3, 3.9)]
        paint.face([flag[0], flag[1], (flag[1][0], flag[1][1], 2.1), (flag[0][0], flag[0][1], 2.6)], colors[0])
    curve = []
    for i in range(13):
        t = i / 12
        s = -3.35 + 6.7 * t
        curve.append(at(x + side[0] * s, z + side[1] * s, 4.4 + 1.5 * math.sin(math.pi * t)))
    glow.tube(curve, 0.13, colors[0], 5)
    glow.gem(at(x, z, 6.0), 0.5, 1.4, colors[1])


def sky(paint, glow):
    """Rocks that drift far around the islands, some with a crystal on top."""
    for i in range(70):
        a = TAU * i / 70 + random.uniform(-0.04, 0.04)
        r = random.uniform(116, 140)
        x, z = r * math.cos(a), r * math.sin(a)
        up = random.uniform(-16, 26)
        size = random.uniform(1.2, 5.0)
        rock(paint, x, z, up, size, size * 0.6, (c("#8d87b8"), c("#a49ecb")), 7)
        prism(paint, x, z, up, up - size * 1.8, size * 0.75, 0.05, c("#6d679a"), 7)
        if i % 4 == 0:
            element = ELEMENTS[i % len(ELEMENTS)]
            crystal(glow, x, z, up + size * 0.55, size * 0.25, size * 1.3, (c(BANNER[element][0]), c(BANNER[element][1])))


# ---------------------------------------------------------------- everything together


def main():
    # The same map at every run.
    random.seed(11)
    scene = make_scene("Solaris_Wilds", ("isle_", "glow_", "spin_", "wilds_"))
    lit = make_material("wilds_paint")
    shine = make_material("wilds_glow")
    # Only for the pictures taken in Blender; the page draws these meshes unlit.
    shader = next(n for n in shine.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    source = next(n for n in shine.node_tree.nodes if n.type == "VERTEX_COLOR")
    shine.node_tree.links.new(source.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 0.8

    circles, islands, bridges, spins = [], [], [], {}
    paint, glow = Shape(), Shape()
    camp(paint, glow, circles)
    add(scene, lit, "isle_camp", paint)
    add(scene, shine, "glow_camp", glow)

    centers = [center(i) for i in range(len(ELEMENTS))]
    for index, element in enumerate(ELEMENTS):
        cx, cz = centers[index]
        home = math.atan2(-cz, -cx)
        neighbors = [centers[(index + k) % len(ELEMENTS)] for k in (-1, 1)]
        mouths = [home] + [math.atan2(z - cz, x - cx) for x, z in neighbors]
        paint, glow, spin = Shape(), Shape(), Shape()
        ground(paint, cx, cz, ISLE["radius"], GROUND[element], 30.0)
        # A path leads from the bridge toward what stands in the middle.
        path = [(cx + r * math.cos(home), cz + r * math.sin(home)) for r in (ISLE["walk"] + 2.4, 22.0, 16.0, 11.0, 8.6)]
        strip(paint, path, 3.2, 0.008, c(GROUND[element][4]))
        spins.update(BIOMES[element](paint, glow, spin, cx, cz, mouths, home))
        add(scene, lit, f"isle_{element.lower()}", paint)
        add(scene, shine, f"glow_{element.lower()}", glow)
        name = f"spin_{element.lower()}"
        add(scene, shine if element not in ("Aero", "Fusion", "Havoc", "Physical") else lit, name, spin)
        islands.append({"element": element, "x": round(cx, 3), "z": round(cz, 3), "walk": ISLE["walk"], "core": CORE + 0.4})
        circles.append([round(cx, 3), round(cz, 3), CORE + 0.4])

    paint, glow = Shape(), Shape()
    for index, element in enumerate(ELEMENTS):
        cx, cz = centers[index]
        a = math.atan2(cz, cx)
        ux, uz = math.cos(a), math.sin(a)
        for s in (-1, 1):
            # The posts of the arch stand on the camp, beside the bridge.
            r = CAMP["walk"] - 0.3
            circles.append([ux * r - s * 3.35 * uz, uz * r + s * 3.35 * ux, 0.7])
        colors = (c(BANNER[element][0]), c(BANNER[element][1]))
        start, end = CAMP["radius"] - 0.6, DISTANCE - ISLE["radius"] + 0.6
        bridge(paint, glow, (ux * start, uz * start), (ux * end, uz * end), colors, (WOOD_LIGHT, WOOD))
        arch(paint, glow, ux * (CAMP["walk"] - 0.3), uz * (CAMP["walk"] - 0.3), a, colors)
        # What can be walked on reaches into both pieces of ground.
        bridges.append([ux * (CAMP["walk"] - 2), uz * (CAMP["walk"] - 2), ux * (DISTANCE - ISLE["walk"] + 2), uz * (DISTANCE - ISLE["walk"] + 2)])

        nx, nz = centers[(index + 1) % len(ELEMENTS)]
        gap = math.hypot(nx - cx, nz - cz)
        vx, vz = (nx - cx) / gap, (nz - cz) / gap
        start, end = ISLE["radius"] - 0.8, gap - ISLE["radius"] + 0.8
        bridge(paint, glow, (cx + vx * start, cz + vz * start), (cx + vx * end, cz + vz * end), (WHITE, c("#cfc8f0")), (c("#cfcbe8"), c("#a9a3d0")))
        start, end = ISLE["walk"] - 2, gap - ISLE["walk"] + 2
        bridges.append([cx + vx * start, cz + vz * start, cx + vx * end, cz + vz * end])
    add(scene, lit, "isle_bridges", paint)
    add(scene, shine, "glow_bridges", glow)

    paint, glow = Shape(), Shape()
    sky(paint, glow)
    add(scene, lit, "isle_sky", paint)
    add(scene, shine, "glow_sky", glow)

    # With the default bits, points this far from zero move by centimeters, and flat things on
    # the ground then flicker through it.
    bits = meshopt.EXP_FILTER_BITS
    meshopt.EXP_FILTER_BITS = 20
    try:
        export(os.path.join(FOLDER, "wilds.glb"))
    finally:
        meshopt.EXP_FILTER_BITS = bits
    layout = {
        "camp": CAMP["walk"],
        "halfBridge": BRIDGE,
        "islands": islands,
        "bridges": [[round(v, 3) for v in item] for item in bridges],
        "circles": [[round(v, 3) for v in item] for item in circles],
        "spins": {
            name: {"at": [round(v, 3) for v in spot["at"]], "turn": round(spot["turn"], 4), "axis": spot["axis"], "speed": spot["speed"]}
            for name, spot in spins.items()
        },
    }
    with open(os.path.join(FOLDER, "wilds.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(layout, handle, indent=2)
        handle.write("\n")

    # After the export, so the file keeps the turning parts around the zero point.
    for name, spot in spins.items():
        obj = scene.collection.objects[name]
        x, up, z = spot["at"]
        obj.location = at(x, z, up)
        obj.rotation_euler = (0.0, 0.0, spot["turn"])
    bpy.context.view_layer.update()
    print("[wilds] done")


main()
