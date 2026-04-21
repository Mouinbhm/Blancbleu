/**
 * BlancBleu — Tests TransportStateMachine
 * Transport sanitaire NON urgent
 *
 * Couverture :
 *   - Transitions valides du flux nominal (v1.1 : +WAITING_AT_DESTINATION, +RETURN_TO_BASE, +BILLED)
 *   - Transitions alternatives (CANCELLED, NO_SHOW, RESCHEDULED)
 *   - Transitions invalides bloquées
 *   - Validateurs métier par transition (dont COMPLETED→BILLED)
 *   - Horodatages automatiques (dont heureDebutAttente, heureDepartRetour, heureFacturation)
 *   - Journal des transitions
 *   - Calcul de progression (12 étapes)
 *   - Etats terminaux (BILLED remplace COMPLETED comme terminal du flux nominal)
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
  facture: null,
  prescription: { validee: false },
  journal: [],
  ...overrides,
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — peutTransitionner
// ══════════════════════════════════════════════════════════════════════════════
describe("peutTransitionner", () => {
  // Flux nominal — v1.1 : ajout des 3 nouveaux statuts
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
    // Flux avec WAITING_AT_DESTINATION (dialyse, chimio…)
    ["ARRIVED_AT_DESTINATION", "WAITING_AT_DESTINATION"],
    ["WAITING_AT_DESTINATION", "RETURN_TO_BASE"],
    ["WAITING_AT_DESTINATION", "CANCELLED"],
    // Flux sans attente : transition directe vers RETURN_TO_BASE
    ["ARRIVED_AT_DESTINATION", "RETURN_TO_BASE"],
    ["RETURN_TO_BASE",         "COMPLETED"],
    ["RETURN_TO_BASE",         "CANCELLED"],
    // Flux legacy : ARRIVED_AT_DESTINATION → COMPLETED (rétrocompatibilité)
    ["ARRIVED_AT_DESTINATION", "COMPLETED"],
    ["ARRIVED_AT_DESTINATION", "CANCELLED"],
    // Clôture financière (superviseur/admin)
    ["COMPLETED",              "BILLED"],
    // Alternatifs
    ["NO_SHOW",                "RESCHEDULED"],
    ["RESCHEDULED",            "CONFIRMED"],
  ];

  test.each(casValides)("autorise %s → %s", (de, vers) => {
    expect(TransportStateMachine.peutTransitionner(de, vers)).toBe(true);
  });

  // Transitions interdites (dont nouvelles)
  const casInvalides = [
    ["REQUESTED",              "ASSIGNED"],              // saute des étapes
    ["REQUESTED",              "COMPLETED"],             // impossible directement
    ["CONFIRMED",              "PATIENT_ON_BOARD"],      // saute des étapes
    ["ARRIVED_AT_PICKUP",      "COMPLETED"],             // doit passer par PATIENT_ON_BOARD
    ["CANCELLED",              "REQUESTED"],             // terminal
    ["CANCELLED",              "CONFIRMED"],             // terminal
    ["PATIENT_ON_BOARD",       "NO_SHOW"],               // no-show uniquement depuis ARRIVED_AT_PICKUP
    // Nouvelles transitions invalides v1.1
    ["WAITING_AT_DESTINATION", "COMPLETED"],             // doit passer par RETURN_TO_BASE
    ["BILLED",                 "COMPLETED"],             // BILLED est terminal
    ["BILLED",                 "REQUESTED"],             // terminal
    ["ARRIVED_AT_DESTINATION", "BILLED"],                // doit compléter avant de facturer
    ["RETURN_TO_BASE",         "BILLED"],                // doit compléter avant de facturer
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

  // COMPLETED → BILLED : facture requise
  test("COMPLETED→BILLED : bloqué sans facture associée", () => {
    const t = makeTransport({ statut: "COMPLETED", facture: null });
    const erreurs = TransportStateMachine.validerTransition(t, "BILLED");
    expect(erreurs.length).toBeGreaterThan(0);
    expect(erreurs[0]).toMatch(/[Ff]acture/);
  });

  test("COMPLETED→BILLED : passe si facture présente", () => {
    const t = makeTransport({
      statut: "COMPLETED",
      facture: "507f1f77bcf86cd799439099",
    });
    const erreurs = TransportStateMachine.validerTransition(t, "BILLED");
    expect(erreurs).toHaveLength(0);
  });

  test("COMPLETED→BILLED : passe si _factureIdTemp injecté", () => {
    const t = makeTransport({ statut: "COMPLETED", facture: null });
    t._factureIdTemp = "507f1f77bcf86cd799439099";
    const erreurs = TransportStateMachine.validerTransition(t, "BILLED");
    expect(erreurs).toHaveLength(0);
  });

  // WAITING_AT_DESTINATION — pas de conditions bloquantes
  test("ARRIVED_AT_DESTINATION→WAITING_AT_DESTINATION : aucune condition requise", () => {
    const t = makeTransport({
      statut: "ARRIVED_AT_DESTINATION",
      heureArriveeDestination: new Date(),
    });
    const erreurs = TransportStateMachine.validerTransition(t, "WAITING_AT_DESTINATION");
    expect(erreurs).toHaveLength(0);
  });

  // RETURN_TO_BASE — pas de conditions bloquantes
  test("WAITING_AT_DESTINATION→RETURN_TO_BASE : aucune condition requise", () => {
    const t = makeTransport({ statut: "WAITING_AT_DESTINATION" });
    const erreurs = TransportStateMachine.validerTransition(t, "RETURN_TO_BASE");
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
    const { update } = TransportStateMachine.effectuerTransition(t, "EN_ROUTE_TO_PICKUP");
    expect(update.heureEnRoute).toBeInstanceOf(Date);
  });

  // ── Nouveaux statuts v1.1 ──────────────────────────────────────────────────

  test("WAITING_AT_DESTINATION : pose heureDebutAttente", () => {
    const t = makeTransport({
      statut: "ARRIVED_AT_DESTINATION",
      heureArriveeDestination: new Date(),
    });
    const { update } = TransportStateMachine.effectuerTransition(
      t,
      "WAITING_AT_DESTINATION",
    );
    expect(update.heureDebutAttente).toBeInstanceOf(Date);
  });

  test("WAITING_AT_DESTINATION : stocke dureeAttenteMinutes depuis metadata", () => {
    const t = makeTransport({
      statut: "ARRIVED_AT_DESTINATION",
      heureArriveeDestination: new Date(),
    });
    const { update } = TransportStateMachine.effectuerTransition(
      t,
      "WAITING_AT_DESTINATION",
      { dureeAttenteMinutes: 180 },
    );
    expect(update.dureeAttenteMinutes).toBe(180);
  });

  test("WAITING_AT_DESTINATION sans durée : dureeAttenteMinutes absent de update", () => {
    const t = makeTransport({
      statut: "ARRIVED_AT_DESTINATION",
      heureArriveeDestination: new Date(),
    });
    const { update } = TransportStateMachine.effectuerTransition(
      t,
      "WAITING_AT_DESTINATION",
    );
    expect(update.dureeAttenteMinutes).toBeUndefined();
  });

  test("RETURN_TO_BASE : pose heureDepartRetour", () => {
    const t = makeTransport({ statut: "WAITING_AT_DESTINATION" });
    const { update } = TransportStateMachine.effectuerTransition(t, "RETURN_TO_BASE");
    expect(update.heureDepartRetour).toBeInstanceOf(Date);
  });

  test("BILLED : pose heureFacturation", () => {
    const t = makeTransport({
      statut: "COMPLETED",
      facture: "507f1f77bcf86cd799439099",
    });
    const { update } = TransportStateMachine.effectuerTransition(t, "BILLED");
    expect(update.heureFacturation).toBeInstanceOf(Date);
  });

  test("BILLED : stocke factureId dans update.facture", () => {
    const fakeId = "507f1f77bcf86cd799439099";
    const t = makeTransport({ statut: "COMPLETED", facture: null });
    t._factureIdTemp = fakeId;
    const { update } = TransportStateMachine.effectuerTransition(
      t,
      "BILLED",
      { factureId: fakeId },
    );
    expect(update.facture).toBe(fakeId);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — progression
// v1.1 — 12 étapes (index 0–11) :
//   REQUESTED(0%) → CONFIRMED(9%) → SCHEDULED(18%) → ASSIGNED(27%)
//   → EN_ROUTE_TO_PICKUP(36%) → ARRIVED_AT_PICKUP(45%) → PATIENT_ON_BOARD(55%)
//   → ARRIVED_AT_DESTINATION(64%) → WAITING_AT_DESTINATION(73%)
//   → RETURN_TO_BASE(82%) → COMPLETED(91%) → BILLED(100%)
// CANCELLED/NO_SHOW/RESCHEDULED → null
// ══════════════════════════════════════════════════════════════════════════════
describe("progression", () => {
  test("REQUESTED a une progression de 0%", () => {
    expect(TransportStateMachine.progression("REQUESTED")).toBe(0);
  });

  test("BILLED a une progression de 100% (nouveau terminal v1.1)", () => {
    expect(TransportStateMachine.progression("BILLED")).toBe(100);
  });

  test("COMPLETED est à 91% (avant la clôture financière)", () => {
    const p = TransportStateMachine.progression("COMPLETED");
    expect(p).toBeGreaterThanOrEqual(88);
    expect(p).toBeLessThanOrEqual(94);
  });

  test("WAITING_AT_DESTINATION est à ~73%", () => {
    const p = TransportStateMachine.progression("WAITING_AT_DESTINATION");
    expect(p).toBeGreaterThanOrEqual(70);
    expect(p).toBeLessThanOrEqual(76);
  });

  test("RETURN_TO_BASE est à ~82%", () => {
    const p = TransportStateMachine.progression("RETURN_TO_BASE");
    expect(p).toBeGreaterThanOrEqual(79);
    expect(p).toBeLessThanOrEqual(85);
  });

  test("EN_ROUTE_TO_PICKUP est à ~36% (recalculé sur 12 étapes)", () => {
    const p = TransportStateMachine.progression("EN_ROUTE_TO_PICKUP");
    expect(p).toBeGreaterThanOrEqual(33);
    expect(p).toBeLessThanOrEqual(40);
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

  test("la progression est strictement croissante le long du flux nominal complet", () => {
    const ordre = [
      "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
      "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD",
      "ARRIVED_AT_DESTINATION", "WAITING_AT_DESTINATION",
      "RETURN_TO_BASE", "COMPLETED", "BILLED",
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

  test("COMPLETED a exactement une transition possible : BILLED", () => {
    const transitions = TransportStateMachine.transitionsPossibles("COMPLETED");
    expect(transitions).toHaveLength(1);
    expect(transitions[0].statut).toBe("BILLED");
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
  // v1.1 : BILLED remplace COMPLETED comme terminal du flux nominal.
  // COMPLETED peut encore évoluer vers BILLED (clôture CPAM).
  test.each(["BILLED", "CANCELLED", "NO_SHOW"])(
    "%s est un état terminal",
    (statut) => {
      expect(TransportStateMachine.estTerminal(statut)).toBe(true);
    }
  );

  test.each([
    "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
    "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD",
    "ARRIVED_AT_DESTINATION",
    "WAITING_AT_DESTINATION", "RETURN_TO_BASE", // nouveaux v1.1
    "COMPLETED",  // COMPLETED n'est plus terminal : peut progresser vers BILLED
    "RESCHEDULED",
  ])(
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

  test("TRANSITIONS couvre tous les statuts non terminaux (v1.1)", () => {
    const nonTerminaux = [
      "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
      "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP",
      "PATIENT_ON_BOARD", "ARRIVED_AT_DESTINATION",
      "WAITING_AT_DESTINATION", "RETURN_TO_BASE", // nouveaux v1.1
      "COMPLETED",                                 // plus terminal → peut aller vers BILLED
      "NO_SHOW", "RESCHEDULED",
    ];
    nonTerminaux.forEach((statut) => {
      expect(TRANSITIONS[statut]).toBeDefined();
    });
  });

  test("les états terminaux ont une liste de transitions vide", () => {
    expect(TRANSITIONS.BILLED).toEqual([]);    // nouveau terminal v1.1
    expect(TRANSITIONS.CANCELLED).toEqual([]);
  });

  test("COMPLETED peut transitionner vers BILLED", () => {
    expect(TRANSITIONS.COMPLETED).toContain("BILLED");
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
