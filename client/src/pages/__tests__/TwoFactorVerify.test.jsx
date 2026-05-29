import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TwoFactorVerify from "../TwoFactorVerify";

const mockCompleteLogin = jest.fn();
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    pendingTempToken: "TEMP_TOKEN_ABC",
    completeTwoFactorLogin: mockCompleteLogin,
  }),
}));

const mockVerify = jest.fn();
jest.mock("../../services/api", () => ({
  twoFactorService: { verifyLogin: (...args) => mockVerify(...args) },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <TwoFactorVerify />
    </MemoryRouter>,
  );
}

describe("TwoFactorVerify page", () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockCompleteLogin.mockReset();
  });

  test("rend un champ pour saisir le code", () => {
    renderPage();
    // L'input de code TOTP est un type="text" (rôle textbox).
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  test("submit appelle twoFactorService.verifyLogin avec tempToken + code", async () => {
    mockVerify.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "123456" } });
    // Clic sur le bouton submit du form (les boutons type="submit" sont
    // identifiables par leur rôle button — le seul rôle button "submit" du
    // composant est celui du form).
    fireEvent.click(screen.getByRole("button", { name: /vérifier|valider|continuer|connecter/i }));
    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith("TEMP_TOKEN_ABC", "123456");
    });
  });
});
