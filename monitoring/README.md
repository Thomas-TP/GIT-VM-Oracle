# Monitoring (Grafana Cloud)

Dashboard Grafana **en ligne** qui lit les métriques du portail via des endpoints JSON
**token-gated** (`/api/monitoring/*`) avec la datasource **Infinity**.

> Grafana ne peut pas tourner sur Cloudflare Workers (c'est un serveur). On utilise donc
> **Grafana Cloud** (offre gratuite) qui interroge directement les endpoints HTTPS de la prod.

## Mise en route (Grafana Cloud)

1. Crée un compte gratuit sur <https://grafana.com> → une instance Grafana Cloud.
2. **Connections → Add new connection → Infinity** (installe la source de données, dispo en gratuit).
   - Dans la config Infinity, onglet *Security* : autorise l'hôte
     `https://git-vm-portal.thomas-prudhomme.workers.dev`.
3. **Dashboards → New → Import** → charge [`grafana/dashboards/git-vm-portal.json`](grafana/dashboards/git-vm-portal.json).
4. En haut du dashboard, renseigne les deux variables :
   - **Portal URL** : `https://git-vm-portal.thomas-prudhomme.workers.dev` (pré-rempli)
   - **Token** : la valeur du secret `GRAFANA_TOKEN` (déjà défini côté Cloudflare).
5. (Optionnel) copie l'URL de ton dashboard dans la variable Cloudflare `GRAFANA_URL` :
   l'onglet **Monitoring** de l'admin y renverra directement.

## Endpoints exposés (JSON)

| URL | Contenu |
|---|---|
| `/api/monitoring/summary` | `[{status, count}]` |
| `/api/monitoring/daily`   | `[{day, count}]` (30 derniers jours) |
| `/api/monitoring/os`      | `[{os, count}]` |
| `/api/monitoring/users`   | `[{user_email, count}]` |
| `/api/monitoring/cost`    | `[{activeVms, monthlyUsd}]` |

Auth : `Authorization: Bearer <GRAFANA_TOKEN>` **ou** `?token=<GRAFANA_TOKEN>` (utilisé par le
dashboard via la variable `$token`). Sans token → `401` ; sans secret défini → `503`.

Rotation du token : `npx wrangler secret put GRAFANA_TOKEN` puis mets à jour la variable du dashboard.

## Alternative : Grafana local (optionnel)

Si tu préfères tester en local : `docker compose up -d` dans ce dossier (Grafana + plugin Infinity
+ datasource/dashboard pré-provisionnés), puis <http://localhost:3000>. Voir `docker-compose.yml`.
