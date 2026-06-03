/**
 * BlancBleu — Aide IA · Module 2 : Extraction PMT (OCR Prescription Médicale).
 */
import { useState, useEffect, useRef } from "react";
import { aiService, transportService } from "../../services/api";
import { fmtApiError } from "./utils";
import { ConfidenceBadge, Section, Row } from "./components";

// ════════════════════════════════════════════════════════════════════════════
// MODULE 2 — EXTRACTION PMT
// ════════════════════════════════════════════════════════════════════════════
export default function ModulePMT({ aiStatus }) {
  const [file, setFile] = useState(null);
  const [transportId, setTransportId] = useState("");
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();

  useEffect(() => {
    transportService
      .getAll({ limit: 100 })
      .then((res) => {
        const data = res?.data;
        const liste = data?.transports || data?.data || (Array.isArray(data) ? data : []);
        setTransports(liste);
        console.log("✅ Transports chargés :", liste.length);
      })
      .catch((err) => {
        console.error("❌ Erreur transports :", err.response?.status, err.message);
        setTransports([]);
      });
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleExtract = async () => {
    if (!file) {
      setError("Sélectionnez un fichier PMT (PDF ou image)");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    setValidated(false);
    try {
      const formData = new FormData();
      formData.append("pmt", file);
      if (transportId) formData.append("transportId", String(transportId));
      const { data } = await aiService.extrairePMT(formData);
      setResult(data);
    } catch (err) {
      if (err.response?.status === 503) {
        setError(
          "Service OCR indisponible. Assurez-vous que le microservice Python est démarré et que Tesseract est installé.",
        );
      } else {
        setError(fmtApiError(err, "Erreur d'extraction PMT"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!transportId || !result) return;
    setValidating(true);
    try {
      await aiService.validerPMT(transportId, result.extraction);
      setValidated(true);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur de validation");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6 items-start">
      {/* Formulaire */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-4">
          <p className="font-mono text-xs text-violet-300 tracking-widest uppercase">
            Module 1 — PMT Extraction
          </p>
          <h2 className="font-brand font-bold text-white text-base">
            Prescription Médicale de Transport
          </h2>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Transport associé */}
          <div>
            <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">
              Transport associé (optionnel)
            </label>
            <select
              value={String(transportId || "")}
              onChange={(e) => setTransportId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy outline-none focus:border-primary bg-surface"
            >
              <option value="">Lier à un transport...</option>
              {transports.map((t) => (
                <option key={String(t._id || t.id)} value={String(t._id || t.id)}>
                  {t.numero} — {t.patient?.nom} {t.patient?.prenom}
                  {" | "}
                  {t.motif}
                  {" | "}
                  {t.dateTransport ? new Date(t.dateTransport).toLocaleDateString("fr-FR") : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Zone de dépôt fichier */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              file
                ? "border-violet-400 bg-violet-50"
                : "border-slate-200 hover:border-violet-300 hover:bg-slate-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff"
              className="hidden"
              onChange={(e) => setFile(e.target.files[0])}
            />
            {file ? (
              <div className="space-y-2">
                <span className="material-symbols-outlined text-4xl text-violet-500">
                  {file.type === "application/pdf" ? "picture_as_pdf" : "image"}
                </span>
                <p className="font-semibold text-navy text-sm">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(0)} Ko · {file.type}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="text-xs text-red-400 hover:text-red-600 underline"
                >
                  Supprimer
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="material-symbols-outlined text-5xl text-slate-300">
                  upload_file
                </span>
                <p className="font-semibold text-slate-500">Déposez la PMT ici ou cliquez</p>
                <p className="text-xs text-slate-300">PDF, JPEG, PNG, TIFF — max 10 Mo</p>
              </div>
            )}
          </div>

          {/* Info service */}
          {!aiStatus?.available && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
              <strong>Service IA non démarré.</strong> Lancez le microservice Python :{" "}
              <code className="bg-amber-100 px-1 rounded">
                cd ai-service && setup_et_lancer.bat
              </code>
            </div>
          )}

          {/* Info Tesseract */}
          {aiStatus?.available && !aiStatus?.modules?.pmt_ocr && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
              <strong>Tesseract OCR non détecté.</strong> Installez-le depuis{" "}
              <a
                href="https://github.com/UB-Mannheim/tesseract/wiki"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                UB-Mannheim/tesseract
              </a>{" "}
              et ajoutez-le au PATH.
            </div>
          )}

          <button
            onClick={handleExtract}
            disabled={loading || !file}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                OCR en cours...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">document_scanner</span>
                EXTRAIRE LA PMT
              </>
            )}
          </button>
        </div>
      </div>

      {/* Résultat */}
      <div className="sticky top-24">
        {!result && !loading ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 min-h-96 flex flex-col items-center justify-center gap-4 text-slate-300 p-10">
            <span className="material-symbols-outlined text-7xl">clinical_notes</span>
            <p className="font-brand font-semibold text-slate-400 text-lg text-center">
              Données extraites de la PMT
            </p>
            <p className="text-sm text-center text-slate-300">
              Téléversez une Prescription Médicale de Transport (PDF ou image) pour extraire
              automatiquement les informations patient
            </p>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-slate-200 min-h-96 flex flex-col items-center justify-center gap-6">
            <div className="w-16 h-16 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-brand font-bold text-navy">OCR en cours...</p>
              <p className="text-sm text-slate-400 mt-1">Tesseract analyse le document</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {[
                "Conversion",
                "OCR Tesseract",
                "Regex extraction",
                "NER spaCy",
                "Score confiance",
              ].map((s, i) => (
                <span
                  key={i}
                  className="text-xs bg-violet-50 text-violet-600 px-2 py-1 rounded-full font-medium animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : result ? (
          <PMTResult
            result={result}
            onValidate={handleValidate}
            validating={validating}
            validated={validated}
            hasTransport={!!transportId}
          />
        ) : null}
      </div>
    </div>
  );
}

function PMTResult({ result, onValidate, validating, validated, hasTransport }) {
  const confPct = Math.round(result.confiance * 100);
  const confColor = confPct >= 75 ? "emerald" : confPct >= 50 ? "amber" : "red";
  const ext = result.extraction;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
      {/* Header confiance */}
      <div className={`px-6 py-4 bg-${confColor}-50 border-b border-${confColor}-100`}>
        <div className="flex items-center justify-between mb-2">
          <p className={`font-brand font-bold text-${confColor}-700 text-lg`}>
            {result.validationRequise ? "Validation humaine requise" : "Extraction réussie"}
          </p>
          <ConfidenceBadge value={result.confiance} />
        </div>
        <div className="h-2 bg-white/50 rounded-full overflow-hidden">
          <div
            className={`h-full bg-${confColor}-500 rounded-full transition-all duration-1000`}
            style={{ width: `${confPct}%` }}
          />
        </div>

        {result.champsManquants?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {result.champsManquants.map((c) => (
              <span key={c} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                Manquant : {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Données extraites */}
      <div className="p-5 space-y-4">
        {/* Patient */}
        <Section title="Patient" icon="person">
          <Row label="Nom" val={ext.patient?.nom} />
          <Row label="Prénom" val={ext.patient?.prenom} />
          <Row label="Date naissance" val={ext.patient?.dateNaissance} />
        </Section>

        {/* Médecin */}
        <Section title="Médecin prescripteur" icon="stethoscope">
          <Row label="Nom" val={ext.medecin?.nom} />
          <Row label="RPPS" val={ext.medecin?.rpps} mono />
          <Row label="Date prescription" val={ext.datePrescription} />
        </Section>

        {/* Transport */}
        <Section title="Transport prescrit" icon="local_shipping">
          <Row label="Type autorisé" val={ext.typeTransportAutorise} highlight />
          <Row label="Mobilité" val={ext.mobilite?.replace("_", " ")} highlight />
          <Row label="Destination" val={ext.destination} />
          <Row
            label="Aller-retour"
            val={ext.allerRetour === true ? "Oui" : ext.allerRetour === false ? "Non" : null}
          />
          <Row label="Fréquence" val={ext.frequence} />
          <Row label="Motif" val={ext.motif} />
        </Section>

        {/* Besoins spéciaux */}
        {(ext.oxygene || ext.brancardage) && (
          <div className="flex gap-3">
            {ext.oxygene && (
              <span className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-3 py-1.5 rounded-full border border-blue-100 font-medium">
                <span className="material-symbols-outlined text-sm">air</span>
                Oxygène requis
              </span>
            )}
            {ext.brancardage && (
              <span className="flex items-center gap-1 bg-orange-50 text-orange-700 text-xs px-3 py-1.5 rounded-full border border-orange-100 font-medium">
                <span className="material-symbols-outlined text-sm">transfer_within_a_station</span>
                Brancardage requis
              </span>
            )}
          </div>
        )}

        {/* Remarques */}
        {ext.remarques && (
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 border border-slate-100">
            <p className="font-mono text-slate-400 mb-1">REMARQUES</p>
            {ext.remarques}
          </div>
        )}

        {/* Validation */}
        {validated ? (
          <div className="py-3.5 bg-emerald-500 text-white rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">check_circle</span>
            PMT validée et enregistrée
          </div>
        ) : (
          <button
            onClick={onValidate}
            disabled={!hasTransport || validating}
            className={`w-full py-3.5 rounded-xl font-brand font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              hasTransport
                ? "bg-violet-600 text-white hover:bg-violet-700 hover:shadow-lg"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            {validating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Validation...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">verified</span>
                {hasTransport
                  ? "VALIDER ET ASSOCIER AU TRANSPORT"
                  : "Sélectionnez un transport pour valider"}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
