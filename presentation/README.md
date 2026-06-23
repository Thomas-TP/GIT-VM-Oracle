# Présentation — GIT VM Portal

**[`GIT-VM-Portal.pptx`](GIT-VM-Portal.pptx)** — présentation complète du projet (FR, 19 diapos) :
architecture, réconciliateur, catalogue & VM, rôles, snapshots, sécurité réseau, automatisation,
admin/monitoring, déploiement, chiffres clés, **diapo « Démo live »** (parcours à dérouler sur la
plateforme) et conclusion. Chaque diapo contient des **notes du présentateur**.

## Régénérer

Le `.pptx` est produit par [`generate.js`](generate.js) (pptxgenjs + react-icons + sharp) :

```bash
cd presentation
npm install
node generate.js
# puis recompresser (requis pour PowerPoint) :
python <skill-pptx>/scripts/rezip.py GIT-VM-Portal.pptx
```

> Note : les flèches de schéma doivent avoir des dimensions `w`/`h` **non négatives**
> (utiliser `flipV`/`flipH` pour l'orientation) — sinon PowerPoint refuse d'ouvrir le fichier.
