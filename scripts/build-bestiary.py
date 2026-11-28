"""Builds the arena of the Bestiary room and writes src/assets/bestiary/arena.glb.

    blender --background --factory-startup --python scripts/build-bestiary.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Bestiary",
and leaves every other scene alone. The arena is original low-poly work and holds no game
assets.

A monster stands on the dais in the middle, whose top is at height 0. Around it are broken
standing stones. The arena has two meshes that are painted with vertex colors: "arena", and
"accent", which is white so that the page can give it the color of the monster's element.
"""

import math
import os
import random
import sys

# Blender does not put the folder of the script on the import path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lowpoly import TAU, Shape, add, export, linear, make_material, make_scene, polar  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "src", "assets", "bestiary", "arena.glb")

INK = linear("#1d1a3a")
ROCK = linear("#4a4470")
ROCK_LIGHT = linear("#6d679a")
STONE = linear("#cfcbe8")
TILE = (linear("#8d87b8"), linear("#7d77aa"))
BONE = linear("#efe8d8")
WHITE = linear("#ffffff")

# The page shows a monster at most 6 wide, so the dais is wider than that.
DAIS = 4.4
FLOOR = -0.8
EDGE = 17.0
STONES = 11.8


def dais(arena, accent):
    for i in range(32):
        arena.band(0, 2.4, 0.0, TILE[i % 2], TAU * i / 32, TAU / 32, 3)
        arena.band(2.4, DAIS, 0.0, TILE[(i + 1) % 2], TAU * i / 32, TAU / 32, 3)
    arena.wall(DAIS, -0.4, 0.0, STONE, 64)
    arena.band(DAIS, DAIS + 0.7, -0.4, ROCK_LIGHT, steps=64)
    arena.wall(DAIS + 0.7, FLOOR, -0.4, STONE, 64)
    for radius, width in ((2.3, 0.12), (DAIS - 0.35, 0.18)):
        accent.band(radius, radius + width, 0.012, WHITE)
    # A star of long points between the two rings.
    for i in range(12):
        a = TAU * i / 12
        long = i % 2 == 0
        accent.face(
            [polar(2.55, a - 0.07, 0.014), polar(3.9 if long else 3.2, a, 0.014), polar(2.55, a + 0.07, 0.014)],
            WHITE,
        )
    accent.wall(DAIS + 0.72, -0.62, -0.52, WHITE, 64)


def ground(arena, accent):
    rings = ((DAIS + 0.7, 8.4, 24), (8.4, 12.6, 36), (12.6, EDGE, 48))
    for row, (inner, outer, count) in enumerate(rings):
        for i in range(count):
            color = (ROCK, ROCK_LIGHT)[(i + row) % 2] if row != 1 else (ROCK, ROCK, ROCK_LIGHT)[i % 3]
            arena.band(inner, outer, FLOOR, color, TAU * i / count, TAU / count, 3)
    for radius, width in ((8.35, 0.12), (EDGE - 0.6, 0.2)):
        accent.band(radius, radius + width, FLOOR + 0.012, WHITE)
    # Cracks that glow, running from the dais outwards.
    for i in range(7):
        a = TAU * i / 7 + 0.3
        points = []
        radius = DAIS + 0.9
        while radius < EDGE - 1:
            points.append(polar(radius, a + random.uniform(-0.07, 0.07), FLOOR + 0.02))
            radius += random.uniform(0.9, 1.7)
        accent.tube(points, 0.045, WHITE, 3)
    # The rock under the floating floor, ragged at the bottom.
    steps = 48
    depths = [random.uniform(1.6, 3.8) for _ in range(steps)]
    for i in range(steps):
        a, b = TAU * i / steps, TAU * (i + 1) / steps
        low_a, low_b = FLOOR - depths[i], FLOOR - depths[(i + 1) % steps]
        arena.face([polar(EDGE, a, FLOOR), polar(EDGE, b, FLOOR), polar(EDGE, b, FLOOR - 0.6), polar(EDGE, a, FLOOR - 0.6)], STONE)
        arena.face([polar(EDGE, a, FLOOR - 0.6), polar(EDGE, b, FLOOR - 0.6), polar(EDGE - 2.5, b, low_b), polar(EDGE - 2.5, a, low_a)], INK)


def monolith(arena, accent, angle, height, lean):
    """A standing stone that leans, broken off at a slant, with a glowing mark."""
    across = (-math.sin(angle), math.cos(angle))
    out = (math.cos(angle), math.sin(angle))

    def at(side, depth, up, shift=0.0):
        x, y, _ = polar(STONES, angle)
        return (
            x + across[0] * (side + shift) + out[0] * depth,
            y + across[1] * (side + shift) + out[1] * depth,
            FLOOR + up,
        )

    half, thick = 0.85, 0.45
    corners = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    low = [at(s * half, d * thick, 0) for s, d in corners]
    breaks = [height, height - random.uniform(0.5, 1.6), height - random.uniform(0.2, 1.0), height - 0.3]
    high = [at(s * half * 0.7, d * thick * 0.7, breaks[i], lean) for i, (s, d) in enumerate(corners)]
    for i in range(4):
        j = (i + 1) % 4
        arena.face([low[i], low[j], high[j], high[i]], (ROCK_LIGHT, ROCK, ROCK_LIGHT, ROCK)[i])
    arena.face(high, STONE)
    # The mark is on the side that faces the dais.
    mark = height * 0.45
    shift = lean * 0.45
    front = -thick * 0.88
    accent.face(
        [at(0, front, mark - 0.7, shift), at(-0.28, front, mark, shift), at(0, front, mark + 0.7, shift), at(0.28, front, mark, shift)],
        WHITE,
    )
    # Rubble at the foot.
    for _ in range(3):
        spot = at(random.uniform(-1.6, 1.6), random.uniform(-1.4, 0.6), 0)
        size = random.uniform(0.18, 0.42)
        arena.frustum(spot, size, size * 0.4, size * 0.9, ROCK_LIGHT, 5)


def cluster(accent, arena, angle, radius):
    """Crystals that grow out of the floor."""
    x, y, _ = polar(radius, angle)
    arena.frustum((x, y, FLOOR), 0.75, 0.45, 0.25, INK, 7)
    for dx, dy, size in ((0, 0, 1.0), (0.45, 0.2, 0.6), (-0.4, 0.25, 0.5), (0.1, -0.45, 0.4)):
        accent.gem((x + dx, y + dy, FLOOR - 0.2), 0.3 * size, 2.2 * size, WHITE)


def rib(arena, angle):
    """A great bone that curves up out of the floor, toward the dais."""
    points = []
    for i in range(13):
        t = i / 12
        radius = 15.4 - 3.4 * t * t
        points.append(polar(radius, angle + 0.06 * t, FLOOR + 7.2 * math.sin(t * 1.9)))
    # Thick at the root, thin at the tip.
    for i in range(len(points) - 1):
        arena.tube(points[i : i + 2], 0.34 * (1 - i / 13) + 0.04, BONE, 6)


def shards(arena, accent):
    """Rocks that float beyond the edge."""
    for i in range(22):
        a = TAU * i / 22 + random.uniform(-0.1, 0.1)
        x, y, _ = polar(random.uniform(18.5, 24), a)
        z = random.uniform(-1.5, 8)
        size = random.uniform(0.35, 1.2)
        shape = accent if i % 5 == 0 else arena
        shape.gem((x, y, z), size * (0.35 if shape is accent else 0.8), size * 1.5, WHITE if shape is accent else (ROCK, ROCK_LIGHT)[i % 2])


def main():
    # The same arena at every run.
    random.seed(7)
    scene = make_scene("Solaris_Bestiary", ("arena", "accent", "bestiary_"))
    material = make_material("bestiary_paint")
    arena, accent = Shape(), Shape()
    dais(arena, accent)
    ground(arena, accent)
    for i in range(12):
        angle = TAU * i / 12 + TAU / 24
        monolith(arena, accent, angle, random.uniform(3.2, 6.4), random.uniform(-0.5, 0.5))
    for i in range(6):
        cluster(accent, arena, TAU * i / 6, 14.2)
    for i in range(8):
        rib(arena, TAU * i / 8 + 0.12)
    shards(arena, accent)
    add(scene, material, "arena", arena)
    add(scene, material, "accent", accent)
    export(OUTPUT)


main()
