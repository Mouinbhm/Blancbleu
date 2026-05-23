import api from "./client";

export const authService = {
  login:     (data) => api.post("/auth/login", data),
  register:  (data) => api.post("/auth/register", data),
  me:        ()     => api.get("/auth/me"),
  refresh:   ()     => api.post("/auth/refresh"),
  logout:    ()     => api.post("/auth/logout"),
  logoutAll: ()     => api.post("/auth/logout-all"),
};

export const twoFactorService = {
  getStatus:             ()               => api.get("/auth/2fa/status"),
  setup:                 ()               => api.post("/auth/2fa/setup"),
  verifySetup:           (code)           => api.post("/auth/2fa/verify-setup",            { code }),
  verifyLogin:           (tempToken, code) => api.post("/auth/2fa/verify-login",           { tempToken, code }),
  disable:               (password, code)  => api.post("/auth/2fa/disable",                { password, code }),
  regenerateBackupCodes: (code)           => api.post("/auth/2fa/regenerate-backup-codes", { code }),
};

export const userService = {
  getAll:         (params = {}) => api.get("/auth/users", { params }),
  create:         (data)        => api.post("/auth/register", data),
  toggle:         (id)          => api.patch(`/auth/users/${id}/toggle`),
  delete:         (id)          => api.delete(`/auth/users/${id}`),
  resetPassword:  (id, motDePasse) => api.post(`/auth/users/${id}/reset-password`, { motDePasse }),
  updatePassword: (data)        => api.patch("/auth/password", data),
};
