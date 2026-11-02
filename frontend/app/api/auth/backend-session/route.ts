import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AuthResponseSchema } from "@/lib/auth-schemas";
import { getBackendBaseUrl } from "@/lib/backend-url";
import { forbiddenOriginResponse, isSameOriginRequest, writeSession } from "@/lib/server-session";

const OAuthSessionSchema = z.object({
  oauthProvider: z.enum(["google", "github"]),
  oauthAccessToken: z.string().min(1).max(8192),
});

const BackendErrorSchema = z.object({ error: z.string() });

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenOriginResponse();
  if (!process.env.NEXTAUTH_SECRET) {
    return NextResponse.json(
      { error: "OAuth session signing is not configured on the frontend." },
      { status: 503 },
    );
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const parsedSession = OAuthSessionSchema.safeParse(token);
  if (!parsedSession.success) {
    return NextResponse.json(
      { error: "Your provider session is missing or expired. Please sign in again." },
      { status: 401 },
    );
  }

  let response: Response;
  try {
    response = await fetch(new URL("/api/v1/auth/oauth/exchange", getBackendBaseUrl()), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: parsedSession.data.oauthProvider,
        accessToken: parsedSession.data.oauthAccessToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to the chat backend. Please try again." },
      { status: 503 },
    );
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsedError = BackendErrorSchema.safeParse(body);
    return NextResponse.json(
      { error: parsedError.success ? parsedError.data.error : "Provider sign-in was rejected." },
      { status: response.status },
    );
  }

  const body: unknown = await response.json();
  const parsedResponse = AuthResponseSchema.safeParse(body);
  if (!parsedResponse.success) {
    return NextResponse.json(
      { error: "The backend returned an invalid sign-in response." },
      { status: 502 },
    );
  }

  await writeSession(parsedResponse.data);
  return NextResponse.json({ user: parsedResponse.data.user }, {
    headers: { "Cache-Control": "no-store" },
  });
}
