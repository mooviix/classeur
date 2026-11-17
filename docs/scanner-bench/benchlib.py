"""Fonctions communes du banc d'essai (geometrie, cadrage, hash, detection)."""
import json, os
import numpy as np
import cv2
from PIL import Image

# Image "camera" simulee : 1080 x 1440 (portrait 3:4)
FRAME_W, FRAME_H = 1080, 1440
# Carte canonique = format des images TCGdex (600 x 825)
CARD_W, CARD_H = 600, 825
# Gabarit affiche a l'ecran : 66 % de la largeur, centre
GUIDE_W = int(round(0.66 * FRAME_W))
GUIDE_H = int(round(GUIDE_W * CARD_H / CARD_W))
GUIDE = ((FRAME_W - GUIDE_W) / 2, (FRAME_H - GUIDE_H) / 2,
         (FRAME_W + GUIDE_W) / 2, (FRAME_H + GUIDE_H) / 2)
CARD_CORNERS = np.float32([[0, 0], [CARD_W, 0], [CARD_W, CARD_H], [0, CARD_H]])

# Regions (fractions de la carte canonique)
REGION_FULL = (0.035, 0.03, 0.965, 0.97)   # carte entiere sans les coins arrondis
REGION_ART = (0.12, 0.13, 0.88, 0.46)      # interieur de la fenetre d'illustration


def load_manifest(data_dir):
    return json.load(open(os.path.join(data_dir, "manifest.json")))


def read_rgb(path, bg=(128, 128, 128)):
    """Lit une image (webp/jpg/png) en RGB uint8, alpha compose sur un gris neutre."""
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        base = Image.new("RGBA", im.size, bg + (255,))
        im = Image.alpha_composite(base, im)
    return np.asarray(im.convert("RGB"))


def to_canonical(img, size=(CARD_W, CARD_H)):
    return cv2.resize(img, size, interpolation=cv2.INTER_AREA)


def warp_quad(img, quad, size=(CARD_W, CARD_H)):
    """Redresse le quadrilatere (TL, TR, BR, BL) vers la carte canonique."""
    dst = np.float32([[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]])
    H = cv2.getPerspectiveTransform(np.float32(quad), dst)
    return cv2.warpPerspective(img, H, size, flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REPLICATE)


def guide_crop(img):
    x0, y0, x1, y1 = [int(round(v)) for v in GUIDE]
    return to_canonical(img[y0:y1, x0:x1])


def region(card, reg):
    h, w = card.shape[:2]
    x0, y0, x1, y1 = reg
    return card[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]


# ---------------------------------------------------------------- detection
def order_quad(pts):
    pts = np.asarray(pts, dtype=np.float32).reshape(-1, 2)
    c = pts.mean(0)
    ang = np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0])
    pts = pts[np.argsort(ang)]  # sens horaire a partir de ~ -180deg (haut-gauche)
    # commence par le coin le plus proche du haut-gauche
    i = np.argmin(pts[:, 0] + pts[:, 1])
    return np.roll(pts, -i, axis=0)


def quad_aspect(q):
    w = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
    h = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
    return w / max(h, 1e-6)


def detect_card(img_rgb, work_w=540):
    """Detection classique (Canny + contours + approxPolyDP), guidee par le gabarit.
    Retourne (quad 4x2 en pixels de l'image d'origine, score) ou (None, 0)."""
    H0, W0 = img_rgb.shape[:2]
    s = work_w / W0
    small = cv2.resize(img_rgb, (work_w, int(round(H0 * s))), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    gx0, gy0, gx1, gy1 = [v * s for v in GUIDE]
    gw, gh = gx1 - gx0, gy1 - gy0
    garea = gw * gh
    gcx, gcy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
    target_aspect = CARD_W / CARD_H
    best, best_score = None, 0.0
    med = float(np.median(gray))
    for lo, hi in ((0.66 * med, 1.33 * med), (20, 60), (50, 150)):
        edges = cv2.Canny(gray, max(5, lo), max(15, hi))
        edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            if cv2.contourArea(c) < 0.25 * garea and cv2.arcLength(c, False) < 1.2 * (gw + gh):
                continue
            hull = cv2.convexHull(c)
            area = cv2.contourArea(hull)
            if not (0.45 * garea < area < 1.6 * garea):
                continue
            peri = cv2.arcLength(hull, True)
            approx = cv2.approxPolyDP(hull, 0.025 * peri, True)
            exact = len(approx) == 4
            if exact:
                q = order_quad(approx.reshape(-1, 2))
            else:
                q = order_quad(cv2.boxPoints(cv2.minAreaRect(hull)))
            qa = cv2.contourArea(q.astype(np.float32))
            asp = quad_aspect(q)
            # score : forme de carte + coherence avec le gabarit
            s_aspect = np.exp(-((asp - target_aspect) / 0.08) ** 2)
            s_area = np.exp(-((qa / garea - 1.0) / 0.3) ** 2)
            cx, cy = q.mean(0)
            s_center = np.exp(-(((cx - gcx) / gw) ** 2 + ((cy - gcy) / gh) ** 2) / 0.02)
            fill = area / max(qa, 1)  # le contour remplit-il le quad ?
            score = s_aspect * s_area * s_center * min(1.0, fill) * (1.0 if exact else 0.6)
            if score > best_score:
                best, best_score = q, score
    if best is None:
        return None, 0.0
    return best / s, float(best_score)


# ---------------------------------------------------------------- hash
def _gray_small(img, w, h):
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if img.ndim == 3 else img
    return cv2.resize(g, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)


def dhash_bits(img, n=8):
    g = _gray_small(img, n + 1, n)
    return (g[:, 1:] > g[:, :-1]).flatten()


def dhash2_bits(img, n=8):
    """dHash horizontal + vertical (2 x n x n bits)."""
    g = _gray_small(img, n + 1, n + 1)
    return np.concatenate([(g[:-1, 1:] > g[:-1, :-1]).flatten(), (g[1:, :-1] > g[:-1, :-1]).flatten()])


def ahash_bits(img, n=8):
    g = _gray_small(img, n, n)
    return (g > g.mean()).flatten()


_DCT_CACHE = {}


def phash_bits(img, n=8, factor=4):
    m = n * factor
    g = _gray_small(img, m, m)
    d = cv2.dct(g)[:n, :n]
    return (d > np.median(d)).flatten()


def color_dhash_bits(img, n=8):
    """dHash sur les canaux Y, Cr, Cb (couleur) : 3 x n x n bits."""
    ycc = cv2.cvtColor(img, cv2.COLOR_RGB2YCrCb)
    out = []
    for k in range(3):
        g = cv2.resize(ycc[:, :, k], (n + 1, n), interpolation=cv2.INTER_AREA).astype(np.float32)
        out.append((g[:, 1:] > g[:, :-1]).flatten())
    return np.concatenate(out)


def pack(bits):
    return np.packbits(np.asarray(bits, dtype=np.uint8))


def hamming_matrix(Q, G):
    """Q: (nq, nbytes) uint8, G: (ng, nbytes) uint8 -> distances (nq, ng)."""
    x = np.bitwise_xor(Q[:, None, :], G[None, :, :])
    return np.bitwise_count(x).sum(-1).astype(np.float32)


# ---------------------------------------------------------------- evaluation
def topk(D, q_ids, g_ids, rng, ks=(1, 5)):
    """D : distances (nq, ng), plus petit = plus proche. Egalites departagees au hasard.
    Une galerie peut contenir plusieurs images d'une meme carte (FR + EN) : on compte par id."""
    D = D + rng.random(D.shape, dtype=np.float32) * 1e-4
    order = np.argsort(D, axis=1)
    g_ids = np.asarray(g_ids)
    res = {f"top{k}": 0 for k in ks}
    kmax = max(ks)
    for i, qid in enumerate(q_ids):
        seen = []
        for j in order[i]:
            if g_ids[j] not in seen:
                seen.append(g_ids[j])
                if len(seen) >= kmax:
                    break
        for k in ks:
            res[f"top{k}"] += qid in seen[:k]
    return {k: v / len(q_ids) for k, v in res.items()}


# ---------------------------------------------------------------- detection v2
# Idee : partir d'hypotheses grossieres (contours + gabarit), puis recaler chaque bord
# en cherchant, le long de normales, le bord le plus EXTERIEUR suffisamment net
# (le bord de la carte, pas le cadre interieur), avec ajustement de droite RANSAC.
# Les coins = intersections des 4 droites (coins "virtuels", insensibles aux coins arrondis).
# Tout est portable en JS sans OpenCV (gradients, echantillonnage, RANSAC).

def _grad_fields(small):
    lab = cv2.cvtColor(small, cv2.COLOR_RGB2LAB).astype(np.float32)
    lab = cv2.GaussianBlur(lab, (0, 0), 1.0)
    gx = np.stack([cv2.Sobel(lab[..., c], cv2.CV_32F, 1, 0, ksize=3) for c in range(3)], -1)
    gy = np.stack([cv2.Sobel(lab[..., c], cv2.CV_32F, 0, 1, ksize=3) for c in range(3)], -1)
    return gx, gy


def _sample(field, xs, ys):
    """echantillonnage bilineaire d'un champ (H, W, C) en des points (N, M)."""
    return cv2.remap(field, xs.astype(np.float32), ys.astype(np.float32), cv2.INTER_LINEAR,
                     borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def _line_intersect(l1, l2):
    (p1, d1), (p2, d2) = l1, l2
    A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]], np.float64)
    if abs(np.linalg.det(A)) < 1e-6:
        return None
    t = np.linalg.solve(A, p2 - p1)
    return p1 + t[0] * d1


def refine_quad(gx, gy, quad, radius, n_samples=40, rng=None, outer_bias=0.75):
    """Recale les 4 bords d'un quadrilatere (coordonnees de travail)."""
    rng = rng or np.random.default_rng(0)
    quad = np.asarray(quad, np.float64)
    c = quad.mean(0)
    lines, supports = [], []
    for i in range(4):
        a, b = quad[i], quad[(i + 1) % 4]
        d = (b - a) / (np.linalg.norm(b - a) + 1e-9)
        n = np.array([d[1], -d[0]])
        if np.dot((a + b) / 2 - c, n) < 0:
            n = -n  # normale sortante
        ts = np.linspace(0.12, 0.88, n_samples)
        ss = np.arange(-radius, radius + 1, 1.0)
        P = a[None, :] + ts[:, None] * (b - a)[None, :]
        X = P[:, 0:1] + ss[None, :] * n[0]
        Y = P[:, 1:2] + ss[None, :] * n[1]
        gxs, gys = _sample(gx, X, Y), _sample(gy, X, Y)
        prof = np.abs(gxs * n[0] + gys * n[1]).max(-1)  # gradient directionnel (n_samples, len(ss))
        pts, prof_idx = [], []
        for k in range(n_samples):
            pr = prof[k]
            thr = max(18.0, 0.3 * pr.max())
            loc = np.where((pr[1:-1] >= pr[:-2]) & (pr[1:-1] >= pr[2:]) & (pr[1:-1] > thr))[0] + 1
            loc = loc[np.argsort(-ss[loc])][:3]  # du plus exterieur au plus interieur
            for j in loc:
                pts.append((X[k, j], Y[k, j], ss[j])); prof_idx.append(k)
        if len(pts) < 6:
            lines.append((a, d)); supports.append(0.0)
            continue
        pts = np.array(pts); prof_idx = np.array(prof_idx)
        best = None
        cand = []
        for _ in range(150):
            i1, i2 = rng.choice(len(pts), 2, replace=False)
            if prof_idx[i1] == prof_idx[i2]:
                continue
            p1, p2 = pts[i1, :2], pts[i2, :2]
            dd = p2 - p1
            L = np.linalg.norm(dd)
            if L < 1e-6:
                continue
            dd /= L
            if abs(np.dot(dd, d)) < 0.94:  # orientation proche de l'initiale (+-20 deg)
                continue
            nn = np.array([dd[1], -dd[0]])
            dist = np.abs((pts[:, :2] - p1) @ nn)
            inl = dist < 1.5
            ninl = len(np.unique(prof_idx[inl]))
            off = np.dot(p1 - (a + b) / 2, n)
            cand.append((ninl, off, inl))
        if not cand:
            lines.append((a, d)); supports.append(0.0)
            continue
        mx = max(cd[0] for cd in cand)
        good = [cd for cd in cand if cd[0] >= outer_bias * mx]
        ninl, off, inl = max(good, key=lambda cd: cd[1])
        P_in = pts[inl, :2]
        vx, vy, x0, y0 = cv2.fitLine(P_in.astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01).flatten()
        lines.append((np.array([x0, y0], np.float64), np.array([vx, vy], np.float64)))
        supports.append(ninl / n_samples)
    corners = []
    for i in range(4):
        p = _line_intersect(lines[(i - 1) % 4], lines[i])
        if p is None:
            return None, 0.0
        corners.append(p)
    return np.array(corners, np.float32), float(np.mean(supports))


def detect_card_v2(img_rgb, work_w=720, return_all=False, use_contours=True):
    """use_contours=False : uniquement l'hypothese "gabarit" (aucun suivi de contours -> portage JS sans OpenCV)."""
    H0, W0 = img_rgb.shape[:2]
    s = work_w / W0
    small = cv2.resize(img_rgb, (work_w, int(round(H0 * s))), interpolation=cv2.INTER_AREA)
    gx, gy = _grad_fields(small)
    gx0, gy0, gx1, gy1 = [v * s for v in GUIDE]
    gw, gh = gx1 - gx0, gy1 - gy0
    guide_q = np.float32([[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]])
    inits = [(guide_q, 0.16 * gw)]
    if use_contours:
        q1, sc1 = detect_card(img_rgb, work_w=540)
        if q1 is not None:
            inits.append((q1 * s, 0.06 * gw))
    target = CARD_W / CARD_H
    best, best_score, allq = None, -1, []
    rng = np.random.default_rng(0)
    for q0, rad in inits:
        q, sup = refine_quad(gx, gy, q0, int(rad), rng=rng)
        if q is None:
            continue
        q2, sup2 = refine_quad(gx, gy, q, int(0.025 * gw), rng=rng)
        if q2 is not None:
            q, sup = q2, sup2
        q = order_quad(q)
        area = cv2.contourArea(q)
        if not cv2.isContourConvex(q.astype(np.float32)) or area < 0.4 * gw * gh:
            continue
        asp = quad_aspect(q)
        score = sup * np.exp(-((asp - target) / 0.06) ** 2) * np.exp(-((area / (gw * gh) - 1) / 0.35) ** 2)
        allq.append((q / s, score))
        if score > best_score:
            best, best_score = q, score
    if return_all:
        return allq
    if best is None:
        return None, 0.0
    return best / s, float(best_score)


def expand_quad(quad, border=0.035, size=(CARD_W, CARD_H)):
    """Agrandit un quadrilatere de `border` x largeur de chaque cote, en respectant la perspective
    (hypothese : on a trouve le bord INTERIEUR du liseré au lieu du bord de la carte)."""
    src = np.float32([[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]])
    Hm = cv2.getPerspectiveTransform(src, np.float32(quad))
    b = border * size[0]
    ext = np.float32([[-b, -b], [size[0] + b, -b], [size[0] + b, size[1] + b], [-b, size[1] + b]])
    return cv2.perspectiveTransform(ext[None], Hm)[0]
