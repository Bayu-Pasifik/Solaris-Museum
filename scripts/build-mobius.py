"""Builds the Endless Salon, the walkable Möbius strip of the Gallery. Writes
src/assets/gallery/mobius.glb and src/assets/gallery/mobius.json.

    blender --background --factory-startup --python scripts/build-mobius.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Mobius",
and leaves every other scene alone. The model is original low-poly work and holds no game assets.

The whole collection hangs along one giant ribbon with a half twist, after the strips of M. C.
Escher: after one round the visitor walks on the underside of where they began, and after two
they are home. The floor is a tessellation that slowly turns from squares into fish and back.
Around the ribbon float impossible things, and small mannequins carry paintings along its rims.

Positions in this script and in the JSON file are those of the page: x to the right, y up and z
toward the visitor. "place" turns them into Blender's coordinates. A point of the ribbon is told
by "s", the way walked along it, "x" across it and "h" above its floor; "ribbon" bends it into
the world. src/lib/mobius.ts does the same bending in the page.

The meshes are painted with vertex colors. "mb_isle_*" meshes are lit, "mb_glow_*" ones shine by
themselves, "mb_sky_*" is the painted sky, "mb_spin_*" ones turn around the pivot that the JSON file
gives them, "mb_float_*" ones drift up and down, "mb_easel_*" and "mb_gate_*" ones are the easel and
the arch that the page repeats, and "mb_porter_*" ones are the parts of a mannequin that carries a painting.
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
FOLDER = os.path.join(ROOT, "src", "assets", "gallery")

# The ribbon, in meters. "length" is two rounds: the way until the visitor is home again.
LENGTH = 720.0
HALF = 6.2
THICK = 0.9
# How far from the middle a visitor can walk, and where the easels stand.
WALK = 4.6
STAND = 4.5
RADIUS = LENGTH / 2 / TAU
# The height of the hips of a porter.
HIP = 0.65


def c(color):
    return linear(color)


INK = c("#140f33")
NIGHT = c("#231a5c")
IVORY = c("#fdf6e8")
WHITE = c("#ffffff")
GOLD = (c("#ffd45a"), c("#e5a62f"), c("#fff0a8"))
WOOD = (c("#c98752"), c("#a5653a"), c("#e8ac74"))
STONE = (c("#d9cdf2"), c("#a892d6"), c("#8266b8"))
CYAN = c("#45e0ff")
VIOLET = c("#a374ff")
PINK = c("#ff5fa8")
AMBER = c("#ffb02e")
MINT = c("#4fd1b5")
# The floor in the three colors of the collections: light tile, dark tile.
FLOOR_TONES = (("#d8f7f0", "#1c8f7d"), ("#fff0cf", "#d9840f"), ("#ffe1ee", "#c23a7a"))
# Where along the two rounds one color of the floor gives way to the next.
SHARES = (0.0, 0.37, 0.73, 1.0)


def mix(a, b, share):
    share = min(max(share, 0.0), 1.0)
    return [x + (y - x) * share for x, y in zip(a, b)]


def v(x, y, z):
    return Vector((x, y, z))


# ---------------------------------------------------------------- the ribbon


def frame(s):
    """The middle of the ribbon at "s", with the directions across it, above it and along it."""
    theta = s / RADIUS
    phi = theta / 2
    out = v(math.cos(theta), 0, math.sin(theta))
    along = v(-math.sin(theta), 0, math.cos(theta))
    up = v(0, 1, 0)
    above = up * math.cos(phi) + out * math.sin(phi)
    across = out * -math.cos(phi) + up * math.sin(phi)
    return out * RADIUS, across, above, along


def ribbon(x, h, s):
    """A point of the ribbon in the world."""
    middle, across, above, _ = frame(s)
    return middle + across * x + above * (h + THICK / 2)


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


def beam(shape, a, b, width, color, depth=None):
    a, b = Vector(a), Vector(b)
    box(shape, (a + b) / 2, (width, (b - a).length, depth or width), color, toward(a, b))


def rod(shape, a, b, low, high, color, sides=8):
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


def gem(shape, center, radius, height, color):
    x, y, z = center
    waist = [(x + radius * math.cos(TAU * i / 4), y, z + radius * math.sin(TAU * i / 4)) for i in range(4)]
    for i in range(4):
        j = (i + 1) % 4
        shape.face([(x, y - height / 2, z), waist[j], waist[i]], color)
        shape.face([waist[i], waist[j], (x, y + height / 2, z)], color)


def bend_box(shape, x, h, s, size, color):
    """A box that stands on the ribbon."""
    middle, across, above, along = frame(s)
    turn = Matrix((across, above, -along)).transposed().to_4x4()
    box(shape, ribbon(x, h, s), size, color, turn)


# ---------------------------------------------------------------- the floor


COLUMNS = 5
ROWS = 200
STEPS = 12


def morph(s):
    """How far the squares of the floor have turned into fish: three times along the way."""
    share = 0.5 - 0.5 * math.cos(TAU * 3 * s / LENGTH)
    share = min(max((share - 0.12) / 0.76, 0.0), 1.0)
    return share * share * (3 - 2 * share)


def tone(s, light):
    share = (s % LENGTH) / LENGTH
    pick = 0 if light else 1
    colors = [c(pair[pick]) for pair in FLOOR_TONES]
    blend = 0.025
    out = colors[0]
    for index in (1, 2):
        out = mix(out, colors[index], (share - SHARES[index] + blend) / (2 * blend))
    # The last color flows back into the first one.
    return mix(out, colors[0], (share - 1 + blend) / (2 * blend))


def heading(i):
    """The fish of one column swim forward, those of the next one back."""
    return 1 if i % 2 == 0 else -1


def corner(i, j, u=None, w=None):
    """A point of the lines of the tessellation, flat: (x, s). With "u" it lies on the line
    across at row "j", with "w" on the line along at column "i". Two tiles that share a line get
    the same points, so the floor has no gaps."""
    wide, long = HALF * 2 / COLUMNS, LENGTH / ROWS
    if u is not None:
        x = -HALF + (i + u) * wide
        s = j * long
        # The line across bulges into a nose, which leaves a forked tail behind.
        nose = (1 - abs(2 * u - 1)) ** 1.5
        return x, s + 0.3 * heading(i) * nose * long * morph(s)
    x = -HALF + i * wide
    s = (j + w) * long
    if 0 < i < COLUMNS:
        # The lines along swing the other way from one to the next, so every fish has a wide
        # front and a slim tail, and the same on both sides.
        x += heading(i) * 0.22 * math.sin(TAU * w) * wide * morph(s)
    return x, s


def tile(i, j):
    """The outline of one tile, flat."""
    out = []
    out += [corner(i, j, u=k / STEPS) for k in range(STEPS)]
    out += [corner(i + 1, j, w=k / STEPS) for k in range(STEPS)]
    out += [corner(i, j + 1, u=1 - k / STEPS) for k in range(STEPS)]
    out += [corner(i, j, w=1 - k / STEPS) for k in range(STEPS)]
    return out


def floor(paint, glow):
    wide, long = HALF * 2 / COLUMNS, LENGTH / ROWS
    for j in range(ROWS):
        for i in range(COLUMNS):
            light = (i + j) % 2 == 0
            middle_s = (j + 0.5) * long
            paint.face([ribbon(x, 0.0, s) for x, s in reversed(tile(i, j))], tone(middle_s, light))
            # The eyes open when a tile has become a fish.
            amount = morph(middle_s)
            if amount > 0.55:
                grow = (amount - 0.55) / 0.45
                way = heading(i)
                rim, pupil = (INK, WHITE) if light else (WHITE, INK)

                def spot(dx, w):
                    """A point of the fish: "w" runs from its tail to its head."""
                    along = w if way > 0 else 1 - w
                    return -HALF + (i + 0.5 + dx) * wide, (j + along) * long

                for sign in (-1, 1):
                    x, s = spot(sign * 0.2, 0.88)
                    for radius, lift, color in ((0.15 * grow, 0.015, rim), (0.07 * grow, 0.025, pupil)):
                        ring = [(x + radius * math.cos(TAU * k / 10), s + radius * math.sin(TAU * k / 10)) for k in range(10)]
                        glow.face([ribbon(px, lift, ps) for px, ps in reversed(ring)], color)
                # The fin along the back, and one stroke of the tail on each side of it.
                lines = [((0.0, 0.72), (0.0, 0.3), 0.05)] + [((0.0, 0.34), (sign * 0.13, 0.12), 0.028) for sign in (-1, 1)]
                for start, end, half in lines:
                    parts = 6
                    for k in range(parts):
                        edges = []
                        for t in (k / parts, (k + 1) / parts):
                            dx = start[0] + (end[0] - start[0]) * t
                            w = start[1] + (end[1] - start[1]) * t
                            thick = half * grow * math.sin(math.pi * (0.08 + 0.84 * t))
                            edges.append((spot(dx - thick, w), spot(dx + thick, w)))
                        (a0, a1), (b0, b1) = edges
                        corners = [a0, a1, b1, b0]
                        if way < 0:
                            corners.reverse()
                        glow.face([ribbon(px, 0.015, ps) for px, ps in corners], rim)

    # The one edge of the strip, as wide as it is thick.
    pieces = 600
    for k in range(pieces):
        a, b = LENGTH * k / pieces, LENGTH * (k + 1) / pieces
        for low, high, color in ((0.0, -0.18, GOLD[1]), (-0.18, -THICK + 0.18, NIGHT), (-THICK + 0.18, -THICK, GOLD[1])):
            paint.face([ribbon(HALF, low, a), ribbon(HALF, low, b), ribbon(HALF, high, b), ribbon(HALF, high, a)], color)


def rails(paint, glow):
    for x in (-HALF, HALF):
        points = [ribbon(x, 0.04, LENGTH * k / 640) for k in range(641)]
        paint.tube(points, 0.16, GOLD[0], 6)
        # A line of light just inside the rim.
        inner = x - math.copysign(0.42, x)
        for k in range(480):
            if k % 3 == 2:
                continue
            a, b = LENGTH * k / 480, LENGTH * (k + 1) / 480
            face = [ribbon(inner - 0.05, 0.02, a), ribbon(inner + 0.05, 0.02, a), ribbon(inner + 0.05, 0.02, b), ribbon(inner - 0.05, 0.02, b)]
            glow.face(face, (CYAN, AMBER, PINK)[0 if (a / LENGTH) < SHARES[1] else 1 if (a / LENGTH) < SHARES[2] else 2])
    # Beads of the frame.
    for k in range(360):
        s = LENGTH * k / 360
        for x in (-HALF, HALF):
            ball(paint, ribbon(x, 0.1, s), 0.27, GOLD[2], 6, 4)


def lanterns(glow):
    """Lights that drift beside the ribbon."""
    for k in range(64):
        s = LENGTH * k / 64 + 3
        x = (HALF + 1.9) * (1 if k % 2 else -1)
        h = 2.4 + random.random() * 2.6
        color = (CYAN, AMBER, PINK, VIOLET, MINT)[k % 5]
        gem(glow, ribbon(x, h, s), 0.28, 0.9, color)
        gem(glow, ribbon(x, h - 0.85, s), 0.07, 0.24, WHITE)


# ---------------------------------------------------------------- what the page repeats


def stand(paint, glow):
    """An easel. Its picture hangs at z 0, from the height 1 up, and looks toward +z."""
    for side in (-1, 1):
        beam(paint, (side * 0.95, 0.0, 0.12), (side * 0.12, 3.35, -0.22), 0.13, WOOD[0])
        ball(paint, (side * 0.95, 0.06, 0.12), 0.12, GOLD[1], 8, 4)
    beam(paint, (0, 0.0, -1.15), (0, 3.2, -0.25), 0.11, WOOD[1])
    box(paint, (0, 0.86, 0.02), (2.2, 0.14, 0.34), WOOD[2])
    box(paint, (0, 0.96, 0.17), (2.2, 0.12, 0.05), GOLD[0])
    beam(paint, (-0.62, 1.9, -0.12), (0.62, 1.9, -0.12), 0.09, WOOD[1])
    ball(paint, (0, 3.45, -0.23), 0.17, GOLD[2], 10, 6)
    # White, so the page can give every collection its color.
    box(glow, (0, 0.775, 0.1), (2.0, 0.05, 0.22), WHITE)
    for k in range(32):
        a, b = TAU * k / 32, TAU * (k + 1) / 32
        glow.face([(r * math.cos(t), 0.035, r * 0.62 * math.sin(t)) for r, t in ((1.25, a), (1.45, a), (1.45, b), (1.25, b))], WHITE)


def gate(paint, glow):
    """A gilded picture frame that is walked through, at the start of a collection."""
    outer, top = 5.75, 7.0
    for side in (-1, 1):
        x = side * outer
        box(paint, (x, top / 2, 0), (0.62, top, 0.62), GOLD[1])
        box(paint, (x, 0.25, 0), (1.05, 0.5, 1.05), NIGHT)
        box(glow, (x, top / 2, 0.34), (0.16, top - 1.4, 0.04), WHITE)
        box(glow, (x, top / 2, -0.34), (0.16, top - 1.4, 0.04), WHITE)
        ball(paint, (x, top + 0.2, 0), 0.62, GOLD[0], 12, 8)
        # Curls of the frame in the corners.
        curl = []
        for k in range(40):
            t = k / 39
            angle = t * TAU * 1.35
            radius = 1.35 * (1 - t * 0.82)
            curl.append((x - side * (1.5 - radius * math.cos(angle)), top - 1.5 + radius * math.sin(angle), 0))
        paint.tube(curl, 0.12, GOLD[2], 6)
    box(paint, (0, top + 0.2, 0), (outer * 2, 0.55, 0.5), GOLD[0])
    box(paint, (0, top - 0.3, 0), (outer * 2 - 0.6, 0.18, 0.34), GOLD[2])
    for k in range(-5, 6):
        gem(glow, (k * 0.95, top - 0.75, 0), 0.17, 0.5, WHITE)


def porter(body, canvas, leg_a, leg_b):
    """A small mannequin that carries a painting. It looks toward +z, stands on y 0 and holds
    the picture at its side toward +x. The legs swing about the height of the hips."""
    ball(body, (0, HIP + 0.04, 0), (0.12, 0.09, 0.1), WOOD[1], 12, 8)
    rod(body, (0, HIP + 0.08, 0), (0, 1.12, 0), 0.08, 0.17, WOOD[0], 12)
    rod(body, (0, 1.12, 0), (0, 1.22, 0), 0.05, 0.04, WOOD[1], 8)
    ball(body, (0, 1.36, 0.01), (0.12, 0.15, 0.13), WOOD[2], 14, 10)
    # A painter's cap, so the figure reads from far away.
    ball(body, (0, 1.47, 0.01), (0.16, 0.055, 0.16), c("#e0407c"), 14, 6)
    ball(body, (0, 1.53, 0.01), 0.03, c("#e0407c"), 8, 5)
    # One arm lies over the picture, the other one holds its front.
    for points in (
        ((0.19, 1.07, 0), (0.4, 1.06, -0.06), (0.39, 0.86, -0.12)),
        ((-0.19, 1.07, 0), (-0.14, 0.86, 0.36), (0.22, 0.74, 0.6)),
    ):
        for (a, b), (low, high) in zip(zip(points, points[1:]), ((0.045, 0.034), (0.036, 0.024))):
            rod(body, a, b, low, high, WOOD[2])
        for point, radius in zip(points, (0.065, 0.042, 0.048)):
            ball(body, point, radius, WOOD[1], 8, 5)
    # The picture: a gilded frame around a small landscape.
    x, y, z, high, long = 0.3, 0.7, 0.08, 0.62, 0.98
    for dy in (-1, 1):
        box(body, (x, y + dy * high / 2, z), (0.09, 0.08, long + 0.08), GOLD[0])
    for dz in (-1, 1):
        box(body, (x, y, z + dz * long / 2), (0.09, high, 0.08), GOLD[1])
    # White and grey, so the page can give every picture the color of a collection.
    box(canvas, (x, y, z), (0.04, high, long), WHITE)
    for side in (-1, 1):
        face = x + side * 0.025
        hills = ((-0.45, -0.27), (-0.22, 0.06), (-0.02, -0.12), (0.2, 0.12), (0.45, -0.27))
        canvas.face([(face, y + up, z + along) for along, up in hills], c("#8c86a8"))
        sun = x + side * 0.027
        canvas.face(
            [(sun, y + 0.14 + 0.07 * math.sin(TAU * k / 10), z - 0.24 + 0.07 * math.cos(TAU * k / 10)) for k in range(10)],
            c("#fff2a8"),
        )
    for sign, leg in ((-1, leg_a), (1, leg_b)):
        hip, knee, foot = (sign * 0.09, HIP, 0), (sign * 0.1, 0.34, 0.03), (sign * 0.1, 0.05, 0)
        rod(leg, hip, knee, 0.062, 0.042, WOOD[0])
        rod(leg, knee, foot, 0.048, 0.028, WOOD[0])
        ball(leg, hip, 0.06, WOOD[1], 8, 5)
        ball(leg, knee, 0.048, WOOD[1], 8, 5)
        ball(leg, (sign * 0.1, 0.04, 0.05), (0.06, 0.04, 0.12), WOOD[1], 10, 5)


# ---------------------------------------------------------------- the impossible things


def figure(shape, base, up, forward, size, colors=WOOD, stride=0.5):
    """A wooden artist's mannequin that walks: "base" under its feet, "size" tall."""
    up, forward = Vector(up).normalized(), Vector(forward).normalized()
    side = up.cross(forward).normalized()

    def at(x, y, z):
        return Vector(base) + (side * x + up * y + forward * z) * size

    for sign in (-1, 1):
        step = sign * stride * 0.28
        hip, knee, foot = at(sign * 0.07, 0.5, 0), at(sign * 0.08, 0.27, step * 0.7 + 0.04), at(sign * 0.08, 0.03, step)
        rod(shape, hip, knee, 0.055 * size, 0.035 * size, colors[0])
        rod(shape, knee, foot, 0.042 * size, 0.022 * size, colors[0])
        ball(shape, knee, 0.042 * size, colors[1])
        ball(shape, foot, (0.04 * size, 0.026 * size, 0.04 * size), colors[1])
        shoulder, elbow, hand = at(sign * 0.15, 0.76, 0), at(sign * 0.2, 0.61, -step * 0.5), at(sign * 0.22, 0.47, -step * 0.8 + 0.05)
        rod(shape, shoulder, elbow, 0.036 * size, 0.026 * size, colors[2])
        rod(shape, elbow, hand, 0.03 * size, 0.017 * size, colors[2])
        for point, radius in ((shoulder, 0.048), (elbow, 0.03), (hand, 0.033), (hip, 0.048)):
            ball(shape, point, radius * size, colors[1])
    rod(shape, at(0, 0.5, 0), at(0, 0.6, 0), 0.1 * size, 0.055 * size, colors[0])
    ball(shape, at(0, 0.61, 0), 0.052 * size, colors[1])
    rod(shape, at(0, 0.62, 0), at(0, 0.79, 0), 0.065 * size, 0.13 * size, colors[0])
    rod(shape, at(0, 0.79, 0), at(0, 0.84, 0), 0.04 * size, 0.025 * size, colors[1])
    ball(shape, at(0, 0.92, 0), (0.075 * size,) * 3, colors[2], 12, 9)


def penrose(paint, size, thick):
    """Three bars at right angles that never meet. Seen along one line, they close into the
    impossible triangle."""
    a, b = v(0, 0, 0), v(size, 0, 0)
    d = b + v(0, size, 0)
    e = d + v(0, 0, size)
    middle = (a + b + d + e) / 4
    shades = (c("#ff7ab8"), c("#7a5cff"), c("#45e0ff"))
    for (start, end), axis in zip(((a, b), (b, d), (d, e)), range(3)):
        steps = int(size / thick)
        for k in range(steps + (1 if axis < 2 else 0)):
            point = start.lerp(end, k / steps) - middle
            # Every face keeps one shade, which sells the illusion.
            w = thick / 2
            verts = [(point.x + dx * w, point.y + dy * w, point.z + dz * w) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
            for face, shade in (
                ((0, 1, 3, 2), 0), ((4, 6, 7, 5), 0), ((0, 4, 5, 1), 1),
                ((2, 3, 7, 6), 1), ((0, 2, 6, 4), 2), ((1, 5, 7, 3), 2),
            ):
                paint.face([verts[i] for i in face], shades[shade])


def stairs(paint, glow):
    """A staircase around a square that climbs for ever, with walkers on it."""
    side, count, rise = 18.0, 9, 0.55
    run = side / count
    turns = (((1, 0, 0), (-1, 0, -1)), ((0, 0, 1), (1, 0, -1)), ((-1, 0, 0), (1, 0, 1)), ((0, 0, -1), (-1, 0, 1)))
    for leg, (way, start) in enumerate(turns):
        way = Vector(way)
        origin = Vector(start) * (side / 2)
        for k in range(count):
            height = 2.0 + (leg * count + k) * rise * 0.5
            center = origin + way * (k + 0.5) * run
            box(paint, (center.x, height / 2 - 4, center.z), (run if way.x else 3.0, height, run if way.z else 3.0), STONE[leg % 2 + 1], top=STONE[0])
            if k in (2, 6):
                figure(paint, (center.x, height - 4, center.z), (0, 1, 0), way, 3.4, WOOD if leg % 2 else (c("#ff8fc4"), c("#c23a7a"), c("#ffc2de")))
    for x in (-1, 1):
        for z in (-1, 1):
            gem(glow, (x * side / 2, -7.0, z * side / 2), 1.1, 4.0, VIOLET)


def relativity(paint, glow):
    """Stairs for three kinds of gravity, which pass through one another."""
    span = 16.0
    turns = (
        Matrix.Identity(4),
        Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "Y"),
        Matrix.Rotation(-math.pi / 2, 4, "X") @ Matrix.Rotation(math.pi, 4, "Y"),
    )
    shades = ((STONE[0], STONE[1]), (c("#bff3ff"), c("#4fa8c9")), (c("#ffe3a8"), c("#d9913a")))
    for index, (turn, (top, side)) in enumerate(zip(turns, shades)):
        shift = Vector(((0, -5, 3), (4, 2, -4), (-5, 4, 0))[index])

        def place(x, y, z):
            return turn @ Vector((x, y, z)) + shift

        count = 20
        for k in range(count):
            x = -span / 2 + (k + 0.5) * span / count
            box(paint, place(x, -span / 4 + k * span / count / 2, 0), (span / count, 0.36, 3.2), side, turn, top)
        for end, height in ((-span / 2 - 2.0, -span / 4 - 0.4), (span / 2 + 2.0, span / 4 - 0.1)):
            box(paint, place(end, height, 0), (4.0, 0.5, 4.0), side, turn, top)
            for dx in (-1.8, 1.8):
                for dz in (-1.8, 1.8):
                    beam(paint, place(end + dx, height, dz), place(end + dx, height + 2.2, dz), 0.16, GOLD[1])
            gem(glow, place(end, height + 2.7, 0), 0.5, 1.4, (PINK, CYAN, AMBER)[index])
        for k in (5, 14):
            x = -span / 2 + (k + 0.5) * span / count
            figure(
                paint, place(x, -span / 4 + k * span / count / 2 + 0.18, 0),
                turn @ v(0, 1, 0), turn @ v(1 if k < 10 else -1, 0, 0), 3.0,
            )


def painter(paint, glow):
    """A mannequin as high as a house, which sits on a block and paints on nothing."""
    size = 24.0

    def at(x, y, z):
        return v(x, y, z) * size

    def limb(a, b, low, high, color=WOOD[0]):
        rod(paint, at(*a), at(*b), low * size, high * size, color, 12)

    def joint(a, radius):
        ball(paint, at(*a), radius * size, WOOD[1], 14, 9)

    box(paint, at(0, 0.12, -0.08), at(0.46, 0.24, 0.34), STONE[2], top=STONE[0])
    for sign in (-1, 1):
        hip, knee, foot = (sign * 0.09, 0.3, -0.03), (sign * 0.13, 0.31, 0.26), (sign * 0.14, 0.04, 0.3)
        limb(hip, knee, 0.058, 0.04)
        limb(knee, foot, 0.044, 0.025)
        joint(hip, 0.055)
        joint(knee, 0.046)
        ball(paint, at(sign * 0.14, 0.025, 0.34), at(0.045, 0.028, 0.08), WOOD[1])
    limb((0, 0.29, -0.04), (0, 0.4, -0.04), 0.11, 0.06)
    joint((0, 0.41, -0.04), 0.055)
    limb((0, 0.42, -0.04), (0, 0.62, 0.0), 0.07, 0.14)
    limb((0, 0.62, 0.0), (0, 0.67, 0.01), 0.04, 0.028, WOOD[1])
    ball(paint, at(0.01, 0.755, 0.03), at(0.075, 0.092, 0.08), WOOD[2], 16, 12)
    # One arm holds a brush up high, the other one the palette.
    for shoulder, elbow, hand in (((0.17, 0.58, 0), (0.31, 0.55, 0.14), (0.3, 0.7, 0.3)), ((-0.17, 0.58, 0), (-0.26, 0.42, 0.08), (-0.2, 0.43, 0.27))):
        limb(shoulder, elbow, 0.038, 0.028, WOOD[2])
        limb(elbow, hand, 0.032, 0.018, WOOD[2])
        joint(shoulder, 0.05)
        joint(elbow, 0.032)
        joint(hand, 0.036)
    brush(paint, at(0.27, 0.64, 0.22), at(0.42, 0.92, 0.55), 0.55, CYAN)
    palette(paint, at(-0.18, 0.44, 0.31), 4.2, Matrix.Rotation(0.5, 4, "X"))
    stroke = [at(0.42 + 0.28 * math.sin(t * 4.2), 0.92 + 0.16 * math.sin(t * 7.0) - t * 0.25, 0.56 + t * 0.2) for t in (k / 50 for k in range(51))]
    for k, (a, b) in enumerate(zip(stroke, stroke[1:])):
        rod(glow, a, b, 0.4 * (1 - k / 56), 0.4 * (1 - (k + 1) / 56), mix(CYAN, PINK, k / 50), 6)


def brush(paint, a, b, thick, color):
    a, b = Vector(a), Vector(b)
    grip, hair = a.lerp(b, 0.72), a.lerp(b, 0.84)
    rod(paint, a, grip, thick * 0.35, thick * 0.55, c("#c23a52"), 10)
    rod(paint, grip, hair, thick * 0.68, thick * 0.68, c("#d9e2ff"), 10)
    middle = hair.lerp(b, 0.4)
    rod(paint, hair, middle, thick * 0.62, thick * 0.85, WOOD[1], 10)
    rod(paint, middle, b, thick * 0.85, 0.02, color, 10)


def palette(paint, center, radius, turn):
    matrix = Matrix.Translation(Vector(center)) @ turn
    count = 28
    rim = []
    for k in range(count):
        angle = TAU * k / count
        r = radius * (1 - 0.32 * math.exp(-((angle - 4.7) ** 2) * 3))
        rim.append((r * math.cos(angle), 0.0, r * 0.72 * math.sin(angle)))
    low = [(x, y - radius * 0.07, z) for x, y, z in rim]
    solid(paint, matrix, rim, [tuple(range(count - 1, -1, -1))], WOOD[2])
    solid(paint, matrix, low, [tuple(range(count))], WOOD[1])
    for k in range(count):
        j = (k + 1) % count
        solid(paint, matrix, [low[k], low[j], rim[j], rim[k]], [(0, 1, 2, 3)], WOOD[0])
    for k, color in enumerate((c("#ff4d4d"), AMBER, c("#ffe45c"), MINT, CYAN, VIOLET, PINK)):
        angle = -0.5 + k * 0.62
        spot = matrix @ v(radius * 0.66 * math.cos(angle), radius * 0.03, radius * 0.46 * math.sin(angle))
        ball(paint, spot, (radius * 0.15, radius * 0.07, radius * 0.13), color, 10, 5, turn)


def tube_of_paint(paint, glow, center, size, turn, color):
    matrix = Matrix.Translation(Vector(center)) @ turn

    def at(x, y, z=0.0):
        return matrix @ v(x * size, y * size, z * size)

    rod(paint, at(0, -0.5), at(0, 0.25), 0.2 * size, 0.2 * size, c("#e9ecff"), 14)
    rod(paint, at(0, -0.3), at(0, 0.08), 0.205 * size, 0.205 * size, color, 14)
    box(paint, at(0, -0.55), (0.46 * size, 0.09 * size, 0.05 * size), c("#b4bdea"), turn)
    rod(paint, at(0, 0.25), at(0, 0.33), 0.2 * size, 0.07 * size, c("#c9d0f5"), 14)
    rod(paint, at(0, 0.33), at(0, 0.42), 0.07 * size, 0.07 * size, NIGHT, 10)
    worm = [at(0.34 * math.sin(t * 8.5) * t, 0.42 + t * 0.95, 0.34 * math.cos(t * 8.5) * t - 0.34 * t) for t in (k / 44 for k in range(45))]
    glow.tube(worm, 0.075 * size, color, 8)
    ball(glow, worm[-1], 0.1 * size, color, 8, 5)


def star(shape, center, radius, spike, colors, turn):
    """A stellated solid: a pyramid on every face of an icosahedron."""
    mesh = bmesh.new()
    bmesh.ops.create_icosphere(mesh, subdivisions=1, radius=radius)
    matrix = Matrix.Translation(Vector(center)) @ turn
    for index, face in enumerate(mesh.faces):
        points = [loop.vert.co.copy() for loop in face.loops]
        tip = face.calc_center_median().normalized() * spike
        for k in range(3):
            shape.face([matrix @ points[k], matrix @ points[(k + 1) % 3], matrix @ tip], colors[(index + k) % len(colors)])
    mesh.free()


def droste(paint, glow):
    """Frames in frames in frames, each a little smaller and turned a little further."""
    size, angle, depth = 15.0, 0.0, 0.0
    for k in range(20):
        turn = Matrix.Rotation(angle, 4, "Z")
        points = [turn @ v(x * size, y * size, depth) for x, y in ((-1, -0.72), (1, -0.72), (1, 0.72), (-1, 0.72))]
        target = paint if k % 2 == 0 else glow
        color = GOLD[k % 3] if k % 2 == 0 else mix(PINK, CYAN, k / 19)
        for a, b in zip(points, points[1:] + points[:1]):
            beam(target, a, b, size * 0.075, color, size * 0.05)
            ball(target, a, size * 0.065, color, 8, 5)
        size *= 0.845
        angle += 0.17
        depth -= size * 0.2
    star(glow, (0, 0, depth - 0.4), 0.35, 1.2, (WHITE, GOLD[2]), Matrix.Identity(4))


def brushes(paint, glow):
    """Giant brushes that fly around the middle, each with its stroke behind it."""
    colors = (CYAN, PINK, AMBER, MINT, VIOLET, c("#ff4d4d"))
    for index, color in enumerate(colors):
        start = TAU * index / len(colors)
        radius = 82 + 11 * (index % 3)
        height = (24, -20, 33, -31, 17, -26)[index]

        def at(angle, lift=0.0):
            return v(radius * math.cos(angle), height + lift + 4 * math.sin(angle * 3), radius * math.sin(angle))

        head = start + 0.5
        brush(paint, at(head + 0.17, 2.5), at(head), 2.1, color)
        count = 46
        for k in range(count):
            a, b = head - 0.62 * k / count, head - 0.62 * (k + 1) / count
            wa, wb = 1.5 * (1 - k / count), 1.5 * (1 - (k + 1) / count)
            glow.face([at(a, -wa), at(a, wa), at(b, wb), at(b, -wb)], mix(color, WHITE, k / count * 0.7))


def flock(paint, glow):
    """Fish of the floor that came loose and swim away into the sky."""
    outline = []
    wide, long = HALF * 2 / COLUMNS, LENGTH / ROWS
    # A row where the squares have become fish.
    row = int(LENGTH / 6 / long)
    middle = (-HALF + 2.5 * wide, (row + 0.5) * long)
    for x, s in tile(2, row):
        outline.append((x - middle[0], s - middle[1]))
    for index in range(110):
        angle = index * 0.31 + random.random() * 0.2
        away = RADIUS + (14 + random.random() * 26) * (1 if index % 3 else -0.7)
        height = 13 * math.sin(index * 0.21) + (random.random() - 0.5) * 12 + (12 if index % 2 else -12)
        center = v(away * math.cos(angle), height, away * math.sin(angle))
        along = v(-math.sin(angle), 0.1 * math.sin(index), math.cos(angle)).normalized()
        out = v(math.cos(angle), 0, math.sin(angle))
        across = (out + v(0, math.sin(index * 0.7), 0)).normalized()
        size = 0.55 + random.random() * 0.75
        light = index % 2 == 0
        color = tone(LENGTH * (index % 37) / 37, light)
        points = [center + across * x * size + along * s * size for x, s in outline]
        paint.face(points, color)
        eye = center + along * 0.22 * long * size
        lift = across.cross(along).normalized() * 0.04
        for sign in (-1, 1):
            ring = [eye + (across * math.cos(TAU * k / 8) + along * math.sin(TAU * k / 8)) * 0.2 * size + lift * sign for k in range(8)]
            glow.face(ring, INK if light else WHITE)


# ---------------------------------------------------------------- the sky


SKY = 390.0
SWIRLS = (
    (v(0.9, 0.35, 0.25), 0.55, "#ffd45a"), (v(-0.4, 0.75, 0.5), 0.5, "#45e0ff"), (v(-0.8, 0.1, -0.6), 0.65, "#ff5fa8"),
    (v(0.3, -0.5, -0.8), 0.55, "#a374ff"), (v(-0.1, -0.85, 0.5), 0.5, "#4fd1b5"), (v(0.2, 0.55, -0.8), 0.45, "#ff7ab8"),
)


def sky(shape):
    """A night that is painted in strokes, which curl around a few lights."""

    def base(direction):
        height = direction.y
        color = mix(c("#2b1a66"), c("#100c36"), height) if height > 0 else mix(c("#2b1a66"), c("#4a1e5e"), -height * 1.4)
        for center, reach, tint in SWIRLS:
            angle = direction.angle(center.normalized())
            if angle < reach:
                color = mix(color, c(tint), (1 - angle / reach) ** 2 * 0.42)
        return color

    sides, rows = 96, 56
    for j in range(rows):
        for i in range(sides):
            corners = []
            for di, dj in ((0, 0), (1, 0), (1, 1), (0, 1)):
                a, b = TAU * (i + di) / sides, math.pi * (j + dj) / rows - math.pi / 2
                corners.append(v(math.cos(b) * math.cos(a), math.sin(b), math.cos(b) * math.sin(a)))
            middle = sum(corners, v(0, 0, 0)).normalized()
            shape.face([p * SKY for p in corners], base(middle))

    def dab(a, b, wide, color):
        side = a.cross(b - a).normalized() * wide
        middle = (a + b) / 2
        shape.face([a, middle + side, b, middle - side], color)

    # The curls around every light.
    for center, reach, tint in SWIRLS:
        axis = center.normalized()
        u = axis.orthogonal().normalized()
        w = axis.cross(u)
        for k in range(230):
            share = random.random() ** 0.8
            spread = 0.035 + share * reach * 0.85
            start = random.random() * TAU
            length = 0.07 + random.random() * 0.2

            def at(t):
                angle = start + length / max(spread, 0.1) * t
                r = spread * (1 + 0.16 * t)
                return (axis * math.cos(r) + (u * math.cos(angle) + w * math.sin(angle)) * math.sin(r)) * (SKY - 3 - share * 4)

            color = mix(c(tint), base(at(0.5).normalized()), 0.25 + share * 0.6)
            if k % 11 == 0:
                color = mix(color, WHITE, 0.55)
            for step in range(4):
                dab(at(step / 4), at((step + 1.15) / 4), 1.6 * math.sin(math.pi * (step + 0.5) / 4), color)
        ball(shape, axis * (SKY - 14), 7.5, mix(c(tint), WHITE, 0.6), 18, 12)
    for k in range(900):
        direction = v(random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1)).normalized()
        size = 0.5 + random.random() ** 3 * 2.4
        gem(shape, direction * (SKY - 12), size, size * 2.6, (WHITE, GOLD[2], c("#bff3ff"))[k % 3])


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


def around(angle, away, height):
    return (away * math.cos(angle), height, away * math.sin(angle))


def main():
    # The same salon at every run.
    random.seed(11)
    scene = make_scene("Solaris_Mobius", ("mb_", "mobius_"))
    lit = make_material("mobius_paint")
    shine = make_material("mobius_glow")
    # Only for the pictures taken in Blender; the page draws these meshes unlit.
    shader = next(n for n in shine.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    source = next(n for n in shine.node_tree.nodes if n.type == "VERTEX_COLOR")
    shine.node_tree.links.new(source.outputs["Color"], shader.inputs["Emission Color"])
    shader.inputs["Emission Strength"].default_value = 1.0

    meshes = {}
    spins, floats, pivots = {}, {}, {}

    def mesh(name, bright=False):
        meshes[name] = (Shape(), bright)
        return meshes[name][0]

    def moving(kind, name, at, **motion):
        """A thing that turns or drifts: built around the zero point, placed by the page."""
        pivots[name] = at
        (spins if kind == "spin" else floats)[name] = {"at": [round(value, 3) for value in at], **motion}

    floor(mesh("mb_isle_floor"), mesh("mb_glow_eyes", True))
    rails(mesh("mb_isle_rails"), mesh("mb_glow_rails", True))
    lanterns(mesh("mb_glow_lanterns", True))
    sky(mesh("mb_sky_dome", True))

    penrose(mesh("mb_spin_penrose"), 24.0, 4.0)
    moving("spin", "mb_spin_penrose", (0, 6, 0), axis=[0, 1, 0], speed=0.12)

    relativity(mesh("mb_spin_relativity"), mesh("mb_spin_relativity_light", True))
    for name in ("mb_spin_relativity", "mb_spin_relativity_light"):
        moving("spin", name, (0, -30, 0), axis=[0.2, 1, 0.1], speed=-0.07)

    stairs(mesh("mb_float_stairs"), mesh("mb_float_stairs_light", True))
    for name in ("mb_float_stairs", "mb_float_stairs_light"):
        moving("float", name, around(1.25, 98, -4), rise=1.6, speed=0.35)

    # The painter looks at the ribbon.
    angle, away = 0.72, 102
    painter(mesh("mb_float_painter"), mesh("mb_float_painter_light", True))
    face = math.atan2(-math.cos(angle), -math.sin(angle))
    for name in ("mb_float_painter", "mb_float_painter_light"):
        shape = meshes[name][0]
        turn = Matrix.Rotation(face, 4, "Y")
        shape.verts = [tuple(turn @ Vector(p)) for p in shape.verts]
        moving("float", name, around(angle, away, -12), rise=1.0, speed=0.28)

    droste(mesh("mb_spin_droste"), mesh("mb_spin_droste_light", True))
    heading = 2.55
    for name in ("mb_spin_droste", "mb_spin_droste_light"):
        shape = meshes[name][0]
        turn = Matrix.Rotation(math.atan2(-math.cos(heading), -math.sin(heading)), 4, "Y")
        shape.verts = [tuple(turn @ Vector(p)) for p in shape.verts]
        moving("spin", name, around(heading, 100, 10), axis=[round(-math.cos(heading), 4), 0, round(-math.sin(heading), 4)], speed=0.09)

    colors = (c("#ff4d4d"), AMBER, MINT, CYAN, VIOLET, PINK)
    tubes, worms = mesh("mb_float_tubes"), mesh("mb_float_tubes_light", True)
    for k, color in enumerate(colors):
        turn = Matrix.Rotation(random.uniform(-0.9, 0.9), 4, "Z") @ Matrix.Rotation(random.uniform(-0.6, 0.6), 4, "X")
        tube_of_paint(tubes, worms, (math.cos(k * 1.2) * 13, (k - 2.5) * 4.2, math.sin(k * 2.1) * 9), 7.5, turn, color)
    palette(tubes, (0, -17, 0), 9.0, Matrix.Rotation(0.35, 4, "Z") @ Matrix.Rotation(0.25, 4, "X"))
    for name in ("mb_float_tubes", "mb_float_tubes_light"):
        moving("float", name, around(3.85, 96, 2), rise=2.2, speed=0.22)

    for k, (angle, away, height, size) in enumerate(
        ((0.25, 28, 34, 3.2), (2.0, 84, 30, 4.0), (3.2, 80, -24, 3.4), (4.7, 100, 14, 5.5), (5.45, 32, -4, 2.6), (5.9, 92, -30, 4.2))
    ):
        name = f"mb_spin_star_{k}"
        shades = ((CYAN, VIOLET, c("#2f6dff")), (PINK, AMBER, c("#c23a7a")), (MINT, CYAN, c("#1c8f7d")))[k % 3]
        star(mesh(name), (0, 0, 0), size, size * 2.3, shades, Matrix.Identity(4))
        axis = v(random.random() - 0.5, 1, random.random() - 0.5).normalized()
        moving("spin", name, around(angle, away, height), axis=[round(value, 4) for value in axis], speed=0.2 + 0.05 * k)

    brushes(mesh("mb_spin_brushes"), mesh("mb_spin_brushes_light", True))
    for name in ("mb_spin_brushes", "mb_spin_brushes_light"):
        moving("spin", name, (0, 0, 0), axis=[0, 1, 0], speed=0.045)

    flock(mesh("mb_spin_flock"), mesh("mb_spin_flock_light", True))
    for name in ("mb_spin_flock", "mb_spin_flock_light"):
        moving("spin", name, (0, 0, 0), axis=[0, 1, 0], speed=-0.028)

    stand(mesh("mb_easel_paint"), mesh("mb_easel_glow", True))
    gate(mesh("mb_gate_paint"), mesh("mb_gate_glow", True))
    porter(
        mesh("mb_porter_body"), mesh("mb_porter_canvas_glow", True),
        mesh("mb_porter_leg_a"), mesh("mb_porter_leg_b"),
    )

    for name, (shape, bright) in meshes.items():
        add(scene, shine if bright else lit, name, blender(shape))

    # With the default bits, points this far from zero move by centimeters, and flat things on
    # the ground then flicker through it.
    bits = meshopt.EXP_FILTER_BITS
    meshopt.EXP_FILTER_BITS = 17
    weld(scene)
    try:
        # The page works out the flat normals itself, which halves the file.
        export(os.path.join(FOLDER, "mobius.glb"), normals=False)
    finally:
        meshopt.EXP_FILTER_BITS = bits

    layout = {
        "length": LENGTH,
        "half": HALF,
        "thick": THICK,
        "walk": WALK,
        "hip": HIP,
        "stand": STAND,
        "spins": spins,
        "floats": floats,
    }
    with open(os.path.join(FOLDER, "mobius.json"), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(layout, handle, indent=2)
        handle.write("\n")

    # After the export, so the file keeps the moving parts around the zero point. The rest
    # below is only for the pictures taken in Blender.
    for name, (x, y, z) in pivots.items():
        scene.collection.objects[name].location = (x, -z, y)

    def show(names, s, x, lift=0.0, yaw=0.0):
        middle, across, above, along = frame(s)
        basis = Matrix((across, above, -along)).transposed().to_4x4()
        page = Matrix.Translation(ribbon(x, lift, s)) @ basis @ Matrix.Rotation(yaw, 4, "Y")
        change = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        for name in names:
            source = scene.collection.objects[name]
            copy = bpy.data.objects.new(f"mobius_show_{name}", source.data)
            scene.collection.objects.link(copy)
            copy.matrix_world = change @ page @ change.inverted()

    for k in range(10):
        side = 1 if k % 2 else -1
        show(("mb_easel_paint", "mb_easel_glow"), 26 + k * 3.2, side * STAND, yaw=-side * math.radians(55))
    show(("mb_gate_paint", "mb_gate_glow"), 22, 0)
    carried = ("mb_porter_body", "mb_porter_canvas_glow", "mb_porter_leg_a", "mb_porter_leg_b")
    for k in range(24):
        show(carried, k * 30 + 9, 5.75 if k % 2 else -5.75, yaw=math.pi if k % 2 else 0.0)
    for name in ("mb_easel_paint", "mb_easel_glow", "mb_gate_paint", "mb_gate_glow", *carried):
        scene.collection.objects[name].hide_set(True)
        scene.collection.objects[name].hide_render = True
    bpy.context.view_layer.update()
    print("[mobius] done")


main()
