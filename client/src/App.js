import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Layout from "./components/layout/Layout";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Interventions from "./pages/Interventions";
import Carte from "./pages/Carte";
import Flotte from "./pages/Flotte";
import AideIA from "./pages/AideIA";
import Rapports from "./pages/Rapports";
import Factures from "./pages/Factures";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Publiques */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Privées sous Layout */}
          <Route
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/interventions" element={<Interventions />} />
            <Route path="/carte" element={<Carte />} />
            <Route path="/flotte" element={<Flotte />} />
            <Route path="/aide-ia" element={<AideIA />} />
            <Route path="/rapports" element={<Rapports />} />
            <Route path="/factures" element={<Factures />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
