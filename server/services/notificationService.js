/**
 * BlancBleu — Service de Notifications
 *
 * Envoie des notifications email automatiques pour les événements critiques :
 *   - Intervention P1 créée
 *   - Plan NOVI déclenché (≥5 victimes)
 *   - Carburant critique (≤10%)
 *   - Escalade EMERGENCY non résolue après N minutes
 *
 * Utilise nodemailer (déjà dans les dépendances)
 * Throttling intégré — pas plus d'1 email / 5 min par type d'événement
 */

const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

// ─── Configuration transporter ────────────────────────────────────────────────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    logger.warn(
      "Notifications email désactivées — EMAIL_HOST ou EMAIL_USER manquant",
    );
    return null;
  }

  _transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return _transporter;
}

// ─── Throttling — éviter le spam email ───────────────────────────────────────
const _throttleMap = new Map();
const THROTTLE_TTL = 5 * 60 * 1000; // 5 minutes

function _isThrottled(key) {
  const last = _throttleMap.get(key);
  if (!last) return false;
  return Date.now() - last < THROTTLE_TTL;
}

function _markSent(key) {
  _throttleMap.set(key, Date.now());
}

// ─── Destinataires superviseurs ────────────────────────────────────────────────
function getDestinatairesSuperviseurs() {
  const emails = process.env.SUPERVISEUR_EMAILS || process.env.ADMIN_EMAIL;
  if (!emails) return [];
  return emails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// ─── Envoi générique ──────────────────────────────────────────────────────────
async function envoyerEmail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) return false;

  if (!to || to.length === 0) {
    logger.warn("Notification ignorée — aucun destinataire configuré");
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "BlancBleu <noreply@blancbleu.fr>",
      to: Array.isArray(to) ? to.join(",") : to,
      subject,
      html,
    });
    logger.info("Email notification envoyé", { subject, to });
    return true;
  } catch (err) {
    logger.error("Erreur envoi notification", { err: err.message, subject });
    return false;
  }
}

// ─── Template HTML commun ─────────────────────────────────────────────────────
function templateEmail(titre, couleur, contenu, actions = []) {
  const actionBtns = actions
    .map(
      (a) =>
        `<a href="${a.url}" style="display:inline-block;margin:4px 8px 4px 0;padding:8px 16px;background:${couleur};color:#fff;text-decoration:none;border-radius:6px;font-size:13px">${a.label}</a>`,
    )
    .join("");

  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:20px">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
        <div style="background:${couleur};padding:20px 24px">
          <div style="color:#fff;font-size:11px;font-weight:600;letter-spacing:.05em;opacity:.8">BLANCBLEU — ALERTE</div>
          <div style="color:#fff;font-size:20px;font-weight:600;margin-top:4px">${titre}</div>
        </div>
        <div style="padding:24px">
          ${contenu}
          ${actionBtns ? `<div style="margin-top:20px">${actionBtns}</div>` : ""}
        </div>
        <div style="background:#f9f9f9;padding:12px 24px;border-top:1px solid #eee;font-size:11px;color:#999">
          BlancBleu — ${new Date().toLocaleString("fr-FR")} · Email automatique, ne pas répondre.
        </div>
      </div>
    </body></html>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS SPÉCIFIQUES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Notification intervention P1 critique
 */
async function notifierInterventionP1(intervention) {
  const key = `p1-${intervention._id}`;
  if (_isThrottled(key)) return;

  const appUrl = process.env.CLIENT_URL || "http://localhost:3000";
  const html = templateEmail(
    "Intervention P1 — Urgence critique",
    "#dc2626",
    `
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#666;width:140px">Numéro</td><td style="padding:6px 0;font-weight:600">${intervention.numero}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Type</td><td style="padding:6px 0">${intervention.typeIncident}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Adresse</td><td style="padding:6px 0">${intervention.adresse}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Patient</td><td style="padding:6px 0">${intervention.patient?.etat || "inconnu"} · ${intervention.patient?.nbVictimes || 1} victime(s)</td></tr>
        <tr><td style="padding:6px 0;color:#666">Heure</td><td style="padding:6px 0">${new Date(intervention.heureCreation).toLocaleTimeString("fr-FR")}</td></tr>
      </table>
      <div style="margin-top:16px;padding:12px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:0 4px 4px 0;font-size:13px;color:#991b1b">
        Déploiement SMUR prioritaire requis — intervention IMMÉDIATE
      </div>
    `,
    [{ label: "Voir l'intervention", url: `${appUrl}/interventions` }],
  );

  const sent = await envoyerEmail({
    to: getDestinatairesSuperviseurs(),
    subject: `🚨 P1 — ${intervention.typeIncident} — ${intervention.adresse}`,
    html,
  });

  if (sent) _markSent(key);
}

/**
 * Notification plan NOVI (≥5 victimes)
 */
async function notifierPlanNOVI(intervention, nbVictimes) {
  const key = `novi-${intervention._id}`;
  if (_isThrottled(key)) return;

  const unitesRequises = Math.ceil(nbVictimes / 3);
  const appUrl = process.env.CLIENT_URL || "http://localhost:3000";

  const html = templateEmail(
    `Plan NOVI — ${nbVictimes} victimes`,
    "#7c3aed",
    `
      <div style="font-size:14px;margin-bottom:16px">
        Un incident à victimes multiples nécessite l'activation du plan NOVI.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#666;width:140px">Numéro</td><td style="padding:6px 0;font-weight:600">${intervention.numero}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Victimes</td><td style="padding:6px 0;font-weight:600;color:#dc2626">${nbVictimes} victimes</td></tr>
        <tr><td style="padding:6px 0;color:#666">Adresse</td><td style="padding:6px 0">${intervention.adresse}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Unités requises</td><td style="padding:6px 0">${unitesRequises} unités minimum</td></tr>
      </table>
      <div style="margin-top:16px;padding:12px;background:#f5f3ff;border-left:3px solid #7c3aed;border-radius:0 4px 4px 0;font-size:13px;color:#5b21b6">
        Actions requises : Mobiliser ${unitesRequises} unités · Prévenir CHU · Activer plan rouge
      </div>
    `,
    [{ label: "Gérer l'intervention", url: `${appUrl}/interventions` }],
  );

  const sent = await envoyerEmail({
    to: getDestinatairesSuperviseurs(),
    subject: `🚨 PLAN NOVI — ${nbVictimes} victimes — ${intervention.adresse}`,
    html,
  });

  if (sent) _markSent(key);
}

/**
 * Notification carburant critique
 */
async function notifierCarburantCritique(unite) {
  const key = `fuel-${unite._id}`;
  if (_isThrottled(key)) return;

  const niveau = unite.carburant <= 10 ? "CRITIQUE" : "BAS";
  const couleur = unite.carburant <= 10 ? "#dc2626" : "#d97706";

  const html = templateEmail(
    `Carburant ${niveau} — ${unite.nom}`,
    couleur,
    `
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#666;width:140px">Unité</td><td style="padding:6px 0;font-weight:600">${unite.nom}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Type</td><td style="padding:6px 0">${unite.type}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Carburant</td><td style="padding:6px 0;font-weight:600;color:${couleur}">${unite.carburant.toFixed(1)}%</td></tr>
        <tr><td style="padding:6px 0;color:#666">Kilométrage</td><td style="padding:6px 0">${unite.kilometrage} km</td></tr>
      </table>
    `,
  );

  const sent = await envoyerEmail({
    to: getDestinatairesSuperviseurs(),
    subject: `⛽ Carburant ${niveau} — ${unite.nom} (${unite.carburant.toFixed(1)}%)`,
    html,
  });

  if (sent) _markSent(key);
}

/**
 * Notification escalade EMERGENCY sans réponse
 */
async function notifierEscaladeUrgence(intervention, alerte) {
  const key = `escalade-${intervention._id}-${alerte.code}`;
  if (_isThrottled(key)) return;

  const html = templateEmail(
    `Escalade URGENCE — ${alerte.code}`,
    "#ea580c",
    `
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#666;width:140px">Intervention</td><td style="padding:6px 0;font-weight:600">${intervention.numero}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Priorité</td><td style="padding:6px 0">${intervention.priorite}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Alerte</td><td style="padding:6px 0">${alerte.message}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Action requise</td><td style="padding:6px 0;color:#dc2626;font-weight:600">${alerte.action}</td></tr>
      </table>
    `,
  );

  const sent = await envoyerEmail({
    to: getDestinatairesSuperviseurs(),
    subject: `⚠️ Escalade — ${alerte.code} — ${intervention.numero}`,
    html,
  });

  if (sent) _markSent(key);
}

module.exports = {
  notifierInterventionP1,
  notifierPlanNOVI,
  notifierCarburantCritique,
  notifierEscaladeUrgence,
};
