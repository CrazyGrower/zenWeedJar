# PixelStash — Historique des mouvements

Date: 2026-08-16

## Objectif

Journaliser les mouvements de matière du stash et les afficher : une guirlande
des 10 derniers mouvements suspendue à gauche des étagères en desktop, et
l'historique complet dans une modale ouverte en cliquant sur la pancarte
STASH TOTAL.

## Périmètre

Journalisés :

- ajout d'un bocal
- suppression d'un bocal
- modification du poids d'un bocal (ajustement)

Non journalisés : les éditions de métadonnées (nom, date de récolte, THC,
indica, notes, couleur du bouchon). Le journal parle de grammes ; une ligne
« couleur du bouchon changée » polluerait une liste de dix entrées.

Hors périmètre pour cette itération : récapitulatif statistique (« +182g sur 30
jours »), filtres, suppression ou édition d'une entrée du journal, backfill de
l'historique antérieur à la feature.

## Modèle de données

Nouvelle table, créée par `openDb()` dans `db.js` avec les autres :

```sql
CREATE TABLE IF NOT EXISTS jar_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  jar_id        INTEGER,
  jar_name      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  delta_g       REAL NOT NULL,
  total_after_g REAL NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

| Colonne | Notes |
|---|---|
| `jar_id` | id du bocal concerné. Pas de clé étrangère, pas de `ON DELETE` : l'entrée survit à la suppression du bocal. Reste renseigné après suppression (le bocal n'existe plus, l'id est alors purement informatif). |
| `jar_name` | Copie du nom au moment du mouvement. |
| `kind` | `'add'`, `'remove'` ou `'adjust'`. |
| `delta_g` | Signé : `+77` pour un ajout, `-2` pour une consommation. |
| `total_after_g` | Total du stash (somme de `jars.weight_g`) juste après le mouvement. |

### Deux décisions à retenir

**`jar_name` est dupliqué plutôt que joint sur `jars`.** Supprimer un bocal ne
doit ni effacer ni casser son historique : le journal doit continuer d'afficher
« −77g MWHS » quand MWHS n'existe plus. Une jointure rendrait le nom `NULL`.

**`total_after_g` est stocké plutôt que recalculé à la lecture.** La base
existante contient déjà des bocaux sans aucun événement ; reconstituer le total
en cumulant les deltas depuis le premier événement donnerait des chiffres faux
tant que ces bocaux d'origine sont en base. On enregistre le total réel observé
au moment du mouvement — le journal est donc juste dès la première entrée, sans
backfill.

### Migration

`CREATE TABLE IF NOT EXISTS` dans `openDb()`. Une base existante récupère la
table vide au démarrage suivant. Aucun événement n'est fabriqué pour les bocaux
déjà présents : leurs dates de mouvement sont inconnues.

## Écriture des événements (`jars.js`)

Un helper interne `recordEvent(db, { jar_id, jar_name, kind, delta_g })` insère
la ligne et calcule `total_after_g` par `SELECT SUM(weight_g) FROM jars` (0 si
la table est vide).

Chaque mutation devient une transaction `better-sqlite3` englobant l'écriture
sur `jars` **et** l'insertion de l'événement, pour qu'un événement ne puisse
jamais exister sans son changement de poids, ni l'inverse. Le `SUM` est fait
dans la transaction, après la mutation.

| Fonction | Événement |
|---|---|
| `createJar` | `kind='add'`, `delta_g = +weight_g` |
| `deleteJar` | `kind='remove'`, `delta_g = -weight_g`. Nom et poids lus **avant** le `DELETE`. |
| `updateJar`, poids modifié | `kind='adjust'`, `delta_g = nouveau − ancien`. `jar_name` = le nom après mise à jour. |
| `updateJar`, poids inchangé ou absent du payload | aucun événement |

`deleteJar` sur un id inexistant renvoie `false` comme aujourd'hui et n'écrit
rien. `updateJar` sur un id inexistant renvoie `null` et n'écrit rien.

Nouvelle fonction exportée :

```js
listEvents(db, { limit } = {})
```

Renvoie les événements du plus récent au plus ancien (`ORDER BY created_at DESC,
id DESC` — `id` départage les événements de la même seconde, la granularité de
`CURRENT_TIMESTAMP`). Sans `limit`, plafond de 500.

## API (`app.js`)

`GET /api/events`

| Paramètre | Effet |
|---|---|
| aucun | tout l'historique, plafonné à 500 entrées |
| `?limit=10` | les 10 plus récents |

`limit` non numérique, ≤ 0 ou > 500 → `400`. Réponse : tableau JSON des lignes,
plus récent en premier.

## Frontend

### `public/api.js`

`Api.events(limit)` → `GET /api/events` avec le paramètre optionnel, même
gestion d'erreur que les autres méthodes.

### Mise en page de la pièce

La guirlande occupe une colonne réservée **à gauche des étagères**, dans le
prolongement de la ficelle de la pancarte. Les étagères ne bougent pas
verticalement et gardent leurs 6 emplacements à leur taille actuelle.

- `.scene` : largeur 820px → 980px
- `.stack` : `padding-left` 26px → 186px

Fenêtre, rebord, faisceau, chat, sol et bouton d'ajout sont ancrés à droite ou
en bas : les 160px ajoutés sont du mur en plus, ils ne déplacent rien.

### Guirlande (`.hud__log`)

Suspendue sous `.hud__tag`, dans le même langage visuel : mini-étiquettes kraft
empilées, la plus récente en haut, maximum 10.

- Format d'une étiquette : `+77g MWHS` (nom tronqué par CSS s'il déborde)
- `+` en vert, `−` en rouge brique
- Journal vide, ou serveur injoignable : la guirlande n'est pas rendue du tout
  (pas de cadre vide)
- `<900px` : `display:none`, et `.scene`/`.stack` reprennent 820px / 26px. La
  vue mobile est strictement identique à l'actuelle.

Une étiquette n'est pas cliquable individuellement.

### Modale d'historique

`<dialog id="history-dialog">`, ouverte en cliquant sur `.hud__tag`. La
pancarte devient un contrôle : `cursor:pointer`, focusable au clavier, et
**cliquable aussi en mobile** — c'est le seul accès à l'historique quand la
guirlande est masquée.

Contenu : titre « JOURNAL », puis une ligne par mouvement, plus récent en
premier :

```
16/08 21:34 · +77g · MWHS · → 237g
```

Date et heure formatées en local depuis `created_at`. Journal vide : « Aucun
mouvement enregistré ». Bouton FERMER, comme les autres modales.

### Rafraîchissement

Deux chargements distincts, pour ne pas garder 500 lignes en mémoire au profit
d'une guirlande de 10 :

- `loadAndRender()` appelle `Api.events(10)` en même temps que `Api.list()` et
  rend la guirlande. Toute mutation appelle déjà `loadAndRender()`, donc la
  guirlande se met à jour sans travail supplémentaire.
- L'ouverture de la modale appelle `Api.events()` sans limite, à chaque
  ouverture.

Un échec du chargement des événements ne doit pas empêcher l'affichage des
bocaux : la guirlande disparaît, les étagères restent.

## Tests

`test/jars.test.js`

- `createJar` écrit un événement `add` avec le bon delta et le bon
  `total_after_g`
- `deleteJar` écrit un événement `remove` avec un delta négatif
- `updateJar` qui change le poids écrit un `adjust` avec le delta signé
- `updateJar` qui ne change que le nom ou le THC n'écrit rien
- `updateJar` avec un poids identique n'écrit rien
- l'historique d'un bocal supprimé reste lisible, nom compris
- `listEvents` ordonne du plus récent au plus ancien et respecte `limit`

`test/api.test.js`

- `GET /api/events` renvoie 200 et le tableau
- `?limit=2` renvoie 2 entrées
- `?limit=abc`, `?limit=0`, `?limit=999` renvoient 400
- un `POST /api/jars` suivi d'un `GET /api/events` fait apparaître l'événement

`test/frontend.test.js`

- la fonction pure de formatage d'une entrée produit le libellé de guirlande et
  la ligne de modale attendus, pour un delta positif et un delta négatif
  (chargée via `vm` comme les autres tests front)
