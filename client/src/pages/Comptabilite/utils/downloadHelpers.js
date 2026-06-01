/**
 * Helpers de téléchargement de blobs (PDF, CSV) côté navigateur.
 * Extraits du monolithe Factures.jsx (comportement identique).
 */

/** Télécharge un blob PDF depuis une promesse axios (response.data). */
export async function downloadBlob(promise, filename) {
  const response = await promise;
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

/** Télécharge un blob CSV depuis une promesse axios. */
export async function downloadCsvBlob(promise, filename) {
  const response = await promise;
  const url = window.URL.createObjectURL(
    new Blob([response.data], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

/** Télécharge une chaîne CSV (avec BOM UTF-8) générée côté client. */
export function downloadCsvString(csv, filename) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
