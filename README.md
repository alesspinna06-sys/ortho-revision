# Ortho Révision 🧠

Application de bureau **macOS & Windows** d'aide aux révisions des cours d'orthophonie.
Importe tes cours (PowerPoint, Word, Excel, PDF, photos), et l'IA **Google Gemini** génère automatiquement :

- 📄 **Fiches de synthèse** structurées, termes clés **surlignés** + glossaire
- 🃏 **Flashcards** recto/verso avec **répétition espacée** (algorithme type Anki)
- ✅ **QCM et cas cliniques** corrigés et justifiés, avec questions **transversales** entre les cours

Tout est enregistré **localement** sur l'ordinateur (IndexedDB). Rien n'est envoyé ailleurs que vers Gemini, au moment de la génération.

---

## 1. Installation (à faire une seule fois)

### Prérequis

| | macOS | Windows |
|---|---|---|
| Système | **macOS 10.15 Catalina ou plus récent** (Intel ou Apple Silicon) | Windows 10 / 11 (64 bits) |
| Node.js | **Node.js 20 LTS** → https://nodejs.org (fichier « macOS Installer .pkg ») | **Node.js 20 LTS** → https://nodejs.org (fichier « Windows Installer .msi ») |

> 💡 Sur un ancien Mac, prends bien la version **20 LTS** de Node.js (les versions 22+ exigent macOS 11).
> Pour connaître ta version de macOS : menu  › « À propos de ce Mac ».

### Étapes

1. **Décompresse** le dossier `ortho-revision` (par exemple dans `Documents`).
2. **Ouvre un terminal dans ce dossier** :
   - **Mac** : ouvre l'app *Terminal*, tape `cd ` (avec un espace), glisse le dossier `ortho-revision` dans la fenêtre, puis appuie sur Entrée.
   - **Windows** : ouvre le dossier dans l'Explorateur, clique dans la barre d'adresse, tape `cmd` puis Entrée.
3. **Installe les dépendances** (2–5 minutes, connexion Internet requise) :
   ```bash
   npm install
   ```
4. **Lance l'application** :
   ```bash
   npm start
   ```
   La fenêtre *Ortho Révision* s'ouvre. 🎉

Pour la relancer plus tard : refais l'étape 2 puis `npm start`… ou mieux, crée une vraie application (section 3).

---

## 2. 🔑 Où mettre la clé API Gemini

La clé est **gratuite** :

1. Va sur **https://aistudio.google.com/apikey** et connecte-toi avec un compte Google.
2. Clique sur **« Create API key »** et copie la clé (elle commence par `AIza…`).
3. Dans l'application : **Réglages › Intelligence artificielle › Clé API Google Gemini** → colle la clé → **Enregistrer** → **Tester la connexion**.

La clé est **chiffrée** avec le trousseau du système (Trousseau macOS / DPAPI Windows) et stockée dans
`~/Library/Application Support/Ortho Révision/config.json` (Mac) ou `%APPDATA%\Ortho Révision\config.json` (Windows).
Elle ne transite jamais par l'interface : seul le processus principal (`electron/gemini.cjs`) l'utilise.

**Alternative pour développeur** : définir la variable d'environnement `GEMINI_API_KEY` avant de lancer
(`GEMINI_API_KEY=AIza... npm start` sur Mac, `set GEMINI_API_KEY=AIza... && npm start` sur Windows). Elle est prioritaire sur la clé enregistrée.

**Modèle** : par défaut `gemini-flash-latest` (alias Google qui pointe toujours vers le dernier modèle Flash, inclus dans l'offre gratuite).
Le bouton ⟳ à côté du choix du modèle liste les modèles disponibles sur ton compte. Si tu atteins la limite gratuite (message « Quota atteint »), patiente une minute ou passe sur « Flash-Lite ».

---

## 3. Créer une vraie application (icône dans le Dock / menu Démarrer)

### Sur le Mac
```bash
npm run dist:mac
```
→ deux fichiers sont créés dans `release/` : `Ortho Revision-1.0.0-x64.dmg` (processeur **Intel**) et `…-arm64.dmg` (Apple Silicon M1/M2…). Ouvre celui qui correspond à ton Mac et glisse l'app dans *Applications*.
Ancien Mac = processeur **Intel** → prends le `-x64.dmg` (menu  › « À propos de ce Mac » › *Processeur*).

**Premier lancement** : l'app n'est pas signée par Apple, macOS va la bloquer.
→ Fais **clic droit › Ouvrir › Ouvrir**. Sur macOS 15 Sequoia : **Réglages Système › Confidentialité et sécurité › « Ouvrir quand même »**.
Si macOS indique que l'app « est endommagée », tape dans le Terminal : `xattr -cr "/Applications/Ortho Revision.app"` puis relance-la.

### Sur Windows
```bash
npm run dist:win
```
→ `release/Ortho Revision Setup 1.0.0.exe`. Double-clique pour installer (raccourci Bureau créé).
Si Windows SmartScreen s'affiche : **Informations complémentaires › Exécuter quand même**.

> Chaque installateur doit être construit **sur son système** (le `.dmg` sur un Mac, le `.exe` sur un PC).
> Astuce : en publiant le projet sur GitHub, le fichier `.github/workflows/build.yml` fabrique **les deux** automatiquement (onglet *Actions › Build installers › Run workflow*).

---

## 4. Utilisation

| Fonction | Comment |
|---|---|
| **Importer un fichier** | *Importer* → glisse PowerPoint (.pptx), Word (.docx), Excel (.xlsx), PDF, .txt/.md/.csv. Plusieurs fichiers à la fois possibles. |
| **Photo depuis le téléphone** | *Importer › Depuis mon téléphone* → scanne le QR code avec l'appareil photo du téléphone → photographie les pages → elles arrivent dans l'app → **Transformer en cours**. Le téléphone et l'ordinateur doivent être sur le **même Wi-Fi**. Au 1ᵉʳ usage, accepte la demande du pare-feu (macOS : « Autoriser » ; Windows : cocher *Réseaux privés*). |
| **Photos / scans déjà sur l'ordi** | *Importer › Importer des photos* (JPEG, PNG, HEIC…). L'ordre des pages se règle avec les flèches. |
| **PDF scanné** | Détecté automatiquement → lu par l'OCR de Gemini. |
| **Corriger l'OCR** | Page du cours › *Texte source* → corrige → *Enregistrer et régénérer*. |
| **Flashcards** | Espace = retourner · touches 1-4 = À revoir / Difficile / Bien / Facile. Les cartes reviennent au bon moment. |
| **QCM** | Lettres A-E pour cocher, Entrée pour valider. Mode « Mes erreurs » pour retravailler les questions ratées. |
| **Mise à jour dynamique** | Chaque nouveau cours enrichit le stock global de cartes et de questions, et génère des **cas cliniques transversaux** reliant ce cours aux précédents. |
| **Sauvegarde** | *Réglages › Données › Exporter* (fichier .json à garder sur une clé USB / le cloud). |
| **Dossiers** | *Mes cours › Nouveau dossier* : choisis un nom et une couleur. Range un cours avec le menu « Dossier » de sa carte (ou depuis la page du cours). Le dossier se renomme, change de couleur ou se supprime : ses cours ne sont **pas** supprimés, ils reviennent à la racine. |
| **Réviser par dossier** | Ouvre un dossier → **Flashcards du dossier** ou **QCM du dossier** : seules les cartes et questions de ce dossier sont proposées. |
| **Schémas dans la fiche** | Les schémas des PowerPoint, Word, PDF et photos sont envoyés à l'IA, qui les **recrée** en graphique dans la fiche. Pour un cours importé avant cette version : page du cours › **Ajouter les schémas** › choisis le fichier d'origine. Seule la fiche est refaite, les flashcards et ta progression sont gardées. Schémas dessinés avec les formes de PowerPoint : enregistre la présentation en PDF (moins de 6 Mo) et ajoute ce PDF. |
| **Définitions au survol** | Dans la fiche, survole un mot surligné (ou clique dessus pour le garder affiché) : sa définition apparaît sans descendre au glossaire. |
| **Cours similaires** | *Mes cours › Cours similaires* : l'application repère les cours qui se ressemblent (analyse locale, sans IA). Pour chaque groupe : **Fusionner** (un seul cours ; flashcards avec leur progression, QCM et schémas regroupés, doublons retirés, fiche réécrite), **Ranger dans un dossier**, ou **Ignorer**. La fusion est définitive : exporte une sauvegarde avant en cas de doute. |
| **Générer des schémas** | Fiche › *Générer des schémas* : l'IA **propose** des schémas tirés du cours (un clic suffit), ou tu choisis jusqu'à 4 **termes surlignés** (un schéma par terme), ou tu écris ta consigne. Chaque schéma est **placé dans la partie du cours** qu'il concerne. Chaque cours généré contient aussi 4 à 8 schémas de base, même sans image d'origine. |
| **Approfondir** | Onglet *Approfondir* : notions développées, compléments, pièges fréquents et, en option, **actualités récentes trouvées par la recherche Google**, avec leurs sources cliquables. Si ton compte Gemini n'a pas accès à la recherche, l'approfondissement est fait sans actualités et l'app le signale. |
| **Recherche** | Bouton *Rechercher* en haut du menu, ou **⌘K** (Mac) / **Ctrl+K** (Windows) : une notion, un auteur, un mot, dans toutes les fiches, les textes des cours, les flashcards et les QCM. |
| **Questions sur un cours** | Onglet *Questions* d'un cours : pose ta question, Gemini répond à partir du cours (et signale quand il le complète). Bouton *En faire une flashcard* sous chaque réponse. |
| **Explique-moi autrement** | Dans un QCM, après avoir validé : une autre explication, adaptée à ton erreur. |
| **Écouter / PDF** | Dans la fiche : *Écouter* la lit avec la voix de l'ordinateur (gratuit, sans internet, vitesse réglable) ; *PDF* l'enregistre avec ses schémas et le glossaire, pour l'imprimer. |
| **Cours complet** | L'onglet *Cours* contient la **retranscription détaillée** de tout le cours : rien n'est résumé, les phrases des diapositives sont rédigées, et un long cours donne un long texte (il est rédigé partie par partie). Un **sommaire** permet d'aller à chaque partie, et *À retenir* reste à la fin. Pour un cours importé avant cette version : *Régénérer* (flashcards et QCM conservés). |
| **Taille du texte et zoom** | En haut de chaque cours : **A− · 100 % · A+** (de 80 à 200 %), aussi avec **⌘/Ctrl +**, **⌘/Ctrl −** et **⌘/Ctrl 0**. La taille s'applique au cours, aux définitions, aux questions et aux flashcards, et elle est gardée. Clique sur un schéma pour l'**agrandir** et zoomer dedans (boutons, touches + et −, ou ⌘/Ctrl + molette). |
| **Ranger le menu** | Bouton *Ranger le menu* en bas du menu de gauche, bouton ⤢ en haut de chaque cours, ou **⌘/Ctrl B** : le menu devient une fine colonne d'icônes (leur nom s'affiche au survol) et le cours prend toute la largeur. Même geste pour le réafficher. Le choix est gardé. |
| **Changer un schéma** | Bouton *Changer le schéma* sous chaque schéma : **redessiner** par l'IA, **dessin par IA** (image, à vérifier ; peut demander une clé Gemini avec facturation), ou **image libre de droits** de Wikimédia Commons (idées de recherche proposées, ou recherche dans le navigateur puis *Importer*). La source et la licence restent affichées sous l'image. |
| **Synthèses** | Menu *Synthèses* : une page de révision par cours (l'essentiel, notions clés, liens et confusions, pièges), créée automatiquement à chaque génération du cours. *Régénérer* pour la refaire. |
| **Mots importants** | Dans le cours, **sélectionne un mot** → *Surligner ce mot* → écris sa définition (ou *Rédiger avec l'IA*) → il est surligné, ajouté au glossaire et transformé en **flashcard**. La croix dans le glossaire le retire. |
| **Sommaire repliable** | La petite flèche *▾ Sommaire* au-dessus du cours le replie ou le déplie ; le choix est gardé. |
| **Statistiques** | Menu *Statistiques* : série de jours, cartes maîtrisées, réussite aux QCM par dossier, scores des dernières séances, questions les plus ratées, et boutons pour **réviser tes points faibles**. |
| **Réviser sur le téléphone** | *Flashcards › Sur mon téléphone* (ou depuis un cours) : scanne le QR code, révise sur le téléphone, ta progression s'enregistre sur l'ordinateur carte par carte. Même Wi-Fi, et garde la fenêtre ouverte pendant la séance. |
| **Sauvegarde automatique et corbeille** | *Réglages › Sauvegardes et corbeille* : une copie complète chaque jour dans le dossier de ton choix (les 10 dernières sont gardées ; choisis iCloud Drive ou OneDrive pour l'avoir aussi en ligne). Un cours supprimé ou une fusion se récupère pendant 30 jours. |
| **Schémas à trous** | Fiche › *Schémas à trous* : les étiquettes des schémas sont remplacées par des numéros, retrouve-les (fautes de frappe et accents tolérés ; aide « mots mélangés »). |
| **Patient simulé** | Menu *Patient simulé* : un cas tiré de tes cours. Tu mènes l'anamnèse (le patient ou sa famille répond avec ses mots), tu proposes un bilan et reçois les résultats, puis tu rends ton hypothèse et ton projet thérapeutique : note sur 20 et cas complet expliqué. |
| **Tests de bilan** | Menu *Tests de bilan* › *Mettre à jour depuis mes cours* : une fiche par test cité dans tes cours (âges, ce qu'il évalue, épreuves, cours d'origine). Rien n'est inventé : un champ absent du cours reste vide. |
| **Phonétique** | Menu *Phonétique* : 100 mots à transcrire en API (ou l'inverse), avec clavier de symboles et correction immédiate. Les variantes admises (/a/ pour /ɑ/, schwa muet, r pour ʁ…) sont acceptées et signalées. Sans IA, sans internet. |

**Ancien Mac** : le *Mode performance* (Réglages › Apparence) supprime les effets de flou. Il s'active tout seul sur les machines à 4 cœurs ou moins.

---

## 5. Architecture

```
ortho-revision/
├── package.json              Dépendances, scripts, config des installateurs (electron-builder)
├── vite.config.mjs           Build de l'interface (+ politique de sécurité CSP)
├── index.html
├── build/icon.png            Icône de l'application
├── electron/                 ── Processus principal (Node.js) ──
│   ├── main.cjs              Fenêtre, sécurité, stockage chiffré de la clé, IPC
│   ├── preload.cjs           Pont sécurisé exposé à l'interface (window.api)
│   ├── gemini.cjs            Appels REST à l'API Gemini (sortie JSON structurée, reprises auto)
│   ├── phoneServer.cjs       Mini-serveur Wi-Fi protégé par jeton pour recevoir les photos
│   └── mobilePage.cjs        Page web affichée sur le téléphone (redimensionne, convertit HEIC)
└── src/                      ── Interface React ──
    ├── main.jsx / App.jsx    Démarrage, navigation, barre latérale
    ├── styles/global.css     Design « Liquid Glass » (thèmes clair/sombre, mode léger)
    ├── lib/
    │   ├── ai.js             Prompts orthophonie + schémas JSON (fiche, cartes, QCM, cas, OCR)
    │   ├── jobs.js           File d'attente IA (une génération à la fois)
    │   ├── extract.js        Extraction pptx / docx / xlsx / pdf / rtf / txt + compression d'images
    │   ├── db.js, idb-lite.js  Base locale IndexedDB (cours, cartes, questions, historique)
    │   ├── srs.js            Répétition espacée (SM-2) + série de jours
    │   ├── pick.js           Sélection intelligente des questions/cartes
    │   ├── markdown.js       Rendu Markdown sécurisé (==surlignage==)
    │   ├── settings.jsx      Réglages + thème
    │   └── bridge.js         Accès à window.api (avec repli « navigateur »)
    ├── components/           Icônes, sessions Flashcards & QCM, QR code, toasts…
    └── views/                Accueil, Mes cours, Importer, Cours, Flashcards, QCM, Réglages
```

**Choix pour un ancien Mac** : Electron 32 (dernière version compatible macOS 10.15), aucune librairie d'interface lourde (CSS fait main, icônes SVG en ligne),
bibliothèques d'import chargées **à la demande**, flou limité à 2 surfaces, animations uniquement sur `transform`/`opacity`, une seule requête IA à la fois, images compressées avant envoi.
Si ton Mac est sous macOS 11 ou plus récent, tu peux passer à une version récente d'Electron : `npm install electron@latest --save-dev`.

### Commandes utiles
| Commande | Effet |
|---|---|
| `npm start` | Compile et lance l'application |
| `npm run dev` | Mode développement avec rechargement à chaud |
| `npm run web` | Interface seule dans le navigateur (http://localhost:5173, sans l'envoi téléphone) |
| `npm run dist:mac` / `dist:win` | Fabrique l'installateur |

### Dépannage
- **`npm install` échoue sur `xlsx`** : remplace dans `package.json` la ligne `"xlsx": "https://cdn.sheetjs.com/…"` par `"xlsx": "^0.18.5"` puis relance `npm install`.
- **Windows : `Cannot create symbolic link : Le client ne dispose pas d'un privilège nécessaire`** pendant `npm run dist:win` :
  active le **Mode développeur** (Paramètres › Confidentialité et sécurité › Pour les développeurs › *Mode développeur* : Activé), ferme le terminal, puis supprime le dossier `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` et relance `npm run dist:win`. Autre solution : lancer le terminal **en tant qu'administrateur**.
- **« Modèle introuvable »** : Réglages › bouton ⟳ à côté du modèle, puis choisis un modèle *Flash* de la liste.
- **Le téléphone n'arrive pas à ouvrir le lien** : vérifie le même Wi-Fi (pas le réseau « invités »), et que le pare-feu autorise *Ortho Révision*.
- **Où sont mes données ?** Dans le profil de l'application (`~/Library/Application Support/Ortho Révision` ou `%APPDATA%\Ortho Révision`). Pense à *Exporter* régulièrement.
- **Windows : l'installeur ne s'ouvre pas (Smart App Control)** : l'installeur n'est pas signé numériquement. Désactive Smart App Control (Sécurité Windows › Contrôle des applications et du navigateur) ou signe l'installeur. S'il pèse moins de 1 Mo, il est incomplet : supprime `release` puis relance `npm install` et `npm run dist:win`.
- **La fenêtre ne s'affiche pas** (processus actif mais rien à l'écran) : corrigé depuis le 9 octobre 2026, l'accélération graphique est désactivée dans l'application.

## Ajouts du 14 octobre 2026
- **Cours acquis** : case ronde sur chaque carte de cours, bouton « Marquer acquis » dans le cours, filtre « Tous / À réviser / Acquis » dans Mes cours. Champs `acquired` et `acquiredAt` du cours.
- **Temps passé** (`src/lib/usage.js`, `src/components/TimeStats.jsx`) : seul le temps actif est compté (fenêtre visible et au premier plan, action dans les 3 dernières minutes). Enregistré par jour dans le store `history` (type `time`, champs `total`, `byCourse`, `byView`, `byTab`), donc inclus dans les sauvegardes. Page Statistiques : temps du jour / 7 jours / total, cours acquis, graphique des 14 derniers jours, temps par cours (alerte « ×2,4 la moyenne »), répartition par partie de l'application et par onglet de cours, liste « À reprendre ». Bouton « Remettre à zéro ».
- **Définitions via internet** (`defineTerm` dans `src/lib/ai-extra.js`, `electron/lookup.cjs`) : extraits Wikipédia (titre exact avec redirections, puis recherche) + Gemini avec recherche Google, en donnant les passages du cours pour choisir le bon sens. Repli : Wikipédia seul, puis Gemini sans recherche, puis message clair. La recherche part toute seule à l'ouverture de la fenêtre « Mot important », les sources sont affichées et enregistrées (`keyTerms[].sources`).

## Ajouts du 21 octobre 2026
- **Synthèse à portée de main** (`src/components/SynthesisDrawer.jsx`) : panneau latéral à droite, ouvert par le bouton « Synthèse » de l'en-tête du cours (le cours se décale sur grand écran pour lire les deux côte à côte ; Échap ferme) ou par le bouton « Synthèse » de chaque carte de cours (liste et dossiers, avec « Ouvrir le cours »). Taille du texte, « Régénérer », « Créer la synthèse » si elle manque. Pastille orange sur le bouton quand la synthèse n'existe pas encore.
- **Synthèses rangées par dossier** : la page Synthèses regroupe les synthèses par dossier (comme les cours), avec filtre par dossier ; bouton « Synthèses du dossier » dans chaque dossier (`go('syntheses', { folderId })`).
- **Synthèse en grand ou sur le côté** (21 octobre, suite) : bouton « Synthèse » en dégradé bien visible dans l'en-tête du cours, en trois parties (ouvrir avec le dernier choix / sur le côté / en grand). Dans le panneau, « En grand » ⇄ « Sur le côté » ; le dernier choix est retenu (`localStorage` `synth-wide`).
- **Synthèse en pleine page** (21 octobre, suite 2) : le bouton « Synthèse » du cours (partie principale) et celui des cartes de cours ouvrent la synthèse en pleine page dans le menu Synthèses (`go('syntheses', { id })`, `SynthesisPage` dans `SynthesesView.jsx`) : retour vers la liste (filtrée sur le dossier), taille du texte, PDF, Régénérer, « Avec le cours » (ouvre le cours avec la synthèse sur le côté, `go('course', { id, synthesis: 'side' })`), « Ouvrir le cours ». Les deux petits boutons à droite du bouton Synthèse gardent le panneau sur le côté et la fenêtre par-dessus le cours. Dans la liste : titre cliquable, « Lire en grand », « Aperçu » (dépliage sur place).
- **⤢ = pleine page** (21 octobre, suite 3) : la fenêtre par-dessus le cours est supprimée. Le bouton ⤢ du cours et « En grand » du panneau latéral ouvrent la synthèse en pleine page (menu Synthèses). Restent : partie principale « Synthèse » et ⤢ → pleine page ; ▯ → panneau sur le côté.
- **Synthèses : plein écran et rangement** (24 octobre) : sur la page d'une synthèse, bouton « Plein écran » (range le menu, la page prend toute la largeur ; ⌘/Ctrl B). Dans le menu Synthèses, les synthèses sont groupées comme les cours : par dossier, et un cours **sans dossier est rangé selon sa catégorie** (champ matière, ex. « Regards croisés »), qui fait office de dossier (puces de filtre `cat:<matière>`).
- **Synthèses détaillées** (24 octobre) : `generateSynthesis(course, onProgress)` ne fait plus « une page » mais une version condensée d'environ un tiers du cours, qui suit son plan (titres ## et ###) et garde pour chaque notion définition, explication, contexte et exemple(s) ; exemples ajoutés par l'IA seulement s'ils manquent, signalés « (exemple ajouté) », jamais de chiffre ni de référence inventés. Corps rédigé par parties de ~24 000 caractères (`splitCourse`), puis un appel à schéma (`essentiel`, `liens`, `pieges`) : « L'essentiel » en tête, « Liens et confusions » et « Pièges fréquents » à la fin. Le cours complet est envoyé en entier (plus de coupure à 20 000 caractères). Champ `synthesisV: 2` ; les anciennes synthèses portent un badge « ancienne version », un bandeau sur leur page, et un bouton « Mettre à jour N anciennes synthèses » dans le menu Synthèses. Sommaire cliquable sur la page d'une synthèse.

## Ajouts du 27 octobre 2026 — cours complété
- Réglage **« Compléter le cours »** (`completeCourse`, actif par défaut, Réglages › IA). Étape B de `generateFullCourse` : orthographe et grammaire corrigées ; phrases laissées en suspens terminées ; rubriques vides (« Conclusion : »…) rédigées ; questions et exercices du cours suivis de leur réponse. Consigne dans `completeRules()` (avec le début de la partie suivante pour ne pas « compléter » une coupure du découpage).
- **Marquage** des ajouts : `{+ … +}` dans une phrase, lignes `>+ ` pour un paragraphe ou une réponse. Rendu (`markdown.js`) : surlignage violet pointillé et encadré « Complété par l'IA » ; `speakable()` retire les marques.
- **Étape C — relecture** (`reviewAdditions`) : pour chaque partie qui contient des ajouts, un appel à schéma (`fixes: [{id, text}]`) relit seulement les ajouts face au texte d'origine (exactitude, cohérence, justesse des réponses, orthographe) et corrige ou supprime les mauvais. En cas d'échec (hors quota/clé), la version non relue est gardée.
- Les anciens cours doivent être régénérés (« Régénérer ») pour être complétés.

## Ajouts du 29 octobre 2026 — sommaire dynamique et marque-pages
- `src/components/CourseMarks.jsx` : **marque-pages / notes de couleur** (6 couleurs, note facultative) stockés dans `course.marks[{id, color, note, quote, blockText, heading, createdAt}]`. Ancrage par citation + début du paragraphe + id du titre : retrouvé après une régénération (sinon rangé dans « Passage introuvable »). Rendu sans toucher au texte : surlignage par l'API CSS Custom Highlight (`::highlight(mk-<couleur>)`) et drapeau `.mk-flag` dans la marge (clic = modifier). Création : sélection dans le cours → barre `.sel-bar` (« Surligner ce mot » si ≤ 60 caractères, « Marque-page » jusqu'à 400) ; ou « Marque-page ici » (premier paragraphe visible).
- **Sommaire dynamique** `TocRail` : poignée sur le bord droit (badge = nombre de marque-pages), panneau qui s'ouvre au survol du bord droit, partie en cours surlignée (suivi du défilement), marque-pages sous leur partie, filtre par couleur, épingle (clé `toc-pin`, le cours se décale de 340 px sur grand écran, classe `html.toc-side`). Caché quand la synthèse est ouverte sur le côté.

## Ajouts du 29 octobre 2026 (suite) — apparence des cours
- Réglages › **Apparence des cours** (`src/lib/courseStyle.js`, réglages `courseStyle` sobre|cahier|moderne, `paper` carreaux|seyes, `colorLevel` discret|normal|vif) avec aperçus en direct (`DOMAIN.styleSample`). Classes posées sur la feuille du cours (`sheetClass()` → `.course-sheet.cs-*.paper-*.cl-*`) : cours, page de synthèse, panneau de synthèse. Styles dans **`src/styles/course-styles.css`** (fichier commun).
- **Étiquettes de couleur** (`TAG_RULES` dans `ai-extra.js`, ajoutées aux consignes du cours et de la synthèse) : lignes `>[def]`, `>[ex]`, `>[retenir]`, `>[piege]`, `>[methode]` → encadrés `.callout.c-*` ; `@@auteur, test, œuvre@@` → `.t-who` ; `^^date, chiffre^^` → `.t-num`. Repérage automatique sans IA pour les anciens cours (`markdown.js`) : paragraphes qui commencent par « Définition : », « Exemple : », « Attention : »…, années et pourcentages, titres « À retenir / Conclusion » (`.h-key`).
- **Mettre en couleurs** (`colorizeCourse`, tâche `colorize` dans `EXTRAS`) : ajoute les étiquettes à un cours existant partie par partie ; chaque partie est refusée si l'IA a changé plus de 1 % des mots (distance d'édition sur les mots). Bouton dans la barre du cours tant qu'il n'y a aucune étiquette.
- **Cahier** : papier petits carreaux ou Seyès, marge rouge, trous, polices **Kalam** (texte) et **Caveat** (titres) intégrées via `@fontsource/kalam` et `@fontsource/caveat` (importées dans `main.jsx`), surligneur fluo, encadrés « au stylo », post-it pour « À retenir », schémas scotchés ; le PDF garde le papier.
- **Moderne** (`src/components/CourseExtras.jsx`) : parties numérotées, cartes à icônes, pastilles, apparition au défilement (`.rv`/`.in`, seulement sous l'écran), parties repliables (`.fold-btn`), carte « Repères » (frise des dates, chiffres, auteurs, clic = aller au passage), barre de progression de lecture.
- Banc de test : `@fontsource/*` remplacé par un CSS vide (pas de npm dans le bac à sable) ; les captures montrent donc une police de repli.

## Ajouts du 29 octobre 2026 (fin) — recherche, palette, reprise de lecture
- **Recherche dans le cours** (`src/components/CourseFind.jsx`) : ⌘F / Ctrl F dans un cours (bascule sur l'onglet Cours), sans accents ni majuscules, surlignage par CSS Highlight (`::highlight(find)`, `find-cur`), Entrée / Maj+Entrée, Échap. Les résultats apparaissent dans le sommaire de droite (`TocRail` prop `find` : compte par partie, extraits cliquables ; le panneau reste ouvert pendant la recherche). Les parties repliées (Moderne) sont dépliées. `route.find` ouvre le cours avec la recherche déjà lancée (résultats « Cours » de la recherche globale).
- **Palette de commandes** dans `SearchModal` (⌘K) : verbes `flashcards|qcm|synthèse|cours|dossier|approfondir|texte|continuer` + nom de cours ou de dossier (`VERBS`, `bestMatches`) ; un nom de cours seul propose Ouvrir / Synthèse / Flashcards / QCM ; noms de pages (`pages` = `NAV` passé par `App.jsx`). Les commandes passent avant les résultats de contenu.
- **Reprendre la lecture** (`src/lib/readPos.js`, `src/components/ReadingResume.jsx`) : position (premier paragraphe visible, partie « ## » n° x sur y, proportion) enregistrée en continu dans `localStorage` `read-pos` ; restaurée à la réouverture du cours (bulle « Reprise là où tu t'étais arrêtée · partie 4 sur 8 », bouton « Revenir au début ») ; carte « Continuer la lecture » sur l'accueil (`lastRead`).

## Correctif du 29 octobre 2026 — fenêtre invisible sur Windows (encore)
- Symptôme : `Gpu Cache Creation failed: -2`, « Unable to move the cache: Accès refusé », aucune fenêtre ; chaque lancement laisse un processus invisible (4 trouvés), qui bloque les suivants (`requestSingleInstanceLock`). `--disable-gpu` la fait apparaître.
- `main.cjs` : sous Windows, `disable-gpu`, `disable-gpu-compositing`, `disable-gpu-shader-disk-cache` en plus de `disableHardwareAcceleration()` ; la fenêtre s'affiche aussi sur `did-finish-load` et au bout de 4 s quoi qu'il arrive ; `render-process-gone` → message + rechargement ; erreurs notées dans `journal.txt` du dossier de données.
- Dépannage : `taskkill /F /IM "CAPES SES Revision.exe"` ; l'app est installée dans `C:\Program Files\CAPES SES Revision\`.

## Ajouts du 29 octobre 2026 (soir) — fluidité, animations, palettes
- **Accélération graphique adaptative** (`main.cjs`) : GPU actif par défaut (cache disque du GPU coupé : `disable-gpu-shader-disk-cache`) ; si la fenêtre n'apparaît pas en 7 s ou si le processus GPU plante avant l'affichage → `gpu.json` `{off: true, auto: true}`, `app.relaunch()`. `--disable-gpu` en ligne de commande force aussi le mode sans GPU. IPC `gpu:info|set` ; réglage « Accélération graphique » (redémarre).
- **Animations communes** : `src/styles/motion.css` (les deux logiciels) — uniquement transform/opacity, plus aucun flou animé ni ombre animée, cascade limitée (5 éléments, 9 cartes). Niveaux par classe sur `<html>` : `motion-full` (View Transitions entre pages, cascade), `motion-light` (pas de cascade ni de transition en image ; pastilles, rebonds et fenêtres gardés), `motion-off`. Réglage `motion` auto|full|light|off ; « auto » = light en mode performance (`liteMode`, auto sur le vieux Mac) ou GPU coupé. Ortho a maintenant la pastille du menu (`App.jsx`) et des onglets (`common.jsx`, désormais identique dans les deux logiciels).
- **Palettes** (`src/lib/themes.js`, `src/styles/themes.css`, réglage `palette`) : Classique, Lavande, Sauge, Pêche (clairs), Océan, Forêt, Aurore, Minuit (sombres) ; attribut `data-palette` en plus de `data-theme` (la palette impose le mode). Nuancier dans Réglages › Apparence ; choisir Auto/Clair/Sombre revient à « Classique ».

## Correctif du 29 octobre 2026 (nuit) — tableaux de données
- `markdown.js` : vrais **tableaux Markdown** (`| … |`, ligne `|---|` facultative → `<div class="md-table">`, nombres alignés à droite) ; les **tableaux « aplatis »** des anciens cours (« Titre : Prix en € : 0,50 | 1 | 2 Quantité : 3750 | 3500 ») sont reconstruits par `flatTable()` (une ligne par « libellé : valeurs », titre devant). Aucune pastille automatique dans un tableau ou une suite « | ».
- Repérage automatique des années plus prudent (1600–2049, jamais suivi d'une unité : tonnes, €, habitants…, ni dans une donnée) — dans `markdown.js` et dans la carte « Repères » (`CourseExtras.jsx`, lignes avec « | » ignorées).
- Consignes : l'étape B recopie les tableaux de données en tableau Markdown avec leur titre ; un graphique du cours garde son titre et sa description ; l'étape A doit **recréer en SVG chaque graphique** annoncé (« Graphique 7 ») avec les données des tableaux. `TAG_RULES` : pas d'étiquette dans un tableau.
- Recherche, marque-pages et reprise de lecture comptent aussi les cellules (`td, th, .md-table-cap`). Styles `.md-table` dans `course-styles.css` (Moderne : en-têtes teintés ; Cahier : tableau au stylo).

## Ajouts du 29 octobre 2026 (nuit, suite) — images d'origine, liens, formules
- **Images du cours d'origine affichées** : à l'import, chaque image garde un repère `[Image N]` à sa place (Word : `alt` posé par `convertImage` ; PowerPoint : `a:blip r:embed` → `.rels` de la diapositive ; médias nommés « Image N »). L'étape A reçoit chaque image précédée de son repère et renvoie `figures[{image, title, caption, section}]` (photos, publicités, documents à analyser, cartes, captures… ; pas les logos ni les pages de texte photographiées). `generateFullCourse` en fait des schémas `{id: 500+i, image: dataURL, source: 'cours', credit: "Document du cours d'origine"}` placés **à la place du repère** (sinon `insertSchema` par partie) ; les repères non retenus sont retirés. L'étape B garde les repères sur une ligne seule.
- **Liens et vidéos** : `richText()` (Word), `a:hlinkClick` + `.rels` (PowerPoint : liens sur le texte et sur les formes, vidéos `videoFile`/`media` → « [▶ Vidéo](url) » ou « vidéo intégrée au diaporama »), annotations `Link` (PDF). Rendu `[texte](https://…)` → `a.ext-link` (`.is-video` pour YouTube/Vimeo/…), ouvert dans le navigateur (`setWindowOpenHandler`). Tableaux Word exportés en tableau Markdown.
- Bouton du cours « Ajouter / Relire le fichier d'origine » (ex-« Ajouter les schémas ») : remplace aussi `course.text` par le texte relu (liens, repères d'images) puis régénère.
- Étape B : un support cité mais absent → ligne `>+ Support non fourni dans le cours : …` (rien d'inventé).
- **Formules** : `src/lib/math.js` (sous-ensemble de LaTeX sans dépendance : `$…$`, `$$…$$`, `\(…\)`, `\frac`, `\sqrt`, `^`, `_`, `\text`, symboles et lettres grecques ; « 5 $ et 10 $ » reste du texte), branché dans `inline()` de `markdown.js` ; `texToSpeech()` pour « Écouter ». Consigne : formules en LaTeX entre `$`.

## Ajouts du 30 octobre 2026 — le cours plus vivant (`src/components/CourseTools.jsx`)
- **Tableaux dynamiques** (`useTableTools`, posé sur chaque `.md-table` après rendu) : tri par clic sur un en-tête (nombres compris : « 0,50 », « 3 750 »), **📈 Graphique** (SVG dessiné à partir des cellules : courbes si l'axe est numérique, barres sinon ; point de rencontre signalé quand deux courbes se croisent, ex. offre/demande), **⇄ Pivoter** (lignes ↔ colonnes), **🙈 Cacher les valeurs** (cases à retrouver, clic = montrer), **⧉ Copier** (tabulations, pour Excel/Word), surbrillance ligne et colonne.
- **🧠 Révision active** (`useCloze`, `ClozeBar`) : mots clés, gras, dates et auteurs cachés dans le cours ; clic = montrer (sans ouvrir la bulle de définition) ; compteur, « Tout montrer », « Recommencer ».
- **🖼 Images du cours** (`CourseGallery`) : toutes les images du fichier d'origine (store `media`), celles déjà dans le cours sont signalées, les autres peuvent être placées dans la partie choisie (`insertSchema`, schéma `source: 'cours'`).
- **Temps de lecture** (`readingTimes`, 200 mots/min) : puce « ≈ N min de lecture » et minutes par partie dans le sommaire de droite (`TocRail` prop `times`).
- Consignes : tableau récapitulatif ajouté (marqué « >+ Tableau récapitulatif ajouté : ») quand une partie compare ≥ 3 éléments sur plusieurs critères ; la synthèse peut résumer une comparaison en tableau. Images des schémas en `loading="lazy"`.

## Ajouts du 30 octobre 2026 (soir) — repères manuels, cahier plus lisible
- **Repères manuels** : plus aucune détection automatique. Sélection d'un mot (≤ 60 caractères) → bouton « 🎯 Repère » de la barre `.sel-bar` → `RepereDialog` (type date / chiffre clé / auteur, libellé, « ce qu'il faut retenir » pré-rempli avec la phrase) → `course.reperes[{id, kind, label, text, blockText}]`. Carte `Reperes` (toutes apparences, seulement s'il y a des repères) : frise des dates triée, chiffres, auteurs ; clic = aller au passage, ✎ ou clic droit = modifier / supprimer, « + Ajouter ».
- **Cahier v2** (fin de `course-styles.css`) : papier plus discret (lignes et marge plus pâles, plus de trous), papier « Uni » en plus, schémas droits. Réglages `cahierFont` (kalam « Manuscrite », patrick « Feutre », shantell « Arrondie » par défaut, comic « Écolière », atkinson « Très lisible ») et `cahierInk` (bleu, violet, vert, noir, turquoise ; clair et sombre) → classes `font-*` et `ink-*` posées par `sheetClass()`. Polices `@fontsource/patrick-hand`, `shantell-sans`, `comic-neue`, `atkinson-hyperlegible` (^5.0.0) importées dans `main.jsx`. Papier par défaut : petits carreaux.

## Ajouts du 30 octobre 2026 (nuit) — relecture par Claude et par Gemini
- **Améliorer un schéma avec Claude** : sous chaque schéma, « Améliorer avec Claude ». Le logiciel copie une demande toute prête et ouvre Claude (claude.ai, ton compte, connexion retenue) dans une fenêtre. Tu colles (⌘V / Ctrl V), Entrée, puis tu copies le schéma de Claude (bouton « Copier » de son bloc de code) : en revenant dans le logiciel, il est récupéré tout seul, montré avant/après, et remplace l'ancien. « Annuler la modification » le remet.
- **Faire relire le cours par Claude** : après chaque génération, un bandeau propose « Relire avec Claude » (aussi « Vérifier avec Claude » dans la barre du cours). Claude compare le cours entier au texte d'origine et vérifie chaque ajout de Gemini ; tu reçois une note, puis la liste des corrections à cocher (erreur, ajout douteux, oubli, faute). « Annuler la vérification » remet le cours d'avant.
- **Relecture des schémas par Gemini** (automatique, sans coût en plus) : après la génération, Gemini regarde chaque schéma comme une image et corrige ce qui dépasse, se chevauche ou manque. Bouton « Relire avec Gemini » sous un schéma. Réglages › IA : « Relire les schémas », « Proposer la relecture par Claude », « Ouvrir Claude ».
- Pas d'automatisation complète de claude.ai : ses conditions d'utilisation interdisent qu'un programme l'utilise à ta place (risque pour ton compte). Le logiciel fait tout le reste.

- 1er novembre 2026 : la vérification du cours par Claude a été retirée de ce logiciel (l'amélioration des schémas avec Claude reste).

- 1er novembre 2026 : bouton ↻ « Régénérer » sur chaque carte de cours (Mes cours et dossiers), avec confirmation.

- 1er novembre 2026 (suite) : la vérification du cours par Claude est remise, comme dans CAPES SES. Les deux logiciels ont les mêmes fonctions et les mêmes animations ; seul le jeu « La Quête » est propre à CAPES.

- 1er novembre 2026 (soir) : pastille « ✓ À jour / ↻ À régénérer / ✓ Vérifié par Claude » sur chaque cours, filtre « À régénérer » + « Tout régénérer » dans Mes cours, historique des générations (Gemini, Claude, toi) ; schémas de Claude dans le style moderne du logiciel.

- 2 novembre 2026 : vérification par Claude plus sobre (15 corrections au plus, seulement les erreurs certaines) ; bouton « Importer un cours ici » dans chaque dossier ; couleurs de dossiers libres avec pipette ; 6 palettes en plus, police de l'interface au choix, et pour les cours : couleur d'accent, interligne, largeur du texte, écriture « Livre » et trois nouveaux stylos.

- 3 novembre 2026 : on peut arrêter une génération, retirer un cours de la file d'attente, le passer en premier (épingle sur sa carte) ou tout arrêter (menu de gauche) ; un cours interrompu par la fermeture du logiciel retrouve son état normal au redémarrage.

- 3 novembre 2026 (soir) : zoom du texte en pinçant le pavé tactile ou avec Ctrl + molette ; « Surligner ce mot » donne une définition précise dans le sens du cours (internet seulement en complément) ; bulle loupe déplaçable pendant la lecture pour poser une question sur un mot, une phrase ou la partie lue (⌘/Ctrl J, ou « Demander » sur un passage sélectionné).

- 5 novembre 2026 : quand Gemini est surchargé chez Google (erreur 503), le logiciel passe tout seul sur un autre modèle Gemini disponible et te prévient ; message plus clair si tout est saturé.

- 17 novembre 2026 : voix ElevenLabs pour « Écouter » (Réglages › Voix : clé chiffrée, choix de la voix, essai, qualité, crédits du mois). Chaque passage lu est gardé sur l'ordinateur : le réécouter ne coûte rien. Sans crédits ou sans internet, la voix de l'ordinateur prend le relais.

- 18 novembre 2026 (version 1.1.0) : podcast du cours à deux voix ElevenLabs (bouton « Podcast » dans le cours, MP3 à enregistrer) ; cours, synthèses et podcasts sur le téléphone (Réglages › Téléphone : même Wi-Fi ou partout avec Tailscale) ; mises à jour automatiques depuis GitHub (Réglages › Mises à jour).
- 18 novembre 2026 (version 1.2.0) : **voix Azure Speech (Microsoft), moteur par défaut** pour « Écouter » et pour les podcasts. Réglages › Voix : coller la « Clé 1 » de la ressource Speech, choisir la région (West Europe par défaut), la voix (Denise, Henri, Vivienne…), « Essayer ». Offre gratuite F0 : 500 000 caractères par mois, compteur dans les réglages. ElevenLabs reste disponible en option ; la voix de l'ordinateur prend le relais en cas d'erreur.
- 18 novembre 2026 (version 1.3.0) : menu **Podcasts** — tous les podcasts enregistrés, rangés par dossier, avec un lecteur (précédent / suivant, vitesse, enchaînement automatique, reprise là où tu t'étais arrêtée), le texte du dialogue, l'enregistrement du MP3 et un lien vers le cours.
- 18 novembre 2026 (version 1.3.1) : podcasts plus humains (vraie conversation, réactions, analogies, rythme varié, sans formules robotiques).
- 22 novembre 2026 (version 1.4.0) : **Générer avec Claude**, solution de secours quand Gemini ne répond pas — Claude (ton compte claude.ai, dans la fenêtre du logiciel) rédige le cours complet, la synthèse, les flashcards et les QCM ; le logiciel prépare chaque demande et installe la réponse copiée, même en plusieurs morceaux (« continue »).
- 23 novembre 2026 (version 1.5.0) : **tâches en arrière-plan** avec barre d'avancement en bas de l'écran (génération des cours, podcasts, définitions) ; podcast créé en arrière-plan (fenêtre fermable, bouton Arrêter), **Régénérer** un podcast (fenêtre du podcast et menu Podcasts) ; Gemini ne fait plus attendre sans fin (4 min par réponse, 8 min en tout, messages en direct en cas de surcharge).
- 23 novembre 2026 (version 1.6.0) : **podcast écrit par Claude** (« Écrire avec Claude » dans la fenêtre Podcast, ou case « Dialogue du podcast » de « Générer avec Claude ») ; **palette personnalisée** (Réglages › Apparence : fond, cartes, texte, deux couleurs d'accent, clair ou sombre, dégradé, halos, alerte de lisibilité, « Mes palettes »).
- 23 novembre 2026 (version 1.6.1) : correctif des mises à jour automatiques — l'application installée ne trouvait pas son dépôt GitHub (« pas encore activées ») ; une dernière installation à la main de la 1.6.1 est nécessaire.
