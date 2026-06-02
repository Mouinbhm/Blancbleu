import {
  sumField,
  totalCA,
  totalCharges,
  totalResultat,
  recapTotals,
} from "../utils/comptabiliteCalculs";

const RECAP = [
  { mois: 1, ca: 1000, charges: 600, resultat: 400 },
  { mois: 2, ca: 2000, charges: 1500, resultat: 500 },
  { mois: 3, ca: 0, charges: 200, resultat: -200 },
];

describe("comptabiliteCalculs", () => {
  test("totalCA somme les CA", () => {
    expect(totalCA(RECAP)).toBe(3000);
  });
  test("totalCharges somme les charges", () => {
    expect(totalCharges(RECAP)).toBe(2300);
  });
  test("totalResultat = somme des résultats (peut être négatif)", () => {
    expect(totalResultat(RECAP)).toBe(700);
  });
  test("résultat global cohérent avec CA − charges", () => {
    const t = recapTotals(RECAP);
    expect(t.ca - t.charges).toBe(t.resultat); // 3000 - 2300 = 700
  });

  test("liste vide → 0 partout", () => {
    expect(recapTotals([])).toEqual({ ca: 0, charges: 0, resultat: 0 });
  });
  test("recap null/undefined → 0 (pas de crash)", () => {
    expect(recapTotals(null)).toEqual({ ca: 0, charges: 0, resultat: 0 });
    expect(totalCA(undefined)).toBe(0);
  });
  test("données partielles (champ manquant compté comme 0)", () => {
    const partial = [
      { mois: 1, ca: 500 },
      { mois: 2, charges: 300 },
    ];
    expect(totalCA(partial)).toBe(500);
    expect(totalCharges(partial)).toBe(300);
    expect(totalResultat(partial)).toBe(0);
  });
  test("sumField ignore les valeurs non numériques", () => {
    expect(sumField([{ ca: "abc" }, { ca: 100 }], "ca")).toBe(100);
  });
});
