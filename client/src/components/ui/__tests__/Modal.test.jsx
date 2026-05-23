import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "../Modal";

describe("Modal", () => {
  test("ne rend rien quand open=false", () => {
    render(<Modal open={false} title="Test"><p>Hello</p></Modal>);
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  test("affiche le titre + children quand open=true", () => {
    render(<Modal open title="Titre modal"><p>Corps</p></Modal>);
    expect(screen.getByText("Titre modal")).toBeInTheDocument();
    expect(screen.getByText("Corps")).toBeInTheDocument();
  });

  test("appelle onClose au press Escape", () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="X">contenu</Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
