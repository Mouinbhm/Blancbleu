/**
 * ModalImpression — aperçu + impression/PDF d'une facture.
 * Le corps imprimable est délégué à FactureInvoiceContent (<300 LOC chacun).
 */
import { patientNom } from "../utils/factureMappers";
import { STATUT_STYLE } from "../utils/factureConstants";
import FactureInvoiceContent from "./FactureInvoiceContent";

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
          <FactureInvoiceContent
            facture={facture}
            motif={motif}
            patient={patient}
            statCfg={statCfg}
          />
        </div>
      </div>
    </div>
  );
}
