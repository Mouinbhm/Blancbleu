/**
 * BlancBleu — Système d'Escalade Automatique
 * 5 règles : disponibilité, ETA, P1 critique, sans réponse, NOVI
 */
const Intervention = require("../models/Intervention");
const Unit = require("../models/Unit");
const socketService = require("./socketService");
const { haversine, calculerETA } = require("../utils/geoUtils");

const SEUILS = {
  ETA_MAX: { P1: 8, P2: 15, P3: 30 },
  SANS_REPONSE: { P1: 3, P2: 10, P3: 20 },
  NB_VICTIMES_NOVI: 5,
};

const NIVEAUX = {
  INFO: { label: "Info", couleur: "blue", priorite: 1 },
  WARNING: { label: "Attention", couleur: "yellow", priorite: 2 },
  CRITICAL: { label: "Critique", couleur: "orange", priorite: 3 },
  EMERGENCY: { label: "Urgence", couleur: "red", priorite: 4 },
};

// RÈGLE 1 — Disponibilité unités
async function verifierDisponibiliteUnites(priorite) {
  const dispo = await Unit.countDocuments({ statut: "disponible" });
  if (dispo === 0)
    return {
      declenchee: true,
      niveau: NIVEAUX.EMERGENCY,
      code: "NO_UNIT_AVAILABLE",
      message: "Aucune unité disponible — toutes en mission",
      action: "Contacter SAMU 15 pour renfort",
      donnees: { dispo: 0 },
    };
  if (priorite === "P1") {
    const smur = await Unit.countDocuments({
      statut: "disponible",
      type: "SMUR",
    });
    if (smur === 0)
      return {
        declenchee: true,
        niveau: NIVEAUX.CRITICAL,
        code: "NO_SMUR_AVAILABLE",
        message: "Aucun SMUR disponible — substitution VSAV",
        action: "Dispatcher VSAV le plus proche · Alerter médecin régulateur",
        donnees: { dispo, smur: 0 },
      };
  }
  return { declenchee: false };
}

// RÈGLE 2 — ETA trop long
async function verifierETA(unite, lat, lng, priorite) {
  if (!unite?.position?.lat || !lat) return { declenchee: false };
  const dist = haversine(unite.position.lat, unite.position.lng, lat, lng);
  const eta = calculerETA(dist, priorite);
  const seuil = SEUILS.ETA_MAX[priorite] || 15;
  if (eta.minutes > seuil) {
    const autres = await Unit.find({
      statut: "disponible",
      _id: { $ne: unite._id },
    });
    const alts = autres
      .filter((u) => u.position?.lat)
      .map((u) => {
        const d = haversine(u.position.lat, u.position.lng, lat, lng);
        const e = calculerETA(d, priorite);
        return { ...u.toObject(), _id: u._id, dist: d, eta: e };
      })
      .filter((u) => u.eta.minutes < eta.minutes)
      .sort((a, b) => a.eta.minutes - b.eta.minutes)
      .slice(0, 2);
    return {
      declenchee: true,
      niveau: priorite === "P1" ? NIVEAUX.EMERGENCY : NIVEAUX.CRITICAL,
      code: "ETA_TOO_LONG",
      message: `ETA ${eta.formate} dépasse seuil ${seuil} min pour ${priorite}`,
      action:
        alts.length > 0
          ? `Alternative : ${alts[0].nom} (ETA ${alts[0].eta.formate})`
          : "Maintenir assignation actuelle",
      donnees: {
        etaActuel: eta.minutes,
        seuil,
        alternatives: alts.map((u) => ({
          nom: u.nom,
          eta: u.eta.formate,
          dist: u.dist,
        })),
      },
    };
  }
  return { declenchee: false };
}

// RÈGLE 3 — P1 override
function verifierPrioriteCritique(intervention) {
  if (intervention.priorite !== "P1") return { declenchee: false };
  const actions = [
    "Déploiement SMUR prioritaire",
    "Alerte médecin régulateur SAMU 15",
  ];
  if (
    ["Arrêt cardiaque", "Détresse respiratoire", "AVC"].includes(
      intervention.typeIncident,
    )
  )
    actions.push(`Défibrillateur requis — ${intervention.typeIncident}`);
  if ((intervention.patient?.nbVictimes || 1) > 1)
    actions.push(`${intervention.patient.nbVictimes} victimes — renfort`);
  return {
    declenchee: true,
    niveau: NIVEAUX.EMERGENCY,
    code: "P1_OVERRIDE",
    message: "P1 critique — protocoles urgence activés",
    action: actions.join(" · "),
    donnees: { typeIncident: intervention.typeIncident },
  };
}

// RÈGLE 4 — Sans réponse
function verifierSansReponse(intervention) {
  if (intervention.unitAssignee) return { declenchee: false };
  if (!["CREATED", "VALIDATED"].includes(intervention.statut))
    return { declenchee: false };
  const mins = Math.floor(
    (Date.now() -
      new Date(intervention.heureCreation || intervention.createdAt)) /
      60000,
  );
  const seuil = SEUILS.SANS_REPONSE[intervention.priorite] || 10;
  if (mins >= seuil)
    return {
      declenchee: true,
      niveau:
        intervention.priorite === "P1" ? NIVEAUX.EMERGENCY : NIVEAUX.WARNING,
      code: "NO_RESPONSE",
      message: `Sans assignation depuis ${mins} min (seuil ${seuil} min)`,
      action: "Assigner une unité immédiatement",
      donnees: { mins, seuil },
    };
  return { declenchee: false };
}

// RÈGLE 5 — NOVI
function verifierNOVI(intervention) {
  const nb = intervention.patient?.nbVictimes || 1;
  if (nb < SEUILS.NB_VICTIMES_NOVI) return { declenchee: false };
  return {
    declenchee: true,
    niveau: NIVEAUX.EMERGENCY,
    code: "PLAN_NOVI",
    message: `Plan NOVI — ${nb} victimes`,
    action: `Mobiliser ${Math.ceil(nb / 3)} unités · Prévenir CHU · Plan rouge`,
    donnees: { nb, unitsRequises: Math.ceil(nb / 3) },
  };
}

// MOTEUR PRINCIPAL
async function analyserEscalade(intervention, unite = null) {
  const alertes = [];
  const r1 = await verifierDisponibiliteUnites(intervention.priorite);
  if (r1.declenchee) alertes.push(r1);
  if (unite && intervention.coordonnees?.lat) {
    const r2 = await verifierETA(
      unite,
      intervention.coordonnees.lat,
      intervention.coordonnees.lng,
      intervention.priorite,
    );
    if (r2.declenchee) alertes.push(r2);
  }
  const r3 = verifierPrioriteCritique(intervention);
  if (r3.declenchee) alertes.push(r3);
  const r4 = verifierSansReponse(intervention);
  if (r4.declenchee) alertes.push(r4);
  const r5 = verifierNOVI(intervention);
  if (r5.declenchee) alertes.push(r5);

  alertes.sort((a, b) => b.niveau.priorite - a.niveau.priorite);

  if (alertes.length > 0) {
    socketService.emitEscalationTriggered({
      intervention,
      alertes,
      niveauMaximal: alertes[0].niveau,
    });
  }

  return {
    alertes,
    niveauMaximal: alertes.length > 0 ? alertes[0].niveau : null,
    necessiteAction: alertes.some((a) => a.niveau.priorite >= 3),
    resume:
      alertes.length === 0
        ? "Aucune escalade"
        : `${alertes.length} alerte(s) — ${alertes[0].message}`,
  };
}

// SURVEILLANCE CONTINUE
async function surveillerInterventionsActives() {
  try {
    const actives = await Intervention.find({
      statut: {
        $in: ["CREATED", "VALIDATED", "ASSIGNED", "EN_ROUTE", "ON_SITE"],
      },
    }).populate("unitAssignee");

    let total = 0;
    for (const i of actives) {
      const r = await analyserEscalade(i, i.unitAssignee);
      if (r.alertes.length > 0) {
        total += r.alertes.length;
        console.log(`⚠ Escalade [${i.numero}] : ${r.resume}`);
      }
    }
    return { scannees: actives.length, alertes: total };
  } catch (err) {
    console.error("Erreur surveillance:", err.message);
  }
}

function demarrerSurveillance(intervalleMinutes = 2) {
  console.log(
    `🔍 Surveillance escalade démarrée (toutes les ${intervalleMinutes} min)`,
  );
  setInterval(surveillerInterventionsActives, intervalleMinutes * 60 * 1000);
  setTimeout(surveillerInterventionsActives, 5000);
}

module.exports = {
  analyserEscalade,
  verifierDisponibiliteUnites,
  verifierETA,
  verifierPrioriteCritique,
  verifierSansReponse,
  verifierNOVI,
  demarrerSurveillance,
  surveillerInterventionsActives,
  SEUILS,
  NIVEAUX,
};
