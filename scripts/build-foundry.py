"""Builds the Ember Foundry, the walkable forge of the Armory. Writes
src/assets/armory/foundry.glb and src/assets/armory/foundry.json.

    blender --background --factory-startup --python scripts/build-foundry.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Foundry",
and leaves every other scene alone. The model is original low-poly work and holds no game assets.

A smith as tall as a tower stands on a round floor over a lake of lava, and beats a blade on its
anvil. Five bridges lead from there to five forges, one for every kind of weapon, each with its
own landmark in the middle and the weapons on stands around it. A sixth bridge leads back to the
way out. The page lays the stands itself, from the numbers in the JSON file.

Positions in this script and in the JSON file are those of the page: x to the right, y up and z
toward the visitor. A bearing of 0 points toward -z and grows to the right. "to_blender" turns
the points into Blender's coordinates at the end.

Every part is built around its own zero point:
- "hub_*" is the round floor, "entry_*" the bridge and landing of the way out, "bridge_*" one
  bridge to a forge (toward -z), "cave_*" the walls of the cavern and "rail_*" the ring that the
  ladles run on.
- "deck_<kind>_*" is the floor of a forge, with its way in toward +z, "mark_<kind>_*" the
  landmark in its middle and "rotor_<kind>_*" the part of it that moves.
- "smith_*" is the smith with the anvil, "hammer_*" the arm that strikes (around its shoulder)
  and "blade_*" the work on the anvil.
- "plinth_*" is the stand of one weapon, "gear_*", "chain_*" and "ladle_*" are repeated.
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
FOLDER = os.path.join(ROOT, "src", "assets", "armory")

# The round floor: the dais of the smith in the middle, and how far one can walk.
HUB = {"dais": 6.6, "radius": 13.0}
# The bridges: half of the width that can be walked on.
BRIDGE = 2.2
# A forge: how far its middle is, how wide it is, its landmark and the ring of its stands.
FORGE = {"far": 40.0, "radius": 17.0, "mark": 5.7, "stands": 13.2, "gap": 0.36, "look": 3.1}
# The kinds, with the bearing of their forge in degrees.
KINDS = (("broadblade", -120), ("sword", -60), ("pistols", 0), ("gauntlets", 60), ("rectifier", 120))
# The way out: the landing behind a new visitor.
LANDING = {"far": 24.0, "radius": 6.0, "gate": 27.0}
LAVA = -7.0
STAND_TOP = 0.5
# Where the arm of the smith turns, and where the hammer meets the blade.
SHOULDER = (3.7, 9.9, -2.6)
ANVIL = (0.0, 3.75, 2.8)


def c(color):
    return linear(color)


BASALT = c("#352a45")
BASALT_DARK = c("#231a31")
BASALT_LIGHT = c("#4b3d5e")
ASH = c("#6a5a78")
ROCK = c("#3a2433")
ROCK_DARK = c("#241522")
ROCK_WARM = c("#59303a")
IRON = c("#3f3b58")
IRON_LIGHT = c("#67618a")
IRON_DARK = c("#27243c")
STEEL = c("#c9d3f0")
STEEL_DARK = c("#8e99c4")
BRASS = c("#ffc457")
BRASS_DARK = c("#b9782a")
BRASS_PALE = c("#ffe3a0")
WOOD = c("#7a4436")
LEATHER = c("#9a5a3c")
WHITE = c("#ffffff")
LAVA_RED = c("#ff4a12")
LAVA_ORANGE = c("#ff8a1e")
LAVA_YELLOW = c("#ffd24a")


class Look:
    def __init__(self, light, deep, floor, tile):
        self.light, self.deep, self.floor, self.tile = c(light), c(deep), c(floor), c(tile)


LOOKS = {
    "broadblade": Look("#ff8a2a", "#8c3412", "#4a3038", "#5a3a3e"),
    "sword": Look("#4fd8ff", "#175c92", "#2a3452", "#344265"),
    "pistols": Look("#ffd23f", "#8a6410", "#40382e", "#504636"),
    "gauntlets": Look("#ff4f6d", "#8a1736", "#44263a", "#562e46"),
    "rectifier": Look("#b47aff", "#4a1f98", "#33264e", "#402f62"),
}


# ---------------------------------------------------------------- shapes


def box(s, x0, x1, y0, y1, z0, z1, color, top=None):
    p = [(x, y, z) for y in (y0, y1) for z in (z0, z1) for x in (x0, x1)]
    for face in ((0, 1, 3, 2), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)):
        s.face([p[i] for i in face], color)
    s.face([p[i] for i in (4, 5, 7, 6)], top or color)


def block(s, center, size, color, top=None):
    x, y, z = center
    w, h, d = (v / 2 for v in size)
    box(s, x - w, x + w, y - h, y + h, z - d, z + d, color, top)


def lathe(s, at, profile, color, sides=10, axis="y", turn=0.0):
    """Rings of (radius, along) around an axis through "at"; the ends are closed."""
    x, y, z = at

    def ring(radius, along):
        out = []
        for i in range(sides):
            a = turn + TAU * i / sides
            u, v = max(radius, 0.002) * math.cos(a), max(radius, 0.002) * math.sin(a)
            if axis == "y":
                out.append((x + u, y + along, z + v))
            elif axis == "z":
                out.append((x + u, y + v, z + along))
            else:
                out.append((x + along, y + u, z + v))
        return out

    rings = [ring(*item) for item in profile]
    for low, high in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            s.face([low[i], low[j], high[j], high[i]], color)
    s.face(rings[0], color)
    s.face(rings[-1], color)


def cyl(s, at, radius, height, color, sides=10, axis="y", top=None):
    lathe(s, at, [(radius, 0), (radius if top is None else top, height)], color, sides, axis)


def ball(s, at, radius, color, squash=1.0, sides=8, rows=5):
    profile = [
        (radius * math.sin(math.pi * i / rows), -radius * squash * math.cos(math.pi * i / rows))
        for i in range(rows + 1)
    ]
    lathe(s, at, profile, color, sides)


def crystal(s, at, radius, height, color, lean=(0.0, 0.0), sides=5):
    x, y, z = at
    foot = [(x + radius * 0.6 * math.cos(TAU * i / sides), y, z + radius * 0.6 * math.sin(TAU * i / sides)) for i in range(sides)]
    waist = [
        (x + lean[0] * 0.6 + radius * math.cos(TAU * i / sides), y + height * 0.62, z + lean[1] * 0.6 + radius * math.sin(TAU * i / sides))
        for i in range(sides)
    ]
    tip = (x + lean[0], y + height, z + lean[1])
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


def arc(radius, bearing, y=0.0, center=(0.0, 0.0)):
    return (center[0] + radius * math.sin(bearing), y, center[1] - radius * math.cos(bearing))


def band(s, inner, outer, y, color, steps=64, start=0.0, span=TAU, center=(0.0, 0.0)):
    """A flat piece of a ring on the floor."""
    for i in range(steps):
        a, b = start + span * i / steps, start + span * (i + 1) / steps
        if inner > 0:
            s.face([arc(inner, a, y, center), arc(outer, a, y, center), arc(outer, b, y, center), arc(inner, b, y, center)], color)
        else:
            s.face([(center[0], y, center[1]), arc(outer, a, y, center), arc(outer, b, y, center)], color)


def beam(s, a, b, wide, color, wide_end=None):
    """A square bar from "a" to "b", which can get thinner on the way."""
    s_end = wide if wide_end is None else wide_end
    along = [q - p for p, q in zip(a, b)]
    length = math.hypot(*along) or 1.0
    t = [v / length for v in along]
    flat = math.hypot(t[0], t[2])
    u = (-t[2] / flat, 0.0, t[0] / flat) if flat > 1e-6 else (1.0, 0.0, 0.0)
    v = (t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0])

    def corners(p, w):
        return [
            tuple(p[k] + (w / 2) * (i * u[k] + j * v[k]) for k in range(3))
            for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))
        ]

    low, high = corners(a, wide), corners(b, s_end)
    for i in range(4):
        j = (i + 1) % 4
        s.face([low[i], low[j], high[j], high[i]], color)
    s.face(low, color)
    s.face(high, color)


def plate(s, outline, z0, z1, color, edge=None):
    """A flat outline of (x, y) with a thickness along z."""
    front = [(x, y, z1) for x, y in outline]
    back = [(x, y, z0) for x, y in outline]
    s.face(front, color)
    s.face(back, color)
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        s.face([back[i], back[j], front[j], front[i]], edge or color)


def merge(into, part, move):
    """Adds the faces of "part" to "into", with every point moved."""
    start = len(into.verts)
    into.verts.extend(move(p) for p in part.verts)
    into.faces.extend(tuple(i + start for i in face) for face in part.faces)
    into.colors.extend(part.colors)


def placed(x=0.0, y=0.0, z=0.0, turn=0.0, tilt=0.0, scale=1.0):
    """Tilts about x, then turns about y, then moves."""

    def move(p):
        px, py, pz = (v * scale for v in p)
        py, pz = py * math.cos(tilt) - pz * math.sin(tilt), py * math.sin(tilt) + pz * math.cos(tilt)
        px, pz = px * math.cos(turn) + pz * math.sin(turn), -px * math.sin(turn) + pz * math.cos(turn)
        return (px + x, py + y, pz + z)

    return move


def sword(paint, glow, light, length=6.0, move=None):
    """A sword that points down, with its tip at the zero point."""
    p, g = Shape(), Shape()
    w, hilt = length * 0.075, length * 0.72
    plate(p, [(0, 0), (w, length * 0.1), (w * 0.85, hilt), (-w * 0.85, hilt), (-w, length * 0.1)], -w * 0.22, w * 0.22, STEEL, STEEL_DARK)
    plate(g, [(0, length * 0.12), (w * 0.2, length * 0.2), (w * 0.14, hilt * 0.96), (-w * 0.14, hilt * 0.96), (-w * 0.2, length * 0.2)], -w * 0.26, w * 0.26, light)
    plate(p, [(-w * 2.6, hilt + w * 0.7), (-w * 1.2, hilt), (w * 1.2, hilt), (w * 2.6, hilt + w * 0.7), (w * 0.8, hilt + w), (-w * 0.8, hilt + w)], -w * 0.4, w * 0.4, BRASS, BRASS_DARK)
    cyl(p, (0, hilt + w, 0), w * 0.34, length * 0.2, LEATHER, 6)
    ball(g, (0, hilt + w + length * 0.21, 0), w * 0.55, light, 1.1, 6, 4)
    for shape, target in ((p, paint), (g, glow)):
        merge(target, shape, move or placed())


def rock(s, at, radius, height, color, sides=6, jag=0.28, taper=0.45):
    """A rough pillar; a negative height hangs down."""
    x, y, z = at
    profile = [(1.0, 0.0), (0.86, 0.34), (0.92, 0.55), (0.66, 0.8), (taper, 1.0)]
    turn = random.random() * TAU
    rings = []
    for share, up in profile:
        ring = []
        for i in range(sides):
            r = radius * share * (1 + random.uniform(-jag, jag))
            a = turn + TAU * i / sides
            ring.append((x + r * math.cos(a), y + height * up, z + r * math.sin(a)))
        rings.append(ring)
    for k, (low, high) in enumerate(zip(rings, rings[1:])):
        for i in range(sides):
            j = (i + 1) % sides
            s.face([low[i], low[j], high[j], high[i]], color)
    s.face(rings[-1], color)
    s.face(rings[0], color)


def chain(s, a, b, radius, color, links=None):
    """Links from "a" to "b", every other one turned."""
    length = math.dist(a, b)
    count = links or max(int(length / (radius * 2.2)), 1)
    for i in range(count):
        t = (i + 0.5) / count
        mid = tuple(p + (q - p) * t for p, q in zip(a, b))
        steep = abs(b[1] - a[1]) > abs(b[0] - a[0]) + abs(b[2] - a[2])
        plane = ("xy" if i % 2 else "zy") if steep else ("xy" if i % 2 else "xz")
        hoop(s, mid, radius * 0.95, radius * 0.26, color, plane, 8, 4)


def brazier(paint, glow, at, light, tall=1.5):
    x, y, z = at
    lathe(paint, at, [(0.34, 0), (0.16, 0.2), (0.12, tall - 0.4), (0.4, tall - 0.1), (0.42, tall)], IRON, 6)
    hoop(paint, (x, y + tall, z), 0.42, 0.05, BRASS, "xz", 10, 4)
    for k, (r, h) in enumerate(((0.26, 0.75), (0.16, 0.5), (0.13, 0.42))):
        dx, dz = (0, 0) if k == 0 else (0.18 * (1 if k == 1 else -1), 0.08 * (1 if k == 1 else -1))
        crystal(glow, (x + dx, y + tall - 0.05, z + dz), r, h, light if k == 0 else LAVA_YELLOW, (dx * 0.4, dz * 0.4))


# ---------------------------------------------------------------- the round floor


def railing(paint, glow, points, light, height=1.0):
    """Posts at "points", joined by sagging chains."""
    for x, y, z in points:
        lathe(paint, (x, y, z), [(0.17, 0), (0.1, 0.14), (0.09, height), (0.15, height + 0.08)], IRON, 6)
        crystal(glow, (x, y + height + 0.08, z), 0.1, 0.26, light)
    for a, b in zip(points, points[1:]):
        if math.dist(a, b) > 4.2:
            continue
        mid = tuple((p + q) / 2 for p, q in zip(a, b))
        sag = [(a[0], a[1] + height - 0.1, a[2]), (mid[0], mid[1] + height - 0.42, mid[2]), (b[0], b[1] + height - 0.1, b[2])]
        paint.tube(sag, 0.045, IRON_LIGHT, 4)


def hub(paint, glow):
    radius, dais = HUB["radius"], HUB["dais"]
    spokes = [math.radians(b) for _, b in KINDS] + [math.pi]
    # Rings of stone tiles in two shades.
    edges = (dais - 0.2, 8.0, 9.6, 11.2, radius)
    for ring, (a, b) in enumerate(zip(edges, edges[1:])):
        count = 24 + ring * 6
        for i in range(count):
            color = BASALT if (i + ring) % 2 else BASALT_LIGHT
            band(paint, a + 0.03, b - 0.03, 0.0, color, 2, TAU * i / count + 0.008, TAU / count - 0.016)
    band(paint, dais - 0.2, radius, -0.03, BASALT_DARK, 72)
    # Channels of lava run from the dais to every bridge.
    for bearing in spokes:
        for off in (-0.32, 0.32):
            side = (off * math.cos(bearing), off * math.sin(bearing))
            a = arc(dais, bearing, 0.012, side)
            b = arc(radius, bearing, 0.012, side)
            beam(glow, a, b, 0.09, LAVA_ORANGE)
        for k in range(3):
            ball(glow, arc(7.6 + k * 2.0, bearing, 0.0), 0.2, LAVA_YELLOW, 0.14, 4, 2)
    hoop(glow, (0, 0.0, 0), 9.6, 0.035, LAVA_RED, "xz", 72, 4)
    hoop(paint, (0, 0.0, 0), radius, 0.16, BRASS_DARK, "xz", 72, 5)
    # The rim, with openings for the bridges.
    gap = math.asin((BRIDGE + 0.45) / radius)
    ordered = sorted(b % TAU for b in spokes)
    for a, b in zip(ordered, ordered[1:] + [ordered[0] + TAU]):
        start, span = a + gap, b - a - 2 * gap
        count = max(int(span * radius / 2.0), 1)
        railing(paint, glow, [arc(radius - 0.25, start + span * i / count) for i in range(count + 1)], LAVA_ORANGE)
        # Braziers in the middle of every arc, just outside the floor.
        mid = (a + b) / 2
        x, _, z = arc(radius + 0.9, mid)
        rock(paint, (x, -0.2, z), 1.0, -4.5, ROCK, 6)
        brazier(paint, glow, (x, -0.2, z), LAVA_ORANGE, 2.1)
    # Below the floor: a drum of iron and the rock that holds it up.
    lathe(paint, (0, -1.5, 0), [(radius - 0.9, 0), (radius + 0.1, 0.6), (radius + 0.1, 1.45)], IRON_DARK, 36)
    hoop(glow, (0, -0.75, 0), radius + 0.12, 0.09, LAVA_RED, "xz", 72, 4)
    rock(paint, (0, -1.4, 0), radius - 1.5, LAVA - 0.8, ROCK_DARK, 14, 0.14, 0.5)
    for i in range(28):
        a = TAU * i / 28
        ball(paint, arc(radius + 0.2, a, -0.3), 0.14, BRASS, 1.0, 6, 3)


def planks(paint, glow, z0, z1, light):
    """The deck of a bridge between z0 and z1, with its rails and its glowing seams."""
    count = max(int(abs(z1 - z0) / 0.8), 1)
    step = (z1 - z0) / count
    wide = BRIDGE + 0.4
    for i in range(count):
        a, b = z0 + step * i, z0 + step * (i + 1)
        lo, hi = min(a, b) + 0.05, max(a, b) - 0.05
        box(paint, -wide, wide, -0.22, 0.0, lo, hi, IRON_DARK, IRON if i % 2 else IRON_LIGHT)
        box(glow, -wide + 0.2, wide - 0.2, -0.17, -0.12, hi, hi + 0.1, LAVA_RED)
    lo, hi = min(z0, z1), max(z0, z1)
    for side in (-1, 1):
        box(paint, side * wide - 0.14, side * wide + 0.14, -0.5, 0.08, lo, hi, BASALT_DARK)
        box(glow, side * (wide + 0.15) - 0.02, side * (wide + 0.15) + 0.02, -0.3, -0.18, lo, hi, light)
        posts = max(int((hi - lo) / 2.2), 1)
        railing(paint, glow, [(side * (wide - 0.05), 0.0, lo + (hi - lo) * i / posts) for i in range(posts + 1)], light, 0.95)
    # Two piers that stand in the lava.
    for share in (0.28, 0.74):
        z = lo + (hi - lo) * share
        for side in (-1, 1):
            beam(paint, (side * 1.7, -0.3, z), (side * 2.6, LAVA - 0.5, z), 0.75, ROCK, 1.25)
        points = [(1.75 * math.cos(math.pi * i / 8), -2.7 + 2.1 * math.sin(math.pi * i / 8), z) for i in range(9)]
        paint.tube(points, 0.3, BASALT, 5)


def bridge(paint, glow):
    start, end = HUB["radius"] - 0.1, FORGE["far"] - FORGE["radius"] + 0.4
    planks(paint, glow, -start, -end, LAVA_ORANGE)


def entry(paint, glow):
    far, radius = LANDING["far"], LANDING["radius"]
    planks(paint, glow, HUB["radius"] - 0.1, far - radius + 0.5, LAVA_ORANGE)
    center = (0.0, far)
    for ring, (a, b) in enumerate(((0.0, 2.2), (2.2, 4.2), (4.2, radius))):
        for i in range(18):
            band(paint, a, b - 0.05, 0.0, BASALT if (i + ring) % 2 else BASALT_LIGHT, 2, TAU * i / 18, TAU / 18 - 0.01, center)
    hoop(paint, (0, 0, far), radius, 0.16, BRASS_DARK, "xz", 48, 5)
    hoop(glow, (0, 0.012, far), 2.2, 0.035, LAVA_ORANGE, "xz", 36, 4)
    gap = math.asin((BRIDGE + 0.45) / radius)
    railing(paint, glow, [arc(radius - 0.25, gap + (TAU - 2 * gap) * i / 18, 0.0, center) for i in range(19)], LAVA_ORANGE)
    rock(paint, (0, -0.25, far), radius + 0.1, LAVA - 0.6, ROCK_DARK, 10, 0.14, 0.45)
    # An anvil as a sign over the way out, between two hanging chains.
    z = LANDING["gate"] + 1.4
    for side in (-1, 1):
        lathe(paint, (side * 2.7, 0, z), [(0.5, 0), (0.32, 0.5), (0.3, 5.2), (0.46, 5.5)], BASALT, 6)
        brazier(paint, glow, (side * 3.9, 0, far + 1.2), LAVA_ORANGE, 1.3)
    beam(paint, (-3.2, 5.7, z), (3.2, 5.7, z), 0.4, IRON)


def anvil(paint, glow, at, size, light=None):
    """An anvil about 3.4 long and 2.2 high at size 1, with its foot at "at"."""
    p, g = Shape(), Shape()
    box(p, -1.1, 1.1, 0.0, 0.35, -0.75, 0.75, IRON_DARK, IRON)
    lathe(p, (0, 0.35, 0), [(0.85, 0), (0.45, 0.45), (0.5, 0.85), (0.95, 1.1)], IRON, 4, "y", math.pi / 4)
    box(p, -1.25, 1.15, 1.45, 2.2, -0.65, 0.65, IRON, IRON_LIGHT)
    plate(p, [(-1.25, 2.2), (-2.5, 2.06), (-1.25, 1.55)], -0.4, 0.4, IRON, IRON_LIGHT)
    box(p, 1.15, 1.6, 1.75, 2.2, -0.5, 0.5, IRON_DARK, IRON_LIGHT)
    box(g, -1.0, 0.9, 0.9, 1.0, 0.66, 0.7, light or LAVA_ORANGE)
    for target, part in ((paint, p), (glow, g)):
        merge(target, part, placed(*at, scale=size))


def smith(paint, glow):
    """The giant of iron and basalt who stands behind the anvil."""
    dais = HUB["dais"]
    lathe(paint, (0, 0.0, 0), [(dais, 0), (dais - 0.35, 0.55), (dais - 0.5, 0.6)], BASALT_DARK, 24)
    band(paint, 0.0, dais - 0.55, 0.62, BASALT, 24)
    hoop(glow, (0, 0.34, 0), dais - 0.2, 0.07, LAVA_ORANGE, "xz", 64, 4)
    hoop(paint, (0, 0.62, 0), dais - 0.9, 0.09, BRASS_DARK, "xz", 48, 4)
    for i in range(12):
        x, _, z = arc(dais - 0.35, TAU * (i + 0.5) / 12)
        crystal(glow, (x, 0.58, z), 0.14, 0.5, LAVA_YELLOW)
    z = SHOULDER[2]
    # The legs, with plates over the knees.
    for side in (-1, 1):
        x = side * 1.7
        box(paint, x - 1.05, x + 1.05, 0.6, 1.5, z - 1.1, z + 1.5, IRON_DARK, IRON)
        beam(paint, (x, 1.4, z + 0.1), (x * 0.9, 3.5, z + 0.5), 1.35, BASALT, 1.6)
        beam(paint, (x * 0.9, 3.4, z + 0.5), (x * 0.65, 5.5, z - 0.1), 1.7, BASALT_LIGHT, 1.55)
        lathe(paint, (x * 0.9, 3.45, z + 1.15), [(0.75, 0), (0.55, 0.35), (0.15, 0.5)], BRASS_DARK, 6, "z")
        ball(glow, (x * 0.9, 3.45, z + 1.65), 0.2, LAVA_YELLOW, 1.0, 6, 4)
        box(paint, x - 1.12, x + 1.12, 1.44, 1.62, z - 1.16, z + 1.56, BRASS_DARK)
    # The hips and the apron of leather.
    lathe(paint, (0, 5.0, z), [(2.0, 0), (2.25, 0.5), (1.95, 1.0)], IRON, 8)
    hoop(paint, (0, 5.5, z), 2.28, 0.18, BRASS, "xz", 16, 5)
    plate(paint, [(-1.5, 5.4), (1.5, 5.4), (1.15, 2.7), (0, 2.35), (-1.15, 2.7)], z + 1.85, z + 2.15, LEATHER, WOOD)
    plate(glow, [(0, 4.7), (0.45, 4.0), (0, 3.3), (-0.45, 4.0)], z + 2.14, z + 2.2, LAVA_ORANGE)
    # The chest, wide at the shoulders, with a furnace inside.
    lathe(paint, (0, 5.9, z), [(1.7, 0), (2.3, 0.8), (3.15, 2.9), (3.2, 4.0), (2.0, 4.9), (0.8, 5.2)], BASALT_LIGHT, 8, "y", math.pi / 8)
    door = (0, 7.9, z + 2.9)
    lathe(paint, door, [(1.35, -0.5), (1.4, 0.15), (1.15, 0.28)], IRON_DARK, 12, "z")
    cyl(glow, (door[0], door[1], door[2] + 0.2), 1.0, 0.12, LAVA_RED, 12, "z")
    cyl(glow, (door[0], door[1], door[2] + 0.28), 0.55, 0.08, LAVA_YELLOW, 10, "z")
    for k in range(-2, 3):
        box(paint, k * 0.42 - 0.07, k * 0.42 + 0.07, door[1] - 1.1, door[1] + 1.1, door[2] + 0.34, door[2] + 0.46, IRON)
    hoop(paint, (door[0], door[1], door[2] + 0.35), 1.28, 0.14, BRASS, "xy", 20, 5)
    for side in (-1, 1):
        for points in (
            [(1.5, 6.5, 2.1), (2.1, 7.4, 2.35), (1.8, 8.6, 2.75)],
            [(2.4, 8.9, 2.4), (1.7, 9.9, 2.5), (2.2, 10.2, 2.0)],
        ):
            glow.tube([(side * x, y, z + dz) for x, y, dz in points], 0.07, LAVA_ORANGE, 4)
        # The shoulder: a round plate with horns.
        x = side * SHOULDER[0]
        ball(paint, (x, SHOULDER[1] + 0.1, z), 1.5, IRON, 0.95, 10, 6)
        hoop(paint, (x, SHOULDER[1] + 0.1, z), 1.5, 0.13, BRASS, "zy", 16, 5)
        for k, (dx, h) in enumerate(((0.2, 1.7), (0.95, 1.15))):
            crystal(paint, (x + side * dx, SHOULDER[1] + 1.2 - k * 0.35, z), 0.32, h, BRASS_PALE, (side * (0.4 + k * 0.3), 0), 5)
    # The head, with a mask, burning eyes and a crown of horns.
    lathe(paint, (0, 10.9, z + 0.35), [(0.75, 0), (1.25, 0.6), (1.2, 1.7), (0.65, 2.3)], IRON_LIGHT, 8, "y", math.pi / 8)
    plate(paint, [(-1.0, 12.1), (1.0, 12.1), (0.75, 11.0), (0, 10.55), (-0.75, 11.0)], z + 1.35, z + 1.62, IRON_DARK, IRON)
    for side in (-1, 1):
        plate(glow, [(side * 0.14, 12.38), (side * 0.9, 12.75), (side * 0.84, 12.34), (side * 0.2, 12.12)], z + 1.5, z + 1.76, LAVA_YELLOW)
        horn = [(side * 0.9, 12.7, z + 0.5), (side * 1.9, 13.4, z + 0.4), (side * 2.15, 14.5, z + 0.7)]
        paint.tube(horn, 0.22, BRASS, 5)
        crystal(paint, horn[-1], 0.22, 0.7, BRASS_PALE, (side * -0.15, 0.2))
    for k in range(5):
        crystal(glow, ((k - 2) * 0.34, 13.1 - abs(k - 2) * 0.12, z + 0.35), 0.2, 1.1 - abs(k - 2) * 0.28, LAVA_ORANGE)
    # A beard of molten metal.
    for k in range(7):
        x = (k - 3) * 0.27
        beam(glow, (x, 10.9, z + 1.55), (x * 1.15, 10.0 - (3 - abs(k - 3)) * 0.28, z + 2.0), 0.2, LAVA_ORANGE if k % 2 else LAVA_YELLOW, 0.03)
    # The left arm holds the work with tongs.
    x = -SHOULDER[0]
    elbow = (x - 0.9, 6.4, z + 0.8)
    hand = (-4.0, 4.6, z + 4.4)
    beam(paint, (x, 9.4, z), elbow, 1.5, BASALT, 1.15)
    ball(paint, elbow, 0.85, IRON, 1.0, 8, 5)
    beam(paint, elbow, hand, 1.2, BASALT_LIGHT, 1.5)
    ball(paint, hand, 0.95, IRON_DARK, 0.9, 8, 5)
    hoop(paint, tuple((p + q) / 2 for p, q in zip(elbow, hand)), 0.82, 0.12, BRASS, "xy", 12, 4)
    for dz in (-0.22, 0.22):
        beam(paint, (hand[0] + 0.3, hand[1], hand[2] + dz), (-2.4, ANVIL[1], ANVIL[2] + dz * 0.4), 0.2, STEEL_DARK, 0.12)
    anvil(paint, glow, (ANVIL[0], 0.6, ANVIL[2]), 1.3)


def hammer(paint, glow):
    """The right arm with the hammer, as it lies on the work. Its zero point is the shoulder."""
    sx, sy, sz = SHOULDER
    elbow = (0.75, -2.7, 1.7)
    hand = (-0.25, -4.15, 4.3)
    head = (ANVIL[0] + 0.55 - sx, ANVIL[1] + 1.05 - sy, ANVIL[2] - sz)
    beam(paint, (0, -0.3, 0), elbow, 1.55, BASALT, 1.15)
    ball(paint, elbow, 0.85, IRON, 1.0, 8, 5)
    beam(paint, elbow, hand, 1.2, BASALT_LIGHT, 1.55)
    mid = tuple((p + q) / 2 for p, q in zip(elbow, hand))
    ball(glow, (mid[0] + 0.7, mid[1], mid[2]), 0.22, LAVA_ORANGE, 1.0, 6, 4)
    hoop(paint, mid, 0.86, 0.13, BRASS, "xy", 12, 4)
    ball(paint, hand, 1.0, IRON_DARK, 0.9, 8, 5)
    # The handle and the head of the hammer.
    beam(paint, (hand[0] + 0.9, hand[1] + 0.1, hand[2] - 0.2), head, 0.45, WOOD, 0.4)
    hx, hy, hz = head
    box(paint, hx - 1.15, hx + 1.15, hy - 0.85, hy + 0.95, hz - 1.15, hz + 1.15, IRON, IRON_LIGHT)
    for dx in (-1.28, 1.28):
        box(paint, hx + dx - 0.15, hx + dx + 0.15, hy - 0.98, hy + 1.08, hz - 1.28, hz + 1.28, BRASS_DARK, BRASS)
    for dz in (-1.17, 1.17):
        plate(glow, [(hx, hy + 0.55), (hx + 0.5, hy), (hx, hy - 0.55), (hx - 0.5, hy)], hz + dz - 0.03, hz + dz + 0.03, LAVA_YELLOW)
    box(glow, hx - 0.95, hx + 0.95, hy - 0.9, hy - 0.84, hz - 0.95, hz + 0.95, LAVA_ORANGE)


def blade(paint, glow):
    """The glowing work that lies across the anvil."""
    x, y, z = ANVIL
    p = [(-2.4, 0.0), (-1.6, 0.42), (2.0, 0.34), (3.1, 0.0), (2.0, -0.34), (-1.6, -0.42)]
    low = [(x + a, y - 0.28, z + b) for a, b in p]
    high = [(x + a, y - 0.05, z + b) for a, b in p]
    glow.face(low, LAVA_ORANGE)
    glow.face(high, LAVA_YELLOW)
    for i in range(len(p)):
        j = (i + 1) % len(p)
        glow.face([low[i], low[j], high[j], high[i]], LAVA_ORANGE)


# ---------------------------------------------------------------- the forges


def emblem(glow, kind, light, deep):
    """The sign of a kind, laid into the floor just inside the way in (toward +z)."""
    flat = Shape()
    if kind == "broadblade":
        plate(flat, [(-0.5, -1.7), (0.75, -1.2), (0.75, 0.7), (0.15, 1.0), (-0.5, 0.7)], 0, 0.01, light)
        plate(flat, [(-0.2, 0.9), (0.15, 0.9), (0.15, 1.9), (-0.2, 1.9)], 0, 0.01, light)
    elif kind == "sword":
        plate(flat, [(0, -1.9), (0.32, -1.3), (0.28, 0.8), (-0.28, 0.8), (-0.32, -1.3)], 0, 0.01, light)
        plate(flat, [(-1.0, 0.8), (1.0, 0.8), (0.7, 1.1), (-0.7, 1.1)], 0, 0.01, light)
        plate(flat, [(-0.16, 1.1), (0.16, 1.1), (0.16, 1.9), (-0.16, 1.9)], 0, 0.01, light)
    elif kind == "pistols":
        for side in (-1, 1):
            plate(flat, [(side * 0.25, -1.5), (side * 0.75, -1.5), (side * 0.75, 0.5), (side * 1.5, 1.4), (side * 1.0, 1.7), (side * 0.25, 0.7)], 0, 0.01, light)
    elif kind == "gauntlets":
        plate(flat, [(-1.1, -0.5), (1.1, -0.5), (1.1, 0.7), (0.6, 1.5), (-0.6, 1.5), (-1.1, 0.7)], 0, 0.01, light)
        for k in range(4):
            plate(flat, [(-1.1 + k * 0.57, -1.5), (-0.62 + k * 0.57, -1.5), (-0.62 + k * 0.57, -0.65), (-1.1 + k * 0.57, -0.65)], 0, 0.01, light)
    else:
        hoop(flat, (0, 0, 0.005), 1.25, 0.09, light, "xy", 28, 4)
        plate(flat, [(0, -1.8), (0.55, 0), (0, 1.8), (-0.55, 0)], 0, 0.01, light)
    z = FORGE["radius"] - 6.6
    merge(glow, flat, lambda p: (p[0], 0.02 + p[2], z + p[1]))
    hoop(glow, (0, 0.0, z), 2.25, 0.04, deep, "xz", 36, 4)


def deck(kind, look, paint, glow):
    radius, mark, ring = FORGE["radius"], FORGE["mark"], FORGE["stands"]
    edges = (0.0, mark, 8.4, 11.4, 14.8, radius)
    for k, (a, b) in enumerate(zip(edges, edges[1:])):
        count = 10 + k * 8
        for i in range(count):
            color = look.floor if (i + k) % 2 else look.tile
            band(paint, a + 0.03 if a else 0.0, b - 0.03, 0.0, color, 2, TAU * i / count, TAU / count - 0.006)
    band(paint, mark, radius, -0.03, BASALT_DARK, 72)
    hoop(glow, (0, 0, 0), mark + 0.2, 0.06, look.light, "xz", 64, 4)
    hoop(glow, (0, 0, 0), 14.8, 0.035, look.deep, "xz", 72, 4)
    hoop(paint, (0, 0, 0), radius, 0.2, BRASS_DARK, "xz", 72, 5)
    # Rays between the landmark and the stands, like those of a wheel.
    for i in range(1, 12):
        a = math.pi + TAU * i / 12
        beam(glow, arc(mark + 0.3, a, 0.008), arc(ring - 1.4, a, 0.008), 0.07, look.deep, 0.02)
    # The wall behind the stands, with banners, and braziers between them.
    gap = math.asin((BRIDGE + 0.5) / radius)
    # Bearing pi points to the way in.
    start, span = math.pi + gap, TAU - 2 * gap
    count = 20
    for i in range(count):
        a, b = start + span * i / count, start + span * (i + 1) / count
        inner = radius - 0.35
        mid = (a + b) / 2
        low = 0.75 if i % 2 else 1.05
        p0, p1 = arc(inner, a + 0.008), arc(inner, b - 0.008)
        q0, q1 = arc(radius, a + 0.008), arc(radius, b - 0.008)
        up = lambda p: (p[0], low, p[2])
        for face in ([p0, p1, up(p1), up(p0)], [q0, q1, up(q1), up(q0)], [p0, q0, up(q0), up(p0)], [p1, q1, up(q1), up(p1)]):
            paint.face(face, BASALT)
        paint.face([up(p0), up(p1), up(q1), up(q0)], BASALT_LIGHT)
        beam(glow, arc(inner - 0.03, a + 0.05, 0.42), arc(inner - 0.03, b - 0.05, 0.42), 0.07, look.light)
        if i % 4 == 2:
            x, _, z = arc(radius + 0.15, mid)
            lathe(paint, (x, 0, z), [(0.2, 0), (0.13, 5.4), (0.2, 5.5)], IRON, 6)
            flag = Shape()
            plate(flag, [(-0.95, 5.2), (0.95, 5.2), (0.95, 2.2), (0, 2.8), (-0.95, 2.2)], -0.04, 0.04, look.deep)
            mark_glow = Shape()
            plate(mark_glow, [(0, 4.7), (0.45, 3.9), (0, 3.1), (-0.45, 3.9)], 0.04, 0.09, look.light)
            plate(mark_glow, [(-0.95, 5.2), (0.95, 5.2), (0.95, 5.05), (-0.95, 5.05)], 0.04, 0.08, BRASS)
            move = placed(*arc(radius - 0.12, mid), turn=-mid)
            merge(paint, flag, move)
            merge(glow, mark_glow, move)
            ball(glow, (x, 5.65, z), 0.22, look.light, 1.2, 6, 4)
        elif i % 4 == 0:
            brazier(paint, glow, arc(radius - 0.12, mid, low), look.light, 0.9)
    # The arch over the way in.
    for side in (-1, 1):
        x, z = side * (BRIDGE + 0.85), radius - 0.55
        lathe(paint, (x, 0, z), [(0.62, 0), (0.42, 0.5), (0.36, 4.4), (0.55, 4.75)], BASALT, 6)
        hoop(glow, (x, 1.4, z), 0.45, 0.05, look.light, "xz", 12, 4)
        crystal(glow, (x, 4.8, z), 0.32, 1.1, look.light)
    top = [(-(BRIDGE + 0.85) * math.cos(math.pi * i / 12), 4.75 + 1.5 * math.sin(math.pi * i / 12), radius - 0.55) for i in range(13)]
    paint.tube(top, 0.24, IRON, 6)
    glow.tube([(x * 0.94, y - 0.3, z) for x, y, z in top], 0.05, look.light, 4)
    emblem(glow, kind, look.light, look.deep)
    # Below the floor: the drum and the rock that stands in the lava.
    lathe(paint, (0, -1.7, 0), [(radius - 1.1, 0), (radius + 0.12, 0.7), (radius + 0.12, 1.66)], IRON_DARK, 40)
    hoop(glow, (0, -0.85, 0), radius + 0.14, 0.1, look.deep, "xz", 72, 4)
    rock(paint, (0, -1.6, 0), radius - 2.0, LAVA - 0.6, ROCK, 16, 0.12, 0.5)
    for i in range(7):
        a = TAU * i / 7 + 0.3
        x, _, z = arc(radius - 1.2, a)
        rock(paint, (x, -1.2, z), 1.6, random.uniform(-4.2, -2.4), ROCK_WARM, 5, 0.25, 0.05)


def broadblade_mark(look, paint, glow, spin):
    """The Anvil Yard: anvils piled up, a cleaver stuck in them, and a wheel that grinds."""
    lathe(paint, (0, 0, 0), [(5.4, 0), (5.1, 0.45), (4.9, 0.5)], BASALT_DARK, 10)
    band(paint, 0.0, 4.95, 0.52, BASALT, 10)
    hoop(glow, (0, 0.28, 0), 5.3, 0.06, look.light, "xz", 40, 4)
    anvil(paint, glow, (-2.0, 0.5, -1.4), 1.15, look.light)
    anvil(paint, glow, (2.2, 0.5, -1.8), 0.9, look.light)
    anvil(paint, glow, (-0.2, 0.5, -2.2), 1.5, look.light)
    cleaver, edge = Shape(), Shape()
    plate(cleaver, [(-1.0, 0), (0.55, 0.7), (1.35, 2.6), (1.2, 7.2), (-0.9, 7.6), (-1.15, 3.0)], -0.28, 0.28, STEEL, STEEL_DARK)
    plate(edge, [(-0.45, 1.1), (0.25, 1.5), (0.55, 2.8), (0.45, 6.4), (0.15, 6.4), (0.15, 3.0), (-0.45, 2.2)], -0.31, 0.31, look.light)
    box(cleaver, -1.5, 1.7, 7.55, 8.05, -0.4, 0.4, BRASS_DARK, BRASS)
    cyl(cleaver, (0, 8.0, 0), 0.3, 2.4, LEATHER, 8)
    for k in range(5):
        hoop(cleaver, (0, 8.35 + k * 0.42, 0), 0.33, 0.07, WOOD, "xz", 10, 4)
    ball(edge, (0, 10.7, 0), 0.5, look.light, 1.0, 8, 5)

    def stuck(p):
        x, y, z = p
        lean = 0.2
        return (x * math.cos(lean) - y * math.sin(lean) + 0.9, x * math.sin(lean) + y * math.cos(lean) + 2.3, z - 2.1)

    merge(paint, cleaver, stuck)
    merge(glow, edge, stuck)
    # The frame of the grindstone, in front of the pile.
    for side in (-1, 1):
        beam(paint, (side * 1.0, 0.5, 3.6), (side * 1.0, 2.5, 2.6), 0.35, WOOD)
        beam(paint, (side * 1.0, 0.5, 1.6), (side * 1.0, 2.5, 2.6), 0.35, WOOD)
        ball(paint, (side * 1.05, 2.5, 2.6), 0.3, BRASS, 1.0, 6, 4)
    box(paint, -1.4, 1.4, 0.5, 0.75, 1.9, 3.3, IRON_DARK, IRON)
    for i in range(6):
        crystal(glow, (random.uniform(-0.8, 0.8), 0.72, random.uniform(2.1, 3.1)), 0.09, 0.35, LAVA_YELLOW)
    cyl(spin, (-0.4, 0, 0), 1.65, 0.8, ASH, 16, "x")
    cyl(spin, (-1.0, 0, 0), 0.16, 2.0, IRON_LIGHT, 8, "x")
    for side in (-0.43, 0.43):
        hoop(spin, (side, 0, 0), 1.2, 0.07, BASALT_LIGHT, "zy", 24, 4)
        for k in range(4):
            a = TAU * k / 4
            beam(spin, (side, 0, 0), (side, 1.15 * math.sin(a), 1.15 * math.cos(a)), 0.16, IRON)
    return {"at": [0, 2.5, 2.6], "axis": "x", "speed": 2.4}


def sword_mark(look, paint, glow, spin):
    """The Quenching Spring: a sword as high as a tower stands in cold water, and others fly round."""
    water = c("#2aa8e8")
    lathe(paint, (0, 0, 0), [(5.4, 0), (5.45, 0.7), (4.95, 0.75), (4.85, 0.4)], BASALT_LIGHT, 20)
    band(glow, 0.0, 4.9, 0.5, water, 24)
    for r in (1.9, 3.1, 4.2):
        hoop(glow, (0, 0.52, 0), r, 0.03, c("#b8f4ff"), "xz", 40, 4)
    for i in range(20):
        ball(paint, arc(5.2, TAU * i / 20, 0.78), 0.2, BRASS, 0.8, 6, 3)
    rock(paint, (0, 0.1, 0), 2.0, 2.0, ROCK_DARK, 8, 0.2, 0.5)
    sword(paint, glow, look.light, 11.5, placed(0, 1.3, 0, tilt=0.0))
    for i, (bearing, size) in enumerate(((0.5, 3.4), (1.7, 2.8), (2.9, 3.8), (4.1, 2.6), (5.3, 3.2))):
        x, _, z = arc(3.3, bearing)
        sword(paint, glow, look.deep, size, placed(x, 0.05, z, turn=-bearing, tilt=0.22 if i % 2 else -0.2))
    for i in range(9):
        a = random.random() * TAU
        x, _, z = arc(random.uniform(2.2, 4.5), a)
        crystal(glow, (x, 0.4, z), random.uniform(0.14, 0.3), random.uniform(0.5, 1.3), c("#d6fbff"))
    for i in range(10):
        a = TAU * i / 10
        x, _, z = arc(4.6, a)
        sword(spin, spin, look.light, 2.5, placed(x, math.sin(a * 3) * 0.5 - 1.2, z, turn=-a))
    hoop(spin, (0, -0.1, 0), 4.6, 0.025, c("#b8f4ff"), "xz", 48, 4)
    return {"at": [0, 7.2, 0], "axis": "y", "speed": 0.35}


def pistols_mark(look, paint, glow, spin):
    """The Gunworks: a revolver drum as big as a mill wheel, under chimneys of brass."""
    lathe(paint, (0, 0, 0), [(5.4, 0), (5.2, 0.5), (4.9, 0.55)], IRON_DARK, 8)
    band(paint, 0.0, 4.95, 0.57, IRON, 8)
    hoop(glow, (0, 0.3, 0), 5.3, 0.06, look.light, "xz", 40, 4)
    box(paint, -3.0, 3.0, 0.55, 3.2, -3.2, -0.9, BASALT, BASALT_LIGHT)
    for x in (-2.0, 0.0, 2.0):
        box(glow, x - 0.55, x + 0.55, 1.0, 2.0, -0.92, -0.86, LAVA_ORANGE)
        for k in range(3):
            box(paint, x - 0.45 + k * 0.4, x - 0.35 + k * 0.4, 0.95, 2.05, -0.86, -0.78, IRON_DARK)
    for x, h in ((-2.4, 8.6), (2.4, 7.4), (0.0, 10.2)):
        lathe(paint, (x, 3.2, -2.3), [(0.75, 0), (0.55, 0.5), (0.5, h - 3.6), (0.72, h - 3.2)], BRASS_DARK, 8)
        for k in range(3):
            hoop(paint, (x, 4.4 + k * (h - 4.8) / 3, -2.3), 0.58, 0.09, BRASS, "xz", 12, 4)
        crystal(glow, (x, h, -2.3), 0.42, 1.2, LAVA_YELLOW)
    # The two posts that hold the drum, and the barrel behind it.
    for side in (-1, 1):
        beam(paint, (side * 3.7, 0.55, 0.2), (side * 2.9, 5.2, 0.2), 0.75, IRON, 0.5)
        beam(paint, (side * 2.9, 5.2, 0.2), (0, 5.2, -0.4), 0.35, IRON_LIGHT)
    cyl(paint, (0, 5.2, -4.2), 0.55, 3.6, STEEL_DARK, 10, "z")
    for z in (-4.2, -2.6):
        hoop(paint, (0, 5.2, z), 0.6, 0.12, BRASS, "xy", 14, 4)
    # Targets on posts.
    for x, z, h in ((-3.9, 2.4, 2.3), (3.8, 2.6, 1.8), (-1.9, 4.1, 1.3), (2.0, 4.0, 1.5)):
        cyl(paint, (x, 0.55, z), 0.09, h, WOOD, 6)
        for r, color, depth in ((0.72, WHITE, 0.0), (0.5, c("#e8434e"), 0.03), (0.26, WHITE, 0.06)):
            cyl(paint, (x, 0.55 + h + 0.5, z + depth), r, 0.09, color, 14, "z")
        ball(glow, (x, 0.55 + h + 0.5, z + 0.18), 0.1, look.light, 1.0, 6, 4)
    # Shells that lie about.
    for x, z in ((-0.5, 3.0), (0.6, 2.4), (0.1, 3.8)):
        cyl(paint, (x, 0.57, z), 0.22, 0.75, BRASS, 8)
        crystal(paint, (x, 1.32, z), 0.22, 0.4, c("#d98a5a"))
    lathe(spin, (0, 0, -0.7), [(2.0, 0), (2.35, 0.2), (2.35, 1.2), (2.0, 1.4)], STEEL, 12, "z")
    cyl(spin, (0, 0, 0.65), 0.45, 0.35, BRASS, 10, "z")
    hoop(spin, (0, 0, 0.2), 2.4, 0.1, BRASS_DARK, "xy", 24, 4)
    for i in range(6):
        a = TAU * i / 6
        x, y = 1.35 * math.cos(a), 1.35 * math.sin(a)
        cyl(spin, (x, y, 0.45), 0.52, 0.28, IRON_DARK, 10, "z")
        cyl(spin, (x, y, 0.7), 0.34, 0.08, BRASS if i % 2 else LAVA_ORANGE, 10, "z")
        beam(spin, (2.3 * math.cos(a + 0.52), 2.3 * math.sin(a + 0.52), -0.5), (2.3 * math.cos(a + 0.52), 2.3 * math.sin(a + 0.52), 0.5), 0.28, STEEL_DARK)
    return {"at": [0, 5.2, 0.2], "axis": "z", "speed": 0.7}


def fist(paint, glow, side, light):
    """A gauntlet as big as a house, with the knuckles down. Its zero point is below them."""
    box(paint, -1.25, 1.25, 0.75, 2.5, -1.2, 1.2, IRON, IRON_LIGHT)
    for k in range(4):
        x = -0.93 + k * 0.62
        box(paint, x - 0.27, x + 0.27, 0.05, 0.85, -0.35, 1.35, IRON_DARK, IRON)
        ball(paint, (x, 0.75, 1.3), 0.3, BRASS, 0.8, 6, 4)
        box(glow, x - 0.2, x + 0.2, 0.0, 0.06, -0.2, 1.2, light)
    box(paint, side * 1.2, side * 1.75, 0.6, 1.9, -0.2, 1.0, IRON_DARK, IRON)
    plate(glow, [(0, 2.2), (0.55, 1.6), (0, 1.0), (-0.55, 1.6)], 1.2, 1.28, light)
    lathe(paint, (0, 2.5, 0), [(1.15, 0), (1.45, 0.35), (1.3, 1.7), (1.55, 1.95)], BASALT_LIGHT, 8)
    hoop(paint, (0, 2.9, 0), 1.45, 0.13, BRASS, "xz", 16, 4)
    hoop(glow, (0, 3.9, 0), 1.38, 0.08, light, "xz", 16, 4)
    cyl(paint, (0, 4.4, 0), 0.5, 3.4, STEEL, 10)


def gauntlets_mark(look, paint, glow, spin):
    """The Piston Press: two fists as big as houses hammer the plate below, in turn."""
    lathe(paint, (0, 0, 0), [(5.4, 0), (5.15, 0.45), (4.9, 0.5)], BASALT_DARK, 8)
    band(paint, 0.0, 4.95, 0.52, BASALT, 8)
    hoop(glow, (0, 0.28, 0), 5.3, 0.06, look.light, "xz", 40, 4)
    for side in (-1, 1):
        x = side * 2.1
        lathe(paint, (x, 0.5, 0), [(1.9, 0), (1.75, 0.55), (1.55, 0.6)], IRON_DARK, 8)
        band(glow, 0.0, 1.0, 1.12, look.deep, 16, 0.0, TAU, (x, 0.0))
        for r in (1.15, 1.45):
            hoop(glow, (x, 1.13, 0), r, 0.05, look.light, "xz", 24, 4)
        for k in range(7):
            a = TAU * k / 7
            crystal(glow, (x + 1.75 * math.cos(a), 0.5, 1.75 * math.sin(a)), 0.13, 0.55, look.light)
        lathe(paint, (side * 4.3, 0.5, -1.7), [(0.8, 0), (0.5, 0.8), (0.45, 10.2), (0.7, 10.6)], BASALT, 6)
        for k in range(4):
            hoop(glow, (side * 4.3, 2.4 + k * 2.2, -1.7), 0.56, 0.05, look.light, "xz", 12, 4)
        crystal(glow, (side * 4.3, 11.2, -1.7), 0.5, 1.4, look.light)
        # The sleeve that the rod slides in.
        lathe(paint, (x, 10.0, 0), [(0.85, 0), (0.95, 1.5), (0.6, 1.9)], BRASS_DARK, 10)
        beam(paint, (x, 11.0, 0), (side * 4.3, 10.4, -1.7), 0.35, IRON)
        p, g = Shape(), Shape()
        fist(p, g, side, look.light)
        for target, part in zip(spin[0 if side < 0 else 1], (p, g)):
            merge(target, part, placed())
    beam(paint, (-4.3, 11.3, -1.7), (4.3, 11.3, -1.7), 0.6, IRON)
    plate(paint, [(0, 13.0), (1.1, 11.6), (-1.1, 11.6)], -2.0, -1.5, BRASS_DARK, BRASS)
    ball(glow, (0, 12.1, -1.45), 0.35, look.light, 1.0, 8, 5)
    return {"at": [2.1, 1.2, 0], "axis": "pump", "speed": 2.2}


def rectifier_mark(look, paint, glow, spin):
    """The Arcane Kiln: a crystal that burns without fire, inside rings that wander."""
    lathe(paint, (0, 0, 0), [(5.4, 0), (5.0, 0.4), (4.6, 0.45), (4.3, 0.9), (3.9, 0.95)], BASALT_DARK, 12)
    band(paint, 0.0, 3.95, 0.97, BASALT, 12)
    hoop(glow, (0, 0.2, 0), 5.28, 0.06, look.light, "xz", 40, 4)
    hoop(glow, (0, 0.68, 0), 4.48, 0.05, look.deep, "xz", 40, 4)
    hoop(glow, (0, 0.99, 0), 2.9, 0.05, look.light, "xz", 40, 4)
    for k in range(6):
        a = TAU * k / 6
        glow.tube([arc(2.9, a, 0.99), arc(2.9, a + TAU / 3, 0.99)], 0.035, look.light, 4)
        horn = [arc(4.7, a, 0.4), arc(4.9, a, 2.9), arc(3.9, a, 4.4)]
        paint.tube(horn, 0.27, IRON, 5)
        crystal(glow, (horn[-1][0], horn[-1][1] - 0.2, horn[-1][2]), 0.34, 1.2, look.light, (-horn[-1][0] * 0.1, -horn[-1][2] * 0.1))
    lathe(paint, (0, 0.97, 0), [(1.5, 0), (0.8, 0.7), (1.0, 1.5), (1.7, 2.0)], BRASS_DARK, 8)
    crystal(glow, (0, 3.0, 0), 1.5, 7.6, c("#d9b8ff"), (0.0, 0.0), 6)
    for k in range(5):
        a = TAU * k / 5 + 0.4
        x, _, z = arc(1.35, a)
        crystal(glow, (x, 2.8, z), 0.5, 2.6 + (k % 3) * 0.8, look.light, (x * 0.55, z * 0.55))
    for k, (radius, lean, color) in enumerate(((3.9, 0.45, BRASS), (3.3, -0.85, BRASS_PALE), (2.7, 1.35, BRASS_DARK))):
        ring = Shape()
        hoop(ring, (0, 0, 0), radius, 0.14, color, "xz", 48, 5)
        ball(ring, (radius, 0, 0), 0.45 - k * 0.07, look.light, 1.0, 8, 5)
        ball(ring, (-radius, 0, 0), 0.22, WHITE, 1.0, 6, 4)
        merge(spin, ring, placed(tilt=lean * 0.55, turn=k * 2.1))
    return {"at": [0, 6.4, 0], "axis": "y", "speed": 0.55}


MARKS = {
    "broadblade": broadblade_mark,
    "sword": sword_mark,
    "pistols": pistols_mark,
    "gauntlets": gauntlets_mark,
    "rectifier": rectifier_mark,
}


# ---------------------------------------------------------------- stands and the cavern


def stand(paint, glow):
    """The stand of one weapon. Its glow is white; the page paints it by the rarity."""
    lathe(paint, (0, 0, 0), [(0.66, 0), (0.6, 0.12), (0.36, 0.2), (0.34, 0.34), (0.5, STAND_TOP - 0.04)], BASALT_LIGHT, 8)
    band(paint, 0.0, 0.5, STAND_TOP - 0.04, IRON_DARK, 8)
    hoop(glow, (0, STAND_TOP - 0.02, 0), 0.47, 0.035, WHITE, "xz", 24, 4)
    hoop(glow, (0, 0.03, 0), 0.82, 0.025, WHITE, "xz", 32, 4)
    plate(glow, [(0, STAND_TOP + 0.0), (0.24, STAND_TOP - 0.01), (0, STAND_TOP - 0.02), (-0.24, STAND_TOP - 0.01)], -0.24, 0.24, WHITE)
    for k in range(4):
        a = TAU * (k + 0.5) / 4
        beam(paint, arc(0.78, a, 0.02), arc(0.45, a, STAND_TOP + 0.02), 0.1, BRASS_DARK, 0.06)
        crystal(glow, arc(0.46, a, STAND_TOP), 0.06, 0.2, WHITE)


def gear(paint, glow):
    """A wheel with teeth, flat in x and y, about 6 across."""
    teeth = 14
    outline = []
    for i in range(teeth):
        for share, r in ((0.0, 2.5), (0.15, 3.0), (0.5, 3.0), (0.65, 2.5)):
            a = TAU * (i + share) / teeth
            outline.append((r * math.cos(a), r * math.sin(a)))
    for a, b in zip(outline, outline[1:] + outline[:1]):
        ia, ib = (a[0] * 0.68, a[1] * 0.68), (b[0] * 0.68, b[1] * 0.68)
        plate(paint, [ia, a, b, ib], -0.35, 0.35, IRON, IRON_DARK)
    cyl(paint, (0, 0, -0.55), 0.62, 1.1, BRASS_DARK, 10, "z")
    for k in range(5):
        a = TAU * k / 5
        beam(paint, (0, 0, 0), (2.0 * math.cos(a), 2.0 * math.sin(a), 0), 0.4, IRON_LIGHT)
    hoop(glow, (0, 0, 0.4), 1.85, 0.07, LAVA_RED, "xy", 32, 4)


def hanging(paint, glow):
    """A long chain with a hook, which hangs from its zero point."""
    chain(paint, (0, 0, 0), (0, -16, 0), 0.42, IRON_LIGHT)
    lathe(paint, (0, -17.0, 0), [(0.2, 0), (0.55, 0.5), (0.35, 1.0)], IRON_DARK, 6)
    hoop(paint, (0, -17.6, 0), 0.65, 0.17, BRASS_DARK, "xy", 14, 5, math.pi * 0.85, math.pi * 1.45)
    crystal(glow, (0, -16.35, 0.5), 0.16, 0.42, LAVA_ORANGE)


def ladle(paint, glow):
    """A pot of molten metal under a trolley, which runs along the rail. Its zero is the rail."""
    box(paint, -0.9, 0.9, -0.2, 0.45, -0.6, 0.6, IRON, IRON_LIGHT)
    for x in (-0.55, 0.55):
        cyl(paint, (x, 0.45, -0.25), 0.32, 0.5, BRASS_DARK, 8, "z")
    for x in (-1.45, 1.45):
        chain(paint, (x * 0.4, -0.2, 0), (x, -3.3, 0), 0.22, IRON_LIGHT)
        ball(paint, (x * 1.08, -3.6, 0), 0.3, BRASS, 1.0, 6, 4)
    lathe(paint, (0, -5.3, 0), [(0.8, 0), (1.35, 0.5), (1.65, 2.1), (1.45, 2.15)], IRON_DARK, 10)
    hoop(paint, (0, -3.55, 0), 1.62, 0.15, BRASS_DARK, "xz", 20, 5)
    band(glow, 0.0, 1.46, -3.14, LAVA_YELLOW, 16)
    hoop(glow, (0, -3.12, 0), 1.2, 0.08, LAVA_ORANGE, "xz", 20, 4)
    hoop(glow, (0, -4.4, 0), 1.52, 0.08, LAVA_RED, "xz", 20, 4)


RAIL = {"radius": 24.0, "height": 19.0}


def rail(paint, glow):
    r, y = RAIL["radius"], RAIL["height"]
    hoop(paint, (0, y + 0.95, 0), r, 0.22, IRON, "xz", 96, 5)
    hoop(glow, (0, y + 1.22, 0), r, 0.06, LAVA_RED, "xz", 96, 4)
    # Chains hold it from the dark above.
    for i in range(12):
        x, _, z = arc(r, TAU * (i + 0.5) / 12)
        chain(paint, (x, y + 1.1, z), (x, y + 22, z), 0.4, IRON_DARK, 22)


CAVE = 92.0


def cave(paint, glow, falls):
    """The rock around everything, with pillars in the lava and spikes above."""
    for layer, (radius, count, height) in enumerate(((CAVE, 62, (22, 46)), (CAVE + 12, 46, (42, 70)))):
        for i in range(count):
            a = TAU * (i + layer * 0.5) / count + random.uniform(-0.02, 0.02)
            x, _, z = arc(radius + random.uniform(-3, 3), a)
            h = random.uniform(*height)
            rock(paint, (x, LAVA - 2, z), random.uniform(6.0, 9.5), h, ROCK_DARK if (i + layer) % 3 else ROCK, 6, 0.3, 0.35)
            if i % 7 == 3 and layer == 0:
                for k in range(3):
                    px, _, pz = arc(radius - 8.2, a + random.uniform(-0.04, 0.04))
                    crystal(glow, (px, random.uniform(0, 12), pz), random.uniform(0.35, 0.8), random.uniform(2, 4.5), LAVA_ORANGE, (-px * 0.02, -pz * 0.02))
    # The mouths that the lava falls out of.
    for bearing, radius, top, wide in falls:
        x, _, z = arc(radius + 0.9, bearing)
        mouth = Shape()
        lathe(mouth, (0, 0, 0), [(wide * 0.75, -1.8), (wide * 0.72, 0.2), (wide * 0.5, 0.5)], ROCK_WARM, 8, "z")
        move = placed(x, top + 0.6, z, turn=-bearing)
        merge(paint, mouth, move)
        for side in (-1, 1):
            px, _, pz = arc(radius - 0.5, bearing + side * (wide * 0.62 / radius))
            rock(paint, (px, LAVA - 1, pz), 2.2, top - LAVA + 2.4, ROCK, 5, 0.3, 0.3)
    # Pillars in the lake, between the forges.
    for bearing in (-150, -90, -30, 30, 90, 150):
        for k, (far, r, h) in enumerate(((56, 4.2, 27), (64, 2.8, 17), (50, 1.8, 6))):
            x, _, z = arc(far, math.radians(bearing + (k - 1) * 9))
            rock(paint, (x, LAVA - 1.5, z), r, h, ROCK if k else ROCK_WARM, 7, 0.25, 0.3)
            glow.tube([(x + r * 0.95 * math.cos(TAU * i / 10), LAVA + 0.35, z + r * 0.95 * math.sin(TAU * i / 10)) for i in range(11)], 0.22, LAVA_YELLOW, 4)
    # Small rocks that float in the lake.
    for i in range(70):
        a, far = random.random() * TAU, random.uniform(15, 86)
        x, _, z = arc(far, a)
        rock(paint, (x, LAVA - 0.6, z), random.uniform(0.5, 1.8), random.uniform(0.9, 2.0), ROCK_DARK, 5, 0.35, 0.4)
    # Spikes that hang from the roof, away from the middle.
    for i in range(110):
        a, far = random.random() * TAU, random.uniform(34, 86)
        x, _, z = arc(far, a)
        y = random.uniform(40, 52)
        rock(paint, (x, y, z), random.uniform(1.4, 4.2), -random.uniform(5, 17), ROCK_DARK if i % 3 else ROCK, 5, 0.25, 0.03)


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
    # The same cavern at every run.
    random.seed(23)
    names = ("foundry_", "hub_", "entry_", "bridge_", "cave_", "rail_", "deck_", "mark_", "rotor_", "smith_", "hammer_", "blade_", "plinth_", "gear_", "chain_", "ladle_")
    scene = make_scene("Solaris_Foundry", names)
    lit = make_material("foundry_paint")
    shine = make_material("foundry_glow")
    # Only for the pictures taken in Blender; the page draws these meshes unlit.
    shader = next(n for n in shine.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    source = next(n for n in shine.node_tree.nodes if n.type == "VERTEX_COLOR")
    shine.node_tree.links.new(source.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 1.0

    pieces = {}

    def piece(name):
        pieces[name] = (Shape(), Shape())
        return pieces[name]

    hub(*piece("hub"))
    entry(*piece("entry"))
    bridge(*piece("bridge"))
    smith(*piece("smith"))
    hammer(*piece("hammer"))
    blade(*piece("blade"))
    stand(*piece("plinth"))
    gear(*piece("gear"))
    hanging(*piece("chain"))
    ladle(*piece("ladle"))
    rail(*piece("rail"))
    # Bearing, how far, how high and how wide; the page draws the falling lava itself.
    falls = [
        [round(math.radians(b), 4), CAVE - 10, top, wide]
        for b, top, wide in ((-148, 20, 5.0), (-92, 27, 7.0), (-33, 22, 4.5), (28, 30, 8.0), (86, 18, 5.0), (151, 25, 6.0))
    ]
    cave(*piece("cave"), falls)

    spins = {}
    for kind, _ in KINDS:
        look = LOOKS[kind]
        deck(kind, look, *piece(f"deck_{kind}"))
        paint, glow = piece(f"mark_{kind}")
        if kind == "gauntlets":
            # The two fists move on their own.
            left, right = (Shape(), Shape()), (Shape(), Shape())
            spins[kind] = MARKS[kind](look, paint, glow, (left, right))
            pieces["rotor_gauntlets_left"], pieces["rotor_gauntlets_right"] = left, right
        else:
            part = Shape()
            spins[kind] = MARKS[kind](look, paint, glow, part)
            # The moving part of the anvil yard and the drum are lit; the rest shine.
            lit_part = kind in ("broadblade", "pistols")
            pieces[f"rotor_{kind}"] = (part, Shape()) if lit_part else (Shape(), part)

    for name, (paint, glow) in pieces.items():
        for shape, material, tone in ((paint, lit, "paint"), (glow, shine, "glow")):
            if shape.faces:
                to_blender(shape)
                add(scene, material, f"{name}_{tone}", shape)

    layout = {
        "hub": HUB,
        "bridge": BRIDGE,
        "forge": FORGE,
        "bearings": {kind: round(math.radians(b), 4) for kind, b in KINDS},
        "landing": LANDING,
        "lava": LAVA,
        "standTop": STAND_TOP,
        "shoulder": SHOULDER,
        "anvil": ANVIL,
        "spins": spins,
        "rail": RAIL,
        "falls": falls,
        "cave": CAVE,
        # Wheels on the walls: x, y, z, turn about y, size and speed.
        "gears": [
            [round(v, 3) for v in (*arc(far, math.radians(b), y), -math.radians(b), size, speed)]
            for b, far, y, size, speed in (
                (-62, 80, 14, 2.4, 0.22), (-54, 79, 25, 1.4, -0.38), (4, 81, 20, 3.0, 0.16), (14, 80, 8, 1.6, -0.3),
                (58, 80, 11, 2.0, -0.25), (122, 81, 17, 2.6, 0.2), (-118, 80, 10, 1.8, -0.28), (-176, 81, 22, 2.8, 0.18),
            )
        ],
        # Hanging chains: x, y, z of the top.
        "chains": [
            [round(v, 2) for v in arc(far, math.radians(b), y)]
            for b, far, y in ((-30, 19, 30), (30, 21, 33), (-90, 20, 27), (90, 18, 31), (-150, 23, 29), (150, 22, 34), (-6, 62, 36), (48, 58, 30), (-104, 60, 34), (131, 63, 28))
        ],
    }

    # With the default bits, points this far from zero move by centimeters, and flat things on
    # the ground then flicker through it.
    bits = meshopt.EXP_FILTER_BITS
    meshopt.EXP_FILTER_BITS = 17
    weld(scene)
    try:
        os.makedirs(FOLDER, exist_ok=True)
        # The page works out the flat normals itself, which halves the file.
        export(os.path.join(FOLDER, "foundry.glb"), normals=False)
    finally:
        meshopt.EXP_FILTER_BITS = bits

    with open(os.path.join(FOLDER, "foundry.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(layout, handle, indent=2)
        handle.write("\n")

    arrange(scene, layout)
    print("[foundry] done")


def arrange(scene, layout):
    """After the export, lays the foundry out in Blender, so the pictures taken there show it.
    The file keeps every part around its zero point."""
    from mathutils import Euler, Vector

    objects = {obj.name: obj for obj in scene.collection.objects}
    used = set()

    def place(name, at=(0.0, 0.0, 0.0), turn=0.0, scale=1.0, offset=(0.0, 0.0, 0.0)):
        """"turn" is about the up axis of the page; "offset" is turned along with it."""
        for tone in ("paint", "glow"):
            obj = objects.get(f"{name}_{tone}")
            if not obj:
                continue
            if obj.name in used:
                obj = obj.copy()
                obj.name = f"{name}_{tone}_show"
                scene.collection.objects.link(obj)
            used.add(f"{name}_{tone}")
            rotation = Euler((0.0, 0.0, turn))
            ox, oy, oz = offset
            moved = rotation.to_matrix() @ Vector((ox, -oz, oy))
            obj.rotation_euler = rotation
            obj.location = Vector((at[0], -at[2], at[1])) + moved
            obj.scale = (scale, scale, scale)

    for name in ("hub", "entry", "smith", "hammer", "blade", "cave", "rail"):
        place(name, SHOULDER if name == "hammer" else (0, 0, 0))
    for kind, bearing in KINDS:
        a = math.radians(bearing)
        middle = arc(FORGE["far"], a)
        place("bridge", turn=-a)
        place(f"deck_{kind}", middle, -a)
        place(f"mark_{kind}", middle, -a)
        at = layout["spins"][kind]["at"]
        if kind == "gauntlets":
            for side, label, lift in ((-1, "left", 3.4), (1, "right", 0.3)):
                place(f"rotor_{kind}_{label}", middle, -a, offset=(side * at[0], at[1] + lift, at[2]))
        else:
            place(f"rotor_{kind}", middle, -a, offset=tuple(at))
        for k in range(14):
            phi = FORGE["gap"] + (k + 0.5) * (TAU - 2 * FORGE["gap"]) / 14
            local = (FORGE["stands"] * math.sin(phi), 0.0, FORGE["stands"] * math.cos(phi))
            place("plinth", middle, -a, offset=local)
    for x, y, z, turn, size, _ in layout["gears"]:
        place("gear", (x, y, z), turn, size)
    for spot in layout["chains"]:
        place("chain", spot)
    for k in range(5):
        a = TAU * k / 5 + 0.6
        place("ladle", arc(RAIL["radius"], a, RAIL["height"]), -a + math.pi / 2)
    bpy.context.view_layer.update()


main()
