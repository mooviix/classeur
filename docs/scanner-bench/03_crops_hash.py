#!/usr/bin/env python3
"""Banc d'essai scanner - etape 3 : cadrage, hash perceptuels, evaluation top-1 / top-5.

Strategies de cadrage :
  gabarit   : on prend le rectangle du gabarit tel quel (aucune detection)
  contours  : detection classique Canny + contours + approxPolyDP (facon jscanify / OpenCV.js)
  auto      : detection v2 (hypotheses + recalage des 4 bords le long de normales, RANSAC)
  auto_ext  : auto agrandi de 3,5 % (cas ou le bord interieur du liseré a ete pris)
  multi     : (evaluation seulement) meilleure distance parmi gabarit/contours/auto/auto_ext
  oracle    : vrais coins (borne haute : descripteur seul)

Usage : python -I 03_crops_hash.py DATA_DIR [niveaux]
Sorties :
  DATA_DIR/crops/<niveau>/<strategie>/<id>.jpg   cartes redressees 600x825 (pour CNN / OCR)
  DATA_DIR/results/hash_<niveau>.json            scores par methode
  DATA_DIR/results/detect_<niveau>.json          erreurs de coins de la detection
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np
import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benchlib as B  # noqa

STRATS = ("gabarit", "contours", "auto", "auto_ext", "oracle")
MULTI = ("gabarit", "contours", "auto", "auto_ext")

# methode -> (region, fonction, parametre)
METHODS = {
    "carte_aHash64": (B.REGION_FULL, B.ahash_bits, 8),
    "carte_dHash64": (B.REGION_FULL, B.dhash_bits, 8),
    "carte_pHash64": (B.REGION_FULL, B.phash_bits, 8),
    "carte_dHash256": (B.REGION_FULL, B.dhash_bits, 16),
    "carte_pHash256": (B.REGION_FULL, B.phash_bits, 16),
    "carte_dHashHV128": (B.REGION_FULL, B.dhash2_bits, 8),
    "carte_dHashCouleur192": (B.REGION_FULL, B.color_dhash_bits, 8),
    "illus_dHash64": (B.REGION_ART, B.dhash_bits, 8),
    "illus_pHash64": (B.REGION_ART, B.phash_bits, 8),
    "illus_dHash256": (B.REGION_ART, B.dhash_bits, 16),
    "illus_pHash256": (B.REGION_ART, B.phash_bits, 16),
    "illus_dHashCouleur192": (B.REGION_ART, B.color_dhash_bits, 8),
}
COMBOS = {  # somme des distances normalisees
    "combo_carte_pHash256+illus_pHash256": ("carte_pHash256", "illus_pHash256"),
    "combo_carte_dHashHV128+illus_dHashCouleur192": ("carte_dHashHV128", "illus_dHashCouleur192"),
}


def descriptors(card):
    out = {}
    for name, (reg, fn, n) in METHODS.items():
        out[name] = B.pack(fn(B.region(card, reg), n))
    return out


def gallery_job(path):
    card = B.to_canonical(B.read_rgb(path))
    return descriptors(card)


def query_job(args):
    data_dir, level, cid, quad_gt = args
    img = cv2.cvtColor(cv2.imread(os.path.join(data_dir, "photos", level, cid + ".jpg")), cv2.COLOR_BGR2RGB)
    quad_gt = np.float32(quad_gt)
    cw = np.linalg.norm(quad_gt[1] - quad_gt[0])
    det = {}
    t0 = time.perf_counter()
    q1, s1 = B.detect_card(img)
    t1 = time.perf_counter()
    q2, s2 = B.detect_card_v2(img)
    t2 = time.perf_counter()
    for name, q, t in (("contours", q1, t1 - t0), ("auto", q2, t2 - t1)):
        det[name] = dict(found=q is not None, t=t, err=float(np.linalg.norm(q - quad_gt, axis=1).mean() / cw) if q is not None else 9.0)
    crops = {"gabarit": B.guide_crop(img), "oracle": B.warp_quad(img, quad_gt)}
    crops["contours"] = B.warp_quad(img, q1) if q1 is not None else crops["gabarit"]
    crops["auto"] = B.warp_quad(img, q2) if q2 is not None else crops["gabarit"]
    crops["auto_ext"] = B.warp_quad(img, B.expand_quad(q2)) if q2 is not None else crops["gabarit"]
    desc = {}
    for s, c in crops.items():
        out = os.path.join(data_dir, "crops", level, s, cid + ".jpg")
        cv2.imwrite(out, cv2.cvtColor(c, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
        desc[s] = descriptors(c)
    return cid, det, desc


def main():
    data_dir = sys.argv[1]
    levels = sys.argv[2].split(",") if len(sys.argv) > 2 else ["facile", "moyen", "difficile"]
    man = [m for m in B.load_manifest(data_dir) if m.get("fr_low") and m.get("fr_high")]
    os.makedirs(os.path.join(data_dir, "results"), exist_ok=True)
    nproc = max(1, (os.cpu_count() or 2) - 2)
    with Pool(nproc) as pool:
        g_fr = pool.map(gallery_job, [os.path.join(data_dir, m["fr_low"]) for m in man])
        en_items = [m for m in man if m.get("en_low")]
        g_en = pool.map(gallery_job, [os.path.join(data_dir, m["en_low"]) for m in en_items])
    ids_fr = [m["id"] for m in man]
    ids_en = [m["id"] for m in en_items]
    rng = np.random.default_rng(0)
    for level in levels:
        gt = json.load(open(os.path.join(data_dir, "photos", level, "gt.json")))
        for s in STRATS:
            os.makedirs(os.path.join(data_dir, "crops", level, s), exist_ok=True)
        jobs = [(data_dir, level, cid, gt[cid]["quad"]) for cid in ids_fr if cid in gt]
        t0 = time.time()
        with Pool(nproc) as pool:
            out = pool.map(query_job, jobs, chunksize=4)
        print(level, "photos traitees en", round(time.time() - t0, 1), "s", flush=True)
        q_ids = [o[0] for o in out]
        dets = {o[0]: o[1] for o in out}
        json.dump(dets, open(os.path.join(data_dir, "results", f"detect_{level}.json"), "w"))
        for dn in ("contours", "auto"):
            errs = np.array([d[dn]["err"] for d in dets.values()])
            print("  detection %-8s : trouvee %.1f%%, erreur coins < 2%% : %.1f%%, < 4%% : %.1f%%, mediane %.2f%%, temps moyen %.0f ms (Python)" % (
                dn, 100 * np.mean([d[dn]["found"] for d in dets.values()]), 100 * np.mean(errs < 0.02), 100 * np.mean(errs < 0.04),
                100 * np.median(errs), 1000 * np.mean([d[dn]["t"] for d in dets.values()])))
        results = {}
        q_en_mask = [cid in set(ids_en) for cid in q_ids]
        q_ids_en = [c for c, k in zip(q_ids, q_en_mask) if k]
        all_d = {}
        for s in STRATS + ("multi",):
            dists = {}
            if s == "multi":
                for name in all_d["auto"]:
                    dists[name] = tuple(np.min(np.stack([all_d[m][name][k] for m in MULTI]), 0) for k in (0, 1))
                all_d[s] = dists
            for name in (METHODS if s != "multi" else ()):
                Q = np.stack([o[2][s][name] for o in out])
                Gf = np.stack([g[name] for g in g_fr])
                Ge = np.stack([g[name] for g in g_en])
                nbits = Q.shape[1] * 8
                dists[name] = (B.hamming_matrix(Q, Gf) / nbits, B.hamming_matrix(Q, Ge) / nbits)
            if s != "multi":
                for cname, (a, b) in COMBOS.items():
                    dists[cname] = (dists[a][0] + dists[b][0], dists[a][1] + dists[b][1])
                all_d[s] = dists
            for name, (Df, De) in dists.items():
                De_q = De[np.array(q_en_mask)]
                r = {
                    "FR->FR": B.topk(Df, q_ids, ids_fr, rng),
                    "FR->EN": B.topk(De_q, q_ids_en, ids_en, rng),
                    "FR->FR+EN": B.topk(np.concatenate([Df, De], 1), q_ids, ids_fr + ids_en, rng),
                }
                results.setdefault(s, {})[name] = r
            np.savez_compressed(os.path.join(data_dir, "results", f"dist_{level}_{s}.npz"),
                                **{k + "__fr": v[0] for k, v in dists.items()}, **{k + "__en": v[1] for k, v in dists.items()},
                                q_ids=np.array(q_ids), ids_fr=np.array(ids_fr), ids_en=np.array(ids_en))
        json.dump(results, open(os.path.join(data_dir, "results", f"hash_{level}.json"), "w"), indent=1)
        for s in STRATS + ("multi",):
            print("  [%s]" % s)
            for name, r in results[s].items():
                print("    %-46s FR->FR %5.1f / %5.1f   FR->EN %5.1f / %5.1f   FR->FR+EN %5.1f / %5.1f" % (
                    name, 100 * r["FR->FR"]["top1"], 100 * r["FR->FR"]["top5"], 100 * r["FR->EN"]["top1"],
                    100 * r["FR->EN"]["top5"], 100 * r["FR->FR+EN"]["top1"], 100 * r["FR->FR+EN"]["top5"]))


if __name__ == "__main__":
    main()
