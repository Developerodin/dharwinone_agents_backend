import { NextResponse } from "next/server";
import { TOKEN_PACKS } from "@/server/config/tokenPacks";

export async function GET() {
  return NextResponse.json({ packs: TOKEN_PACKS });
}
