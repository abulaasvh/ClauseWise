import { NextRequest, NextResponse } from "next/server";
import { auditWithLettuceDetect } from "@/lib/lettucedetect";

export async function POST(request: NextRequest) {
  try {
    const { question, answer, context } = await request.json();

    if (!answer || typeof answer !== "string") {
      return NextResponse.json(
        { error: "Answer text is required for hallucination detection." },
        { status: 400 }
      );
    }

    const contextArray = Array.isArray(context)
      ? context
      : typeof context === "string" && context.trim()
      ? [context]
      : [];

    const audit = await auditWithLettuceDetect(
      question || "",
      answer,
      contextArray
    );

    return NextResponse.json({
      success: true,
      audit,
    });
  } catch (error) {
    console.error("LettuceDetect API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to run LettuceDetect audit." },
      { status: 500 }
    );
  }
}
