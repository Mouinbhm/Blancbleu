/**
 * BlancBleu — Service PDF Mission (PART D)
 *
 * Génère un PDF de fiche mission complet : infos transport, timeline, signature,
 * documents PMT, facturation.
 *
 * Utilise pdfkit (installé via npm install pdfkit).
 */

const PDFDocument = require("pdfkit");
const Transport = require("../models/Transport");
const { LABELS } = require("./transportStateMachine");

// ── Couleurs & constantes ─────────────────────────────────────────────────────
const BLEU = "#1D6EF5";
const GRIS = "#64748b";
const GRIS_BG = "#F8FAFC";
const NOIR = "#0F172A";
const VERT = "#16a34a";
const ROUGE = "#dc2626";

const PAGE_W = 595.28; // A4
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Utilitaires ───────────────────────────────────────────────────────────────
function _fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function _fmtDateHeure(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function _label(statut) {
  return LABELS[statut]?.fr || statut || "—";
}
function _adresse(a) {
  if (!a) return "—";
  const parts = [a.nom, a.rue, a.codePostal, a.ville, a.service].filter(Boolean);
  return parts.join(", ") || "—";
}

// ── Helpers de rendu ──────────────────────────────────────────────────────────
function _sectionTitle(doc, title, y) {
  doc.rect(MARGIN, y, CONTENT_W, 22).fill(BLEU);
  doc
    .fillColor("#fff")
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(title.toUpperCase(), MARGIN + 8, y + 6, { width: CONTENT_W - 16 });
  return y + 30;
}

function _row(doc, label, value, y, col2 = null, val2 = null) {
  const labelW = 120;
  const colW = col2 !== null ? (CONTENT_W - 16) / 2 : CONTENT_W - 16;

  doc
    .fillColor(GRIS)
    .fontSize(8)
    .font("Helvetica")
    .text(label, MARGIN + 8, y, { width: labelW });
  doc
    .fillColor(NOIR)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(String(value || "—"), MARGIN + 8 + labelW, y, { width: colW - labelW });

  if (col2 !== null) {
    const x2 = MARGIN + 8 + CONTENT_W / 2;
    doc.fillColor(GRIS).fontSize(8).font("Helvetica").text(col2, x2, y, { width: labelW });
    doc
      .fillColor(NOIR)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(String(val2 || "—"), x2 + labelW, y, { width: colW - labelW });
  }

  return y + 16;
}

// ── Générateur principal ──────────────────────────────────────────────────────
async function generateMissionPdf(transportId) {
  // RGPD : patient.antecedents / patient.allergies sont chiffrés + select:false.
  // Le PDF mission a besoin de les afficher au chauffeur (sécurité médicale).
  // Le déchiffrement est transparent via post('init') sur le sub-schema patient.
  const transport = await Transport.findById(transportId)
    .select("+patient.antecedents +patient.allergies")
    .populate("vehicule", "nom type immatriculation")
    .populate("chauffeur", "nom prenom email telephone")
    .populate("createdBy", "nom prenom email")
    .populate("statusLog.changedBy", "nom prenom role");

  if (!transport) throw new Error("Transport introuvable");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;

    // ─────────────────────────────────────────────────────────────────────────
    // EN-TÊTE
    // ─────────────────────────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 72).fill(BLEU);

    doc.fillColor("#fff").fontSize(22).font("Helvetica-Bold").text("BlancBleu", MARGIN, 16);
    doc
      .fillColor("rgba(255,255,255,0.7)")
      .fontSize(9)
      .font("Helvetica")
      .text("AMBULANCES BLANC BLEU · Transport sanitaire non urgent", MARGIN, 42);

    const statutColor = ["COMPLETED", "PAID", "BILLED"].includes(transport.statut)
      ? VERT
      : ["CANCELLED", "NO_SHOW", "FAILED"].includes(transport.statut)
        ? ROUGE
        : BLEU;
    doc
      .rect(PAGE_W - MARGIN - 120, 16, 120, 38)
      .fill("rgba(255,255,255,0.15)")
      .stroke();
    doc
      .fillColor("#fff")
      .fontSize(8)
      .font("Helvetica")
      .text("STATUT", PAGE_W - MARGIN - 112, 22);
    doc
      .fillColor("#fff")
      .fontSize(10)
      .font("Helvetica-Bold")
      .text(_label(transport.statut), PAGE_W - MARGIN - 112, 33, { width: 104, align: "center" });

    y = 88;

    // ─────────────────────────────────────────────────────────────────────────
    // Numéro + métadonnées
    // ─────────────────────────────────────────────────────────────────────────
    doc.rect(MARGIN, y, CONTENT_W, 32).fill(GRIS_BG).stroke("#e2e8f0");
    doc
      .fillColor(BLEU)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(`Fiche mission — ${transport.numero}`, MARGIN + 10, y + 8);
    doc
      .fillColor(GRIS)
      .fontSize(8)
      .font("Helvetica")
      .text(
        `Créé le ${_fmtDateHeure(transport.createdAt)} · Dernière mise à jour ${_fmtDateHeure(transport.updatedAt)}`,
        MARGIN + 10,
        y + 22,
      );
    y += 46;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. INFORMATIONS PATIENT
    // ─────────────────────────────────────────────────────────────────────────
    y = _sectionTitle(doc, "1. Patient", y);
    const p = transport.patient || {};
    y = _row(
      doc,
      "Nom / Prénom",
      `${p.nom || "—"} ${p.prenom || ""}`.trim(),
      y,
      "N° Sécu",
      p.numeroSecu || "—",
    );
    y = _row(doc, "Date naissance", _fmtDate(p.dateNaissance), y, "Téléphone", p.telephone || "—");
    y = _row(doc, "Mobilité", p.mobilite || "—", y, "Oxygène", p.oxygene ? "Oui" : "Non");
    y = _row(
      doc,
      "Brancardage",
      p.brancardage ? "Oui" : "Non",
      y,
      "Accomp.",
      p.accompagnateur ? "Oui" : "Non",
    );
    if (p.antecedents) y = _row(doc, "Antécédents", p.antecedents, y);
    y += 6;

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TRANSPORT
    // ─────────────────────────────────────────────────────────────────────────
    y = _sectionTitle(doc, "2. Transport", y);
    y = _row(
      doc,
      "Date",
      _fmtDate(transport.dateTransport),
      y,
      "Heure RDV",
      transport.heureRDV || "—",
    );
    y = _row(doc, "Type", transport.typeTransport || "—", y, "Motif", transport.motif || "—");
    y = _row(
      doc,
      "Aller-retour",
      transport.allerRetour ? "Oui" : "Non",
      y,
      "Durée réelle",
      transport.dureeReelleMinutes ? `${transport.dureeReelleMinutes} min` : "—",
    );
    y = _row(doc, "Départ", _adresse(transport.adresseDepart), y);
    y = _row(doc, "Destination", _adresse(transport.adresseDestination), y);
    y += 6;

    // ─────────────────────────────────────────────────────────────────────────
    // 3. VÉHICULE & CHAUFFEUR
    // ─────────────────────────────────────────────────────────────────────────
    y = _sectionTitle(doc, "3. Véhicule & Chauffeur", y);
    const v = transport.vehicule;
    const c = transport.chauffeur;
    y = _row(
      doc,
      "Véhicule",
      v ? `${v.nom} (${v.immatriculation || "—"})` : "—",
      y,
      "Type",
      v?.type || "—",
    );
    y = _row(
      doc,
      "Chauffeur",
      c ? `${c.nom} ${c.prenom}` : "—",
      y,
      "Téléphone",
      c?.telephone || "—",
    );
    y += 6;

    // ─────────────────────────────────────────────────────────────────────────
    // 4. PRESCRIPTION (PMT)
    // ─────────────────────────────────────────────────────────────────────────
    y = _sectionTitle(doc, "4. Prescription médicale de transport (PMT)", y);
    const presc = transport.prescription || {};
    y = _row(doc, "Numéro PMT", presc.numero || "—", y, "Médecin", presc.medecin || "—");
    y = _row(
      doc,
      "Date émission",
      _fmtDate(presc.dateEmission),
      y,
      "Expiration",
      _fmtDate(presc.dateExpiration),
    );
    y = _row(doc, "Validée", presc.validee ? "Oui" : "Non", y, "Motif PMT", presc.motif || "—");

    if (transport.pmtDocuments?.length) {
      y += 4;
      doc
        .fillColor(GRIS)
        .fontSize(8)
        .font("Helvetica")
        .text(`${transport.pmtDocuments.length} document(s) attaché(s) :`, MARGIN + 8, y);
      y += 12;
      transport.pmtDocuments.forEach((d, i) => {
        const ocrLabel =
          {
            done: "OCR OK",
            error: "OCR erreur",
            processing: "OCR en cours",
            pending: "OCR en attente",
            skipped: "OCR ignoré",
          }[d.ocrStatus] || d.ocrStatus;
        doc
          .fillColor(NOIR)
          .fontSize(8)
          .font("Helvetica")
          .text(
            `  ${i + 1}. ${d.fileName || "—"}  ·  ${ocrLabel}  ·  ${_fmtDate(d.uploadedAt)}`,
            MARGIN + 16,
            y,
          );
        y += 12;
      });
    }
    y += 6;

    // ─────────────────────────────────────────────────────────────────────────
    // 5. TIMELINE DES STATUTS
    // ─────────────────────────────────────────────────────────────────────────
    y = _sectionTitle(doc, "5. Historique des statuts", y);

    if (!transport.statusLog?.length) {
      doc
        .fillColor(GRIS)
        .fontSize(9)
        .font("Helvetica")
        .text("Aucun historique disponible.", MARGIN + 8, y);
      y += 16;
    } else {
      const entries = transport.statusLog.slice(-20); // max 20 lignes
      entries.forEach((entry) => {
        // Vérifier espace restant — saut de page si besoin
        if (y > 730) {
          doc.addPage();
          y = MARGIN;
        }
        const who = entry.changedBy
          ? `${entry.changedBy.nom || ""} ${entry.changedBy.prenom || ""}`.trim() ||
            entry.changedByRole
          : entry.changedByRole || "système";
        const arrow = `${_label(entry.from)} → ${_label(entry.to)}`;
        doc
          .fillColor(BLEU)
          .fontSize(8)
          .font("Helvetica-Bold")
          .text(_fmtDateHeure(entry.changedAt), MARGIN + 8, y, { width: 110 });
        doc
          .fillColor(NOIR)
          .fontSize(8)
          .font("Helvetica")
          .text(arrow, MARGIN + 120, y, { width: 200 });
        doc
          .fillColor(GRIS)
          .fontSize(7.5)
          .font("Helvetica")
          .text(`${who}${entry.reason ? " · " + entry.reason : ""}`, MARGIN + 325, y, {
            width: CONTENT_W - 320,
          });
        y += 14;
      });
    }
    y += 6;

    // ─────────────────────────────────────────────────────────────────────────
    // 6. PREUVE DE PRISE EN CHARGE (SIGNATURE)
    // ─────────────────────────────────────────────────────────────────────────
    if (y > 680) {
      doc.addPage();
      y = MARGIN;
    }
    y = _sectionTitle(doc, "6. Preuve de prise en charge", y);
    const poc = transport.proofOfCare || {};
    if (poc.signed) {
      y = _row(
        doc,
        "Signé par",
        poc.signedByName || "—",
        y,
        "Date signature",
        _fmtDateHeure(poc.signedAt),
      );
      y = _row(doc, "Consentement", poc.consentText || "—", y);

      if (poc.signatureBase64 && poc.signatureBase64.length < 300000) {
        // Tenter d'afficher la signature si c'est une image base64 PNG valide
        try {
          const dataUrl = poc.signatureBase64.startsWith("data:")
            ? poc.signatureBase64
            : `data:image/png;base64,${poc.signatureBase64}`;
          const base64Data = dataUrl.split(",")[1];
          const imgBuf = Buffer.from(base64Data, "base64");
          doc.image(imgBuf, MARGIN + 8, y, { height: 60, fit: [200, 60] });
          y += 68;
        } catch {
          /* image invalide — ignorer */
        }
      } else if (poc.signatureImageUrl) {
        y = _row(doc, "Fichier signature", poc.signatureImageUrl, y);
      }
    } else {
      doc
        .fillColor(ROUGE)
        .fontSize(9)
        .font("Helvetica")
        .text("Transport non signé par le patient.", MARGIN + 8, y);
      y += 16;
    }
    y += 6;

    // ─────────────────────────────────────────────────────────────────────────
    // 7. FACTURATION
    // ─────────────────────────────────────────────────────────────────────────
    if (y > 690) {
      doc.addPage();
      y = MARGIN;
    }
    y = _sectionTitle(doc, "7. Facturation", y);
    y = _row(
      doc,
      "Statut",
      _label(transport.statut),
      y,
      "Taux CPAM",
      `${transport.tauxPriseEnCharge || 65} %`,
    );
    y = _row(
      doc,
      "Réf. CPAM",
      transport.referenceFactureCPAM || "—",
      y,
      "Facture ID",
      transport.facture?.toString() || "—",
    );
    y = _row(
      doc,
      "Date facturation",
      _fmtDateHeure(transport.heureFacturation),
      y,
      "Date paiement",
      _fmtDateHeure(transport.heurePaiement),
    );
    y += 6;

    // ─────────────────────────────────────────────────────────────────────────
    // PIED DE PAGE
    // ─────────────────────────────────────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.rect(0, doc.page.height - 36, PAGE_W, 36).fill("#F1F5F9");
      doc
        .fillColor(GRIS)
        .fontSize(8)
        .font("Helvetica")
        .text(
          `BlancBleu · Document généré le ${new Date().toLocaleString("fr-FR")} · Page ${i + 1} / ${totalPages}`,
          MARGIN,
          doc.page.height - 22,
          { width: CONTENT_W, align: "center" },
        );
    }

    doc.end();
  });
}

module.exports = { generateMissionPdf };
