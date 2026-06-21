/**
 * Batch J — DecisionImpactPreview. Pins: (1) it lists the effects the caller
 * passes, (2) warning-tone effects are emphasised, (3) it renders nothing for
 * an empty list (no dead panel). It is presentational — it holds no logic.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionImpactPreview } from "./decision-impact";

describe("Batch J — DecisionImpactPreview", () => {
  it("lists the passed effects under the lead line", () => {
    render(
      <DecisionImpactPreview
        title="عند الاعتماد سيتم:"
        effects={[{ label: "إشعار مقدم الطلب" }, { label: "قفل التعديل", tone: "warning" }]}
      />,
    );
    expect(screen.getByText("عند الاعتماد سيتم:")).toBeInTheDocument();
    expect(screen.getByText("إشعار مقدم الطلب")).toBeInTheDocument();
    expect(screen.getByText("قفل التعديل")).toBeInTheDocument();
  });

  it("renders nothing for an empty effect list", () => {
    const { container } = render(<DecisionImpactPreview effects={[]} />);
    expect(container.querySelector('[data-testid="decision-impact"]')).toBeNull();
  });
});
