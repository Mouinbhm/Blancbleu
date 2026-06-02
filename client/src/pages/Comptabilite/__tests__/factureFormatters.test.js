import { fmtEur, fmtMontant, fmtDate } from "../../../utils/formatters";

describe("fmtEur (Intl currency EUR)", () => {
  test("formate un montant standard", () => {
    // espace insécable + € — on vérifie le contenu chiffré, indépendant du
    // type d'espace renvoyé par l'environnement Intl.
    expect(fmtEur(1234.5).replace(/ | /g, " ")).toBe("1 234,50 €");
  });
  test("0 → 0,00 €", () => {
    expect(fmtEur(0).replace(/ | /g, " ")).toBe("0,00 €");
  });
  test("null/undefined traités comme 0", () => {
    expect(fmtEur(null).replace(/ | /g, " ")).toBe("0,00 €");
    expect(fmtEur(undefined).replace(/ | /g, " ")).toBe("0,00 €");
  });
  test("montant négatif", () => {
    expect(fmtEur(-50).replace(/ | /g, " ")).toBe("-50,00 €");
  });
  test("montant énorme", () => {
    expect(fmtEur(1000000).replace(/ | /g, " ")).toBe("1 000 000,00 €");
  });
});

describe("fmtMontant (toLocaleString)", () => {
  test("montant standard", () => {
    expect(fmtMontant(1234.5).replace(/ | /g, " ")).toBe("1 234,50 €");
  });
  test("0 reste affiché (≠ null)", () => {
    expect(fmtMontant(0).replace(/ | /g, " ")).toBe("0,00 €");
  });
  test("null/undefined → tiret", () => {
    expect(fmtMontant(null)).toBe("—");
    expect(fmtMontant(undefined)).toBe("—");
  });
});

describe("fmtDate", () => {
  test("formate une date ISO en fr-FR", () => {
    expect(fmtDate("2026-05-24T10:00:00Z")).toBe("24/05/2026");
  });
  test("valeur vide → tiret", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtDate("")).toBe("—");
  });
});
