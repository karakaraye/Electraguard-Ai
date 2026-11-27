"""ElectraGuard "Ink and Paper" concept scene: a Nigerian polling unit on election morning.

Rendered headless:  blender -b -P polling_unit_scene.py -- <out.png> [width height]
The look: flat toon colour from the app's light tokens, ink outlines from Freestyle,
an orthographic three-quarter camera, one warm sun accent. No textures, no photos.
"""

import math
import random
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[0] if args else "//polling_unit.png"
WIDTH = int(args[1]) if len(args) > 1 else 2400
HEIGHT = int(args[2]) if len(args) > 2 else 1000
random.seed(7)

# ---------- palette (frontend/ui/tokens.css, light theme) ----------
HEX = {
    "ink": "#0e0d0b", "ink2": "#45413a", "ink3": "#6e6a62", "paper": "#faf8f3", "paper2": "#f2efe7",
    "sun": "#e3b060", "sunStrong": "#c98f2e", "sunTint": "#f6e7c6", "sunWash": "#fbf4e4",
    "line": "#7d6f5c", "fill": "#d9cfbc", "wall": "#f4eee2", "ground": "#efe8da", "rule": "#e6e1d5",
    "leaf": "#b9b08f", "leafDark": "#8f8768", "skin1": "#6b4a32", "skin2": "#8a5d3b", "skin3": "#4e3424",
    "ballot": "#e8edf0", "green": "#6f8f5a",
}


def srgb(hex_value):
    h = hex_value.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


def shade(hex_value, factor):
    h = hex_value.lstrip("#")
    c = [min(255, max(0, int(int(h[i:i + 2], 16) * factor))) for i in (0, 2, 4)]
    return "#%02x%02x%02x" % tuple(c)


# ---------- clean scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

_materials = {}


def mat(name, lit, shadow=None, alpha=1.0):
    """Two-step toon material: lit colour where the sun hits, a warmer shadow colour elsewhere."""
    key = (name, lit, shadow, alpha)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = srgb(shadow or shade(lit, 0.84))
    ramp.color_ramp.elements[1].position = 0.32
    ramp.color_ramp.elements[1].color = srgb(lit)
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(diffuse.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emit.inputs[0])
    if alpha < 1.0:
        mix = nt.nodes.new("ShaderNodeMixShader")
        transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix.inputs[0].default_value = alpha
        nt.links.new(transparent.outputs[0], mix.inputs[1])
        nt.links.new(emit.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else m.blend_method
    else:
        nt.links.new(emit.outputs[0], out.inputs[0])
    _materials[key] = m
    return m


def flat(name, colour):
    """Pure flat colour, no shading (sky, sun, signage)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = srgb(colour)
    nt.links.new(emit.outputs[0], out.inputs[0])
    return m


def put(obj, material, name=None):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if name:
        obj.name = name
    return obj


def box(name, size, loc, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return put(o, material, name)


def cyl(name, r, depth, loc, material, verts=16, rot=(0, 0, 0), r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return put(bpy.context.active_object, material, name)


def sphere(name, r, loc, material, scale=(1, 1, 1), segments=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2), radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth()
    return put(o, material, name)


# ---------- ground ----------
ground = box("ground", (80, 60, 0.2), (0, 0, -0.1), mat("ground", HEX["ground"], shade(HEX["ground"], 0.92)))
path = box("path", (5, 40, 0.02), (1.2, -10, 0.01), mat("path", HEX["paper2"], shade(HEX["paper2"], 0.93)))
compound = box("compound", (26, 11, 0.03), (0, 4.5, 0.015), mat("compound", HEX["sunWash"], shade(HEX["sunWash"], 0.94)))

# ---------- the school: long single-storey block with a corrugated roof ----------
wall = mat("wall", HEX["wall"], shade(HEX["wall"], 0.86))
trim = mat("trim", HEX["fill"], shade(HEX["fill"], 0.85))
dark = mat("window", HEX["ink2"], HEX["ink"])
roof = mat("roof", HEX["ink3"], HEX["ink2"])

box("school_wall", (22, 4.2, 3.2), (0, 9, 1.6), wall)
box("school_plinth", (22.4, 4.6, 0.35), (0, 9, 0.17), trim)
box("veranda", (22, 2.2, 0.15), (0, 6.2, 0.1), trim)
for i in range(9):
    x = -10 + i * 2.5
    cyl(f"veranda_post_{i}", 0.12, 3.1, (x, 5.3, 1.6), trim, verts=8)
    if i % 3 == 1:
        box(f"door_{i}", (1.1, 0.12, 2.2), (x + 1.25, 6.9, 1.2), dark)
    else:
        box(f"window_{i}", (1.4, 0.12, 1.1), (x + 1.25, 6.9, 1.8), dark)
        for k in range(3):
            box(f"louvre_{i}_{k}", (1.45, 0.16, 0.05), (x + 1.25, 6.83, 1.5 + k * 0.3), wall)
# corrugated roof as a tilted slab with ridges
roof_slab = box("roof", (23.4, 8.6, 0.12), (0, 8.4, 3.75), roof, rot=(math.radians(-7), 0, 0))
for i in range(46):
    box(f"rib_{i}", (0.07, 8.6, 0.06), (-11.5 + i * 0.5, 8.4, 3.83 - 0.0), mat("rib", HEX["ink2"]), rot=(math.radians(-7), 0, 0))

# ---------- INEC canopy over the voting point ----------
canvas = mat("canvas", HEX["paper"], HEX["sunTint"])
for (x, y) in [(-4.5, 1.2), (1.5, 1.2), (-4.5, 4.4), (1.5, 4.4)]:
    cyl("canopy_pole", 0.06, 2.9, (x, y, 1.45), mat("pole", HEX["ink3"]), verts=8)
box("canopy_top", (6.6, 3.8, 0.1), (-1.5, 2.8, 2.95), canvas)
for i in range(8):
    box(f"valance_{i}", (0.82, 0.04, 0.32), (-4.4 + i * 0.83, 0.92, 2.78), mat("valance", HEX["sun"] if i % 2 else HEX["paper"]))

# the table, ballot box, card reader and ink pot
box("table", (3.2, 1.0, 0.08), (-1.5, 3.0, 0.92), mat("table", HEX["fill"]))
for (x, y) in [(-2.95, 2.6), (-0.05, 2.6), (-2.95, 3.4), (-0.05, 3.4)]:
    box("table_leg", (0.07, 0.07, 0.9), (x, y, 0.46), mat("leg", HEX["ink3"]))
box("ballot_box", (0.8, 0.55, 0.6), (-0.6, 3.0, 1.26), mat("ballot", HEX["ballot"], shade(HEX["ballot"], 0.85), alpha=0.75))
box("ballot_lid", (0.84, 0.59, 0.05), (-0.6, 3.0, 1.58), mat("lid", HEX["ink2"]))
box("card_reader", (0.22, 0.14, 0.32), (-2.2, 3.0, 1.12), mat("reader", HEX["ink"]))
cyl("ink_pot", 0.07, 0.1, (-1.8, 2.8, 1.01), mat("inkpot", HEX["ink2"]))
# officials seated behind the table
def person(name, x, y, height=1.75, robe=HEX["paper"], head_wrap=None, cap=None, skin=HEX["skin2"], seated=False, lean=0.0, arm_up=False):
    body_h = height * (0.42 if seated else 0.62)
    base = 0.5 if seated else 0.0
    robe_m = mat(f"robe_{name}", robe)
    skin_m = mat(f"skin_{name}", skin, shade(skin, 0.75))
    torso = cyl(f"{name}_torso", 0.26, body_h, (x, y, base + body_h / 2), robe_m, verts=12, r2=0.2)
    torso.rotation_euler = (0, lean, 0)
    if not seated:
        cyl(f"{name}_legs", 0.17, height * 0.18, (x, y, height * 0.09), mat("trouser", HEX["ink2"]), verts=10)
    head_z = base + body_h + 0.2
    sphere(f"{name}_head", 0.17, (x, y, head_z), skin_m, segments=14)
    if head_wrap:
        sphere(f"{name}_gele", 0.2, (x, y - 0.02, head_z + 0.14), mat(f"gele_{name}", head_wrap), scale=(1.25, 1.0, 0.7), segments=12)
    if cap:
        cyl(f"{name}_cap", 0.17, 0.16, (x, y, head_z + 0.17), mat(f"cap_{name}", cap), verts=12)
    arm_z = base + body_h * 0.8
    for side in (-1, 1):
        a = cyl(f"{name}_arm", 0.06, body_h * 0.7, (x + side * 0.29, y, arm_z - body_h * 0.3), robe_m, verts=8)
        if arm_up and side == 1:
            a.rotation_euler = (math.radians(-60), 0, 0)
            a.location = (x + 0.29, y - 0.25, arm_z)
    return torso


person("official_1", -2.4, 3.8, robe=HEX["green"], skin=HEX["skin3"], seated=True, cap=HEX["paper"])
person("official_2", -0.9, 3.8, robe=HEX["paper2"], skin=HEX["skin1"], seated=True, head_wrap=HEX["sun"])

# ---------- the queue: eight voters waiting, then walkers arriving ----------
queue = [
    dict(robe=HEX["sun"], head_wrap=HEX["sunStrong"], skin=HEX["skin2"]),
    dict(robe=HEX["paper"], cap=HEX["ink2"], skin=HEX["skin3"]),
    dict(robe=HEX["fill"], skin=HEX["skin1"]),
    dict(robe=HEX["ink2"], head_wrap=HEX["paper"], skin=HEX["skin2"]),
    dict(robe=HEX["sunTint"], cap=HEX["sunStrong"], skin=HEX["skin3"]),
    dict(robe=HEX["paper2"], skin=HEX["skin1"], head_wrap=HEX["green"]),
    dict(robe=HEX["green"], cap=HEX["paper"], skin=HEX["skin2"]),
    dict(robe=HEX["sun"], skin=HEX["skin3"]),
]
for i, style in enumerate(queue):
    person(f"voter_{i}", -1.0 + 0.25 * math.sin(i * 1.7), 0.6 - i * 1.0, height=random.uniform(1.65, 1.9), **style)

# a voter in a wheelchair at the front, given priority
chair = mat("chair", HEX["ink2"])
for side in (-1, 1):
    cyl("wheel", 0.38, 0.06, (-3.2 + side * 0.32, 0.6, 0.38), chair, verts=24, rot=(0, math.radians(90), 0))
box("chair_seat", (0.6, 0.55, 0.08), (-3.2, 0.6, 0.6), chair)
person("voter_chair", -3.2, 0.65, robe=HEX["sunTint"], skin=HEX["skin1"], seated=True, head_wrap=HEX["ink2"])

# ---------- the observer: accredited, sun vest, sending a report from a phone ----------
person("observer", 3.4, 1.6, robe=HEX["sunStrong"], skin=HEX["skin2"], cap=HEX["ink"], arm_up=True)
box("phone", (0.1, 0.03, 0.18), (3.69, 1.33, 1.5), mat("phone", HEX["ink"]))

# ---------- trees ----------
def neem(x, y, s=1.0):
    cyl("trunk", 0.25 * s, 2.6 * s, (x, y, 1.3 * s), mat("bark", HEX["line"]), verts=10)
    for k in range(9):
        dx, dy, dz = random.uniform(-1.5, 1.5) * s, random.uniform(-0.8, 0.8) * s, random.uniform(0, 0.8) * s
        sphere("crown", random.uniform(1.1, 1.5) * s, (x + dx, y + dy, 3.4 * s + dz), mat("leaf", HEX["leaf"], HEX["leafDark"]), scale=(1.2, 1.0, 0.75), segments=14)


def palm(x, y, h=6.5):
    trunk = cyl("palm_trunk", 0.16, h, (x, y, h / 2), mat("palm_trunk", HEX["line"]), verts=8, r2=0.11)
    trunk.rotation_euler = (0, math.radians(random.uniform(-6, 6)), 0)
    for k in range(11):
        ang = k / 11 * math.tau + random.uniform(-0.15, 0.15)
        frond = box("frond", (2.8, 0.42, 0.03), (x + math.cos(ang) * 1.35, y + math.sin(ang) * 1.35, h - 0.05),
                    mat("frond", HEX["leaf"], HEX["leafDark"]), rot=(0, math.radians(-12), ang))
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.subdivide(number_cuts=8); bpy.ops.object.mode_set(mode="OBJECT")
        bend = frond.modifiers.new("droop", "SIMPLE_DEFORM")
        bend.deform_method = "BEND"; bend.deform_axis = "Y"; bend.angle = math.radians(random.uniform(70, 95))


neem(-9, 3.5, 1.15)
neem(9.5, 2.0, 0.95)
palm(-13.5, 6.0, 7.2)
palm(13.5, 7.0, 6.4)
palm(15.5, 4.5, 5.6)

# ---------- sky and sun ----------
world = bpy.data.worlds.new("paper")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = srgb(HEX["paper"])
bg.inputs[1].default_value = 1.0
scene.world = world

sun_disc = cyl("sun_disc", 2.4, 0.05, (-14, 34, 10.5), flat("sun", HEX["sun"]), verts=48, rot=(math.radians(80), 0, math.radians(-25)))
sun_glow = cyl("sun_glow", 4.2, 0.05, (-14, 34.2, 10.5), flat("sun_glow", HEX["sunTint"]), verts=48, rot=(math.radians(80), 0, math.radians(-25)))

# the light that drives the toon split (low morning sun from the east)
bpy.ops.object.light_add(type="SUN", location=(10, -10, 20))
light = bpy.context.active_object
light.data.energy = 3.0
light.rotation_euler = (math.radians(52), math.radians(18), math.radians(40))

# ---------- camera: orthographic three-quarter view ----------
bpy.ops.object.camera_add(location=(13, -21, 4.2))
cam = bpy.context.active_object
cam.data.type = "PERSP"
cam.data.lens = 38
cam.data.shift_y = 0.12
target = Vector((-0.5, 3.0, 2.6))
direction = target - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

# ---------- render: EEVEE, flat colour, Freestyle ink lines ----------
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else ("BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else engines[0])
scene.render.resolution_x = WIDTH
scene.render.resolution_y = HEIGHT
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.film_transparent = False
scene.render.use_freestyle = True
scene.render.line_thickness_mode = "ABSOLUTE"
scene.render.line_thickness = max(1.2, WIDTH / 1400)
view_layer = scene.view_layers[0]
fs = view_layer.freestyle_settings
fs.crease_angle = math.radians(134)
lineset = fs.linesets[0] if fs.linesets else fs.linesets.new("ink")
lineset.select_by_visibility = True
lineset.select_by_edge_types = True
lineset.select_silhouette = True
lineset.select_border = True
lineset.select_crease = True
style = lineset.linestyle or bpy.data.linestyles.new("ink")
lineset.linestyle = style
style.color = srgb(HEX["line"])[:3]
style.thickness = max(1.2, WIDTH / 1400)
style.chaining = "PLAIN"
# a slight wobble so the line reads drawn, not plotted
if not any(m.type == "SPATIAL_NOISE" for m in style.geometry_modifiers):
    noise = style.geometry_modifiers.new("wobble", "SPATIAL_NOISE")
    noise.amplitude = 0.6
    noise.scale = 30
scene.render.filepath = OUT
scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("RENDERED", OUT)
