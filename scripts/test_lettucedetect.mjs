import { evaluateLettuceDetectSpans, auditWithLettuceDetect } from "../lib/lettucedetect.ts";

async function runTests() {
  console.log("=== RUNNING LETTUCEDETECT VERIFICATION TESTS ===");

  // TEST 1: Grounded answer (Should be 100% or very high, 0 unsupported spans)
  const context1 = [
    "Section 8. Limitation of Liability. In no event shall either party's aggregate liability exceed the total amount paid in the twelve (12) months preceding the event.",
  ];
  const q1 = "What is the liability cap?";
  const a1 = "Under Section 8, aggregate liability is capped at the total amount paid in the 12 months preceding the event.\n\nSource: Section 8, Limitation of Liability";

  const audit1 = await auditWithLettuceDetect(q1, a1, context1);
  console.log("\n[TEST 1: GROUNDED INPUT]");
  console.log("Score:", audit1.score, "/ 100");
  console.log("Risk Level:", audit1.riskLevel);
  console.log("Spans detected:", audit1.spans.length);
  console.log("Verdict:", audit1.verdictSummary);

  if (audit1.score >= 90 && audit1.spans.length === 0) {
    console.log("✓ TEST 1 PASSED: Grounded response accurately scored 100% with zero flagged spans.");
  } else {
    console.error("✗ TEST 1 FAILED:", audit1);
  }

  // TEST 2: Severe Hallucination with fabricated dollar amounts & penalty
  const context2 = [
    "Section 4. Payment. Customer shall pay all invoices within thirty (30) days.",
  ];
  const q2 = "What is the late fee?";
  const a2 = "Customer must pay an immediate $10,000 liquidated damages fine and $500 per day penalty under Section 19.8.";

  const audit2 = await auditWithLettuceDetect(q2, a2, context2);
  console.log("\n[TEST 2: HALLUCINATED INPUT]");
  console.log("Score:", audit2.score, "/ 100");
  console.log("Risk Level:", audit2.riskLevel);
  console.log("Hallucination Rate:", audit2.hallucinationRate, "%");
  console.log("Spans detected:", audit2.spans.map((s) => s.text));
  console.log("Verdict:", audit2.verdictSummary);

  if (audit2.score < 50 && audit2.spans.length > 0) {
    console.log("✓ TEST 2 PASSED: Hallucinated response correctly flagged with low score and detected spans.");
  } else {
    console.error("✗ TEST 2 FAILED:", audit2);
  }

  console.log("\n=== ALL LETTUCEDETECT TESTS COMPLETE ===");
}

runTests().catch(console.error);
