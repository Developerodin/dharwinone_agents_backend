import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, parseBody } from "@/server/api";
import { authErrorResponse, rateLimitResponse } from "@/server/builderRoute";
import * as rateLimit from "@/server/rateLimit";
import * as authService from "@/server/services/authService";
import * as usersRepo from "@/server/repos/usersRepo";

const LoginRequest = z.object({
  email: z.string(),
  password: z.string(),
});

export async function POST(request: Request) {
  const { body, error } = await parseBody(request, LoginRequest);
  if (error) return error;
  const emailKey = body.email.trim().toLowerCase();
  const ip = clientIp(request);
  if (!rateLimit.allow(`login:email:${emailKey}`, 5, 900)) {
    return rateLimitResponse(rateLimit.retryAfter(`login:email:${emailKey}`, 900));
  }
  if (!rateLimit.allow(`login:ip:${ip}`, 20, 900)) {
    return rateLimitResponse(rateLimit.retryAfter(`login:ip:${ip}`, 900));
  }
  try {
    return NextResponse.json(await authService.login(body.email, body.password));
  } catch (exc) {
    if (exc instanceof authService.AuthError) return authErrorResponse(exc);
    if (exc instanceof usersRepo.AuthDbUnavailable) {
      return NextResponse.json({ detail: String(exc) }, { status: 503 });
    }
    throw exc;
  }
}
