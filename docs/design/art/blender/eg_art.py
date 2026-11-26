"""ElectraGuard "Ink and Paper" vision artwork, built and rendered headless in Blender.

    blender -b -P eg_art.py -- <out.png> <width> <height> <scene>

scene: hero | phone | story | evening | sheet

Look: flat two-step toon colour from the app's light tokens (lit + shadow, driven only by
one sun lamp), Freestyle ink lines in the warm line colour (thick silhouettes, thin creases,
a slight wobble), paper sky, one warm sun accent. No textures, no gradients except the halo.
Every character is built into its own collection so the scene can later be split into
animation layers or exported per layer with the Freestyle SVG exporter.
"""

import math
import random
import sys

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[0] if args else "//eg.png"
WIDTH = int(args[1]) if len(args) > 1 else 1600
HEIGHT = int(args[2]) if len(args) > 2 else 700
SCENE = args[3] if len(args) > 3 else "hero"
random.seed(11)

# ---------- palette (frontend/ui/tokens.css, light theme) ----------
HEX = {
    "ink": "#0e0d0b", "ink2": "#45413a", "ink3": "#6e6a62", "paper": "#faf8f3", "paper2": "#f2efe7",
    "sun": "#e3b060", "sunStrong": "#c98f2e", "sunTint": "#f6e7c6", "sunWash": "#fbf4e4",
    "line": "#7d6f5c", "fill": "#d9cfbc", "wall": "#f4eee2", "ground": "#efe8da", "rule": "#e6e1d5",
    "leaf": "#b9b08f", "leafDark": "#8f8768", "skin1": "#6b4a32", "skin2": "#8a5d3b", "skin3": "#4e3424",
    "ballot": "#e8edf0", "green": "#6f8f5a",
}
# shadow partner for each lit colour (all from the table, or a gentle darkening of it)
MOOD = {"shadow": 0.86, "warm": 0.0}


def hexrgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def srgb(hex_value):
    c = [v / 255 for v in hexrgb(hex_value)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


def shade(hex_value, factor):
    c = [min(255, max(0, int(v * factor))) for v in hexrgb(hex_value)]
    return "#%02x%02x%02x" % tuple(c)


def mix(a, b, t):
    ca, cb = hexrgb(a), hexrgb(b)
    return "#%02x%02x%02x" % tuple(int(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))


def C(name):
    return HEX.get(name, name)


# ---------- clean scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
NOINK = bpy.data.collections.new("noink")
scene.collection.children.link(NOINK)

_materials = {}
_current_coll = [scene.collection]


def toon(lit, shadow=None, alpha=1.0):
    """Two-step toon material: lit colour where the sun reaches, shadow colour elsewhere."""
    lit = C(lit)
    if MOOD["warm"]:
        lit = mix(lit, HEX["sun"], MOOD["warm"])
    shadow = C(shadow) if shadow else shade(lit, MOOD["shadow"])
    if MOOD["warm"] and shadow:
        shadow = mix(shadow, HEX["sunStrong"], MOOD["warm"] * 0.6)
    key = (lit, shadow, alpha)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new("toon_%s_%s" % (lit, shadow))
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = srgb(shadow)
    ramp.color_ramp.elements[1].position = 0.22
    ramp.color_ramp.elements[1].color = srgb(lit)
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(diffuse.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emit.inputs[0])
    if alpha < 1.0:
        mixs = nt.nodes.new("ShaderNodeMixShader")
        transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
        mixs.inputs[0].default_value = alpha
        nt.links.new(transparent.outputs[0], mixs.inputs[1])
        nt.links.new(emit.outputs[0], mixs.inputs[2])
        nt.links.new(mixs.outputs[0], out.inputs[0])
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
    else:
        nt.links.new(emit.outputs[0], out.inputs[0])
    _materials[key] = m
    return m


def flat(colour):
    colour = C(colour)
    key = ("flat", colour)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new("flat_" + colour)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = srgb(colour)
    nt.links.new(emit.outputs[0], out.inputs[0])
    _materials[key] = m
    return m


def halo_mat(inner, mid, outer, radius, inner_stop=0.18):
    """Radial gradient disc (the only gradient allowed): sun halo / lamp glow."""
    m = bpy.data.materials.new("halo")
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vm = nt.nodes.new("ShaderNodeVectorMath")
    vm.operation = "LENGTH"
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = radius
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = inner_stop
    ramp.color_ramp.elements[0].color = srgb(C(inner))
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = srgb(C(outer))
    e = ramp.color_ramp.elements.new(0.5)
    e.color = srgb(C(mid))
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(tc.outputs["Object"], vm.inputs[0])
    nt.links.new(vm.outputs["Value"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emit.inputs[0])
    nt.links.new(emit.outputs[0], out.inputs[0])
    return m


# ---------- primitives ----------
def _link(o, ink=True):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    (_current_coll[0] if ink else NOINK).objects.link(o)
    return o


def put(o, material, name=None, ink=True, smooth=False):
    o.data.materials.clear()
    o.data.materials.append(material)
    if name:
        o.name = name
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return _link(o, ink)


def box(name, size, loc, material, rot=(0, 0, 0), ink=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return put(o, material, name, ink)


def cyl(name, r, depth, loc, material, verts=24, rot=(0, 0, 0), r2=None, ink=True, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    if smooth:
        _smooth_sides(o)
    return put(o, material, name, ink)


def _smooth_sides(o):
    # smooth only the side faces so caps keep a crisp rim
    for p in o.data.polygons:
        n = p.normal
        p.use_smooth = abs(n.z) < 0.95


def sphere(name, r, loc, material, scale=(1, 1, 1), segments=20, rot=(0, 0, 0), ink=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(10, segments // 2), radius=r, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return put(o, material, name, ink, smooth=True)


def ico(name, r, loc, material, scale=(1, 1, 1), sub=2, ink=True):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return put(o, material, name, ink, smooth=True)


def seg(name, p0, p1, r0, r1, material, verts=20, sx=1.0, sy=1.0, ink=True, roll=0.0):
    """A tapered segment from p0 to p1 (elliptic cross-section sx/sy before orientation)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = max(d.length, 1e-4)
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r0, radius2=r1, depth=L, location=(0, 0, 0))
    o = bpy.context.active_object
    o.scale = (sx, sy, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _smooth_sides(o)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    if roll:
        q = q @ Quaternion((0, 0, 1), roll)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = q
    o.location = (p0 + p1) / 2
    return put(o, material, name, ink)


def mesh_obj(name, verts, faces, material, ink=True, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    _current_coll[0].objects.link(o)
    me.materials.append(material)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if not ink:
        _link(o, False)
    return o


def empty(name, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    _current_coll[0].objects.link(o)
    return o


def attach(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


class Group:
    """Builds objects at the origin, then places them all with one transform."""

    def __init__(self, name, coll=True):
        self.name = name
        self.prev = _current_coll[0]
        if coll:
            self.coll = bpy.data.collections.new(name)
            self.prev.children.link(self.coll)
            _current_coll[0] = self.coll
        else:
            self.coll = None
        self.root = empty(name + "_root")
        self.start = set(o.name for o in bpy.data.objects)

    def done(self, loc=(0, 0, 0), yaw=0.0, scale=1.0):
        bpy.context.view_layer.update()
        for o in bpy.data.objects:
            if o.name not in self.start and o.parent is None and o is not self.root:
                attach(o, self.root)
        self.root.location = loc
        self.root.rotation_euler = (0, 0, math.radians(yaw))
        self.root.scale = (scale, scale, scale)
        _current_coll[0] = self.prev
        bpy.context.view_layer.update()
        return self.root


# ---------- people ----------
def ik(a, target, l1, l2, pole):
    a, t = Vector(a), Vector(target)
    d = t - a
    dist = min(max(d.length, abs(l1 - l2) + 1e-3), (l1 + l2) * 0.995)
    dn = d.normalized()
    t = a + dn * dist
    x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    p = Vector(pole)
    p = p - dn * p.dot(dn)
    if p.length < 1e-6:
        p = Vector((0, 1, 0))
    p.normalize()
    return a + dn * x + p * h, t


def person(name, H=1.72, skin="skin2", outfit=None, pose=None, loc=(0, 0, 0), yaw=0.0, female=False):
    """A stylised, proportioned figure (head about 1/7.4 of height) facing local -Y."""
    o = dict(type="shirt", top="paper", bottom="ink3", robe=None, sleeve=None, head=None, headc="ink2",
             shoes="ink2", short_sleeve=False, accent=None)
    o.update(outfit or {})
    p = dict(lhand=None, rhand=None, seated=False, seat=0.27, tilt=0.0, turn=0.0, step=0.0, stance=0.05,
             hold=None, stick=False, bag=None, baby=False, phone=None, card=None, lean=0.0)
    p.update(pose or {})
    g = Group(name)
    k = H
    skin_c = C(skin)
    sk = toon(skin_c, shade(skin_c, 0.78))
    top_c = C(o["top"])
    top = toon(top_c)
    bottom = toon(C(o["bottom"]))
    sleeve = toon(C(o["sleeve"] or o["top"]))
    shoes = toon(C(o["shoes"]))
    seated = p["seated"]
    drop = (0.49 - p["seat"]) if seated else 0.0  # upper body lowered when seated
    lean = p["lean"]

    def U(x, y, z):  # upper-body point (normalised -> metres), with forward lean about the hips
        yy = y - lean * (z - 0.5)
        return Vector((x * k, yy * k, (z - drop) * k))

    def L(x, y, z):
        return Vector((x * k, y * k, z * k))

    sw = 0.092 if female else 0.102  # half shoulder width
    S = {s: U(s * sw, 0.0, 0.805) for s in (-1, 1)}
    hipz = 0.49 - drop
    HIP = {s: L(s * p["stance"], 0.0, hipz) for s in (-1, 1)}

    # ---- legs ----
    for s in (-1, 1):
        if seated:
            knee = L(s * 0.065, -0.25, hipz + 0.01)
            ankle = L(s * 0.07, -0.27, 0.045)
        else:
            fwd = p["step"] * (1 if s == 1 else -0.4)
            ankle_t = L(s * (p["stance"] + 0.012), -fwd, 0.045)
            knee, ankle = ik(HIP[s], ankle_t, 0.226 * k, 0.226 * k, (0, -1, 0))
        legc = bottom
        seg(f"{name}_thigh{s}", HIP[s], knee, 0.05 * k, 0.04 * k, legc)
        sphere(f"{name}_knee{s}", 0.04 * k, knee, legc, segments=14)
        seg(f"{name}_shin{s}", knee, ankle, 0.038 * k, 0.029 * k, legc)
        foot_c = ankle + Vector((0, -0.04 * k, -0.018 * k))
        sphere(f"{name}_foot{s}", 0.035 * k, foot_c, shoes, scale=(0.85, 1.75, 0.6), segments=14)

    # ---- torso ----
    t = o["type"]
    tr0, tr1 = (0.094, 0.1) if female else (0.104, 0.094)
    seg(f"{name}_torso", U(0, 0, 0.83), U(0, 0, 0.5), tr0 * k, tr1 * k, top, sy=0.6)
    seg(f"{name}_yoke", S[-1], S[1], 0.038 * k, 0.038 * k, top)
    for s in (-1, 1):
        sphere(f"{name}_shoulder{s}", 0.04 * k, S[s], top, segments=14)
    seg(f"{name}_pelvis", L(0, 0, hipz + 0.07), L(0, 0, hipz - 0.05), 0.097 * k, 0.093 * k, bottom, sy=0.64)

    robe_c = toon(C(o["robe"] or o["top"]))
    if t in ("kaftan", "agbada", "senator", "gown", "longshirt"):
        hem = {"kaftan": 0.16, "agbada": 0.16, "senator": 0.36, "gown": 0.03, "longshirt": 0.4}[t]
        r1 = {"kaftan": 0.14, "agbada": 0.14, "senator": 0.112, "gown": 0.15, "longshirt": 0.115}[t]
        if seated:
            seg(f"{name}_robe", U(0, 0, 0.81), U(0, 0, 0.47), 0.104 * k, 0.11 * k, robe_c, sy=0.62)
            for s in (-1, 1):
                seg(f"{name}_lap{s}", HIP[s] + Vector((0, 0.02 * k, 0)), L(s * 0.07, -0.26, hipz + 0.01), 0.07 * k, 0.055 * k, robe_c)
                if hem < 0.3:
                    seg(f"{name}_robeshin{s}", L(s * 0.07, -0.27, hipz), L(s * 0.075, -0.29, max(hem, 0.08)), 0.055 * k, 0.07 * k, robe_c)
        else:
            seg(f"{name}_robe", U(0, 0, 0.81), L(0, 0, hem), 0.104 * k, r1 * k, robe_c, sy=0.64)
    if t == "agbada":
        ag = toon(C(o["accent"] or o["top"]))
        if seated:
            seg(f"{name}_agbada", U(0, 0, 0.82), U(0, 0, 0.45), 0.12 * k, 0.26 * k, ag, sy=0.42)
        else:
            seg(f"{name}_agbada", U(0, 0, 0.822), L(0, 0, 0.2), 0.13 * k, 0.37 * k, ag, sy=0.42, verts=32)
        sphere(f"{name}_embroid", 0.03 * k, U(0, -0.045, 0.75), toon(C("sunStrong")), scale=(1.0, 0.35, 1.5), segments=12)
    if t in ("buba", "wrapper_shirt"):
        wrap = toon(C(o["robe"] or o["bottom"]))
        blouse_len = 0.47 if t == "buba" else 0.44
        seg(f"{name}_blouse", U(0, 0, 0.815), U(0, 0, blouse_len), 0.095 * k, 0.122 * k, top, sy=0.62)
        if seated:
            for s in (-1, 1):
                seg(f"{name}_wraplap{s}", HIP[s] + Vector((0, 0.02 * k, 0)), L(s * 0.07, -0.26, hipz + 0.01), 0.068 * k, 0.055 * k, wrap)
                seg(f"{name}_wrapshin{s}", L(s * 0.07, -0.27, hipz), L(s * 0.075, -0.28, 0.07), 0.055 * k, 0.06 * k, wrap)
        else:
            seg(f"{name}_wrapper", L(0, 0, 0.55), L(0, 0, 0.04), 0.103 * k, 0.088 * k, wrap, sy=0.74)
            seg(f"{name}_wrapknot", L(0, 0, 0.56), L(0, 0, 0.5), 0.108 * k, 0.106 * k, wrap, sy=0.76)
    if t == "vest":
        vest = toon(C(o["accent"] or "sun"), C("sunStrong"))
        seg(f"{name}_vest", U(0, 0, 0.818), U(0, 0, 0.52), 0.108 * k, 0.102 * k, vest, sy=0.64)
        box(f"{name}_badge", (0.045 * k, 0.01 * k, 0.06 * k), U(-0.045, -0.066, 0.69), toon(C("paper")))
        seg(f"{name}_lanyard", U(-0.03, -0.06, 0.8), U(-0.045, -0.066, 0.725), 0.004 * k, 0.004 * k, toon(C("ink2")))

    # ---- neck & head ----
    neck = U(0, 0, 0.86)
    seg(f"{name}_neck", U(0, 0.0, 0.815), U(0, 0.004, 0.885), 0.029 * k, 0.027 * k, sk)
    pivot = empty(f"{name}_headpivot", neck)
    head_objs = []
    hc = U(0, -0.004, 0.932)
    head_objs.append(sphere(f"{name}_head", 0.07 * k, hc, sk, scale=(0.82, 0.92, 1.0), segments=24))
    head_objs.append(sphere(f"{name}_ear", 0.012 * k, hc + Vector((0.057 * k, 0.004 * k, -0.004 * k)), sk, segments=8))
    head_objs.append(sphere(f"{name}_ear2", 0.012 * k, hc + Vector((-0.057 * k, 0.004 * k, -0.004 * k)), sk, segments=8))
    hd = o["head"]
    hcol = toon(C(o["headc"]))
    if hd in ("hair", "kufi", "fila", "tallcap", "bowler", None, "bun", "puff"):
        hair = toon(C("ink2"), C("ink"))
        head_objs.append(sphere(f"{name}_hair", 0.07 * k, hc + Vector((0, 0.016 * k, 0.02 * k)), hair, scale=(0.84, 0.88, 0.86), segments=20))
    if hd == "bun":
        head_objs.append(sphere(f"{name}_bun", 0.034 * k, hc + Vector((0, 0.05 * k, 0.05 * k)), toon(C("ink2"), C("ink")), segments=14))
    if hd == "puff":
        head_objs.append(sphere(f"{name}_puff", 0.09 * k, hc + Vector((0, 0.022 * k, 0.03 * k)), toon(C("ink2"), C("ink")), scale=(1.0, 0.95, 0.85), segments=20))
    if hd == "kufi":
        head_objs.append(cyl(f"{name}_kufi", 0.058 * k, 0.045 * k, hc + Vector((0, 0.006 * k, 0.05 * k)), hcol, verts=28, rot=(math.radians(-8), 0, 0)))
    if hd == "fila":
        head_objs.append(cyl(f"{name}_fila", 0.058 * k, 0.06 * k, hc + Vector((0.006 * k, 0.004 * k, 0.056 * k)), hcol, verts=28, r2=0.066 * k, rot=(math.radians(-6), math.radians(16), 0)))
    if hd == "tallcap":
        head_objs.append(cyl(f"{name}_cap", 0.057 * k, 0.085 * k, hc + Vector((0, 0.006 * k, 0.07 * k)), hcol, verts=28, r2=0.052 * k, rot=(math.radians(-6), 0, 0)))
    if hd == "bowler":
        head_objs.append(sphere(f"{name}_crown", 0.054 * k, hc + Vector((0, 0.004 * k, 0.062 * k)), hcol, scale=(1, 1, 0.85), segments=20))
        head_objs.append(cyl(f"{name}_brim", 0.088 * k, 0.008 * k, hc + Vector((0, 0.004 * k, 0.045 * k)), hcol, verts=32))
    if hd == "gele":
        head_objs.append(sphere(f"{name}_gele", 0.07 * k, hc + Vector((0, 0.01 * k, 0.035 * k)), hcol, scale=(1.08, 1.1, 0.7), segments=20))
        head_objs.append(sphere(f"{name}_gelefan", 0.1 * k, hc + Vector((0, 0.035 * k, 0.11 * k)), hcol, scale=(1.3, 0.26, 0.8), segments=20, rot=(math.radians(-24), 0, 0)))
        head_objs.append(sphere(f"{name}_gelefan2", 0.085 * k, hc + Vector((0.045 * k, 0.025 * k, 0.09 * k)), hcol, scale=(1.1, 0.3, 0.8), segments=16, rot=(math.radians(-10), math.radians(-20), math.radians(42))))
    if hd == "wrap":
        head_objs.append(sphere(f"{name}_wrap", 0.07 * k, hc + Vector((0, 0.01 * k, 0.035 * k)), hcol, scale=(1.08, 1.1, 0.8), segments=20))
        head_objs.append(sphere(f"{name}_knot", 0.03 * k, hc + Vector((0.02 * k, 0.03 * k, 0.08 * k)), hcol, segments=12))
    if hd == "hijab":
        head_objs.append(sphere(f"{name}_hijab", 0.075 * k, hc + Vector((0, 0.014 * k, 0.006 * k)), hcol, scale=(0.9, 0.98, 1.06), segments=24))
        seg(f"{name}_khimar", U(0, 0.01, 0.9), U(0, 0.012, 0.64), 0.06 * k, 0.15 * k, hcol, sy=0.74, verts=28)
    for ob in head_objs:
        attach(ob, pivot)
    pivot.rotation_euler = (math.radians(p["tilt"]), 0, math.radians(p["turn"]))

    # ---- arms (two-bone IK to the hand targets) ----
    sleeve_full = t not in ("vest",) and not o["short_sleeve"]
    if t == "vest":
        sleeve = toon(C(o["sleeve"] or "paper"))
        sleeve_full = True
    if t == "buba":
        sleeve_full = False
    for s in (-1, 1):
        hand_t = p["rhand"] if s == -1 else p["lhand"]
        if hand_t is None:
            hand_t = (s * 0.15, 0.01, 0.455)
        hand_t = U(*hand_t)
        pole = (s * 0.5, 0.7, -0.6)
        elbow, wrist = ik(S[s], hand_t, 0.18 * k, 0.165 * k, pole)
        seg(f"{name}_uparm{s}", S[s], elbow, 0.036 * k, 0.031 * k, sleeve)
        sphere(f"{name}_elbow{s}", 0.031 * k, elbow, sleeve if sleeve_full else sk, segments=12)
        wide = t in ("kaftan", "agbada", "gown", "buba")
        if sleeve_full:
            seg(f"{name}_forearm{s}", elbow, wrist, 0.03 * k, (0.04 if wide else 0.026) * k, sleeve)
        else:
            seg(f"{name}_forearm{s}", elbow, wrist, 0.027 * k, 0.022 * k, sk)
        hd_dir = (wrist - elbow).normalized()
        hand_c = wrist + hd_dir * 0.028 * k
        sphere(f"{name}_hand{s}", 0.026 * k, hand_c, sk, scale=(0.8, 0.8, 1.15), segments=12)
        if s == -1 and p["phone"]:
            ph = box(f"{name}_phone", (0.03 * k, 0.014 * k, 0.062 * k), hand_c + Vector((0, -0.012 * k, 0.03 * k)), toon(C("ink"), C("ink")))
            ph.rotation_euler = (math.radians(p["phone"]), 0, 0)
            box(f"{name}_screen", (0.022 * k, 0.004 * k, 0.022 * k), hand_c + Vector((0, -0.016 * k, 0.045 * k)), flat("sunTint"), rot=(math.radians(p["phone"]), 0, 0))
        if s == -1 and p["card"]:
            box(f"{name}_card", (0.05 * k, 0.004 * k, 0.032 * k), hand_c + Vector((0, -0.02 * k, 0.02 * k)), toon(C("paper"), C("fill")))
        if p["stick"] and s == 1:
            seg(f"{name}_stick", hand_c + Vector((0, 0, 0.03 * k)), hand_c + Vector((0.02 * k, -0.05 * k, -hand_c.z + 0.01)), 0.009 * k, 0.008 * k, toon(C("line"), C("ink3")))
            seg(f"{name}_stickh", hand_c + Vector((-0.03 * k, 0, 0.035 * k)), hand_c + Vector((0.01 * k, 0, 0.035 * k)), 0.01 * k, 0.01 * k, toon(C("line"), C("ink3")))
        if p["bag"] and s == 1:
            bc = toon(C(p["bag"]))
            box(f"{name}_bag", (0.11 * k, 0.04 * k, 0.085 * k), hand_c + Vector((0, 0, -0.09 * k)), bc)
            seg(f"{name}_strap", hand_c + Vector((-0.03 * k, 0, -0.045 * k)), hand_c + Vector((0.03 * k, 0, -0.045 * k)), 0.006 * k, 0.006 * k, bc)

    if p["baby"]:
        # a baby carried on the back in a wrapper (oja), head peeking over the shoulder
        wrap = toon(C(p["baby"]))
        sphere(f"{name}_babywrap", 0.1 * k, U(0, 0.11, 0.66), wrap, scale=(1.0, 0.7, 1.2), segments=20)
        seg(f"{name}_oja", U(0, 0.0, 0.62), U(0, 0.0, 0.56), 0.112 * k, 0.11 * k, wrap, sy=0.72)
        sphere(f"{name}_babyhead", 0.045 * k, U(0.03, 0.12, 0.8), toon(C("skin2"), shade(C("skin2"), 0.78)), segments=16)
        sphere(f"{name}_babyhair", 0.046 * k, U(0.03, 0.128, 0.808), toon(C("ink2"), C("ink")), scale=(1, 1, 0.9), segments=14)
    return g.done(loc, yaw)


# ---------- props ----------
def wheelchair(name, loc, yaw):
    g = Group(name)
    frame = toon(C("ink3"), C("ink2"))
    tyre = toon(C("ink2"), C("ink"))
    for s in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.29, minor_radius=0.022, major_segments=40, minor_segments=8,
                                         location=(s * 0.29, 0.06, 0.31), rotation=(0, math.radians(90), 0))
        put(bpy.context.active_object, tyre, f"{name}_wheel{s}", smooth=True)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.008, major_segments=32, minor_segments=6,
                                         location=(s * 0.315, 0.06, 0.31), rotation=(0, math.radians(90), 0))
        put(bpy.context.active_object, frame, f"{name}_rim{s}", smooth=True)
        cyl(f"{name}_hub{s}", 0.035, 0.03, (s * 0.29, 0.06, 0.31), frame, rot=(0, math.radians(90), 0))
        cyl(f"{name}_caster{s}", 0.06, 0.03, (s * 0.21, -0.36, 0.06), tyre, rot=(0, math.radians(90), 0))
        seg(f"{name}_fork{s}", (s * 0.21, -0.36, 0.06), (s * 0.21, -0.33, 0.48), 0.012, 0.012, frame)
        seg(f"{name}_post{s}", (s * 0.22, 0.16, 0.48), (s * 0.22, 0.2, 0.95), 0.013, 0.013, frame)
        seg(f"{name}_handle{s}", (s * 0.22, 0.2, 0.95), (s * 0.22, 0.32, 0.95), 0.015, 0.015, tyre)
        seg(f"{name}_rail{s}", (s * 0.22, -0.33, 0.48), (s * 0.22, 0.16, 0.48), 0.013, 0.013, frame)
        seg(f"{name}_foot{s}", (s * 0.21, -0.33, 0.48), (s * 0.12, -0.44, 0.12), 0.011, 0.011, frame)
    box(f"{name}_seat", (0.44, 0.44, 0.05), (0, -0.08, 0.5), toon(C("ink2"), C("ink")))
    box(f"{name}_back", (0.44, 0.04, 0.38), (0, 0.17, 0.74), toon(C("ink2"), C("ink")), rot=(math.radians(-8), 0, 0))
    box(f"{name}_footplate", (0.32, 0.12, 0.02), (0, -0.46, 0.11), frame)
    return g.done(loc, yaw)


def plastic_chair(name, loc, yaw, colour="paper"):
    g = Group(name)
    m = toon(C(colour), C("fill"))
    box(f"{name}_seat", (0.44, 0.42, 0.04), (0, 0, 0.44), m)
    box(f"{name}_back", (0.44, 0.04, 0.42), (0, 0.21, 0.68), m, rot=(math.radians(-10), 0, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            seg(f"{name}_leg", (sx * 0.19, sy * 0.18, 0.43), (sx * 0.22, sy * 0.21, 0.0), 0.02, 0.017, m)
    return g.done(loc, yaw)


def canopy(name, loc, yaw, w=5.6, d=4.2, h=2.55):
    g = Group(name)
    pole = toon(C("ink3"), C("ink2"))
    canvas = toon(C("paper"), C("sunTint"))
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(f"{name}_pole", 0.04, h, (sx * w / 2, sy * d / 2, h / 2), pole, verts=10)
    # pyramid roof
    rh = 0.85
    verts = [(-w / 2 - 0.15, -d / 2 - 0.15, h), (w / 2 + 0.15, -d / 2 - 0.15, h), (w / 2 + 0.15, d / 2 + 0.15, h),
             (-w / 2 - 0.15, d / 2 + 0.15, h), (0, 0, h + rh)]
    mesh_obj(f"{name}_roof", verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)], canvas)
    # scalloped valance, alternating paper and sun
    n_w, n_d = 12, 9
    for side, (n, length, axis) in enumerate([(n_w, w + 0.3, "x"), (n_d, d + 0.3, "y")]):
        for sgn in (-1, 1):
            for i in range(n):
                f = (i + 0.5) / n - 0.5
                col = "sun" if i % 2 == 0 else "paper"
                m = toon(C(col), C("sunStrong") if col == "sun" else C("sunTint"))
                pw = length / n
                if axis == "x":
                    loc_v = (f * length, sgn * (d / 2 + 0.16), h - 0.1)
                    size = (pw * 0.98, 0.02, 0.2)
                else:
                    loc_v = (sgn * (w / 2 + 0.16), f * length, h - 0.1)
                    size = (0.02, pw * 0.98, 0.2)
                box(f"{name}_val", size, loc_v, m)
                # rounded scallop tip
                if axis == "x":
                    cyl(f"{name}_scal", pw * 0.3, 0.02, (loc_v[0], loc_v[1], h - 0.2), m, verts=20, rot=(math.radians(90), 0, 0))
                else:
                    cyl(f"{name}_scal", pw * 0.3, 0.02, (loc_v[0], loc_v[1], h - 0.2), m, verts=20, rot=(0, math.radians(90), 0))
    return g.done(loc, yaw)


def polling_table(name, loc, yaw, w=2.6, d=0.85):
    g = Group(name)
    cloth = toon(C("paper2"), C("fill"))
    box(f"{name}_top", (w, d, 0.05), (0, 0, 0.76), cloth)
    box(f"{name}_skirt", (w, 0.02, 0.62), (0, -d / 2, 0.45), cloth)
    for s in (-1, 1):
        box(f"{name}_side", (0.02, d, 0.62), (s * w / 2, 0, 0.45), cloth)
    # transparent ballot box with a few folded papers inside
    bx, by = 0.55, 0.0
    box(f"{name}_ballot", (0.5, 0.42, 0.5), (bx, by, 1.04), toon(C("ballot"), shade(C("ballot"), 0.86), alpha=0.55))
    box(f"{name}_lid", (0.53, 0.45, 0.04), (bx, by, 1.31), toon(C("ink3"), C("ink2")))
    box(f"{name}_slot", (0.2, 0.04, 0.01), (bx, by - 0.06, 1.335), flat("ink"))
    for i in range(4):
        box(f"{name}_paper{i}", (0.16, 0.1, 0.02), (bx - 0.12 + i * 0.08, by + random.uniform(-0.1, 0.1), 0.81 + i * 0.022),
            toon(C("paper"), C("fill")), rot=(0, 0, random.uniform(-0.6, 0.6)))
    # card reader (accreditation device) with a lit screen
    box(f"{name}_reader", (0.17, 0.26, 0.03), (-0.45, -0.05, 0.8), toon(C("ink"), C("ink")), rot=(math.radians(18), 0, 0))
    box(f"{name}_readerscr", (0.13, 0.17, 0.01), (-0.45, -0.07, 0.818), flat("sunTint"), rot=(math.radians(18), 0, 0))
    # register, open book
    for s in (-1, 1):
        box(f"{name}_book{s}", (0.2, 0.28, 0.015), (-0.95 + s * 0.1, 0.05, 0.795), toon(C("paper"), C("fill")), rot=(0, math.radians(-s * 4), 0))
    cyl(f"{name}_inkpot", 0.035, 0.05, (-0.15, -0.18, 0.81), toon(C("ink2"), C("ink")))
    return g.done(loc, yaw)


def cubicle(name, loc, yaw):
    """A voting screen: small table with a three-panel cardboard screen."""
    g = Group(name)
    tm = toon(C("fill"), shade(C("fill"), 0.82))
    sm = toon(C("paper2"), C("fill"))
    box(f"{name}_top", (0.8, 0.55, 0.04), (0, 0, 0.78), tm)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f"{name}_leg", (0.04, 0.04, 0.78), (sx * 0.36, sy * 0.24, 0.39), toon(C("ink3"), C("ink2")))
    box(f"{name}_back", (0.66, 0.015, 0.42), (0, 0.22, 1.01), sm)
    for s in (-1, 1):
        box(f"{name}_wing{s}", (0.015, 0.4, 0.42), (s * 0.33, 0.04, 1.01), sm)
    return g.done(loc, yaw)


def neem(name, loc, s=1.0, seed=3):
    rnd = random.Random(seed)
    g = Group(name)
    bark = toon(C("line"), C("ink3"))
    leaf = toon(C("leaf"), C("leafDark"))
    seg(f"{name}_trunk", (0, 0, 0), (0.1 * s, 0, 2.3 * s), 0.3 * s, 0.22 * s, bark, verts=14)
    for a, l in ((0.5, 1.6), (-0.6, 1.5), (2.4, 1.3)):
        end = Vector((math.cos(a) * l * s, math.sin(a) * l * 0.6 * s, 3.4 * s))
        seg(f"{name}_branch", (0.1 * s, 0, 2.1 * s), end, 0.16 * s, 0.07 * s, bark, verts=10)
    # crown: a dome of overlapping leaf clusters with an irregular, scalloped edge
    clusters = []
    for i in range(26):
        u = rnd.uniform(0, math.tau)
        rr = rnd.uniform(0.0, 1.0) ** 0.6
        x = math.cos(u) * rr * 2.3 * s
        y = math.sin(u) * rr * 1.5 * s
        z = (3.7 + (1 - rr * rr) * 1.3 + rnd.uniform(-0.25, 0.25)) * s
        r = rnd.uniform(0.75, 1.15) * s * (1.1 - rr * 0.3)
        ico(f"{name}_leaf{i}", r, (x, y, z), leaf, scale=(1.15, 1.0, 0.82), sub=3)
    return g.done(loc, 0)


def palm(name, loc, h=7.0, seed=1, lean=(0.0, 0.0), n=15, yaw=0.0):
    """Oil palm: slightly curved trunk, a crown of pinnate fronds that arch out and droop."""
    rnd = random.Random(seed)
    g = Group(name)
    bark = toon(C("line"), C("ink3"))
    leaf = toon(C("leaf"), mix(C("leaf"), C("leafDark"), 0.55))
    # trunk built from short segments following a gentle curve
    pts = []
    for i in range(9):
        t = i / 8
        pts.append(Vector((lean[0] * h * t * t, lean[1] * h * t * t, h * t)))
    for i in range(8):
        r0 = 0.24 - 0.06 * (i / 8)
        seg(f"{name}_trunk{i}", pts[i], pts[i + 1] + Vector((0, 0, 0.02)), r0, r0 - 0.008, bark, verts=12)
    top = pts[-1]
    # persistent frond bases (boots) near the crown
    for i in range(7):
        a = i * 2.4
        b = top + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, -0.3 - (i % 3) * 0.25))
        seg(f"{name}_boot{i}", b, b + Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 0.3)), 0.07, 0.03, bark, verts=8)
    sphere(f"{name}_heart", 0.3, top + Vector((0, 0, 0.05)), leaf, scale=(1, 1, 1.2), segments=14)
    golden = math.radians(137.5)
    for i in range(n):
        az = i * golden + rnd.uniform(-0.12, 0.12)
        layer = i / (n - 1)  # 0 = top young fronds, 1 = old outer fronds
        elev = math.radians(68 - 95 * layer + rnd.uniform(-6, 6))
        Lf = (2.6 + 1.6 * math.sin(math.pi * min(1, 0.25 + layer))) * h / 7.0 * rnd.uniform(0.92, 1.08)
        droop = Lf * (0.18 + 0.55 * layer)
        dirh = Vector((math.cos(az), math.sin(az), 0))
        m = 34
        rach = []
        for j in range(m + 1):
            t = j / m
            pnt = top + dirh * (math.cos(elev) * Lf * t) + Vector((0, 0, math.sin(elev) * Lf * t - droop * t * t))
            rach.append(pnt)
        verts, faces = [], []
        for j in range(m + 1):
            verts.append(rach[j])
        tips = {}
        for side in (-1, 1):
            for j in range(m):
                t = (j + 0.5) / m
                tan = (rach[j + 1] - rach[j]).normalized()
                sidev = tan.cross(Vector((0, 0, 1)))
                if sidev.length < 1e-4:
                    sidev = Vector((1, 0, 0))
                sidev.normalize()
                ll = (0.15 + 0.85 * math.sin(math.pi * min(1.0, t * 1.02)) ** 0.8) * h / 7.0
                if t < 0.12:
                    ll *= t / 0.12
                d = (sidev * side * 0.62 + tan * 0.3 + Vector((0, 0, -0.7))).normalized()
                tip = rach[j] + d * ll
                verts.append(tip)
                tips[(side, j)] = len(verts) - 1
                verts.append(rach[j] + (rach[j + 1] - rach[j]) * 0.4 + d * ll * 0.1)
                tips[(side, j, "b")] = len(verts) - 1
        for j in range(m):
            faces.append((j, tips[(1, j)], tips[(1, j, "b")], j + 1))
            faces.append((j + 1, tips[(-1, j, "b")], tips[(-1, j)], j))
        mesh_obj(f"{name}_frond{i}", verts, faces, leaf)
    return g.done(loc, yaw)


def tuft(name, loc, s=1.0, seed=0):
    rnd = random.Random(seed)
    m = toon(C("leaf"), C("leafDark"))
    for i in range(5):
        a = rnd.uniform(0, math.tau)
        lean = rnd.uniform(0.05, 0.25) * s
        h = rnd.uniform(0.18, 0.34) * s
        p0 = Vector(loc) + Vector((math.cos(a) * 0.04 * s, math.sin(a) * 0.04 * s, 0))
        seg(f"{name}_blade{i}", p0, p0 + Vector((math.cos(a) * lean, math.sin(a) * lean, h)), 0.028 * s, 0.002, m, verts=6)


def stone(name, loc, s=1.0):
    ico(name, 0.12 * s, loc, toon(C("fill"), shade(C("fill"), 0.84)), scale=(1.3, 1.0, 0.55), sub=1)


def path_strip(name, pts, widths, material, z=0.012):
    """A ground band following a polyline, drawn with ink borders."""
    verts, faces = [], []
    pts = [tuple(p[:2]) + (0.0,) for p in pts]
    for i, p in enumerate(pts):
        p = Vector(p)
        a = Vector(pts[max(0, i - 1)])
        b = Vector(pts[min(len(pts) - 1, i + 1)])
        t = (b - a).normalized()
        nrm = Vector((-t.y, t.x, 0))
        w = widths[i]
        verts.append(p + nrm * w / 2 + Vector((0, 0, z)))
        verts.append(p - nrm * w / 2 + Vector((0, 0, z)))
    for i in range(len(pts) - 1):
        faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    return mesh_obj(name, verts, faces, material)


def bezier(p0, p1, p2, n=20):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(tuple((1 - t) ** 2 * p0[k] + 2 * (1 - t) * t * p1[k] + t * t * p2[k] for k in range(len(p0))))
    return out


def school(name, loc, yaw, length=24.0, lamps_lit=False, sheet=False):
    """Single-storey primary-school block: veranda, louvred windows, gable corrugated roof."""
    g = Group(name)
    wall = toon(C("wall"), shade(C("wall"), 0.86))
    dado = toon(C("fill"), shade(C("fill"), 0.84))
    trim = toon(C("paper"), C("fill"))
    dark = toon(C("ink2"), C("ink"))
    door = toon(C("ink3"), C("ink2"))
    glass = toon(C("ballot"), shade(C("ballot"), 0.84))
    roof = toon(C("fill"), C("ink3"))
    rib = toon(shade(C("fill"), 0.9), C("ink3"))
    L = length
    D = 4.6  # classroom depth
    V = 2.3  # veranda depth
    wy0 = V  # front wall plane y
    box(f"{name}_plinth", (L + 0.6, D + V + 0.5, 0.45), (0, (D + V) / 2 - 0.05, 0.225), dado)
    box(f"{name}_wall", (L, D, 2.85), (0, wy0 + D / 2, 0.45 + 1.425), wall)
    box(f"{name}_dado", (L + 0.04, D + 0.04, 0.95), (0, wy0 + D / 2, 0.45 + 0.475), dado)
    # columns along the veranda
    ncol = 9
    for i in range(ncol):
        x = -L / 2 + 0.3 + i * (L - 0.6) / (ncol - 1)
        box(f"{name}_col{i}", (0.28, 0.28, 2.85), (x, 0.25, 0.45 + 1.425), wall)
        box(f"{name}_colbase{i}", (0.32, 0.32, 0.7), (x, 0.25, 0.45 + 0.35), dado)
    box(f"{name}_beam", (L + 0.2, 0.34, 0.3), (0, 0.25, 3.15), trim)
    # steps
    for i in range(2):
        box(f"{name}_step{i}", (2.2, 0.35, 0.15), (0.0, -0.25 - i * 0.35 + 0.35, 0.075 + 0.15 * (1 - i)), dado)
    # windows and doors between columns
    bays = ncol - 1
    for i in range(bays):
        x = -L / 2 + 0.3 + (i + 0.5) * (L - 0.6) / bays
        if i in (1, 5):
            box(f"{name}_dooropen{i}", (1.0, 0.1, 2.15), (x, wy0 - 0.02, 0.45 + 1.075), dark)
            box(f"{name}_door{i}", (0.5, 0.06, 2.1), (x - 0.62, wy0 - 0.3, 0.45 + 1.05), door, rot=(0, 0, math.radians(-60)))
            box(f"{name}_doorframe{i}", (1.16, 0.08, 0.08), (x, wy0 - 0.05, 0.45 + 2.19), trim)
        else:
            ww, wh, sill = 1.7, 1.25, 0.45 + 1.0
            box(f"{name}_win{i}", (ww, 0.1, wh), (x, wy0 - 0.02, sill + wh / 2), dark)
            box(f"{name}_winframe{i}", (ww + 0.12, 0.08, 0.08), (x, wy0 - 0.05, sill - 0.04), trim)
            box(f"{name}_winframe2{i}", (ww + 0.12, 0.08, 0.08), (x, wy0 - 0.05, sill + wh + 0.04), trim)
            box(f"{name}_mullion{i}", (0.06, 0.08, wh), (x, wy0 - 0.05, sill + wh / 2), trim)
            for k in range(6):
                box(f"{name}_louvre{i}_{k}", (ww - 0.08, 0.05, 0.1), (x, wy0 - 0.08, sill + 0.12 + k * 0.2), glass, rot=(math.radians(-35), 0, 0))
    # wall lamps (lit at dusk)
    lamp_x = [-L / 2 + 0.3 + 2.5 * (L - 0.6) / bays, -L / 2 + 0.3 + 4.5 * (L - 0.6) / bays]
    for j, x in enumerate(lamp_x):
        box(f"{name}_lampbase{j}", (0.12, 0.08, 0.2), (x, wy0 - 0.06, 2.75), dark)
        if lamps_lit:
            sphere(f"{name}_lamp{j}", 0.11, (x, wy0 - 0.18, 2.68), flat("sunTint"), segments=16)
        else:
            sphere(f"{name}_lamp{j}", 0.1, (x, wy0 - 0.17, 2.68), toon(C("paper"), C("fill")), segments=16)
    if sheet:
        # the result sheet posted on the wall: paper with ruled rows (no text)
        sx = lamp_x[0] + 1.35
        box(f"{name}_sheet", (0.8, 0.02, 1.05), (sx, wy0 - 0.06, 1.75), toon(C("paper"), C("sunTint")))
        for r in range(8):
            w = 0.62 if r % 3 else 0.4
            box(f"{name}_row{r}", (w, 0.01, 0.022), (sx - (0.62 - w) / 2, wy0 - 0.075, 2.13 - r * 0.09), flat("ink3"))
        box(f"{name}_sheet2", (0.8, 0.02, 1.05), (sx + 0.95, wy0 - 0.06, 1.75), toon(C("paper"), C("sunTint")))
        for r in range(8):
            w = 0.62 if r % 2 else 0.5
            box(f"{name}_rowb{r}", (w, 0.01, 0.022), (sx + 0.95 - (0.62 - w) / 2, wy0 - 0.075, 2.13 - r * 0.09), flat("ink3"))
    # gable roof
    eave_z, ridge_z = 3.3, 4.75
    y_front, y_back = -0.7, D + V + 0.6
    ridge_y = (y_front + y_back) / 2
    ext = L / 2 + 0.6
    th = 0.1
    verts = [(-ext, y_front, eave_z), (ext, y_front, eave_z), (ext, ridge_y, ridge_z), (-ext, ridge_y, ridge_z),
             (-ext, y_front, eave_z - th), (ext, y_front, eave_z - th), (ext, ridge_y, ridge_z - th), (-ext, ridge_y, ridge_z - th)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (3, 2, 6, 7), (0, 3, 7, 4)]
    mesh_obj(f"{name}_roof_f", verts, faces, roof)
    vb = [(x, 2 * ridge_y - y, z) for (x, y, z) in verts]
    mesh_obj(f"{name}_roof_b", vb, [tuple(reversed(f)) for f in faces], roof)
    # corrugation ribs on the front slope
    nrib = int(L / 0.62)
    slope = Vector((0, ridge_y - y_front, ridge_z - eave_z))
    for i in range(nrib + 1):
        x = -ext + 0.2 + i * (2 * ext - 0.4) / nrib
        p0 = Vector((x, y_front, eave_z + 0.03))
        seg(f"{name}_rib{i}", p0, p0 + slope, 0.022, 0.022, rib, verts=6)
    # fascia board and gable ends
    box(f"{name}_fascia", (2 * ext + 0.05, 0.06, 0.24), (0, y_front - 0.02, eave_z - 0.1), trim)
    for s in (-1, 1):
        xg = s * L / 2
        gv = [(xg, wy0, 3.3), (xg, wy0 + D, 3.3), (xg, ridge_y, ridge_z - 0.15)]
        mesh_obj(f"{name}_gable{s}", gv, [(0, 1, 2) if s > 0 else (2, 1, 0)], wall)
    # black water tank on a stand at the right end
    tx = L / 2 + 1.6
    for sx in (-1, 1):
        for sy in (-1, 1):
            seg(f"{name}_tankleg", (tx + sx * 0.55, wy0 + 2 + sy * 0.55, 0), (tx + sx * 0.5, wy0 + 2 + sy * 0.5, 2.6), 0.05, 0.05, toon(C("ink3"), C("ink2")), verts=8)
    box(f"{name}_tankdeck", (1.3, 1.3, 0.1), (tx, wy0 + 2, 2.65), toon(C("ink3"), C("ink2")))
    cyl(f"{name}_tank", 0.6, 1.2, (tx, wy0 + 2, 3.3), toon(C("ink2"), C("ink")), verts=28)
    cyl(f"{name}_tanklid", 0.22, 0.12, (tx, wy0 + 2, 3.95), toon(C("ink2"), C("ink")), verts=20)
    return g.done(loc, yaw)


def fence(name, loc, yaw, length, gate_at=None, gate_w=4.0):
    """Low compound wall with square pillars."""
    g = Group(name)
    w = toon(C("wall"), shade(C("wall"), 0.86))
    cap = toon(C("fill"), shade(C("fill"), 0.84))
    x = 0.0
    n = int(length / 3.0)
    for i in range(n + 1):
        px = i * 3.0
        if gate_at is not None and gate_at < px < gate_at + gate_w:
            continue
        box(f"{name}_pillar{i}", (0.32, 0.32, 1.25), (px, 0, 0.625), w)
        box(f"{name}_pcap{i}", (0.4, 0.4, 0.08), (px, 0, 1.29), cap)
        if i < n:
            nx = px + 3.0
            if gate_at is not None and (px < gate_at + gate_w and nx > gate_at):
                continue
            box(f"{name}_panel{i}", (3.0, 0.18, 0.95), (px + 1.5, 0, 0.475), w)
            box(f"{name}_coping{i}", (3.0, 0.24, 0.06), (px + 1.5, 0, 0.98), cap)
    if gate_at is not None:
        for gx in (gate_at, gate_at + gate_w):
            box(f"{name}_gatepost", (0.42, 0.42, 1.7), (gx, 0, 0.85), w)
            box(f"{name}_gatecap", (0.52, 0.52, 0.1), (gx, 0, 1.75), cap)
    return g.done(loc, yaw)


def bush_line(name, y, x0, x1, seed=5, hmin=1.2, hmax=3.2, ink=False):
    """Distant tree line: pale, unlined, so it reads as atmosphere."""
    rnd = random.Random(seed)
    m = toon(C("rule"), C("fill")) if not ink else toon(C("leaf"), C("leafDark"))
    x = x0
    i = 0
    while x < x1:
        r = rnd.uniform(hmin, hmax)
        ico(f"{name}_{i}", r, (x, y + rnd.uniform(-2, 2), r * 0.35), m, scale=(1.5, 1.0, 0.75), sub=2, ink=ink)
        x += r * rnd.uniform(1.4, 2.3)
        i += 1


# ---------- characters: the cast ----------
CAST = {
    "elder": dict(H=1.74, skin="skin3", outfit=dict(type="kaftan", top="paper", robe="paper", bottom="paper2", head="tallcap", headc="sunTint", shoes="ink2"),
                  pose=dict(stick=True, lhand=(0.16, -0.12, 0.5), tilt=4)),
    "gele": dict(H=1.66, skin="skin2", female=True, outfit=dict(type="buba", top="sunTint", robe="sunStrong", bottom="sunStrong", head="gele", headc="sun", shoes="ink2"),
                 pose=dict(bag="ink3", lhand=(0.15, 0.02, 0.47))),
    "mother": dict(H=1.64, skin="skin1", female=True, outfit=dict(type="buba", top="fill", robe="ink3", bottom="ink3", head="wrap", headc="sunStrong"),
                   pose=dict(baby="sun", rhand=(-0.1, -0.06, 0.5), lhand=(0.12, -0.02, 0.48))),
    "son": dict(H=1.12, skin="skin1", outfit=dict(type="shirt", top="sunTint", bottom="ink3", short_sleeve=True, head="hair"),
                pose=dict(lhand=(0.15, -0.02, 0.6), tilt=-6)),
    "hijab": dict(H=1.68, skin="skin2", female=True, outfit=dict(type="gown", top="ink3", robe="ink3", bottom="ink3", head="hijab", headc="fill"),
                  pose=dict(rhand=(-0.05, -0.1, 0.55), lhand=(0.05, -0.1, 0.55))),
    "agbada": dict(H=1.8, skin="skin2", outfit=dict(type="agbada", top="paper", robe="paper", accent="fill", bottom="paper2", head="fila", headc="ink2"),
                   pose=dict(rhand=(-0.1, -0.1, 0.56), lhand=(0.1, -0.1, 0.56))),
    "youngw": dict(H=1.65, skin="skin3", female=True, outfit=dict(type="shirt", top="paper", bottom="ink2", head="puff", short_sleeve=False),
                   pose=dict(card=True, rhand=(-0.08, -0.16, 0.62), tilt=8)),
    "youngm": dict(H=1.78, skin="skin2", outfit=dict(type="shirt", top="fill", bottom="ink3", short_sleeve=True, head="hair", shoes="paper"),
                   pose=dict(lhand=(0.14, 0.03, 0.46), turn=-18)),
    "george": dict(H=1.76, skin="skin3", outfit=dict(type="wrapper_shirt", top="paper", robe="ink3", bottom="ink3", head="bowler", headc="ink2"),
                   pose=dict(stick=False)),
    "senator": dict(H=1.75, skin="skin1", outfit=dict(type="senator", top="ink2", robe="ink2", bottom="ink2", head="kufi", headc="sunStrong", shoes="ink2"),
                    pose=dict(rhand=(-0.04, 0.12, 0.5), lhand=(0.04, 0.12, 0.5))),
    "chair_voter": dict(H=1.62, skin="skin1", female=True, outfit=dict(type="buba", top="sunTint", robe="ink3", bottom="ink3", head="wrap", headc="ink2"),
                        pose=dict(seated=True, seat=0.31, rhand=(-0.1, -0.2, 0.36), lhand=(0.1, -0.2, 0.36), card=True)),
    "observer": dict(H=1.68, skin="skin2", female=True, outfit=dict(type="vest", top="paper", sleeve="paper", bottom="ink2", head="bun", accent="sun"),
                     pose=dict(phone=-35, rhand=(-0.02, -0.2, 0.68), lhand=(0.06, -0.17, 0.62), tilt=24)),
    "official_m": dict(H=1.74, skin="skin3", outfit=dict(type="kaftan", top="paper", robe="paper", bottom="paper2", head="kufi", headc="paper"),
                       pose=dict(seated=True, rhand=(-0.12, -0.24, 0.47), lhand=(0.1, -0.26, 0.47), tilt=14)),
    "official_f": dict(H=1.66, skin="skin2", female=True, outfit=dict(type="buba", top="paper2", robe="ink3", bottom="ink3", head="gele", headc="sunStrong"),
                       pose=dict(seated=True, rhand=(-0.1, -0.26, 0.47), lhand=(0.14, -0.22, 0.5), tilt=8)),
}


def cast(key, name, loc, yaw, **pose_over):
    c = CAST[key]
    pose = dict(c.get("pose", {}))
    pose.update(pose_over)
    return person(name, H=c["H"], skin=c["skin"], outfit=c["outfit"], pose=pose, loc=loc, yaw=yaw, female=c.get("female", False))


# ---------- world, light, camera, ink ----------
def world_paper(colour="paper"):
    world = bpy.data.worlds.new("paper")
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    lp = nt.nodes.new("ShaderNodeLightPath")
    dark = nt.nodes.new("ShaderNodeBackground")
    dark.inputs[0].default_value = (0, 0, 0, 1)
    paper = nt.nodes.new("ShaderNodeBackground")
    paper.inputs[0].default_value = srgb(C(colour))
    mixs = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mixs.inputs[0])
    nt.links.new(dark.outputs[0], mixs.inputs[1])
    nt.links.new(paper.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], out.inputs[0])
    scene.world = world


def sun_light(direction, energy=4.0):
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 30))
    light = bpy.context.active_object
    light.data.energy = energy
    light.data.angle = math.radians(0.3)
    light.data.shadow_maximum_resolution = 0.002
    light.data.shadow_filter_radius = 0.3
    light.data.use_shadow_jitter = False
    d = Vector(direction).normalized()
    light.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return light


def camera(loc, target, lens=40, shift_x=0.0, shift_y=0.0, ortho=None):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.active_object
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.lens = lens
    cam.data.shift_x = shift_x
    cam.data.shift_y = shift_y
    cam.data.clip_end = 2000
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    bpy.context.view_layer.update()
    return cam


def screen_point(cam, u, v, dist):
    """World point at screen fraction (u from left, v from bottom) and distance along the view."""
    frame = cam.data.view_frame(scene=scene)  # tr, br, bl, tl in camera space
    tr, br, bl, tl = frame
    pl = bl + (br - bl) * u + (tl - bl) * v
    if cam.data.type == "ORTHO":
        pl = Vector((pl.x, pl.y, -dist))
    else:
        pl = pl * (dist / -pl.z)
    return cam.matrix_world @ pl


def sun_disc(cam, u, v, frac=0.045, dist=400.0, halo=3.2, colour="sun"):
    """Camera-facing sun with a soft radial halo; never inked."""
    c = screen_point(cam, u, v, dist)
    c2 = screen_point(cam, u + 0.01, v, dist)
    width_world = (c2 - c).length / 0.01
    r = frac * width_world
    face = (cam.matrix_world.translation - c).normalized()
    q = face.to_track_quat("Z", "Y")
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=r, fill_type="NGON", location=c)
    disc = bpy.context.active_object
    disc.rotation_mode = "QUATERNION"
    disc.rotation_quaternion = q
    put(disc, flat(colour), "sun_disc", ink=False)
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=r * halo, fill_type="NGON", location=c - face * 2.0)
    h = bpy.context.active_object
    h.rotation_mode = "QUATERNION"
    h.rotation_quaternion = q
    _alpha_halo(h, r * halo, "sun_halo", inner_stop=0.22)
    return disc


def _alpha_halo(h, radius, name, inner_stop=0.1):
    m = halo_mat("sunTint", "sunWash", "paper", radius, inner_stop=inner_stop)
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    emit = next(n for n in nt.nodes if n.type == "EMISSION")
    mr = next(n for n in nt.nodes if n.type == "MAP_RANGE")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mixs = nt.nodes.new("ShaderNodeMixShader")
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    inv.use_clamp = True
    nt.links.new(mr.outputs["Result"], inv.inputs[1])
    nt.links.new(inv.outputs[0], mixs.inputs[0])
    nt.links.new(tr.outputs[0], mixs.inputs[1])
    nt.links.new(emit.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], out.inputs[0])
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    put(h, m, name, ink=False)


def glow(name, loc, r, cam):
    face = (cam.matrix_world.translation - Vector(loc)).normalized()
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=r, fill_type="NGON", location=Vector(loc) + face * 0.05)
    h = bpy.context.active_object
    h.rotation_mode = "QUATERNION"
    h.rotation_quaternion = face.to_track_quat("Z", "Y")
    m = halo_mat("sunTint", "sunWash", "paper", r, inner_stop=0.1)
    # make the glow additive-looking by blending toward transparent at the edge
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    emit = next(n for n in nt.nodes if n.type == "EMISSION")
    mr = next(n for n in nt.nodes if n.type == "MAP_RANGE")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mixs = nt.nodes.new("ShaderNodeMixShader")
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    inv.use_clamp = True
    nt.links.new(mr.outputs["Result"], inv.inputs[1])
    nt.links.new(inv.outputs[0], mixs.inputs[0])
    nt.links.new(tr.outputs[0], mixs.inputs[1])
    nt.links.new(emit.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], out.inputs[0])
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    put(h, m, name, ink=False)


def ink_setup(sil_px=None, crease_ratio=0.55):
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    T = sil_px or max(1.3, WIDTH / 1050)
    vl = scene.view_layers[0]
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(140)
    fs.use_culling = False
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)

    def make(name, thick, sil):
        ls = fs.linesets.new(name)
        ls.select_by_visibility = True
        ls.visibility = "VISIBLE"
        ls.select_by_edge_types = True
        ls.select_silhouette = sil
        ls.select_border = sil
        ls.select_external_contour = sil
        ls.select_crease = not sil
        ls.select_by_collection = True
        ls.collection = NOINK
        ls.collection_negation = "EXCLUSIVE"
        st = bpy.data.linestyles.new(name)
        ls.linestyle = st
        st.color = srgb(HEX["line"])[:3]
        st.thickness = thick
        st.caps = "ROUND"
        st.chaining = "PLAIN"
        st.use_same_object = True
        cal = st.thickness_modifiers.new("pen", "CALLIGRAPHY")
        cal.orientation = math.radians(50)
        cal.thickness_min = 0.0
        cal.thickness_max = thick * 0.55
        cal.blend = "ADD"
        al = st.thickness_modifiers.new("taper", "ALONG_STROKE")
        al.blend = "MULTIPLY"
        al.mapping = "CURVE"
        curve = al.curve
        pts = curve.curves[0].points
        pts[0].location = (0.0, 0.45)
        pts[1].location = (1.0, 0.45)
        pts.new(0.15, 1.0)
        pts.new(0.85, 1.0)
        curve.update()
        noise = st.geometry_modifiers.new("wobble", "SPATIAL_NOISE")
        noise.amplitude = 0.7 * WIDTH / 1600
        noise.scale = 26
        noise.octaves = 2
        return ls

    make("silhouette", T, True)
    make("crease", T * crease_ratio, False)


PROBE = len(args) > 4 and args[4] == "probe"
SVG = len(args) > 4 and args[4] == "svg"
_strokes = []


def svg_hook():
    """Collect every final Freestyle stroke (after thickness and wobble) for a vector export."""
    sys.path.append(bpy.utils.system_resource("SCRIPTS", path="freestyle/modules"))
    import parameter_editor
    from freestyle.types import StrokeShader

    class Collect(StrokeShader):
        def __init__(self, lineset):
            StrokeShader.__init__(self)
            self.ls = lineset

        def shade(self, stroke):
            pts = [(sv.point.x, sv.point.y) for sv in stroke]
            th = [sum(sv.attribute.thickness) for sv in stroke]
            if len(pts) > 1:
                _strokes.append((self.ls, pts, sum(th) / len(th)))

    parameter_editor.callbacks_modifiers_post.append(lambda sc, layer, ls: [Collect(ls.name)])


def svg_write(path):
    col = HEX["line"]
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (WIDTH, HEIGHT, WIDTH, HEIGHT)]
    for ls in ("silhouette", "crease"):
        out.append('<g id="%s" fill="none" stroke="%s" stroke-linecap="round" stroke-linejoin="round">' % (ls, col))
        for name, pts, w in _strokes:
            if name != ls:
                continue
            d = "M" + " L".join("%.1f %.1f" % (x, HEIGHT - y) for x, y in pts[::2] + [pts[-1]])
            out.append('<path d="%s" stroke-width="%.2f"/>' % (d, w))
        out.append("</g>")
    out.append("</svg>")
    with open(path, "w", encoding="utf-8") as f:
        f.write(chr(10).join(out))
    print("SVG", path, len(_strokes), "strokes")


def probe():
    from bpy_extras.object_utils import world_to_camera_view
    cam = scene.camera
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.name.endswith("_root") or o.name in ("sun_disc",):
            p = world_to_camera_view(scene, cam, o.matrix_world.translation)
            top = world_to_camera_view(scene, cam, o.matrix_world.translation + Vector((0, 0, 1.7)))
            print("PROBE %-22s u=%.2f v=%.2f  v1.7=%.2f" % (o.name, p.x, p.y, top.y))
    xs = [world_to_camera_view(scene, cam, o.matrix_world @ Vector(c)).x for o in bpy.data.objects if o.name.startswith("neem_r_leaf") for c in o.bound_box]
    ys = [world_to_camera_view(scene, cam, o.matrix_world @ Vector(c)).y for o in bpy.data.objects if o.name.startswith("neem_r_leaf") for c in o.bound_box]
    if xs:
        print("PROBE neem crown u %.2f..%.2f v %.2f..%.2f" % (min(xs), max(xs), min(ys), max(ys)))
    hz = world_to_camera_view(scene, cam, Vector((cam.location.x, 66, 2.5)))
    print("PROBE horizon_bush_top v=%.2f" % hz.y)


def render():
    if PROBE:
        probe()
        return
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        if e in engines:
            scene.render.engine = e
            break
    try:
        scene.eevee.taa_render_samples = 24
        scene.eevee.shadow_pool_size = "1024"
        scene.eevee.shadow_resolution_scale = 1.0
    except Exception:
        pass
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.film_transparent = True
    scene.render.filepath = OUT
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    if SVG:
        svg_hook()
    bpy.ops.render.render(write_still=True)
    if SVG:
        svg_write(OUT[:-4] + "-lines.svg")
    print("RENDERED", OUT)


# ---------- scenes ----------
def ground_plane(colour="paper", size=(400, 160), y_far=70.0, shadow="ground"):
    box("ground", (size[0], size[1], 0.2), (0, y_far - size[1] / 2, -0.1), toon(C(colour), C(shadow)), ink=False)


# set layout (world metres): building behind, canopy centre-right, path in from the bottom left
SCHOOL = dict(loc=(8.0, 9.6, 0), yaw=-5, length=22)
CANOPY = (4.6, 3.4)


NEEM_HERO = (9.4, 7.4, 0)


def polling_unit(lamps_lit=False, sheet=False, morning=True, open_left=False):
    """The shared set: school, path, compound wall, trees, ground detail.

    open_left keeps the left of the frame as bare paper (the page headline sits there):
    no palms, distant trees or ground marks west of the path.
    """
    ground_plane()
    school("school", SCHOOL["loc"], SCHOOL["yaw"], length=SCHOOL["length"], lamps_lit=lamps_lit, sheet=sheet)
    pp = bezier((-12, -17), (-6.5, -2.5), (3.4, 1.6), 24)
    if not open_left:  # in the hero the path would be cut by the left fade into a straight band
        pth = path_strip("path", pp, [3.4 * (1 - (i / 24) ** 3) + 0.2 for i in range(25)], toon(C("ground"), C("rule")))
        _link(pth, False)
    # compound wall along the front, opening where the path comes in
    fence("fence_l", (-34, -9.0, 0), 0, 24.0)
    fence("fence_r", (-4.0, -9.0, 0), 0, 30.0)
    if open_left:
        palm("palm_a", (13.5, 21.0, 0), h=10.5, seed=2, lean=(-0.05, 0.02))
        palm("palm_d", (17.0, 24.0, 0), h=9.0, seed=12, lean=(0.04, 0.0), yaw=70)
    else:
        palm("palm_a", (-6.0, 12.0, 0), h=9.0, seed=2, lean=(-0.05, 0.02))
        palm("palm_d", (-13.0, 20.0, 0), h=8.0, seed=12, lean=(0.04, 0.0), yaw=70)
    palm("palm_b", (19.0, 15.0, 0), h=8.4, seed=5, lean=(0.06, 0.0), yaw=40)
    palm("palm_c", (22.5, 11.5, 0), h=7.0, seed=8, lean=(0.05, -0.03), yaw=10)
    if open_left:  # pulled in so the whole crown sits inside the hero frame
        neem("neem_r", NEEM_HERO, s=0.8, seed=4)
    else:
        neem("neem_r", (12.0, 7.6, 0), s=1.1, seed=4)
    if not open_left:
        neem("neem_back", (-4.0, 19.0, 0), s=0.9, seed=9)
    bush_line("horizon", 66, 8 if open_left else -160, 160, seed=3, hmin=1.0, hmax=2.6)
    rnd = random.Random(21)
    for i in range(40):
        x = rnd.uniform(-16, 22)
        y = rnd.uniform(-8.5, 6)
        if 1 < x < 14 and -2.5 < y < 5.5:
            continue
        if open_left and x < 2.5:
            continue
        tuft(f"tuft{i}", (x, y, 0), s=rnd.uniform(0.9, 1.6), seed=i)
    for i in range(16):
        x = rnd.uniform(-14, 20)
        y = rnd.uniform(-8.5, 5)
        if 1 < x < 14 and -2.5 < y < 5.5:
            continue
        if open_left:
            continue
        stone(f"stone{i}", (x, y, 0.03), s=rnd.uniform(0.7, 1.4))


def hero_people():
    cx, cy = CANOPY
    canopy("canopy", (cx, cy, 0), -5, w=5.6, d=4.0)
    polling_table("table", (cx, cy + 0.4, 0), -5)
    plastic_chair("chair1", (cx - 0.8, cy + 1.25, 0), -5)
    plastic_chair("chair2", (cx + 0.8, cy + 1.2, 0), -5)
    cast("official_m", "official_m", (cx - 0.8, cy + 1.3, 0), -5)
    cast("official_f", "official_f", (cx + 0.8, cy + 1.25, 0), -5)
    cubicle("cubicle", (cx - 3.6, cy + 0.9, 0), 10)
    cast("hijab", "voter_cubicle", (cx - 3.6, cy + 0.5, 0), 190, rhand=(-0.08, -0.25, 0.62), lhand=(0.06, -0.24, 0.62), tilt=20)
    # wheelchair voter at the front of the table, given priority
    wheelchair("wheelchair", (cx - 0.7, cy - 0.85, 0), 175)
    cast("chair_voter", "voter_wheelchair", (cx - 0.7, cy - 0.92, 0), 175)
    # the queue runs out to the right, across the view, then bends back toward the neem's shade
    order = ["elder", "gele", "agbada", "youngw", "mother", "son", "senator", "george", "youngm"]
    qpts = bezier((cx + 0.6, cy - 1.0), (cx + 4.6, cy - 2.4), (cx + 6.4, cy + 0.4), 10)
    for i, key in enumerate(order):
        x, y = qpts[i + 1]
        nx, ny = qpts[i]
        yaw = math.degrees(math.atan2(ny - y, nx - x)) + 90
        if key == "son":
            x, y = qpts[i][0] + 0.35, qpts[i][1] - 0.45
        cast(key, f"q_{i}_{key}", (x, y, 0), yaw)
    cast("observer", "observer", (cx + 3.0, cy - 3.0, 0), -28)
    cast("youngm", "arriving", (2.9, -0.4, 0), 140, step=0.12, lhand=(0.15, 0.06, 0.46), rhand=(-0.15, -0.05, 0.46))


def build_hero(phone=False):
    world_paper()
    polling_unit(open_left=True)
    hero_people()
    sun_light((0.6, 0.55, -0.58), energy=4.0)
    if phone:
        # tight on the table, the queue and the observer, so people stay large on a phone
        cam = camera((9.6, -6.4, 3.3), (6.4, 1.6, 1.15), lens=36, shift_x=0.05, shift_y=0.12)
        sun_disc(cam, 0.2, 0.88, frac=0.04, halo=3.4)
    else:
        cam = camera((10.4, -13.0, 4.6), (2.2, 6.0, 2.2), lens=30, shift_x=0.0, shift_y=-0.05)
        sun_disc(cam, 0.6, 0.905, frac=0.022, halo=4.0)
    ink_setup()
    render()


def pool(name, loc, rx, ry, z=0.004):
    """A soft ground patch (ground tone, unlined) that seats a vignette on the paper."""
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.0, fill_type="NGON", location=(loc[0], loc[1], z))
    o = bpy.context.active_object
    o.scale = (rx, ry, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return put(o, toon(C("ground"), C("rule")), name, ink=False)


def dots(name, pts, spacing=0.2, r=0.04, colour="line"):
    """Even dots along a polyline (a drawn dotted path), never outlined."""
    pts = [Vector(p) for p in pts]
    m = flat(colour)
    i = 0
    carry = 0.0
    for a, b in zip(pts, pts[1:]):
        L = (b - a).length
        t = carry
        while t < L:
            sphere(f"{name}{i}", r, a + (b - a) * (t / L), m, segments=10, ink=False)
            i += 1
            t += spacing
        carry = t - L


def smooth_path(ctrl, n=400):
    """Catmull-Rom through the control points."""
    P = [Vector(c) for c in ctrl]
    P = [P[0]] + P + [P[-1]]
    out = []
    per = max(4, n // (len(P) - 3))
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for j in range(per):
            t = j / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return out


def mast(name, loc, h=6.0):
    g = Group(name)
    m = toon(C("ink3"), C("ink2"))
    base, top = 0.7, 0.18
    legs = []
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        legs.append((Vector((math.cos(a) * base, math.sin(a) * base, 0)), Vector((math.cos(a) * top, math.sin(a) * top, h))))
    for p0, p1 in legs:
        seg(f"{name}_leg", p0, p1, 0.035, 0.025, m, verts=6)
    for k in range(6):
        z0, z1 = k * h / 6, (k + 1) * h / 6
        for i in range(4):
            a0, b0 = legs[i]
            a1, b1 = legs[(i + 1) % 4]
            q0 = a0 + (b0 - a0) * (z0 / h)
            q1 = a1 + (b1 - a1) * (z1 / h)
            seg(f"{name}_brace", q0, q1, 0.012, 0.012, m, verts=5)
    for i in range(3):
        a = i * math.tau / 3 + 0.4
        box(f"{name}_antenna{i}", (0.12, 0.06, 0.7), (math.cos(a) * 0.28, math.sin(a) * 0.28, h + 0.1), toon(C("paper"), C("fill")), rot=(0, 0, a))
    cyl(f"{name}_dish", 0.22, 0.06, (0.0, -0.3, h - 0.8), toon(C("paper"), C("fill")), rot=(math.radians(90), 0, 0))
    return g.done(loc, 0)


def envelope(name, loc, s=1.0, rot=(0, 0, 0)):
    g = Group(name)
    paper = toon(C("paper"), C("sunTint"))
    w, h = 0.9 * s, 0.58 * s
    box(f"{name}_body", (w, 0.04 * s, h), (0, 0, 0), paper)
    flap = [(-w / 2, -0.025 * s, h / 2), (w / 2, -0.025 * s, h / 2), (0, -0.025 * s, -0.05 * s)]
    mesh_obj(f"{name}_flap", flap, [(0, 2, 1)], toon(C("sunTint"), C("sun")))
    for sgn in (-1, 1):
        fold = [(sgn * w / 2, -0.023 * s, -h / 2), (sgn * 0.08 * s, -0.023 * s, 0.0), (sgn * w / 2 - sgn * 0.01, -0.023 * s, -h / 2)]
        mesh_obj(f"{name}_fold{sgn}", fold, [(0, 1, 2)], paper)
    root = g.done(loc, 0)
    root.rotation_euler = rot
    return root


def desk_scene(name, loc, yaw):
    g = Group(name)
    wood = toon(C("fill"), shade(C("fill"), 0.82))
    dark = toon(C("ink3"), C("ink2"))
    box(f"{name}_top", (1.5, 0.75, 0.05), (0, 0, 0.75), wood)
    for sx in (-1, 1):
        box(f"{name}_side{sx}", (0.05, 0.7, 0.73), (sx * 0.7, 0, 0.365), wood)
    box(f"{name}_modesty", (1.35, 0.03, 0.4), (0, -0.33, 0.5), wood)
    # laptop: the reviewer sits on the +y side facing -y; screen stands at the far (-y) edge
    box(f"{name}_lapbase", (0.42, 0.3, 0.025), (0.05, 0.05, 0.79), dark)
    box(f"{name}_lapscreen", (0.42, 0.02, 0.28), (0.05, -0.11, 0.93), dark, rot=(math.radians(12), 0, 0))
    box(f"{name}_lapglow", (0.36, 0.005, 0.22), (0.05, -0.098, 0.93), flat("sunTint"), rot=(math.radians(12), 0, 0))
    cyl(f"{name}_mug", 0.045, 0.1, (-0.45, 0.12, 0.83), toon(C("sun"), C("sunStrong")))
    for i in range(3):
        box(f"{name}_paper{i}", (0.22, 0.3, 0.01), (0.5, 0.08 + i * 0.01, 0.785 + i * 0.01), toon(C("paper"), C("fill")), rot=(0, 0, 0.1 * i))
    seg(f"{name}_lamp1", (-0.6, -0.2, 0.78), (-0.5, -0.1, 1.15), 0.015, 0.015, dark)
    seg(f"{name}_lamp2", (-0.5, -0.1, 1.15), (-0.3, -0.05, 1.2), 0.015, 0.015, dark)
    cyl(f"{name}_lamphead", 0.07, 0.1, (-0.27, -0.05, 1.16), dark, r2=0.03)
    cyl(f"{name}_lampbase", 0.08, 0.02, (-0.6, -0.2, 0.785), dark)
    cyl(f"{name}_pot", 0.12, 0.22, (1.0, -0.1, 0.11), toon(C("sunStrong"), shade(C("sunStrong"), 0.8)), r2=0.15)
    for i in range(7):
        a = i * 0.9
        seg(f"{name}_leaf{i}", (1.0, -0.1, 0.22), (1.0 + math.cos(a) * 0.22, -0.1 + math.sin(a) * 0.22, 0.62 + (i % 2) * 0.12), 0.045, 0.005, toon(C("leaf"), C("leafDark")), verts=6)
    return g.done(loc, yaw)


def results_board(name, loc, yaw):
    """A public results screen on legs: framed panel with plain bars (no text, no party colours)."""
    g = Group(name)
    frame = toon(C("ink2"), C("ink"))
    panel = toon(C("paper"), C("paper2"))
    W, Hh, z0 = 2.4, 1.5, 1.0
    for sx in (-1, 1):
        seg(f"{name}_leg{sx}", (sx * 0.9, 0.05, 0), (sx * 0.9, 0.05, z0 + 0.2), 0.04, 0.04, frame, verts=8)
        box(f"{name}_foot{sx}", (0.12, 0.6, 0.05), (sx * 0.9, 0.05, 0.025), frame)
    box(f"{name}_frame", (W + 0.12, 0.1, Hh + 0.12), (0, 0.05, z0 + Hh / 2), frame)
    box(f"{name}_panel", (W, 0.02, Hh), (0, -0.01, z0 + Hh / 2), panel)
    vals = [0.82, 0.58, 0.95, 0.4, 0.68]
    cols = ["ink3", "ink3", "sun", "ink3", "ink3"]
    for i, (vv, cc) in enumerate(zip(vals, cols)):
        bh = (Hh - 0.4) * vv
        x = -W / 2 + 0.35 + i * (W - 0.7) / 4
        box(f"{name}_bar{i}", (0.26, 0.02, bh), (x, -0.03, z0 + 0.2 + bh / 2), toon(C(cc), shade(C(cc), 0.85)))
    box(f"{name}_base", (W - 0.3, 0.02, 0.02), (0, -0.035, z0 + 0.19), flat("ink3"))
    return g.done(loc, yaw)


def build_story():
    world_paper()
    ground_plane()
    xs = [-8.7, -2.9, 2.9, 8.7]
    for i, x in enumerate(xs):
        pool(f"pool{i}", (x, 0.3), 2.25, 1.3)
    # (a) at the unit: the observer types a report beside the ballot table
    polling_table("a_table", (xs[0] - 0.35, 1.0, 0), 0, w=1.3, d=0.7)
    cast("observer", "a_observer", (xs[0] + 0.9, -0.1, 0), -30)
    tuft("a_tuft", (xs[0] - 2.0, -0.6, 0), 1.3, 3)
    tuft("a_tuft2", (xs[0] + 1.9, 0.6, 0), 1.0, 4)
    # (b) the message travels: envelope in flight, a mast relaying it
    mast("b_mast", (xs[1] + 1.1, 1.0, 0), h=3.6)
    envelope("b_env", (xs[1] - 0.6, 0.0, 2.1), s=1.0, rot=(math.radians(8), math.radians(-10), math.radians(-6)))
    stone("b_stone", (xs[1] - 1.6, -0.5, 0.03), 1.2)
    tuft("b_tuft", (xs[1] + 1.9, -0.4, 0), 1.1, 6)
    # (c) a trained reviewer checks it on a laptop
    desk_scene("c_desk", (xs[2], 0.2, 0), 0)
    plastic_chair("c_chair", (xs[2] + 0.05, 0.85, 0), 180, colour="ink3")
    cast("official_f", "c_reviewer", (xs[2] + 0.05, 0.8, 0), 180, rhand=(-0.08, -0.3, 0.47), lhand=(0.1, -0.3, 0.47), tilt=12)
    # (d) verified results reach a public board
    results_board("d_board", (xs[3], 0.9, 0), 0)
    cast("elder", "d_elder", (xs[3] - 1.2, -0.6, 0), 165, tilt=-8)
    cast("youngw", "d_youngw", (xs[3] + 0.9, -0.5, 0), 195, tilt=-10, card=False, rhand=None)
    sun_light((0.45, 0.4, -0.85), energy=4.0)
    camera((0, -30, 12), (0, 0.3, 1.9), ortho=22.6)
    # one continuous dotted ink line through all four
    ctrl = [(-12.4, -0.4, 0.5), (xs[0] - 1.2, -0.9, 0.7), (xs[0] + 0.75, -0.55, 1.15), (xs[0] + 2.6, -0.2, 2.4), (xs[1] - 1.5, 0.0, 2.3),
            (xs[1] + 0.2, 0.0, 2.0), (xs[1] + 1.4, 0.8, 3.7), (xs[2] - 1.7, 0.0, 2.2), (xs[2] + 0.05, -0.15, 1.15), (xs[2] + 1.5, -0.4, 1.7),
            (xs[3] - 2.0, 0.0, 2.7), (xs[3] - 0.2, 0.6, 2.05), (xs[3] + 1.7, 0.6, 2.7), (12.4, 0.4, 2.0)]
    dots("dot", smooth_path(ctrl, 900), spacing=0.17, r=0.035)
    ink_setup(sil_px=max(1.3, WIDTH / 1150))
    render()


def build_evening():
    MOOD["warm"] = 0.1
    MOOD["shadow"] = 0.82
    world_paper()
    polling_unit(lamps_lit=True, sheet=True)
    # the canopy is down; one bench stays out for the officials' wait
    bpy.context.view_layer.update()
    sheet = bpy.data.objects["school_sheet"].matrix_world.translation.copy()
    readers = [("agbada", (-0.9, -1.3), 175), ("hijab", (0.1, -1.1), 178), ("gele", (1.0, -1.35), 188), ("son", (0.55, -0.75), 182),
               ("youngm", (2.0, -1.7), 200), ("elder", (-1.9, -2.0), 160)]
    for key, (dx, dy), yaw in readers:
        cast(key, "r_" + key, (sheet.x + dx, sheet.y + dy, 0), yaw, tilt=-6)
    cast("observer", "e_observer", (sheet.x + 3.6, sheet.y - 3.4, 0), 205)
    sun_light((-0.75, 0.45, -0.38), energy=4.0)
    cam = camera((sheet.x + 3.0, sheet.y - 33.0, 4.4), (sheet.x + 2.4, sheet.y, 3.0), lens=30)
    sun_disc(cam, 0.87, 0.66, frac=0.026, halo=4.5)
    for nm in ("school_lamp0", "school_lamp1"):
        glow(nm + "_glow", bpy.data.objects[nm].matrix_world.translation, 1.1, cam)
    ink_setup()
    render()


def build_sheet():
    world_paper()
    order = [["elder", "gele", "mother", "son", "hijab", "agbada", "youngw"],
             ["youngm", "george", "senator", "chair_voter", "observer", "official_m", "official_f"]]
    for r, row in enumerate(order):
        z = 2.45 * (1 - r)
        y = 0.8 * r
        x = -4.75
        for i, key in enumerate(row):
            x += 0.62 if key == "son" else (1.55 if i else 0)
            if key == "hijab":
                x += 0.3
            p = pool(f"pool_{key}", (x, y), 0.55, 0.42, z=z + 0.004)
            yaw = -22
            if key == "chair_voter":
                wheelchair("wc_sheet", (x, y, z), yaw)
            if key in ("official_m", "official_f"):
                plastic_chair("chair_" + key, (x, y + 0.08, z), yaw)
            cast(key, "c_" + key, (x, y, z), yaw, turn=0)
    sun_light((0.55, 0.7, -0.5), energy=4.0)
    camera((0, -30, 7.6), (0.0, 0.4, 1.98), ortho=11.6)
    ink_setup(sil_px=max(1.3, WIDTH / 1100))
    render()


if SCENE == "hero":
    build_hero()
elif SCENE == "phone":
    build_hero(phone=True)
elif SCENE == "story":
    build_story()
elif SCENE == "evening":
    build_evening()
elif SCENE == "sheet":
    build_sheet()
