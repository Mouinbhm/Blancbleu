/**
 * BlancBleu — Scan antivirus des uploads (ClamAV via clamd).
 *
 * Les PMT et documents uploadés peuvent contenir du malware (PDF piégé,
 * polyglotte image/exécutable). On scanne chaque fichier reçu avant de le
 * laisser persister/être traité.
 *
 * Architecture : le backend parle au démon `clamd` (service docker `clamav`)
 * en TCP sur clamav:3310. NodeClam streame le fichier au démon qui répond
 * infecté / sain.
 *
 * Configuration (env) :
 *   - CLAMAV_ENABLED   : "true"/"false". Par défaut activé SAUF en test.
 *                         (mettre false en dev local sans démon ClamAV.)
 *   - CLAMAV_HOST      : hôte clamd (défaut "clamav")
 *   - CLAMAV_PORT      : port clamd (défaut 3310)
 *   - CLAMAV_FAIL_OPEN : "true" → si le scan échoue (démon injoignable), on
 *                         LAISSE PASSER avec un log d'alerte (disponibilité >
 *                         sécurité). Défaut "false" → on BLOQUE (fail-closed).
 *
 * Le middleware `scanUpload` gère req.file (single) ET req.files (array/fields).
 */

const fs = require("fs");
const { Readable } = require("stream");
const logger = require("../utils/logger");

const ENABLED =
  process.env.CLAMAV_ENABLED === "true" ||
  (process.env.CLAMAV_ENABLED === undefined && process.env.NODE_ENV === "production");

const FAIL_OPEN = process.env.CLAMAV_FAIL_OPEN === "true";

let _clamPromise = null;

/**
 * Initialise (lazy, une seule fois) le client NodeClam connecté à clamd.
 * Renvoie l'instance ClamScan ou rejette si l'init échoue.
 */
function getClam() {
  if (_clamPromise) return _clamPromise;
  // require lazy : ne charge clamscan que si l'antivirus est activé (évite
  // une dépendance dure quand CLAMAV_ENABLED=false en dev/test).
   
  const NodeClam = require("clamscan");
  _clamPromise = new NodeClam().init({
    removeInfected: false, // on gère la suppression nous-mêmes (log + 400)
    debugMode: false,
    clamdscan: {
      host: process.env.CLAMAV_HOST || "clamav",
      port: parseInt(process.env.CLAMAV_PORT, 10) || 3310,
      timeout: 60_000,
      localFallback: false, // pas de binaire clamscan local — démon uniquement
    },
    preference: "clamdscan",
  });
  return _clamPromise;
}

/** Supprime un fichier best-effort (ne throw jamais). */
function _unlinkSafe(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err) logger.warn("[antivirus] suppression fichier échouée", { filePath, err: err.message });
  });
}

/** Liste plate des fichiers présents sur la requête (single + array + fields). */
function _collectFiles(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    // multer.fields() → { champ: [file, ...] }
    for (const arr of Object.values(req.files)) {
      if (Array.isArray(arr)) files.push(...arr);
    }
  }
  // diskStorage → .path ; memoryStorage → .buffer. On garde les deux.
  return files.filter((f) => f && (f.path || f.buffer));
}

/**
 * Scanne un fichier multer (disque OU mémoire) via le client ClamAV.
 * Renvoie { isInfected, viruses }.
 */
async function _scanFile(clam, file) {
  if (file.path) {
    return clam.isInfected(file.path);
  }
  // memoryStorage : on streame le buffer au démon.
  const stream = Readable.from(file.buffer);
  const { isInfected, viruses } = await clam.scanStream(stream);
  return { isInfected, viruses: viruses || [] };
}

/**
 * Middleware Express : scanne les fichiers uploadés. À placer APRÈS multer.
 *
 *   router.post("/upload", protect, multerWrap(uploadPmt), scanUpload, ctrl);
 *
 * - 0 fichier sur disque (ou antivirus désactivé) → next() direct.
 * - Fichier infecté → suppression + 400 { message, viruses }.
 * - Erreur de scan → fail-closed (400) ou fail-open (log + next) selon env.
 */
async function scanUpload(req, res, next) {
  if (!ENABLED) return next();

  const files = _collectFiles(req);
  if (files.length === 0) return next();

  let clam;
  try {
    clam = await getClam();
  } catch (initErr) {
    return _handleScanError(initErr, files, res, next);
  }

  try {
    for (const file of files) {
      const { isInfected, viruses } = await _scanFile(clam, file);
      if (isInfected) {
        logger.warn("[antivirus] fichier infecté rejeté", {
          filename: file.originalname,
          viruses,
        });
        // Supprimer TOUS les fichiers de la requête (pas seulement l'infecté).
        files.forEach((f) => _unlinkSafe(f.path));
        return res.status(400).json({
          message: "Fichier infecté détecté — upload refusé",
          code: "FILE_INFECTED",
          viruses,
        });
      }
    }
    return next();
  } catch (scanErr) {
    return _handleScanError(scanErr, files, res, next);
  }
}

function _handleScanError(err, files, res, next) {
  if (FAIL_OPEN) {
    logger.warn("[antivirus] scan indisponible — FAIL_OPEN, fichier laissé passer", {
      err: err.message,
    });
    return next();
  }
  logger.error("[antivirus] scan indisponible — FAIL_CLOSED, upload refusé", {
    err: err.message,
  });
  files.forEach((f) => _unlinkSafe(f.path));
  return res.status(503).json({
    message: "Service antivirus indisponible — upload temporairement refusé",
    code: "ANTIVIRUS_UNAVAILABLE",
  });
}

module.exports = { scanUpload, _isEnabled: () => ENABLED };
