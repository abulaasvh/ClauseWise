import { NextRequest, NextResponse } from "next/server";
import { getDocumentAsync } from "@/lib/docstore";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const docId = params.id;
    const doc = await getDocumentAsync(docId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return NextResponse.json({ document: doc });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
