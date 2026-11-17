# Scanner de cartes

On pointe la caméra sur une carte, l'app dit laquelle c'est, on confirme d'un tap, on l'ajoute.
Tout tourne sur le téléphone : pas de serveur, pas d'IA payante, rien n'est envoyé nulle part.

C'est la **phase 1** de `docs/recherche-scanner.md` (« MVP sans modèle ») : détection de la carte, redressement,
empreinte de 40 octets calculée sur plusieurs cadrages, recherche dans une base de toutes les cartes FR.
MobileCLIP (phase 2) et la lecture du numéro (phase 3) ne sont pas codés ; la dernière partie explique comment les brancher.

## En bref

- **Base** : 18 675 cartes (sur 20 217 du catalogue FR ; les autres n'ont d'image dans aucune langue), dont 1 414 avec
  l'image anglaise faute d'image FR. 40 octets par carte : **841 Ko** (717 Ko compressé), téléchargés une fois puis
  gardés hors ligne par le service worker.
- **Précision** sur les 1 494 photos simulées du banc, contre cette base complète : **top-1 98,2 / 97,0 / 88,0 %**,
  **top-5 100 / 100 / 93,0 %** (facile / moyen / difficile). Presque toutes les erreurs de 1re place sont des
  réimpressions à illustration identique : la bonne carte est alors 2e, juste en dessous.
- **Temps** : ~0,1 s par photo, de la photo aux propositions (78 ms sous Node, 89 à 150 ms dans Safari sur un Mac
  M3 Pro). Estimé 0,1 à 0,15 s sur un iPhone récent, ~0,3 s sur un Android milieu de gamme.
- **Ajout rapide** : la 1re carte est jugée « sûre » sur 91 / 81 / 51 % des photos, sans aucune erreur mesurée.
- **Construction de la base** : ~40 min la première fois (téléchargement des 18 700 images à 8 requêtes/s), puis
  moins d'1 s quand rien n'a changé, ~30 s pour une nouvelle extension de 200 cartes.
- **Même résultat partout** : les empreintes calculées par le navigateur et par la construction sont identiques au bit
  près (vérifié sur 302 + 40 images de référence et sur une même photo, voir « Mesures »).

## Le parcours dans l'app (`src/screens/Scanner.tsx`)

1. **Visée** : caméra arrière en haute définition (`getUserMedia`, `facingMode: environment`, 3840 × 2160 demandés),
   gabarit 63 × 88 sur 2/3 de la largeur (coins jaunes), rappel « Carte à plat, sans reflet, qui remplit le cadre ».
   Bouton lampe quand le navigateur permet de la piloter (Chrome sur Android ; sur iPhone, selon la version de Safari).
2. **Photo** au déclencheur (au pouce, en bas au centre) : `ImageCapture.takePhoto()` sans flash quand il existe
   et que la photo a le même cadrage que la vidéo, sinon l'image vidéo à sa résolution maximale. L'image reste figée
   pendant l'analyse. **« Choisir une photo »** fait la même chose avec une photo de la galerie (indispensable pour
   tester sur ordinateur, et pour une caméra refusée).
3. **Analyse** dans un Web Worker (l'interface ne fige pas) : environ 0,1 s sur ordinateur (détail plus bas).
4. **Propositions** dans une feuille du bas : 3 cartes si la reconnaissance est sûre, 5 sinon, avec vignette, nom,
   extension, numéro (« 199/165 »), cote et « Déjà dans ta collection ×N ». La cote de la 1re **défile jusqu'à sa
   valeur** et le téléphone **vibre d'autant plus longtemps que la carte vaut cher** (Android ; l'iPhone n'a pas
   l'API de vibration). Animation coupée si « réduire les animations » est activé.
   Un tap sur une carte ouvre la feuille d'ajout (`FeuilleAjout`, version, état, prix…). « Aucune ne correspond »
   ouvre la recherche. « Reprendre la photo » revient à la caméra.
5. **Ajout rapide** (bouton en bas à droite, réglage `ajoutRapide`) : si la 1re carte est **nettement devant**
   (niveau « sûre », voir les seuils), elle est ajoutée directement (version principale, état par défaut des
   réglages, langue FR) avec un bandeau « Ajoutée · cote · Annuler », et la caméra est prête pour la suivante.
   Sinon on montre les propositions comme d'habitude, avec la mention « pas assez sûr pour l'ajouter tout seul ».
   Le compteur en haut (« 3 cartes ajoutées ») compte les ajouts de la session, Annuler compris.
6. **Erreurs expliquées** : caméra refusée (marche à suivre iPhone et Android), pas de caméra, caméra occupée,
   site non https, catalogue ou base de reconnaissance pas encore chargés (déclencheur grisé, message sous le
   gabarit), carte non reconnue (conseils + « Peut-être : » avec les 3 meilleures pistes).

Le moteur (worker + base en mémoire, ~1 Mo) reste chargé quand on quitte l'écran : rouvrir le scanner est immédiat.

## Comment la carte est reconnue (`src/scanner/`)

Tout le dossier est du TypeScript **pur** (sans DOM ni Vite) : le même code tourne dans le worker du navigateur et
sous Node (construction de la base, tests). Seuls `client.ts` (pilotage du worker, canvas) et `camera.ts` sont
propres au navigateur. Les imports relatifs sont sans extension (Vite et tsc) ; les scripts Node les résolvent avec
un petit crochet (`activerImportsSansExtension` dans `scripts/scan/commun.ts`).

| Étape | Fichier | Ce qu'elle fait |
|---|---|---|
| Préparation | `client.ts` | Dessine la photo pour que le gabarit fasse au plus 720 px de large, envoie les pixels au worker (transfert, sans copie). |
| Détection v2 | `detection.ts`, `gradients.ts`, `contours.ts` | Image de travail (gabarit ≈ 356 px). Deux hypothèses : le gabarit, et le meilleur quadrilatère des contours (Canny, composantes connexes par segments, enveloppe convexe, approximation polygonale ou rectangle minimal). Recalage de chaque bord : 40 profils le long de la normale, maxima du gradient Lab, droite RANSAC « la plus extérieure » parmi les bien appuyées, ajustement de Huber, coins = intersections (coins virtuels). Seconde passe fine, score « appui × proportions × surface ». |
| Cadrages | `reconnaissance.ts` | Détecté, détecté + 3,5 % (si le bord intérieur du liseré a été pris), gabarit, contours ; « image entière » en plus pour une image importée aux proportions d'une carte (scan, capture recadrée). |
| Redressement | `redressement.ts`, `geometrie.ts` | Homographie 4 points, échantillonnage bilinéaire, carte canonique 300 × 412. |
| Empreinte | `descripteurs.ts`, `reduction.ts` | 40 octets : dHash horizontal + vertical (128 bits) de la carte entière en gris, dHash couleur Y/Cr/Cb (192 bits) de la fenêtre d'illustration. Réduction par moyenne de zone exacte (bornes fractionnaires). Uniquement les 4 opérations et des arrondis, exacts en IEEE 754 : résultat identique au bit près dans tous les moteurs JS. |
| Recherche | `recherche.ts`, `base.ts` | Distance = Hamming(carte)/128 + Hamming(illustration)/192 (0 à 2 ; deux cartes sans rapport ≈ 1). Force brute sur toute la base pour chaque cadrage, meilleur cadrage et meilleure image par carte. Fusion des « signaux » par z-score (un seul signal aujourd'hui), top-10 regroupé par carte. |
| Confiance | `reconnaissance.ts` (`SEUILS`) | « sûre », « probable », « incertaine » ou « inconnue » d'après la distance de la 1re carte et l'écart avec la 2e. |
| Worker | `worker.ts` | Garde la base en mémoire, fait tout le calcul, renvoie les propositions et l'aperçu redressé. |

## Commandes

```bash
npm run scan:construire                       # base complète d'après public/data/meta.json (incrémental)
npm run scan:construire -- --limite 300       # essai rapide sur 300 cartes
npm run scan:construire -- --sets sv08,me01   # seulement ces extensions
npm run scan:construire -- --hors-ligne       # n'utilise que le cache d'images (aucun téléchargement)
npm run scan:construire -- --prechauffer cartes.json   # télécharge seulement les images d'une liste GET /v2/fr/cards

npm run scan:tester -- --banc <dossier>       # photos simulées du banc d'essai contre la vraie base
npm run scan:tester -- --banc <dossier> --base-banc    # contre une base des 498 cartes du banc seulement
npm run scan:tester -- --photos <dossier>     # vraies photos nommées par id de carte (protocole plus bas)
npm run scan:tester -- --photo <fichier>      # une photo : même journal JSON que la console du navigateur
#   options : --niveaux moyen,difficile  --limite 100  --details (photos ratées)  --calibrage detail.json
```

Le « dossier du banc » est le dossier de données produit par `docs/scanner-bench/01_fetch.py` et `02_simulate.py`
(`photos/<niveau>/<id>.jpg` + `gt.json`, `img/fr_low/`) ; voir l'annexe de `docs/recherche-scanner.md`.

## La base de reconnaissance

**Construction** (`scripts/scan/construire.ts`) :
- lit `public/data/meta.json` puis le catalogue (`catalogue-fr.<hash>.json`) ; l'image de chaque carte est celle du
  catalogue : FR, ou EN quand la FR manque (même identifiant de carte) ;
- télécharge `low.webp` (245 × 337, ~19 Ko) depuis `assets.tcgdex.net` à **8 requêtes/s au plus**, dans
  `.cache/scan/images/` (nom = SHA-1 de l'URL). Ce sont des données non fiables : hôte vérifié, taille limitée,
  signature WebP contrôlée, décodage par `sharp` avec une limite de pixels ; rien n'est exécuté. Une image absente
  (404) n'est redemandée qu'après 14 jours (`absentes.json`) ;
- décode avec `sharp` en RGBA et calcule l'empreinte avec **la même fonction que le téléphone**
  (`descripteurReference` : coins transparents sur gris, image entière redressée en 300 × 412, empreinte) ;
- **incrémental** : les empreintes sont gardées dans `.cache/scan/descripteurs-combo40-v1.json` par
  (id de carte, URL de l'image). Seules les cartes nouvelles, ou dont l'image a changé (une image FR qui apparaît),
  sont téléchargées et calculées. La correspondance se fait par id, jamais par position : un catalogue réordonné
  ou amputé ne pose pas de problème ;
- écrit `public/data/scan/empreintes-<hash8>.bin` (nom = empreinte du contenu, hors date) et
  `public/data/scan/manifeste.json`, garde la base précédente (clients en cours de mise à jour) et supprime les
  plus anciennes.

**Format du fichier** (`src/scanner/base.ts`) : « CLSC », longueur de l'en-tête (uint32), en-tête JSON
(`v`, `descripteur`, `octets`, `n`, `genereLe`, identifiants regroupés par préfixe, positions des images anglaises),
puis n × 40 octets. Une carte peut avoir plusieurs entrées (FR et EN par exemple).

**Contrat avec le pipeline de données** : `scripts/donnees/construire.ts --meta` recopie
`meta.scan = "scan/" + manifeste.fichier` (le `.bin` versionné : le service worker le met en cache sans limite de
durée, ce qui suppose un nom qui change avec le contenu). L'app lit `donnees.meta.scan` ; à défaut (développement),
elle lit `data/scan/manifeste.json`. **Si le calcul de l'empreinte change**, changer `DESCRIPTEUR` dans
`descripteurs.ts` (`combo40-v2`…) : le cache de construction et le format de base suivent, et une base ancienne est
refusée par l'app avec un message clair au lieu de donner de mauvais résultats.

## Mesures

Mac M3 Pro, 17 novembre 2026. Photos : banc d'essai de `docs/recherche-scanner.md` (498 cartes de 6 extensions,
photos 1080 × 1440 simulées en 3 niveaux de difficulté). Toutes les mesures passent par le code de `src/scanner`.

**Base et construction**

| | |
|---|---|
| Cartes dans la base | 18 675 (images FR 17 261, EN 1 414 : catalogue + 12 replis quand l'image FR annoncée est absente) |
| Sans empreinte | 1 539 cartes sans image dans le catalogue, 3 sans image ni FR ni EN |
| Fichier | `empreintes-<hash8>.bin` : 841 Ko (717 Ko gzip) |
| Premier téléchargement | 18 678 images `low.webp`, 378 Mo de cache ; ~40 min à 8 requêtes/s (22 min pour 10 344 images) |
| Calcul des empreintes | 85 s pour 18 663 images (220 images/s, un cœur) |
| Mise à jour | 2 s avec 12 nouvelles images ; 0,24 s sans rien de nouveau (même nom de fichier) |
| Cache des empreintes | `.cache/scan/descripteurs-combo40-v1.json`, 2,6 Mo (suffit à la CI : les images ne sont utiles que pour les cartes nouvelles) |

**Précision** (top-k compté par carte)

| Base | Niveau | Top-1 | Top-3 | Top-5 | Top-10 | Coins < 2 % | Erreur médiane des coins | « Sûre » (justes) |
|---|---|---|---|---|---|---|---|---|
| Complète (18 675 cartes) | facile | 98,2 % | 100 % | 100 % | 100 % | 91,6 % | 0,09 % | 91,0 % (100 %) |
| | moyen | 97,0 % | 100 % | 100 % | 100 % | 79,5 % | 0,11 % | 81,3 % (100 %) |
| | difficile | 88,0 % | 92,8 % | 93,0 % | 93,8 % | 70,1 % | 0,14 % | 51,2 % (100 %) |
| 498 cartes du banc | facile | 100 % | | 100 % | 100 % | | | |
| | moyen | 99,8 % | | 100 % | 100 % | | | |
| | difficile | 93,4 % | | 96,2 % | 97,0 % | | | |

- Avec 498 cartes, le portage reproduit le banc Python (99,8 / 99,6 / 93,6 % de top-1, 93 / 81 / 72 % de coins à
  moins de 2 %). Sur la base complète, il fait **mieux que l'extrapolation** de `recherche-scanner.md`
  (92,7 % et 77,2 % de top-1 en moyen et difficile, 97,9 et 92,0 % de top-5).
- Sur 84 erreurs de 1re place, **73 sont des réimpressions à illustration identique** (écart < 0,03 avec la carte
  suivante) : Écarlate et Violet ↔ Destinées de Paldea, Étincelles Déferlantes et Méga-Évolution ↔ Héros
  Transcendants, 151 ↔ Évolutions Prismatiques, XY ↔ Générations, Set de Base ↔ Évolutions, Super Bonbon (3 éditions),
  Échange d'Énergie. La bonne carte est alors 2e ou 3e.
  Seuls le numéro (phase 3) ou l'utilisateur peuvent trancher.
- En difficile, 6 % des photos n'ont pas la bonne carte dans les 10 premières : surtout des cadrages ratés
  (carte de travers chevauchée par d'autres, gros reflet saturé). C'est le cas où MobileCLIP (phase 2) aide.
- Cadrage gagnant pour les bonnes réponses : détecté 1 158, détecté + 3,5 % 120, contours 95, gabarit 37.

**Temps** (médianes, de l'image décodée aux propositions)

| | Détection | Redressement + empreintes (4 à 5 cadrages) | Recherche (18 675 cartes) | Total |
|---|---|---|---|---|
| Node 26 (V8), 1 cœur | 66 ms | 10 ms | 1,4 ms | 78 ms |
| Safari 26 (navigateur de cmux), worker | 79 à 138 ms | 5 à 6 ms | 3 à 4 ms | 89 à 151 ms |

- Le **premier** scan d'une session prenait 840 ms dans Safari (code pas encore compilé par le moteur JavaScript).
  Le worker fait maintenant deux analyses d'échauffement sur une image factice juste après le chargement de la base :
  le premier vrai scan tombe à 103 ms.
- La détection seule : 66 ms (image de travail où le gabarit fait 356 px). Le banc Python travaillait à 475 px :
  103 ms, pour la même précision (top-1 99,6 / 99,6 / 94,0 % contre 100 / 99,8 / 93,4 % sur la base du banc).
- Téléphone, en appliquant les facteurs de `recherche-scanner.md` (3.6) : ~0,1 à 0,15 s sur un iPhone récent,
  ~0,25 à 0,3 s sur un Android milieu de gamme, ~0,4 s sur un Android d'entrée de gamme. S'y ajoute la prise de vue
  (`takePhoto` peut prendre 0,2 à 1 s sur Android).
- Poids dans l'app : écran 27 Ko (9,7 Ko gzip), worker 22 Ko, tous deux précachés par la PWA.

**Client et construction donnent le même résultat**
- 302 cartes de la base (une sur 60) : empreinte recalculée sous Node à partir de l'image en cache = empreinte de la
  base, 302/302 (`scan:tester`, à chaque lancement).
- 40 images de référence décodées par **le navigateur** (WebP décodé par Safari, canvas, même module
  `descripteurReference`) : 40/40 identiques à la base construite avec sharp, 0 bit d'écart.
- Une même photo (PNG) passée dans l'app (« Choisir une photo ») et dans `scan:tester --photo` : mêmes 5 propositions,
  mêmes distances, même quadrilatère détecté, mêmes 4 empreintes.
- Les calculs de l'empreinte n'utilisent que les 4 opérations et des arrondis (pas de racine, pas d'exponentielle),
  exacts en IEEE 754 : ils donnent le même résultat dans tous les moteurs JavaScript. Seule la détection utilise des fonctions
  mathématiques (Lab, exponentielles du score) qui peuvent différer d'un ULP d'un moteur à l'autre, sans effet mesurable.

## Seuils de confiance

Dans `src/scanner/reconnaissance.ts` (`SEUILS`). La distance va de 0 (images identiques) à 2 ; deux cartes sans
rapport sont vers 1 ; l'« écart » est la distance de la 2e carte moins celle de la 1re.

| Niveau | Règle | Ce que fait l'app | Mesure (facile / moyen / difficile) |
|---|---|---|---|
| sûre | distance ≤ 0,30 et écart ≥ 0,10 | 3 propositions ; **ajout direct** en mode ajout rapide | 91 / 81 / 51 % des photos, **0 erreur** sur 1 113 |
| probable | écart ≥ 0,06 | « C'est sans doute elle », 5 propositions | aucune erreur de 1re place à partir de cet écart |
| incertaine | le reste | « C'est laquelle ? », 5 propositions | réimpressions, cartes de même nom |
| inconnue | distance > 0,60 | « Carte non reconnue », conseils + 3 pistes | bonne carte jugée inconnue : 0 / 0,6 / 1,2 % ; carte absente de la base repérée 1 fois sur 2 |

Pourquoi ces valeurs : sur les 84 erreurs de 1re place, 73 ont un écart inférieur à 0,03 et la plus grande en a 0,055.
L'écart demandé pour « sûre » (0,10) fait presque le double : c'est la **marge de prudence** pour les vraies photos
(holos, pochettes), que le banc ne simule pas. Le seuil « inconnue » privilégie de ne pas dire « non reconnue » à tort :
même dans ce cas, les 3 meilleures pistes restent proposées. À recaler avec le protocole ci-dessous.

## Protocole : 50 à 100 vraies photos pour caler les seuils

Le banc d'essai utilise des photos **simulées** à partir des mêmes images que la base : pas de vrais holos ni de
reverses, pas de pochettes, pas de cartes abîmées, pas de vrais téléphones. C'est la limite principale des chiffres
ci-dessus. Une soirée avec les potes suffit pour la lever :

1. **Choisir 50 à 100 cartes** variées : des récentes (Écarlate et Violet, Méga-Évolution), quelques anciennes
   (Set de Base, XY), une dizaine de holos et de reverses, quelques cartes en pochette ou en toploader, quelques
   Énergies et réimpressions (Super Bonbon, Échange).
2. **Prendre une photo par carte**, avec 2 ou 3 téléphones différents (iPhone et Android), en portrait, la carte
   au centre et remplissant à peu près les 2/3 de la largeur (comme le gabarit). Varier : table claire et sombre,
   lumière du plafond et de la fenêtre, une ou deux avec un reflet ou le pouce sur le bord. Pas besoin d'être soigneux :
   c'est justement ce qu'on veut mesurer.
3. **Envoyer les photos en JPEG** (sur iPhone : Réglages › Appareil photo › Formats › « Le plus compatible », ou
   partager par AirDrop/WhatsApp qui convertit ; le HEIC n'est pas lu).
4. **Renommer chaque photo avec l'id de la carte** : l'id est dans l'adresse de sa fiche dans l'app
   (`#/carte/sv03.5-199` → `sv03.5-199.jpg`). Deux photos de la même carte : `sv03.5-199__2.jpg`.
5. Lancer `npm run scan:tester -- --photos <dossier> --details --calibrage reel.json`. On obtient top-1 / top-5,
   la part de photos « sûres » et leur justesse, et la liste des photos ratées. On peut aussi glisser chaque photo
   dans l'app (« Choisir une photo ») : c'est le même calcul.
6. **Caler les seuils** : dans `reel.json`, chaque photo a `d1` (distance de la 1re carte), `d2` (de la 2e) et `rang`
   (0 = bonne carte en tête). Choisir `sureDistance` / `sureEcart` pour qu'**aucune** photo « sûre » ne soit fausse
   (l'ajout rapide ajoute sans demander), et `inconnue` au-dessus de presque toutes les `d1` des bonnes réponses.
   Mettre à jour `SEUILS` dans `src/scanner/reconnaissance.ts` et le tableau ci-dessus.

Avec 100 photos, une erreur « sûre » sur 100 veut dire ~1 % d'ajouts rapides faux : c'est trop, on resserre.

## Brancher MobileCLIP (phase 2) et l'OCR du numéro (phase 3)

L'interface est prête : `recherche.ts` fusionne des `Signal` (une distance par carte, plus petit = mieux) par
z-score, et applique des `Indice` (cartes à faire remonter) au top-10. Ce qu'il reste à écrire :

**Phase 2 : MobileCLIP-S0 fp16** (gain surtout sur les photos ratées : flou, reflet, mauvais cadrage ; top-1 estimé
sur le catalogue en conditions difficiles de ~77 à ~88 %).
1. Modèle `Xenova/mobileclip_s0`, `onnx/vision_model_fp16.onnx` (22,9 Mo, 21 Mo compressé ; **pas** les versions
   int8, cassées). Le servir depuis `public/models/` (mis en cache par le service worker, à ajouter aux règles de
   `vite.config.ts`) et `onnxruntime-web` 1.31 (backend WASM : `ort.wasm.min.mjs` + `ort-wasm-simd-threaded.wasm`,
   2,4 Mo compressés). Les charger **dans le worker**, en différé (import dynamique au premier scan, ou proposé en Wi-Fi) :
   tant qu'ils ne sont pas là, le scanner marche en hash seul.
2. Prétraitement (à écrire dans `src/scanner/clip.ts`, pur) : la carte redressée du cadrage « gabarit » ou
   « détecté » (`redresser`) → 256 × 256 par `reduireRGB` → tenseur `[1, 3, 256, 256]` float32, valeurs /255, sans
   normalisation de moyenne. Sortie 512 d, normalisée L2.
3. Base : `scripts/scan/construire.ts` calcule les mêmes embeddings avec `onnxruntime-node` (même code de
   prétraitement) sur les images de référence, les quantifie en int8 (une échelle globale ; l'ACP à 256 d coûte
   0,4 point) et écrit `clip-<hash8>.bin` (n × 512 octets, ~10 Mo pour 20 000 cartes, 5 Mo en ACP 256), référencé
   dans le manifeste. Mettre **aussi l'image EN** des cartes FR (MobileCLIP « lit » le texte : photo FR contre image
   EN seule = 87 % ; la fusion avec le hash corrige, mais deux images valent mieux).
4. Recherche : produit scalaire int8 × float32 (~8 ms pour 20 000 cartes), distance = 1 − similarité, puis
   `signaux.push({ nom: 'clip', distances, poids: 1 })` dans `reconnaitre()`. `fusionner()` fait le reste.
5. Recaler la confiance sur le **score fusionné** (écart en écarts-types entre la 1re et la 2e carte) plutôt que sur la
   distance du hash, avec le même protocole de vraies photos.

**Phase 3 : PP-OCRv5 mobile rec pour le numéro** (règle les réimpressions à illustration identique, Super Bonbon
`sv01-191` / `me01-125`, Énergies de base, et les cartes de même nom).
1. Modèle `monkt/paddleocr-onnx`, `languages/english/rec.onnx` (7,8 Mo) + `dict.txt`, même onnxruntime-web.
2. Zones fixes sur la carte redressée **en pleine résolution** : bas gauche (« 025/198 », séries 2016 et suivantes)
   et bas droite (« 4/102 », anciennes). Le worker ne reçoit aujourd'hui qu'une image réduite (gabarit ≤ 720 px) :
   envoyer en plus les deux bandes recadrées dans la photo d'origine (homographie du quadrilatère détecté, mis à
   l'échelle), hautes de 48 px. Décodage CTC glouton, puis lecture tolérante (« / » lu comme 7, 1 ou 0) validée par
   les totaux des extensions du top-10.
3. Re-classement prudent avec `appliquerIndices(scores, [{ cartes, bonus: 3, parmi: 10 }], k)` : une lecture n'agit
   que si elle désigne une carte déjà dans les 10 premières. Ne lancer l'OCR que si les deux premières sont proches
   (niveau « probable » ou « incertaine ») ou si le top-10 contient plusieurs cartes du même nom.

## Limites connues et pistes

- **Variantes** (normale, reverse, holo…) : une seule image par carte chez TCGdex ; aucune méthode visuelle ne les
  distingue de façon fiable. On les choisit à la main dans la feuille d'ajout (l'ajout rapide prend la version
  principale).
- **Réimpressions à illustration identique** : tirage à pile ou face visuellement, d'où les 3 à 5 propositions et
  la phase 3.
- **Cartes sans image** dans TCGdex (~1 500, dont la Collection Classique) : pas dans la base, donc jamais proposées ;
  « Aucune ne correspond » mène à la recherche.
- **Capture automatique** (photo prise seule quand l'image est stable et la carte détectée, comme PokéItem) : faisable
  avec la détection actuelle sur des images vidéo réduites (~30 ms) ; pas fait.
- **Caméra en http** : les navigateurs ne donnent la caméra qu'aux sites en https. `npm run dev:tel` (http sur le
  réseau local) ne permet donc que « Choisir une photo » ; tester la caméra sur le site déployé.
- **iPhone** : pas de vibration pour les sites web, et la lampe dépend de la version de Safari (limites du
  navigateur, pas de l'app : le bouton n'apparaît que si la lampe est pilotable).
