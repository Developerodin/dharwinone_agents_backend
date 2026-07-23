import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, userId } from "@/server/api";
import * as categoriesRepo from "@/server/repos/categoriesRepo";
import * as usersRepo from "@/server/repos/usersRepo";

type Params = { params: Promise<{ categoryId: string }> };

// Categories are global taxonomy config — only admins may edit them.
const CategoryUpdateRequest = z.object({
  name: z.string().min(1).optional(),
  subcategoriesJson: z.array(z.record(z.string(), z.unknown())).optional(),
  questionnaireConfigJson: z.record(z.string(), z.unknown()).optional(),
  imagePackRefs: z.array(z.string()).optional(),
});

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  if ((await usersRepo.getRole(uid)) !== "admin") {
    return NextResponse.json({ detail: "admin only" }, { status: 403 });
  }
  return null;
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { categoryId } = await params;
  const { body, error } = await parseBody(request, CategoryUpdateRequest);
  if (error) return error;

  const updated = await categoriesRepo.update(categoryId, body);
  if (!updated) return NextResponse.json({ detail: "category not found" }, { status: 404 });
  return NextResponse.json(updated);
}
