# PokéItem : cahier des charges fonctionnel (recherche sur sources publiques)

> Recherche du 17/11/2026. Version de référence : iOS 1.3.5 (16/11/2026), Android 1.3.4.
> But : décrire les **fonctions et les parcours** de PokéItem pour construire notre propre app, avec un nom, un logo, des textes et des visuels à nous. Rien n'a été téléchargé ni décompilé, et aucune API privée de PokéItem n'a été appelée.
> Légende : **confirmé [Sx]** = vu dans la source Sx (liste des URL en fin de document) ; **supposé** = déduction de ma part, à vérifier.
> L'app change chaque semaine (25 versions en 6 mois) : les chiffres et les limites ci-dessous datent du 17/11/2026.

---

## Résumé (10 lignes)

1. PokéItem est une app française (SAS POKEITEM, Pibrac), sortie sur le web le 04/04/2026, sur iOS le 30/04 et sur Android le 20/05. Elle revendique plus de 62 000 comptes, 4,7/5 sur l'App Store FR (575 notes) et 4,8/5 sur Google Play (210 avis).
2. Boucle de base : on scanne une carte (0,46 s en médiane) ou on la cherche, on l'ajoute avec son état, sa langue et son prix d'achat, puis l'accueil montre la valeur totale et sa variation sur 24 h.
3. Les cotes sont recalculées toutes les 24 h, **par langue et par état** : le premier prix Cardmarket Near Mint dans la langue de la carte, plus un « indice » maison (Cardmarket, ventes eBay, TCGplayer) affiché avec un niveau de confiance.
4. Les cartes (9 langues Pokémon ; reverse, 1re édition, Poké Ball, tampons ; gradées par société et par note avec la population PSA) et les scellés (du booster à la case d'ETB) sont dans la même collection.
5. Organisation : un classeur par langue, la complétion par extension et en MasterSet, un Pokédex de 1 025 espèces, les doublons, la liste de souhaits, des classeurs virtuels en pages (« fardes ») et des widgets.
6. Version gratuite : 1 jeu, 1 langue de classeur, 1 000 cartes, 10 scellés, 50 scans par mois (+1 par jour une fois le quota épuisé), 1 classeur, 10 alertes. La courbe de valeur, la plus-value, la page Analyse et l'export CSV sont réservés au Premium.
7. Premium : 5,99 €/mois ou 49,99 €/an (159,99 € à vie). Premium+, qui ouvre tous les jeux : 8,99 €/mois ou 79,99 €/an. Aucune régie publicitaire n'est déclarée : ce qui ressemble à des « pubs », ce sont probablement les relances Premium et les liens affiliés (supposé).
8. Grosse couche « engagement » : réseau social, marché entre particuliers sans commission, annuaire de boutiques, quêtes, XP et saisons avec lots, missions du jour, notification « Bourse du matin ».
9. Les utilisateurs aiment l'interface, le scanner et le suivi au jour le jour. Ils reprochent les limites gratuites, les langues et les jeux payants, des cotes parfois fausses et des erreurs dans le catalogue (variantes en trop ou manquantes).
10. Pour nous (P0) : catalogue Pokémon FR/EN avec cartes et scellés, ajout rapide (scan simple et recherche), exemplaires détaillés, cote quotidienne avec historique, valeur, plus-value et courbe, complétion, souhaits et doublons, export/import, sans limites.

---

## Glossaire (vocabulaire de l'app)

- **Classeur** : deux sens. (a) L'espace de collection d'une langue (« classeur japonais »), avec sa propre cote et sa complétion. (b) Depuis la 1.3.0, un classeur virtuel qui regroupe plusieurs fardes. confirmé [S1] [S30]
- **Farde** : un album virtuel en pages (1×2 à 4×4 pochettes), qui sert d'intercalaire dans un classeur. Une carte n'occupe qu'une seule pochette, toutes fardes confondues. confirmé [S29] [S30]
- **MasterSet** : toutes les versions de toutes les cartes d'une extension (normale, reverse, Poké Ball, etc.). confirmé [S28]
- **Slab** : une carte gradée sous coque (PSA, PCA, etc.). **Loose** : une carte non gradée. confirmé [S1]
- **Indice** : la cote maison de PokéItem, différente du premier prix Cardmarket. confirmé [S4]

---

## 1. Identité, plateformes, langues (point 8)

| Élément | Détail | Statut |
|---|---|---|
| Éditeur | SAS POKEITEM, Pibrac (Haute-Garonne), SIREN 105 186 597. Le compte vendeur App Store est au nom de « Hugo Tribet ». | confirmé [S17] [S19] [S38] |
| Équipe | 0xPocho (fondateur et CEO, passé par SwissBorg), Farellis (CTO), Anthosaure (CMO), SniiKzy (CPO). Équipe de 2 à 5 personnes, autofinancée. | confirmé [S18] [S35] |
| Chronologie | Premières lignes de code le 28/03/2026, bêta web le 04/04, iOS le 30/04, Android le 20/05, v2 (indice et prix par état) le 13/06. Environ 25 versions entre le 21/05 et le 16/11, soit à peu près une par semaine. | confirmé [S19] [S1] |
| Plateformes | iOS 15+ (iPhone, 91 Mo), Android (10 000+ téléchargements, PEGI 3), web (app.pokeitem.fr). Un seul compte et une seule collection sur tous les supports. S'y ajoutent une extension Chrome (bêta) et un connecteur pour assistants IA (MCP). | confirmé [S38] [S33] [S3] |
| Audience et business | 62 000+ comptes, 1,5 M de cartes scannées et 75 M€ de valeur suivie au 06/11. L'accueil du site annonce 71 500 collectionneurs. TrustMRR : 3 255 abonnements actifs et un MRR d'environ 20 600 $ (vérifié via RevenueCat). | confirmé [S19] [S2] [S35] |
| Communauté | Discord public : 497 membres. YouTube : 697 abonnés (shorts d'ouverture de coffrets, démo du scanner). | confirmé [S37] [S36] |
| Jeux | Pokémon, One Piece, Yu-Gi-Oh!, Magic, Lorcana, Riftbound, Star Wars Unlimited, Dragon Ball Super Fusion World, Dragon Ball Z et Gentle Mates. Annoncés : Flesh and Blood, Gundam, Final Fantasy, Cyberpunk, Naruto, Azuki. | confirmé [S3] |
| Langues des cartes Pokémon | FR, EN, JA, IT, DE, ES, PT-BR, KO, chinois traditionnel et chinois simplifié. Thaï et indonésien en préparation. Chaque langue a son classeur, ses cotes et son taux de complétion : rien ne se mélange. | confirmé [S3] [S16] |
| Langues des autres jeux | One Piece FR/EN/JA ; Yu-Gi-Oh! EN/FR/DE/IT/ES/PT ; Magic EN/FR/DE/IT/ES ; Lorcana EN/FR/DE/IT ; Star Wars EN/FR/DE/IT/ES ; Riftbound EN/KO/ZH ; Gentle Mates FR ; Dragon Ball EN. | confirmé [S3] [S1] |
| Langues de l'interface | 7 : FR, EN, IT, DE, ES, JA, PT-BR. La langue de l'app est distincte de celle des cartes. | confirmé [S3] [S16] |
| Devises | EUR, USD, GBP, CHF, AUD, CAD, AED, JPY, BRL, converties chaque jour. | confirmé [S3] [S1] |
| Taille du catalogue | 100 000+ cartes (tous jeux), 13 000 scellés, 24 002 fiches cartes publiques, 387 cartes Jumbo, 860 scellés japonais. | confirmé [S1] [S19] |
| Briques techniques déclarées | Reconnaissance : API Google Gemini, TCG API (tcgapi.io) et xAI. Modération des images : API Claude. Hébergement Railway (PostgreSQL), photos sur Cloudflare R2. Abonnements via RevenueCat, paiement web via Stripe, e-mails via Brevo, mesure d'audience via Mixpanel, fond de carte OpenFreeMap. Vérification des certificats PSA. | confirmé [S22] |

---

## 2. Écrans et navigation (point 1)

### 2.1 Structure générale

- **Ouverture** : depuis la 1.3.4, un « mur » de cartes de sept jeux s'affiche à l'ouverture. confirmé [S1]
- **Onboarding** :
  - nom de dresseur et Pokémon préféré (le pseudo se choisit plus tard) ;
  - choix du jeu parmi six, avec leurs logos ;
  - choix de la langue du classeur, conservée à l'inscription ;
  - date de naissance obligatoire (l'âge conditionne les fonctions sociales) ;
  - scanner testable avant de créer un compte, et scans doublés le premier mois ;
  - offre Premium affichée, avec un bouton pour la passer ;
  - première semaine guidée ;
  - connexion par Apple, Google ou e-mail.

  confirmé [S1] [S27] [S20]
- **« Quoi de neuf »** : une fenêtre s'affiche une fois par version. confirmé [S30]
- **Sélecteur de jeu dans l'en-tête** : en un tap, il fait basculer le catalogue, le classeur, les scellés, les cotes, le scanner et la couleur du thème (vert pour One Piece). confirmé [S28] [S1] (captures)
- **Navigation actuelle (1.3.4 et suivantes)** :
  - même en-tête sur toutes les pages (sélecteur de jeu, chat, cloche, avatar) ;
  - barre du bas avec **deux raccourcis au choix** (Social, Marketplace, Souhaits, Quêtes…) ;
  - menu **« + »** qui regroupe les autres fonctions.

  confirmé [S1] [S16]. Les entrées fixes de la barre (Accueil, Collection, Scanner) sont supposées d'après les captures.
- **Navigation visible sur les captures App Store (fin octobre)** : barre flottante translucide à 6 icônes, dans l'ordre Accueil · Catalogue · **Scanner (au centre)** · Social · Chat · Marché. confirmé [S1] (captures) [S30]
- **Ordinateur et tablette** : les classeurs s'affichent en double page. On se connecte au site en scannant un QR code depuis l'app. confirmé [S30] [S1]
- **Thème** : couleur de l'app au choix dans les réglages, et effet « verre » sur les barres flottantes. confirmé [S1] [S30]

### 2.2 Accueil

D'après les captures App Store et les notes de version, de haut en bas :

- **En-tête** : sélecteur de jeu, logo, une icône « écran » (probablement l'accès web par QR code, supposé), cloche, avatar. confirmé [S1] (captures)
- **Recherche globale** (« Rechercher 'Pikachu' »), puis la mention **« Dernière sync : 28 oct. à 04:20 »**. On peut en déduire une synchronisation des prix chaque nuit vers 4 h (supposé). confirmé [S1] (captures)
- **Carte « Collection totale »** : confirmé [S1] (captures) [S16] [S2]
  - sélecteur de langue ou de classeur (drapeau), avec une option « Toutes les langues » ;
  - un œil pour masquer les montants (trois crans) ;
  - la variation sur 24 h en euros, sur deux lignes pour One Piece (« Marché » et « Collection ») ;
  - le compteur Pokédex (par exemple 681/1025) ;
  - la valeur totale et une mini-courbe (la courbe détaillée est Premium).
- **« Aperçu de mes cartes »** avec « Voir tout » : une grille de vignettes avec un drapeau et la cote. Sur la capture, elles sont rangées par valeur décroissante (supposé). confirmé [S1] (captures)
- **« Derniers ajouts »** : les 12 dernières cartes ajoutées (1.3.5). confirmé [S1]
- **« Ton jour »** : 3 missions par jour et une première semaine guidée. Un écran **Série** montre le record et la semaine de connexion (1.3.1). confirmé [S1]
- **Vitrine de fardes** qui défile toute seule. confirmé [S29] [S1]
- **Aperçu des gradées**, total des gradées et des scellés, et raccourcis vers les fardes, les gradées, les doublons et les souhaits. confirmé [S1] [S29]
- Tuiles vers les classeurs et le Social. Un message explicite s'affiche quand la collection n'a pas encore de cote. confirmé [S30] [S1]

### 2.3 Recherche

- **Ce qu'on peut chercher** : confirmé [S1] [S26] [S28] [S30]
  - le nom ou un surnom ;
  - le numéro imprimé (« 25/102 », « 50/88 », espaces tolérés) ;
  - le code d'extension suivi du numéro (« OBF 125 ») ;
  - un code promo (« SVP 056 ») ;
  - l'illustrateur, avec une option de correspondance exacte.
- **Tolérance** : une faute de frappe, un numéro ou un mot en trop ; les symboles (☆, δ) et les accents. Recherche possible en japonais, en coréen et en chinois. confirmé [S1] [S29]
- **Résultats** : une page complète et paginée avec toutes les cartes d'un Pokémon. confirmé [S26] [S1] [S29]
  - Tris : prix, date de sortie, nom, pertinence, « cartes les plus possédées d'abord ».
  - Filtres : extension ou bloc, rareté, illustrateur, langue.
- La même recherche, avec les mêmes tris et filtres, fonctionne **dans sa propre collection**. confirmé [S26]
- **Scellés** : la recherche ignore les accents et comprend les pluriels et les abréviations (« duopack sl »). confirmé [S1] [S30]
- Un signalement **« Carte manquante ? »** permet de proposer une estimation pour une carte sans prix. confirmé [S30]

### 2.4 Catalogue / Collection

- **Page « Catalogue »** : onglets **Cartes · Produits scellés · Pokédex · Classeurs**, bascule grille/liste, choix de la langue par drapeau. confirmé [S1] (captures) [S29] [S30]
- **Cartes** :
  - extensions en grandes tuiles, navigation par ère (1.2.8) ;
  - en-tête d'extension avec logo, code et date (1.2.9) ;
  - onglet « Incomplètes » (1.3.3) ;
  - section « International » avec les extensions dans un tiroir (1.2.0).

  confirmé [S1]
- **« Toutes mes cartes »** : filtre Toutes / Loose / Gradées, tri par date d'ajout, sélecteur « Quels exemplaires » qui additionne les langues. Une page de classeur n'affiche qu'une langue à la fois. confirmé [S1] [S29]
- **Dans une extension** :
  - grille avec les cartes non possédées atténuées ;
  - onglets Possédées / Manquantes / Doublons ;
  - **vue MasterSet** : une tuile par exemplaire, un « + » sur chaque tuile pour ajouter un exemplaire avec son état, une barre de progression (par exemple « 115 / 214 ») ;
  - tris par numéro, nom, rareté, prix, état ou date d'ajout ; filtres par rareté, type et tampon ;
  - checklist imprimable ;
  - ajout par lot (on coche plusieurs cartes) ;
  - taille des vignettes réglable, tri des extensions mémorisé ;
  - boutons « + » et « − » sur les vignettes, sélection multiple par appui long.

  confirmé [S28] [S6] [S8] [S1]
- **Produits scellés** :
  - bascule « Par type » / « Par série » ;
  - puces de type (Tous, Display, Demi-Display, ETB, Bundle…), recherche et compteur (« 129 produits ») ;
  - tuile produit : image, nom, sous-titre de type (« Case de 10 ETB », « Coffret Dresseur d'Élite »), logo de l'extension, prix avec drapeau, bouton « + Portfolio ».

  confirmé [S1] (captures)
- **Pokédex** : grille des 1 025 espèces, grisées tant qu'on ne les a pas. confirmé [S29]
  - Filtres : génération, type, région, Capturés, Manquants. Recherche par nom ou par numéro.
  - Deux compteurs : Capturés et Scannés.
  - Fiche espèce : taille, poids, région, histoire, noms étrangers et liste « Mes cartes ».
- **Classeurs** : voir 6.7.

### 2.5 Fiche carte

Elle s'ouvre comme une feuille qui monte du bas de l'écran.

- **Haut de fiche** : confirmé [S1] (captures) [S1] [S29]
  - nom et numéro (« 125/94 »), cœur (souhaits) ;
  - logo de l'extension et « Série · code » (« Méga-Évolution · ME02 ») ;
  - image : plein écran avec zoom (double tap, pincement) et **effet holo qui suit l'inclinaison du téléphone** ;
  - badge de rareté ;
  - illustrateur, avec un lien vers toutes ses cartes ;
  - cote, badge de la source et drapeau.
- **Actions** : confirmé [S1] (captures) [S1] [S29] [S27]
  - « Ajouter » : le bouton indique le classeur de destination et signale les exemplaires déjà rangés dans un autre classeur. Si on a déjà la carte, il devient « + Ajouter aux doublons ».
  - « Ajouter à une farde ».
  - « Marquer comme vendu » et « Retirer de ma collection » (l'app demande combien d'exemplaires).
  - Créer une alerte de prix, signaler un prix faux, acheter sur Cardmarket ou eBay.
- **Bloc « Prix du marché »**, avec un menu de langue : confirmé [S1] (captures) [S29] [S1]
  - indice PokéItem et sa confiance (« Confiance faible ») ;
  - Cardmarket « 1er prix Near Mint » ;
  - eBay « Dernière vente », avec la date et, depuis la 1.3.5, l'état de la carte ;
  - TCGplayer sur l'onglet anglais.

  Un drapeau devant chaque prix indique la langue de la cote, et le prix de repli est signalé.
- **Onglets** : confirmé [S1] [S25] [S28]
  - langue (le nom, l'illustration et les prix changent) ;
  - version (normale, reverse, holo, 1re édition…), avec un onglet Holo pour les cartes à deux finitions ;
  - eBay : ventes réussies, annonces en cours, enchères, filtrées par marché (FR, UK, IT, DE, ES) ;
  - annonces GCC pour One Piece.
- **Prix par état** : NM, EX, GD, PL, PO. confirmé [S12] [S25]
- **Courbe de prix**, avec les ventes réelles en Near Mint et en Mint placées dessus. confirmé [S29] [S16]
- **Section gradées** : confirmé [S4] [S11] [S29] [S1]
  - une cote par société et par note, étiquetée « Vente réelle », « 1 vente observée » ou « Estimation » ;
  - la valeur brute (non gradée) pour comparer ;
  - la population PSA : total, PSA 10, taux Gem, part de PSA 9+, histogramme et courbe du census ;
  - la population par langue et par société (1.3.5) ;
  - l'historique des ventes du slab.
- **« Mes exemplaires »** : une ligne par exemplaire avec l'état, le prix d'achat et le **gain ou la perte (+/−)**. On peut vendre ou retirer chaque exemplaire. confirmé [S1] [S28]
- **Glisser** vers la gauche ou la droite pour passer à la carte voisine (1.3.2). La mention « Existe scellée » apparaît sur les promos concernées. confirmé [S1] [S30]
- La **fiche publique web** (sans compte) affiche une rubrique « À propos », un tableau « Cote par langue » (indice et Cardmarket NM par langue), les noms étrangers et des liens vers la carte précédente et la suivante. confirmé [S32]

### 2.6 Social (hub)

- **Fil** : confirmé [S1] (captures) [S1] [S29] [S30]
  - onglets Pour vous · Abonnements · News · Concours · Vrai ou faux · Signets ;
  - recherche dans le fil, bouton « écrire » ;
  - posts avec photos, sondages (2 à 4 choix, ouverts d'une heure à 7 jours), republication et citation, réactions, réponses imbriquées ;
  - compteur de vues, tirer pour rafraîchir, traduction automatique ;
  - masquer un post ou un profil ; badges Équipe, Boutique certifiée et Créateur.
- **Profils** : confirmé [S27] [S3] [S1]
  - profil public avec une vitrine de 4 cartes, le classeur, des statistiques, les réseaux sociaux, les abonnés et le niveau ;
  - pseudo TCG Live et code Pocket ;
  - profil privé possible, montants masquables séparément, demandes de suivi, bouton « Poké ».
- **Chat**, **Clipping** (des vidéos publiées sur X, TikTok, Instagram ou YouTube rapportent de l'XP selon les vues) et **Quêtes** (section 7). confirmé [S29] [S23]

### 2.7 Marché (hub)

- Onglets **Annonces · Boutiques TCG · Shops en ligne · Amazon · Extension**. confirmé [S28] [S1] (captures)
- Le contenu de chaque onglet est détaillé en 6.10.

### 2.8 Profil et paramètres

Réglages recensés dans les notes de version, la FAQ et le centre d'aide : confirmé [S1] [S3] [S26] [S30] [S31] [S24]

- prix de référence (indice ou Cardmarket), devise ;
- heure de la « Bourse du matin » ;
- couleur de l'app, langue de l'app ;
- activation des jeux (Réglages → Jeux) ;
- « Widgets et fond d'écran » ;
- « Agent IA » (jetons personnels) ;
- abonnement (« Gérer mon abonnement ») ;
- compter ou non les scellés dans la valeur totale ;
- téléchargement hors ligne (Wi-Fi seulement ou aussi en données mobiles) ;
- import CSV PokéCardex ;
- liaison Discord ;
- ajout d'un e-mail et d'un mot de passe à un compte Apple ou Google ;
- profil privé et masquage des montants ;
- Support / Aide (bugs et suggestions) ;
- « Zone de danger » : suppression du compte (désactivation immédiate, effacement définitif après 30 jours, réactivation possible pendant ce délai).

### 2.9 Notifications

- **Centre de notifications (cloche)** : il regroupe les alertes eBay, les réponses du support, l'activité du réseau et les demandes de suivi (accepter, refuser, suivre en retour). On supprime une notification d'un glissement, et un bouton « Tout effacer » vide la liste. Des pastilles signalent les demandes, les Vrai ou faux, le chat non lu et les quêtes. confirmé [S26] [S1] [S29]
- **Notifications push** : confirmé [S1] [S26]
  - **Bourse du matin** : quand la collection bouge, à l'heure choisie ;
  - souhaits ;
  - alerte de prix eBay ;
  - invitation Amazon ouverte sur un scellé.

### 2.10 Widgets et fond d'écran (1.3.0)

- **Widgets iPhone et Android** : confirmé [S30]
  - *Ma collection* : valeur, variation sur 24 h, courbe, nombre de cartes ;
  - *Ma vitrine* : 3 ou 5 cartes en éventail ;
  - *Pokédex* : jauge et progression par génération ;
  - *Mon classeur* : prochaines cases à remplir ;
  - *Extension suivie* : % de complétion ;
  - *Top mouvements* : Premium.
- Les widgets sont gratuits, sauf Top mouvements. Un appui ouvre l'écran correspondant. Les montants restent masqués sur l'écran verrouillé, sauf choix contraire. confirmé [S30]
- **Fond d'écran « vitrine »** : 4 thèmes. Sur Android, mise à jour quotidienne ; sur iPhone, via un raccourci « Obtenir ma vitrine ». confirmé [S30]

---

## 3. Ajout d'une carte (point 2)

### 3.1 Le scanner, côté utilisateur

1. On ouvre le Scanner (bouton central). Un **consentement** est demandé avant le premier scan, parce que les photos partent vers des services d'IA tiers. confirmé [S31] [S7]
2. On pose la carte à plat, sous une lumière homogène, sans reflet et avec le numéro lisible. Un **bouton flash** aide dans le noir. Ensuite, tout est automatique : confirmé [S7] [S25] [S1] [S30]
   - **capture automatique** dès que la carte est bien cadrée, sans appuyer sur un bouton ;
   - mise au point centrée sur la carte ;
   - **chaque photo est prise deux fois** et l'app garde la plus nette ;
   - détection et recadrage automatiques (1.3.1).
3. **Écran de réussite** : confirmé [S1] (captures) [S1]
   - badge et symbole de rareté, visuel mis en valeur, nom, extension et numéro, drapeau de langue ;
   - **le prix défile jusqu'à la valeur, avec une vibration d'autant plus forte que la carte vaut cher** ;
   - **« Déjà dans ta collection ×N »** dès que la carte est reconnue (1.3.5) ;
   - boutons « Ajouter », « Voir les détails » et « Re-scanner », toujours au même endroit.
4. **Cas particuliers** : confirmé [S3] [S7] [S1]
   - si la carte existe en plusieurs versions (reverse, Poké Ball, 1re édition, tamponnée), l'app demande laquelle on a ;
   - si la correspondance est incertaine, elle propose plusieurs cartes ou une recherche manuelle ;
   - si elle est sûre, un lien permet de signaler une erreur ;
   - si la carte n'est pas reconnue, un message dit quoi faire.
5. **Ajout** : la carte va dans le classeur de la langue détectée, avec son état et, en option, son prix d'achat. « Carte ajoutée » ouvre le classeur de la carte, et dans un classeur guidé la carte se range directement dans sa case. confirmé [S7] [S25] [S1] [S30]

Autres possibilités du scanner :

- **Scan en rafale** : oui. Le mode « ajout rapide » (1.3.4) ajoute chaque carte scannée à la collection et enchaîne les scans. confirmé [S1]
- **Ce qui est reconnu** : confirmé [S3] [S7] [S25] [S1]
  - la langue (9 langues), l'extension, le numéro et la rareté ;
  - la **1re édition** (tampon) et les **cartes tamponnées** avec leur variante ;
  - les full arts, alt arts et secrètes au petit numéro.
- **Slabs** : lecture de la société, de la note et du numéro de certificat (PSA, PCA, CGC, Beckett…), puis affichage de la valeur gradée estimée. Les certificats PSA sont vérifiés. confirmé [S1] [S11] [S22]
- **Scellés** : boosters, ETB, displays, Pokébox et tins, avec le même écran de réussite. Un scan de scellé compte comme un scan. confirmé [S3] [S29]
- **Page de classeur** (Premium, bêta ; 10 pages par mois, 30 en Premium+) : confirmé [S8] [S1] [S30]
  - mode « page » : on photographie une page 3×3 à plat ;
  - les cartes apparaissent case par case (les premières en 1,5 s environ) ;
  - les cases douteuses portent un **« ? »** et sont exclues de l'ajout groupé ; les cases vides sont signalées ;
  - on peut retirer une carte mal reconnue et choisir l'état carte par carte ou pour toute la page (Near Mint par défaut) ;
  - on ajoute le tout à la collection ou on le range dans une farde.
- **Hors ligne** : la photo est mise en attente et identifiée au retour du réseau. confirmé [S7] [S3]
- **Quotas** : 50 scans par mois en gratuit, plus 1 « scan de secours » par jour une fois le quota épuisé ; illimités en Premium. confirmé [S1] [S7]
- **Vitesse** : 0,46 s en médiane, 76 % des scans sous la seconde (mesure interne sur 100 scans, octobre 2026). Aucun taux de précision n'est publié. confirmé [S7]
- **Anti-triche** : les photos d'écran sont détectées et ne comptent pas pour le Pokédex. confirmé [S23]

### 3.2 Recherche manuelle et filtres

Voir 2.3 : recherche par nom, numéro, code d'extension ou illustrateur, tolérante aux fautes, avec tris et filtres. confirmé [S26] [S1]

### 3.3 Autres façons d'ajouter

- Depuis la **fiche carte** (« Ajouter » ou « Ajouter aux doublons »). confirmé [S6] [S1] (captures)
- **Par lot** depuis le catalogue d'une extension, en cochant plusieurs cartes. Le développeur annonce aussi un bouton « option » pour ajouter toute une série, reverses, Poké Ball et Master Ball compris. confirmé [S8] [S6] [S34]
- Avec le **« + » d'une tuile MasterSet**, sans ouvrir la fiche. confirmé [S28]
- Par **import CSV PokéCardex** (1 000 cartes au plus en gratuit, avec un rapport qui indique pour chaque ligne si c'est l'extension ou la carte qui n'a pas été reconnue). confirmé [S3] [S29] [S1]
- Par **import de decks Pokémon TCG Live** (les cartes manquantes sont signalées). confirmé [S1]
- Par l'**assistant IA** (une photo, puis « ajoute-la ») ou l'**extension navigateur** (clic droit sur une photo d'annonce). confirmé [S24] [S3]

### 3.4 Données saisies pour chaque exemplaire

| Champ | Valeurs | Statut |
|---|---|---|
| Langue | Celle du classeur (un classeur par langue). Le bouton d'ajout indique le classeur de destination. | confirmé [S1] [S7] |
| Version | Normale, Reverse, Holo ou non holo, 1re Édition, Poké Ball, Master Ball, Cosmos Holo, cartes tamponnées (Staff, Prerelease, Pokémon Center, GameStop, Holiday Calendar…), Jumbo, et « Scellée » pour les promos encore sous blister. | confirmé [S1] [S29] [S30] |
| État | Near Mint, Excellent, Good, Played, Poor : 5 crans repris de l'échelle Cardmarket (pas de Mint ni de Light Played). | confirmé [S4] [S25] |
| Gradation | Société (PSA, PCA, BGS, CGC, CCC, SGC, plus une trentaine d'autres en saisie manuelle), note avec demi-notes (8,5), étiquette spéciale (Gold ou Black Label, Pristine) et numéro de certificat (lu par le scanner). | confirmé [S11] [S1] [S29] |
| Quantité | Par ligne, jusqu'à 99 exemplaires. | confirmé [S1] [S23] |
| Prix d'achat | Par exemplaire et facultatif. Ajouter un exemplaire à un autre prix ne touche pas les autres, et le formulaire retient le dernier prix saisi. Un prix semble pré-rempli par défaut : un bug donnait 0,70 € aux gradées, corrigé en 1.2.2. On peut supposer que c'est la cote du jour. | confirmé [S1] [S29] / défaut : supposé |
| Date d'achat | Non documentée. Seule la date d'ajout est enregistrée (il existe un tri par date d'ajout). | supposé |
| Vente | Prix et date de vente, modifiables ou annulables. Le bénéfice reste acquis. | confirmé [S1] [S27] |
| Rangement | Pochette de farde ou case de classeur guidé. | confirmé [S29] [S30] |

### 3.5 Après l'ajout

- On modifie l'**état** et le **prix d'achat** exemplaire par exemplaire (« Mes exemplaires », 1.2.1). Ce n'était pas possible au lancement, et un avis le reprochait. confirmé [S1] [S33]
- On peut vendre ou retirer **plusieurs exemplaires d'un coup** ; l'édition en masse et la vente en lot existent depuis la 1.2.8. confirmé [S1] [S16]
- Un bouton **« − »** à côté du « + » sur les grilles retire un exemplaire (1.3.5). confirmé [S1]

---

## 4. Produits scellés (point 3)

- **Types couverts** : confirmé [S3] [S9] [S1] (captures) [S16] [S29]
  - booster, display, demi-display, ETB ;
  - coffret (collection box), UPC (Ultra Premium Collection) ;
  - tin et mini-tin, blister, bundle ;
  - duopack, tripack ;
  - deck à thème, kit dresseur, Pokébox ;
  - **cases** (« Case de 10 ETB », cases de displays) ;
  - promos scellées.
- **Catalogue** : 13 000 scellés tous jeux confondus, dont 860 japonais. Chaque produit est suivi **dans sa langue** : un produit FR, son équivalent EN et son équivalent JP ont chacun leur prix. Visuels français et noms officiels. Depuis la 1.3.4, une extension affiche tous ses produits (avant, seulement les 40 premiers). confirmé [S1] [S9] [S28]
- **Navigation** : par série ou par type, avec des filtres (Tous, Display, Demi-Display, ETB, Bundle…), en grille ou en liste. confirmé [S1] (captures)
- **Ajout** : trois chemins. confirmé [S1] (captures) [S3]
  - le bouton « + Portfolio » sur une tuile ;
  - Classeur → série → produit, puis on saisit le prix d'achat et la quantité ;
  - le scan (booster, ETB, display, Pokébox, tin).
- **Fiche scellé** : confirmé [S1] [S4] [S9]
  - quantité, prix d'achat et gain estimé dans une même fenêtre, avec une ligne « +/− » ;
  - indice PokéItem, prix Cardmarket et **prix de sortie** quand il est connu ;
  - courbe de prix ;
  - « Marquer comme vendu », avec la plus-value reprise dans la page Analyse ;
  - un **« ? »** à la place d'un prix douteux (certains tripacks, 1.3.5).
- **Photos** : seulement les visuels du catalogue. Aucune photo personnelle n'est documentée. supposé
- **Règles de cote** : confirmé [S4]
  - une annonce isolée ne suffit pas à publier un indice ;
  - pour un produit français récent dont le prix de sortie est établi, l'indice ne descend jamais sous ce prix (depuis le 04/11/2026) ;
  - une promo scellée a sa propre cote, appliquée seulement aux exemplaires marqués « Scellée ».
- **Réglage** : on choisit de compter ou non les scellés dans la valeur totale (1.3.5). L'accueil affiche le total des scellés. confirmé [S1]
- **Limite gratuite** : 10 scellés (5 au lancement), illimités en Premium. confirmé [S1] [S5]
- **Bonus** : confirmé [S28] [S1] [S16]
  - un onglet **Amazon** dans le Marché, avec une sélection de scellés et des « invitations » qui préviennent quand un produit vendu sur invitation devient disponible ;
  - un suivi des lives Whatnot (v2).

---

## 5. Cotes et prix (point 4)

### 5.1 Sources

| Source | Données utilisées | Statut |
|---|---|---|
| Cardmarket | Annonces par langue et par état, prix tendance, prix moyen récent. Fournit le « premier prix NM » et sert de plafond. | confirmé [S4] |
| eBay | Ventes réalisées (le signal qui pèse le plus), annonces à prix fixe (plafond), enchères en cours (plancher). | confirmé [S4] |
| TCGplayer | Prix de marché américain, surtout pour les cartes en anglais. | confirmé [S4] |
| PSA | Rapports de population des cartes gradées. | confirmé [S4] |
| Japon et Chine | JP : places de marché internationales et japonaises, converties en euros. ZH : d'abord les annonces Cardmarket en chinois ; une vente eBay trouvée seulement par le nom ne suffit pas. | confirmé [S4] |

Les **moyennes à 1, 7 ou 30 jours ne sont pas affichées**. La tendance Cardmarket entre seulement dans le calcul de l'indice. confirmé [S13] [S4]

### 5.2 Les valeurs affichées

- **« 1er prix Near Mint » Cardmarket** : l'annonce NM la moins chère **dans la langue de la carte**, c'est-à-dire le plancher de ce qui est réellement en vente. confirmé [S4] [S1]
- **Indice PokéItem** : une estimation accompagnée d'un niveau de confiance (Faible / Moyenne / Bonne / Élevée). C'est lui qui sert par défaut à valoriser la collection. confirmé [S4]
- **En complément** : la dernière vente eBay (date et état), TCGplayer pour l'anglais et les prix par état. confirmé [S1] [S29]
- **Prix de repli** : sans indice dans la langue, l'app affiche le premier prix Cardmarket, puis une langue proche ou la tendance Cardmarket, et le signale. Pour les cartes japonaises, le premier prix NM des annonces Cardmarket japonaises apparaît sur une ligne à part. confirmé [S4] [S14]
- **Au lancement**, l'indice ne s'affichait que si sa confiance était bonne ou élevée ; sinon l'app montrait le « Cardmarket NM low ». confirmé [S25]

### 5.3 Calcul de l'indice (méthode publiée)

L'indice se calcule en six étapes : confirmé [S4]

1. Collecte toutes les 24 h.
2. Conversion en euros et rattachement à la bonne langue, version et état.
3. Pondération : une vente compte plus qu'une tendance, qui compte plus qu'une annonce ; une vente récente plus qu'une ancienne ; plusieurs ventes plus qu'une seule.
4. Médiane pondérée qui sert d'ancre ; les signaux 3 fois plus hauts ou plus bas que l'ancre sont écartés.
5. Moyenne géométrique pondérée, bornée : pas au-dessus du premier prix NM, pas sous une enchère en cours.
6. Lissage d'un jour à l'autre : une vente isolée ne fait pas bondir l'indice.

S'y ajoutent deux règles : confirmé [S4]

- **Fenêtres de ventes** : 45 à 90 jours pour une carte récente, jusqu'à 180 jours pour une carte ancienne, jusqu'à un an pour une gradée.
- **Pas de prix inventé** : sans signal récent, l'indice suit la tendance de la série avec une confiance faible ; si rien ne tient, le prix disparaît.

### 5.4 Langue, état, version

- **Langue** : chaque langue a son propre prix. Le premier prix NM français ne vient que d'annonces françaises. confirmé [S4]
- **État** : prix NM × un ratio, mesuré sur les annonces de la carte s'il y en a assez dans sa langue. Ratios moyens pour les cartes à 50 € et plus : Excellent ≈ 65 %, Good ≈ 41 %, Played ≈ 22 %, Poor ≈ 17 %. L'écart est plus faible sur les cartes bon marché (le port pèse plus). confirmé [S4]
- **Versions** : reverse et 1re édition ont leur propre cote, calculée par langue, comme la 1re édition japonaise. Les cartes à deux finitions ont un onglet Holo. confirmé [S4] [S1]

### 5.5 Cartes gradées

- Une cote par société (PSA, PCA, BGS, CCC…) et par note. Les ventes réelles vérifiées passent avant les guides de prix. confirmé [S4] [S11]
- Les prix sont **cohérents** : un PSA 10 n'est jamais moins cher qu'un PSA 9, et une gradée jamais moins chère que la carte brute. Gold Label et Black Label ont leur propre cote. confirmé [S4] [S1]
- Les prix sont classés par langue de vente, avec la mention « version EN » s'il n'y a que des ventes anglaises. confirmé [S4] [S11]

### 5.6 Fréquence et devises

- **Mise à jour toutes les 24 h**, avec un nettoyage quotidien des pics aberrants. confirmé [S3] [S29]
- La synchronisation se fait sans doute la nuit, vers 4 h (« Dernière sync … 04:20 »). supposé
- **9 devises d'affichage**, converties chaque jour. confirmé [S3] [S1]

### 5.7 Graphiques, variations, plus-value

- **Courbe de valeur de la collection** (Premium) : 7 jours, 1 mois, 3 mois, 6 mois, 1 an ou depuis le début. La maquette du site montre 7 j / 1 m / 3 m / 1 an. confirmé [S10] [S2]
- **Historique de prix d'une carte** : dans toutes les formules, avec les ventes NM et Mint sur la courbe. confirmé [S10] [S29]
  - Les périodes ne sont pas documentées (supposé : les mêmes que pour la collection).
  - L'extension navigateur affiche une tendance sur 90 jours. confirmé [S3]
- **Variations** : confirmé [S1] (captures) [S2] [S30] [S1]
  - sur 24 h, en euros, sur l'accueil (« Marché » et « Collection ») ;
  - plus fortes hausses et baisses du mois ou des dernières 24 h ;
  - widget « Top mouvements » ;
  - notification « Bourse du matin ».
- **Pourcentages** : la page Analyse affiche le gain par rapport à l'achat et par rapport au marché, en %. confirmé [S2]
- **Plus-value** : par exemplaire (ligne +/− sur la fiche), par carte et au total. « Mes cartes » montre l'investi, la valeur actuelle et la plus-value ; une vente enregistrée garde son bénéfice. confirmé [S1] [S10]

### 5.8 Ce que l'utilisateur contrôle

- Le **prix de référence** de toute l'app : indice ou Cardmarket (1.1.9). confirmé [S26] [S1]
- **Signaler un prix faux** en un tap depuis la fiche (1.2.0). confirmé [S27]
- Masquer les prix et les montants (œil à trois crans, 1.2.9). confirmé [S16]

---

## 6. Collection et suivi (point 5)

### 6.1 Valeur totale

- C'est la somme de chaque exemplaire, valorisé dans sa langue, son état et sa note. On l'affiche pour une langue ou pour « toutes les langues », et on choisit d'y compter ou non les scellés. Le chiffre est le même sur l'accueil et dans le classeur. confirmé [S10] [S1]
- **Gratuite ou Premium ? Les sources se contredisent.** Le site la dit gratuite [S2] [S6] [S10], mais la fiche App Store et la page tarifs la rangent dans le Premium [S1] [S5]. Le plus probable : la valeur totale simple est gratuite, la courbe et la plus-value sont Premium. supposé

### 6.2 Page Analyse et statistiques (Premium)

- **Périodes** : 1, 2, 3 ou 6 mois. confirmé [S2]
- **Indicateurs** : prix d'achat, valeur de marché actuelle, gain par rapport à l'achat (%), gain par rapport au marché (%), ventes réalisées. confirmé [S2]
- **Filtres** : Cartes, Scellés, toutes les langues, Gain vs achat. confirmé [S2]
- **Tableau par carte** : nom, prix d'achat, prix unitaire actuel, écart au marché, bénéfice. confirmé [S2]
- **Meilleures performances du mois**, avec les cartes et les scellés côte à côte. confirmé [S27] [S1]
- **Répartition** (par extension, langue ou rareté) : non documentée, probablement absente. supposé
- Le profil public affiche aussi des « statistiques », mais leur contenu n'est pas détaillé. confirmé [S27]

### 6.3 Tri, filtres, vues

- **Tris** : numéro, nom, rareté, prix, état, date d'ajout. confirmé [S6] [S1]
- **Filtres** : possédées, manquantes, doublons ; Toutes / Loose / Gradées ; langue ; rareté ; type ; tampon ; illustrateur ; plateforme (cartes tokenisées). confirmé [S6] [S1] [S28]
- **Vues** : grille ou lignes, taille des vignettes réglable, extensions en tuiles par ère, position conservée au retour d'une fiche. confirmé [S1]

### 6.4 Complétion des sets, MasterSet, Pokédex

- **Taux de complétion** par extension et par langue. confirmé [S1]
- Onglet « Incomplètes ». confirmé [S1]
- Un statut **« Validé »** s'affiche pour une série complète (un avis signale qu'il ne s'affiche pas toujours). confirmé [S34]
- **MasterSet personnalisable** : confirmé [S29] [S1]
  - case « Compter dans mon MasterSet » pour chaque version (Reverse, 1re édition, Poké Ball, Master Ball…) ;
  - option « Ajouter les Stamps », décochée par défaut ;
  - une version décochée disparaît de la grille, de la progression et des onglets.
- **Checklist imprimable** par extension, pensée pour les conventions. Widget « Extension suivie ». confirmé [S27] [S30]
- **Pokédex 1 025** : une espèce est « capturée » dès qu'on possède une de ses cartes, quelle que soit la langue. Il est gratuit dans toutes les formules. confirmé [S29] [S6]
  - Le classeur guidé « Pokédex de Kanto » est gratuit ; le « Pokédex national » demande le Premium. confirmé [S6]

### 6.5 Souhaits (wishlist)

- Un **cœur** sur la fiche carte ajoute la carte aux souhaits. On peut **viser une version précise** (Reverse, Poké Ball…), et un filtre « Déjà possédées » existe. confirmé [S1]
- Les souhaits servent à trois choses : confirmé [S1] [S27] [S28] [S2]
  - des **notifications** et le suivi du prix des cartes voulues ;
  - le filtre **« Pour moi »** du Marché (cartes manquantes ou souhaitées) ;
  - les **Matchs d'échange** (avec une carte en exemple) et un onglet Matchs dans le Marché.
- La liste de souhaits est incluse dans toutes les formules. confirmé [S6]

### 6.6 Doublons

- **Définition** : même version et même langue, quels que soient l'état ou la gradation. confirmé [S29]
- **Où les voir** : confirmé [S1] [S1] (captures)
  - un onglet Doublons dans chaque extension (1.2.4) ;
  - le bouton « Ajouter aux doublons » sur la fiche ;
  - une **grille unique « doublons + gradées »** sans ouvrir chaque extension, avec export CSV (1.3.0).
- Un raccourci depuis l'accueil, et l'assistant IA sait lister les doublons. confirmé [S29] [S24]

### 6.7 Classeurs virtuels et fardes

- **Classeur (1.3.0)** : un nom, une couverture (photo du vrai classeur, photo d'une carte ou illustration sur une couleur de reliure) et un format de page commun (1×2, 2×2, 3×3, 4×3, 4×4), modifiable sans perdre de carte. confirmé [S30]
- **Modèles guidés** : Pokédex national (un intercalaire par génération), Pokédex d'une génération ou d'un type, Légendaires et Fabuleux, Master Set d'un Pokémon (un intercalaire par langue, extension attendue dans chaque case), Vitrine (les 16 cartes les plus chères), Libre. confirmé [S30]
- **« Remplir depuis ma collection »** : chaque carte possédée va dans la case qui l'attend, et les cases vides montrent ce qui manque. Le scanner range une carte directement à sa place. confirmé [S30]
- **Fardes** : jusqu'à 40 pages, chacune avec sa langue. Elles s'affichent sur l'accueil et se partagent dans le fil dès 3 cartes. Une pochette montre la valeur de l'exemplaire (état, note) et celle du Near Mint. confirmé [S29] [S1]
- **Options d'affichage** : logo d'extension, version, langue, état, prix, cartes manquantes atténuées ou non. Une page à la fois sur téléphone, une double page sur ordinateur. confirmé [S30]
- **Limites** : 1 classeur et 1 farde en gratuit, 30 de chaque en Premium. confirmé [S5] [S6]

### 6.8 Alertes de prix

- On les crée depuis la fiche carte, en fixant un **seuil maximal**. L'app surveille les **annonces eBay à prix fixe** et prévient quand l'une passe sous le seuil. La fiche indique les annonces déjà sous le seuil. confirmé [S26] [S1]
- **10 alertes en gratuit, 100 en Premium**. confirmé [S6] [S10]

### 6.9 Export, import, hors ligne

- **Export CSV** du classeur (cartes et scellés) : Premium. confirmé [S6] [S5]
- L'assistant IA a aussi un droit « Export de la collection ». confirmé [S24]
- **Import CSV** depuis PokéCardex. confirmé [S3]
- **Hors ligne** : on télécharge la collection (en Wi-Fi seulement ou aussi en données mobiles), on consulte cartes et quantités sans réseau, et les ajouts se synchronisent au retour. Les annonces eBay en direct ont besoin du réseau. confirmé [S26]

### 6.10 Partage, social, échanges, classement, marché

- **Partage** : confirmé [S1] [S32] [S23]
  - une feuille unique pour copier le lien ou envoyer en message privé, sur X, sur WhatsApp ou via le partage du téléphone ;
  - des pages publiques par carte et par Pokémon ;
  - le partage d'une farde dans le fil ;
  - la carte de classement partageable.
- **Amis** : suivre quelqu'un (demandes à accepter si le profil est privé), abonnés, « Poké », fil en direct des nouvelles cartes des personnes suivies. confirmé [S27] [S1]
- **Messagerie (16 ans et plus)** : confirmé [S27] [S29] [S1]
  - réactions, réponses, accusés de lecture, édition, mentions de cartes ou de profils, 2 photos par message (analysées avant envoi) ;
  - entre personnes qui se suivent, avec des garde-fous contre les arnaques (contacts extérieurs bloqués en début de conversation) ;
  - **ouverte à tous depuis la 1.3.5** ; avant, elle était réservée au Premium.
- **Échanges** : les « Matchs d'échange » et l'onglet Matchs existent. L'assistant IA sait « prévisualiser un échange » avec un dresseur dont le classeur est visible. confirmé [S1] [S2] [S24]
  - Le mécanisme exact (doublons de l'un ↔ souhaits de l'autre) n'est pas documenté. supposé
- **Classement** : saisonnier, à l'XP (section 7). confirmé [S23]
- **Marché entre particuliers** : confirmé [S27] [S28] [S3] [S1]
  - annonces de cartes, de scellés et de lots, créées depuis la collection, avec un prix et des photos modérées automatiquement ;
  - chaque annonce est **positionnée face à la cote** (« Excellent prix », « Bon prix », « Prix attractif », avec l'écart chiffré à la cote et à eBay) ;
  - filtres par jeu, langue, série, rareté et « Pour moi » ;
  - vote de la communauté sur la légitimité de l'annonce, signalement des contrefaçons ;
  - **pas de commission ni de paiement intégré** ; un onglet Extension en bêta.
- **Boutiques** : confirmé [S2] [S1] (captures) [S27] [S1]
  - 23 000+ boutiques dans plus de 100 pays, sur une carte ou en liste ;
  - filtres par pays (avec compteur), « Ouvert » et jeu ;
  - horaires et statut ouvert ou fermé en direct (dans le fuseau de la boutique), itinéraire ;
  - « Autour de moi » avec guidage à pied et distances en minutes ;
  - tri « les plus pokées d'abord » ; le commerçant peut revendiquer sa fiche, et un badge « boutique certifiée » existe.
- **Vrai ou faux** : jusqu'à 8 photos, puis 7 jours de vote « Authentique » ou « Contrefaçon » avec des arguments. Le résultat est un avis de la communauté, pas une expertise. confirmé [S3] [S29]
- **Concours** de boutiques, de créateurs et de médias depuis le fil, avec tirage automatique. confirmé [S1] [S16]

### 6.11 Fonctions annexes

- **Pré-gradation IA** (bêta, Pokémon) : confirmé [S3] [S1]
  - on photographie le recto et le verso, avec un guide photo ;
  - en 20 à 40 s, l'app note les coins, les bords, la surface et le centrage, puis donne une note sur 10 avec une fourchette, l'état Cardmarket et la valeur dans cet état ;
  - limites : 1 par semaine en gratuit, 20 par mois en Premium, 50 en Premium+ ;
  - plateformes : la FAQ et la roadmap disent « web seulement », mais les notes iOS 1.3.2 et 1.3.4 la mentionnent. supposé : elle arrive sur mobile.
- **Extension Chrome** (bêta, Premium, ordinateur) : confirmé [S3] [S1]
  - fonctionne sur Vinted, Leboncoin, eBay, Cardmarket et Whatnot ;
  - verdict sur une annonce : « bonne affaire », « prix du marché » ou « trop cher » ;
  - tendance sur 90 jours, même carte moins chère ailleurs, argument de négociation à copier ;
  - aucun chiffre pour les lots, les scellés ou les versions incertaines ;
  - clic droit sur une photo pour identifier la carte et l'ajouter à la collection.
- **Assistant IA (serveur MCP, depuis le 06/11)** : confirmé [S24] [S3]
  - fonctionne avec Claude, ChatGPT et Cursor ;
  - il sait donner une cote, l'historique sur 30 jours, un avis sur un prix ; résumer le classeur, lister les doublons, dire ce qui manque à un set ; ajouter ou retirer des cartes, des souhaits et des alertes ; scanner une photo ; exporter ;
  - les droits se cochent un par un ; les appels sont plafonnés et journalisés 90 jours.
- **Pokémon TCG Live** (pseudo, import de decks, méta des tournois), cartes tokenisées sur Solana, kit de marque, programme créateur. confirmé [S1] [S16] [S29]

---

## 7. Engagement : quêtes, saisons, rituels quotidiens

- **Deux compteurs d'XP** : confirmé [S23]
  - l'XP à vie fait monter le **Niveau Dresseur** (de 1 à 100 ; passer du niveau N au niveau N+1 coûte 500 × N XP) ;
  - l'XP de saison alimente le classement et repart de zéro à chaque saison.
- **Saisons trimestrielles**, gratuites et sans achat : 52 gagnants pour environ 1 100 € de lots (coffrets UPC et ETB, cartes, mois ou années de Premium). Un contrôle anti-fraude de 7 jours précède la remise des lots. confirmé [S23]
- **Barème, quotidien** : confirmé [S23]
  - connexion : 50 XP, +10 par jour de série (200 au plus) ;
  - scan du jour : 20 XP, +20 par jour de série (500 au plus) ;
  - **3 missions à 100 XP**, puis un **coffre à 200 XP** une fois les trois réclamées ;
  - gels de série (2 au plus en réserve).
- **Barème, ponctuel** : confirmé [S23]
  - paliers de collection : 500, 1 000 et 5 000 cartes ; 5, 10 et 50 scellés ;
  - Pokédex au scanner : de 10 à 1 025 espèces ;
  - parrainage : 10 000 XP par filleul valide ;
  - photo de profil, suivi des comptes sociaux, liaison et adhésion Discord (5 000 XP chacune), Clipping.
- **Rituels intégrés** : « Ton jour » (missions et première semaine guidée), écran Série, notification « Bourse du matin » à l'heure choisie. confirmé [S1]
- **Parrainage** : 1 mois offert tous les 3 filleuls qui s'abonnent. confirmé [S1] [S29]
  - Un programme créateur existe aussi : code, QR codes, espace des gains.
  - L'app est affiliée à l'eBay Partner Network et au Programme Partenaires Amazon UE. confirmé [S20]
- **Anti-triche** : comptes multiples, e-mails jetables, scans d'écran et bots sont interdits. Un palier de collection doit être tenu 7 jours, sinon l'XP est retiré. confirmé [S23]

---

## 8. Gratuit vs Premium (point 6)

### 8.1 Ce que donne chaque formule (au 17/11/2026)

| Fonction | Gratuit | Premium | Premium+ | Sources |
|---|---|---|---|---|
| Jeux | 1, choisi à l'inscription (Pokémon par défaut). Gentle Mates est gratuit pour tous. | 1 | Tous, y compris ceux à venir | confirmé [S3] [S1] |
| Langues de classeur | 1 (sa langue) | Toutes | Toutes | confirmé [S6] [S1] [S33] |
| Cartes | 1 000 | Illimité | Illimité | confirmé [S1] [S5] |
| Scellés | **10** | Illimité | Illimité | confirmé [S1] [S5] |
| Scans par mois | 50, plus 1 scan de secours par jour (doublés le 1er mois) | Illimités | Illimités | confirmé [S1] [S27] |
| Scan de page de classeur | Non | 10 pages par mois (bêta) | 30 pages par mois | confirmé [S8] [S1] |
| Pré-gradation IA | 1 par semaine | 20 par mois | 50 par mois | confirmé [S3] [S1] |
| Classeurs / fardes | 1 / 1 | 30 / 30 | 30 / 30 (supposé) | confirmé [S5] [S6] |
| Alertes de prix eBay | 10 | 100 | 100 | confirmé [S6] |
| Valeur totale | Oui d'après le site | Oui | Oui | contradictoire, voir 6.1 |
| Courbe de valeur, plus-value, page Analyse, meilleures performances | Non | Oui | Oui | confirmé [S1] [S10] |
| Export CSV | Non | Oui | Oui | confirmé [S6] [S5] |
| Messagerie | Oui depuis la 1.3.5 (16 ans et plus) | Oui | Oui | confirmé [S1] |
| Widgets | Oui, sauf Top mouvements | Tous | Tous | confirmé [S30] |
| Classeur guidé Pokédex national | Non (Kanto seulement) | Oui | Oui | confirmé [S6] |
| Extension navigateur | Non | Oui (bêta) | Oui | confirmé [S3] |
| Decks TCG Live | ? | 50 | ? | confirmé [S5] |
| Catalogue complet, doublons, souhaits, Pokédex 1 025, réseau, marché, boutiques, quêtes | Oui | Oui | Oui | confirmé [S1] [S6] |

### 8.2 Prix

| Formule | Semaine | Mois | An | À vie | Essai gratuit |
|---|---|---|---|---|---|
| Premium | 2,99 € | 5,99 € | 49,99 € (4,17 €/mois) | 159,99 € | 7 j sur l'annuel, 3 j sur les autres, sans carte bancaire (site) |
| Premium+ | 4,99 € | 8,99 € | 79,99 € (6,67 €/mois) | 249,99 € | Mêmes essais |

- Source des prix : confirmé [S1] [S3] [S21] [S2].
- Passage de Premium à Premium+ au prorata, sans nouvel essai. Résiliation à tout moment, l'accès restant ouvert jusqu'à la fin de la période. Paiement web via Stripe, mobile via les stores. confirmé [S21] [S28]
- La fiche App Store montre aussi d'autres paliers (1,99 €/semaine, 3,99 €/mois, 34,99 €/an), probablement des offres promotionnelles. supposé [S1]
- Le prix de l'accès « à vie » varie selon le canal. Les CGV et la liste des achats intégrés App Store affichent d'autres montants que le site (par exemple 189,99 $ ou 289 $ sur l'App Store US), et c'est le prix affiché par le store qui fait foi. confirmé [S21] [S1]

### 8.3 Évolution des limites gratuites

- **Lancement (mai)** : 500 cartes (un bug les plafonnait à 100), 5 scellés, environ 10 scans par mois. confirmé [S1] pour les cartes et les scellés ; 10 scans d'après l'ancienne description App Store vue via un moteur de recherche, supposé.
- **Juin** : 1 000 cartes et 10 scellés (1.1.4) ; 20 scans par mois (v2). confirmé [S1] [S16]
- **31 août** : scan de secours quotidien. confirmé [S1]
- **Novembre** : 50 scans par mois (1.3.4) ; messagerie ouverte à tous (1.3.5). confirmé [S16] [S1]
- Le développeur répond aux avis qu'il « réévalue régulièrement le gratuit ». confirmé [S33] [S1]

### 8.4 Publicité : où et quand ?

- **Aucune régie publicitaire déclarée** : confirmé [S33] [S22] [S25]
  - Google Play affiche seulement « Achats via l'appli », sans la mention « Contient des annonces » ;
  - la politique de confidentialité précise que les SDK Meta et AppsFlyer **ne servent pas à afficher de pub** : ils mesurent seulement les installations venues des campagnes de PokéItem ;
  - le billet v2 promet « sans publicité ciblée ».
- Un utilisateur a même demandé une version gratuite financée par la pub, et le développeur a répondu que l'idée était « notée ». confirmé [S33]
- **Ce qui est sans doute perçu comme des « pubs »** : supposé
  - l'offre Premium à l'onboarding et à chaque fonction verrouillée (une langue verrouillée « ouvre l'offre ») ;
  - la fenêtre « Quoi de neuf » ;
  - l'onglet Amazon et les liens d'achat affiliés (eBay, Amazon) ;
  - les posts News et Concours dans le fil ;
  - les relances de parrainage et de quêtes.

  À vérifier avec lui.

---

## 9. Petits détails d'UX qui rendent l'app « très pratique » (point 7)

Tout ce qui suit est confirmé dans [S1] (notes de version et captures), sauf mention contraire.

1. **Capture automatique** sans appuyer, double photo dont on garde la plus nette, recadrage automatique, flash.
2. **Prix qui défile avec une vibration proportionnelle à la valeur** après un scan : le petit plaisir à chaque carte.
3. **« Déjà dans ta collection ×N »** dès la reconnaissance, et le bouton qui devient « Ajouter aux doublons ».
4. **Ajout rapide en rafale** : les scans s'enchaînent sans repasser par un écran de confirmation.
5. **« + » et « − » directement sur les vignettes** des grilles et du MasterSet, sans ouvrir la fiche.
6. **Un tap ouvre, un appui long sélectionne** : sélection multiple, et retrait en un tap avec le « − » façon iPhone.
7. **Glisser d'une fiche à la suivante**, et zoom plein écran (double tap, pincement).
8. **Effet holo** qui suit l'inclinaison du téléphone. Il reste fixe si l'utilisateur a réduit les animations. confirmé [S29]
9. **Retour à la même position** dans une liste ou dans le fil après avoir ouvert une fiche ou un profil.
10. **Recherche tolérante** : « 25/102 », « OBF 125 », surnoms, une faute, les accents, les symboles.
11. **Drapeau devant chaque prix** pour savoir de quel marché vient la cote, et prix de repli signalé.
12. **Œil à trois crans** pour masquer les montants (dans le métro, sur les captures d'écran) ; montants masqués par défaut sur l'écran verrouillé. confirmé [S16] [S30]
13. **Widgets et fond d'écran vitrine** : on voit la valeur et le Pokédex sans ouvrir l'app. confirmé [S30]
14. **« Bourse du matin »** : une notification quotidienne à l'heure choisie quand la collection bouge.
15. **Barre du bas personnalisable** avec deux raccourcis au choix, et menu « + ».
16. **Le formulaire retient le dernier prix d'achat**, et ajouter un exemplaire ne touche pas les autres. confirmé [S29] [S1]
17. **Le classeur de destination est affiché** sur le bouton d'ajout ; une carte scannée se range seule dans sa case.
18. **Hors ligne** : collection consultable, scans et ajouts mis en file. confirmé [S26]
19. **Checklist imprimable** pour les conventions. confirmé [S27]
20. **Connexion au site par QR code** depuis l'app, et double page sur ordinateur.
21. **Fenêtre de mise à jour qui ne bloque pas le scanner**, et l'app réessaie et explique au lieu d'afficher « Load failed ».
22. **Taille des vignettes réglable** et tri des extensions mémorisé.
23. **Messages d'erreur utiles** : « carte non reconnue », « ? » à la place d'un prix douteux, « collection sans cote encore ».

---

## 10. Ce que les utilisateurs aiment / reprochent

Sources : avis App Store FR [S1] (10 avis visibles) et BE [S34] (6 avis), Google Play [S33] (20 avis extraits de la page publique), témoignages repris sur le site [S2]. Aucun fil Reddit ni article de presse indépendant n'a été trouvé.

### 10.1 Ce qu'ils aiment

- **L'interface** : claire, fluide, moderne, « loin devant » les autres apps (GD Jordane, Hugo Clavier, Merluzzi Paul, Toma, Sunred78). confirmé [S33] [S1]
- **Le scanner** : rapide et fiable, y compris sur les extensions récentes (Lugohan, Raphaël G, Aurélien C., Damien S.). confirmé [S1] [S33]
- **Le suivi de valeur au jour le jour** : les variations par jour et par mois, la valeur de la collection en euros, le fait de ne plus aller vérifier soi-même sur eBay ou Cardmarket (yabuno_sf, LilJoe4464, Caandy3431, Lucie G.). confirmé [S1] [S33]
- **Des cotes jugées fiables**, toutes les langues et toutes les sociétés de gradation (Marek A.). confirmé [S33]
- **Les scellés bien suivis** (historique des prix, prix d'achat), même par ceux qui ont installé l'app pour ça (Amaury1509). confirmé [S1]
- **Une équipe très réactive** : un blocage des fiches corrigé en une demi-heure (Sunred78), des réponses à presque tous les avis, des améliorations chaque semaine (DiogoRafou11, Dhnfhkbc, dimitri capel). confirmé [S34] [S33] [S1]
- **Un gratuit suffisant pour un petit collectionneur**, un Premium « qui vaut le coup », les quêtes et le niveau (Aurélien C., yabuno_sf, Sunred78). confirmé [S33] [S1]

### 10.2 Ce qu'ils reprochent (et ce qui a été corrigé depuis)

| Reproche | Exemples | Corrigé ? |
|---|---|---|
| **Limites gratuites atteintes trop vite** | 5 scellés « atteint trop vite », 1 000 cartes (paywall), 20 scans par mois (« je prends une photo et je demande à une IA ») | En partie : 10 scellés, 50 scans plus 1 par jour. confirmé [S1] [S33] |
| **Langues étrangères payantes** (japonais, chinois…) | Désinstallée faute de pouvoir collectionner en japonais ; « absurde » de payer pour d'autres langues | En partie : on choisit sa langue gratuite (1.2.8), les autres restent Premium. confirmé [S1] [S33] |
| **Autres jeux payants** | « Licences débloquées en payant » | Non (c'est le principe du Premium+). confirmé [S33] |
| **Abonnement jugé cher** | Plus de 30 €/an « trop cher » ; 159 € à vie ; « je préférerais des pubs » ; peur d'être prélevé après l'essai | Non. confirmé [S1] [S33] [S2] |
| **Premium jugé maigre au début** | « Juste des cases qui affichent un chiffre », scanner qui bugge | Oui : scanner refait, app passée de 660 Mo à quelques dizaines de Mo (26 à 50 Mo selon les sources). confirmé [S33] [S16] [S1] |
| **Cotes imprécises** | Surestime ou sous-estime ; l'état ne change pas la valeur ; PSA 10 sous-évalué ; léger retard | En partie : moteur de prix refait, ratios par état, cotes gradées sur ventes réelles. confirmé [S33] [S1] [S34] |
| **Erreurs de catalogue** | Master Ball de dresseur inexistante en FR, reverses inventées, extensions manquantes (L'Appel des Légendes), scellés manquants, Jumbos, holos spécifiques (McDo, reverses JP) | Corrigés au cas par cas (signalement via Support). confirmé [S34] [S1] [S33] |
| **Complétion fausse** | Une série pas marquée « Validé » alors que tout est possédé | Inconnu. confirmé [S34] |
| **Ergonomie** | Impossible de modifier l'état après l'ajout ; nom du set absent de la fiche ; pas d'export ; doublons et gradées visibles seulement extension par extension ; doublons non comptés ; pas de sélection de plusieurs variantes ; retrait lent ; « déjà possédée » non signalée au scan ; tampons et éditions mal gérés | Oui pour la plupart (Mes exemplaires, grille globale, export Premium, « −», « ×N », stamps). confirmé [S33] [S1] [S34] [S2] |
| **Bugs** | Plein écran forcé qui cache des éléments sous l'encoche (Android), fiches qui bloquent, connexion, « Load failed » | Corrigés en 1.3.2 et 1.3.3 ; l'encoche n'est pas confirmée. confirmé [S33] [S1] |

### 10.3 Ce qu'on peut faire mieux (opportunités pour notre app)

- **Aucune limite et aucun paywall** : toutes les langues, tous les scellés, l'export, la courbe et l'analyse, puisque l'app est pour nous et nos potes.
- **Prix transparents** : afficher côte à côte la tendance, le plus bas, les moyennes à 7 et 30 jours, la date de la dernière vente, et laisser choisir la référence. PokéItem ne montre pas les moyennes.
- **Saisie complète** : date et lieu d'achat, frais de port inclus dans le prix de revient, notes libres, photo personnelle de l'exemplaire (utile pour les scellés et les gradées), état modifiable à tout moment.
- **Catalogue corrigé à plusieurs** : un bouton « cette variante n'existe pas » ou « il manque une carte » qui corrige vite notre base commune.
- **Répartition et statistiques** (par extension, langue, type de scellé, rareté), absentes chez eux.
- **Échanges entre potes** : faire correspondre automatiquement les doublons des uns avec les souhaits des autres, dans le groupe.
- **Scellés pensés pour l'achat-revente** : prix de sortie, coût de revient, marge, statut « à revendre ». Synergie possible avec etb-radar.
- **Zones sûres (encoche) respectées** sur Android et iOS dès le départ.

---

## 11. Fonctions à reproduire, priorisées

Contexte : le dépôt `classeur` est aujourd'hui une PWA locale (Vite, React, Dexie). Pour la synchronisation entre appareils et le partage entre potes, il faudra un back-end. supposé

### P0 : indispensable (le MVP qui remplace PokéItem au quotidien)

| # | Fonction | Contenu minimal |
|---|---|---|
| P0-1 | Catalogue cartes Pokémon FR + EN | Séries → extensions (logo, code, date) → cartes (image, numéro, rareté, illustrateur, versions qui existent vraiment). |
| P0-2 | Catalogue scellés Pokémon FR + EN | Types (booster, display, demi-display, ETB, coffret, UPC, tin, blister, bundle, duo/tripack, deck, kit, Pokébox, case), image, extension, prix. Ajout manuel d'un produit absent. |
| P0-3 | Recherche | Nom, numéro « 25/102 », code d'extension, tolérance aux fautes et aux accents ; filtres extension, rareté, langue ; tris prix, date, nom. |
| P0-4 | Ajout d'exemplaire en 3 taps au plus | Langue, version, état sur 5 crans, gradation (société, note, étiquette), quantité, prix et date d'achat (pré-remplis avec la cote du jour) ; modifier ou supprimer à tout moment. |
| P0-5 | Vente | Marquer comme vendu (prix, date), bénéfice réalisé conservé. |
| P0-6 | Scanner simple, une carte à la fois | Photo → identification (nom, numéro, langue) → confirmation, choix de version, « déjà possédée ×N » → ajout ; mode « ajout rapide » enchaîné. PokéItem s'appuie lui-même sur des IA de vision tierces [S22]. |
| P0-7 | Cote quotidienne | Cardmarket (tendance, plus bas, moyennes 1, 7 et 30 j) avec la source et la date de mise à jour affichées ; décote par état (ratios) ; cote des scellés. |
| P0-8 | Historique des prix stocké dès le premier jour | Instantané quotidien des cartes et des scellés suivis : c'est ce qui permettra les courbes, et on ne peut pas le reconstituer après coup. |
| P0-9 | Accueil | Valeur totale, variation sur 24 h en € et en %, mini-courbe, cartes les plus chères, derniers ajouts, total des scellés, œil pour masquer les montants. |
| P0-10 | Plus-value | Investi, valeur actuelle et gain par exemplaire, par carte et au total ; réglage « inclure les scellés ». |
| P0-11 | Collection par extension | Complétion X/Y et %, onglets Possédées / Manquantes / Doublons ; « Toutes mes cartes » avec tris et filtres (Loose / Gradées, langue). |
| P0-12 | Souhaits et doublons | Cœur sur la fiche (avec la version visée) ; liste globale des doublons. |
| P0-13 | Courbe de valeur de la collection | 7 j, 1 m, 3 m, 6 m, 1 an, tout ; plus fortes hausses et baisses. |
| P0-14 | Fiche carte | Image, infos, cote par état, courbe, liste de mes exemplaires (+/−), liens vers Cardmarket et eBay. |
| P0-15 | Import / export CSV | Export complet, et import (dont l'export CSV de PokéItem, pour récupérer une collection existante). |

### P1 : forte valeur, juste après le MVP

- **Compte et synchronisation multi-appareils**, plus un **partage entre potes** : voir la collection d'un ami, faire correspondre ses doublons avec ses souhaits, et un classement du groupe (valeur, complétion, Pokédex).
- **Autres langues** (JP d'abord, puis DE, IT, ES), et **cote par langue**. Il faudra une source de données dédiée (voir 11.5).
- **MasterSet configurable** (versions et tampons qui comptent), statut « complet » fiable, checklist imprimable.
- **Page Analyse** : périodes 1 à 6 mois, gains par rapport à l'achat et au marché, top et flop, filtres cartes/scellés ; **répartitions**.
- **Cartes gradées** : cote par société et par note (ventes eBay), lecture de l'étiquette au scan.
- **Scanner de scellés** (booster, ETB, display, tin).
- **Alertes** : seuil de prix, notification quotidienne de variation (façon « Bourse du matin »), alerte quand le prix d'un souhait baisse.
- **Classeurs virtuels** : pages de 3×3, 4×3 ou 4×4 pochettes, « remplir depuis ma collection », modèles Pokédex, Master Set d'un Pokémon et Vitrine.
- **Pokédex 1 025** (une espèce est capturée dès qu'on a une de ses cartes).
- **Hors ligne** : consultation, et ajouts mis en file d'attente (cohérent avec la base locale Dexie).
- **Widgets et raccourcis** : valeur, extension suivie (selon ce que permet une PWA ; widgets natifs en P2).

### P2 : plus tard, ou bonus

- Scan d'une **page de classeur** (9 cartes en une photo) ; **pré-gradation IA** (coins, bords, surface, centrage).
- **Effet holo** au gyroscope, plein écran avec zoom, vibration proportionnelle à la valeur.
- **Autres jeux** (One Piece, etc.) et **multi-devises**.
- **Extension navigateur** ou outil de verdict sur les annonces Vinted et Leboncoin (synergie avec etb-radar).
- **Assistant IA** (MCP), alertes d'invitations Amazon, suivi Whatnot, decks TCG Live.
- **Social public** (fil, sondages, Vrai ou faux), messagerie, marché entre particuliers, annuaire de boutiques.
- **Quêtes, XP, séries de connexion et saisons**, en version « entre potes » si l'envie vient.

### 11.4 À ne pas reproduire

- Le modèle freemium (paywalls, quotas, essais), les concours, le Clipping, le programme créateur et l'affiliation.
- Le nom, le logo, le vocabulaire maison (« farde », « Bourse du matin », « Ton jour », « Poké »…), les textes et les visuels de PokéItem.
- Aspirer leurs données ou appeler leur API.

### 11.5 Données : sources publiques possibles pour notre app

- **Cardmarket, guide des prix public quotidien (Pokémon)** [S39] : un fichier JSON d'environ 16 Mo, mis à jour chaque nuit (vérifié le 17/11 à 01:51 UTC). Il donne pour chaque produit les champs `low`, `trend`, `avg1`, `avg7`, `avg30` et leurs équivalents `-holo` (la version reverse pour Pokémon, supposé). confirmé [S39]
  - Ce guide ne semble **pas ventilé par langue**. Le prix par langue, qui fait la force de PokéItem, demandera une autre source (annonces par langue, ventes eBay via l'API officielle, ou saisie). supposé
- **Cardmarket, catalogue public des scellés Pokémon** [S40] : 5 117 produits répartis en 11 catégories (Box Set 1 123, Booster 797, Coins 698, Display 626, Tins 573, Theme Decks 560, Blisters 498, ETB 171, PCG Set 30, Lot 28, Trainer Kits 13). confirmé [S40]
  - Il n'existe pas de catégorie demi-display, tripack, bundle ou UPC : il faudra notre propre sous-typage, à partir du nom du produit. supposé
- **TCGdex** [S41] : une API gratuite et multilingue, avec les noms FR, les variantes (normale, reverse, holo, 1re édition) et les prix Cardmarket et TCGplayer intégrés (vérifié sur une carte FR le 17/11). confirmé [S41]
- Les conditions d'utilisation des fichiers Cardmarket restent à vérifier avant un usage hors du cercle privé. supposé

---

## 12. Limites de cette recherche

- **Bloqués ou non lisibles sans compte** : X/Twitter (HTTP 402), Instagram et TikTok (contenu non rendu), contenu du Discord (seul le nombre de membres est public). Je n'ai pas réessayé.
- **Introuvables** : aucun fil Reddit, aucun forum, aucun article de presse indépendant. La page presse de PokéItem n'en cite aucun.
- **Rendu partiel** : la fiche Google Play s'est mal affichée dans l'outil de lecture. Les avis ont été extraits du HTML public de la page. Les réponses du développeur attribuées aux avis de Lucie G., Aglaope et Aurélien C. sont incertaines, et je ne les ai pas utilisées.
- **Page manquante** : la page « extension navigateur » du site renvoie une erreur 404. J'ai utilisé la FAQ à la place.
- **Captures** : les captures App Store sont présentées par l'éditeur comme des exemples d'interface. Elles datent de la fin octobre (1.3.0 ou 1.3.1) : la navigation a changé en 1.3.4.
- **Non vérifiable sans installer l'app** : les périodes exactes du graphique d'une carte, le contenu des « statistiques avancées », les champs exacts des annonces du Marché et la présence d'un champ « date d'achat ». C'est indiqué « supposé » dans le texte.

---

## Sources

| Id | Source | URL |
|---|---|---|
| S1 | Fiche App Store FR (description, historique des versions, captures, avis) | https://apps.apple.com/fr/app/pok%C3%A9item-cartes-items/id6764374425 |
| S2 | Site officiel, accueil (fonctions, tarifs, maquettes, témoignages) | https://www.pokeitem.fr/ |
| S3 | FAQ (36 questions) | https://www.pokeitem.fr/faq |
| S4 | Méthode de calcul des prix | https://www.pokeitem.fr/methode-prix |
| S5 | Page tarifs de l'app web | https://app.pokeitem.fr/pricing |
| S6 | Guide « application collection Pokémon » | https://www.pokeitem.fr/application-collection-pokemon |
| S7 | Guide scanner de cartes | https://www.pokeitem.fr/scanner-cartes-pokemon |
| S8 | Guide scan de page de classeur | https://www.pokeitem.fr/scanner-classeur-pokemon |
| S9 | Guide produits scellés | https://www.pokeitem.fr/produits-pokemon-scelles |
| S10 | Guide valeur de collection | https://www.pokeitem.fr/valeur-collection-pokemon |
| S11 | Guide cartes gradées | https://www.pokeitem.fr/cartes-pokemon-gradees |
| S12 | Guide prix des cartes | https://www.pokeitem.fr/prix-cartes-pokemon |
| S13 | PokéItem et Cardmarket | https://www.pokeitem.fr/pokeitem-et-cardmarket |
| S14 | Guide cartes japonaises | https://www.pokeitem.fr/cartes-pokemon-japonaises |
| S15 | Comparatif d'apps (rédigé par PokéItem) | https://www.pokeitem.fr/comparatif-applications-cartes-pokemon |
| S16 | Roadmap et versions livrées | https://www.pokeitem.fr/about/roadmap |
| S17 | À propos | https://www.pokeitem.fr/about |
| S18 | Équipe | https://www.pokeitem.fr/about/team |
| S19 | Presse (chiffres clés au 06/11/2026) | https://www.pokeitem.fr/presse |
| S20 | CGU | https://www.pokeitem.fr/cgu |
| S21 | CGV | https://www.pokeitem.fr/cgv |
| S22 | Politique de confidentialité (sous-traitants, publicité, données) | https://www.pokeitem.fr/politique-confidentialite |
| S23 | Règlement des quêtes et saisons | https://www.pokeitem.fr/jeux-concours |
| S24 | Assistant IA (MCP) | https://www.pokeitem.fr/assistant-ia |
| S25 | Blog : v2 (prix par état, scanner 2.0) | https://www.pokeitem.fr/blog/pokeitem-v2-mise-a-jour-prix-scanner-securite |
| S26 | Blog : 1.1.9 (hors ligne, alertes eBay, recherche) | https://www.pokeitem.fr/blog/pokeitem-1-1-9-mode-hors-ligne-alertes-ebay-recherche |
| S27 | Blog : 1.2.0 (social, marché, boutiques, messagerie) | https://www.pokeitem.fr/blog/pokeitem-1-2-0-social-marche-boutiques-messagerie |
| S28 | Blog : 1.2.1 (One Piece, quêtes, Premium+) | https://www.pokeitem.fr/blog/pokeitem-1-2-1-one-piece-quetes-premium-plus |
| S29 | Blog : 1.2.7 (Pokédex, holo, fardes, récapitulatif depuis la 1.2.1) | https://www.pokeitem.fr/blog/pokeitem-1-2-7-pokedex-effet-holo-fardes |
| S30 | Blog : 1.3.0 (widgets, classeurs guidés) | https://www.pokeitem.fr/blog/pokeitem-1-3-0-widgets-classeurs-yu-gi-oh-dragon-ball-z |
| S31 | Centre d'aide de l'app web | https://app.pokeitem.fr/aide |
| S32 | Exemple de fiche carte publique | https://app.pokeitem.fr/carte/tenebres-embrasees/19-dracaufeu-v |
| S33 | Fiche Google Play (note, avis, absence de « Contient des annonces ») | https://play.google.com/store/apps/details?id=fr.pokeitem.app&hl=fr |
| S34 | Avis App Store Belgique | https://apps.apple.com/be/app/pok%C3%A9item-cartes-items/id6764374425?see-all=reviews |
| S35 | TrustMRR (revenus vérifiés via RevenueCat) | https://trustmrr.com/startup/pokeitem |
| S36 | Chaîne YouTube | https://www.youtube.com/@pokeitem |
| S37 | Invitation Discord publique | https://discord.gg/pokeitem |
| S38 | Données publiques App Store (note, nombre de notes, captures) | https://itunes.apple.com/lookup?id=6764374425&country=fr |
| S39 | Cardmarket : guide des prix public (Pokémon) | https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json |
| S40 | Cardmarket : catalogue public des scellés (Pokémon) | https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json |
| S41 | TCGdex : exemple de carte FR avec prix | https://api.tcgdex.net/v2/fr/cards/sv03.5-199 |

[S1]: https://apps.apple.com/fr/app/pok%C3%A9item-cartes-items/id6764374425
[S2]: https://www.pokeitem.fr/
[S3]: https://www.pokeitem.fr/faq
[S4]: https://www.pokeitem.fr/methode-prix
[S5]: https://app.pokeitem.fr/pricing
[S6]: https://www.pokeitem.fr/application-collection-pokemon
[S7]: https://www.pokeitem.fr/scanner-cartes-pokemon
[S8]: https://www.pokeitem.fr/scanner-classeur-pokemon
[S9]: https://www.pokeitem.fr/produits-pokemon-scelles
[S10]: https://www.pokeitem.fr/valeur-collection-pokemon
[S11]: https://www.pokeitem.fr/cartes-pokemon-gradees
[S12]: https://www.pokeitem.fr/prix-cartes-pokemon
[S13]: https://www.pokeitem.fr/pokeitem-et-cardmarket
[S14]: https://www.pokeitem.fr/cartes-pokemon-japonaises
[S15]: https://www.pokeitem.fr/comparatif-applications-cartes-pokemon
[S16]: https://www.pokeitem.fr/about/roadmap
[S17]: https://www.pokeitem.fr/about
[S18]: https://www.pokeitem.fr/about/team
[S19]: https://www.pokeitem.fr/presse
[S20]: https://www.pokeitem.fr/cgu
[S21]: https://www.pokeitem.fr/cgv
[S22]: https://www.pokeitem.fr/politique-confidentialite
[S23]: https://www.pokeitem.fr/jeux-concours
[S24]: https://www.pokeitem.fr/assistant-ia
[S25]: https://www.pokeitem.fr/blog/pokeitem-v2-mise-a-jour-prix-scanner-securite
[S26]: https://www.pokeitem.fr/blog/pokeitem-1-1-9-mode-hors-ligne-alertes-ebay-recherche
[S27]: https://www.pokeitem.fr/blog/pokeitem-1-2-0-social-marche-boutiques-messagerie
[S28]: https://www.pokeitem.fr/blog/pokeitem-1-2-1-one-piece-quetes-premium-plus
[S29]: https://www.pokeitem.fr/blog/pokeitem-1-2-7-pokedex-effet-holo-fardes
[S30]: https://www.pokeitem.fr/blog/pokeitem-1-3-0-widgets-classeurs-yu-gi-oh-dragon-ball-z
[S31]: https://app.pokeitem.fr/aide
[S32]: https://app.pokeitem.fr/carte/tenebres-embrasees/19-dracaufeu-v
[S33]: https://play.google.com/store/apps/details?id=fr.pokeitem.app&hl=fr
[S34]: https://apps.apple.com/be/app/pok%C3%A9item-cartes-items/id6764374425?see-all=reviews
[S35]: https://trustmrr.com/startup/pokeitem
[S36]: https://www.youtube.com/@pokeitem
[S37]: https://discord.gg/pokeitem
[S38]: https://itunes.apple.com/lookup?id=6764374425&country=fr
[S39]: https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json
[S40]: https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json
[S41]: https://api.tcgdex.net/v2/fr/cards/sv03.5-199
