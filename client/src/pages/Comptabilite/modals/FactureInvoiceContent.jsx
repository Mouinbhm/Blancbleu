/**
 * FactureInvoiceContent — corps imprimable de la facture (#facture-print-content).
 * Extrait de ModalImpression (<300 LOC). En-tête délégué à FactureInvoiceHeader.
 */
import { fmtMontant } from "../../../utils/formatters";
import FactureInvoiceHeader from "./FactureInvoiceHeader";

export default function FactureInvoiceContent({ facture, motif, patient, statCfg }) {
  return (
    <div id="facture-print-content">
      <FactureInvoiceHeader facture={facture} motif={motif} patient={patient} statCfg={statCfg} />
      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "10px",
          }}
        >
          Détail de la prestation
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#0f172a" }}>
              {[
                "Désignation",
                "Montant base",
                "Majoration",
                "Total TTC",
                "Part CPAM",
                "Part Patient",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontSize: "10px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.8)",
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td
                style={{
                  padding: "14px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#0f172a",
                }}
              >
                {motif}
              </td>
              <td
                style={{
                  padding: "14px",
                  fontSize: "13px",
                  color: "#475569",
                  fontFamily: "monospace",
                }}
              >
                {fmtMontant(facture.montantBase)}
              </td>
              <td
                style={{
                  padding: "14px",
                  fontSize: "13px",
                  color: "#475569",
                  fontFamily: "monospace",
                }}
              >
                {fmtMontant(facture.majoration)}
              </td>
              <td
                style={{
                  padding: "14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#0f172a",
                  fontFamily: "monospace",
                }}
              >
                {fmtMontant(facture.montantTotal)}
              </td>
              <td
                style={{
                  padding: "14px",
                  fontSize: "13px",
                  color: "#16a34a",
                  fontFamily: "monospace",
                }}
              >
                {fmtMontant(facture.montantCPAM)} ({facture.tauxPriseEnCharge}%)
              </td>
              <td
                style={{
                  padding: "14px",
                  fontSize: "13px",
                  color: "#dc2626",
                  fontFamily: "monospace",
                }}
              >
                {fmtMontant(facture.montantPatient)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: "#EFF6FF" }}>
              <td colSpan={3} style={{ padding: "14px" }}></td>
              <td
                style={{
                  padding: "14px",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#1D6EF5",
                }}
              >
                TOTAL : {fmtMontant(facture.montantTotal)}
              </td>
              <td style={{ padding: "14px", fontSize: "13px", color: "#16a34a" }}>
                CPAM : {fmtMontant(facture.montantCPAM)}
              </td>
              <td style={{ padding: "14px", fontSize: "13px", color: "#dc2626" }}>
                Patient : {fmtMontant(facture.montantPatient)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {facture.notes && (
        <div
          className="notes-box"
          style={{
            backgroundColor: "#f8fafc",
            borderLeft: "4px solid #1D6EF5",
            padding: "14px",
            borderRadius: "4px",
            fontSize: "13px",
            color: "#475569",
          }}
        >
          <strong style={{ color: "#0f172a" }}>Notes :</strong> {facture.notes}
        </div>
      )}

      <div
        className="footer"
        style={{
          marginTop: "32px",
          paddingTop: "16px",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "#94a3b8",
        }}
      >
        <span>Ambulances Blanc Bleu · 59 Bd Madeleine, 06000 Nice</span>
        <span>Document généré le {new Date().toLocaleDateString("fr-FR")}</span>
      </div>
    </div>
  );
}
