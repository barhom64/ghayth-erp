import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

// Validates the component-test harness itself (jsdom + testing-library): a
// React component renders into the DOM, jest-dom matchers work, and state
// updates re-render. This is the gate that future behavioural tests (e.g.
// ProductSelect snap-to-catalog) rely on.

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button onClick={() => setN((v) => v + 1)}>العدّاد: {n}</button>
  );
}

describe("component test harness", () => {
  it("renders a React component into jsdom with working matchers", () => {
    render(<div>مرحبا غيث</div>);
    expect(screen.getByText("مرحبا غيث")).toBeInTheDocument();
  });

  it("re-renders on state change", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<Counter />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("العدّاد: 0");
    await userEvent.click(btn);
    expect(btn).toHaveTextContent("العدّاد: 1");
  });
});
