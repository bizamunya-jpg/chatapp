import type { NextRequest } from "next/server";

import {
  errorResponse,
  expiredSessionResponse,
  fetchBackend,
  forbiddenOriginResponse,
  isSameOriginRequest,
  readSession,
} from "@/lib/server-session";

type RouteContext = { params: Promise<{ path: string[] }> };

const FORWARDED_REQUEST_HEADERS = ["accept", "content-type"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-disposition"];

function isAllowedPath(path: string[]): boolean {
  // Auth endpoints return tokens, so they are only reachable through /api/session.
  if (path[0]?.toLowerCase() === "auth") return false;
  return path.every((segment) => segment !== "." && segment !== ".." && !/[/\\;]/.test(segment));
}

async function forward(request: NextRequest, { params }: RouteContext): Promise<Response> {
  if (!isSameOriginRequest(request)) return forbiddenOriginResponse();

  const { path } = await params;
  if (!isAllowedPath(path)) return errorResponse("The requested path is not allowed.", 404);

  const session = await readSession();
  if (!session) return expiredSessionResponse();

  const headers = new Headers({ Authorization: `Bearer ${session.accessToken}` });
  FORWARDED_REQUEST_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const backendPath = `api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  let response: Response;
  try {
    response = await fetchBackend(backendPath, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
  } catch {
    return errorResponse("Could not connect to the chat backend. Please try again.", 503);
  }

  const responseHeaders = new Headers({ "Cache-Control": "no-store" });
  FORWARDED_RESPONSE_HEADERS.forEach((name) => {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  });
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
