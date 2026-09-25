import { parseRiskCategorizationJson } from "@/lib/claude";

describe("lib/claude.ts - parseRiskCategorizationJson", () => {
  it("correctly parses a clean JSON response into category, plain_summary, risk_level, and risk_reason", () => {
    const rawResponse = JSON.stringify({
      category: "Indemnification",
      plain_summary: "The vendor must pay for any damages caused by their software.",
      risk_level: "HIGH",
      risk_reason: "Exposes vendor to uncapped third-party claims.",
      key_terms: ["indemnify", "hold harmless", "damages"],
    });

    const parsed = parseRiskCategorizationJson(rawResponse, "test-clause-1");

    expect(parsed).not.toBeNull();
    expect(parsed?.clauseId).toBe("test-clause-1");
    expect(parsed?.category).toBe("Indemnification");
    expect(parsed?.plain_summary).toBe("The vendor must pay for any damages caused by their software.");
    expect(parsed?.risk_level).toBe("HIGH");
    expect(parsed?.risk_reason).toBe("Exposes vendor to uncapped third-party claims.");
    expect(parsed?.key_terms).toEqual(["indemnify", "hold harmless", "damages"]);
  });

  it("extracts and parses JSON wrapped in markdown code fences and conversational preamble/postscript", () => {
    const rawResponse = `
Here is the legal analysis for the clause:

\`\`\`json
{
  "category": "Limitation of Liability",
  "plain_summary": "Caps maximum monetary damages at twelve months of fees.",
  "risk_level": "MEDIUM",
  "risk_reason": "Limits customer recovery in the event of major outage.",
  "key_terms": ["aggregate liability", "12 months"]
}
\`\`\`

Please consult counsel before executing the contract.
`;

    const parsed = parseRiskCategorizationJson(rawResponse, "clause-md-1");

    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe("Limitation of Liability");
    expect(parsed?.risk_level).toBe("MEDIUM");
    expect(parsed?.plain_summary).toContain("Caps maximum monetary damages");
  });

  it("applies safety guardrail filters to prescriptive statements in summaries and reasons", () => {
    const rawResponse = JSON.stringify({
      category: "Termination",
      plain_summary: "You should sign this agreement because you must accept the 30-day notice period.",
      risk_level: "HIGH",
      risk_reason: "You shouldn't sign because this is illegal under state statute.",
    });

    const parsed = parseRiskCategorizationJson(rawResponse, "clause-guardrail");

    expect(parsed).not.toBeNull();
    // Guardrail filter rewrites "you should sign" -> "parties typically evaluate this with counsel"
    expect(parsed?.plain_summary).not.toContain("you should sign");
    expect(parsed?.plain_summary).toContain("parties typically evaluate this with counsel");

    // Guardrail filter rewrites "you shouldn't sign" -> "this provision warrants review with an attorney"
    expect(parsed?.risk_reason).not.toContain("you shouldn't sign");
    expect(parsed?.risk_reason).toContain("this provision warrants review with an attorney");

    // Guardrail filter rewrites "this is illegal" -> "this provision creates high compliance and regulatory risk"
    expect(parsed?.risk_reason).not.toContain("this is illegal");
    expect(parsed?.risk_reason).toContain("this provision creates high compliance and regulatory risk");
  });

  it("defaults invalid risk levels to 'LOW' and defaults missing fields safely", () => {
    const rawResponse = JSON.stringify({
      category: "",
      plain_summary: "Brief description",
      risk_level: "EXTREME_DANGER", // Invalid risk level
    });

    const parsed = parseRiskCategorizationJson(rawResponse);

    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe("General");
    expect(parsed?.risk_level).toBe("LOW");
    expect(parsed?.risk_reason).toBe("Standard contract provision.");
  });

  it("returns null on malformed or non-JSON strings", () => {
    expect(parseRiskCategorizationJson("")).toBeNull();
    expect(parseRiskCategorizationJson("No JSON object here")).toBeNull();
    expect(parseRiskCategorizationJson("{ unclosed json: true ")).toBeNull();
  });
});
