/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — State Machine Transport Non Urgent             ║
 * ║  9 statuts · transitions validées · horodatages auto       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FLUX NOMINAL :
 *  REQUESTED → CONFIRMED → SCHEDULED → ASSIGNED
 *    → EN_ROUTE_TO_PICKUP → ARRIVED_AT_PICKUP
 *    → PATIENT_ON_BOARD → ARRIVED_AT_DESTINATION
 *    → [WAITING_AT_DESTINATION →] RETURN_TO_BASE → COMPLETED → BILLED
 *
 * STATUTS ALTERNATIFS :
 *  → CANCELLED   (depuis tout statut non terminal)
 *  → NO_SHOW     (depuis ARRIVED_AT_PICKUP uniquement)
 *  → RESCHEDULED (depuis CONFIRMED, SCHEDULED, NO_SHOW)
 *
 * NOUVEAUX STATUTS (v1.1) :
 *  WAITING_AT_DESTINATION — attente sur place (dialyse, chimio…) — OPTIONNEL
 *  RETURN_TO_BASE         — trajet retour chauffeur vers la base
 *  BILLED                 — clôture financière CPAM (superviseur/admin uniquement)
 */

// ══════════════════════════════════════════════════════════════════════════════
// STATUTS
// ══════════════════════════════════════════════════════════════════════════════
const STATUTS = {
  REQUESTED: "REQUESTED",
  CONFIRMED: "CONFIRMED",
  SCHEDULED: "SCHEDULED",
  ASSIGNED: "ASSIGNED",
  EN_ROUTE_TO_PICKUP: "EN_ROUTE_TO_PICKUP",
  ARRIVED_AT_PICKUP: "ARRIVED_AT_PICKUP",
  PATIENT_ON_BOARD: "PATIENT_ON_BOARD",
  ARRIVED_AT_DESTINATION: "ARRIVED_AT_DESTINATION",
  // ── Nouveaux statuts v1.1 ─────────────────────────────────────────────────
  WAITING_AT_DESTINATION: "WAITING_AT_DESTINATION", // attente sur place (optionnel)
  RETURN_TO_BASE: "RETURN_TO_BASE",                  // trajet retour chauffeur
  COMPLETED: "COMPLETED",
  BILLED: "BILLED",                                  // clôture CPAM (terminal)
  // ── Statuts alternatifs ───────────────────────────────────────────────────
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
  RESCHEDULED: "RESCHEDULED",
};

// ══════════════════════════════════════════════════════════════════════════════
// TRANSITIONS AUTORISÉES
// ══════════════════════════════════════════════════════════════════════════════
const TRANSITIONS = {
  REQUESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SCHEDULED", "RESCHEDULED", "CANCELLED"],
  SCHEDULED: ["ASSIGNED", "RESCHEDULED", "CANCELLED"],
  ASSIGNED: ["EN_ROUTE_TO_PICKUP", "CANCELLED"],
  EN_ROUTE_TO_PICKUP: ["ARRIVED_AT_PICKUP", "CANCELLED"],
  ARRIVED_AT_PICKUP: ["PATIENT_ON_BOARD", "NO_SHOW"],
  PATIENT_ON_BOARD: ["ARRIVED_AT_DESTINATION"],
  // WAITING_AT_DESTINATION est optionnel : transition directe vers RETURN_TO_BASE
  // ou COMPLETED toujours possible (rétrocompatibilité avec l'existant)
  ARRIVED_AT_DESTINATION: ["WAITING_AT_DESTINATION", "RETURN_TO_BASE", "COMPLETED", "CANCELLED"],
  WAITING_AT_DESTINATION: ["RETURN_TO_BASE", "CANCELLED"],
  RETURN_TO_BASE: ["COMPLETED", "CANCELLED"],
  // COMPLETED peut progresser vers BILLED (clôture financière superviseur)
  COMPLETED: ["BILLED"],
  BILLED: [],    // terminal — clôture CPAM définitive
  CANCELLED: [], // terminal
  NO_SHOW: ["RESCHEDULED"],
  RESCHEDULED: ["CONFIRMED"],
};

// ══════════════════════════════════════════════════════════════════════════════
// LABELS LISIBLES
// ══════════════════════════════════════════════════════════════════════════════
const LABELS = {
  REQUESTED: { fr: "Demande reçue", color: "slate", icon: "add_circle" },
  CONFIRMED: { fr: "Confirmé", color: "blue", icon: "check_circle" },
  SCHEDULED: { fr: "Planifié", color: "indigo", icon: "event" },
  ASSIGNED: { fr: "Véhicule assigné", color: "purple", icon: "local_taxi" },
  EN_ROUTE_TO_PICKUP: {
    fr: "En route",
    color: "orange",
    icon: "directions_car",
  },
  ARRIVED_AT_PICKUP: {
    fr: "Arrivé chez le patient",
    color: "yellow",
    icon: "location_on",
  },
  PATIENT_ON_BOARD: { fr: "Patient à bord", color: "cyan", icon: "person" },
  ARRIVED_AT_DESTINATION: {
    fr: "Arrivé à destination",
    color: "teal",
    icon: "local_hospital",
  },
  WAITING_AT_DESTINATION: {
    fr: "Attente à destination",
    color: "cyan",
    icon: "hourglass_top",
  },
  RETURN_TO_BASE: {
    fr: "Retour base",
    color: "indigo",
    icon: "home_work",
  },
  COMPLETED: { fr: "Transport terminé", color: "green", icon: "done_all" },
  BILLED: { fr: "Facturé CPAM", color: "emerald", icon: "receipt_long" },
  CANCELLED: { fr: "Annulé", color: "red", icon: "cancel" },
  NO_SHOW: { fr: "Patient absent", color: "pink", icon: "person_off" },
  RESCHEDULED: { fr: "Reprogrammé", color: "amber", icon: "event_repeat" },
};

// ══════════════════════════════════════════════════════════════════════════════
// HORODATAGES PAR STATUT
// ══════════════════════════════════════════════════════════════════════════════
const TIMESTAMPS = {
  CONFIRMED: "heureConfirmation",
  SCHEDULED: "heurePlanification",
  ASSIGNED: "heureAssignation",
  EN_ROUTE_TO_PICKUP: "heureEnRoute",
  ARRIVED_AT_PICKUP: "heurePriseEnCharge",
  PATIENT_ON_BOARD: "heurePriseEnCharge",
  ARRIVED_AT_DESTINATION: "heureArriveeDestination",
  WAITING_AT_DESTINATION: "heureDebutAttente",  // début de l'attente sur place
  RETURN_TO_BASE: "heureDepartRetour",           // départ retour vers la base
  COMPLETED: "heureTerminee",
  BILLED: "heureFacturation",                    // clôture financière
  CANCELLED: "heureAnnulation",
  NO_SHOW: "heureAnnulation",
  RESCHEDULED: "heureReprogrammation",
};

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATEURS PAR TRANSITION
// ══════════════════════════════════════════════════════════════════════════════
const VALIDATEURS = {
  // Confirmation : vérifier date, heure, adresses
  REQUESTED_CONFIRMED: (transport) => {
    const errors = [];
    if (!transport.dateTransport) errors.push("Date de transport manquante");
    if (!transport.heureRDV) errors.push("Heure de RDV manquante");
    if (!transport.adresseDepart?.rue)
      errors.push("Adresse de départ manquante");
    if (!transport.adresseDestination?.rue)
      errors.push("Adresse de destination manquante");
    return errors;
  },

  // Planification : PMT requise pour dialyse/chimio/radio
  // Acceptée si : validée formellement OU contenu OCR présent OU extraitPar renseigné
  CONFIRMED_SCHEDULED: (transport) => {
    const errors = [];
    const pmtRequise = ["Dialyse", "Chimiothérapie", "Radiothérapie"].includes(transport.motif);
    const pmtValide =
      transport.prescription?.validee === true ||
      transport.prescription?.contenu != null ||
      transport.prescription?.extraitPar != null;

    if (pmtRequise && !pmtValide) {
      errors.push("PMT requise pour ce motif");
    }
    return errors;
  },

  // Assignation : véhicule requis, chauffeur optionnel
  SCHEDULED_ASSIGNED: (transport) => {
    const errors = [];
    if (!transport.vehicule) errors.push("Véhicule non assigné");
    return errors;
  },

  // Complétion directe depuis ARRIVED_AT_DESTINATION : heure d'arrivée requise
  ARRIVED_AT_DESTINATION_COMPLETED: (transport) => {
    const errors = [];
    if (!transport.heureArriveeDestination)
      errors.push("Heure d'arrivée à destination non renseignée");
    return errors;
  },

  // Clôture financière — guard assoupli : la facture est auto-créée par le
  // contrôleur si absente ; on n'exige plus qu'elle soit déjà liée ici.
  COMPLETED_BILLED: (_transport) => [],

  // Reprogrammation : raison obligatoire
  "*_RESCHEDULED": (transport) => {
    const errors = [];
    if (!transport.raisonReprogrammation && !transport._raisonTemp) {
      errors.push("Raison de la reprogrammation obligatoire");
    }
    return errors;
  },

  // Annulation : toujours autorisée (sauf états terminaux)
  "*_CANCELLED": () => [],

  // NO_SHOW : toujours autorisé depuis ARRIVED_AT_PICKUP
  "*_NO_SHOW": () => [],
};

// ══════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE
// ══════════════════════════════════════════════════════════════════════════════
class TransportStateMachine {
  static peutTransitionner(statutActuel, nouveauStatut) {
    const transitions = TRANSITIONS[statutActuel] || [];
    return transitions.includes(nouveauStatut);
  }

  static validerTransition(transport, nouveauStatut) {
    const cle = `${transport.statut}_${nouveauStatut}`;
    const validateur = VALIDATEURS[cle] || VALIDATEURS[`*_${nouveauStatut}`];
    if (!validateur) return [];
    return validateur(transport);
  }

  static effectuerTransition(transport, nouveauStatut, metadata = {}) {
    const {
      utilisateur,
      notes,
      raisonAnnulation,
      raisonNoShow,
      raisonReprogrammation,
      nouvelleDate,
      dureeAttenteMinutes, // durée estimée de l'attente à destination (minutes)
      factureId,           // référence facture pour la clôture BILLED
    } = metadata;

    // 1. Vérifier autorisation
    if (!this.peutTransitionner(transport.statut, nouveauStatut)) {
      throw new Error(
        `Transition invalide : ${transport.statut} → ${nouveauStatut}. ` +
          `Autorisées : ${(TRANSITIONS[transport.statut] || []).join(", ")}`,
      );
    }

    // 2. Injecter les champs temporaires pour les validateurs
    if (raisonReprogrammation) transport._raisonTemp = raisonReprogrammation;
    if (factureId) transport._factureIdTemp = factureId;

    // 3. Valider conditions métier
    const erreurs = this.validerTransition(transport, nouveauStatut);
    if (erreurs.length > 0) {
      throw new Error(`Conditions non remplies : ${erreurs.join(" · ")}`);
    }

    // 4. Préparer la mise à jour
    const champTimestamp = TIMESTAMPS[nouveauStatut];
    const update = {
      statut: nouveauStatut,
      ...(champTimestamp ? { [champTimestamp]: new Date() } : {}),
    };

    // 5. Champs spécifiques selon transition
    switch (nouveauStatut) {
      // Durée estimée d'attente saisie par le chauffeur (optionnelle)
      case "WAITING_AT_DESTINATION":
        if (dureeAttenteMinutes != null) {
          update.dureeAttenteMinutes = dureeAttenteMinutes;
        }
        break;

      case "COMPLETED":
        if (transport.heureEnRoute) {
          update.dureeReelleMinutes = Math.round(
            (Date.now() - new Date(transport.heureEnRoute)) / 60000,
          );
        }
        break;

      // Associer la facture lors de la clôture financière
      case "BILLED":
        if (factureId) update.facture = factureId;
        break;

      case "CANCELLED":
        update.raisonAnnulation =
          raisonAnnulation || notes || "Annulé par l'opérateur";
        break;
      case "NO_SHOW":
        update.raisonNoShow =
          raisonNoShow || notes || "Patient absent à l'heure prévue";
        break;
      case "RESCHEDULED":
        update.raisonReprogrammation = raisonReprogrammation || notes || "";
        if (nouvelleDate) update.nouvelleDate = nouvelleDate;
        break;
    }

    // 6. Entrée journal
    const entreeJournal = {
      de: transport.statut,
      vers: nouveauStatut,
      timestamp: new Date(),
      utilisateur: utilisateur || "système",
      notes: notes || "",
    };

    return { update, entreeJournal };
  }

  static transitionsPossibles(statut) {
    return (TRANSITIONS[statut] || []).map((s) => ({
      statut: s,
      label: LABELS[s]?.fr,
      icon: LABELS[s]?.icon,
      color: LABELS[s]?.color,
    }));
  }

  static progression(statut) {
    // Flux nominal complet incluant les nouveaux statuts v1.1.
    // WAITING_AT_DESTINATION est optionnel dans le flux réel, mais inclus
    // dans l'échelle de progression pour cohérence visuelle.
    const ordre = [
      "REQUESTED",              // 0%
      "CONFIRMED",              // 9%
      "SCHEDULED",              // 18%
      "ASSIGNED",               // 27%
      "EN_ROUTE_TO_PICKUP",     // 36%
      "ARRIVED_AT_PICKUP",      // 45%
      "PATIENT_ON_BOARD",       // 55%
      "ARRIVED_AT_DESTINATION", // 64%
      "WAITING_AT_DESTINATION", // 73%
      "RETURN_TO_BASE",         // 82%
      "COMPLETED",              // 91%
      "BILLED",                 // 100%
    ];
    const idx = ordre.indexOf(statut);
    if (idx === -1) return null; // CANCELLED, NO_SHOW, RESCHEDULED → null
    return Math.round((idx / (ordre.length - 1)) * 100);
  }

  static estTerminal(statut) {
    // COMPLETED n'est plus terminal : il peut progresser vers BILLED.
    // BILLED est le seul terminal du flux nominal (clôture CPAM définitive).
    return ["BILLED", "CANCELLED", "NO_SHOW"].includes(statut);
  }
}

module.exports = {
  TransportStateMachine,
  STATUTS,
  TRANSITIONS,
  LABELS,
  TIMESTAMPS,
};
