import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const fr = {
  app: { title: 'GIT VM Portal', tagline: 'Provisioning de machines virtuelles en self-service' },
  nav: { dashboard: 'Mes VMs', admin: 'Administration', logout: 'Déconnexion' },
  login: {
    subtitle: 'Connecte-toi avec ton compte Microsoft de l’organisation pour demander et gérer tes machines virtuelles.',
    button: 'Se connecter avec Microsoft',
  },
  common: {
    loading: 'Chargement…',
    error: 'Une erreur est survenue',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    close: 'Fermer',
    back: 'Retour',
    actions: 'Actions',
    region: 'Région',
    none: '—',
    copy: 'Copier',
    copied: 'Copié',
  },
  status: {
    pending: 'En attente',
    approved: 'Approuvée',
    rejected: 'Refusée',
    provisioning: 'Création…',
    active: 'Active',
    failed: 'Échec',
    terminated: 'Supprimée',
  },
  dashboard: {
    title: 'Mes machines virtuelles',
    subtitle: 'Demande une VM et suis son état en temps réel.',
    new: 'Nouvelle demande',
    empty: 'Aucune demande pour le moment.',
    emptyHint: 'Clique sur « Nouvelle demande » pour créer ta première VM.',
  },
  table: {
    id: 'ID',
    type: 'Type',
    purpose: 'Usage',
    status: 'Statut',
    access: 'Accès',
    created: 'Créée le',
    user: 'Utilisateur',
    region: 'Région',
  },
  form: {
    title: 'Demander une machine virtuelle',
    perf: 'Performance',
    storage: 'Stockage',
    os: 'Système',
    purpose: 'Usage / justification',
    purposePlaceholder: 'ex. environnement de test pour le backend',
    submit: 'Envoyer la demande',
    submitting: 'Envoi…',
    estCost: 'Coût estimé (24/7)',
    month: 'mois',
  },
  access: {
    provisioning: 'Création en cours…',
    downloadKey: 'Télécharger la clé SSH',
    ssh: 'Commande SSH',
    none: 'Aucun accès',
    ready: 'Prête',
  },
  actions: {
    view: 'Détails',
    terminate: 'Supprimer',
    approve: 'Approuver',
    reject: 'Refuser',
  },
  detail: {
    title: 'Demande #{{id}}',
    overview: 'Aperçu',
    connection: 'Connexion',
    ip: 'IP publique',
    instance: 'Instance AWS',
    sshCommand: 'Commande SSH',
    keyHint: 'La clé privée n’est téléchargeable que par toi. Garde-la en lieu sûr.',
    notReady: 'Les informations de connexion apparaîtront une fois la VM active.',
    adminNote: 'Note de l’administrateur',
    requestedBy: 'Demandée par',
    decidedBy: 'Décidée par',
    createdAt: 'Date de demande',
    decidedAt: 'Date de décision',
  },
  admin: {
    title: 'Administration',
    subtitle: 'Valide les demandes et gère le parc de VMs.',
    all: 'Toutes les demandes',
    filter: 'Filtrer par statut',
    allStatuses: 'Tous les statuts',
    stats: 'Vue d’ensemble',
  },
  confirm: {
    terminateTitle: 'Supprimer la VM ?',
    terminateBody: 'L’instance AWS sera définitivement terminée et la clé SSH supprimée. Action irréversible.',
    rejectTitle: 'Refuser la demande',
    rejectNote: 'Motif du refus (optionnel)',
    approveTitle: 'Approuver la demande',
    approveBody: 'La VM va être créée automatiquement sur AWS et les accès envoyés à l’utilisateur.',
  },
  toast: {
    requestCreated: 'Demande envoyée',
    approved: 'Demande approuvée — VM en création',
    rejected: 'Demande refusée',
    terminated: 'VM supprimée',
  },
};

const en: typeof fr = {
  app: { title: 'GIT VM Portal', tagline: 'Self-service virtual machine provisioning' },
  nav: { dashboard: 'My VMs', admin: 'Administration', logout: 'Sign out' },
  login: {
    subtitle: 'Sign in with your organization Microsoft account to request and manage virtual machines.',
    button: 'Sign in with Microsoft',
  },
  common: {
    loading: 'Loading…',
    error: 'Something went wrong',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    back: 'Back',
    actions: 'Actions',
    region: 'Region',
    none: '—',
    copy: 'Copy',
    copied: 'Copied',
  },
  status: {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    provisioning: 'Provisioning…',
    active: 'Active',
    failed: 'Failed',
    terminated: 'Terminated',
  },
  dashboard: {
    title: 'My virtual machines',
    subtitle: 'Request a VM and track its status in real time.',
    new: 'New request',
    empty: 'No requests yet.',
    emptyHint: 'Click “New request” to create your first VM.',
  },
  table: {
    id: 'ID',
    type: 'Type',
    purpose: 'Purpose',
    status: 'Status',
    access: 'Access',
    created: 'Created',
    user: 'User',
    region: 'Region',
  },
  form: {
    title: 'Request a virtual machine',
    perf: 'Performance',
    storage: 'Storage',
    os: 'Operating system',
    purpose: 'Purpose / justification',
    purposePlaceholder: 'e.g. test environment for the backend',
    submit: 'Submit request',
    submitting: 'Submitting…',
    estCost: 'Estimated cost (24/7)',
    month: 'month',
  },
  access: {
    provisioning: 'Provisioning…',
    downloadKey: 'Download SSH key',
    ssh: 'SSH command',
    none: 'No access',
    ready: 'Ready',
  },
  actions: {
    view: 'Details',
    terminate: 'Delete',
    approve: 'Approve',
    reject: 'Reject',
  },
  detail: {
    title: 'Request #{{id}}',
    overview: 'Overview',
    connection: 'Connection',
    ip: 'Public IP',
    instance: 'AWS instance',
    sshCommand: 'SSH command',
    keyHint: 'The private key can only be downloaded by you. Keep it safe.',
    notReady: 'Connection details will appear once the VM is active.',
    adminNote: 'Administrator note',
    requestedBy: 'Requested by',
    decidedBy: 'Decided by',
    createdAt: 'Requested at',
    decidedAt: 'Decided at',
  },
  admin: {
    title: 'Administration',
    subtitle: 'Approve requests and manage the VM fleet.',
    all: 'All requests',
    filter: 'Filter by status',
    allStatuses: 'All statuses',
    stats: 'Overview',
  },
  confirm: {
    terminateTitle: 'Delete the VM?',
    terminateBody: 'The AWS instance will be permanently terminated and the SSH key deleted. This cannot be undone.',
    rejectTitle: 'Reject request',
    rejectNote: 'Reason for rejection (optional)',
    approveTitle: 'Approve request',
    approveBody: 'The VM will be created automatically on AWS and access sent to the user.',
  },
  toast: {
    requestCreated: 'Request submitted',
    approved: 'Request approved — VM provisioning',
    rejected: 'Request rejected',
    terminated: 'VM deleted',
  },
};

function detectLng(): 'fr' | 'en' {
  const saved = localStorage.getItem('lang');
  if (saved === 'fr' || saved === 'en') return saved;
  return (navigator.language || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
}

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: detectLng(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLang(lng: 'fr' | 'en') {
  localStorage.setItem('lang', lng);
  i18n.changeLanguage(lng);
}

export default i18n;
