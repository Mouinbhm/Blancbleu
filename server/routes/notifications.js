/**
 * BlancBleu — Routes Notifications
 * Toutes les routes sont protégées par JWT (protect).
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth");
const ctrl    = require("../controllers/notificationController");
const pushCtrl = require("../controllers/pushController");

// ── Web Push ────────────────────────────────────────────────────────────────
// /api/notifications/push/vapid-public-key est PUBLIC (le navigateur en a
// besoin avant même d'être authentifié pour souscrire), les autres routes
// push sont protégées par protect (montées après router.use ci-dessous).
router.get("/push/vapid-public-key", pushCtrl.getVapidPublicKey);

// Toutes les routes suivantes requièrent une authentification
router.use(protect);

// ── Push subscription (per user, per device) ────────────────────────────────
router.post  ("/push/subscribe",   pushCtrl.subscribe);
router.delete("/push/unsubscribe", pushCtrl.unsubscribe);
router.get   ("/push/status",      pushCtrl.getStatus);

// GET    /api/notifications                → liste paginée avec filtres
// GET    /api/notifications/unread-count   → compteur non lus
// PATCH  /api/notifications/read-all       → marquer tout comme lu
// PATCH  /api/notifications/:id/read       → marquer une notif comme lue
// PATCH  /api/notifications/:id/archive    → archiver
// DELETE /api/notifications/:id            → supprimer

router.get   ("/",               ctrl.getNotifications);
router.get   ("/unread-count",   ctrl.getUnreadCount);
router.patch ("/read-all",       ctrl.markAllAsRead);
router.patch ("/:id/read",       ctrl.markAsRead);
router.patch ("/:id/archive",    ctrl.archiveNotification);
router.delete("/:id",            ctrl.deleteNotification);

module.exports = router;
