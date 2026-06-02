/**
 * Générateurs d'exports CSV (factures filtrées, DSN URSSAF, rapport comptable).
 * Extraits du monolithe Factures.jsx — logique identique, fonctions pures
 * (prennent les données en argument, délèguent le téléchargement).
 */
import { fmtDate, fmtEur } from "../../../utils/formatters";
import { patientNom } from "./factureMappers";
import { MOIS_NOMS } from "./factureConstants";
import { downloadCsvString } from "./downloadHelpers";

/** Export CSV de la liste de factures filtrée. */
export function exportFacturesCsv(filtered) {
  const headers = [
    "N° Facture",
    "Date émission",
    "Transport",
    "Patient",
    "Motif",
    "Total €",
    "CPAM €",
    "Patient €",
    "Statut",
  ];
  const rows = filtered.map((f) => [
    f.numero,
    fmtDate(f.dateEmission),
    f.transportId?.numero || "",
    patientNom(f),
    f.transportId?.motif || "",
    f.montantTotal,
    f.montantCPAM,
    f.montantPatient,
    f.statut,
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  downloadCsvString(csv, `factures-blancbleu-${new Date().toISOString().slice(0, 10)}.csv`);
}

/** Export DSN URSSAF (déclaration collective du mois). No-op si pas de compta. */
export function exportDsnCsv(compta, moisActuel, anneeActuelle) {
  if (!compta) return;
  const headers = ["SIRET", "NOM", "PRENOM", "PERIODE", "BRUT", "COT_SAL", "NET", "COT_PAT"];
  const periode = `${String(moisActuel).padStart(2, "0")}/${anneeActuelle}`;
  const csv = [
    headers.join(";"),
    `000000000000000;;(collectif);${periode};${compta.charges.salaires};${compta.urssaf.cotisationsSalariales};${compta.urssaf.salaireNet};${compta.urssaf.cotisationsPatronales}`,
  ].join("\n");
  downloadCsvString(csv, `DSN-URSSAF-${periode.replace("/", "-")}.csv`);
}

/** Rapport comptable complet (CA / charges / résultat / factures). */
export function exportRapportCsv(compta, factures, filtered, moisActuel, anneeActuelle) {
  if (!compta) {
    exportFacturesCsv(filtered);
    return;
  }
  const periode = `${MOIS_NOMS[moisActuel - 1]} ${anneeActuelle}`;
  const lines = [
    `"=== RAPPORT COMPTABLE — ${periode} ==="`,
    `""`,
    `"=== CHIFFRE D'AFFAIRES ==="`,
    `"CA encaissé (paiements reçus ce mois)","${fmtEur(compta.ca.encaisse ?? 0)}"`,
    `"CA facturé (émissions ce mois)","${fmtEur(compta.ca.facture ?? compta.ca.total)}"`,
    `"Part CPAM","${fmtEur(compta.ca.partCPAM)}"`,
    `"Part patient","${fmtEur(compta.ca.partPatient)}"`,
    `""`,
    `"=== CHARGES ==="`,
    `"Salaires bruts","${fmtEur(compta.charges.salaires)}"`,
    `"Cotisations patronales (URSSAF)","${fmtEur(compta.charges.urssaf)}"`,
    `"Maintenances","${fmtEur(compta.charges.maintenances)}"`,
    `"Total charges","${fmtEur(compta.charges.total)}"`,
    `""`,
    `"=== RÉSULTAT ==="`,
    `"Résultat net","${fmtEur(compta.resultatNet)}"`,
    `""`,
    `"=== FACTURES ==="`,
    `"N° Facture","Date","Patient","Montant","CPAM","Statut"`,
    ...factures.map(
      (f) =>
        `"${f.numero}","${fmtDate(f.dateEmission)}","${patientNom(f)}","${f.montantTotal}","${f.montantCPAM}","${f.statut}"`,
    ),
  ];
  downloadCsvString(lines.join("\n"), `rapport-comptable-${periode.replace(" ", "-")}.csv`);
}
