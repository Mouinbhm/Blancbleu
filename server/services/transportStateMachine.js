const { ForbiddenError } = require("../utils/errors");

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — State Machine Transport Non Urgent             ║
 * ║  9 statuts · transitions validées · horodatages auto       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FLUX NOMINAL :
 *  REQUESTED → CONFIRMED → SCHEDULED → ASSIGNED
 *    → [DRIVER_ACCEPTED →] EN_ROUTE_TO_PICKUP → ARRIVED_AT_PICKUP
 *    → PATIENT_ON_BOARD → ARRIVED_AT_DESTINATION
 *    → [WAITING_AT_DESTINATION →] RETURN_TO_BASE → COMPLETED
 *    → BILLING_PENDING → BILLED → PAID
 *
 * STATUTS ALTERNATIFS :
 *  → CANCELLED   (depuis tout statut non terminal)
 *  → NO_SHOW     (depuis ARRIVED_AT_PICKUP uniquement)
 *  → RESCHEDULED (depuis CONFIRMED, SCHEDULED, DRIVER_REJECTED, NO_SHOW)
 *    RESCHEDULED → SCHEDULED | CANCELLED  (jamais → CONFIRMED)
 *
 * NOUVEAUX STATUTS (v1.1) :
 *  WAITING_AT_DESTINATION — attente sur place (dialyse, chimio…) — OPTIONNEL
 *  RETURN_TO_BASE         — trajet retour chauffeur vers la base
 *
 * CLÔTURE FINANCIÈRE (v1.2) :
 *  BILLING_PENDING — facturation CPAM en cours de traitement
 *  BILLED          — facture CPAM émise
 *  PAID            — paiement reçu (terminal)
 */

// ══════════════════════════════════════════════════════════════════════════════
// STATUTS
// ══════════════════════════════════════════════════════════════════════════════
const STATUTS = {
  REQUESTED: "REQUESTED",
  CONFIRMED: "CONFIRMED",
  SCHEDULED: "SCHEDULED",
  ASSIGNED: "ASSIGNED",
  // ── Acceptation / refus chauffeur (v1.2) ─────────────────────────────────
  DRIVER_ACCEPTED: "DRIVER_ACCEPTED",
  DRIVER_REJECTED: "DRIVER_REJECTED",
  EN_ROUTE_TO_PICKUP: "EN_ROUTE_TO_PICKUP",
  ARRIVED_AT_PICKUP: "ARRIVED_AT_PICKUP",
  PATIENT_ON_BOARD: "PATIENT_ON_BOARD",
  ARRIVED_AT_DESTINATION: "ARRIVED_AT_DESTINATION",
  // ── Nouveaux statuts v1.1 ─────────────────────────────────────────────────
  WAITING_AT_DESTINATION: "WAITING_AT_DESTINATION", // attente sur place (optionnel)
  RETURN_TO_BASE: "RETURN_TO_BASE", // trajet retour chauffeur
  COMPLETED: "COMPLETED",
  // ── Facturation étendue (v1.2) ────────────────────────────────────────────
  BILLING_PENDING: "BILLING_PENDING",
  BILLED: "BILLED",
  PAID: "PAID", // paiement reçu (terminal)
  // ── Statuts alternatifs ───────────────────────────────────────────────────
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
  RESCHEDULED: "RESCHEDULED",
  FAILED: "FAILED", // échec (terminal)
};

// ══════════════════════════════════════════════════════════════════════════════
// TRANSITIONS AUTORISÉES
// ══════════════════════════════════════════════════════════════════════════════
const TRANSITIONS = {
  REQUESTED: ["CONFIRMED", "CANCELLED", "FAILED"],
  CONFIRMED: ["SCHEDULED", "RESCHEDULED", "CANCELLED", "FAILED"],
  SCHEDULED: ["ASSIGNED", "RESCHEDULED", "CANCELLED", "FAILED"],
  ASSIGNED: ["DRIVER_ACCEPTED", "DRIVER_REJECTED", "EN_ROUTE_TO_PICKUP", "CANCELLED", "FAILED"],
  DRIVER_ACCEPTED: ["EN_ROUTE_TO_PICKUP", "CANCELLED", "FAILED"],
  DRIVER_REJECTED: ["ASSIGNED", "RESCHEDULED", "CANCELLED"],
  EN_ROUTE_TO_PICKUP: ["ARRIVED_AT_PICKUP", "CANCELLED", "FAILED"],
  ARRIVED_AT_PICKUP: ["PATIENT_ON_BOARD", "NO_SHOW", "CANCELLED", "FAILED"],
  PATIENT_ON_BOARD: ["ARRIVED_AT_DESTINATION", "FAILED"],
  // WAITING_AT_DESTINATION est optionnel : transition directe possible vers COMPLETED
  ARRIVED_AT_DESTINATION: [
    "WAITING_AT_DESTINATION",
    "RETURN_TO_BASE",
    "COMPLETED",
    "CANCELLED",
    "FAILED",
  ],
  WAITING_AT_DESTINATION: ["RETURN_TO_BASE", "CANCELLED", "FAILED"],
  RETURN_TO_BASE: ["COMPLETED", "CANCELLED", "FAILED"],
  // COMPLETED → BILLING_PENDING (obligatoire) → BILLED → PAID
  COMPLETED: ["BILLING_PENDING"],
  BILLING_PENDING: ["BILLED"],
  BILLED: ["PAID"],
  PAID: [], // terminal — paiement reçu
  CANCELLED: [], // terminal
  NO_SHOW: ["RESCHEDULED"],
  RESCHEDULED: ["SCHEDULED", "CANCELLED"],
  FAILED: [], // terminal — échec définitif
};

// ══════════════════════════════════════════════════════════════════════════════
// RBAC — RÔLES AUTORISÉS PAR TRANSITION
// ══════════════════════════════════════════════════════════════════════════════
// Table d'autorisation : pour chaque transition (clé "FROM_TO"), liste des
// rôles autorisés à la déclencher. Les clés "*_TO" sont des wildcards
// applicables depuis n'importe quel statut source — typiquement utilisés
// pour CANCELLED, NO_SHOW, FAILED, RESCHEDULED.
//
// Le rôle "system" est un sentinel utilisé par les workers BullMQ et les
// transitions automatiques (auto-dispatch, billing, garde-fous lifecycle).
// Le helper lifecycle `_meta` renvoie le sentinel "système" (FR) quand
// aucun utilisateur n'est passé — canTransition() normalise les deux.
//
// Politique stricte : si aucune entrée n'existe pour une transition (ni clé
// directe, ni wildcard), accès refusé par défaut. Cela force à documenter
// explicitement chaque chemin valide quand de nouvelles transitions sont
// ajoutées au state machine.
const TRANSITION_PERMISSIONS = {
  // ── Cycle de planification (dispatcher / admin) ─────────────────────────
  REQUESTED_CONFIRMED: ["admin", "dispatcher"],
  CONFIRMED_SCHEDULED: ["admin", "dispatcher"],
  SCHEDULED_ASSIGNED: ["admin", "dispatcher", "system"],

  // ── Acceptation / refus chauffeur (chauffeur côté app driver) ─────────
  ASSIGNED_DRIVER_ACCEPTED: ["chauffeur"],
  ASSIGNED_DRIVER_REJECTED: ["chauffeur"],
  ASSIGNED_EN_ROUTE_TO_PICKUP: ["chauffeur", "admin"],
  DRIVER_ACCEPTED_EN_ROUTE_TO_PICKUP: ["chauffeur"],
  DRIVER_REJECTED_ASSIGNED: ["admin", "dispatcher"],
  DRIVER_REJECTED_RESCHEDULED: ["admin", "dispatcher"],
  RESCHEDULED_SCHEDULED: ["admin", "dispatcher"],

  // ── Phase opérationnelle terrain (chauffeur) ────────────────────────────
  EN_ROUTE_TO_PICKUP_ARRIVED_AT_PICKUP: ["chauffeur"],
  ARRIVED_AT_PICKUP_PATIENT_ON_BOARD: ["chauffeur"],
  PATIENT_ON_BOARD_ARRIVED_AT_DESTINATION: ["chauffeur"],
  ARRIVED_AT_DESTINATION_WAITING_AT_DESTINATION: ["chauffeur"],
  ARRIVED_AT_DESTINATION_RETURN_TO_BASE: ["chauffeur"],
  ARRIVED_AT_DESTINATION_COMPLETED: ["chauffeur", "admin"],
  WAITING_AT_DESTINATION_RETURN_TO_BASE: ["chauffeur"],
  RETURN_TO_BASE_COMPLETED: ["chauffeur", "admin"],

  // ── Clôture financière (system enclenche, comptable confirme, system encaisse)
  COMPLETED_BILLING_PENDING: ["system"],
  BILLING_PENDING_BILLED: ["admin", "comptable"],
  BILLED_PAID: ["admin", "comptable", "system"],

  // ── Transitions universelles (wildcards depuis n'importe quel statut) ──
  "*_CANCELLED": ["admin", "dispatcher"],
  "*_NO_SHOW": ["chauffeur", "dispatcher", "admin"],
  "*_FAILED": ["admin", "system"],
  "*_RESCHEDULED": ["admin", "dispatcher"],
};

// Le sentinel "système" (FR) est aliasé sur "system" (EN) pour permettre
// aux callers historiques (lifecycle._meta avec utilisateur null) de passer
// la RBAC sans casser. Toute nouvelle écriture doit utiliser "system".
const SYSTEM_ROLE_ALIASES = new Set(["system", "système"]);

// Les rôles personnel terrain (Personnel.role enum) qui doivent passer comme
// "chauffeur" pour la RBAC. Le driverController construit un pseudo-User à
// partir du Personnel — `personnel.role` peut être "Chauffeur" (Personnel enum)
// ou "chauffeur" (User enum si lié). Cf. server/workers/autoDispatchWorker.js
// qui considère déjà ["Ambulancier", "Chauffeur"] comme conducteurs eligibles.
const DRIVER_ROLE_ALIASES = new Set(["chauffeur", "Chauffeur", "ambulancier", "Ambulancier"]);

// ══════════════════════════════════════════════════════════════════════════════
// LABELS LISIBLES
// ══════════════════════════════════════════════════════════════════════════════
const LABELS = {
  REQUESTED: { fr: "Demande reçue", color: "slate", icon: "add_circle" },
  CONFIRMED: { fr: "Confirmé", color: "blue", icon: "check_circle" },
  SCHEDULED: { fr: "Planifié", color: "indigo", icon: "event" },
  ASSIGNED: { fr: "Véhicule assigné", color: "purple", icon: "local_taxi" },
  DRIVER_ACCEPTED: { fr: "Chauffeur accepté", color: "teal", icon: "thumb_up" },
  DRIVER_REJECTED: { fr: "Chauffeur refusé", color: "orange", icon: "thumb_down" },
  EN_ROUTE_TO_PICKUP: { fr: "En route", color: "orange", icon: "directions_car" },
  ARRIVED_AT_PICKUP: { fr: "Arrivé chez le patient", color: "yellow", icon: "location_on" },
  PATIENT_ON_BOARD: { fr: "Patient à bord", color: "cyan", icon: "person" },
  ARRIVED_AT_DESTINATION: { fr: "Arrivé à destination", color: "teal", icon: "local_hospital" },
  WAITING_AT_DESTINATION: { fr: "Attente à destination", color: "cyan", icon: "hourglass_top" },
  RETURN_TO_BASE: { fr: "Retour base", color: "indigo", icon: "home_work" },
  COMPLETED: { fr: "Transport terminé", color: "green", icon: "done_all" },
  BILLING_PENDING: { fr: "Facturation en cours", color: "sky", icon: "pending_actions" },
  BILLED: { fr: "Facturé CPAM", color: "emerald", icon: "receipt_long" },
  PAID: { fr: "Payé", color: "green", icon: "payments" },
  CANCELLED: { fr: "Annulé", color: "red", icon: "cancel" },
  NO_SHOW: { fr: "Patient absent", color: "pink", icon: "person_off" },
  RESCHEDULED: { fr: "Reprogrammé", color: "amber", icon: "event_repeat" },
  FAILED: { fr: "Échec", color: "red", icon: "error" },
};

// ══════════════════════════════════════════════════════════════════════════════
// HORODATAGES PAR STATUT
// ══════════════════════════════════════════════════════════════════════════════
const TIMESTAMPS = {
  CONFIRMED: "heureConfirmation",
  SCHEDULED: "heurePlanification",
  ASSIGNED: "heureAssignation",
  DRIVER_ACCEPTED: "heureAcceptationChauffeur",
  DRIVER_REJECTED: "heureRefusChauffeur",
  EN_ROUTE_TO_PICKUP: "heureEnRoute",
  ARRIVED_AT_PICKUP: "heurePriseEnCharge",
  PATIENT_ON_BOARD: "heurePriseEnCharge",
  ARRIVED_AT_DESTINATION: "heureArriveeDestination",
  WAITING_AT_DESTINATION: "heureDebutAttente",
  RETURN_TO_BASE: "heureDepartRetour",
  COMPLETED: "heureTerminee",
  BILLING_PENDING: "heureBillingPending",
  BILLED: "heureFacturation",
  PAID: "heurePaiement",
  CANCELLED: "heureAnnulation",
  NO_SHOW: "heureAnnulation",
  RESCHEDULED: "heureReprogrammation",
  FAILED: "heureEchec",
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
    if (!transport.adresseDepart?.rue && !transport.adresseDepart?.nom)
      errors.push("Adresse de départ manquante");
    if (!transport.adresseDestination?.rue && !transport.adresseDestination?.nom)
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

  // Clôture financière — guard assoupli
  COMPLETED_BILLED: (_transport) => [],
  COMPLETED_BILLING_PENDING: (_transport) => [],
  BILLING_PENDING_BILLED: (_transport) => [],
  BILLED_PAID: (_transport) => [],

  // Acceptation / refus chauffeur
  ASSIGNED_DRIVER_ACCEPTED: () => [],
  ASSIGNED_DRIVER_REJECTED: () => [],
  DRIVER_ACCEPTED_EN_ROUTE_TO_PICKUP: () => [],
  DRIVER_REJECTED_ASSIGNED: () => [],

  // Échec : toujours autorisé depuis les états non terminaux
  "*_FAILED": () => [],

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
      raisonEchec,
      nouvelleDate,
      dureeAttenteMinutes, // durée estimée de l'attente à destination (minutes)
      factureId, // référence facture pour la clôture BILLED
      // RBAC — rôle de l'acteur déclencheur. Convention : `role` privilégié,
      // fallback sur `userRole` (helper lifecycle `_meta`). "system" pour les
      // transitions automatiques (workers BullMQ, garde-fous internes).
      role,
      userRole,
    } = metadata;

    // 1. RBAC — vérifier que le rôle peut déclencher cette transition.
    //    Levé AVANT le check structural pour distinguer 403 (autorisation)
    //    de 422 (transition invalide). Si pas de rôle fourni, on laisse
    //    canTransition juger — politique "default deny" sur transitions inconnues.
    const actorRole = role || userRole;
    if (!TransportStateMachine.canTransition(transport.statut, nouveauStatut, actorRole)) {
      // Distinguer 2 causes : transition structurellement invalide vs rôle non
      // autorisé. peutTransitionner ne dépend pas du rôle, on l'utilise comme
      // discriminant.
      if (!this.peutTransitionner(transport.statut, nouveauStatut)) {
        throw new Error(
          `Transition invalide : ${transport.statut} → ${nouveauStatut}. ` +
            `Autorisées : ${(TRANSITIONS[transport.statut] || []).join(", ")}`,
        );
      }
      throw new ForbiddenError(
        `Le rôle "${actorRole || "(absent)"}" n'est pas autorisé à effectuer ` +
          `la transition ${transport.statut} → ${nouveauStatut}`,
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
        update.raisonAnnulation = raisonAnnulation || notes || "Annulé par l'opérateur";
        break;
      case "NO_SHOW":
        update.raisonNoShow = raisonNoShow || notes || "Patient absent à l'heure prévue";
        break;
      case "RESCHEDULED":
        update.raisonReprogrammation = raisonReprogrammation || notes || "";
        if (nouvelleDate) update.nouvelleDate = nouvelleDate;
        break;
      case "FAILED":
        update.raisonEchec = raisonEchec || raisonAnnulation || notes || "Échec du transport";
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

  // ── Nouvelles fonctions centralisées (v1.2) ─────────────────────────────────

  /**
   * RBAC — un rôle peut-il effectuer cette transition ?
   *
   * Signature étendue par rapport à peutTransitionner (qui ne checke que la
   * matrice TRANSITIONS structurelle). Politique default deny : si la
   * transition n'a pas d'entrée dans TRANSITION_PERMISSIONS (clé directe OU
   * wildcard `*_TO`), le résultat est `false`.
   *
   * Si `role` est absent et qu'on est en mode strict, on refuse. Pour rester
   * rétrocompatible avec d'éventuels callers historiques qui n'ont pas encore
   * été migrés, on documente le comportement : `role === undefined` → refus.
   *
   * @param {string} fromStatus — statut source
   * @param {string} toStatus   — statut cible
   * @param {string} [role]     — rôle de l'acteur ("admin", "dispatcher",
   *                              "chauffeur", "comptable", "patient", "system")
   * @returns {boolean}
   */
  static canTransition(fromStatus, toStatus, role) {
    // Étape 1 : structure (matrice TRANSITIONS). Indépendante du rôle.
    if (!this.peutTransitionner(fromStatus, toStatus)) return false;

    // Étape 2 : autorisation par rôle. Lookup clé directe puis wildcard.
    const allowed =
      TRANSITION_PERMISSIONS[`${fromStatus}_${toStatus}`] ||
      TRANSITION_PERMISSIONS[`*_${toStatus}`];
    if (!allowed) return false; // default deny

    // Étape 3 : normalisation des sentinels (système → system, Personnel
    // terrain → chauffeur) puis check d'appartenance.
    const normalizedRole = SYSTEM_ROLE_ALIASES.has(role)
      ? "system"
      : DRIVER_ROLE_ALIASES.has(role)
        ? "chauffeur"
        : role;
    if (!normalizedRole) return false;
    return allowed.includes(normalizedRole);
  }

  static assertCanTransition(fromStatus, toStatus, role) {
    if (!this.canTransition(fromStatus, toStatus, role)) {
      if (!this.peutTransitionner(fromStatus, toStatus)) {
        throw new Error(
          `Transition invalide : ${fromStatus} → ${toStatus}. ` +
            `Autorisées : ${(TRANSITIONS[fromStatus] || []).join(", ")}`,
        );
      }
      throw new ForbiddenError(
        `Le rôle "${role || "(absent)"}" n'est pas autorisé pour ${fromStatus} → ${toStatus}`,
      );
    }
  }

  static getNextAllowedStatuses(currentStatus) {
    return (TRANSITIONS[currentStatus] || []).map((s) => ({
      statut: s,
      label: LABELS[s]?.fr,
      icon: LABELS[s]?.icon,
      color: LABELS[s]?.color,
    }));
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
    // Explicit map — gives precise control over percentages for each lifecycle step.
    // CANCELLED, NO_SHOW, RESCHEDULED, FAILED, DRIVER_REJECTED → null (hors flux nominal)
    const MAP = {
      REQUESTED: 0,
      CONFIRMED: 7,
      SCHEDULED: 14,
      ASSIGNED: 21,
      DRIVER_ACCEPTED: 28,
      EN_ROUTE_TO_PICKUP: 36,
      ARRIVED_AT_PICKUP: 43,
      PATIENT_ON_BOARD: 50,
      ARRIVED_AT_DESTINATION: 57,
      WAITING_AT_DESTINATION: 71,
      RETURN_TO_BASE: 79,
      COMPLETED: 84,
      BILLING_PENDING: 89,
      BILLED: 94,
      PAID: 100,
    };
    return MAP[statut] ?? null;
  }

  static estTerminal(statut) {
    return ["PAID", "CANCELLED", "NO_SHOW", "FAILED"].includes(statut);
  }
}

module.exports = {
  TransportStateMachine,
  STATUTS,
  TRANSITIONS,
  TRANSITION_PERMISSIONS,
  LABELS,
  TIMESTAMPS,
};
