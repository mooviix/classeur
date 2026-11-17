#!/usr/bin/env python3
"""Banc d'essai scanner - etape 5c : OCR du numero avec PP-OCRv5 (reconnaissance seule, ONNX).

Modele : en_PP-OCRv5_mobile_rec (7,8 Mo, ONNX) + dictionnaire, depot Hugging Face monkt/paddleocr-onnx
(languages/english/{rec.onnx,dict.txt}). Dans la PWA : meme fichier via onnxruntime-web.
Pas de detecteur de texte : on connait deja la position du numero sur la carte redressee.

Usage : python -I 05c_ppocr.py DATA_DIR MODEL_DIR niveaux strategies
Sortie : DATA_DIR/results/ppocr_<niveau>_<strategie>.json  { id: { bg, bd, ms_bg, ms_bd } }
"""
import json, os, sys, time
import numpy as np
import cv2
import onnxruntime as ort

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benchlib as B  # noqa

ZONES = {
    "bg": (0.12, 0.94, 0.40, 0.98),    # series 2016+ : "025/198" en bas a gauche
    "bd": (0.74, 0.935, 0.97, 0.975),  # series anciennes : "4/102", "10/146" en bas a droite
}
H = 48


class Rec:
    def __init__(self, model_dir):
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1  # mesure de temps comparable a un thread WASM
        self.sess = ort.InferenceSession(os.path.join(model_dir, "rec.onnx"), so, providers=["CPUExecutionProvider"])
        self.chars = [""] + [l.rstrip("\n") for l in open(os.path.join(model_dir, "dict.txt"), encoding="utf-8")] + [" "]

    def __call__(self, rgb):
        h, w = rgb.shape[:2]
        nw = max(16, int(round(w * H / h)))
        x = cv2.resize(rgb, (nw, H), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
        x = ((x - 0.5) / 0.5).transpose(2, 0, 1)[None]
        y = self.sess.run(None, {self.sess.get_inputs()[0].name: x})[0][0]
        out, prev = [], -1
        for k in y.argmax(1):  # decodage CTC glouton
            if k != prev and k != 0 and k < len(self.chars):
                out.append(self.chars[k])
            prev = k
        return "".join(out)


def main():
    data_dir, model_dir = sys.argv[1], sys.argv[2]
    rec = Rec(model_dir)
    for level in sys.argv[3].split(","):
        for strat in sys.argv[4].split(","):
            d = os.path.join(data_dir, "crops", level, strat)
            out = {}
            for f in sorted(os.listdir(d)):
                card = cv2.cvtColor(cv2.imread(os.path.join(d, f)), cv2.COLOR_BGR2RGB)
                r = {}
                for z, reg in ZONES.items():
                    t0 = time.perf_counter()
                    r[z] = rec(B.region(card, reg))
                    r["ms_" + z] = round(1000 * (time.perf_counter() - t0), 1)
                out[f[:-4]] = r
            json.dump(out, open(os.path.join(data_dir, "results", f"ppocr_{level}_{strat}.json"), "w"))
            ms = np.median([v["ms_bg"] + v["ms_bd"] for v in out.values()])
            print(level, strat, len(out), "cartes ; mediane 2 zones : %.1f ms (ORT natif, 1 thread)" % ms, flush=True)


if __name__ == "__main__":
    main()
