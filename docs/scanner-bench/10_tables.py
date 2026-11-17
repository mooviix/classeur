#!/usr/bin/env python3
"""Banc d'essai scanner - etape 10 : tableaux Markdown a partir des resultats (pour recherche-scanner.md).

Usage : python -I 10_tables.py DATA_DIR
"""
import json, os, sys

LEVELS = ("facile", "moyen", "difficile")


def pct(r, k="top1"):
    return f"{100 * r[k]:.1f}"


def main():
    d = os.path.join(sys.argv[1], "results")
    H = {lv: json.load(open(os.path.join(d, f"hash_{lv}.json"))) for lv in LEVELS}
    C = {m: json.load(open(os.path.join(d, f"cnn_{m}.json"))) for m in
         ("mnv4s", "dinov2s", "dinov2s_q8", "mobileclip", "mobileclip_q8", "mobileclip_q8pc", "mobileclip_fp16")
         if os.path.exists(os.path.join(d, f"cnn_{m}.json"))}
    old = os.path.join(sys.argv[1], "results_v1", "cnn_clipb32q.json")
    if os.path.exists(old):
        C["clipb32q (v1)"] = json.load(open(old))

    print("\n### Tableau principal : FR -> base FR, top-1 / top-5 (%), 498 cartes\n")
    print("| Descripteur | Octets/carte | Cadrage | Facile | Moyen | Difficile | FR -> base EN (moyen) |")
    print("|---|---|---|---|---|---|---|")
    rows = [("dHash 64 bits, carte", "8", "carte_dHash64"), ("pHash 64 bits, carte", "8", "carte_pHash64"),
            ("pHash 256 bits, carte", "32", "carte_pHash256"), ("pHash 256 bits, illustration", "32", "illus_pHash256"),
            ("dHash couleur 192 bits, carte", "24", "carte_dHashCouleur192"),
            ("dHash H+V 128 + dHash couleur illus. 192", "40", "combo_carte_dHashHV128+illus_dHashCouleur192")]
    for label, size, key in rows:
        for strat in ("gabarit", "auto", "multi"):
            cells = []
            for lv in LEVELS:
                r = H[lv][strat][key]["FR->FR"]
                cells.append(f"{pct(r)} / {pct(r, 'top5')}")
            en = H["moyen"][strat][key]["FR->EN"]
            print(f"| {label} | {size} | {strat} | " + " | ".join(cells) + f" | {pct(en)} / {pct(en, 'top5')} |")
    sizes = {"mnv4s": "960 (int8)", "dinov2s": "384 (int8)", "dinov2s_q8": "384 (int8)", "mobileclip": "512 (int8)",
             "mobileclip_q8": "512", "mobileclip_q8pc": "512 (int8)", "mobileclip_fp16": "512 (int8)", "clipb32q (v1)": "512"}
    for m, R in C.items():
        for strat in ("gabarit", "auto", "multi4"):
            if strat not in R.get("moyen", {}):
                continue
            cells = []
            for lv in LEVELS:
                if lv in R and strat in R[lv]:
                    r = R[lv][strat]["FR->FR"]
                    cells.append(f"{pct(r)} / {pct(r, 'top5')}")
                else:
                    cells.append("-")
            en = R["moyen"][strat]["FR->EN"]
            print(f"| {m} | {sizes.get(m, '?')} | {strat} | " + " | ".join(cells) + f" | {pct(en)} / {pct(en, 'top5')} |")

    print("\n### Effet du cadrage (top-1 FR->FR, %)\n")
    print("| Descripteur | Niveau | gabarit seul | contours (type jscanify) | detection v2 | v2 + 3,5 % | multi-hypotheses | vrais coins |")
    print("|---|---|---|---|---|---|---|---|")
    for key in ("carte_pHash256", "carte_dHashCouleur192"):
        for lv in LEVELS:
            c = [pct(H[lv][s][key]["FR->FR"]) for s in ("gabarit", "contours", "auto", "auto_ext", "multi", "oracle")]
            print(f"| {key} | {lv} | " + " | ".join(c) + " |")
    for m in ("mobileclip", "dinov2s"):
        for lv in LEVELS:
            R = C[m][lv]
            c = [pct(R[s]["FR->FR"]) if s in R else "-" for s in ("gabarit", "contours", "auto", "auto_ext", "multi4", "oracle")]
            print(f"| {m} | {lv} | " + " | ".join(c) + " |")

    det = {lv: json.load(open(os.path.join(d, f"detect_{lv}.json"))) for lv in LEVELS}
    print("\n### Detection des coins (erreur moyenne des 4 coins, en % de la largeur de carte)\n")
    print("| Methode | Niveau | erreur < 2 % | erreur < 4 % | mediane |")
    print("|---|---|---|---|---|")
    import statistics
    for dn in ("contours", "auto"):
        for lv in LEVELS:
            e = [v[dn]["err"] for v in det[lv].values()]
            print(f"| {dn} | {lv} | {100 * sum(x < 0.02 for x in e) / len(e):.1f} | {100 * sum(x < 0.04 for x in e) / len(e):.1f} | {100 * statistics.median(e):.2f} |")

    S = json.load(open(os.path.join(d, "synthese.json")))
    print("\n### OCR du numero (cartes redressees par la detection v2)\n")
    print("| Moteur | Niveau | numero exact | illisible | faux | recentes 2023+ | anciennes | ms (2 zones) | nom exact (Tesseract) |")
    print("|---|---|---|---|---|---|---|---|---|")
    for k, v in S["ocr"].items():
        eng, lv, st = k.split("/")
        if st != "auto":
            continue
        pe = v["par_epoque"]
        print(f"| {eng} | {lv} | {100 * v['numero_exact']:.1f} | {100 * v['illisible']:.1f} | {100 * v['faux']:.1f} | "
              f"{100 * pe.get('recentes(2023+)', 0):.1f} | {100 * pe.get('anciennes(1999/2014)', 0):.1f} | {v['ms_numero_2zones_median']} | "
              f"{(str(round(100 * v['nom_exact'], 1)) if 'nom_exact' in v else '-')} |")

    p = os.path.join(d, "extrapolation.json")
    if os.path.exists(p):
        X = json.load(open(p))
        ncat = X.pop("catalogue_cartes_physiques")
        print(f"\n### Extrapolation au catalogue FR ({ncat} cartes physiques)\n")
        print("| Configuration | Niveau | mesure 498 (top-1/top-5) | modele a 498 | modele catalogue top-1 / top-5 / top-10 | catalogue + numero PP-OCR (top-1) |")
        print("|---|---|---|---|---|---|")
        for key, per in X.items():
            for lv, r in per.items():
                cat = [k for k in r if k.startswith("catalogue")][0]
                m, e, c = r["mesure_498"], r["echantillon_498"], r[cat]
                print(f"| {key} | {lv} | {pct(m)} / {pct(m, 'top5')} | {pct(e)} / {pct(e, 'top5')} | "
                      f"{pct(c)} / {pct(c, 'top5')} / {pct(c, 'top10')} | {pct(c, 'top1_avec_numero_ppocr') if 'top1_avec_numero_ppocr' in c else '-'} |")


if __name__ == "__main__":
    main()
