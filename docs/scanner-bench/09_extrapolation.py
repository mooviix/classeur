#!/usr/bin/env python3
"""Banc d'essai scanner - etape 9 : extrapolation de la precision a tout le catalogue (~20 000 cartes FR).

Modele (par requete q) :
  - intrus de NOM DIFFERENT : queue de la distribution des scores modelisee par une loi de Pareto
    generalisee (theorie des valeurs extremes, 15 % des intrus les plus proches) -> p_diff(q) ;
  - intrus de MEME NOM (meme Pokemon / meme Dresseur, dont les reimpressions a l'identique) :
    taux empirique groupe r_same = (nb de fois ou un intrus de meme nom bat la bonne carte) / (nb de paires) ;
  - nb attendu d'intrus mieux classes : lambda_q = p_diff(q) * K_diff + r_same * K_same(q), ou K_same(q)
    est le nombre de cartes du catalogue portant le meme nom (liste complete /v2/fr/cards) ;
  - P(top-1) = moyenne exp(-lambda_q), P(top-5) = moyenne P(Poisson(lambda_q) <= 4).
Controle : le meme modele avec les effectifs de l'echantillon (498 cartes) doit retrouver le top-1 mesure.

Usage : python -I 09_extrapolation.py DATA_DIR CATALOGUE_JSON
"""
import json, os, re, sys, collections, importlib.util
import numpy as np
from scipy.stats import genpareto, poisson

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benchlib as B  # noqa

CONFIGS = [("hash", "carte_dHashCouleur192", "multi"), ("hash", "carte_dHashCouleur192", "auto"),
           ("hash", "carte_pHash256", "multi"), ("hash", "carte_dHash64", "auto"),
           ("hash", "combo_carte_dHashHV128+illus_dHashCouleur192", "multi"),
           ("cnn", "mobileclip", "gabarit"), ("cnn", "mobileclip", "auto"), ("cnn", "mobileclip", "multi4"),
           ("cnn", "mobileclip_fp16", "auto"),
           ("cnn", "dinov2s", "auto"), ("cnn", "mnv4s", "auto"),
           ("fusion", "combo_carte_dHashHV128+illus_dHashCouleur192|mobileclip", "multi|gabarit"),
           ("fusion", "carte_dHashCouleur192|mobileclip", "multi|auto")]
LEVELS = ("facile", "moyen", "difficile")
TAIL = 0.15


def _z(S):
    return (S - S.mean(1, keepdims=True)) / (S.std(1, keepdims=True) + 1e-9)


def scores(data_dir, level, key):
    """Matrice de SIMILARITE (plus grand = plus proche), requetes x galerie FR."""
    kind, name, strat = key
    if kind == "fusion":  # somme des scores normalises (z) d'un hash et d'un embedding
        (hn, cn), (hs, cs) = name.split("|"), strat.split("|")
        Sh, q1, g1 = scores(data_dir, level, ("hash", hn, hs))
        Sc, q2, g2 = scores(data_dir, level, ("cnn", cn, cs))
        assert q1 == q2 and g1 == g2
        return _z(Sh) + _z(Sc), q1, g1
    if kind == "hash":
        z = np.load(os.path.join(data_dir, "results", f"dist_{level}_{strat}.npz"))
        return -z[name + "__fr"], list(z["q_ids"]), list(z["ids_fr"])
    z = np.load(os.path.join(data_dir, "results", f"emb_{name}.npz"))
    members = {"multi2": ("auto", "auto_ext"), "multi4": ("gabarit", "contours", "auto", "auto_ext")}.get(strat, (strat,))
    S = np.max(np.stack([z[f"Q_{level}_{m}"] @ z["G_fr"].T for m in members]), 0)
    return S, list(z["ids_fr"]), list(z["ids_fr"])


def p_tail(imp, g):
    """P(un intrus de nom different depasse g), queue GPD au-dela du quantile 1 - TAIL."""
    u = np.quantile(imp, 1 - TAIL)
    if g <= u:
        return float(np.mean(imp >= g))
    exc = imp[imp > u] - u
    if len(exc) < 10 or np.ptp(exc) == 0:
        return float(np.mean(imp >= g)) or 0.0
    c, _, sc = genpareto.fit(exc, floc=0)
    return float(TAIL * genpareto.sf(g - u, c, 0, sc))


def main():
    data_dir, cat_path = sys.argv[1], sys.argv[2]
    man = {m["id"]: m for m in B.load_manifest(data_dir)}
    cat = json.load(open(cat_path))
    pocket = re.compile(r"^(A\d|B\d|P-A)")
    phys = [c for c in cat if not pocket.match(c["id"].rsplit("-", 1)[0])]
    N_CAT = len(phys)
    name_count = collections.Counter(c["name"] for c in phys)
    out = {"catalogue_cartes_physiques": N_CAT}
    # lecture du numero par PP-OCR (cartes redressees "auto") : vraie / fausse / illisible, par requete
    spec = importlib.util.spec_from_file_location("analyse", os.path.join(os.path.dirname(os.path.abspath(__file__)), "06_analyse.py"))
    an = importlib.util.module_from_spec(spec); spec.loader.exec_module(an)
    totals = {int(m["official"]) for m in man.values()}
    ocr_ok = {}
    for level in LEVELS:
        p = os.path.join(data_dir, "results", f"ppocr_{level}_auto.json")
        if os.path.exists(p):
            o = json.load(open(p))
            ocr_ok[level] = {cid: an.parse_number(r["bg"] + "\n" + r["bd"], totals) == an.gt_number(man[cid]) for cid, r in o.items()}
    for key in CONFIGS:
        for level in LEVELS:
            try:
                S, q_ids, g_ids = scores(data_dir, level, key)
            except (FileNotFoundError, KeyError):
                continue
            g_ids = np.array(g_ids)
            names = np.array([man[g]["name_fr"] for g in g_ids])
            beat_same = n_same = 0
            per_q = []
            for i, q in enumerate(q_ids):
                t = int(np.where(g_ids == q)[0][0])
                g = S[i, t]
                same = (names == man[q]["name_fr"]); same[t] = False
                diff = ~same; diff[t] = False
                beat_same += int(np.sum(S[i, same] >= g)); n_same += int(same.sum())
                per_q.append((q, g, p_tail(S[i, diff], g), int(same.sum()), int(diff.sum())))
            r_same = beat_same / max(n_same, 1)
            res = {"r_same": round(r_same, 4)}
            for label, scale in (("echantillon_498", None), ("catalogue_%d" % N_CAT, N_CAT)):
                lam = []
                for q, g, pd, ns, nd in per_q:
                    if scale is None:
                        k_same, k_diff = ns, nd
                    else:
                        k_same = max(name_count.get(man[q]["name_fr"], 1) - 1, 0)
                        k_diff = scale - 1 - k_same
                    lam.append(pd * k_diff + r_same * k_same)
                lam = np.array(lam)
                res[label] = {"top1": round(float(np.mean(np.exp(-lam))), 3),
                              "top5": round(float(np.mean(poisson.cdf(4, lam))), 3),
                              "top10": round(float(np.mean(poisson.cdf(9, lam))), 3)}
                if level in ocr_ok:  # numero lu juste -> la bonne carte gagne si elle est dans le top-10 visuel
                    ok = np.array([ocr_ok[level].get(q, False) for q, *_ in per_q])
                    res[label]["top1_avec_numero_ppocr"] = round(float(np.mean(np.where(ok, poisson.cdf(9, lam), np.exp(-lam)))), 3)
            res["mesure_498"] = B.topk(-S, q_ids, list(g_ids), np.random.default_rng(0))
            out.setdefault("/".join(key), {})[level] = res
            print("/".join(key), level, res, flush=True)
    json.dump(out, open(os.path.join(data_dir, "results", "extrapolation.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
