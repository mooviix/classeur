#!/usr/bin/env python3
"""Banc d'essai scanner - etape 2 : simulation de photos de telephone.

Usage : python -I 02_simulate.py DATA_DIR [niveaux] [nb_process]
  niveaux = liste separee par des virgules parmi facile,moyen,difficile (defaut : les 3)
Sortie : DATA_DIR/photos/<niveau>/<cardId>.jpg + DATA_DIR/photos/<niveau>/gt.json
Chaque photo : carte (image TCGdex FR "high") posee sur un fond procedural, projetee
en 3D (inclinaison, rotation, decalage/echelle autour d'un gabarit a l'ecran), puis
eclairage, reflet, ombre, pouce, flou, bruit, perte de resolution, compression JPEG.
"""
import json, os, sys, math
from multiprocessing import Pool
import numpy as np
import cv2
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from benchlib import FRAME_W, FRAME_H, GUIDE, GUIDE_W, GUIDE_H, load_manifest  # noqa

W, H = FRAME_W, FRAME_H
FOCAL = 816.0  # ~ 67 deg de champ horizontal (camera principale de telephone)

LEVELS = {
    "facile": dict(tilt=5, roll=3, off=0.02, scale=(0.95, 1.02), blur=(0.0, 0.7), motion_p=0.0,
                   motion_len=(0, 0), res=(0.85, 1.0), noise=(1, 3), jpeg=(85, 95), gain=(0.9, 1.1),
                   contrast=(0.95, 1.05), gamma=(0.95, 1.05), cast=0.03, sat=(0.92, 1.02),
                   glare_p=0.2, glare_size=(0.04, 0.08), glare_int=(0.3, 0.5), shadow_p=0.0,
                   thumb_p=0.0, grad=0.05, vignette=0.1, bgs=("uni", "bois", "tissu")),
    "moyen": dict(tilt=10, roll=6, off=0.04, scale=(0.90, 1.05), blur=(0.4, 1.3), motion_p=0.3,
                  motion_len=(3, 6), res=(0.6, 0.9), noise=(2, 6), jpeg=(65, 85), gain=(0.7, 1.2),
                  contrast=(0.8, 1.1), gamma=(0.85, 1.2), cast=0.08, sat=(0.8, 1.05),
                  glare_p=0.6, glare_size=(0.06, 0.15), glare_int=(0.4, 0.8), shadow_p=0.25,
                  thumb_p=0.05, grad=0.15, vignette=0.25,
                  bgs=("uni", "bois", "tissu", "papier", "encombre")),
    "difficile": dict(tilt=15, roll=10, off=0.06, scale=(0.85, 1.07), blur=(0.8, 2.0), motion_p=0.5,
                      motion_len=(5, 10), res=(0.45, 0.75), noise=(4, 10), jpeg=(45, 70),
                      gain=(0.55, 1.3), contrast=(0.7, 1.15), gamma=(0.8, 1.3), cast=0.12,
                      sat=(0.7, 1.05), glare_p=1.0, glare_size=(0.10, 0.25), glare_int=(0.6, 1.0),
                      shadow_p=0.5, thumb_p=0.2, grad=0.25, vignette=0.35,
                      bgs=("uni", "bois", "tissu", "papier", "encombre", "encombre")),
}


def smooth_noise(rng, h, w, scale):
    gh, gw = max(2, h // scale), max(2, w // scale)
    g = rng.random((gh + 1, gw + 1)).astype(np.float32)
    return cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)


def make_background(rng, kind, others):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if kind == "bois":
        base = np.array([[120, 80, 50], [160, 110, 70], [90, 60, 40], [190, 150, 110], [60, 42, 30]][rng.integers(5)], np.float32)
        base += rng.normal(0, 10, 3)
        a = rng.uniform(-0.25, 0.25) + (math.pi / 2 if rng.random() < 0.5 else 0)
        distort = smooth_noise(rng, H, W, 180) * 60 + smooth_noise(rng, H, W, 30) * 8
        t = xx * math.cos(a) + yy * math.sin(a)
        grain = 0.5 + 0.5 * np.sin(rng.uniform(0.04, 0.12) * t + distort)
        mod = 0.78 + 0.22 * grain + 0.06 * (smooth_noise(rng, H, W, 6) - 0.5)
        img = base[None, None, :] * mod[..., None]
    elif kind == "tissu":
        base = rng.uniform(20, 200, 3).astype(np.float32)
        tex = 0.5 * smooth_noise(rng, H, W, 120) + 0.3 * smooth_noise(rng, H, W, 25) + 0.2 * smooth_noise(rng, H, W, 4)
        img = base[None, None, :] * (0.7 + 0.6 * tex[..., None])
        if rng.random() < 0.5:  # tapis de jeu imprime : grosses taches de couleur
            blob = smooth_noise(rng, H, W, 250)
            col = rng.uniform(0, 255, 3).astype(np.float32)
            m = np.clip((blob - 0.55) * 6, 0, 1)[..., None]
            img = img * (1 - m) + col * m
    elif kind == "papier":
        base = rng.uniform(205, 245) * np.ones(3, np.float32) + rng.normal(0, 4, 3)
        img = base[None, None, :] * (0.97 + 0.06 * smooth_noise(rng, H, W, 60)[..., None])
    else:  # uni ou encombre
        palette = [[235, 235, 230], [180, 180, 180], [90, 90, 95], [25, 25, 28], [30, 45, 90], [35, 90, 50], [120, 30, 30]]
        base = np.array(palette[rng.integers(len(palette))], np.float32) + rng.normal(0, 8, 3)
        img = base[None, None, :] * (0.92 + 0.16 * smooth_noise(rng, H, W, 300)[..., None])
    img = np.clip(img, 0, 255).astype(np.uint8)
    if kind == "encombre":
        gx0, gy0, gx1, gy1 = GUIDE
        for _ in range(rng.integers(6, 14)):  # objets : rectangles, ellipses, traits
            col = tuple(int(v) for v in rng.uniform(0, 255, 3))
            cx, cy = int(rng.uniform(0, W)), int(rng.uniform(0, H))
            if gx0 < cx < gx1 and gy0 < cy < gy1:
                continue
            r = rng.random()
            if r < 0.4:
                box = ((cx, cy), (rng.uniform(60, 400), rng.uniform(60, 400)), rng.uniform(0, 180))
                cv2.fillPoly(img, [cv2.boxPoints(box).astype(np.int32)], col)
            elif r < 0.7:
                cv2.ellipse(img, (cx, cy), (int(rng.uniform(30, 200)), int(rng.uniform(30, 200))), rng.uniform(0, 180), 0, 360, col, -1)
            else:
                cv2.line(img, (cx, cy), (int(rng.uniform(0, W)), int(rng.uniform(0, H))), col, int(rng.uniform(2, 12)))
        for o in others[: rng.integers(1, 4)]:  # d'autres cartes autour (hors gabarit)
            ow = int(GUIDE_W * rng.uniform(0.8, 1.0)); oh = int(ow * 825 / 600)
            oc = cv2.resize(o, (ow, oh), interpolation=cv2.INTER_AREA)
            side = rng.integers(4)
            if side == 0:
                cx, cy = gx0 - ow * rng.uniform(0.25, 0.6), rng.uniform(0, H)
            elif side == 1:
                cx, cy = gx1 + ow * rng.uniform(0.25, 0.6), rng.uniform(0, H)
            elif side == 2:
                cx, cy = rng.uniform(0, W), gy0 - oh * rng.uniform(0.3, 0.6)
            else:
                cx, cy = rng.uniform(0, W), gy1 + oh * rng.uniform(0.3, 0.6)
            M = cv2.getRotationMatrix2D((ow / 2, oh / 2), rng.uniform(-25, 25), 1.0)
            M[:, 2] += (cx - ow / 2, cy - oh / 2)
            warped = cv2.warpAffine(oc, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
            a = warped[:, :, 3:4].astype(np.float32) / 255
            img = (img * (1 - a) + warped[:, :, :3] * a).astype(np.uint8)
    return img


def project_card(rng, p):
    """Coins de la carte dans l'image (TL, TR, BR, BL) apres rotation 3D + projection."""
    s = rng.uniform(*p["scale"])
    w, h = GUIDE_W * s, GUIDE_H * s
    tx, ty, rz = [math.radians(rng.uniform(-p[k], p[k])) for k in ("tilt", "tilt", "roll")]
    Rx = np.array([[1, 0, 0], [0, math.cos(tx), -math.sin(tx)], [0, math.sin(tx), math.cos(tx)]])
    Ry = np.array([[math.cos(ty), 0, math.sin(ty)], [0, 1, 0], [-math.sin(ty), 0, math.cos(ty)]])
    Rz = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
    R = Rz @ Ry @ Rx
    pts = np.array([[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0]])
    P = pts @ R.T + np.array([0, 0, FOCAL])
    cx = W / 2 + rng.uniform(-p["off"], p["off"]) * GUIDE_W
    cy = H / 2 + rng.uniform(-p["off"], p["off"]) * GUIDE_H
    uv = np.stack([FOCAL * P[:, 0] / P[:, 2] + cx, FOCAL * P[:, 1] / P[:, 2] + cy], 1)
    return uv.astype(np.float32), dict(scale=s, tilt_x=math.degrees(tx), tilt_y=math.degrees(ty), roll=math.degrees(rz))


def add_glare(img, rng, quad, size, inten):
    wts = rng.dirichlet([1.5] * 4)
    c = wts @ quad
    cw = np.linalg.norm(quad[1] - quad[0])
    a = size * cw * rng.uniform(0.7, 1.4)
    b = a * rng.uniform(0.25, 1.0)
    th = rng.uniform(0, math.pi)
    r = int(a * 2.5) + 2
    x0, y0 = max(0, int(c[0]) - r), max(0, int(c[1]) - r)
    x1, y1 = min(W, int(c[0]) + r), min(H, int(c[1]) + r)
    if x1 <= x0 or y1 <= y0:
        return img
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx, dy = xx - c[0], yy - c[1]
    u = (dx * math.cos(th) + dy * math.sin(th)) / a
    v = (-dx * math.sin(th) + dy * math.cos(th)) / b
    m = np.clip(1.6 * np.exp(-1.2 * (u * u + v * v)), 0, 1) * inten
    tint = np.array([255, 252, 245], np.float32)
    sub = img[y0:y1, x0:x1]
    img[y0:y1, x0:x1] = sub + (tint - sub) * m[..., None]
    return img


def add_thumb(img, rng, quad):
    e = rng.integers(4)
    t = rng.uniform(0.2, 0.8)
    pa, pb = quad[e], quad[(e + 1) % 4]
    c = pa + (pb - pa) * t
    cw = np.linalg.norm(quad[1] - quad[0])
    ang = math.degrees(math.atan2(pb[1] - pa[1], pb[0] - pa[0])) + 90
    skin = np.array([rng.uniform(170, 235), rng.uniform(120, 180), rng.uniform(95, 150)], np.float32)
    mask = np.zeros((H, W), np.uint8)
    cv2.ellipse(mask, (int(c[0]), int(c[1])), (int(cw * rng.uniform(0.12, 0.2)), int(cw * rng.uniform(0.07, 0.1))), ang, 0, 360, 255, -1)
    m = cv2.GaussianBlur(mask, (0, 0), 3).astype(np.float32)[..., None] / 255
    shade = 0.85 + 0.3 * smooth_noise(rng, H, W, 80)[..., None]
    return img * (1 - m) + skin * shade * m


def simulate(args):
    data_dir, level, item, others_paths, seed = args
    p = LEVELS[level]
    rng = np.random.default_rng(seed)
    card = np.asarray(Image.open(os.path.join(data_dir, item["fr_high"])).convert("RGBA")).astype(np.float32)
    ch, cw = card.shape[:2]
    # rendu imprime : saturation un peu plus faible que l'image numerique
    rgb = card[:, :, :3]
    gray = rgb.mean(2, keepdims=True)
    rgb = gray + (rgb - gray) * rng.uniform(*p["sat"])
    card[:, :, :3] = np.clip(rgb, 0, 255)
    others = []
    for op in others_paths:
        o = np.asarray(Image.open(os.path.join(data_dir, op)).convert("RGBA"))
        others.append(o)
    bgk = p["bgs"][rng.integers(len(p["bgs"]))]
    bg = make_background(rng, bgk, others).astype(np.float32)
    quad, geo = project_card(rng, p)
    src = np.float32([[0, 0], [cw, 0], [cw, ch], [0, ch]])
    Hm = cv2.getPerspectiveTransform(src, quad)
    warped = cv2.warpPerspective(card, Hm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    alpha = warped[:, :, 3:4] / 255.0
    img = bg * (1 - alpha) + warped[:, :, :3] * alpha
    glare = 0
    if rng.random() < p["glare_p"]:
        for _ in range(1 if rng.random() < 0.7 else 2):
            img = add_glare(img, rng, quad, rng.uniform(*p["glare_size"]), rng.uniform(*p["glare_int"]))
            glare += 1
    thumb = rng.random() < p["thumb_p"]
    if thumb:
        img = add_thumb(img, rng, quad)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    xn, yn = xx / W - 0.5, yy / H - 0.5
    phi = rng.uniform(0, 2 * math.pi)
    illum = 1 + rng.uniform(-p["grad"], p["grad"]) * 2 * (xn * math.cos(phi) + yn * math.sin(phi))
    illum *= 1 - rng.uniform(0, p["vignette"]) * (xn ** 2 + yn ** 2) * 2
    shadow = rng.random() < p["shadow_p"]
    if shadow:
        a = rng.uniform(0, 2 * math.pi)
        d = (xx - rng.uniform(0.2, 0.8) * W) * math.cos(a) + (yy - rng.uniform(0.2, 0.8) * H) * math.sin(a)
        sm = 1 / (1 + np.exp(-d / rng.uniform(15, 60)))
        illum *= 1 - rng.uniform(0.2, 0.45) * sm
    img = img * illum[..., None]
    # exposition / contraste / gamma / balance des blancs
    gain, con, gam = rng.uniform(*p["gain"]), rng.uniform(*p["contrast"]), rng.uniform(*p["gamma"])
    x = np.clip(((img / 255 - 0.5) * con + 0.5) * gain, 0, 1) ** gam
    cast = np.array([1 + rng.uniform(-p["cast"], p["cast"]), 1.0, 1 + rng.uniform(-p["cast"], p["cast"])], np.float32)
    img = np.clip(x * cast * 255, 0, 255)
    # optique : flou de mise au point / bougé, perte de resolution
    sig = rng.uniform(*p["blur"])
    if sig > 0.05:
        img = cv2.GaussianBlur(img, (0, 0), sig)
    motion = 0
    if rng.random() < p["motion_p"]:
        L = int(rng.uniform(*p["motion_len"]))
        if L >= 2:
            k = np.zeros((L, L), np.float32); k[L // 2, :] = 1
            k = cv2.warpAffine(k, cv2.getRotationMatrix2D(((L - 1) / 2, (L - 1) / 2), rng.uniform(0, 180), 1), (L, L))
            img = cv2.filter2D(img, -1, k / max(k.sum(), 1e-6))
            motion = L
    res = rng.uniform(*p["res"])
    if res < 0.99:
        small = cv2.resize(img, (int(W * res), int(H * res)), interpolation=cv2.INTER_AREA)
        img = cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR)
    ns = rng.uniform(*p["noise"])
    img = img + rng.normal(0, ns, (H, W, 1)).astype(np.float32) + rng.normal(0, ns / 2, (H, W, 3)).astype(np.float32)
    img = np.clip(img, 0, 255).astype(np.uint8)
    q = int(rng.uniform(*p["jpeg"]))
    out = os.path.join(data_dir, "photos", level, item["id"] + ".jpg")
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
    with open(out, "wb") as f:
        f.write(buf.tobytes())
    return item["id"], dict(quad=quad.tolist(), bg=bgk, glare=glare, thumb=bool(thumb), shadow=bool(shadow),
                            blur=round(sig, 2), motion=motion, res=round(res, 2), noise=round(ns, 1), jpeg=q, **geo)


def main():
    data_dir = sys.argv[1]
    levels = sys.argv[2].split(",") if len(sys.argv) > 2 else list(LEVELS)
    nproc = int(sys.argv[3]) if len(sys.argv) > 3 else max(1, (os.cpu_count() or 2) - 2)
    man = [m for m in load_manifest(data_dir) if m.get("fr_high") and m.get("fr_low")]
    rng = np.random.default_rng(1234)
    for li, level in enumerate(levels):
        os.makedirs(os.path.join(data_dir, "photos", level), exist_ok=True)
        jobs = []
        for i, m in enumerate(man):
            oth = [man[j]["fr_low"] for j in rng.choice(len(man), 3, replace=False) if man[j]["id"] != m["id"]]
            jobs.append((data_dir, level, m, oth, 100000 * (li + 1) + i))
        with Pool(nproc) as pool:
            res = pool.map(simulate, jobs, chunksize=4)
        json.dump(dict(res), open(os.path.join(data_dir, "photos", level, "gt.json"), "w"), indent=0)
        print(level, len(res), "photos")


if __name__ == "__main__":
    main()
