// Banc d'essai scanner - etape 7 : temps de calcul cote navigateur (mesure sous Node, moteur V8 + WASM).
// Usage : node 07_bench_js.mjs MODELS_DIR ORT_DIST_DIR
//   MODELS_DIR   : dossier des modeles ONNX (cf. 04_embed.py)
//   ORT_DIST_DIR : node_modules/onnxruntime-web/dist (fichiers .wasm)
// Mesure : (1) hash perceptuel en JS pur + recherche lineaire de Hamming sur 20 000 / 40 000 cartes,
//          (2) recherche par produit scalaire sur 20 000 embeddings int8,
//          (3) inference onnxruntime-web (backend WASM) des modeles candidats, 1 et 4 threads.
import fs from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-web';
import { pathToFileURL } from 'node:url';

const [modelsDir, ortDist] = process.argv.slice(2);
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function timeit(fn, n = 30) { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); } return med(t); }

// ---------- (1) hash en JS : reduction par moyenne de zone + dHash 16x16 (256 bits) + pHash 64 bits
const W = 600, H = 825;
const rgba = new Uint8ClampedArray(W * H * 4).map((_, i) => (i * 2654435761) >>> 24);
function grayArea(src, w, h, ow, oh) { // moyenne de zone (equivalent INTER_AREA)
  const out = new Float32Array(ow * oh);
  for (let oy = 0; oy < oh; oy++) {
    const y0 = Math.floor(oy * h / oh), y1 = Math.floor((oy + 1) * h / oh);
    for (let ox = 0; ox < ow; ox++) {
      const x0 = Math.floor(ox * w / ow), x1 = Math.floor((ox + 1) * w / ow);
      let s = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4; s += 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
      }
      out[oy * ow + ox] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}
function dhash(src, n) { // n x n bits -> Uint32Array
  const g = grayArea(src, W, H, n + 1, n); const bits = new Uint32Array(n * n / 32);
  for (let y = 0, k = 0; y < n; y++) for (let x = 0; x < n; x++, k++) if (g[y * (n + 1) + x + 1] > g[y * (n + 1) + x]) bits[k >> 5] |= 1 << (k & 31);
  return bits;
}
function phash64(src) { // DCT 32x32 -> 8x8
  const N = 32, g = grayArea(src, W, H, N, N), c = new Float32Array(64);
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
    let s = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s += g[y * N + x] * Math.cos((2 * x + 1) * v * Math.PI / 64) * Math.cos((2 * y + 1) * u * Math.PI / 64);
    c[u * 8 + v] = s;
  }
  const m = [...c].sort((a, b) => a - b)[32]; const bits = new Uint32Array(2);
  for (let k = 0; k < 64; k++) if (c[k] > m) bits[k >> 5] |= 1 << (k & 31);
  return bits;
}
const pop = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
function hammingScan(db, q, words) { // db: Uint32Array(n*words)
  const n = db.length / words; let best = 1e9, bi = -1;
  for (let i = 0; i < n; i++) { let d = 0; for (let w = 0; w < words; w++) d += pop(db[i * words + w] ^ q[w]); if (d < best) { best = d; bi = i; } }
  return bi;
}
const res = {};
res.dhash256_ms = timeit(() => dhash(rgba, 16));
res.phash64_ms = timeit(() => phash64(rgba));
for (const n of [20000, 40000]) {
  const db = new Uint32Array(n * 8).map(() => (Math.random() * 2 ** 32) >>> 0);
  const q = dhash(rgba, 16);
  res[`scan_hamming256_${n}_ms`] = timeit(() => hammingScan(db, q, 8));
  const db2 = new Uint32Array(n * 14).map(() => (Math.random() * 2 ** 32) >>> 0); // ~ 448 bits (combo couleur)
  res[`scan_hamming448_${n}_ms`] = timeit(() => hammingScan(db2, new Uint32Array(14), 14));
}
// ---------- (2) produit scalaire int8 sur 20 000 x 384
{
  const n = 20000, d = 384; const db = new Int8Array(n * d).map(() => (Math.random() * 255 - 127) | 0); const q = new Float32Array(d).map(() => Math.random());
  res.scan_dot_int8_20000x384_ms = timeit(() => { let best = -1e9; for (let i = 0; i < n; i++) { let s = 0; const o = i * d; for (let k = 0; k < d; k++) s += db[o + k] * q[k]; if (s > best) best = s; } }, 10);
}
console.log(JSON.stringify(res));

// ---------- (3) onnxruntime-web WASM
ort.env.wasm.wasmPaths = pathToFileURL(path.resolve(ortDist)).href + '/';
const MODELS = [
  ['mnv4s', 'mnv4s/model.onnx', 224], ['mnv4s_q8', 'mnv4s/model_quantized.onnx', 224],
  ['mobileclip', 'mobileclip_s0/vision_model.onnx', 256], ['mobileclip_fp16', 'mobileclip_s0/vision_model_fp16.onnx', 256],
  ['ppocr_rec', 'ppocr_en/rec.onnx', [1, 3, 48, 320]],
  ['dinov2s', 'dinov2s/model.onnx', 224], ['dinov2s_q8', 'dinov2s/model_quantized.onnx', 224],
];
for (const threads of [1, 4]) {
  ort.env.wasm.numThreads = threads;
  for (const [name, file, size] of MODELS) {
    try {
      const sess = await ort.InferenceSession.create(fs.readFileSync(path.join(modelsDir, file)), { executionProviders: ['wasm'] });
      const shape = Array.isArray(size) ? size : [1, 3, size, size];
      const x = new ort.Tensor('float32', new Float32Array(shape.reduce((a, b) => a * b, 1)).map(() => Math.random()), shape);
      const feeds = { [sess.inputNames[0]]: x };
      await sess.run(feeds); // chauffe
      const t = [];
      for (let i = 0; i < 8; i++) { const t0 = performance.now(); await sess.run(feeds); t.push(performance.now() - t0); }
      console.log(JSON.stringify({ model: name, threads, ms_median: Math.round(med(t)) }));
      await sess.release();
    } catch (e) { console.log(JSON.stringify({ model: name, threads, error: String(e).slice(0, 200) })); }
  }
}
