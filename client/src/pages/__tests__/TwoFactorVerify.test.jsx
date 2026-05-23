import { render, fireEvent, waitFor } from "@testing-library/react";
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
  beforeEach(() => { mockVerify.mockReset(); mockCompleteLogin.mockReset(); });

  test("rend un champ pour saisir le code", () => {
    renderPage();
    // Le composant rend un input de code (TOTP)
    const input = document.querySelector("input");
    expect(input).toBeInTheDocument();
  });

  test("submit appelle twoFactorService.verifyLogin avec tempToken + code", async () => {
    mockVerify.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
    renderPage();
    const input = document.querySelector("input");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.submit(document.querySelector("form"));
    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith("TEMP_TOKEN_ABC", "123456");
    });
  });
});
