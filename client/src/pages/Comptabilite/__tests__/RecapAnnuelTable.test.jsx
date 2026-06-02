import { render, screen } from "@testing-library/react";
import RecapAnnuelTable from "../components/RecapAnnuelTable";

const RECAP = [
  { mois: 1, ca: 1000, charges: 600, resultat: 400, marge: 1.6 },
  { mois: 2, ca: 2000, charges: 2500, resultat: -500, marge: 0.8 },
];

describe("RecapAnnuelTable", () => {
  test("recap null → ne rend rien", () => {
    const { container } = render(
      <RecapAnnuelTable recapAnnuel={null} anneeActuelle={2026} moisActuel={2} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("affiche le titre avec l'année", () => {
    render(<RecapAnnuelTable recapAnnuel={RECAP} anneeActuelle={2026} moisActuel={2} />);
    expect(screen.getByText(/Récapitulatif annuel 2026/)).toBeInTheDocument();
  });

  test("ligne TOTAL : résultat positif en emerald", () => {
    // une seule ligne → la valeur du total résultat (+400) est rendue 2 fois
    // (ligne + TOTAL) ; le span coloré du TOTAL porte la classe emerald.
    const positif = [{ mois: 1, ca: 1000, charges: 600, resultat: 400, marge: 1.6 }];
    render(<RecapAnnuelTable recapAnnuel={positif} anneeActuelle={2026} moisActuel={1} />);
    const colored = screen
      .getAllByText((t) => t.includes("400"))
      .find((el) => el.tagName === "SPAN");
    expect(colored).toBeTruthy();
    expect(colored.className).toContain("text-emerald-600");
  });

  test("ligne TOTAL : résultat négatif en rouge", () => {
    const deficit = [{ mois: 1, ca: 100, charges: 900, resultat: -800, marge: 0.1 }];
    render(<RecapAnnuelTable recapAnnuel={deficit} anneeActuelle={2026} moisActuel={1} />);
    const colored = screen
      .getAllByText((t) => t.includes("800"))
      .find((el) => el.tagName === "SPAN");
    expect(colored).toBeTruthy();
    expect(colored.className).toContain("text-red-500");
  });
});
