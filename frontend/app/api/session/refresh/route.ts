import { NextResponse, type NextRequest } from "next/server";

import {
  clearSession,
  errorResponse,
  expiredSessionResponse,
  forbiddenOriginResponse,
  isSameOriginRequest,
  readSession,
  refreshSession,
} from "@/lib/server-session";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenOriginResponse();

  const session = await readSession();
  if (!session) {
    await clearSession();
    return expiredSessionResponse();
  }

  try {
    if (!(await refreshSession(session))) {
      await clearSession();
      return expiredSessionResponse();
    }
  } catch {
    return errorResponse("Could not connect to the chat backend. Please try again.", 503);
  }
  return new NextResponse(null, { status: 204 });
}
