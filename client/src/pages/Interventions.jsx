import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import InterventionCard from "../components/interventions/InterventionCard";
import KpiCard from "../components/ui/KpiCard";
import { interventionService, unitService } from "../services/api";

const FILTERS = ["Tout", "P1", "P2", "P3", "En route", "Sur place"];

// ─── Durée écoulée ────────────────────────────────────────────────────────────
function elapsed(heureAppel) {
  if (!heureAppel) return "—";
  const diff = Math.floor((Date.now() - new Date(heureAppel)) / 1000);
  const h = String(Math.floor(diff / 3600)).padStart(2, "0");
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
  const s = String(diff % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ─── Convertit intervention backend → format card ────────────────────────────
function toCardData(i) {
  const statusMap = {
    en_cours: "en-route",
    en_attente: "attente",
    terminee: "terminee",
    annulee: "annulee",
  };
  const priorityMap = { P1: 1, P2: 2, P3: 3 };
  return {
    id: i._id,
    ref: i.numero || `#${i._id.slice(-6).toUpperCase()}`,
    priority: priorityMap[i.priorite] || 3,
    type: i.typeIncident,
    address: i.adresse,
    unit: i.unitAssignee?.nom || "—",
    status: statusMap[i.statut] || i.statut,
    elapsed: elapsed(i.heureAppel),
    aiScore: i.scoreIA || 0,
    raw: i,
  };
}

// ─── Modal Nouvelle Intervention ──────────────────────────────────────────────
function ModalNouvelleIntervention({ units, onClose, onSaved }) {
  const [form, setForm] = useState({
    typeIncident: "",
    adresse: "",
    priorite: "P2",
    patient: { nom: "", age: "", etat: "conscient" },
    unitAssignee: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith("patient.")) {
      const key = name.split(".")[1];
      setForm((p) => ({ ...p, patient: { ...p.patient, [key]: value } }));
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.typeIncident || form.typeIncident === "") {
      setError("Veuillez sélectionner un type d'incident.");
      return;
    }
    if (!form.adresse) {
      setError("L'adresse est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.unitAssignee) delete payload.unitAssignee;
      const { data } = await interventionService.create(payload);
      onSaved(toCardData(data.intervention));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de la création.");
    } finally {
      setSaving(false);
    }
  };

  const inp = {
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
        {/* Header */}
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
                backgroundColor: "#FEF2F2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: "#ef4444", fontSize: "20px" }}
              >
                emergency
              </span>
            </div>
            <div>
              <h2
                style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}
              >
                Nouvelle intervention
              </h2>
              <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                Ambulances Blanc Bleu · Nice
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

            {/* Type + Priorité */}
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
                  Type d'incident *
                </label>
                <select
                  name="typeIncident"
                  value={form.typeIncident}
                  onChange={handleChange}
                  style={inp}
                  required
                >
                  <option value="">-- Choisir --</option>
                  {[
                    "Arrêt cardiaque",
                    "Accident de la route",
                    "AVC",
                    "Traumatisme grave",
                    "Détresse respiratoire",
                    "Douleur thoracique",
                    "Malaise",
                    "Chute",
                    "Brûlure",
                    "Intoxication",
                    "Accouchement",
                    "Autre",
                  ].map((t) => (
                    <option key={t}>{t}</option>
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
                  Priorité
                </label>
                <select
                  name="priorite"
                  value={form.priorite}
                  onChange={handleChange}
                  style={{
                    ...inp,
                    backgroundColor:
                      form.priorite === "P1"
                        ? "#FEF2F2"
                        : form.priorite === "P2"
                          ? "#FFFBEB"
                          : "#EFF6FF",
                    fontWeight: 600,
                  }}
                >
                  <option value="P1">P1 — Critique</option>
                  <option value="P2">P2 — Urgent</option>
                  <option value="P3">P3 — Standard</option>
                </select>
              </div>
            </div>

            {/* Adresse */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label
                style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}
              >
                Adresse *
              </label>
              <input
                name="adresse"
                value={form.adresse}
                onChange={handleChange}
                placeholder="14 Rue Victor Hugo, Nice"
                style={inp}
                required
              />
            </div>

            {/* Patient */}
            <div
              style={{
                borderRadius: "10px",
                border: "1px solid #f1f5f9",
                padding: "14px",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#64748b",
                  marginBottom: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Informations patient
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#64748b",
                    }}
                  >
                    Nom
                  </label>
                  <input
                    name="patient.nom"
                    value={form.patient.nom}
                    onChange={handleChange}
                    placeholder="Inconnu"
                    style={inp}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#64748b",
                    }}
                  >
                    Âge
                  </label>
                  <input
                    name="patient.age"
                    type="number"
                    value={form.patient.age}
                    onChange={handleChange}
                    placeholder="—"
                    style={inp}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#64748b",
                    }}
                  >
                    État
                  </label>
                  <select
                    name="patient.etat"
                    value={form.patient.etat}
                    onChange={handleChange}
                    style={inp}
                  >
                    <option value="conscient">Conscient</option>
                    <option value="inconscient">Inconscient</option>
                    <option value="critique">Critique</option>
                    <option value="stable">Stable</option>
                    <option value="inconnu">Inconnu</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Unité + Notes */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label
                style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}
              >
                Unité assignée
              </label>
              <select
                name="unitAssignee"
                value={form.unitAssignee}
                onChange={handleChange}
                style={inp}
              >
                <option value="">— Aucune unité (en attente) —</option>
                {units
                  .filter((u) => u.statut === "disponible")
                  .map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.nom} · {u.type} · Disponible
                    </option>
                  ))}
              </select>
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
                rows={2}
                placeholder="Informations complémentaires…"
                style={{ ...inp, resize: "vertical" }}
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
                  Création…
                </>
              ) : (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "16px" }}
                  >
                    add
                  </span>{" "}
                  Créer l'intervention
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Assigner une unité ─────────────────────────────────────────────────
function ModalAssignerUnite({ intervention, units, onClose, onAssigned }) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const disponibles = units.filter((u) => u.statut === "disponible");

  const handleAssign = async () => {
    if (!selected) {
      setError("Veuillez sélectionner une unité.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await interventionService.assignUnit(intervention.id, selected);
      onAssigned(intervention.id, selected);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'assignation.");
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
          maxWidth: "460px",
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
                ambulance
              </span>
            </div>
            <div>
              <h2
                style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}
              >
                Assigner une unité
              </h2>
              <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                {intervention.ref} · {intervention.type}
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

        {/* Résumé intervention */}
        <div
          style={{
            margin: "16px 24px",
            padding: "12px 16px",
            backgroundColor: "#f8fafc",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "6px",
            }}
          >
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                backgroundColor:
                  intervention.priority === 1
                    ? "#FEF2F2"
                    : intervention.priority === 2
                      ? "#FFFBEB"
                      : "#EFF6FF",
                color:
                  intervention.priority === 1
                    ? "#DC2626"
                    : intervention.priority === 2
                      ? "#D97706"
                      : "#1D6EF5",
              }}
            >
              P{intervention.priority}
            </span>
            <span
              style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}
            >
              {intervention.type}
            </span>
          </div>
          <p style={{ fontSize: "12px", color: "#64748b" }}>
            📍 {intervention.address}
          </p>
        </div>

        {/* Liste unités disponibles */}
        <div style={{ padding: "0 24px 16px" }}>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                backgroundColor: "#FEF2F2",
                border: "1px solid #FCA5A5",
                color: "#DC2626",
                fontSize: "13px",
                marginBottom: "12px",
              }}
            >
              ⚠ {error}
            </div>
          )}

          {disponibles.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px",
                color: "#94a3b8",
                fontSize: "13px",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "36px",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                no_transfer
              </span>
              Aucune unité disponible actuellement
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxHeight: "280px",
                overflowY: "auto",
              }}
            >
              {disponibles.map((u) => (
                <div
                  key={u._id}
                  onClick={() => setSelected(u._id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    transition: "all .15s",
                    border:
                      selected === u._id
                        ? "2px solid #1D6EF5"
                        : "1px solid #e2e8f0",
                    backgroundColor: selected === u._id ? "#EFF6FF" : "#fff",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      backgroundColor: "#d1fae5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "18px", color: "#065f46" }}
                    >
                      ambulance
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#0f172a",
                      }}
                    >
                      {u.nom}
                    </p>
                    <p style={{ fontSize: "12px", color: "#64748b" }}>
                      {u.type} · {u.position?.adresse || "Base principale"}
                    </p>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: "4px",
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 600,
                        backgroundColor: "#d1fae5",
                        color: "#065f46",
                      }}
                    >
                      Disponible
                    </span>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                      ⛽ {u.carburant || 0}%
                    </span>
                  </div>
                  {selected === u._id && (
                    <span
                      className="material-symbols-outlined"
                      style={{
                        color: "#1D6EF5",
                        fontSize: "20px",
                        flexShrink: 0,
                      }}
                    >
                      check_circle
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
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
            onClick={handleAssign}
            disabled={saving || !selected}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              background: saving || !selected ? "#93c5fd" : "#1D6EF5",
              border: "none",
              cursor: saving || !selected ? "not-allowed" : "pointer",
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
                Assignation…
              </>
            ) : (
              <>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "16px" }}
                >
                  check
                </span>{" "}
                Assigner
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Interventions() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("Tout");
  const [search, setSearch] = useState("");
  const [interventions, setInterventions] = useState([]);
  const [units, setUnits] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [intAAssigner, setIntAAssigner] = useState(null);
  const [tick, setTick] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [intRes, unitRes, statsRes] = await Promise.all([
        interventionService.getAll({ limit: 50 }),
        unitService.getAll(),
        interventionService.getStats(),
      ]);
      setInterventions((intRes.data.interventions || []).map(toCardData));
      setUnits(unitRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Interventions load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const iv = setInterval(loadData, 30000);
    return () => clearInterval(iv);
  }, [loadData]);

  // Tick 1s pour durées live
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Recalcul durées
  const liveInterventions = interventions.map((i) => ({
    ...i,
    elapsed: elapsed(i.raw?.heureAppel),
  }));

  // Filtres
  const filtered = liveInterventions.filter((i) => {
    const matchFilter =
      filter === "Tout"
        ? true
        : filter === "P1"
          ? i.priority === 1
          : filter === "P2"
            ? i.priority === 2
            : filter === "P3"
              ? i.priority === 3
              : filter === "En route"
                ? i.status === "en-route"
                : filter === "Sur place"
                  ? i.status === "sur-place"
                  : true;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      i.ref.toLowerCase().includes(q) ||
      i.type.toLowerCase().includes(q) ||
      i.address.toLowerCase().includes(q) ||
      i.unit.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const handleSaved = (newInt) => setInterventions((prev) => [newInt, ...prev]);

  const handleStatusChange = async (id, statut) => {
    try {
      await interventionService.updateStatus(id, statut);
      await loadData();
    } catch {
      alert("Erreur mise à jour statut.");
    }
  };

  return (
    <div className="p-7 fade-in">
      {intAAssigner && (
        <ModalAssignerUnite
          intervention={intAAssigner}
          units={units}
          onClose={() => setIntAAssigner(null)}
          onAssigned={async () => {
            await loadData();
            setIntAAssigner(null);
          }}
        />
      )}
      {showModal && (
        <ModalNouvelleIntervention
          units={units}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">
            Interventions
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestion des appels — Ambulances Blanc Bleu
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-danger text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-red-600 transition-colors shadow-lg shadow-red-200"
        >
          <span className="material-symbols-outlined text-lg">add_call</span>
          Nouvelle intervention
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        <KpiCard
          label="P1 Critique"
          value={loading ? "…" : stats?.parPriorite?.P1 || 0}
          color="danger"
        />
        <KpiCard
          label="P2 Urgent"
          value={loading ? "…" : stats?.parPriorite?.P2 || 0}
          color="warning"
        />
        <KpiCard
          label="P3 Standard"
          value={loading ? "…" : stats?.parPriorite?.P3 || 0}
          color="primary"
        />
        <KpiCard
          label="Total"
          value={loading ? "…" : stats?.total || 0}
          color="success"
        />
      </div>

      {/* Filtres + Recherche */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex gap-1 bg-surface rounded-lg p-1 border border-slate-200">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                filter === f
                  ? "bg-white text-navy shadow-sm"
                  : "text-slate-500 hover:text-navy"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 w-56">
          <span className="material-symbols-outlined text-slate-400 text-lg">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="bg-transparent text-sm outline-none w-full text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
          <div
            style={{
              width: 22,
              height: 22,
              border: "2px solid #e2e8f0",
              borderTop: "2px solid #ef4444",
              borderRadius: "50%",
              animation: "spin .7s linear infinite",
            }}
          />
          Chargement des interventions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <span className="material-symbols-outlined text-4xl block mb-2">
            search_off
          </span>
          <p className="text-sm">Aucune intervention trouvée</p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="mt-3 text-xs text-primary underline"
            >
              Effacer la recherche
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => (
            <div key={i.id} className="relative group">
              <InterventionCard data={i} onClick={() => {}} />
              {/* Actions rapides au survol */}
              <div className="absolute right-10 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-2 z-10">
                <button
                  onClick={() =>
                    navigate(`/carte?unitId=${i.raw?.unitAssignee?._id || ""}`)
                  }
                  title="Voir sur la carte"
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-slate-400 text-sm hover:text-primary">
                    location_on
                  </span>
                </button>
                {i.status === "en-route" && (
                  <button
                    onClick={() => handleStatusChange(i.id, "terminee")}
                    title="Marquer terminée"
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-green-50 hover:border-green-400 shadow-sm transition-all"
                  >
                    <span className="material-symbols-outlined text-slate-400 text-sm hover:text-green-500">
                      check_circle
                    </span>
                  </button>
                )}
                {i.status === "attente" && (
                  <button
                    onClick={() => setIntAAssigner(i)}
                    title="Assigner une unité"
                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-yellow-50 hover:border-yellow-400 shadow-sm transition-all"
                  >
                    <span className="material-symbols-outlined text-slate-400 text-sm hover:text-yellow-500">
                      ambulance
                    </span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
