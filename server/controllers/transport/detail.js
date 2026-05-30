/**
 * BlancBleu — Endpoints de lecture single-transport.
 *
 * GET /api/transports/:id          — détail transport + transitions possibles
 * GET /api/transports/:id/timeline — historique enrichi des transitions
 * GET /api/transports/:id/pdf      — export PDF de la fiche mission
 */

const Transport = require("../../models/Transport");
const lifecycle = require("../../services/transportLifecycle");
const { TransportStateMachine } = require("../../services/transportStateMachine");
const { generateMissionPdf } = require("../../services/missionPdfService");
const { _handleErr } = require("./_shared");

const getTransport = async (req, res, next) => {
  try {
    const transport = await Transport.findById(req.params.id)
      .populate("vehicule", "nom type statut immatriculation position carburant kilometrage")
      .populate("chauffeur", "nom prenom email telephone")
      .populate("createdBy", "nom prenom")
      .populate(
        "patientId",
        "nom prenom telephone mobilite numeroPatient oxygene brancardage accompagnateur contactUrgence",
      )
      .populate(
        "prescriptionId",
        "numero statut motif dateEmission dateExpiration medecin validee",
      );

    if (!transport) return res.status(404).json({ message: "Transport introuvable" });

    const transitions = TransportStateMachine.transitionsPossibles(transport.statut);
    const progression = TransportStateMachine.progression(transport.statut);

    res.json({ ...transport.toJSON(), transitions, progression });
  } catch (err) {
    return next(err);
  }
};

const getTimeline = async (req, res, next) => {
  try {
    const timeline = await lifecycle.getTransportTimeline(req.params.id);
    res.json({ success: true, timeline });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const exportPdf = async (req, res, next) => {
  try {
    // Contrôle d'accès : admin, dispatcher, superviseur, ou chauffeur assigné
    const transport = await Transport.findById(req.params.id).select("chauffeur patientId");
    if (!transport)
      return res.status(404).json({ success: false, message: "Transport introuvable" });

    const user = req.user;
    const isStaff = ["admin", "dispatcher", "superviseur"].includes(user.role);
    const isDriver = transport.chauffeur?.toString() === user._id?.toString();
    const isPatient = transport.patientId?.toString() === user._id?.toString();

    if (!isStaff && !isDriver && !isPatient) {
      return res
        .status(403)
        .json({ success: false, message: "Accès non autorisé à ce document", code: "FORBIDDEN" });
    }

    const pdfBuffer = await generateMissionPdf(req.params.id);
    const numero = transport.numero || req.params.id;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mission_${numero}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (e) {
    _handleErr(res, next, e);
  }
};

module.exports = { getTransport, getTimeline, exportPdf };
