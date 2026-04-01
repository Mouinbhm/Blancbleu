import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Interventions from "./pages/Interventions";
import Carte from "./pages/Carte";
import Flotte from "./pages/Flotte";
import AideIA from "./pages/AideIA";
import Rapports from "./pages/Rapports";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Publique ───────────────────────────────────────── */}
          <Route path="/login" element={<Login />} />

          {/* ── Privées (protégées par JWT) ─────────────────────── */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/interventions"
            element={
              <PrivateRoute>
                <Interventions />
              </PrivateRoute>
            }
          />
          <Route
            path="/carte"
            element={
              <PrivateRoute>
                <Carte />
              </PrivateRoute>
            }
          />
          <Route
            path="/flotte"
            element={
              <PrivateRoute>
                <Flotte />
              </PrivateRoute>
            }
          />
          <Route
            path="/aide-ia"
            element={
              <PrivateRoute>
                <AideIA />
              </PrivateRoute>
            }
          />
          <Route
            path="/rapports"
            element={
              <PrivateRoute>
                <Rapports />
              </PrivateRoute>
            }
          />

          {/* ── Redirection par défaut ──────────────────────────── */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
