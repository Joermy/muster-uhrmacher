#!/usr/bin/env python3
"""
Baut das 3D-Modell der Kessler K-1 in Blender und exportiert es als GLB.

    pip install bpy
    python scripts/modell-bauen.py            # schreibt assets/modelle/uhr-roh.glb
    npx gltfpack -i assets/modelle/uhr-roh.glb -o assets/modelle/uhr.glb -cc -kn -km -noq

Masseinheit ist Millimeter. Uhrachse ist Z, das Zifferblatt zeigt nach +Z,
12 Uhr liegt auf +Y, die Krone auf +X. Jedes Teil, das sich bewegt oder beim
Zerlegen eigene Wege geht, ist ein eigenes Objekt mit dem Drehpunkt im Ursprung.
Die Materialien tragen nur Namen und Grundfarben, Oberflaechen und Schliffe
entstehen zur Laufzeit in assets/js/uhr/.
"""

import math
import os
import sys

import bpy  # muss vor bmesh/mathutils geladen werden
import bmesh
from mathutils import Matrix, Vector

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(WURZEL, "assets", "modelle", "uhr-roh.glb")

TAU = math.pi * 2


# ---------------------------------------------------------------- Grundlagen

def leeren():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    szene = bpy.context.scene
    szene.unit_settings.system = "METRIC"
    szene.unit_settings.scale_length = 0.001
    return szene


MATERIALIEN = {}

GRUNDFARBEN = {
    "Stahl_poliert": (0.86, 0.86, 0.88, 1),
    "Stahl_gebuerstet": (0.78, 0.78, 0.8, 1),
    "Blaustahl": (0.05, 0.12, 0.55, 1),
    "Zifferblatt": (0.82, 0.82, 0.8, 1),
    "Hilfsblatt": (0.78, 0.78, 0.76, 1),
    "Index": (0.9, 0.9, 0.92, 1),
    "Saphir": (1, 1, 1, 0.1),
    "Platine": (0.82, 0.8, 0.74, 1),
    "Neusilber": (0.86, 0.8, 0.66, 1),
    "Kloben": (0.86, 0.8, 0.66, 1),
    "Gold": (0.95, 0.72, 0.38, 1),
    "Rubin": (0.7, 0.02, 0.06, 1),
    "Rad": (0.93, 0.74, 0.44, 1),
    "Unruh": (0.9, 0.68, 0.42, 1),
    "Spirale": (0.55, 0.56, 0.6, 1),
    "Stahl_dunkel": (0.4, 0.4, 0.42, 1),
    "Leder": (0.09, 0.05, 0.035, 1),
    "Naht": (0.75, 0.72, 0.66, 1),
    "Lume": (0.85, 0.9, 0.85, 1),
}


def material(name):
    if name in MATERIALIEN:
        return MATERIALIEN[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    farbe = GRUNDFARBEN.get(name, (0.8, 0.8, 0.8, 1))
    if bsdf:
        bsdf.inputs["Base Color"].default_value = farbe
        metall = name not in ("Zifferblatt", "Hilfsblatt", "Saphir", "Rubin", "Leder", "Naht", "Lume")
        bsdf.inputs["Metallic"].default_value = 1.0 if metall else 0.0
        bsdf.inputs["Roughness"].default_value = 0.25
    MATERIALIEN[name] = m
    return m


def verlinken(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def objekt_aus_bmesh(name, bm, mat=None, glatt=True, winkel=34):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    verlinken(obj)
    if mat:
        me.materials.append(material(mat))
    if glatt:
        glaetten(obj, winkel)
    return obj


def glaetten(obj, winkel=34):
    me = obj.data
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(winkel))


def auswerten(obj, name=None):
    """Wendet Modifikatoren und Kurvengeometrie an und ersetzt das Objekt durch ein Netz."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    neu = bpy.data.objects.new(name or obj.name, me)
    neu.matrix_world = obj.matrix_world.copy()
    verlinken(neu)
    alt = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if isinstance(alt, bpy.types.Curve):
        bpy.data.curves.remove(alt)
    elif isinstance(alt, bpy.types.Mesh) and alt.users == 0:
        bpy.data.meshes.remove(alt)
    if name:
        neu.name = name
    return neu


def schweissen(obj, abstand=0.0005):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=abstand)
    bm.to_mesh(obj.data)
    bm.free()


def fasen(obj, breite, segmente=2, winkel=30, mat_index=-1, limit="ANGLE"):
    mod = obj.modifiers.new("Fase", "BEVEL")
    mod.width = breite
    mod.segments = segmente
    mod.limit_method = limit
    mod.angle_limit = math.radians(winkel)
    mod.harden_normals = False
    mod.miter_outer = "MITER_ARC"
    mod.profile = 0.5
    if mat_index >= 0:
        mod.material = mat_index
    return auswerten(obj, obj.name)


def slots_bereinigen(obj, ersatz=0):
    """Leere Materialplaetze (z. B. von Bool-Werkzeugen) entfernen, Flaechen umhaengen."""
    me = obj.data
    mats = list(me.materials)
    if None not in mats:
        return obj
    gueltig = [i for i, m in enumerate(mats) if m is not None]
    if not gueltig:
        return obj
    neu_index = {alt: k for k, alt in enumerate(gueltig)}
    ziel = neu_index.get(ersatz, 0)
    werte = [0] * len(me.polygons)
    me.polygons.foreach_get("material_index", werte)
    werte = [neu_index.get(w, ziel) if w < len(mats) else ziel for w in werte]
    me.materials.clear()
    for i in gueltig:
        me.materials.append(mats[i])
    me.polygons.foreach_set("material_index", werte)
    me.update()
    return obj


def bool_op(a, b, op="DIFFERENCE", behalten=False):
    mod = a.modifiers.new("Bool", "BOOLEAN")
    mod.operation = op
    mod.object = b
    mod.solver = "EXACT"
    neu = auswerten(a, a.name)
    if not behalten:
        bpy.data.objects.remove(b, do_unlink=True)
    return slots_bereinigen(neu)


def verbinden(name, objekte):
    """Fuegt mehrere Objekte (mit ihren Materialien) zu einem zusammen."""
    objekte = [o for o in objekte if o]
    ziel = objekte[0]
    with bpy.context.temp_override(active_object=ziel, selected_editable_objects=objekte, object=ziel):
        bpy.ops.object.join()
    ziel.name = name
    ziel.data.name = name
    return ziel


def drehpunkt(obj, punkt):
    """Setzt den Ursprung auf einen Punkt (Weltkoordinaten), ohne die Geometrie zu verschieben."""
    p = Vector(punkt)
    obj.data.transform(Matrix.Translation(-p + obj.matrix_world.translation))
    obj.matrix_world = Matrix.Translation(p)


def kreis(r, n, start=0.0, mitte=(0, 0), bis=None):
    bis = TAU if bis is None else bis
    return [(mitte[0] + r * math.cos(start + bis * i / n), mitte[1] + r * math.sin(start + bis * i / n)) for i in range(n)]


def bogen(r, a0, a1, n, mitte=(0, 0)):
    return [(mitte[0] + r * math.cos(a0 + (a1 - a0) * i / (n - 1)), mitte[1] + r * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


# ------------------------------------------------------------- Kurven / Profile

def profil_objekt(name, umrisse, tiefe, fase=0.0, aufloesung=1, mat=None, z=0.0, versatz=None):
    """Extrudiert 2D-Umrisse (erster aussen, weitere als Loecher) um `tiefe` nach oben ab `z`."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = max(tiefe / 2 - fase, 0.0001)
    cu.bevel_depth = fase
    cu.bevel_resolution = aufloesung
    cu.bevel_mode = "ROUND"
    cu.offset = -fase if versatz is None else versatz
    for umriss in umrisse:
        sp = cu.splines.new("POLY")
        sp.points.add(len(umriss) - 1)
        for i, (x, y) in enumerate(umriss):
            sp.points[i].co = (x, y, 0, 1)
        sp.use_cyclic_u = True
    obj = bpy.data.objects.new(name, cu)
    verlinken(obj)
    if mat:
        cu.materials.append(material(mat))
    obj.location.z = z + tiefe / 2
    obj = auswerten(obj, name)
    # Lage in die Geometrie backen, damit spaeteres Positionieren nichts verschiebt
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    schweissen(obj)
    glaetten(obj)
    return obj


def drehkoerper(name, profil, segmente=192, mat=None, winkel=34, achse="Z"):
    """Rotationskoerper aus einem geschlossenen (r, z)-Profil."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profil]
    kanten = [bm.edges.new((verts[i], verts[(i + 1) % len(verts)])) for i in range(len(verts))]
    bmesh.ops.spin(bm, geom=verts + kanten, cent=(0, 0, 0), axis=(0, 0, 1), angle=TAU, steps=segmente, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = objekt_aus_bmesh(name, bm, mat, True, winkel)
    return obj


def offenes_drehteil(name, profil, segmente=192, mat=None, winkel=34):
    """Rotationskoerper aus einem offenen (r, z)-Profil, z. B. fuer gewoelbte Glaeser."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profil]
    kanten = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + kanten, cent=(0, 0, 0), axis=(0, 0, 1), angle=TAU, steps=segmente, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return objekt_aus_bmesh(name, bm, mat, True, winkel)


def glatte_kurve(punkte, r, n=6):
    """Rundet die Ecken eines Polygons mit Radius r (einfacher Eckenradius)."""
    aus = []
    m = len(punkte)
    for i in range(m):
        p0 = Vector(punkte[i - 1])
        p1 = Vector(punkte[i])
        p2 = Vector(punkte[(i + 1) % m])
        a = (p0 - p1)
        b = (p2 - p1)
        la, lb = a.length, b.length
        if la < 1e-6 or lb < 1e-6:
            aus.append(tuple(p1))
            continue
        a.normalize()
        b.normalize()
        w = a.angle(b)
        if w > math.radians(176) or w < 1e-3:
            aus.append(tuple(p1))
            continue
        t = min(r / math.tan(w / 2), la * 0.45, lb * 0.45)
        s = p1 + a * t
        e = p1 + b * t
        for k in range(n + 1):
            u = k / n
            q = (1 - u) ** 2 * s + 2 * (1 - u) * u * p1 + u ** 2 * e
            aus.append((q.x, q.y))
    return aus


# ------------------------------------------------------------------ Verzahnung

def zahnrad_umriss(zaehne, r_teil, art="rad", spitze_pkt=5):
    """Uhrmacher-Verzahnung (Spitzbogen) als geschlossener Umriss."""
    m = 2 * r_teil / zaehne
    r_kopf = r_teil + (1.1 if art == "trieb" else 0.95) * m
    r_fuss = r_teil - 1.3 * m
    teil = TAU / zaehne
    pkt = []
    for k in range(zaehne):
        a = k * teil
        breite = 0.46 if art == "rad" else 0.52
        z0 = a - teil * breite / 2
        z1 = a + teil * breite / 2
        # Fussbogen
        pkt.append((r_fuss * math.cos(z0 - teil * 0.04), r_fuss * math.sin(z0 - teil * 0.04)))
        # Flanke hoch bis Teilkreis
        pkt.append((r_teil * math.cos(z0), r_teil * math.sin(z0)))
        # Spitzbogen
        for i in range(1, spitze_pkt):
            u = i / spitze_pkt
            rr = r_teil + (r_kopf - r_teil) * math.sin(u * math.pi) ** 0.55 if u < 0.5 else r_teil + (r_kopf - r_teil) * math.sin(u * math.pi) ** 0.55
            ww = z0 + (z1 - z0) * (0.5 - 0.5 * math.cos(u * math.pi))
            if abs(u - 0.5) < 1e-6:
                rr = r_kopf
            pkt.append((rr * math.cos(ww), rr * math.sin(ww)))
        pkt.append((r_teil * math.cos(z1), r_teil * math.sin(z1)))
        pkt.append((r_fuss * math.cos(z1 + teil * 0.04), r_fuss * math.sin(z1 + teil * 0.04)))
        # Zahnluecke unten
        pkt.append((r_fuss * 0.995 * math.cos(a + teil / 2), r_fuss * 0.995 * math.sin(a + teil / 2)))
    return pkt, r_fuss


def sperrrad_umriss(zaehne, r):
    pkt = []
    teil = TAU / zaehne
    for k in range(zaehne):
        a = k * teil
        pkt.append(((r - 0.42) * math.cos(a), (r - 0.42) * math.sin(a)))
        pkt.append(((r - 0.38) * math.cos(a + teil * 0.15), (r - 0.38) * math.sin(a + teil * 0.15)))
        pkt.append((r * math.cos(a + teil * 0.82), r * math.sin(a + teil * 0.82)))
        pkt.append(((r - 0.05) * math.cos(a + teil * 0.92), (r - 0.05) * math.sin(a + teil * 0.92)))
    return pkt


def ankerrad_umriss(zaehne, r):
    """Schweizer Ankerrad mit Kolbenzaehnen."""
    pkt = []
    teil = TAU / zaehne
    r_fuss = r * 0.62
    for k in range(zaehne):
        a = k * teil
        pkt.append((r_fuss * math.cos(a), r_fuss * math.sin(a)))
        pkt.append((r_fuss * math.cos(a + teil * 0.18), r_fuss * math.sin(a + teil * 0.18)))
        # schraeg nach aussen gestellter Zahn (Rueckenflanke)
        pkt.append((r * 0.9 * math.cos(a + teil * 0.42), r * 0.9 * math.sin(a + teil * 0.42)))
        # Kolben (Hebeflaeche)
        pkt.append((r * math.cos(a + teil * 0.52), r * math.sin(a + teil * 0.52)))
        pkt.append((r * 0.985 * math.cos(a + teil * 0.64), r * 0.985 * math.sin(a + teil * 0.64)))
        # Brustflanke zurueck
        pkt.append((r * 0.8 * math.cos(a + teil * 0.5), r * 0.8 * math.sin(a + teil * 0.5)))
        pkt.append((r_fuss * 1.02 * math.cos(a + teil * 0.42), r_fuss * 1.02 * math.sin(a + teil * 0.42)))
    return pkt


def schenkel_loecher(r_innen, r_nabe, schenkel, breite, start=0.0, krumm=0.0):
    """Ausschnitte zwischen den Radschenkeln."""
    loecher = []
    for k in range(schenkel):
        a0 = start + k * TAU / schenkel
        a1 = a0 + TAU / schenkel
        wa = breite / 2 / r_innen
        wn = breite / 2 / r_nabe * 1.3
        aussen = bogen(r_innen, a0 + wa, a1 - wa, 18)
        innen = bogen(r_nabe, a1 - wn + krumm, a0 + wn + krumm, 8)
        loch = glatte_kurve(aussen + innen, min(0.35, (r_innen - r_nabe) * 0.25), 3)
        loecher.append(loch[::-1])
    return loecher


def rad(name, zaehne, r_teil, dicke, mat="Rad", schenkel=5, z=0.0, nabe=None, trieb=None, fase=0.025):
    umriss, r_fuss = zahnrad_umriss(zaehne, r_teil)
    teile = [umriss]
    if schenkel:
        r_kranz = r_fuss - max(0.28, r_teil * 0.09)
        r_nabe = nabe or max(0.55, r_teil * 0.22)
        teile += schenkel_loecher(r_kranz, r_nabe, schenkel, max(0.22, r_teil * 0.07), start=0.3)
    obj = profil_objekt(name, teile, dicke, fase=fase, aufloesung=1, mat=mat, z=z)
    stuecke = [obj]
    # Welle mit polierten Zapfen
    welle = drehkoerper(name + "_welle", [(0, z - 1.1), (0.16, z - 1.1), (0.16, z - 0.7), (0.3, z - 0.6), (0.3, z + dicke + 0.5), (0.16, z + dicke + 0.6), (0.16, z + dicke + 1.0), (0, z + dicke + 1.0)], 24, "Stahl_poliert")
    stuecke.append(welle)
    if trieb:
        tz, tr, th = trieb
        tu, _ = zahnrad_umriss(tz, tr, "trieb", 3)
        tr_obj = profil_objekt(name + "_trieb", [tu], th, fase=0.0, mat="Stahl_poliert", z=z - th)
        stuecke.append(tr_obj)
    return verbinden(name, stuecke)


# ---------------------------------------------------------------- Kleinteile

def schraube(name, r, hoehe, mat="Blaustahl", schlitz=True, linsen=True, segmente=36):
    """Schraubenkopf mit gewoelbter Oberseite und Schlitz, Unterseite bei z=0."""
    prof = [(0, 0), (r, 0), (r, hoehe * 0.45)]
    if linsen:
        for i in range(1, 7):
            u = i / 7
            prof.append((r * math.cos(u * math.pi / 2), hoehe * 0.45 + hoehe * 0.55 * math.sin(u * math.pi / 2)))
    else:
        prof.append((r * 0.92, hoehe))
    prof.append((0, hoehe))
    obj = drehkoerper(name, prof, segmente, mat, 40)
    if schlitz:
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        sch = objekt_aus_bmesh(name + "_s", bm, glatt=False)
        sch.scale = (r * 2.6, r * 0.28, hoehe * 0.7)
        sch.location = (0, 0, hoehe)
        bpy.context.view_layer.update()
        obj = bool_op(obj, sch)
        glaetten(obj, 40)
    return obj


def chaton(name, r_aussen, mitte, z, schrauben=2, mat_ring="Gold", richtung=-1):
    """Goldchaton mit polierter Fase, Lagerstein mit Oelsenkung und zwei gebläuten Schrauben.
    richtung -1: zeigt zur Werkseite (Boden), +1: zur Zifferblattseite."""
    r = r_aussen
    d = richtung
    ring_p = [(0.42 * r, 0), (r, 0), (r, 0.12), (0.9 * r, 0.26), (0.66 * r, 0.27), (0.52 * r, 0.18), (0.42 * r, 0.18)]
    stein_p = [(0, 0.02), (0.45 * r, 0.02), (0.45 * r, 0.17), (0.3 * r, 0.235), (0.11 * r, 0.25), (0.06 * r, 0.21), (0, 0.205)]
    ring = drehkoerper(name + "_ring", [(x, z + d * h) for x, h in ring_p], 56, mat_ring, 28)
    stein = drehkoerper(name + "_stein", [(x, z + d * h) for x, h in stein_p], 40, "Rubin", 30)
    teile = [ring, stein]
    for i in range(schrauben):
        a = math.radians(35 + 180 * i) if schrauben == 2 else TAU * i / schrauben + 0.5
        sc = schraube(name + f"_schraube{i}", r * 0.27, 0.24, "Blaustahl")
        sc.rotation_euler = (0 if d > 0 else math.pi, 0, a + 0.6)
        sc.location = (r * 1.3 * math.cos(a), r * 1.3 * math.sin(a), z)
        bpy.context.view_layer.update()
        teile.append(auswerten(sc))
    obj = verbinden(name, teile)
    obj.location = (mitte[0], mitte[1], 0)
    bpy.context.view_layer.update()
    return auswerten(obj)


def band_umriss(punkte, halb, n_ende=10):
    """Gleichbreites Band entlang einer Polylinie mit runden Enden."""
    pk = [Vector(p) for p in punkte]
    links, rechts = [], []
    for i, p in enumerate(pk):
        if i == 0:
            t = (pk[1] - pk[0]).normalized()
        elif i == len(pk) - 1:
            t = (pk[-1] - pk[-2]).normalized()
        else:
            t = ((pk[i + 1] - pk[i]).normalized() + (pk[i] - pk[i - 1]).normalized()).normalized()
        n = Vector((-t.y, t.x))
        links.append(p + n * halb)
        rechts.append(p - n * halb)
    t1 = (pk[-1] - pk[-2]).normalized()
    t0 = (pk[1] - pk[0]).normalized()
    w1 = math.atan2(t1.y, t1.x)
    w0 = math.atan2(t0.y, t0.x)
    ende = [tuple(pk[-1] + Vector((math.cos(w1 + math.pi / 2 - k / n_ende * math.pi), math.sin(w1 + math.pi / 2 - k / n_ende * math.pi))) * halb) for k in range(1, n_ende)]
    anfang = [tuple(pk[0] + Vector((math.cos(w0 - math.pi / 2 - k / n_ende * math.pi), math.sin(w0 - math.pi / 2 - k / n_ende * math.pi))) * halb) for k in range(1, n_ende)]
    return [tuple(v) for v in links] + ende + [tuple(v) for v in reversed(rechts)] + anfang


def bei(obj, x, y, z=0.0, dreh=0.0):
    obj.location = (x, y, z)
    obj.rotation_euler.z = dreh
    bpy.context.view_layer.update()
    return auswerten(obj)


def planar_uv(obj, mitte=(0, 0), groesse=34.0, name="UVMap"):
    """Draufsicht-Projektion in Werk-Koordinaten (gleiche Textur fuer alle Werkteile)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name=name)
    uv = me.uv_layers.active.data
    mw = obj.matrix_world
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = mw @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = ((v.x - mitte[0]) / groesse + 0.5, (v.y - mitte[1]) / groesse + 0.5)


def zylinder_uv(obj):
    """u = Winkel um die Uhrachse, v = Hoehe; fuer Gehaeuseteile."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = ((math.atan2(v.y, v.x) / TAU) % 1.0, (v.z + 10) / 20)


# ------------------------------------------------------------------- Gehaeuse

R_GEH = 19.5          # 39 mm
Z_BODEN = -3.6        # Trennfuge Gehaeuse/Boden
Z_OBEN = 2.6          # Oberkante Mittelteil
R_WERK = 15.5         # Werkdurchmesser 31 mm
Z_BLATT = 0.62        # Unterkante Zifferblatt
BLATT_DICKE = 0.42
R_BLATT = 16.55


def gehaeuse():
    # Mittelteil als Drehteil
    profil = [
        (15.75, Z_BODEN), (18.85, Z_BODEN), (19.32, Z_BODEN + 0.42), (R_GEH, Z_BODEN + 1.1),
        (R_GEH, 1.95), (19.38, 2.38), (19.0, Z_OBEN), (16.95, Z_OBEN), (16.95, 1.22), (15.75, 1.22),
    ]
    mittel = drehkoerper("Gehaeuse_roh", profil, 256, "Stahl_gebuerstet", 30)

    # Bandanstoesse: Seitenprofil (y, z) extrudiert in x
    def anstoss(seite_x, seite_y):
        pkt = []
        # Oberkante faellt zum Handgelenk hin
        for i in range(17):
            u = i / 16
            pkt.append((14.5 + u * 9.0, 2.05 - 2.55 * u ** 1.9))
        # runde Spitze
        for i in range(1, 8):
            w = math.pi / 2 - i / 7 * math.pi
            pkt.append((23.5 + 1.25 * math.cos(w) * 0.6, -1.2 + 1.25 * math.sin(w) * 0.95))
        # Unterkante
        for i in range(12):
            u = 1 - i / 11
            pkt.append((14.8 + u * 8.2, -2.65 + 0.45 * u ** 2.2))
        pkt = glatte_kurve(pkt, 0.35, 3)
        if seite_y < 0:
            pkt = [(-y, z) for y, z in pkt][::-1]
        dicke = 2.55
        obj = profil_objekt("Anstoss", [pkt], dicke, fase=0.0)
        # Profil liegt in XY (x=y, y=z); in die richtige Lage drehen
        obj.rotation_euler = (math.pi / 2, 0, math.pi / 2)
        bpy.context.view_layer.update()
        obj = auswerten(obj)
        obj.location = (seite_x * 11.25 - dicke / 2, 0, 0)
        bpy.context.view_layer.update()
        return auswerten(obj)

    teile = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            a = anstoss(sx, sy)
            teile.append(a)
    for a in teile:
        mittel = bool_op(mittel, a, "UNION")
    schweissen(mittel)

    # Federstegbohrungen
    for sx in (-1, 1):
        for sy in (-1, 1):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.45, radius2=0.45, depth=1.6)
            loch = objekt_aus_bmesh("Loch", bm, glatt=False)
            loch.rotation_euler = (0, math.pi / 2, 0)
            loch.location = (sx * 12.1, sy * 21.6, -1.05)
            bpy.context.view_layer.update()
            mittel = bool_op(mittel, loch)

    # Kronentubus-Bohrung
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=1.25, radius2=1.25, depth=6)
    loch = objekt_aus_bmesh("Tubusloch", bm, glatt=False)
    loch.rotation_euler = (0, math.pi / 2, 0)
    loch.location = (18.2, 0, -0.35)
    bpy.context.view_layer.update()
    mittel = bool_op(mittel, loch)

    # polierte Fasen: Material 1 = poliert
    mittel.data.materials.append(material("Stahl_poliert"))
    mittel = fasen(mittel, 0.22, 3, 28, mat_index=1)
    mittel.name = "Gehaeuse"
    glaetten(mittel, 30)
    zylinder_uv(mittel)

    # Federstege (dunkler Stahl, sieht man zwischen den Anstoessen)
    stege = []
    for sy in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.62, radius2=0.62, depth=21.6)
        st = objekt_aus_bmesh("Steg", bm, "Stahl_poliert")
        st.rotation_euler = (0, math.pi / 2, 0)
        st.location = (0, sy * 21.6, -1.05)
        bpy.context.view_layer.update()
        stege.append(auswerten(st))
    return mittel, stege


def luenette():
    prof = [(16.35, Z_OBEN - 0.02), (18.95, Z_OBEN - 0.02)]
    for i in range(14):
        u = i / 13
        w = u * math.pi / 2
        prof.append((18.95 - 0.95 * (1 - math.cos(w)) * 1.0 - 0.0, Z_OBEN + 0.05 + 0.95 * math.sin(w)))
    prof += [(17.55, Z_OBEN + 1.02), (16.7, Z_OBEN + 0.92), (16.35, Z_OBEN + 0.62)]
    obj = drehkoerper("Luenette", prof, 256, "Stahl_poliert", 26)
    zylinder_uv(obj)
    return obj


def glas():
    # Gewoelbtes Saphirglas: oben Kugelkappe, unten flach
    r = 16.75
    z0 = Z_OBEN + 0.25
    h_rand = 0.95
    wolb = 0.75
    prof = [(0, z0), (r, z0), (r, z0 + h_rand)]
    for i in range(1, 25):
        u = i / 24
        rr = r * (1 - u)
        prof.append((rr, z0 + h_rand + wolb * (1 - (rr / r) ** 2)))
    obj = offenes_drehteil("Glas", prof, 160, "Saphir", 20)
    return obj


def krone():
    # Krone mit 22 Rillen, Achse X
    umriss = []
    n = 22
    for k in range(n):
        a = k * TAU / n
        for i in range(6):
            u = i / 6
            w = a + u * TAU / n
            rr = 3.1 - 0.28 * math.sin(u * math.pi) ** 2
            umriss.append((rr * math.cos(w), rr * math.sin(w)))
    kopf = profil_objekt("Krone_kopf", [umriss], 2.6, fase=0.18, aufloesung=2, mat="Stahl_poliert")
    deckel = drehkoerper("Krone_deckel", [(0, 2.6), (2.75, 2.6), (2.7, 2.78), (2.2, 2.98), (0, 3.06)], 64, "Stahl_poliert")
    hals = drehkoerper("Krone_hals", [(0, -1.4), (1.05, -1.4), (1.05, 0.05), (1.9, 0.05), (1.9, 0.2), (0, 0.2)], 48, "Stahl_poliert")
    obj = verbinden("Krone", [kopf, deckel, hals])
    obj.rotation_euler = (0, math.pi / 2, 0)
    obj.location = (19.55, 0, -0.35)
    bpy.context.view_layer.update()
    obj = auswerten(obj)
    drehpunkt(obj, (19.55, 0, -0.35))
    return obj


def boden():
    prof = [
        (12.55, Z_BODEN), (18.85, Z_BODEN), (19.0, Z_BODEN - 0.3), (18.8, Z_BODEN - 0.95),
        (18.25, Z_BODEN - 1.42), (17.4, Z_BODEN - 1.62), (13.6, Z_BODEN - 1.62), (13.0, Z_BODEN - 1.45), (12.55, Z_BODEN - 1.2),
    ]
    ring = drehkoerper("Boden_ring", prof, 256, "Stahl_gebuerstet", 26)
    # sechs Nuten fuer den Gehaeuseschluessel
    for k in range(6):
        a = k * TAU / 6 + TAU / 12
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        nut = objekt_aus_bmesh("Nut", bm, glatt=False)
        nut.scale = (2.4, 1.5, 1.2)
        nut.location = (18.55 * math.cos(a), 18.55 * math.sin(a), Z_BODEN - 1.55)
        nut.rotation_euler.z = a
        bpy.context.view_layer.update()
        ring = bool_op(ring, nut)
    ring.data.materials.append(material("Stahl_poliert"))
    ring = fasen(ring, 0.16, 2, 30, mat_index=1)
    planar_uv(ring, groesse=40)
    scheibe = drehkoerper("Boden_glas", [(0, Z_BODEN - 1.5), (12.7, Z_BODEN - 1.5), (12.7, Z_BODEN - 0.42), (0, Z_BODEN - 0.42)], 128, "Saphir", 20)
    return ring, scheibe


# ------------------------------------------------------------- Zifferblatt etc.

HS_MITTE = (0.0, -8.15)   # kleine Sekunde bei 6
HS_R = 4.75


def zifferblatt():
    blatt = drehkoerper("Zifferblatt", [(0, Z_BLATT), (R_BLATT, Z_BLATT), (R_BLATT, Z_BLATT + BLATT_DICKE - 0.06), (R_BLATT - 0.08, Z_BLATT + BLATT_DICKE), (0, Z_BLATT + BLATT_DICKE)], 192, "Zifferblatt", 40)
    # vertiefte kleine Sekunde
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=HS_R, radius2=HS_R, depth=0.3)
    senke = objekt_aus_bmesh("Senke", bm, glatt=False)
    senke.location = (HS_MITTE[0], HS_MITTE[1], Z_BLATT + BLATT_DICKE)
    bpy.context.view_layer.update()
    blatt = bool_op(blatt, senke)
    blatt.data.materials.append(material("Hilfsblatt"))
    # Flaechen in der Senke bekommen das Material der kleinen Sekunde
    for p in blatt.data.polygons:
        c = p.center
        if math.hypot(c.x - HS_MITTE[0], c.y - HS_MITTE[1]) < HS_R + 0.01 and c.z < Z_BLATT + BLATT_DICKE - 0.05:
            p.material_index = 1
    glaetten(blatt, 40)
    planar_uv(blatt, groesse=2 * R_BLATT)
    return blatt


def dach(name, laenge, breite, hoehe, spitz=0.0, mat="Index", fase_unten=0.06):
    """Facettierter Stab (Satteldach) entlang +Y, Unterseite z=0."""
    bm = bmesh.new()
    w = breite / 2
    s = spitz
    u = [bm.verts.new(p) for p in [(-w, 0, 0), (w, 0, 0), (w, laenge, 0), (-w, laenge, 0)]]
    o = [bm.verts.new(p) for p in [(-w, 0, fase_unten), (w, 0, fase_unten), (w, laenge, fase_unten), (-w, laenge, fase_unten)]]
    g = [bm.verts.new(p) for p in [(0, w * 0.6 + s, hoehe), (0, laenge - w * 0.6 - s, hoehe)]]
    bm.faces.new([u[3], u[2], u[1], u[0]])
    bm.faces.new([u[0], u[1], o[1], o[0]])
    bm.faces.new([u[1], u[2], o[2], o[1]])
    bm.faces.new([u[2], u[3], o[3], o[2]])
    bm.faces.new([u[3], u[0], o[0], o[3]])
    bm.faces.new([o[0], o[1], g[0]])
    bm.faces.new([o[1], o[2], g[1], g[0]])
    bm.faces.new([o[2], o[3], g[1]])
    bm.faces.new([o[3], o[0], g[0], g[1]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return objekt_aus_bmesh(name, bm, mat, True, 10)


def indizes():
    teile = []
    z = Z_BLATT + BLATT_DICKE
    for h in range(12):
        if h == 6:
            continue
        a = math.pi / 2 - h * TAU / 12
        breit = 1.05 if h % 3 == 0 else 0.82
        lang = 3.5 if h % 3 == 0 else 2.7
        offs = [-0.62, 0.62] if h == 0 else [0]
        for o in offs:
            stab = dach("Index", lang, breit, 0.42)
            stab.location = (0, 0, 0)
            # Stab zeigt nach +Y, um Radius verschieben und drehen
            stab.data.transform(Matrix.Translation((o, 14.55 - lang, z)))
            stab.rotation_euler.z = a - math.pi / 2
            bpy.context.view_layer.update()
            teile.append(auswerten(stab))
    obj = verbinden("Indizes", teile)
    return obj


def zeiger_umriss(art):
    if art == "stunde":
        # Lanzettzeiger (Glashuette), Laenge 10.8
        rechts = [(0.0, -1.55), (0.5, -1.42), (0.4, -0.85), (1.28, 0.0)]
        for i in range(1, 6):
            u = i / 6
            rechts.append((1.28 + 0.12 * math.sin(u * math.pi), u * 1.6))
        rechts += [(0.42, 2.0), (0.34, 6.4), (0.82, 7.4), (0.98, 8.35), (0.6, 9.4), (0.0, 10.85)]
    elif art == "minute":
        rechts = [(0.0, -2.15), (0.4, -1.98), (0.33, -0.85), (1.08, 0.0)]
        for i in range(1, 6):
            u = i / 6
            rechts.append((1.08 + 0.1 * math.sin(u * math.pi), u * 1.3))
        rechts += [(0.3, 1.7), (0.26, 11.6), (0.6, 12.6), (0.72, 13.4), (0.42, 14.3), (0.0, 15.3)]
    else:
        rechts = [(0.0, -1.35), (0.28, -1.2), (0.24, -0.5), (0.52, 0.0)]
        for i in range(1, 5):
            u = i / 5
            rechts.append((0.52 + 0.04 * math.sin(u * math.pi), u * 0.55))
        rechts += [(0.12, 0.85), (0.075, 4.35), (0.0, 4.55)]
    links = [(-x, y) for x, y in reversed(rechts[1:-1])]
    return rechts + links


def zeiger(name, art, z, dicke, nabe_r, loch_r):
    umriss = zeiger_umriss(art)
    teile = [umriss, kreis(loch_r, 24)[::-1]] if loch_r else [umriss]
    obj = profil_objekt(name, teile, dicke, fase=dicke * 0.38, aufloesung=1, mat="Blaustahl", z=z)
    rohr = drehkoerper(name + "_rohr", [(loch_r or 0.05, z - 0.25), (nabe_r, z - 0.25), (nabe_r, z + dicke), (loch_r or 0.0, z + dicke)], 32, "Blaustahl")
    obj = verbinden(name, [obj, rohr])
    planar_uv(obj, groesse=34)
    return obj


def zeigerwerk():
    z0 = Z_BLATT + BLATT_DICKE
    stunde = zeiger("Stundenzeiger", "stunde", z0 + 0.32, 0.16, 1.02, 0.48)
    minute = zeiger("Minutenzeiger", "minute", z0 + 0.66, 0.14, 0.78, 0.26)
    sek = zeiger("Sekundenzeiger", "sekunde", z0 - 0.3 + 0.2, 0.1, 0.42, 0.0)
    sek.location = (HS_MITTE[0], HS_MITTE[1], 0)
    bpy.context.view_layer.update()
    sek = auswerten(sek)
    drehpunkt(sek, (HS_MITTE[0], HS_MITTE[1], 0))
    # Zentrumskappe auf dem Minutenzeiger
    kappe = drehkoerper("Kappe", [(0, z0 + 0.8), (0.42, z0 + 0.8), (0.4, z0 + 0.92), (0.2, z0 + 1.0), (0, z0 + 1.02)], 32, "Blaustahl")
    minute = verbinden("Minutenzeiger", [minute, kappe])
    return stunde, minute, sek


# ------------------------------------------------------------------- Uhrwerk

# Positionen in Rueckansicht-Koordinaten waeren gespiegelt; hier alles in
# Zifferblatt-Koordinaten (x nach 3 Uhr), weil das Modell nicht gespiegelt wird.
P_MITTE = (0.0, 0.0)
P_DRITT = (-5.1, -1.6)
P_VIERT = HS_MITTE
P_ANKERRAD = (-4.25, -10.4)
P_ANKER = (-6.85, -9.15)
P_UNRUH = (-9.25, -6.0)
P_FEDERHAUS = (0.6, 6.4)
P_KRONRAD = (7.6, 5.0)

Z_PL_OBEN = 0.6           # Oberkante Grundplatine (unter dem Blatt)
Z_PL_UNTEN = -0.7
Z_DV_UNTEN = -2.15        # Dreiviertelplatine
Z_DV_OBEN = -2.85
Z_RAEDER = -1.55


def grundplatine():
    aussen = kreis(R_WERK, 220)
    teile = [aussen]
    obj = profil_objekt("Platine", teile, Z_PL_OBEN - Z_PL_UNTEN, fase=0.06, aufloesung=1, mat="Platine", z=Z_PL_UNTEN)
    # Senkungen fuer Unruh und Federhaus auf der Werkseite
    for mitte, r, tiefe in ((P_UNRUH, 4.95, 0.45), (P_FEDERHAUS, 5.6, 0.3)):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=r, radius2=r, depth=tiefe * 2)
        s = objekt_aus_bmesh("Senke", bm, glatt=False)
        s.location = (mitte[0], mitte[1], Z_PL_UNTEN)
        bpy.context.view_layer.update()
        obj = bool_op(obj, s)
    glaetten(obj, 30)
    planar_uv(obj)
    return obj


def dreiviertelplatine():
    # Kreis mit Ausschnitt fuer Unruh und Hemmung
    pkt = []
    n = 260
    for i in range(n):
        a = i / n * TAU
        pkt.append((R_WERK * math.cos(a), R_WERK * math.sin(a)))
    from mathutils.geometry import intersect_point_line  # noqa: F401

    def ausserhalb(p):
        return math.hypot(p[0] - P_UNRUH[0], p[1] - P_UNRUH[1]) > 5.35 and not (
            math.hypot(p[0] - P_ANKERRAD[0], p[1] - P_ANKERRAD[1]) < 3.1 or math.hypot(p[0] - P_ANKER[0], p[1] - P_ANKER[1]) < 2.4)

    # Polygon: Kreis aussen; Ausschnitt durch Bool
    obj = profil_objekt("Dreiviertelplatine", [pkt], Z_DV_UNTEN - Z_DV_OBEN, fase=0.12, aufloesung=2, mat="Neusilber", z=Z_DV_OBEN)
    # Ausschnitt: Unruh + Anker + Ankerrad als ein Umriss
    aus = []
    for p in kreis(5.45, 72, mitte=P_UNRUH):
        aus.append(p)
    ausschnitt = profil_objekt("Ausschnitt", [kreis(5.45, 96, mitte=P_UNRUH)], 3, z=Z_DV_OBEN - 1)
    obj = bool_op(obj, ausschnitt)
    hemm = glatte_kurve([(-2.0, -10.0), (-4.3, -7.6), (-7.4, -6.5), (-9.7, -9.2), (-7.8, -12.3), (-4.8, -13.2), (-2.2, -12.6)], 1.2, 5)
    a2 = profil_objekt("Ausschnitt2", [hemm], 3, z=Z_DV_OBEN - 1)
    obj = bool_op(obj, a2)
    # Rand der Ausschnitte poliert anfasen (Anglage)
    obj.data.materials.append(material("Stahl_poliert"))
    obj = fasen(obj, 0.14, 2, 40, mat_index=1)
    glaetten(obj, 35)
    planar_uv(obj)
    obj.name = "Dreiviertelplatine"
    teile = [obj]
    # Chatons
    z = Z_DV_OBEN - 0.26 + 0.0
    for nm, mitte, r in (("Ch_mitte", P_MITTE, 1.15), ("Ch_dritt", P_DRITT, 1.05), ("Ch_viert", P_VIERT, 1.05)):
        c = chaton(nm, r, mitte, Z_DV_OBEN + 0.02)
        teile.append(c)
    # gebläute Platinenschrauben am Rand
    for a in (math.radians(20), math.radians(118), math.radians(165), math.radians(300)):
        s = schraube("Pl_schraube", 0.86, 0.46, "Blaustahl")
        s.rotation_euler = (math.pi, 0, a * 3)
        s.location = (13.6 * math.cos(a), 13.6 * math.sin(a), Z_DV_OBEN)
        bpy.context.view_layer.update()
        teile.append(auswerten(s))
    plat = verbinden("Dreiviertelplatine", teile)
    return plat


def raederwerk():
    teile = {}
    # Federhaus (unter dem Sperrrad) mit Verzahnung
    fh, _ = zahnrad_umriss(84, 5.25)
    federhaus = profil_objekt("Federhaus", [fh], 1.6, fase=0.03, mat="Rad", z=-1.95)
    deckel = drehkoerper("Fh_deckel", [(0, -0.36), (4.75, -0.36), (4.75, -0.25), (0, -0.25)], 96, "Rad")
    federhaus = verbinden("Federhaus", [federhaus, deckel])
    federhaus.location = P_FEDERHAUS + (0,)
    bpy.context.view_layer.update()
    federhaus = auswerten(federhaus)
    drehpunkt(federhaus, (P_FEDERHAUS[0], P_FEDERHAUS[1], 0))
    teile["Federhaus"] = federhaus

    for name, z, r, mitte, schenkel, trieb, zp in (
        ("Rad_mitte", 80, 4.9, P_MITTE, 5, (12, 0.62, 0.55), -1.45),
        ("Rad_dritt", 75, 3.95, P_DRITT, 5, (10, 0.5, 0.5), -1.05),
        ("Rad_viert", 70, 3.55, P_VIERT, 4, (10, 0.48, 0.5), -1.75),
    ):
        o = rad(name, z, r, 0.2, "Rad", schenkel, zp, trieb=trieb)
        o.location = (mitte[0], mitte[1], 0)
        bpy.context.view_layer.update()
        o = auswerten(o)
        drehpunkt(o, (mitte[0], mitte[1], 0))
        teile[name] = o

    # Ankerrad (Stahl, Kolbenzaehne)
    au = ankerrad_umriss(15, 2.05)
    lo = schenkel_loecher(1.05, 0.38, 4, 0.18)
    ankerrad = profil_objekt("Ankerrad", [au] + lo, 0.16, fase=0.02, mat="Stahl_poliert", z=-2.0)
    welle = drehkoerper("Ar_welle", [(0, -2.9), (0.13, -2.9), (0.13, -2.6), (0.24, -2.5), (0.24, -0.4), (0.13, -0.3), (0.13, 0.4), (0, 0.4)], 20, "Stahl_poliert")
    tu, _ = zahnrad_umriss(7, 0.36, "trieb", 3)
    trieb = profil_objekt("Ar_trieb", [tu], 0.5, mat="Stahl_poliert", z=-1.45)
    ankerrad = verbinden("Ankerrad", [ankerrad, welle, trieb])
    ankerrad.location = (P_ANKERRAD[0], P_ANKERRAD[1], 0)
    bpy.context.view_layer.update()
    ankerrad = auswerten(ankerrad)
    drehpunkt(ankerrad, (P_ANKERRAD[0], P_ANKERRAD[1], 0))
    teile["Ankerrad"] = ankerrad
    return teile


def anker():
    # Anker zwischen Ankerrad und Unruh, lokale Koordinaten mit Drehpunkt (0,0)
    zu_ar = Vector((P_ANKERRAD[0] - P_ANKER[0], P_ANKERRAD[1] - P_ANKER[1]))
    zu_un = Vector((P_UNRUH[0] - P_ANKER[0], P_UNRUH[1] - P_ANKER[1]))
    rich_ar = zu_ar.normalized()
    rich_un = zu_un.normalized()
    quer = Vector((-rich_ar.y, rich_ar.x))
    gabel_ende = rich_un * (zu_un.length - 2.25)
    # Ankerkoerper: Querbalken mit zwei Armen zum Rad, Stiel zur Unruh
    arm_l = rich_ar * 1.25 + quer * 1.25
    arm_r = rich_ar * 1.25 - quer * 1.25
    stiel_q = Vector((-rich_un.y, rich_un.x))
    pkt = [
        tuple(arm_l + quer * 0.25), tuple(arm_l - rich_ar * 0.35),
        tuple(-stiel_q * 0.3 + rich_un * 0.3), tuple(gabel_ende - stiel_q * 0.22),
        tuple(gabel_ende - stiel_q * 0.42 + rich_un * 0.55), tuple(gabel_ende - stiel_q * 0.12 + rich_un * 0.45),
        tuple(gabel_ende + rich_un * 0.18), tuple(gabel_ende + stiel_q * 0.12 + rich_un * 0.45),
        tuple(gabel_ende + stiel_q * 0.42 + rich_un * 0.55), tuple(gabel_ende + stiel_q * 0.22),
        tuple(stiel_q * 0.3 + rich_un * 0.3), tuple(arm_r - rich_ar * 0.35), tuple(arm_r - quer * 0.25),
        tuple(arm_r + rich_ar * 0.25), tuple(rich_ar * 0.5), tuple(arm_l + rich_ar * 0.25),
    ]
    pkt = glatte_kurve([(p[0], p[1]) for p in pkt], 0.12, 2)
    koerper = profil_objekt("Anker", [pkt, kreis(0.16, 16)[::-1]], 0.16, fase=0.02, mat="Stahl_poliert", z=-2.02)
    teile = [koerper]
    for seite in (1, -1):
        p = rich_ar * 1.55 + quer * 1.2 * seite
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        st = objekt_aus_bmesh("Palette", bm, "Rubin")
        st.scale = (0.24, 0.62, 0.22)
        st.rotation_euler.z = math.atan2(rich_ar.y, rich_ar.x) + seite * 0.35
        st.location = (p.x, p.y, -1.94)
        bpy.context.view_layer.update()
        teile.append(auswerten(st))
    welle = drehkoerper("Anker_welle", [(0, -2.9), (0.12, -2.9), (0.12, -2.5), (0.2, -2.4), (0.2, -0.4), (0.12, -0.3), (0.12, 0.4), (0, 0.4)], 20, "Stahl_poliert")
    teile.append(welle)
    obj = verbinden("Anker", teile)
    obj.location = (P_ANKER[0], P_ANKER[1], 0)
    bpy.context.view_layer.update()
    return obj


def unruh():
    z = -2.75
    r_a, r_i = 4.25, 3.78
    kranz = profil_objekt("Unruh", [kreis(r_a, 160), kreis(r_i, 160)[::-1]], 0.52, fase=0.05, aufloesung=1, mat="Unruh", z=z)
    teile = [kranz]
    # drei Schenkel
    for k in range(3):
        a = k * TAU / 3 + 0.4
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        sch = objekt_aus_bmesh("Schenkel", bm, "Unruh")
        sch.scale = (r_i * 1.0 + 0.1, 0.4, 0.24)
        sch.location = ((r_i / 2) * math.cos(a), (r_i / 2) * math.sin(a), z + 0.38)
        sch.rotation_euler.z = a
        bpy.context.view_layer.update()
        sch = auswerten(sch)
        sch = fasen(sch, 0.04, 1, 30)
        teile.append(sch)
    nabe = drehkoerper("Nabe", [(0, z + 0.1), (0.7, z + 0.1), (0.7, z + 0.55), (0, z + 0.55)], 32, "Unruh")
    teile.append(nabe)
    # 18 Regulierschrauben am Kranz
    for k in range(18):
        a = k * TAU / 18
        s = schraube("Regulier", 0.24, 0.3, "Gold", schlitz=True, segmente=20)
        s.rotation_euler = (0, math.pi / 2, a)
        s.location = (r_a * math.cos(a), r_a * math.sin(a), z + 0.26)
        bpy.context.view_layer.update()
        teile.append(auswerten(s))
    welle = drehkoerper("Unruhwelle", [(0, -3.65), (0.1, -3.65), (0.1, -3.3), (0.22, -3.2), (0.22, -1.3), (0.4, -1.25), (0.4, -1.05), (0.1, -0.95), (0.1, 0.2), (0, 0.2)], 24, "Stahl_poliert")
    teile.append(welle)
    # Hebelscheibe mit Hebelstein
    hs = drehkoerper("Hebelscheibe", [(0, -1.35), (0.85, -1.35), (0.85, -1.2), (0, -1.2)], 32, "Stahl_poliert")
    teile.append(hs)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.11, radius2=0.11, depth=0.45)
    ell = objekt_aus_bmesh("Hebelstein", bm, "Rubin")
    rich = Vector((P_ANKER[0] - P_UNRUH[0], P_ANKER[1] - P_UNRUH[1])).normalized()
    ell.location = (rich.x * 0.62, rich.y * 0.62, -1.48)
    bpy.context.view_layer.update()
    teile.append(auswerten(ell))
    obj = verbinden("Unruh", teile)
    obj.location = (P_UNRUH[0], P_UNRUH[1], 0)
    bpy.context.view_layer.update()
    obj = auswerten(obj)
    drehpunkt(obj, (P_UNRUH[0], P_UNRUH[1], 0))
    return obj


def spirale():
    """Flache Spirale mit Endkurve, als duenner Draht."""
    windungen = 12.5
    r0, r1 = 0.85, 3.05
    pkt = []
    n = int(windungen * 72)
    for i in range(n + 1):
        u = i / n
        a = u * windungen * TAU
        r = r0 + (r1 - r0) * u
        pkt.append((r * math.cos(a), r * math.sin(a), -2.05))
    cu = bpy.data.curves.new("Spirale", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.028
    cu.bevel_resolution = 1
    sp = cu.splines.new("POLY")
    sp.points.add(len(pkt) - 1)
    for i, p in enumerate(pkt):
        sp.points[i].co = (*p, 1)
    obj = bpy.data.objects.new("Spirale", cu)
    verlinken(obj)
    cu.materials.append(material("Spirale"))
    obj = auswerten(obj, "Spirale")
    obj.data.transform(Matrix.Scale(1.0, 4))
    glaetten(obj, 60)
    obj.location = (P_UNRUH[0], P_UNRUH[1], 0)
    bpy.context.view_layer.update()
    obj = auswerten(obj)
    drehpunkt(obj, (P_UNRUH[0], P_UNRUH[1], 0))
    return obj


def unruhkloben():
    # Fuss am Platinenrand, Arm ueber die Unruh, runde Kappe ueber der Welle
    fuss_mitte = Vector((-13.0, -10.6))
    un = Vector(P_UNRUH)
    rich = (un - fuss_mitte).normalized()
    q = Vector((-rich.y, rich.x))
    pkt = []
    # Fuss (breit, rund)
    for p in bogen(2.2, math.atan2(-rich.y, -rich.x) - 1.5, math.atan2(-rich.y, -rich.x) + 1.5, 14, tuple(fuss_mitte)):
        pkt.append(p)
    # Arm zur Kappe (verjuengt), linke Seite
    pkt.append(tuple(un - rich * 2.0 + q * 1.2))
    for p in bogen(1.85, math.atan2(q.y, q.x), math.atan2(q.y, q.x) - math.pi, 24, tuple(un)):
        pkt.append(p)
    pkt.append(tuple(un - rich * 2.0 - q * 1.2))
    pkt = pkt[::-1]
    pkt = glatte_kurve(pkt, 0.6, 4)
    z0 = -3.55
    kl = profil_objekt("Unruhkloben", [pkt], 0.55, fase=0.13, aufloesung=2, mat="Kloben", z=z0)
    planar_uv(kl)
    # Stossicherung / Deckstein
    cap = chaton("Ch_unruh", 1.05, tuple(un), z0 + 0.02)
    # Schwanenhals-Feinregulierung: geschwungene Feder + Schraube
    sh = []
    for i in range(40):
        u = i / 39
        a = math.atan2(-rich.y, -rich.x) + 0.9 - u * 2.3
        r = 1.15 + 1.6 * u
        sh.append((un.x + r * math.cos(a) + q.x * 0.0, un.y + r * math.sin(a)))
    feder_innen = [(x + (un.x - x) * 0.06, y + (un.y - y) * 0.06) for x, y in sh]
    hals = profil_objekt("Schwanenhals", [sh + feder_innen[::-1]], 0.16, fase=0.03, mat="Stahl_poliert", z=z0 - 0.17)
    rs = schraube("Reg_schraube", 0.42, 0.32, "Blaustahl")
    ende = sh[-1]
    rs.rotation_euler = (math.pi, 0, 0.7)
    rs.location = (ende[0], ende[1], z0 - 0.17)
    bpy.context.view_layer.update()
    rs = auswerten(rs)
    zeiger_reg = profil_objekt("Reg_zeiger", [glatte_kurve([(un.x - 0.2, un.y), (un.x + rich.x * 3.0 - q.x * 0.1, un.y + rich.y * 3.0 - q.y * 0.1), (un.x + rich.x * 3.3, un.y + rich.y * 3.3), (un.x + rich.x * 3.0 + q.x * 0.1, un.y + rich.y * 3.0 + q.y * 0.1), (un.x + 0.2, un.y)], 0.05, 2)], 0.1, mat="Stahl_poliert", z=z0 - 0.1)
    fs = schraube("Kl_schraube", 0.8, 0.38, "Blaustahl")
    fs.rotation_euler = (math.pi, 0, 1.1)
    fs.location = (fuss_mitte.x, fuss_mitte.y, z0)
    bpy.context.view_layer.update()
    fs = auswerten(fs)
    obj = verbinden("Unruhkloben", [kl, cap, hals, rs, zeiger_reg, fs])
    return obj


def ankerkloben():
    # schlanker Kloben fuer Ankerrad und Anker, damit die Hemmung sichtbar bleibt
    a, b = Vector(P_ANKERRAD), Vector(P_ANKER)
    fuss = Vector((-1.2, -13.1))
    pfad = [tuple(fuss), tuple(fuss + (a - fuss) * 0.55 + Vector((0.25, -0.35))), tuple(a), tuple(a + (b - a) * 0.5 + Vector((0.1, -0.35))), tuple(b)]
    um = glatte_kurve(band_umriss(pfad, 0.62, 8), 0.2, 3)
    z0 = -3.05
    kl = profil_objekt("Ankerkloben", [um], 0.38, fase=0.1, aufloesung=2, mat="Neusilber", z=z0)
    # Augen um die Lager
    for p, r in ((a, 1.0), (b, 0.9), (fuss, 1.15)):
        auge = profil_objekt("Auge", [kreis(r, 48, mitte=tuple(p))], 0.38, fase=0.1, aufloesung=2, z=z0)
        kl = bool_op(kl, auge, "UNION")
    kl.data.materials.clear()
    kl.data.materials.append(material("Neusilber"))
    kl.data.materials.append(material("Stahl_poliert"))
    kl = fasen(kl, 0.08, 2, 40, mat_index=1)
    planar_uv(kl)
    teile = [kl]
    for p, r in ((a, 0.58), (b, 0.52)):
        teile.append(chaton("Ch_hemm", r, tuple(p), z0 + 0.02))
    s = schraube("Ak_schraube", 0.7, 0.4, "Blaustahl")
    s.rotation_euler = (math.pi, 0, 2.0)
    s.location = (fuss.x, fuss.y, z0)
    bpy.context.view_layer.update()
    teile.append(auswerten(s))
    return verbinden("Ankerkloben", teile)


def aufzug():
    # Sperrrad mit Sonnenschliff und Kronrad auf der Dreiviertelplatine
    z = Z_DV_OBEN - 0.42
    sr = profil_objekt("Sperrrad", [sperrrad_umriss(72, 5.15)], 0.42, fase=0.04, mat="Stahl_gebuerstet", z=z)
    s = schraube("Sr_schraube", 1.25, 0.5, "Stahl_poliert")
    s.rotation_euler = (math.pi, 0, 0.3)
    s.location = (0, 0, z)
    bpy.context.view_layer.update()
    sr = verbinden("Sperrrad", [sr, auswerten(s)])
    sr.location = (P_FEDERHAUS[0], P_FEDERHAUS[1], 0)
    bpy.context.view_layer.update()
    sr = auswerten(sr)
    drehpunkt(sr, (P_FEDERHAUS[0], P_FEDERHAUS[1], 0))
    planar_uv(sr)

    ku, _ = zahnrad_umriss(40, 2.45, "rad", 3)
    kr = profil_objekt("Kronrad", [ku], 0.38, fase=0.03, mat="Stahl_gebuerstet", z=z)
    s2 = schraube("Kr_schraube", 0.72, 0.4, "Stahl_poliert")
    s2.rotation_euler = (math.pi, 0, 1.0)
    s2.location = (0, 0, z)
    bpy.context.view_layer.update()
    kr = verbinden("Kronrad", [kr, auswerten(s2)])
    kr.location = (P_KRONRAD[0], P_KRONRAD[1], 0)
    bpy.context.view_layer.update()
    kr = auswerten(kr)
    drehpunkt(kr, (P_KRONRAD[0], P_KRONRAD[1], 0))
    planar_uv(kr)

    # Sperrklinke mit Feder
    kl = glatte_kurve([(4.6, 10.6), (5.6, 11.6), (7.2, 11.1), (7.5, 10.6), (6.4, 10.4), (5.4, 10.1)], 0.3, 3)
    klinke = profil_objekt("Klinke", [kl], 0.3, fase=0.04, mat="Stahl_poliert", z=z + 0.06)
    return sr, kr, klinke


# --------------------------------------------------------------------- Band

def band():
    """Lederband mit Naht und Dornschliesse, folgt einer Handgelenkskurve."""
    teile = {}

    def bahn(seite, laenge, punkte=60):
        # Mittellinie in (y, z): erst gerade weg vom Anstoss, dann nach unten gebogen
        out = []
        for i in range(punkte + 1):
            u = i / punkte
            s = u * laenge
            # Kreisbogen ums Handgelenk, Radius 28 mm
            R = 27.0
            w = s / R
            y = 21.6 + R * math.sin(w)
            z = -1.05 - R * (1 - math.cos(w))
            out.append((y * seite, z, w))
        return out

    def streifen(name, seite, laenge, breite0, breite1, dicke, spitze=False):
        bm = bmesh.new()
        pfad = bahn(seite, laenge, 70)
        m = 14
        ringe = []
        for i, (y, z, w) in enumerate(pfad):
            u = i / (len(pfad) - 1)
            b = breite0 + (breite1 - breite0) * u
            if spitze and u > 0.92:
                k = (u - 0.92) / 0.08
                b *= math.sqrt(max(1 - k * k, 0.02))
            n = Vector((0, -math.sin(w) * seite, -math.cos(w)))  # nach innen (Handgelenk)
            mitte = Vector((0, y, z))
            quer = []
            for j in range(m):
                v = j / (m - 1)
                quer.append((-b / 2 + b * v, dicke / 2 + 0.25 * math.sin(v * math.pi) ** 0.6, v))
            for j in range(m):
                v = 1 - j / (m - 1)
                quer.append((-b / 2 + b * v, -dicke / 2, v))
            ringe.append(([bm.verts.new(mitte + Vector((x, 0, 0)) - n * h) for x, h, _ in quer], [q[2] for q in quer], u * laenge))
        flaechen = []
        for (a, va, sa), (b2, vb, sb) in zip(ringe, ringe[1:]):
            k = len(a)
            for j in range(k):
                f = bm.faces.new((a[j], a[(j + 1) % k], b2[(j + 1) % k], b2[j]))
                seite_f = j == m - 1 or j == 2 * m - 1
                flaechen.append((f, [va[j], va[(j + 1) % k], vb[(j + 1) % k], vb[j]], [sa, sa, sb, sb], seite_f))
        bm.faces.new(ringe[0][0][::-1])
        bm.faces.new(ringe[-1][0])
        uv = bm.loops.layers.uv.new("UVMap")
        for f, vs, ss, seite_f in flaechen:
            for loop, v, sl in zip(f.loops, vs, ss):
                uu = (0.985 if v > 0.5 else 0.015) if seite_f else 0.035 + v * 0.93
                loop[uv].uv = (uu, sl / 22.0)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        obj = objekt_aus_bmesh(name, bm, "Leder", True, 50)
        return obj, pfad

    oben, pfad_o = streifen("Band_oben", 1, 56, 19.6, 16.6, 3.1)
    unten, pfad_u = streifen("Band_unten", -1, 72, 19.6, 16.2, 3.1, spitze=True)
    teile["Band_oben"] = oben
    teile["Band_unten"] = unten
    return teile


# --------------------------------------------------------------------- Bauen

def bauen():
    leeren()
    alles = {}
    geh, stege = gehaeuse()
    alles["Gehaeuse"] = verbinden("Gehaeuse", [geh] + stege)
    alles["Luenette"] = luenette()
    alles["Glas"] = glas()
    alles["Krone"] = krone()
    ring, scheibe = boden()
    alles["Boden"] = verbinden("Boden", [ring, scheibe])
    alles["Zifferblatt"] = zifferblatt()
    alles["Indizes"] = indizes()
    st, mi, se = zeigerwerk()
    alles["Stundenzeiger"], alles["Minutenzeiger"], alles["Sekundenzeiger"] = st, mi, se
    alles["Platine"] = grundplatine()
    alles["Dreiviertelplatine"] = dreiviertelplatine()
    alles.update(raederwerk())
    a = anker()
    a = auswerten(a)
    drehpunkt(a, (P_ANKER[0], P_ANKER[1], 0))
    alles["Anker"] = a
    alles["Unruh"] = unruh()
    alles["Spirale"] = spirale()
    alles["Unruhkloben"] = unruhkloben()
    alles["Ankerkloben"] = ankerkloben()
    sr, kr, kl = aufzug()
    alles["Sperrrad"], alles["Kronrad"] = sr, kr
    alles["Dreiviertelplatine"] = verbinden("Dreiviertelplatine", [alles["Dreiviertelplatine"], kl])
    if "--ohne-band" not in sys.argv:
        alles.update(band())

    # Aufraeumen: nur die benannten Teile bleiben
    behalten = set(id(o) for o in alles.values())
    for o in list(bpy.data.objects):
        if id(o) not in behalten and o.name not in alles:
            bpy.data.objects.remove(o, do_unlink=True)
    for name, o in alles.items():
        o.name = name
        o.data.name = name
        if not o.data.uv_layers:
            planar_uv(o)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"Teile: {len(alles)}, Dreiecke: {tris}")
    for name, o in sorted(alles.items()):
        print(f"  {name:20s} {sum(len(p.vertices) - 2 for p in o.data.polygons):7d}  {[m.name if m else None for m in o.data.materials]}")

    os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=ZIEL, export_format="GLB", export_yup=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_extras=True, export_cameras=False, export_lights=False,
        export_animations=False, export_image_format="NONE",
    )
    print("geschrieben:", ZIEL, os.path.getsize(ZIEL))


if __name__ == "__main__":
    bauen()
