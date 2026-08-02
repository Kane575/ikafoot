# IKAFOOT

Réservation en ligne de créneaux de terrain de football.

- **Côté client** : une vitrine d'accueil, le planning des 7 prochains jours, les
  tarifs, la réservation, et la possibilité de retrouver ou d'annuler sa
  réservation avec son numéro.
- **Côté propriétaire** : les réservations, les acomptes à encaisser, les recettes
  attendues, et la gestion des créneaux hebdomadaires et de leurs tarifs.

Le terrain ouvre **20 h par jour, tous les jours** (06:00 → 02:00), en créneaux
d'une heure : **25 000 FCFA** en semaine, **30 000** le week-end. Une réservation
n'est confirmée qu'une fois **la moitié de la somme versée**.

Pile technique : React (Vite) · Express · PostgreSQL.

---

## 1. Démarrer en local

Prérequis : Node 20+ et Docker (pour la base de données).

```bash
npm install

# 1. Une base PostgreSQL locale
docker compose up -d

# 2. La configuration
cp .env.example .env
```

Ouvrez `.env` et renseignez trois valeurs :

| Variable         | Valeur pour le développement local                            |
| ---------------- | ------------------------------------------------------------- |
| `DATABASE_URL`   | `postgresql://ikafoot:ikafoot@localhost:5433/ikafoot`          |
| `JWT_SECRET`     | générez-le : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_PASSWORD` | le mot de passe du propriétaire (8 caractères minimum)         |

Puis :

```bash
npm run db:migrate   # crée les tables
npm run db:seed      # crée le compte propriétaire et un planning de départ
npm run dev          # API sur :3002, interface sur :4173
```

L'interface est sur <http://127.0.0.1:4173>, l'espace propriétaire sur
<http://127.0.0.1:4173/admin>.

> La base tourne sur le port **5433** et non 5432 : un PostgreSQL installé
> nativement sous Windows occupe déjà 5432. Les deux cohabitent sans conflit.
> Si vous préférez utiliser votre PostgreSQL natif, créez-y une base `ikafoot`
> et pointez `DATABASE_URL` vers `localhost:5432` avec vos identifiants.

### Commandes

| Commande             | Effet                                                      |
| -------------------- | ---------------------------------------------------------- |
| `npm run dev`        | API + interface avec rechargement automatique              |
| `npm run build`      | Génère `dist/` (l'interface compilée)                      |
| `npm start`          | Lance l'API seule, qui sert aussi `dist/` — mode production |
| `npm run db:migrate` | Applique `server/schema.sql` (ré-exécutable sans risque)    |
| `npm run db:seed`    | Crée/met à jour le compte admin et le planning par défaut   |
| `npm run db:reset`   | **Efface tout** puis recrée. À n'utiliser qu'en local.      |

---

## 2. Comment fonctionne le planning

Le planning n'est écrit nulle part en dur : il se calcule.

Le propriétaire définit des **créneaux hebdomadaires** (`slot_templates`) :
« tous les samedis de 16 h à 17 h, 5 vs 5, 25 000 FCFA en semaine / 30 000 le
week-end ». L'application projette ensuite ces créneaux sur les 7 prochains jours
à partir d'aujourd'hui. L'application ne périme donc jamais, et changer un horaire
ou un tarif se fait depuis l'interface, sans toucher au code.

`npm run db:seed` installe la grille standard : **20 créneaux d'une heure par
jour, de 06:00 à 02:00, les sept jours de la semaine** — soit 140 créneaux types.
Les deux créneaux d'après minuit (00:00 et 01:00) appartiennent au jour civil où
ils commencent : ils s'affichent donc **en tête de journée**, pas à la fin de la
veille. Le seed est ré-exécutable : il réaligne les horaires et les tarifs sans
toucher au format de match choisi par le propriétaire.

Le tarif week-end s'applique automatiquement le samedi et le dimanche. **Le prix
est toujours recalculé côté serveur** au moment de la réservation : un client ne
peut pas imposer son propre prix en modifiant la requête.

---

## 3. L'acompte

Une réservation n'est pas confirmée par le simple fait de cliquer : il faut
verser **la moitié du prix** (12 500 FCFA en semaine, 15 000 le week-end).

1. Le client réserve → la réservation est **`pending`**, et le créneau est
   **bloqué** pendant `BOOKING_HOLD_HOURS` heures (2 par défaut) — jamais au-delà
   de l'heure de début du match.
2. Il envoie l'acompte sur le numéro `PAYMENT_PHONE` en indiquant sa référence.
3. Le propriétaire pointe **« Acompte reçu »** dans son espace → la réservation
   passe **`confirmed`**.
4. Sans acompte dans le délai, elle devient **`expired`** et le créneau
   **redevient réservable** par quelqu'un d'autre.

Il n'y a **aucune tâche planifiée** à surveiller : les options périmées sont
balayées au début de chaque lecture du planning et de chaque réservation. Une
option périmée ne peut donc jamais bloquer un créneau au-delà de la première
visite qui suit son expiration.

Le montant de l'acompte et le délai sont calculés côté serveur (`server/lib/schedule.js`)
et envoyés au front : ils ne sont écrits nulle part dans le React.

---

## 4. Déployer sur Render

Render héberge l'API et la base, gratuitement pour démarrer.

1. Poussez le projet sur GitHub.
2. Sur Render : **New → Blueprint**, sélectionnez le dépôt. Le fichier
   `render.yaml` décrit déjà la base et le service web, et les relie.
3. Dans **Environment**, renseignez les variables laissées vides :
   - `ADMIN_PHONE` — le numéro du propriétaire (ex. `76733749`)
   - `ADMIN_PASSWORD` — son mot de passe
   - `PAYMENT_PHONE` — le numéro mobile money qui reçoit les acomptes
     (facultatif : `ADMIN_PHONE` est utilisé s'il est vide)
   (`DATABASE_URL` et `JWT_SECRET` sont remplis automatiquement par Render.)
4. Au premier déploiement, ouvrez le **Shell** du service et lancez une fois :
   ```bash
   npm run db:seed
   ```
   Cela crée le compte propriétaire et le planning de départ.

Le déploiement est terminé. `npm run db:migrate` tourne à chaque build : les
futures modifications du schéma s'appliquent toutes seules.

### Ailleurs (Railway, Fly, VPS)

Un `Dockerfile` est fourni : l'image contient l'API **et** l'interface compilée,
donc un seul service à déployer. Il lui faut ces variables d'environnement :

```
DATABASE_URL=...      # PostgreSQL
JWT_SECRET=...        # long, aléatoire, jamais commité
NODE_ENV=production
PORT=3002             # ou ce que l'hébergeur impose
```

Puis, une seule fois : `npm run db:migrate && npm run db:seed`.

> **Netlify et Vercel ne conviennent pas ici** : ils servent des fichiers
> statiques, ils ne peuvent pas faire tourner le serveur Express ni la base.
> C'était le problème de l'ancien `netlify.toml` — le site s'affichait mais
> aucune réservation ne fonctionnait.

---

## 5. Structure

```
server/
  index.js            Serveur Express : API + interface compilée en production
  db.js               Pool PostgreSQL
  schema.sql          Les tables
  migrate.js          Applique le schéma
  seed.js             Compte propriétaire + planning de départ
  routes/
    public.js         Planning, réservation, recherche, annulation client
    admin.js          Connexion, réservations, gestion des créneaux
  lib/
    schedule.js       Fenêtre glissante de 7 jours, prix, acompte, délai de garde
    slots-service.js  Croisement créneaux × réservations, libération des options
    auth.js           Session admin (JWT en cookie httpOnly)
    validate.js       Validation des entrées
public/
  terrain.jpg         Photo du bandeau d'accueil (à remplacer par la vôtre)
  terrain-but.jpg     Photo de la section « le terrain »
src/
  App.jsx             En-tête, navigation, pied de page
  api.js              Appels HTTP
  pages/              HomePage (vitrine) · BookingPage · AdminPage
  components/         PitchIllustration · Modal · Toast
  styles.css
```

### Les trois pages

| Adresse     | Page          | Contenu                                                  |
| ----------- | ------------- | -------------------------------------------------------- |
| `/`         | `HomePage`    | La vitrine : accroche, étapes, tarifs, équipements, dispos, FAQ |
| `/reserver` | `BookingPage` | Le planning, la réservation, « mes réservations »         |
| `/admin`    | `AdminPage`   | L'espace propriétaire (non lié depuis le site public)     |

La navigation se fait sans rechargement, mais les liens restent de vrais `href` :
`/reserver` s'ouvre directement, se partage et fonctionne en nouvel onglet.

### Les photos

⚠️ **Les deux photos livrées dans `public/` ne sont pas votre terrain.** Ce sont
des images d'illustration prises sur [Unsplash](https://unsplash.com/license)
(licence Unsplash : usage commercial libre, sans attribution). Elles sont là pour
que le site ne soit pas vide en attendant **vos propres photos** — qui vendront
toujours mieux, parce qu'un client reconnaît le terrain où il va jouer.

| Fichier                  | Où                                      | Format conseillé          |
| ------------------------ | --------------------------------------- | ------------------------- |
| `public/terrain.jpg`     | Fond du grand bandeau d'accueil         | Paysage large, 1800 px    |
| `public/terrain-but.jpg` | Section « Ce que vous trouvez sur place » | 4/3, 1200 px             |

Pour les remplacer : écrasez simplement les deux fichiers en gardant les mêmes
noms. Visez moins de 300 ko chacun. Le bandeau étant sombre et le texte blanc,
une photo **prise le soir, terrain éclairé** y rend particulièrement bien.

Les noms se changent en tête de [src/pages/HomePage.jsx](src/pages/HomePage.jsx)
(`PITCH_PHOTO`, `GOAL_PHOTO`). Mettre `PITCH_PHOTO = null` fait revenir
l'illustration SVG du terrain, qui reste disponible dans
`src/components/PitchIllustration.jsx`.

### Personnaliser la vitrine

`AMENITIES`, en tête du même fichier, liste ce que le client trouve sur place.
N'annoncez que ce qui existe vraiment : deux lignes fréquentes (vestiaires,
parking) sont déjà écrites en commentaire, il suffit de les décommenter si elles
s'appliquent.

Les tarifs, l'acompte et les disponibilités affichés en vitrine **viennent de
l'API**, jamais du code : un prix modifié dans l'espace propriétaire se voit
aussitôt sur la page d'accueil. Et si l'API ne répond pas, la vitrine reste
entière — seuls les chiffres manquent.

---

## 6. Sécurité

- Le mot de passe admin est stocké **haché** (bcrypt, coût 12). Il n'apparaît
  ni dans le code, ni dans le dépôt : il vient de `ADMIN_PASSWORD`.
- La session admin est un **JWT dans un cookie `httpOnly`** : le JavaScript de la
  page ne peut pas le lire, donc une faille XSS ne permet pas de le voler.
  Elle expire au bout de 8 heures.
- Après 5 échecs de connexion, le compte est bloqué 10 minutes.
- Toutes les requêtes SQL sont **paramétrées** — pas d'injection possible.
- Un index unique partiel en base empêche deux réservations vivantes (`pending`
  **ou** `confirmed`) sur le même créneau, même si deux clients valident
  exactement au même instant.
- Le montant de l'acompte est **calculé côté serveur**, jamais reçu du client.
- Les numéros de téléphone des clients ne sont **jamais affichés publiquement** :
  il faut connaître un numéro pour voir les réservations qui lui sont rattachées.

**À ne jamais faire** : commiter `.env`, ou réutiliser le `JWT_SECRET` de
développement en production.

---

## 7. Le dossier `_ancienne-version/`

Il contient l'ancienne version (front en JavaScript pur, données dans des
fichiers JSON, `netlify.toml`). Elle n'est plus utilisée par l'application.
Supprimez le dossier quand vous aurez vérifié que tout fonctionne.
