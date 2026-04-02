import { useState, useEffect } from "react";
import { unitService } from "../services/api";
import StatusBadge from "../components/ui/StatusBadge";

const TABS = ["Ambulances", "Personnel", "Équipements", "Maintenance"];

const PERSONNEL = [
  {
    id: "P-01",
    nom: "Durand Paul",
    role: "Ambulancier",
    unite: "AMB-01",
    statut: "en-service",
    tel: "06 12 34 56 78",
  },
  {
    id: "P-02",
    nom: "Leroy Claire",
    role: "Secouriste",
    unite: "AMB-01",
    statut: "en-service",
    tel: "06 23 45 67 89",
  },
  {
    id: "P-03",
    nom: "Moreau Dr Jean",
    role: "Médecin",
    unite: "AMB-03",
    statut: "en-service",
    tel: "06 34 56 78 90",
  },
  {
    id: "P-04",
    nom: "Petit Marc",
    role: "Infirmier",
    unite: "AMB-03",
    statut: "en-service",
    tel: "06 45 67 89 01",
  },
  {
    id: "P-05",
    nom: "Simon Antoine",
    role: "Ambulancier",
    unite: "AMB-05",
    statut: "conge",
    tel: "06 56 78 90 12",
  },
  {
    id: "P-06",
    nom: "Laurent Eva",
    role: "Secouriste",
    unite: "AMB-07",
    statut: "en-service",
    tel: "06 67 89 01 23",
  },
  {
    id: "P-07",
    nom: "Blanc Thomas",
    role: "Ambulancier",
    unite: "AMB-09",
    statut: "formation",
    tel: "06 78 90 12 34",
  },
  {
    id: "P-08",
    nom: "Martin Sophie",
    role: "Infirmier",
    unite: "AMB-11",
    statut: "en-service",
    tel: "06 89 01 23 45",
  },
];

const EQUIPEMENTS = [
  {
    id: "EQ-01",
    nom: "Défibrillateur ZOLL",
    unite: "AMB-01",
    etat: "opérationnel",
    dernierCheck: "01/04/2026",
    expiration: "01/04/2027",
  },
  {
    id: "EQ-02",
    nom: "Civière pliable",
    unite: "AMB-01",
    etat: "opérationnel",
    dernierCheck: "01/04/2026",
    expiration: "01/04/2028",
  },
  {
    id: "EQ-03",
    nom: "Oxymètre de pouls",
    unite: "AMB-03",
    etat: "opérationnel",
    dernierCheck: "28/03/2026",
    expiration: "28/03/2027",
  },
  {
    id: "EQ-04",
    nom: "Tensiomètre automatique",
    unite: "AMB-03",
    etat: "à-vérifier",
    dernierCheck: "15/02/2026",
    expiration: "15/02/2027",
  },
  {
    id: "EQ-05",
    nom: "Bouteille O₂ 15L",
    unite: "AMB-05",
    etat: "opérationnel",
    dernierCheck: "30/03/2026",
    expiration: "30/09/2026",
  },
  {
    id: "EQ-06",
    nom: "Kit trauma avancé",
    unite: "AMB-07",
    etat: "opérationnel",
    dernierCheck: "25/03/2026",
    expiration: "25/03/2027",
  },
  {
    id: "EQ-07",
    nom: "Moniteur cardiaque",
    unite: "AMB-09",
    etat: "en-panne",
    dernierCheck: "10/03/2026",
    expiration: "10/03/2027",
  },
  {
    id: "EQ-08",
    nom: "Aspirateur de mucosités",
    unite: "AMB-11",
    etat: "opérationnel",
    dernierCheck: "02/04/2026",
    expiration: "02/04/2027",
  },
];

const MAINTENANCE = [
  {
    id: "AMB-15",
    modele: "Mercedes Sprinter 4x4",
    type: "Révision complète",
    statut: "en-cours",
    debut: "28/03/2026",
    fin: "05/04/2026",
    garage: "Garage Azur Nice",
    km: "71 200",
  },
  {
    id: "AMB-02",
    modele: "Renault Master III",
    type: "Changement freins",
    statut: "planifié",
    debut: "06/04/2026",
    fin: "07/04/2026",
    garage: "Garage Azur Nice",
    km: "52 100",
  },
  {
    id: "AMB-08",
    modele: "Ford Transit Custom",
    type: "Contrôle technique",
    statut: "planifié",
    debut: "10/04/2026",
    fin: "10/04/2026",
    garage: "Contrôle Auto 06",
    km: "43 800",
  },
  {
    id: "AMB-04",
    modele: "Mercedes Sprinter",
    type: "Vidange + filtres",
    statut: "terminé",
    debut: "20/03/2026",
    fin: "20/03/2026",
    garage: "Garage Central Nice",
    km: "68 400",
  },
];

export default function Flotte() {
  const [tab, setTab] = useState("Ambulances");
  const [filter, setFilter] = useState("Tous");
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Charger les unités depuis le backend ──────────────────────────────────
  useEffect(() => {
    if (tab !== "Ambulances") return;
    setLoading(true);
    unitService
      .getAll()
      .then(({ data }) => {
        setUnits(data);
        setError(null);
      })
      .catch(() => setError("Impossible de charger les unités."))
      .finally(() => setLoading(false));
  }, [tab]);

  // ── Filtrer les ambulances ────────────────────────────────────────────────
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

  // ── KPIs dynamiques ──────────────────────────────────────────────────────
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

  // ── Actions unité ────────────────────────────────────────────────────────
  const handleChangeStatus = async (unitId, newStatut) => {
    try {
      await unitService.updateStatus(unitId, newStatut);
      setUnits((prev) =>
        prev.map((u) => (u._id === unitId ? { ...u, statut: newStatut } : u)),
      );
    } catch {
      alert("Erreur lors de la mise à jour du statut.");
    }
  };

  return (
    <div className="p-7 fade-in">
      {/* ── Header ── */}
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
          <span className="material-symbols-outlined text-lg">add</span>
          Nouvelle Unité
        </button>
      </div>

      {/* ── KPIs ── */}
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

      {/* ── TABS ── */}
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

      {/* ════════════════════════════════════════════════════
          ONGLET 1 — AMBULANCES
      ════════════════════════════════════════════════════ */}
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
                Chargement des unités…
              </div>
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
                      "Modèle",
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
                          className={`px-2 py-1 rounded-full text-xs font-bold ${
                            u.statut === "disponible"
                              ? "bg-emerald-100 text-emerald-700"
                              : u.statut === "en_mission"
                                ? "bg-blue-100 text-blue-700"
                                : u.statut === "maintenance"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                          }`}
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
                                handleChangeStatus(u._id, "maintenance")
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
                                handleChangeStatus(u._id, "disponible")
                              }
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-green-50 hover:border-green-400 transition-all group"
                            >
                              <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-green-500">
                                check_circle
                              </span>
                            </button>
                          ) : (
                            <button
                              title="Maintenance"
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center opacity-40 cursor-not-allowed"
                            >
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

      {/* ════════════════════════════════════════════════════
          ONGLET 2 — PERSONNEL
      ════════════════════════════════════════════════════ */}
      {tab === "Personnel" && (
        <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-bold text-navy text-sm">
              {PERSONNEL.length} membres du personnel
            </p>
            <button className="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors">
              <span className="material-symbols-outlined text-sm">
                person_add
              </span>
              Ajouter
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-navy">
                {[
                  "ID",
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
              {PERSONNEL.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                >
                  <td className="px-5 py-4 font-mono text-xs text-slate-400">
                    {p.id}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {p.nom
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <span className="font-semibold text-navy text-sm">
                        {p.nom}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold ${
                        p.role === "Médecin"
                          ? "bg-purple-100 text-purple-700"
                          : p.role === "Infirmier"
                            ? "bg-blue-100 text-blue-700"
                            : p.role === "Ambulancier"
                              ? "bg-teal-100 text-teal-700"
                              : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {p.role}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono font-bold text-navy text-sm">
                    {p.unite}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold ${
                        p.statut === "en-service"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.statut === "conge"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {p.statut === "en-service"
                        ? "En service"
                        : p.statut === "conge"
                          ? "Congé"
                          : "Formation"}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-slate-500">
                    {p.tel}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      <button
                        title="Voir fiche"
                        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                      >
                        <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                          visibility
                        </span>
                      </button>
                      <button
                        title="Modifier"
                        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                      >
                        <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                          edit
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {PERSONNEL.length} membres —{" "}
              {PERSONNEL.filter((p) => p.statut === "en-service").length} en
              service
            </span>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          ONGLET 3 — ÉQUIPEMENTS
      ════════════════════════════════════════════════════ */}
      {tab === "Équipements" && (
        <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-bold text-navy text-sm">
              {EQUIPEMENTS.length} équipements médicaux
            </p>
            <div className="flex gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                {EQUIPEMENTS.filter((e) => e.etat === "en-panne").length} en
                panne
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                {EQUIPEMENTS.filter((e) => e.etat === "à-vérifier").length} à
                vérifier
              </span>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-navy">
                {[
                  "ID",
                  "Équipement",
                  "Unité",
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
              {EQUIPEMENTS.map((e, i) => (
                <tr
                  key={e.id}
                  className={`border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                >
                  <td className="px-5 py-4 font-mono text-xs text-slate-400">
                    {e.id}
                  </td>
                  <td className="px-5 py-4 font-semibold text-navy text-sm">
                    {e.nom}
                  </td>
                  <td className="px-5 py-4 font-mono font-bold text-primary text-sm">
                    {e.unite}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold ${
                        e.etat === "opérationnel"
                          ? "bg-emerald-100 text-emerald-700"
                          : e.etat === "à-vérifier"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {e.etat === "opérationnel"
                        ? "Opérationnel"
                        : e.etat === "à-vérifier"
                          ? "À vérifier"
                          : "En panne"}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-slate-500">
                    {e.dernierCheck}
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-slate-500">
                    {e.expiration}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      <button
                        title="Contrôler"
                        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:border-primary transition-all group"
                      >
                        <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary">
                          fact_check
                        </span>
                      </button>
                      <button
                        title="Signaler panne"
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
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {EQUIPEMENTS.length} équipements ·{" "}
              {EQUIPEMENTS.filter((e) => e.etat === "opérationnel").length}{" "}
              opérationnels
            </span>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          ONGLET 4 — MAINTENANCE
      ════════════════════════════════════════════════════ */}
      {tab === "Maintenance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-2">
            {[
              {
                l: "En cours",
                v: MAINTENANCE.filter((m) => m.statut === "en-cours").length,
                color: "bg-blue-100 text-blue-700",
              },
              {
                l: "Planifiés",
                v: MAINTENANCE.filter((m) => m.statut === "planifié").length,
                color: "bg-yellow-100 text-yellow-700",
              },
              {
                l: "Terminés",
                v: MAINTENANCE.filter((m) => m.statut === "terminé").length,
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
            <table className="w-full">
              <thead>
                <tr className="bg-navy">
                  {[
                    "Unité",
                    "Modèle",
                    "Type",
                    "Statut",
                    "Début",
                    "Fin prévue",
                    "Garage",
                    "KM",
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
                {MAINTENANCE.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-b border-slate-100 hover:bg-blue-50 transition-all ${i % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                  >
                    <td className="px-4 py-4 font-mono font-bold text-navy text-sm">
                      {m.id}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      {m.modele}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {m.type}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          m.statut === "en-cours"
                            ? "bg-blue-100 text-blue-700"
                            : m.statut === "planifié"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {m.statut === "en-cours"
                          ? "En cours"
                          : m.statut === "planifié"
                            ? "Planifié"
                            : "Terminé"}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono text-sm text-slate-500">
                      {m.debut}
                    </td>
                    <td className="px-4 py-4 font-mono text-sm text-slate-500">
                      {m.fin}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {m.garage}
                    </td>
                    <td className="px-4 py-4 font-mono text-sm text-slate-500">
                      {m.km}
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
                        {m.statut !== "terminé" && (
                          <button
                            title="Marquer terminé"
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
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                {MAINTENANCE.length} interventions de maintenance
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Insight ── */}
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
