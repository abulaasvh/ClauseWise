import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ClauseCard } from "@/components/ClauseCard";
import { ClauseAnalysis, ClauseChunk, RiskLevel } from "@/lib/types";

const chunk: ClauseChunk = {
  id: "clause-1",
  sectionNumber: "4.2",
  title: "Payment Terms",
  text: "Customer shall pay invoices within thirty days.",
  order: 1,
};

function analysis(risk_level: RiskLevel): ClauseAnalysis {
  return {
    clauseId: chunk.id,
    category: "Payment",
    plain_summary: "The customer must pay each invoice within thirty days.",
    risk_level,
    risk_reason: "The payment deadline creates a clear timing obligation.",
    key_terms: ["30 days"],
  };
}

describe("ClauseCard", () => {
  it.each([
    ["LOW", "Low Risk", "bg-emerald-50"],
    ["MEDIUM", "Medium Risk", "bg-amber-50"],
    ["HIGH", "High Risk", "bg-rose-50"],
  ] as const)("renders the %s risk badge", (level, label, colorClass) => {
    render(<ClauseCard chunk={chunk} analysis={analysis(level)} />);

    expect(screen.getByRole("status", { name: new RegExp(label) })).toBeInTheDocument();
    expect(screen.getByRole("status").firstElementChild).toHaveClass(colorClass);
  });

  it("renders the plain-language summary text", () => {
    render(<ClauseCard chunk={chunk} analysis={analysis("LOW")} />);

    expect(screen.getByText("The customer must pay each invoice within thirty days.")).toBeInTheDocument();
    expect(screen.getByText("Plain-Language Summary")).toBeInTheDocument();
  });

  it("renders its applicable detail content without inventing a Retrieved Excerpts toggle", () => {
    render(<ClauseCard chunk={chunk} analysis={analysis("MEDIUM")} />);

    expect(screen.getByText("Risk Assessment Factor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retrieved Excerpts/ })).not.toBeInTheDocument();
  });
});
