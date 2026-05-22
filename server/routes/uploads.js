const express = require("express");
const path    = require("path");
const fs      = require("fs");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");

// GET /uploads/pmt/:filename — documents médicaux, réservé staff
router.get("/pmt/:filename", protect, authorize("admin", "dispatcher", "superviseur"), (req, res) => {
  const filename = path.basename(req.params.filename); // anti-traversal
  const file = path.join(UPLOADS_ROOT, "pmt", filename);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

// GET /uploads/signatures/:filename — signatures patient, réservé staff
router.get("/signatures/:filename", protect, authorize("admin", "dispatcher", "superviseur"), (req, res) => {
  const filename = path.basename(req.params.filename);
  const file = path.join(UPLOADS_ROOT, "signatures", filename);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

// GET /uploads/avatars/:filename — photos de profil personnel, accès authentifié
// (non médical — confirmation requise si besoin d'accès public, voir SPRINT-1-NOTES.md)
router.get("/avatars/:filename", protect, (req, res) => {
  const filename = path.basename(req.params.filename);
  const file = path.join(UPLOADS_ROOT, "avatars", filename);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

module.exports = router;
