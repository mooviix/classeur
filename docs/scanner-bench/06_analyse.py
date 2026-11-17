#!/usr/bin/env python3
"""Banc d'essai scanner - etape 6 : OCR du numero, re-classement, extrapolation a 20 000 cartes.

Usage : python -I 06_analyse.py DATA_DIR
Lit DATA_DIR/results/{dist_*.npz, emb_*.npz, ocr_*.json} et ecrit DATA_DIR/results/synthese.json
"""
import json, os, re, sys, unicodedata, difflib
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benchlib as B  # noqa

LEVELS = ("facile", "moyen", "difficile")
CATALOG_FR = 20512  # cartes physiques FR dans TCGdex (hors TCG Pocket), nov. 2026
CANDIDATS_PAR_NUMERO = 2.41  # nb moyen de cartes partageant (numero, total) dans tout le catalogue FR

# --------------------------------------------------------------------------- OCR
NUM_RE = re.compile(r"([0-9OoIlSBZ]{1,3})\s*/\s*([0-9OoIlSBZ]{2,3})")
FIX = str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "S": "5", "B": "8", "Z": "2"})


def parse_number(text, totals):
    """Cherche 'n/t' dont le total t existe dans le catalogue. Mode tolerant : si le '/' a ete lu
    comme 7, 1, | ou 0 ("2117191"), on ancre la lecture sur un total connu en fin de nombre."""
    s = text.replace(" ", "")
    for m in NUM_RE.finditer(s):
        n, t = m.group(1).translate(FIX), m.group(2).translate(FIX)
        if n.isdigit() and t.isdigit() and int(t) in totals and 0 < int(n) <= int(t) + 120:
            return int(n), int(t)
    s = s.translate(FIX)
    for run in re.findall(r"[0-9/|\\]{4,9}", s):
        for tot in sorted(totals, key=lambda x: -len(str(x))):
            ts = str(tot)
            if not run.endswith(ts):
                continue
            pre = run[:-len(ts)]
            for p in ((pre[:-1] if pre and pre[-1] in "71/|\\0" else None), pre):
                if p and p.isdigit() and 1 <= len(p) <= 3 and 0 < int(p) <= tot + 120:
                    return int(p), tot
    return None


def norm_name(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


_TRI = {}


def _trigrams(s):
    s = f"  {s} "
    return {s[i:i + 3] for i in range(len(s) - 2)}


def name_match(text, names):
    """Nom du catalogue le plus proche d'une ligne OCR (difflib, candidats pre-filtres par trigrammes)."""
    key = id(names)
    if key not in _TRI:
        idx = {}
        for nm in names:
            for t in _trigrams(nm):
                idx.setdefault(t, set()).add(nm)
        _TRI[key] = idx
    idx = _TRI[key]
    best, bs = None, 0.0
    lines = [norm_name(l) for l in text.splitlines() if len(norm_name(l)) >= 3]
    for l in lines:
        cands = set()
        for t in _trigrams(l):
            cands |= idx.get(t, set())
        for nm in cands:
            r = difflib.SequenceMatcher(None, l, nm).ratio()
            if len(l) > len(nm) + 2:  # le nom peut etre noye dans la ligne (PV, "BASE", ...)
                blk = difflib.SequenceMatcher(None, nm, l).find_longest_match(0, len(nm), 0, len(l))
                st = max(0, blk.b - blk.a)
                r = max(r, difflib.SequenceMatcher(None, l[st:st + len(nm)], nm).ratio())
            if r > bs:
                best, bs = nm, r
    return best, bs


def gt_number(m):
    lid = m["localId"]
    return (int(lid), int(m["official"])) if lid.isdigit() else None


# --------------------------------------------------------------------------- re-classement
def rerank(D, q_ids, g_ids, ocr, gal_nt, gal_name, rng, k=10, use_num=True, use_name=False):
    """Re-classement prudent : seules les cartes du top-k visuel peuvent etre promues.
    Bonus fort si (numero, total) lu = celui de la carte, bonus faible si le nom lu correspond."""
    D2 = D.copy()
    for i, q in enumerate(q_ids):
        o = ocr.get(q)
        if not o:
            continue
        top = np.argsort(D[i])[:k]
        for j in top:
            g = g_ids[j]
            if use_num and o["nt"] is not None and gal_nt.get(g) == o["nt"]:
                D2[i, j] -= 10.0
            if use_name and o["nom"] is not None and gal_name.get(g) == o["nom"]:
                D2[i, j] -= 1.0
    return B.topk(D2, q_ids, g_ids, rng)


def size_curve(D, q_ids, g_ids, rng, sizes=(31, 62, 124, 248), reps=200):
    """top-1 en fonction du nombre de cartes de la base (sous-echantillons aleatoires d'intrus).
    Galerie a une image par carte. Egalite = 1/2."""
    g_ids = np.asarray(g_ids)
    true = np.array([np.where(g_ids == q)[0][0] for q in q_ids])
    gen = D[np.arange(len(q_ids)), true]
    Dimp = D.copy()
    Dimp[np.arange(len(q_ids)), true] = np.inf
    out = {}
    for n in sizes:
        acc = []
        for _ in range(reps):
            cols = rng.choice(D.shape[1], n - 1, replace=False)
            m = Dimp[:, cols].min(1)
            acc.append(np.mean((gen < m) + 0.5 * (gen == m)))
        out[n] = float(np.mean(acc))
    m = Dimp.min(1)
    out[D.shape[1]] = float(np.mean((gen < m) + 0.5 * (gen == m)))
    return out, gen, Dimp


def extrapolate(curve, target):
    """Erreur = a * N^b, ajustement log-log sur les points ou l'erreur > 0."""
    ns = np.array(sorted(curve)); err = np.array([1 - curve[n] for n in ns])
    ok = err > 1e-9
    if ok.sum() < 2:
        return None
    b, loga = np.polyfit(np.log(ns[ok]), np.log(err[ok]), 1)
    e = float(np.exp(loga) * target ** b)
    return dict(pente_loglog=round(float(b), 3), top1_estime=round(max(0.0, 1 - e), 3))


def gaussian_tail(gen, Dimp, sizes):
    """Modele de queue : P(un intrus bat la bonne carte) = Phi((d_bonne - moy_intrus) / et_intrus), par requete."""
    from scipy.stats import norm
    imp = np.where(np.isfinite(Dimp), Dimp, np.nan)
    mu, sd = np.nanmean(imp, 1), np.nanstd(imp, 1)
    p = norm.cdf((gen - mu) / np.maximum(sd, 1e-9))
    return {n: round(float(np.mean((1 - p) ** (n - 1))), 3) for n in sizes}


def load_visual(data_dir, level, key):
    """key = ('hash', methode, strategie) ou ('cnn', modele, strategie) -> (Df, De, q_ids, ids_fr, ids_en)."""
    kind, name, strat = key
    if kind == "hash":
        z = np.load(os.path.join(data_dir, "results", f"dist_{level}_{strat}.npz"))
        return z[name + "__fr"], z[name + "__en"], list(z["q_ids"]), list(z["ids_fr"]), list(z["ids_en"])
    z = np.load(os.path.join(data_dir, "results", f"emb_{name}.npz"))
    ids_fr, ids_en = list(z["ids_fr"]), list(z["ids_en"])
    members = {"multi2": ("auto", "auto_ext"), "multi4": ("gabarit", "contours", "auto", "auto_ext")}.get(strat, (strat,))
    Df = np.min(np.stack([1 - z[f"Q_{level}_{m}"] @ z["G_fr"].T for m in members]), 0)
    De = np.min(np.stack([1 - z[f"Q_{level}_{m}"] @ z["G_en"].T for m in members]), 0)
    return Df, De, ids_fr, ids_fr, ids_en


def main():
    data_dir = sys.argv[1]
    man = [m for m in B.load_manifest(data_dir) if m.get("fr_low") and m.get("fr_high")]
    by_id = {m["id"]: m for m in man}
    totals = {int(m["official"]) for m in man}
    gal_nt = {m["id"]: gt_number(m) for m in man}
    names = sorted({norm_name(m["name_fr"]) for m in man})
    rng = np.random.default_rng(0)
    synth = {"ocr": {}, "visuel": {}}

    # ---- OCR : Tesseract.js (numero + nom) et PP-OCRv5 mobile rec (numero)
    ocr_nt = {}
    for engine, pattern in (("tesseract", "ocr_{}_{}.json"), ("ppocr", "ppocr_{}_{}.json")):
        for level in LEVELS:
            for strat in ("auto", "oracle"):
                p = os.path.join(data_dir, "results", pattern.format(level, strat))
                if not os.path.exists(p):
                    continue
                o = json.load(open(p))
                n_ok = n_none = n_wrong = n_name = 0
                ms, ms_nom, per_era = [], [], {}
                for cid, r in o.items():
                    nt = parse_number(r["bg"] + "\n" + r["bd"], totals)
                    g = gal_nt[cid]
                    era = "recentes(2023+)" if by_id[cid]["set"] in ("sv01", "sv03.5", "sv08", "me01") else "anciennes(1999/2014)"
                    e = per_era.setdefault(era, [0, 0])
                    e[0] += 1; e[1] += nt == g
                    if nt is None:
                        n_none += 1
                    elif nt == g:
                        n_ok += 1
                    else:
                        n_wrong += 1
                    nm = None
                    if "nom" in r:
                        nm, sc = name_match(r["nom"], names)
                        nm = nm if sc >= 0.75 else None
                        n_name += nm == norm_name(by_id[cid]["name_fr"])
                        ms_nom.append(r["ms_nom"])
                    ms.append(r["ms_bg"] + r["ms_bd"])
                    if strat == "auto":
                        d = ocr_nt.setdefault(level, {}).setdefault(cid, {"nt": None, "nom": None})
                        if engine == "ppocr":
                            d["nt"] = nt
                        if nm is not None:
                            d["nom"] = nm
                n = len(o)
                res = dict(n=n, numero_exact=round(n_ok / n, 3), illisible=round(n_none / n, 3), faux=round(n_wrong / n, 3),
                           ms_numero_2zones_median=round(float(np.median(ms)), 1),
                           par_epoque={k: round(v[1] / v[0], 3) for k, v in per_era.items()})
                if ms_nom:
                    res.update(nom_exact=round(n_name / n, 3), ms_nom_median=round(float(np.median(ms_nom)), 1))
                synth["ocr"][f"{engine}/{level}/{strat}"] = res
                print("OCR", engine, level, strat, res, flush=True)

    # ---- visuel (+ OCR) et extrapolation
    gal_name = {m["id"]: norm_name(m["name_fr"]) for m in man}
    keys = [("hash", "carte_dHashCouleur192", "gabarit"), ("hash", "carte_dHashCouleur192", "auto"),
            ("hash", "carte_dHashCouleur192", "multi"), ("hash", "carte_pHash256", "auto"),
            ("hash", "carte_pHash256", "multi"), ("hash", "carte_dHash64", "auto"),
            ("hash", "combo_carte_dHashHV128+illus_dHashCouleur192", "multi"),
            ("cnn", "mobileclip", "gabarit"), ("cnn", "mobileclip", "auto"), ("cnn", "mobileclip", "multi4"),
            ("cnn", "mobileclip_q8", "auto"), ("cnn", "dinov2s", "auto"), ("cnn", "dinov2s", "multi2"),
            ("cnn", "dinov2s_q8", "auto"), ("cnn", "mnv4s", "auto")]
    sizes = (31, 62, 124, 248)
    for key in keys:
        for level in LEVELS:
            try:
                Df, De, q_ids, ids_fr, ids_en = load_visual(data_dir, level, key)
            except (FileNotFoundError, KeyError):
                continue
            Dall = np.concatenate([Df, De], 1)
            r = dict(visuel=B.topk(Df, q_ids, ids_fr, rng), visuel_FR_EN=B.topk(Dall, q_ids, ids_fr + ids_en, rng),
                     visuel_vers_EN=B.topk(De, q_ids, ids_en, rng))
            if level in ocr_nt:
                o = ocr_nt[level]
                r["visuel+numero"] = rerank(Df, q_ids, ids_fr, o, gal_nt, gal_name, rng, use_num=True)
                r["visuel+numero+nom"] = rerank(Df, q_ids, ids_fr, o, gal_nt, gal_name, rng, use_num=True, use_name=True)
            curve, gen, Dimp = size_curve(Df, q_ids, ids_fr, rng, sizes)
            r["courbe_taille"] = {str(k): round(v, 4) for k, v in curve.items()}
            r["extrapolation_20k_loi_puissance"] = extrapolate(curve, CATALOG_FR)
            gt_ = gaussian_tail(gen, Dimp, sizes + (len(ids_fr), CATALOG_FR, 2 * CATALOG_FR))
            r["modele_queue_gauss"] = {str(k): v for k, v in gt_.items()}
            synth["visuel"].setdefault("/".join(key), {})[level] = r
            print("/".join(key), level, {k: v for k, v in r.items()}, flush=True)
    json.dump(synth, open(os.path.join(data_dir, "results", "synthese.json"), "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
