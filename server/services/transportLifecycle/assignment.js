/**
 * BlancBleu — Lifecycle Transport : assignation véhicule + chauffeur.
 *
 * Claim atomique du véhicule (anti race condition) + rollback en cas d'échec.
 * Code sensible — couvert par le test de concurrence (concurrent-assign).
 */

const {
  Transport,
  Vehicle,
  Personnel,
  smartDispatch,
  ConflictError,
  ASSIGNABLE_TRANSPORT_STATES,
  _transition,
  _meta,
  socketService,
  scheduleGpsSimulation,
  logger,
} = require("./_core");

// ══════════════════════════════════════════════════════════════════════════════
// 3. ASSIGNER VÉHICULE + CHAUFFEUR (manuel ou auto)
// ══════════════════════════════════════════════════════════════════════════════
async function assignerVehicule(
  transportId,
  { shiftId, vehiculeId, chauffeurId, auto = false },
  utilisateur,
) {
  const DriverShift = require("../../models/DriverShift");

  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  let vehiculeIdFinal = vehiculeId;
  let chauffeurIdFinal = chauffeurId;
  let shiftIdFinal = shiftId || null;
  let scoreDispatch = null;
  let justification = [];

  // If shiftId provided, derive vehiculeId and chauffeurId from the shift
  if (shiftId) {
    const shift = await DriverShift.findById(shiftId);
    if (!shift) throw new Error("Shift introuvable");
    if (shift.status !== "ACTIVE") throw new Error("Le shift sélectionné n'est pas actif");
    vehiculeIdFinal = shift.vehicleId;
    chauffeurIdFinal = shift.personnelId;
  }

  if (auto) {
    // Auto-dispatch intelligent
    const dispatch = await smartDispatch({
      mobilite: transport.patient.mobilite,
      dateTransport: transport.dateTransport,
      heureRDV: transport.heureRDV,
      coordonneesDepart: transport.adresseDepart.coordonnees,
    });

    if (!dispatch.vehicule) {
      throw new Error(`Aucun véhicule disponible : ${dispatch.justification[0]}`);
    }

    vehiculeIdFinal = dispatch.vehicule._id;
    chauffeurIdFinal = dispatch.chauffeur?._id || chauffeurId;
    scoreDispatch = dispatch.scoreTotal;
    justification = dispatch.justification;
  }

  // Valider le chauffeur dans Personnel (pas dans User)
  if (chauffeurIdFinal) {
    const chauffeur = await Personnel.findById(chauffeurIdFinal);
    if (!chauffeur) {
      throw new Error("Chauffeur introuvable dans le référentiel Personnel");
    }
    if (!["Chauffeur", "Ambulancier"].includes(chauffeur.role)) {
      throw new Error(
        `Le personnel sélectionné a le rôle "${chauffeur.role}" — seuls Chauffeur et Ambulancier peuvent être assignés à un transport`,
      );
    }
    if (chauffeur.statut !== "En shift") {
      throw new Error(
        `Ce chauffeur n'est pas en shift (statut actuel : ${chauffeur.statut}) — un shift actif est requis pour l'assignation d'un transport`,
      );
    }
    // If no shiftId yet, look up the active shift for this chauffeur
    if (!shiftIdFinal) {
      const activeShift = await DriverShift.findOne({
        personnelId: chauffeurIdFinal,
        status: "ACTIVE",
      });
      if (activeShift) shiftIdFinal = activeShift._id;
    }
  }

  // If still no shiftId, derive it from the vehicle's active shift
  if (!shiftIdFinal && vehiculeIdFinal) {
    const activeShift = await DriverShift.findOne({ vehicleId: vehiculeIdFinal, status: "ACTIVE" });
    if (activeShift) {
      shiftIdFinal = activeShift._id;
      if (!chauffeurIdFinal) chauffeurIdFinal = activeShift.personnelId;
    }
  }

  // ── Assignation atomique (anti race condition) ──────────────────────────────
  // En standalone Mongo, withTransactionOrFallback retombe sur des writes sans
  // session — pas d'isolation, deux dispatchers pouvaient claim le même véhicule
  // simultanément (chacun voyait `statut: "Disponible"` et `transportEnCours: null`
  // puis écrasait l'autre). On utilise désormais findOneAndUpdate avec garde
  // stricte : Mongo garantit l'atomicité au niveau document, donc un seul
  // appelant peut transitionner le véhicule de "Disponible" → "En service".
  //
  // Étape 1 : claim atomique du véhicule. Si déjà occupé → ConflictError 409.
  // Étape 2 : mise à jour atomique du transport (vehicule/chauffeur/shiftId)
  //           si statut encore dans la liste autorisée. Sinon → rollback véhicule.
  // Étape 3 : transition state-machine (statusLog + horodatages + sockets/audit).
  // Catch global : libère le véhicule (et best-effort revert des champs transport)
  //                pour tout échec en cours de processus.
  //
  // Un véhicule tenu par un shift actif est déjà "En service" sans transport en
  // cours (cf. shiftController.startShift) : c'est l'état normal d'un chauffeur
  // qui a pris son service, et précisément celui qu'on veut pouvoir assigner.
  // On n'élargit le claim que dans ce cas précis — `currentShiftId` doit
  // correspondre au shift résolu plus haut, sinon "En service" signifie bien
  // "déjà en mission" et le claim doit échouer.
  const vehiculeLibre = shiftIdFinal
    ? { $or: [{ statut: "Disponible" }, { statut: "En service", currentShiftId: shiftIdFinal }] }
    : { statut: "Disponible" };

  const claimedVehicle = await Vehicle.findOneAndUpdate(
    {
      _id: vehiculeIdFinal,
      $and: [
        vehiculeLibre,
        { $or: [{ transportEnCours: null }, { transportEnCours: { $exists: false } }] },
      ],
    },
    {
      $set: {
        statut: "En service",
        transportEnCours: transportId,
      },
    },
    // new:false → on récupère l'état AVANT claim, pour que le rollback restaure
    // le statut réel ("En service" si le véhicule était sur un shift) au lieu de
    // le remettre à "Disponible" et de casser le shift en cours.
    { new: false },
  );
  if (!claimedVehicle) {
    throw new ConflictError("Véhicule déjà occupé ou indisponible — un autre transport l'utilise.");
  }
  const statutVehiculeAvantClaim = claimedVehicle.statut;

  let transportUpdated;
  try {
    const updatedTransport = await Transport.findOneAndUpdate(
      {
        _id: transportId,
        statut: { $in: ASSIGNABLE_TRANSPORT_STATES },
      },
      {
        $set: {
          vehicule: vehiculeIdFinal,
          chauffeur: chauffeurIdFinal,
          shiftId: shiftIdFinal,
          scoreDispatch,
        },
      },
      { new: true },
    );
    if (!updatedTransport) {
      throw new ConflictError(
        `Transport non assignable — statut actuel hors de [${ASSIGNABLE_TRANSPORT_STATES.join(", ")}].`,
      );
    }

    transportUpdated = await _transition(
      transportId,
      "ASSIGNED",
      _meta(utilisateur, {
        notes: auto ? `Auto-dispatch : ${justification[0]}` : "Assignation manuelle",
      }),
    );
  } catch (err) {
    // Rollback véhicule (idempotent — la clause transportEnCours: transportId
    // évite de libérer un véhicule qu'un autre processus aurait re-claimé).
    await Vehicle.findOneAndUpdate(
      { _id: vehiculeIdFinal, transportEnCours: transportId },
      { $set: { statut: statutVehiculeAvantClaim, transportEnCours: null } },
    ).catch((rollbackErr) =>
      logger.error("Rollback véhicule échoué", { err: rollbackErr.message }),
    );
    // Best-effort : revert des champs transport si le state-machine a échoué
    // après l'update partiel (sinon le transport reste avec vehicule pointant
    // sur un véhicule libéré → état orphelin visible côté UI).
    await Transport.findOneAndUpdate(
      {
        _id: transportId,
        vehicule: vehiculeIdFinal,
        statut: { $in: ASSIGNABLE_TRANSPORT_STATES },
      },
      {
        $set: {
          vehicule: null,
          chauffeur: null,
          shiftId: null,
          scoreDispatch: null,
        },
      },
    ).catch(() => {});
    throw err;
  }

  socketService.emitUnitAssigned?.({
    intervention: { _id: transport._id, numero: transport.numero },
    unite: { _id: vehiculeIdFinal },
    score: scoreDispatch,
    source: auto ? "AUTO" : "MANUEL",
  });

  // Sprint M4 — Push FCM au chauffeur (channel critique). Le socket suffit
  // quand l'app est ouverte ; le push couvre les cas "app tuée" / "ecran
  // verrouillé" — c'est précisément le coeur métier (chauffeur doit savoir
  // sa nouvelle mission même s'il a fermé l'app).
  if (chauffeurIdFinal) {
    setImmediate(() => {
      const { pushToDriver } = require("../pushDispatcher");
      pushToDriver(chauffeurIdFinal, {
        type: "transport_assigned",
        title: "Nouvelle mission",
        body: transport.numero ? `Transport ${transport.numero}` : "Nouveau transport assigné",
        channelId: "blancbleu_critical",
        priority: "high",
        data: {
          transportId: String(transport._id),
          numero: transport.numero || "",
        },
      }).catch((err) => logger.warn("[lifecycle] push driver échoué", { err: err.message }));
    });
  }

  logger.info("Véhicule assigné", {
    numero: transport.numero,
    vehicule: vehiculeIdFinal,
    auto,
    score: scoreDispatch,
  });

  scheduleGpsSimulation(transportId);

  return { transport: transportUpdated, justification };
}

module.exports = {
  assignerVehicule,
};
