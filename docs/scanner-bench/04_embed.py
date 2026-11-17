#!/usr/bin/env python3
"""Banc d'essai scanner - etape 4 : embeddings CNN / ViT (ONNX Runtime) et evaluation.

Usage : python -I 04_embed.py DATA_DIR MODELS_DIR [modele1,modele2,...]
Modeles (fichiers ONNX de Hugging Face, ceux qu'utiliserait transformers.js / onnxruntime-web) :
  mnv4s       onnx-community/mobilenetv4_conv_small.e2400_r224_in1k  (sortie GlobalAveragePool, 960 d)
  dinov2s     Xenova/dinov2-small   (jeton CLS, 384 d)
  mobileclip  Xenova/mobileclip_s0  (image_embeds, 512 d)
  clipb32q    Xenova/clip-vit-base-patch32, vision_model_quantized (image_embeds, 512 d)
Entree : la carte redressee (region "carte entiere"), redimensionnee sans recadrage central.
Sorties : DATA_DIR/results/emb_<modele>.npz et DATA_DIR/results/cnn_<modele>.json
"""
import json, os, sys, time
import numpy as np
import cv2
import onnx
import onnxruntime as ort

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benchlib as B  # noqa

IMNET = ([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
CLIPN = ([0.48145466, 0.4578275, 0.40821073], [0.26862954, 0.26130258, 0.27577711])
MODELS = {
    "mnv4s": dict(file="mnv4s/model.onnx", size=224, norm=IMNET, out="gap"),
    "mnv4s_q8": dict(file="mnv4s/model_quantized.onnx", size=224, norm=IMNET, out="gap"),
    "dinov2s": dict(file="dinov2s/model.onnx", size=224, norm=IMNET, out="cls"),
    "dinov2s_q8": dict(file="dinov2s/model_quantized.onnx", size=224, norm=IMNET, out="cls"),
    "mobileclip": dict(file="mobileclip_s0/vision_model.onnx", size=256, norm=([0, 0, 0], [1, 1, 1]), out="image_embeds"),
    "mobileclip_q8": dict(file="mobileclip_s0/vision_model_quantized.onnx", size=256, norm=([0, 0, 0], [1, 1, 1]), out="image_embeds"),
    "clipb32q": dict(file="clip_b32/vision_model_quantized.onnx", size=224, norm=CLIPN, out="image_embeds"),
    # variantes de MobileCLIP : fp16 (Hugging Face) et int8 "par canal" quantifie localement avec
    # onnxruntime.quantization.quantize_dynamic(per_channel=True, weight_type=QInt8)
    "mobileclip_fp16": dict(file="mobileclip_s0/vision_model_fp16.onnx", size=256, norm=([0, 0, 0], [1, 1, 1]), out="image_embeds"),
    "mobileclip_q8pc": dict(file="mobileclip_s0/vision_model_q8pcall.onnx", size=256, norm=([0, 0, 0], [1, 1, 1]), out="image_embeds"),
}
LEVELS = ("facile", "moyen", "difficile")
STRATS = ("gabarit", "contours", "auto", "auto_ext", "oracle")
# hypotheses multiples : on garde la plus petite distance (1 inference par hypothese)
MULTIS = {"multi2": ("auto", "auto_ext"), "multi4": ("gabarit", "contours", "auto", "auto_ext")}


def session(models_dir, cfg):
    path = os.path.join(models_dir, cfg["file"])
    if cfg["out"] == "gap":  # expose la sortie du GlobalAveragePool (avant la tete de classification)
        m = onnx.load(path)
        gap = [n.output[0] for n in m.graph.node if n.op_type == "GlobalAveragePool"][-1]
        m.graph.output.append(onnx.helper.make_tensor_value_info(gap, onnx.TensorProto.FLOAT, None))
        sess = ort.InferenceSession(m.SerializeToString(), providers=["CPUExecutionProvider"])
        return sess, gap
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    return sess, ("last_hidden_state" if cfg["out"] == "cls" else cfg["out"])


def prep(card_rgb, cfg):
    reg = B.region(card_rgb, B.REGION_FULL)
    x = cv2.resize(reg, (cfg["size"], cfg["size"]), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    mean, std = np.float32(cfg["norm"][0]), np.float32(cfg["norm"][1])
    return ((x - mean) / std).transpose(2, 0, 1)


def embed(paths, sess, oname, cfg, reader, bs=32):
    out = []
    for i in range(0, len(paths), bs):
        batch = np.stack([prep(reader(p), cfg) for p in paths[i:i + bs]])
        y = sess.run([oname], {"pixel_values": batch})[0]
        if cfg["out"] == "cls":
            y = y[:, 0, :]
        y = y.reshape(len(batch), -1)
        out.append(y / np.linalg.norm(y, axis=1, keepdims=True))
    return np.concatenate(out).astype(np.float32)


def main():
    data_dir, models_dir = sys.argv[1], sys.argv[2]
    names = sys.argv[3].split(",") if len(sys.argv) > 3 else list(MODELS)
    global LEVELS, STRATS, MULTIS
    if len(sys.argv) > 4 and sys.argv[4] == "rapide":  # controle rapide d'une variante de modele
        LEVELS, STRATS, MULTIS = ("moyen", "difficile"), ("gabarit", "auto"), {}
    man = [m for m in B.load_manifest(data_dir) if m.get("fr_low") and m.get("fr_high")]
    ids_fr = [m["id"] for m in man]
    en_items = [m for m in man if m.get("en_low")]
    ids_en = [m["id"] for m in en_items]
    gal_reader = lambda p: B.to_canonical(B.read_rgb(p))  # noqa
    crop_reader = lambda p: cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2RGB)  # noqa
    rng = np.random.default_rng(0)
    for name in names:
        cfg = MODELS[name]
        sess, oname = session(models_dir, cfg)
        t0 = time.time()
        G_fr = embed([os.path.join(data_dir, m["fr_low"]) for m in man], sess, oname, cfg, gal_reader)
        G_en = embed([os.path.join(data_dir, m["en_low"]) for m in en_items], sess, oname, cfg, gal_reader)
        store = {"G_fr": G_fr, "G_en": G_en}
        results = {}
        for level in LEVELS:
            dl = {}
            q_ids = None
            for s in STRATS:
                d = os.path.join(data_dir, "crops", level, s)
                q_ids = [i for i in ids_fr if os.path.exists(os.path.join(d, i + ".jpg"))]
                Q = embed([os.path.join(d, i + ".jpg") for i in q_ids], sess, oname, cfg, crop_reader)
                store[f"Q_{level}_{s}"] = Q
                dl[s] = (1 - Q @ G_fr.T, 1 - Q @ G_en.T)
            for mname, members in MULTIS.items():
                dl[mname] = tuple(np.min(np.stack([dl[m][k] for m in members]), 0) for k in (0, 1))
            mask = np.array([i in set(ids_en) for i in q_ids])
            for s, (Df, De) in dl.items():
                results.setdefault(level, {})[s] = {
                    "FR->FR": B.topk(Df, q_ids, ids_fr, rng),
                    "FR->EN": B.topk(De[mask], [i for i, k in zip(q_ids, mask) if k], ids_en, rng),
                    "FR->FR+EN": B.topk(np.concatenate([Df, De], 1), q_ids, ids_fr + ids_en, rng),
                }
        dt = time.time() - t0
        n_img = len(man) + len(en_items) + sum(len(v) for k, v in store.items() if k.startswith("Q_"))  # images traitees
        results["_meta"] = dict(dim=int(G_fr.shape[1]), n_images=n_img, sec=round(dt, 1),
                                ms_per_image_cpu_natif=round(1000 * dt / n_img, 2),
                                taille_fichier_mo=round(os.path.getsize(os.path.join(models_dir, cfg["file"])) / 1e6, 1))
        np.savez_compressed(os.path.join(data_dir, "results", f"emb_{name}.npz"), **store,
                            ids_fr=np.array(ids_fr), ids_en=np.array(ids_en))
        json.dump(results, open(os.path.join(data_dir, "results", f"cnn_{name}.json"), "w"), indent=1)
        print(f"== {name}  dim={G_fr.shape[1]}  {results['_meta']}", flush=True)
        for level in LEVELS:
            for s in results[level]:
                r = results[level][s]
                print("   %-9s %-8s FR->FR %5.1f / %5.1f   FR->EN %5.1f / %5.1f   FR->FR+EN %5.1f / %5.1f" % (
                    level, s, 100 * r["FR->FR"]["top1"], 100 * r["FR->FR"]["top5"], 100 * r["FR->EN"]["top1"],
                    100 * r["FR->EN"]["top5"], 100 * r["FR->FR+EN"]["top1"], 100 * r["FR->FR+EN"]["top5"]), flush=True)


if __name__ == "__main__":
    main()
