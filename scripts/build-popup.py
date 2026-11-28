"""Builds the Pop-up Lexicon, the walkable dictionary of the Glossary. Writes
src/assets/glossary/popup.glb and src/assets/glossary/popup.json.

    blender --background --factory-startup --python scripts/build-popup.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Popup",
and leaves every other scene alone. The model is original low-poly work and holds no game assets.

The visitor is as small as a bookmark and walks on a dictionary that lies open on a desk at night.
Every spread explains a few terms, and for every first letter a paper scene unfolds from the back
of the book: the letter itself, a landscape, and a thing whose name starts with it. A walk over the
outer edge turns the page, and the page carries the visitor over to the next spread. That turn is
modeled here too: the shape keys of "pb_leaf" are the page at moments of the turn.

Positions in this script and in the JSON file are those of the page: x to the right, y up and z
toward the visitor. "blender" turns them into Blender's coordinates.

The meshes are painted with vertex colors. "pb_glow_*" meshes shine by themselves, all others are
lit. "pb_pop_<letter>_<layer>" are the paper scenes, each built upright around its folding line.
"pb_page_*" and "pb_leaf" get their print from the page. "pb_card", "pb_tab_<letter>", "pb_arrow_glow",
"pb_crane", "pb_flame_glow" and "pb_drift_<n>_glow" are built around the zero point and placed by
the page.
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
from mathutils import Matrix, Vector  # noqa: E402

from lowpoly import TAU, Shape, add, export, linear, make_material, make_scene  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDER = os.path.join(ROOT, "src", "assets", "glossary")

# The book, in meters: how far a page reaches from the spine and from the middle of the spread.
WIDE = 14.0
DEEP = 11.0
DESK = -2.6
# How far from the middle a visitor can walk, and where a walk turns the page.
WALK = 13.0
TRIGGER = 12.1
# The poses of the turning page, the flat one on the right first and the flat one on the left last.
POSES = 16
# Where the paper scenes fold: their height, and how far back each layer stands.
HINGE = 0.72
LAYERS = (-10.3, -8.9, -7.2)

LETTERS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ"
# "#" cannot be part of a name in every tool.
KEYS = ["0" if letter == "#" else letter for letter in LETTERS]


def c(color):
    return linear(color)


def mix(a, b, share):
    share = min(max(share, 0.0), 1.0)
    return [x + (y - x) * share for x, y in zip(a, b)]


def v(x, y, z):
    return Vector((x, y, z))


INK = c("#1d1a4a")
WHITE = c("#ffffff")
CREAM = c("#fbf3df")
PAPER_EDGE = c("#d9c8a0")
GOLD = (c("#ffd45a"), c("#d59a2c"), c("#fff0a8"))
BRASS = (c("#e0b25c"), c("#a87a2e"), c("#f6d99a"))
WOOD = (c("#6b3f2a"), c("#52301f"), c("#835035"))
LEATHER = (c("#7a2338"), c("#571627"), c("#9b3349"))
# The paper of the scenes: strong, deep, pale.
PAPERS = tuple(
    tuple(c(color) for color in trio)
    for trio in (
        ("#e8536b", "#8f2547", "#ffc4cd"), ("#f0903a", "#9c4a17", "#ffd9ae"),
        ("#f2c230", "#97690c", "#ffecaa"), ("#52b66a", "#1f6b43", "#c4eec6"),
        ("#27b1b0", "#0e6872", "#b4ebe6"), ("#4a8fe7", "#1f4a99", "#c2dcff"),
        ("#8270e0", "#41318f", "#d8d0ff"), ("#d466c4", "#7d2a78", "#f9ccf0"),
    )
)


def page_height(a):
    """How high a page lies, "a" meters from the spine: it dips into the gutter."""
    return 0.9 * (1 - math.exp(-a / 1.1)) - 0.32 * (a / WIDE) ** 2


# ---------------------------------------------------------------- shapes, with y up


def solid(shape, matrix, verts, faces, color):
    points = [matrix @ Vector(p) for p in verts]
    for index, face in enumerate(faces):
        shade = color[index % len(color)] if isinstance(color, tuple) else color
        shape.face([points[i] for i in face], shade)


def box(shape, center, size, color, turn=None, top=None):
    """A box. "turn" is a rotation matrix about its middle."""
    w, h, d = (value / 2 for value in size)
    matrix = Matrix.Translation(Vector(center)) @ (turn or Matrix.Identity(4))
    verts = [(x, y, z) for y in (-h, h) for x, z in ((-w, -d), (w, -d), (w, d), (-w, d))]
    solid(shape, matrix, verts, [(0, 1, 2, 3), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], color)
    solid(shape, matrix, verts, [(7, 6, 5, 4)], top or color)


def toward(a, b):
    """The rotation that turns the y axis along the line from "a" to "b"."""
    line = Vector(b) - Vector(a)
    return v(0, 1, 0).rotation_difference(line.normalized()).to_matrix().to_4x4()


def rod(shape, a, b, low, high, color, sides=10, caps=True):
    """A round bar from "a" to "b", "low" thick at its start and "high" at its end."""
    a, b = Vector(a), Vector(b)
    length = (b - a).length
    matrix = Matrix.Translation(a) @ toward(a, b)
    rings = [
        [(r * math.cos(TAU * i / sides), y, r * math.sin(TAU * i / sides)) for i in range(sides)]
        for r, y in ((low, 0.0), (high, length))
    ]
    verts = rings[0] + rings[1]
    faces = [(i, (i + 1) % sides, sides + (i + 1) % sides, sides + i) for i in range(sides)]
    solid(shape, matrix, verts, faces, color)
    if caps:
        solid(shape, matrix, verts, [tuple(range(sides - 1, -1, -1)), tuple(range(sides, sides * 2))], color)


def ball(shape, center, radii, color, sides=10, rows=7, turn=None):
    if isinstance(radii, (int, float)):
        radii = (radii,) * 3
    matrix = Matrix.Translation(Vector(center)) @ (turn or Matrix.Identity(4))
    rings = []
    for k in range(rows + 1):
        lift = math.pi * k / rows
        r = max(math.sin(lift), 0.004)
        rings.append(
            [
                (radii[0] * r * math.cos(TAU * i / sides), -radii[1] * math.cos(lift), radii[2] * r * math.sin(TAU * i / sides))
                for i in range(sides)
            ]
        )
    for low, high in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            solid(shape, matrix, [low[i], low[j], high[j], high[i]], [(0, 1, 2, 3)], color)


# ---------------------------------------------------------------- cut paper, in the plane of x and y


THIN = 0.07


def cut(shape, points, color, d=0.0, edge=PAPER_EDGE, thick=THIN):
    """A piece of cardboard with the outline "points", "d" in front of its sheet."""
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))
    if area < 0:
        points = points[::-1]
    front = [(x, y, d + thick) for x, y in points]
    back = [(x, y, d) for x, y in points]
    shape.face(front, color)
    shape.face(back[::-1], mix(color, PAPER_EDGE, 0.55))
    for i in range(len(points)):
        j = (i + 1) % len(points)
        shape.face([back[i], back[j], front[j], front[i]], edge)


def disc(shape, x, y, rx, color, d=0.0, ry=None, sides=24, start=0.0, span=TAU):
    ry = rx if ry is None else ry
    whole = span >= TAU - 1e-6
    count = sides if whole else sides + 1
    points = [
        (x + rx * math.cos(start + span * i / sides), y + ry * math.sin(start + span * i / sides))
        for i in range(count)
    ]
    cut(shape, points, color, d)


def rect(shape, x, y, w, h, color, d=0.0, turn=0.0):
    """A rectangle with the middle of its foot at (x, y), leaning by "turn"."""
    cos, sin = math.cos(turn), math.sin(turn)
    cut(shape, [(x + px * cos - py * sin, y + px * sin + py * cos) for px, py in ((-w / 2, 0), (w / 2, 0), (w / 2, h), (-w / 2, h))], color, d)


def strip(shape, points, widths, color, d=0.0):
    """A band along a line, as wide at each point as "widths" says."""
    if isinstance(widths, (int, float)):
        widths = [widths] * len(points)
    left, right = [], []
    for i, (x, y) in enumerate(points):
        ax, ay = points[max(i - 1, 0)]
        bx, by = points[min(i + 1, len(points) - 1)]
        length = math.hypot(bx - ax, by - ay) or 1.0
        nx, ny = -(by - ay) / length * widths[i] / 2, (bx - ax) / length * widths[i] / 2
        left.append((x + nx, y + ny))
        right.append((x - nx, y - ny))
    # Piece by piece, so a band that curls over itself still has a clean surface.
    for i in range(len(points) - 1):
        cut(shape, [left[i], right[i], right[i + 1], left[i + 1]], color, d + i * 0.0006)


def spark(shape, x, y, outer, inner, tips, color, d=0.0, turn=math.pi / 2):
    points = []
    for i in range(tips * 2):
        r = outer if i % 2 == 0 else inner
        angle = turn + math.pi * i / tips
        points.append((x + r * math.cos(angle), y + r * math.sin(angle)))
    cut(shape, points, color, d)


def curve(a, b, bend, steps=14):
    """Points of an arc from "a" to "b" that bulges by "bend" to its left."""
    out = []
    for i in range(steps + 1):
        t = i / steps
        x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        length = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
        swell = bend * math.sin(math.pi * t)
        out.append((x - (b[1] - a[1]) / length * swell, y + (b[0] - a[0]) / length * swell))
    return out


def glyph(scene, text, size, extrude, offset=0.0):
    """The faces of a letter, standing in the plane of x and y, with the middle of its foot at zero."""
    line = bpy.data.curves.new("popup_glyph", "FONT")
    line.body = text
    line.size = size
    line.align_x = "CENTER"
    line.extrude = extrude
    line.offset = offset
    line.resolution_u = 3
    holder = bpy.data.objects.new("popup_glyph", line)
    scene.collection.objects.link(holder)
    graph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(graph))
    faces = [([mesh.vertices[i].co.copy() for i in p.vertices], p.normal.copy()) for p in mesh.polygons]
    bpy.data.objects.remove(holder, do_unlink=True)
    bpy.data.curves.remove(line)
    bpy.data.meshes.remove(mesh)
    return faces


def letter(shape, faces, matrix, front, side):
    for points, normal in faces:
        shape.face([matrix @ p for p in points], front if abs(normal.z) > 0.9 else side)


# ---------------------------------------------------------------- the landscapes behind the letters


def hills(shape, paper):
    strong, deep, pale = paper
    for k, (x, rx, ry, color) in enumerate(((-6.8, 5.6, 4.4, pale), (6.6, 6.0, 3.8, pale), (-1.0, 6.4, 3.0, strong), (8.6, 4.4, 2.4, deep), (-8.8, 4.0, 2.0, deep))):
        disc(shape, x, -0.2, rx, color, k * 0.09, ry, 28, 0, math.pi)
    for x, y in ((-9.5, 5.4), (7.8, 4.9), (3.0, 3.8)):
        cloud(shape, x, y, 0.8, WHITE, 0.55)


def cloud(shape, x, y, size, color, d):
    for k, (dx, dy, r) in enumerate(((-1.0, 0.0, 0.75), (0.0, 0.35, 1.0), (1.1, 0.0, 0.7))):
        disc(shape, x + dx * size, y + dy * size, r * size, color, d + k * 0.012)
    rect(shape, x, y - 0.75 * size, 2.4 * size, 0.75 * size, color, d + 0.05)


def waves(shape, paper):
    strong, deep, pale = paper
    for row, color in enumerate((pale, strong, deep)):
        high = 3.0 - row * 0.85
        points = [(-11.5, -0.8)]
        for k in range(93):
            x = -11.5 + k * 0.25
            points.append((x, high + 0.5 * abs(math.sin(x * 1.15 + row * 1.3)) - 0.25))
        points.append((11.5, -0.8))
        cut(shape, points, color, row * 0.12)
    disc(shape, 7.6, 5.0, 1.1, GOLD[0], -0.1)


def city(shape, paper):
    strong, deep, pale = paper
    for row, (color, high) in enumerate(((pale, 5.4), (strong, 3.6), (deep, 2.0))):
        x = -11.0 + row * 0.4
        k = 0
        while x < 10.4:
            w = 1.0 + ((k * 7 + row * 3) % 5) * 0.22
            h = high * (0.5 + ((k * 11 + row * 5) % 7) / 12)
            rect(shape, x + w / 2, -0.8, w, h + 0.8, color, row * 0.11 + (k % 2) * 0.012)
            if (k + row) % 3 == 0:
                cut(shape, [(x, h), (x + w, h), (x + w / 2, h + 0.9)], deep if row < 2 else strong, row * 0.11 + 0.03)
            if row == 1:
                for floor in range(int(h / 0.7)):
                    rect(shape, x + w / 2, 0.5 + floor * 0.65, 0.28, 0.3, GOLD[2], 0.23)
            x += w + 0.18
            k += 1


def forest(shape, paper):
    strong, deep, pale = paper
    for row, color in enumerate((pale, strong, deep)):
        rect(shape, 0, -0.8, 23.0, 1.9 - row * 0.45, color, row * 0.13)
        for k in range(13 - row * 2):
            x = -10.6 + k * (1.75 + row * 0.33) + (row * 0.6)
            h = 3.8 - row * 0.9 + ((k * 5 + row) % 4) * 0.35
            for tier in range(3):
                w = (1.5 - tier * 0.35) * (1 - row * 0.1)
                foot = 0.5 + tier * h * 0.22
                cut(shape, [(x - w / 2, foot), (x + w / 2, foot), (x, foot + h * 0.42)], color, row * 0.13 + 0.02 + tier * 0.012 + (k % 2) * 0.004)


def mountains(shape, paper):
    strong, deep, pale = paper
    for k, (x, w, h, color) in enumerate(((-7.0, 8.0, 5.6, pale), (4.0, 9.0, 6.0, pale), (-2.0, 7.0, 3.8, strong), (8.4, 6.0, 3.4, strong), (-8.6, 6.0, 2.4, deep), (3.0, 7.0, 1.9, deep))):
        d = k * 0.09
        cut(shape, [(x - w / 2, -0.8), (x + w / 2, -0.8), (x, h)], color, d)
        if h > 3:
            part = 0.22
            cut(shape, [(x - w / 2 * part, h * (1 - part) - 0.1), (x - w * 0.03, h * (1 - part) + 0.25), (x + w / 2 * part, h * (1 - part) - 0.1), (x, h)], WHITE, d + 0.085)


def sky_night(shape, paper):
    strong, deep, pale = paper
    for k, (x, y, size) in enumerate(((-8.5, 4.4, 1.1), (-4.0, 1.0, 1.7), (2.8, 0.7, 1.9), (8.0, 3.8, 1.3), (9.2, 0.6, 1.4), (-9.0, 0.8, 1.5))):
        cloud(shape, x, y, size, (pale, strong, deep)[k % 3], k * 0.09)
    for k in range(14):
        spark(shape, -10 + k * 1.55, 4.6 + ((k * 7) % 5) * 0.45, 0.34, 0.13, 5, GOLD[k % 3], 0.6 + (k % 2) * 0.05)
    rect(shape, 0, -0.8, 23.0, 1.4, deep, 0.7)


# ---------------------------------------------------------------- one thing for every letter


def thing_number(s, p):
    strong, deep, pale = p
    for x, y, r, color, tips, d in ((-1.1, 2.4, 2.0, strong, 12, 0.0), (1.6, 4.2, 1.35, GOLD[0], 9, 0.1), (1.8, 1.3, 1.0, deep, 8, 0.2)):
        spark(s, x, y, r, r * 0.8, tips, color, d)
        disc(s, x, y, r * 0.5, CREAM, d + 0.08)
        disc(s, x, y, r * 0.16, INK, d + 0.16)


def thing_anchor(s, p):
    strong, deep, pale = p
    strip(s, curve((-2.6, 2.6), (2.6, 2.6), 2.4, 24), 0.55, strong, 0.0)
    rect(s, 0, 0.3, 0.6, 4.6, deep, 0.1)
    rect(s, 0, 4.1, 2.8, 0.45, deep, 0.2)
    strip(s, curve((-0.65, 5.4), (0.65, 5.4), 0.75) + curve((0.65, 5.4), (-0.65, 5.4), 0.75), 0.3, strong, 0.25)
    for side in (-1, 1):
        cut(s, [(side * 2.0, 2.4), (side * 3.5, 3.3), (side * 3.0, 1.8)], strong, 0.12)


def thing_bell(s, p):
    strong, deep, pale = p
    disc(s, 0, 1.2, 0.55, deep, 0.0)
    cut(s, [(-2.6, 1.4), (2.6, 1.4), (1.8, 2.3), (1.55, 4.0), (0.85, 4.9), (-0.85, 4.9), (-1.55, 4.0), (-1.8, 2.3)], GOLD[0], 0.1)
    rect(s, 0, 1.4, 5.4, 0.45, GOLD[1], 0.2)
    rect(s, 0, 2.4, 3.7, 0.22, strong, 0.2)
    disc(s, 0, 5.2, 0.42, GOLD[1], 0.15)
    for side in (-1, 1):
        for k in range(3):
            strip(s, curve((side * (2.9 + k * 0.45), 2.2 - k * 0.2), (side * (2.9 + k * 0.45), 4.0 + k * 0.2), -side * 0.5), 0.16, pale, 0.05)


def thing_crown(s, p):
    strong, deep, pale = p
    cut(s, [(-2.9, 1.4), (2.9, 1.4), (3.4, 4.8), (1.7, 3.0), (0, 5.4), (-1.7, 3.0), (-3.4, 4.8)], GOLD[0], 0.0)
    rect(s, 0, 0.6, 5.8, 0.9, GOLD[1], 0.1)
    for x, y in ((-3.4, 4.9), (0, 5.55), (3.4, 4.9)):
        disc(s, x, y, 0.42, strong, 0.15)
    for k, x in enumerate((-2.0, -0.7, 0.7, 2.0)):
        spark(s, x, 1.05, 0.38, 0.38 * 0.7, 4, (strong, deep)[k % 2], 0.25)
    spark(s, 0, 2.6, 0.8, 0.5, 4, deep, 0.2)


def thing_dragon(s, p):
    strong, deep, pale = p
    body = [(-3.4 + 0.2 * k, 2.4 + 1.5 * math.sin(k * 0.27)) for k in range(30)]
    for k in range(3, 29, 3):
        x, y = body[k]
        cut(s, [(x - 0.4, y + 0.2), (x + 0.4, y + 0.2), (x + 0.15, y + 1.15)], GOLD[0], 0.0)
    strip(s, body, [0.12 + 0.036 * k for k in range(30)], strong, 0.1)
    hx, hy = body[-1]
    cut(s, [(hx - 0.5, hy + 0.7), (hx + 0.9, hy + 0.55), (hx + 1.7, hy + 0.1), (hx + 0.5, hy), (hx + 1.5, hy - 0.5), (hx - 0.4, hy - 0.7)], deep, 0.25)
    for k, dx in enumerate((-0.3, 0.2)):
        strip(s, curve((hx + dx, hy + 0.6), (hx + dx - 1.0, hy + 1.8), 0.35), [0.3 - i * 0.018 for i in range(15)], GOLD[1], 0.34 + k * 0.03)
    disc(s, hx + 0.45, hy + 0.3, 0.2, WHITE, 0.35)
    disc(s, hx + 0.52, hy + 0.3, 0.09, INK, 0.43)
    for k in (8, 17):
        x, y = body[k]
        strip(s, [(x, y - 0.2), (x + 0.25, y - 1.0), (x + 0.75, y - 1.2)], 0.28, deep, 0.3)


def thing_eye(s, p):
    strong, deep, pale = p
    for k in range(16):
        angle = TAU * k / 16
        spark(s, 3.4 * math.cos(angle), 3.0 + 2.5 * math.sin(angle), 0.3, 0.09, 4, GOLD[k % 3], 0.0)
    cut(s, curve((-3.2, 3.0), (3.2, 3.0), 1.9, 20) + curve((3.2, 3.0), (-3.2, 3.0), 1.9, 20)[1:-1], WHITE, 0.1)
    disc(s, 0, 3.0, 1.55, strong, 0.2)
    disc(s, 0, 3.0, 0.75, INK, 0.3)
    disc(s, 0.45, 3.45, 0.3, WHITE, 0.4)
    strip(s, curve((-3.2, 3.0), (3.2, 3.0), 2.0, 20), 0.28, deep, 0.45)
    strip(s, curve((-3.2, 3.0), (3.2, 3.0), -2.0, 20), 0.28, deep, 0.45)


def fishy(s, x, y, size, color, fin, d, way=1):
    cut(s, [(x - way * size * 0.8, y), (x - way * size * 1.7, y + size * 0.75), (x - way * size * 1.4, y), (x - way * size * 1.7, y - size * 0.75)], fin, d)
    cut(s, [(x - way * size * 0.3, y + size * 0.55), (x + way * size * 0.25, y + size * 1.1), (x + way * size * 0.55, y + size * 0.45)], fin, d + 0.02)
    disc(s, x, y, size, color, d + 0.1, size * 0.65)
    disc(s, x + way * size * 0.55, y + size * 0.16, size * 0.18, WHITE, d + 0.2)
    disc(s, x + way * size * 0.6, y + size * 0.16, size * 0.09, INK, d + 0.28)
    for k in range(3):
        strip(s, curve((x - way * size * (0.35 - k * 0.3), y + size * 0.4), (x - way * size * (0.35 - k * 0.3), y - size * 0.4), -way * size * 0.18), size * 0.07, fin, d + 0.2)


def thing_fish(s, p):
    strong, deep, pale = p
    fishy(s, 0.4, 3.4, 2.0, strong, deep, 0.0)
    fishy(s, -2.2, 1.2, 0.9, GOLD[0], GOLD[1], 0.4, -1)
    fishy(s, 2.4, 1.0, 0.7, pale, strong, 0.6)
    for x, y, r in ((3.4, 4.8, 0.3), (3.9, 5.6, 0.2), (-2.8, 4.4, 0.25)):
        disc(s, x, y, r, WHITE, 0.2)


def thing_gate(s, p):
    strong, deep, pale = p
    disc(s, 0, 3.0, 2.0, GOLD[0], -0.1)
    for side in (-1, 1):
        rect(s, side * 2.3, 0.0, 0.7, 4.9, strong, 0.1)
        rect(s, side * 2.3, 0.0, 1.1, 0.5, deep, 0.2)
    rect(s, 0, 3.8, 5.8, 0.45, strong, 0.2)
    cut(s, curve((-3.9, 5.7), (3.9, 5.7), -0.45) + [(3.5, 4.9)] + curve((3.5, 4.9), (-3.5, 4.9), 0.35)[1:], deep, 0.3)
    rect(s, 0, 4.25, 0.9, 0.75, CREAM, 0.4)


def thing_hourglass(s, p):
    strong, deep, pale = p
    cut(s, [(-2.0, 5.4), (2.0, 5.4), (1.7, 4.3), (0.18, 3.0), (1.7, 1.7), (2.0, 0.6), (-2.0, 0.6), (-1.7, 1.7), (-0.18, 3.0), (-1.7, 4.3)], pale, 0.0)
    cut(s, [(-1.15, 4.2), (1.15, 4.2), (0.1, 3.15), (-0.1, 3.15)], GOLD[0], 0.1)
    cut(s, [(-1.6, 0.75), (1.6, 0.75), (0.0, 2.1)], GOLD[0], 0.1)
    rect(s, 0, 1.9, 0.12, 1.2, GOLD[1], 0.2)
    for y in (0.1, 5.4):
        rect(s, 0, y, 5.0, 0.6, deep, 0.25)
    for side in (-1, 1):
        rect(s, side * 2.25, 0.5, 0.3, 5.0, strong, 0.2)


def thing_ink(s, p):
    strong, deep, pale = p
    strip(s, curve((0.2, 2.8), (3.0, 6.2), -0.5, 20), [0.14] * 5 + [0.5 + 1.1 * math.sin(math.pi * k / 15) for k in range(16)], pale, 0.0)
    strip(s, curve((0.2, 2.8), (3.0, 6.2), -0.5, 20), 0.12, deep, 0.12)
    cut(s, [(-2.4, 0.2), (1.6, 0.2), (2.0, 1.0), (2.0, 2.4), (0.7, 3.2), (0.7, 3.9), (-1.5, 3.9), (-1.5, 3.2), (-2.8, 2.4), (-2.8, 1.0)], deep, 0.2)
    rect(s, -0.4, 3.8, 2.7, 0.5, GOLD[1], 0.3)
    rect(s, -0.4, 1.1, 3.2, 1.3, CREAM, 0.3)
    disc(s, -0.4, 1.75, 0.45, strong, 0.4)


def thing_jellyfish(s, p):
    strong, deep, pale = p
    for x, y, size, color in ((0.2, 4.0, 2.1, strong), (-2.7, 2.4, 0.95, pale), (2.9, 1.8, 0.8, deep)):
        for k in range(5):
            start = x + (k - 2) * size * 0.34
            line = [(start + math.sin(i * 0.8 + k) * size * 0.14, y - i * size * 0.16) for i in range(13)]
            strip(s, line, [size * (0.18 - i * 0.011) for i in range(13)], (deep, pale)[k % 2], 0.05 + k * 0.02)
        disc(s, x, y, size, color, 0.2, size * 0.85, 20, 0, math.pi)
        for k in range(4):
            disc(s, x + (k - 1.5) * size * 0.5, y, size * 0.27, color, 0.3 + k * 0.01)
        for side in (-1, 1):
            disc(s, x + side * size * 0.3, y + size * 0.3, size * 0.1, INK, 0.42)


def thing_key(s, p):
    strong, deep, pale = p
    rect(s, 0.8, 2.85, 4.8, 0.65, GOLD[1], 0.0, 0.0)
    for k, (x, h) in enumerate(((1.9, 1.3), (2.7, 0.8), (3.0, 1.5))):
        rect(s, x, 3.0 - h, 0.45, h, GOLD[1], 0.05 + k * 0.012)
    for k in range(4):
        angle = TAU * k / 4
        disc(s, -2.3 + 0.95 * math.cos(angle), 3.15 + 0.95 * math.sin(angle), 0.85, GOLD[0], 0.1 + k * 0.012)
    disc(s, -2.3, 3.15, 0.85, deep, 0.25)
    disc(s, -2.3, 3.15, 0.45, strong, 0.35)
    for x, y in ((-3.4, 5.3), (1.0, 5.0), (3.2, 4.6), (0.2, 0.9)):
        spark(s, x, y, 0.45, 0.12, 4, pale, 0.1)


def thing_lantern(s, p):
    strong, deep, pale = p
    strip(s, curve((-1.2, 5.1), (1.2, 5.1), 1.0), 0.22, deep, 0.0)
    disc(s, 0, 2.9, 2.2, strong, 0.1, 2.0)
    disc(s, 0, 2.9, 1.35, GOLD[0], 0.2, 1.8)
    disc(s, 0, 2.9, 0.55, GOLD[2], 0.3, 1.3)
    for y in (0.65, 4.75):
        rect(s, 0, y, 2.4, 0.5, deep, 0.4)
    for k, x in enumerate((-0.5, 0, 0.5)):
        rect(s, x, -0.2, 0.16, 0.9, GOLD[1], 0.35 + k * 0.01)


def thing_moon(s, p):
    strong, deep, pale = p
    outer = [(2.7 * math.cos(a), 3.1 + 2.7 * math.sin(a)) for a in (math.radians(62 + k * 236 / 30) for k in range(31))]
    cut(s, outer + curve(outer[-1], outer[0], 2.6, 24)[1:-1], GOLD[0], 0.0)
    disc(s, -1.75, 3.5, 0.2, INK, 0.12)
    strip(s, curve((-2.0, 2.35), (-1.2, 2.1), -0.25), 0.14, INK, 0.12)
    for x, y, r in ((2.0, 4.6, 0.75), (2.9, 2.4, 0.5), (0.9, 3.0, 0.35)):
        spark(s, x, y, r, r * 0.42, 5, (pale, strong, WHITE)[int(r * 7) % 3], 0.2)


def thing_nest(s, p):
    strong, deep, pale = p
    for k, (x, color) in enumerate(((-1.1, pale), (1.2, strong), (0.1, WHITE))):
        disc(s, x, 2.5 + (k == 2) * 0.25, 0.95, color, k * 0.05, 1.25)
    cut(s, [(-3.4, 2.4)] + curve((-3.4, 2.4), (3.4, 2.4), -2.3, 20)[1:-1] + [(3.4, 2.4)], WOOD[2], 0.3)
    for k in range(11):
        y = 0.7 + (k % 5) * 0.38
        strip(s, curve((-3.6 + (k % 3) * 0.35, y + 0.35), (3.5 - (k % 4) * 0.3, y + ((k * 3) % 5) * 0.2), -0.7), 0.17, (WOOD[0], GOLD[1], WOOD[1])[k % 3], 0.42 + k * 0.012)


def thing_owl(s, p):
    strong, deep, pale = p
    rect(s, 0, 0.5, 6.4, 0.45, WOOD[2], 0.0)
    disc(s, 0, 3.0, 2.0, strong, 0.1, 2.3)
    for side in (-1, 1):
        cut(s, [(side * 0.7, 4.8), (side * 2.0, 6.0), (side * 1.9, 4.1)], deep, 0.18)
        cut(s, [(side * 1.6, 3.7), (side * 2.7, 2.2), (side * 1.9, 0.9), (side * 1.2, 2.2)], deep, 0.25)
        disc(s, side * 0.82, 4.0, 0.85, CREAM, 0.3)
        disc(s, side * 0.78, 4.0, 0.45, GOLD[0], 0.4)
        disc(s, side * 0.74, 4.0, 0.22, INK, 0.5)
        rect(s, side * 0.6, 0.55, 0.5, 0.35, GOLD[1], 0.4)
    cut(s, [(-0.35, 3.55), (0.35, 3.55), (0, 2.85)], GOLD[1], 0.6)
    for row in range(3):
        for k in range(3 - row % 2):
            disc(s, (k - 1 + row % 2 * 0.5) * 0.75, 2.2 - row * 0.45, 0.38, pale, 0.32 + row * 0.02, 0.38, 12, math.pi, math.pi)


def thing_plane(s, p):
    strong, deep, pale = p
    trail = [(-3.8 + k * 0.17, 1.0 + 1.1 * math.sin(k * 0.23) + k * 0.06) for k in range(30)]
    for k in range(0, 28, 3):
        strip(s, trail[k : k + 2], 0.16, strong, 0.0)
    cut(s, [(3.9, 5.5), (-1.7, 4.3), (0.3, 3.6)], WHITE, 0.1)
    cut(s, [(3.9, 5.5), (0.3, 3.6), (0.5, 2.3)], pale, 0.2)
    cut(s, [(3.9, 5.5), (0.5, 2.3), (1.4, 3.1), (2.3, 2.6)], strong, 0.3)
    for x, y in ((-2.6, 5.2), (3.0, 1.2)):
        cloud(s, x, y, 0.65, pale, 0.05)


def thing_quill(s, p):
    strong, deep, pale = p
    spine = curve((-2.6, 0.5), (2.8, 6.0), -0.8, 26)
    strip(s, spine[4:], [0.4 + 2.0 * math.sin(math.pi * k / 22) for k in range(23)], pale, 0.0)
    strip(s, spine[7:24], [0.2 + 1.0 * math.sin(math.pi * k / 16) for k in range(17)], strong, 0.1)
    strip(s, spine, [0.26 - k * 0.007 for k in range(27)], deep, 0.22)
    cut(s, [(-2.9, 0.1), (-2.35, 0.45), (-2.65, 0.75)], INK, 0.3)
    strip(s, curve((-2.9, 0.15), (2.4, 0.35), -0.7, 22), 0.13, INK, 0.05)


def thing_rose(s, p):
    strong, deep, pale = p
    strip(s, curve((0.3, 0.0), (0.0, 3.6), -0.55), 0.32, c("#2f7d4a"), 0.0)
    for side, y in ((-1, 1.5), (1, 2.3)):
        cut(s, curve((0.2, y), (side * 2.4, y + 0.7), 0.55) + curve((side * 2.4, y + 0.7), (0.2, y), 0.55)[1:-1], c("#52b66a"), 0.08)
    for k in range(7):
        angle = TAU * k / 7
        disc(s, 1.15 * math.cos(angle), 4.2 + 1.05 * math.sin(angle), 1.0, c("#e8536b"), 0.12 + k * 0.012)
    for k in range(5):
        angle = TAU * k / 5 + 0.6
        disc(s, 0.55 * math.cos(angle), 4.2 + 0.5 * math.sin(angle), 0.72, c("#c22c50"), 0.25 + k * 0.012)
    spiral = [(math.cos(k * 0.5) * (0.65 - k * 0.026), 4.2 + math.sin(k * 0.5) * (0.65 - k * 0.026)) for k in range(24)]
    strip(s, spiral, 0.13, c("#ffc4cd"), 0.42)


def thing_ship(s, p):
    strong, deep, pale = p
    rect(s, 0, 1.6, 0.25, 4.6, WOOD[1], 0.0)
    cut(s, [(0.25, 5.8)] + curve((0.25, 5.8), (3.0, 2.2), -0.7)[1:] + [(0.25, 2.2)], WHITE, 0.1)
    cut(s, [(-0.25, 5.2)] + curve((-0.25, 5.2), (-2.9, 2.3), 0.5)[1:] + [(-0.25, 2.3)], pale, 0.1)
    cut(s, [(0.1, 6.2), (1.5, 5.85), (0.1, 5.5)], strong, 0.2)
    cut(s, [(-3.6, 2.0), (-2.2, 1.75), (2.8, 1.75), (4.0, 2.5), (2.7, 0.3), (-2.4, 0.3)], deep, 0.3)
    rect(s, 0.1, 1.25, 5.8, 0.22, GOLD[0], 0.4)
    for k in range(4):
        disc(s, -1.7 + k * 1.15, 0.82, 0.22, GOLD[2], 0.42)
    for k in range(6):
        disc(s, -3.5 + k * 1.4, 0.05, 0.85, strong, 0.5 + k * 0.012, 0.55, 14, 0, math.pi)


def thing_tower(s, p):
    strong, deep, pale = p
    cut(s, [(-1.9, 0.0), (1.9, 0.0), (1.3, 4.6), (-1.3, 4.6)], pale, 0.0)
    for k, y in enumerate((0.9, 2.2, 3.5)):
        rect(s, 0, y, 3.5 - k * 0.38, 0.28, strong, 0.1)
    for side in (-1, 1):
        rect(s, side * 2.4, 0.0, 1.1, 2.8, deep, 0.15)
        cut(s, [(side * 3.15, 2.8), (side * 1.65, 2.8), (side * 2.4, 4.1)], strong, 0.2)
    rect(s, 0, 4.5, 3.4, 0.5, deep, 0.2)
    cut(s, [(-1.6, 4.95), (1.6, 4.95), (0, 6.9)], strong, 0.25)
    disc(s, 0, 5.55, 0.4, GOLD[0], 0.35)
    cut(s, [(-0.6, 0.0), (0.6, 0.0), (0.6, 0.9)] + curve((0.6, 0.9), (-0.6, 0.9), 0.6)[1:], WOOD[0], 0.25)


def thing_umbrella(s, p):
    strong, deep, pale = p
    rect(s, 0, 1.0, 0.22, 3.4, WOOD[1], 0.0)
    strip(s, curve((0.0, 1.05), (-1.1, 1.05), 0.65), 0.24, WOOD[1], 0.02)
    cut(s, curve((3.4, 3.7), (-3.4, 3.7), 2.5, 24) + [(x, 3.7 + (0.4 if i % 2 else 0.0)) for i, x in enumerate((-2.25, -1.7, -1.1, -0.55, 0.0, 0.55, 1.1, 1.7, 2.25), 1)], strong, 0.1)
    for side in (-1, 1):
        cut(s, [(0, 6.1), (side * 1.15, 3.9), (side * 2.25, 4.0)], pale, 0.2)
    disc(s, 0, 6.35, 0.25, deep, 0.3)
    for k in range(12):
        x, y = -3.8 + k * 0.7, 0.6 + ((k * 5) % 7) * 0.33
        if abs(x) > 0.5:
            cut(s, [(x - 0.17, y), (x, y - 0.2), (x + 0.17, y), (x + 0.05, y + 0.5)], deep, 0.15)


def thing_volcano(s, p):
    strong, deep, pale = p
    for k, (x, y, r) in enumerate(((0.2, 4.7, 0.9), (1.1, 5.6, 1.05), (-0.5, 5.9, 0.8), (0.4, 6.6, 0.75))):
        disc(s, x, y, r, mix(pale, WHITE, k * 0.2), 0.0 + k * 0.015)
    cut(s, [(-3.8, 0.0), (3.8, 0.0), (1.2, 3.9), (-1.2, 3.9)], deep, 0.1)
    cut(s, [(-1.2, 3.9), (1.2, 3.9), (1.5, 3.4), (0.9, 2.5), (0.55, 3.2), (0.1, 1.4), (-0.35, 3.1), (-0.8, 2.2), (-1.5, 3.45)], c("#ff6a2e"), 0.2)
    for x, y in ((-2.3, 4.8), (2.6, 4.4), (-1.6, 5.8)):
        spark(s, x, y, 0.35, 0.14, 4, GOLD[0], 0.15)


def thing_whale(s, p):
    strong, deep, pale = p
    cut(s, [(-2.6, 2.4), (-3.4, 3.6), (-4.4, 4.2), (-3.6, 3.0), (-4.2, 2.0), (-3.0, 2.2), (-2.4, 1.7)], deep, 0.0)
    cut(s, [(-3.0, 2.3)] + curve((-3.0, 2.3), (3.4, 2.6), 2.2, 22)[1:-1] + [(3.4, 2.6)] + curve((3.4, 2.6), (-3.0, 1.7), 1.5, 22)[1:], strong, 0.1)
    cut(s, [(3.35, 2.1)] + curve((3.35, 2.1), (-1.8, 1.25), 1.0, 18)[1:] + curve((-1.8, 1.25), (3.35, 2.1), 0.25, 18)[1:-1], pale, 0.2)
    disc(s, 2.2, 2.9, 0.3, WHITE, 0.25)
    disc(s, 2.28, 2.9, 0.15, INK, 0.33)
    for side in (-1.0, 0.0, 1.0):
        strip(s, curve((1.0, 4.3), (1.0 + side * 1.5, 5.7 - abs(side) * 0.3), -side * 0.65), [0.15 + k * 0.012 for k in range(15)], c("#bfe9ff"), 0.05 + side * 0.01)
        disc(s, 1.0 + side * 1.55, 5.75 - abs(side) * 0.3, 0.28, c("#bfe9ff"), 0.1)


def thing_xylophone(s, p):
    strong, deep, pale = p
    cut(s, [(-3.8, 1.1), (3.8, 2.1), (3.8, 2.5), (-3.8, 1.5)], WOOD[1], 0.0)
    cut(s, [(-3.8, 3.5), (3.8, 3.0), (3.8, 3.4), (-3.8, 3.9)], WOOD[1], 0.0)
    for k in range(8):
        h = 4.0 - k * 0.3
        rect(s, -3.15 + k * 0.9, 2.5 - h / 2 + k * 0.06, 0.65, h, PAPERS[k][0], 0.1)
        for end in (0.25, h - 0.25):
            disc(s, -3.15 + k * 0.9, 2.5 - h / 2 + k * 0.06 + end, 0.12, CREAM, 0.2)
    for side in (-1, 1):
        rect(s, side * 0.8 + 0.4, 3.6, 0.16, 2.4, WOOD[2], 0.25, -side * 0.55)
        disc(s, side * 0.8 + 0.4 + side * 1.28, 5.7, 0.4, deep, 0.35)


def thing_yarn(s, p):
    strong, deep, pale = p
    thread = [(1.4 + k * 0.1, 0.55 + 0.35 * math.sin(k * 0.55) * (k / 26)) for k in range(27)]
    strip(s, thread, 0.2, strong, 0.0)
    for x, y, angle in ((-0.2, 0.0, 0.5), (0.4, 0.0, -0.6)):
        rect(s, x, 2.4, 0.2, 3.9, WOOD[2], 0.05, angle)
    disc(s, 0, 2.7, 2.4, strong, 0.15)
    for k in range(6):
        strip(s, curve((-2.1 + k * 0.25, 3.7 - k * 0.45), (1.2 + k * 0.2, 5.0 - k * 0.7), -0.8), 0.17, (pale, deep)[k % 2], 0.25 + k * 0.014)
    for x, y, angle in ((-1.12, 4.45, 0.5), (1.72, 4.35, -0.6)):
        disc(s, x - math.sin(angle) * 1.8, y + math.cos(angle) * 1.3, 0.3, GOLD[0], 0.1)


def thing_zeppelin(s, p):
    strong, deep, pale = p
    for side in (-1, 1):
        cut(s, [(-2.6, 3.9), (-4.5, 3.9 + side * 1.8), (-4.0, 3.9)], deep, 0.0 + (side + 1) * 0.01)
    disc(s, 0.2, 3.9, 3.8, strong, 0.1, 1.75, 36)
    for rx in (2.6, 1.3):
        disc(s, 0.2, 3.9, rx, mix(strong, WHITE, 0.25 if rx > 2 else 0.5), 0.2 + (2.6 - rx) * 0.06, 1.72, 30)
    for side in (-0.8, 0.8):
        rect(s, 0.2 + side, 1.35, 0.1, 1.0, INK, 0.05)
    cut(s, [(-1.3, 1.6), (1.7, 1.6), (1.25, 0.6), (-0.85, 0.6)], deep, 0.35)
    for k in range(4):
        disc(s, -0.7 + k * 0.6, 1.15, 0.18, GOLD[2], 0.45)
    for x, y in ((-3.2, 1.2), (3.2, 5.9)):
        cloud(s, x, y, 0.7, WHITE, 0.05)


THINGS = dict(zip(LETTERS, (
    (thing_number, city), (thing_anchor, waves), (thing_bell, hills), (thing_crown, city),
    (thing_dragon, mountains), (thing_eye, sky_night), (thing_fish, waves), (thing_gate, forest),
    (thing_hourglass, mountains), (thing_ink, city), (thing_jellyfish, waves), (thing_key, hills),
    (thing_lantern, forest), (thing_moon, sky_night), (thing_nest, forest), (thing_owl, sky_night),
    (thing_plane, hills), (thing_quill, mountains), (thing_rose, hills), (thing_ship, waves),
    (thing_tower, mountains), (thing_umbrella, city), (thing_volcano, forest), (thing_whale, waves),
    (thing_xylophone, hills), (thing_yarn, city), (thing_zeppelin, sky_night),
)))


def pop_ups(scene, mesh):
    for index, (char, key) in enumerate(zip(LETTERS, KEYS)):
        paper = PAPERS[index % len(PAPERS)]
        other = PAPERS[(index + 3) % len(PAPERS)]
        thing, land = THINGS[char]
        land(mesh(f"pb_pop_{key}_0"), other)

        shape = mesh(f"pb_pop_{key}_1")
        for k in range(15):
            a, b = math.pi * k / 15, math.pi * (k + 1) / 15
            cut(shape, [(-4.9, 0.0), (-4.9 + 4.6 * math.cos(a), 5.4 * math.sin(a)), (-4.9 + 4.6 * math.cos(b), 5.4 * math.sin(b))], (CREAM, paper[2])[k % 2], k % 2 * 0.012)
        rect(shape, -4.9, -0.5, 9.8, 1.1, paper[1], 0.1)
        letter(shape, glyph(scene, char, 6.6, 0.06, 0.13), Matrix.Translation((-4.9, 0.75, 0.2)), WHITE, PAPER_EDGE)
        letter(shape, glyph(scene, char, 6.6, 0.16), Matrix.Translation((-4.9, 0.75, 0.4)), paper[0], paper[1])
        for k, (x, y, r) in enumerate(((-8.9, 5.3, 0.55), (-1.0, 5.6, 0.4), (-9.4, 2.2, 0.35))):
            spark(shape, x, y, r, r * 0.4, 5, GOLD[k % 3], 0.2)

        shape = mesh(f"pb_pop_{key}_2")
        holder = Shape()
        thing(holder, paper)
        shape.verts = [(x + 5.0, y + 0.35, z) for x, y, z in holder.verts]
        shape.faces, shape.colors = holder.faces, holder.colors
        rect(shape, 5.0, -0.5, 5.6, 0.9, paper[1], 0.75)


# ---------------------------------------------------------------- the book


def page_points(side, columns=40):
    """Distances from the spine, closer together where the page curves most."""
    return [WIDE * (k / columns) ** 1.5 * side for k in range(columns + 1)]


def pages(mesh):
    for side, name in ((-1, "pb_page_l"), (1, "pb_page_r")):
        shape = mesh(name)
        xs = sorted(page_points(side))
        for a, b in zip(xs, xs[1:]):
            ya, yb = page_height(abs(a)), page_height(abs(b))
            shape.face([(a, ya, -DEEP), (a, ya, DEEP), (b, yb, DEEP), (b, yb, -DEEP)], CREAM)


def book(paint, glow):
    base = -1.7
    xs = sorted(set(page_points(-1) + page_points(1)))
    # The edges of the pages below the open ones, in thin stripes.
    stripes = 9
    for a, b in zip(xs, xs[1:]):
        ya, yb = page_height(abs(a)) - 0.004, page_height(abs(b)) - 0.004
        for k in range(stripes):
            low, high = k / stripes, (k + 1) / stripes
            color = (CREAM, c("#e6d4a8"), c("#f3e6c4"))[k % 3]
            for z in (-DEEP, DEEP):
                shape = [(a, base + (ya - base) * low, z), (b, base + (yb - base) * low, z), (b, base + (yb - base) * high, z), (a, base + (ya - base) * high, z)]
                paint.face(shape if z > 0 else shape[::-1], color)
    for x in (-WIDE, WIDE):
        top = page_height(WIDE) - 0.004
        for k in range(stripes):
            low, high = base + (top - base) * k / stripes, base + (top - base) * (k + 1) / stripes
            face = [(x, low, DEEP), (x, low, -DEEP), (x, high, -DEEP), (x, high, DEEP)]
            paint.face(face if x > 0 else face[::-1], (CREAM, c("#e6d4a8"), c("#f3e6c4"))[k % 3])

    # The cover.
    box(paint, (0, (base + DESK) / 2, 0), ((WIDE + 0.9) * 2, base - DESK, (DEEP + 0.9) * 2), LEATHER[1], top=LEATHER[0])
    for z in (-DEEP - 0.5, DEEP + 0.5):
        box(paint, (0, base + 0.03, z), ((WIDE + 0.2) * 2, 0.06, 0.14), GOLD[0])
    for x in (-WIDE - 0.5, WIDE + 0.5):
        box(paint, (x, base + 0.03, 0), (0.14, 0.06, (DEEP + 0.2) * 2), GOLD[0])
    for sx in (-1, 1):
        for sz in (-1, 1):
            corner = v(sx * (WIDE + 0.95), base + 0.1, sz * (DEEP + 0.95))
            points = [corner, corner + v(-sx * 3.0, 0, 0), corner + v(0, 0, -sz * 3.0)]
            if sx * sz > 0:
                points.reverse()
            paint.face(points, GOLD[1])
            ball(paint, corner + v(-sx * 0.8, 0.1, -sz * 0.8), 0.35, GOLD[2], 8, 5)
    rod(paint, (0, DESK + 0.45, -DEEP - 0.95), (0, DESK + 0.45, DEEP + 0.95), 0.75, 0.75, LEATHER[2], 12)

    # The ribbon that marks the place, down the gutter and over the front edge.
    red, dark = c("#e0324f"), c("#a81c3a")
    path = [(0.0, 0.07, -DEEP + 0.3 + k * 0.9) for k in range(24)]
    path = [p for p in path if p[2] <= DEEP]
    path += [(0.1, 0.0, DEEP + 0.15), (0.35, -1.2, DEEP + 1.1), (0.7, DESK + 0.12, DEEP + 2.0), (1.4, DESK + 0.1, DEEP + 3.4), (1.7, DESK + 0.1, DEEP + 5.2)]
    for k, (a, b) in enumerate(zip(path, path[1:])):
        paint.face([(a[0] - 0.55, a[1], a[2]), (b[0] - 0.55, b[1], b[2]), (b[0] + 0.55, b[1], b[2]), (a[0] + 0.55, a[1], a[2])], red if k % 2 else mix(red, dark, 0.25))
    x, y, z = path[-1]
    paint.face([(x - 0.55, y, z), (x - 0.55, y, z + 1.3), (x, y, z + 0.5)], dark)
    paint.face([(x + 0.55, y, z), (x, y, z + 0.5), (x + 0.55, y, z + 1.3)], dark)

    # Headbands of two colors at the ends of the gutter.
    for z in (-DEEP - 0.1, DEEP + 0.1):
        for k in range(12):
            rod(glow, (-0.9 + k * 0.15, -0.05, z), (-0.9 + (k + 1) * 0.15, -0.05, z), 0.1, 0.1, (GOLD[0], red)[k % 2], 8)


def turned(a, z, t):
    """A point of the turning page, "a" from the spine: the way it bends at the moment "t"."""
    swing = math.sin(math.pi * t)
    steps = 24
    x = y = 0.0
    for k in range(steps):
        part = a * (k + 0.5) / steps
        # The outer edge lags behind, and the front corner a bit more.
        angle = math.pi * t - swing * (part / WIDE) * (0.85 + 0.22 * z / DEEP)
        x += math.cos(angle) * a / steps
        y += math.sin(angle) * a / steps
    return x, y + page_height(a) * (1 - swing) + 0.035, z


def leaf(scene, material):
    columns, rows = 36, 20
    grid = [(WIDE * i / columns, -DEEP + 2 * DEEP * j / rows) for i in range(columns + 1) for j in range(rows + 1)]
    faces = []
    for i in range(columns):
        for j in range(rows):
            a = i * (rows + 1) + j
            b = a + rows + 1
            faces.append((a, a + 1, b + 1, b))

    def pose(k):
        points = (turned(a, z, k / (POSES - 1)) for a, z in grid)
        return [(x, -z, y) for x, y, z in points]

    mesh = bpy.data.meshes.new("pb_leaf")
    mesh.from_pydata(pose(0), [], faces)
    colors = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    colors.data.foreach_set("color", [c_ for face in faces for _ in face for c_ in CREAM])
    mesh.color_attributes.active_color = colors
    mesh.materials.append(material)
    mesh.update()
    holder = bpy.data.objects.new("pb_leaf", mesh)
    scene.collection.objects.link(holder)
    holder.shape_key_add(name="Basis", from_mix=False)
    for k in range(1, POSES):
        key = holder.shape_key_add(name=f"turn_{k:02d}", from_mix=False)
        key.data.foreach_set("co", [value for point in pose(k) for value in point])
    print(f"[popup] pb_leaf: {len(faces)} faces, {POSES} poses")


# ---------------------------------------------------------------- what the page repeats


CARD = (2.4, 1.875, 1.55)


def card(shape):
    """A card that stands on a folded foot. The page paints the term on its front."""
    w, h, middle = CARD
    low, high = middle - h / 2, middle + h / 2
    cut(shape, [(-w / 2 - 0.17, low - 0.17), (w / 2 + 0.17, low - 0.17), (w / 2 + 0.17, high + 0.1)] + curve((w / 2 + 0.17, high + 0.1), (-w / 2 - 0.17, high + 0.1), 0.38)[1:], GOLD[0], -0.14)
    cut(shape, [(-w / 2 - 0.07, low - 0.07), (w / 2 + 0.07, low - 0.07), (w / 2 + 0.07, high + 0.07), (-w / 2 - 0.07, high + 0.07)], WHITE, -0.06)
    for side in (-1, 1):
        cut(shape, [(side * 0.95, 0.0), (side * 0.45, 0.0), (side * 0.55, low), (side * 0.85, low)], CREAM, -0.12)
        box(shape, (side * 0.7, 0.03, 0.22), (0.62, 0.05, 0.55), PAPER_EDGE)
    spark(shape, 0, high + 0.52, 0.26, 0.11, 5, GOLD[2], -0.1)


def tabs(scene, mesh):
    """The thumb index of a dictionary: one tab for every letter, lying flat."""
    flat = Matrix.Rotation(-math.pi / 2, 4, "X")
    for index, (char, key) in enumerate(zip(LETTERS, KEYS)):
        paper = PAPERS[index % len(PAPERS)]
        shape = mesh(f"pb_tab_{key}")
        box(shape, (0, 0, 0), (1.5, 0.12, 0.66), paper[1], top=paper[0])
        letter(shape, glyph(scene, char, 0.62, 0.02), Matrix.Translation((0.12, 0.09, 0.22)) @ flat, WHITE, paper[2])


def arrow(shape):
    """The sign at an outer edge: a walk past it turns the page. It points to +x."""
    flat = [(-1.1, -0.32), (0.1, -0.32), (0.1, -0.85), (1.2, 0.0), (0.1, 0.85), (0.1, 0.32), (-1.1, 0.32)]
    for lift, grow, color in ((0.0, 1.0, GOLD[0]), (0.02, 0.62, GOLD[2])):
        points = [(x * grow, lift, y * grow) for x, y in flat]
        shape.face(points[::-1], color)


def crane(shape):
    """A folded paper crane that flies toward +x."""
    white, shade, fold = c("#fff6e6"), c("#e4d3b8"), c("#ffd0d8")
    shape.face([(-0.5, 0, 0), (0.1, 0.12, 0.2), (0.6, 0, 0)], white)
    shape.face([(0.6, 0, 0), (0.1, 0.12, -0.2), (-0.5, 0, 0)], shade)
    shape.face([(-0.5, 0, 0), (0.6, 0, 0), (0.0, -0.3, 0)], shade)
    for side in (-1, 1):
        shape.face([(0.35, 0.05, side * 0.12), (-0.15, 0.75, side * 1.5), (-0.3, 0.05, side * 0.12)], white if side > 0 else fold)
    shape.face([(0.45, 0.0, 0.0), (1.2, 0.7, 0.0), (0.7, 0.05, 0.0)], fold)
    shape.face([(1.2, 0.7, 0.0), (1.55, 0.5, 0.0), (1.12, 0.55, 0.0)], shade)
    shape.face([(-0.4, 0.0, 0.0), (-1.35, 0.75, 0.0), (-0.65, 0.0, 0.0)], white)


def flame(shape):
    for radius, height, lift, color in ((0.42, 1.5, 0.0, c("#ff8a2e")), (0.26, 1.0, 0.0, c("#ffd45a")), (0.13, 0.55, 0.02, WHITE)):
        sides = 9
        rim = [(radius * math.cos(TAU * i / sides), 0.32 * radius + lift, radius * math.sin(TAU * i / sides)) for i in range(sides)]
        for i in range(sides):
            j = (i + 1) % sides
            shape.face([(0, lift - radius * 0.35, 0), rim[i], rim[j]], color)
            shape.face([rim[j], rim[i], (radius * 0.12, height, 0)], color)


# ---------------------------------------------------------------- the desk


def desk(paint):
    plank = 7.0
    for k in range(-11, 11):
        x = k * plank
        z = -75.0
        while z < 75.0:
            length = random.uniform(22, 48)
            end = min(z + length, 75.0)
            color = mix(WOOD[1], WOOD[2], random.random())
            paint.face([(x, DESK, z), (x, DESK, end), (x + plank - 0.12, DESK, end), (x + plank - 0.12, DESK, z)], color)
            z = end + 0.1
        paint.face([(x + plank - 0.12, DESK - 0.03, -75), (x + plank - 0.12, DESK - 0.03, 75), (x + plank, DESK - 0.03, 75), (x + plank, DESK - 0.03, -75)], c("#2a170f"))


def closed_book(paint, center, size, color, turn):
    x, y, z = center
    w, h, d = size
    matrix = Matrix.Translation((x, y, z)) @ Matrix.Rotation(turn, 4, "Y")

    def part(offset, measure, shade, top=None):
        box(paint, matrix @ Vector(offset), measure, shade, Matrix.Rotation(turn, 4, "Y"), top)

    for side in (-1, 1):
        part((0, side * (h / 2 - 0.15), 0), (w, 0.3, d), color)
    part((-w / 2 + 0.2, 0, 0), (0.4, h - 0.3, d), color)
    part((0.1, 0, 0), (w - 0.5, h - 0.6, d - 0.4), c("#efe1bd"))
    for share in (-0.3, 0.3):
        part((-w / 2 - 0.02, 0, share * d), (0.05, h * 0.9, d * 0.07), GOLD[0])


def stacks(paint):
    shades = [paper[1] for paper in PAPERS] + [LEATHER[0], c("#1f4a52"), c("#2c2f6b")]
    for x, z, count in ((-27, 9, 4), (28, -3, 6), (-31, -27, 5), (30, -31, 3), (-17, -45, 2), (33, 20, 2), (-39, -9, 7)):
        y = DESK
        for _ in range(count):
            w, h, d = random.uniform(9, 13), random.uniform(1.5, 2.8), random.uniform(7, 10)
            closed_book(paint, (x + random.uniform(-0.8, 0.8), y + h / 2, z + random.uniform(-0.8, 0.8)), (w, h, d), random.choice(shades), random.uniform(-0.5, 0.5))
            y += h


def ink_and_quill(paint, glow):
    foot = v(-23, DESK, -6)
    glass, shine = c("#14214f"), c("#2b4a9c")
    rod(paint, foot, foot + v(0, 0.6, 0), 3.4, 3.9, glass, 18)
    rod(paint, foot + v(0, 0.6, 0), foot + v(0, 4.2, 0), 3.9, 3.9, glass, 18)
    rod(paint, foot + v(0, 4.2, 0), foot + v(0, 5.4, 0), 3.9, 1.7, shine, 18)
    rod(paint, foot + v(0, 5.4, 0), foot + v(0, 6.6, 0), 1.7, 1.7, glass, 18)
    rod(paint, foot + v(0, 6.4, 0), foot + v(0, 7.0, 0), 2.1, 2.1, BRASS[0], 18)
    for k in range(18):
        angle = TAU * k / 18
        rod(paint, foot + v(3.95 * math.cos(angle), 1.5, 3.95 * math.sin(angle)), foot + v(3.95 * math.cos(angle), 3.4, 3.95 * math.sin(angle)), 0.07, 0.07, BRASS[1], 5)
    # The quill that stands in it.
    start, end = foot + v(0.3, 5.0, 0), foot + v(5.5, 22.0, -4.0)
    spine = [start.lerp(end, k / 30) + v(math.sin(k / 30 * math.pi) * -1.2, 0, 0) for k in range(31)]
    for k in range(30):
        rod(paint, spine[k], spine[k + 1], 0.24 - k * 0.006, 0.24 - (k + 1) * 0.006, CREAM, 7, False)
    across = (end - start).cross(v(0, 0, 1)).normalized()
    for k in range(7, 30):
        wide = 3.1 * math.sin(math.pi * (k - 6) / 25)
        for side in (-1, 1):
            tip = spine[min(k + 3, 30)] + across * wide * side
            color = mix(c("#7fe0e8"), c("#7a5cd6"), (k - 7) / 23)
            paint.face([spine[k], spine[k + 1], tip], color if side > 0 else mix(color, WHITE, 0.3))
    ball(glow, foot + v(-2.9, 3.2, 2.5), (0.18, 0.9, 0.18), c("#9fc4ff"), 8, 6)


def candle(paint, x, z, height):
    foot = v(x, DESK, z)
    rod(paint, foot, foot + v(0, 0.5, 0), 3.0, 2.7, BRASS[1], 18)
    rod(paint, foot + v(0, 0.5, 0), foot + v(0, 1.4, 0), 0.9, 1.5, BRASS[0], 18)
    top = foot + v(0, 1.4 + height, 0)
    rod(paint, foot + v(0, 1.4, 0), top, 1.15, 1.1, c("#f6ead0"), 16)
    for k in range(9):
        angle = TAU * k / 9 + 0.3
        edge = top + v(1.12 * math.cos(angle), 0, 1.12 * math.sin(angle))
        fall = random.uniform(0.5, 2.2)
        rod(paint, edge, edge - v(0, fall, 0), 0.2, 0.16, c("#fff6e0"), 7)
        ball(paint, edge - v(0, fall, 0), 0.23, c("#fff6e0"), 7, 5)
    rod(paint, top, top + v(0, 0.5, 0), 0.07, 0.05, INK, 6)
    return [round(value, 3) for value in (top.x, top.y + 0.55, top.z)]


def lamp(paint, glow):
    green, dark = c("#1f6b57"), c("#123f35")
    foot, knee, neck, head = v(25, DESK, -19), v(29, 17, -21), v(17, 25, -17), v(10.5, 21.5, -13)
    rod(paint, foot, foot + v(0, 1.2, 0), 5.2, 4.4, BRASS[1], 20)
    for a, b in ((foot + v(0, 1.2, 0), knee), (knee, neck), (neck, head)):
        rod(paint, a, b, 0.55, 0.55, BRASS[0], 10)
        ball(paint, b, 1.0, BRASS[1], 12, 8)
    aim = (v(0, 0, -2) - head).normalized()
    rim = head + aim * 5.5
    rod(paint, head - aim * 0.4, rim, 1.4, 5.6, green, 24, False)
    side = aim.orthogonal().normalized()
    other = aim.cross(side)
    ring = [rim + (side * math.cos(TAU * k / 24) + other * math.sin(TAU * k / 24)) * 5.6 for k in range(25)]
    paint.tube(ring, 0.28, BRASS[0], 6)
    ball(glow, head + aim * 3.2, 2.1, c("#ffedb8"), 14, 10)
    ball(paint, head - aim * 0.6, 1.5, dark, 14, 8)


def magnifier(paint):
    center = v(24, DESK + 0.8, 13)
    ring = [center + v(5.0 * math.cos(TAU * k / 48), 0, 5.0 * math.sin(TAU * k / 48)) for k in range(49)]
    paint.tube(ring, 0.75, BRASS[0], 10)
    paint.face([center + v(4.7 * math.cos(-TAU * k / 32), -0.4, 4.7 * math.sin(-TAU * k / 32)) for k in range(32)], c("#6f9fb8"))
    for k, (r, a) in enumerate(((3.6, 3.7), (2.8, 3.9))):
        arc = [center + v(r * math.cos(a + i * 0.08), -0.32, r * math.sin(a + i * 0.08)) for i in range(12)]
        paint.tube(arc, 0.16 - k * 0.05, c("#e8f8ff"), 5)
    way = v(0.55, 0, 0.83).normalized()
    rod(paint, center + way * 5.4, center + way * 7.0, 0.75, 1.0, BRASS[1], 12)
    rod(paint, center + way * 7.0, center + way * 14.5, 1.15, 0.95, LEATHER[2], 12)
    ball(paint, center + way * 14.6, 1.1, BRASS[0], 12, 8)


def spectacles(paint):
    y = DESK + 0.45
    middle = v(-9, y, 19)
    for side in (-1, 1):
        center = middle + v(side * 4.0, 0, 0)
        paint.tube([center + v(3.2 * math.cos(TAU * k / 40), 0, 2.6 * math.sin(TAU * k / 40)) for k in range(41)], 0.32, BRASS[0], 8)
        arm = [center + v(side * 3.2, 0, 0), center + v(side * 4.2, 0.3, 1.0), center + v(side * 4.0, 0.2, 6.0), center + v(side * 2.8, -0.1, 8.4)]
        paint.tube(arm, 0.26, BRASS[1], 7)
    paint.tube([middle + v(-0.8 + k * 0.2, math.sin(math.pi * k / 8) * 0.8, -0.8) for k in range(9)], 0.26, BRASS[0], 7)


def type_blocks(scene, paint):
    """Blocks of a letterpress that someone left on the desk."""
    flat = Matrix.Rotation(-math.pi / 2, 4, "X")
    words = (("SOLARIS", 4.0, 19.5, 0.0), ("TERMS", -27.0, 24.0, 0.35), ("WUWA", 30.0, 33.0, -0.4))
    for word, start, z, lean in words:
        for k, char in enumerate(word):
            turn = Matrix.Rotation(lean + random.uniform(-0.22, 0.22), 4, "Y")
            at = v(start + k * 3.1 * math.cos(lean), DESK + 1.2, z - k * 3.1 * math.sin(lean) + random.uniform(-0.5, 0.5))
            box(paint, at, (2.4, 2.4, 2.4), c("#8b8fa6"), turn, c("#b8bcd1"))
            letter(paint, glyph(scene, char, 1.9, 0.12), Matrix.Translation(at + v(0, 1.28, 0)) @ turn @ Matrix.Translation((0, 0, 0.68)) @ flat, PAPERS[k % 8][0], PAPERS[k % 8][1])


def small_things(paint):
    # A pencil.
    a, b = v(-33, DESK + 0.7, 2), v(-20, DESK + 0.7, 17)
    way = (b - a).normalized()
    rod(paint, a, a + way * 1.4, 0.68, 0.68, c("#ff8fa6"), 8)
    rod(paint, a + way * 1.4, a + way * 2.3, 0.72, 0.72, c("#c9d0e0"), 8)
    rod(paint, a + way * 2.3, b, 0.68, 0.68, c("#f2b82c"), 6)
    rod(paint, b, b + way * 2.0, 0.68, 0.14, c("#e8bf8c"), 6)
    rod(paint, b + way * 2.0, b + way * 2.5, 0.15, 0.02, INK, 6)
    # Letters under seals.
    for k, (x, z, turn) in enumerate(((19, 27, 0.5), (23, 29, -0.2), (-19, -14, 0.9), (38, 4, -0.7))):
        matrix = Matrix.Translation((x, DESK + 0.12 + k * 0.03, z)) @ Matrix.Rotation(turn, 4, "Y")
        box(paint, matrix.translation, (8.0, 0.16, 5.2), c("#d9c598"), Matrix.Rotation(turn, 4, "Y"), c("#f3e4bd"))
        for ends in (((-4, 0.1, -2.6), (0, 0.1, 0.4)), ((4, 0.1, -2.6), (0, 0.1, 0.4))):
            rod(paint, matrix @ Vector(ends[0]), matrix @ Vector(ends[1]), 0.07, 0.07, c("#c4ab74"), 5)
        ball(paint, matrix @ v(0, 0.14, 0.4), (0.85, 0.28, 0.85), LEATHER[2], 14, 6)
    # A cup of tea.
    foot = v(-25, DESK, 26)
    rod(paint, foot, foot + v(0, 0.5, 0), 5.2, 5.8, c("#dfeaff"), 22)
    rod(paint, foot + v(0, 0.5, 0), foot + v(0, 5.4, 0), 2.6, 3.9, c("#f4f8ff"), 22, False)
    rod(paint, foot + v(0, 3.7, 0), foot + v(0, 4.2, 0), 3.5, 3.66, c("#4a8fe7"), 22, False)
    paint.face([foot + v(3.7 * math.cos(-TAU * k / 22), 5.0, 3.7 * math.sin(-TAU * k / 22)) for k in range(22)], c("#a4521f"))
    paint.tube([foot + v(3.4 + 1.9 * math.sin(math.pi * k / 14), 4.7 - 3.2 * k / 14, 0) for k in range(15)], 0.42, c("#f4f8ff"), 8)


def room(paint, glow):
    """Shelves of books all around, and one window with the moon."""
    radius, count = 88.0, 44
    shades = [paper[k] for paper in PAPERS for k in (0, 1)]
    dim = c("#1a1030")
    wide = TAU * radius / count
    for k in range(count):
        angle = TAU * k / count
        # The window is straight ahead of a new visitor.
        out = v(math.sin(angle), 0, -math.cos(angle))
        along = v(math.cos(angle), 0, math.sin(angle))
        if k in (0, 1, count - 1):
            continue
        turn = Matrix((along, v(0, 1, 0), -out)).transposed().to_4x4()
        middle = out * radius
        fade = 0.35 + 0.2 * random.random()
        box(paint, middle + out * 2.2 + v(0, 18, 0), (wide + 0.4, 42, 0.4), mix(WOOD[1], dim, 0.65), turn)
        box(paint, middle - along * (wide / 2) + v(0, 18, 0), (0.9, 42, 3.4), mix(WOOD[0], dim, 0.4), turn)
        for row in range(6):
            floor = DESK + row * 6.9
            box(paint, middle + v(0, floor, 0), (wide, 0.5, 3.4), mix(WOOD[2], dim, 0.35), turn)
            x = -wide / 2 + 0.7
            while x < wide / 2 - 1.4:
                w, h = random.uniform(0.7, 1.7), random.uniform(3.2, 6.0)
                lean = random.random()
                if lean > 0.12:
                    color = mix(random.choice(shades), dim, fade + row * 0.05)
                    spot = middle + along * (x + w / 2) + v(0, floor + 0.25 + h / 2, 0)
                    box(paint, spot, (w, h, 2.4), color, turn)
                    if lean > 0.7:
                        face = spot - out * 1.23
                        box(paint, face + v(0, h * 0.28, 0), (w * 0.85, 0.22, 0.05), mix(GOLD[1], dim, fade), turn)
                x += w + 0.08

    # The window, with the night behind it.
    z = -radius - 1.0
    half, spring = 15.5, 24.0
    outline = [(-half, DESK), (half, DESK), (half, spring)] + [(half * math.cos(a), spring + half * math.sin(a)) for a in (math.pi * k / 24 for k in range(1, 24))] + [(-half, spring)]
    glow.face([(x, y, z) for x, y in outline], c("#16245c"))
    for k in range(150):
        x, y = random.uniform(-half + 1, half - 1), random.uniform(DESK + 8, spring + half - 2)
        if y > spring and math.hypot(x, y - spring) > half - 1:
            continue
        size = random.uniform(0.1, 0.34)
        glow.face([(x, y - size, z + 0.1), (x + size * 0.4, y, z + 0.1), (x, y + size, z + 0.1), (x - size * 0.4, y, z + 0.1)], mix(WHITE, c("#9fc4ff"), random.random()))
    moon = (6.0, 26.0)
    for radius_, color, lift in ((7.2, c("#2a3f87"), 0.15), (5.4, c("#fff2c4"), 0.2)):
        glow.face([(moon[0] + radius_ * math.cos(TAU * k / 32), moon[1] + radius_ * math.sin(TAU * k / 32), z + lift) for k in range(32)], color)
    for x, y, r in ((4.5, 27.5, 1.2), (8.0, 24.0, 0.8), (6.8, 28.4, 0.5)):
        glow.face([(x + r * math.cos(TAU * k / 14), y + r * math.sin(TAU * k / 14), z + 0.25) for k in range(14)], c("#e8d49a"))
    frame = mix(WOOD[2], dim, 0.25)
    paint.tube([(x, y, z + 0.8) for x, y in outline + outline[:1]], 1.0, frame, 8)
    for x in (-half / 3, half / 3):
        rod(paint, (x, DESK, z + 0.8), (x, spring + math.sqrt(half * half - x * x), z + 0.8), 0.4, 0.4, frame, 8)
    for y in (12.0, spring):
        rod(paint, (-half, y, z + 0.8), (half, y, z + 0.8), 0.4, 0.4, frame, 8)

    # The dark above the shelves, with lamps that float there.
    for k in range(count):
        a, b = TAU * k / count, TAU * (k + 1) / count
        low = 39.0
        rim = [v(radius * math.sin(t), low, -radius * math.cos(t)) for t in (a, b)]
        paint.face([rim[0], rim[1], v(0, low + 38, 0)], c("#120b26"))
    for k in range(110):
        angle = random.uniform(0, TAU)
        away = random.uniform(20, 80)
        at = v(away * math.sin(angle), random.uniform(33, 44), -away * math.cos(angle))
        size = random.uniform(0.15, 0.5)
        for points in (((0, -size, 0), (size, 0, 0), (0, size, 0)), ((0, -size, 0), (-size, 0, 0), (0, size, 0))):
            glow.face([at + Vector(p) for p in points], mix(GOLD[2], WHITE, random.random()))


# ---------------------------------------------------------------- putting it together


def weld(objects):
    """Joins the corners that faces share, so each is stored once for every color it has."""
    import bmesh

    for obj in objects:
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
    # The same desk at every run.
    random.seed(5)
    scene = make_scene("Solaris_Popup", ("pb_", "popup_"))
    lit = make_material("popup_paint")
    shine = make_material("popup_glow")
    # Only for the pictures taken in Blender; the page draws these meshes unlit.
    shader = next(n for n in shine.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    source = next(n for n in shine.node_tree.nodes if n.type == "VERTEX_COLOR")
    shine.node_tree.links.new(source.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 1.0

    meshes = {}

    def mesh(name):
        meshes[name] = Shape()
        return meshes[name]

    paint, glow = mesh("pb_desk"), mesh("pb_desk_glow")
    desk(paint)
    stacks(paint)
    ink_and_quill(paint, glow)
    flames = [candle(paint, -24, 11, 7.5), candle(paint, -30, 17, 4.0), candle(paint, 23, -12, 9.0)]
    lamp(paint, glow)
    magnifier(paint)
    spectacles(paint)
    type_blocks(scene, paint)
    small_things(paint)
    room(mesh("pb_room"), mesh("pb_room_glow"))

    book(mesh("pb_book"), mesh("pb_book_glow"))
    pages(mesh)
    pop_ups(scene, mesh)
    card(mesh("pb_card"))
    tabs(scene, mesh)
    arrow(mesh("pb_arrow_glow"))
    crane(mesh("pb_crane"))
    flame(mesh("pb_flame_glow"))
    drifts = []
    for k, char in enumerate("AEGKLMQRSTWZ"):
        name = f"pb_drift_{k}_glow"
        letter(mesh(name), glyph(scene, char, 1.3, 0.04), Matrix.Translation((0, -0.45, 0)), mix(PAPERS[k % 8][2], GOLD[2], 0.3), PAPERS[k % 8][0])
        angle = TAU * k / 12 + 0.35
        drifts.append([round(21 * math.sin(angle), 2), round(random.uniform(5, 13), 2), round(-17 * math.cos(angle), 2)])

    for name, shape in meshes.items():
        add(scene, shine if name.endswith("_glow") else lit, name, blender(shape))
    weld(list(scene.collection.objects))
    leaf(scene, lit)

    # With the default bits, points this far from zero move by centimeters, and flat things on
    # the ground then flicker through it.
    bits = meshopt.EXP_FILTER_BITS
    meshopt.EXP_FILTER_BITS = 17
    try:
        # The page works out the flat normals itself, which halves the file.
        export(os.path.join(FOLDER, "popup.glb"), normals=False)
    finally:
        meshopt.EXP_FILTER_BITS = bits

    layout = {
        "wide": WIDE,
        "deep": DEEP,
        "walk": WALK,
        "trigger": TRIGGER,
        # The height of a page every half meter from the spine.
        "heights": [round(page_height(k * 0.5), 4) for k in range(int(WIDE * 2) + 1)],
        # The way of a point of the turning page at "trigger" from the spine: x and height.
        "ride": [[round(value, 3) for value in turned(TRIGGER, 0.0, k / (POSES - 1))[:2]] for k in range(POSES)],
        "hinge": HINGE,
        "layers": list(LAYERS),
        "card": {"width": CARD[0], "height": CARD[1], "middle": CARD[2]},
        "flames": flames,
        "drifts": drifts,
    }
    with open(os.path.join(FOLDER, "popup.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(layout, handle, separators=(",", ":"))
        handle.write("\n")

    preview(scene)
    print("[popup] done")


def preview(scene):
    """One spread put together, only for the pictures taken in Blender."""
    change = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

    def show(name, place):
        source = scene.collection.objects[name]
        copy = bpy.data.objects.new(f"popup_show_{name}", source.data)
        scene.collection.objects.link(copy)
        copy.matrix_world = change @ place @ change.inverted()

    parts = [obj for obj in scene.collection.objects if obj.name.startswith(("pb_pop_", "pb_card", "pb_tab_", "pb_arrow", "pb_crane", "pb_flame", "pb_drift", "pb_leaf"))]
    for layer, z in enumerate(LAYERS):
        show(f"pb_pop_A_{layer}", Matrix.Translation((0, HINGE, z)))
    for x, z in ((-7.6, -4.0), (-2.8, -4.4), (-9.4, 1.6), (-4.8, 1.9), (2.8, -4.4), (7.6, -4.0), (4.8, 1.9), (9.4, 1.6)):
        show("pb_card", Matrix.Translation((x, page_height(abs(x)), z)) @ Matrix.Rotation(math.atan2(-x, 8 - z) * 0.55, 4, "Y"))
    for obj in parts:
        obj.hide_set(True)
        obj.hide_render = True
    bpy.context.view_layer.update()


main()
