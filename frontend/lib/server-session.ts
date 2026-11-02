import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AuthResponseSchema } from "@/lib/auth-schemas";
import { getBackendBaseUrl } from "@/lib/backend-url";
import { SESSION_EXPIRY_COOKIE } from "@/lib/session-state";

const SESSION_COOKIE = "chatapp.session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

const ServerSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.string().min(1),
});

export type ServerSession = z.infer<typeof ServerSessionSchema>;

function encryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET must be configured for sessions.");
  return Buffer.from(hkdfSync("sha256", secret, "", "chatapp.session", 32));
}

function encrypt(session: ServerSession): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const content = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString("base64url");
}

function decrypt(value: string): ServerSession | null {
  try {
    const data = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, IV_BYTES));
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES));
    const content = Buffer.concat([
      decipher.update(data.subarray(IV_BYTES + AUTH_TAG_BYTES)),
      decipher.final(),
    ]);
    return ServerSessionSchema.parse(JSON.parse(content.toString("utf8")));
  } catch {
    return null;
  }
}

export async function readSession(): Promise<ServerSession | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? decrypt(value) : null;
}

export async function writeSession(session: ServerSession): Promise<void> {
  const cookieStore = await cookies();
  const options = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
  cookieStore.set(SESSION_COOKIE, encrypt(session), { ...options, httpOnly: true });
  cookieStore.set(
    SESSION_EXPIRY_COOKIE,
    String(Date.parse(session.accessTokenExpiresAt)),
    options,
  );
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(SESSION_EXPIRY_COOKIE);
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  if (request.method === "GET" || request.method === "HEAD") return true;

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function forbiddenOriginResponse(): NextResponse {
  return errorResponse("Invalid request origin.", 403);
}

export function expiredSessionResponse(): NextResponse {
  return errorResponse("Your session has expired. Please log in again.", 401);
}

export async function fetchBackend(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, `${getBackendBaseUrl()}/`), {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}

export async function backendErrorResponse(response: Response, fallback: string): Promise<NextResponse> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : fallback;
  return errorResponse(message, response.status);
}

// Exchanges a backend auth response for session cookies. Only the public user
// profile goes back to the browser; the tokens never leave the server.
export async function startSessionFromBackend(path: string, body: unknown): Promise<NextResponse> {
  let response: Response;
  try {
    response = await fetchBackend(path, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return errorResponse("Could not connect to the chat backend. Please try again.", 503);
  }
  if (!response.ok) return backendErrorResponse(response, "Sign-in was rejected.");

  const parsed = AuthResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("The backend returned an invalid sign-in response.", 502);
  }
  await writeSession(parsed.data);
  return NextResponse.json({ user: parsed.data.user }, { headers: { "Cache-Control": "no-store" } });
}

// Rotates the tokens held in the session cookie. Returns null only when the
// backend has definitively rejected the refresh token.
export async function refreshSession(session: ServerSession): Promise<ServerSession | null> {
  const response = await fetchBackend("api/v1/auth/refresh", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) throw new Error("The backend could not refresh the session.");

  const refreshed = ServerSessionSchema.parse(await response.json());
  await writeSession(refreshed);
  return refreshed;
}
