#!/usr/bin/env python3
"""Banc d'essai scanner - etape 8 : compression de la base d'embeddings (int8, ACP) et effet sur le top-1.

Usage : python -I 08_compression.py DATA_DIR [modele]
Base de 20 000 cartes : float32 512 d = 41 Mo ; int8 512 d = 10,5 Mo ; int8 128 d = 2,6 Mo.
"""
import json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benchlib as B  # noqa


def quant_int8(X):
    """int8 symetrique, une echelle globale (comme PokVault : facile a reproduire en JS)."""
    s = 127.0 / np.abs(X).max()
    return np.clip(np.round(X * s), -127, 127).astype(np.int8), s


def main():
    data_dir = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "mobileclip"
    z = np.load(os.path.join(data_dir, "results", f"emb_{model}.npz"))
    G, ids = z["G_fr"], list(z["ids_fr"])
    rng = np.random.default_rng(0)
    out = {}
    mean = G.mean(0)
    U, S, Vt = np.linalg.svd(G - mean, full_matrices=False)
    for level in ("moyen", "difficile"):
        for strat in ("gabarit", "auto"):
            Q = z[f"Q_{level}_{strat}"]
            row = {}
            for name, dims, q8 in (("float32", None, False), ("int8", None, True), ("acp256_int8", 256, True),
                                   ("acp128_int8", 128, True), ("acp64_int8", 64, True)):
                if dims:
                    P = Vt[:dims].T
                    g, q = (G - mean) @ P, (Q - mean) @ P
                    g /= np.linalg.norm(g, axis=1, keepdims=True); q /= np.linalg.norm(q, axis=1, keepdims=True)
                else:
                    g, q = G, Q
                if q8:
                    g8, s = quant_int8(g)
                    g = g8.astype(np.float32) / s
                D = 1 - q @ g.T
                row[name] = B.topk(D, ids, ids, rng)["top1"]
                row[name + "_octets_par_carte"] = (dims or G.shape[1]) * (1 if q8 else 4)
            out[f"{level}/{strat}"] = row
            print(model, level, strat, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in row.items() if "octets" not in k})
    json.dump(out, open(os.path.join(data_dir, "results", f"compression_{model}.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
