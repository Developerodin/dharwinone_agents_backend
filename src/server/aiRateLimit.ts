/** Soft rate limit for AI routes — advisory throttle, not billing. */
import { rateLimitResponse } from "./builderRoute";
import * as rateLimit from "./rateLimit";
import { clientIp } from "./api";
import { NextResponse } from "next/server";

const USER_LIMIT = 30;
const USER_WINDOW_S = 60;
const IP_LIMIT = 60;
const IP_WINDOW_S = 60;

export function enforceAiRateLimit(request: Request, userId: string): NextResponse | null {
  const ip = clientIp(request);
  const userKey = `ai:user:${userId}`;
  const ipKey = `ai:ip:${ip}`;

  if (!rateLimit.allow(userKey, USER_LIMIT, USER_WINDOW_S)) {
    return rateLimitResponse(rateLimit.retryAfter(userKey, USER_WINDOW_S));
  }
  if (!rateLimit.allow(ipKey, IP_LIMIT, IP_WINDOW_S)) {
    return rateLimitResponse(rateLimit.retryAfter(ipKey, IP_WINDOW_S));
  }
  return null;
}
