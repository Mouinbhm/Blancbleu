/**
 * BlancBleu — Tests TransportStateMachine
 * Transport sanitaire NON urgent
 *
 * Lifecycle financier (v1.2) :
 *   COMPLETED → BILLING_PENDING → BILLED → PAID
 *
 * Couverture :
 *   - Transitions valides du flux nominal (v1.2 : COMPLETED→BILLING_PENDING→BILLED→PAID)
 *   - Transitions alternatives (CANCELLED, NO_SHOW, RESCHEDULED)
 *   - Transitions invalides bloquées (dont COMPLETED→BILLED direct interdit)
 *   - Validateurs métier par transition
 *   - Horodatages automatiques
 *   - Journal des transitions
 *   - Calcul de progression (explicit map — PAID=100%)
 *   - États terminaux : PAID, CANCELLED, NO_SHOW, FAILED
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
  dateTransport: new Date(Date.now() + 86400000),
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
  const casValides = [
    // Flux nominal
    ["REQUESTED",              "CONFIRMED"],
    ["REQUESTED",              "CANCELLED"],
    ["CONFIRMED",              "SCHEDULED"],
    ["CONFIRMED",              "RESCHEDULED"],
    ["CONFIRMED",              "CANCELLED"],
    ["SCHEDULED",              "ASSIGNED"],
    ["SCHEDULED",              "RESCHEDULED"],
    ["SCHEDULED",              "CANCELLED"],
    ["ASSIGNED",               "DRIVER_ACCEPTED"],
    ["ASSIGNED",               "DRIVER_REJECTED"],
    ["ASSIGNED",               "EN_ROUTE_TO_PICKUP"],
    ["ASSIGNED",               "CANCELLED"],
    ["DRIVER_ACCEPTED",        "EN_ROUTE_TO_PICKUP"],
    ["DRIVER_REJECTED",        "ASSIGNED"],
    ["EN_ROUTE_TO_PICKUP",     "ARRIVED_AT_PICKUP"],
    ["EN_ROUTE_TO_PICKUP",     "CANCELLED"],
    ["ARRIVED_AT_PICKUP",      "PATIENT_ON_BOARD"],
    ["ARRIVED_AT_PICKUP",      "NO_SHOW"],
    ["PATIENT_ON_BOARD",       "ARRIVED_AT_DESTINATION"],
    // Flux avec attente (dialyse, chimio…)
    ["ARRIVED_AT_DESTINATION", "WAITING_AT_DESTINATION"],
    ["WAITING_AT_DESTINATION", "RETURN_TO_BASE"],
    ["WAITING_AT_DESTINATION", "CANCELLED"],
    // Flux sans attente
    ["ARRIVED_AT_DESTINATION", "RETURN_TO_BASE"],
    ["RETURN_TO_BASE",         "COMPLETED"],
    ["RETURN_TO_BASE",         "CANCELLED"],
    // Flux legacy : ARRIVED_AT_DESTINATION → COMPLETED direct
    ["ARRIVED_AT_DESTINATION", "COMPLETED"],
    ["ARRIVED_AT_DESTINATION", "CANCELLED"],
    // Clôture financière v1.2 : COMPLETED → BILLING_PENDING → BILLED → PAID
    ["COMPLETED",              "BILLING_PENDING"],
    ["BILLING_PENDING",        "BILLED"],
    ["BILLED",                 "PAID"],
    // Alternatifs
    ["NO_SHOW",                "RESCHEDULED"],
    ["RESCHEDULED",            "SCHEDULED"],
  ];

  test.each(casValides)("autorise %s → %s", (de, vers) => {
    expect(TransportStateMachine.peutTransitionner(de, vers)).toBe(true);
  });

  const casInvalides = [
    ["REQUESTED",              "ASSIGNED"],         // saute des étapes
    ["REQUESTED",              "COMPLETED"],         // impossible directement
    ["CONFIRMED",              "PATIENT_ON_BOARD"],  // saute des étapes
    ["ARRIVED_AT_PICKUP",      "COMPLETED"],         // doit passer par PATIENT_ON_BOARD
    ["CANCELLED",              "REQUESTED"],         // terminal
    ["CANCELLED",              "CONFIRMED"],         // terminal
    ["PATIENT_ON_BOARD",       "NO_SHOW"],           // no-show depuis ARRIVED_AT_PICKUP uniquement
    ["WAITING_AT_DESTINATION", "COMPLETED"],         // doit passer par RETURN_TO_BASE
    // Nouvelle règle v1.2 : COMPLETED → BILLED direct interdit
    ["COMPLETED",              "BILLED"],            // doit passer par BILLING_PENDING
    // BILLED ne peut aller que vers PAID
    ["BILLED",                 "COMPLETED"],         // BILLED n'est pas terminal mais ne recule pas
    ["BILLED",                 "REQUESTED"],         // BILLED ne recule pas
    ["BILLED",                 "BILLING_PENDING"],   // BILLED ne recule pas
    // PAID est terminal
    ["PAID",                   "REQUESTED"],
    ["PAID",                   "BILLED"],
    // Pas de retour depuis ARRIVED_AT_DESTINATION vers BILLED sans complétion
    ["ARRIVED_AT_DESTINATION", "BILLED"],
    ["RETURN_TO_BASE",         "BILLED"],
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
    expect(TransportStateMachine.validerTransition(t, "CONFIRMED"))
      .toContain("Date de transport manquante");
  });

  test("REQUESTED→CONFIRMED : requiert heureRDV", () => {
    const t = makeTransport({ statut: "REQUESTED", heureRDV: null });
    expect(TransportStateMachine.validerTransition(t, "CONFIRMED"))
      .toContain("Heure de RDV manquante");
  });

  test("REQUESTED→CONFIRMED : requiert adresseDepart.rue", () => {
    const t = makeTransport({ statut: "REQUESTED", adresseDepart: { rue: "" } });
    expect(TransportStateMachine.validerTransition(t, "CONFIRMED"))
      .toContain("Adresse de départ manquante");
  });

  test("REQUESTED→CONFIRMED : requiert adresseDestination.rue", () => {
    const t = makeTransport({ statut: "REQUESTED", adresseDestination: { rue: "" } });
    expect(TransportStateMachine.validerTransition(t, "CONFIRMED"))
      .toContain("Adresse de destination manquante");
  });

  test("REQUESTED→CONFIRMED : passe si tous les champs présents", () => {
    const t = makeTransport({ statut: "REQUESTED" });
    expect(TransportStateMachine.validerTransition(t, "CONFIRMED")).toHaveLength(0);
  });

  // CONFIRMED → SCHEDULED (PMT)
  test("CONFIRMED→SCHEDULED : Dialyse sans PMT bloquée", () => {
    const t = makeTransport({ statut: "CONFIRMED", motif: "Dialyse", prescription: { validee: false } });
    expect(TransportStateMachine.validerTransition(t, "SCHEDULED").some((e) => e.includes("PMT")))
      .toBe(true);
  });

  test("CONFIRMED→SCHEDULED : Chimiothérapie sans PMT bloquée", () => {
    const t = makeTransport({ statut: "CONFIRMED", motif: "Chimiothérapie", prescription: { validee: false } });
    expect(TransportStateMachine.validerTransition(t, "SCHEDULED").some((e) => e.includes("PMT")))
      .toBe(true);
  });

  test("CONFIRMED→SCHEDULED : Dialyse avec PMT validée passe", () => {
    const t = makeTransport({ statut: "CONFIRMED", motif: "Dialyse", prescription: { validee: true } });
    expect(TransportStateMachine.validerTransition(t, "SCHEDULED")).toHaveLength(0);
  });

  test("CONFIRMED→SCHEDULED : Consultation sans PMT passe", () => {
    const t = makeTransport({ statut: "CONFIRMED", motif: "Consultation", prescription: { validee: false } });
    expect(TransportStateMachine.validerTransition(t, "SCHEDULED")).toHaveLength(0);
  });

  // SCHEDULED → ASSIGNED
  test("SCHEDULED→ASSIGNED : requiert véhicule", () => {
    const t = makeTransport({ statut: "SCHEDULED", vehicule: null });
    expect(TransportStateMachine.validerTransition(t, "ASSIGNED"))
      .toContain("Véhicule non assigné");
  });

  test("SCHEDULED→ASSIGNED : chauffeur optionnel (validé par lifecycle)", () => {
    const t = makeTransport({ statut: "SCHEDULED", vehicule: { _id: "v1" }, chauffeur: null });
    expect(TransportStateMachine.validerTransition(t, "ASSIGNED")).toHaveLength(0);
  });

  test("SCHEDULED→ASSIGNED : passe si véhicule et chauffeur présents", () => {
    const t = makeTransport({
      statut: "SCHEDULED",
      vehicule: { _id: "v1", immatriculation: "AB-123-CD" },
      chauffeur: { _id: "c1", nom: "Martin" },
    });
    expect(TransportStateMachine.validerTransition(t, "ASSIGNED")).toHaveLength(0);
  });

  // ARRIVED_AT_DESTINATION → COMPLETED
  test("ARRIVED_AT_DESTINATION→COMPLETED : requiert heureArriveeDestination", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_DESTINATION", heureArriveeDestination: null });
    expect(TransportStateMachine.validerTransition(t, "COMPLETED"))
      .toContain("Heure d'arrivée à destination non renseignée");
  });

  test("ARRIVED_AT_DESTINATION→COMPLETED : passe avec heure renseignée", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_DESTINATION", heureArriveeDestination: new Date() });
    expect(TransportStateMachine.validerTransition(t, "COMPLETED")).toHaveLength(0);
  });

  // CANCELLED / NO_SHOW
  test("→CANCELLED est toujours autorisé sans conditions", () => {
    const t = makeTransport({ statut: "EN_ROUTE_TO_PICKUP", vehicule: null });
    expect(TransportStateMachine.validerTransition(t, "CANCELLED")).toHaveLength(0);
  });

  test("→NO_SHOW est toujours autorisé sans conditions", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_PICKUP" });
    expect(TransportStateMachine.validerTransition(t, "NO_SHOW")).toHaveLength(0);
  });

  // Clôture financière v1.2 — aucune condition bloquante
  test("COMPLETED→BILLING_PENDING : aucune condition requise", () => {
    const t = makeTransport({ statut: "COMPLETED" });
    expect(TransportStateMachine.validerTransition(t, "BILLING_PENDING")).toHaveLength(0);
  });

  test("BILLING_PENDING→BILLED : aucune condition requise", () => {
    const t = makeTransport({ statut: "BILLING_PENDING" });
    expect(TransportStateMachine.validerTransition(t, "BILLED")).toHaveLength(0);
  });

  test("BILLED→PAID : aucune condition requise", () => {
    const t = makeTransport({ statut: "BILLED" });
    expect(TransportStateMachine.validerTransition(t, "PAID")).toHaveLength(0);
  });

  // Attente et retour base
  test("ARRIVED_AT_DESTINATION→WAITING_AT_DESTINATION : aucune condition requise", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_DESTINATION", heureArriveeDestination: new Date() });
    expect(TransportStateMachine.validerTransition(t, "WAITING_AT_DESTINATION")).toHaveLength(0);
  });

  test("WAITING_AT_DESTINATION→RETURN_TO_BASE : aucune condition requise", () => {
    const t = makeTransport({ statut: "WAITING_AT_DESTINATION" });
    expect(TransportStateMachine.validerTransition(t, "RETURN_TO_BASE")).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — effectuerTransition
// ══════════════════════════════════════════════════════════════════════════════
describe("effectuerTransition", () => {
  test("retourne update + entreeJournal pour REQUESTED→CONFIRMED", () => {
    const t = makeTransport({ statut: "REQUESTED" });
    const { update, entreeJournal } = TransportStateMachine.effectuerTransition(
      t, "CONFIRMED", { utilisateur: "dispatcher@blancbleu.fr" },
    );
    expect(update.statut).toBe("CONFIRMED");
    expect(update.heureConfirmation).toBeInstanceOf(Date);
    expect(entreeJournal.de).toBe("REQUESTED");
    expect(entreeJournal.vers).toBe("CONFIRMED");
    expect(entreeJournal.utilisateur).toBe("dispatcher@blancbleu.fr");
  });

  test("lance une erreur pour une transition non autorisée", () => {
    const t = makeTransport({ statut: "REQUESTED" });
    expect(() => TransportStateMachine.effectuerTransition(t, "COMPLETED"))
      .toThrow("Transition invalide");
  });

  test("lance une erreur si conditions métier non remplies", () => {
    const t = makeTransport({ statut: "SCHEDULED", vehicule: null, chauffeur: null });
    expect(() => TransportStateMachine.effectuerTransition(t, "ASSIGNED"))
      .toThrow("Conditions non remplies");
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
      t, "CANCELLED", { raisonAnnulation: "Patient hospitalisé" },
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
      t, "NO_SHOW", { raisonNoShow: "Patient introuvable" },
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

  test("WAITING_AT_DESTINATION : pose heureDebutAttente", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_DESTINATION", heureArriveeDestination: new Date() });
    const { update } = TransportStateMachine.effectuerTransition(t, "WAITING_AT_DESTINATION");
    expect(update.heureDebutAttente).toBeInstanceOf(Date);
  });

  test("WAITING_AT_DESTINATION : stocke dureeAttenteMinutes depuis metadata", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_DESTINATION", heureArriveeDestination: new Date() });
    const { update } = TransportStateMachine.effectuerTransition(
      t, "WAITING_AT_DESTINATION", { dureeAttenteMinutes: 180 },
    );
    expect(update.dureeAttenteMinutes).toBe(180);
  });

  test("WAITING_AT_DESTINATION sans durée : dureeAttenteMinutes absent de update", () => {
    const t = makeTransport({ statut: "ARRIVED_AT_DESTINATION", heureArriveeDestination: new Date() });
    const { update } = TransportStateMachine.effectuerTransition(t, "WAITING_AT_DESTINATION");
    expect(update.dureeAttenteMinutes).toBeUndefined();
  });

  test("RETURN_TO_BASE : pose heureDepartRetour", () => {
    const t = makeTransport({ statut: "WAITING_AT_DESTINATION" });
    const { update } = TransportStateMachine.effectuerTransition(t, "RETURN_TO_BASE");
    expect(update.heureDepartRetour).toBeInstanceOf(Date);
  });

  // Clôture financière — v1.2 : doit passer par BILLING_PENDING
  test("BILLING_PENDING→BILLED : pose heureFacturation", () => {
    const t = makeTransport({ statut: "BILLING_PENDING" });
    const { update } = TransportStateMachine.effectuerTransition(t, "BILLED");
    expect(update.heureFacturation).toBeInstanceOf(Date);
  });

  test("BILLING_PENDING→BILLED : stocke factureId dans update.facture", () => {
    const fakeId = "507f1f77bcf86cd799439099";
    const t = makeTransport({ statut: "BILLING_PENDING", facture: null });
    t._factureIdTemp = fakeId;
    const { update } = TransportStateMachine.effectuerTransition(
      t, "BILLED", { factureId: fakeId },
    );
    expect(update.facture).toBe(fakeId);
  });

  test("BILLED→PAID : pose heurePaiement", () => {
    const t = makeTransport({ statut: "BILLED" });
    const { update } = TransportStateMachine.effectuerTransition(t, "PAID");
    expect(update.heurePaiement).toBeInstanceOf(Date);
  });

  test("COMPLETED→BILLED direct lance une erreur (transition invalide)", () => {
    const t = makeTransport({ statut: "COMPLETED" });
    expect(() => TransportStateMachine.effectuerTransition(t, "BILLED"))
      .toThrow("Transition invalide");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — progression
// Lifecycle v1.2 (explicit map) :
//   REQUESTED(0%) → ... → COMPLETED(84%) → BILLING_PENDING(89%) → BILLED(94%) → PAID(100%)
// ══════════════════════════════════════════════════════════════════════════════
describe("progression", () => {
  test("REQUESTED a une progression de 0%", () => {
    expect(TransportStateMachine.progression("REQUESTED")).toBe(0);
  });

  test("PAID a une progression de 100% (terminal du flux financier)", () => {
    expect(TransportStateMachine.progression("PAID")).toBe(100);
  });

  test("COMPLETED est à ~84% (avant la clôture financière)", () => {
    const p = TransportStateMachine.progression("COMPLETED");
    expect(p).toBeGreaterThanOrEqual(80);
    expect(p).toBeLessThanOrEqual(85);
  });

  test("BILLING_PENDING est à ~89%", () => {
    const p = TransportStateMachine.progression("BILLING_PENDING");
    expect(p).toBeGreaterThanOrEqual(88);
    expect(p).toBeLessThanOrEqual(90);
  });

  test("BILLED est à ~94%", () => {
    const p = TransportStateMachine.progression("BILLED");
    expect(p).toBeGreaterThanOrEqual(93);
    expect(p).toBeLessThanOrEqual(95);
  });

  test("WAITING_AT_DESTINATION est à ~71%", () => {
    const p = TransportStateMachine.progression("WAITING_AT_DESTINATION");
    expect(p).toBeGreaterThanOrEqual(68);
    expect(p).toBeLessThanOrEqual(74);
  });

  test("RETURN_TO_BASE est à ~79%", () => {
    const p = TransportStateMachine.progression("RETURN_TO_BASE");
    expect(p).toBeGreaterThanOrEqual(77);
    expect(p).toBeLessThanOrEqual(82);
  });

  test("EN_ROUTE_TO_PICKUP est à ~36%", () => {
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

  test("FAILED retourne null", () => {
    expect(TransportStateMachine.progression("FAILED")).toBeNull();
  });

  test("statut inconnu retourne null", () => {
    expect(TransportStateMachine.progression("INCONNU")).toBeNull();
  });

  test("la progression est strictement croissante le long du flux nominal complet", () => {
    const ordre = [
      "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
      "DRIVER_ACCEPTED", "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP",
      "PATIENT_ON_BOARD", "ARRIVED_AT_DESTINATION",
      "WAITING_AT_DESTINATION", "RETURN_TO_BASE",
      "COMPLETED", "BILLING_PENDING", "BILLED", "PAID",
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
    const statuts = TransportStateMachine.transitionsPossibles("REQUESTED").map((t) => t.statut);
    expect(statuts).toContain("CONFIRMED");
    expect(statuts).toContain("CANCELLED");
  });

  test("ARRIVED_AT_PICKUP peut aller vers PATIENT_ON_BOARD et NO_SHOW", () => {
    const statuts = TransportStateMachine.transitionsPossibles("ARRIVED_AT_PICKUP").map((t) => t.statut);
    expect(statuts).toContain("PATIENT_ON_BOARD");
    expect(statuts).toContain("NO_SHOW");
  });

  test("COMPLETED a exactement une transition possible : BILLING_PENDING", () => {
    const transitions = TransportStateMachine.transitionsPossibles("COMPLETED");
    expect(transitions).toHaveLength(1);
    expect(transitions[0].statut).toBe("BILLING_PENDING");
  });

  test("BILLING_PENDING a exactement une transition possible : BILLED", () => {
    const transitions = TransportStateMachine.transitionsPossibles("BILLING_PENDING");
    expect(transitions).toHaveLength(1);
    expect(transitions[0].statut).toBe("BILLED");
  });

  test("BILLED a exactement une transition possible : PAID", () => {
    const transitions = TransportStateMachine.transitionsPossibles("BILLED");
    expect(transitions).toHaveLength(1);
    expect(transitions[0].statut).toBe("PAID");
  });

  test("PAID n'a aucune transition possible (terminal)", () => {
    expect(TransportStateMachine.transitionsPossibles("PAID")).toHaveLength(0);
  });

  test("CANCELLED n'a aucune transition possible (terminal)", () => {
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
// v1.2 : PAID (et non BILLED) est le terminal du flux nominal.
//         BILLED peut encore évoluer vers PAID.
// ══════════════════════════════════════════════════════════════════════════════
describe("estTerminal", () => {
  test.each(["PAID", "CANCELLED", "NO_SHOW", "FAILED"])(
    "%s est un état terminal",
    (statut) => {
      expect(TransportStateMachine.estTerminal(statut)).toBe(true);
    },
  );

  test.each([
    "REQUESTED", "CONFIRMED", "SCHEDULED", "ASSIGNED",
    "DRIVER_ACCEPTED", "DRIVER_REJECTED",
    "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD",
    "ARRIVED_AT_DESTINATION", "WAITING_AT_DESTINATION", "RETURN_TO_BASE",
    "COMPLETED",        // peut encore évoluer vers BILLING_PENDING
    "BILLING_PENDING",  // peut encore évoluer vers BILLED
    "BILLED",           // peut encore évoluer vers PAID
    "RESCHEDULED",
  ])(
    "%s n'est pas un état terminal",
    (statut) => {
      expect(TransportStateMachine.estTerminal(statut)).toBe(false);
    },
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
      "DRIVER_ACCEPTED", "DRIVER_REJECTED",
      "EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP",
      "PATIENT_ON_BOARD", "ARRIVED_AT_DESTINATION",
      "WAITING_AT_DESTINATION", "RETURN_TO_BASE",
      "COMPLETED", "BILLING_PENDING", "BILLED", // non terminaux → peuvent évoluer
      "NO_SHOW", "RESCHEDULED",
    ];
    nonTerminaux.forEach((statut) => {
      expect(TRANSITIONS[statut]).toBeDefined();
    });
  });

  test("les états terminaux ont une liste de transitions vide", () => {
    expect(TRANSITIONS.PAID).toEqual([]);       // terminal du flux financier
    expect(TRANSITIONS.CANCELLED).toEqual([]);  // terminal administratif
    expect(TRANSITIONS.FAILED).toEqual([]);     // terminal échec
  });

  test("BILLED n'est pas terminal et peut transitionner vers PAID", () => {
    expect(TRANSITIONS.BILLED).toContain("PAID");
    expect(TRANSITIONS.BILLED).not.toHaveLength(0);
  });

  test("COMPLETED peut transitionner vers BILLING_PENDING (pas directement vers BILLED)", () => {
    expect(TRANSITIONS.COMPLETED).toContain("BILLING_PENDING");
    expect(TRANSITIONS.COMPLETED).not.toContain("BILLED");
  });

  test("BILLING_PENDING peut transitionner vers BILLED", () => {
    expect(TRANSITIONS.BILLING_PENDING).toContain("BILLED");
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
