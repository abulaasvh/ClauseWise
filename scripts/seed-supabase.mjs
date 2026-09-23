import { createClient } from "@supabase/supabase-js";

const url = "https://yvgruznzvdepuyuqzqxf.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Z3J1em56dmRlcHV5dXF6cXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTkzMjgsImV4cCI6MjEwNTE5NTMyOH0.xNKhYN9HwgiCN9y9hURyFkwK7NHtioxizCWQJDUHad0";

const supabase = createClient(url, anonKey);

const SAMPLE_DOCS = [
  {
    id: "sample-msa-standard",
    fileName: "Apex Systems - Master Services Agreement (v1.0).pdf",
    fileType: "pdf",
    uploadedAt: new Date().toISOString(),
    rawText: "Apex Systems MSA v1.0 standard terms...",
    stats: {
      totalClauses: 11,
      highRisk: 5,
      mediumRisk: 3,
      lowRisk: 3,
      categories: ["General Provisions", "Payment & Pricing", "Auto-Renewal & Term", "Termination", "Indemnification", "Governing Law & Disputes"]
    }
  },
  {
    id: "sample-msa-counter",
    fileName: "Apex Systems - Vendor Counter Proposal (v2.1).docx",
    fileType: "docx",
    uploadedAt: new Date().toISOString(),
    rawText: "Apex Systems Vendor Counter Proposal v2.1...",
    stats: {
      totalClauses: 11,
      highRisk: 5,
      mediumRisk: 3,
      lowRisk: 3,
      categories: ["General Provisions", "Termination", "Auto-Renewal & Term", "Confidentiality", "Intellectual Property", "Indemnification", "Liability & Damages", "Governing Law & Disputes"]
    }
  },
  {
    id: "sample-mutual-nda",
    fileName: "Standard Bilateral Non-Disclosure Agreement.pdf",
    fileType: "pdf",
    uploadedAt: new Date().toISOString(),
    rawText: "Standard Bilateral Non-Disclosure Agreement terms...",
    stats: {
      totalClauses: 9,
      highRisk: 0,
      mediumRisk: 1,
      lowRisk: 8,
      categories: ["Confidentiality", "General Provisions", "Termination", "Governing Law & Disputes"]
    }
  }
];

async function seed() {
  console.log("Seeding documents into Supabase...");
  for (const doc of SAMPLE_DOCS) {
    const { error } = await supabase.from("documents").upsert({
      id: doc.id,
      file_name: doc.fileName,
      file_type: doc.fileType,
      raw_text: doc.rawText,
      stats: doc.stats,
      uploaded_at: doc.uploadedAt,
    });
    if (error) console.error("Error inserting doc:", doc.id, error.message);
    else console.log("Seeded doc:", doc.id);
  }
}

seed();
