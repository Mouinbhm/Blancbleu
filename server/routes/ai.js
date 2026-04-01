const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { analyzeIncident } = require("../controllers/aiController");

router.post("/analyze", protect, analyzeIncident);

module.exports = router;
