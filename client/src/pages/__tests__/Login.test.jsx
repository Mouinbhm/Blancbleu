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
  beforeEach(() => { mockLogin.mockReset(); });

  test("affiche les champs email et password", () => {
    renderLogin();
    expect(document.querySelector('input[name="email"]')).toBeInTheDocument();
    expect(document.querySelector('input[name="password"]')).toBeInTheDocument();
  });

  test("submit vide n'appelle pas login et affiche un message d'erreur", async () => {
    renderLogin();
    const form = document.querySelector("form");
    fireEvent.submit(form);
    expect(mockLogin).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/remplir tous les champs/i)).toBeInTheDocument();
    });
  });

  test("submit avec credentials appelle useAuth().login", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLogin();
    const email = document.querySelector('input[name="email"]');
    const pwd   = document.querySelector('input[name="password"]');
    fireEvent.change(email, { target: { value: "x@y.fr" } });
    fireEvent.change(pwd,   { target: { value: "secret123" } });
    fireEvent.submit(document.querySelector("form"));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("x@y.fr", "secret123"));
  });
});
