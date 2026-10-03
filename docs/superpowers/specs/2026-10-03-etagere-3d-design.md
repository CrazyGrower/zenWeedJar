# Étagère 3D — Design

Date : 2026-10-03

## Vision

Remplacer la pièce en pixel art 2D (SVG + CSS) par une scène **3D rendue en basse
résolution** : une étagère murale vue de face, des bocaux à vis en verre dans
lesquels on **voit la weed** (têtes en 3D avec pistils), le tout agrandi en gros
pixels nets pour garder le grain rétro. Refonte **front uniquement** : l'API, la
base et le serveur ne changent pas.

Prototype validé (référence visuelle et source du code à porter) :
`docs/superpowers/specs/assets/2026-10-03-etagere-3d-prototype.html`.

## Direction artistique (validée)

- Rendu Three.js calculé à 1/4 de la résolution de l'écran puis agrandi avec
  `image-rendering: pixelated` ; ombrage « toon » en 3 paliers.
- Décor « étagère de nuit » : mur à lattes, fenêtre à gauche sur des collines
  (deux ambiances : **coucher de soleil** par défaut, **nuit**), cactus sur le
  rebord, tapis, livres et grinder sur l'étagère du bas.
- **Plant de weed** au premier plan à droite (tige fine brisée, feuilles à 7
  folioles plates, tête principale en pointe).
- **Chat noir** en formes arrondies assis au bout de l'étagère du haut, tourné
  vers la fenêtre, tête vers la caméra ; respire, cligne des yeux, queue qui
  pend et se balance.
- **Bocaux à vis** : verre transparent, couvercle vissé de la couleur
  `color_tag`, fine bague dorée.
- **Étiquettes en scotch de masquage** collées sur le verre, en pixel ×1 (texte
  lisible, non aligné sur le grain de la scène) : nom, poids, date de récolte.
- **Animation d'arrivée** au chargement : les têtes tombent dans chaque pot une à
  une (rythme constant, donc un pot plus lourd se remplit plus longtemps), puis
  le couvercle se visse et l'étiquette apparaît. Désactivée si
  `prefers-reduced-motion`.
- Caméra calme : pas de balancement automatique ; on peut faire glisser pour
  tourner de ±0,3 rad ; le pot ouvert se soulève légèrement.

## Règles métier

- **Capacité d'un pot : 80 g pour tous.** Niveau = `poids / 80`, borné à [0, 1].
  Au-delà de 80 g le pot est plein et l'étiquette affiche le vrai poids
  (l'ancienne règle « deuxième bocal derrière » disparaît).
- **3 pots par étagère**, au moins 2 étagères ; une étagère de plus par tranche
  de 3 pots. Ordre : par `id` croissant, en commençant par l'étagère du haut, de
  gauche à droite. Modifier un pot ne le déplace jamais.
- **Couleur des têtes** : violette si la couleur du bouchon est dans la famille
  prune/violet (teinte 255°–330°, saturation > 0,15), verte sinon. Pas de
  nouveau champ en base.
- Un pot à 0 g s'affiche vide, couvercle et étiquette compris.

## Écrans

- **Accueil** : la scène plein écran. En haut : titre « Mon étagère », dernier
  mouvement, pancarte du total (bouton → journal et stats, comme aujourd'hui).
  En bas : bascule Coucher de soleil / Nuit (mémorisée dans `localStorage`) et
  bouton « + Nouveau bocal ».
- **Fiche bocal** (dialogue 2D pixel) : boutons de retrait rapide -0,5 / -1 /
  -2 g, puis Ajuster poids (saisie libre), Éditer, Supprimer.
- **Formulaire** (dialogue 2D pixel) : la couleur du bouchon se choisit avec
  des pastilles au lieu d'un champ texte.
- **Journal / stats** : inchangés sur le fond, simplement re-thémés.

## Repli

Si Three.js ne se charge pas ou si WebGL est indisponible, l'accueil affiche la
liste des bocaux en boutons (nom + poids) qui ouvrent la même fiche : l'app
reste utilisable.

## Hors ligne / auto-hébergement

Three.js (r128, MIT) et les polices Jersey 10 et Pixelify Sans (OFL) sont
servis depuis `public/`, comme les polices actuelles : aucun CDN au runtime.
