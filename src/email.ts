import type { Env } from './types';
import { audit } from './db';

// Email via EmailJS REST API (server-side / non-browser).
// EmailJS HTML-escapes variable values, so the pretty layout lives in the
// EmailJS template (static HTML). We only send PLAIN TEXT here:
//   Subject  = {{subject}}
//   To Email = {{to_email}}
//   Content  = branded HTML using {{title}} and {{message}}
//              ({{message}} rendered in a container with white-space:pre-line,
//               so "\n" in the text becomes line breaks)

interface Mail {
  to: string;
  subject: string;
  title: string;
  message: string; // plain text, may contain \n
}

async function sendMail(env: Env, mail: Mail): Promise<void> {
  const configured = env.EMAILJS_SERVICE_ID && env.EMAILJS_TEMPLATE_ID && env.EMAILJS_PUBLIC_KEY;
  if (env.MAIL_ENABLED !== 'true' || !configured) {
    await audit(env, 'system', 'mail.skipped', mail.to, mail.subject);
    return;
  }
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY,
      accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: mail.to,
        subject: mail.subject,
        title: mail.title,
        message: mail.message,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    await audit(env, 'system', 'mail.failed', mail.to, `${res.status} ${body}`.slice(0, 200));
    return;
  }
  await audit(env, 'system', 'mail.sent', mail.to, mail.subject);
}

const ADMIN_RECIPIENTS = (env: Env) =>
  env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean);

export async function notifyAdminsNewRequest(env: Env, reqId: number, userEmail: string, preset: string) {
  const message =
    `${userEmail} a soumis une demande de VM.\n\n` +
    `Type : ${preset}\nDemande : #${reqId}\n\n` +
    `Validation requise dans le dashboard admin.`;
  for (const to of ADMIN_RECIPIENTS(env)) {
    await sendMail(env, { to, subject: `Nouvelle demande VM #${reqId}`, title: `Nouvelle demande VM #${reqId}`, message });
  }
}

export async function notifyUserApproved(env: Env, to: string, reqId: number) {
  const message =
    `Bonne nouvelle — ta demande #${reqId} a été approuvée.\n\n` +
    `Ta VM est en cours de création. Tu recevras un second email avec l'adresse IP ` +
    `et les instructions de connexion dès qu'elle est prête (quelques instants).`;
  await sendMail(env, { to, subject: `Demande #${reqId} approuvée`, title: 'Demande approuvée ✅', message });
}

export async function notifyUserRejected(env: Env, to: string, reqId: number, note: string) {
  const message =
    `Ta demande #${reqId} n'a pas été retenue.\n\n` +
    `Motif : ${note || 'non précisé'}\n\n` +
    `Tu peux soumettre une nouvelle demande depuis le portail.`;
  await sendMail(env, { to, subject: `Demande #${reqId} refusée`, title: 'Demande refusée', message });
}

export async function notifyUserReady(env: Env, to: string, reqId: number, ip: string, sshUser = 'ubuntu') {
  const message =
    `Ta VM #${reqId} est active et prête à l'emploi. 🎉\n\n` +
    `IP publique : ${ip}\n` +
    `Connexion SSH :\n` +
    `ssh -i vm-portal-req-${reqId}.pem ${sshUser}@${ip}\n\n` +
    `Télécharge d'abord ta clé privée depuis le portail (bouton ci-dessous). ` +
    `La clé n'est accessible que par toi.`;
  await sendMail(env, { to, subject: `VM #${reqId} prête`, title: 'Ta VM est prête 🚀', message });
}
