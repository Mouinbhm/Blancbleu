const nodemailer = require("nodemailer");
const { queues, QUEUES } = require("../queues");

// ─── Créer le transporteur SMTP ───────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─── Envoyer l'email de réinitialisation (doer — appelé par le worker) ────────
const _sendResetEmailNow = async (to, nom, resetUrl) => {
  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { margin:0; padding:0; background:#f1f5f9; font-family:'Segoe UI',sans-serif; }
        .wrap { max-width:560px; margin:40px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
        .header { background:#04080F; padding:32px 40px; text-align:center; }
        .logo-box { display:inline-flex; align-items:center; gap:12px; }
        .logo-icon { width:44px; height:44px; background:linear-gradient(135deg,#1D6EF5,#0ea5e9); border-radius:10px; display:flex; align-items:center; justify-content:center; }
        .logo-name { font-size:24px; font-weight:800; }
        .logo-w { color:#fff; }
        .logo-b { color:#1D6EF5; }
        .body { padding:40px; }
        .title { font-size:22px; font-weight:700; color:#0f172a; margin-bottom:12px; }
        .text { font-size:15px; color:#475569; line-height:1.7; margin-bottom:20px; }
        .btn { display:block; width:fit-content; margin:28px auto; padding:14px 36px; background:linear-gradient(135deg,#1D6EF5,#0ea5e9); color:#fff; text-decoration:none; border-radius:10px; font-weight:600; font-size:15px; text-align:center; }
        .expire { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; font-size:13px; color:#64748b; margin-top:24px; }
        .footer { padding:24px 40px; text-align:center; font-size:12px; color:#94a3b8; border-top:1px solid #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="header">
          <div class="logo-box">
            <div class="logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M12 2v20M3 7l9 5 9-5" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <div class="logo-name">
                <span class="logo-w">Blanc</span><span class="logo-b">Bleu</span>
              </div>
            </div>
          </div>
        </div>
        <div class="body">
          <p class="title">Réinitialisation de votre mot de passe</p>
          <p class="text">Bonjour <strong>${nom}</strong>,</p>
          <p class="text">
            Vous avez demandé la réinitialisation de votre mot de passe sur la plateforme BlancBleu.
            Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
          </p>
          <a href="${resetUrl}" class="btn">Réinitialiser mon mot de passe</a>
          <div class="expire">
            ⏱ Ce lien est valable pendant <strong>1 heure</strong> uniquement.
            Si vous n'avez pas fait cette demande, ignorez cet email.
          </div>
        </div>
        <div class="footer">
          BlancBleu — Plateforme de gestion des interventions ambulancières<br/>
          Cet email a été envoyé automatiquement, ne pas répondre.
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "BlancBleu <noreply@blancbleu.fr>",
    to,
    subject: "🔐 Réinitialisation de votre mot de passe — BlancBleu",
    html,
  });
};

// ─── Envoyer l'email de bienvenue (doer — appelé par le worker) ──────────────
const _sendWelcomeEmailNow = async (to, prenom, nom, email, motDePasse, role) => {
  const roleLabels = {
    dispatcher: "Dispatcher",
    superviseur: "Superviseur",
    admin: "Administrateur",
  };
  const roleLabel = roleLabels[role] || role;
  const platformUrl = process.env.CLIENT_URL || "http://localhost:3000";

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { margin:0; padding:0; background:#f1f5f9; font-family:'Segoe UI',sans-serif; }
        .wrap { max-width:560px; margin:40px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
        .header { background:#04080F; padding:32px 40px; text-align:center; }
        .logo-name { font-size:24px; font-weight:800; }
        .logo-w { color:#fff; }
        .logo-b { color:#1D6EF5; }
        .body { padding:40px; }
        .title { font-size:22px; font-weight:700; color:#0f172a; margin-bottom:12px; }
        .text { font-size:15px; color:#475569; line-height:1.7; margin-bottom:16px; }
        .creds { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:20px 24px; margin:24px 0; }
        .cred-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f5f9; }
        .cred-row:last-child { border-bottom:none; }
        .cred-label { font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; }
        .cred-value { font-size:14px; font-weight:600; color:#0f172a; font-family:monospace; }
        .role-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:700; background:#dbeafe; color:#1d4ed8; }
        .btn { display:block; width:fit-content; margin:24px auto 0; padding:14px 40px; background:linear-gradient(135deg,#1D6EF5,#0ea5e9); color:#fff; text-decoration:none; border-radius:10px; font-weight:600; font-size:15px; text-align:center; }
        .warning { background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:14px 18px; font-size:13px; color:#9a3412; margin-top:24px; }
        .footer { padding:24px 40px; text-align:center; font-size:12px; color:#94a3b8; border-top:1px solid #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="header">
          <div class="logo-name">
            <span class="logo-w">Ambulances Blanc</span><span class="logo-b">Bleu</span>
          </div>
          <p style="color:#64748b;font-size:12px;margin:6px 0 0;letter-spacing:.1em">NICE · TRANSPORT SANITAIRE</p>
        </div>
        <div class="body">
          <p class="title">Bienvenue sur la plateforme !</p>
          <p class="text">Bonjour <strong>${prenom} ${nom}</strong>,</p>
          <p class="text">
            Un compte a été créé pour vous sur la plateforme de gestion Ambulances Blanc Bleu.
            Voici vos identifiants de connexion :
          </p>
          <div class="creds">
            <div class="cred-row">
              <span class="cred-label">Email</span>
              <span class="cred-value">${email}</span>
            </div>
            <div class="cred-row">
              <span class="cred-label">Mot de passe temporaire</span>
              <span class="cred-value">${motDePasse}</span>
            </div>
            <div class="cred-row">
              <span class="cred-label">Rôle</span>
              <span class="cred-value"><span class="role-badge">${roleLabel}</span></span>
            </div>
          </div>
          <a href="${platformUrl}/login" class="btn">Accéder à la plateforme →</a>
          <div class="warning">
            🔒 Pour des raisons de sécurité, vous devrez <strong>créer un nouveau mot de passe</strong>
            dès votre première connexion. Le mot de passe temporaire ci-dessus ne sera valable qu'une seule fois.
          </div>
        </div>
        <div class="footer">
          BlancBleu — Plateforme de gestion des transports sanitaires · Nice<br/>
          Cet email a été généré automatiquement, ne pas répondre.
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "BlancBleu <noreply@blancbleu.fr>",
    to,
    subject: `🚑 Bienvenue sur BlancBleu — Vos identifiants de connexion`,
    html,
  });
};

// ─── Wrappers publics : enqueue dans BullMQ ──────────────────────────────────
// Comportement legacy préservé : si la queue n'est pas dispo (test, démarrage),
// on retombe sur l'exécution synchrone.
async function sendResetEmail(to, nom, resetUrl) {
  try {
    await queues[QUEUES.EMAIL].add("reset", { to, nom, resetUrl });
  } catch {
    await _sendResetEmailNow(to, nom, resetUrl);
  }
}

async function sendWelcomeEmail(to, prenom, nom, email, motDePasse, role) {
  try {
    await queues[QUEUES.EMAIL].add("welcome", { to, prenom, nom, email, motDePasse, role });
  } catch {
    await _sendWelcomeEmailNow(to, prenom, nom, email, motDePasse, role);
  }
}

module.exports = {
  sendResetEmail,
  sendWelcomeEmail,
  // exposés pour les workers
  _sendResetEmailNow,
  _sendWelcomeEmailNow,
};
