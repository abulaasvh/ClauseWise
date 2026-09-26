import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { RiskBadge } from "@/components/RiskBadge";
import { RiskLevel } from "@/lib/types";

describe("RiskBadge", () => {
  it.each([
    ["LOW", "Low Risk", "bg-emerald-50"],
    ["MEDIUM", "Medium Risk", "bg-amber-50"],
    ["HIGH", "High Risk", "bg-rose-50"],
  ] as const)("renders the correct label and color for %s", (level, label, colorClass) => {
    render(<RiskBadge level={level as RiskLevel} />);

    expect(screen.getByRole("status", { name: `Risk level: ${label}` })).toBeInTheDocument();
    expect(screen.getByText(label).parentElement).toHaveClass(colorClass);
  });
});
