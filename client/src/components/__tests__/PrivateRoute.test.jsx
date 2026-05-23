import { render, screen } from "@testing-library/react";
import PrivateRoute from "../PrivateRoute";

let mockAuthState = { user: null, loading: false };
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

describe("PrivateRoute", () => {
  test("redirige vers /login quand user=null (rend <Navigate to=\"/login\">)", () => {
    mockAuthState = { user: null, loading: false };
    render(
      <PrivateRoute>
        <div>PRIVATE_CONTENT</div>
      </PrivateRoute>,
    );
    const nav = screen.getByTestId("navigate");
    expect(nav).toHaveAttribute("data-to", "/login");
    expect(screen.queryByText("PRIVATE_CONTENT")).not.toBeInTheDocument();
  });

  test("rend children quand user existe", () => {
    mockAuthState = { user: { id: "u1", role: "dispatcher" }, loading: false };
    render(
      <PrivateRoute>
        <div>PRIVATE_CONTENT</div>
      </PrivateRoute>,
    );
    expect(screen.getByText("PRIVATE_CONTENT")).toBeInTheDocument();
  });
});
