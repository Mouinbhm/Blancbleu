import { render, screen } from "@testing-library/react";
import { Badge } from "../Badge";

describe("Badge", () => {
  test.each([
    ["slate",  "bg-slate-100"],
    ["blue",   "bg-blue-100"],
    ["green",  "bg-emerald-100"],
    ["yellow", "bg-amber-100"],
    ["red",    "bg-red-100"],
    ["purple", "bg-purple-100"],
  ])("rend la classe attendue pour la variante %s", (variant, cls) => {
    render(<Badge variant={variant}>X</Badge>);
    expect(screen.getByText("X").className).toMatch(cls);
  });
});
