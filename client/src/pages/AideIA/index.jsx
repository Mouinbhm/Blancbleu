/**
 * BlancBleu — Page Aide IA v4.0
 * Transport sanitaire NON urgent
 *
 * Orchestrateur léger : statut du service IA, onglets, et rendu du module actif.
 * 4 modules :
 *   1. Dispatch IA     — recommandation véhicule pour un transport
 *   2. Extraction PMT  — OCR Prescription Médicale de Transport
 *   3. Optimisation    — tournée journalière OR-Tools
 *   4. Prédiction durée — XGBoost
 */
import { useState, useEffect } from "react";
import { aiService } from "../../services/api";
import { ServiceBadge, TabBtn } from "./components";
import ModuleDispatch from "./ModuleDispatch";
import ModulePMT from "./ModulePMT";
import ModuleRouting from "./ModuleRouting";
import ModuleDuration, { DurationHonestyWrapper, SectionPedagogique } from "./ModuleDuration";

// ════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════
export default function AideIA() {
  const [tab, setTab] = useState("dispatch");
  const [aiStatus, setAiStatus] = useState(null);

  useEffect(() => {
    aiService
      .getStatus()
      .then(({ data }) => setAiStatus(data))
      .catch(() => setAiStatus({ available: false, modules: {} }));
  }, []);

  return (
    <div className="p-7 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand font-bold text-2xl text-navy">Aide IA — Optimisation</h1>
          <p className="text-slate-500 text-sm mt-1">
            Dispatch intelligent · Extraction PMT · Optimisation de tournée · Prédiction durée
            XGBoost
          </p>
        </div>
        <ServiceBadge status={aiStatus} />
      </div>

      {/* Modules du service */}
      {aiStatus?.modules && (
        <div className="flex gap-3 mb-6 flex-wrap">
          {[
            { key: "pmt_ocr", label: "OCR Tesseract", icon: "document_scanner" },
            { key: "pmt_nlp", label: "NLP spaCy", icon: "psychology" },
            { key: "dispatch", label: "Smart Dispatch", icon: "local_shipping" },
            { key: "routing", label: "OR-Tools VRP", icon: "route" },
            { key: "duration_predictor", label: "XGBoost Durée", icon: "timer" },
            { key: "realtime_optimizer", label: "Optimiseur TR", icon: "speed" },
          ].map(({ key, label, icon }) => (
            <div
              key={key}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                aiStatus.modules[key]
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-400 border-slate-200"
              }`}
            >
              <span className="material-symbols-outlined text-sm">{icon}</span>
              {label}
              <span>{aiStatus.modules[key] ? "✓" : "—"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 mb-6 bg-slate-100 p-1.5 rounded-2xl w-fit">
        <TabBtn
          active={tab === "dispatch"}
          onClick={() => setTab("dispatch")}
          icon="local_shipping"
          label="Dispatch IA"
        />
        <TabBtn
          active={tab === "pmt"}
          onClick={() => setTab("pmt")}
          icon="clinical_notes"
          label="Extraction PMT"
        />
        <TabBtn
          active={tab === "routing"}
          onClick={() => setTab("routing")}
          icon="route"
          label="Optimisation tournée"
        />
        <TabBtn
          active={tab === "duration"}
          onClick={() => setTab("duration")}
          icon="timer"
          label="Prédiction durée"
        />
      </div>

      {/* Contenu */}
      {tab === "dispatch" && (
        <>
          <ModuleDispatch aiStatus={aiStatus} />
          <SectionPedagogique />
        </>
      )}
      {tab === "pmt" && <ModulePMT aiStatus={aiStatus} />}
      {tab === "routing" && <ModuleRouting aiStatus={aiStatus} />}
      {tab === "duration" && (
        <>
          <DurationHonestyWrapper />
          <ModuleDuration />
        </>
      )}
    </div>
  );
}
