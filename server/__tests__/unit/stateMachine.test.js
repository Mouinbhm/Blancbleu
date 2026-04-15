/**
 * BlancBleu — Tests TransportStateMachine
 * Transport sanitaire NON urgent
 *
 * Couverture :
 *   - Transitions valides du flux nominal
 *   - Transitions alternatives (CANCELLED, NO_SHOW, RESCHEDULED)
 *   - Transitions invalides bloquées
 *   - Validateurs métier par transition
 *   - Horodatages automatiques
 *   - Journal des transitions
 *   - Calcul de progression
 *   - Etats terminaux
 */

const {
  TransportStateMachine,
  STATUTS,
  TRANSITIONS,
  LABELS,
} = require("../../services/transportStateMachine");

// ─── Factory — transport de base valide ──────────────────────────────────────
const makeTransport = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  statut: "REQUESTED",
  motif: "Consultation",
  dateTransport: new Date(Date.now() + 86400000), // demain
  heureRDV: "09:00",
  adresseDepart: { rue: "12 rue de la Paix", ville: "Nice", codePostal: "06000" },
  adresseDestination: { rue: "1 av Pasteur", ville: "Nice", codePostal: "06001" },
  vehicule: null,
  chauffeur: null,
  heureEnRoute: null,
  heureArriveeDestination: null,
  prescription: { validee: false },
  journal: [],
  ...overrides,
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — peutTransitionner
// ══════════════════════════════════════════════════════════════════════════════
describe("peutTransitionner", () => {
  // Flux nominal
  const casValides = [
    ["REQUESTED",              "CONFIRMED"],
    ["REQUESTED",              "CANCELLED"],
    ["CONFIRMED",              "SCHEDULED"],
    ["CONFIRMED",              "RESCHEDULED"],
    ["CONFIRMED",              "CANCELLED"],
    ["SCHEDULED",              "ASSIGNED"],
    ["SCHEDULED",              "RESCHEDULED"],
    ["SCHEDULED",              "CANCELLED"],
    ["ASSIGNED",               "EN_ROUTE_TO_PICKUP"],
    ["ASSIGNED",               "CANCELLED"],
    ["EN_ROUTE_TO_PICKUP",     "ARRIVED_AT_PICKUP"],
    ["EN_ROUTE_TO_PICKUP",     "CANCELLED"],
    ["ARRIVED_AT_PICKUP",      "PATIENT_ON_BOARD"],
    ["ARRIVED_AT_PICKUP",      "NO_SHOW"],
    ["PATIENT_ON_BOARD",       "ARRIVED_AT_DESTINATION"],
    ["ARRIVED_AT_DESTINATION", "COMPLETED"],
    ["NO_SHOW",                "RESCHEDULED"],
    ["RESCHEDULED",            "CONFIRMED"],
  ];

  test.each(casValides)("autorise %s → %s", (de, vers) => {
    expect(TransportStateMachine.peutTransitionner(de, vers)).toBe(true);
  });

  // Transitions interdites
  const casInvalides = [
    ["REQUESTED",          "ASSIGNED"],        // saute des étapes
    ["REQUESTED",          "COMPLETED"],       // impossible directement
    ["CONFIRMED",          "PATIENT_ON_BOARD"],// saute des étapes
    ["ARRIVED_AT_PICKUP",  "COMPLETED"],       // doit passer par PATIENT_ON_BOARD
    ["COMPLETED",          "REQUESTED"],       // état terminal → impossible
    ["COMPLETED",          "CANCELLED"],       // terminal
    ["CANCELLED",          "REQUESTED"],       // terminal
    ["CANCELLED",          "CONFIRMED"],       // terminal
    ["PATIENT_ON_BOARD",   "NO_SHOW"],         // no-show uniquement depuis ARRIVED_AT_PICKUP
  ];

  test.each(casInvalides)("refuse %s → %s", (de, vers) => {
    expect(TransportStateMachine.peutTransitionner(de, vers)).toBe(false);
  });

  test("retourne false pour un statut source inconnu", () => {
    expect(TransportStateMachine.peutTransitionner("INCONNU", "CONFIRMED")).toBe(false);
  });

  test("retourne false pour un statut cible inconnu", () => {
    expect(TransportStateMachine.peutTransitionner("REQUESTED", "INCONNU")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — validerTransition (conditions métier)
// ══════════════════════════════════════════════════════════════════════════════
describe("validerTransition — conditions métier", () => {

  // REQUESTED → CONFIRMED
  test("REQUESTED→CONFIRMED : requiert dateTransport", () => {
    const t = makeTransport({ statut: "REQUESTED", dateTransport: null });
    const erreurs = TransportStateMachine.validerTransition(t, "CONFIRMED");
    expect(erreurs).toContain("Date de transport manquante");
  });

  test("REQUESTED→CONFIRMED : requiert heureRDV", () => {
    const t = makeTransport({ statut: "REQUESTED", heureRDV: null });
    const erreurs = TransportStateMachine.validerTransition(t, "CONFIRMED");
    expect(erreurs).toContain("Heure de RDV manquante");
  });

  test("REQUESTED→CONFIRMED : requiert adresseDepart.rue", () => {
    const t = makeTransport({ statut: "REQUESTED", adresseDepart: { rue: "" } });
    const erreurs = TransportStateMachine.validerTransition(t, "CONFIRMED");
    expect(erreurs).toContain("Adresse de départ manquante");
  });

  test("REQUESTED→CONFIRMED : requiert adresseDestination.rue", () => {
    const t = makeTransport({ statut: "REQUESTED", adresseDestination: { rue: "" } });
    const erreurs = TransportStateMachine.validerTransition(t, "CONFIRMED");
    expect(erreurs).toContain("Adresse de destination manquante");
  });

  test("REQUESTED→CONFIRMED : passe si tous les champs présents", () => {
    const t = makeTransport({ statut: "REQUESTED" });
    const erreurs = TransportStateMachine.validerTransition(t, "CONFIRMED");
    expect(erreurs).toHaveLength(0);
  });

  // CONFIRMED → SCHEDULED (PMT)
  test("CONFIRMED→SCHEDULED : Dialyse sans PMT bloquée", () => {
    const t = makeTransport({
      statut: "CONFIRMED",
      motif: "Dialyse",
      prescription: { validee: false },
    });
    const erreurs = TransportStateMachine.validerTransition(t, "SCHEDULED");
    expect(erreurs.some((e) => e.includes("PMT"))).toBe(true);
  });

  test("CONFIRMED→SCHEDULED : Chimiothérapie sans PMT bloquée", () => {
    const t = makeTransport({
      statut: "CONFIRMED",
      motif: "Chimiothérapie",
      prescription: { validee: false },
    });
    const erreurs = TransportStateMachine.validerTransition(t, "SCHEDULED");
    expect(erreurs.some((e) => e.includes("PMT"))).toBe(true);
  });

  test("CONFIRMED→SCHEDULED : Dialyse avec PMT validée passe", () => {
    const t = makeTransport({
      statut: "CONFIRMED",
      motif: "Dialyse",
      prescription: { validee: true },
    });
    const erreurs = TransportStateMachine.validerTransition(t, "SCHEDULED");
    expect(erreurs).toHaveLength(0);
  });

  test("CONFIRMED→SCHEDULED : Consultation sans PMT passe (PMT non requise)", () => {
    const t = makeTransport({
      statut: "CONFIRMED",
      motif: "Consultation",
      prescription: { validee: false },
    });
    const erreurs = TransportStateMachine.validerTransition(t, "SCHEDULED");
    expect(erreurs).toHaveLength(0);
  });

  // SCHEDULED → ASSIGNED
  test("SCHEDULED→ASSIGNED : requiert véhicule", () => {
    const t = makeTransport({ statut: "SCHEDULED", vehicule: null });
    const erreurs = TransportStateMachine.validerTransition(t, "ASSIGNED");
    expect(erreurs).toContain("Véhicule non assigné");
  });

  test("SCHEDULED→ASSIGNED : requiert chauffeur", () => {
    const t = makeTransport({ statut: "SCHEDULED", vehicule: { _id: "v1" }, chauffeur: null });
    const erreurs = TransportStateMachine.validerTransition(t, "ASSIGNED");
    expect(erreurs).toContain("Chauffeur non assigné");
  });

  test("SCHEDULED→ASSIGNED : passe si véhicule et chauffeur présents", () => {
    const t = makeTransport({
      statut: "SCHEDULED",
      vehicule: { _id: "v1", immatriculation: "AB-123-CD" },
      chauffeur: { _id: "c1", nom: "Martin" },
    });
    const erreurs = TransportStateMachine.validerTransition(t, "ASSIGNED");
    expect(erreurs).toHaveLength(0);
  });

  // ARRIVED_AT_DESTINATION → COMPLETED
  test("ARRIVED_AT_DESTINATION→COMPLETED : requiert heureArriveeDestination", () => {
    const t = makeTransport({
      statut: "ARRIVED_AT_DESTINATION",
      heureArriveeDestination: null,
    });
    const erreurs = TransportStateMachine.validerTransition(t, "COMPLETED");
    expect(erreurs).toContain("Heure d'arrivée à destination non renseignée");
  });

  test("ARRIVED_AT_DESTINATION→COMPLETED : passe avec heure renseignée", () => {
    const t = makeTransport({
      statut: "ARRIVED_AT_DESTINATION",
      heureArriveeDestination: new Date(),
    });
    const erreurs = TransportStateMachine.validerTransition(t, "COMPLETED");
    expect(erreurs).toHaveLength(0);
  });

  // CANCELLED — toujours autorisé sans conditions
  test("→CANCELLED est toujours autorisé sans conditions", () => {
    const t = makeTransport({ statut: "EN_ROUTE_TO_PICKUP", vehicule: null });
    const erreurs = TransportStateMachine.validerTransition(t, "CANCELLED");
    expect(erreurs).toHaveLength(0);
  });

  // NO_SHOW — toujours autorisé
  test("→NO_SHOW est toujours autorisé sans conditions", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_PICKUP" });
    const erreurs = TransportStateMachine.validerTransition(t, "NO_SHOW");
    expect(erreurs).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — effectuerTransition
// ══════════════════════════════════════════════════════════════════════════════
describe("effectuerTransition", () => {
  test("retourne update + entreeJournal pour REQUESTED→CONFIRMED", () => {
    const t = makeTransport({ statut: "REQUESTED" });
    const { update, entreeJournal } = TransportStateMachine.effectuerTransition(
      t, "CONFIRMED", { utilisateur: "dispatcher@blancbleu.fr" }
    );
    expect(update.statut).toBe("CONFIRMED");
    expect(update.heureConfirmation).toBeInstanceOf(Date);
    expect(entreeJournal.de).toBe("REQUESTED");
    expect(entreeJournal.vers).toBe("CONFIRMED");
    expect(entreeJournal.utilisateur).toBe("dispatcher@blancbleu.fr");
  });

  test("lance une erreur pour une transition non autorisée", () => {
    const t = makeTransport({ statut: "REQUESTED" });
    expect(() =>
      TransportStateMachine.effectuerTransition(t, "COMPLETED")
    ).toThrow("Transition invalide");
  });

  test("lance une erreur si conditions métier non remplies", () => {
    const t = makeTransport({ statut: "SCHEDULED", vehicule: null, chauffeur: null });
    expect(() =>
      TransportStateMachine.effectuerTransition(t, "ASSIGNED")
    ).toThrow("Conditions non remplies");
  });

  test("calcule dureeReelleMinutes à la complétion", () => {
    const t = makeTransport({
      statut: "ARRIVED_AT_DESTINATION",
      heureEnRoute: new Date(Date.now() - 45 * 60 * 1000),
      heureArriveeDestination: new Date(),
    });
    const { update } = TransportStateMachine.effectuerTransition(t, "COMPLETED");
    expect(update.dureeReelleMinutes).toBeGreaterThanOrEqual(44);
    expect(update.dureeReelleMinutes).toBeLessThanOrEqual(46);
  });

  test("ajoute raisonAnnulation lors d'une annulation", () => {
    const t = makeTransport({ statut: "CONFIRMED" });
    const { update } = TransportStateMachine.effectuerTransition(
      t, "CANCELLED", { raisonAnnulation: "Patient hospitalisé" }
    );
    expect(update.raisonAnnulation).toBe("Patient hospitalisé");
  });

  test("utilise la raison par défaut si aucune raison fournie", () => {
    const t = makeTransport({ statut: "CONFIRMED" });
    const { update } = TransportStateMachine.effectuerTransition(t, "CANCELLED");
    expect(update.raisonAnnulation).toBe("Annulé par l'opérateur");
  });

  test("ajoute raisonNoShow lors d'un no-show", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_PICKUP" });
    const { update } = TransportStateMachine.effectuerTransition(
      t, "NO_SHOW", { raisonNoShow: "Patient introuvable" }
    );
    expect(update.raisonNoShow).toBe("Patient introuvable");
  });

  test("utilise 'système' comme utilisateur par défaut", () => {
    const t = makeTransport({ statut: "REQUESTED" });
    const { entreeJournal } = TransportStateMachine.effectuerTransition(t, "CONFIRMED");
    expect(entreeJournal.utilisateur).toBe("système");
  });

  test("l'entrée journal contient le timestamp", () => {
    const t = makeTransport({ statut: "REQUESTED" });
    const avant = new Date();
    const { entreeJournal } = TransportStateMachine.effectuerTransition(t, "CONFIRMED");
    const apres = new Date();
    expect(entreeJournal.timestamp).toBeInstanceOf(Date);
    expect(entreeJournal.timestamp.getTime()).toBeGreaterThanOrEqual(avant.getTime());
    expect(entreeJournal.timestamp.getTime()).toBeLessThanOrEqual(apres.getTime());
  });

  test("ajoute l'horodatage heureEnRoute pour EN_ROUTE_TO_PICKUP", () => {
    const t = makeTransport({
      statut: "ASSIGNED",
      vehicule: { _id: "v1" },
      chauffeur: { _id: "c1" },
    });
    // Pas de validateur pour ASSIGNED→EN_ROUTE, on passe directement
    const { update } = TransportStateMachine.effectuerTransition(t, "EN_ROUTE_TO_PICKUP");
    expect(update.heureEnRoute).toBeInstanceOf(Date);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — progression
// Ordre : REQUESTED(0%) → CONFIRMED(12%) → SCHEDULED(25%) → ASSIGNED(37%)
//   → EN_ROUTE_TO_PICKUP(50%) → ARRIVED_AT_PICKUP(62%) → PATIENT_ON_BOARD(75%)
//   → ARRIVED_AT_DESTINATION(87%) → COMPLETED(100%)
// CANCELLED/NO_SHOW/RESCHEDULED → null
// ══════════════════════════════════════════════════════════════════════════════
describe("progression", () => {
  const cas = [
    ["REQUESTED",              0],
    ["CONFIRMED",              null],  // valeur intermédiaire — juste vérifier non-null
    ["SCHEDULED",              null],
    ["ASSIGNED",               null],
    ["EN_ROUTE_TO_PICKUP",     50],
    ["ARRIVED_AT_PICKUP",      null],
    ["PATIENT_ON_BOARD",       null],
    ["ARRIVED_AT_DESTINATION", null],
    ["COMPLETED",              100],
    ["CANCELLED",              null],
    ["NO_SHOW",                null],
    ["RESCHEDULED",            null],
  ];

  test("REQUESTED a une progression de 0%", () => {
    expect(TransportStateMachine.progression("REQUESTED")).toBe(0);
  });

  test("COMPLETED a une progression de 100%", () => {
    expect(TransportStateMachine.progression("COMPLETED")).toBe(100);
  });

  test("EN_ROUTE_TO_PICKUP est à mi-chemin (~50%)", () => {
    const p = TransportStateMachine.progression("EN_ROUTE_TO_PICKUP");
    expect(p).toBeGreaterThanOrEqual(45);
    expect(p).toBeLessThanOrEqual(55);
  });

  test("CANCELLED retourne null (hors du flux nominal)", () => {
    expect(TransportStateMachine.progression("CANCELLED")).toBeNull();
  });

  test("NO_SHOW retourne null", () => {
    expect(TransportStateMachine.progression("NO_SHOW")).toBeNull();
  });

  test("RESCHEDULED retourne null", () => {
    expect(TransportStateMachine.progression("RESCHEDULED")).toBeNull();
  });

  test("statut inconnu retourne null", () => {
    expect(TransportStateMachine.progression("INCONNU")).toBeNull();
  });

  test("la progression est strictement croissante le long du flux nominal", () => {
    const ordre = [
      "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
      "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP",
      "PATIENT_ON_BOARD", "ARRIVED_AT_DESTINATION", "COMPLETED",
    ];
    const progressions = ordre.map((s) => TransportStateMachine.progression(s));
    for (let i = 1; i < progressions.length; i++) {
      expect(progressions[i]).toBeGreaterThan(progressions[i - 1]);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 5 — transitionsPossibles
// ══════════════════════════════════════════════════════════════════════════════
describe("transitionsPossibles", () => {
  test("REQUESTED peut aller vers CONFIRMED et CANCELLED", () => {
    const transitions = TransportStateMachine.transitionsPossibles("REQUESTED");
    const statuts = transitions.map((t) => t.statut);
    expect(statuts).toContain("CONFIRMED");
    expect(statuts).toContain("CANCELLED");
  });

  test("ARRIVED_AT_PICKUP peut aller vers PATIENT_ON_BOARD et NO_SHOW", () => {
    const transitions = TransportStateMachine.transitionsPossibles("ARRIVED_AT_PICKUP");
    const statuts = transitions.map((t) => t.statut);
    expect(statuts).toContain("PATIENT_ON_BOARD");
    expect(statuts).toContain("NO_SHOW");
  });

  test("COMPLETED n'a aucune transition possible", () => {
    expect(TransportStateMachine.transitionsPossibles("COMPLETED")).toHaveLength(0);
  });

  test("CANCELLED n'a aucune transition possible", () => {
    expect(TransportStateMachine.transitionsPossibles("CANCELLED")).toHaveLength(0);
  });

  test("chaque transition contient statut, label, icon et color", () => {
    const transitions = TransportStateMachine.transitionsPossibles("REQUESTED");
    transitions.forEach((t) => {
      expect(t).toHaveProperty("statut");
      expect(t).toHaveProperty("label");
      expect(t).toHaveProperty("icon");
      expect(t).toHaveProperty("color");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 6 — estTerminal
// ══════════════════════════════════════════════════════════════════════════════
describe("estTerminal", () => {
  test.each(["COMPLETED", "CANCELLED", "NO_SHOW"])(
    "%s est un état terminal",
    (statut) => {
      expect(TransportStateMachine.estTerminal(statut)).toBe(true);
    }
  );

  test.each(["REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
    "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD",
    "ARRIVED_AT_DESTINATION", "RESCHEDULED"])(
    "%s n'est pas un état terminal",
    (statut) => {
      expect(TransportStateMachine.estTerminal(statut)).toBe(false);
    }
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 7 — LABELS et STATUTS
// ══════════════════════════════════════════════════════════════════════════════
describe("LABELS et STATUTS", () => {
  test("tous les statuts ont un label français défini", () => {
    Object.keys(STATUTS).forEach((statut) => {
      expect(LABELS[statut]).toBeDefined();
      expect(LABELS[statut].fr).toBeTruthy();
    });
  });

  test("tous les statuts ont un icon et une color", () => {
    Object.keys(STATUTS).forEach((statut) => {
      expect(LABELS[statut].icon).toBeTruthy();
      expect(LABELS[statut].color).toBeTruthy();
    });
  });

  test("TRANSITIONS couvre tous les statuts non terminaux", () => {
    const nonTerminaux = [
      "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
      "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP",
      "PATIENT_ON_BOARD", "ARRIVED_AT_DESTINATION",
      "NO_SHOW", "RESCHEDULED",
    ];
    nonTerminaux.forEach((statut) => {
      expect(TRANSITIONS[statut]).toBeDefined();
    });
  });

  test("les états terminaux ont une liste de transitions vide", () => {
    expect(TRANSITIONS.COMPLETED).toEqual([]);
    expect(TRANSITIONS.CANCELLED).toEqual([]);
  });

  test("aucun vocabulaire d'urgence dans les labels", () => {
    const valeursLabels = Object.values(LABELS).map((l) => l.fr.toLowerCase());
    const urgence = ["p1", "p2", "p3", "samu", "smur", "escalade", "incident"];
    urgence.forEach((mot) => {
      valeursLabels.forEach((label) => {
        expect(label).not.toContain(mot);
      });
    });
  });
});
