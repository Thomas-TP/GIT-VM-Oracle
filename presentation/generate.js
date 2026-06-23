const pptxgen = require('pptxgenjs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const FA = require('react-icons/fa');

// ---- palette (cloud / sécurité) ----
const NAVY = '0E1B2E';      // dark background
const BLUE = '12355B';      // primary deep blue
const TEAL = '0FA3A3';      // accent teal
const MINT = '2EC4B6';      // supporting mint
const ICE = 'D9E4EC';       // light text on dark
const CORAL = 'FF6B5C';     // sharp accent (sécurité)
const WHITE = 'FFFFFF';
const INK = '14202E';       // near-black text
const MUTE = '5B6B7B';      // muted text
const TINT = 'F2F6F9';      // card tint on light
const TINTB = 'EAF3F3';     // teal-ish tint

const W = 13.333, H = 7.5, M = 0.7;

async function icon(IconComponent, color = WHITE, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(IconComponent, { color, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + png.toString('base64');
}
const shadow = () => ({ type: 'outer', color: '0B1622', blur: 9, offset: 3, angle: 90, opacity: 0.18 });

(async () => {
  const I = {
    cloud: await icon(FA.FaCloud), shield: await icon(FA.FaShieldAlt), server: await icon(FA.FaServer),
    lock: await icon(FA.FaLock), db: await icon(FA.FaDatabase), sync: await icon(FA.FaSyncAlt),
    users: await icon(FA.FaUsers), save: await icon(FA.FaSave), bolt: await icon(FA.FaBolt),
    net: await icon(FA.FaNetworkWired), rocket: await icon(FA.FaRocket), chart: await icon(FA.FaChartLine),
    play: await icon(FA.FaPlay), sitemap: await icon(FA.FaSitemap), layers: await icon(FA.FaLayerGroup),
    ushield: await icon(FA.FaUserShield), power: await icon(FA.FaPowerOff), clock: await icon(FA.FaRegClock),
    list: await icon(FA.FaThList), key: await icon(FA.FaKey), check: await icon(FA.FaCheckCircle),
    map: await icon(FA.FaMapSigns), flag: await icon(FA.FaFlagCheckered), ban: await icon(FA.FaBan),
    gauge: await icon(FA.FaTachometerAlt), windows: await icon(FA.FaWindows), linux: await icon(FA.FaLinux),
  };

  const p = new pptxgen();
  p.layout = 'LAYOUT_WIDE';
  p.author = 'GIT VM Portal';
  p.title = 'GIT VM Portal — Présentation';

  // ---------- helpers ----------
  function header(s, iconData, kicker, title, accent = TEAL) {
    s.addShape(p.shapes.OVAL, { x: M, y: 0.55, w: 0.62, h: 0.62, fill: { color: accent }, shadow: shadow() });
    s.addImage({ data: iconData, x: M + 0.16, y: 0.71, w: 0.3, h: 0.3 });
    s.addText(kicker.toUpperCase(), { x: M + 0.85, y: 0.5, w: 9, h: 0.3, fontFace: 'Calibri', fontSize: 11, color: accent, bold: true, charSpacing: 3, margin: 0 });
    s.addText(title, { x: M + 0.85, y: 0.76, w: 11.4, h: 0.6, fontFace: 'Calibri', fontSize: 27, color: INK, bold: true, margin: 0 });
  }
  function card(s, x, y, w, h, fill = WHITE) {
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, rectRadius: 0.09, shadow: shadow() });
  }
  function chip(s, x, y, iconData, circle, title, body, w = 3.7, h = 1.55) {
    card(s, x, y, w, h);
    s.addShape(p.shapes.OVAL, { x: x + 0.25, y: y + 0.27, w: 0.62, h: 0.62, fill: { color: circle } });
    s.addImage({ data: iconData, x: x + 0.41, y: y + 0.43, w: 0.3, h: 0.3 });
    s.addText(title, { x: x + 1.05, y: y + 0.24, w: w - 1.25, h: 0.4, fontFace: 'Calibri', fontSize: 15, bold: true, color: INK, margin: 0, valign: 'middle' });
    s.addText(body, { x: x + 1.05, y: y + 0.66, w: w - 1.25, h: h - 0.8, fontFace: 'Calibri', fontSize: 11.5, color: MUTE, margin: 0, valign: 'top', lineSpacingMultiple: 1.02 });
  }
  function pageNum(s, n) {
    s.addText(String(n).padStart(2, '0'), { x: W - 1.1, y: H - 0.5, w: 0.6, h: 0.3, align: 'right', fontFace: 'Calibri', fontSize: 10, color: MUTE });
    s.addText('GIT VM Portal', { x: M, y: H - 0.5, w: 4, h: 0.3, fontFace: 'Calibri', fontSize: 10, color: MUTE });
  }
  let N = 0;
  const light = () => { const s = p.addSlide(); s.background = { color: WHITE }; N++; pageNum(s, N); return s; };
  const dark = () => { const s = p.addSlide(); s.background = { color: NAVY }; N++; return s; };

  // ====== 1. TITLE ======
  {
    const s = dark();
    s.addShape(p.shapes.OVAL, { x: 9.4, y: -2.2, w: 6.5, h: 6.5, fill: { color: BLUE, transparency: 35 } });
    s.addShape(p.shapes.OVAL, { x: 11.2, y: 3.7, w: 4.6, h: 4.6, fill: { color: TEAL, transparency: 60 } });
    s.addShape(p.shapes.OVAL, { x: M, y: 1.7, w: 1.0, h: 1.0, fill: { color: TEAL }, shadow: shadow() });
    s.addImage({ data: I.cloud, x: M + 0.27, y: 1.97, w: 0.46, h: 0.46 });
    s.addText('PLATEFORME SELF-SERVICE DE VM · CLOUDFLARE × AWS', { x: M, y: 3.0, w: 11, h: 0.35, fontFace: 'Calibri', fontSize: 13, color: TEAL, bold: true, charSpacing: 3 });
    s.addText('GIT VM Portal', { x: M - 0.03, y: 3.35, w: 11.5, h: 1.2, fontFace: 'Calibri', fontSize: 60, color: WHITE, bold: true });
    s.addText('De la demande en libre-service à la VM AWS sécurisée : SSO, validation, provisioning automatique, snapshots, durcissement réseau et cycle de vie autonome.',
      { x: M, y: 4.6, w: 10.6, h: 1.0, fontFace: 'Calibri', fontSize: 16, color: ICE, lineSpacingMultiple: 1.1 });
    s.addText([{ text: 'Prod  ', options: { color: TEAL, bold: true } }, { text: 'git-vm-portal.thomas-prudhomme.workers.dev', options: { color: ICE } }],
      { x: M, y: 6.5, w: 11, h: 0.4, fontFace: 'Calibri', fontSize: 13 });
    s.addNotes('Diapo d’ouverture. Présenter le pitch : une plateforme self-service qui transforme une demande en VM AWS prête, sécurisée et gérée de bout en bout, hébergée sur Cloudflare Workers.');
  }

  // ====== 2. SOMMAIRE ======
  {
    const s = light();
    header(s, I.list, 'Sommaire', 'Ce que couvre cette présentation');
    const items = [
      [I.sitemap, BLUE, 'Architecture', 'Stack, flux, réconciliateur'],
      [I.layers, TEAL, 'Catalogue & VM', 'OS, multi-VM, groupes, nommage'],
      [I.ushield, MINT, 'Rôles', 'Membre · formateur · admin'],
      [I.save, BLUE, 'Snapshots EBS', 'Sauvegarde & restauration'],
      [I.shield, CORAL, 'Sécurité réseau', 'Durcissement & filtrage'],
      [I.bolt, TEAL, 'Cycle de vie auto', 'Inactivité, planification, échéance'],
      [I.chart, BLUE, 'Admin & monitoring', 'Console unifiée, Grafana'],
      [I.play, CORAL, 'Démo live', 'Parcours sur la plateforme'],
    ];
    let x = M, y = 1.7;
    items.forEach((it, i) => {
      chip(s, x, y, it[0], it[1], it[2], it[3], 2.86, 1.5);
      x += 3.04;
      if ((i + 1) % 4 === 0) { x = M; y += 1.72; }
    });
    s.addNotes('Annoncer le plan : on part de l’architecture, on descend vers les fonctionnalités (catalogue, rôles, snapshots), puis la sécurité réseau et le cycle de vie autonome, et on finit par une démo live.');
  }

  // ====== 3. LE BESOIN ======
  {
    const s = light();
    header(s, I.map, 'Contexte', 'Le besoin : des VM à la demande, sans friction');
    card(s, M, 1.75, 5.85, 4.7, TINT);
    s.addText('AVANT', { x: M + 0.35, y: 2.0, w: 5, h: 0.35, fontFace: 'Calibri', fontSize: 13, bold: true, color: CORAL, charSpacing: 2 });
    s.addText([
      { text: 'Demandes de VM par e-mail / tickets', options: { bullet: true, breakLine: true } },
      { text: 'Création manuelle, lente, source d’erreurs', options: { bullet: true, breakLine: true } },
      { text: 'Pas de suivi des coûts ni des échéances', options: { bullet: true, breakLine: true } },
      { text: 'VM oubliées qui tournent (et coûtent)', options: { bullet: true, breakLine: true } },
      { text: 'Sécurité réseau au cas par cas', options: { bullet: true } },
    ], { x: M + 0.35, y: 2.45, w: 5.2, h: 3.7, fontFace: 'Calibri', fontSize: 14.5, color: INK, paraSpaceAfter: 9 });

    card(s, 6.95, 1.75, 5.68, 4.7, TINTB);
    s.addText('AVEC GIT VM PORTAL', { x: 7.3, y: 2.0, w: 5, h: 0.35, fontFace: 'Calibri', fontSize: 13, bold: true, color: TEAL, charSpacing: 2 });
    s.addText([
      { text: 'Libre-service : je demande, je nomme, je choisis', options: { bullet: true, breakLine: true } },
      { text: 'Provisioning AWS automatique après validation', options: { bullet: true, breakLine: true } },
      { text: 'Dates obligatoires + suppression à l’échéance', options: { bullet: true, breakLine: true } },
      { text: 'Arrêt auto si inactive, garde-fous de coût', options: { bullet: true, breakLine: true } },
      { text: 'Durcissement réseau systématique', options: { bullet: true } },
    ], { x: 7.3, y: 2.45, w: 5.0, h: 3.7, fontFace: 'Calibri', fontSize: 14.5, color: INK, paraSpaceAfter: 9 });
    s.addNotes('Poser le problème (gestion manuelle, coûts, sécurité) puis la promesse de la plateforme. Insister sur “self-service + automatisation + sécurité par défaut”.');
  }

  // ====== 4. PARCOURS ======
  {
    const s = light();
    header(s, I.sync, 'Vue d’ensemble', 'Le parcours, de la connexion à la VM');
    const steps = [
      ['1', 'Connexion', 'SSO Microsoft Entra ID (OIDC)', BLUE],
      ['2', 'Demande', '1–4 VM nommées, catalogue + dates', TEAL],
      ['3', 'Validation', 'Un admin approuve (VM ou groupe)', MINT],
      ['4', 'Provisioning', 'EC2 + clé chiffrée + durcissement', BLUE],
      ['5', 'Exploitation', 'Accès, snapshots, planification', TEAL],
      ['6', 'Fin de vie', 'Arrêt inactivité · suppression échéance', CORAL],
    ];
    let x = M, y = 2.0;
    steps.forEach((st, i) => {
      card(s, x, y, 3.7, 2.0);
      s.addShape(p.shapes.OVAL, { x: x + 0.28, y: y + 0.3, w: 0.7, h: 0.7, fill: { color: st[3] } });
      s.addText(st[0], { x: x + 0.28, y: y + 0.3, w: 0.7, h: 0.7, align: 'center', valign: 'middle', fontFace: 'Calibri', fontSize: 24, bold: true, color: WHITE, margin: 0 });
      s.addText(st[1], { x: x + 1.1, y: y + 0.34, w: 2.4, h: 0.4, fontFace: 'Calibri', fontSize: 16, bold: true, color: INK, margin: 0 });
      s.addText(st[2], { x: x + 0.3, y: y + 1.15, w: 3.15, h: 0.7, fontFace: 'Calibri', fontSize: 12, color: MUTE, margin: 0, lineSpacingMultiple: 1.0 });
      x += 3.95;
      if ((i + 1) % 3 === 0) { x = M; y += 2.25; }
    });
    s.addNotes('Dérouler le parcours utilisateur de bout en bout en 6 étapes. C’est le fil rouge : chaque étape sera détaillée ensuite.');
  }

  // ====== 5. ARCHITECTURE ======
  {
    const s = light();
    header(s, I.sitemap, 'Architecture', 'Un Worker au centre, la DB comme état désiré');
    const box = (x, y, w, h, fill, tcol, title, sub, iconData) => {
      card(s, x, y, w, h, fill);
      if (iconData) { s.addShape(p.shapes.OVAL, { x: x + 0.22, y: y + h / 2 - 0.31, w: 0.62, h: 0.62, fill: { color: tcol } }); s.addImage({ data: iconData, x: x + 0.38, y: y + h / 2 - 0.15, w: 0.3, h: 0.3 }); }
      const tx = iconData ? x + 1.0 : x + 0.25;
      s.addText(title, { x: tx, y: y + 0.22, w: w - (tx - x) - 0.2, h: 0.4, fontFace: 'Calibri', fontSize: 15, bold: true, color: tcol === WHITE ? INK : tcol, margin: 0 });
      s.addText(sub, { x: tx, y: y + 0.62, w: w - (tx - x) - 0.2, h: h - 0.7, fontFace: 'Calibri', fontSize: 11, color: MUTE, margin: 0 });
    };
    const arrow = (x1, y1, x2, y2) => s.addShape(p.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipV: y2 < y1, line: { color: TEAL, width: 2, endArrowType: 'triangle' } });
    box(M, 2.7, 3.0, 1.5, BLUE, WHITE, 'Navigateur', 'SPA React 19 (Vite, Tailwind), assets statiques', I.cloud);
    box(4.6, 2.7, 3.7, 1.5, TINTB, TEAL, 'Cloudflare Worker', 'Hono · OIDC · API JSON · cron scheduled()', I.server);
    box(9.0, 0.95, 3.6, 1.05, TINT, BLUE, 'D1 (SQLite)', 'État désiré : demandes, VM, snapshots, audit', I.db);
    box(9.0, 2.25, 3.6, 1.05, TINT, BLUE, 'AWS EC2 / EBS', 'Provisioning réel (aws4fetch)', I.server);
    box(9.0, 3.55, 3.6, 1.05, TINT, BLUE, 'CloudWatch', 'CPU → arrêt sur inactivité', I.gauge);
    box(9.0, 4.85, 3.6, 1.05, TINT, BLUE, 'EmailJS / Grafana', 'Notifications · monitoring', I.chart);
    arrow(3.0, 3.45, 4.6, 3.45);
    arrow(8.3, 3.25, 9.0, 1.5); arrow(8.3, 3.4, 9.0, 2.78); arrow(8.3, 3.55, 9.0, 4.08); arrow(8.3, 3.7, 9.0, 5.38);
    card(s, M, 4.55, 7.3, 1.9, TINT);
    s.addShape(p.shapes.OVAL, { x: M + 0.28, y: 4.85, w: 0.7, h: 0.7, fill: { color: CORAL } });
    s.addImage({ data: I.sync, x: M + 0.44, y: 5.01, w: 0.38, h: 0.38 });
    s.addText('Le réconciliateur (cron */2 min)', { x: M + 1.15, y: 4.8, w: 6, h: 0.4, fontFace: 'Calibri', fontSize: 15, bold: true, color: INK, margin: 0 });
    s.addText('Boucle qui aligne en continu le réel AWS sur la DB : provisioning→active, drift, retry, échéance, inactivité, snapshots.',
      { x: M + 1.15, y: 5.2, w: 6.0, h: 1.1, fontFace: 'Calibri', fontSize: 12, color: MUTE, margin: 0, lineSpacingMultiple: 1.05 });
    s.addNotes('Expliquer la topologie : la SPA parle au Worker ; le Worker porte l’auth, l’API et le cron ; il pilote AWS et lit/écrit D1. Insister : D1 = état désiré, AWS = état réel, le cron réconcilie.');
  }

  // ====== 6. STACK ======
  {
    const s = light();
    header(s, I.layers, 'Stack', 'Des briques modernes, sans serveur à gérer');
    const items = [
      [I.cloud, BLUE, 'Frontend', 'React 19 · Vite · TypeScript · Tailwind v4 · TanStack Query · i18n FR/EN'],
      [I.server, TEAL, 'Backend', 'Cloudflare Worker (Hono) — API JSON + cron scheduled()'],
      [I.db, BLUE, 'Données', 'Cloudflare D1 (SQLite), migrations additives'],
      [I.lock, MINT, 'Auth', 'Microsoft Entra ID (OIDC), in-Worker, sans librairie'],
      [I.gauge, BLUE, 'Compute', 'AWS EC2 + EBS + CloudWatch via aws4fetch (eu-central-2)'],
      [I.rocket, CORAL, 'CI/CD', 'Cloudflare Workers Builds : build + migrate + deploy sur main'],
    ];
    let x = M, y = 1.8;
    items.forEach((it, i) => {
      chip(s, x, y, it[0], it[1], it[2], it[3], 3.9, 1.45);
      x += 4.07;
      if ((i + 1) % 3 === 0) { x = M; y += 1.62; }
    });
    s.addText('Zéro serveur à administrer · déploiement par simple merge · coût marginal', { x: M, y: 5.25, w: 12, h: 0.4, align: 'center', italic: true, fontFace: 'Calibri', fontSize: 13, color: TEAL });
    s.addNotes('Mettre en avant le “serverless” : pas d’infra à patcher, scaling automatique, et un pipeline de déploiement trivial.');
  }

  // ====== 7. RÉCONCILIATEUR ======
  {
    const s = dark();
    s.addShape(p.shapes.OVAL, { x: M, y: 0.55, w: 0.62, h: 0.62, fill: { color: CORAL }, shadow: shadow() });
    s.addImage({ data: I.sync, x: M + 0.16, y: 0.71, w: 0.3, h: 0.3 });
    s.addText('LE PATTERN CENTRAL', { x: M + 0.85, y: 0.5, w: 9, h: 0.3, fontFace: 'Calibri', fontSize: 11, color: CORAL, bold: true, charSpacing: 3, margin: 0 });
    s.addText('Le réconciliateur : une boucle, toute la logique', { x: M + 0.85, y: 0.76, w: 11.4, h: 0.6, fontFace: 'Calibri', fontSize: 27, color: WHITE, bold: true, margin: 0 });
    s.addText('« La DB décrit l’état souhaité. Une cron */2 min rapproche le réel AWS de cet état — idempotent, sans mécanisme parallèle. »',
      { x: M, y: 1.65, w: 12, h: 0.6, fontFace: 'Calibri', fontSize: 14.5, italic: true, color: ICE });
    const steps = [
      [I.sync, 'reconcile', 'provisioning→active, détection de drift'],
      [I.clock, 'applySchedules', 'démarrage/arrêt planifiés par VM'],
      [I.sync, 'retryFailed', 're-tente les provisioning échoués (max 3)'],
      [I.flag, 'enforceExpiry', 'snapshot auto puis suppression à l’échéance'],
      [I.power, 'enforceIdleStop', 'arrêt si CPU < 10 % sur 3 h (CloudWatch)'],
      [I.save, 'syncSnapshots', 'suit les snapshots EBS en cours'],
    ];
    let x = M, y = 2.5;
    steps.forEach((st, i) => {
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: 3.85, h: 1.75, fill: { color: BLUE }, rectRadius: 0.09, shadow: shadow() });
      s.addShape(p.shapes.OVAL, { x: x + 0.25, y: y + 0.27, w: 0.6, h: 0.6, fill: { color: TEAL } });
      s.addImage({ data: st[0], x: x + 0.4, y: y + 0.42, w: 0.3, h: 0.3 });
      s.addText(st[1], { x: x + 1.0, y: y + 0.3, w: 2.7, h: 0.45, fontFace: 'Calibri', fontSize: 15, bold: true, color: WHITE, margin: 0 });
      s.addText(st[2], { x: x + 0.3, y: y + 1.0, w: 3.3, h: 0.65, fontFace: 'Calibri', fontSize: 11.5, color: ICE, margin: 0, lineSpacingMultiple: 1.0 });
      x += 4.05;
      if ((i + 1) % 3 === 0) { x = M; y += 1.95; }
    });
    s.addNotes('C’est LE concept d’architecture (ADR 0004). Tout ce qui touche au cycle de vie passe par cette boucle. Lister les 6 étapes et insister sur l’idempotence.');
  }

  // ====== 8. CYCLE DE VIE ======
  {
    const s = light();
    header(s, I.clock, 'Cycle de vie', 'Une VM, de sa naissance à sa suppression');
    const tl = [
      ['Demandée', 'pending', BLUE],
      ['Validée', 'approved', MINT],
      ['Provisioning', 'EC2 + clé', TEAL],
      ['Active', 'connectable', MINT],
      ['Snapshot', 'sauvegarde', BLUE],
      ['Expirée', 'supprimée', CORAL],
    ];
    const y = 3.1, x0 = M + 0.3, gap = (W - 2 * M - 0.6) / (tl.length - 1);
    s.addShape(p.shapes.LINE, { x: x0, y: y + 0.35, w: gap * (tl.length - 1), h: 0, line: { color: 'C9D6DF', width: 2 } });
    tl.forEach((t, i) => {
      const cx = x0 + i * gap;
      s.addShape(p.shapes.OVAL, { x: cx - 0.35, y: y, w: 0.7, h: 0.7, fill: { color: t[2] }, shadow: shadow() });
      s.addText(String(i + 1), { x: cx - 0.35, y: y, w: 0.7, h: 0.7, align: 'center', valign: 'middle', fontFace: 'Calibri', fontSize: 20, bold: true, color: WHITE, margin: 0 });
      s.addText(t[0], { x: cx - 1.0, y: y - 0.7, w: 2.0, h: 0.4, align: 'center', fontFace: 'Calibri', fontSize: 14, bold: true, color: INK, margin: 0 });
      s.addText(t[1], { x: cx - 1.0, y: y + 0.78, w: 2.0, h: 0.4, align: 'center', fontFace: 'Calibri', fontSize: 11.5, color: MUTE, margin: 0 });
    });
    card(s, M, 5.0, 12.0, 1.5, TINT);
    s.addText([
      { text: 'Garde-fous : ', options: { bold: true, color: INK } },
      { text: 'dates de fin obligatoires · extinction nocturne · arrêt sur inactivité · suppression automatique à l’échéance (snapshot auto possible avant) · budget AWS plafonné à 50 $ avec alertes e-mail.', options: { color: MUTE } },
    ], { x: M + 0.35, y: 5.25, w: 11.3, h: 1.0, fontFace: 'Calibri', fontSize: 13.5, valign: 'middle', lineSpacingMultiple: 1.1 });
    s.addNotes('Montrer la frise : chaque VM suit ce cycle. Les statuts sont réels (pending→…→terminated) ; “expirée” est dérivé. Souligner les garde-fous de coût.');
  }

  // ====== 9. CATALOGUE & MULTI-VM ======
  {
    const s = light();
    header(s, I.layers, 'Catalogue', 'Performance × Stockage × OS, en quelques clics');
    card(s, M, 1.8, 6.0, 2.3, TINT);
    s.addText('7 systèmes au catalogue', { x: M + 0.35, y: 2.0, w: 5.4, h: 0.4, fontFace: 'Calibri', fontSize: 15, bold: true, color: INK });
    s.addImage({ data: I.linux, x: M + 0.4, y: 2.55, w: 0.4, h: 0.4 });
    s.addText('Ubuntu 24.04 · Debian 12 · Amazon Linux 2023 · Rocky 9 · AlmaLinux 9', { x: M + 0.95, y: 2.5, w: 4.9, h: 0.6, fontFace: 'Calibri', fontSize: 12.5, color: MUTE, valign: 'middle', margin: 0 });
    s.addImage({ data: I.windows, x: M + 0.4, y: 3.35, w: 0.4, h: 0.4 });
    s.addText('Windows Server 2022 · Windows poste de travail (RDP)', { x: M + 0.95, y: 3.3, w: 4.9, h: 0.6, fontFace: 'Calibri', fontSize: 12.5, color: MUTE, valign: 'middle', margin: 0 });

    chip(s, 7.1, 1.8, I.layers, TEAL, 'Multi-VM & groupes', '1 à 4 VM d’un coup, chacune configurée. >1 VM ⇒ groupe (piloté/validé ensemble).', 5.55, 1.08);
    chip(s, 7.1, 3.0, I.list, BLUE, 'Nom obligatoire', 'Chaque VM est nommée → tag AWS « nom.préfixe-email » (ex. python.thomas.prudhomme).', 5.55, 1.1);

    card(s, M, 4.35, 12.0, 2.1, TINTB);
    s.addText('Outils de cours préinstallés', { x: M + 0.35, y: 4.55, w: 6, h: 0.4, fontFace: 'Calibri', fontSize: 15, bold: true, color: TEAL });
    s.addText('Un bundle optionnel (Cloud, Web, Data, Cybersécurité…) installe les logiciels au premier démarrage via cloud-init (Linux) / EC2Launch (Windows) ; la VM signale « outils prêts » quand c’est terminé.',
      { x: M + 0.35, y: 4.95, w: 11.3, h: 1.3, fontFace: 'Calibri', fontSize: 13.5, color: INK, lineSpacingMultiple: 1.1 });
    s.addNotes('Le catalogue est la source de vérité (presets.ts). Montrer la combinatoire perf×stockage×OS, la création multi-VM avec groupes, le nommage, et les bundles d’outils par cours.');
  }

  // ====== 10. RÔLES ======
  {
    const s = light();
    header(s, I.ushield, 'Rôles', 'Trois niveaux, dont un rôle formateur');
    chip(s, M, 1.85, I.users, BLUE, 'Membre', 'Demande et gère ses propres VM (accès, snapshots, planification).', 3.85, 2.0);
    chip(s, M + 4.07, 1.85, I.ushield, TEAL, 'Formateur', 'Membre + page « Demande groupée » : crée un lot et l’attribue à des utilisateurs.', 3.85, 2.0);
    chip(s, M + 8.14, 1.85, I.shield, CORAL, 'Admin', 'Valide tout, pilote la console VM, gère les rôles. Accès formateur inclus.', 3.85, 2.0);
    card(s, M, 4.2, 12.0, 2.3, TINTB);
    s.addShape(p.shapes.OVAL, { x: M + 0.3, y: 4.5, w: 0.7, h: 0.7, fill: { color: TEAL } });
    s.addImage({ data: I.users, x: M + 0.46, y: 4.66, w: 0.38, h: 0.38 });
    s.addText('Demande groupée (formateur)', { x: M + 1.2, y: 4.5, w: 8, h: 0.4, fontFace: 'Calibri', fontSize: 16, bold: true, color: INK, margin: 0 });
    s.addText([
      { text: '1 lot de 1 à 30 VM, attribué en round-robin', options: { bold: true, color: INK } },
      { text: '  —  ex. 10 VM / 5 utilisateurs = 2 chacun. Chaque VM est créée au nom de l’utilisateur attribué et reste soumise à la validation admin.', options: { color: MUTE } },
    ], { x: M + 1.2, y: 4.95, w: 10.6, h: 1.4, fontFace: 'Calibri', fontSize: 14, lineSpacingMultiple: 1.15, margin: 0 });
    s.addNotes('Le rôle formateur est la nouveauté clé : il permet de provisionner des TP entiers. Expliquer la répartition round-robin et la validation admin obligatoire.');
  }

  // ====== 11. SNAPSHOTS ======
  {
    const s = light();
    header(s, I.save, 'Snapshots EBS', 'Sauvegarder, restaurer, nettoyer');
    chip(s, M, 1.85, I.save, BLUE, 'Créer / lister', 'Snapshot EBS du disque racine, suivi d’état par le réconciliateur.', 5.85, 1.5);
    chip(s, 6.95, 1.85, I.shield, TEAL, 'Auto avant suppression', 'Option « snapshot automatique » avant expiration ou suppression.', 5.68, 1.5);
    chip(s, M, 3.55, I.sync, MINT, 'Restaurer à la création', 'Relancer une VM depuis un snapshot (AMI enregistrée, même disque/OS).', 5.85, 1.5);
    chip(s, 6.95, 3.55, I.ban, CORAL, 'Supprimer', 'Effacer un snapshot ; suppression en cascade quand la VM quitte la liste.', 5.68, 1.5);
    card(s, M, 5.35, 12.0, 1.1, TINT);
    s.addText([
      { text: 'Décision : ', options: { bold: true, color: INK } },
      { text: 'on garde le snapshot EBS natif (fiable, rapide). L’export local VMware/VirtualBox a été retiré — non fiable hors AWS (cf. ADR 0009).', options: { color: MUTE } },
    ], { x: M + 0.35, y: 5.55, w: 11.3, h: 0.7, fontFace: 'Calibri', fontSize: 13, valign: 'middle', lineSpacingMultiple: 1.05 });
    s.addNotes('Les snapshots couvrent sauvegarde + restauration. Mentionner le snapshot-avant-suppression et la cascade de nettoyage. Préciser le choix EBS-only (ADR 0009).');
  }

  // ====== 12. SÉCURITÉ — ACCÈS ======
  {
    const s = light();
    header(s, I.key, 'Sécurité · Accès', 'Des accès chiffrés, propres à chaque VM');
    chip(s, M, 1.85, I.key, BLUE, 'Clé SSH unique (Linux)', 'Paire ed25519 générée par VM, clé privée chiffrée AES-GCM, remise au seul propriétaire.', 5.85, 1.6);
    chip(s, 6.95, 1.85, I.windows, TEAL, 'Mot de passe RDP (Windows)', 'Mot de passe admin généré via UserData, chiffré, port 3389.', 5.68, 1.6);
    chip(s, M, 3.65, I.lock, MINT, 'Secrets côté Cloudflare', 'SESSION_SECRET, secrets Entra/AWS/EmailJS via Wrangler — jamais commités.', 5.85, 1.6);
    chip(s, 6.95, 3.65, I.shield, CORAL, 'Chiffrement au repos', 'AES-GCM dérivé de SESSION_SECRET pour clés SSH et mots de passe stockés.', 5.68, 1.6);
    s.addText('Authentification SSO · aucun mot de passe utilisateur stocké · journal d’audit sur les actions sensibles', { x: M, y: 5.55, w: 12, h: 0.5, align: 'center', italic: true, fontFace: 'Calibri', fontSize: 13, color: TEAL });
    s.addNotes('Volet sécurité “accès” : chaque VM a sa propre clé/mot de passe, chiffré au repos. Les secrets vivent dans Cloudflare, pas dans le repo. SSO + audit complètent.');
  }

  // ====== 13. SÉCURITÉ RÉSEAU (dark, emphasis) ======
  {
    const s = dark();
    s.addShape(p.shapes.OVAL, { x: M, y: 0.55, w: 0.62, h: 0.62, fill: { color: CORAL }, shadow: shadow() });
    s.addImage({ data: I.shield, x: M + 0.16, y: 0.71, w: 0.3, h: 0.3 });
    s.addText('SÉCURITÉ · RÉSEAU', { x: M + 0.85, y: 0.5, w: 9, h: 0.3, fontFace: 'Calibri', fontSize: 11, color: CORAL, bold: true, charSpacing: 3, margin: 0 });
    s.addText('Durcissement « comme une multinationale »', { x: M + 0.85, y: 0.76, w: 11.4, h: 0.6, fontFace: 'Calibri', fontSize: 27, color: WHITE, bold: true, margin: 0 });
    s.addText('Un utilisateur root peut défaire ce qui est dans la VM → la vraie barrière est au réseau.',
      { x: M, y: 1.65, w: 12, h: 0.5, fontFace: 'Calibri', fontSize: 14.5, italic: true, color: ICE });

    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: M, y: 2.35, w: 5.95, h: 4.1, fill: { color: BLUE }, rectRadius: 0.09, shadow: shadow() });
    s.addShape(p.shapes.OVAL, { x: M + 0.3, y: 2.65, w: 0.62, h: 0.62, fill: { color: TEAL } });
    s.addImage({ data: I.server, x: M + 0.46, y: 2.81, w: 0.3, h: 0.3 });
    s.addText('Dans la VM (Linux + Windows)', { x: M + 1.05, y: 2.66, w: 4.7, h: 0.5, fontFace: 'Calibri', fontSize: 15, bold: true, color: WHITE, margin: 0, valign: 'middle' });
    s.addText([
      { text: 'DNS forcé → Cloudflare for Families (bloque adulte + malware)', options: { bullet: true, breakLine: true } },
      { text: 'Blocage des ports torrent / P2P', options: { bullet: true, breakLine: true } },
      { text: 'Hostname verrouillé (anti-renommage)', options: { bullet: true } },
    ], { x: M + 0.35, y: 3.45, w: 5.3, h: 2.8, fontFace: 'Calibri', fontSize: 14, color: ICE, paraSpaceAfter: 12 });

    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 6.7, y: 2.35, w: 5.95, h: 4.1, fill: { color: CORAL }, rectRadius: 0.09, shadow: shadow() });
    s.addShape(p.shapes.OVAL, { x: 7.0, y: 2.65, w: 0.62, h: 0.62, fill: { color: WHITE } });
    s.addImage({ data: I.net, x: 7.16, y: 2.81, w: 0.3, h: 0.3 });
    s.addText('Au réseau (non contournable)', { x: 7.75, y: 2.66, w: 4.7, h: 0.5, fontFace: 'Calibri', fontSize: 15, bold: true, color: WHITE, margin: 0, valign: 'middle' });
    s.addText([
      { text: 'Egress du Security Group en liste blanche (default-deny)', options: { bullet: true, breakLine: true } },
      { text: 'DNS 53 autorisé uniquement vers Cloudflare → filtrage imposé', options: { bullet: true, breakLine: true } },
      { text: 'Torrents / P2P / sites X bloqués, même pour un root', options: { bullet: true } },
    ], { x: 7.05, y: 3.45, w: 5.35, h: 2.8, fontFace: 'Calibri', fontSize: 14, color: WHITE, paraSpaceAfter: 12 });
    s.addNotes('Slide sécurité réseau — le point fort. Deux couches : in-VM (best-effort) et réseau (Security Group, non contournable). C’est la couche réseau qui garantit le blocage même face à un utilisateur admin de sa VM.');
  }

  // ====== 14. AUTOMATISATION ======
  {
    const s = light();
    header(s, I.bolt, 'Automatisation', 'Le cycle de vie tourne tout seul');
    chip(s, M, 1.85, I.power, BLUE, 'Arrêt sur inactivité', 'CPU CloudWatch < 10 % sur 3 h → arrêt + notification. Relançable.', 5.85, 1.55);
    chip(s, 6.95, 1.85, I.clock, TEAL, 'Planification par VM', 'Démarrage / extinction programmés (jours + horaires, heure de Genève).', 5.68, 1.55);
    chip(s, M, 3.55, I.flag, MINT, 'Suppression à l’échéance', 'À la date de fin : snapshot auto possible, puis terminate + nettoyage.', 5.85, 1.55);
    chip(s, 6.95, 3.55, I.gauge, CORAL, 'Garde-fous de coût', 'Extinction nocturne + budget AWS 50 $/mois avec alertes e-mail.', 5.68, 1.55);
    card(s, M, 5.35, 12.0, 1.1, TINTB);
    s.addText([
      { text: 'Résultat : ', options: { bold: true, color: TEAL } },
      { text: 'pas de VM oubliée, pas de coût qui dérape — l’infrastructure se gère elle-même via le réconciliateur.', options: { color: INK } },
    ], { x: M + 0.35, y: 5.55, w: 11.3, h: 0.7, fontFace: 'Calibri', fontSize: 14, valign: 'middle' });
    s.addNotes('Tout est automatique : inactivité, planning, échéance, garde-fous. Le message : l’infra s’auto-gère, l’admin n’a presque rien à faire au quotidien.');
  }

  // ====== 15. ADMIN & MONITORING ======
  {
    const s = light();
    header(s, I.chart, 'Admin & monitoring', 'Tout piloter depuis une console unifiée');
    chip(s, M, 1.85, I.check, BLUE, 'Console VM unifiée', 'Demandes + machines fusionnées : validation en cartes (groupe / VM seule), actions cycle de vie inline.', 5.85, 1.75);
    chip(s, 6.95, 1.85, I.ushield, TEAL, 'Gestion des rôles', 'Promouvoir membre / formateur / admin en un clic.', 5.68, 1.75);
    chip(s, M, 3.8, I.chart, MINT, 'Monitoring Grafana', 'Tableaux de bord (coûts, VM, logs) + endpoints /api/monitoring.', 5.85, 1.55);
    chip(s, 6.95, 3.8, I.list, CORAL, 'Audit & export', 'Journal d’audit des actions sensibles + export CSV des demandes.', 5.68, 1.55);
    s.addText('Recherche · filtres · pagination · thème clair-sombre · FR / EN', { x: M, y: 5.7, w: 12, h: 0.4, align: 'center', italic: true, fontFace: 'Calibri', fontSize: 13, color: TEAL });
    s.addNotes('Côté admin : une seule console pour valider et opérer les VM, plus la gestion des rôles, le monitoring Grafana, l’audit et l’export CSV.');
  }

  // ====== 16. DÉPLOIEMENT ======
  {
    const s = light();
    header(s, I.rocket, 'Déploiement', 'Livrer = merger sur main');
    const steps = [['1', 'Pull request', 'Branche + vérifs (typecheck, build)'], ['2', 'Merge sur main', 'Déclenche Cloudflare Workers Builds'], ['3', 'Migrate + Deploy', 'Migrations D1 remote appliquées, puis deploy'], ['4', 'En ligne', 'Vérif /healthz et /api/presets']];
    let x = M, y = 2.2;
    steps.forEach((st) => {
      card(s, x, y, 2.86, 2.2);
      s.addShape(p.shapes.OVAL, { x: x + 1.08, y: y + 0.3, w: 0.7, h: 0.7, fill: { color: TEAL } });
      s.addText(st[0], { x: x + 1.08, y: y + 0.3, w: 0.7, h: 0.7, align: 'center', valign: 'middle', fontFace: 'Calibri', fontSize: 22, bold: true, color: WHITE, margin: 0 });
      s.addText(st[1], { x: x + 0.15, y: y + 1.15, w: 2.56, h: 0.4, align: 'center', fontFace: 'Calibri', fontSize: 14.5, bold: true, color: INK, margin: 0 });
      s.addText(st[2], { x: x + 0.2, y: y + 1.55, w: 2.46, h: 0.6, align: 'center', fontFace: 'Calibri', fontSize: 11, color: MUTE, margin: 0, lineSpacingMultiple: 1.0 });
      x += 3.04;
    });
    card(s, M, 4.9, 12.0, 1.5, TINT);
    s.addText([
      { text: 'Aucun « wrangler deploy » manuel. ', options: { bold: true, color: INK } },
      { text: 'Le pipeline applique les migrations avant le déploiement. Les branches non-prod ne déploient rien.', options: { color: MUTE } },
    ], { x: M + 0.35, y: 5.15, w: 11.3, h: 1.0, fontFace: 'Calibri', fontSize: 13.5, valign: 'middle', lineSpacingMultiple: 1.1 });
    s.addNotes('Le déploiement est trivial et sûr : une PR mergée déclenche build + migrations + deploy. Insister sur l’ordre migrate→deploy géré automatiquement.');
  }

  // ====== 17. CHIFFRES ======
  {
    const s = light();
    header(s, I.gauge, 'En chiffres', 'Le projet d’un coup d’œil');
    const stats = [['7', 'systèmes au catalogue', BLUE], ['3', 'rôles (dont formateur)', TEAL], ['1–30', 'VM par demande groupée', MINT], ['*/2', 'min : cron de réconciliation', BLUE], ['3 h', 'avant arrêt sur inactivité', CORAL], ['50 $', 'plafond budget AWS + alertes', TEAL]];
    let x = M, y = 1.9;
    stats.forEach((st, i) => {
      card(s, x, y, 3.9, 2.0);
      s.addText(st[0], { x: x + 0.3, y: y + 0.3, w: 3.3, h: 0.95, fontFace: 'Calibri', fontSize: 46, bold: true, color: st[2], margin: 0 });
      s.addText(st[1], { x: x + 0.32, y: y + 1.3, w: 3.3, h: 0.6, fontFace: 'Calibri', fontSize: 13.5, color: MUTE, margin: 0, lineSpacingMultiple: 1.0 });
      x += 4.07;
      if ((i + 1) % 3 === 0) { x = M; y += 2.2; }
    });
    s.addNotes('Quelques chiffres marquants pour ancrer le projet : catalogue, rôles, capacité de la demande groupée, fréquence du cron, seuils d’automatisation et budget.');
  }

  // ====== 18. DÉMO (dark) ======
  {
    const s = dark();
    s.addShape(p.shapes.OVAL, { x: 10.0, y: -2.0, w: 6.0, h: 6.0, fill: { color: BLUE, transparency: 40 } });
    s.addShape(p.shapes.OVAL, { x: M, y: 0.6, w: 0.95, h: 0.95, fill: { color: CORAL }, shadow: shadow() });
    s.addImage({ data: I.play, x: M + 0.28, y: 0.86, w: 0.42, h: 0.42 });
    s.addText('DÉMO LIVE', { x: M + 1.2, y: 0.62, w: 9, h: 0.35, fontFace: 'Calibri', fontSize: 13, color: CORAL, bold: true, charSpacing: 3, margin: 0 });
    s.addText('À vous de jouer — parcours sur la plateforme', { x: M + 1.2, y: 0.95, w: 11.4, h: 0.7, fontFace: 'Calibri', fontSize: 26, color: WHITE, bold: true, margin: 0 });

    const demo = [
      ['1', 'Connexion SSO', 'Se connecter en Microsoft Entra ID.'],
      ['2', 'Créer une VM', 'Nommer, choisir OS / perf / dates, justifier.'],
      ['3', 'Valider (admin)', 'Approuver la demande dans la console VM.'],
      ['4', 'Se connecter', 'VM active → clé SSH (Linux) ou RDP (Windows).'],
      ['5', 'Snapshot', 'Onglet Snapshots → créer une sauvegarde EBS.'],
      ['6', 'Demande groupée', 'Formateur : créer un lot, répartir sur des users.'],
      ['7', 'Sécurité', 'Montrer DNS filtré + blocage (durcissement).'],
      ['8', 'Automatisation', 'Planification / arrêt inactivité / échéance.'],
    ];
    let x = M, y = 2.1;
    demo.forEach((d, i) => {
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: 5.95, h: 1.16, fill: { color: BLUE }, rectRadius: 0.08, shadow: shadow() });
      s.addShape(p.shapes.OVAL, { x: x + 0.22, y: y + 0.28, w: 0.6, h: 0.6, fill: { color: TEAL } });
      s.addText(d[0], { x: x + 0.22, y: y + 0.28, w: 0.6, h: 0.6, align: 'center', valign: 'middle', fontFace: 'Calibri', fontSize: 18, bold: true, color: WHITE, margin: 0 });
      s.addText(d[1], { x: x + 0.95, y: y + 0.16, w: 4.85, h: 0.4, fontFace: 'Calibri', fontSize: 14.5, bold: true, color: WHITE, margin: 0 });
      s.addText(d[2], { x: x + 0.95, y: y + 0.58, w: 4.9, h: 0.5, fontFace: 'Calibri', fontSize: 11.5, color: ICE, margin: 0 });
      x += 6.2;
      if ((i + 1) % 2 === 0) { x = M; y += 1.32; }
    });
    s.addNotes('Slide de transition vers la démo. Dérouler le parcours dans l’ordre sur la plateforme. Prévoir un plan B (captures) si le réseau ou une VM tarde. Astuce : avoir une VM déjà active pour la partie connexion/snapshot.');
  }

  // ====== 19. MERCI ======
  {
    const s = dark();
    s.addShape(p.shapes.OVAL, { x: 9.6, y: 2.2, w: 6.5, h: 6.5, fill: { color: BLUE, transparency: 40 } });
    s.addShape(p.shapes.OVAL, { x: -1.6, y: -1.6, w: 4.6, h: 4.6, fill: { color: TEAL, transparency: 60 } });
    s.addText('MERCI', { x: M, y: 2.6, w: 11, h: 1.0, fontFace: 'Calibri', fontSize: 54, color: WHITE, bold: true, charSpacing: 2 });
    s.addText('GIT VM Portal — self-service, automatisé, sécurisé, sur Cloudflare × AWS.', { x: M, y: 3.8, w: 11, h: 0.6, fontFace: 'Calibri', fontSize: 17, color: ICE });
    s.addText([
      { text: 'Démo : ', options: { color: TEAL, bold: true } },
      { text: 'git-vm-portal.thomas-prudhomme.workers.dev', options: { color: ICE } },
    ], { x: M, y: 4.7, w: 11, h: 0.4, fontFace: 'Calibri', fontSize: 14 });
    s.addText([
      { text: 'Doc : ', options: { color: TEAL, bold: true } },
      { text: 'AGENTS.md (référence canonique) · ADR 0001 → 0009', options: { color: ICE } },
    ], { x: M, y: 5.15, w: 11, h: 0.4, fontFace: 'Calibri', fontSize: 14 });
    s.addNotes('Conclusion : rappeler les 3 mots-clés (self-service, automatisé, sécurisé) et inviter aux questions / à la démo.');
  }

  await p.writeFile({ fileName: 'GIT-VM-Portal.pptx' });
  console.log('OK slides=' + N);
})();
