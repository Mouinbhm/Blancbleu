/**
 * FactureInvoiceHeader — en-tête imprimable (logo, n°, infos patient/transport).
 * Sous-bloc de FactureInvoiceContent (séparé pour respecter <300 LOC).
 */
import { fmtDate } from "../../../utils/formatters";

export default function FactureInvoiceHeader({ facture, motif, patient, statCfg }) {
  return (
    <>
      <div
        className="header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "36px",
          paddingBottom: "20px",
          borderBottom: "3px solid #1D6EF5",
        }}
      >
        <div>
          <div
            className="logo-name"
            style={{ fontSize: "24px", fontWeight: 800, marginBottom: "2px" }}
          >
            <span style={{ color: "#0f172a" }}>Ambulances </span>
            <span style={{ color: "#1D6EF5" }}>Blanc Bleu</span>
          </div>
          <div
            className="logo-sub"
            style={{
              fontSize: "10px",
              color: "#64748b",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "10px",
            }}
          >
            Transport Sanitaire · Nice
          </div>
          <div
            className="logo-addr"
            style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.7 }}
          >
            59 Boulevard Madeleine
            <br />
            06000 Nice · SIRET : 000 000 000 00000
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "11px",
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "4px",
            }}
          >
            Facture N°
          </div>
          <div
            className="facture-num"
            style={{ fontSize: "22px", fontWeight: 800, color: "#1D6EF5" }}
          >
            {facture.numero}
          </div>
          <div
            className="facture-date"
            style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}
          >
            Émise le : {fmtDate(facture.dateEmission)}
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: "8px",
              padding: "4px 14px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 700,
              backgroundColor: "#fef3c7",
              color: "#92400e",
            }}
          >
            {statCfg.label.toUpperCase()}
          </div>
        </div>
      </div>

      <div
        className="info-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <div
          className="info-box"
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "14px",
          }}
        >
          <div
            className="info-label"
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "8px",
            }}
          >
            Patient
          </div>
          <div
            className="info-value"
            style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}
          >
            {patient}
          </div>
          {facture.patientId?.numeroPatient && (
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              N° {facture.patientId.numeroPatient}
            </div>
          )}
        </div>
        <div
          className="info-box"
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "14px",
          }}
        >
          <div
            className="info-label"
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "8px",
            }}
          >
            Transport
          </div>
          <div
            className="info-value"
            style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}
          >
            {facture.transportId?.numero || "—"}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{motif}</div>
        </div>
      </div>
    </>
  );
}
