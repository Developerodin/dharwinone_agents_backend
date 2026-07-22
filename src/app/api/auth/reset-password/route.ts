import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, parseBody } from "@/server/api";
import { authErrorResponse, rateLimitResponse } from "@/server/builderRoute";
import * as rateLimit from "@/server/rateLimit";
import * as authService from "@/server/services/authService";
import * as usersRepo from "@/server/repos/usersRepo";

const ResetPasswordRequest = z.object({
  token: z.string(),
  password: z.string(),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit.allow(`reset:ip:${ip}`, 10, 3600)) {
    return rateLimitResponse(rateLimit.retryAfter(`reset:ip:${ip}`, 3600));
  }
  const { body, error } = await parseBody(request, ResetPasswordRequest);
  if (error) return error;
  try {
    await authService.resetPassword(body.token, body.password);
    return NextResponse.json({ status: "ok" });
  } catch (exc) {
    if (exc instanceof authService.AuthError) return authErrorResponse(exc);
    if (exc instanceof usersRepo.AuthDbUnavailable) {
      return NextResponse.json({ detail: String(exc) }, { status: 503 });
    }
    throw exc;
  }
}
