# Curio — Culture générale

Application web personnelle, en français, compatible GitHub Pages. Aucun compte ni installation nécessaire pour l’utiliser. Sujets personnalisés, pages à blocs (texte, titres, citations, images, liens), déplacement des blocs, disposition des images, recherche intégrale, favoris et corbeille pour les pages.

## Trois formats et deux modes

Chaque sujet contient trois sections : **Infos rapides**, **Sujets approfondis** et **Citations**. L’accueil permet aussi de retrouver chaque format à travers tous les sujets. Le format se choisit à la création et se change dans l’éditeur. Les anciennes pages et sauvegardes sans format sont considérées comme des sujets approfondis, sans modifier leur contenu.

Une connaissance s’ouvre en lecture : fiche compacte pour une info, article avec sommaire dès deux titres de section pour un sujet approfondi, présentation typographique et auteur/source pour une citation. **Modifier** ouvre l’éditeur par blocs. **Enregistrer**, en bas de l’éditeur, attend la réussite de la sauvegarde avant de revenir à la lecture. La sauvegarde automatique reste active pendant l’édition ; le bouton termine la session d’écriture, il ne sert pas à publier les données en ligne. Si l’enregistrement échoue, l’éditeur reste ouvert avec les modifications.

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
