import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Protège les routes privées — redirige vers /login si non connecté
export default function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#060B18",
          color: "#1D6EF5",
          fontFamily: "sans-serif",
          fontSize: "18px",
          gap: "12px",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "24px",
            height: "24px",
            border: "3px solid rgba(29,110,245,0.3)",
            borderTop: "3px solid #1D6EF5",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        Chargement…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
}
