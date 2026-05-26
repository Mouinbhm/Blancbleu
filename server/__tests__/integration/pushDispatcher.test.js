/**
 * Sprint M4 — Tests pushDispatcher : vérifie que les helpers mettent bien
 * un job en queue (au lieu d'appeler pushNotification directement).
 *
 * En env test, la queue est stub (cf. queues/index.js — NODE_ENV=test ->
 * `add()` renvoie un id mock). Donc on teste juste qu'on appelle bien
 * l'add() avec les bons arguments via un spy.
 */

const { queues, QUEUES } = require("../../queues");
const pushDispatcher = require("../../services/pushDispatcher");

describe("pushDispatcher", () => {
  let addSpy;

  beforeEach(() => {
    addSpy = jest.spyOn(queues[QUEUES.PUSH], "add");
  });

  afterEach(() => {
    addSpy.mockRestore();
  });

  test("pushToDriver met un job 'to_driver' avec targetType=personnel", async () => {
    const res = await pushDispatcher.pushToDriver("driver-123", {
      type:      "transport_assigned",
      title:     "Nouvelle mission",
      body:      "Transport TRS-1",
      channelId: "blancbleu_critical",
      data:      { transportId: "t1" },
    });
    expect(res.queued).toBe(true);
    expect(addSpy).toHaveBeenCalledTimes(1);
    const [name, data] = addSpy.mock.calls[0];
    expect(name).toBe("to_driver");
    expect(data.targetType).toBe("personnel");
    expect(data.targetId).toBe("driver-123");
    expect(data.payload.type).toBe("transport_assigned");
    expect(data.payload.channelId).toBe("blancbleu_critical");
  });

  test("pushToPatientUser met un job 'to_patient' avec targetType=user", async () => {
    const res = await pushDispatcher.pushToPatientUser("user-456", {
      type:  "transport_status",
      title: "Votre ambulance arrive",
      body:  "Transport TRS-2",
      data:  { transportId: "t2", newStatus: "EN_ROUTE_TO_PICKUP" },
    });
    expect(res.queued).toBe(true);
    const [name, data] = addSpy.mock.calls[0];
    expect(name).toBe("to_patient");
    expect(data.targetType).toBe("user");
    expect(data.targetId).toBe("user-456");
  });

  test("pushToPatientEmail met un job 'to_patient_email' avec targetType=user_email", async () => {
    const res = await pushDispatcher.pushToPatientEmail("jane@bb.fr", {
      type:  "transport_status",
      title: "Transport annulé",
      body:  "Transport TRS-3",
    });
    expect(res.queued).toBe(true);
    const [name, data] = addSpy.mock.calls[0];
    expect(name).toBe("to_patient_email");
    expect(data.targetType).toBe("user_email");
    expect(data.targetId).toBe("jane@bb.fr");
  });

  test("payload invalide (sans type) -> skip propre, aucun job en queue", async () => {
    const res = await pushDispatcher.pushToDriver("driver-1", {
      title: "X", body: "Y", // type manquant
    });
    expect(res.skipped).toBe("invalid_payload");
    expect(addSpy).not.toHaveBeenCalled();
  });

  test("payload sans title -> skip propre", async () => {
    const res = await pushDispatcher.pushToDriver("driver-1", {
      type: "transport_assigned", body: "Y",
    });
    expect(res.skipped).toBe("invalid_payload");
    expect(addSpy).not.toHaveBeenCalled();
  });

  test("targetId absent -> skip propre, aucun job en queue", async () => {
    const a = await pushDispatcher.pushToDriver(null, { type: "x", title: "t" });
    expect(a.skipped).toBe("no_personnel_id");
    const b = await pushDispatcher.pushToPatientUser(null, { type: "x", title: "t" });
    expect(b.skipped).toBe("no_user_id");
    const c = await pushDispatcher.pushToPatientEmail(null, { type: "x", title: "t" });
    expect(c.skipped).toBe("no_email");
    expect(addSpy).not.toHaveBeenCalled();
  });

  test("attempts/backoff sont fournis (retry BullMQ automatique)", async () => {
    await pushDispatcher.pushToDriver("d-1", {
      type: "transport_assigned", title: "X", body: "Y",
    });
    const [, , opts] = addSpy.mock.calls[0];
    expect(opts.attempts).toBe(3);
    expect(opts.backoff.type).toBe("exponential");
  });
});
