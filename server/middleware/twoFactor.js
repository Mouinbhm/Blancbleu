/**
 * Middleware : garantit que l'admin a complété la configuration 2FA.
 * À appliquer APRÈS `protect` sur les routes sensibles (création user, audit, etc.)
 *
 * Seul le rôle "admin" est concerné — les autres rôles passent sans contrôle.
 */
const requireTwoFactorForAdmin = (req, res, next) => {
  const user = req.user;

  if (!user) return res.status(401).json({ message: "Non authentifié" });

  if (user.role !== "admin") return next();

  if (!user.twoFactorEnabled || !user.twoFactorSetupCompleted) {
    return res.status(403).json({
      message: "La double authentification (2FA) est obligatoire pour les administrateurs.",
      code: "2FA_REQUIRED",
    });
  }

  next();
};

module.exports = { requireTwoFactorForAdmin };
