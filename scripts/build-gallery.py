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
import sys

# Blender does not put the folder of the script on the import path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lowpoly import TAU, Shape, add, export, linear, make_material, make_scene, polar  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "src", "assets", "gallery", "hall.glb")
SCENE = "Solaris_Gallery"

BAYS = 24
BAY = TAU / BAYS
# The exhibits of the page hang at a radius of 12, so everything here stays clear of that.
COLUMNS = 16.5
ROPES = 10.4


INK = linear("#2b2866")
STONE = linear("#fbfaff")
SHADE = linear("#d9d6f4")
FLOOR = (linear("#f4f2ff"), linear("#e2defa"))
GOLD = linear("#ffc85a")
LIGHT = linear("#fff2b8")
WHITE = linear("#ffffff")


def polar(radius, angle, up=0.0):
    return (radius * math.cos(angle), radius * math.sin(angle), up)


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


def main():
    scene = make_scene(SCENE, ("hall", "accent", "gallery_"))
    material = make_material("gallery_paint")
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
    export(OUTPUT)


main()
