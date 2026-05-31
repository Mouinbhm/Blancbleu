/**
 * BlancBleu — Tests unitaires RBAC sur les transitions Transport.
 *
 * Couvre TransportStateMachine.canTransition(from, to, role) et la
 * propagation ForbiddenError via effectuerTransition(transport, to, ctx).
 *
 * Pour chaque rôle métier, ≥2 transitions autorisées + ≥2 refusées, plus
 * les wildcards (*_CANCELLED, *_NO_SHOW, *_FAILED, *_RESCHEDULED) et les
 * alias système ("système" → "system") + Personnel ("Chauffeur" → "chauffeur").
 */

const {
  TransportStateMachine,
  TRANSITION_PERMISSIONS,
} = require("../../services/transportStateMachine");
const { ForbiddenError } = require("../../utils/errors");

describe("canTransition — par rôle", () => {
  describe("admin (super-power sur planification/cancel/billed/paid)", () => {
    test("autorisé : REQUESTED → CONFIRMED", () => {
      expect(TransportStateMachine.canTransition("REQUESTED", "CONFIRMED", "admin")).toBe(true);
    });
    test("autorisé : BILLING_PENDING → BILLED", () => {
      expect(TransportStateMachine.canTransition("BILLING_PENDING", "BILLED", "admin")).toBe(true);
    });
    test("refusé : COMPLETED → BILLING_PENDING (réservé system)", () => {
      expect(TransportStateMachine.canTransition("COMPLETED", "BILLING_PENDING", "admin")).toBe(
        false,
      );
    });
    test("refusé : EN_ROUTE_TO_PICKUP → ARRIVED_AT_PICKUP (terrain chauffeur)", () => {
      expect(
        TransportStateMachine.canTransition("EN_ROUTE_TO_PICKUP", "ARRIVED_AT_PICKUP", "admin"),
      ).toBe(false);
    });
  });

  describe("dispatcher (planification + cancel/no-show)", () => {
    test("autorisé : SCHEDULED → ASSIGNED", () => {
      expect(TransportStateMachine.canTransition("SCHEDULED", "ASSIGNED", "dispatcher")).toBe(true);
    });
    test("autorisé : SCHEDULED → CANCELLED (wildcard)", () => {
      expect(TransportStateMachine.canTransition("SCHEDULED", "CANCELLED", "dispatcher")).toBe(
        true,
      );
    });
    test("refusé : ASSIGNED → EN_ROUTE_TO_PICKUP (réservé chauffeur/admin)", () => {
      expect(
        TransportStateMachine.canTransition("ASSIGNED", "EN_ROUTE_TO_PICKUP", "dispatcher"),
      ).toBe(false);
    });
    test("refusé : BILLING_PENDING → BILLED (réservé admin/comptable)", () => {
      expect(TransportStateMachine.canTransition("BILLING_PENDING", "BILLED", "dispatcher")).toBe(
        false,
      );
    });
  });

  describe("chauffeur (terrain — du EN_ROUTE jusqu'au COMPLETED)", () => {
    test("autorisé : ASSIGNED → EN_ROUTE_TO_PICKUP", () => {
      expect(
        TransportStateMachine.canTransition("ASSIGNED", "EN_ROUTE_TO_PICKUP", "chauffeur"),
      ).toBe(true);
    });
    test("autorisé : PATIENT_ON_BOARD → ARRIVED_AT_DESTINATION", () => {
      expect(
        TransportStateMachine.canTransition(
          "PATIENT_ON_BOARD",
          "ARRIVED_AT_DESTINATION",
          "chauffeur",
        ),
      ).toBe(true);
    });
    test("autorisé : ARRIVED_AT_PICKUP → NO_SHOW (wildcard)", () => {
      expect(TransportStateMachine.canTransition("ARRIVED_AT_PICKUP", "NO_SHOW", "chauffeur")).toBe(
        true,
      );
    });
    test("refusé : REQUESTED → CONFIRMED (planning, hors scope chauffeur)", () => {
      expect(TransportStateMachine.canTransition("REQUESTED", "CONFIRMED", "chauffeur")).toBe(
        false,
      );
    });
    test("refusé : SCHEDULED → CANCELLED (annulation = dispatcher/admin)", () => {
      expect(TransportStateMachine.canTransition("SCHEDULED", "CANCELLED", "chauffeur")).toBe(
        false,
      );
    });
  });

  describe("comptable (lecture seule sauf clôture financière)", () => {
    test("autorisé : BILLING_PENDING → BILLED", () => {
      expect(TransportStateMachine.canTransition("BILLING_PENDING", "BILLED", "comptable")).toBe(
        true,
      );
    });
    test("autorisé : BILLED → PAID", () => {
      expect(TransportStateMachine.canTransition("BILLED", "PAID", "comptable")).toBe(true);
    });
    test("refusé : REQUESTED → CONFIRMED (hors scope finance)", () => {
      expect(TransportStateMachine.canTransition("REQUESTED", "CONFIRMED", "comptable")).toBe(
        false,
      );
    });
    test("refusé : SCHEDULED → CANCELLED", () => {
      expect(TransportStateMachine.canTransition("SCHEDULED", "CANCELLED", "comptable")).toBe(
        false,
      );
    });
  });

  describe("patient (aucun droit de transition direct)", () => {
    test("refusé : REQUESTED → CONFIRMED", () => {
      expect(TransportStateMachine.canTransition("REQUESTED", "CONFIRMED", "patient")).toBe(false);
    });
    test("refusé : SCHEDULED → CANCELLED", () => {
      expect(TransportStateMachine.canTransition("SCHEDULED", "CANCELLED", "patient")).toBe(false);
    });
  });

  describe("system (workers BullMQ + transitions automatiques)", () => {
    test("autorisé : COMPLETED → BILLING_PENDING (auto-billing trigger)", () => {
      expect(TransportStateMachine.canTransition("COMPLETED", "BILLING_PENDING", "system")).toBe(
        true,
      );
    });
    test("autorisé : SCHEDULED → ASSIGNED (auto-dispatch)", () => {
      expect(TransportStateMachine.canTransition("SCHEDULED", "ASSIGNED", "system")).toBe(true);
    });
    test("autorisé : BILLED → PAID (réconciliation paiement)", () => {
      expect(TransportStateMachine.canTransition("BILLED", "PAID", "system")).toBe(true);
    });
    test("refusé : ASSIGNED → EN_ROUTE_TO_PICKUP (terrain, pas system)", () => {
      expect(TransportStateMachine.canTransition("ASSIGNED", "EN_ROUTE_TO_PICKUP", "system")).toBe(
        false,
      );
    });
  });

  describe("alias de rôles — sentinels", () => {
    test('"système" est aliasé en system → autorisé sur COMPLETED → BILLING_PENDING', () => {
      expect(TransportStateMachine.canTransition("COMPLETED", "BILLING_PENDING", "système")).toBe(
        true,
      );
    });
    test('"Chauffeur" (Personnel.role) est aliasé en chauffeur → autorisé sur ASSIGNED → EN_ROUTE_TO_PICKUP', () => {
      expect(
        TransportStateMachine.canTransition("ASSIGNED", "EN_ROUTE_TO_PICKUP", "Chauffeur"),
      ).toBe(true);
    });
    test('"Ambulancier" est aliasé en chauffeur → autorisé sur ARRIVED_AT_PICKUP → PATIENT_ON_BOARD', () => {
      expect(
        TransportStateMachine.canTransition("ARRIVED_AT_PICKUP", "PATIENT_ON_BOARD", "Ambulancier"),
      ).toBe(true);
    });
  });

  describe("rôles absents / inconnus", () => {
    test("rôle absent (undefined) → refus", () => {
      expect(TransportStateMachine.canTransition("REQUESTED", "CONFIRMED", undefined)).toBe(false);
    });
    test("rôle vide (string vide) → refus", () => {
      expect(TransportStateMachine.canTransition("REQUESTED", "CONFIRMED", "")).toBe(false);
    });
    test("rôle inconnu → refus", () => {
      expect(TransportStateMachine.canTransition("REQUESTED", "CONFIRMED", "hacker")).toBe(false);
    });
  });

  describe("transitions structurellement invalides", () => {
    test("REQUESTED → PAID : refusé même pour admin (matrice TRANSITIONS)", () => {
      expect(TransportStateMachine.canTransition("REQUESTED", "PAID", "admin")).toBe(false);
    });
    test("PAID → quoi que ce soit : terminal, refusé", () => {
      expect(TransportStateMachine.canTransition("PAID", "CANCELLED", "admin")).toBe(false);
    });
  });
});

describe("effectuerTransition — propagation ForbiddenError", () => {
  function fakeTransport(statut) {
    return {
      statut,
      dateTransport: new Date(),
      heureRDV: "10:00",
      adresseDepart: { rue: "1 rue Test", nom: "Domicile" },
      adresseDestination: { rue: "2 av Test", nom: "Hôpital" },
      heureArriveeDestination: new Date(),
    };
  }

  test("chauffeur tente REQUESTED → CONFIRMED → ForbiddenError 403", () => {
    expect(() =>
      TransportStateMachine.effectuerTransition(fakeTransport("REQUESTED"), "CONFIRMED", {
        role: "chauffeur",
      }),
    ).toThrow(ForbiddenError);
  });

  test("ForbiddenError porte statusCode 403", () => {
    let caught;
    try {
      TransportStateMachine.effectuerTransition(fakeTransport("SCHEDULED"), "CANCELLED", {
        role: "patient",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ForbiddenError);
    expect(caught.statusCode).toBe(403);
    expect(caught.message).toMatch(/patient.*pas autoris/i);
  });

  test("admin autorisé sur REQUESTED → CONFIRMED → renvoie { update, entreeJournal }", () => {
    const result = TransportStateMachine.effectuerTransition(
      fakeTransport("REQUESTED"),
      "CONFIRMED",
      {
        role: "admin",
        utilisateur: "admin@test.fr",
      },
    );
    expect(result.update.statut).toBe("CONFIRMED");
    expect(result.entreeJournal.de).toBe("REQUESTED");
    expect(result.entreeJournal.vers).toBe("CONFIRMED");
  });

  test('fallback userRole (legacy `_meta`) fonctionne : userRole="dispatcher" → autorisé', () => {
    const result = TransportStateMachine.effectuerTransition(
      fakeTransport("REQUESTED"),
      "CONFIRMED",
      {
        userRole: "dispatcher",
      },
    );
    expect(result.update.statut).toBe("CONFIRMED");
  });

  test("transition invalide structurellement → Error simple (pas ForbiddenError)", () => {
    expect(() =>
      TransportStateMachine.effectuerTransition(fakeTransport("REQUESTED"), "PAID", {
        role: "admin",
      }),
    ).toThrow(/Transition invalide/);
  });
});

describe("TRANSITION_PERMISSIONS — exhaustivité minimale", () => {
  test("toutes les transitions structurelles ont une autorisation (directe ou wildcard)", () => {
    const { TRANSITIONS } = require("../../services/transportStateMachine");
    const missing = [];
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) {
        const direct = TRANSITION_PERMISSIONS[`${from}_${to}`];
        const wildcard = TRANSITION_PERMISSIONS[`*_${to}`];
        if (!direct && !wildcard) missing.push(`${from} → ${to}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
