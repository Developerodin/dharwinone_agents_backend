import { NextResponse } from "next/server";
import * as categoriesRepo from "@/server/repos/categoriesRepo";

export async function GET() {
  return NextResponse.json(await categoriesRepo.listAll());
}
