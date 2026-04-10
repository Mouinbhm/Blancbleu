import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  unitService,
  personnelService,
  equipementService,
  maintenanceService,
} from "../services/api";
import useSocket from "../hooks/useSocket";

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

// ─── Modal Voir Unité ─────────────────────────────────────────────────────────
function ModalVoirUnite({ unite, onClose }) {
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
          maxWidth: "500px",
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
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "10px",
                background: "#EFF6FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: "#1D6EF5", fontSize: "22px" }}
              >
                ambulance
              </span>
            </div>
            <div>
              <h2
                style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}
              >
                {unite.nom}
              </h2>
              <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                {unite.immatriculation} · {unite.type}
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
        <div
          style={{
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {[
            { icon: "directions_car", label: "Type", val: unite.type },
            {
              icon: "badge",
              label: "Immatriculation",
              val: unite.immatriculation,
            },
            {
              icon: "location_on",
              label: "Position",
              val: unite.position?.adresse || "—",
            },
            {
              icon: "local_gas_station",
              label: "Carburant",
              val: `${unite.carburant || 0}%`,
            },
            {
              icon: "speed",
              label: "Kilométrage",
              val: unite.kilometrage
                ? `${unite.kilometrage.toLocaleString()} km`
                : "—",
            },
            {
              icon: "group",
              label: "Équipage",
              val:
                unite.equipage?.length > 0
                  ? unite.equipage.map((m) => `${m.nom} (${m.role})`).join(", ")
                  : "Aucun",
            },
            { icon: "build", label: "Année", val: unite.annee || "—" },
          ].map((r) => (
            <div
              key={r.label}
              style={{
                display: "flex",
                alignItems: "flex-start",
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

// ─── Modal Nouvelle Unité ─────────────────────────────────────────────────────
function ModalNouvelleUnite({ onClose, onSaved }) {
  const [form, setForm] = useState({
    nom: "",
    immatriculation: "",
    type: "VSAV",
    statut: "disponible",
    annee: "",
    kilometrage: "",
    carburant: "100",
    notes: "",
    position: {
      adresse: "Base principale — 59 Bd Madeleine, Nice",
      lat: "43.7102",
      lng: "7.2620",
    },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith("position.")) {
      const key = name.split(".")[1];
      setForm((p) => ({ ...p, position: { ...p.position, [key]: value } }));
    } else setForm((p) => ({ ...p, [name]: value }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.immatriculation) {
      setError("Nom et immatriculation obligatoires.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await unitService.create({
        ...form,
        kilometrage: parseInt(form.kilometrage) || 0,
        carburant: parseInt(form.carburant) || 100,
        annee: parseInt(form.annee) || undefined,
        position: {
          ...form.position,
          lat: parseFloat(form.position.lat),
          lng: parseFloat(form.position.lng),
        },
      });
      onSaved(data.unit || data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur.");
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
          maxWidth: "540px",
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
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
            Nouvelle unité
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "none",
              cursor: "pointer",
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Nom *
                </label>
                <input
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  placeholder="VSAV-05"
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Immatriculation *
                </label>
                <input
                  name="immatriculation"
                  value={form.immatriculation}
                  onChange={handleChange}
                  placeholder="AB-123-NI"
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Type
                </label>
                <select
                  name="type"
                  value={form.type}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  {["VSAV", "SMUR", "VSL", "VPSP", "AR"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
                  <option value="disponible">Disponible</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px",
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Année
                </label>
                <input
                  name="annee"
                  type="number"
                  value={form.annee}
                  onChange={handleChange}
                  placeholder="2023"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Kilométrage
                </label>
                <input
                  name="kilometrage"
                  type="number"
                  value={form.kilometrage}
                  onChange={handleChange}
                  placeholder="0"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Carburant %
                </label>
                <input
                  name="carburant"
                  type="number"
                  min="0"
                  max="100"
                  value={form.carburant}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#64748b",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Adresse / Base
              </label>
              <input
                name="position.adresse"
                value={form.position.adresse}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#64748b",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Notes
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={2}
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
              }}
            >
              {saving ? "Création…" : "Ajouter l'unité"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Nouvel Équipement ──────────────────────────────────────────────────
function ModalNouvelEquipement({ units, onClose, onSaved }) {
  const CATS = [
    "Défibrillateur",
    "Monitoring",
    "Ventilation",
    "Oxymétrie",
    "Perfusion",
    "Immobilisation",
    "Protection",
    "Médicament",
    "Autre",
  ];
  const [form, setForm] = useState({
    nom: "",
    categorie: "",
    numeroSerie: "",
    fabricant: "",
    modele: "",
    etat: "opérationnel",
    uniteAssignee: "",
    dateAchat: "",
    dernierControle: "",
    dateExpiration: "",
    notes: "",
    quantite: 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) {
      setError("Nom obligatoire");
      return;
    }
    if (!form.categorie) {
      setError("Catégorie obligatoire");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.uniteAssignee) delete payload.uniteAssignee;
      if (!payload.dateAchat) delete payload.dateAchat;
      if (!payload.dernierControle) delete payload.dernierControle;
      if (!payload.dateExpiration) delete payload.dateExpiration;
      const { data } = await equipementService.create(payload);
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur création");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 580,
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#EFF6FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: "#1D6EF5", fontSize: 20 }}
              >
                medical_services
              </span>
            </div>
            <div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                Nouvel équipement médical
              </h2>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                Ajouter à l'inventaire BlancBleu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
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
              style={{ fontSize: 18, color: "#94a3b8" }}
            >
              close
            </span>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div
            style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "#dc2626",
                  fontSize: 13,
                }}
              >
                ⚠ {error}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Nom *
                </label>
                <input
                  value={form.nom}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nom: e.target.value }))
                  }
                  placeholder="Défibrillateur ZOLL AED..."
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Catégorie *
                </label>
                <select
                  value={form.categorie}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categorie: e.target.value }))
                  }
                  style={inputStyle}
                  required
                >
                  <option value="">Sélectionner...</option>
                  {CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Fabricant
                </label>
                <input
                  value={form.fabricant}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fabricant: e.target.value }))
                  }
                  placeholder="ZOLL, Philips, Laerdal..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Modèle
                </label>
                <input
                  value={form.modele}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, modele: e.target.value }))
                  }
                  placeholder="AED Plus, HeartStart..."
                  style={inputStyle}
                />
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  N° de série
                </label>
                <input
                  value={form.numeroSerie}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, numeroSerie: e.target.value }))
                  }
                  placeholder="SN-2024-001"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Quantité
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.quantite}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quantite: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  État
                </label>
                <select
                  value={form.etat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, etat: e.target.value }))
                  }
                  style={inputStyle}
                >
                  <option value="opérationnel">✅ Opérationnel</option>
                  <option value="à-vérifier">⚠️ À vérifier</option>
                  <option value="en-panne">❌ En panne</option>
                  <option value="en-réparation">🔧 En réparation</option>
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Unité assignée
                </label>
                <select
                  value={form.uniteAssignee}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, uniteAssignee: e.target.value }))
                  }
                  style={inputStyle}
                >
                  <option value="">— Aucune (base) —</option>
                  {units
                    .filter((u) => u.statut !== "maintenance")
                    .map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.nom} · {u.type}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Date achat
                </label>
                <input
                  type="date"
                  value={form.dateAchat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dateAchat: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Dernier contrôle
                </label>
                <input
                  type="date"
                  value={form.dernierControle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dernierControle: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Expiration
                </label>
                <input
                  type="date"
                  value={form.dateExpiration}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dateExpiration: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
                placeholder="Informations complémentaires..."
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              padding: "16px 24px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "none",
                cursor: "pointer",
                fontSize: 13,
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
                borderRadius: 8,
                background: saving ? "#93c5fd" : "#1D6EF5",
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {saving ? (
                "Création…"
              ) : (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16 }}
                  >
                    add
                  </span>
                  Créer l'équipement
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom || !form.role) {
      setError("Nom, prénom et rôle obligatoires.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.uniteAssignee) delete payload.uniteAssignee;
      const { data } = await personnelService.create(payload);
      onSaved(data.membre || data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur.");
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
            Ajouter un membre
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "none",
              cursor: "pointer",
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#64748b",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Unité assignée
              </label>
              <select
                name="uniteAssignee"
                value={form.uniteAssignee}
                onChange={handleChange}
                style={inputStyle}
              >
                <option value="">— Aucune —</option>
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#64748b",
                  display: "block",
                  marginBottom: 4,
                }}
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
              }}
            >
              {saving ? "Enregistrement…" : "Ajouter le membre"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modals Personnel (Voir / Modifier / Désactiver) ─────────────────────────
function ModalVoirPersonnel({ membre, onClose }) {
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
              <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                {membre.role}
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
              icon: "ambulance",
              label: "Unité",
              val: membre.uniteAssignee?.nom || "Aucune",
            },
            { icon: "call", label: "Téléphone", val: membre.telephone || "—" },
            { icon: "mail", label: "Email", val: membre.email || "—" },
            {
              icon: "today",
              label: "Embauche",
              val: fmtDate(membre.dateEmbauche),
            },
          ].map((r) => (
            <div
              key={r.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 0",
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
                  minWidth: "100px",
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
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
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
      onSaved(data.membre || data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur.");
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
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
            Modifier {membre.prenom} {membre.nom}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "none",
              cursor: "pointer",
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Rôle
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
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
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
            <div>
              <label
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Unité assignée
              </label>
              <select
                name="uniteAssignee"
                value={form.uniteAssignee}
                onChange={handleChange}
                style={inputStyle}
              >
                <option value="">— Aucune —</option>
                {units.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.nom}
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
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Téléphone
                </label>
                <input
                  name="telephone"
                  value={form.telephone}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Email
                </label>
                <input
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Notes
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={2}
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
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                color: "#fff",
              }}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalDesactiverPersonnel({ membre, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
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
          maxWidth: "400px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            backgroundColor: "#FEF2F2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "28px", color: "#EF4444" }}
          >
            person_remove
          </span>
        </div>
        <h2
          style={{
            fontSize: "17px",
            fontWeight: 700,
            color: "#0f172a",
            marginBottom: 8,
          }}
        >
          Désactiver ce membre ?
        </h2>
        <p style={{ fontSize: "14px", color: "#64748b", marginBottom: 20 }}>
          <strong>
            {membre.prenom} {membre.nom}
          </strong>{" "}
          ne sera plus visible dans la liste.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "#64748b",
            }}
          >
            Annuler
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              await onConfirm();
              setLoading(false);
            }}
            disabled={loading}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 10,
              border: "none",
              background: "#EF4444",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {loading ? "Désactivation…" : "Désactiver"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────
export default function Flotte() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("Ambulances");
  const [filter, setFilter] = useState("Tous");
  const [units, setUnits] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [equipements, setEquipements] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modals
  const [showNouvelleUnite, setShowNouvelleUnite] = useState(false);
  const [showNouvelEquipement, setShowNouvelEquipement] = useState(false);
  const [showModalPersonnel, setShowModalPersonnel] = useState(false);
  const [uniteVoir, setUniteVoir] = useState(null);
  const [membreVoir, setMembreVoir] = useState(null);
  const [membreModifier, setMembreModifier] = useState(null);
  const [membreDesactiver, setMembreDesactiver] = useState(null);

  // Socket temps réel
  const { subscribe } = useSocket();
  useEffect(() => {
    const u1 = subscribe("unit:location_updated", (data) => {
      setUnits((prev) =>
        prev.map((u) =>
          u._id?.toString() === data.unitId?.toString()
            ? {
                ...u,
                position: data.position ?? u.position,
                carburant: data.carburant ?? u.carburant,
                kilometrage: data.kilometrage ?? u.kilometrage,
                statut: data.statut ?? u.statut,
              }
            : u,
        ),
      );
    });
    const u2 = subscribe("unit:status_changed", (data) => {
      setUnits((prev) =>
        prev.map((u) =>
          u._id?.toString() === data.unitId?.toString()
            ? { ...u, statut: data.nouveauStatut }
            : u,
        ),
      );
    });
    return () => {
      u1();
      u2();
    };
  }, [subscribe]);

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
        setEquipements(data.equipements || data || []);
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
        (u) => u.statut === "maintenance" || u.statut === "hors_service",
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
      setUnits((p) => p.map((u) => (u._id === id ? { ...u, statut } : u)));
    } catch {
      alert("Erreur.");
    }
  };
  const handlePersonnelStatus = async (id, statut) => {
    try {
      await personnelService.updateStatut(id, statut);
      setPersonnel((p) => p.map((m) => (m._id === id ? { ...m, statut } : m)));
    } catch {
      alert("Erreur.");
    }
  };
  const handlePersonnelDelete = async (id) => {
    try {
      await personnelService.delete(id);
      setPersonnel((p) => p.filter((m) => m._id !== id));
      setMembreDesactiver(null);
    } catch {
      alert("Erreur.");
    }
  };
  const handleEquipementEtat = async (id, etat) => {
    try {
      await equipementService.updateEtat(id, etat);
      setEquipements((p) => p.map((e) => (e._id === id ? { ...e, etat } : e)));
    } catch {
      alert("Erreur état.");
    }
  };
  const handleControle = async (id) => {
    try {
      await equipementService.updateEtat(
        id,
        "opérationnel",
        "Contrôle effectué",
      );
      setEquipements((p) =>
        p.map((e) =>
          e._id === id
            ? { ...e, etat: "opérationnel", dernierControle: new Date() }
            : e,
        ),
      );
    } catch {
      alert("Erreur contrôle.");
    }
  };
  const handleMaintenanceStatus = async (id, statut) => {
    try {
      await maintenanceService.updateStatut(id, statut);
      setMaintenances((p) =>
        p.map((m) => (m._id === id ? { ...m, statut } : m)),
      );
    } catch {
      alert("Erreur.");
    }
  };

  return (
    <div className="p-7 fade-in">
      {/* Modals */}
      {showNouvelleUnite && (
        <ModalNouvelleUnite
          onClose={() => setShowNouvelleUnite(false)}
          onSaved={(u) => {
            setUnits((p) => [u, ...p]);
            setShowNouvelleUnite(false);
          }}
        />
      )}
      {showNouvelEquipement && (
        <ModalNouvelEquipement
          units={units}
          onClose={() => setShowNouvelEquipement(false)}
          onSaved={(e) => {
            setEquipements((p) => [e, ...p]);
            setShowNouvelEquipement(false);
          }}
        />
      )}
      {showModalPersonnel && (
        <ModalAjoutPersonnel
          units={units}
          onClose={() => setShowModalPersonnel(false)}
          onSaved={(m) => {
            setPersonnel((p) => [m, ...p]);
            setShowModalPersonnel(false);
          }}
        />
      )}
      {uniteVoir && (
        <ModalVoirUnite unite={uniteVoir} onClose={() => setUniteVoir(null)} />
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
          onSaved={(u) => {
            setPersonnel((p) => p.map((m) => (m._id === u._id ? u : m)));
            setMembreModifier(null);
          }}
        />
      )}
      {membreDesactiver && (
        <ModalDesactiverPersonnel
          membre={membreDesactiver}
          onClose={() => setMembreDesactiver(null)}
          onConfirm={() => handlePersonnelDelete(membreDesactiver._id)}
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
        <div className="flex gap-2">
          {tab === "Équipements" && (
            <button
              onClick={() => setShowNouvelEquipement(true)}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg"
            >
              <span className="material-symbols-outlined text-lg">
                medical_services
              </span>
              Nouvel équipement
            </button>
          )}
          <button
            onClick={() => setShowNouvelleUnite(true)}
            className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Nouvelle Unité
          </button>
        </div>
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
            className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 ${tab === t ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-navy"}`}
          >
            {t}
            {t === "Équipements" &&
              equipements.filter(
                (e) => e.etat === "en-panne" || e.etat === "à-vérifier",
              ).length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                  {
                    equipements.filter(
                      (e) => e.etat === "en-panne" || e.etat === "à-vérifier",
                    ).length
                  }
                </span>
              )}
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
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filter === f ? "bg-navy text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-navy"}`}
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
                Aucune unité
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
                      className={`border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
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
                            onClick={() => setUniteVoir(u)}
                            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                              visibility
                            </span>
                          </button>
                          <button
                            title="Carte"
                            onClick={() => navigate(`/carte?unitId=${u._id}`)}
                            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                              location_on
                            </span>
                          </button>
                          {u.statut === "disponible" ? (
                            <button
                              title="Maintenance"
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
                              title="Disponible"
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
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                {filtered.length} / {units.length} unités
              </span>
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
              <p className="text-slate-400 text-sm">Aucun membre</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-navy">
                  {["Nom", "Rôle", "Unité", "Statut", "Contact", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left font-mono text-xs text-white/70 uppercase tracking-widest"
                      >
                        {h}
                      </th>
                    ),
                  )}
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
                          title="Voir"
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
                          onClick={() => setMembreDesactiver(p)}
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
            <div className="flex gap-2 items-center">
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
          ) : equipements.length === 0 ? (
            <div className="text-center py-16">
              <span
                className="material-symbols-outlined text-slate-300"
                style={{ fontSize: 48 }}
              >
                medical_services
              </span>
              <p className="text-slate-400 mt-3 text-sm">
                Aucun équipement enregistré
              </p>
              <p className="text-slate-300 text-xs mt-1">
                Cliquez sur "Nouvel équipement" en haut pour en ajouter
              </p>
            </div>
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
                    <td className="px-5 py-4">
                      <div className="font-semibold text-navy text-sm">
                        {e.nom}
                      </div>
                      {e.fabricant && (
                        <div className="text-xs text-slate-400">
                          {e.fabricant} {e.modele}
                        </div>
                      )}
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
                        className={`px-2 py-1 rounded-full text-xs font-bold border-0 cursor-pointer ${e.etat === "opérationnel" ? "bg-emerald-100 text-emerald-700" : e.etat === "à-vérifier" ? "bg-yellow-100 text-yellow-700" : e.etat === "en-réparation" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}
                      >
                        <option value="opérationnel">Opérationnel</option>
                        <option value="à-vérifier">À vérifier</option>
                        <option value="en-panne">En panne</option>
                        <option value="en-réparation">En réparation</option>
                        <option value="retiré">Retiré</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-500">
                      {fmtDate(e.dernierControle)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`font-mono text-sm ${e.dateExpiration && new Date(e.dateExpiration) < new Date() ? "text-red-600 font-bold" : "text-slate-500"}`}
                      >
                        {fmtDate(e.dateExpiration)}
                        {e.dateExpiration &&
                          new Date(e.dateExpiration) < new Date() && (
                            <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                              Expiré
                            </span>
                          )}
                      </span>
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
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="font-bold text-navy text-sm">
                Planification des maintenances
              </p>
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
                          {m.statut !== "terminé" && m.statut !== "annulé" && (
                            <button
                              title="Terminer"
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
                {maintenances.length} interventions
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
