# Curio — Culture générale

Application web personnelle, en français, compatible GitHub Pages. Aucun compte ni installation nécessaire pour l’utiliser. Sujets personnalisés, pages à blocs (texte, titres, citations, images, liens), déplacement des blocs, disposition des images, recherche intégrale, favoris et corbeille pour les pages.

## Démarrer localement

Depuis ce dossier : `python -m http.server 3355 --bind 127.0.0.1`, puis ouvrir http://127.0.0.1:3355. Ne pas ouvrir directement index.html en file://.

## Déployer sur GitHub Pages

Pousser ce dossier dans un dépôt GitHub sur la branche `main`. Dans **Settings → Pages → Build and deployment → Source**, sélectionner **GitHub Actions**. Le workflow inclus publie uniquement index.html, app.js et style.css. Les liens relatifs fonctionnent aussi sous /nom-du-depot/. Aucun serveur Python ni secret n’est requis en production.

## Stockage et sauvegardes

Les pages et sujets sont conservés dans IndexedDB (`curio-library`, magasin `state`). Les images importées sont séparées dans le magasin `images`. Les modifications sont enregistrées automatiquement. Les transactions et numéros de révision empêchent une autre fenêtre d’écraser silencieusement une version plus récente.

GitHub Pages héberge le code, pas les données personnelles. Les contenus restent propres au navigateur, au profil et à l’origine du site. Ils ne sont ni envoyés à GitHub ni synchronisés sur téléphone. L’effacement des données du site les supprime. En navigation privée, ils peuvent disparaître à la fermeture. Les navigateurs peuvent aussi évincer du stockage selon leurs conditions.

**Exporter ma bibliothèque** télécharge un JSON avec tous les sujets, pages, corbeille et images. **Importer une sauvegarde** ajoute son contenu sans remplacer les pages existantes. Un import répété crée des copies. Conserver régulièrement un export sur un disque sauvegardé. Les fichiers exportés peuvent contenir des informations personnelles.

Les images acceptées sont PNG, JPEG, GIF et WebP, avec une limite de 12 Mo par image. L’import de sauvegarde est limité à 200 Mo. Le stockage total dépend du navigateur. Les images des blocs supprimés restent conservées localement et ne figurent plus dans les exports ; une fonction de nettoyage pourra être ajoutée.

## Périmètre de cette version

Les blocs se déplacent verticalement et les images se redimensionnent/s’alignent. Il ne s’agit pas d’un canevas à coordonnées libres, ni d’un éditeur avec texte coulant autour des images. Le texte est du texte brut par bloc. Pas de synchronisation distante, de comptes ou d’import Notion automatique. La bibliothèque démarre vide, sans connaissances fictives.
