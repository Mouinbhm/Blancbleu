import { render, screen } from "@testing-library/react";
import FactureStatusBadge from "../components/FactureStatusBadge";
import { STATUT_STYLE } from "../utils/factureConstants";

describe("FactureStatusBadge", () => {
  test("affiche le label correct + classe couleur pour 'payee'", () => {
    render(<FactureStatusBadge statut="payee" />);
    const el = screen.getByText("Payée");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("bg-emerald-100");
    expect(el.className).toContain("text-emerald-700");
  });

  test("'annulee' utilise la couleur rouge", () => {
    render(<FactureStatusBadge statut="annulee" />);
    const el = screen.getByText("Annulée");
    expect(el.className).toContain("bg-red-100");
  });

  test("statut inconnu → fallback 'en_attente'", () => {
    render(<FactureStatusBadge statut="statut_bidon" />);
    expect(screen.getByText(STATUT_STYLE.en_attente.label)).toBeInTheDocument();
  });
});
