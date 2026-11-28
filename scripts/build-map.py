"""Builds the floating islands of the Map room and writes src/assets/map/islands.glb.

    blender --background --factory-startup --python scripts/build-map.py

It also runs in an open Blender: it only makes (or remakes) its own scene, "Solaris_Map", and
leaves every other scene alone. The islands are original low-poly work and hold no game assets.

Each region is one mesh "island_<region id>" that is painted with vertex colors, with the empties
"pin_<region id>_<number>" as children. The areas of a region stand on its pins, in order. The
pins are numbered so that any first few of them are spread over the whole island. Blender's -Y
is the side that faces the visitor.
"""

import math
import os
import random

import bpy
from mathutils import Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "src", "assets", "map", "islands.glb")
SCENE = "Solaris_Map"
TAU = math.tau


def linear(color):
    """"#rrggbb" in sRGB becomes the linear color that glTF stores."""
    channels = [int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels] + [1.0]


class Shape:
    """Collects the faces of one island, one color per face."""

    def __init__(self):
        self.verts, self.faces, self.colors = [], [], []

    def face(self, points, color):
        start = len(self.verts)
        self.verts.extend(tuple(p) for p in points)
        self.faces.append(tuple(range(start, start + len(points))))
        self.colors.append(color)

    def loft(self, rings, color, cap=True, floor=False):
        """Walls between rings of equally many points, listed from the bottom up."""
        for low, high in zip(rings, rings[1:]):
            for i in range(len(low)):
                j = (i + 1) % len(low)
                self.face([low[i], low[j], high[j], high[i]], color)
        if cap:
            self.face(rings[-1], color)
        if floor:
            self.face(rings[0][::-1], color)

    def frustum(self, at, bottom, top, height, color, sides=8, turn=0.0, cap=True):
        x, y, z = at

        def ring(radius, up):
            return [
                (x + radius * math.cos(turn + TAU * i / sides), y + radius * math.sin(turn + TAU * i / sides), z + up)
                for i in range(sides)
            ]

        self.loft([ring(bottom, 0), ring(max(top, 0.002), height)], color, cap=cap)

    def box(self, at, size, color, turn=0.0):
        """A block that stands on "at"."""
        x, y, z = at
        w, d, h = size[0] / 2, size[1] / 2, size[2]
        cos, sin = math.cos(turn), math.sin(turn)

        def ring(up):
            return [
                (x + px * cos - py * sin, y + px * sin + py * cos, z + up)
                for px, py in ((-w, -d), (w, -d), (w, d), (-w, d))
            ]

        self.loft([ring(0), ring(h)], color, floor=True)

    def gable(self, at, size, color, turn=0.0):
        """A pitched roof that sits on "at"."""
        x, y, z = at
        w, d, h = size[0] / 2, size[1] / 2, size[2]
        cos, sin = math.cos(turn), math.sin(turn)

        def point(px, py, up):
            return (x + px * cos - py * sin, y + px * sin + py * cos, z + up)

        a, b, c, e = point(-w, -d, 0), point(w, -d, 0), point(w, d, 0), point(-w, d, 0)
        left, right = point(-w, 0, h), point(w, 0, h)
        self.face([a, b, right, left], color)
        self.face([c, e, left, right], color)
        self.face([b, c, right], color)
        self.face([e, a, left], color)

    def dome(self, at, radius, height, color, sides=12, steps=4):
        x, y, z = at
        rings = []
        for s in range(steps + 1):
            angle = (math.pi / 2) * s / steps
            r = max(radius * math.cos(angle), 0.002)
            rings.append(
                [(x + r * math.cos(TAU * i / sides), y + r * math.sin(TAU * i / sides), z + height * math.sin(angle)) for i in range(sides)]
            )
        self.loft(rings, color)

    def crystal(self, at, radius, height, color, lean=(0.0, 0.0), sides=5):
        x, y, z = at
        waist = [
            (
                x + lean[0] * 0.35 + radius * math.cos(TAU * i / sides),
                y + lean[1] * 0.35 + radius * math.sin(TAU * i / sides),
                z + height * 0.35,
            )
            for i in range(sides)
        ]
        foot, tip = (x, y, z - 0.05), (x + lean[0], y + lean[1], z + height)
        for i in range(sides):
            j = (i + 1) % sides
            self.face([foot, waist[j], waist[i]], color)
            self.face([waist[i], waist[j], tip], color)

    def torus(self, at, radius, thickness, color, tilt=0.0, segments=28, sides=6):
        """A flat ring around the vertical axis, tipped about the X axis by "tilt"."""
        x, y, z = at

        def point(i, k):
            a, b = TAU * i / segments, TAU * k / sides
            r = radius + thickness * math.cos(b)
            px, py, pz = r * math.cos(a), r * math.sin(a), thickness * math.sin(b)
            return (x + px, y + py * math.cos(tilt) - pz * math.sin(tilt), z + py * math.sin(tilt) + pz * math.cos(tilt))

        for i in range(segments):
            for k in range(sides):
                self.face([point(i, k), point(i + 1, k), point(i + 1, k + 1), point(i, k + 1)], color)

    def rock(self, at, size, color, rng, squash=1.0):
        """A lumpy boulder: an octahedron split once and pushed around."""
        x, y, z = at
        axes = [Vector(v) for v in ((1, 0, 0), (0, 1, 0), (-1, 0, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
        triangles = []
        for i in range(4):
            a, b = axes[i], axes[(i + 1) % 4]
            triangles += [(a, b, axes[4]), (b, a, axes[5])]
        moved = {}

        def push(v):
            key = tuple(round(c, 4) for c in v)
            if key not in moved:
                n = v.normalized() * size * rng.uniform(0.7, 1.25)
                moved[key] = (x + n.x, y + n.y, z + n.z * squash)
            return moved[key]

        for a, b, c in triangles:
            ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
            for tri in ((a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)):
                self.face([push(v) for v in tri], color)


class Island:
    """The ground of a region: its outline, its heights and the places that are taken."""

    def __init__(self, seed, radius, depth, ground, relief):
        self.shape = Shape()
        self.rng = random.Random(seed)
        self.seed = seed
        self.radius = radius
        self.depth = depth
        self.ground = ground
        self.relief = relief
        self.pins = []
        self.taken = []  # (x, y, radius)
        self.tall = []  # (x, y, radius, height) of what can hide a pin
        self.water = []  # functions that tell whether a point is wet

    def edge(self, angle):
        wave = noise.noise((math.cos(angle) * 1.7 + self.seed, math.sin(angle) * 1.7, 0.3))
        fine = noise.noise((math.cos(angle) * 5.0, math.sin(angle) * 5.0 + self.seed, 1.7))
        return self.radius * (1 + 0.16 * wave + 0.07 * fine)

    def height(self, x, y):
        rim = min(1.0, math.hypot(x, y) / self.radius)
        return self.relief(x, y) * (1 - rim**4)

    def wet(self, x, y):
        return any(test(x, y) for test in self.water)

    def inside(self, x, y, margin=0.0):
        return math.hypot(x, y) < self.edge(math.atan2(y, x)) - margin

    def free(self, x, y, radius):
        if not self.inside(x, y, radius + 0.15) or self.wet(x, y):
            return False
        if any(math.hypot(x - a, y - b) < radius + r for a, b, r in self.taken):
            return False
        return all(math.hypot(x - a, y - b) > radius + 0.34 for a, b in self.pins)

    def hidden(self, x, y):
        """Whether something tall stands between the point and the visitor at the front."""
        return any(abs(x - a) < r + 0.15 and 0 < y - b < r + h * 0.9 for a, b, r, h in self.tall)

    def reserve(self, x, y, radius, height=0.0):
        if height:
            self.tall.append((x, y, radius, height))
        self.taken.append((x, y, radius))
        return (x, y, self.height(x, y))

    def terrain(self, paint, cliff, under):
        """The top surface, the broken cliff below it and a few rocks that drift under it."""
        around, across = 84, 22
        angles = [TAU * i / around for i in range(around)]

        def top(a, step):
            r = self.edge(a) * step / across
            x, y = r * math.cos(a), r * math.sin(a)
            return (x, y, self.height(x, y))

        for step in range(across):
            for i, a in enumerate(angles):
                b = angles[(i + 1) % around]
                quad = [top(a, step), top(a, step + 1), top(b, step + 1), top(b, step)]
                # The innermost ring is a fan around the middle.
                points = quad[:3] if step == 0 else quad
                cx = sum(p[0] for p in points) / len(points)
                cy = sum(p[1] for p in points) / len(points)
                cz = sum(p[2] for p in points) / len(points)
                self.shape.face(points, paint(cx, cy, cz, self.rng))

        # (share of the outline, depth below the rim)
        layers = [(1.0, 0.0), (1.03, 0.28), (0.9, 0.5), (0.74, 0.34 * self.depth), (0.5, 0.6 * self.depth), (0.24, 0.82 * self.depth), (0.02, self.depth)]
        rings = []
        for index, (share, down) in enumerate(layers):
            ring = []
            for i, a in enumerate(angles[::2]):
                jag = 0.0 if index == 0 else noise.noise((i * 0.55, index * 1.3, self.seed))
                r = self.edge(a) * share * (1 + 0.3 * jag * min(1, index / 2))
                drop = down * (1 + 0.35 * jag) if index > 1 else down
                ring.append((r * math.cos(a), r * math.sin(a), -drop))
            rings.append(ring)
        # The first strip joins the 84 points of the top to the 42 points of the cliff.
        for i in range(around // 2):
            a, b, c = top(angles[2 * i], across), top(angles[2 * i + 1], across), top(angles[(2 * i + 2) % around], across)
            low, high = rings[1][i], rings[1][(i + 1) % (around // 2)]
            self.shape.face([a, low, b], cliff[0])
            self.shape.face([b, low, high], cliff[0])
            self.shape.face([b, high, c], cliff[0])
        for index in range(1, len(rings) - 1):
            low, high = rings[index + 1], rings[index]
            for i in range(len(low)):
                j = (i + 1) % len(low)
                color = cliff[min(index, len(cliff) - 1)]
                self.shape.face([low[i], low[j], high[j]], color)
                self.shape.face([low[i], high[j], high[i]], under if index > 2 and i % 3 == 0 else color)

        for k in range(11):
            a = TAU * k / 11 + self.rng.uniform(-0.2, 0.2)
            r = self.radius * self.rng.uniform(0.75, 1.15)
            at = (r * math.cos(a), r * math.sin(a), -self.rng.uniform(0.35, 0.95) * self.depth)
            self.shape.rock(at, self.rng.uniform(0.12, 0.36), self.rng.choice(cliff[1:]), self.rng, squash=1.2)

    def place_pins(self, count):
        """Picks points far from each other, starting at the front of the island."""
        spots = []
        reach = self.radius * 0.9
        while len(spots) < 1400:
            x, y = self.rng.uniform(-reach, reach), self.rng.uniform(-reach, reach)
            if self.free(x, y, 0.28) and not self.hidden(x, y):
                spots.append((x, y))
        chosen = [min(spots, key=lambda p: p[1] + abs(p[0]) * 0.6)]
        while len(chosen) < count:
            chosen.append(max(spots, key=lambda p: min(math.dist(p, q) for q in chosen)))
        self.pins = chosen

    def ribbon(self, path, width, color, lift=0.025):
        """A flat strip that follows the ground, for rivers, canals and roads."""
        points = []
        for (ax, ay), (bx, by) in zip(path, path[1:]):
            for s in range(10):
                points.append((ax + (bx - ax) * s / 10, ay + (by - ay) * s / 10))
        points.append(path[-1])
        sides = []
        for i, (x, y) in enumerate(points):
            ax, ay = points[max(i - 1, 0)]
            bx, by = points[min(i + 1, len(points) - 1)]
            length = math.hypot(bx - ax, by - ay) or 1
            nx, ny = -(by - ay) / length * width / 2, (bx - ax) / length * width / 2
            sides.append(
                [(x + nx, y + ny, self.height(x + nx, y + ny) + lift), (x - nx, y - ny, self.height(x - nx, y - ny) + lift)]
            )
        for a, b in zip(sides, sides[1:]):
            self.shape.face([a[1], b[1], b[0], a[0]], color)

        def wet(px, py):
            return any(math.hypot(px - x, py - y) < width / 2 + 0.22 for x, y in points)

        self.water.append(wet)

    def waterfall(self, angle, width, color, foam):
        """Water that leaves the rim and thins out as it falls."""
        out = Vector((math.cos(angle), math.sin(angle), 0))
        side = Vector((-out.y, out.x, 0))
        start = out * (self.edge(angle) - 0.05)
        rows = [(0.0, 0.03, 1.0), (0.22, -0.06, 1.05), (0.36, -0.55, 0.9), (0.44, -1.4, 0.65), (0.48, -2.4, 0.3)]
        strip = []
        for push, z, share in rows:
            centre = start + out * push + Vector((0, 0, z))
            strip.append((centre - side * width * share / 2, centre + side * width * share / 2))
        for index, (a, b) in enumerate(zip(strip, strip[1:])):
            self.shape.face([a[0], b[0], b[1], a[1]], foam if index % 2 else color)

    def scatter(self, count, radius, build):
        placed, tries = 0, 0
        while placed < count and tries < count * 40:
            tries += 1
            x = self.rng.uniform(-self.radius, self.radius)
            y = self.rng.uniform(-self.radius, self.radius)
            if self.free(x, y, radius):
                build(self.reserve(x, y, radius))
                placed += 1


def hill(x, y, cx, cy, radius, height):
    return height * math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / radius**2))


def mix(rng, colors):
    return linear(rng.choice(colors))


# ---------------------------------------------------------------- Huanglong


def huanglong():
    def relief(x, y):
        return (
            hill(x, y, 0.3, 3.1, 1.7, 0.9)
            + hill(x, y, -3.0, 1.2, 1.2, 0.5)
            + 0.14 * noise.noise((x * 0.7, y * 0.7, 2.0))
        )

    land = Island(11, 5.0, 4.2, "#7cc66a", relief)
    s, rng = land.shape, land.rng
    river = [(0.9, 2.0), (1.6, 1.0), (1.2, -0.2), (2.2, -1.2), (2.9, -2.4), (3.45, -3.2)]
    land.ribbon(river, 0.42, linear("#5cc8e8"))
    land.waterfall(math.atan2(-3.2, 3.45), 0.55, linear("#5cc8e8"), linear("#d8f5ff"))

    def paint(x, y, z, r):
        if z > 0.62:
            return mix(r, ["#a9d977", "#b8e084"])
        if math.hypot(x, y) > land.edge(math.atan2(y, x)) * 0.9:
            return mix(r, ["#d9c98f", "#cfbd80"])
        return mix(r, ["#7cc66a", "#86cf70", "#72bd66"])

    def peak(x, y, radius, height):
        """A karst peak: stacked stone with green ledges."""
        at = land.reserve(x, y, radius, height)
        z, r = at[2] - 0.1, radius
        for level in range(3):
            tall = height * (0.45, 0.33, 0.22)[level]
            s.frustum((x, y, z), r, r * 0.74, tall, linear(("#8fa5a0", "#9db2aa", "#aec1b6")[level]), 7, level * 0.5, cap=False)
            z += tall
            r *= 0.74
            s.frustum((x, y, z - 0.03), r * 1.12, r * 0.72, 0.14, linear("#5aa860"), 7, level * 0.5)
            x += rng.uniform(-0.06, 0.06)
            r *= 0.88
        s.frustum((x, y, z + 0.08), r * 0.8, 0.0, height * 0.18, linear("#4c9a5c"), 7)

    def pagoda(x, y, floors, size):
        at = land.reserve(x, y, size * 0.95, floors * size * 0.55)
        z = at[2]
        s.box((x, y, z - 0.08), (size * 1.35, size * 1.35, 0.18), linear("#c9c3b0"))
        z += 0.1
        for floor in range(floors):
            w = size * (1 - floor * 0.13)
            s.box((x, y, z), (w * 0.62, w * 0.62, w * 0.42), linear("#f4ead2"))
            z += w * 0.42
            s.frustum((x, y, z), w * 0.82, w * 0.3, w * 0.24, linear("#c8453f"), 4, math.pi / 4)
            s.frustum((x, y, z - 0.025), w * 0.86, w * 0.8, 0.04, linear("#f0b44c"), 4, math.pi / 4)
            z += w * 0.2
        s.frustum((x, y, z), 0.05, 0.0, size * 0.55, linear("#f0b44c"), 6)

    peak(0.2, 3.35, 1.05, 3.4)
    peak(-1.35, 3.1, 0.62, 2.1)
    peak(1.75, 2.95, 0.55, 1.75)
    peak(-3.35, 1.35, 0.55, 1.9)
    peak(-3.7, -0.2, 0.36, 1.15)
    peak(3.55, 0.9, 0.45, 1.4)
    pagoda(-1.1, 0.75, 4, 0.95)
    pagoda(2.8, 0.2, 2, 0.5)
    pagoda(-2.4, -2.2, 2, 0.55)

    # The walls and gate of Jinzhou.
    for i in range(7):
        a = math.radians(125 + i * 19)
        x, y = -1.1 + 1.25 * math.cos(a), 0.75 + 1.25 * math.sin(a)
        at = land.reserve(x, y, 0.18)
        s.box((x, y, at[2] - 0.05), (0.42, 0.14, 0.34), linear("#d8cfba"), a + math.pi / 2)
        s.box((x, y, at[2] + 0.29), (0.46, 0.18, 0.07), linear("#a63b3b"), a + math.pi / 2)
    land.place_pins(22)

    def pine(at):
        x, y, z = at
        size = rng.uniform(0.75, 1.2)
        s.frustum((x, y, z - 0.04), 0.05 * size, 0.04 * size, 0.18 * size, linear("#7a5238"), 5)
        green = mix(rng, ["#2f8a5a", "#3c9b63", "#27774f"])
        for tier in range(3):
            s.frustum((x, y, z + (0.12 + tier * 0.13) * size), (0.22 - tier * 0.05) * size, 0.0, 0.26 * size, green, 7)

    def maple(at):
        x, y, z = at
        s.frustum((x, y, z - 0.04), 0.045, 0.035, 0.24, linear("#7a5238"), 5)
        s.rock((x, y, z + 0.34), rng.uniform(0.17, 0.24), mix(rng, ["#f0a33c", "#e8703c", "#f5c04a"]), rng, squash=0.85)

    land.scatter(80, 0.17, pine)
    land.scatter(26, 0.2, maple)
    land.terrain(paint, [linear(c) for c in ("#b9955f", "#8d7058", "#735a52", "#5b4750")], linear("#4a3a48"))
    return land


# ---------------------------------------------------------------- The Black Shores


def black_shores():
    def relief(x, y):
        return hill(x, y, 0, 1.1, 1.3, 0.35) + 0.12 * noise.noise((x * 1.1, y * 1.1, 6.0))

    land = Island(23, 3.5, 3.4, "#39406b", relief)
    s, rng = land.shape, land.rng
    for path in ([(-0.2, -0.1), (-1.6, -1.0), (-2.4, -2.45)], [(0.4, 0.0), (1.7, -0.4), (3.3, -0.55)]):
        land.ribbon(path, 0.34, linear("#4fa8ff"))
    land.waterfall(math.atan2(-2.45, -2.4), 0.45, linear("#4fa8ff"), linear("#cfe8ff"))
    land.waterfall(math.atan2(-0.55, 3.3), 0.4, linear("#4fa8ff"), linear("#cfe8ff"))

    def paint(x, y, z, r):
        if math.hypot(x, y) > land.edge(math.atan2(y, x)) * 0.87:
            return mix(r, ["#23274a", "#2a2e55"])
        return mix(r, ["#3d4474", "#444c80", "#363c66"])

    # The tower of Tethys, with its rings.
    x, y = 0.0, 1.15
    at = land.reserve(x, y, 1.05, 2.6)
    z = at[2]
    s.frustum((x, y, z - 0.1), 1.0, 0.9, 0.25, linear("#aeb8e8"), 10)
    s.frustum((x, y, z + 0.15), 0.62, 0.5, 0.2, linear("#e9edff"), 10)
    s.frustum((x, y, z + 0.35), 0.3, 0.13, 2.3, linear("#f4f6ff"), 8)
    for step in range(4):
        s.frustum((x, y, z + 0.7 + step * 0.45), 0.31 - step * 0.04, 0.28 - step * 0.04, 0.07, linear("#5fd4ff"), 8)
    s.crystal((x, y, z + 2.8), 0.24, 0.85, linear("#8ae6ff"), sides=6)
    s.torus((x, y, z + 2.15), 0.85, 0.045, linear("#d6dcff"), 0.28)
    s.torus((x, y, z + 2.75), 0.58, 0.035, linear("#5fd4ff"), -0.4)
    for k in range(6):
        a = TAU * k / 6 + 0.3
        px, py = x + 0.82 * math.cos(a), y + 0.82 * math.sin(a)
        s.box((px, py, z + 0.1), (0.11, 0.11, 0.65), linear("#dfe4ff"), a)
        s.crystal((px, py, z + 0.8), 0.08, 0.26, linear("#5fd4ff"))
    land.place_pins(10)

    def shard(at):
        px, py, pz = at
        color = mix(rng, ["#5fd4ff", "#7f8cff", "#b59cff"])
        for _ in range(3):
            s.crystal(
                (px + rng.uniform(-0.1, 0.1), py + rng.uniform(-0.1, 0.1), pz),
                rng.uniform(0.05, 0.1),
                rng.uniform(0.25, 0.65),
                color,
                (rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18)),
            )

    def stone(at):
        px, py, pz = at
        size = rng.uniform(0.16, 0.32)
        s.rock((px, py, pz + size * 0.4), size, mix(rng, ["#1e2140", "#272b52"]), rng, squash=1.5)

    land.scatter(18, 0.22, shard)
    land.scatter(30, 0.2, stone)
    # The butterflies of the shores.
    for _ in range(22):
        a, r = rng.uniform(0, TAU), rng.uniform(1.2, 3.6)
        px, py, pz = r * math.cos(a), r * math.sin(a), rng.uniform(0.7, 2.4)
        size, turn = rng.uniform(0.07, 0.13), rng.uniform(0, TAU)
        wx, wy = math.cos(turn) * size, math.sin(turn) * size
        for flip in (1, -1):
            s.face(
                [(px, py, pz), (px + wx * flip - wy * 0.5, py + wy * flip + wx * 0.5, pz + size * 0.8), (px + wx * flip + wy * 0.5, py + wy * flip - wx * 0.5, pz + size * 0.2)],
                linear("#8ae6ff"),
            )
    land.terrain(paint, [linear(c) for c in ("#565d94", "#33375e", "#262948", "#1b1d36")], linear("#5fd4ff"))
    return land


# ---------------------------------------------------------------- Rinascita


def rinascita():
    def relief(x, y):
        return (
            hill(x, y, -0.2, 2.8, 1.8, 0.75)
            + hill(x, y, 3.0, 1.6, 1.0, 0.4)
            + 0.09 * noise.noise((x * 0.8, y * 0.8, 9.0))
        )

    land = Island(37, 5.0, 4.0, "#e6c98c", relief)
    s, rng = land.shape, land.rng
    water, foam = linear("#35bfd0"), linear("#d2f8f5")
    canals = (
        [(-5.0, -0.3), (-3.2, -0.5), (-1.6, -1.3), (0.2, -1.1), (1.6, -1.9), (2.2, -3.2), (2.5, -4.55)],
        [(-1.6, -1.3), (-2.0, -2.8), (-2.7, -4.0)],
    )
    for path in canals:
        land.ribbon(path, 0.48, water)
    for end in ((2.5, -4.55), (-2.7, -4.0), (-5.0, -0.3)):
        land.waterfall(math.atan2(end[1], end[0]), 0.55, water, foam)

    def paint(x, y, z, r):
        d = math.hypot(x, y) / land.edge(math.atan2(y, x))
        if d > 0.9:
            return mix(r, ["#f3dfae", "#ead29c"])
        if noise.noise((x * 0.55, y * 0.55, 4.0)) > 0.12:
            return mix(r, ["#9cc86a", "#8fbd62"])
        return mix(r, ["#e6c98c", "#dcbd80", "#edd296"])

    def house(x, y, turn, tall=0.34):
        z = land.reserve(x, y, 0.26)[2]
        width, deep = rng.uniform(0.32, 0.46), rng.uniform(0.26, 0.34)
        height = tall * rng.uniform(0.85, 1.35)
        s.box((x, y, z - 0.06), (width, deep, height + 0.06), mix(rng, ["#fff1d6", "#ffd9b8", "#f9c6a0", "#fbe7a8", "#f4f0ea"]), turn)
        s.gable((x, y, z + height), (width * 1.12, deep * 1.2, 0.2), mix(rng, ["#d9603f", "#c8503c", "#e57a45"]), turn)

    # The cathedral of Ragunna.
    x, y = -0.2, 2.8
    z = land.reserve(x, y, 1.25, 2.2)[2]
    s.box((x, y, z - 0.15), (2.2, 1.35, 0.35), linear("#e9e0cc"))
    s.box((x, y, z + 0.2), (1.7, 1.0, 0.8), linear("#fff7e6"))
    s.gable((x, y, z + 1.0), (1.8, 1.08, 0.32), linear("#d9603f"))
    s.frustum((x, y, z + 1.0), 0.55, 0.55, 0.5, linear("#fff1d6"), 12)
    s.dome((x, y, z + 1.5), 0.62, 0.72, linear("#3fae9d"))
    s.frustum((x, y, z + 2.2), 0.12, 0.12, 0.2, linear("#fff7e6"), 8)
    s.crystal((x, y, z + 2.4), 0.09, 0.5, linear("#f2c14e"))
    for column in range(7):
        s.frustum((x - 0.75 + column * 0.25, y - 0.6, z + 0.2), 0.055, 0.045, 0.62, linear("#ffffff"), 8)
    s.box((x, y - 0.6, z + 0.82), (1.75, 0.18, 0.12), linear("#f2c14e"))
    for side in (-1.15, 1.15):
        s.box((x + side, y, z), (0.36, 0.36, 1.45), linear("#fff1d6"))
        s.frustum((x + side, y, z + 1.45), 0.3, 0.0, 0.55, linear("#3fae9d"), 4, math.pi / 4)

    # The arena of Septimont.
    x, y = 2.9, 0.35
    z = land.reserve(x, y, 1.05)[2]
    s.frustum((x, y, z - 0.04), 0.62, 0.62, 0.09, linear("#d9b574"), 20)
    for tier, (radius, height) in enumerate(((0.9, 0.34), (0.82, 0.28))):
        base = z + tier * 0.4
        for k in range(18):
            a = TAU * k / 18
            if tier == 1 and 11 <= k <= 14:
                continue
            px, py = x + radius * math.cos(a), y + radius * math.sin(a)
            s.box((px, py, base - 0.05), (0.12, 0.15, height + 0.05), linear("#f1dcae"), a + math.pi / 2)
            s.box((px, py, base + height), (0.34, 0.19, 0.09), linear("#e3c58c"), a + math.pi / 2)

    # The bell tower.
    x, y = -2.9, 1.5
    z = land.reserve(x, y, 0.5, 2.4)[2]
    s.box((x, y, z - 0.08), (0.55, 0.55, 1.75), linear("#e8a374"))
    s.box((x, y, z + 1.67), (0.66, 0.66, 0.09), linear("#fff7e6"))
    for dx, dy in ((-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2)):
        s.box((x + dx, y + dy, z + 1.76), (0.09, 0.09, 0.42), linear("#fff7e6"))
    s.rock((x, y, z + 1.94), 0.12, linear("#f2c14e"), rng)
    s.frustum((x, y, z + 2.18), 0.5, 0.0, 0.62, linear("#d9603f"), 4, math.pi / 4)

    for cx, cy, count, turn in ((-1.5, 0.35, 7, 0.2), (1.1, 0.3, 6, -0.3), (-3.1, -2.0, 4, 0.7), (0.2, -2.7, 4, 0.1)):
        placed = 0
        for _ in range(200):
            px, py = cx + rng.uniform(-0.95, 0.95), cy + rng.uniform(-0.7, 0.7)
            if placed < count and land.free(px, py, 0.26):
                house(px, py, turn + rng.uniform(-0.15, 0.15))
                placed += 1
    # Bridges over the canals.
    for bx, by, turn in ((-0.7, -1.2, math.pi / 2 + 0.1), (1.9, -2.5, 0.4), (-3.9, -0.42, math.pi / 2 - 0.1)):
        top = land.height(bx, by)
        s.box((bx, by, top + 0.09), (0.82, 0.26, 0.07), linear("#fff1d6"), turn)
        for end in (-0.36, 0.36):
            s.box((bx + end * math.cos(turn), by + end * math.sin(turn), top - 0.02), (0.12, 0.3, 0.13), linear("#d9b574"), turn)
    land.place_pins(22)

    def cypress(at):
        px, py, pz = at
        size = rng.uniform(0.8, 1.2)
        s.frustum((px, py, pz - 0.04), 0.035, 0.03, 0.12, linear("#7a5238"), 5)
        s.crystal((px, py, pz + 0.08), 0.13 * size, 0.75 * size, mix(rng, ["#2f7d58", "#3b8f5f"]), sides=7)

    def bush(at):
        px, py, pz = at
        size = rng.uniform(0.11, 0.18)
        s.rock((px, py, pz + size * 0.5), size, mix(rng, ["#6fae52", "#84c05c", "#e87fa8"]), rng, squash=0.75)

    land.scatter(46, 0.16, cypress)
    land.scatter(36, 0.15, bush)
    land.terrain(paint, [linear(c) for c in ("#f0c98a", "#c98c62", "#a86d5a", "#80525a")], linear("#6b4455"))
    return land


# ---------------------------------------------------------------- Roya Frostlands


def roya():
    def relief(x, y):
        crater = hill(x, y, 2.4, -0.7, 0.85, 1.0)
        ridge = 0.3 * crater * (1 - crater) * 4
        return (
            hill(x, y, -0.6, 3.2, 2.0, 0.8)
            + ridge
            - 0.22 * crater
            + 0.16 * noise.noise((x * 0.65, y * 0.65, 13.0))
        )

    land = Island(53, 5.2, 4.8, "#eef5ff", relief)
    s, rng = land.shape, land.rng
    ice = linear("#8fd8f5")
    land.ribbon([(-1.0, 1.5), (-1.7, 0.2), (-1.2, -1.2), (-2.4, -2.4), (-3.2, -3.85)], 0.46, ice)
    land.waterfall(math.atan2(-3.85, -3.2), 0.6, ice, linear("#ffffff"))

    def paint(x, y, z, r):
        if math.hypot(x - 2.4, y + 0.7) < 0.75:
            return mix(r, ["#7d84a8", "#6d7498"])
        if noise.noise((x * 0.5, y * 0.5, 21.0)) > 0.2:
            return mix(r, ["#cfe0f8", "#c4d8f5"])
        return mix(r, ["#f4f8ff", "#e8f1fd", "#ffffff"])

    def mountain(x, y, radius, height):
        z = land.reserve(x, y, radius * 0.9, height * 0.8)[2] - 0.12
        sides = 7
        base, mid = [], []
        for i in range(sides):
            a = TAU * i / sides + rng.uniform(-0.18, 0.18)
            r = radius * rng.uniform(0.85, 1.15)
            base.append((x + r * math.cos(a), y + r * math.sin(a), z))
        tip = (x + rng.uniform(-0.15, 0.15), y, z + height)
        for p in base:
            share = rng.uniform(0.42, 0.62)
            mid.append(tuple(p[k] + (tip[k] - p[k]) * share for k in range(3)))
        for i in range(sides):
            j = (i + 1) % sides
            s.face([base[i], base[j], mid[j], mid[i]], linear("#5f77ad" if i % 2 else "#6f88bd"))
            s.face([mid[i], mid[j], tip], linear("#ffffff" if i % 2 else "#e3eeff"))

    mountain(-0.7, 3.35, 1.25, 3.3)
    mountain(0.95, 3.5, 0.8, 2.2)
    mountain(-2.25, 2.85, 0.75, 1.9)
    mountain(2.55, 2.5, 0.7, 1.65)
    mountain(-3.7, 1.0, 0.65, 1.5)

    # The academy: a dome, its wings and the mast with a ring.
    x, y = 0.45, 1.05
    z = land.reserve(x, y, 0.95, 1.6)[2]
    s.frustum((x, y, z - 0.1), 0.9, 0.84, 0.22, linear("#8c9ac4"), 14)
    s.frustum((x, y, z + 0.12), 0.58, 0.58, 0.34, linear("#f2f5ff"), 14)
    s.frustum((x, y, z + 0.26), 0.595, 0.595, 0.08, linear("#ffb347"), 14)
    s.dome((x, y, z + 0.46), 0.58, 0.46, linear("#6fc3f2"), 14)
    s.frustum((x, y, z + 0.88), 0.07, 0.03, 1.15, linear("#f2f5ff"), 6)
    s.torus((x, y, z + 1.6), 0.4, 0.035, linear("#ffb347"), 0.22)
    s.crystal((x, y, z + 2.0), 0.09, 0.38, linear("#ffb347"))
    for side in (-1, 1):
        s.box((x + side * 0.82, y, z), (0.5, 0.38, 0.3), linear("#e4eaff"))
        s.gable((x + side * 0.82, y, z + 0.3), (0.55, 0.44, 0.16), linear("#4c68a8"))

    # The crashed star.
    x, y = 2.4, -0.7
    z = land.reserve(x, y, 0.9)[2]
    s.rock((x, y, z + 0.2), 0.34, linear("#3a3f66"), rng, squash=0.8)
    for k in range(5):
        a = TAU * k / 5 + 0.4
        s.crystal((x + 0.26 * math.cos(a), y + 0.26 * math.sin(a), z + 0.12), 0.08, 0.62, linear("#c79bff"), (0.3 * math.cos(a), 0.3 * math.sin(a)))
    land.place_pins(24)

    def pine(at):
        px, py, pz = at
        size = rng.uniform(0.75, 1.25)
        s.frustum((px, py, pz - 0.04), 0.045 * size, 0.035 * size, 0.16 * size, linear("#5d4a55"), 5)
        for tier in range(3):
            z0 = pz + (0.1 + tier * 0.15) * size
            r = (0.2 - tier * 0.045) * size
            s.frustum((px, py, z0), r, r * 0.35, 0.17 * size, linear("#2f6f78"), 7, cap=False)
            s.frustum((px, py, z0 + 0.17 * size), r * 0.46, 0.0, 0.08 * size, linear("#ffffff"), 7)

    def shard(at):
        px, py, pz = at
        color = mix(rng, ["#8fe3ff", "#b6ecff", "#a9c4ff"])
        for _ in range(3):
            s.crystal(
                (px + rng.uniform(-0.1, 0.1), py + rng.uniform(-0.1, 0.1), pz),
                rng.uniform(0.05, 0.11),
                rng.uniform(0.25, 0.7),
                color,
                (rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2)),
            )

    land.scatter(62, 0.17, pine)
    land.scatter(17, 0.22, shard)
    land.terrain(paint, [linear(c) for c in ("#b8d8f5", "#7f9acb", "#5c6fa3", "#43507f")], linear("#8fe3ff"))
    return land


def make_scene():
    """A clean scene of our own; whatever else is open stays as it is."""
    old = bpy.data.scenes.get(SCENE)
    if old:
        for obj in list(old.collection.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        scene = old
    else:
        scene = bpy.data.scenes.new(SCENE)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.name.startswith(("island_", "map_")) and item.users == 0:
                block.remove(item)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene


def make_material():
    material = bpy.data.materials.new("map_paint")
    material.use_nodes = True
    tree = material.node_tree
    shader = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    paint = tree.nodes.new("ShaderNodeVertexColor")
    paint.layer_name = "Color"
    tree.links.new(paint.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.9
    material.use_backface_culling = False
    return material


def add_island(scene, material, region, land, place):
    name = f"island_{region}"
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(land.shape.verts, [], land.shape.faces)
    colors = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    flat = [c for face, color in zip(land.shape.faces, land.shape.colors) for _ in face for c in color]
    colors.data.foreach_set("color", flat)
    mesh.color_attributes.active_color = colors
    mesh.materials.append(material)
    mesh.update()
    island = bpy.data.objects.new(name, mesh)
    island.location = place
    scene.collection.objects.link(island)
    for number, (x, y) in enumerate(land.pins):
        pin = bpy.data.objects.new(f"pin_{region}_{number:02d}", None)
        pin.empty_display_type = "SPHERE"
        pin.empty_display_size = 0.12
        pin.parent = island
        pin.location = (x, y, land.height(x, y))
        scene.collection.objects.link(pin)
    print(f"[map] {name}: {len(land.shape.faces)} faces, {len(land.pins)} pins")


def main():
    scene = make_scene()
    material = make_material()
    # Where they stand here only matters in Blender; the web page places them itself.
    for region, build, place in (
        (1, huanglong, (-12.5, 0, 0)),
        (900, black_shores, (-2.6, 0, 0)),
        (3, rinascita, (6.8, 0, 0)),
        (4, roya, (18.5, 0, 0)),
    ):
        add_island(scene, material, region, build(), place)
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format="GLB",
        use_active_scene=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_texcoords=False,
        export_animations=False,
        export_meshopt_compression_enable=True,
    )
    print(f"[map] wrote {OUTPUT} ({os.path.getsize(OUTPUT) // 1024} KB)")


main()
