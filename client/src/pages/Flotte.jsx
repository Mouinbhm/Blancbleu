import { useState, useEffect, useCallback } from "react";
import {
  unitService,
  personnelService,
  equipementService,
  maintenanceService,
} from "../services/api";

const TABS = ["Ambulances", "Personnel", "Équipements", "Maintenance"];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
    <div
      style={{
        width: 20,
        height: 20,
        border: "2px solid #e2e8f0",
        borderTop: "2px solid #1D6EF5",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }}
    />
    Chargement…
  </div>
);

// ─── Modal Ajout Personnel ────────────────────────────────────────────────────
function ModalAjoutPersonnel({ units, onClose, onSaved }) {
  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    role: "Ambulancier",
    statut: "en-service",
    telephone: "",
    email: "",
    uniteAssignee: "",
    dateEmbauche: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom || !form.role) {
      setError("Nom, prénom et rôle sont obligatoires.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.uniteAssignee) delete payload.uniteAssignee;
      const { data } = await personnelService.create(payload);
      onSaved(data.membre);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'ajout.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "10px",
                backgroundColor: "#EFF6FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: "#1D6EF5", fontSize: "20px" }}
              >
                person_add
              </span>
            </div>
            <div>
              <h2
                style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}
              >
                Ajouter un membre
              </h2>
              <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                Personnel Ambulances Blanc Bleu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px", color: "#94a3b8" }}
            >
              close
            </span>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div
            style={{
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FCA5A5",
                  color: "#DC2626",
                  fontSize: "13px",
                }}
              >
                ⚠ {error}
              </div>
            )}

            {/* Prénom + Nom */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Prénom *
                </label>
                <input
                  name="prenom"
                  value={form.prenom}
                  onChange={handleChange}
                  placeholder="Jean"
                  required
                  style={inputStyle}
                />
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Nom *
                </label>
                <input
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  placeholder="Dupont"
                  required
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Rôle + Statut */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Rôle *
                </label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  {[
                    "Ambulancier",
                    "Secouriste",
                    "Infirmier",
                    "Médecin",
                    "Chauffeur",
                    "Autre",
                  ].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Statut
                </label>
                <select
                  name="statut"
                  value={form.statut}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option value="en-service">En service</option>
                  <option value="conge">Congé</option>
                  <option value="formation">Formation</option>
                  <option value="maladie">Maladie</option>
                </select>
              </div>
            </div>

            {/* Unité assignée */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label
                style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}
              >
                Unité assignée
              </label>
              <select
                name="uniteAssignee"
                value={form.uniteAssignee}
                onChange={handleChange}
                style={inputStyle}
              >
                <option value="">— Aucune unité —</option>
                {units.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.nom} ({u.immatriculation})
                  </option>
                ))}
              </select>
            </div>

            {/* Téléphone + Email */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Téléphone
                </label>
                <input
                  name="telephone"
                  value={form.telephone}
                  onChange={handleChange}
                  placeholder="06 12 34 56 78"
                  style={inputStyle}
                />
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="prenom.nom@blancbleu.fr"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Date d'embauche */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label
                style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}
              >
                Date d'embauche
              </label>
              <input
                name="dateEmbauche"
                type="date"
                value={form.dateEmbauche}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              padding: "16px 24px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                color: "#64748b",
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                background: saving ? "#93c5fd" : "#1D6EF5",
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 600,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {saving ? (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid #fff",
                      borderRadius: "50%",
                      animation: "spin .7s linear infinite",
                      display: "inline-block",
                    }}
                  />{" "}
                  Enregistrement…
                </>
              ) : (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "16px" }}
                  >
                    check
                  </span>{" "}
                  Ajouter le membre
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  fontSize: "14px",
  color: "#0f172a",
  outline: "none",
  width: "100%",
  backgroundColor: "#f8fafc",
  fontFamily: "inherit",
};

// ─── Modal Voir Personnel ─────────────────────────────────────────────────────
function ModalVoirPersonnel({ membre, onClose }) {
  const roleColor = {
    Médecin: "bg-purple-100 text-purple-700",
    Infirmier: "bg-blue-100 text-blue-700",
    Ambulancier: "bg-teal-100 text-teal-700",
    Secouriste: "bg-orange-100 text-orange-700",
  };
  const statutColor = {
    "en-service": "bg-emerald-100 text-emerald-700",
    conge: "bg-yellow-100 text-yellow-700",
    formation: "bg-blue-100 text-blue-700",
    maladie: "bg-red-100 text-red-700",
    inactif: "bg-slate-100 text-slate-700",
  };
  const statutLabel = {
    "en-service": "En service",
    conge: "Congé",
    formation: "Formation",
    maladie: "Maladie",
    inactif: "Inactif",
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#EFF6FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: 700,
                color: "#1D6EF5",
              }}
            >
              {`${membre.prenom?.[0] || ""}${membre.nom?.[0] || ""}`.toUpperCase()}
            </div>
            <div>
              <h2
                style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}
              >
                {membre.prenom} {membre.nom}
              </h2>
              <span
                style={{
                  fontSize: "12px",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontWeight: 600,
                  ...Object.fromEntries(
                    (roleColor[membre.role] || "bg-slate-100 text-slate-700")
                      .split(" ")
                      .map((c) => [
                        c.startsWith("bg-") ? "backgroundColor" : "color",
                        c.startsWith("bg-") ? "#e2e8f0" : "#475569",
                      ]),
                  ),
                }}
              >
                {membre.role}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px", color: "#94a3b8" }}
            >
              close
            </span>
          </button>
        </div>
        <div
          style={{
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {[
            { icon: "badge", label: "Rôle", val: membre.role },
            {
              icon: "circle",
              label: "Statut",
              val: statutLabel[membre.statut] || membre.statut,
            },
            {
              icon: "ambulance",
              label: "Unité assignée",
              val: membre.uniteAssignee?.nom || "Aucune unité",
            },
            {
              icon: "call",
              label: "Téléphone",
              val: membre.telephone || "Non renseigné",
            },
            {
              icon: "mail",
              label: "Email",
              val: membre.email || "Non renseigné",
            },
            {
              icon: "today",
              label: "Date d'embauche",
              val: fmtDate(membre.dateEmbauche),
            },
          ].map((r) => (
            <div
              key={r.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 0",
                borderBottom: "1px solid #f8fafc",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "18px", color: "#94a3b8", width: 20 }}
              >
                {r.icon}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "#94a3b8",
                  minWidth: "130px",
                }}
              >
                {r.label}
              </span>
              <span
                style={{ fontSize: "14px", fontWeight: 500, color: "#0f172a" }}
              >
                {r.val}
              </span>
            </div>
          ))}
          {membre.notes && (
            <div
              style={{
                padding: "12px",
                backgroundColor: "#f8fafc",
                borderRadius: "8px",
                fontSize: "13px",
                color: "#64748b",
              }}
            >
              📝 {membre.notes}
            </div>
          )}
        </div>
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              color: "#64748b",
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Modifier Personnel ─────────────────────────────────────────────────
function ModalModifierPersonnel({ membre, units, onClose, onSaved }) {
  const [form, setForm] = useState({
    nom: membre.nom || "",
    prenom: membre.prenom || "",
    role: membre.role || "Ambulancier",
    statut: membre.statut || "en-service",
    telephone: membre.telephone || "",
    email: membre.email || "",
    uniteAssignee: membre.uniteAssignee?._id || membre.uniteAssignee || "",
    notes: membre.notes || "",
    dateEmbauche: membre.dateEmbauche
      ? new Date(membre.dateEmbauche).toISOString().split("T")[0]
      : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom) {
      setError("Nom et prénom obligatoires.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.uniteAssignee) delete payload.uniteAssignee;
      const { data } = await personnelService.update(membre._id, payload);
      onSaved(data.membre);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message || "Erreur lors de la modification.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #f1f5f9",
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "10px",
                backgroundColor: "#FFF7ED",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: "#f59e0b", fontSize: "20px" }}
              >
                edit
              </span>
            </div>
            <div>
              <h2
                style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}
              >
                Modifier le membre
              </h2>
              <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                {membre.prenom} {membre.nom}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px", color: "#94a3b8" }}
            >
              close
            </span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div
            style={{
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FCA5A5",
                  color: "#DC2626",
                  fontSize: "13px",
                }}
              >
                ⚠ {error}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Prénom *
                </label>
                <input
                  name="prenom"
                  value={form.prenom}
                  onChange={handleChange}
                  style={inputStyle}
                  required
                />
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Nom *
                </label>
                <input
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  style={inputStyle}
                  required
                />
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Rôle *
                </label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  {[
                    "Ambulancier",
                    "Secouriste",
                    "Infirmier",
                    "Médecin",
                    "Chauffeur",
                    "Autre",
                  ].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Statut
                </label>
                <select
                  name="statut"
                  value={form.statut}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option value="en-service">En service</option>
                  <option value="conge">Congé</option>
                  <option value="formation">Formation</option>
                  <option value="maladie">Maladie</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label
                style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}
              >
                Unité assignée
              </label>
              <select
                name="uniteAssignee"
                value={form.uniteAssignee}
                onChange={handleChange}
                style={inputStyle}
              >
                <option value="">— Aucune unité —</option>
                {units.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.nom} ({u.immatriculation})
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Téléphone
                </label>
                <input
                  name="telephone"
                  value={form.telephone}
                  onChange={handleChange}
                  placeholder="06 12 34 56 78"
                  style={inputStyle}
                />
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                  }}
                >
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label
                style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}
              >
                Date d'embauche
              </label>
              <input
                name="dateEmbauche"
                type="date"
                value={form.dateEmbauche}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label
                style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}
              >
                Notes
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Informations complémentaires…"
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              padding: "16px 24px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                color: "#64748b",
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                background: saving ? "#93c5fd" : "#1D6EF5",
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 600,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {saving ? (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid #fff",
                      borderRadius: "50%",
                      animation: "spin .7s linear infinite",
                      display: "inline-block",
                    }}
                  />{" "}
                  Enregistrement…
                </>
              ) : (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "16px" }}
                  >
                    save
                  </span>{" "}
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Flotte() {
  const [tab, setTab] = useState("Ambulances");
  const [filter, setFilter] = useState("Tous");

  const [units, setUnits] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [equipements, setEquipements] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modals
  const [showModalPersonnel, setShowModalPersonnel] = useState(false);
  const [membreVoir, setMembreVoir] = useState(null);
  const [membreModifier, setMembreModifier] = useState(null);

  const load = useCallback(async (t) => {
    setLoading(true);
    setError(null);
    try {
      if (t === "Ambulances") {
        const { data } = await unitService.getAll();
        setUnits(data);
      }
      if (t === "Personnel") {
        const { data } = await personnelService.getAll();
        setPersonnel(data);
      }
      if (t === "Équipements") {
        const { data } = await equipementService.getAll();
        setEquipements(data);
      }
      if (t === "Maintenance") {
        const { data } = await maintenanceService.getAll();
        setMaintenances(data);
      }
    } catch {
      setError("Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const kpis = [
    { l: "Total unités", v: units.length, bar: 100, color: "bg-slate-400" },
    {
      l: "Disponibles",
      v: units.filter((u) => u.statut === "disponible").length,
      bar: 56,
      color: "bg-emerald-500",
    },
    {
      l: "En mission",
      v: units.filter((u) => u.statut === "en_mission").length,
      bar: 37,
      color: "bg-blue-500",
    },
    {
      l: "Maintenance",
      v: units.filter(
        (u) => u.statut === "maintenance" || u.statut === "indisponible",
      ).length,
      bar: 7,
      color: "bg-yellow-500",
    },
  ];

  const filterMap = {
    Tous: null,
    Disponible: "disponible",
    "En route": "en_mission",
    "Sur place": "en_mission",
    "Hors service": "maintenance",
  };
  const filtered =
    filter === "Tous"
      ? units
      : units.filter((u) => u.statut === filterMap[filter]);

  const handleUnitStatus = async (id, statut) => {
    try {
      await unitService.updateStatus(id, statut);
      setUnits((prev) =>
        prev.map((u) => (u._id === id ? { ...u, statut } : u)),
      );
    } catch {
      alert("Erreur statut unité.");
    }
  };

  const handlePersonnelStatus = async (id, statut) => {
    try {
      await personnelService.updateStatut(id, statut);
      setPersonnel((prev) =>
        prev.map((p) => (p._id === id ? { ...p, statut } : p)),
      );
    } catch {
      alert("Erreur statut personnel.");
    }
  };

  const handlePersonnelUpdate = (updated) => {
    setPersonnel((prev) =>
      prev.map((p) => (p._id === updated._id ? updated : p)),
    );
  };

  const handlePersonnelDelete = async (id) => {
    if (!window.confirm("Désactiver ce membre ?")) return;
    try {
      await personnelService.delete(id);
      setPersonnel((prev) => prev.filter((p) => p._id !== id));
    } catch {
      alert("Erreur suppression.");
    }
  };

  const handleEquipementEtat = async (id, etat) => {
    try {
      await equipementService.updateEtat(id, etat);
      setEquipements((prev) =>
        prev.map((e) => (e._id === id ? { ...e, etat } : e)),
      );
    } catch {
      alert("Erreur état équipement.");
    }
  };

  const handleControle = async (id) => {
    try {
      const { data } = await equipementService.enregistrerControle(id, {});
      setEquipements((prev) =>
        prev.map((e) => (e._id === id ? data.equipement : e)),
      );
    } catch {
      alert("Erreur contrôle.");
    }
  };

  const handleMaintenanceStatus = async (id, statut) => {
    try {
      await maintenanceService.updateStatut(id, statut);
      setMaintenances((prev) =>
        prev.map((m) => (m._id === id ? { ...m, statut } : m)),
      );
    } catch {
      alert("Erreur statut maintenance.");
    }
  };

  return (
    <div className="p-7 fade-in">
      {/* Modals */}
      {showModalPersonnel && (
        <ModalAjoutPersonnel
          units={units}
          onClose={() => setShowModalPersonnel(false)}
          onSaved={(nouveau) => setPersonnel((prev) => [nouveau, ...prev])}
        />
      )}
      {membreVoir && (
        <ModalVoirPersonnel
          membre={membreVoir}
          onClose={() => setMembreVoir(null)}
        />
      )}
      {membreModifier && (
        <ModalModifierPersonnel
          membre={membreModifier}
          units={units}
          onClose={() => setMembreModifier(null)}
          onSaved={(updated) => {
            handlePersonnelUpdate(updated);
            setMembreModifier(null);
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">
            Flotte & Ressources
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestion opérationnelle des unités de secours
          </p>
        </div>
        <button className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-lg">add</span>Nouvelle
          Unité
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {kpis.map((k) => (
          <div
            key={k.l}
            className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm"
          >
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">
              {k.l}
            </p>
            <p className="font-mono text-3xl font-bold text-navy mb-3">{k.v}</p>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${k.color}`}
                style={{ width: `${k.bar}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div className="flex border-b border-slate-200 mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setFilter("Tous");
            }}
            className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-navy"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ══ AMBULANCES ══ */}
      {tab === "Ambulances" && (
        <>
          <div className="flex gap-2 mb-4">
            {[
              "Tous",
              "Disponible",
              "En route",
              "Sur place",
              "Hors service",
            ].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  filter === f
                    ? "bg-navy text-white"
                    : "bg-white border border-slate-200 text-slate-500 hover:border-navy"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
            {loading ? (
              <Spinner />
            ) : error ? (
              <div className="text-center py-12 text-red-400">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Aucune unité trouvée
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-navy">
                    {[
                      "ID",
                      "Type",
                      "Statut",
                      "Adresse",
                      "Équipage",
                      "Carburant",
                      "KM",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left font-mono text-xs text-white/70 uppercase tracking-widest"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => (
                    <tr
                      key={u._id}
                      className={`border-b border-slate-100 hover:bg-blue-50 hover:border-l-4 hover:border-l-primary cursor-pointer transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                    >
                      <td className="px-5 py-4 font-mono font-bold text-navy text-sm">
                        {u.nom}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-700">
                        {u.type}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-bold ${u.statut === "disponible" ? "bg-emerald-100 text-emerald-700" : u.statut === "en_mission" ? "bg-blue-100 text-blue-700" : u.statut === "maintenance" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}
                        >
                          {u.statut === "disponible"
                            ? "DISPONIBLE"
                            : u.statut === "en_mission"
                              ? "EN MISSION"
                              : u.statut === "maintenance"
                                ? "MAINTENANCE"
                                : "INDISPONIBLE"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        {u.position?.adresse || "—"}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        {u.equipage?.length > 0
                          ? `${u.equipage.length} membre(s)`
                          : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${u.carburant > 60 ? "bg-emerald-500" : u.carburant > 30 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${u.carburant || 0}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-slate-500">
                            {u.carburant || 0}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-slate-600">
                        {u.kilometrage?.toLocaleString() || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1">
                          <button
                            title="Voir"
                            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                              visibility
                            </span>
                          </button>
                          <button
                            title="Carte"
                            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                              location_on
                            </span>
                          </button>
                          {u.statut === "disponible" ? (
                            <button
                              title="Mettre en maintenance"
                              onClick={() =>
                                handleUnitStatus(u._id, "maintenance")
                              }
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-yellow-50 hover:border-yellow-400 transition-all group"
                            >
                              <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-yellow-500">
                                build
                              </span>
                            </button>
                          ) : u.statut === "maintenance" ? (
                            <button
                              title="Remettre disponible"
                              onClick={() =>
                                handleUnitStatus(u._id, "disponible")
                              }
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-green-50 hover:border-green-400 transition-all group"
                            >
                              <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-green-500">
                                check_circle
                              </span>
                            </button>
                          ) : (
                            <button className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center opacity-40 cursor-not-allowed">
                              <span className="material-symbols-outlined text-slate-400 text-sm">
                                build
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Affichage de {filtered.length} sur {units.length} unités
              </span>
              <button className="flex items-center gap-2 text-xs font-bold text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white transition-all">
                <span className="material-symbols-outlined text-sm">
                  download
                </span>
                Exporter CSV
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══ PERSONNEL ══ */}
      {tab === "Personnel" && (
        <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-bold text-navy text-sm">
              {personnel.length} membres du personnel
            </p>
            <button
              onClick={() => setShowModalPersonnel(true)}
              className="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">
                person_add
              </span>
              Ajouter
            </button>
          </div>
          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="text-center py-12 text-red-400">{error}</div>
          ) : personnel.length === 0 ? (
            <div className="text-center py-16">
              <span
                className="material-symbols-outlined text-slate-300"
                style={{ fontSize: 48 }}
              >
                group
              </span>
              <p className="text-slate-400 mt-3 text-sm">
                Aucun membre du personnel
              </p>
              <button
                onClick={() => setShowModalPersonnel(true)}
                className="mt-4 bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Ajouter le premier membre
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-navy">
                  {[
                    "Nom",
                    "Rôle",
                    "Unité assignée",
                    "Statut",
                    "Contact",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-4 text-left font-mono text-xs text-white/70 uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {personnel.map((p, i) => (
                  <tr
                    key={p._id}
                    className={`border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {`${p.prenom?.[0] || ""}${p.nom?.[0] || ""}`.toUpperCase()}
                        </div>
                        <span className="font-semibold text-navy text-sm">
                          {p.prenom} {p.nom}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${p.role === "Médecin" ? "bg-purple-100 text-purple-700" : p.role === "Infirmier" ? "bg-blue-100 text-blue-700" : p.role === "Ambulancier" ? "bg-teal-100 text-teal-700" : "bg-orange-100 text-orange-700"}`}
                      >
                        {p.role}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-navy text-sm">
                      {p.uniteAssignee?.nom || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={p.statut}
                        onChange={(e) =>
                          handlePersonnelStatus(p._id, e.target.value)
                        }
                        className={`px-2 py-1 rounded-full text-xs font-bold border-0 cursor-pointer ${p.statut === "en-service" ? "bg-emerald-100 text-emerald-700" : p.statut === "conge" ? "bg-yellow-100 text-yellow-700" : p.statut === "maladie" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}
                      >
                        <option value="en-service">En service</option>
                        <option value="conge">Congé</option>
                        <option value="formation">Formation</option>
                        <option value="maladie">Maladie</option>
                        <option value="inactif">Inactif</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-500">
                      {p.telephone || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1">
                        <button
                          title="Voir fiche"
                          onClick={() => setMembreVoir(p)}
                          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                        >
                          <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                            visibility
                          </span>
                        </button>
                        <button
                          title="Modifier"
                          onClick={() => setMembreModifier(p)}
                          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-amber-50 hover:border-amber-400 transition-all group"
                        >
                          <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-amber-500">
                            edit
                          </span>
                        </button>
                        <button
                          title="Désactiver"
                          onClick={() => handlePersonnelDelete(p._id)}
                          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-400 transition-all group"
                        >
                          <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-red-500">
                            person_remove
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {personnel.length} membres —{" "}
              {personnel.filter((p) => p.statut === "en-service").length} en
              service
            </span>
          </div>
        </div>
      )}

      {/* ══ ÉQUIPEMENTS ══ */}
      {tab === "Équipements" && (
        <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-bold text-navy text-sm">
              {equipements.length} équipements médicaux
            </p>
            <div className="flex gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                {equipements.filter((e) => e.etat === "en-panne").length} en
                panne
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                {equipements.filter((e) => e.etat === "à-vérifier").length} à
                vérifier
              </span>
            </div>
          </div>
          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="text-center py-12 text-red-400">{error}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-navy">
                  {[
                    "Équipement",
                    "Unité",
                    "Catégorie",
                    "État",
                    "Dernier contrôle",
                    "Expiration",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-4 text-left font-mono text-xs text-white/70 uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {equipements.map((e, i) => (
                  <tr
                    key={e._id}
                    className={`border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                  >
                    <td className="px-5 py-4 font-semibold text-navy text-sm">
                      {e.nom}
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-primary text-sm">
                      {e.uniteAssignee?.nom || "—"}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      {e.categorie || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={e.etat}
                        onChange={(ev) =>
                          handleEquipementEtat(e._id, ev.target.value)
                        }
                        className={`px-2 py-1 rounded-full text-xs font-bold border-0 cursor-pointer ${e.etat === "opérationnel" ? "bg-emerald-100 text-emerald-700" : e.etat === "à-vérifier" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}
                      >
                        <option value="opérationnel">Opérationnel</option>
                        <option value="à-vérifier">À vérifier</option>
                        <option value="en-panne">En panne</option>
                        <option value="réformé">Réformé</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-500">
                      {fmtDate(e.dernierControle)}
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-500">
                      {fmtDate(e.dateExpiration)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1">
                        <button
                          title="Enregistrer contrôle"
                          onClick={() => handleControle(e._id)}
                          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                        >
                          <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                            fact_check
                          </span>
                        </button>
                        <button
                          title="Signaler panne"
                          onClick={() =>
                            handleEquipementEtat(e._id, "en-panne")
                          }
                          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-400 transition-all group"
                        >
                          <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-red-500">
                            warning
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {equipements.length} équipements ·{" "}
              {equipements.filter((e) => e.etat === "opérationnel").length}{" "}
              opérationnels
            </span>
          </div>
        </div>
      )}

      {/* ══ MAINTENANCE ══ */}
      {tab === "Maintenance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-2">
            {[
              {
                l: "En cours",
                v: maintenances.filter((m) => m.statut === "en-cours").length,
                color: "bg-blue-100 text-blue-700",
              },
              {
                l: "Planifiés",
                v: maintenances.filter((m) => m.statut === "planifié").length,
                color: "bg-yellow-100 text-yellow-700",
              },
              {
                l: "Terminés",
                v: maintenances.filter((m) => m.statut === "terminé").length,
                color: "bg-emerald-100 text-emerald-700",
              },
            ].map((k) => (
              <div
                key={k.l}
                className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center gap-4"
              >
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold ${k.color}`}
                >
                  {k.v}
                </span>
                <span className="text-slate-500 text-sm">{k.l}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="font-bold text-navy text-sm">
                Planification des maintenances
              </p>
              <button className="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors">
                <span className="material-symbols-outlined text-sm">add</span>
                Planifier
              </button>
            </div>
            {loading ? (
              <Spinner />
            ) : error ? (
              <div className="text-center py-12 text-red-400">{error}</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-navy">
                    {[
                      "Unité",
                      "Type",
                      "Statut",
                      "Début",
                      "Fin prévue",
                      "Garage",
                      "Coût",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-4 text-left font-mono text-xs text-white/70 uppercase tracking-widest"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {maintenances.map((m, i) => (
                    <tr
                      key={m._id}
                      className={`border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                    >
                      <td className="px-4 py-4 font-mono font-bold text-navy text-sm">
                        {m.unite?.nom || "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {m.type}
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={m.statut}
                          onChange={(e) =>
                            handleMaintenanceStatus(m._id, e.target.value)
                          }
                          className={`px-2 py-1 rounded-full text-xs font-bold border-0 cursor-pointer ${m.statut === "en-cours" ? "bg-blue-100 text-blue-700" : m.statut === "planifié" ? "bg-yellow-100 text-yellow-700" : m.statut === "annulé" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}
                        >
                          <option value="planifié">Planifié</option>
                          <option value="en-cours">En cours</option>
                          <option value="terminé">Terminé</option>
                          <option value="annulé">Annulé</option>
                        </select>
                      </td>
                      <td className="px-4 py-4 font-mono text-sm text-slate-500">
                        {fmtDate(m.dateDebut)}
                      </td>
                      <td className="px-4 py-4 font-mono text-sm text-slate-500">
                        {fmtDate(m.dateFin)}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-500">
                        {m.garage || "—"}
                      </td>
                      <td className="px-4 py-4 font-mono text-sm text-slate-600">
                        {m.cout ? `${m.cout.toLocaleString()} €` : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1">
                          <button
                            title="Voir détails"
                            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                              visibility
                            </span>
                          </button>
                          {m.statut !== "terminé" && m.statut !== "annulé" && (
                            <button
                              title="Marquer terminé"
                              onClick={() =>
                                handleMaintenanceStatus(m._id, "terminé")
                              }
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-green-50 hover:border-green-400 transition-all group"
                            >
                              <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-green-500">
                                check_circle
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                {maintenances.length} interventions de maintenance
              </span>
            </div>
          </div>
        </div>
      )}

      {/* AI Insight */}
      <div className="mt-5 bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-100 p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-primary">
            psychology
          </span>
        </div>
        <div>
          <p className="font-bold text-navy text-sm mb-1">
            Optimisation IA Flotte
          </p>
          <p className="text-sm text-slate-600">
            Pic d'activité prévu dans{" "}
            <span className="font-mono font-bold text-primary">45 min</span> en
            Secteur Nord. Déployer{" "}
            <span className="font-mono font-bold text-primary">AMB-01</span> en
            position stratégique Zone B-12.
          </p>
          <button className="mt-3 bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Appliquer la recommandation
          </button>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
