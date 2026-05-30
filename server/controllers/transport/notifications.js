/**
 * BlancBleu — Notifications transport.
 *
 * GET   /api/transports/notifications           — liste (paginée, filtre unread)
 * PATCH /api/transports/notifications/:id/read  — marquer une notif lue
 * PATCH /api/transports/notifications/read-all  — marquer toutes lues
 */

const Notification = require("../../models/Notification");
const { _handleErr } = require("./_shared");

const getNotifications = async (req, res, next) => {
  try {
    const user = req.user;
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const onlyUnread = req.query.unread === "true";

    const query = {
      $or: [{ recipientId: user._id }, { recipientRole: user.role }],
    };
    if (onlyUnread) query.read = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({ ...query, read: false });

    res.json({ success: true, notifications, unreadCount });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true, readAt: new Date() });
    res.json({ success: true, message: "Notification marquée comme lue" });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

const markAllNotificationsRead = async (req, res, next) => {
  try {
    const user = req.user;
    await Notification.updateMany(
      { $or: [{ recipientId: user._id }, { recipientRole: user.role }], read: false },
      { $set: { read: true, readAt: new Date() } },
    );
    res.json({ success: true, message: "Toutes les notifications marquées comme lues" });
  } catch (e) {
    _handleErr(res, next, e);
  }
};

module.exports = { getNotifications, markNotificationRead, markAllNotificationsRead };
