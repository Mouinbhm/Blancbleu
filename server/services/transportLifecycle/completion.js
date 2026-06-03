/**
 * BlancBleu — Lifecycle Transport : complétion, facturation, fins de cycle.
 *
 * Complétion (+ facture auto), clôture CPAM (BILLED), paiement (PAID), échec
 * (FAILED), no-show, annulation et reprogrammation. Ces transitions terminales
 * libèrent le véhicule (via le garde-fou de `_transition` + double libération
 * idempotente dans la même transaction).
 */

const {
  Transport,
  Vehicle,
  Facture,
  socketService,
  log,
  tarifService,
  transportNotif,
  withTransactionOrFallback,
  delPattern,
  featureCollector,
  logger,
  _transition,
  _meta,
} = require("./_core");
const { marquerBillingPending } = require("./transitions");

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
  const { TransportStateMachine: TSM } = require("../transportStateMachine");
  if (!TSM.canTransition(transport.statut, "BILLED")) {
    throw new Error(
      `Transition invalide : ${transport.statut} → BILLED. Autorisées : ${(require("../transportStateMachine").TRANSITIONS[transport.statut] || []).join(", ")}`,
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

module.exports = {
  completerTransport,
  cloturerFacturation,
  marquerPaid,
  marquerFailed,
  marquerNoShow,
  annulerTransport,
  reprogrammerTransport,
};
