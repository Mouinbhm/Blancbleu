import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../Login";

const mockLogin = jest.fn();
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin, user: null }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

describe("Login page", () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  test("affiche les champs email et password", () => {
    renderLogin();
    expect(screen.getByTestId("login-email")).toBeInTheDocument();
    expect(screen.getByTestId("login-password")).toBeInTheDocument();
  });

  test("submit vide n'appelle pas login et affiche un message d'erreur", async () => {
    renderLogin();
    fireEvent.click(screen.getByTestId("login-submit"));
    expect(mockLogin).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/remplir tous les champs/i)).toBeInTheDocument();
    });
  });

  test("submit avec credentials appelle useAuth().login", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLogin();
    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "x@y.fr" } });
    fireEvent.change(screen.getByTestId("login-password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByTestId("login-submit"));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("x@y.fr", "secret123"));
  });
});
