import { renderWithProviders, screen } from "../../../test-utils";
import { PatientCard } from "../PatientCard";

let mockTransport = null;
jest.mock("../../../hooks/queries/useTransports", () => ({
  useTransport: () => ({ data: mockTransport, isLoading: false }),
}));

describe("PatientCard", () => {
  test("affiche nom, prénom, téléphone, mobilité", () => {
    mockTransport = {
      patient: {
        nom: "Martin", prenom: "Alice",
        telephone: "0600000000",
        mobilite: "ASSIS",
      },
    };
    renderWithProviders(<PatientCard transportId="x" />);
    expect(screen.getByText("Martin Alice")).toBeInTheDocument();
    expect(screen.getByText("0600000000")).toBeInTheDocument();
    expect(screen.getByText(/Assis/)).toBeInTheDocument();
  });

  test("affiche le badge oxygène si patient.oxygene=true", () => {
    mockTransport = {
      patient: { nom: "Doe", prenom: "John", mobilite: "ALLONGE", oxygene: true },
    };
    renderWithProviders(<PatientCard transportId="x" />);
    expect(screen.getByText(/Oxygène/i)).toBeInTheDocument();
  });

  test("n'affiche pas le badge oxygène si oxygene=false", () => {
    mockTransport = {
      patient: { nom: "Doe", prenom: "John", mobilite: "ASSIS", oxygene: false },
    };
    renderWithProviders(<PatientCard transportId="x" />);
    expect(screen.queryByText(/Oxygène/i)).not.toBeInTheDocument();
  });
});
