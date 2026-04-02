import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the first brush application shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Conductors" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Brush Version 1")).toBeInTheDocument();
  });
});
