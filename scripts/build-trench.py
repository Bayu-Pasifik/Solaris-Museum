"""Builds the Drowned Archive, the walk of the Document Archive over the floor of the sea. Writes
src/assets/documents/trench.glb and src/assets/documents/trench.json.

    blender --background --factory-startup --python scripts/build-trench.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Trench", and
leaves every other scene alone. The model is original low-poly work and holds no game assets.

Every kind of document has its own depth: a meadow of bottled letters in the sunlit shallows, a
reef where clams keep the pictures, a grotto where gramophones in shells keep the recordings,
and an abyss where steles keep the text of unknown origin. A path winds through each. The page
lays one tile of the sea floor after the other along it, puts a stand there for every document,
and ends the path at a landmark.

Positions in this script and in the JSON file are those of the page: x to the right, y up and z
toward the visitor. "blender" turns them into Blender's coordinates. The way walked is "s",
which is -z. "center" and "ground" are also in src/lib/trench.ts; change them together.

The meshes are painted with vertex colors. A name ends in what the page does with the mesh:
"_paint" is lit, "_sway" is lit and moves with the water, "_glow" shines by itself, "_glass" is
clear, "_move" turns or lifts about the pivot that the JSON file gives, and "_beam" is light
that adds to what is behind it.
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
FOLDER = os.path.join(ROOT, "src", "assets", "documents")

# One tile of the sea floor, and one swing of the path from side to side, in meters.
TILE = 64.0
WAVE = 32.0
AMP = 3.5
# How far from the middle of the path a visitor can walk, and where the stands are.
WALK = 4.8
STAND = 3.7
# Half the width of a tile, and where the banks begin to rise.
WIDE = 34.0
BANK = 5.6

ZONES = ("text", "picture", "record", "foreign")


def c(color):
    return linear(color)


def mix(a, b, share):
    share = min(max(share, 0.0), 1.0)
    return [x + (y - x) * share for x, y in zip(a, b)]


def v(x, y, z):
    return Vector((x, y, z))


INK = c("#10233f")
WHITE = c("#ffffff")
PAPER = c("#fff3d6")
GOLD = (c("#ffd45a"), c("#e5a62f"), c("#fff0a8"))
BRASS = (c("#e8b558"), c("#b97f2e"), c("#ffdc8a"))
WOOD = (c("#a56b46"), c("#7c4a30"), c("#c9905c"))
RED = (c("#ff6b5e"), c("#d8423c"), c("#ff9a86"))
CYAN = c("#6df4ff")
LIME = c("#b8ff9a")
PINK = c("#ff7ec1")
VIOLET = c("#b48cff")
AMBER = c("#ffc04a")

# The floor of every depth: the path, the sand beside it and the high ground of the banks.
SAND = {
    "text": ("#ffeeb8", "#e9cf8e", "#5f9c8a"),
    "picture": ("#ffe3cc", "#f0b4a0", "#8c5c9c"),
    "record": ("#c9b4f2", "#8d74c4", "#3c2c70"),
    "foreign": ("#59648c", "#2e3658", "#111731"),
}
ROCKS = {
    "text": ("#4f8f88", "#3b7274", "#6aaa98"),
    "picture": ("#b0698f", "#8a4c80", "#d18aa0"),
    "record": ("#5e4a9c", "#46357c", "#7a66b8"),
    "foreign": ("#232c4e", "#1a213e", "#303c66"),
}


# ---------------------------------------------------------------- the ground


def center(s):
    """The middle of the path, "s" meters along it."""
    return AMP * math.sin(TAU * s / WAVE)


def base(s):
    """The height of the path. It is the same across it, so a walker never leans."""
    return 0.18 * math.sin(TAU * s / 16)


def ground(x, s):
    """The height of the sea floor. It repeats after every tile."""
    away = abs(x - center(s)) - BANK
    if away <= 0:
        return base(s)
    rough = 0.35 * math.sin(x * 0.9 + TAU * 3 * s / TILE) + 0.5 * math.sin(x * 0.37 - TAU * 7 * s / TILE)
    return base(s) + 0.2 * away**1.3 + rough * min(away / 3, 1)


# ---------------------------------------------------------------- shapes, with y up


def quad_strip(shape, low, high, color):
    """The band between two rings with the same number of points. "color" may be a function."""
    count = len(low)
    for i in range(count):
        j = (i + 1) % count
        shade = color(i) if callable(color) else color[i % len(color)] if isinstance(color, tuple) else color
        shape.face([low[i], low[j], high[j], high[i]], shade)


def toward(a, b):
    """The rotation that turns the y axis along the line from "a" to "b"."""
    return v(0, 1, 0).rotation_difference((Vector(b) - Vector(a)).normalized()).to_matrix()


def ring(matrix, y, rx, rz, sides, phase=0.0):
    return [matrix @ v(rx * math.cos(TAU * i / sides + phase), y, rz * math.sin(TAU * i / sides + phase)) for i in range(sides)]


def lathe(shape, at, profile, color, sides=12, turn=None, cap=True, squash=1.0):
    """A round thing along y: "profile" lists (radius, height). "color" may be one for every band."""
    matrix = Matrix.Translation(Vector(at)) @ (turn or Matrix.Identity(3)).to_4x4()
    rings = [ring(matrix, y, max(r, 0.003), max(r, 0.003) * squash, sides) for r, y in profile]
    for k, (low, high) in enumerate(zip(rings, rings[1:])):
        shade = color(k) if callable(color) else color
        quad_strip(shape, low, high, shade)
    if cap:
        first = color(0) if callable(color) else color
        last = color(len(rings) - 2) if callable(color) else color
        shape.face(rings[0][::-1], first[0] if isinstance(first, tuple) else first)
        shape.face(rings[-1], last[0] if isinstance(last, tuple) else last)


def rod(shape, a, b, low, high, color, sides=7):
    """A round bar from "a" to "b", "low" thick at its start and "high" at its end."""
    a, b = Vector(a), Vector(b)
    lathe(shape, a, [(low, 0.0), (high, (b - a).length)], color, sides, toward(a, b))


def tube(shape, points, radii, color, sides=6):
    """A round line through "points" with a thickness at each of them."""
    points = [Vector(p) for p in points]
    rings = []
    side = v(1, 0, 0)
    for k, point in enumerate(points):
        along = (points[min(k + 1, len(points) - 1)] - points[max(k - 1, 0)]).normalized()
        # The side is carried along the line, so the tube does not twist.
        side = side - along * side.dot(along)
        if side.length < 1e-4:
            side = v(0, 0, 1) - along * along.z
        side.normalize()
        other = along.cross(side)
        r = max(radii[k], 0.003)
        rings.append([point + (side * math.cos(TAU * i / sides) + other * math.sin(TAU * i / sides)) * r for i in range(sides)])
    for k, (low, high) in enumerate(zip(rings, rings[1:])):
        quad_strip(shape, low, high, color(k) if callable(color) else color)
    shade = color(0) if callable(color) else color
    shape.face(rings[0][::-1], shade[0] if isinstance(shade, tuple) else shade)
    shape.face(rings[-1], shade[0] if isinstance(shade, tuple) else shade)


def ball(shape, at, radii, color, sides=10, rows=7, turn=None, rough=0.0):
    if isinstance(radii, (int, float)):
        radii = (radii,) * 3
    matrix = Matrix.Translation(Vector(at)) @ (turn or Matrix.Identity(3)).to_4x4()
    rings = []
    for k in range(rows + 1):
        lift = math.pi * k / rows
        r = max(math.sin(lift), 0.004)
        points = []
        for i in range(sides):
            bump = 1 + random.uniform(-rough, rough) if 0 < k < rows else 1
            points.append(
                matrix
                @ v(
                    radii[0] * r * math.cos(TAU * i / sides) * bump,
                    -radii[1] * math.cos(lift) * bump,
                    radii[2] * r * math.sin(TAU * i / sides) * bump,
                )
            )
        rings.append(points)
    for k, (low, high) in enumerate(zip(rings, rings[1:])):
        quad_strip(shape, low, high, color(k) if callable(color) else color)


def box(shape, at, size, color, turn=None):
    w, h, d = (value / 2 for value in size)
    matrix = Matrix.Translation(Vector(at)) @ (turn or Matrix.Identity(3)).to_4x4()
    verts = [matrix @ v(x, y, z) for y in (-h, h) for x, z in ((-w, -d), (w, -d), (w, d), (-w, d))]
    faces = [(0, 1, 2, 3), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0), (7, 6, 5, 4)]
    for index, face in enumerate(faces):
        shade = color[index % len(color)] if isinstance(color, tuple) else color
        shape.face([verts[i] for i in face], shade)


def hoop(shape, at, radius, thick, color, turn=None, steps=24, start=0.0, span=TAU):
    """A torus, or a part of it, that stands in the plane of x and y."""
    matrix = Matrix.Translation(Vector(at)) @ (turn or Matrix.Identity(3)).to_4x4()
    points = [
        matrix @ v(radius * math.cos(start + span * i / steps), radius * math.sin(start + span * i / steps), 0)
        for i in range(steps + 1)
    ]
    tube(shape, points, [thick] * len(points), color, 5)


def spin_y(angle):
    return Matrix.Rotation(angle, 3, "Y")


def spin_x(angle):
    return Matrix.Rotation(angle, 3, "X")


def spin_z(angle):
    return Matrix.Rotation(angle, 3, "Z")


# ---------------------------------------------------------------- things of the sea


def rock(shape, at, size, tones):
    shades = tuple(c(tone) for tone in tones)
    ball(shape, at, (size, size * random.uniform(0.55, 0.95), size * random.uniform(0.7, 1.2)), shades, 7, 5,
         spin_y(random.uniform(0, TAU)), rough=0.22)


def blade(shape, at, height, width, lean, facing, low, high, parts=5):
    """A flat leaf that grows up from "at" and bends over."""
    at = Vector(at)
    across = spin_y(facing) @ v(1, 0, 0)
    ahead = spin_y(facing) @ v(0, 0, 1)
    rows = []
    for k in range(parts + 1):
        t = k / parts
        spine = at + v(0, height * t, 0) + ahead * (lean * t * t) + across * (math.sin(t * 5 + facing) * width * 0.6)
        half = width * (1 - t**2.5) / 2 + 0.004
        rows.append((spine - across * half, spine + across * half))
    for k, (a, b) in enumerate(zip(rows, rows[1:])):
        shape.face([a[0], a[1], b[1], b[0]], mix(low, high, k / parts))


def grass(shape, at, tones, blades=7, height=1.4):
    for _ in range(blades):
        offset = v(random.uniform(-0.35, 0.35), -0.05, random.uniform(-0.35, 0.35))
        blade(shape, Vector(at) + offset, height * random.uniform(0.5, 1.1), 0.14, random.uniform(0.1, 0.6),
              random.uniform(0, TAU), c(tones[0]), c(tones[1]))


def kelp(shape, at, height, tones):
    at = Vector(at)
    phase = random.uniform(0, TAU)
    stem = [at + v(math.sin(phase + k * 0.7) * 0.25, height * k / 12, math.cos(phase + k * 0.5) * 0.25) for k in range(13)]
    tube(shape, stem, [0.12 - 0.007 * k for k in range(13)], c(tones[0]), 5)
    for k in range(2, 13):
        for side in (0, 1):
            facing = phase + k * 1.9 + side * math.pi
            tip = stem[k] + spin_y(facing) @ v(0.95, 0.35, 0)
            middle = stem[k].lerp(tip, 0.5)
            across = spin_y(facing) @ v(0, 0.24, 0.1)
            shape.face([stem[k], middle - across, tip, middle + across], mix(c(tones[1]), c(tones[2]), k / 12))


def starfish(shape, at, size, color):
    x, y, z = at
    turn = random.uniform(0, TAU)
    rim = []
    for i in range(10):
        r = size if i % 2 == 0 else size * 0.38
        rim.append((x + r * math.cos(turn + TAU * i / 10), y + 0.03, z + r * math.sin(turn + TAU * i / 10)))
    top = (x, y + size * 0.28, z)
    for i in range(10):
        shape.face([top, rim[i], rim[(i + 1) % 10]], mix(color, WHITE, 0.25 if i % 2 else 0.0))


def scallop(shape, at, size, color, tilt=0.15, facing=None):
    """A fan shell that lies on the sand."""
    at = Vector(at)
    turn = spin_y(random.uniform(0, TAU) if facing is None else facing) @ spin_x(-tilt)
    hinge = at + v(0, 0.03, 0)
    rim = []
    for i in range(13):
        a = math.radians(-70 + 140 * i / 12)
        r = size * (1.0 if i % 2 == 0 else 0.9)
        rim.append(hinge + turn @ v(r * math.sin(a), (0.16 if i % 2 else 0.04) * size, -r * math.cos(a)))
    for i in range(12):
        shape.face([hinge, rim[i], rim[i + 1]], mix(color, WHITE, 0.4 if i % 2 else 0.05))


def urchin(shape, glow, at, size, color, tip):
    ball(shape, at, size * 0.45, color, 8, 5)
    for k in range(26):
        way = v(random.gauss(0, 1), abs(random.gauss(0, 1)), random.gauss(0, 1)).normalized()
        end = Vector(at) + way * size
        rod(shape, at, end, 0.03, 0.006, color, 3)
        if k % 3 == 0:
            ball(glow, end, 0.025, tip, 4, 3)


def message(shape, at, size):
    """A small bottle that washed down and lies half in the sand."""
    turn = spin_y(random.uniform(0, TAU)) @ spin_z(math.pi / 2 - random.uniform(0.15, 0.5))
    green = (c("#7fd6a8"), c("#52b58c"))
    lathe(shape, at, [(0.12 * size, 0), (0.16 * size, 0.06 * size), (0.16 * size, 0.45 * size),
                      (0.06 * size, 0.6 * size), (0.06 * size, 0.74 * size)], green, 8, turn)
    cork = Vector(at) + turn @ v(0, 0.74 * size, 0)
    rod(shape, cork, cork + turn @ v(0, 0.09 * size, 0), 0.07 * size, 0.07 * size, c("#c98d52"), 6)


def books(shape, at, count):
    y = at[1]
    for _ in range(count):
        tall = random.uniform(0.14, 0.28)
        color = c(random.choice(("#c4554d", "#3f6fb0", "#3f9472", "#d99a3c", "#7a55a8")))
        turn = spin_y(random.uniform(-0.5, 0.5))
        box(shape, (at[0], y + tall / 2, at[2]), (1.1, tall, 0.8), color, turn)
        box(shape, (at[0], y + tall / 2, at[2]), (1.14, tall * 0.62, 0.72), PAPER, turn)
        y += tall


def anchor(shape, at, size, turn):
    iron = (c("#41556b"), c("#2f3f55"), c("#5b7488"))
    def p(x, y):
        return Vector(at) + turn @ (v(x, y, 0) * size)
    rod(shape, p(0, 0), p(0, 3), 0.16 * size, 0.13 * size, iron)
    rod(shape, p(-0.9, 2.5), p(0.9, 2.5), 0.1 * size, 0.1 * size, iron)
    hoop(shape, p(0, 3.35), 0.38 * size, 0.09 * size, iron, turn, 14)
    hoop(shape, p(0, 1.3), 1.4 * size, 0.15 * size, iron, turn, 16, math.pi * 1.15, math.pi * 0.7)
    for side in (-1, 1):
        a = math.pi * 1.5 + side * math.pi * 0.35
        end = p(1.4 * math.cos(a), 1.3 + 1.4 * math.sin(a))
        rod(shape, end, end + turn @ (v(side * 0.15, 0.7, 0) * size), 0.28 * size, 0.01, iron, 4)


def mast(shape, sway, at, turn):
    def p(x, y, z=0.0):
        return Vector(at) + turn @ v(x, y, z)
    rod(shape, p(0, 0), p(0, 9), 0.32, 0.2, WOOD, 8)
    rod(shape, p(-2.6, 7.4), p(2.6, 7.4), 0.14, 0.14, WOOD)
    rod(shape, p(-1.7, 5.0), p(1.4, 5.2), 0.11, 0.11, WOOD)
    # A torn sail, in strips of different lengths.
    for k in range(10):
        x = -2.4 + 0.48 * k
        low = 7.3 - random.uniform(0.7, 2.8)
        sway.face([p(x, 7.3), p(x + 0.46, 7.3), p(x + 0.44, low + random.uniform(-0.3, 0.3), 0.25), p(x + 0.05, low, 0.2)],
                  mix(PAPER, c("#c9b48c"), random.random()))


def branches(shape, glow, at, way, length, thick, depth, color, tip):
    """Coral that forks again and again."""
    at = Vector(at)
    end = at + way * length
    rod(shape, at, end, thick, thick * 0.7, color, 5)
    if depth == 0:
        ball(glow, end, thick * 0.9, tip, 5, 4)
        return
    for _ in range(2 if depth > 1 else 3):
        spread = v(random.uniform(-1, 1), random.uniform(0.1, 0.9), random.uniform(-1, 1))
        branches(shape, glow, end, (way + spread * 0.75).normalized(), length * 0.76, thick * 0.68, depth - 1, color, tip)


def brain(shape, at, size, color):
    pale = mix(color, WHITE, 0.45)
    ball(shape, at, (size, size * 0.72, size), lambda k: (color, pale), 16, 10, rough=0.07)


def fan(sway, at, size, color, facing):
    at = Vector(at)
    turn = spin_y(facing)
    def p(a, r):
        return at + turn @ v(math.sin(a) * r, math.cos(a) * r + 0.35, math.sin(a * 4 + r * 3) * 0.05)
    rod(sway, at, p(0, 0.15), 0.09, 0.06, color, 4)
    spokes = 11
    for i in range(spokes):
        a = -1.25 + 2.5 * i / (spokes - 1)
        reach = size * (1.0 - 0.25 * abs(a))
        tube(sway, [p(0, 0), p(a * 0.7, reach * 0.5), p(a, reach)], [0.06, 0.035, 0.012], color, 4)
        if i:
            before = -1.25 + 2.5 * (i - 1) / (spokes - 1)
            for share in (0.45, 0.68, 0.9):
                tube(sway, [p(before, size * (1.0 - 0.25 * abs(before)) * share), p(a, reach * share)], [0.014, 0.014],
                     mix(color, WHITE, 0.3), 3)


def sponges(shape, at, tones):
    for _ in range(random.randint(3, 5)):
        offset = v(random.uniform(-0.6, 0.6), -0.1, random.uniform(-0.6, 0.6))
        start = Vector(at) + offset
        high = random.uniform(0.6, 2.2)
        r = random.uniform(0.16, 0.32)
        color = c(random.choice(tones))
        lean = spin_z(random.uniform(-0.2, 0.2)) @ spin_x(random.uniform(-0.2, 0.2))
        lathe(shape, start, [(r * 0.7, 0), (r, high * 0.6), (r * 1.15, high)], color, 9, lean, cap=False)
        lathe(shape, start, [(r * 1.15, high), (r * 0.8, high + 0.03), (r * 0.55, high - 0.35)],
              mix(color, INK, 0.5), 9, lean, cap=False)


def reel(shape, at, size, turn):
    steel = (c("#cdd8ea"), c("#8e9fbd"))
    for depth in (-0.12, 0.12):
        offset = Vector(at) + turn @ v(0, 0, depth * size)
        hoop(shape, offset, size, 0.09 * size, steel, turn, 20)
        for k in range(5):
            a = TAU * k / 5
            rod(shape, offset, offset + turn @ v(math.cos(a) * size, math.sin(a) * size, 0), 0.07 * size, 0.05 * size, steel, 4)
    rod(shape, Vector(at) + turn @ v(0, 0, -0.2 * size), Vector(at) + turn @ v(0, 0, 0.2 * size),
        0.3 * size, 0.3 * size, c("#31405e"), 10)


def filmstrip(shape, glow, points, width, facing):
    """A band of film along "points", with a lit picture in every part of it."""
    for k, (a, b) in enumerate(zip(points, points[1:])):
        a, b = Vector(a), Vector(b)
        up = facing(a) * (width / 2)
        shape.face([a - up, b - up, b + up, a + up], c("#1a1c33"))
        inner = [a.lerp(b, 0.14) - up * 0.55, a.lerp(b, 0.86) - up * 0.55, a.lerp(b, 0.86) + up * 0.55, a.lerp(b, 0.14) + up * 0.55]
        out = (b - a).cross(up).normalized() * 0.015
        for lift in (out, -out):
            glow.face([p + lift for p in inner], (AMBER, CYAN, PINK, LIME)[k % 4])


def nautilus(shape, at, size, turn, pale, dark):
    """A shell that winds in on itself."""
    steps = 38
    points, radii = [], []
    for k in range(steps):
        a = k * 0.3
        grow = math.exp(0.135 * a)
        reach = size * 0.1 * grow
        points.append(Vector(at) + turn @ v(math.cos(a) * reach, math.sin(a) * reach, 0))
        radii.append(size * 0.058 * grow)
    tube(shape, points, radii, lambda k: pale if k % 4 else dark, 10)
    mouth = points[-1]
    along = (points[-1] - points[-2]).normalized()
    ball(shape, mouth - along * radii[-1] * 0.35, radii[-1] * 0.78, mix(dark, INK, 0.5), 10, 6)


def crystal(shape, at, size, high, color, turn):
    lathe(shape, at, [(size * 0.8, 0), (size, high * 0.75), (0.0, high)],
          (color, mix(color, WHITE, 0.5), mix(color, INK, 0.25)), 6, turn)


def disc(shape, at, size, turn, label):
    black = (c("#17142e"), c("#221d40"))
    lathe(shape, at, [(size, 0), (size, 0.05 * size)], black, 20, turn)
    for r, tone in ((0.82, "#3a3462"), (0.62, "#3a3462")):
        hoop(shape, Vector(at) + turn @ v(0, 0.056 * size, 0), size * r, 0.008 * size, c(tone), turn @ spin_x(math.pi / 2))
    lathe(shape, Vector(at) + turn @ v(0, 0.05 * size, 0), [(size * 0.36, 0), (size * 0.36, 0.02)], label, 14, turn)
    lathe(shape, Vector(at) + turn @ v(0, 0.07 * size, 0), [(size * 0.06, 0), (size * 0.06, 0.04)], PAPER, 6, turn)


def note(shape, at, size, color):
    """A pair of notes."""
    x, y, z = at
    for dx, dy in ((0.0, 0.0), (0.75, 0.2)):
        head = v(x + dx * size, y + dy * size, z)
        ball(shape, head, (0.28 * size, 0.2 * size, 0.2 * size), color, 8, 5, spin_z(0.5))
        rod(shape, head + v(0.22 * size, 0, 0), head + v(0.22 * size, 1.1 * size, 0), 0.04 * size, 0.04 * size, color, 4)
    rod(shape, v(x + 0.22 * size, y + 1.08 * size, z), v(x + 0.97 * size, y + 1.28 * size, z), 0.09 * size, 0.09 * size, color, 4)


def anemone(sway, glow, at, size, color, tip):
    lathe(sway, at, [(size * 0.45, -0.1), (size * 0.34, size * 0.35)], mix(color, INK, 0.35), 9)
    for k in range(18):
        a = TAU * k / 18 + random.uniform(-0.1, 0.1)
        start = Vector(at) + v(math.cos(a) * size * 0.2, size * 0.3, math.sin(a) * size * 0.2)
        middle = start + v(math.cos(a) * size * 0.35, size * random.uniform(0.35, 0.6), math.sin(a) * size * 0.35)
        end = middle + v(math.cos(a) * size * 0.3, size * random.uniform(0.0, 0.4), math.sin(a) * size * 0.3)
        tube(sway, [start, middle, end], [0.07 * size, 0.05 * size, 0.025 * size], color, 4)
        ball(glow, end, 0.045 * size, tip, 4, 3)


def glyph(glow, at, size, color, turn):
    """A letter of no known alphabet: a few strokes on a grid of three by three."""
    spots = [(x, y) for x in (-1, 0, 1) for y in (-1, 0, 1)]
    for _ in range(random.randint(3, 4)):
        a, b = random.sample(spots, 2)
        start = Vector(at) + turn @ v(a[0] * size / 2, a[1] * size / 2, 0)
        end = Vector(at) + turn @ v(b[0] * size / 2, b[1] * size / 2, 0)
        rod(glow, start, end, size * 0.07, size * 0.07, color, 3)


def column(shape, at, high, tones):
    stone = tuple(c(tone) for tone in tones)
    x, y, z = at
    box(shape, (x, y + 0.2, z), (1.9, 0.4, 1.9), stone)
    done = 0.4
    while done < high:
        part = min(random.uniform(0.9, 1.5), high - done)
        shift = v(random.uniform(-0.06, 0.06), 0, random.uniform(-0.06, 0.06))
        lathe(shape, v(x, y + done, z) + shift, [(0.62, 0), (0.58, part - 0.04)], (stone[0], stone[1]), 12)
        done += part


def vent(shape, glow, at, size):
    lathe(shape, at, [(size, -0.2), (size * 0.55, size), (size * 0.32, size * 2.1)], (c("#2a2038"), c("#1c172c")), 8, cap=False)
    lathe(glow, at, [(size * 0.33, size * 2.06), (size * 0.06, size * 2.14)], c("#ff7a3a"), 8)
    for k in range(7):
        high = size * (2.5 + k * 0.55)
        ball(glow, Vector(at) + v(random.uniform(-0.2, 0.2) * k * 0.3, high, random.uniform(-0.2, 0.2) * k * 0.3),
             size * 0.07 * (1 + k * 0.12), mix(c("#ffb45a"), c("#5a3a78"), k / 6), 5, 4)


def worms(sway, glow, at, color, tip):
    for _ in range(random.randint(6, 10)):
        start = Vector(at) + v(random.uniform(-0.5, 0.5), -0.1, random.uniform(-0.5, 0.5))
        high = random.uniform(0.5, 1.7)
        end = start + v(random.uniform(-0.25, 0.25), high, random.uniform(-0.25, 0.25))
        tube(sway, [start, start.lerp(end, 0.5) + v(0.08, 0, 0.05), end], [0.07, 0.055, 0.05], color, 5)
        lathe(glow, end, [(0.05, 0), (0.13, 0.16), (0.02, 0.2)], tip, 7)


def bones(shape, at, size, turn):
    bone = (c("#e4e0f2"), c("#b9b2d8"))
    def p(x, y, z):
        return Vector(at) + turn @ (v(x, y, z) * size)
    tube(shape, [p(0, 0.25, -2.4), p(0, 0.45, 0), p(0, 0.2, 2.4)], [0.12 * size, 0.18 * size, 0.08 * size], bone, 6)
    for k in range(6):
        z = -2.0 + 0.75 * k
        for side in (-1, 1):
            high = 1.5 - abs(k - 2.5) * 0.18
            tube(shape, [p(0, 0.4, z), p(side * 0.9, high, z + 0.15), p(side * 1.35, 0.5, z + 0.35), p(side * 1.15, -0.1, z + 0.5)],
                 [0.11 * size, 0.09 * size, 0.06 * size, 0.02 * size], bone, 5)


# ---------------------------------------------------------------- the tiles of the sea floor


def floor(shape, zone):
    path, sand, high = (c(tone) for tone in SAND[zone])
    step = 1.0

    def color(x, s, slant):
        away = abs(x - center(s))
        share = min(max((away - 1.4) / 1.2, 0.0), 1.0)
        out = mix(path, sand, share)
        out = mix(out, high, min(max((away - BANK) / 6, 0.0), 1.0))
        # Ripples that the water drew in the sand.
        wave = math.sin(TAU * 40 * s / TILE + math.sin(x * 0.6) * 1.8 + slant)
        return mix(out, WHITE if wave > 0 else INK, 0.07 * abs(wave))

    across = int(WIDE * 2 / step)
    along = int(TILE / step)
    for j in range(along):
        s0, s1 = j * step, (j + 1) * step
        for i in range(across):
            x0, x1 = -WIDE + i * step, -WIDE + (i + 1) * step
            corners = [(x0, s0), (x1, s0), (x1, s1), (x0, s1)]
            points = [(x, ground(x, s), -s) for x, s in corners]
            half = ((0, 1, 2), (0, 2, 3)) if (i + j) % 2 else ((0, 1, 3), (1, 2, 3))
            for k, tri in enumerate(half):
                x = sum(corners[n][0] for n in tri) / 3
                s = sum(corners[n][1] for n in tri) / 3
                shape.face([points[n] for n in tri], color(x, s, k * 0.4))


def spot(low, high, margin=1.5):
    """A place beside the path, from "low" to "high" meters from its middle."""
    s = random.uniform(margin, TILE - margin)
    side = random.choice((-1, 1))
    x = center(s) + side * random.uniform(low, high)
    return x, s, side


def stand_on(x, s, lift=0.0):
    return v(x, ground(x, s) + lift, -s)


def scenery(zone, paint, sway, glow):
    tones = ROCKS[zone]
    floor(paint, zone)

    # The walls of the trench, and what rolled down from them.
    for k in range(120):
        x, s, _ = spot(7.0, 26.0, 0.5)
        size = random.uniform(0.35, 1.5) + max(abs(x - center(s)) - 14, 0) * 0.17
        rock(paint, stand_on(x, s, size * 0.1), size, tones)
    for s in range(4, int(TILE), 8):
        for side in (-1, 1):
            x = center(s) + side * random.uniform(19, 25)
            rock(paint, stand_on(x, s, 1.0), random.uniform(3.5, 6.0), tones)
    # Pebbles along the way, flat enough to walk over.
    for k in range(160):
        x, s, _ = spot(1.7, 6.0, 0.3)
        size = random.uniform(0.05, 0.16)
        rock(paint, stand_on(x, s, size * 0.2), size, tones)

    if zone == "text":
        for k in range(110):
            x, s, _ = spot(5.2, 17.0)
            grass(sway, stand_on(x, s), ("#1f8f6e", "#9be86a"), 7, random.uniform(0.9, 1.9))
        for k in range(22):
            x, s, _ = spot(8.0, 18.0, 2.5)
            kelp(sway, stand_on(x, s), random.uniform(5.0, 11.0), ("#2f7d4f", "#3ea65f", "#c6e45a"))
        for k in range(26):
            x, s, _ = spot(1.9, 6.5)
            starfish(paint, stand_on(x, s, 0.02), random.uniform(0.2, 0.42), c(random.choice(("#ff7a59", "#ffb02e", "#ff5f8a"))))
        for k in range(30):
            x, s, _ = spot(1.5, 7.0)
            scallop(paint, stand_on(x, s), random.uniform(0.18, 0.42), c(random.choice(("#ffb7a8", "#ffd9a0", "#d8b4ff"))))
        for k in range(34):
            x, s, _ = spot(5.0, 8.5)
            message(paint, stand_on(x, s, 0.08), random.uniform(0.7, 1.4))
        for s in (9.0, 27.0, 46.0):
            x = center(s) + random.choice((-1, 1)) * 6.3
            books(paint, stand_on(x, s, -0.05), random.randint(3, 6))
        anchor(paint, stand_on(center(18) - 9.0, 18.0, -0.5), 1.5, spin_y(0.7) @ spin_z(0.35))
        mast(paint, sway, stand_on(center(50) + 11.0, 50.0, -0.8), spin_y(-0.9) @ spin_z(0.22))
        for k in range(14):
            x, s, _ = spot(6.5, 12.0)
            urchin(paint, glow, stand_on(x, s, 0.2), random.uniform(0.35, 0.7), c("#4a2c74"), AMBER)

    elif zone == "picture":
        coral = ("#ff6f91", "#ff9f43", "#c86bff", "#ff5f6d", "#ffd35a", "#43d9c9")
        for k in range(42):
            x, s, _ = spot(6.0, 16.0, 2.0)
            color = c(random.choice(coral))
            way = v(random.uniform(-0.2, 0.2), 1, random.uniform(-0.2, 0.2)).normalized()
            branches(paint, glow, stand_on(x, s, -0.1), way, random.uniform(0.7, 1.5), random.uniform(0.13, 0.24), 3,
                     color, mix(color, WHITE, 0.55))
        for k in range(28):
            x, s, _ = spot(5.8, 13.0)
            brain(paint, stand_on(x, s, 0.2), random.uniform(0.45, 1.3), c(random.choice(coral)))
        for k in range(40):
            x, s, _ = spot(5.6, 15.0)
            fan(sway, stand_on(x, s, -0.05), random.uniform(0.8, 2.4), c(random.choice(coral)), random.uniform(-0.8, 0.8))
        for k in range(18):
            x, s, _ = spot(6.0, 11.0)
            sponges(paint, stand_on(x, s), coral)
        for k in range(40):
            x, s, _ = spot(5.2, 12.0)
            grass(sway, stand_on(x, s), ("#7a3f8f", "#ff9ad5"), 5, 0.9)
        for k in range(24):
            x, s, _ = spot(1.9, 6.5)
            starfish(paint, stand_on(x, s, 0.02), random.uniform(0.18, 0.36), c(random.choice(coral)))
        for s, side in ((7.0, 1), (25.0, -1), (41.0, 1), (57.0, -1)):
            x = center(s) + side * 6.6
            reel(paint, stand_on(x, s, 0.6), random.uniform(0.8, 1.3), spin_y(side * -1.1) @ spin_z(0.3) @ spin_x(random.uniform(-0.3, 0.3)))
        for s, side in ((15.0, -1), (49.0, 1)):
            # A long band of film that drifts up from a reel.
            x = center(s) + side * 8.0
            points = [stand_on(x, s, 0.3) + v(side * math.sin(k * 0.45) * 1.4, k * 0.34, -math.cos(k * 0.45) * 1.4)
                      for k in range(22)]
            filmstrip(sway, glow, points, 0.8, lambda p: v(0, 1, 0.15).normalized())

    elif zone == "record":
        shells = (("#ffd9ec", "#d4589a"), ("#e6dcff", "#8a5fd8"), ("#d6f6ff", "#4a93cf"))
        for k, s in enumerate((5.0, 17.0, 30.0, 43.0, 55.0)):
            side = 1 if k % 2 else -1
            x = center(s) + side * random.uniform(8.5, 12.0)
            size = random.uniform(0.9, 1.7)
            pale, dark = (c(tone) for tone in shells[k % 3])
            nautilus(paint, stand_on(x, s, size * 1.1), size, spin_y(-side * 1.2) @ spin_z(random.uniform(-0.5, 0.5)), pale, dark)
        for k in range(46):
            x, s, _ = spot(5.8, 17.0)
            color = (CYAN, PINK, VIOLET)[k % 3]
            for _ in range(random.randint(2, 5)):
                turn = spin_y(random.uniform(0, TAU)) @ spin_z(random.uniform(-0.6, 0.6))
                crystal(glow if k % 2 else paint, stand_on(x, s, -0.15), random.uniform(0.12, 0.34),
                        random.uniform(0.6, 2.2), color, turn)
        for k in range(34):
            x, s, _ = spot(7.0, 18.0)
            high = random.uniform(1.5, 5.0)
            lathe(paint, stand_on(x, s, -0.2), [(high * 0.24, 0), (high * 0.11, high * 0.55), (0.0, high)],
                  tuple(c(tone) for tone in tones), 7)
        for k in range(34):
            x, s, _ = spot(5.4, 12.0)
            anemone(sway, glow, stand_on(x, s), random.uniform(0.6, 1.4), c(random.choice(("#d15ac8", "#6a6cf0", "#3fb8d8"))), c("#fff2a8"))
        for k in range(18):
            x, s, side = spot(2.2, 7.5)
            tilt = spin_y(random.uniform(0, TAU)) @ spin_x(random.uniform(-0.12, 0.12))
            disc(paint, stand_on(x, s, 0.02), random.uniform(0.35, 0.7), tilt, random.choice((PINK, AMBER, CYAN)))
        for s, side in ((11.0, 1), (36.0, -1)):
            x = center(s) + side * 7.0
            disc(paint, stand_on(x, s, 1.0), 1.7, spin_y(-side * 0.9) @ spin_x(1.2), PINK)

    else:
        stone = ("#3a466e", "#2a3356", "#4c5a86")
        for k, s in enumerate((6.0, 14.0, 24.0, 33.0, 45.0, 56.0)):
            for side in (-1, 1):
                if (k + side) % 4 == 0:
                    continue
                x = center(s) + side * 7.2
                column(paint, stand_on(x, s, -0.25), random.uniform(1.6, 6.5), stone)
        for s in (19.0, 51.0):
            # Pieces of a fallen column.
            for k in range(4):
                x = center(s) - 8.6 - k * 1.25
                turn = spin_y(random.uniform(-0.3, 0.3)) @ spin_z(math.pi / 2)
                lathe(paint, stand_on(x + 0.5, s + random.uniform(-0.4, 0.4), 0.45), [(0.58, 0), (0.58, 1.0)],
                      (c(stone[0]), c(stone[1])), 12, turn)
        for k in range(24):
            x, s, side = spot(6.0, 12.0)
            turn = spin_y(-side * random.uniform(0.7, 1.4)) @ spin_z(random.uniform(-0.28, 0.28))
            at = stand_on(x, s, -0.15)
            high = random.uniform(1.1, 2.4)
            box(paint, at + turn @ v(0, high / 2, 0), (1.1, high, 0.3), tuple(c(tone) for tone in stone), turn)
            color = (CYAN, LIME, VIOLET)[k % 3]
            for row in range(int(high / 0.5)):
                for col in (-0.24, 0.24):
                    glyph(glow, at + turn @ v(col, 0.35 + row * 0.45, 0.17), 0.26, color, turn)
        for k in range(36):
            x, s, _ = spot(5.5, 13.0)
            worms(sway, glow, stand_on(x, s), c("#d6d0ee"), (CYAN, LIME, PINK)[k % 3])
        for s, side in ((10.0, 1), (29.0, -1), (60.0, 1)):
            vent(paint, glow, stand_on(center(s) + side * 11.0, s), random.uniform(0.8, 1.4))
        bones(paint, stand_on(center(40) + 10.0, 40.0, -0.1), 1.5, spin_y(0.6))
        bones(paint, stand_on(center(4) - 12.0, 4.0, -0.1), 1.1, spin_y(-1.2) @ spin_z(0.2))
        for k in range(26):
            x, s, _ = spot(1.8, 5.5)
            glyph(glow, stand_on(x, s, 0.05), random.uniform(0.3, 0.55), mix(CYAN, INK, 0.25), spin_x(-math.pi / 2))


# ---------------------------------------------------------------- the stands


def mound(shape, zone, radius):
    tones = tuple(c(tone) for tone in SAND[zone][:2])
    lathe(shape, (0, -0.2, 0), [(radius * 1.25, 0), (radius, 0.28), (radius * 0.45, 0.38)], tones, 14)
    for k in range(7):
        a = TAU * k / 7 + 0.3
        rock(shape, (math.cos(a) * radius * 1.1, 0.06, math.sin(a) * radius * 1.1), random.uniform(0.1, 0.22), ROCKS[zone])


def stand_text(paint, glow, glass, cork):
    """A giant bottle with a letter inside. The cork leaves when a visitor comes."""
    mound(paint, "text", 0.85)
    profile = [(0.45, 0.12), (0.66, 0.2), (0.72, 0.42), (0.72, 1.22), (0.64, 1.42), (0.42, 1.6), (0.24, 1.72), (0.22, 2.0)]
    lathe(glass, (0, 0, 0), profile, c("#9ff0dc"), 16, cap=False)
    hoop(paint, (0, 2.03, 0), 0.24, 0.05, c("#6fd0bc"), spin_x(math.pi / 2), 16)
    # Streaks of light on the glass.
    for angle, wide in ((0.75, 0.09), (1.05, 0.035)):
        a, b = angle, angle + wide
        glow.face([(0.735 * math.sin(a), 0.5, 0.735 * math.cos(a)), (0.735 * math.sin(b), 0.5, 0.735 * math.cos(b)),
                   (0.735 * math.sin(b), 1.18, 0.735 * math.cos(b)), (0.735 * math.sin(a), 1.18, 0.735 * math.cos(a))], WHITE)
    tilt = spin_z(0.3) @ spin_x(-0.1)
    low = v(0.18, 0.28, 0)
    lathe(paint, low, [(0.24, 0), (0.24, 1.05)], (PAPER, c("#f0dcae")), 12, tilt)
    lathe(paint, low + tilt @ v(0, 1.05, 0), [(0.15, 0), (0.15, 0.02)], c("#d9bd85"), 12, tilt)
    lathe(glow, low + tilt @ v(0, 0.45, 0), [(0.256, 0), (0.256, 0.16)], RED, 12, tilt, cap=False)
    ball(glow, low + tilt @ v(0, 0.53, 0.27), (0.11, 0.11, 0.04), AMBER, 8, 5)
    # The cork, around its own pivot.
    lathe(cork, (0, -0.12, 0), [(0.18, 0), (0.25, 0.3), (0.2, 0.36)], (c("#d99a5c"), c("#b8753f")), 10)


def shell_half(shape, glow, up, hinge_z, size):
    """Half of a giant clam: a ribbed bowl whose hinge lies at "hinge_z", reaching toward +z."""
    ribs, rows = 18, 5
    outer = (c("#e98fb8"), c("#b8619c"))
    inner = c("#fff0f6")

    def p(i, k, shrink=1.0):
        a = math.radians(-100 + 200 * i / ribs)
        t = k / rows
        reach = size * t * (1.0 + (0.07 if i % 2 == 0 else 0.0) * t) * shrink
        deep = size * 0.42 * (1 - t * t) * (1.0 + (0.16 if i % 2 == 0 else -0.04)) * shrink
        return v(reach * math.sin(a), -up * deep, hinge_z + reach * math.cos(a) * 0.92 + size * 0.12 * t)

    for i in range(ribs):
        for k in range(rows):
            shape.face([p(i, k), p(i + 1, k), p(i + 1, k + 1), p(i, k + 1)], outer[(i // 1) % 2])
            lift = v(0, up * 0.07, 0)
            shape.face([p(i, k, 0.94) + lift, p(i + 1, k, 0.94) + lift, p(i + 1, k + 1, 0.94) + lift, p(i, k + 1, 0.94) + lift],
                       mix(inner, outer[0], (k / rows) ** 2))
        glow.face([p(i, rows), p(i + 1, rows), p(i + 1, rows, 0.94) + v(0, up * 0.07, 0), p(i, rows, 0.94) + v(0, up * 0.07, 0)],
                  c("#ffd3ea"))


def stand_picture(paint, glow, lid):
    """A giant clam on a rock of coral. It opens when a visitor comes."""
    mound(paint, "picture", 0.8)
    rock(paint, (0, 0.3, -0.1), 0.62, ROCKS["picture"])
    low = Shape()
    shine = Shape()
    shell_half(low, shine, 1, -0.7, 1.15)
    for source, target in ((low, paint), (shine, glow)):
        for face, color in zip(source.faces, source.colors):
            target.face([Vector(source.verts[i]) + v(0, 0.98, 0) for i in face], color)
    ball(glow, (0, 0.86, 0.18), 0.27, c("#fff6ff"), 12, 8)
    for k in range(5):
        a = -1.2 + 0.6 * k
        branches(paint, glow, (math.sin(a) * 1.0, 0.05, -math.cos(a) * 0.75), v(math.sin(a) * 0.4, 1, -0.2).normalized(),
                 0.34, 0.07, 2, c(("#ff9f43", "#43d9c9")[k % 2]), WHITE)
    # The upper half is built around the hinge, lying shut.
    shell_half(lid, lid, -1, 0.0, 1.15)


def stand_record(paint, glow, spinning):
    """A music box under a horn of shell, with a record that turns when a visitor comes."""
    mound(paint, "record", 0.9)
    box(paint, (0, 0.55, 0.05), (1.5, 0.7, 1.2), WOOD)
    box(paint, (0, 0.94, 0.05), (1.62, 0.1, 1.32), BRASS)
    box(paint, (0, 0.17, 0.05), (1.62, 0.1, 1.32), BRASS)
    for x in (-0.4, 0.0, 0.4):
        hoop(glow, (x, 0.55, 0.67), 0.13, 0.025, CYAN if x else PINK, None, 14)
    rod(paint, (0.77, 0.55, 0.05), (1.05, 0.55, 0.05), 0.04, 0.04, BRASS)
    rod(paint, (1.05, 0.55, 0.05), (1.05, 0.28, 0.05), 0.04, 0.04, BRASS)
    ball(paint, (1.05, 0.26, 0.05), 0.09, RED[0], 8, 5)
    # The horn rises behind the record and opens toward the visitor.
    points = [v(-0.62, 0.95, -0.4), v(-0.8, 1.45, -0.85), v(-0.72, 1.95, -0.9), v(-0.37, 2.15, -0.65), v(-0.14, 2.12, -0.35)]
    tube(paint, points, [0.07, 0.11, 0.16, 0.24, 0.34], BRASS, 10)
    way = (points[-1] - points[-2]).normalized()
    turn = toward((0, 0, 0), way)
    lathe(paint, points[-1], [(0.34, 0), (0.48, 0.2), (0.78, 0.38)], (c("#ffd9ec"), c("#d4589a")), 18, turn, cap=False)
    hoop(glow, points[-1] + way * 0.38, 0.78, 0.035, c("#ffe39a"), turn @ spin_x(math.pi / 2), 24)
    # The dark throat of the horn.
    ball(glow, points[-1] + way * 0.02, (0.33, 0.07, 0.33), c("#4a1f55"), 14, 5, turn)
    rod(paint, (0.58, 0.98, -0.42), (0.58, 1.22, -0.42), 0.07, 0.05, BRASS)
    rod(paint, (0.58, 1.22, -0.42), (0.3, 1.12, 0.22), 0.025, 0.025, BRASS)
    # The record, around its own pivot.
    disc(spinning, (0, 0, 0), 0.56, Matrix.Identity(3), PINK)
    box(spinning, (0.24, 0.07, 0), (0.12, 0.012, 0.05), PAPER)


def stand_foreign(paint, glow, halo):
    """A stele under letters of no known alphabet. A ring of stones circles it for a visitor."""
    mound(paint, "foreign", 0.95)
    stone = (c("#56649a"), c("#3d4874"), c("#7684bc"))
    box(paint, (0, 0.2, 0), (1.9, 0.3, 1.2), stone)
    box(paint, (0, 0.46, 0), (1.5, 0.24, 0.9), stone)
    lathe(paint, (0, 0.58, 0), [(0.72, 0), (0.66, 1.25), (0.42, 1.55), (0.08, 1.66)], stone, 8, squash=0.34)
    for row in range(3):
        for col in (-0.3, 0.0, 0.3):
            glyph(glow, (col, 0.86 + row * 0.4, 0.26), 0.2, CYAN, Matrix.Identity(3))
    gem_at = v(0, 2.28, 0)
    lathe(glow, gem_at, [(0.0, 0), (0.17, 0.24), (0.0, 0.5)], LIME, 6)
    # The ring, around its own pivot.
    for k in range(7):
        a = TAU * k / 7
        at = v(math.cos(a) * 1.35, math.sin(a * 2) * 0.12, math.sin(a) * 1.35)
        turn = spin_y(math.pi / 2 - a)
        box(halo, at, (0.3, 0.4, 0.14), stone, turn)
        glyph(halo, at + turn @ v(0, 0, 0.085), 0.18, (CYAN, LIME)[k % 2], turn)


# ---------------------------------------------------------------- the ends of the paths


def eye(paint, glow, at, size):
    ball(paint, at, (size, size * 1.08, size * 0.55), WHITE, 14, 9)
    ball(paint, Vector(at) + v(0, -size * 0.08, size * 0.5), (size * 0.5, size * 0.58, size * 0.16), INK, 12, 8)
    ball(glow, Vector(at) + v(size * 0.17, size * 0.17, size * 0.66), size * 0.13, WHITE, 6, 4)


def mark_text(paint, sway, glow, moving):
    """The librarian: an octopus with round glasses that holds what it reads."""
    skin = (c("#ff8f7a"), c("#f4705f"))
    ball(paint, (0, 5.6, -1.0), (3.4, 3.9, 3.0), lambda k: skin[0] if k % 5 else skin[1], 22, 15)
    ball(paint, (0, 2.5, -0.3), (2.7, 1.6, 2.4), skin[1], 18, 8)
    for side in (-1, 1):
        eye(paint, glow, (side * 1.25, 4.9, 1.65), 0.85)
        hoop(paint, (side * 1.25, 4.9, 2.4), 1.08, 0.11, GOLD, None, 28)
        ball(glow, (side * 2.4, 3.8, 1.35), (0.45, 0.28, 0.2), PINK, 8, 5)
    rod(paint, (-0.2, 5.2, 2.5), (0.2, 5.2, 2.5), 0.09, 0.09, GOLD)
    hoop(paint, (0, 3.7, 2.1), 0.5, 0.09, c("#8c2f4a"), None, 12, math.pi * 1.15, math.pi * 0.7)
    # A square cap.
    lathe(paint, (0, 9.0, -1.0), [(1.5, 0), (1.25, 0.7)], INK, 14)
    box(paint, (0, 9.85, -1.0), (4.0, 0.22, 4.0), c("#23305c"), spin_z(0.1) @ spin_y(math.pi / 4))
    tube(sway, [(0, 10.0, -1.0), (1.9, 9.7, 0.2), (2.4, 8.6, 0.9), (2.45, 7.7, 1.0)], [0.07] * 4, GOLD[0], 5)
    ball(sway, (2.45, 7.45, 1.0), (0.24, 0.36, 0.24), GOLD[0], 8, 5)
    for k in range(8):
        a = math.radians((-115, -75, -42, -16, 16, 42, 75, 115)[k])
        way = v(math.sin(a), 0, math.cos(a))
        across = v(math.cos(a), 0, -math.sin(a))
        reach = 5.0 + 1.2 * (k % 2)
        lift = 4.6 if k in (1, 6) else 2.6 if k in (0, 7) else 0.9
        points = [
            way * 1.6 + v(0, 2.0, -0.6),
            way * 3.2 + v(0, 0.7, -0.4) + across * 0.4,
            way * reach + v(0, 0.45, -0.2) - across * 0.3,
            way * (reach + 1.1) + v(0, lift * 0.6, 0) + across * 0.2,
            way * (reach + 0.7) + v(0, lift + 0.5, 0.2),
            way * (reach - 0.1) + v(0, lift + 0.55, 0.3),
        ]
        smooth = []
        for i in range(len(points) - 1):
            p0, p1 = points[max(i - 1, 0)], points[i]
            p2, p3 = points[i + 1], points[min(i + 2, len(points) - 1)]
            for step in range(4):
                t = step / 4
                smooth.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                     + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3))
        smooth.append(points[-1])
        count = len(smooth)
        tube(sway, smooth, [0.85 * (1 - i / count) + 0.08 for i in range(count)], skin[k % 2], 8)
        for i in range(3, count - 3, 2):
            ball(sway, smooth[i] + v(0, 0.78 * (1 - i / count), 0), 0.2 * (1 - i / count) + 0.06, c("#ffd3c4"), 6, 4)
        held = points[-1] + v(0, 0.35, 0)
        if lift > 2:
            turn = spin_y(a) @ spin_z(0.3)
            box(sway, held, (1.2, 1.55, 0.34), c(("#3f6fb0", "#3f9472")[k % 2]), turn)
            box(sway, held, (1.12, 1.42, 0.4), PAPER, turn)
    # Bottles that circle its head.
    for k in range(9):
        a = TAU * k / 9
        at = v(math.cos(a) * 5.6, math.sin(a * 3) * 0.7, math.sin(a) * 5.6)
        turn = spin_y(-a) @ spin_x(0.6)
        lathe(moving, at, [(0.2, 0), (0.28, 0.12), (0.28, 0.8), (0.1, 1.05), (0.1, 1.25)], (c("#8ee6c4"), c("#5cc4a4")), 9, turn)
        lathe(moving, at + turn @ v(0, 1.25, 0), [(0.12, 0), (0.12, 0.16)], c("#c98d52"), 7, turn)
        lathe(moving, at + turn @ v(0, 0.3, 0), [(0.29, 0), (0.29, 0.32)], PAPER, 9, turn, cap=False)
    for k in range(10):
        x = random.choice((-1, 1)) * random.uniform(2.5, 5.0)
        books(paint, (x, -0.1, random.uniform(1.0, 3.2) if abs(x) > 3.6 else -3.0), random.randint(2, 5))


def mark_picture(paint, sway, glow, moving):
    """A camera as big as a house, on three legs, with a reel of film around it."""
    leather = (c("#7a3350"), c("#5c2340"), c("#9a4766"))
    for foot in ((-3.8, 0, 2.0), (3.8, 0, 2.0), (0, 0, -3.8)):
        rod(paint, foot, (foot[0] * 0.25, 3.6, foot[2] * 0.25), 0.2, 0.34, BRASS)
        ball(paint, foot, 0.42, BRASS[1], 8, 5)
    box(paint, (0, 5.4, -0.8), (5.6, 4.0, 3.0), leather)
    for x in (-2.8, 2.8):
        box(paint, (x, 5.4, -0.8), (0.24, 4.2, 3.2), BRASS)
    # The folds in front of it.
    for k in range(5):
        size = 3.9 - 0.36 * k
        box(paint, (0, 5.2, 0.85 + 0.34 * k), (size, size * 0.78, 0.2), c(("#2c1c38", "#46304e")[k % 2]))
    z = 2.55
    lathe(paint, (0, 5.2, z), [(1.5, 0), (1.55, 0.6), (1.3, 0.75)], BRASS, 28, spin_x(math.pi / 2))
    lathe(paint, (0, 5.2, z + 0.76), [(1.12, 0), (0.95, 0.06)], INK, 28, spin_x(math.pi / 2))
    for r, color in ((0.98, CYAN), (0.62, VIOLET), (0.28, c("#e8fbff"))):
        hoop(glow, (0, 5.2, z + 0.86), r, 0.06, color, None, 32)
    ball(glow, (-0.42, 5.62, z + 0.9), (0.24, 0.17, 0.05), WHITE, 8, 5)
    # The flash.
    rod(paint, (-2.0, 7.4, -0.8), (-3.3, 9.4, -0.6), 0.14, 0.14, BRASS)
    lathe(paint, (-3.3, 9.4, -0.6), [(0.3, 0), (1.15, 0.8)], BRASS, 16, spin_x(math.pi / 2), cap=False)
    ball(glow, (-3.3, 9.4, -0.1), 0.5, c("#fff8c8"), 10, 7)
    box(paint, (1.5, 7.75, -0.8), (1.3, 0.7, 1.2), BRASS)
    ball(glow, (1.5, 7.75, -0.12), 0.24, RED[0], 8, 5)
    # Film that circles it.
    points = [v(math.cos(TAU * k / 48) * 6.2, math.sin(TAU * k / 48 * 3) * 0.9, math.sin(TAU * k / 48) * 6.2) for k in range(49)]
    filmstrip(moving, moving, points, 1.25, lambda p: v(0, 1, 0))
    for side in (-1, 1):
        reel(paint, (side * 5.6, 1.4, 0.8), 1.7, spin_y(side * -0.5) @ spin_z(0.25))
    for k in range(16):
        x = random.uniform(-7, 7)
        fan(sway, (x, -0.1, -4.2 + random.uniform(-1, 1)), random.uniform(1.5, 3.6),
            c(random.choice(("#ff6f91", "#ff9f43", "#c86bff"))), random.uniform(-0.5, 0.5))


def mark_record(paint, sway, glow, moving):
    """The ribs of a whale around a horn that still plays; its notes circle above."""
    bone = (c("#efeaff"), c("#c6bce8"))
    for k in range(5):
        z = 1.2 - k * 2.1
        high = 10.0 - k * 0.8
        wide = 6.6 - k * 0.5
        for side in (-1, 1):
            tube(paint, [(side * wide * 0.82, -0.3, z), (side * wide, high * 0.34, z - 0.2), (side * wide * 0.86, high * 0.72, z - 0.4),
                         (side * wide * 0.42, high * 0.95, z - 0.5), (side * 0.25, high, z - 0.55)],
                 [0.52, 0.44, 0.34, 0.24, 0.1], bone, 7)
        ball(paint, (0, high + 0.15, z - 0.55), (0.7, 0.55, 0.85), bone[1], 8, 5)
    box(paint, (0, 1.0, -1.6), (3.8, 1.9, 3.0), WOOD)
    box(paint, (0, 2.0, -1.6), (4.0, 0.2, 3.2), BRASS)
    disc(paint, (0, 2.1, -1.2), 1.5, Matrix.Identity(3), PINK)
    points = [v(-1.5, 2.0, -2.8), v(-1.9, 3.8, -3.4), v(-1.5, 5.4, -3.2), v(-0.6, 5.9, -2.2), v(-0.15, 5.7, -1.2)]
    tube(paint, points, [0.22, 0.34, 0.52, 0.8, 1.15], BRASS, 12)
    way = (points[-1] - points[-2]).normalized()
    turn = toward((0, 0, 0), way)
    lathe(paint, points[-1], [(1.15, 0), (1.6, 0.8), (2.9, 1.5)], (c("#ffd9ec"), c("#d4589a")), 24, turn, cap=False)
    hoop(glow, points[-1] + way * 1.5, 2.9, 0.1, c("#ffe39a"), turn @ spin_x(math.pi / 2), 36)
    ball(glow, points[-1] + way * 0.05, (1.12, 0.2, 1.12), c("#4a1f55"), 18, 5, turn)
    for x in (-1.0, 0.0, 1.0):
        hoop(glow, (x, 1.0, -0.07), 0.34, 0.06, (PINK, CYAN, PINK)[int(x) + 1], None, 16)
    for k in range(10):
        a = TAU * k / 10
        note(moving, (math.cos(a) * 5.0, math.sin(a * 2) * 1.0, math.sin(a) * 5.0), random.uniform(0.7, 1.15),
             (PINK, CYAN, AMBER, LIME)[k % 4])
    for side in (-1, 1):
        nautilus(paint, (side * 8.2, 2.2, -1.5), 1.9, spin_y(-side * 0.7), c("#e6dcff"), c("#8a5fd8"))
        anemone(sway, glow, (side * 4.4, -0.1, 1.6), 1.6, c("#6a6cf0"), c("#fff2a8"))


def mark_foreign(paint, sway, glow, moving):
    """The head of a scholar of an unknown people, sunk to the chin, its eyes still lit."""
    stone = (c("#4a578a"), c("#38426e"))
    ball(paint, (0, 3.6, -2.0), (3.9, 5.2, 3.4), lambda k: stone[0] if k % 4 else stone[1], 14, 11)
    box(paint, (0, 6.0, 0.9), (5.2, 0.75, 1.0), stone[1])
    lathe(paint, (0, 3.1, 1.55), [(0.95, 0), (0.55, 1.2), (0.3, 2.85)], stone, 5, spin_x(-0.08))
    for side in (-1, 1):
        box(paint, (side * 1.55, 5.05, 1.15), (1.7, 0.85, 0.5), c("#141a36"), spin_z(side * -0.06))
        ball(glow, (side * 1.55, 5.05, 1.4), (0.62, 0.26, 0.12), CYAN, 10, 6)
        ball(paint, (side * 3.8, 4.0, -1.6), (0.55, 1.5, 0.8), stone[1], 8, 7)
    box(paint, (0, 2.0, 1.35), (2.7, 0.34, 0.5), stone[1])
    box(paint, (0, 1.5, 1.2), (2.2, 0.4, 0.55), stone[0])
    # A crown of tablets, and a beard of long stones.
    for k in range(7):
        a = math.radians(-72 + 24 * k)
        at = v(math.sin(a) * 3.1, 7.5 + math.cos(a) * 1.6, -1.2)
        turn = spin_z(-a * 0.8)
        box(paint, at, (0.95, 1.9 if k == 3 else 1.4, 0.4), (c("#6470aa"), c("#4a578a")), turn)
        glyph(glow, at + turn @ v(0, 0, 0.22), 0.55, LIME, turn)
    for k in range(7):
        x = -1.8 + 0.6 * k
        lathe(paint, (x, -0.3, 1.1 - abs(x) * 0.25), [(0.2, 0), (0.28, 1.4 - abs(x) * 0.2), (0.1, 1.6 - abs(x) * 0.2)], stone, 6)
    glyph(glow, (0, 7.15, 1.2), 0.95, CYAN, spin_x(-0.3))
    # Letters that circle it.
    for k in range(14):
        a = TAU * k / 14
        at = v(math.cos(a) * 6.4, math.sin(a * 3) * 0.8, math.sin(a) * 6.4)
        glyph(moving, at, random.uniform(0.7, 1.1), (CYAN, LIME, VIOLET)[k % 3], spin_y(math.pi / 2 - a))
    for side in (-1, 1):
        column(paint, (side * 7.6, -0.3, 0.2), 7.5, ("#3a466e", "#2a3356", "#4c5a86"))
        ball(glow, (side * 7.6, 8.0, 0.2), 0.5, VIOLET, 8, 6)
        worms(sway, glow, (side * 4.8, 0, 2.2), c("#d6d0ee"), PINK)


# ---------------------------------------------------------------- the way in, and the creatures


def arch(paint, glow):
    """The ribs of a wreck over the path, where the documents of another region begin."""
    for side in (-1, 1):
        for z, shift in ((0.0, 0.0), (-0.9, 0.25)):
            tube(paint, [(side * 6.4, -0.8, z), (side * (6.2 - shift), 2.4, z), (side * (5.1 - shift), 4.9, z),
                         (side * (2.7 - shift), 6.5 + shift, z), (side * 0.1, 6.9 + shift, z)],
                 [0.46, 0.38, 0.3, 0.24, 0.2], WOOD, 6)
        for y in (1.5, 3.3):
            rod(paint, (side * 6.2, y, 0.25), (side * 5.9, y + 0.35, -1.15), 0.12, 0.12, WOOD, 4)
        # A lamp that hangs on a chain.
        for k in range(5):
            hoop(paint, (side * 4.7, 5.0 - k * 0.2, 0.15), 0.1, 0.025, BRASS[1], spin_y(math.pi / 2 * (k % 2)), 8)
        lathe(paint, (side * 4.7, 3.95, 0.15), [(0.34, 0), (0.06, 0.28)], BRASS, 8)
        ball(glow, (side * 4.7, 3.65, 0.15), (0.24, 0.32, 0.24), c("#ffe7a0"), 8, 6)
        lathe(paint, (side * 4.7, 3.25, 0.15), [(0.16, 0), (0.22, 0.1)], BRASS, 8)
    rod(paint, (0, 6.95, 0.3), (0, 7.2, -1.2), 0.2, 0.2, WOOD)


def bell(paint, glow, moving):
    """The diving bell that brought the visitor down. Its chain goes up out of sight."""
    lathe(paint, (0, 1.0, 0), [(2.5, 0), (2.65, 0.3), (2.35, 0.55), (2.35, 3.1), (1.95, 4.0), (1.1, 4.6), (0.25, 4.85)],
          lambda k: BRASS if k != 1 else BRASS[1], 20)
    lathe(paint, (0, 0.9, 0), [(2.05, 0), (2.05, 0.15)], c("#2b3c58"), 20)
    for y in (1.75, 3.9):
        hoop(paint, (0, y, 0), 2.38, 0.11, c("#8a5a26"), spin_x(math.pi / 2), 32)
    for a in (-1.15, 0.0, 1.15, math.pi):
        turn = spin_y(a)
        at = turn @ v(0, 2.75, 2.36)
        ball(glow, at, (0.55, 0.55, 0.1), c("#fff1b0"), 14, 8, turn)
        hoop(paint, at + turn @ v(0, 0, 0.08), 0.62, 0.13, c("#8a5a26"), turn, 20)
        rod(paint, at + turn @ v(-0.6, 0, 0.13), at + turn @ v(0.6, 0, 0.13), 0.04, 0.04, c("#8a5a26"), 4)
    for a in (0.6, 2.5, 4.4):
        rod(paint, (math.sin(a) * 2.1, 1.15, math.cos(a) * 2.1), (math.sin(a) * 3.1, -0.3, math.cos(a) * 3.1), 0.18, 0.24, BRASS)
    hoop(paint, (0, 6.2, 0), 0.42, 0.12, BRASS, None, 14)
    for k in range(34):
        hoop(paint, (0, 6.75 + k * 0.5, 0), 0.3, 0.075, c("#5b7488"), spin_y(math.pi / 2 * (k % 2)), 10)
    # A wheel on its side that turns by itself.
    hoop(moving, (0, 0, 0), 0.5, 0.07, RED, None, 18)
    for k in range(3):
        a = math.pi * k / 3
        rod(moving, (-math.cos(a) * 0.5, -math.sin(a) * 0.5, 0), (math.cos(a) * 0.5, math.sin(a) * 0.5, 0), 0.045, 0.045, RED, 4)


def whale(paint, glow, tail):
    """A whale that carries a lamp, head toward +z. The tail is built around its joint."""
    back, belly, deep = c("#4a78b8"), c("#d9ecff"), c("#33588f")
    sides = 16
    profile = [(-6.0, 0.55, 0.1), (-4.2, 1.15, 0.2), (-2.0, 2.0, 0.15), (0.5, 2.45, 0.0), (3.2, 2.35, -0.05),
               (5.2, 1.95, -0.1), (6.6, 1.25, -0.2), (7.2, 0.35, -0.3)]
    rings = [[v(r * math.cos(TAU * i / sides), y + r * 0.82 * math.sin(TAU * i / sides), z) for i in range(sides)]
             for z, r, y in profile]
    for low, high in zip(rings, rings[1:]):
        quad_strip(paint, low, high, lambda i: (belly if i % 2 else mix(belly, back, 0.3))
                   if math.sin(TAU * (i + 0.5) / sides) < -0.35 else back)
    paint.face(rings[-1], back)
    for side in (-1, 1):
        paint.face([v(side * 2.0, -0.6, 2.6), v(side * 5.4, -1.9, 0.2), v(side * 4.6, -1.9, -0.4), v(side * 2.1, -0.9, 0.6)], deep)
        ball(paint, (side * 1.95, -0.15, 5.0), (0.22, 0.32, 0.34), INK, 8, 6)
        ball(glow, (side * 2.14, -0.02, 5.1), 0.08, WHITE, 5, 4)
        tube(paint, [(side * 1.9, -0.75, 4.4), (side * 1.55, -0.95, 5.7), (side * 0.8, -0.85, 6.7)], [0.07] * 3, deep, 5)
    paint.face([v(0, 2.2, -1.2), v(0, 3.4, -2.6), v(0, 1.8, -2.9)], deep)
    for k in range(26):
        z = random.uniform(-2.0, 4.5)
        a = random.uniform(0.5, math.pi - 0.5)
        r = 2.38 if z > -0.5 else 1.9
        ball(paint, (r * math.cos(a), r * 0.82 * math.sin(a), z), random.uniform(0.07, 0.17), c("#b9d4e8"), 6, 4)
    # Its lamp.
    rod(paint, (0, 1.75, 5.2), (0, 3.5, 6.3), 0.08, 0.06, deep)
    rod(paint, (0, 3.5, 6.3), (0, 3.3, 7.4), 0.06, 0.04, deep)
    ball(glow, (0, 2.9, 7.45), 0.42, c("#fff1a8"), 10, 7)
    # Rows of little lights along its sides.
    for k in range(9):
        z = -3.0 + k * 0.9
        r = 2.46 if z > -0.5 else 1.75
        for side in (-1, 1):
            ball(glow, (side * r * 0.98, -0.25, z), 0.09, CYAN, 5, 4)
    tube(tail, [(0, 0.0, 0.3), (0, 0.15, -1.2), (0, 0.35, -2.4)], [0.58, 0.36, 0.2], back, 10)
    for side in (-1, 1):
        tail.face([v(0, 0.35, -2.1), v(side * 3.0, 0.65, -3.7), v(side * 2.5, 0.55, -4.3), v(side * 0.8, 0.4, -3.35),
                   v(0, 0.35, -3.0)], deep)


def manta(body, left, right):
    dark, pale = c("#273a66"), c("#4c6aa8")
    ball(body, (0, 0, 0), (0.62, 0.3, 1.2), dark, 10, 7)
    tube(body, [(0, 0, -1.1), (0.05, 0, -2.4), (-0.05, 0, -3.8)], [0.1, 0.05, 0.012], dark, 5)
    for side in (-1, 1):
        ball(body, (side * 0.4, 0.06, 1.12), (0.1, 0.1, 0.34), dark, 6, 5)
    for wing, side in ((left, -1), (right, 1)):
        root_front, root_back = v(side * 0.45, 0, 0.9), v(side * 0.45, 0, -0.9)
        middle_front, middle_back = v(side * 1.7, 0.05, 0.45), v(side * 1.5, 0.02, -0.62)
        tip = v(side * 3.1, 0.12, -0.35)
        wing.face([root_front, middle_front, middle_back, root_back], dark)
        wing.face([middle_front, tip, middle_back], pale)


def jelly(glow):
    tones = (WHITE, c("#dff8ff"))
    lathe(glow, (0, 0, 0), [(0.62, 0.0), (0.66, 0.18), (0.54, 0.46), (0.3, 0.64), (0.03, 0.72)], tones, 12, cap=False)
    for k in range(12):
        a = TAU * k / 12
        x, z = math.cos(a) * 0.62, math.sin(a) * 0.62
        ball(glow, (x, 0.0, z), 0.09, tones[1], 5, 4)
    for k in range(7):
        a = TAU * k / 7
        x, z = math.cos(a) * 0.3, math.sin(a) * 0.3
        long = 1.0 + (k % 3) * 0.45
        points = [(x + math.sin(t * 5 + k) * 0.12, -long * t + 0.1, z + math.cos(t * 4 + k) * 0.12) for t in (0, 0.25, 0.5, 0.75, 1)]
        tube(glow, points, [0.035, 0.03, 0.022, 0.015, 0.006], tones[k % 2], 4)


def paper_fish(glow):
    """A fish folded from a sheet of paper, head toward +z."""
    light, shade, fold = WHITE, c("#c9d4e6"), c("#e6edf7")
    nose, top, low, waist = v(0, 0, 0.34), v(0, 0.14, 0.02), v(0, -0.12, 0.04), v(0, 0.0, -0.2)
    left, right = v(-0.07, 0, 0.04), v(0.07, 0, 0.04)
    for side, color in ((left, shade), (right, light)):
        glow.face([nose, top, side], color)
        glow.face([nose, side, low], fold)
        glow.face([side, top, waist], fold)
        glow.face([low, side, waist], color)
    glow.face([waist, v(0, 0.15, -0.38), v(0, 0.02, -0.3)], shade)
    glow.face([waist, v(0, -0.02, -0.3), v(0, -0.13, -0.38)], light)


def beam(shape):
    """A shaft of light from the surface: narrow at the top, wide and faint below."""
    for k in range(3):
        turn = spin_y(math.pi * k / 3)
        shape.face([turn @ v(-1.7, 0, 0), turn @ v(1.7, 0, 0), turn @ v(0.45, 20, 0), turn @ v(-0.45, 20, 0)], c("#d8fff4"))


# ---------------------------------------------------------------- putting it together


def weld(scene):
    """Joins the corners that faces share, so each is stored once for every color it has."""
    for obj in scene.collection.objects:
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.remove_doubles(mesh, verts=mesh.verts, dist=0.0005)
        mesh.to_mesh(obj.data)
        mesh.free()


def blender(shape):
    """The corners of a shape turn from the page's coordinates into Blender's."""
    shape.verts = [(p[0], -p[2], p[1]) for p in shape.verts]
    return shape


def main():
    # The same sea at every run.
    random.seed(29)
    scene = make_scene("Solaris_Trench", ("dr_", "trench_"))
    lit = make_material("trench_paint")
    shine = make_material("trench_glow")
    # Only for the pictures taken in Blender; the page draws these meshes unlit.
    shader = next(n for n in shine.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    source = next(n for n in shine.node_tree.nodes if n.type == "VERTEX_COLOR")
    shine.node_tree.links.new(source.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 1.0

    meshes = {}
    pivots = {}

    def mesh(name):
        meshes[name] = Shape()
        return meshes[name]

    def moving(name, at):
        """A thing that turns or lifts: built around the zero point, placed by the page."""
        pivots[name] = [round(value, 3) for value in at]
        return mesh(name)

    for zone in ZONES:
        scenery(zone, mesh(f"dr_tile_{zone}_paint"), mesh(f"dr_tile_{zone}_sway"), mesh(f"dr_tile_{zone}_glow"))

    stand_text(mesh("dr_stand_text_paint"), mesh("dr_stand_text_glow"), mesh("dr_stand_text_glass"),
               moving("dr_stand_text_move", (0, 2.1, 0)))
    stand_picture(mesh("dr_stand_picture_paint"), mesh("dr_stand_picture_glow"),
                  moving("dr_stand_picture_move", (0, 1.0, -0.7)))
    stand_record(mesh("dr_stand_record_paint"), mesh("dr_stand_record_glow"),
                 moving("dr_stand_record_move", (0, 1.0, 0.12)))
    stand_foreign(mesh("dr_stand_foreign_paint"), mesh("dr_stand_foreign_glow"),
                  moving("dr_stand_foreign_move", (0, 1.2, 0)))

    for zone, build, high in (("text", mark_text, 7.2), ("picture", mark_picture, 3.6),
                              ("record", mark_record, 8.4), ("foreign", mark_foreign, 4.6)):
        build(mesh(f"dr_mark_{zone}_paint"), mesh(f"dr_mark_{zone}_sway"), mesh(f"dr_mark_{zone}_glow"),
              moving(f"dr_mark_{zone}_move", (0, high, -0.8)))

    arch(mesh("dr_arch_paint"), mesh("dr_arch_glow"))
    bell(mesh("dr_bell_paint"), mesh("dr_bell_glow"), moving("dr_bell_move", (2.48, 2.0, 0)))
    # The wheel lies on the right side of the bell.
    wheel = meshes["dr_bell_move"]
    wheel.verts = [tuple(spin_y(math.pi / 2) @ Vector(p)) for p in wheel.verts]
    whale(mesh("dr_whale_paint"), mesh("dr_whale_glow"), moving("dr_whale_move", (0, 0.0, -6.0)))
    manta(mesh("dr_manta_paint"), mesh("dr_manta_left"), mesh("dr_manta_right"))
    jelly(mesh("dr_jelly_glow"))
    paper_fish(mesh("dr_fish_glow"))
    beam(mesh("dr_shaft_beam"))

    # A depth without a thing of a kind has no mesh of it.
    for name, shape in meshes.items():
        if shape.faces:
            glows = name.endswith(("_glow", "_beam"))
            add(scene, shine if glows else lit, name, blender(shape))

    # With the default bits, points far from zero move by centimeters, and flat things on the
    # ground then flicker through it.
    bits = meshopt.EXP_FILTER_BITS
    meshopt.EXP_FILTER_BITS = 17
    weld(scene)
    try:
        # The page works out the flat normals itself, which halves the file.
        export(os.path.join(FOLDER, "trench.glb"), normals=False)
    finally:
        meshopt.EXP_FILTER_BITS = bits

    layout = {
        "tile": TILE,
        "wave": WAVE,
        "amp": AMP,
        "walk": WALK,
        "stand": STAND,
        "pivots": pivots,
    }
    with open(os.path.join(FOLDER, "trench.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(layout, handle, separators=(",", ":"))
        handle.write("\n")

    # After the export, so the file keeps every part around the zero point. The rest below is
    # only for the pictures taken in Blender: the four depths side by side.
    def show(name, at, yaw=0.0):
        source = scene.collection.objects.get(name)
        if not source:
            return
        copy = bpy.data.objects.new(f"trench_show_{name}", source.data)
        scene.collection.objects.link(copy)
        copy.location = (at[0], -at[2], at[1])
        copy.rotation_euler = (0, 0, yaw)

    originals = list(scene.collection.objects)
    for column_at, zone in enumerate(ZONES):
        left = column_at * 90.0
        for part in ("paint", "sway", "glow"):
            show(f"dr_tile_{zone}_{part}", (left, 0, 0))
            show(f"dr_mark_{zone}_{part}", (left + center(56), base(56), -56))
        pivot = pivots[f"dr_mark_{zone}_move"]
        show(f"dr_mark_{zone}_move", (left + center(56) + pivot[0], base(56) + pivot[1], -56 + pivot[2]))
        for k in range(6):
            s = 9 + k * 6.0
            side = 1 if k % 2 else -1
            at = (left + center(s) + side * STAND, base(s), -s)
            for part in ("paint", "glow", "glass"):
                show(f"dr_stand_{zone}_{part}", at, -side * 0.9)
            pivot = pivots[f"dr_stand_{zone}_move"]
            offset = spin_y(-side * 0.9) @ Vector(pivot)
            show(f"dr_stand_{zone}_move", (at[0] + offset.x, at[1] + offset.y, at[2] + offset.z), -side * 0.9)
        for part in ("paint", "glow"):
            show(f"dr_arch_{part}", (left + center(32), base(32), -32))
            show(f"dr_bell_{part}", (left + center(1), base(1), -1))
    for part in ("paint", "glow"):
        show(f"dr_whale_{part}", (4, 13, -30), 0.9)
    for obj in originals:
        obj.hide_set(True)
        obj.hide_render = True
    bpy.context.view_layer.update()
    print("[trench] done")


main()
