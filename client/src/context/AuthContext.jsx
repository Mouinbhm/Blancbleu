import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser]               = useState(null);
  const [loading, setLoading]         = useState(true);
  // Stockage temporaire pour le flux 2FA
  const [pendingTempToken, setPendingTempToken] = useState(null);

  useEffect(() => {
    authService.refresh()
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await authService.login({ email, password });

    // Cas 1 : admin doit configurer la 2FA (première fois)
    if (data.requiresTwoFactorSetup) {
      setPendingTempToken(data.tempToken);
      navigate("/2fa/setup");
      return;
    }

    // Cas 2 : 2FA active → saisir le code
    if (data.requiresTwoFactor) {
      setPendingTempToken(data.tempToken);
      navigate("/2fa/verify");
      return;
    }

    // Cas 3 : connexion normale
    setUser(data.user);
    if (data.user?.mustChangePassword) {
      navigate("/force-change-password");
    } else {
      navigate("/dashboard");
    }
  };

  // Appelé depuis TwoFactorVerify une fois le code validé
  const completeTwoFactorLogin = useCallback((userData) => {
    setPendingTempToken(null);
    setUser(userData);
    if (userData?.mustChangePassword) {
      navigate("/force-change-password");
    } else {
      navigate("/dashboard");
    }
  }, [navigate]);

  // Appelé depuis TwoFactorSetup une fois la 2FA configurée
  const completeTwoFactorSetup = useCallback(() => {
    setPendingTempToken(null);
    // Retour au login pour que l'utilisateur se reconnecte avec son code
    navigate("/login");
  }, [navigate]);

  const logout = async () => {
    try { await authService.logout(); } catch { /* ignore */ }
    setUser(null);
    setPendingTempToken(null);
    navigate("/login");
  };

  const clearMustChangePassword = () => {
    setUser((prev) => prev ? { ...prev, mustChangePassword: false } : prev);
  };

  const updateTwoFactorStatus = (updates) => {
    setUser((prev) => prev ? { ...prev, ...updates } : prev);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        pendingTempToken,
        login,
        logout,
        completeTwoFactorLogin,
        completeTwoFactorSetup,
        clearMustChangePassword,
        updateTwoFactorStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
