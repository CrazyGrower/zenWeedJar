# PixelStash — Design

Date: 2026-08-07

## Vision

Web app perso, ultra-simple et esthétique, pour suivre un inventaire de bocaux
("stash") disposés sur une étagère virtuelle en pixel art. Hébergée sur un serveur
local via Docker, accessible depuis n'importe quel appareil du réseau (PC, mobile)
avec une base de données centralisée.

## Tech Stack

- **Backend** : Node.js + Express
- **Base de données** : SQLite via `better-sqlite3`, fichier persistant `./data/stash.db`
- **Frontend** : HTML5 / CSS3 (pixel art) / Vanilla JS
- **Conteneurisation** : Docker + docker-compose, volume `./data` pour la persistance

## Direction artistique

- Pixel art pastel, cozy, minimaliste (ambiance Lo-Fi Cozy Room / Stardew Valley).
- Palette : bois clair, vert sauge/menthe pastel, jaune soleil, étiquettes kraft.
- Police pixel Google Fonts (`Silkscreen`, fallback `Press Start 2P`).
- Rendu net : `image-rendering: pixelated;`.
- HUD rétro affichant le poids total : `[ 📦 TOTAL: 237g ]`.
- Étagère bois pixel art contenant des bocaux en verre.
- Chaque bocal reflète visuellement son contenu : **niveau de remplissage** proportionnel
  au poids (relatif au bocal le plus lourd) + teinte du bouchon/étiquette selon `color_tag`.

## Modèle de données (SQLite)

Table `jars` :

| Colonne        | Type                              | Notes                                  |
|----------------|-----------------------------------|----------------------------------------|
| `id`           | INTEGER PRIMARY KEY AUTOINCREMENT |                                        |
| `name`         | TEXT NOT NULL                     | ex: "Mango", "Mwhs", "Liver"           |
| `harvest_date` | TEXT                              | ex: "13/07"                            |
| `weight_g`     | REAL NOT NULL                     | quantité en grammes                    |
| `thc_percent`  | REAL                              | optionnel                              |
| `indica_pct`   | REAL                              | optionnel, % indica (sativa = 100−val) |
| `notes`        | TEXT                              | optionnel, description / effets        |
| `color_tag`    | TEXT                              | couleur pastel (HEX ou classe)         |
| `created_at`   | DATETIME DEFAULT CURRENT_TIMESTAMP|                                        |

**Chaque bocal est une entrée indépendante.** Deux bocaux de même variété mais de
récoltes/pieds différents (ex: Mango 65g le 23/07 et Mango 40g le 10/04) sont deux
lignes distinctes.

## Comportement UI

- **HUD** en haut : `[ 📦 TOTAL: 237g ]`, somme de tous les `weight_g` calculée côté front.
- **Étagère** : bocaux alignés sur des rangées. Remplissage visuel proportionnel au poids.
- **Étiquette compacte** sous chaque bocal : **nom + date de récolte** uniquement.
- **Clic sur un bocal** → modale détail : poids, THC %, ratio indica/sativa (petite barre),
  notes. Actions : **Ajuster poids** (retirer une quantité, ex −2g), **Éditer**, **Supprimer**.
- **Bouton `[+ Nouveau Bocal]`** → modale formulaire pixel art (ajout d'une jar).

### CRUD couvert

1. **Ajouter** une jar (bouton + modale formulaire).
2. **Ajuster le poids** d'une jar (ex retirer 2g de conso) sans la supprimer.
3. **Éditer** les champs d'une jar.
4. **Supprimer** une jar.

## Synchronisation

Rechargement via `GET /api/jars` à l'ouverture **et** après chaque action
(create / update / delete). Pas de polling, pas de WebSocket. Suffisant pour un
usage perso mono-utilisateur ; la BDD centralisée garantit la cohérence entre appareils.

## Accès

Aucune authentification. Accès libre sur le réseau local.

## API REST

| Méthode | Route            | Rôle                              |
|---------|------------------|-----------------------------------|
| GET     | `/api/jars`      | Liste tous les bocaux             |
| POST    | `/api/jars`      | Ajoute un bocal                   |
| PUT     | `/api/jars/:id`  | Met à jour un bocal (nom, poids…) |
| DELETE  | `/api/jars/:id`  | Supprime un bocal                 |

Réponses JSON. Validation basique côté serveur (name + weight_g requis, weight_g ≥ 0).

## Seed (données initiales)

Insérées **uniquement si la table est vide** :

| name  | harvest_date | weight_g |
|-------|--------------|----------|
| Mwhs  | 13/07        | 77       |
| Mango | 23/07        | 65       |
| Mango | 10/04        | 40       |
| Liver | 10/04        | 55       |

Total attendu : **237g**.

## Structure du projet

```
zenWeedJar/
├── package.json
├── server.js               # API Express + static + démarrage
├── db.js                   # connexion SQLite + schéma + seed
├── Dockerfile
├── docker-compose.yml      # volume ./data
├── data/stash.db           # généré (git-ignored)
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## Non-objectifs (YAGNI)

- Pas de comptes utilisateurs / multi-tenant.
- Pas de temps réel (WebSocket/polling).
- Pas d'historique de consommation ni de graphiques.
