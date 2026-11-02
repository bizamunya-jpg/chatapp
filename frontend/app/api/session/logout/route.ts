import { NextResponse, type NextRequest } from "next/server";

import {
  clearSession,
  fetchBackend,
  forbiddenOriginResponse,
  isSameOriginRequest,
  readSession,
  refreshSession,
  type ServerSession,
} from "@/lib/server-session";

async function revokeRefreshToken(session: ServerSession): Promise<void> {
  // The backend's logout endpoint needs a live access token.
  const active = Date.parse(session.accessTokenExpiresAt) > Date.now()
    ? session
    : await refreshSession(session);
  if (!active) return;

  await fetchBackend("api/v1/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${active.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken: active.refreshToken }),
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenOriginResponse();

  const session = await readSession();
  if (session) {
    // The browser is logged out even if the backend cannot be reached.
    await revokeRefreshToken(session).catch(() => undefined);
  }
  await clearSession();
  return new NextResponse(null, { status: 204 });
}
