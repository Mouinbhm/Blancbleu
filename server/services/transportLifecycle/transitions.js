/**
 * BlancBleu — Lifecycle Transport : transitions de statut simples.
 *
 * Confirmation, planification, étapes terrain (en route → arrivée → à bord →
 * destination → attente → retour base), acceptation/refus chauffeur, passage
 * en facturation, et lecture de la timeline.
 */

const { _transition, _meta, logger, log, Transport, Vehicle, haversine } = require("./_core");

// ══════════════════════════════════════════════════════════════════════════════
// TIMELINE — retourner le statusLog complet d'un transport
// ══════════════════════════════════════════════════════════════════════════════
async function getTransportTimeline(transportId) {
  const transport = await Transport.findById(transportId)
    .select("statusLog journal numero statut")
    .populate("statusLog.changedBy", "nom prenom email role");
  if (!transport) throw new Error("Transport introuvable");
  return transport.statusLog || [];
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. CONFIRMER UN TRANSPORT
// ══════════════════════════════════════════════════════════════════════════════
async function confirmerTransport(transportId, utilisateur) {
  const transport = await _transition(
    transportId,
    "CONFIRMED",
    _meta(utilisateur, {
      notes: "Transport confirmé",
    }),
  );

  await log({
    action: "STATUT_CHANGED",
    origine: "HUMAIN",
    utilisateur,
    ressource: {
      type: "Transport",
      id: transport._id,
      reference: transport.numero,
    },
    details: {
      avant: { statut: "REQUESTED" },
      apres: { statut: "CONFIRMED" },
      message: "Transport confirmé",
    },
  });

  logger.info("Transport confirmé", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. PLANIFIER UN TRANSPORT (avec vérification PMT si nécessaire)
// ══════════════════════════════════════════════════════════════════════════════
async function planifierTransport(transportId, utilisateur) {
  const transport = await _transition(transportId, "SCHEDULED", _meta(utilisateur));

  logger.info("Transport planifié", {
    numero: transport.numero,
    date: transport.dateTransport,
  });

  // ── Trigger auto-dispatch best-effort si activé en config ──────────────────
  // Le worker re-vérifie l'éligibilité au moment du run + idempotence stricte
  // (skip si déjà assigné ou pending existe), donc on peut pousser sans risque.
  setImmediate(async () => {
    try {
      const DispatchConfig = require("../../models/DispatchConfig");
      const cfg = await DispatchConfig.findById("default").lean();
      if (!cfg?.autoDispatch?.enabled) return;

      const { queues, QUEUES } = require("../../queues");
      const q = queues[QUEUES.AUTODISPATCH];
      if (!q) return;
      await q.add(
        "eval",
        { transportId: String(transportId) },
        {
          jobId: `autodispatch:${transportId}`, // dédoublonnage natif
        },
      );
      logger.debug("[lifecycle] job auto-dispatch enqueued", { transportId });
    } catch (err) {
      logger.warn("[lifecycle] auto-dispatch enqueue échoué", { err: err.message });
    }
  });

  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. EN ROUTE VERS LE PATIENT
// ══════════════════════════════════════════════════════════════════════════════
async function marquerEnRoute(transportId, utilisateur) {
  const transport = await _transition(transportId, "EN_ROUTE_TO_PICKUP", _meta(utilisateur));

  logger.info("En route vers patient", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. ARRIVÉ CHEZ LE PATIENT
// ══════════════════════════════════════════════════════════════════════════════
async function marquerArriveePatient(transportId, positionActuelle, utilisateur) {
  const transport = await _transition(transportId, "ARRIVED_AT_PICKUP", _meta(utilisateur));

  // Mettre à jour position du véhicule si fournie
  if (positionActuelle?.lat && transport.vehicule) {
    await Vehicle.findByIdAndUpdate(transport.vehicule, {
      position: { ...positionActuelle, updatedAt: new Date() },
    });
  }

  logger.info("Arrivé chez le patient", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. PATIENT À BORD
// ══════════════════════════════════════════════════════════════════════════════
async function marquerPatientABord(transportId, utilisateur) {
  const transport = await _transition(transportId, "PATIENT_ON_BOARD", _meta(utilisateur));

  logger.info("Patient à bord", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. ARRIVÉ À DESTINATION
// ══════════════════════════════════════════════════════════════════════════════
async function marquerArriveeDestination(transportId, positionActuelle, utilisateur) {
  const transport = await _transition(transportId, "ARRIVED_AT_DESTINATION", _meta(utilisateur));

  // Calculer distance parcourue si GPS disponible
  if (positionActuelle?.lat && transport.adresseDepart?.coordonnees?.lat) {
    const dist = haversine(
      transport.adresseDepart.coordonnees.lat,
      transport.adresseDepart.coordonnees.lng,
      positionActuelle.lat,
      positionActuelle.lng,
    );
    if (transport.vehicule) {
      const vehicle = await Vehicle.findById(transport.vehicule);
      if (vehicle) {
        vehicle.kilometrage = Math.round((vehicle.kilometrage + dist) * 10) / 10;
        await vehicle.save();
      }
    }
  }

  logger.info("Arrivé à destination", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 8b. ATTENTE À DESTINATION (dialyse, chimio, rééducation…)
//     Statut optionnel — le véhicule reste en mission pendant toute l'attente.
// ══════════════════════════════════════════════════════════════════════════════
async function demarrerAttenteDestination(transportId, dureeAttenteMinutes, utilisateur) {
  // Persister la durée estimée avant la transition (best-effort)
  if (dureeAttenteMinutes != null) {
    await Transport.findByIdAndUpdate(transportId, { dureeAttenteMinutes });
  }

  const transport = await _transition(
    transportId,
    "WAITING_AT_DESTINATION",
    _meta(utilisateur, {
      notes: dureeAttenteMinutes
        ? `Attente estimée : ${dureeAttenteMinutes} min`
        : "Attente à destination démarrée",
      dureeAttenteMinutes,
    }),
  );

  // Le véhicule reste en statut "en_mission" — pas de modification ici.
  logger.info("Attente à destination démarrée", {
    numero: transport.numero,
    dureeEstimeeMin: dureeAttenteMinutes ?? "non renseignée",
  });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 8c. RETOUR BASE — trajet chauffeur après dépôt du patient
//     Met à jour vehicle.kilometrage via Haversine (destination → départ).
//     Le véhicule reste en mission jusqu'à la complétion.
// ══════════════════════════════════════════════════════════════════════════════
async function demarrerRetourBase(transportId, positionActuelle, utilisateur) {
  const transport = await Transport.findById(transportId).populate(
    "vehicule",
    "kilometrage statut",
  );
  if (!transport) throw new Error("Transport introuvable");

  // Calculer la distance de retour : position actuelle (ou destination) → départ
  const posRef = positionActuelle?.lat
    ? positionActuelle
    : transport.adresseDestination?.coordonnees;
  const posBase = transport.adresseDepart?.coordonnees;

  if (posRef?.lat && posBase?.lat && transport.vehicule) {
    const distRetourKm = haversine(posRef.lat, posRef.lng, posBase.lat, posBase.lng);
    await Vehicle.findByIdAndUpdate(transport.vehicule._id, {
      kilometrage: Math.round(((transport.vehicule.kilometrage || 0) + distRetourKm) * 10) / 10,
    });
    logger.info("Kilométrage retour mis à jour", {
      numero: transport.numero,
      distRetourKm: Math.round(distRetourKm * 10) / 10,
    });
  }

  const updated = await _transition(
    transportId,
    "RETURN_TO_BASE",
    _meta(utilisateur, { notes: "Retour base en cours" }),
  );

  logger.info("Retour base démarré", { numero: transport.numero });
  return { transport: updated };
}

// ══════════════════════════════════════════════════════════════════════════════
// 13. ACCEPTER LA MISSION (chauffeur) — ASSIGNED → DRIVER_ACCEPTED
// ══════════════════════════════════════════════════════════════════════════════
async function accepterDriver(transportId, utilisateur) {
  const transport = await _transition(
    transportId,
    "DRIVER_ACCEPTED",
    _meta(utilisateur, {
      notes: "Mission acceptée par le chauffeur",
    }),
  );
  logger.info("Mission acceptée", { numero: transport.numero });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 14. REFUSER LA MISSION (chauffeur) — ASSIGNED → DRIVER_REJECTED
// ══════════════════════════════════════════════════════════════════════════════
async function refuserDriver(transportId, raison, utilisateur) {
  const transport = await _transition(
    transportId,
    "DRIVER_REJECTED",
    _meta(utilisateur, {
      notes: raison || "Mission refusée par le chauffeur",
      reason: raison || "Mission refusée par le chauffeur",
    }),
  );
  // Libérer le véhicule pour réassignation
  if (transport.vehicule) {
    await Vehicle.findByIdAndUpdate(transport.vehicule, {
      statut: "Disponible",
      transportEnCours: null,
    });
  }
  logger.info("Mission refusée", { numero: transport.numero, raison });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 15. FACTURATION EN COURS — COMPLETED → BILLING_PENDING
// ══════════════════════════════════════════════════════════════════════════════
async function marquerBillingPending(transportId, utilisateur) {
  const transport = await _transition(
    transportId,
    "BILLING_PENDING",
    _meta(utilisateur, {
      notes: "Facturation en cours de traitement",
    }),
  );
  logger.info("Billing pending", { numero: transport.numero });
  return { transport };
}

module.exports = {
  confirmerTransport,
  planifierTransport,
  marquerEnRoute,
  marquerArriveePatient,
  marquerPatientABord,
  marquerArriveeDestination,
  demarrerAttenteDestination,
  demarrerRetourBase,
  accepterDriver,
  refuserDriver,
  marquerBillingPending,
  getTransportTimeline,
};
