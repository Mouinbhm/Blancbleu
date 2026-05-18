import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { patientService } from "../services/api";
import StatutBadge from "../components/transport/StatutBadge";
import ModalNouvellePrescription from "../components/prescription/ModalPrescription";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDatetime = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtEuro = (n) =>
  n != null ? `${Number(n).toFixed(2)} €` : "—";

const MOBILITE_LABEL = { ASSIS: "Assis", FAUTEUIL_ROULANT: "Fauteuil roulant", ALLONGE: "Allongé", CIVIERE: "Civière" };

const TABS = [
  { id: "info",          label: "Informations",  icon: "person"          },
  { id: "transports",    label: "Transports",    icon: "directions_car"  },
  { id: "prescriptions", label: "Prescriptions", icon: "description"     },
  { id: "factures",      label: "Factures",      icon: "receipt_long"    },
  { id: "consentements", label: "Consentements", icon: "verified_user"   },
  { id: "rgpd",          label: "RGPD",          icon: "shield"          },
  { id: "audit",         label: "Audit",         icon: "history"         },
];

const Spinner = () => (
  <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
    <div style={{ width: 22, height: 22, border: "2px solid #e2e8f0", borderTop: "2px solid #1D6EF5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    Chargement…
  </div>
);

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 w-40 flex-shrink-0">{label}</span>
      <span className="text-sm text-navy font-medium text-right">{value || "—"}</span>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary text-base">{icon}</span>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  const colors = {
    success: "bg-green-100 text-green-800 border-green-200",
    error:   "bg-red-100 text-red-800 border-red-200",
    warning: "bg-amber-100 text-amber-800 border-amber-200",
  };
  return (
    <div className={`fixed top-4 right-4 z-50 border rounded-xl px-4 py-3 text-sm font-semibold shadow-lg max-w-sm ${colors[type] || colors.success}`}>
      {msg}
      <button onClick={onClose} className="ml-3 opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}

// ── Onglet Informations ────────────────────────────────────────────────────────
function TabInfo({ patient }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionCard title="Identité" icon="badge">
        <InfoRow label="Numéro patient"  value={patient.numeroPatient} />
        <InfoRow label="Nom complet"     value={`${patient.nom || ""} ${patient.prenom || ""}`.trim()} />
        <InfoRow label="Date de naissance" value={fmtDate(patient.dateNaissance)} />
        <InfoRow label="Genre"           value={{ M: "Masculin", F: "Féminin", autre: "Autre" }[patient.genre]} />
        <InfoRow label="Mobilité"        value={MOBILITE_LABEL[patient.mobilite]} />
      </SectionCard>

      <SectionCard title="Contact" icon="contact_phone">
        <InfoRow label="Téléphone"  value={patient.telephone} />
        <InfoRow label="Email"      value={patient.email} />
        <InfoRow label="Adresse"    value={
          patient.adresse
            ? [patient.adresse.rue, patient.adresse.codePostal, patient.adresse.ville].filter(Boolean).join(", ")
            : null
        } />
      </SectionCard>

      <SectionCard title="Informations médicales" icon="local_hospital">
        <InfoRow label="N° Sécurité sociale" value={patient.numeroSecu} />
        <InfoRow label="Caisse"              value={patient.caisse} />
        <InfoRow label="Exonération (ALD)"   value={patient.exoneration ? "Oui" : "Non"} />
        <InfoRow label="Mutuelle"            value={patient.mutuelle} />
        {patient.antecedents && patient.antecedents !== "*** confidentiel ***" && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-1">Antécédents</p>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2">{patient.antecedents}</p>
          </div>
        )}
        {patient.allergies && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-1">Allergies</p>
            <p className="text-sm text-red-700 bg-red-50 rounded-lg p-2">{patient.allergies}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Besoins spécifiques" icon="accessible">
        <InfoRow label="Oxygène"       value={patient.oxygene      ? "✓ Requis" : "Non"} />
        <InfoRow label="Brancardage"   value={patient.brancardage  ? "✓ Requis" : "Non"} />
        <InfoRow label="Accompagnateur" value={patient.accompagnateur ? "✓ Requis" : "Non"} />
        {patient.contactUrgence?.nom && (
          <>
            <div className="mt-3 mb-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Contact d'urgence</p>
            </div>
            <InfoRow label="Nom"       value={patient.contactUrgence.nom} />
            <InfoRow label="Téléphone" value={patient.contactUrgence.telephone} />
            <InfoRow label="Lien"      value={patient.contactUrgence.lien} />
          </>
        )}
      </SectionCard>
    </div>
  );
}

// ── Onglet Transports ─────────────────────────────────────────────────────────
function TabTransports({ transports, patientId }) {
  const navigate = useNavigate();
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{transports.length} transport(s)</p>
        <button
          onClick={() => navigate(`/transports/new?patientId=${patientId}`)}
          className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouveau transport
        </button>
      </div>
      {transports.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400 text-sm">Aucun transport enregistré</div>
      ) : (
        <div className="space-y-2">
          {transports.map((t) => (
            <div key={t._id}
              onClick={() => navigate(`/transports/${t._id}`)}
              className="bg-white rounded-xl border border-slate-100 p-4 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-bold text-navy">{t.numero}</p>
                <p className="text-xs text-slate-500">{t.motif} · {fmtDate(t.dateTransport)} {t.heureRDV || ""}</p>
                {t.adresseDestination?.ville && (
                  <p className="text-xs text-slate-400 mt-0.5">→ {t.adresseDestination.ville}</p>
                )}
              </div>
              <StatutBadge statut={t.statut} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Onglet Prescriptions ──────────────────────────────────────────────────────
function TabPrescriptions({ prescriptions, patient, patientId, onRefresh }) {
  const [showModal, setShowModal] = useState(false);

  const STATUT_COLOR = {
    active:                "bg-green-100 text-green-700",
    en_attente_validation: "bg-amber-100 text-amber-700",
    incomplet:             "bg-orange-100 text-orange-700",
    expiree:               "bg-slate-100 text-slate-500",
    annulee:               "bg-red-100 text-red-600",
    // legacy
    en_attente: "bg-yellow-100 text-yellow-700",
    validee:    "bg-green-100 text-green-700",
    incomplete: "bg-red-100 text-red-700",
  };

  const STATUT_LABEL = {
    active:                "Active",
    en_attente_validation: "À valider",
    incomplet:             "Incomplet",
    expiree:               "Expirée",
    annulee:               "Annulée",
    en_attente:            "En attente",
    validee:               "Validée",
    incomplete:            "Incomplet",
  };

  return (
    <div>
      {showModal && (
        <ModalNouvellePrescription
          patientPreset={{ _id: patientId, nom: patient?.nom || "", prenom: patient?.prenom || "", numeroPatient: patient?.numeroPatient || "" }}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); onRefresh(); }}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{prescriptions.length} prescription(s)</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouvelle prescription
        </button>
      </div>

      {prescriptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400 text-sm">
          Aucune prescription
        </div>
      ) : (
        <div className="space-y-2">
          {prescriptions.map((p) => (
            <div key={p._id} className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-navy">{p.numero || "Sans numéro"}</p>
                  <p className="text-xs text-slate-500">{p.motif} · {fmtDate(p.dateEmission)}</p>
                  {p.medecin?.nom && <p className="text-xs text-slate-400">Dr {p.medecin.nom}</p>}
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUT_COLOR[p.statut] || "bg-slate-100 text-slate-500"}`}>
                  {STATUT_LABEL[p.statut] || p.statut}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Onglet Factures ───────────────────────────────────────────────────────────
function TabFactures({ factures }) {
  const STATUT_COLOR = {
    brouillon:  "bg-slate-100 text-slate-600",
    emise:      "bg-blue-100 text-blue-700",
    en_attente: "bg-yellow-100 text-yellow-700",
    payee:      "bg-green-100 text-green-700",
    annulee:    "bg-red-100 text-red-600",
  };
  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">{factures.length} facture(s)</p>
      {factures.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 p-12 text-center text-slate-400 text-sm">Aucune facture</div>
      ) : (
        <div className="space-y-2">
          {factures.map((f) => (
            <div key={f._id} className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-navy">{f.numero}</p>
                  <p className="text-xs text-slate-500">Émise le {fmtDate(f.dateEmission)}</p>
                  {f.datePaiement && <p className="text-xs text-green-600">Payée le {fmtDate(f.datePaiement)}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-navy font-mono">{fmtEuro(f.montantTotal)}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUT_COLOR[f.statut] || "bg-slate-100 text-slate-500"}`}>
                    {f.statut}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Onglet Consentements ──────────────────────────────────────────────────────
function TabConsentements({ patientId, consentements, onRefresh, showToast }) {
  const [saving, setSaving] = useState(false);

  const gdpr = consentements?.gdpr || {};
  const history = consentements?.consentHistory || [];

  const toggle = async (consentType, current) => {
    setSaving(true);
    try {
      await patientService.updateConsent(patientId, {
        consentType,
        accepted: !current,
        version:  "1.0",
        source:   "web",
      });
      showToast("Consentement enregistré", "success");
      onRefresh();
    } catch {
      showToast("Erreur lors de la mise à jour du consentement", "error");
    } finally {
      setSaving(false);
    }
  };

  const CONSENTS = [
    { key: "data_processing", label: "Traitement des données personnelles", value: gdpr.consentGiven,       icon: "data_usage" },
    { key: "medical",         label: "Données médicales et de santé",       value: gdpr.medicalDataConsent, icon: "health_and_safety" },
    { key: "marketing",       label: "Communication et informations",        value: gdpr.marketingConsent,   icon: "mail" },
  ];

  return (
    <div className="space-y-4">
      <SectionCard title="État actuel des consentements" icon="verified_user">
        <div className="space-y-3">
          {CONSENTS.map((c) => (
            <div key={c.key} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-400 text-base">{c.icon}</span>
                <div>
                  <p className="text-sm font-medium text-navy">{c.label}</p>
                  {c.key === "data_processing" && gdpr.consentDate && (
                    <p className="text-xs text-slate-400">Accepté le {fmtDate(gdpr.consentDate)} · version {gdpr.consentVersion || "—"}</p>
                  )}
                </div>
              </div>
              <button
                disabled={saving}
                onClick={() => toggle(c.key, c.value)}
                className={`relative w-11 h-6 rounded-full transition-colors ${c.value ? "bg-green-500" : "bg-slate-200"} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${c.value ? "left-5.5" : "left-0.5"}`} style={{ left: c.value ? 22 : 2 }} />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {history.length > 0 && (
        <SectionCard title="Historique des consentements" icon="history">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${h.accepted ? "bg-green-500" : "bg-red-400"}`} />
                <div>
                  <p className="text-xs font-semibold text-navy">
                    {h.consentType} — {h.accepted ? "Accepté" : "Refusé"}
                  </p>
                  <p className="text-[10px] text-slate-400">{fmtDatetime(h.changedAt)} · version {h.version || "—"} · {h.source || "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Onglet RGPD ───────────────────────────────────────────────────────────────
function TabRgpd({ patient, patientId, onRefresh, showToast, userRole }) {
  const [confirmAnon,    setConfirmAnon]    = useState(false);
  const [confirmDel,     setConfirmDel]     = useState(false);
  const [reason,         setReason]         = useState("");
  const [loading,        setLoading]        = useState("");

  const gdpr = patient?.gdpr || {};

  const handleExport = async () => {
    setLoading("export");
    try {
      const { data } = await patientService.exportData(patientId);
      const url  = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `patient-data-${patientId}-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("Export généré avec succès", "success");
    } catch {
      showToast("Erreur lors de l'export des données", "error");
    } finally {
      setLoading("");
    }
  };

  const handleAnonymize = async () => {
    setLoading("anonymize");
    try {
      await patientService.anonymize(patientId, reason);
      showToast("Patient anonymisé. Les données de transport et facturation ont été conservées pour raisons légales.", "success");
      setConfirmAnon(false);
      onRefresh();
    } catch (err) {
      showToast(err.response?.data?.message || "Erreur lors de l'anonymisation", "error");
    } finally {
      setLoading("");
    }
  };

  const handleRequestDeletion = async () => {
    setLoading("deletion");
    try {
      await patientService.requestDeletion(patientId, reason);
      showToast("Demande de suppression enregistrée", "success");
      setConfirmDel(false);
      onRefresh();
    } catch (err) {
      showToast(err.response?.data?.message || "Erreur", "error");
    } finally {
      setLoading("");
    }
  };

  const handleCancelDeletion = async () => {
    setLoading("cancel");
    try {
      await patientService.cancelDeletion(patientId);
      showToast("Demande de suppression annulée", "success");
      onRefresh();
    } catch {
      showToast("Erreur lors de l'annulation", "error");
    } finally {
      setLoading("");
    }
  };

  const isAdmin = ["admin", "superviseur"].includes(userRole);

  return (
    <div className="space-y-4">
      {/* Statut RGPD */}
      <SectionCard title="Statut RGPD" icon="shield">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Anonymisé",            value: gdpr.anonymized,        color: gdpr.anonymized ? "text-red-600" : "text-green-600", date: gdpr.anonymizedAt },
            { label: "Suppression demandée", value: gdpr.deletionRequested, color: gdpr.deletionRequested ? "text-amber-600" : "text-green-600", date: gdpr.deletionRequestedAt },
            { label: "Consentement donné",   value: gdpr.consentGiven,      color: gdpr.consentGiven ? "text-green-600" : "text-slate-400",    date: gdpr.consentDate },
            { label: "Données médicales",    value: gdpr.medicalDataConsent, color: gdpr.medicalDataConsent ? "text-green-600" : "text-slate-400", date: null },
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-sm font-bold mt-1 ${s.color}`}>{s.value ? "Oui" : "Non"}</p>
              {s.date && <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(s.date)}</p>}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Actions RGPD */}
      <SectionCard title="Actions RGPD" icon="manage_accounts">
        <div className="space-y-3">

          {/* Export */}
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div>
              <p className="text-sm font-semibold text-navy">Exporter les données (Art. 20)</p>
              <p className="text-xs text-slate-400">Télécharger le dossier complet en JSON</p>
            </div>
            <button
              onClick={handleExport}
              disabled={loading === "export" || !isAdmin}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <span className="material-symbols-outlined text-base">download</span>
              {loading === "export" ? "…" : "Exporter"}
            </button>
          </div>

          {/* Demande suppression */}
          {!gdpr.deletionRequested && !gdpr.anonymized && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-navy">Demander la suppression (Art. 17)</p>
                <p className="text-xs text-slate-400">Enregistre une demande à traiter sous 30 jours</p>
              </div>
              <button
                onClick={() => setConfirmDel(true)}
                disabled={loading === "deletion"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors"
              >
                <span className="material-symbols-outlined text-base">delete_forever</span>
                Demander
              </button>
            </div>
          )}

          {/* Annuler suppression */}
          {gdpr.deletionRequested && isAdmin && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-navy">Annuler la demande de suppression</p>
                <p className="text-xs text-slate-400">Demandée le {fmtDate(gdpr.deletionRequestedAt)}</p>
              </div>
              <button
                onClick={handleCancelDeletion}
                disabled={loading === "cancel"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <span className="material-symbols-outlined text-base">undo</span>
                {loading === "cancel" ? "…" : "Annuler"}
              </button>
            </div>
          )}

          {/* Anonymiser */}
          {!gdpr.anonymized && isAdmin && (
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-semibold text-red-700">Anonymiser le patient</p>
                <p className="text-xs text-slate-400">Action irréversible — données de transport conservées</p>
              </div>
              <button
                onClick={() => setConfirmAnon(true)}
                disabled={loading === "anonymize"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                <span className="material-symbols-outlined text-base">person_off</span>
                Anonymiser
              </button>
            </div>
          )}

          {gdpr.anonymized && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-red-500">person_off</span>
              <div>
                <p className="text-sm font-bold text-red-700">Patient anonymisé</p>
                <p className="text-xs text-red-500">Le {fmtDate(gdpr.anonymizedAt)} — les transports et factures sont conservés.</p>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Modal confirmation anonymisation */}
      {confirmAnon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600">warning</span>
              </div>
              <h3 className="font-bold text-navy text-base">Confirmer l'anonymisation</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Cette action anonymisera les données personnelles du patient. Les transports et factures resteront
              conservés pour raisons légales et statistiques. <strong>Cette action est irréversible.</strong>
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Raison de l'anonymisation (obligatoire)"
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-4 outline-none focus:border-primary resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setConfirmAnon(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">Annuler</button>
              <button
                onClick={handleAnonymize}
                disabled={!reason.trim() || loading === "anonymize"}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {loading === "anonymize" ? "Anonymisation…" : "Confirmer l'anonymisation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation demande suppression */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-navy text-base mb-3">Demande de suppression (Art. 17)</h3>
            <p className="text-sm text-slate-600 mb-4">
              Une demande de suppression sera enregistrée. Elle sera traitée sous 30 jours selon les obligations RGPD.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motif de la demande"
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-4 outline-none focus:border-primary resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">Annuler</button>
              <button
                onClick={handleRequestDeletion}
                disabled={loading === "deletion"}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50"
              >
                {loading === "deletion" ? "…" : "Confirmer la demande"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Audit ──────────────────────────────────────────────────────────────
function TabAudit({ patientId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur,  setErreur]  = useState("");

  useEffect(() => {
    patientService.getAuditSummary(patientId)
      .then(({ data }) => setSummary(data))
      .catch(() => setErreur("Accès refusé ou données indisponibles"))
      .finally(() => setLoading(false));
  }, [patientId]);

  const ACTION_ICON = {
    PATIENT_VIEWED:              { icon: "visibility",   color: "text-blue-500"   },
    PATIENT_EXPORTED:            { icon: "download",     color: "text-purple-500" },
    PATIENT_ANONYMIZED:          { icon: "person_off",   color: "text-red-500"    },
    PATIENT_DELETION_REQUESTED:  { icon: "delete",       color: "text-amber-500"  },
    PATIENT_DELETION_CANCELLED:  { icon: "undo",         color: "text-green-500"  },
    PATIENT_CONSENT_UPDATED:     { icon: "verified_user",color: "text-teal-500"   },
    PATIENT_UPDATED:             { icon: "edit",         color: "text-slate-500"  },
  };

  if (loading) return <Spinner />;
  if (erreur)  return <div className="text-center py-12 text-slate-400 text-sm">{erreur}</div>;

  return (
    <div className="space-y-4">
      {summary?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(summary.stats).map(([action, count]) => (
            <div key={action} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
              <p className="text-xl font-bold text-navy font-mono">{count}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">
                {action.replace(/_/g, " ").replace("PATIENT ", "")}
              </p>
            </div>
          ))}
        </div>
      )}

      <SectionCard title={`Journal d'audit (${summary?.total || 0} entrées)`} icon="history">
        {!summary?.logs?.length ? (
          <p className="text-slate-400 text-sm text-center py-4">Aucune entrée d'audit</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {summary.logs.map((l) => {
              const cfg = ACTION_ICON[l.action] || { icon: "info", color: "text-slate-400" };
              return (
                <div key={l._id} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
                  <span className={`material-symbols-outlined text-base flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-navy">{l.action.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-slate-400 flex-shrink-0">{fmtDatetime(l.createdAt)}</p>
                    </div>
                    <p className="text-[10px] text-slate-500">{l.utilisateur?.email} · {l.utilisateur?.role}</p>
                    {l.details?.message && <p className="text-[10px] text-slate-400 italic">{l.details.message}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur,  setErreur]  = useState("");
  const [tab,     setTab]     = useState("info");
  const [toast,   setToast]   = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErreur("");
    try {
      const { data: res } = await patientService.getFullProfile(id);
      setData(res);
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors du chargement du dossier patient");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="p-7">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <Spinner />
    </div>
  );

  if (erreur) return (
    <div className="p-7">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <span className="material-symbols-outlined text-red-400 text-4xl">error</span>
        <p className="text-red-700 font-semibold mt-2">{erreur}</p>
        <button onClick={() => navigate("/patients")} className="mt-4 text-sm text-primary hover:underline">← Retour à la liste</button>
      </div>
    </div>
  );

  const patient = data?.patient;
  const gdpr    = patient?.gdpr || {};

  return (
    <div className="p-7 fade-in">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* En-tête */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/patients")} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-lg">
            {(patient?.nom?.[0] || "?").toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-brand font-bold text-navy text-xl">
                {patient?.nom} {patient?.prenom}
              </h1>
              {gdpr.anonymized && (
                <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">ANONYMISÉ</span>
              )}
              {gdpr.deletionRequested && (
                <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">SUPPRESSION DEMANDÉE</span>
              )}
            </div>
            <p className="text-slate-400 text-sm mt-0.5">
              {patient?.numeroPatient} · {MOBILITE_LABEL[patient?.mobilite] || patient?.mobilite}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/transports/new?patientId=${id}`)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouveau transport
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
              tab === t.id
                ? "bg-white text-primary shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === "info"          && <TabInfo          patient={patient} />}
      {tab === "transports"    && <TabTransports    transports={data?.transports || []}    patientId={id} />}
      {tab === "prescriptions" && <TabPrescriptions prescriptions={data?.prescriptions || []} patient={patient} patientId={id} onRefresh={load} />}
      {tab === "factures"      && <TabFactures      factures={data?.factures || []} />}
      {tab === "consentements" && <TabConsentements patientId={id} consentements={data?.consentements} onRefresh={load} showToast={showToast} />}
      {tab === "rgpd"          && <TabRgpd          patient={patient} patientId={id} onRefresh={load} showToast={showToast} userRole={data?.patient ? "admin" : ""} />}
      {tab === "audit"         && <TabAudit         patientId={id} />}
    </div>
  );
}
