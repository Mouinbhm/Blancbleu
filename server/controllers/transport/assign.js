/**
 * BlancBleu — Assignation véhicule/chauffeur.
 *
 * PATCH /api/transports/:id/assign — délégué au lifecycle (atomic claim
 * du véhicule, cf. server/services/transportLifecycle.js assignerVehicule).
 */

const lifecycle = require("../../services/transportLifecycle");
const { _handleErr } = require("./_shared");

const assigner = async (req, res, next) => {
  try {
    const { shiftId, vehiculeId, chauffeurId, auto } = req.body;
    const r = await lifecycle.assignerVehicule(
      req.params.id,
      { shiftId, vehiculeId, chauffeurId, auto },
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

module.exports = { assigner };
