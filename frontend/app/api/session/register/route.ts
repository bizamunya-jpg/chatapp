import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  forbiddenOriginResponse,
  isSameOriginRequest,
  startSessionFromBackend,
} from "@/lib/server-session";

const RegisterRequestSchema = z.object({
  username: z.string().trim().min(1).max(32),
  email: z.string().trim().email().max(254),
  password: z.string().min(1),
  displayName: z.string().trim().max(80).optional(),
});

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenOriginResponse();

  const parsed = RegisterRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("Check your registration details and try again.", 400);
  }
  return startSessionFromBackend("api/v1/auth/register", parsed.data);
}
