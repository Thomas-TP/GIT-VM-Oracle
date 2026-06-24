// Create an OCI Budget (cost guardrail) + alert rules on the tenancy.
// Target: 100 CHF/month cap, email alerts at 20 / 50 / 100 (ACTUAL spend).
// NOTE: an OCI budget only ALERTS — it does NOT stop spending. The real "no card
// charge" guarantee is keeping the account on credits/Free Tier (do not upgrade to
// Pay As You Go): when credits run out, paid resources stop instead of billing the card.
//
// Needs OCI_* creds and (optionally) OCI_BUDGET_EMAIL (defaults below) + OCI_BUDGET_AMOUNT.
// Budgets is a Cost-Management service and needs `manage usage-budgets in tenancy`.
import { budgets, TENANCY } from './_oci.mjs';

const EMAIL = process.env.OCI_BUDGET_EMAIL || 'thomas.prudhomme@satom.ch';
const AMOUNT = Number(process.env.OCI_BUDGET_AMOUNT || 100);
const NAME = 'git-vm-oracle';
const THRESHOLDS = [20, 50, 100];

try {
  // Reuse an existing budget with our name if present (idempotent).
  const list = await budgets('GET', `/20190111/budgets?compartmentId=${encodeURIComponent(TENANCY)}&targetType=COMPARTMENT`);
  let budget = (list ?? []).find((b) => b.displayName === NAME && b.lifecycleState !== 'INACTIVE');
  if (!budget) {
    budget = await budgets('POST', '/20190111/budgets', {
      compartmentId: TENANCY,
      targetType: 'COMPARTMENT',
      targets: [TENANCY],
      amount: AMOUNT,
      resetPeriod: 'MONTHLY',
      displayName: NAME,
      description: 'Garde-fou de coût du portail git-vm-oracle (alertes uniquement).',
    });
    console.log('Budget created', budget.id, `${AMOUNT} CHF/mois`);
  } else {
    console.log('Budget exists ', budget.id);
  }

  const existing = await budgets('GET', `/20190111/budgets/${budget.id}/alertRules`);
  const have = new Set((existing ?? []).map((r) => r.threshold));
  for (const t of THRESHOLDS) {
    if (have.has(t)) { console.log(`  alert ${t} exists`); continue; }
    await budgets('POST', `/20190111/budgets/${budget.id}/alertRules`, {
      type: 'ACTUAL', thresholdType: 'ABSOLUTE', threshold: t,
      displayName: `alert-${t}`, recipients: EMAIL,
      message: `Portail git-vm-oracle : dépense réelle ≥ ${t} CHF ce mois.`,
    });
    console.log(`  alert ${t} CHF -> ${EMAIL}`);
  }
  console.log('\nDone. Rappel : un budget ALERTE mais ne bloque pas. Garde le compte sur les crédits/Free Tier.');
} catch (e) {
  console.error('Budget setup failed:', e.message);
  console.error('\nSi 404/Authorization: ajoute la policy IAM `Allow group <ton-groupe> to manage usage-budgets in tenancy`,');
  console.error('ou crée le budget à la main dans la Console OCI : Billing & Cost Management > Budgets >');
  console.error(`  Create Budget (cible: compartiment racine, ${AMOUNT} CHF/mois) + Alert Rules à 20/50/100 (ACTUAL) -> ${EMAIL}.`);
  process.exit(1);
}
