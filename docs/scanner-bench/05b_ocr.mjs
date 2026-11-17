// Banc d'essai scanner - etape 5b : OCR avec Tesseract.js (meme moteur WASM que dans le navigateur).
// Usage : node 05b_ocr.mjs DATA_DIR LANG_DIR niveau strategie [nb_workers] [limite]
//   LANG_DIR contient eng.traineddata.gz et fra.traineddata.gz (paquets @tesseract.js-data/*, 4.0.0_best_int)
// Sortie : DATA_DIR/results/ocr_<niveau>_<strategie>.json  { id: { bg, bd, nom, ms_bg, ms_bd, ms_nom } }
import { createWorker } from 'tesseract.js';
import fs from 'node:fs';
import path from 'node:path';

const [dataDir, langDir, level, strat, nWorkersArg, limitArg] = process.argv.slice(2);
const nWorkers = parseInt(nWorkersArg || '4', 10);
const limit = parseInt(limitArg || '100000', 10);
const dir = path.join(dataDir, 'ocr', level, strat);
const ids = [...new Set(fs.readdirSync(dir).filter(f => f.endsWith('_bg.png')).map(f => f.slice(0, -7)))].sort().slice(0, limit);

// Reglages retenus apres essais (cf. recherche-scanner.md) : LSTM eng best_int, PSM 6, sans liste blanche
// (la liste blanche et le moteur legacy n'ont pas fait mieux sur ces petits numeros en italique).

async function makeWorker(lang, params) {
  const w = await createWorker(lang, 1, { langPath: langDir, cachePath: path.join(dataDir, 'tess-cache'), gzip: true });
  await w.setParameters(params);
  return w;
}

async function run() {
  fs.mkdirSync(path.join(dataDir, 'tess-cache'), { recursive: true });
  const workers = [];
  for (let i = 0; i < nWorkers; i++) {
    workers.push({
      num: await makeWorker('eng', { tessedit_pageseg_mode: '6' }),
      nom: await makeWorker('fra', { tessedit_pageseg_mode: '6' }),
    });
  }
  const out = {};
  let next = 0;
  async function loop(w) {
    while (next < ids.length) {
      const id = ids[next++];
      const r = {};
      for (const z of ['bg', 'bd', 'nom']) {
        const buf = fs.readFileSync(path.join(dir, `${id}_${z}.png`));
        const t0 = performance.now();
        const res = await (z === 'nom' ? w.nom : w.num).recognize(buf);
        r[`ms_${z}`] = Math.round(performance.now() - t0);
        r[z] = res.data.text.trim();
      }
      out[id] = r;
    }
  }
  const t0 = performance.now();
  await Promise.all(workers.map(loop));
  const total = performance.now() - t0;
  for (const w of workers) { await w.num.terminate(); await w.nom.terminate(); }
  fs.writeFileSync(path.join(dataDir, 'results', `ocr_${level}_${strat}.json`), JSON.stringify(out, null, 0));
  const ms = k => Object.values(out).map(r => r[k]).sort((a, b) => a - b);
  const med = a => a[Math.floor(a.length / 2)];
  console.log(`${level}/${strat}: ${ids.length} cartes, ${nWorkers} workers, ${(total / 1000).toFixed(1)} s ; mediane par zone (ms) bg=${med(ms('ms_bg'))} bd=${med(ms('ms_bd'))} nom=${med(ms('ms_nom'))}`);
}
run().catch(e => { console.error(e); process.exit(1); });
