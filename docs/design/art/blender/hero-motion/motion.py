"""Hero motion layers, rendered headless from the same scene and camera as the approved hero.

    blender -b -P motion.py -- <outdir> <view> <job>

Run at most two at once: more exhaust the graphics memory and Blender stops.

view: desktop | phone. job: probe | plate | crown | sprites:<set>[,<set>...] | still
Reuses eg_art.py (the approved art script) unchanged on disk; only two pose hooks are added
in memory (legs with lift and a body bob) so walk cycles can be posed.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

EG = os.environ.get("EG_ART", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "eg_art.py"))
argv = sys.argv[sys.argv.index("--") + 1:]
OUTDIR, VIEW, JOB = argv[0], argv[1], argv[2]
W, H = (2200, 1000) if VIEW == "desktop" else (780, 600)
os.makedirs(OUTDIR, exist_ok=True)

src = open(EG, encoding="utf-8").read()
# pose hooks: per-leg forward/lift and a body bob, so the same figure can walk
src = src.replace(
    '            fwd = p["step"] * (1 if s == 1 else -0.4)\n            ankle_t = L(s * (p["stance"] + 0.012), -fwd, 0.045)',
    '            fwd = p["step"] * (1 if s == 1 else -0.4)\n            lift = 0.0\n'
    '            if p.get("legs"):\n                fwd, lift = p["legs"][s]\n'
    '            ankle_t = L(s * (p["stance"] + 0.012), -fwd, 0.045 + lift - p.get("bob", 0.0))')
assert 'p.get("legs")' in src
src = src.replace('    return g.done(loc, yaw)\n\n\n# ---------- props ----------',
                  '    loc = (loc[0], loc[1], loc[2] + p.get("bob", 0.0) * k)\n    return g.done(loc, yaw)\n\n\n# ---------- props ----------')
assert 'p.get("bob", 0.0) * k' in src
sys.argv = [sys.argv[0], "--", os.path.join(OUTDIR, "unused.png"), str(W), str(H), "none"]
exec(compile(src, EG, "exec"))

from bpy_extras.object_utils import world_to_camera_view  # noqa: E402

PHONE = VIEW == "phone"
cx, cy = CANOPY
# where the moving people stand in the approved still
QPTS = bezier((cx + 0.6, cy - 1.0), (cx + 4.6, cy - 2.4), (cx + 6.4, cy + 0.4), 10)
ORDER = ["elder", "gele", "agbada", "youngw", "mother", "son", "senator", "george", "youngm"]


def still_slots():
    out = {}
    for i, key in enumerate(ORDER):
        x, y = QPTS[i + 1]
        nx, ny = QPTS[i]
        yaw = math.degrees(math.atan2(ny - y, nx - x)) + 90
        if key == "son":
            x, y = QPTS[i][0] + 0.35, QPTS[i][1] - 0.45
        out[key] = (x, y, yaw)
    return out


SLOTS = still_slots()
WHEEL = (cx - 0.7, cy - 0.85, 175)
OBS = (cx + 3.0, cy - 3.0, -28)
ARRIVING = (2.9, -0.4, 140)


def static_set(movers=False, crown=True):
    """The approved set; movers=False leaves out everyone who moves."""
    world_paper()
    ground_plane()
    school("school", SCHOOL["loc"], SCHOOL["yaw"], length=SCHOOL["length"])
    if PHONE:  # the live phone picture was rendered while the path was still drawn
        pp = bezier((-12, -17), (-6.5, -2.5), (3.4, 1.6), 24)
        pth = path_strip("path", pp, [3.4 * (1 - (i / 24) ** 3) + 0.2 for i in range(25)], toon(C("ground"), C("rule")))
        _link(pth, False)
    fence("fence_l", (-34, -9.0, 0), 0, 24.0)
    fence("fence_r", (-4.0, -9.0, 0), 0, 30.0)
    palm("palm_a", (13.5, 21.0, 0), h=10.5, seed=2, lean=(-0.05, 0.02))
    palm("palm_d", (17.0, 24.0, 0), h=9.0, seed=12, lean=(0.04, 0.0), yaw=70)
    palm("palm_b", (19.0, 15.0, 0), h=8.4, seed=5, lean=(0.06, 0.0), yaw=40)
    palm("palm_c", (22.5, 11.5, 0), h=7.0, seed=8, lean=(0.05, -0.03), yaw=10)
    # the live phone picture predates the neem move; keep each view identical to what is live
    if PHONE:
        neem("neem_r", (12.0, 7.6, 0), s=1.1, seed=4)
    else:
        neem("neem_r", NEEM_HERO, s=0.8, seed=4)
    bush_line("horizon", 66, 8, 160, seed=3, hmin=1.0, hmax=2.6)
    import random as _r
    rnd = _r.Random(21)
    for i in range(40):
        x = rnd.uniform(-16, 22)
        y = rnd.uniform(-8.5, 6)
        if 1 < x < 14 and -2.5 < y < 5.5:
            continue
        if x < 2.5:
            continue
        tuft(f"tuft{i}", (x, y, 0), s=rnd.uniform(0.9, 1.6), seed=i)
    for i in range(16):
        rnd.uniform(-14, 20), rnd.uniform(-8.5, 5)
    canopy("canopy", (cx, cy, 0), -5, w=5.6, d=4.0)
    polling_table("table", (cx, cy + 0.4, 0), -5)
    plastic_chair("chair1", (cx - 0.8, cy + 1.25, 0), -5)
    plastic_chair("chair2", (cx + 0.8, cy + 1.2, 0), -5)
    cast("official_m", "official_m", (cx - 0.8, cy + 1.3, 0), -5)
    cast("official_f", "official_f", (cx + 0.8, cy + 1.25, 0), -5)
    cubicle("cubicle", (cx - 3.6, cy + 0.9, 0), 10)
    cast("hijab", "voter_cubicle", (cx - 3.6, cy + 0.5, 0), 190, rhand=(-0.08, -0.25, 0.62), lhand=(0.06, -0.24, 0.62), tilt=20)
    if movers:
        wheelchair("wheelchair", (WHEEL[0], WHEEL[1], 0), WHEEL[2])
        cast("chair_voter", "voter_wheelchair", (WHEEL[0], WHEEL[1] - 0.07, 0), WHEEL[2])
        for i, key in enumerate(ORDER):
            x, y, yaw = SLOTS[key]
            cast(key, f"q_{i}_{key}", (x, y, 0), yaw)
        cast("observer", "observer", (OBS[0], OBS[1], 0), OBS[2])
        cast("youngm", "arriving", (ARRIVING[0], ARRIVING[1], 0), ARRIVING[2], step=0.12, lhand=(0.15, 0.06, 0.46), rhand=(-0.15, -0.05, 0.46))
    if not crown:
        for o in bpy.data.objects:
            if o.name.startswith("neem_r_leaf"):
                o.hide_render = True


def cam_sun():
    sun_light((0.6, 0.55, -0.58), energy=4.0)
    if PHONE:
        cam = camera((9.6, -6.4, 3.3), (6.4, 1.6, 1.15), lens=36, shift_x=0.05, shift_y=0.12)
    else:
        cam = camera((10.4, -13.0, 4.6), (2.2, 6.0, 2.2), lens=30, shift_x=0.0, shift_y=-0.05)
    return cam


def sun(cam):
    if PHONE:
        sun_disc(cam, 0.2, 0.88, frac=0.04, halo=3.4)
    else:
        sun_disc(cam, 0.6, 0.905, frac=0.022, halo=4.0)


def setup_render(path, border=None):
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
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path
    if border:
        u0, v0, u1, v1 = border
        scene.render.use_border = True
        scene.render.use_crop_to_border = False
        scene.render.border_min_x, scene.render.border_min_y = max(0, u0), max(0, v0)
        scene.render.border_max_x, scene.render.border_max_y = min(1, u1), min(1, v1)
    else:
        scene.render.use_border = False


def go(path, border=None):
    setup_render(path, border)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def px(cam, p):
    q = world_to_camera_view(scene, cam, Vector(p))
    return [q.x * W, (1 - q.y) * H, q.z]


def cam_json(cam):
    """Camera for projecting world metres to raw-image pixels in the page."""
    bpy.context.view_layer.update()
    mw = cam.matrix_world.inverted()
    frame = cam.data.view_frame(scene=scene)
    return dict(view=VIEW, w=W, h=H, world_to_cam=[list(r) for r in mw],
                frame=[list(v) for v in frame])


# ---------- poses ----------
STRIDE = 0.13  # normalised leg reach


def walk_pose(phase, stride=STRIDE, lift=0.05, swing=0.09, key=None):
    a = math.cos(phase)
    legs = {1: (stride * a, lift * max(0.0, -math.sin(phase))),
            -1: (-stride * a, lift * max(0.0, math.sin(phase)))}
    bob = -0.022 * abs(a)
    pose = dict(legs=legs, bob=bob, step=0.0,
                lhand=(0.15, swing * a, 0.46), rhand=(-0.15, -swing * a, 0.46), tilt=2)
    if key == "elder":  # stick in the near hand plants forward with the opposite foot
        pose.update(lhand=(0.16, -0.12 - 0.05 * a, 0.5), tilt=6, rhand=(-0.14, -0.04 * a, 0.47))
    if key == "mother":
        pose.update(rhand=(-0.13, -0.02, 0.5))
    if key == "son":
        pose.update(lhand=(0.15, -0.02, 0.6), tilt=-6)
    if key == "gele":
        pose.update(lhand=(0.15, 0.02, 0.47))
    if key in ("hijab",):
        pose.update(lhand=(0.12, swing * a * 0.6, 0.47), rhand=(-0.12, -swing * a * 0.6, 0.47))
    return pose


def step_pose(key):
    pose = dict(legs={1: (0.1, 0.035), -1: (-0.03, 0.0)}, bob=-0.008, step=0.0)
    return pose


def reach_pose():
    return dict(rhand=(-0.05, -0.27, 0.6), card=True, tilt=12)


def drop_pose():
    return dict(rhand=(-0.04, -0.24, 0.74), card=True, tilt=18)


# The walk heading for all walk cycles: right and slightly away (world +x, +y)
HEAD = 22.0
WALK_YAW = 90 + HEAD
WALK_REF = (6.2, 0.9)
SON_OFF = (-0.42, 0.02)  # walking: the son beside his mother on the camera side, holding her right hand
F_LOC, F_YAW = QPTS[2], 257.0   # a queue place near the table
B_LOC, B_YAW = QPTS[8], 305.0   # a queue place near the back
R_LOC = (cx - 0.45, cy - 0.5)   # in front of the card reader
X_LOC = (cx + 0.55, cy - 0.45)  # in front of the ballot box


def rot(off, yaw):
    r = math.radians(yaw)
    ox, oy = off
    return (ox * math.cos(r) - oy * math.sin(r), ox * math.sin(r) + oy * math.cos(r))


def son_world(mx, my, yaw, off=SON_OFF):
    d = rot(off, yaw)
    return (mx + d[0], my + d[1])


def son_still_local():
    mx, my, myaw = SLOTS["mother"]
    sx, sy, syaw = SLOTS["son"]
    return rot((sx - mx, sy - my), -myaw), syaw - myaw


def group_parts(setname, loc, yaw, pose, son_pose=None):
    if setname != "mother":
        return [(setname, loc, yaw, pose)]
    off, dyaw = son_still_local()
    sp = dict(lhand=(0.15, -0.02, 0.6), tilt=-6)
    sp.update(son_pose or {})
    mp = dict(pose)
    return [("mother", loc, yaw, mp), ("son", son_world(loc[0], loc[1], yaw, off), yaw + dyaw, sp)]


# frame lists per sprite set: (frame name, [(cast key, loc xy, yaw, pose)], anchor xy)
def frames_for(setname):
    fr = []
    if setname == "observer":
        x, y, yaw = OBS
        fr.append(("still", [("observer", (x, y), yaw, {})], (x, y)))
        fr.append(("look", [("observer", (x, y), yaw, dict(tilt=0, turn=-16, phone=-70, rhand=(-0.05, -0.12, 0.56), lhand=(0.13, -0.04, 0.48)))], (x, y)))
        return fr
    if setname == "wheel":
        x, y, yaw = WHEEL
        fr.append(("still", [("wheel", (x, y), yaw, {})], (x, y)))
        fr.append(("reach", [("wheel", (x, y), yaw, dict(rhand=(-0.08, -0.32, 0.5), lhand=(0.1, -0.2, 0.36), tilt=10))], (x, y)))
        fr.append(("drop", [("wheel", X_LOC, 175, dict(rhand=(-0.05, -0.3, 0.68), tilt=16))], X_LOC))
        fr.append(("standF", [("wheel", F_LOC, F_YAW, dict(card=False))], F_LOC))
        fr.append(("standB", [("wheel", B_LOC, B_YAW, dict(card=False))], B_LOC))
        for k in range(3):
            hy = 0.07 * math.cos(k / 3 * math.tau)
            fr.append((f"walk{k}", [("wheel", WALK_REF, WALK_YAW, dict(rhand=(-0.19, hy - 0.02, 0.33), lhand=(0.19, hy - 0.02, 0.33), card=False, tilt=4))], WALK_REF))
        return fr
    if setname in SLOTS:
        sx, sy, syaw = SLOTS[setname]
        fr.append(("still", group_parts(setname, (sx, sy), syaw, {}, {}), (sx, sy)))
    if setname == "youngm":  # the man walking in, exactly as in the still
        fr.append(("arrive", [("youngm", ARRIVING[:2], ARRIVING[2], dict(step=0.12, lhand=(0.15, 0.06, 0.46), rhand=(-0.15, -0.05, 0.46)))], ARRIVING[:2]))
    for tag, loc, yaw in (("F", F_LOC, F_YAW), ("B", B_LOC, B_YAW)):
        fr.append(("stand" + tag, group_parts(setname, loc, yaw, {}, {}), loc))
        fr.append(("step" + tag, group_parts(setname, loc, yaw, step_pose(setname), step_pose("son")), loc))
    fr.append(("wait", group_parts(setname, R_LOC, 175, {}), R_LOC))
    fr.append(("reach", group_parts(setname, R_LOC, 175, reach_pose()), R_LOC))
    fr.append(("drop", group_parts(setname, X_LOC, 175, drop_pose()), X_LOC))
    n = 6
    for k in range(n):
        ph = k / n * math.tau
        if setname == "mother":
            mp = walk_pose(ph, key="mother")
            mp["rhand"] = (-0.17, -0.02, 0.47)
            parts = [("mother", WALK_REF, WALK_YAW, mp),
                     ("son", son_world(*WALK_REF, WALK_YAW), WALK_YAW, walk_pose(ph + math.pi * 0.5, stride=0.12, key="son"))]
        else:
            st = 0.105 if setname == "elder" else STRIDE
            parts = [(setname, WALK_REF, WALK_YAW, walk_pose(ph, stride=st, key=setname))]
        fr.append((f"walk{k}", parts, WALK_REF))
    return fr


def build_part(key, loc, yaw, pose, name):
    if key == "wheel":
        wheelchair(name + "_wc", (loc[0], loc[1], 0), yaw)
        r = math.radians(yaw)
        # the rider sits 0.07 m back in the chair's own frame
        bx, by = loc[0] - 0.07 * math.sin(r), loc[1] + 0.07 * math.cos(r)
        return cast("chair_voter", name, (bx, by, 0), yaw, **pose)
    return cast(key, name, (loc[0], loc[1], 0), yaw, **pose)


def objs_of(prefix):
    return [o for o in bpy.data.objects if o.name.startswith(prefix)]


def screen_bbox(cam, objs, extra_pts=()):
    us, vs = [], []
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            q = world_to_camera_view(scene, cam, o.matrix_world @ Vector(c))
            us.append(q.x)
            vs.append(q.y)
    for p in extra_pts:
        q = world_to_camera_view(scene, cam, Vector(p))
        us.append(q.x)
        vs.append(q.y)
    return min(us), min(vs), max(us), max(vs)


def delete_objs(objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)


def run_sprites(sets):
    world_paper()
    ground_plane()
    cam = cam_sun()
    ink_setup()
    ground = bpy.data.objects["ground"]
    meta = {}
    for setname in sets:
        out = []
        for fi, (fname, parts, anchor) in enumerate(frames_for(setname)):
            before = set(o.name for o in bpy.data.objects)
            for j, (key, loc, yaw, pose) in enumerate(parts):
                build_part(key, loc, yaw, pose, f"sp_{setname}_{fname}_{j}")
            bpy.context.view_layer.update()
            new = [o for o in bpy.data.objects if o.name not in before]
            # shadows fall right and away: include the far end of a 2.6 m shadow in the crop
            sh = [(loc[0] + 2.7 * 0.74, loc[1] + 2.7 * 0.68, 0) for _, loc, _, _ in parts]
            u0, v0, u1, v1 = screen_bbox(cam, new, sh)
            m = 10 / W
            border = (u0 - m, v0 - m, u1 + m, v1 + m)
            base = os.path.join(OUTDIR, f"{setname}-{fname}")
            ground.hide_render = False
            go(base + "-A.png", border)
            ground.hide_render = True
            go(base + "-B.png", border)
            ground.hide_render = False
            a = px(cam, (anchor[0], anchor[1], 0))
            out.append(dict(name=fname, anchor_world=list(anchor), anchor_px=a[:2], depth=a[2],
                            box=[border[0] * W, (1 - border[3]) * H, border[2] * W, (1 - border[1]) * H]))
            delete_objs(new)
        meta[setname] = out
        with open(os.path.join(OUTDIR, f"meta-{setname}.json"), "w") as f:
            json.dump(out, f, indent=1)
    with open(os.path.join(OUTDIR, "camera.json"), "w") as f:
        json.dump(cam_json(cam), f)


if JOB == "probe":
    static_set(movers=True)
    cam = cam_sun()
    res = dict(camera=cam_json(cam), qpts=[px(cam, (x, y, 0)) for x, y in QPTS],
               slots={k: px(cam, (v[0], v[1], 0)) + [v[2]] for k, v in SLOTS.items()},
               wheel=px(cam, (WHEEL[0], WHEEL[1], 0)), obs=px(cam, (OBS[0], OBS[1], 0)),
               obs_head=px(cam, (OBS[0], OBS[1], 1.6)), arriving=px(cam, (ARRIVING[0], ARRIVING[1], 0)),
               reader=px(cam, (cx - 0.45, cy + 0.35, 0.82)), box_slot=px(cam, (cx + 0.55, cy + 0.34, 1.335)),
               neem=screen_bbox(cam, objs_of("neem_r_leaf")), sun=px(cam, bpy.data.objects["sun_disc"].matrix_world.translation) if bpy.data.objects.get("sun_disc") else None)
    print("PROBEJSON", json.dumps(res))
    with open(os.path.join(OUTDIR, "probe.json"), "w") as f:
        json.dump(res, f, indent=1)
elif JOB in ("plate", "still"):
    static_set(movers=(JOB == "still"), crown=(JOB == "still"))
    cam = cam_sun()
    sun(cam)
    if JOB == "plate":
        # the crown still casts its shadow on the school, but is not seen and draws no ink
        for o in objs_of("neem_r_leaf"):
            o.hide_render = False
            o.visible_camera = False
            for c in list(o.users_collection):
                c.objects.unlink(o)
            NOINK.objects.link(o)
    ink_setup()
    go(os.path.join(OUTDIR, f"{JOB}.png"))
elif JOB == "crown":
    world_paper()
    neem("neem_r", (12.0, 7.6, 0) if PHONE else NEEM_HERO, s=1.1 if PHONE else 0.8, seed=4)
    for o in bpy.data.objects:
        if o.name.startswith("neem_r") and "leaf" not in o.name and o.type == "MESH":
            o.hide_render = True
    cam = cam_sun()
    ink_setup()
    go(os.path.join(OUTDIR, "crown.png"))
    trunk_top = (NEEM_HERO[0] + 0.08, NEEM_HERO[1], 2.6) if not PHONE else (12.1, 7.6, 3.4)
    with open(os.path.join(OUTDIR, "crown.json"), "w") as f:
        json.dump(dict(pivot=px(cam, trunk_top), bbox=screen_bbox(cam, objs_of("neem_r_leaf"))), f)
elif JOB == "poles":
    world_paper()
    ground_plane()
    canopy("canopy", (cx, cy, 0), -5, w=5.6, d=4.0)
    cam = cam_sun()
    ink_setup()
    bpy.context.view_layer.update()
    poles = [o for o in objs_of("canopy_pole")]
    keep = []
    meta = []
    for o in poles:
        p = o.matrix_world.translation
        if p.y < cy:  # the two front poles can stand in front of people
            keep.append(o)
    for o in bpy.data.objects:
        if o.name.startswith("canopy") and o not in keep and o.type == "MESH":
            o.hide_render = True
    for i, o in enumerate(keep):
        for q in keep:
            q.hide_render = q is not o
        base = (o.matrix_world.translation.x, o.matrix_world.translation.y, 0)
        u0, v0, u1, v1 = screen_bbox(cam, [o])
        m = 6 / W
        bpy.data.objects["ground"].hide_render = True
        go(os.path.join(OUTDIR, f"pole{i}-B.png"), (u0 - m, v0 - m, u1 + m, v1 + m))
        a = px(cam, base)
        meta.append(dict(name=f"pole{i}", anchor_world=list(base[:2]), anchor_px=a[:2], depth=a[2]))
    with open(os.path.join(OUTDIR, "meta-poles.json"), "w") as f:
        json.dump(meta, f, indent=1)
elif JOB.startswith("sprites:"):
    run_sprites(JOB.split(":", 1)[1].split(","))
