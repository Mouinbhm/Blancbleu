/**
 * BlancBleu — Tests unitaires : handlers globaux process.
 *
 * Verifie que requirir Server.js installe bien des listeners sur les events
 * `unhandledRejection` et `uncaughtException` (filet de derniere chance pour
 * les setImmediate fire-and-forget de services/transportLifecycle.js qui
 * peuvent throw silencieusement).
 */

beforeAll(() => {
  // Minimum requis pour que require('../../Server') ne crashe pas au load.
  process.env.JWT_SECRET = "test-secret-process-handlers";
  process.env.NODE_ENV = "test";
});

describe("Server.js — handlers process globaux", () => {
  test("installe un listener sur 'unhandledRejection' et 'uncaughtException'", () => {
    require("../../Server"); // les process.on(...) s'executent au load
    expect(process.listenerCount("unhandledRejection")).toBeGreaterThanOrEqual(1);
    expect(process.listenerCount("uncaughtException")).toBeGreaterThanOrEqual(1);
  });

  test("les listeners n'entrent pas dans une boucle infinie quand ils sont appeles", () => {
    // On appelle directement les listeners avec une erreur factice ; ils
    // doivent log + (no-op exit en NODE_ENV=test) sans rethrow ni recurser.
    const rejHandlers = process.listeners("unhandledRejection");
    const excHandlers = process.listeners("uncaughtException");
    expect(rejHandlers.length).toBeGreaterThanOrEqual(1);
    expect(excHandlers.length).toBeGreaterThanOrEqual(1);

    // Aucun de nos handlers ne doit throw (try/catch interne).
    expect(() =>
      rejHandlers.forEach((h) => h(new Error("fake unhandled rejection"))),
    ).not.toThrow();
    expect(() => excHandlers.forEach((h) => h(new Error("fake uncaught exception")))).not.toThrow();
  });
});
