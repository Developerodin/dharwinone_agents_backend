import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, parseBody, requestBaseUrl } from "@/server/api";
import { authErrorResponse, rateLimitResponse } from "@/server/builderRoute";
import * as rateLimit from "@/server/rateLimit";
import * as authService from "@/server/services/authService";
import * as usersRepo from "@/server/repos/usersRepo";

const RegisterRequest = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit.allow(`register:ip:${ip}`, 10, 3600)) {
    return rateLimitResponse(rateLimit.retryAfter(`register:ip:${ip}`, 3600));
  }
  const { body, error } = await parseBody(request, RegisterRequest);
  if (error) return error;
  try {
    const user = await authService.register(
      body.name,
      body.email,
      body.password,
      requestBaseUrl(request),
    );
    return NextResponse.json(user, { status: 201 });
  } catch (exc) {
    if (exc instanceof authService.AuthError) return authErrorResponse(exc);
    if (exc instanceof usersRepo.AuthDbUnavailable) {
      return NextResponse.json({ detail: String(exc) }, { status: 503 });
    }
    throw exc;
  }
}
