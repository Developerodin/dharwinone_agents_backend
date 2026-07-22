import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, requestBaseUrl } from "@/server/api";
import { rateLimitResponse } from "@/server/builderRoute";
import * as rateLimit from "@/server/rateLimit";
import * as authService from "@/server/services/authService";
import * as usersRepo from "@/server/repos/usersRepo";

const EmailRequest = z.object({ email: z.string() });

export async function POST(request: Request) {
  const { body, error } = await parseBody(request, EmailRequest);
  if (error) return error;
  const emailKey = body.email.trim().toLowerCase();
  if (!rateLimit.allow(`forgot:email:${emailKey}`, 3, 3600)) {
    return rateLimitResponse(rateLimit.retryAfter(`forgot:email:${emailKey}`, 3600));
  }
  try {
    await authService.forgotPassword(body.email, requestBaseUrl(request));
  } catch (exc) {
    if (exc instanceof usersRepo.AuthDbUnavailable) {
      return NextResponse.json({ detail: String(exc) }, { status: 503 });
    }
    throw exc;
  }
  return NextResponse.json({ status: "ok" });
}
