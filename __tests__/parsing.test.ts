import { chunkDocumentText } from "@/lib/parsing";

describe("lib/parsing.ts - chunkDocumentText", () => {
  it("splits a structured sample contract into expected clauses with section numbers and titles", () => {
    const sampleContract = `
Section 1.1 Definitions and Interpretation
In this Agreement, the following terms shall have the meanings set forth below. "Confidential Information" refers to any non-public proprietary materials.

Section 1.2 Term and Termination
This Agreement shall commence on the Effective Date and continue for a period of one (1) year unless terminated earlier by either party upon thirty (30) days written notice.

Section 2.0 Fees and Payment Terms
Customer shall pay all invoices within forty-five (45) days of receipt. Late payments shall accrue interest at 1.5% per month.

Section 3.1 Indemnification Obligations
Vendor agrees to indemnify, defend, and hold harmless Customer against any third-party claims arising out of gross negligence or willful misconduct.

Section 4.0 Governing Law and Venue
This Agreement shall be governed by and construed in accordance with the laws of the State of California, without regard to conflict of laws principles.
`.trim();

    const chunks = chunkDocumentText(sampleContract);

    expect(chunks.length).toBe(5);

    // Section 1.1
    expect(chunks[0].sectionNumber).toBe("Section 1.1");
    expect(chunks[0].title).toBe("Definitions and Interpretation");
    expect(chunks[0].text).toContain("Confidential Information");

    // Section 1.2
    expect(chunks[1].sectionNumber).toBe("Section 1.2");
    expect(chunks[1].title).toBe("Term and Termination");
    expect(chunks[1].text).toContain("one (1) year");

    // Section 2.0
    expect(chunks[2].sectionNumber).toBe("Section 2.0");
    expect(chunks[2].title).toBe("Fees and Payment Terms");
    expect(chunks[2].text).toContain("forty-five (45) days");

    // Section 3.1
    expect(chunks[3].sectionNumber).toBe("Section 3.1");
    expect(chunks[3].title).toBe("Indemnification Obligations");
    expect(chunks[3].text).toContain("gross negligence");

    // Section 4.0
    expect(chunks[4].sectionNumber).toBe("Section 4.0");
    expect(chunks[4].title).toBe("Governing Law and Venue");
    expect(chunks[4].text).toContain("State of California");
  });

  it("handles contracts with a preamble title followed by numbered sections", () => {
    const sample = `
MASTER SERVICES AGREEMENT
This agreement is entered into between Acme Corp and Beta LLC.

Section 1. Services
Vendor shall provide cloud analysis services.
`.trim();

    const chunks = chunkDocumentText(sample);
    expect(chunks.length).toBe(2);
    expect(chunks[0].sectionNumber).toBe("Preamble");
    expect(chunks[0].title).toBe("Parties & Recitals");
    expect(chunks[1].sectionNumber).toBe("Section 1");
  });

  it("handles numbered and lettered subsection formats (e.g., Article, Roman numerals, Parentheses)", () => {
    const sampleText = `
ARTICLE I: SCOPE OF SERVICES
Provider will deliver the consulting deliverables described in Exhibit A.

ARTICLE II: LIMITATION OF LIABILITY
Neither party shall be liable for indirect, incidental, or consequential damages.

(a) Data Privacy
Each party shall comply with applicable data protection regulations including GDPR and CCPA.
`.trim();

    const chunks = chunkDocumentText(sampleText);

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const scopeClause = chunks.find((c) => c.sectionNumber.includes("I") || c.title.includes("SCOPE"));
    expect(scopeClause).toBeDefined();

    const liabilityClause = chunks.find((c) => c.title.includes("LIMITATION OF LIABILITY"));
    expect(liabilityClause).toBeDefined();
  });

  it("returns empty array when provided empty or whitespace-only text", () => {
    expect(chunkDocumentText("")).toEqual([]);
    expect(chunkDocumentText("   \n\n\t  ")).toEqual([]);
  });

  it("assigns sequential positive order numbers to each extracted chunk", () => {
    const sample = `
Section 1. First
Content 1 is sufficiently long to not be skipped.

Section 2. Second
Content 2 is sufficiently long to not be skipped.

Section 3. Third
Content 3 is sufficiently long to not be skipped.
`.trim();

    const chunks = chunkDocumentText(sample);
    expect(chunks.length).toBe(3);
    expect(chunks[0].order).toBe(1);
    expect(chunks[1].order).toBe(2);
    expect(chunks[2].order).toBe(3);
  });
});
