/**
 * BlancBleu — Wrappers HTTP des transitions lifecycle.
 *
 * Chaque endpoint PATCH /api/transports/:id/<action> délègue au service
 * `transportLifecycle` qui possède la logique métier + RBAC + state machine.
 * Le contrôleur ne fait que :
 *   - valider la fenêtre date pour les actions terrain (_verifierDateTerrain)
 *   - mapper l'erreur en statut HTTP (_handleErr)
 *
 * Toute logique métier reste dans le service — ne pas l'ajouter ici.
 */

const lifecycle = require("../../services/transportLifecycle");
const { _verifierDateTerrain, _handleErr } = require("./_shared");

const confirmer = async (req, res, next) => {
  try {
    const r = await lifecycle.confirmerTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const planifier = async (req, res, next) => {
  try {
    const r = await lifecycle.planifierTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const enRoute = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.marquerEnRoute(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const arriveePatient = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.marquerArriveePatient(req.params.id, req.body.position, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const patientABord = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.marquerPatientABord(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const arriveeDestination = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.marquerArriveeDestination(req.params.id, req.body.position, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const completer = async (req, res, next) => {
  try {
    const errDate = await _verifierDateTerrain(req.params.id, req.body);
    if (errDate) return res.status(400).json(errDate);
    const r = await lifecycle.completerTransport(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const noShow = async (req, res, next) => {
  try {
    const r = await lifecycle.marquerNoShow(req.params.id, req.body.raison, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const annuler = async (req, res, next) => {
  try {
    const r = await lifecycle.annulerTransport(req.params.id, req.body.raison, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const reprogrammer = async (req, res, next) => {
  try {
    const r = await lifecycle.reprogrammerTransport(req.params.id, req.body, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const demarrerAttente = async (req, res, next) => {
  try {
    const r = await lifecycle.demarrerAttenteDestination(
      req.params.id,
      req.body.dureeAttenteMinutes != null ? parseInt(req.body.dureeAttenteMinutes) : null,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const demarrerRetour = async (req, res, next) => {
  try {
    const r = await lifecycle.demarrerRetourBase(
      req.params.id,
      req.body.position || null,
      req.user,
    );
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const accepterDriver = async (req, res, next) => {
  try {
    const r = await lifecycle.accepterDriver(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const refuserDriver = async (req, res, next) => {
  try {
    const r = await lifecycle.refuserDriver(req.params.id, req.body.raison, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const fail = async (req, res, next) => {
  try {
    const r = await lifecycle.marquerFailed(req.params.id, req.body.raison, req.user);
    res.json(r);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

module.exports = {
  confirmer,
  planifier,
  enRoute,
  arriveePatient,
  patientABord,
  arriveeDestination,
  completer,
  noShow,
  annuler,
  reprogrammer,
  demarrerAttente,
  demarrerRetour,
  accepterDriver,
  refuserDriver,
  fail,
};
