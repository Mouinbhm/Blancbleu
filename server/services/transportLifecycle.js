/**
 * BlancBleu — Service Lifecycle Transport Non Urgent
 *
 * Orchestre toutes les transitions métier d'un transport :
 *   REQUESTED → CONFIRMED → SCHEDULED → ASSIGNED
 *   → EN_ROUTE_TO_PICKUP → ARRIVED_AT_PICKUP
 *   → PATIENT_ON_BOARD → ARRIVED_AT_DESTINATION → COMPLETED
 *
 * Remplace unitLifecycle.js (urgences)
 */

const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");
const Personnel = require("../models/Personnel");
const Facture = require("../models/Facture");
const { TransportStateMachine } = require("./transportStateMachine");
const { smartDispatch } = require("./smartDispatch");
const socketService = require("./socketService");
const { audit, log } = require("./auditService");
const { haversine } = require("../utils/geoUtils");
const tarifService = require("./tarifService");
const transportNotif = require("./transportNotificationService");
const { withTransactionOrFallback } = require("../utils/withTransaction");
const { ConflictError } = require("../utils/errors");
const { delPattern } = require("../utils/redis");
const featureCollector = require("./featureCollectorService");
const logger = (() => {
  try {
    return require("../utils/logger");
  } catch {
    return console;
  }
})();

// Statuts depuis lesquels un transport peut recevoir un véhicule. Cohérent
// avec TRANSITIONS du state machine : SCHEDULED → ASSIGNED et
// DRIVER_REJECTED → ASSIGNED (réassignation après refus chauffeur).
const ASSIGNABLE_TRANSPORT_STATES = ["SCHEDULED", "DRIVER_REJECTED"];

// ── SIMULATION GPS AUTO DÉSACTIVÉE ───────────────────────────────────────────
// Mettre SIMULATION_GPS_ACTIVE = true pour réactiver (démos PFE).
// Quand actif : 5s après l'assignation d'un véhicule, la simulation GPS
// démarre et fait évoluer le transport automatiquement jusqu'à COMPLETED.
const SIMULATION_GPS_ACTIVE = false;

function scheduleGpsSimulation(transportId) {
  if (!SIMULATION_GPS_ACTIVE) return; // désactivé — contrôle manuel uniquement
  if (process.env.NODE_ENV === "test") return;
  setTimeout(() => {
    require("./simulationGPS")
      .demarrerSimulation(transportId)
      .catch((err) => logger.warn("Simulation GPS non démarrée", { err: err.message }));
  }, 5000);
}

// ── Helper : effectuer une transition et sauvegarder ──────────────────────────
// session : passer une ClientSession Mongoose pour exécuter les writes dans une
// transaction ; null/undefined pour un comportement non-transactionnel (legacy).
async function _transition(transportId, nouveauStatut, metadata = {}, session = null) {
  const transport = await Transport.findById(transportId)
    .session(session)
    .populate("vehicule", "nom type statut position kilometrage carburant")
    .populate("chauffeur", "nom prenom email");

  if (!transport) throw new Error("Transport introuvable");
  if (TransportStateMachine.estTerminal(transport.statut)) {
    throw new Error(`Transport déjà terminé (statut: ${transport.statut})`);
  }

  const ancienStatut = transport.statut;

  const { update, entreeJournal } = TransportStateMachine.effectuerTransition(
    transport,
    nouveauStatut,
    metadata,
  );

  Object.assign(transport, update);
  transport.journal.push(entreeJournal);

  // ── PART A : Historique riche des statuts ─────────────────────────────────
  transport.statusLog.push({
    from: ancienStatut,
    to: nouveauStatut,
    changedBy: metadata.userId || null,
    changedByRole: metadata.userRole || "système",
    changedAt: new Date(),
    reason: metadata.reason || metadata.notes || "",
    metadata: metadata.extra || {},
  });

  await transport.save({ session: session || undefined });

  // ── Garde-fou : libération automatique du véhicule ────────────────────────
  // Garantit que le véhicule est libéré dès que la transition est persistée,
  // même si la fonction appelante (completerTransport, annulerTransport…) échoue
  // après ce point. Idempotent : re-libérer un véhicule déjà disponible est sans effet.
  // Dans une transaction, le write est inclus dans la même session.
  if (["COMPLETED", "CANCELLED", "NO_SHOW", "PAID", "FAILED"].includes(nouveauStatut)) {
    const vehiculeId = transport.vehicule?._id ?? transport.vehicule;
    if (vehiculeId) {
      try {
        await Vehicle.findByIdAndUpdate(
          vehiculeId,
          { statut: "Disponible", transportEnCours: null },
          { session: session || undefined },
        );
        logger.info("Véhicule libéré (garde-fou lifecycle)", {
          vehiculeId,
          transport: transport.numero,
          nouveauStatut,
        });
      } catch (errLiberation) {
        // Dans une transaction, on doit propager pour rollback. Hors transaction,
        // on reste best-effort comme avant.
        if (session) throw errLiberation;
        logger.warn("Garde-fou : échec libération véhicule", {
          vehiculeId,
          transport: transport.numero,
          err: errLiberation.message,
        });
      }
    }
  }

  // Émettre événements Socket.IO
  socketService.emitTransportStatut?.({
    transport,
    ancienStatut: entreeJournal.de,
    nouveauStatut,
    utilisateur: metadata.utilisateur || "système",
  });
  socketService.emitTransportStatutChange?.({
    transportId: transport._id,
    numero: transport.numero,
    ancienStatut: entreeJournal.de,
    nouveauStatut,
    journal: transport.journal,
    statusLog: transport.statusLog,
    utilisateur: metadata.utilisateur || "système",
  });
  socketService.emitStatsUpdate?.();
  // Sprint M2 — event canonique TRANSPORT_STATUS pour les clients qui suivent
  // ce transport (patient app, web Suivi en direct, driver foreground).
  const EVENTS = require("../sockets/events");
  socketService.emitToTransportRoom?.(transport._id, EVENTS.TRANSPORT_STATUS, {
    transportId: transport._id,
    numero: transport.numero,
    oldStatus: entreeJournal.de,
    newStatus: nouveauStatut,
    ancienStatut: entreeJournal.de, // alias FR rétrocompat
    nouveauStatut,
    progression:
      require("./transportStateMachine").TransportStateMachine.progression(nouveauStatut),
  });

  // ── PART E : Notification persistée + push Socket ─────────────────────────
  setImmediate(() => {
    transportNotif
      .notifyStatusChanged(
        transport,
        ancienStatut,
        nouveauStatut,
        { _id: metadata.userId, role: metadata.userRole, email: metadata.utilisateur },
        metadata.reason || metadata.notes,
      )
      .catch((err) =>
        logger.warn("[lifecycle] Notification transport échouée", { err: err.message }),
      );
  });

  // ── Sprint M4 — Push FCM pour les changements de statut clés (patient) ───
  // On évite le spam : seuls les statuts qui changent l'expérience patient
  // déclenchent une push. Le socket suffit pour les autres.
  const PATIENT_PUSH_STATUSES = new Set([
    "ASSIGNED",
    "EN_ROUTE_TO_PICKUP",
    "ARRIVED_AT_PICKUP",
    "CANCELLED",
  ]);
  if (PATIENT_PUSH_STATUSES.has(nouveauStatut) && transport.patient?.email) {
    setImmediate(() => {
      const { pushToPatientEmail } = require("./pushDispatcher");
      const titles = {
        ASSIGNED: "Véhicule attribué",
        EN_ROUTE_TO_PICKUP: "Votre ambulance arrive",
        ARRIVED_AT_PICKUP: "Votre ambulance est sur place",
        CANCELLED: "Transport annulé",
      };
      // RGPD : pas de données médicales dans le body (cf. M4 étape 7).
      pushToPatientEmail(transport.patient.email, {
        type: "transport_status",
        title: titles[nouveauStatut] || "Mise à jour transport",
        body: transport.numero ? `Transport ${transport.numero}` : "Nouvelle mise à jour",
        channelId: "blancbleu_transport",
        data: {
          transportId: String(transport._id),
          newStatus: nouveauStatut,
        },
      }).catch((err) => logger.warn("[lifecycle] push patient échoué", { err: err.message }));
    });
  }

  return transport;
}

// ── Utility : enrichir les metadata avec userId/userRole ──────────────────────
function _meta(utilisateur, overrides = {}) {
  return {
    utilisateur: utilisateur?.email || "système",
    userId: utilisateur?._id || null,
    userRole: utilisateur?.role || "système",
    ...overrides,
  };
}

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
      const DispatchConfig = require("../models/DispatchConfig");
      const cfg = await DispatchConfig.findById("default").lean();
      if (!cfg?.autoDispatch?.enabled) return;

      const { queues, QUEUES } = require("../queues");
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
// 3. ASSIGNER VÉHICULE + CHAUFFEUR (manuel ou auto)
// ══════════════════════════════════════════════════════════════════════════════
async function assignerVehicule(
  transportId,
  { shiftId, vehiculeId, chauffeurId, auto = false },
  utilisateur,
) {
  const DriverShift = require("../models/DriverShift");

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
  const claimedVehicle = await Vehicle.findOneAndUpdate(
    {
      _id: vehiculeIdFinal,
      statut: "Disponible",
      $or: [{ transportEnCours: null }, { transportEnCours: { $exists: false } }],
    },
    {
      $set: {
        statut: "En service",
        transportEnCours: transportId,
      },
    },
    { new: true },
  );
  if (!claimedVehicle) {
    throw new ConflictError("Véhicule déjà occupé ou indisponible — un autre transport l'utilise.");
  }

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
      { $set: { statut: "Disponible", transportEnCours: null } },
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
      const { pushToDriver } = require("./pushDispatcher");
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
// 8. COMPLÉTER LE TRANSPORT
// ══════════════════════════════════════════════════════════════════════════════
async function completerTransport(transportId, utilisateur) {
  // _transition('COMPLETED') déclenche déjà la libération du véhicule via le
  // garde-fou. On enveloppe les deux writes (transition + libération) dans
  // une transaction pour garantir l'atomicité.
  const transport = await withTransactionOrFallback(async (session) => {
    const updated = await _transition(transportId, "COMPLETED", _meta(utilisateur), session);
    // Le garde-fou de _transition a déjà libéré le véhicule dans la même session.
    // La libération double ci-dessous est idempotente (au cas où le garde-fou
    // n'aurait pas trouvé la version peuplée).
    if (updated.vehicule) {
      await Vehicle.findByIdAndUpdate(
        updated.vehicule._id || updated.vehicule,
        { statut: "Disponible", transportEnCours: null },
        { session: session || undefined },
      );
    }
    return updated;
  });

  // Side effects post-commit
  if (transport.vehicule) {
    socketService.emitUnitStatusChanged?.({
      unite: { _id: transport.vehicule._id || transport.vehicule, nom: "" },
      ancienStatut: "En service",
      nouveauStatut: "Disponible",
    });
  }

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
      avant: { statut: "ARRIVED_AT_DESTINATION" },
      apres: { statut: "COMPLETED" },
      message: `Transport ${transport.numero} complété en ${transport.dureeReelleMinutes} min`,
    },
  });

  // ── Création automatique de la facture pré-remplie (best-effort) ──────────
  // Non bloquant : un échec ici ne remet pas en cause la complétion du transport.
  // La facture peut toujours être créée manuellement depuis le module facturation.
  try {
    const factureExistante = await Facture.findOne({ transportId: transport._id });
    if (!factureExistante) {
      const tarif = await tarifService.calculerTarif(transport);
      const patientLabel = [transport.patient?.nom, transport.patient?.prenom]
        .filter(Boolean)
        .join(" ");
      const lieuLabel =
        transport.adresseDestination?.nom || transport.adresseDestination?.ville || "Non précisé";

      const facture = await Facture.create({
        transportId: transport._id,
        patientNom: transport.patient?.nom || "",
        patientPrenom: transport.patient?.prenom || "",
        motif: transport.motif,
        montantTotal: tarif.montantTotal,
        montantCPAM: tarif.montantCPAM,
        montantPatient: tarif.montantPatient,
        distanceKm: tarif.distanceKm,
        typeVehicule: transport.typeTransport,
        statut: "en_attente",
        notes: tarif.details.join("\n"),
      });
      logger.info("Facture auto-créée", {
        numero: transport.numero,
        montant: tarif.montantTotal,
      });
      // Notifier patient + admin/comptable qu'une facture est disponible
      const patientId = transport.patientId;
      setImmediate(() => {
        transportNotif
          .notifyInvoiceReady(facture, patientId)
          .catch((err) =>
            logger.warn("[lifecycle] notifyInvoiceReady échoué", { err: err.message }),
          );
      });
      // Transition automatique COMPLETED → BILLING_PENDING
      const _util = utilisateur;
      const _tId = transportId;
      setImmediate(async () => {
        try {
          await marquerBillingPending(_tId, _util);
          logger.info("Auto-transition BILLING_PENDING", { transport: transport.numero });
        } catch (err) {
          logger.warn("Auto-transition BILLING_PENDING échouée", {
            transport: transport.numero,
            err: err.message,
          });
        }
      });
    }
  } catch (err) {
    // Journaliser sans bloquer le workflow
    logger.warn("Création facture automatique échouée", {
      transport: transport.numero,
      err: err.message,
    });
  }

  logger.info("Transport complété", {
    numero: transport.numero,
    duree: transport.dureeReelleMinutes,
  });

  // Invalider le cache analytics (best-effort)
  delPattern("analytics:dashboard:*").catch(() => {});

  // Capture des features pour l'entraînement du DurationPredictor (best-effort,
  // non bloquant, hors transaction — l'erreur ne remet pas en cause la complétion)
  setImmediate(() => {
    featureCollector
      .captureTransportFeatures(transport)
      .catch((err) =>
        logger.warn("[lifecycle] captureTransportFeatures échoué", { err: err.message }),
      );
  });

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
// 9. NO-SHOW (patient absent)
// ══════════════════════════════════════════════════════════════════════════════
async function marquerNoShow(transportId, raison, utilisateur) {
  const raisonFinale = raison || "Patient absent à l'heure prévue";

  // Transition + raison + libération véhicule dans la même transaction
  const updated = await withTransactionOrFallback(async (session) => {
    const transport = await Transport.findById(transportId).session(session);
    if (!transport) throw new Error("Transport introuvable");

    transport.raisonNoShow = raisonFinale;
    await transport.save({ session: session || undefined });

    const updatedDoc = await _transition(
      transportId,
      "NO_SHOW",
      _meta(utilisateur, {
        notes: raisonFinale,
        reason: raisonFinale,
      }),
      session,
    );

    if (updatedDoc.vehicule) {
      await Vehicle.findByIdAndUpdate(
        updatedDoc.vehicule._id || updatedDoc.vehicule,
        { statut: "Disponible", transportEnCours: null },
        { session: session || undefined },
      );
    }
    return updatedDoc;
  });

  logger.info("No-show enregistré", { numero: updated.numero, raison: raisonFinale });
  return { transport: updated };
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. ANNULER
// ══════════════════════════════════════════════════════════════════════════════
async function annulerTransport(transportId, raison, utilisateur) {
  const raisonFinale = raison || "Annulé par l'opérateur";

  // Transition + raison + libération véhicule dans la même transaction
  const updated = await withTransactionOrFallback(async (session) => {
    const transport = await Transport.findById(transportId).session(session);
    if (!transport) throw new Error("Transport introuvable");

    transport.raisonAnnulation = raisonFinale;
    await transport.save({ session: session || undefined });

    const updatedDoc = await _transition(
      transportId,
      "CANCELLED",
      _meta(utilisateur, {
        raisonAnnulation: raisonFinale,
        reason: raisonFinale,
      }),
      session,
    );

    if (updatedDoc.vehicule) {
      await Vehicle.findByIdAndUpdate(
        updatedDoc.vehicule._id || updatedDoc.vehicule,
        { statut: "Disponible", transportEnCours: null },
        { session: session || undefined },
      );
    }
    return updatedDoc;
  });

  logger.info("Transport annulé", { numero: updated.numero, raison: raisonFinale });
  return { transport: updated };
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. REPROGRAMMER
// ══════════════════════════════════════════════════════════════════════════════
async function reprogrammerTransport(transportId, { nouvelleDate, raison }, utilisateur) {
  if (!nouvelleDate) throw new Error("Nouvelle date obligatoire pour reprogrammer");

  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  transport.raisonReprogrammation = raison || "Reprogrammé à la demande";
  await transport.save();

  const updated = await _transition(
    transportId,
    "RESCHEDULED",
    _meta(utilisateur, {
      raisonReprogrammation: transport.raisonReprogrammation,
      reason: transport.raisonReprogrammation,
      nouvelleDate,
    }),
  );

  // Libérer le véhicule si assigné
  if (updated.vehicule) {
    await Vehicle.findByIdAndUpdate(updated.vehicule, {
      statut: "Disponible",
      transportEnCours: null,
    });
    await Transport.findByIdAndUpdate(transportId, {
      vehicule: null,
      chauffeur: null,
    });
  }

  logger.info("Transport reprogrammé", {
    numero: transport.numero,
    nouvelleDate,
  });
  return { transport: updated };
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. CLÔTURE FINANCIÈRE — BILLED (superviseur/admin uniquement)
//     Le contrôleur doit vérifier le rôle avant d'appeler cette fonction.
// ══════════════════════════════════════════════════════════════════════════════
async function cloturerFacturation(transportId, factureId, utilisateur) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  // Associer la facture sur le document avant la transition
  if (factureId) {
    transport.facture = factureId;
    transport._factureIdTemp = factureId;
    await transport.save();
  }

  // Accepte COMPLETED → BILLED (rétrocompat) ou BILLING_PENDING → BILLED (flux étendu)
  const { TransportStateMachine: TSM } = require("./transportStateMachine");
  if (!TSM.canTransition(transport.statut, "BILLED")) {
    throw new Error(
      `Transition invalide : ${transport.statut} → BILLED. Autorisées : ${(require("./transportStateMachine").TRANSITIONS[transport.statut] || []).join(", ")}`,
    );
  }

  const updated = await _transition(
    transportId,
    "BILLED",
    _meta(utilisateur, {
      notes: `Clôture CPAM — facture ${factureId || transport.facture}`,
      factureId: factureId || transport.facture,
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
      avant: { statut: "COMPLETED" },
      apres: { statut: "BILLED" },
      message: `Transport ${transport.numero} facturé (CPAM)`,
    },
  });

  logger.info("Transport facturé (BILLED)", {
    numero: transport.numero,
    factureId: factureId || transport.facture,
  });
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

// ══════════════════════════════════════════════════════════════════════════════
// 16. MARQUER PAYÉ — BILLED → PAID
// ══════════════════════════════════════════════════════════════════════════════
async function marquerPaid(transportId, utilisateur) {
  const transport = await _transition(
    transportId,
    "PAID",
    _meta(utilisateur, {
      notes: "Paiement reçu",
    }),
  );

  await log({
    action: "STATUT_CHANGED",
    origine: "HUMAIN",
    utilisateur,
    ressource: { type: "Transport", id: transport._id, reference: transport.numero },
    details: {
      avant: { statut: "BILLED" },
      apres: { statut: "PAID" },
      message: `Transport ${transport.numero} payé`,
    },
  });

  logger.info("Transport marqué payé", { numero: transport.numero });
  delPattern("analytics:dashboard:*").catch(() => {});
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// 17. MARQUER ÉCHOUÉ — tout statut non terminal → FAILED
// ══════════════════════════════════════════════════════════════════════════════
async function marquerFailed(transportId, raison, utilisateur) {
  const transport = await _transition(
    transportId,
    "FAILED",
    _meta(utilisateur, {
      raisonEchec: raison || "Échec du transport",
      notes: raison || "Échec du transport",
      reason: raison || "Échec du transport",
    }),
  );

  // Libérer le véhicule si encore assigné
  if (transport.vehicule) {
    await Vehicle.findByIdAndUpdate(transport.vehicule, {
      statut: "Disponible",
      transportEnCours: null,
    });
  }

  logger.info("Transport en échec", { numero: transport.numero, raison });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// PART B — SIGNATURE PATIENT / PREUVE DE PRISE EN CHARGE
// ══════════════════════════════════════════════════════════════════════════════
async function addSignature(
  transportId,
  { signedByName, signatureBase64, signatureImageUrl, consentText },
  utilisateur,
) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  const statutsValides = [
    "ARRIVED_AT_DESTINATION",
    "COMPLETED",
    "BILLING_PENDING",
    "BILLED",
    "PAID",
  ];
  if (!statutsValides.includes(transport.statut)) {
    throw new Error(
      `Signature impossible au statut ${transport.statut}. Statuts autorisés : ${statutsValides.join(", ")}`,
    );
  }

  if (transport.proofOfCare?.signed) {
    const isAdmin = utilisateur?.role === "admin";
    if (!isAdmin)
      throw new Error("Ce transport a déjà une signature. Seul un admin peut la remplacer.");
  }

  // Limite base64 : 2 MB
  if (signatureBase64 && Buffer.byteLength(signatureBase64, "utf8") > 2 * 1024 * 1024) {
    throw new Error("La signature dépasse la taille maximale autorisée (2 Mo)");
  }

  transport.proofOfCare = {
    signed: true,
    signedAt: new Date(),
    signedByName: signedByName || "",
    signatureImageUrl: signatureImageUrl || "",
    signatureBase64: signatureBase64 || "",
    driverId: transport.chauffeur || null,
    patientId: transport.patientId || null,
    consentText: consentText || "Je certifie avoir été transporté conformément à ma demande.",
  };
  await transport.save();

  // Émettre dans la room transport:{id} pour la mise à jour temps réel
  socketService.emitToTransportRoom?.(transport._id, "transport:signature_added", {
    transportId: transport._id,
    numero: transport.numero,
    signedByName: signedByName || "",
    signedAt: transport.proofOfCare.signedAt,
  });

  // Notification persistée admin + dispatcher
  setImmediate(() => {
    transportNotif
      .notifySignatureAdded(transport)
      .catch((err) => logger.warn("[lifecycle] notifySignatureAdded échoué", { err: err.message }));
  });

  logger.info("Signature patient ajoutée", { numero: transport.numero, signedByName });
  return { transport };
}

// ══════════════════════════════════════════════════════════════════════════════
// PART C — GESTION DOCUMENTS PMT
// ══════════════════════════════════════════════════════════════════════════════
async function uploadPmtDocument(
  transportId,
  { fileUrl, fileName, uploadedBy, triggerOcr = false },
) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  const doc = {
    fileUrl,
    fileName: fileName || fileUrl.split("/").pop(),
    uploadedAt: new Date(),
    uploadedBy: uploadedBy || null,
    ocrStatus: triggerOcr ? "pending" : "skipped",
    extractedData: {},
  };
  transport.pmtDocuments.push(doc);
  await transport.save();

  // Déclencher OCR si disponible (best-effort, non bloquant)
  if (triggerOcr) {
    const addedDoc = transport.pmtDocuments[transport.pmtDocuments.length - 1];
    setImmediate(async () => {
      try {
        const aiClient = require("./aiClient");
        await Transport.findByIdAndUpdate(transportId, {
          $set: { [`pmtDocuments.${transport.pmtDocuments.length - 1}.ocrStatus`]: "processing" },
        });
        const result = await aiClient.extractPmt(fileUrl);
        await Transport.findOneAndUpdate(
          { _id: transportId, "pmtDocuments._id": addedDoc._id },
          { $set: { "pmtDocuments.$.ocrStatus": "done", "pmtDocuments.$.extractedData": result } },
        );
        socketService.emitPmtExtraite?.({
          transportId,
          documentId: addedDoc._id,
          extractedData: result,
        });
        logger.info("OCR PMT terminé", { transportId, fileName });
      } catch (err) {
        await Transport.findOneAndUpdate(
          { _id: transportId, "pmtDocuments._id": addedDoc._id },
          { $set: { "pmtDocuments.$.ocrStatus": "error" } },
        );
        logger.warn("OCR PMT échoué", { transportId, err: err.message });
      }
    });
  }

  logger.info("Document PMT ajouté", { numero: transport.numero, fileName });
  return { transport };
}

async function deletePmtDocument(transportId, documentId, utilisateur) {
  const transport = await Transport.findById(transportId);
  if (!transport) throw new Error("Transport introuvable");

  const doc = transport.pmtDocuments.id(documentId);
  if (!doc) throw new Error("Document PMT introuvable");

  doc.deleteOne();
  await transport.save();

  logger.info("Document PMT supprimé", { numero: transport.numero, documentId });
  return { transport };
}

module.exports = {
  confirmerTransport,
  planifierTransport,
  assignerVehicule,
  marquerEnRoute,
  marquerArriveePatient,
  marquerPatientABord,
  marquerArriveeDestination,
  demarrerAttenteDestination,
  demarrerRetourBase,
  completerTransport,
  cloturerFacturation,
  marquerNoShow,
  annulerTransport,
  reprogrammerTransport,
  accepterDriver,
  refuserDriver,
  marquerBillingPending,
  marquerPaid,
  marquerFailed,
  // PART A
  getTransportTimeline,
  // PART B
  addSignature,
  // PART C
  uploadPmtDocument,
  deletePmtDocument,
};
