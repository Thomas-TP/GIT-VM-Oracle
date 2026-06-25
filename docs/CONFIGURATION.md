# Configuration & secrets — GIT VM Portal

> Toutes les variables, les secrets, les permissions et les procédures de **publication / rotation
> des credentials**. Référence transverse de sécurité — voir [ADR 0006](adr/0006-gestion-des-secrets.md).
> Dernière mise à jour : 2026-06-19.

---

## 1. Principe

- **Config publique** (non sensible) → `wrangler.jsonc` → `vars`. Commitée.
- **Secrets** (sensibles) → **Cloudflare Wrangler Secrets** (`wrangler secret put`). **Jamais commités.**
- **En local** → fichier `.dev.vars` (ignoré par Git) pour vars + secrets de dev.

> 🚫 **Aucun secret en clair dans le repo, les logs, les commits ou le chat.** Les scripts OCI lisent
> les creds depuis l'environnement, jamais en dur. Si on te transmet une clé, utilise-la en local et
> **fais-la roter ensuite**.

## 2. Variables publiques (`wrangler.jsonc` → `vars`)

| Variable | Exemple / valeur | Rôle |
|---|---|---|
| `ALLOWED_EMAIL_DOMAINS` | `satom.ch,git.swiss` | Domaines email autorisés à se connecter |
| `ADMIN_EMAILS` | `thomas.prudhomme@satom.ch,…` | Admins « bootstrap » (toujours admin) |
| `ENTRA_TENANT_ID` | `33a7a298-…` | Tenant Entra ID |
| `ENTRA_CLIENT_ID` | `02ba5e3a-…` | App registration Entra (app GIT-VM-Oracle) |
| `OCI_REGION` | `eu-zurich-1` | Région OCI (Zurich) |
| `OCI_TENANCY_OCID` | `ocid1.tenancy.oc1..…` | Tenancy OCI |
| `OCI_USER_OCID` | `ocid1.user.oc1..…` | Utilisateur API OCI (signature) |
| `OCI_FINGERPRINT` | `8f:20:…:42:a8` | Empreinte de la clé API OCI |
| `OCI_COMPARTMENT_OCID` | `ocid1.tenancy.oc1..…` | Compartiment des VM/volumes (racine = tenancy) |
| `OCI_SUBNET_ID` | `ocid1.subnet.oc1.eu-zurich-1.…` | Subnet public régional des VM |
| `OCI_AVAILABILITY_DOMAIN` | `efIw:EU-ZURICH-1-AD-1` | Availability domain de lancement |
| `APP_URL` | `https://git-vm-oracle.satom-openstack.workers.dev` | URL publique (callback cours, emails) |
| `GRAFANA_URL` | *(vide)* | Lien Grafana affiché dans l'onglet Monitoring (admin) |
| `MAIL_ENABLED` | `true` | Active l'envoi EmailJS |
| `SCHEDULED_STOP` | `true` | Active l'extinction nocturne (cron 19 h UTC) |
| `SENTRY_DSN` | *(vide)* | DSN Sentry (optionnel) |
| `EMAILJS_PUBLIC_KEY` | `KlKcUV9e…` | Clé publique EmailJS |
| `EMAILJS_SERVICE_ID` | `service_aeuc86a` | Service EmailJS |
| `EMAILJS_TEMPLATE_ID` | `template_za3761l` | Template EmailJS |

## 3. Secrets (`wrangler secret put <NAME>`)

| Secret | Source | Rôle |
|---|---|---|
| `SESSION_SECRET` | aléatoire fort (≥ 32 octets) | Signe les JWT de session **ET** dérive la clé AES-GCM de chiffrement |
| `ENTRA_CLIENT_SECRET` | Entra → Certificates & secrets | Échange du code OIDC contre l'id_token |
| `OCI_PRIVATE_KEY` | Clé API OCI (PKCS#8 PEM) | Signe les appels API OCI (HTTP Signature RSA-SHA256) |
| `EMAILJS_PRIVATE_KEY` | EmailJS → Account → API Keys | Auth serveur EmailJS |
| `RECONCILE_TOKEN` | aléatoire fort | Bearer du déclencheur manuel `POST /api/internal/reconcile` + `oci-selftest` |
| `GRAFANA_TOKEN` | aléatoire fort (optionnel) | Bearer des endpoints `/api/monitoring/*` (Grafana, cf. [monitoring/](../monitoring/README.md)). Non défini → endpoints `503`. |

```bash
# Définir / mettre à jour un secret (prod)
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ENTRA_CLIENT_SECRET
Get-Content -Raw cle-api-oci.pem | npx wrangler secret put OCI_PRIVATE_KEY   # PEM multi-ligne
npx wrangler secret put EMAILJS_PRIVATE_KEY
npx wrangler secret put RECONCILE_TOKEN

# Lister les secrets définis (noms uniquement)
npx wrangler secret list
```

> ⚠️ `SESSION_SECRET` est **double usage** : sa rotation invalide toutes les sessions **et** rend
> illisibles les clés SSH / mots de passe Windows déjà stockés (re-télécharger / re-provisionner après).

## 4. Développement local (`.dev.vars`)

Fichier `.dev.vars` à la racine (déjà dans `.gitignore`) :

```ini
SESSION_SECRET="dev-only-change-me-0123456789abcdef"
ENTRA_CLIENT_SECRET="..."
OCI_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
EMAILJS_PRIVATE_KEY="..."
RECONCILE_TOKEN="..."
```

`wrangler dev` charge `.dev.vars` automatiquement. Pour les scripts `scripts/*.mjs`, exporter les
variables OCI dans le shell (PowerShell) :

```powershell
$env:OCI_TENANCY='ocid1.tenancy.oc1..…'; $env:OCI_USER='ocid1.user.oc1..…'
$env:OCI_FINGERPRINT='8f:20:…:42:a8'; $env:OCI_REGION='eu-zurich-1'
$env:OCI_PRIVATE_KEY_FILE='C:\chemin\vers\cle-api-oci.pem'   # ou $env:OCI_PRIVATE_KEY (PEM)
node scripts/oci-images.mjs
```

## 5. OCI IAM

**Tenancy** : `ocid1.tenancy.oc1..…` · **Région** : `eu-zurich-1` · **Compartiment** : racine (tenancy).

Le Worker signe les appels OCI avec une **clé API** rattachée à un utilisateur OCI (pas de clé
symétrique de type access-key/secret). Politique minimale du **groupe** de cet utilisateur (Console → Identity →
Policies) :

```
Allow group <grp> to manage instance-family       in tenancy
Allow group <grp> to manage volume-family         in tenancy
Allow group <grp> to use    virtual-network-family in tenancy
Allow group <grp> to read   metrics               in tenancy
```

### 5.1 Permissions supplémentaires (one-off / optionnel)

- **Création réseau** (`scripts/oci-setup.mjs`) : `manage virtual-network-family in tenancy`.
- **Budget** (`scripts/oci-budget.mjs`) : `manage usage-budgets in tenancy` (sinon créer le budget
  dans la Console : Billing & Cost Management → Budgets).
- **Availability domains** : `inspect availability-domains in tenancy` — sinon l'AD est découverte
  automatiquement via le service **Limits** (cf. `scripts/_oci.mjs`).

> La **clé privée API** (PKCS#8 PEM) sert au runtime (secret `OCI_PRIVATE_KEY`) **et** aux scripts
> locaux (`OCI_PRIVATE_KEY_FILE`). Jamais commitée ; à roter en cas de fuite.

## 6. Microsoft Entra ID

App registration (Azure Portal → Entra ID → App registrations) :

1. **Redirect URI** (type *Web*) : `https://<APP_URL>/auth/callback`
   (prod : `https://git-vm-oracle.satom-openstack.workers.dev/auth/callback`).
2. **Client ID** → `ENTRA_CLIENT_ID` (var). **Tenant ID** → `ENTRA_TENANT_ID` (var).
3. **Client secret** (Certificates & secrets) → `ENTRA_CLIENT_SECRET` (secret).
4. **Permissions** : `openid`, `profile`, `email` (scopes OIDC standard).
5. Les utilisateurs doivent appartenir à un domaine de `ALLOWED_EMAIL_DOMAINS`.

> 90 % des pannes de login viennent d'ici (redirect URI / secret / domaine), pas du code.
> Checklist : [`analyse/04-diagnostic-login.md`](analyse/04-diagnostic-login.md).

## 7. EmailJS

Service transactionnel (REST, côté serveur). Template à 4 variables : `to_email`, `subject`,
`title`, `message` (texte avec `white-space: pre-line`). IDs publics dans `vars`, clé privée en secret.
Mettre `MAIL_ENABLED=false` pour désactiver proprement (les envois sont alors loggés `mail.skipped`).

## 8. Rotation des credentials

| Credential | Procédure |
|---|---|
| **Clé API OCI** | OCI → User → API Keys → ajouter une nouvelle clé → `wrangler secret put OCI_PRIVATE_KEY` (+ mettre à jour la var `OCI_FINGERPRINT`) → re-déployer → **supprimer** l'ancienne clé. |
| **Secret Entra** | Entra → nouveau secret → `wrangler secret put ENTRA_CLIENT_SECRET` → re-déployer → supprimer l'ancien. |
| **EmailJS** | Régénérer la clé privée → `wrangler secret put EMAILJS_PRIVATE_KEY`. |
| **`SESSION_SECRET`** | Générer une nouvelle valeur → `wrangler secret put` → **déconnecte tout le monde** et rend les clés/mots de passe stockés illisibles (à re-télécharger / re-provisionner). À éviter sauf compromission. |

> 🔁 **Après toute fuite** (clé partagée en clair, commit accidentel) : **révoquer immédiatement**,
> roter, puis purger l'historique Git si nécessaire (`git filter-repo`).

## 9. Checklist « nouveau credential publié »

- [ ] La valeur n'apparaît **dans aucun fichier commité** (`git grep` la valeur → rien).
- [ ] Variable publique → `wrangler.jsonc` `vars` ; sensible → `wrangler secret put`.
- [ ] `.dev.vars` à jour pour le dev local (et bien ignoré par Git).
- [ ] Re-déploiement effectué (merge `main`) et vérifié (`/api/presets`, `/healthz`).
- [ ] Ancienne valeur révoquée si rotation.
