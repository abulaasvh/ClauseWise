import { ClauseChunk } from "./types";

export interface ParseResult {
  rawText: string;
  chunks: ClauseChunk[];
  pageCount?: number;
}

/**
 * Extracts raw text from PDF buffer using pdf-parse dynamically
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    // Dynamic import to avoid SSR/bundling friction
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdf = require("pdf-parse");
    const data = await pdf(buffer);
    return {
      text: data.text || "",
      pageCount: data.numpages || 1,
    };
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error(`Failed to parse PDF document: ${(error as Error).message}`);
  }
}

/**
 * Extracts raw text from DOCX buffer using mammoth
 */
export async function parseDocxBuffer(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value || "",
      pageCount: 1,
    };
  } catch (error) {
    console.error("DOCX parsing error:", error);
    throw new Error(`Failed to parse DOCX document: ${(error as Error).message}`);
  }
}

/**
 * Section boundary detection patterns for contracts and legal documents
 */
const SECTION_PATTERNS = [
  // "Section 1.2 Title" or "Section 4: Title" or "Section 5 - Title"
  /^(?:Section|SECTION)\s+([0-9]+(?:\.[0-9]+)*)[:.-]?\s*([^\n\r]*)/i,
  // "Article I. Title" or "ARTICLE 3 - Title"
  /^(?:Article|ARTICLE)\s+([IVXLCDM0-9]+)[:.-]?\s*([^\n\r]*)/i,
  // "1.2 Title" or "4. Title" or "12. Title"
  /^([0-9]{1,2}(?:\.[0-9]+)+)\.?\s+([A-Z][^\n\r]{2,80})/,
  /^([0-9]{1,2}\.)\s+([A-Z][^\n\r]{2,80})/,
  // Clauses like "1. DEFINITIONS" or "8. INDEMNIFICATION"
  /^([0-9]{1,2})\.\s+([A-Z\s,/-]{3,60})$/,
  // Lettered subclauses: "(a) Term", "(b) Payment"
  /^(\([a-z0-9]+\))\s+([^\n\r]{3,80})/i,
];

/**
 * Splits raw document text into structured, coherent clause chunks
 * preserving section numbers, headings, and order.
 */
export function chunkDocumentText(rawText: string): ClauseChunk[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  // Normalize line breaks
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Split into raw paragraphs / candidate blocks
  const lines = normalized.split("\n");
  const blocks: { header?: { num: string; title: string }; lines: string[] }[] = [];
  
  let currentBlock: { header?: { num: string; title: string }; lines: string[] } = {
    lines: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      // Empty line - check if current block has enough lines to preserve
      if (currentBlock.lines.length > 0) {
        currentBlock.lines.push("");
      }
      continue;
    }

    // Check if line matches a new section boundary
    let matchedHeader: { num: string; title: string } | null = null;
    for (const pattern of SECTION_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const num = match[1]?.trim() || "";
        const title = match[2]?.trim() || "";
        // Avoid false positives for currency or random punctuation
        if (num && !num.includes("$")) {
          matchedHeader = { num, title };
          break;
        }
      }
    }

    if (matchedHeader) {
      // If we already have lines collected, push current block
      if (currentBlock.lines.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        header: matchedHeader,
        lines: [line],
      };
    } else {
      currentBlock.lines.push(line);
    }
  }

  if (currentBlock.lines.length > 0) {
    blocks.push(currentBlock);
  }

  // Refine blocks into final chunks
  const chunks: ClauseChunk[] = [];
  let chunkIndex = 1;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const textContent = b.lines.join("\n").trim();
    
    // Skip empty chunks
    if (!textContent || textContent.length < 15) {
      continue;
    }

    let sectionNum = "";
    let sectionTitle = "";

    if (b.header) {
      sectionNum = b.header.num.replace(/[.:]$/, "").trim();
      sectionTitle = b.header.title.trim();
    }

    // If no header was detected from regex, synthesize a clean label
    if (!sectionNum) {
      // Try to see if first line is a title or if it's general introductory preamble
      const firstLine = b.lines[0]?.trim() || "";
      if (i === 0 && (firstLine.toLowerCase().includes("agreement") || firstLine.toLowerCase().includes("contract") || firstLine.toLowerCase().includes("parties"))) {
        sectionNum = "Preamble";
        sectionTitle = "Parties & Recitals";
      } else if (firstLine.length < 60 && /^[A-Z0-9\s:.-]+$/.test(firstLine)) {
        sectionNum = `Section ${chunkIndex}`;
        sectionTitle = firstLine;
      } else {
        sectionNum = `Section ${chunkIndex}`;
        sectionTitle = `Clause ${chunkIndex}`;
      }
    }

    if (!sectionTitle) {
      sectionTitle = `Clause ${sectionNum}`;
    }

    // Clean title of repetitive section prefixes
    sectionTitle = sectionTitle
      .replace(/^(Section|Article)\s+[0-9IVXLCDM.]+[:.-]?\s*/i, "")
      .trim();
    if (!sectionTitle) {
      sectionTitle = `Provision ${sectionNum}`;
    }

    chunks.push({
      id: `clause-${chunkIndex}-${Date.now().toString(36)}`,
      sectionNumber: sectionNum.startsWith("Section") || sectionNum.startsWith("Article") || sectionNum.startsWith("Preamble")
        ? sectionNum
        : `Section ${sectionNum}`,
      title: sectionTitle,
      text: textContent,
      pageNumber: Math.max(1, Math.ceil(chunkIndex / 4)), // Approximate page reference
      order: chunkIndex,
    });

    chunkIndex++;
  }

  // If chunking produced too few chunks because the document had no headers, split by double newlines
  if (chunks.length <= 1 && rawText.length > 500) {
    return fallbackParagraphChunking(rawText);
  }

  return chunks;
}

/**
 * Fallback chunker when standard legal header patterns are sparse or absent
 */
function fallbackParagraphChunking(rawText: string): ClauseChunk[] {
  const paragraphs = rawText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  return paragraphs.map((p, idx) => {
    const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || "";
    const isHeadingLike = firstLine.length < 60 && !firstLine.endsWith(".");

    const num = `Clause ${idx + 1}`;
    const title = isHeadingLike ? firstLine : `Provision ${idx + 1}`;

    return {
      id: `clause-${idx + 1}-${Date.now().toString(36)}`,
      sectionNumber: num,
      title: title,
      text: p,
      pageNumber: Math.max(1, Math.ceil((idx + 1) / 4)),
      order: idx + 1,
    };
  });
}
