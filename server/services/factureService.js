/**
 * BlancBleu — Service de facturation automatique
 *
 * Crée automatiquement une facture CPAM à la fin d'une mission.
 * Utilise tarifService pour calculer les montants selon le barème 2024.
 */

const Facture = require("../models/Facture");
const Mission = require("../models/Mission");
const Transport = require("../models/Transport");
const Patient = require("../models/Patient");
const tarifService = require("./tarifService");
const logger = require("../utils/logger");

/**
 * Crée une facture à partir d'une mission terminée.
 * Idempotent : ne crée pas de doublon si une facture non-annulée existe déjà.
 *
 * @param {string|ObjectId} missionId
 * @returns {Promise<{ facture: Object, created: boolean }>}
 */
async function createFactureFromMission(missionId) {
  const mission = await Mission.findById(missionId).populate("transportId");
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`);

  const transport = mission.transportId;
  if (!transport) throw new Error("La mission n'est pas liée à un transport");

  // Idempotence : vérifier doublon
  const existante = await Facture.findOne({
    transportId: transport._id,
    statut: { $ne: "annulee" },
  });
  if (existante) {
    logger.info("[factureService] Facture déjà existante", { numero: existante.numero });
    return { facture: existante, created: false };
  }

  // Calcul tarifaire CPAM
  let tarif;
  try {
    // Si on dispose de la distance réelle mesurée pendant la mission, on l'utilise
    if (mission.distanceReelleKm && transport.typeTransport) {
      tarif = tarifService.calculerTarifSync(
        transport.typeTransport,
        mission.distanceReelleKm,
        {
          allerRetour: transport.allerRetour || false,
          tauxPriseEnCharge: transport.tauxPriseEnCharge || 65,
        },
      );
    } else {
      tarif = await tarifService.calculerTarif(transport);
    }
  } catch (err) {
    logger.warn("[factureService] Calcul tarifaire échoué, montants à zéro", { err: err.message });
    tarif = {
      montantTotal: 0,
      montantCPAM: 0,
      montantPatient: 0,
      tauxPriseEnCharge: transport.tauxPriseEnCharge || 65,
      supplements: 0,
    };
  }

  // Résoudre le patientId : depuis transport.patientId ou Patient par numéro sécu / nom
  let patientId = transport.patientId || null;

  const facture = await Facture.create({
    transportId: transport._id,
    missionId: mission._id,
    patientId,
    dateEmission: new Date(),
    montantBase: tarif.montantTotal - (tarif.supplements || 0),
    majoration: tarif.supplements || 0,
    montantTotal: tarif.montantTotal,
    tauxPriseEnCharge: tarif.tauxPriseEnCharge,
    montantCPAM: tarif.montantCPAM,
    montantPatient: tarif.montantPatient,
    statut: "brouillon",
    notes: `Facture générée automatiquement — mission ${mission._id}`,
  });

  logger.info("[factureService] Facture créée", {
    numero: facture.numero,
    transportId: transport._id,
    montantTotal: tarif.montantTotal,
  });

  return { facture, created: true };
}

module.exports = { createFactureFromMission };
