#!/usr/bin/env python3
"""Banc d'essai scanner - etape 5a : preparation des zones a lire par OCR.

Usage : python -I 05a_ocr_prep.py DATA_DIR niveau1,niveau2 strategie1,strategie2
Pour chaque carte redressee (600x825), decoupe, agrandit x3 (niveaux de gris) et ajoute une marge :
  _bg : bande basse gauche  (numero des series 2016+ : "G SVI FR 025/198")
  _bd : bande basse droite  (numero des series anciennes : "4/102", "10/146")
  _nom : bandeau du haut (nom de la carte)
Dans la PWA, l'equivalent est un drawImage() sur un canvas agrandi.
"""
import os, sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benchlib as B  # noqa

ZONES = {
    "bg": (0.12, 0.94, 0.40, 0.98),    # "025/198" (series 2016+), sans la case du code de serie
    "bd": (0.66, 0.92, 0.97, 0.985),   # "10/146", "4/102" (series anciennes)
    "nom": (0.03, 0.02, 0.75, 0.13),
}
UPSCALE = 3
PAD = 30  # Tesseract lit mal un texte qui touche le bord : marge de la couleur mediane du bord


def main():
    data_dir = sys.argv[1]
    levels = sys.argv[2].split(",")
    strats = sys.argv[3].split(",")
    n = 0
    for level in levels:
        for s in strats:
            src = os.path.join(data_dir, "crops", level, s)
            dst = os.path.join(data_dir, "ocr", level, s)
            os.makedirs(dst, exist_ok=True)
            for f in sorted(os.listdir(src)):
                if not f.endswith(".jpg"):
                    continue
                card = cv2.imread(os.path.join(src, f), cv2.IMREAD_GRAYSCALE)
                for z, reg in ZONES.items():
                    roi = B.region(card, reg)
                    roi = cv2.resize(roi, None, fx=UPSCALE, fy=UPSCALE, interpolation=cv2.INTER_CUBIC)
                    med = int(np.median(np.concatenate([roi[0], roi[-1], roi[:, 0], roi[:, -1]])))
                    roi = cv2.copyMakeBorder(roi, PAD, PAD, PAD, PAD, cv2.BORDER_CONSTANT, value=med)
                    cv2.imwrite(os.path.join(dst, f[:-4] + f"_{z}.png"), roi)
                n += 1
    print(n, "cartes preparees")


if __name__ == "__main__":
    main()
