import type { NextRequest } from "next/server";

import { LoginSchema } from "@/lib/auth-schemas";
import {
  errorResponse,
  forbiddenOriginResponse,
  isSameOriginRequest,
  startSessionFromBackend,
} from "@/lib/server-session";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenOriginResponse();

  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Enter your login details.", 400);
  }
  return startSessionFromBackend("api/v1/auth/login", parsed.data);
}
