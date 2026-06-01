/**
 * ModalImpression — aperçu + impression/PDF d'une facture.
 * Extrait du monolithe Factures.jsx (comportement identique).
 * NOTE: composant volumineux (>300 LOC) — découpage prévu commit 7.
 */
import { fmtDate, fmtMontant } from "../../../utils/formatters";
import { patientNom } from "../utils/factureMappers";
import { STATUT_STYLE } from "../utils/factureConstants";

export default function ModalImpression({ facture, onClose }) {
  const handlePrint = () => {
    const content = document.getElementById("facture-print-content").innerHTML;
    const win = window.open("", "_blank", "width=800,height=900");
    win.document.write(`
      <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
      <title>Facture ${facture.numero}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff}
        .page{max-width:780px;margin:0 auto;padding:48px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #1D6EF5}
        .logo-name{font-size:26px;font-weight:800}
        .logo-sub{font-size:10px;color:#64748b;letter-spacing:0.1em;text-transform:uppercase}
        .logo-addr{font-size:11px;color:#64748b;margin-top:8px;line-height:1.6}
        .facture-num{font-size:22px;font-weight:800;color:#1D6EF5}
        .facture-date{font-size:12px;color:#64748b;margin-top:4px}
        .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
        .info-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
        .info-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px}
        .info-value{font-size:14px;font-weight:600;color:#0f172a}
        table{width:100%;border-collapse:collapse}
        thead tr{background:#0f172a;color:white}
        thead th{padding:10px 14px;text-align:left;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.8);font-weight:600}
        tbody tr{border-bottom:1px solid #f1f5f9}
        tbody td{padding:14px;font-size:13px}
        tfoot tr{background:#EFF6FF}
        tfoot td{padding:14px}
        .notes-box{background:#f8fafc;border-left:4px solid #1D6EF5;padding:14px;border-radius:4px;font-size:13px;color:#475569;margin-top:20px}
        .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><div class="page">${content}</div></body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 500);
  };

  const motif = facture.transportId?.motif || "Transport sanitaire";
  const patient = patientNom(facture);
  const statCfg = STATUT_STYLE[facture.statut] || STATUT_STYLE.en_attente;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
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
          maxWidth: "720px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid #f1f5f9",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="material-symbols-outlined"
              style={{ color: "#1D6EF5", fontSize: "22px" }}
            >
              receipt
            </span>
            <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "15px" }}>
              Aperçu — {facture.numero}
            </span>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handlePrint}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                borderRadius: "8px",
                background: "#1D6EF5",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                print
              </span>
              Imprimer / PDF
            </button>
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
        </div>

        <div style={{ overflowY: "auto", padding: "32px 40px", flex: 1 }}>
          <div id="facture-print-content">
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
        </div>
      </div>
    </div>
  );
}
