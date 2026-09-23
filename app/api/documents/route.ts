import { NextResponse } from "next/server";
import { getAllDocuments } from "@/lib/docstore";

export async function GET() {
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
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
