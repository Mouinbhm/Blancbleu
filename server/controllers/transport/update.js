/**
 * BlancBleu — Update / soft-delete d'un transport.
 *
 * PATCH  /api/transports/:id — modifier champs whitelisted
 * DELETE /api/transports/:id — soft delete (deletedAt)
 */

const Transport = require("../../models/Transport");
const { UPDATE_WHITELIST, logger } = require("./_shared");

const updateTransport = async (req, res) => {
  try {
    const updates = {};
    for (const key of UPDATE_WHITELIST) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const transport = await Transport.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });
    res.json(transport);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const deleteTransport = async (req, res, next) => {
  try {
    const transport = await Transport.findById(req.params.id);
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });
    await Transport.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    logger.info("Transport supprimé (soft-delete)", {
      numero: transport.numero,
      suppresseur: req.user?._id,
    });
    res.json({ message: "Transport supprimé" });
  } catch (err) {
    return next(err);
  }
};

module.exports = { updateTransport, deleteTransport };
