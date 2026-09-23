import { ParsedDocument, ClauseChunk, ClauseAnalysis } from "./types";
import { chunkDocumentText } from "./parsing";
import { fallbackClauseAnalysis } from "./claude";
import { getVectorStore } from "./vectorstore";

import fs from "fs";
import path from "path";
import { saveDocumentToSupabase, fetchDocumentFromSupabase } from "./supabase";

// Global in-memory storage for documents
const documentsMap = new Map<string, ParsedDocument>();

const STORAGE_DIR = path.join(process.cwd(), ".storage");
const STORAGE_FILE = path.join(STORAGE_DIR, "documents.json");

function ensureStorage(): void {
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
  } catch {
    // Ignore in read-only environments
  }
}

function loadPersistedFromDisk(): void {
  ensureStorage();
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, "utf-8");
      const docs: ParsedDocument[] = JSON.parse(data);
      for (const d of docs) {
        if (!documentsMap.has(d.id)) {
          documentsMap.set(d.id, d);
          const store = getVectorStore(d.id);
          store
            .indexChunks(d.chunks)
            .then(() => {
              // Ensure disk cache is up to date with embeddings
              persistToDisk();
            })
            .catch(() => { });
        }
      }
    }
  } catch (e) {
    console.warn("Could not load documents from disk:", e);
  }
}

function persistToDisk(): void {
  ensureStorage();
  try {
    const docs = Array.from(documentsMap.values());
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(docs, null, 2), "utf-8");
  } catch (e) {
    console.warn("Could not persist documents to disk:", e);
  }
}

export function saveDocument(doc: ParsedDocument): void {
  documentsMap.set(doc.id, doc);
  persistToDisk();
  // Sync to Supabase in background
  saveDocumentToSupabase(doc).catch(() => { });
}

export async function getDocumentAsync(id: string): Promise<ParsedDocument | undefined> {
  ensureSamplesLoaded();
  let doc = documentsMap.get(id);
  if (doc) return doc;

  // Try loading from disk
  loadPersistedFromDisk();
  doc = documentsMap.get(id);
  if (doc) return doc;

  // Try loading from Supabase
  try {
    const supaDoc = await fetchDocumentFromSupabase(id);
    if (supaDoc) {
      saveDocument(supaDoc);
      return supaDoc;
    }
  } catch {
    // ignore
  }

  return undefined;
}

export function getDocument(id: string): ParsedDocument | undefined {
  ensureSamplesLoaded();
  let doc = documentsMap.get(id);
  if (doc) return doc;

  loadPersistedFromDisk();
  return documentsMap.get(id);
}

export function getAllDocuments(): ParsedDocument[] {
  ensureSamplesLoaded();
  loadPersistedFromDisk();
  return Array.from(documentsMap.values());
}

let samplesLoaded = false;

export function ensureSamplesLoaded(): void {
  if (samplesLoaded) return;
  samplesLoaded = true;

  // Sample 1: Standard SaaS Master Services Agreement
  createAndRegisterSample(
    "sample-msa-standard",
    "Apex Systems - Master Services Agreement (v1.0).pdf",
    "pdf",
    SAMPLE_MSA_TEXT
  );

  // Sample 2: Vendor Counter-Proposal (for comparison mode)
  createAndRegisterSample(
    "sample-msa-counter",
    "Apex Systems - Vendor Counter Proposal (v2.1).docx",
    "docx",
    SAMPLE_MSA_COUNTER_TEXT
  );

  // Sample 3: Mutual NDA
  createAndRegisterSample(
    "sample-mutual-nda",
    "Standard Bilateral Non-Disclosure Agreement.pdf",
    "pdf",
    SAMPLE_NDA_TEXT
  );
}

function createAndRegisterSample(
  id: string,
  fileName: string,
  fileType: "pdf" | "docx" | "text",
  rawText: string
): void {
  if (documentsMap.has(id)) return;

  const chunks = chunkDocumentText(rawText);
  const analyses: Record<string, ClauseAnalysis> = {};

  let highCount = 0;
  let medCount = 0;
  let lowCount = 0;
  const categoriesSet = new Set<string>();

  for (const chunk of chunks) {
    const analysis = fallbackClauseAnalysis(chunk.id, chunk.sectionNumber, chunk.title, chunk.text);
    analyses[chunk.id] = analysis;
    categoriesSet.add(analysis.category);

    if (analysis.risk_level === "HIGH") highCount++;
    else if (analysis.risk_level === "MEDIUM") medCount++;
    else lowCount++;
  }

  const doc: ParsedDocument = {
    id,
    fileName,
    fileType,
    uploadedAt: new Date().toISOString(),
    rawText,
    chunks,
    analyses,
    stats: {
      totalClauses: chunks.length,
      highRisk: highCount,
      mediumRisk: medCount,
      lowRisk: lowCount,
      categories: Array.from(categoriesSet),
    },
  };

  documentsMap.set(id, doc);

  // Index into vector store asynchronously
  const store = getVectorStore(id);
  store.indexChunks(chunks).catch((err) => console.error("Index chunks error:", err));
}

// -------------------------------------------------------------
// Sample Legal Document Texts
// -------------------------------------------------------------

const SAMPLE_MSA_TEXT = `MASTER SERVICES AGREEMENT

This Master Services Agreement ("Agreement") is entered into as of October 1, 2025 ("Effective Date"), by and between Apex Systems Inc., a Delaware corporation ("Customer"), and CloudScale Technologies LLC, a California limited liability company ("Provider").

1. SERVICES AND ACCESS
Provider shall provide Customer with access to the Hosted Cloud Platform and associated professional configuration services described in the applicable Statement of Work ("SOW"). Provider grants Customer a non-exclusive, non-transferable right to access the Services solely for Customer's internal business operations during the Term.

2. FEES AND PAYMENT TERMS
Customer shall pay all undisputed fees set forth in each SOW within thirty (30) days of receipt of invoice ("Net 30"). Late payments shall bear interest at the rate of 1.5% per month or the maximum rate permitted by law, whichever is less. All fees are non-refundable except as expressly provided herein. Customer is responsible for all applicable sales, use, and excise taxes.

3. TERM AND AUTOMATIC RENEWAL
This Agreement commences on the Effective Date and continues for an initial term of twelve (12) months. Thereafter, this Agreement and all active SOWs shall automatically renew for successive twelve (12) month periods, unless either party gives written notice of non-renewal at least sixty (60) days prior to the expiration of the then-current term.

4. TERMINATION FOR CAUSE
Either party may terminate this Agreement immediately upon written notice if the other party materially breaches this Agreement and fails to cure such breach within thirty (30) days of receiving written notice specifying the breach. In the event of Customer's failure to pay undisputed fees within forty-five (45) days, Provider may suspend Services upon five (5) business days' notice.

5. CONFIDENTIALITY
Each party ("Recipient") agrees to retain in strict confidence all non-public technical, commercial, and financial information disclosed by the other party ("Discloser"). Recipient shall protect Discloser's Confidential Information with the same degree of care it uses for its own confidential materials, but not less than reasonable care. These confidentiality obligations shall survive for a period of five (5) years following expiration or termination of this Agreement.

6. INTELLECTUAL PROPERTY AND WORK PRODUCT
Customer retains all right, title, and interest in and to Customer Data. Provider retains all right, title, and interest in and to the Platform, underlying software, APIs, algorithms, and any improvements or modifications thereto. Any custom scripts or integration deliverables developed under an SOW shall be deemed "work made for hire" owned exclusively by Customer upon full payment.

7. INDEMNIFICATION BY PROVIDER
Provider shall defend, indemnify, and hold harmless Customer, its officers, directors, and employees from and against any third-party claims, suits, or proceedings alleging that the Services infringe or misappropriate any third-party patent, copyright, or trademark. Provider shall pay all damages, defense costs, and attorney fees finally awarded against Customer.

8. INDEMNIFICATION BY CUSTOMER
Customer shall defend, indemnify, and hold harmless Provider from and against any third-party claims arising out of or relating to: (a) Customer Data; (b) Customer's violation of Applicable Data Privacy Laws; or (c) Customer's breach of Section 1 (Services and Access).

9. LIMITATION OF LIABILITY
EXCEPT FOR CLAIMS ARISING UNDER SECTION 5 (CONFIDENTIALITY) OR SECTION 7 (PROVIDER INDEMNIFICATION), NEITHER PARTY SHALL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES. EXCEPT FOR INDEMNIFICATION OBLIGATIONS, EACH PARTY'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL NOT EXCEED THE TOTAL FEES PAID OR PAYABLE BY CUSTOMER IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.

10. GOVERNING LAW AND DISPUTE RESOLUTION
This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflicts of law principles. Any dispute arising under this Agreement shall be resolved exclusively in the state or federal courts located in New Castle County, Delaware, and each party irrevocably submits to such personal jurisdiction.`;

const SAMPLE_MSA_COUNTER_TEXT = `MASTER SERVICES AGREEMENT (VENDOR REVISED DRAFT)

This Master Services Agreement ("Agreement") is dated October 10, 2025, between Apex Systems Inc. ("Customer") and CloudScale Technologies LLC ("Provider").

1. SERVICES AND ACCESS
Provider will grant Customer access to the Cloud Platform. All access is conditioned upon Customer maintaining strict compliance with Provider's Acceptable Use Policy, which Provider may amend from time to time with ten (10) days' posted notice.

2. FEES AND PAYMENT TERMS
Customer shall pay all fees within fifteen (15) calendar days of invoice date. Overdue amounts incur interest at 2.0% per month. If payment is delayed past twenty (20) days, Provider reserves the right to terminate access without notice. All setup and subscription fees are non-refundable under all circumstances.

3. TERM AND AUTOMATIC RENEWAL
The Initial Term shall be thirty-six (36) months. This Agreement automatically renews for successive twenty-four (24) month periods unless Customer provides written notice of cancellation at least ninety (90) days prior to the expiration date.

4. TERMINATION RIGHTS
Provider may terminate this Agreement for convenience upon thirty (30) days' written notice to Customer. Customer may only terminate for cause upon ninety (90) days' written notice and must afford Provider a sixty (60) day period to cure any alleged deficiency.

5. CONFIDENTIALITY
Each party shall keep confidential the terms of this Agreement and proprietary trade secrets. The confidentiality obligation for trade secrets shall last indefinitely, while general business terms expire three (3) years from disclosure.

6. INTELLECTUAL PROPERTY AND WORK PRODUCT
Provider retains sole and exclusive ownership of all software, scripts, workflows, custom configurations, and derivatives created during the engagement. Customer is granted a revocable, non-transferable license to use deliverables solely during the active subscription period.

7. INDEMNIFICATION BY PROVIDER
Provider's obligation to indemnify Customer for intellectual property infringement claims is strictly conditioned on Customer using unaltered software, and Provider's maximum aggregate liability for any and all indemnification obligations shall be capped at $50,000 total.

8. INDEMNIFICATION BY CUSTOMER
Customer agrees to broadly defend and hold harmless Provider against all claims, regulatory inquiries, fines, losses, and damages arising from Customer's use of the Platform or any third-party claims brought against Provider related to Customer's operations.

9. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROVIDER'S TOTAL AGGREGATE LIABILITY FOR ANY AND ALL CLAIMS UNDER THIS AGREEMENT, WHETHER IN CONTRACT, TORT, OR INDEMNITY, SHALL NOT EXCEED $10,000 OR THE FEES PAID IN THE PAST THREE (3) MONTHS, WHICHEVER IS LESS. PROVIDER DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.

10. GOVERNING LAW AND DISPUTE RESOLUTION
This Agreement is governed by the laws of the State of California. Any disputes must be submitted to binding individual arbitration under AAA rules in San Francisco, California. Customer expressly waives any right to participate in a class action lawsuit or jury trial.`;

const SAMPLE_NDA_TEXT = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("NDA") is made between Innovate Labs Inc. and Horizon Ventures LLC as of November 1, 2025.

1. PURPOSE
The parties wish to explore a potential strategic business collaboration and investment opportunity ("Transaction").

2. CONFIDENTIAL INFORMATION
"Confidential Information" refers to any proprietary information, technical data, trade secrets, software code, customer lists, financial forecasts, and business strategies disclosed by either party to the other, whether marked as confidential or reasonably understood to be confidential.

3. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party agrees: (a) to hold all Confidential Information in strict trust; (b) not to disclose it to any third party except to employees, directors, and professional legal/financial advisors who need to know; and (c) not to use Confidential Information for any purpose other than evaluating the Transaction.

4. EXCLUSIONS FROM CONFIDENTIALITY
Confidential Information does not include information that: (i) is or becomes publicly known through no breach by Receiving Party; (ii) was already in Receiving Party's possession prior to disclosure; (iii) is independently developed without reference to Disclosing Party's information; or (iv) is rightfully received from a third party without restriction.

5. RETURN OR DESTRUCTION OF MATERIALS
Upon written request or termination of discussions, Receiving Party shall promptly return or destroy all documents, notes, copies, and extracts containing Confidential Information, certifying such destruction in writing within ten (10) business days.

6. TERM AND DURATION OF SECRECY
This Agreement shall govern disclosures made within one (1) year of the Effective Date. The obligation of confidentiality shall survive for five (5) years following disclosure, provided that trade secrets shall remain protected for as long as they qualify as trade secrets under applicable law.

7. INJUNCTIVE RELIEF
Each party acknowledges that any unauthorized disclosure or breach would cause irreparable harm for which monetary damages alone would be inadequate. Accordingly, Disclosing Party shall be entitled to seek immediate injunctive relief in any court of competent jurisdiction without the requirement of posting a bond.

8. GOVERNING LAW
This NDA shall be governed by the laws of the State of New York. The parties consent to the exclusive jurisdiction of the state and federal courts located in New York County, New York.`;
