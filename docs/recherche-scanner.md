# Scanner de cartes Pokémon : quelle reconnaissance dans la PWA ?

Banc d'essai mené le 17 novembre 2026 sur un Mac M3 Pro, avec des photos de téléphone simulées.
Les scripts sont dans `docs/scanner-bench/`. Les images, téléchargées depuis TCGdex, ne sont pas versionnées.

## En bref

1. **Le point faible n'est pas le descripteur, c'est le cadrage.** Avec les vrais coins de la carte, même un hash perceptuel de 24 octets reconnaît 99,6 % des cartes, y compris dans les pires conditions simulées. Recadrer bêtement le gabarit affiché à l'écran fait tomber ce même hash à 53 % en conditions difficiles. L'investissement prioritaire est donc un **détecteur de bords guidé par le gabarit** : environ 200 lignes de JS, sans OpenCV. Notre version ramène l'erreur médiane sur les coins à 0,2 % de la largeur de la carte.
2. **Meilleur descripteur mesuré : MobileCLIP-S0**, un embedding d'image exécuté par onnxruntime-web. Sur 498 cartes, il fait 99,8 % de top-1 en conditions moyennes et 98 à 99 % en conditions difficiles, même sans aucune détection. Il calcule une image en ~150 ms en WASM sur le Mac, soit de l'ordre de 0,2 s sur un iPhone récent et 0,5 s sur un Android milieu de gamme. Il a deux défauts. Le modèle pèse 21 Mo en fp16 (même précision qu'en fp32 ; les deux versions int8 testées sont cassées). Et il reconnaît mal une photo de carte FR si la base ne contient que l'image EN (87 %), parce qu'il « lit » le texte imprimé.
3. **L'option ultra-légère tient la route** : un hash combiné de 40 octets par carte (dHash horizontal + vertical de la carte, dHash couleur de l'illustration), calculé sur plusieurs hypothèses de cadrage (« multi-hypothèses »). Il atteint 99,6 % en conditions moyennes et 93,6 % en difficiles, sans aucune bibliothèque. La base pour 20 000 cartes pèse 0,8 Mo et la recherche prend moins d'1 ms.
4. **À l'échelle du catalogue (~20 200 cartes FR physiques), le top-1 baisse mais le top-5 tient.** Notre modèle d'extrapolation, un peu pessimiste, donne pour la meilleure combinaison (hash + MobileCLIP) environ 93 % de top-1 et 97 % de top-5 en conditions moyennes, 88 % et 96 % en difficiles. Il faut donc toujours montrer **3 à 5 propositions** et faire confirmer d'un tap.
5. **L'OCR du numéro sert à départager**, il ne peut pas être la méthode principale. Tesseract.js lit « 025/198 » dans 53 % des cas en bonnes conditions et 23 % en conditions moyennes. **PP-OCRv5 (reconnaissance seule, 7,8 Mo, même moteur ONNX)** monte à 85 % et 69 %. Il ne sert qu'à faire remonter la bonne carte parmi les 10 premières propositions visuelles. C'est indispensable pour les réimpressions à illustration identique (Super Bonbon `sv01-191` et `me01-125`, Énergies de base…), qu'aucune méthode visuelle ne sépare.

**Recommandation** (détail en parties 4 et 5) : gabarit à l'écran, puis photo fixe en pleine résolution, détection v2 et redressement. Ensuite, **hash combiné multi-hypothèses fusionné avec MobileCLIP-S0 (fp16)**, suivi d'un re-classement par numéro (PP-OCRv5). On montre 5 propositions, puis l'utilisateur choisit la variante (normale, reverse, holo) à la main. Estimation sur tout le catalogue en conditions moyennes : ~96 % de bonne carte en tête, ~97 % dans les 5 propositions. On livre d'abord le hash seul (MVP sans modèle), puis on ajoute MobileCLIP et l'OCR.

---

## 1. Veille : comment font les scanners existants

| Projet | Jeu | Détection de la carte | Identification | Remarques |
|---|---|---|---|---|
| [hj3yoo/mtg_card_detector](https://github.com/hj3yoo/mtg_card_detector/blob/master/README.md) | Magic | Tiny YOLOv3 au départ, puis contours OpenCV classiques (YOLO retiré en oct. 2018) | pHash de la carte entière contre ~10 000 cartes | Taille de hash 16 « suffisante dans la plupart des cas ». La carte doit être entièrement visible ; reflets et lumière gênent. |
| [Magic Card Detector (T. Ikonen)](https://tmikonen.github.io/quantitatively/2020-01-01-magic-card-detector) | Magic | CLAHE, seuillages, contours, enveloppe convexe, quadrilatère, perspective | pHash de la carte entière | Une carte n'est acceptée que si le meilleur score se détache des autres de plus de 4 écarts-types : bon modèle de seuil de confiance. |
| jslok/card-scanner | générique | Deep learning + OpenCV | dHash + pHash combinés, hashs allongés | Même idée que notre « combo ». Dépôt GitHub introuvable lors de la veille (404) : description reprise des index de projets. |
| [1vcian/Pokemon-TCGP-Card-Scanner](https://github.com/1vcian/Pokemon-TCGP-Card-Scanner) | Pokémon TCG Pocket | Boîtes englobantes | Hash perceptuel + distance de Hamming | Longueur de hash réglable (précision ou vitesse). |
| [NolanAmblard/Pokemon-Card-Scanner](https://github.com/NolanAmblard/Pokemon-Card-Scanner) | Pokémon | OpenCV (détection + normalisation) | Recherche en base | Approche classique. |
| [PokVault Rev](https://didierrlopes.github.io/pokemon-card-scanner-paper) | Pokémon (EN) | Cascade classique : contours, droites de Hough, segmentation par saturation, cadre par défaut à 15 % du bord | **CLIP ViT-B/16 dans le navigateur** (transformers.js + onnxruntime-web, WASM), 17 531 cartes, embeddings uint8 (516 o/carte, base 9,2 Mo) | Aucune mesure de précision ni de latence publiée. Variantes et réimpressions laissées au choix de l'utilisateur. |
| CardLens (SourceForge) | Pokémon | ? | MobileCLIP2-S0 (ONNX Runtime) + OCR du nom | Application Rust de bureau. |
| [TCGscanner](https://huggingface.co/Adrihp06/TCGscanner-detector) | multi-jeux | YOLO (ONNX) | Embeddings SigLIP 2 + LanceDB (serveur) | |
| [fortierq/mtgscan](https://github.com/fortierq/mtgscan) | Magic | — | **OCR** (Azure) + correspondance approximative sur les noms | Approche « texte d'abord ». |
| [renderghost/pokemon-scanner](https://github.com/renderghost/pokemon-scanner) | Pokémon | TensorFlow.js | Tesseract.js sur le nom | Reconnaît le Pokémon, pas la carte précise. |
| [pokemon-card-recognizer](https://pypi.org/project/pokemon-card-recognizer/) | Pokémon | — | OCR (EasyOCR ou PyTesseract) du nom et du numéro | Python, références pré-construites par série. |
| [PokeScope](https://pokescope.app/blog/how-i-built-pokemon-card-scanner-ai-50000-users/) (commercial) | Pokémon | ? | Embeddings CLIP + OCR du numéro en bas de carte | D'après le billet de son auteur. |

**À retenir**
- Deux familles coexistent. Les **hashs perceptuels** sur la carte redressée (la plupart des projets Magic, simples et légers) et les **embeddings** de type CLIP (projets récents, plus robustes, plus lourds). L'OCR seul (mtgscan) marche pour Magic, dont le nom est gros et unique. Il marche mal pour Pokémon, où une carte partage son nom avec 11,7 autres en moyenne (131 cartes « Pikachu » dans le catalogue FR).
- Tous les projets sérieux redressent la carte (homographie) avant de la décrire. C'est aussi le facteur n°1 de notre banc (partie 3.3).
- Personne ne publie de précision mesurée sur un catalogue complet. D'où le banc ci-dessous.

### Poids des bibliothèques (mesurés sur les paquets npm, novembre 2026)

| Brique | Fichiers chargés par le navigateur | Brut | Transfert (brotli) |
|---|---|---|---|
| **onnxruntime-web 1.31.1** (WASM, CPU) | `ort-wasm-simd-threaded.wasm` + `ort.wasm.min.mjs` | 14,9 Mo | **2,4 Mo** |
| onnxruntime-web, variante WebGPU | `ort-wasm-simd-threaded.jsep.wasm` | 29,5 Mo | 4,0 Mo |
| @huggingface/transformers 4.3.2 (facultatif, s'appuie sur onnxruntime-web) | `transformers.web.min.js` | 0,46 Mo | 0,11 Mo |
| Tesseract.js 7.0.0 | `tesseract.min.js` + `worker.min.js` + `tesseract-core-simd-lstm.wasm` | 3,0 Mo | 0,86 Mo |
| + données de langue (best_int) | `eng.traineddata.gz` / `fra.traineddata.gz` | 2,95 / 0,71 Mo | idem (déjà compressées) |
| OpenCV.js (@techstark/opencv-js 5.0) | `opencv.js` (WASM embarqué) | 13,3 Mo | 2,7 Mo |
| jscanify 1.4.3 | embarque son propre `opencv.js` | 9,0 Mo | 2,0 Mo |
| scanic 1.7.1 (Rust/WASM : Canny + contours + coins) | `scanic.js` | 0,11 Mo | **0,04 Mo** |
| MediaPipe Tasks Vision 1.2.3 (ImageEmbedder) | `vision_wasm_internal.wasm` (+ modèle) | 14,7 Mo | 2,8 Mo |
| blockhash-core | JS | 8,5 Ko | — |

| Modèle (ONNX) | Brut | Brotli | Remarque |
|---|---|---|---|
| MobileCLIP-S0, vision, fp32 (`Xenova/mobileclip_s0`) | 45,5 Mo | 42,2 Mo | référence du banc |
| **MobileCLIP-S0, vision, fp16** | 22,9 Mo | **21,0 Mo** | **même précision que fp32**, tourne en WASM (150 ms) : à retenir |
| MobileCLIP-S0, vision, int8 « par canal » (quantifié par nous) | 11,9 Mo | 8,0 Mo | **inutilisable** (1,4 % de top-1) |
| MobileCLIP-S0, vision, int8 de Hugging Face (`model_quantized`) | 11,8 Mo | — | **inutilisable** : 3 à 17 % de top-1 |
| DINOv2-small int8 (`Xenova/dinov2-small`) | 24,5 Mo | 19,5 Mo | même précision que fp32 |
| MobileNetV4-conv-small int8 | 3,9 Mo | 2,6 Mo | |
| CLIP ViT-B/32 vision int8 | 89 Mo | — | trop lourd, et moins bon que MobileCLIP |
| PP-OCRv5 mobile rec, anglais (`monkt/paddleocr-onnx`) | 7,8 Mo | 7,2 Mo | lecture du numéro |

---

## 2. Banc d'essai

### 2.1 Données

- **498 cartes FR** tirées au hasard (graine fixe). Quatre séries récentes : Écarlate et Violet `sv01` (88), 151 `sv03.5` (86), Étincelles Déferlantes `sv08` (85), Méga-Évolution `me01` (87). Deux anciennes : Set de Base `base1` (102, 1999, scans de vraies cartes à bord jaune) et XY `xy1` (50, 2014). Nous avons forcé l'inclusion des « Super Bonbon » et « Échange », réimprimés avec la même illustration.
- **Les mêmes 498 cartes en anglais** (toutes disponibles).
- La base de référence utilise `low.webp` (245×337, ~19 Ko). Les photos sont simulées à partir de `high.webp` (600×825, ~73 Ko). Au total, 1 494 images (58 Mo), téléchargées à 8 requêtes/s au plus.
- Catalogue complet (`GET /v2/fr/cards`, 1 requête) : **20 226 cartes physiques FR**, une fois exclues les cartes de TCG Pocket (séries `A*`, `B*`, `P-A`, à exclure de la base). Parmi elles, **17 285 ont une image FR (85 %)**. Ailleurs, l'image manque côté FR : la Collection Classique de Célébrations n'en a dans aucune langue, et Diamant & Perle `dp1` n'a aucune image FR. Il faudra donc se rabattre sur l'image EN.

### 2.2 Photos simulées

Chaque photo mesure 1080×1440 px (portrait). Le gabarit à l'écran couvre 66 % de la largeur (713×980 px). On projette la carte en 3D devant une caméra de téléphone (champ d'environ 67°), puis on dégrade l'image :

| | Facile | Moyen | Difficile |
|---|---|---|---|
| Inclinaison (perspective), par axe | ±5° | ±10° | ±15° |
| Rotation dans le plan | ±3° | ±6° | ±10° |
| Décalage / échelle par rapport au gabarit | ±2 % / 0,95–1,02 | ±4 % / 0,90–1,05 | ±6 % / 0,85–1,07 |
| Flou (σ px) / bougé | 0–0,7 / — | 0,4–1,3 / 30 % des photos | 0,8–2,0 / 50 % |
| Perte de résolution | ×0,85–1 | ×0,6–0,9 | ×0,45–0,75 |
| Bruit (σ) / JPEG (qualité) | 1–3 / 85–95 | 2–6 / 65–85 | 4–10 / 45–70 |
| Exposition, contraste, gamma, dominante de couleur | léger | moyen (±8 %) | fort (±12 %) |
| Reflet (tache blanche) | 20 % des photos, petit | 60 %, 6–15 % de la largeur | 100 %, 10–25 %, saturé |
| Ombre / pouce sur un bord | — | 25 % / 5 % | 50 % / 20 % |
| Fonds | uni, bois, tissu | + papier blanc, fond encombré (objets, autres cartes) | idem, encombré plus fréquent |

Ces photos sont tirées des mêmes rendus que la base. Elles sont donc **optimistes** sur trois points : les effets holo et reverse, les différences d'impression, les pochettes plastique (le reflet n'en donne qu'une approximation). Le niveau « difficile » est volontairement dur : le numéro y est souvent illisible à l'œil.

### 2.3 Méthodes comparées

- **Cadrage** :
  - `gabarit` : on découpe le rectangle du gabarit, sans aucune détection.
  - `contours` : Canny + contours + approxPolyDP, à la manière de jscanify ou OpenCV.js.
  - `auto` : **détection v2**, décrite en 3.3.
  - `auto+3,5 %` : la même, agrandie, pour le cas où le bord intérieur du liseré a été pris pour le bord de la carte.
  - `multi` : on garde la meilleure distance parmi les 4 cadrages précédents.
  - `vrais coins` : borne haute, qui mesure le descripteur seul.
- **Hashs** (carte entière sans les coins arrondis, ou fenêtre d'illustration seule) : aHash, dHash, pHash en 64 et 256 bits, dHash horizontal + vertical, dHash couleur (canaux Y, Cr, Cb : 192 bits), et des combinaisons.
- **Embeddings**, calculés avec ONNX Runtime (les mêmes fichiers que onnxruntime-web) : MobileNetV4-conv-small ImageNet (sortie du global pooling, 960 d), DINOv2-small (jeton CLS, 384 d), MobileCLIP-S0 (512 d), CLIP ViT-B/32 int8 (512 d).
- **Recherche** : distance de Hamming ou cosinus, en force brute sur toute la base. Le top-k est compté par identifiant de carte. Dans une base FR+EN, la carte compte comme trouvée si l'une de ses deux images sort.

---

## 3. Résultats

### 3.1 Tableau principal (photo FR vers base FR, 498 cartes, top-1 / top-5 en %)

| Descripteur | Octets/carte en base | Cadrage | Facile | Moyen | Difficile | Photo FR vers base EN (moyen) |
|---|---|---|---|---|---|---|
| dHash 64 bits, carte | 8 | auto | 99,6 / 100 | 94,0 / 97,4 | 74,3 / 85,5 | 84,3 / 93,0 |
| pHash 64 bits, carte | 8 | auto | 99,2 / 100 | 92,0 / 96,6 | 69,5 / 82,9 | 83,5 / 93,2 |
| pHash 256 bits, carte | 32 | auto | 99,8 / 100 | 97,0 / 97,6 | 87,3 / 88,8 | 96,4 / 97,4 |
| pHash 256 bits, carte | 32 | multi | 100 / 100 | 98,6 / 99,4 | 90,0 / 92,2 | 97,4 / 99,0 |
| pHash 256 bits, **illustration seule** | 32 | multi | 100 / 100 | 96,4 / 97,4 | 86,5 / 89,6 | 94,2 / 96,2 |
| **dHash couleur 192 bits, carte** | **24** | gabarit | 99,6 / 100 | 93,8 / 98,8 | 52,8 / 71,1 | 87,8 / 95,8 |
| **dHash couleur 192 bits, carte** | **24** | auto | 99,8 / 100 | 97,2 / 98,8 | 90,8 / 94,0 | 96,8 / 98,4 |
| **dHash couleur 192 bits, carte** | **24** | **multi** | **99,8 / 100** | **99,6 / 100** | **93,8 / 96,4** | **98,0 / 99,8** |
| dHash H+V 128 + dHash couleur illustration 192 | 40 | multi | 99,8 / 100 | 99,6 / 99,8 | 93,6 / 96,6 | 99,2 / 99,8 |
| MobileNetV4-small (ImageNet) | 960 | auto | 99,8 / 100 | 96,0 / 97,8 | 69,7 / 82,1 | 90,2 / 96,2 |
| DINOv2-small (int8) | 384 | auto | 99,6 / 100 | 99,4 / 100 | 89,0 / 95,0 | 99,4 / 100 |
| DINOv2-small (int8) | 384 | multi | 99,6 / 100 | 99,6 / 100 | 92,4 / 97,6 | 99,6 / 100 |
| **MobileCLIP-S0** | **512** | **gabarit (sans détection)** | **99,8 / 100** | **99,8 / 100** | **98,2 / 99,8** | 86,9 / 95,8 |
| **MobileCLIP-S0** | **512** | auto | 99,6 / 100 | 99,8 / 100 | 99,0 / 100 | 87,8 / 96,4 |
| MobileCLIP-S0 | 512 | multi | 99,6 / 100 | 100 / 100 | 99,2 / 100 | 86,9 / 95,8 |
| **MobileCLIP-S0 fp16** | 512 | gabarit | (non testé) | 99,8 / 100 | 98,2 / 99,8 | 87,1 / 95,6 |
| **MobileCLIP-S0 fp16** | 512 | auto | (non testé) | 99,8 / 100 | 99,0 / 100 | 87,8 / 96,4 |
| MobileCLIP-S0 int8 de Hugging Face | 512 | auto | 13,5 / 26,3 | 3,2 / 9,8 | 2,2 / 5,2 | 4,0 / 9,6 |
| MobileCLIP-S0 int8 par canal (le nôtre) | 512 | auto | (non testé) | 1,6 / 5,8 | 0,0 / 0,0 | 0,6 / 4,2 |
| CLIP ViT-B/32 int8 | 512 | gabarit | 98,4 / 100 | 93,8 / 98,6 | 81,9 / 93,2 | 63,7 / 82,5 |

Dans une **base mixte FR+EN**, les résultats sont quasi identiques à ceux de la base FR : MobileCLIP fait 99,8 % en moyen, le dHash couleur multi 99,6 %. On peut donc mettre les deux langues dans la base.

Le tableau complet (toutes les variantes, 5 cadrages, FR vers EN et FR vers FR+EN) se régénère avec `10_tables.py`.

### 3.2 Ce que disent les chiffres

- **En conditions faciles, tout marche** (≥ 99 %), même un dHash 64 bits.
- **Les hashs sont presque insensibles au flou, au bruit et aux reflets** : 99,6 à 100 % avec les vrais coins, même en difficile. En revanche, ils s'effondrent dès que la carte est mal cadrée. Le dHash couleur résiste mieux que le pHash à un cadrage approximatif (93,8 % contre 61,2 % en moyen, avec le gabarit seul).
- **Les embeddings tolèrent mal le cadrage… sauf MobileCLIP**, qui encaisse à la fois le cadrage approximatif et les dégradations. DINOv2 souffre en difficile (87 à 92 %). MobileNetV4 (ImageNet) est nettement en dessous. CLIP ViT-B/32 est moins bon que MobileCLIP-S0 tout en étant 4 fois plus lourd.
- **Hashs de l'illustration seule** : aucun avantage sur la carte entière, même de FR vers EN. Le texte change peu un hash de 8×8 ou 16×16. On reste sur la carte entière.
- **Photo FR, image EN seule en base** : hashs et DINOv2 ne perdent que 1 à 2 points. MobileCLIP perd 12 points (87 %) : comme les modèles CLIP « lisent » le texte, un texte différent l'éloigne. Conséquence pour la base : **mettre l'image FR quand elle existe et l'image EN en plus** (ou à défaut), sous le même identifiant de carte. La fusion hash + MobileCLIP règle le problème : 99,6 % (moyen) et 96,4 % (difficile) de la photo FR vers l'image EN seule.
- **Les réimpressions à illustration identique** (`sv01-191` et `me01-125` Super Bonbon, `sv01-194` et `me01-130` Échange) sont les seules erreurs de MobileCLIP en conditions moyennes, et aussi les erreurs typiques des hashs. Côté visuel, c'est un tirage à pile ou face (similarité cosinus 0,98 entre les deux images de référence). Seul le numéro (`191/198` contre `125/132`) ou l'utilisateur peut trancher.
- **Quantification** : l'int8 « officiel » de MobileCLIP-S0 (`model_quantized.onnx`, quantification par tenseur des convolutions) détruit le modèle. DINOv2 int8 ne perd rien. Notre propre int8 « par canal » échoue aussi (1,4 %) : la quantification dynamique des convolutions ne convient pas à ce modèle. La **version fp16** (22,9 Mo, 21 Mo compressée) donne exactement les mêmes scores que fp32 et tourne dans onnxruntime-web en WASM : c'est elle qu'il faut prendre.
- **Hash seul de la couleur contre hash combiné** : sur 498 cartes, le dHash couleur (24 octets) et le combo (40 octets) font jeu égal. Sur tout le catalogue, le combo tient nettement mieux (environ 93 % contre 85 % de top-1 estimé en conditions moyennes, partie 3.5). On retient donc le combo.
- **Compression de la base MobileCLIP** : l'int8 en 512 d ne perd rien. Une ACP à 256 d en int8 coûte 0,4 point en difficile, une ACP à 128 d entre 0,8 et 1,2 point. La base fait 10,5 Mo pour 20 000 cartes en 512 d, ou 5,2 Mo en 256 d.

### 3.3 Détection et redressement

| Méthode | Erreur des coins < 2 % (facile / moyen / difficile) | Médiane (moyen) | Temps (Python) |
|---|---|---|---|
| Contours classiques (Canny + approxPolyDP, type jscanify) | 75 / 43 / 27 % | 2,7 % | ~10 ms |
| **Détection v2 (gabarit + contours + recalage des bords)** | **93 / 81 / 72 %** | **0,2 %** | ~80 ms |
| v2 avec la seule hypothèse « gabarit » (sans aucun suivi de contours) | 91 / 75 / 60 % | 0,2 % | ~65 ms |

**Principe de la détection v2** (`benchlib.py`, `refine_quad`) :
1. On part de deux hypothèses grossières : le rectangle du gabarit et le meilleur quadrilatère issu des contours.
2. Pour chacun des 4 bords, on échantillonne 40 points. Le long de la normale à chaque point, on cherche les maxima du gradient directionnel, calculé en Lab.
3. On ajuste une droite par RANSAC, en préférant la droite **la plus extérieure** parmi celles qui ont presque autant de points d'appui que la meilleure. C'est ce qui évite de prendre le cadre de l'illustration ou le bord intérieur du liseré.
4. Les coins sont les intersections des 4 droites : ce sont des coins « virtuels », insensibles aux coins arrondis. On fait une seconde passe fine.
5. On garde le quadrilatère le plus « carte » : appui des bords, proportions 0,727, surface proche du gabarit.

Ce ne sont que des gradients, de l'échantillonnage et du RANSAC, faciles à porter en JS sans OpenCV. Sur fond uni, bois ou tissu, la réussite atteint 85 à 95 %. Les échecs restants viennent surtout d'**autres cartes qui chevauchent celle qu'on scanne** (fond encombré : 72 % en moyen, 57 % en difficile), des **cartes à liseré argenté posées sur du papier blanc** (51 à 54 %) et du **pouce sur un bord** (62 à 72 %). Le multi-hypothèses (on hashe 4 cadrages et on garde le meilleur score) rattrape une bonne partie de ces échecs : avec le dHash couleur, on passe de 97,2 à 99,6 % en moyen.

### 3.4 OCR du numéro de collection et du nom

Les zones sont fixes sur la carte redressée : bas gauche pour « 025/198 » (séries 2016 et suivantes), bas droite pour « 4/102 » ou « 10/146 » (séries anciennes). Le nom est lu dans le bandeau du haut. La lecture est validée par les totaux de série existants. Une lecture « tolérante » rattrape le « / » lu comme un 7, un 1 ou un 0 (« 2117191 » devient 211/191).

| Moteur | Niveau | Numéro exact | Illisible | **Faux** | Séries 2023+ | Séries 1999/2014 | Temps (2 zones) |
|---|---|---|---|---|---|---|---|
| Tesseract.js 7 (eng best_int, PSM 6) | facile | 53,0 % | 43,8 % | 3,2 % | 62,1 % | 32,2 % | ~62 ms (WASM, bureau) |
| | moyen | 22,7 % | 73,3 % | 4,0 % | 28,9 % | 8,6 % | |
| | difficile | 3,4 % | 96,2 % | 0,4 % | 4,6 % | 0,7 % | |
| **PP-OCRv5 mobile rec (ONNX)** | facile | **84,7 %** | 11,2 % | 4,0 % | 82,1 % | 90,8 % | ~33 ms (natif, 1 thread) ; ~70 ms en WASM (35 ms par zone) |
| | moyen | **68,5 %** | 27,7 % | 3,8 % | 69,4 % | 66,4 % | |
| | difficile | 12,4 % | 85,1 % | 2,4 % | 15,0 % | 6,6 % | |

- Nous avons essayé plusieurs réglages de Tesseract : PSM 6, 7 ou 11, liste blanche de chiffres, moteur « legacy », binarisation, agrandissement ×3 ou ×4, marges. Le meilleur ne dépasse pas 72 % sur l'image **parfaite** (rendu TCGdex de 600 px, séries récentes, 40 cartes). Le chiffre en italique de 10 px de haut, collé au code de série, ne lui convient pas.
- Le **nom** est plus gros et Tesseract (fra) le lit mieux : 63, 56 et 32 % (correspondance approximative avec les noms du catalogue). Mais un nom désigne en moyenne 12 cartes, il ne sert qu'en appoint.
- **Le texte est limité par la résolution.** Une carte de 600 à 700 px de large dans l'image ne laisse que 8 à 12 px de hauteur au numéro. Il faut **capturer en pleine résolution** (photo fixe, pas une image de la vidéo en 720p) et lire les zones directement dans l'image d'origine.
- **Re-classement prudent** : une lecture n'agit que si elle correspond à l'une des 10 premières propositions visuelles. Une lecture fausse n'a donc presque jamais d'effet. Mesuré sur 498 cartes en conditions moyennes, avec PP-OCR et le nom lu par Tesseract : dHash couleur sur gabarit seul de 93,8 à 98,8 %, MobileCLIP de 99,8 à 100 % (la réimpression Super Bonbon est résolue). En difficile, l'OCR ne lit presque rien et n'apporte rien.

### 3.5 Extrapolation à tout le catalogue (~20 200 cartes FR)

**Taille de la base** (20 226 cartes, une image par carte ; à doubler pour FR+EN) :

| Contenu | Taille |
|---|---|
| dHash couleur 192 bits | 0,49 Mo |
| combo dHash H+V 128 + dHash couleur illustration | 0,81 Mo |
| MobileCLIP-S0 512 d int8 (une échelle globale) | 10,4 Mo (5,2 Mo en ACP 256) |
| Métadonnées (id, nom, série, numéro, total, variantes) en JSON | ~1,6 Mo brut, ~0,3 Mo gzip |

**Temps de recherche** (force brute, mesurée en JS sous Node 26, M3 Pro) :
- distance de Hamming sur 20 000 hashs de 256 bits : 0,2 ms ; de 448 bits : 0,35 ms (0,4 et 0,7 ms pour 40 000 entrées FR+EN) ;
- produit scalaire int8 sur 20 000 × 384 : 5,6 ms, soit environ 7,5 ms en 512 d et 15 ms pour 40 000 entrées ;
- calcul d'un dHash 256 bits avec réduction par moyenne de zone depuis 600×825 : 0,8 ms ; d'un pHash 64 bits : 1,3 ms.

La recherche n'est jamais le goulot : pas besoin d'index (FAISS, HNSW…).

**Précision attendue.** Avec seulement 498 cartes, on ne peut pas mesurer directement ce qui se passe à 20 000. Nous avons donc modélisé, pour chaque photo, le risque qu'un intrus passe devant la bonne carte (`09_extrapolation.py`) :
- pour les intrus de **nom différent**, avec une loi des valeurs extrêmes (Pareto généralisée) ajustée sur les 15 % d'intrus les plus proches ;
- pour les intrus de **même nom** (même Pokémon, réimpressions), avec le taux mesuré dans l'échantillon, multiplié par le nombre réel de cartes portant ce nom dans le catalogue (11,7 en moyenne).

Sur l'échantillon de 498 cartes, le modèle prédit 1 à 2 points de moins que la mesure : il est **un peu pessimiste**.

| Configuration | Mesuré sur 498 cartes, top-1 (moyen / difficile) | Catalogue, top-1 (moyen / difficile) | Catalogue, top-5 | Catalogue + numéro lu par PP-OCR, top-1 |
|---|---|---|---|---|
| dHash couleur 192 bits, multi | 99,8 / 93,6 | 85,3 / 77,3 | 96,6 / 91,0 | 93,6 / 79,7 |
| Hash combiné 40 octets, multi | 99,6 / 93,6 | 92,7 / 77,2 | 97,9 / 92,0 | 97,1 / 79,4 |
| MobileCLIP-S0, gabarit seul | 99,8 / 98,4 | 90,2 / 75,4 | 96,9 / 95,4 | 94,6 / 78,0 |
| MobileCLIP-S0, multi | 100 / 99,2 | 94,2 / 80,2 | 97,1 / 96,5 | 96,3 / 82,1 |
| DINOv2-small, auto | 99,6 / 87,6 | 83,5 / 57,2 | 94,9 / 80,9 | 92,1 / 60,9 |
| **Fusion : hash combiné (multi) + MobileCLIP (gabarit)** | 99,8 / 98,4 | **93,1 / 87,9** | **97,3 / 96,1** | **96,0 / 88,9** |

Le détail (niveau facile, autres variantes, top-10) se trouve dans `extrapolation.json`, régénéré par `09_extrapolation.py` et `10_tables.py`.

Ce qu'on en retient :
- Le top-1 « visuel » perd 5 à 15 points en passant de 500 à 20 000 cartes, davantage en conditions difficiles. La cause principale : les cartes de même nom (131 Pikachu, 61 Évoli…) et les réimpressions.
- Le **top-5 reste à 96-98 %** en conditions moyennes pour les bonnes configurations : la bonne carte est presque toujours dans la liste.
- Le **numéro lu par PP-OCR** remet la bonne carte en tête dans la plupart des cas (+2 à +8 points de top-1 en conditions moyennes).
- En conditions difficiles, l'OCR n'aide plus (image trop floue). C'est alors la **fusion avec MobileCLIP** qui fait la différence : 88 % contre 77 % pour le hash seul.

Ce sont des ordres de grandeur, valables pour des photos comparables aux nôtres.

### 3.6 Temps de calcul sur téléphone

Mesures sur M3 Pro, dans Node 26 (V8 et WASM SIMD, mêmes moteurs que Chrome), en mono-thread : sous Node, onnxruntime-web n'a pas tiré parti de 4 threads (temps identiques).

| Étape | Temps sur M3 Pro |
|---|---|
| dHash 256 bits avec réduction (JS) | 0,8 ms par hypothèse de cadrage |
| Redressement d'une carte de 300×412 (JS, estimé) | 2 à 3 ms par hypothèse |
| Détection v2 | 65 à 80 ms en Python ; portage JS estimé entre 30 et 60 ms |
| Recherche hash + embeddings sur 20 000 cartes | ~8 ms |
| **MobileCLIP-S0 fp32 / fp16** (onnxruntime-web 1.31, WASM) | **149 / 150 ms** |
| DINOv2-small fp32 / int8 | 272 / 276 ms |
| MobileNetV4-small fp32 / int8 | 13 / 18 ms |
| **PP-OCRv5 rec**, une zone de 48×320 | **35 ms** |
| Tesseract.js, numéro (2 zones) / nom | ~62 / ~65 ms |

Pour passer au téléphone, nous appliquons des facteurs tirés des scores mono-cœur publics (Geekbench 6, ordre de grandeur) : environ ×1,2 à 1,5 pour un iPhone récent (A16 à A18), ×3 pour un Android milieu de gamme (Snapdragon 7 / Exynos 1380), ×4 à 5 pour un Android d'entrée de gamme. Le multi-thread WASM n'est disponible que si la page est « cross-origin isolated » (en-têtes COOP/COEP). Sur un hébergement statique qui ne permet pas de les poser, on peut passer par un service worker ou rester en mono-thread.

Estimation par scan, de la photo prise aux propositions, en mono-thread :

| | iPhone récent | Android milieu de gamme | Android d'entrée de gamme |
|---|---|---|---|
| Détection + hash multi-hypothèses + recherche | ~0,1 s | ~0,2 s | ~0,35 s |
| + MobileCLIP-S0 | ~0,2 s | ~0,45 s | ~0,7 s |
| + PP-OCR (2 zones) | ~0,1 s | ~0,2 s | ~0,3 s |
| **Total** | **~0,4 s** | **~0,9 s** | **~1,4 s** |

S'y ajoutent, une fois par session, le téléchargement du modèle (s'il n'est pas en cache) et la création de la session ONNX, que nous n'avons pas mesurée. Il faut la lancer dans un Web Worker dès l'ouverture de l'écran de scan, pour ne pas bloquer l'interface. Avec WebGPU (Safari iOS 26, Chrome Android), MobileCLIP irait plus vite, mais la variante WebGPU d'onnxruntime-web pèse 4 Mo au lieu de 2,4 Mo : c'est une piste pour plus tard.

### 3.7 Limites du banc

- Photos **simulées** à partir des rendus TCGdex : les vrais holos, reverses, cartes texturées, pochettes et cartes abîmées ne sont pas couverts. Avant de figer les seuils, il faut **un jeu de 50 à 100 vraies photos** prises avec 2 ou 3 téléphones du groupe.
- 6 séries seulement. Les séries « piège » à illustration identique (Set de Base 2, Legendary Collection, Collection Classique, Énergies de base) n'ont pas pu être testées. Les Énergies de base sont presque toutes identiques d'une série à l'autre : seuls le symbole et le numéro les distinguent.
- Les temps sur téléphone sont extrapolés à partir de mesures sur ordinateur, pas mesurés.
- L'extrapolation à 20 000 cartes repose sur un modèle statistique : elle donne un ordre de grandeur, pas une mesure.

---

## 4. Pipeline recommandé pour la PWA

### 4.1 Étapes

1. **Prise de vue.**
   - Ouvrir la caméra arrière avec `getUserMedia({video: {facingMode: 'environment', width: {ideal: 3840}, height: {ideal: 2160}}})`.
   - Superposer un **gabarit au format de la carte** (63×88) qui occupe environ 2/3 de la largeur, avec un rappel : « carte à plat, sans reflet, qui remplit le cadre ».
   - Au tap (ou automatiquement quand l'image est stable), prendre une **photo fixe** : `ImageCapture.takePhoto()` là où il existe (Chrome Android), sinon l'image vidéo à la résolution maximale. On travaille en ~1080 px de large pour la détection et en pleine résolution pour l'OCR.
2. **Détection v2** (JS maison, environ 200 lignes) : hypothèse « gabarit » et hypothèse « contours », puis recalage des 4 bords (3.3). Pour les contours, on peut porter notre code, ou prendre le détecteur de **scanic** (40 Ko) comme hypothèse supplémentaire. **OpenCV.js n'est pas nécessaire** (2,7 Mo).
3. **Redressement** par homographie (calcul 3×3 et échantillonnage bilinéaire en JS) : carte canonique de 300×412 pour les descripteurs, zones du numéro en pleine résolution pour l'OCR.
4. **Descripteur rapide : hash combiné de 40 octets** (dHash horizontal + vertical 128 bits de la carte entière, plus dHash couleur 192 bits de la fenêtre d'illustration) sur 4 cadrages : quadrilatère détecté, détecté +3,5 %, gabarit, contours. On garde le meilleur score par carte. Comptez moins de 20 ms en tout, sans aucune bibliothèque.
5. **Descripteur robuste : MobileCLIP-S0 fp16** (onnxruntime-web, WASM, 21 Mo compressé) sur le recadrage du gabarit, ou sur la carte redressée : les deux donnent 98 à 99 %. Le modèle est chargé en différé : l'appli fonctionne en hash seul tant qu'il n'est pas en cache.
6. **Fusion** : on additionne les scores normalisés (z-score par requête, sur toute la base) du hash et de MobileCLIP, puis on garde le top-10. Mesuré sur 498 cartes : 99,8 % (moyen) et 98,4 % (difficile). Estimé sur tout le catalogue : ~93 et ~88 % de top-1, ~97 et ~96 % de top-5. La fusion compense aussi la faiblesse de MobileCLIP quand la base n'a que l'image EN d'une carte : photo FR contre image EN, elle fait 99,6 % (moyen) et 96,4 % (difficile), contre 87 et 74 % pour MobileCLIP seul.
7. **Numéro** : PP-OCRv5 mobile rec lit les 2 zones fixes (bas gauche, bas droite) dans l'image en pleine résolution. Si « n/t » correspond à une carte du top-10, elle passe en tête. Pour réduire le coût, on ne lance l'OCR que si les deux premières propositions sont proches, ou si le top-10 contient plusieurs cartes du même nom.
8. **Affichage de 3 à 5 propositions** (vignette TCGdex, nom, série, numéro) : un tap pour confirmer, « Aucune ne correspond » ouvre la recherche par nom ou numéro.
9. **Variantes** : TCGdex fournit `variants` par carte (`normal`, `reverse`, `holo`, `firstEdition`, `wPromo`), mais une seule image pour toutes. Après confirmation, on affiche des pastilles avec les seules variantes qui existent pour la carte, préselectionnées sur « normale » quand elle existe, puis la langue (FR/EN), la quantité et l'état. Aucune méthode visuelle ne distingue une reverse d'une normale de façon fiable (motif holographique partiel, reflets) : le choix manuel reste la bonne solution.
10. **Seuil de confiance** : si l'écart entre la 1ʳᵉ et la 2ᵉ proposition est grand (à calibrer sur les vraies photos), on peut préremplir directement. Sinon, on demande le choix.

### 4.2 Ce qu'il faut charger

| Élément | Transfert | Quand |
|---|---|---|
| Code de l'appli (détection, hash, recherche, interface) | < 100 Ko | au premier lancement |
| Base de hashs + métadonnées (FR+EN) | ~1 à 2 Mo | au premier lancement, mise à jour par série |
| onnxruntime-web (WASM) | 2,4 Mo | au premier scan « précis » |
| MobileCLIP-S0, vision, fp16 | 21 Mo | idem, mis en cache par le service worker (à proposer en Wi-Fi) |
| Embeddings de la base (20 000 × 512 int8) | 10,4 Mo (5,2 Mo en ACP 256) | idem, par série |
| PP-OCRv5 rec + dictionnaire | 7,2 Mo | au premier besoin d'OCR |

Tesseract.js (0,9 Mo + 3,7 Mo de données de langue) n'est **pas** recommandé pour le numéro. Il ne sert qu'à lire le nom, et il n'est pas indispensable.

### 4.3 Génération de la base (script de build)

Un script Node (`scripts/build-db.mjs`), lancé à la main ou par une GitHub Action à chaque nouvelle série :

1. `GET /v2/{fr,en}/sets`, en écartant TCG Pocket (`^A\d|^B\d|^P-A`). Puis `GET /v2/{lang}/sets/{id}` pour la liste des cartes (`id`, `localId`, `name`, `image`) et `cardCount.official` (le total imprimé « /198 »).
2. Les variantes s'obtiennent en masse par l'API GraphQL de TCGdex (`POST https://api.tcgdex.net/v2/graphql`). La requête `cards(filters: {...}, pagination: {page, count})` avec `variants { normal reverse holo firstEdition }` fonctionne (testé). Ce n'est pas le cas en passant par `set { cards }`, où `variants` revient vide. Il faut donc éviter 20 000 appels à `GET /v2/{lang}/cards/{id}`. On met tout en cache sur disque.
3. Télécharger `{image}/low.webp` (~20 Ko ; 20 000 cartes FR font ~400 Mo et environ 45 min à 8 requêtes/s, une seule fois, ensuite en incrémental). **Sans image FR, prendre l'image EN** : même identifiant, même illustration.
4. Calculer les descripteurs **avec exactement le même code JS que le client** : même redimensionnement par moyenne de zone, mêmes régions, même prétraitement MobileCLIP (256×256, valeurs /255). On décode les WebP avec `sharp` et on exécute MobileCLIP avec `onnxruntime-node`.
5. Écrire `cards.json` (métadonnées compactes), `hash.bin` (Uint8Array, n × 40 octets), `emb.bin` (Int8Array, n × 512, plus l'échelle) et un `version.json`. Publier avec la PWA en fichiers statiques. Le service worker les met en cache et ne retélécharge que les séries nouvelles.

Pour 20 000 cartes, le calcul prend environ 10 minutes sur un portable (MobileCLIP ~22 ms par image en natif).

---

## 5. Recommandation

- **Phase 1 (MVP, sans modèle)** : gabarit, photo fixe, détection v2, **hash combiné de 40 octets en multi-hypothèses**, 5 propositions, puis choix de la variante. Mesuré à 99,6 % en conditions moyennes et 93,6 % en difficiles sur 498 cartes. Sur tout le catalogue, l'estimation donne ~93 % de top-1 et ~98 % de top-5 en conditions moyennes. Rien à télécharger hors base (~2 Mo pour FR+EN).
- **Phase 2** : ajouter **MobileCLIP-S0 fp16** (21 Mo) et la fusion des scores. Gain principal : les photos ratées (flou, reflet, mauvais cadrage). En conditions difficiles, le top-1 estimé sur le catalogue passe de ~77 à ~88 % et le top-5 de ~92 à ~96 %.
- **Phase 3** : ajouter **PP-OCRv5 rec** pour le numéro, ce qui règle les réimpressions et les cartes de même nom.
- **À éviter** : Tesseract.js pour le numéro (trop peu fiable sur ces petits chiffres en italique) ; l'int8 MobileCLIP de Hugging Face (cassé) ; OpenCV.js et jscanify (2 à 2,7 Mo pour un détecteur moins bon que le nôtre) ; CLIP ViT-B/32 (89 Mo, moins bon) ; TCG Pocket dans la base.
- **Étape suivante** : 50 à 100 vraies photos prises avec les téléphones du groupe (holos, pochettes, vieilles cartes), passées par le même banc (il suffit de remplacer `photos/<niveau>` et `gt.json`) pour caler les seuils de confiance.

### Option « IA » de secours

Quand la confiance locale est basse ou que l'utilisateur appuie sur « Demander à l'IA », la PWA envoie la carte redressée (JPEG d'environ 800 px, 100 à 150 Ko) à une **petite fonction serverless** : Cloudflare Worker, Vercel ou Netlify Function. La fonction est la seule à détenir la clé API. Elle appelle un modèle de vision, par exemple **Claude Opus 5.5** (`claude-opus-5-5`, le modèle par défaut côté Anthropic), avec :
- l'image en bloc `image` encodé en base64 ;
- une consigne courte ;
- éventuellement les 5 propositions locales comme indices ;
- une **sortie structurée** (`output_config.format` avec un schéma JSON `{nom, numero, total, code_serie, langue}`).

La PWA fait ensuite elle-même la correspondance avec la base TCGdex (numéro + total, puis nom). Ordre de grandeur du coût : une image recadrée représente de l'ordre d'un à deux milliers de tokens d'entrée, à vérifier avec l'endpoint `count_tokens`. Aux tarifs actuels de Claude Opus 5.5 (4 $ par million de tokens en entrée, 20 $ en sortie), cela fait environ un centime par photo avec un effort de raisonnement réglé sur `low`, soit quelques euros par mois pour un groupe d'amis. Claude Haiku 5.5 coûterait environ 40 fois moins cher ; c'est à essayer sur les vraies photos avant de choisir. Côté fonction : un quota par utilisateur, aucune image conservée, et un temps de réponse de quelques secondes à afficher comme tel (« analyse en cours »).

---

## Annexe : reproduire le banc

Les scripts `.mjs` résolvent leurs dépendances depuis leur propre dossier : lancer d'abord `npm install` dans `docs/scanner-bench` (le `package.json` fixe tesseract.js 7.0.0 et onnxruntime-web 1.31.1). Les données de langue Tesseract (`eng`/`fra`, `4.0.0_best_int`) se trouvent dans les paquets `@tesseract.js-data/eng` et `@tesseract.js-data/fra`.

```bash
# environnement (dossier de travail au choix, hors du dépôt)
python3 -m venv venv && ./venv/bin/pip install numpy pillow opencv-python-headless imagehash onnxruntime onnx scipy
B=docs/scanner-bench ; D=/chemin/vers/data ; M=/chemin/vers/models
(cd $B && npm install)
mkdir -p $D/catalog && curl -s https://api.tcgdex.net/v2/fr/cards -o $D/catalog/cards_fr.json   # catalogue complet, 1 requête
python3 -I $B/01_fetch.py $D                       # 498 cartes FR + EN (≤ 8 req/s)
./venv/bin/python -I $B/02_simulate.py $D          # 3 × 498 photos simulées
./venv/bin/python -I $B/03_crops_hash.py $D        # cadrages, détection, hashs, scores
./venv/bin/python -I $B/04_embed.py $D $M mobileclip,dinov2s,mnv4s   # embeddings (modèles ONNX dans $M)
./venv/bin/python -I $B/05a_ocr_prep.py $D facile,moyen,difficile auto,oracle
mkdir -p $D/tessdata && cp $B/node_modules/@tesseract.js-data/{eng,fra}/4.0.0_best_int/*.gz $D/tessdata/
node $B/05b_ocr.mjs $D $D/tessdata moyen auto 4                     # Tesseract.js (numéro + nom)
./venv/bin/python -I $B/05c_ppocr.py $D $M/ppocr_en facile,moyen,difficile auto,oracle
./venv/bin/python -I $B/06_analyse.py $D           # OCR, re-classement, courbes
node $B/07_bench_js.mjs $M $B/node_modules/onnxruntime-web/dist      # temps JS / WASM
./venv/bin/python -I $B/08_compression.py $D mobileclip
./venv/bin/python -I $B/09_extrapolation.py $D $D/catalog/cards_fr.json   # modèle à l'échelle du catalogue
./venv/bin/python -I $B/10_tables.py $D            # tableaux Markdown
```

Modèles : `onnx-community/mobilenetv4_conv_small.e2400_r224_in1k`, `Xenova/dinov2-small`, `Xenova/mobileclip_s0`, `Xenova/clip-vit-base-patch32` et `monkt/paddleocr-onnx` (`languages/english/`), tous sur Hugging Face.
