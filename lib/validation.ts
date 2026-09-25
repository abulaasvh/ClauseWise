/**
 * lib/validation.ts
 * Centralized server-side input validation and payload sanitization
 * for ClauseWise API routes.
 */

export const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DIRECT_TEXT_LENGTH = 1_000_000;             // 1 million characters
export const MAX_QUESTION_LENGTH = 2_000;                    // 2,000 characters
export const MAX_CLAUSE_TEXT_LENGTH = 50_000;                // 50,000 characters
export const MAX_ID_LENGTH = 128;

// Allowed extensions and MIME types for document processing
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".md"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  // Some browsers send generic octet-stream for docx or txt
  "application/octet-stream",
]);

// Magic number signatures
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK.. (DOCX is a zip)

const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export interface ValidationSuccess<T> {
  valid: true;
  data: T;
}

export interface ValidationFailure {
  valid: false;
  error: string;
  statusCode: number;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validates document identifier format to prevent injection and directory traversal.
 */
export function validateDocumentId(id: unknown): ValidationResult<string> {
  if (typeof id !== "string" || !id.trim()) {
    return { valid: false, error: "documentId is required.", statusCode: 400 };
  }
  const cleanId = id.trim();
  if (cleanId.length > MAX_ID_LENGTH) {
    return {
      valid: false,
      error: `documentId exceeds maximum length of ${MAX_ID_LENGTH} characters.`,
      statusCode: 400,
    };
  }
  if (!SAFE_ID_REGEX.test(cleanId)) {
    return {
      valid: false,
      error: "documentId contains invalid characters. Only alphanumeric, dashes, and underscores are allowed.",
      statusCode: 400,
    };
  }
  return { valid: true, data: cleanId };
}

/**
 * Validates chat question inputs.
 */
export function validateChatInput(body: unknown): ValidationResult<{
  documentId: string;
  question: string;
}> {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object.", statusCode: 400 };
  }
  const { documentId, question } = body as Record<string, unknown>;

  const idCheck = validateDocumentId(documentId);
  if (!idCheck.valid) return idCheck;

  if (typeof question !== "string" || !question.trim()) {
    return { valid: false, error: "question is required and must not be empty.", statusCode: 400 };
  }

  const cleanQuestion = question.trim();
  if (cleanQuestion.length > MAX_QUESTION_LENGTH) {
    return {
      valid: false,
      error: `Question exceeds maximum allowed length of ${MAX_QUESTION_LENGTH} characters.`,
      statusCode: 400,
    };
  }

  return {
    valid: true,
    data: {
      documentId: idCheck.data,
      question: cleanQuestion,
    },
  };
}

/**
 * Validates file upload inputs (size, extension, MIME type, and magic bytes).
 */
export function validateUploadFile(
  file: File | null,
  directText: string | null
): ValidationResult<{
  fileType: "pdf" | "docx" | "text";
  fileName: string;
}> {
  if (!file && (!directText || !directText.trim())) {
    return {
      valid: false,
      error: "No document file or text content provided.",
      statusCode: 400,
    };
  }

  if (directText && directText.length > MAX_DIRECT_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Direct text content exceeds maximum allowed limit of ${MAX_DIRECT_TEXT_LENGTH.toLocaleString()} characters.`,
      statusCode: 413,
    };
  }

  if (!file) {
    return { valid: true, data: { fileType: "text", fileName: "Direct Text Document.txt" } };
  }

  // File size validation
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 10 MB limit (received ${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
      statusCode: 413,
    };
  }

  // Filename extension check
  const lowerName = file.name.toLowerCase();
  const extMatch = lowerName.match(/\.[0-9a-z]+$/i);
  const ext = extMatch ? extMatch[0] : "";

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported file extension (${ext || "none"}). Only .pdf, .docx, .txt, and .md files are supported.`,
      statusCode: 415,
    };
  }

  // MIME type validation
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `Unsupported MIME type (${file.type}). Only PDF, Word DOCX, and plain text files are supported.`,
      statusCode: 415,
    };
  }

  const determinedType: "pdf" | "docx" | "text" =
    ext === ".pdf" ? "pdf" : ext === ".docx" ? "docx" : "text";

  return {
    valid: true,
    data: {
      fileType: determinedType,
      fileName: file.name.replace(/[^\w\s.-]/gi, "_"), // Sanitize file name
    },
  };
}

/**
 * Validates buffer signature (magic bytes) to ensure file content matches extension.
 */
export function validateFileMagicBytes(
  buffer: Buffer,
  fileType: "pdf" | "docx" | "text"
): ValidationResult<true> {
  if (fileType === "pdf") {
    if (buffer.length < 4 || buffer.subarray(0, 4).compare(PDF_MAGIC) !== 0) {
      return {
        valid: false,
        error: "Corrupted or invalid PDF file format (invalid magic header).",
        statusCode: 400,
      };
    }
  } else if (fileType === "docx") {
    if (buffer.length < 4 || buffer.subarray(0, 4).compare(ZIP_MAGIC) !== 0) {
      return {
        valid: false,
        error: "Corrupted or invalid DOCX file format (not a valid OpenXML package).",
        statusCode: 400,
      };
    }
  } else if (fileType === "text") {
    // Check for null bytes in the first 1KB to ensure it's not a binary file disguised as text
    const sampleSize = Math.min(buffer.length, 1024);
    for (let i = 0; i < sampleSize; i++) {
      if (buffer[i] === 0x00) {
        return {
          valid: false,
          error: "Binary file content detected. Plain text files must contain readable text.",
          statusCode: 400,
        };
      }
    }
  }

  return { valid: true, data: true };
}

/**
 * Validates clause analysis input.
 */
export function validateAnalyzeClauseInput(body: unknown): ValidationResult<{
  documentId?: string;
  clauseId: string;
  sectionNumber: string;
  title: string;
  text: string;
}> {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object.", statusCode: 400 };
  }
  const { documentId, clauseId, sectionNumber, title, text } = body as Record<string, unknown>;

  if (typeof clauseId !== "string" || !clauseId.trim()) {
    return { valid: false, error: "clauseId is required.", statusCode: 400 };
  }
  if (clauseId.trim().length > MAX_ID_LENGTH) {
    return { valid: false, error: `clauseId exceeds ${MAX_ID_LENGTH} characters.`, statusCode: 400 };
  }

  if (typeof text !== "string" || !text.trim()) {
    return { valid: false, error: "text is required for clause analysis.", statusCode: 400 };
  }
  if (text.length > MAX_CLAUSE_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Clause text exceeds maximum allowed length of ${MAX_CLAUSE_TEXT_LENGTH.toLocaleString()} characters.`,
      statusCode: 400,
    };
  }

  let validDocId: string | undefined;
  if (documentId !== undefined && documentId !== null) {
    const docCheck = validateDocumentId(documentId);
    if (!docCheck.valid) return docCheck;
    validDocId = docCheck.data;
  }

  return {
    valid: true,
    data: {
      documentId: validDocId,
      clauseId: clauseId.trim(),
      sectionNumber: typeof sectionNumber === "string" ? sectionNumber.slice(0, 256) : "",
      title: typeof title === "string" ? title.slice(0, 256) : "",
      text: text.trim(),
    },
  };
}

/**
 * Validates document comparison inputs.
 */
export function validateCompareInput(body: unknown): ValidationResult<{
  docAId: string;
  docBId: string;
}> {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object.", statusCode: 400 };
  }
  const { docAId, docBId } = body as Record<string, unknown>;

  const checkA = validateDocumentId(docAId);
  if (!checkA.valid) {
    return { valid: false, error: `docAId: ${checkA.error}`, statusCode: checkA.statusCode };
  }

  const checkB = validateDocumentId(docBId);
  if (!checkB.valid) {
    return { valid: false, error: `docBId: ${checkB.error}`, statusCode: checkB.statusCode };
  }

  return {
    valid: true,
    data: {
      docAId: checkA.data,
      docBId: checkB.data,
    },
  };
}
