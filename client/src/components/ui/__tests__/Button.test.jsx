import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button";

describe("Button", () => {
  test("rend children + déclenche onClick au click", () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Valider</Button>);
    fireEvent.click(screen.getByRole("button", { name: /valider/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("désactive le click quand loading=true", () => {
    const onClick = jest.fn();
    render(<Button loading onClick={onClick}>OK</Button>);
    const btn = screen.getByRole("button", { name: /ok/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("applique la variante danger (classe rouge)", () => {
    render(<Button variant="danger">Supprimer</Button>);
    const btn = screen.getByRole("button", { name: /supprimer/i });
    expect(btn.className).toMatch(/bg-red-600/);
  });
});
