const router          = require("express").Router();
const requirePersonnel = require("../middleware/requirePersonnel");
const Message          = require("../models/Message");

// GET /api/v1/messages/history — driver's last 50 messages
router.get("/history", requirePersonnel, async (req, res) => {
  try {
    const messages = await Message.find({ driverId: req.personnel._id.toString() })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/v1/messages — REST fallback to send a message (socket unavailable)
router.post("/", requirePersonnel, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texte requis" });

    const saved = await Message.create({
      driverId:   req.personnel._id.toString(),
      fromDriver: true,
      text:       String(text).trim().slice(0, 1000),
    });

    // Broadcast via Socket.IO if available
    const io = req.app.get("io");
    if (io) {
      io.to("role:dispatcher").emit("message:driver", {
        messageId: saved._id.toString(),
        from:      req.personnel._id.toString(),
        fromNom:   `${req.personnel.prenom} ${req.personnel.nom}`,
        text:      saved.text,
        timestamp: saved.createdAt,
      });
    }

    res.status(201).json({ messageId: saved._id.toString() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
