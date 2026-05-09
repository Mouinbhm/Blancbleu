import { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Au démarrage : tenter de restaurer la session via le cookie de refresh
  useEffect(() => {
    authService.refresh()
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await authService.login({ email, password });
    setUser(data.user);
    if (data.user?.mustChangePassword) {
      navigate("/force-change-password");
    } else {
      navigate("/dashboard");
    }
  };

  const logout = async () => {
    try { await authService.logout(); } catch { /* ignore */ }
    setUser(null);
    navigate("/login");
  };

  const clearMustChangePassword = () => {
    setUser((prev) => prev ? { ...prev, mustChangePassword: false } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
