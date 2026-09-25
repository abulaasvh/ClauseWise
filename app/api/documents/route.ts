import { NextResponse } from "next/server";
import { getAllDocuments } from "@/lib/docstore";
import { generateRequestId, buildErrorResponse } from "@/lib/errors";

export async function GET() {
  const requestId = generateRequestId();

  try {
    const docs = getAllDocuments();
    return NextResponse.json({
      documents: docs.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        uploadedAt: d.uploadedAt,
        stats: d.stats,
      })),
    });
  } catch (error) {
    return buildErrorResponse(error, requestId, "DocumentsList");
  }
}
