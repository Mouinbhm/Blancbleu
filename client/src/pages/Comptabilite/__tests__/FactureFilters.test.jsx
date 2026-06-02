import { render, screen, fireEvent } from "@testing-library/react";
import FactureFilters from "../components/FactureFilters";

function setup(props = {}) {
  const onFilterStatut = jest.fn();
  const onSearch = jest.fn();
  const onNouvelle = jest.fn();
  render(
    <FactureFilters
      filterStatut=""
      onFilterStatut={onFilterStatut}
      search=""
      onSearch={onSearch}
      onNouvelle={onNouvelle}
      {...props}
    />,
  );
  return { onFilterStatut, onSearch, onNouvelle };
}

describe("FactureFilters", () => {
  test("clic sur un chip de statut déclenche onFilterStatut avec la valeur", () => {
    const { onFilterStatut } = setup();
    fireEvent.click(screen.getByText("Payée"));
    expect(onFilterStatut).toHaveBeenCalledWith("payee");
  });

  test("saisie dans la recherche déclenche onSearch", () => {
    const { onSearch } = setup();
    fireEvent.change(screen.getByPlaceholderText(/N°, transport, patient/i), {
      target: { value: "Dupont" },
    });
    expect(onSearch).toHaveBeenCalledWith("Dupont");
  });

  test("bouton « Nouvelle facture » déclenche onNouvelle", () => {
    const { onNouvelle } = setup();
    fireEvent.click(screen.getByText(/Nouvelle facture/i));
    expect(onNouvelle).toHaveBeenCalled();
  });
});
