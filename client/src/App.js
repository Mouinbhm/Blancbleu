// Fichier : client/src/App.js
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Layout from "./components/layout/Layout";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Transports from "./pages/Transports";
import NouveauTransport from "./pages/NouveauTransport";
import TransportDetail from "./pages/TransportDetail";
import Flotte from "./pages/Flotte";
import Planning from "./pages/Planning";
import Patients from "./pages/Patients";
import Prescriptions from "./pages/Prescriptions";
import Personnel from "./pages/Personnel";
import Equipements from "./pages/Equipements";
import Maintenances from "./pages/Maintenances";
import Factures from "./pages/Factures";
import AideIA from "./pages/AideIA";

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
            <Route path="/transports" element={<Transports />} />
            <Route path="/transports/new" element={<NouveauTransport />} />
            <Route path="/transports/:id" element={<TransportDetail />} />
            <Route path="/missions" element={<Navigate to="/dashboard" replace />} />
            <Route path="/flotte" element={<Flotte />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/prescriptions" element={<Prescriptions />} />
            <Route path="/personnel" element={<Personnel />} />
            <Route path="/equipements" element={<Equipements />} />
            <Route path="/maintenances" element={<Maintenances />} />
            <Route path="/factures" element={<Factures />} />
            <Route path="/aide-ia" element={<AideIA />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
