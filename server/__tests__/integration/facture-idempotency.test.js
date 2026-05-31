/**
 * BlancBleu — Tests intégration : facturation idempotente + anti-doublon.
 *
 * Couvre invoiceService.createInvoiceFromTransport et la garantie :
 *  - Appel séquentiel 2x → 1 seule facture
 *  - Appel concurrent (Promise.allSettled × 5) → 1 seule facture
 *  - Échec calcul tarifaire → lock libéré, retry possible
 *  - Facture annulée (statut="annulee") → nouvelle facture peut être créée
 *
 * Le lock posé sur Transport.factureGenerated est la 1ère ligne de défense ;
 * l'index unique partial sur Facture.transportId est la 2e (E11000 → repli
 * idempotent).
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-facture-idempotency";
  process.env.NODE_ENV = "test";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, "bb-facture-test-key-padded-pad!").toString(
    "base64",
  );
  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 30000);

beforeEach(async () => {
  const Transport = require("../../models/Transport");
  const Facture = require("../../models/Facture");
  await Transport.deleteMany({});
  await Facture.deleteMany({});
});

async function creerTransportTermine(overrides = {}) {
  const Transport = require("../../models/Transport");
  return Transport.create({
    numero: `TRS-IDEM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patient: {
      nom: "Test",
      prenom: "Patient",
      dateNaissance: new Date("1960-01-01"),
      mobilite: "ASSIS",
    },
    typeTransport: "VSL",
    motif: "Consultation",
    dateTransport: new Date(),
    heureRDV: "10:00",
    adresseDepart: {
      rue: "1 rue Test",
      ville: "Nice",
      codePostal: "06000",
      coordonnees: { lat: 43.71, lng: 7.26 },
    },
    adresseDestination: {
      rue: "2 av Test",
      ville: "Nice",
      codePostal: "06000",
      coordonnees: { lat: 43.72, lng: 7.27 },
    },
    statut: "COMPLETED",
    tauxPriseEnCharge: 65,
    ...overrides,
  });
}

const adminUser = { _id: new mongoose.Types.ObjectId(), email: "admin@test.fr", role: "admin" };

describe("createInvoiceFromTransport — idempotence et atomicité", () => {
  test("Appel séquentiel 2× → 1 seule facture, 2e appel renvoie l'existante (created=false)", async () => {
    const invoiceService = require("../../services/invoiceService");
    const Facture = require("../../models/Facture");

    const transport = await creerTransportTermine();

    const r1 = await invoiceService.createInvoiceFromTransport(transport._id, adminUser);
    expect(r1.created).toBe(true);
    expect(r1.facture.numero).toMatch(/^FAC-/);

    const r2 = await invoiceService.createInvoiceFromTransport(transport._id, adminUser);
    expect(r2.created).toBe(false);
    expect(String(r2.facture._id)).toBe(String(r1.facture._id));

    const total = await Facture.countDocuments({ transportId: transport._id });
    expect(total).toBe(1);
  });

  test("Appel concurrent (Promise.allSettled × 5) → exactement 1 facture créée", async () => {
    const invoiceService = require("../../services/invoiceService");
    const Facture = require("../../models/Facture");

    const transport = await creerTransportTermine();

    // 5 appels en parallèle — race condition stress test
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        invoiceService.createInvoiceFromTransport(transport._id, adminUser),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Tous les appels ne doivent PAS échouer — le lock + l'index unique
    // partial garantissent qu'au moins le 1er réussit. Les concurrents
    // retombent sur la facture existante (idempotent → created=false) ou
    // sont rejetés proprement (E11000 absorbé en lookup idempotent).
    expect(rejected).toEqual([]);
    expect(fulfilled.length).toBe(5);

    const created = fulfilled.filter((r) => r.value.created);
    const idempotent = fulfilled.filter((r) => !r.value.created);
    expect(created.length).toBe(1); // un seul a vraiment créé
    expect(idempotent.length).toBe(4); // les 4 autres ont reçu l'existante

    // Tous renvoient le même _id de facture
    const factureIds = new Set(fulfilled.map((r) => String(r.value.facture._id)));
    expect(factureIds.size).toBe(1);

    // En base : 1 seule facture, malgré 5 appels concurrents
    const total = await Facture.countDocuments({ transportId: transport._id });
    expect(total).toBe(1);
  });

  test("Échec calcul tarifaire → lock libéré, retry possible", async () => {
    // On simule un échec en stubbant tarifService.calculerTarif.
    const tarifService = require("../../services/tarifService");
    const originalCalcul = tarifService.calculerTarif;
    let callCount = 0;
    tarifService.calculerTarif = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("BOOM tarif"));
      }
      return originalCalcul.call(tarifService, ...arguments);
    });

    try {
      // Note : invoiceService.calculateInvoiceAmount catch l'erreur et renvoie
      // des montants à 0 (pas de throw). Pour tester le rollback du lock, on
      // doit donc forcer une erreur DANS la création de la facture elle-même.
      // Approche : mocker Facture.prototype.save pour throw une fois.
      const Facture = require("../../models/Facture");
      const Transport = require("../../models/Transport");
      const originalSave = Facture.prototype.save;
      let saveCount = 0;
      Facture.prototype.save = function (...args) {
        saveCount++;
        if (saveCount === 1) {
          return Promise.reject(new Error("BOOM save"));
        }
        return originalSave.call(this, ...args);
      };

      const invoiceService = require("../../services/invoiceService");
      const transport = await creerTransportTermine();

      // 1er appel : échoue, lock libéré
      await expect(
        invoiceService.createInvoiceFromTransport(transport._id, adminUser),
      ).rejects.toThrow(/BOOM save/);

      // Vérifie que le lock a été libéré et que l'erreur est tracée
      const transportApres = await Transport.findById(transport._id).select(
        "factureGenerated factureLockedAt factureGenerationError",
      );
      expect(transportApres.factureGenerated).toBe(false);
      expect(transportApres.factureLockedAt).toBeNull();
      expect(transportApres.factureGenerationError).toMatch(/BOOM save/);

      // 2e appel : retry réussit
      const retry = await invoiceService.createInvoiceFromTransport(transport._id, adminUser);
      expect(retry.created).toBe(true);
      expect(retry.facture.numero).toMatch(/^FAC-/);

      // Restaure
      Facture.prototype.save = originalSave;
    } finally {
      tarifService.calculerTarif = originalCalcul;
    }
  });

  test("Facture annulée (statut='annulee') → nouvelle facture peut être créée", async () => {
    const invoiceService = require("../../services/invoiceService");
    const Facture = require("../../models/Facture");
    const Transport = require("../../models/Transport");

    const transport = await creerTransportTermine();

    // 1re facture créée puis annulée
    const r1 = await invoiceService.createInvoiceFromTransport(transport._id, adminUser);
    expect(r1.created).toBe(true);
    await Facture.updateOne({ _id: r1.facture._id }, { $set: { statut: "annulee" } });

    // Reset le lock manuellement (cas réel : admin via /api/admin/factures/retry).
    // L'index unique partial filtre les annulees, donc on peut ré-insérer.
    await invoiceService.resetInvoiceLock(transport._id);

    // 2e création : doit réussir et donner un nouveau numéro distinct.
    const r2 = await invoiceService.createInvoiceFromTransport(transport._id, adminUser);
    expect(r2.created).toBe(true);
    expect(String(r2.facture._id)).not.toBe(String(r1.facture._id));
    expect(r2.facture.numero).not.toBe(r1.facture.numero);

    // En base : 2 factures pour ce transport (1 annulée + 1 active)
    const all = await Facture.find({ transportId: transport._id });
    expect(all.length).toBe(2);
    const active = all.filter((f) => f.statut !== "annulee");
    expect(active.length).toBe(1);

    // Le transport conserve son lock pour la facture active
    const t = await Transport.findById(transport._id).select("factureGenerated");
    expect(t.factureGenerated).toBe(true);
  });

  test("Transport hors statut facturable → ConflictError (non admin)", async () => {
    const invoiceService = require("../../services/invoiceService");
    const { ConflictError } = require("../../utils/errors");

    const transport = await creerTransportTermine({ statut: "SCHEDULED" });

    const dispatcher = { _id: new mongoose.Types.ObjectId(), role: "dispatcher" };
    await expect(
      invoiceService.createInvoiceFromTransport(transport._id, dispatcher),
    ).rejects.toBeInstanceOf(ConflictError);

    // Aucune facture créée, lock non posé
    const Facture = require("../../models/Facture");
    const Transport = require("../../models/Transport");
    const count = await Facture.countDocuments({ transportId: transport._id });
    expect(count).toBe(0);
    const t = await Transport.findById(transport._id);
    expect(t.factureGenerated).toBe(false);
  });

  test("Admin peut bypasser la garde de statut (SCHEDULED → facture créée)", async () => {
    const invoiceService = require("../../services/invoiceService");
    const transport = await creerTransportTermine({ statut: "SCHEDULED" });

    const r = await invoiceService.createInvoiceFromTransport(transport._id, adminUser);
    expect(r.created).toBe(true);
  });
});
