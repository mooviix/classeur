# Pipeline de données

Ce pipeline fabrique les fichiers que l'app lit dans `data/` : catalogue des cartes FR, scellés, prix du jour et historiques. Le format exact est défini dans [`src/data/types.ts`](../src/data/types.ts), et ce document ne fait que le rappeler. La recherche qui justifie les choix (sources, pièges, correspondances) est dans [`recherche-donnees.md`](recherche-donnees.md).

Mesures du 17/11/2026, sur une connexion à Paris.

## 1. En bref

```
 Cardmarket (S3, sans compte)                  TCGdex
   price_guide_6.json (16 Mo, chaque nuit) ──┐    GraphQL : noms FR, raretés, images, sets
   products_singles / nonsingles (ETag)     ─┤    dépôt cards-database (clone partiel, lu comme du texte) :
                                             │      idProduct des cartes et variantes, idExpansion des sets
 Poképédia, tcgcsv (images des scellés) ─────┤
                                             ▼
                          scripts/donnees/construire.ts
                                             │
       public/data/ : meta.json, catalogue-fr.<hash>.json, scelles-fr.<hash>.json,
                      prix/<date>.json (7 derniers), historique/<groupe>.json
                                             │
     GitHub Actions : état dans la branche `donnees` (1 commit) → build → GitHub Pages
```

- **Zéro dépendance** : TypeScript exécuté directement par Node (≥ 24, testé avec 26), uniquement `fetch`, `zlib`, `crypto` et `git`.
- **Idempotent** : si le guide Cardmarket n'est pas plus récent que celui déjà traité (`createdAt` dans `meta.json`), rien n'est réécrit. Le second passage de la nuit prend 0,4 s (réponse 304 sur l'ETag).
- **Jamais d'exécution de code tiers** : les fichiers du dépôt TCGdex sont analysés par un petit lecteur de littéraux (`litteral.ts`). Les guides (Cardmarket, Wayback) sont lus avec `JSON.parse` et contrôlés champ par champ.
- `meta.json` est écrit **en dernier**, donc l'app ne voit jamais un état à moitié écrit.
- **Pannes** : si TCGdex ou les listes Cardmarket sont injoignables (et qu'il n'y a pas de copie locale), on garde le catalogue et les scellés de la veille, et les prix avancent quand même (testé en simulant une panne de GitHub). Sans guide des prix, ou si son format change (`version` ≠ 1), le passage échoue sans rien écrire, et GitHub prévient par e-mail.

## 2. Commandes

| Commande | Effet |
|---|---|
| `npm run donnees` | Traite le guide du jour s'il est nouveau. Écrit dans `public/data/`, servi tel quel par `npm run dev`. |
| `npm run donnees -- --forcer` | Retraite même si le guide est déjà traité (après une modification du code, par exemple). |
| `npm run donnees -- --rafraichir` | Ignore les caches GraphQL (20 h) et images de scellés (7 jours). `--forcer` les respecte. |
| `npm run donnees -- --sans-images` | Ne cherche pas de nouvelles images de scellés et reprend celles déjà publiées (utile hors ligne : sans cache, la recherche coûte 221 requêtes et 70 s). |
| `npm run donnees -- --sortie <dossier>` | Autre dossier de sortie, pour des essais. |
| `npm run donnees -- --guide <fichier.json[.gz]>` | Traite ce guide au lieu de celui du jour (rejouer une capture Wayback, tests). |
| `npm run donnees -- --meta` | Met seulement à jour `meta.json` (champ `scan` d'après `data/scan/manifeste.json`). |
| `npm run donnees:amorcer` | Amorce l'historique avec les captures Wayback (§5). Options : `--depuis AAAA-MM-JJ`, `--hors-ligne` (seulement les captures en cache), `--sortie`. |
| `npm run donnees:verifier` | Contrôle les fichiers publiés : JSON valide, contrat, cohérence entre fichiers, tailles. Sort en erreur au moindre écart. |
| `npx tsc -p scripts/donnees` | Vérifie les types du pipeline (le contrat `src/data/types.ts` est importé). |

Premier lancement sur une machine neuve : `npm run donnees` puis `npm run donnees:amorcer` (5 min).

## 3. Fichiers du pipeline

| Fichier | Rôle |
|---|---|
| `scripts/donnees/construire.ts` | Programme principal : guide, sources, catalogue, scellés, historiques, prix, `meta.json`. |
| `scripts/donnees/amorcer-wayback.ts` | Amorçage de l'historique (captures Wayback du guide). |
| `scripts/donnees/verifier.ts` | Contrôle du contrat, lancé aussi par le workflow avant toute publication. |
| `cardmarket.ts` | Listes de produits et guide (requêtes conditionnelles), archives compactes `.cache/archives/`. |
| `tcgdex.ts`, `litteral.ts` | Clone partiel du dépôt, lecture textuelle des fichiers `.ts`, requêtes GraphQL. |
| `catalogue.ts` | Catalogue FR, variantes et libellés FR, liens extension Cardmarket ↔ set TCGdex. |
| `scelles.ts`, `corrections-scelles.json` | Scellés : filtre, noms FR, types, corrections à la main (`idProduct → nom`). |
| `images-scelles.ts` | Images des scellés (Poképédia, CDN TCGplayer via tcgcsv). |
| `historique.ts`, `prix.ts` | Séries quotidiennes par groupe, prix du jour avec j1, j7 et j30. |
| `commun.ts`, `http.ts` | Dates à Paris, centimes, écriture atomique, requêtes polies (au plus 4 par seconde et par hôte, 1 toutes les 5 s vers web.archive.org, 0,8 s vers Poképédia) avec réessais. |

Caches (`.cache/`, ignoré par git) : `tcgdex/depot` (clone, 127 Mo), `tcgdex/depot-v2-<commit>.json` (lecture du dépôt), `tcgdex/graphql-*.json` (20 h), `cardmarket/` (ETag), `archives/<jour>.json.gz` (guides compacts, 60 derniers jours, ≈ 1 Mo chacun), `wayback/` (captures brutes compressées, 94 Mo), `tcgcsv/` et `pokepedia/` (7 jours).

## 4. Méthode

### Catalogue (`catalogue-fr.<hash8>.json`)

- **Sets** : GraphQL FR, sans TCG Pocket (`tcgp`) ni les sets sans aucune carte en français (`wp`, `jumbo`, `rc`). `code` = `abbreviations.official` du dépôt (`MEW`). Le dépôt a aussi `abbreviations.fr` (`151`, `E&B`), mais ce sont des abréviations d'usage, non imprimées : on ne les utilise pas. `idExpansion` = lien direct du dépôt, sinon l'extension de la majorité (≥ 50 %) des cartes du set. Logo : `1` FR, `2` EN, `0` aucun. Symbole : `1` s'il existe. Les URL ont été vérifiées : toutes suivent le chemin standard.
- **Cartes** : GraphQL FR (nom, rareté traduite, illustrateur, `dexId`). Image : `1` si l'`image` FR de TCGdex est exactement `https://assets.tcgdex.net/fr/{serie}/{set}/{num}`, `2` si c'est l'image EN au même chemin, l'URL explicite sinon (aucun cas le 17/11), `0` sans image. Les tirets typographiques (U+2011, présents dans Règne Delta) sont remplacés par `-` pour la recherche.
- **Variantes** : lues dans le dépôt, avec la même logique que le compilateur TCGdex (tableau `variants`, ou forme `{ normal, reverse, holo, firstEdition }`). Les variantes réservées à d'autres langues (`languages` sans `fr`, 29 cas) sont écartées. `idProduct` = celui de la variante, sinon celui de la carte.
  - Clés et libellés : `normale` « Normale », `reverse` « Reverse », `holo` « Holo », `premiere-edition` « 1re édition », `illimitee` « Illimitée », `reverse-pokeball` « Reverse Poké Ball », `reverse-masterball` « Reverse Master Ball ». Tout le reste devient `autre-<slug>` avec un libellé composé : « Holo Cosmos », « Reverse Énergie », « Tampon Pokémon Center », « Holo, Tampon logo d'extension »… (369 clés distinctes). Les reverses de l'époque EX, toutes tamponnées du logo de l'extension, restent simplement `reverse`. Si deux variantes d'une carte tombent sur la même clé, la seconde reçoit une clé `autre-…` détaillée.
  - La version de base passe en tête (`normale`, `holo` ou `illimitee`). Le reste suit l'ordre du dépôt.
  - **`holo: 1`** seulement pour une variante `reverse` qui partage l'`idProduct` d'une variante normale ou holo de la même carte (§4.2 de la recherche). Exemples : Némélios `sv08.5-016` (reverse = champs `-holo` de 805405, Poké Ball et Master Ball = leurs propres produits) et Frison `sv07-119` (la reverse partage le produit de la holo).

### Scellés (`scelles-fr.<hash8>.json`)

- On écarte les pièces (1017), les lots (1064) et les produits asiatiques : extension reliée à un set de `data-asia`, ou nom contenant JP, Japanese, Chinese, Korean, `CSV…C:`, `S-Ch`…
- **Set** : extension Cardmarket → set TCGdex (lien direct, puis vote des cartes : ≥ 50 % des cartes référencées et ≥ 35 % de l'extension couverte, §4.4). À défaut, le nom anglais de set le plus long trouvé dans le nom du produit. Un set qui porte un nom de Pokémon (« Deoxys », « Arceus ») doit ouvrir le nom et être suivi de « : » ou d'un mot de produit. « Base Set 2 » n'est pas « Base Set ». `set` n'est rempli que si le set est dans le catalogue FR : c'est ce que l'app cherche (`groupeScelle`).
- **Type** : dictionnaire anglais → FR (premier motif qui correspond), puis repli sur la catégorie Cardmarket. Ordre de `types` : Display, Demi-display, Coffret Dresseur d'Élite, Bundle de 6 boosters, Collection Premium, Collection Ultra-Premium, Pokébox, Mini Pokébox, Tripack, Duopack, Blister, Booster, Deck, Kit du Dresseur, Kit d'Avant-Première, Coffret, Carton, Set complet. Demi-display = « Booster Box (18 Boosters) » (65 produits).
- **Nom FR** : `<début de nom> <set FR> — <reste>` (« Mini Pokébox Héros Transcendants — Zorua », « Carton de 6 displays Règne Delta »). Sans set : `<début de nom> <reste>` (« Collection Ultra-Premium Amphinobi-ex »). Le reste passe par un dictionnaire de 1 356 noms de Pokémon EN → FR tiré des cartes TCGdex (« Iron Valiant » → « Garde-de-Fer »), avec les conventions FR (« Dracaufeu-ex », « Méga-Aligatueur-ex », « Carchacrok-ex de Cynthia »). S'il n'y a ni set ni type : nom Cardmarket. **`corrections-scelles.json` a le dernier mot** (`"idProduct": "Nom FR"`).
- **Images** (liens directs, rien n'est recopié) : 1. Poképédia pour les coffrets Dresseur d'Élite FR (vignette PNG de 300 px, 100 à 200 Ko), en 3 requêtes à l'API ; 2. CDN TCGplayer (`…_400w.jpg`, environ 25 Ko, boîte anglaise) trouvé par tcgcsv : même nom au bruit près (`pack`, `exclusive`, `version`…), dans le groupe TCGplayer du set, sinon dans tous les groupes à condition que le nom soit unique. Une « Booster Box (18 Boosters) » ne prend jamais l'image d'un display de 36. Les deux hôtes acceptent le lien direct, sans Referer. Le CDN Cardmarket n'est jamais utilisé.

### Prix du jour (`prix/<date>.json`)

- Date = date à Paris du `createdAt` du guide (pas la date du traitement).
- `p` : cartes FR reliées + scellés du catalogue, `[tendance, bas, moy7, moy30, j1, j7, j30]` en centimes, nulls finaux retirés. Une ligne sans tendance ni prix bas n'est pas publiée (444 produits), puisque l'app n'afficherait rien. Pour les scellés, `moy7` et `moy30` sont toujours vides chez Cardmarket.
- `h` : mêmes champs lus dans `trend-holo`, `low-holo`…, **uniquement** pour les produits ayant une variante `holo: 1`. Les `-holo` des autres produits sont du bruit (§2.5).
- j1, j7, j30 : tendance du jour d'historique le plus proche de J−1, J−7 et J−30 (au plus 2 jours d'écart, toujours avant J ; en cas d'égalité, le plus récent).
- On garde les 7 derniers fichiers.

### Historiques (`historique/<groupe>.json`)

- Groupe = id du set TCGdex pour toutes les variantes de ses cartes. Un `idProduct` utilisé par des cartes de deux sets est écrit dans les deux fichiers. Pour les scellés : id du set, sinon `x<idExpansion>`.
- `t` = tendance, `th` = tendance « -holo » (seulement pour les produits `holo`). Les jours sans guide sont absents. Un fichier ne garde que les jours où au moins un de ses produits a une valeur.
- Mise à jour incrémentale : les fichiers existants sont relus, le jour du guide est ajouté (ou remplacé avec `--forcer`), puis tout est réécrit. Un produit qui change de groupe garde sa série. Un produit sorti du catalogue reste dans son ancien groupe. Un produit **nouvellement relié** (nouveau set que TCGdex relie avec quelques jours de retard) récupère ses jours passés dans `.cache/archives/` (testé : 51 jours rattrapés).
- Un fichier d'historique illisible arrête le pipeline : rien n'est écrasé.

## 5. Amorçage Wayback

`amorcer-wayback.ts` liste les captures de `price_guide_6.json` (API CDX), écarte les doublons (même empreinte), télécharge celles qui manquent dans `.cache/wayback/` (une requête toutes les 5 s, contrôlées avant d'être gardées), puis ajoute chaque jour à l'historique **sans jamais écraser un jour déjà présent**. Il recalcule ensuite les prix du jour publiés (j1, j7 et j30 deviennent disponibles) et met à jour `meta.historique`.

Mesuré le 17/11 : **60 captures distinctes → 60 jours de guide en 5 min** (14 à 15 Mo chacune, environ 4,5 s de téléchargement), 0 échec, 94 Mo en cache. L'historique couvre alors **61 jours** : deux points isolés, le 30/12/2024 et le 17/06/2026, puis presque chaque jour du 09/09 au 17/11/2026 (quelques trous, comme le 14/11). `meta.historique.debut` vaut donc `2024-12-30`. Pour les courbes, mieux vaut un axe proportionnel aux dates.

## 6. GitHub Actions (`.github/workflows/donnees.yml`)

- **Déclencheurs** : cron `23 2 * * *` et `23 8 * * *` (UTC, soit après 02 h 51 à Paris été comme hiver ; le second sert de rattrapage), `workflow_dispatch` (avec la case « forcer ») et push sur `main`.
- **État** : la branche orpheline `donnees` contient exactement `public/data/` (meta, catalogue et scellés courant et précédent, 7 prix, historiques, `scan/`). Elle est restaurée au début (`git archive`), puis réécrite en **un seul commit poussé en force** : l'historique git ne grossit pas. 2,6 Mo dans git avec 61 jours d'historique.
- **Étapes** : cache Actions de `.cache/` (sans le clone TCGdex, les captures Wayback ni `.cache/scan`, qui a son propre cache, resauvé seulement quand le catalogue change) → `construire.ts` → au premier passage seulement, `amorcer-wayback.ts` (non bloquant) → s'il y a du nouveau (ou hors cron) : `scripts/scan/construire.ts` s'il existe, puis `construire.ts --meta` (champ `scan` = `'scan/' + manifeste.fichier`) → `verifier.ts` (bloquant) → sauvegarde de l'état → `npm ci && npm run build` → copie de `public/data` dans `dist/data` → `upload-pages-artifact` → `deploy-pages`. Un cron qui ne trouve rien de nouveau s'arrête avant le build.
- `concurrency: donnees` : jamais deux passages en même temps. Permissions : `contents: write` (branche `donnees`), `pages: write`, `id-token: write`.

### Mise en place (à faire une fois)

1. Créer le dépôt `mooviix/classeur` (public, nécessaire pour GitHub Pages gratuit) et pousser `main`.
2. *Settings → Pages → Build and deployment → Source : **GitHub Actions***.
3. Au choix :
   - lancer le workflow (*Actions → Données et déploiement → Run workflow*) : le premier passage amorce l'historique avec la Wayback Machine (environ 7 min) ;
   - ou publier tout de suite l'historique déjà construit sur cette machine :
     ```sh
     tmp=$(mktemp -d) && cp -R public/data/. "$tmp" && rm -f "$tmp/.gitkeep" && cd "$tmp" \
       && git init -q -b donnees && git add -A && git commit -qm "Données initiales" \
       && git push -f https://github.com/mooviix/classeur.git donnees && cd - && rm -rf "$tmp"
     ```
     puis lancer le workflow.

## 7. Temps et volumes mesurés (17/11/2026)

| Étape | Temps |
|---|---|
| Clone partiel du dépôt TCGdex (`data/` + sets de `data-asia/`) | 12,5 s (127 Mo, 24 260 fichiers) |
| Lecture textuelle du dépôt | 2,4 s (571 sets, 24 015 cartes, 0 fichier illisible), mise en cache par commit |
| 4 requêtes GraphQL (cartes FR et EN, sets FR et EN) | 1,3 s (≈ 7 Mo) |
| Guide + listes Cardmarket | 1 à 4 s (31 Mo, ou réponses 304) |
| Images des scellés, premier passage (221 groupes tcgcsv + Poképédia) | 70 s, puis gardées 7 jours |
| **Passage complet** avec caches chauds | **≈ 5 s** ; à froid sans images : 10 s ; à froid avec images : 75 s |
| Second passage de la nuit (guide déjà traité) | 0,4 s |
| Amorçage Wayback | 5 min (60 captures) |

| Fichier | Contenu | Brut | gzip | brotli |
|---|---|---|---|---|
| `catalogue-fr` | 20 217 cartes, 33 584 variantes, 20 817 idProduct, 185 sets, 17 séries | 1,9 Mo | 358 Ko | 227 Ko |
| `scelles-fr` | 3 827 scellés (564 asiatiques et 726 pièces/lots écartés), 1 266 avec image | 527 Ko | 82 Ko | 63 Ko |
| `prix/<date>` | 24 200 produits (23 908 avec j1/j7/j30), 8 377 reverses dans `h` | 1,1 Mo | 383 Ko | 314 Ko |
| `historique/` (61 jours) | 501 fichiers, 23 908 produits | 7,7 Mo en tout (médiane 1,6 Ko, p90 61 Ko, max 228 Ko pour `x1645`) | 1,6 Mo en tout (max 28 Ko) | — |

- **Couverture** : 737 cartes sans `idProduct` (promos Noir et Blanc 101, promos Soleil et Lune 94, kits du dresseur XY 8 × 30, promos DP 41…). Images de cartes : FR 17 276, repli EN 1 402, aucune 1 539. Scellés : set FR par l'extension 1 726, par le nom 177, sans set 1 924. Images de scellés : ETB 112/128, displays 99/331, coffrets 260/782, decks 112/577.
- **Téléphone** : GitHub Pages compresse en gzip (pas en brotli). Premier chargement ≈ 820 Ko (catalogue + scellés + prix), puis ≈ 385 Ko par jour (prix). C'est au-dessus de la cible de la recherche (< 400 Ko en brotli), parce que le contrat publie 7 champs de prix (au lieu de 4) et les libellés des variantes. Une fiche charge en plus l'historique de son set (médiane 1,6 Ko, 28 Ko au plus en gzip pour 61 jours).
- **Projection sur un an** : historiques ≈ 46 Mo bruts, 10 Mo en gzip. Le plus gros fichier de set passerait à environ 600 Ko bruts (130 Ko en gzip).

## 8. Reste à faire

- **Corrections des noms de scellés** : `corrections-scelles.json` est vide. Les noms sans set mélangent parfois le français et l'anglais (« Coffret Simiabraz V Showcase »). À compléter au fil de l'eau.
- **Produits asiatiques non marqués** (« Aura Seeker », « Nihil Zero », « Miracle Crystal ») : ils restent dans les scellés sans set. Piste : relire aussi les cartes de `data-asia/` pour repérer les extensions japonaises par le vote des cartes.
- **Images** : 33 % des scellés en ont une. Pistes : les tripacks FR de Poképédia (fichiers `Tripack_<code FR>_<Pokémon>`), aucune image pour les demi-displays. Le service worker de l'app ne met pas en cache `www.pokepedia.fr` ni `tcgplayer-cdn.tcgplayer.com` (`vite.config.ts` vise le CDN Cardmarket, qui n'est pas utilisé).
- **Taille** : plafonner les historiques (par exemple 2 ans glissants) ou découper les gros fichiers par semestre. Le fichier de prix du jour (383 Ko en gzip) pourrait passer en delta si besoin.
- **Cron d'un dépôt public** : GitHub désactive les crons après 60 jours sans activité sur le dépôt. Il faut vérifier que les push de la branche `donnees` suffisent, sinon réactiver le workflow dans l'onglet Actions.
- **Archives brutes** : seules les 60 dernières archives compactes vivent dans le cache Actions, qui n'est pas garanti. La source de vérité reste l'historique de la branche `donnees`. Une archive mensuelle en Release GitHub (§9.2 de la recherche) rendrait tout reconstructible.
- **TCGdex en retard sur un nouveau set** (pas encore de `thirdParty`) : ces cartes restent sans cote. Le rattrapage depuis les archives leur donne leurs jours passés dès qu'elles sont reliées.
