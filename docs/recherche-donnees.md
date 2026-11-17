# Sources de données du classeur Pokémon TCG

Recherche du 17/11/2026. Tout ce qui suit a été vérifié par de vraies requêtes (curl) ou par l'analyse des fichiers téléchargés. Les petits extraits réels sont dans [`echantillons/`](echantillons/). Les tailles « brotli » sont mesurées avec `brotli -q 11`, les durées depuis une connexion à Paris.

## Sommaire

1. [L'essentiel](#1-lessentiel)
2. [Cardmarket : fichiers publics quotidiens](#2-cardmarket--fichiers-publics-quotidiens)
3. [TCGdex : catalogue multilingue](#3-tcgdex--catalogue-multilingue)
4. [Correspondance carte TCGdex ↔ produit Cardmarket](#4-correspondance-carte-tcgdex--produit-cardmarket)
5. [Historique des prix](#5-historique-des-prix)
6. [Scellés : noms en français](#6-scellés--noms-en-français)
7. [Japonais](#7-japonais)
8. [Conditions d'utilisation](#8-conditions-dutilisation)
9. [Pipeline recommandé](#9-pipeline-recommandé)
10. [Annexes : échantillons, scripts, sources](#10-annexes)

---

## 1. L'essentiel

- **Cardmarket publie gratuitement, sans compte, trois fichiers JSON** : cartes (13,9 Mo, 75 742 produits), scellés (0,96 Mo, 5 117 produits) et guide des prix (15,9 Mo, 80 885 lignes). Le guide est régénéré chaque nuit vers **02 h 45–02 h 51, heure de Paris**. Les listes de produits sont régénérées irrégulièrement (le 12/11 puis le 16/11 sur nos relevés).
- **Le catalogue Cardmarket des cartes n'a pas de numéro de carte**, et il n'y a **pas de fichier des extensions**. Le nom porte les attaques entre crochets (`Charizard ex [Brave Wing | Explosive Vortex]`), et 35 % des cartes partagent leur nom avec une autre carte de la même extension. Sans aide extérieure, on ne peut donc pas relier une carte à son produit Cardmarket.
- **TCGdex fournit cette aide.** Chaque carte (et chaque variante) porte `thirdParty.cardmarket` = l'`idProduct` Cardmarket, et chaque set porte `thirdParty.cardmarket` = l'`idExpansion`. Couverture mesurée sur tout le catalogue : **96,3 % des cartes FR** et 80,7 % des cartes JA (91 à 100 % pour les séries JA récentes). Sur 150 cartes FR tirées au hasard, l'API et le dépôt donnent les mêmes identifiants dans 150 cas sur 150.
- **Le `pricing.cardmarket` de TCGdex est simplement le guide des prix Cardmarket joint sur cet identifiant**, avec au moins un jour de retard. Il vaut mieux lire Cardmarket directement et ne prendre chez TCGdex que le catalogue, les noms FR, les images et les correspondances.
- **Les champs `-holo` du guide correspondent aux reverse** (drapeau Cardmarket « Reverse Holo »). Une reverse simple partage l'`idProduct` de la carte normale. Les reverses spéciales (Poké Ball, Master Ball…), les tampons et les holos cosmos ont leur propre `idProduct`, que TCGdex distingue dans `variants_detailed`.
- **Pour les scellés, `avg1`, `avg7` et `avg30` sont toujours vides** : seuls `trend`, `low` et `avg` existent. Tous les prix mélangent les langues (FR, EN, DE…), sauf pour les produits asiatiques, qui sont des produits Cardmarket à part.
- **Il n'existe aucun historique Cardmarket gratuit et complet.** Seul bonus : la Wayback Machine a archivé `price_guide_6.json` sur **63 jours**, presque chaque jour du 09/09 au 16/11/2026. On peut ainsi amorcer environ deux mois d'historique. Pour le reste, il faut enregistrer nous-mêmes un relevé par jour : environ **43 Mo par an** pour l'historique de tous les produits, découpé en fichiers par extension (médiane 41 Ko).
- **Les noms FR des scellés se construisent automatiquement** : extension Cardmarket → set TCGdex → nom FR du set, plus un dictionnaire des types de produits. Ça marche pour 98 % des ETB et 51 % de l'ensemble des scellés non asiatiques. Le reste (decks, pokébox, coffrets non rattachés à un set) se nomme par le type et le nom FR du Pokémon, avec un petit fichier de corrections à la main.
- **Le téléphone peut tout charger en moins de 400 Ko compressés** : catalogue FR (140 Ko brotli), scellés FR (57 Ko) et prix du jour (158 Ko). Il charge ensuite à la demande l'historique d'une extension (médiane 41 Ko par an) et les images TCGdex (18 Ko en `low.webp`).

---

## 2. Cardmarket : fichiers publics quotidiens

### 2.1 URLs et volumes

| Fichier | URL exacte | Taille | Contenu (17/11/2026) |
|---|---|---|---|
| Cartes à l'unité | `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json` | 13 884 428 o | 75 742 produits, `createdAt` 2026-11-16T13:56:57+0100 |
| Scellés et divers | `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json` | 957 436 o | 5 117 produits, `createdAt` 2026-11-16T13:56:59+0100 |
| Guide des prix | `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json` | 15 876 793 o | 80 885 lignes, `createdAt` 2026-11-17T02:51:10+0100 |

- `6` = Pokémon (`1` = Magic, `3` = Yu-Gi-Oh!… : la page « Data Tables » de Cardmarket propose une vingtaine de jeux, numérotés de 1 à 22).
- Accès anonyme, servi par S3 + CloudFront (POP `CDG52`). Chaque fichier se télécharge en 0,3 à 0,6 s.
- **Pas de compression** : avec `Accept-Encoding: gzip`, la réponse a la même `Content-Length` que sans. Il faut donc télécharger les 16 Mo bruts. Une fois compressé, le guide pèse 1,5 Mo en gzip et 1,1 Mo en brotli.
- **Pas d'en-tête CORS** : un navigateur (la web app) ne peut pas lire ces fichiers directement. C'est une raison de plus pour passer par un traitement côté serveur (GitHub Actions).
- Le listing du bucket est refusé (`AccessDenied` sur `/?list-type=2`).

### 2.2 Catalogue des cartes (`products_singles_6.json`)

```json
{"version":1,"createdAt":"2026-11-16T13:56:57+0100","products":[
 {"idProduct":733794,"name":"Charizard ex [Brave Wing | Explosive Vortex]","idCategory":51,
  "categoryName":"Pokémon Single","idExpansion":5402,"idMetacard":421085,"dateAdded":"2023-09-22 05:57:24"}, …]}
```

| Champ | Constat |
|---|---|
| `idProduct` | Unique (de 273 532 à 923 833), sans doublon. Il sert de clé partout (prix, URL, image). |
| `name` | **Nom anglais + attaques entre crochets.** 57 514 noms ont des crochets. **Aucun numéro de carte.** |
| `idCategory` / `categoryName` | Toujours `51` / `Pokémon Single`. |
| `idExpansion` | 793 extensions distinctes. **Aucun nom d'extension** dans le fichier. |
| `idMetacard` | Même « carte abstraite » pour toutes ses réimpressions (16 891 distincts ; jusqu'à 325 produits pour une même énergie). |
| `dateAdded` | 8 396 produits anciens à `0000-00-00 00:00:00`. |

**Pas de numéro, donc pas de correspondance par « extension + numéro ».** 10 714 couples (extension, nom) se répètent, soit 26 252 produits (35 %) qu'on ne peut pas départager par le nom. Exemple : la même carte Némélios (Pyroar) d'Évolutions Prismatiques existe en trois produits, normale, reverse Poké Ball et reverse Master Ball :

```json
{"idProduct":805405,"name":"Pyroar [Fire Mane | Flame Tackle]","idExpansion":5944,"idMetacard":443261,"dateAdded":"2025-01-09 14:09:29"}
{"idProduct":806430,"name":"Pyroar [Fire Mane | Flame Tackle]","idExpansion":6009,"idMetacard":443261,"dateAdded":"2025-01-17 02:06:03"}
{"idProduct":806431,"name":"Pyroar [Fire Mane | Flame Tackle]","idExpansion":6009,"idMetacard":443261,"dateAdded":"2025-01-17 02:06:12"}
```

Une carte FR et la même carte EN, DE ou IT sont **un seul produit** : la langue est un attribut de l'offre, pas du produit. Les cartes japonaises, chinoises, coréennes… sont en revanche des produits distincts, dans des extensions à part (voir §7).

### 2.3 Catalogue des scellés (`products_nonsingles_6.json`)

Mêmes champs. `idMetacard` vaut toujours 0. Il y a 694 extensions, dont 691 communes avec les cartes.

| idCategory | categoryName | Produits | Nom FR proposé |
|---|---|---|---|
| 1015 | Pokémon Box Set | 1 123 | Coffret (collection, coffret premium…) |
| 52 | Pokémon Booster | 797 | Booster |
| 1017 | Pokémon Coins | 698 | Pièce |
| 53 | Pokémon Display | 626 | Display |
| 1014 | Pokémon Tins | 573 | Pokébox |
| 54 | Pokémon Theme Decks | 560 | Deck |
| 1083 | Pokémon Blisters | 498 | Blister / tripack / duopack |
| 1016 | Pokémon Elite Trainer Boxes | 171 | Coffret Dresseur d'Élite (ETB) |
| 1654 | PCG Set | 30 | Set complet (« Full Set », « Main Set », « Reverse Holo Main Set ») |
| 1064 | Pokémon Lot | 28 | Lot |
| 1013 | Pokémon Trainer Kits | 13 | Kit du Dresseur |

```json
{"idProduct":798930,"name":"Prismatic Evolutions Elite Trainer Box","idCategory":1016,
 "categoryName":"Pokémon Elite Trainer Boxes","idExpansion":5944,"idMetacard":0,"dateAdded":"2024-11-05 15:29:42"}
```

### 2.4 Fichier des extensions : il n'existe pas

- Douze noms plausibles testés (`expansionList/expansions_6.json`, `expansions/expansions_6.json`, `productList/expansions_6.json`, versions `.csv`…) : tous répondent **403** (le bucket renvoie 403 pour un objet absent). Les fichiers des autres jeux (`products_singles_1.json`, `price_guide_1.json`) répondent bien 200.
- La page « Data Tables » de Cardmarket (copie Wayback de juin 2026) ne liste que les `price_guide_N.json`.
- **Solution** : le dépôt TCGdex donne `idExpansion → set` pour 211 extensions, et le vote des cartes en ajoute 87 (voir §4.4 et §6). Pour une extension non reliée, le nom des scellés qu'elle contient suffit souvent (`CSV9.5C: Terastal Gathering Booster`).

### 2.5 Guide des prix (`price_guide_6.json`)

```json
{"version":1,"createdAt":"2026-11-17T02:51:10+0100","priceGuides":[
 {"idProduct":279740,"idCategory":51,"avg":0.24,"low":0.02,"trend":0.36,"avg1":0.29,"avg7":0.31,"avg30":0.29,
  "avg-holo":1.64,"low-holo":0.15,"trend-holo":1.86,"avg1-holo":2,"avg7-holo":2.25,"avg30-holo":1.36},
 {"idProduct":798930,"idCategory":1016,"avg":151.99,"low":84,"trend":143.04,"avg1":null,"avg7":null,"avg30":null,
  "avg-holo":null,"low-holo":null,"trend-holo":0,"avg1-holo":null,"avg7-holo":null,"avg30-holo":null}, …]}
```

(279740 = Vipélierre, Noir & Blanc 2 ; 798930 = ETB Évolutions Prismatiques.)

**Sens des champs.** La seule documentation officielle trouvée est celle de l'ancien point d'accès de l'API 2.0 (`https://apiv2.cardmarket.com/ws/documentation/API_2.0:PriceGuide`). Elle précise : « *This endpoint was deprecated on 05.06.2024 as this feature was made generally available via the website* ». Les fichiers JSON publics en sont la suite. La correspondance avec les colonnes ci-dessous se fait par le nom :

| JSON | Colonne de l'API 2.0 | Définition officielle (traduite) |
|---|---|---|
| `avg` | Avg. Sell Price | Prix de vente moyen tel qu'affiché dans le graphique du site (hors foil). Il s'agit bien de ventes et non d'offres : pour un display Set de Base, `avg` = 15 000 € alors que `low` = 19 999 €. |
| `low` | Low Price | Prix le plus bas actuellement en vente, hors foil, **tous états, toutes langues**. |
| `trend` | Trend Price | Prix de tendance affiché sur le site et dans le graphique. La formule n'est pas publiée. |
| `avg1` / `avg7` / `avg30` | AVG1 / AVG7 / AVG30 | Prix de vente moyen sur le dernier jour, les 7 derniers jours ou les 30 derniers jours. |
| `avg-holo`, `low-holo`, `trend-holo`, `avg1-holo`… | Foil Sell, Foil Low, Foil Trend, Foil AVG1… | Mêmes définitions, pour les articles « foil ». |

Le JSON n'a pas les colonnes « German Pro Low », « Suggested Price » ni « Low Price Ex+ ».

**« holo » = reverse.** La doc de l'entité *Article* de l'API indique : « `isFoil` for Magic, Pokémon **(deprecated)** singles » et « `isReverseHolo` for Pokémon singles ». Le pokemontcg.io SDK nomme d'ailleurs ces champs `reverseHoloSell`, `reverseHoloLow`, `reverseHoloTrend`, `reverseHoloAvg1`… Vérification sur les données :
- Vipélierre (279740) : normale `trend` 0,36 €, reverse `trend-holo` 1,86 €.
- Dans l'échantillon TCGdex, sur 51 cartes qui ont une variante normale et une reverse, 48 utilisent le même `idProduct` pour les deux. Parmi les 3 autres, deux cartes n'ont que des reverses spéciales (Rapide Ball, Énergie), et Frison (`sv07-119`) est un cas particulier : sa reverse partage l'`idProduct` de sa version holo.
- Pour une carte qui n'existe pas en reverse, les champs `-holo` sont du bruit : des vendeurs cochent la case par erreur. Exemple : Dracaufeu du Set de Base (273699), `trend-holo` 123,63 € contre `trend` 290,28 €. Il faut donc n'utiliser `-holo` que si TCGdex déclare une variante reverse partageant cet `idProduct`.

**Taux de remplissage (17/11/2026)** :

| Champ | Cartes (75 740) | Scellés (5 117) |
|---|---|---|
| `trend` | 89,1 % | 87,2 % |
| `low` | 91,6 % | 79,5 % |
| `avg` | 80,9 % | 82,6 % |
| `avg1` / `avg7` / `avg30` | 85,2 % | **0 %** |
| `trend-holo` | 88,9 % | 69,8 % (artefact, à ignorer) |
| `avg-holo` / `low-holo` | 26,3 % / 32,3 % | 0 % |

**Pièges :**
- Les valeurs sont des nombres flottants en euros ou des entiers. `trend-holo` vaut souvent `0`, à traiter comme vide.
- Tous les prix mélangent les langues pour un même produit. Un ETB français et un ETB anglais ont la même tendance, et une carte FR la même cote qu'une carte EN. Le projet etb-radar le relève déjà : il lit les offres d'une langue sur la fiche web. Ces fichiers ne donnent pas de prix par langue ni par état.
- Le guide contient des produits **absents des listes** quand celles-ci ont quelques jours de retard. Le 17/11, 28 `idProduct` > 923 872 étaient dans le guide mais pas dans les catalogues. Il faut garder ces prix et attendre la liste suivante.
- Le guide compte 51 806 lignes dans la capture du 30/12/2024, 78 244 le 09/09/2026 et 80 885 le 17/11/2026.

### 2.6 Images Cardmarket

| Type | Motif | Exemple testé | Résultat |
|---|---|---|---|
| Scellés (toutes catégories) | `https://product-images.s3.cardmarket.com/{idCategory}/{idProduct}/{idProduct}.jpg`, ou `.png` pour les produits anciens | `1016/860573/860573.jpg` | 200 : PNG 300×300 malgré l'extension `.jpg`, `content-type: multerS3.AUTO_CONTENT_TYPE` |
| Cartes | `https://product-images.s3.cardmarket.com/51/{code extension}/{idProduct}/{idProduct}.jpg` | `51/MEW/733794/733794.jpg`, `51/BS/273699/273699.jpg`, `51/sv2a/719654/719654.jpg` | 200 : JPEG 255×361, environ 35 Ko |

- Catégories de scellés testées, toutes OK : 52, 53, 54, 1013, 1014, 1015, 1016, 1017, 1064, 1083, 1654. En général `.jpg` pour les produits récents (2024 et après) et `.png` pour les anciens, avec des exceptions (un lot de 2018 en `.jpg`) : il faut essayer les deux. Le motif `/51/{id}/{id}.jpg` sans code d'extension répond 403 pour les cartes.
- **En-tête `Referer: https://www.cardmarket.com/` obligatoire** (403 sans). Une page web ne peut pas forcer ce Referer, donc **pas de lien direct possible depuis l'app**.
- Pour les cartes, le code d'extension Cardmarket est inconnu (pas de fichier d'extensions). L'abréviation officielle TCGdex fonctionne pour **23 sets sur 34 testés (68 %)** : MEW, BS, NVI, SVI, CRZ, PBL… Elle échoue pour COL, G2, UND, TRI, N3, N4, P7, P8. Pour le japonais, c'est l'identifiant TCGdex en minuscules (`sv2a`).
- Alternatives pour les scellés : le CDN TCGplayer (via tcgcsv, voir §5.3), `https://tcgplayer-cdn.tcgplayer.com/product/{productId}_{200w|400w|in_1000x1000}.jpg`, sans Referer (7 Ko, 21 Ko ou 88 Ko pour l'ETB Évolutions Prismatiques Pokémon Center). Poképédia fournit les boîtes **françaises**, comme le fait déjà `etb-radar/src/images.ts`.

### 2.7 Heures de publication et fiabilité

| Relevé | `createdAt` du guide des prix |
|---|---|
| 09/09/2026 | 02:45:45 +0200 |
| 11/11 | 02:45:38 +0100 |
| 12/11 | 02:51:19 +0100 |
| 13/11 | 02:44:11 +0100 |
| 15/11 | 02:47:59 +0100 |
| 16/11 | 02:48:57 +0100 |
| 17/11 | 02:51:10 +0100 (S3 `Last-Modified` 01:51:20 GMT) |

- Le guide est généré **chaque nuit entre 02 h 44 et 02 h 51, heure de Paris**, été comme hiver (soit 00 h 45 UTC l'été et 01 h 45 UTC l'hiver).
- **Il manque parfois un jour.** Le 14/11 à 11 h 51, le cache d'etb-radar a encore récupéré le guide du 13/11, et la Wayback Machine n'a rien pour le 14/11. Il faut donc dater chaque relevé avec `createdAt` et non avec la date du traitement.
- **Les listes de produits ne sont pas quotidiennes** : `createdAt` du 12/11 à 15 h 13, puis du 16/11 à 13 h 56. Le 14/11 à 11 h 51, c'était encore celle du 12/11, et le 17/11 à 11 h 44, encore celle du 16/11. Il suffit de surveiller l'`ETag` avec une requête `HEAD`.
- CloudFront : l'origine n'envoie pas de `Cache-Control`. Les `age` observés restent sous 3 600 s, donc une copie est au plus vieille d'environ 1 h. Un paramètre `?v=` est ignoré (même `age`), il ne force pas le rafraîchissement.

---

## 3. TCGdex : catalogue multilingue

### 3.1 Langues et volumes

Base : `https://api.tcgdex.net/v2/{langue}/…`. Les langues acceptées sont `en, fr, es, es-mx, it, pt, pt-br, pt-pt, de, nl, pl, ru, ja, ko, zh-tw, id, th, zh-cn` (dépôt, `interfaces.d.ts`).

| | FR | EN | JA |
|---|---|---|---|
| Cartes (`GET /v2/{l}/cards`) | 22 342 (2,15 Mo, 0,51 s) | 23 912 (2,40 Mo, 0,59 s) | 13 156 (0,99 Mo, 0,37 s) |
| dont TCG Pocket (jeu mobile, à exclure) | 2 116 | 2 480 | 0 |
| Cartes physiques | **20 226** | 21 432 | 13 156 |
| Sets (`/v2/{l}/sets`) | 203 (32 Ko) | 221 (36 Ko) | 204 (18 Ko) |
| Séries | 19 | 21 | 15 |
| Images présentes (hors Pocket) | **85,5 %** | 92,4 % | 29,5 % |

Les identifiants des sets et des cartes sont **les mêmes en FR et en EN** (`sv03.5-199`). Le japonais a ses propres identifiants (`SV2a-201`). L'API ne compresse pas ses réponses (même `content-length` avec `Accept-Encoding: gzip`), envoie `cache-control: no-cache` et `access-control-allow-origin: *`.

Points d'accès REST utiles :
- `/cards`, `/cards/{id}`, `/sets`, `/sets/{id}` (le set avec la liste de ses cartes), `/sets/{id}/{localId}`, `/series`, `/series/{id}` ;
- filtres et pagination : `?set.id=eq:me06`, `?pagination:page=2&pagination:itemsPerPage=3`, `?sort:field=id` (tous testés : HTTP 200).

### 3.2 Une carte

Extrait réel de `GET https://api.tcgdex.net/v2/fr/cards/sv03.5-199` (complet dans [`echantillons/tcgdex-rest-carte-fr-sv03.5-199.json`](echantillons/tcgdex-rest-carte-fr-sv03.5-199.json)) :

```json
{
 "category": "Pokémon", "id": "sv03.5-199", "localId": "199", "name": "Dracaufeu-ex",
 "image": "https://assets.tcgdex.net/fr/sv/sv03.5/199", "illustrator": "miki kudo",
 "rarity": "Illustration spéciale rare",
 "set": {"id": "sv03.5", "name": "151", "cardCount": {"official": 165, "total": 207},
         "logo": "https://assets.tcgdex.net/fr/sv/sv03.5/logo", "symbol": "https://assets.tcgdex.net/univ/sv/sv03.5/symbol"},
 "variants": {"firstEdition": false, "holo": true, "normal": false, "reverse": false, "wPromo": false},
 "variants_detailed": [{"type": "Holo", "size": "Standard",
   "thirdParty": {"cardmarket": 733794, "tcgplayer": 517045, "cardtrader": 261377},
   "variantId": "jr7oetx1mqug9",
   "pricing": {"cardmarket": {"updated": "2026-11-16T22:22:55.179Z", "unit": "EUR", "idProduct": 733794,
                "avg": 336.32, "low": 180, "trend": 332.78, "avg1": 284.95, "avg7": 327.93, "avg30": 329.49,
                "avg-holo": null, "low-holo": null, "trend-holo": 0, "avg1-holo": null, "avg7-holo": null, "avg30-holo": null},
               "tcgplayer": {"unit": "USD", "updated": "2026-11-16T22:22:55.986Z",
                "holofoil": {"productId": 517045, "lowPrice": 242.8, "midPrice": 336.34, "highPrice": 10000,
                             "marketPrice": 285.96, "directLowPrice": 264.99}}}}],
 "dexId": [6], "hp": 330, "types": ["Feu"], "evolveFrom": "Reptincel", "stage": "Niveau 2", "suffix": "ex",
 "regulationMark": "G", "legal": {"standard": false, "expanded": true}, "updated": "2026-06-09T12:54:48+01:00",
 "pricing": {"cardmarket": {"…": "copie du pricing de la variante principale"}, "tcgplayer": {"…": "…"}}
}
```

Champs observés sur 150 cartes FR tirées au hasard : `id, localId, name, category, rarity, set, variants, variants_detailed, legal, updated, pricing` (toujours présents) ; `image` (125/150), `illustrator`, `dexId`, `hp`, `types`, `stage`, `attacks`, `weaknesses`, `retreat`, `regulationMark`, `resistances`, `abilities`, `evolveFrom`, `effect`, `trainerType`, `suffix`, `description`, `energyType`, `cameoDexIds`, et **`thirdParty` au niveau de la carte (49/150) quand il n'est pas sur la variante**. Une réponse fait 2,3 Ko en moyenne (5,6 Ko au maximum).

**`variants_detailed`** décrit chaque impression : `type` (Normal, Reverse, Holo ; la casse varie, il faut normaliser), `subtype` (« sans ombre », « illimité », « Copyright 1999-2000 »), `size`, `stamp` (`["1re Édition"]`, `["Pokémon Center"]`, `["Build a Bear"]`), `foil` (« Pokéball », « Masterball », « Cosmos », « cracked-ice », « Énergie », « Rapide Ball »), `thirdParty`, `variantId` et `pricing`. Voir [`echantillons/tcgdex-rest-carte-fr-sv08.5-016.json`](echantillons/tcgdex-rest-carte-fr-sv08.5-016.json) (Némélios : normale, reverse, reverse Poké Ball et reverse Master Ball, avec trois `idProduct`).

**`pricing` : d'où viennent ces prix.** Le code serveur (`server/src/libs/providers/cardmarket.ts`) télécharge `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`, au plus une fois par heure, et renvoie la ligne dont l'`idProduct` vaut `thirdParty.cardmarket`. Rien de plus. Le champ `updated` est l'heure de chargement par leur serveur, pas le `createdAt` du guide. Constat du 17/11 à 11 h 30 : TCGdex servait encore le guide **du 16/11** (`trend` 332,78 € pour 733794, contre 323,62 € dans le guide du 17/11). `pricing.tcgplayer` (USD) donne `lowPrice`, `midPrice`, `highPrice`, `marketPrice` et `directLowPrice` par finition (`normal`, `holofoil`, `reverse-holofoil`…).

Pour une carte japonaise (`GET /v2/ja/cards/SV2a-201`) : nom `リザードンex`, `thirdParty.cardmarket` = 719654 (produit de l'extension japonaise 5328), `pricing.tcgplayer` = `null`.

### 3.3 Récupérer tout le catalogue : quatre méthodes mesurées

| Méthode | Ce qu'on obtient | Volume / temps mesurés | Limites |
|---|---|---|---|
| **REST, listes** `GET /v2/fr/cards` | `id`, `localId`, `name`, `image` | 2,15 Mo, 0,5 s par langue | Pas de rareté, de variantes ni de set détaillé. |
| **GraphQL** `POST https://api.tcgdex.net/v2/graphql` avec `cards @locale(lang: "fr") { … }` | Tous les champs « carte » choisis, **toutes les cartes en une requête** | FR : 22 342 cartes, 5,7 Mo, **0,65 s**. `variants_detailed` FR : 3,6 Mo, 0,69 s. Sets FR (date, série, nombre de cartes) : 61 Ko, 0,23 s. JA : 1,4 Mo, 0,46 s. | **Pas de `pricing` ni de `thirdParty`.** Pagination cassée (`pagination: {page:1, itemsPerPage:3}` → erreur « value.indexOf is not a function ») : il faut la retirer. Sans `@locale`, la réponse est en anglais (`?lang=fr` est ignoré). En JA, `rarity` est nul pour 665 cartes, ce qui fait échouer le champ : il faut l'omettre. |
| **REST, carte par carte** `GET /v2/fr/cards/{id}` | Tout, y compris `thirdParty` et `pricing` | 150 cartes en 70 s (0,22 s de requête + 0,25 s de pause), 2,3 Ko par carte. Pour 20 000 cartes : environ 45 Mo et **1 h 30 à 3 h par langue**. | Trop lent pour tout récupérer chaque jour. Correct pour les seules nouvelles cartes. |
| **Dépôt** `github.com/tcgdex/cards-database` (licence MIT) | Les sources : noms dans toutes les langues, `thirdParty` des cartes, des variantes **et des sets** (absent de l'API) | `git clone --depth 1 --filter=blob:none --sparse` puis `sparse-checkout set data data-asia` : **15 s**. `data` = 96 Mo (24 260 fichiers `.ts`), `data-asia` = 74 Mo (18 949). Lecture par expressions régulières : 3,7 s. | Ce sont des fichiers TypeScript. Les lire comme du texte suffit (testé : 150/150 identiques à l'API), sans exécuter leur code. Pas de noms FR des raretés (l'API les traduit). |

Il n'existe pas d'export prêt à l'emploi. Les anciens dépôts `tcgdex/distribution` et `tcgdex/compiler` sont abandonnés depuis 2021. La FAQ (`https://tcgdex.dev/faq`) dit « *There are no published hard rate limits, but please be considerate* » et « *For bulk data needs, cache responses locally* ».

**Recommandé** : GraphQL pour les noms, raretés, variantes et sets dans chaque langue (quelques requêtes, environ 15 Mo), plus le dépôt pour les `thirdParty`. On relance seulement quand le dépôt bouge (dernier commit vu : 15/11/2026, « Add variants for the Delta reign set »).

### 3.4 Images TCGdex

- Format : `{image}/{qualité}.{extension}`, avec la qualité `high` (600×825) ou `low` (245×337) et l'extension `webp` (recommandée par TCGdex), `png` (fond transparent) ou `jpg`. L'URL sans suffixe répond 404.
- Tailles mesurées pour `https://assets.tcgdex.net/fr/sv/sv03.5/199/…` :

| | webp | jpg | png |
|---|---|---|---|
| `high` (600×825) | 65 Ko | 80 Ko | 269 Ko |
| `low` (245×337) | **18 Ko** | 20 Ko | 55 Ko |

- En-têtes : `cache-control: public, max-age=31536000, immutable` et `access-control-allow-origin: *`. On peut donc afficher ces images directement dans l'app, et le cache du navigateur et du service worker fonctionne.
- Symbole et logo des sets : `https://assets.tcgdex.net/univ/sv/sv03.5/symbol` (commun à toutes les langues) et `https://assets.tcgdex.net/fr/sv/sv03.5/logo`, avec une extension à ajouter.

**Couverture des images FR par série (cartes physiques)** :

| Série | Images FR | | Série | Images FR |
|---|---|---|---|---|
| Écarlate et Violet | 98,5 % | | Diamant et Perle | **14,9 %** |
| Épée et Bouclier | 90,3 % | | Platine, Noir et Blanc, Neo | 100 % |
| Soleil et Lune | 76,2 % | | HGSS | 93,4 % |
| XY | 99,6 % | | Base | 92,3 % |
| EX | 98,3 % | | Méga-Évolution (sets récents) | 89,3 % |
| Kits du dresseur, McDonald's, L'Appel des Légendes | **0 %** | | **Total** | **85,5 %** |

Avec un repli sur l'image anglaise de la même carte (même identifiant), on passe à **92,4 %**. En JA : Écarlate et Violet 78 %, Épée et Bouclier 53 %, Soleil et Lune et Méga 0 %, soit 29,5 % au total.

### 3.5 Licence TCGdex

- Base de données : **licence MIT** (README : « *The Database is licensed under the MIT License* » ; « *not produced, endorsed, supported or affiliated with Nintendo or The Pokémon Company* »).
- Images : aucune règle publiée (`https://tcgdex.dev/assets` ne parle que des formats). Les illustrations restent la propriété de Nintendo, Creatures, GAME FREAK et The Pokémon Company. Voir §8.

---

## 4. Correspondance carte TCGdex ↔ produit Cardmarket

### 4.1 Méthode retenue : `thirdParty.cardmarket`

On a lu les 42 599 fichiers de cartes et les 571 fichiers de sets du dépôt (commit du 15/11/2026), puis croisé le résultat avec les catalogues Cardmarket du 16/11. Les cartes TCG Pocket sont exclues.

| Population | Avec un `idProduct` présent dans `products_singles_6.json` |
|---|---|
| Cartes internationales (`data/`) | 20 731 / 21 535 = **96,3 %** |
| Cartes ayant un nom FR | 19 522 / 20 267 = **96,3 %** |
| Cartes ayant un nom EN | 20 629 / 21 433 = 96,2 % |
| Cartes ayant un nom JA (`data-asia/`) | 11 028 / 13 660 = **80,7 %** |

Par série (cartes FR) : Écarlate et Violet 100 %, Méga-Évolution 100 %, Épée et Bouclier 99,9 %, Platine 99,3 %, HGSS 98,9 %, EX 98,6 %, Base 98,5 %, XY 95,1 %, Soleil et Lune 94,3 %, Noir et Blanc 92,2 %, Diamant et Perle 91,9 %, POP 83,4 %, **Kits du dresseur 47 %**.

**Contrôles :**
- **API contre dépôt** : 150 cartes FR tirées au hasard dans l'API (`/v2/fr/cards/{id}`). 146 ont un `idProduct` (97,3 %), et les 150 ont **exactement les mêmes identifiants** que le dépôt. Les 146 identifiants existent dans le catalogue et dans le guide des prix, et tous ont un `trend`.
- **Nom anglais** : le nom TCGdex et le nom Cardmarket (sans crochets) concordent dans 22 193 cas et diffèrent dans 527 (2,3 %). Ces écarts sont presque tous des orthographes : `Impostor/Imposter`, `Nidoran♀`/`Nidoran ♀`, `α`/`alpha`, `Blend Energy GFPD`.
- **Extension** : pour 33 851 identifiants de variante, l'extension du produit est celle du set. Pour 2 692, c'est une autre extension, parce que Cardmarket découpe certains sets (Évolutions Prismatiques 5944 et 6009 pour les reverses spéciales, Héros Transcendants 6395 et 6455, 151 JP 5328 et 6219…). 6 898 identifiants viennent de sets sans `idExpansion`, et 3 identifiants sont absents.

### 4.2 Variantes et choix du prix

1 433 cartes FR ont plusieurs `idProduct` : reverses Poké Ball ou Master Ball, holos cosmos, tampons Pokémon Center, Build-a-Bear, 1re édition, sans ombre, signatures des decks de championnat. Règle de prix pour une variante :

```
idProduct = variante.thirdParty.cardmarket ?? carte.thirdParty.cardmarket
si variante.type = reverse ET idProduct = idProduct de la variante normale (ou holo) de la même carte
    → prix = champs -holo (trend-holo, low-holo, avg7-holo…)
sinon
    → prix = trend, low, avg7…
```

### 4.3 Repli « extension + numéro » : ne marche pas

Le catalogue Cardmarket n'a pas de numéro. On a tenté « extension(s) du set + nom anglais » pour les 744 cartes FR sans identifiant : 10 trouvent un candidat unique, 11 en trouvent plusieurs, 256 aucun, et 467 sont dans un set sans extension connue. Ces cartes manquantes sont surtout des kits du dresseur (246), des promos et des cartes Soleil et Lune ou Noir et Blanc. Il faut les laisser **sans cote** ou les relier à la main au besoin.

### 4.4 Couverture inverse et extensions

- TCGdex référence 33 573 des 75 742 cartes Cardmarket (44,3 %). Dans les extensions **internationales**, la part monte à 21 832 / 27 739 (78,7 %). Le reste est fait de promos, de Prize Packs, de decks de championnat du monde et de cartes tamponnées. 34 632 cartes Cardmarket sont dans des extensions non reliées : chinoises (`CSV9C:`, `CSM2DC:`…), produits spéciaux japonais (Start Deck 100, Mission Reward), indonésiennes et thaïlandaises.
- **Extension Cardmarket → set TCGdex** : 211 extensions sont reliées directement. 215 sets ont un `thirdParty.cardmarket` (152 des 209 sets internationaux et 63 sets asiatiques), et quelques sets partagent la même extension. On en ajoute 87 par vote, si au moins 50 % des cartes référencées de l'extension viennent du même set ET au moins 35 % des cartes de l'extension sont référencées. Total : 298 extensions sur 796. Le seuil de 35 % écarte les extensions faites de réimpressions (Prize Packs, WCD), qui sinon se retrouveraient rattachées à tort à Flammes Obsidiennes.

---

## 5. Historique des prix

### 5.1 Sources gratuites trouvées

| Source | Ce qu'il y a | Utilité |
|---|---|---|
| Cardmarket | Rien. Seulement le guide du jour, avec `avg1`, `avg7` et `avg30` pour les cartes. | Les moyennes donnent un contexte sur 30 jours dès le premier jour (cartes seulement). |
| **Wayback Machine** | **67 captures** de `price_guide_6.json` (63 jours distincts) : 30/12/2024, 17/06/2026, puis **61 jours du 09/09 au 16/11/2026** (8 jours manquent). Liste : `https://web.archive.org/cdx/search/cdx?url=downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json&output=json&filter=statuscode:200`. Fichier : `https://web.archive.org/web/{horodatage}id_/https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json` (10 à 16 Mo, 3 à 6 s ; JSON complet avec la même structure, environ 80 800 lignes et son `createdAt` d'origine, vérifié sur 7 captures). | **Amorcer environ deux mois d'historique** (cartes et scellés). Personne ne garantit ces captures : c'est un bonus. Aucune capture des listes de produits. |
| `github.com/tcgdex/price-history` | Historique eBay FR (ex. `fr/base1/100.ebay.json`) et TCGplayer EN, par carte et par état. En sommeil : eBay jusqu'au 09/06/2025, TCGplayer jusqu'au 24/09/2024. **Pas de Cardmarket.** Dépôt de 1,17 Go, sans licence déclarée. | Faible. |
| **tcgcsv.com** (TCGplayer, USD) | Prix quotidiens de tous les jeux, archivés depuis le **08/02/2024** : `https://tcgcsv.com/archive/tcgplayer/prices-AAAA-MM-JJ.ppmd.7z` (2,1 Mo au 08/02/2024, 4,2 Mo au 16/11/2026, toutes catégories, à extraire avec 7-Zip). Pokémon = catégorie 3 (221 groupes) ; Pokémon Japon = 85. Mise à jour vers 20 h UTC. | **Repli** pour une courbe longue, mais en dollars et sur le marché américain. Les `productId` TCGplayer sont dans `thirdParty.tcgplayer` des cartes, et `groupId` dans celui des sets (ex. 24831 = Règne Delta). |
| Services payants (PokemonPriceTracker, Poketrace, CardNexus…) | Historique Cardmarket, accessible contre paiement. L'offre gratuite de PokemonPriceTracker ne garde que 3 jours d'historique. | Hors sujet (pas de serveur payant). |

Schéma tcgcsv (`GET https://tcgcsv.com/tcgplayer/3/23821/prices`) :

```json
{"productId": 593294, "lowPrice": 10.99, "midPrice": 15.0, "highPrice": 124.48, "marketPrice": 13.03, "directLowPrice": null, "subTypeName": "Normal"}
```

Les produits (`/tcgplayer/3/{groupId}/products`) ont un `extendedData` avec `Number` (« 001/131 »), `Rarity`, etc.

### 5.2 Le construire nous-mêmes : mesures sur six vrais guides consécutifs

**Ce qui change d'un jour à l'autre** (11/11 → 17/11, environ 80 800 produits) :

| | Part des produits modifiés en un jour |
|---|---|
| `trend` | 13 à 24 % |
| `avg7` | 13 à 23 % |
| `avg` | 3 à 5 % |
| `low` | 2 à 5 % |
| `trend-holo` | 4 à 8 % |

**Taille d'un relevé complet (80 885 produits)** :

| Format | Brut | gzip | brotli |
|---|---|---|---|
| JSON Cardmarket tel quel | 15,1 Mo | 1,5 Mo | 1,1 Mo |
| CSV, 12 champs en centimes | 2,8 Mo | 977 Ko | 839 Ko |
| CSV, 4 champs (`trend`, `low`, `avg7`, `trend-holo` des cartes) | 1,4 Mo | 528 Ko | **433 Ko** |

**Sur un an :**

| Stockage | Volume pour 1 an |
|---|---|
| Archive brute quotidienne, CSV 4 champs, brotli | **154 Mo** (299 Mo avec 12 champs ; 534 Mo en JSON gzip) |
| **Séries par produit (`trend` + `low`), un fichier par extension, brotli** | **≈ 43 Mo au total**, 794 fichiers, médiane **41 Ko**, maximum 712 Ko (extrapolation linéaire à partir de 6 jours ; une série plus longue se compresse mieux) |
| Postgres, 1 ligne par produit et par jour (≈ 85 o avec l'index) | 10 000 produits : ≈ 296 Mo ; 80 885 : ≈ 2,4 Go. **Trop gros pour les 500 Mo de Supabase gratuit.** |
| Postgres, 1 ligne par produit et par mois (`int4[31]` × 2, ≈ 308 o) | 10 000 produits : ≈ 35 Mo ; 80 885 : ≈ 285 Mo |

**Recommandation** : des fichiers statiques pour **tous** les produits, plutôt qu'une table limitée aux produits suivis. C'est aussi léger (43 Mo par an sur un CDN gratuit) et un ami qui ajoute une carte demain verra tout de suite son historique. Pas de charge pour la base, pas de liste de suivi à tenir. Supabase reste pour les données des utilisateurs (§9.6).

Format proposé pour l'historique d'une extension ([`echantillons/prototype-historique-extension.extrait.json`](echantillons/prototype-historique-extension.extrait.json), valeurs réelles) :

```json
{"v":1,"idExpansion":5944,"jours":["2026-11-11","2026-11-12","2026-11-13","2026-11-15","2026-11-16","2026-11-17"],
 "p":{"798930":{"trend":[14809,14838,14795,14612,14391,14304],"low":[8390,8390,8400,8400,8400,8400]},
      "798931":{"trend":[44666,44666,44666,44666,44666,44666],"low":[40500,40500,40500,40500,40000,40000]}, "…":{}}}
```

Les valeurs sont en centimes d'euro, `null` pour un jour sans valeur. Les jours manquants restent absents de `jours` (14/11).

---

## 6. Scellés : noms en français

### 6.1 Ce que fait etb-radar

- `catalogue.ts` : pour un ETB Cardmarket (`idCategory 1016`, nom finissant par « Elite Trainer Box »), il cherche le nom de set anglais TCGdex le plus long contenu dans le nom (`/v2/en/sets`), prend le nom FR du set ayant le même identifiant (`/v2/fr/sets`) et la date de sortie (`/v2/fr/sets/{id}`). Un petit dictionnaire traduit les Pokémon des ETB à deux versions (`Walking Wake` → `Serpente-Eau`, `Mega X` → `Méga-X`), et `codeFr()` transforme les codes (`sv` → `EV`, `swsh` → `EB`, `me` → `ME`).
- `stock.ts` : il traduit les catégories (`Pokémon Elite Trainer Boxes` → ETB, `Pokémon Tins` → Pokébox…) avec des alias de recherche (`tripack` → `tech sticker`, `3 pack`). En revanche, `extensionsConnues()` ne connaît le nom FR que des extensions des ETB du catalogue (2023 et après).

### 6.2 Méthode généralisée (testée sur les 5 117 scellés)

1. **Extension → set TCGdex → nom FR**, avec les 298 liens du §4.4.
2. Sinon, **le nom de set anglais TCGdex le plus long contenu dans le nom du produit** (méthode etb-radar).
3. **Type de produit**, par dictionnaire (premier motif qui correspond) :

| Motif anglais | Nom FR |
|---|---|
| `Pokémon Center Elite Trainer Box` | Coffret Dresseur d'Élite Pokémon Center |
| `Elite Trainer Box Case`, `10 Elite Trainer Box` | Carton de 10 Coffrets Dresseur d'Élite |
| `Elite Trainer Box` | **Coffret Dresseur d'Élite** |
| `Booster Box Case` / `Booster Box` | Carton de displays / **Display** |
| `Booster Bundle` | Bundle de 6 boosters |
| `Sleeved Booster` / `Enhanced Booster` / `Booster` | Booster sous blister / Booster amélioré (à valider) / Booster |
| `3-Pack Blister`, `Tech Sticker` / `2-Pack Blister` / `Checklane Blister` | Tripack / Duopack / Blister |
| `Ultra-Premium Collection` / `Premium Collection` / `Special Collection` | Collection Ultra-Premium / Collection Premium / Collection Spéciale |
| `Figure Collection` / `Poster Collection` / `Binder Collection` / `Pin Collection` | Collection Premium avec figurine / Collection Poster / Collection Classeur / Collection avec pin's |
| `Build & Battle Box` / `Build & Battle Stadium` | Kit d'Avant-Première / Stade Avant-Première (à valider) |
| `League Battle Deck` / `Battle Deck` / `Theme Deck` / `Trainer Kit` | Deck de Combat de Ligue / Deck de Combat / Deck à thème / Kit du Dresseur |
| `Mini Tin` / `Stacking Tin` / `Tin` | Mini Pokébox / Pokébox empilable / Pokébox |
| `Collector Chest` / `Surprise Box` / `Coin` | Valisette collector (à valider) / Coffret Surprise / Pièce |

4. **Noms de Pokémon** : un dictionnaire anglais → français de 1 253 noms, construit à partir des cartes TCGdex qui ont les deux noms (`Ninetales` → `Feunard`). Ajouter `Mega X` → `Méga-X`.
5. Un **fichier de corrections à la main** (`idProduct → nom FR`) a le dernier mot.

**Résultats :**

| | |
|---|---|
| Produits asiatiques (extension liée à un set asiatique, ou « JP », « Chinese », « CSV…C: »… dans le nom) | 643 (12,6 %) : on garde le nom anglais. |
| Scellés non asiatiques | 4 474 |
| … dont nom de set FR trouvé | **2 294 (51,3 %)** : 2 061 par l'extension, 233 par le nom anglais |
| … dont type reconnu | 3 820 (85,4 %) |
| ETB avec nom FR | **168 / 171 (98 %)** |
| Ajoutés depuis 2023 (non asiatiques) | 798 / 1 518 avec un set FR (52,6 %) |

Les 2 180 produits sans set sont surtout des produits génériques rangés dans des extensions fourre-tout : « Lucario ex Battle Deck », « Paldea Friends Mini Tins: Pikachu Tin », « Cyrus Premium Tournament Collection ». Pour eux, on construit le nom avec le type FR et les noms FR des Pokémon (« Deck de Combat Lucario-ex »).

Exemples générés automatiquement ([`echantillons/scelles-noms-fr.extrait.json`](echantillons/scelles-noms-fr.extrait.json)) :

| Cardmarket | Nom FR généré |
|---|---|
| Prismatic Evolutions Elite Trainer Box | **Coffret Dresseur d'Élite Évolutions Prismatiques** |
| Delta Reign Elite Trainer Box | Coffret Dresseur d'Élite Règne Delta |
| Prismatic Evolutions Binder Collection | Collection Classeur Évolutions Prismatiques |
| Black Bolt Booster Bundle | Bundle de 6 boosters Foudre Noire |
| Stellar Crown Booster Box | Display Couronne Stellaire |
| Ascended Heroes: Zorua Mini Tin | Mini Pokébox Héros Transcendants — Zorua |
| Generations Start Decks: Pikachu ex & Snorlax ex | Générations — Start Decks: Pikachu ex & Ronflex ex |
| Ascended Heroes: Mega Feraligatr ex Box | Coffret Héros Transcendants — Méga-Feraligatr ex (« Méga-Aligatueur » attendu : à corriger) |

**Limite** : un scellé Cardmarket est un seul produit pour toutes les langues. Le nom FR sert à l'affichage, mais la cote mélange les boîtes FR, EN, DE… (voir §2.5).

---

## 7. Japonais

**Sur Cardmarket :**
- Les sets japonais sont des **extensions séparées, nommées en anglais**, avec leurs cartes et leurs scellés : 5328 « Pokémon Card 151 » (210 cartes, `Pokémon Card 151 Booster`, `… Booster Box`), 5216 « Scarlet ex », 5217 « Violet ex », 5257 « Triplet Beat », 5314 « Snow Hazard », 5315 « Clay Burst », 4390 « VMAX Climax », 5198 « VSTAR Universe »…
- Une carte japonaise est donc un `idProduct` différent de son équivalent international (Dracaufeu-ex SAR : JP 719654, FR/EN 733794), avec **sa propre cote**.
- Certains noms de scellés portent « JP » (`30th Celebration JP Booster`, `Forbidden Light JP Booster Box`), mais la plupart non (`Shiny Star V Booster Box`). Les produits chinois ont un préfixe (`CSV9.5C:`, `151C:`) ou « Simplified Chinese ».
- Images des cartes JP : le code d'extension Cardmarket est l'identifiant JA de TCGdex en minuscules (`51/sv2a/719654/719654.jpg` : 200 ; `SV2a`, `SV2A` : 403).

**Sur TCGdex :**
- Langue `ja` : 13 156 cartes et 204 sets, avec des identifiants japonais (`SV2a`, `M1L`, `M1S`, `SV11B`, `SV8a`, `S11`…). Les noms sont **uniquement en japonais** (`リザードンex`, set `ポケモンカード151`), et les dates de sortie existent par langue asiatique dans le dépôt (`releaseDate: {ja, zh-tw, id, th}`).
- Correspondance Cardmarket : 80,7 % au total. Par série : SM 100 %, M (Méga) 98,4 %, SV 94,2 %, S 91,6 %, mais PCG, PMCG, e, neo, VS et web à 0 %.
- Images : 29,5 % (SV 78 %, S 53 %, SM et M 0 %). Repli possible sur l'image Cardmarket (code en minuscules, Referer à envoyer côté serveur).
- Pour afficher un nom FR à côté du nom japonais : `dexId` (numéro du Pokédex, présent sur les cartes JA du dépôt) puis le nom FR d'une carte FR de même `dexId`. Il n'y a pas de lien direct carte JA ↔ carte internationale.
- GraphQL JA : il faut omettre `rarity`, sinon 665 erreurs « Cannot return null for non-nullable field Card.rarity ».

---

## 8. Conditions d'utilisation

Je ne suis pas juriste. Voici ce qui est écrit, ou ce qui ne l'est pas, pour un usage privé et gratuit entre amis.

| Source | Ce qui est publié | Conséquence pratique |
|---|---|---|
| **Cardmarket, fichiers de données** | Publics et liés depuis la page « Data Tables » du site. La doc de l'API dit que la fonction a été « *made generally available via the website* » (05/06/2024). **Aucune licence ni condition propre à ces fichiers** n'a été trouvée. Les CGU du site n'ont pas pu être lues : le site répond 403 aux robots, et la page n'a pas d'archive. | Une lecture par jour des trois fichiers, sans jamais aspirer le site web (Cloudflare, « Please login and retry », comme dans etb-radar). Afficher « Prix : Cardmarket » avec un lien vers `https://www.cardmarket.com/fr/Pokemon/Products?idProduct={id}`. Ne pas republier publiquement les fichiers bruts ; garder l'app privée. |
| **Cardmarket, images** | CDN protégé par le Referer : la réutilisation n'est clairement pas prévue. | Ne pas les recopier en masse. Pour les cartes, prendre TCGdex. Pour les scellés, Poképédia (boîtes FR) ou le CDN TCGplayer, et Cardmarket seulement en dépannage. |
| **TCGdex, données** | Licence MIT (citer « TCGdex » et garder la notice MIT si on redistribue). FAQ : pas de limite stricte, « *please be considerate* », mettre en cache. | Une mise à jour du catalogue par semaine (GraphQL + dépôt). L'app ne doit pas appeler l'API à chaque écran. |
| **TCGdex, images** | Aucune règle publiée. Hébergées par TCGdex, propriété de Nintendo, Creatures, GAME FREAK et The Pokémon Company. Cache d'un an et CORS ouvert. | Lien direct depuis l'app, avec mise en cache sur le téléphone. Ne pas recopier toute la base d'images, sauf, côté serveur, ce qu'il faut pour les empreintes du scan. |
| **tcgcsv.com** | « *Permission is implicit* », pas d'attribution exigée (un lien est apprécié). Pour les images de cartes, c'est une « zone grise » : outils de classeur et de collection tolérés en général, pas de jeu, pas de vente. | Repli possible, sans souci pour un usage privé. |
| **Wayback Machine** | Archives publiques. | Amorçage unique (une soixantaine de fichiers, avec une pause entre chaque), pas une source quotidienne. |
| **Pokémon (marques, illustrations)** | © Nintendo, Creatures, GAME FREAK, The Pokémon Company. | App gratuite, privée, sans publicité ni vente : faible risque en pratique. Ne pas la publier sur un store. |

---

## 9. Pipeline recommandé

### 9.1 Vue d'ensemble

```
         chaque nuit (GitHub Actions, dépôt privé)                         chaque semaine
 Cardmarket S3 ──► price_guide_6.json (16 Mo) ──┐                   TCGdex GraphQL (FR, EN, JA)
               └─► listes de produits si ETag ──┤                   + dépôt cards-database (git, 15 s)
                                                ▼                              │
                                   construire les fichiers ◄───────────────────┘
                                                │
              ┌─────────────────────────────────┼─────────────────────────────────┐
              ▼                                 ▼                                 ▼
   archive du jour (CSV brotli,       site statique (Cloudflare Pages)     Supabase (gratuit)
   ~0,4 Mo) → release GitHub          catalogue, prix du jour, historiques  comptes, collections
   « prix-AAAA-MM »                   par extension, noms FR des scellés    partagées entre amis
                                                │
                                                ▼
                          téléphone (PWA) : service worker + IndexedDB
                          images TCGdex en direct (low.webp, high.webp)
```

### 9.2 Tâche quotidienne

- **Quand** : deux crons GitHub Actions, par exemple `23 3 * * *` et `23 9 * * *` (UTC). Le guide est prêt vers 00 h 45 UTC l'été et 01 h 45 UTC l'hiver, et les crons de GitHub peuvent partir avec du retard. Le second passage ne fait rien si le `createdAt` n'a pas changé.
- **Étapes** :
  1. `GET price_guide_6.json`. Vérifier `version == 1` et un `createdAt` plus récent que le dernier enregistré, sinon s'arrêter. La date du relevé est la date de `createdAt` à l'heure de Paris.
  2. `HEAD` des deux listes de produits ; ne les télécharger que si l'`ETag` a changé (quelques fois par semaine).
  3. Écrire l'**archive brute du jour** : CSV `idProduct;trend;low;avg;avg1;avg7;avg30;trend-holo;low-holo;avg-holo;avg1-holo;avg7-holo;avg30-holo` en centimes, compressé en brotli (≈ 0,84 Mo, ou 0,43 Mo en 4 champs). On l'ajoute comme pièce jointe à une release mensuelle du dépôt de données. C'est **la source de vérité** : tout le reste se reconstruit à partir de là.
  4. Reconstruire les fichiers du site (§9.5) : prix du jour, historique glissant de chaque extension (les 365 derniers jours), noms FR des scellés.
  5. Déployer sur Cloudflare Pages (`wrangler pages deploy`, upload direct ; seuls les fichiers modifiés partent).
- **Ne pas commiter les fichiers générés dans git.** Les 794 historiques changeraient chaque jour, et l'historique git grossirait de plusieurs centaines de Mo par an.
- **Coût** : environ 30 Mo téléchargés et une à deux minutes par jour, soit 30 à 60 min par mois sur les 2 000 gratuites d'un dépôt privé.

### 9.3 Tâche hebdomadaire (catalogue)

- Si le dernier commit de `tcgdex/cards-database` a changé (`git ls-remote`) :
  1. GraphQL FR, EN et JA : cartes (`id localId name rarity category image set { id } variants { … } dexId`), `variants_detailed` et sets (`id name releaseDate logo symbol serie { id name } cardCount { … }`). Cinq à six requêtes, environ 15 Mo, moins de 5 s.
  2. Clone partiel du dépôt (`data`, `data-asia`) et lecture **textuelle** des `thirdParty` des cartes, des variantes et des sets, ainsi que des abréviations.
  3. Calculer les liens extension → set (directs + vote, §4.4), les noms FR des scellés (§6.2) et appliquer `corrections-scelles.json`.
- Garder la version précédente si une source échoue.

### 9.4 Amorçage, une seule fois

- Télécharger les 63 captures Wayback du guide (une toutes les 5 s, environ 0,9 Go en tout, 5 à 10 min) et les convertir en archives quotidiennes. On obtient l'historique du 09/09/2026 à aujourd'hui (avec quelques trous), plus deux points isolés (30/12/2024 et 17/06/2026).
- En option, les archives tcgcsv (USD) depuis le 08/02/2024 pour une courbe longue, présentée comme « marché américain (USD) ».

### 9.5 Fichiers chargés par le téléphone

Tailles mesurées sur des prototypes construits à partir des vraies données du 17/11 ([`echantillons/prototype-*.json`](echantillons/)) :

| Fichier | Contenu | Brut | gzip | **brotli** | Rafraîchi |
|---|---|---|---|---|---|
| `catalogue-fr.json` | 188 sets `[id, nom, série, date, code, nb officiel, idExpansion]`, 20 217 cartes `[set, numéro, nom FR, rareté, image FR ?, idProduct…]` | 770 Ko | 222 Ko | **140 Ko** | chaque semaine |
| `variantes-fr.json` | Les 1 433 cartes à plusieurs `idProduct` (type, foil, tampon) | 134 Ko | 10 Ko | **8 Ko** | chaque semaine |
| `scelles-fr.json` | 4 474 scellés non asiatiques `[idProduct, catégorie, idExpansion, nom FR, nom Cardmarket, date]` | 415 Ko | 76 Ko | **57 Ko** | quand la liste change |
| `prix/jour.json` | `idProduct → [trend, low, avg7, trend-holo]` en centimes, pour les cartes FR reliées et tous les scellés (25 973 produits) | 616 Ko | 197 Ko | **158 Ko** | chaque jour |
| (variante) tous les produits Pokémon | 80 885 produits, y compris les JP et CN | 1,9 Mo | 570 Ko | 451 Ko | chaque jour |
| `historique/{idExpansion}.json` | 365 jours de `trend` et `low` pour tous les produits de l'extension | — | — | médiane **41 Ko**, max 712 Ko | chaque jour, à la demande |
| Empreintes pour le scan (optionnel) | 8 o par carte (hash perceptuel) | 158 Ko | ≈ 158 Ko | ≈ 158 Ko | chaque semaine |
| Images | TCGdex `low.webp` (listes) / `high.webp` (fiche) | | | 18 Ko / 65 Ko par carte | à la demande, en cache |

**Cibles** :
- Premier chargement des données < **400 Ko** compressés (catalogue + scellés + prix du jour ≈ 355 Ko).
- Mise à jour quotidienne ≈ **160 Ko**.
- Fiche d'une carte < **100 Ko** dans le cas courant (historique de l'extension + image `high`).
- Pour les grosses extensions (max 712 Ko par an), découper l'historique par semestre ou ne garder que `trend`.
- Le service worker sert les données en *stale-while-revalidate* ; la collection est stockée dans IndexedDB et synchronisée avec Supabase.

### 9.6 Hébergement gratuit

| Besoin | Choix | Pourquoi / limites (offres gratuites, vérifiées dans la doc ou des sources tierces de 2026) |
|---|---|---|
| Calcul quotidien | **GitHub Actions** dans un dépôt privé | 2 000 min/mois en privé. En dépôt public, les crons sont désactivés après 60 jours sans activité. |
| Site et données statiques | **Cloudflare Pages** | Gratuit, accepte un dépôt privé ou un upload direct, 20 000 fichiers par site, 25 Mio par fichier, 500 builds par mois. Compression à la volée. *GitHub Pages n'est possible gratuitement qu'avec un dépôt public.* |
| Archives brutes | **Releases GitHub** du dépôt de données | Un fichier d'environ 0,4 à 0,8 Mo par jour, soit 150 à 300 Mo par an, hors historique git. |
| Comptes et collections | **Supabase** | 500 Mo de base, 1 Go de fichiers, 5 Go de trafic par mois, mise en pause après 7 jours sans activité (les amis qui ouvrent l'app, ou un appel quotidien du job, suffisent). Auth par lien magique et RLS « chacun ses lignes, lecture entre amis ». **Pas de prix dans la base**, ou alors seulement un tableau mensuel `int4[]` (≈ 35 Mo par an pour 10 000 produits) si on veut des requêtes SQL. |

### 9.7 Données utiles au scan

- **Reconnaissance d'image** : images `low.webp` de TCGdex (environ 20 000 × 18 Ko ≈ 360 Mo, à télécharger une fois dans le job, puis seulement les nouveaux sets) → une empreinte de 8 octets par carte, soit 158 Ko pour le téléphone. Pour les cartes sans image FR, utiliser l'image EN.
- **Lecture du texte (OCR)** : les cartes récentes impriment le code du set et le numéro (« MEW 199/165 »). TCGdex donne `abbreviation.official` pour 191 des 209 sets internationaux, ainsi que `localId` et `cardCount.official`. Le couple (code, numéro) désigne une seule carte. Pour les cartes anciennes : numéro, total et nom, puis un choix parmi les candidats.

### 9.8 Risques et parades

| Risque | Parade |
|---|---|
| Cardmarket ne publie pas un jour (déjà vu le 14/11) | Second cron, relevé daté par `createdAt`, trou visible dans la courbe. |
| Nouveaux produits absents des listes | Garder leur prix et les nommer quand la liste arrive (ou via TCGdex). |
| Changement de format (`version` ≠ 1) | Arrêter le job sans écraser les données, et envoyer une alerte (échec de l'action GitHub). |
| TCGdex en retard sur un nouveau set (images FR manquantes, `thirdParty` vide) | Repli sur l'image EN, puis sur l'image Cardmarket côté serveur. Afficher « cote bientôt disponible ». |
| Cote qui mélange les langues | L'afficher clairement (« toutes langues »). Plus tard, peut-être un prix FR manuel par objet. |
| Valeurs `-holo` parasites | Ne les utiliser que pour une variante reverse déclarée par TCGdex. |

---

## 10. Annexes

### 10.1 Échantillons (`docs/echantillons/`, 0,6 à 5,5 Ko chacun)

| Fichier | Contenu |
|---|---|
| `cardmarket-products_singles_6.extrait.json` | 7 cartes (Dracaufeu-ex 151, Dracaufeu Set de Base, Dracaufeu-ex JP, Vipélierre, les 3 Pyroar) |
| `cardmarket-products_nonsingles_6.extrait.json` | 8 scellés (ETB Évolutions Prismatiques et Règne Delta, booster JP 151…) |
| `cardmarket-price_guide_6.extrait.json` | 8 lignes du guide (dont une reverse et des scellés) |
| `cardmarket-price_guide_6.historique-wayback.json` | 7 jours réels (Wayback + direct) pour 3 produits |
| `tcgdex-rest-carte-fr-sv03.5-199.json` | Carte FR complète avec `pricing` |
| `tcgdex-rest-carte-fr-sv08.5-016.json` | Carte à reverses spéciales (3 `idProduct`) |
| `tcgdex-rest-carte-ja-SV2a-201.json` | Carte japonaise |
| `tcgdex-rest-set-fr-sv03.5.extrait.json` | Set FR |
| `tcgdex-graphql-cartes-fr.extrait.json`, `tcgdex-graphql-sets-fr.extrait.json` | Requêtes GraphQL `@locale` et réponses |
| `tcgdex-depot-extraits.ts.txt` | Fichiers du dépôt : set international, set japonais, carte (`thirdParty`) |
| `correspondance-extensions.extrait.json` | `idExpansion` → set TCGdex → nom FR ou JA |
| `scelles-noms-fr.extrait.json` | Noms FR générés |
| `prototype-prix-du-jour.extrait.json`, `prototype-historique-extension.extrait.json`, `prototype-catalogue-fr.extrait.json` | Formats proposés pour le téléphone |
| `tcgcsv.extrait.json` | Prix et produit TCGplayer |
| `tcgdex-price-history-ebay.extrait.json` | Historique eBay (dépôt en sommeil) |
| `wayback-cdx-price_guide_6.extrait.json` | Liste des captures Wayback |

### 10.2 Scripts de mesure (dossier temporaire de la session)

Ils se trouvaient dans un dossier temporaire de la session (non conservé) : `analyse_cm.py`, `noms_singles.py`, `analyse_tcgdex_listes.py`, `scan_tcgdex_repo.py`, `valide_echantillon.py`, `noms_fr_scelles.py`, `stockage.py`, `catalogue_compact.py`, `echantillons.py`. Ils sont tous lancés avec `python3 -I`, sur des données téléchargées dans `…/scratchpad/donnees/`. Ce dossier peut être effacé au redémarrage : les recopier dans le projet si on veut les garder.

### 10.3 Non vérifié ou incertain

- La formule exacte de `trend` (non publiée) et les CGU du site Cardmarket (site inaccessible aux robots).
- Le rythme exact des listes de produits : deux relevés seulement (12/11 et 16/11).
- Les limites des offres gratuites (Supabase, Cloudflare, GitHub) : relevées dans la documentation et des articles de 2026, à revérifier au moment de créer les comptes.
- Les noms FR « à valider » du dictionnaire des types : Booster amélioré, Stade Avant-Première, Valisette collector.

### 10.4 Sources consultées

- Fichiers Cardmarket : `https://downloads.s3.cardmarket.com/productCatalog/{productList,priceGuide}/…` (§2.1)
- Doc de l'API Cardmarket 2.0 : `https://apiv2.cardmarket.com/ws/documentation/API_2.0:PriceGuide`, `…:Entities:Product`, `…:Entities:Article`
- Page « Data Tables » (Wayback) : `https://web.archive.org/web/20260607165804/https://www.cardmarket.com/en/Magic/Data/Price-Guide`
- Annonce Cardmarket (28/10/2024) : `https://news.cardmarket.com/en/FoW/adding-non-singles-and-accessories-to-the-price-guide`
- TCGdex : `https://api.tcgdex.net/v2`, `https://api.tcgdex.net/v2/graphql`, `https://tcgdex.dev/markets-prices`, `https://tcgdex.dev/assets`, `https://tcgdex.dev/faq`, `https://github.com/tcgdex/cards-database` (MIT), `https://github.com/tcgdex/price-history`
- Correspondance des champs `-holo` : `https://www.rubydoc.info/gems/pokemon_tcg_sdk/4.3.0/Pokemon/CardmarketPrices`
- tcgcsv : `https://tcgcsv.com/`, `https://tcgcsv.com/faq`
- Wayback CDX : `https://web.archive.org/cdx/search/cdx?url=downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json&output=json`
- Offres gratuites : `https://supabase.com/pricing`, `https://developers.cloudflare.com/pages/platform/limits`, `https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions`
- Code existant : `~/Desktop/Projets/etb-radar/src/{catalogue.ts, stock.ts, images.ts, langues.ts, sources/cardmarket.ts}` (lu, non modifié)
