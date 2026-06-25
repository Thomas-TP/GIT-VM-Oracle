# Documentation — GIT VM Portal

**Commence par [`../AGENTS.md`](../AGENTS.md)** (contexte canonique IA + onboarding). Voir aussi
[`../CLAUDE.md`](../CLAUDE.md) (redirige vers AGENTS.md) et
[`../.claude/MEMOIRE-PROJET.md`](../.claude/MEMOIRE-PROJET.md) (mémoire).

## 🧭 Par où commencer

| Je veux… | Document |
|---|---|
| Comprendre et travailler sur le projet | [`../AGENTS.md`](../AGENTS.md) |
| Voir l'architecture (flux, données, sécurité) | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Déployer / publier | [`DEPLOYMENT.md`](DEPLOYMENT.md) |
| Gérer variables, secrets, IAM, Entra | [`CONFIGURATION.md`](CONFIGURATION.md) |
| Contribuer (workflow, conventions) | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Monitoring Grafana (local) | [`../monitoring/README.md`](../monitoring/README.md) |
| Décisions techniques | [`adr/`](adr/) |

## 📁 Structure

```
AGENTS.md                     Contexte canonique IA + onboarding (point d'entrée)
CLAUDE.md                     Redirige vers AGENTS.md
README.md                     Présentation du projet
CONTRIBUTING.md               Workflow, conventions, qualité
monitoring/                   Grafana local (docker-compose, dashboard, datasource)
.claude/MEMOIRE-PROJET.md     Mémoire projet (faits durables)
docs/
  ARCHITECTURE.md             Architecture, flux, modèle de données, sécurité, API
  DEPLOYMENT.md               Pipeline CI/CD (Cloudflare Workers Builds), publication, rollback
  CONFIGURATION.md            Variables, secrets, IAM OCI, Entra, EmailJS, rotation
  adr/                        Décisions d'architecture (ADR 0001 → 0008)
  analyse/                    Notes d'analyse (état des lieux, dette technique)
```
