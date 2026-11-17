#!/usr/bin/env python3
"""Banc d'essai scanner - etape 1 : selection des cartes et telechargement TCGdex.

Usage : python3 -I 01_fetch.py DATA_DIR
- ecrit DATA_DIR/meta/set_<lang>_<set>.json (cache API)
- ecrit DATA_DIR/img/{fr_low,fr_high,en_low}/<cardId>.webp
- ecrit DATA_DIR/manifest.json
Politesse : requetes sequentielles, au plus 8 req/s.
Aucune dependance hors bibliotheque standard.
"""
import json, os, random, sys, time, urllib.request

API = "https://api.tcgdex.net/v2"
UA = "classeur-scanner-bench/0.1 (benchmark hors ligne)"
MIN_INTERVAL = 0.125  # <= 8 requetes / seconde
_last = [0.0]

# 4 series recentes (echantillon), 2 anciennes, + reimpressions a l'identique (pieges)
PLAN = {
    "sv01": 85,     # Ecarlate et Violet (2023)
    "sv03.5": 85,   # 151 (2023)
    "sv08": 85,     # Etincelles Deferlantes (2024)
    "me01": 85,     # Mega-Evolution (2025)
    "base1": None,  # Set de Base (1999) complet
    "xy1": 50,      # XY (2014)
    "cel25cc": None,  # Celebrations Collection Classique : reimpressions d'anciennes cartes
}
FORCE_NAMES = {"Super Bonbon", "Échange"}  # dresseurs reimprimes avec la meme illustration
SEED = 42


def get(url, binary=False):
    wait = _last[0] + MIN_INTERVAL - time.time()
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            _last[0] = time.time()
            return data if binary else json.loads(data)
        except Exception as e:  # noqa
            _last[0] = time.time()
            if attempt == 2:
                print("ECHEC", url, e, file=sys.stderr)
                return None
            time.sleep(1.5 * (attempt + 1))


def set_json(data_dir, lang, sid):
    p = os.path.join(data_dir, "meta", f"set_{lang}_{sid}.json")
    if os.path.exists(p):
        return json.load(open(p))
    d = get(f"{API}/{lang}/sets/{sid}")
    if d is not None:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(d, open(p, "w"), ensure_ascii=False)
    return d


def main():
    data_dir = sys.argv[1]
    for sub in ("fr_low", "fr_high", "en_low"):
        os.makedirs(os.path.join(data_dir, "img", sub), exist_ok=True)
    rng = random.Random(SEED)
    manifest = []
    for sid, n in PLAN.items():
        fr = set_json(data_dir, "fr", sid)
        en = set_json(data_dir, "en", sid)
        en_by_id = {c["id"]: c for c in (en or {}).get("cards", [])}
        cards = [c for c in fr["cards"] if c.get("image")]
        if n is not None and n < len(cards):
            chosen = rng.sample(cards, n)
            ids = {c["id"] for c in chosen}
            chosen += [c for c in cards if c["name"] in FORCE_NAMES and c["id"] not in ids]
        else:
            chosen = cards
        for c in sorted(chosen, key=lambda c: c["id"]):
            e = en_by_id.get(c["id"])
            manifest.append({
                "id": c["id"], "set": sid, "localId": c["localId"],
                "name_fr": c["name"], "name_en": e["name"] if e else None,
                "official": fr["cardCount"]["official"],
                "abbr": (fr.get("abbreviation") or {}).get("official"),
                "fr_image": c["image"], "en_image": e.get("image") if e else None,
            })
    print(len(manifest), "cartes selectionnees")
    n_ok = 0
    for i, m in enumerate(manifest):
        jobs = [("fr_low", m["fr_image"], "low"), ("fr_high", m["fr_image"], "high"), ("en_low", m["en_image"], "low")]
        for sub, base, q in jobs:
            out = os.path.join(data_dir, "img", sub, m["id"] + ".webp")
            m[sub] = None
            if not base:
                continue
            if not os.path.exists(out):
                b = get(f"{base}/{q}.webp", binary=True)
                if not b or b[:4] != b"RIFF":
                    continue
                with open(out, "wb") as f:
                    f.write(b)
            m[sub] = os.path.relpath(out, data_dir)
        n_ok += bool(m["fr_low"] and m["fr_high"])
        if i % 50 == 0:
            print(i, m["id"], flush=True)
    json.dump(manifest, open(os.path.join(data_dir, "manifest.json"), "w"), ensure_ascii=False, indent=1)
    print("ok FR:", n_ok, " EN:", sum(1 for m in manifest if m["en_low"]))


if __name__ == "__main__":
    main()
