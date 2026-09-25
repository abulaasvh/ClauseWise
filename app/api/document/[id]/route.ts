import { NextRequest, NextResponse } from "next/server";
import { getDocumentAsync } from "@/lib/docstore";
import { generateRequestId, buildErrorResponse, buildErrorPayload } from "@/lib/errors";
import { validateDocumentId } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  // Next.js 15+: params is now a Promise — must be awaited
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
    const { id } = await context.params;

    const idValidation = validateDocumentId(id);
    if (!idValidation.valid) {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, idValidation.error),
        { status: idValidation.statusCode }
      );
    }

    const doc = await getDocumentAsync(idValidation.data);
    if (!doc) {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, "Document not found"),
        { status: 404 }
      );
    }
    return NextResponse.json({ document: doc });
  } catch (error) {
    return buildErrorResponse(error, requestId, "DocumentGet");
  }
}
