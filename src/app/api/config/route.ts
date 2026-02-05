import { NextResponse } from "next/server";
import { isOpenAIConfigured } from "@/lib/claude";

export async function GET() {
  return NextResponse.json({
    openaiConfigured: isOpenAIConfigured(),
  });
}
