/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  BlancBleu — State Machine des Interventions               ║
 * ║  8 statuts · transitions validées · horodatages auto       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * DIAGRAMME DE TRANSITIONS :
 *
 *  CREATED ──► VALIDATED ──► ASSIGNED ──► EN_ROUTE
 *                  │                          │
 *                  ▼                          ▼
 *             CANCELLED              ON_SITE
 *                  ▲                    │
 *                  │              TRANSPORTING
 *                  │                    │
 *                  └──────────── COMPLETED
 */

// ══════════════════════════════════════════════════════════════════════════════
// DÉFINITION DES STATUTS
// ══════════════════════════════════════════════════════════════════════════════
const STATUTS = {
  CREATED: "CREATED",
  VALIDATED: "VALIDATED",
  ASSIGNED: "ASSIGNED",
  EN_ROUTE: "EN_ROUTE",
  ON_SITE: "ON_SITE",
  TRANSPORTING: "TRANSPORTING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

// ══════════════════════════════════════════════════════════════════════════════
// TRANSITIONS AUTORISÉES
// Format : { depuis: [vers1, vers2, ...] }
// ══════════════════════════════════════════════════════════════════════════════
const TRANSITIONS = {
  CREATED: ["VALIDATED", "CANCELLED"],
  VALIDATED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["EN_ROUTE", "CANCELLED"],
  EN_ROUTE: ["ON_SITE", "CANCELLED"],
  ON_SITE: ["TRANSPORTING", "COMPLETED", "CANCELLED"],
  TRANSPORTING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [], // État terminal
  CANCELLED: [], // État terminal
};

// ══════════════════════════════════════════════════════════════════════════════
// CHAMPS HORODATAGE PAR STATUT
// ══════════════════════════════════════════════════════════════════════════════
const TIMESTAMPS = {
  CREATED: "heureCreation",
  VALIDATED: "heureValidation",
  ASSIGNED: "heureAssignation",
  EN_ROUTE: "heureDepart",
  ON_SITE: "heureArrivee",
  TRANSPORTING: "heureTransport",
  COMPLETED: "heureTerminee",
  CANCELLED: "heureAnnulation",
};

// ══════════════════════════════════════════════════════════════════════════════
// LABELS LISIBLES
// ══════════════════════════════════════════════════════════════════════════════
const LABELS = {
  CREATED: { fr: "Créée", color: "slate", icon: "add_circle" },
  VALIDATED: { fr: "Validée", color: "blue", icon: "verified" },
  ASSIGNED: { fr: "Assignée", color: "purple", icon: "ambulance" },
  EN_ROUTE: { fr: "En route", color: "orange", icon: "directions_car" },
  ON_SITE: { fr: "Sur place", color: "yellow", icon: "location_on" },
  TRANSPORTING: { fr: "Transport", color: "indigo", icon: "local_hospital" },
  COMPLETED: { fr: "Terminée", color: "green", icon: "check_circle" },
  CANCELLED: { fr: "Annulée", color: "red", icon: "cancel" },
};

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATEURS PAR TRANSITION
// Conditions métier à vérifier avant chaque transition
// ══════════════════════════════════════════════════════════════════════════════
const VALIDATEURS = {
  // CREATED → VALIDATED : vérifier que le type et l'adresse sont renseignés
  CREATED_VALIDATED: (intervention) => {
    const errors = [];
    if (!intervention.typeIncident) errors.push("Type d'incident manquant");
    if (!intervention.adresse) errors.push("Adresse manquante");
    if (!intervention.priorite) errors.push("Priorité manquante");
    return errors;
  },

  // VALIDATED → ASSIGNED : vérifier qu'une unité disponible est assignée
  VALIDATED_ASSIGNED: (intervention) => {
    const errors = [];
    if (!intervention.unitAssignee) errors.push("Aucune unité assignée");
    return errors;
  },

  // ASSIGNED → EN_ROUTE : vérifier que l'unité est bien assignée
  ASSIGNED_EN_ROUTE: (intervention) => {
    const errors = [];
    if (!intervention.unitAssignee) errors.push("Aucune unité assignée");
    return errors;
  },

  // ON_SITE → TRANSPORTING : vérifier infos patient
  ON_SITE_TRANSPORTING: (intervention) => {
    const errors = [];
    if (!intervention.patient?.etat)
      errors.push("État du patient non renseigné");
    return errors;
  },

  // * → CANCELLED : toujours autorisé sauf états terminaux
  "*_CANCELLED": () => [],
};

// ══════════════════════════════════════════════════════════════════════════════
// STATE MACHINE — CLASSE PRINCIPALE
// ══════════════════════════════════════════════════════════════════════════════
class InterventionStateMachine {
  /**
   * Vérifie si une transition est autorisée
   */
  static peutTransitionner(statutActuel, nouveauStatut) {
    const transitions = TRANSITIONS[statutActuel] || [];
    return transitions.includes(nouveauStatut);
  }

  /**
   * Valide les conditions métier avant la transition
   * @returns {string[]} tableau d'erreurs (vide = OK)
   */
  static validerTransition(intervention, nouveauStatut) {
    const cle = `${intervention.statut}_${nouveauStatut}`;
    const validateur = VALIDATEURS[cle] || VALIDATEURS[`*_${nouveauStatut}`];
    if (!validateur) return [];
    return validateur(intervention);
  }

  /**
   * Effectue la transition et retourne les champs à mettre à jour
   * @returns {Object} champs à mettre à jour dans MongoDB
   */
  static effectuerTransition(intervention, nouveauStatut, metadata = {}) {
    const { utilisateur, notes } = metadata;

    // 1. Vérifier transition autorisée
    if (!this.peutTransitionner(intervention.statut, nouveauStatut)) {
      throw new Error(
        `Transition invalide : ${intervention.statut} → ${nouveauStatut}. ` +
          `Transitions autorisées : ${(TRANSITIONS[intervention.statut] || []).join(", ")}`,
      );
    }

    // 2. Valider conditions métier
    const erreurs = this.validerTransition(intervention, nouveauStatut);
    if (erreurs.length > 0) {
      throw new Error(`Conditions non remplies : ${erreurs.join(" · ")}`);
    }

    // 3. Préparer les champs à mettre à jour
    const champTimestamp = TIMESTAMPS[nouveauStatut];
    const update = {
      statut: nouveauStatut,
      [champTimestamp]: new Date(),
    };

    // 4. Logique spécifique par transition
    switch (nouveauStatut) {
      case "EN_ROUTE":
        update.heureDepart = new Date();
        break;
      case "COMPLETED":
        update.heureTerminee = new Date();
        // Calculer durée totale en minutes
        if (intervention.heureCreation) {
          update.dureeMinutes = Math.round(
            (Date.now() - new Date(intervention.heureCreation)) / 60000,
          );
        }
        break;
      case "CANCELLED":
        update.raisonAnnulation = notes || "Annulé par opérateur";
        break;
    }

    // 5. Journal des transitions
    const entreeJournal = {
      de: intervention.statut,
      vers: nouveauStatut,
      timestamp: new Date(),
      utilisateur: utilisateur || "système",
      notes: notes || "",
    };

    return { update, entreeJournal };
  }

  /**
   * Retourne les transitions possibles depuis un statut
   */
  static transitionsPossibles(statut) {
    return (TRANSITIONS[statut] || []).map((s) => ({
      statut: s,
      label: LABELS[s]?.fr,
      icon: LABELS[s]?.icon,
      color: LABELS[s]?.color,
    }));
  }

  /**
   * Calcule le % de progression de l'intervention
   */
  static progression(statut) {
    const ordre = [
      "CREATED",
      "VALIDATED",
      "ASSIGNED",
      "EN_ROUTE",
      "ON_SITE",
      "TRANSPORTING",
      "COMPLETED",
    ];
    const idx = ordre.indexOf(statut);
    if (idx === -1 || statut === "CANCELLED") return null;
    return Math.round((idx / (ordre.length - 1)) * 100);
  }
}

module.exports = {
  InterventionStateMachine,
  STATUTS,
  TRANSITIONS,
  LABELS,
  TIMESTAMPS,
};
