"""Builds the corridor of the lobby and writes src/assets/lobby/corridor.glb.

    blender --background --factory-startup --python scripts/build-lobby.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Lobby",
and leaves every other scene alone. The corridor is original low-poly work and holds no game
assets.

The page walks along the corridor, which is +Y here and -Z on the page. It repeats the mesh
"bay" once for every room, so a new room only makes the corridor longer, and closes the far
side with the mesh "end". The mesh "runner" is white, so that the page can give the carpet a
color.
"""

import math
import os
import random
import sys

# Blender does not put the folder of the script on the import path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lowpoly import TAU, Shape, add, export, linear, make_material, make_scene  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "src", "assets", "lobby", "corridor.glb")

INK = linear("#1d1a4a")
WHITE = linear("#ffffff")
STONE = linear("#f1effc")
LAVENDER = linear("#b8b3ff")
SHADE = linear("#c9c4f4")
TILE = (linear("#f4f3fc"), linear("#d9d5f6"))
GOLD = linear("#ffc85a")
LIGHT = linear("#fff2b8")
GLASS = (linear("#8f8df7"), linear("#ff8fc4"), linear("#6fd8e8"), linear("#ffd36b"))

# The length of one bay, which is also the distance between two doors of the page.
BAY = 4.0
HALF = BAY / 2
# Half the width of the floor, and where the columns stand.
EDGE = 6.2
COLUMNS = 5.5
# Where the columns end and the arches start.
SPRING = 5.2
RISE = 2.9


def box(shape, low, high, color):
    (x0, y0, z0), (x1, y1, z1) = low, high
    corners = [(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    for face in ((0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)):
        shape.face([corners[i] for i in face], color)


def floor(bay, runner):
    columns = 8
    width = 2 * EDGE / columns
    for i in range(columns):
        for j in range(2):
            x, y = -EDGE + width * i, -HALF + HALF * j
            bay.face([(x, y, 0), (x + width, y, 0), (x + width, y + HALF, 0), (x, y + HALF, 0)], TILE[(i + j) % 2])
    runner.face([(-0.85, -HALF, 0.012), (0.85, -HALF, 0.012), (0.85, HALF, 0.012), (-0.85, HALF, 0.012)], WHITE)
    for side in (-1, 1):
        box(bay, (side * 0.85 - 0.05, -HALF, 0), (side * 0.85 + 0.05, HALF, 0.022), INK)
        box(bay, (side * 1.02 - 0.025, -HALF, 0), (side * 1.02 + 0.025, HALF, 0.018), GOLD)
        box(bay, (side * 4.9 - 0.06, -HALF, 0), (side * 4.9 + 0.06, HALF, 0.018), LAVENDER)
        # The edge of the floating floor.
        box(bay, (side * EDGE - 0.12, -HALF, -0.45), (side * EDGE + 0.12, HALF, 0.08), SHADE)
        box(bay, (side * EDGE - 0.14, -HALF, -0.62), (side * EDGE + 0.14, HALF, -0.45), INK)


def column(shape, x, y):
    shape.frustum((x, y, 0.0), 0.56, 0.56, 0.14, INK, 8)
    shape.frustum((x, y, 0.14), 0.5, 0.42, 0.34, LAVENDER, 8)
    shape.frustum((x, y, 0.48), 0.32, 0.27, SPRING - 0.86, WHITE)
    shape.frustum((x, y, 1.15), 0.34, 0.34, 0.12, GOLD)
    shape.frustum((x, y, SPRING - 0.38), 0.28, 0.5, 0.28, LAVENDER, 8)
    shape.frustum((x, y, SPRING - 0.1), 0.54, 0.54, 0.16, INK, 8)


def arc(start, end, base, rise, steps=18):
    """Points of a half ellipse from "start" to "end", both (x, y) at height "base"."""
    points = []
    for i in range(steps + 1):
        t = i / steps
        along = (1 - math.cos(math.pi * t)) / 2
        points.append(
            (
                start[0] + (end[0] - start[0]) * along,
                start[1] + (end[1] - start[1]) * along,
                base + rise * math.sin(math.pi * t),
            )
        )
    return points


def vault(shape):
    """The arch over the corridor, with a lamp in its middle."""
    points = arc((-COLUMNS, -HALF), (COLUMNS, -HALF), SPRING, RISE, 28)
    shape.tube(points, 0.2, WHITE, 6)
    shape.tube([(x, y, z - 0.3) for x, y, z in points], 0.05, GOLD)
    top = SPRING + RISE
    shape.tube([(0, -HALF, top - 0.3), (0, -HALF, top - 0.9)], 0.025, INK)
    shape.gem((0, -HALF, top - 1.55), 0.26, 0.68, LIGHT)


def side(shape, x, index):
    """The open side between two columns: an arch, a rail, and the sky behind them."""
    shape.tube(arc((x, -HALF), (x, HALF), SPRING - 0.9, 1.1), 0.13, WHITE, 6)
    box(shape, (x - 0.14, -HALF, SPRING + 0.38), (x + 0.14, HALF, SPRING + 0.62), WHITE)
    box(shape, (x - 0.16, -HALF, SPRING + 0.62), (x + 0.16, HALF, SPRING + 0.72), LAVENDER)
    # The rail.
    box(shape, (x - 0.1, -HALF, 0.82), (x + 0.1, HALF, 0.96), WHITE)
    box(shape, (x - 0.12, -HALF, 0.96), (x + 0.12, HALF, 1.0), INK)
    for i in range(1, 6):
        y = -HALF + BAY * i / 6
        shape.frustum((x, y, 0.0), 0.12, 0.07, 0.4, STONE, 8)
        shape.frustum((x, y, 0.4), 0.07, 0.11, 0.42, STONE, 8)
    # A pennant that hangs from the arch.
    pennant = x * 0.995
    color = GLASS[index]
    shape.face(
        [(pennant, -0.45, SPRING + 0.2), (pennant, 0.45, SPRING + 0.2), (pennant, 0.45, 3.2), (pennant, 0, 3.6), (pennant, -0.45, 3.2)],
        color,
    )
    shape.gem((x * 0.97, 0, 4.05), 0.16, 0.5, GOLD)


def clouds_and_shards(shape):
    """What floats outside the corridor."""
    for x in (-1, 1):
        for _ in range(2):
            at = (x * random.uniform(8.5, 13), random.uniform(-HALF, HALF), random.uniform(-0.5, 5.5))
            size = random.uniform(0.25, 0.75)
            shape.gem(at, size * 0.55, size * 1.8, (LAVENDER, SHADE)[x > 0])
        # A cloud under the edge: a few flat gems side by side.
        cx, cy = x * random.uniform(7.8, 9.5), random.uniform(-1, 1)
        for dx, dy, radius in ((0, 0, 1.5), (1.1, 0.7, 1.0), (-0.9, -0.8, 1.1), (0.4, -1.3, 0.8)):
            shape.gem((cx + dx * x, cy + dy, -2.2), radius, radius * 0.9, WHITE)


def end_wall(shape):
    """The far side: a wall with a great round window."""
    box(shape, (-EDGE, 0.2, 0), (EDGE, 0.5, SPRING), SHADE)
    # The gable above, under the arch.
    top = arc((-COLUMNS, 0.35), (COLUMNS, 0.35), SPRING, RISE, 28)
    for a, b in zip(top, top[1:]):
        shape.face([(a[0], 0.35, SPRING), (b[0], 0.35, SPRING), (b[0], 0.35, b[2]), (a[0], 0.35, a[2])], SHADE)
    shape.tube(top, 0.22, WHITE, 6)

    def circle(radius, depth, steps=48):
        return [(radius * math.cos(TAU * i / steps), depth, 3.7 + radius * math.sin(TAU * i / steps)) for i in range(steps + 1)]

    rim = circle(2.7, 0.14)
    for i, (a, b) in enumerate(zip(rim, rim[1:])):
        shape.face([(0, 0.15, 3.7), a, b], WHITE if (i // 4) % 2 else LIGHT)
    for radius, thickness, color in ((2.75, 0.2, INK), (2.45, 0.07, GOLD), (1.2, 0.06, LAVENDER)):
        shape.tube(circle(radius, 0.08), thickness, color, 6)
    for i in range(8):
        a = TAU * i / 8
        shape.tube([(1.2 * math.cos(a), 0.08, 3.7 + 1.2 * math.sin(a)), (2.45 * math.cos(a), 0.08, 3.7 + 2.45 * math.sin(a))], 0.05, LAVENDER)
    shape.gem((0, -0.05, 3.05), 0.45, 1.3, GOLD)
    for x in (-COLUMNS, -3.6, 3.6, COLUMNS):
        column(shape, x, 0.0)


def main():
    # The same clouds at every run.
    random.seed(11)
    scene = make_scene("Solaris_Lobby", ("bay", "end", "runner", "lobby_"))
    material = make_material("lobby_paint")
    bay, runner, end = Shape(), Shape(), Shape()
    floor(bay, runner)
    for index, x in enumerate((-COLUMNS, COLUMNS)):
        column(bay, x, -HALF)
        side(bay, x, index)
    vault(bay)
    clouds_and_shards(bay)
    end_wall(end)
    add(scene, material, "bay", bay)
    add(scene, material, "runner", runner)
    add(scene, material, "end", end)
    export(OUTPUT)


main()
