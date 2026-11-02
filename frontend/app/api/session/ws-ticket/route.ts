import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getBackendBaseUrl } from "@/lib/backend-url";
import {
  backendErrorResponse,
  errorResponse,
  expiredSessionResponse,
  fetchBackend,
  forbiddenOriginResponse,
  isSameOriginRequest,
  readSession,
} from "@/lib/server-session";

const TicketSchema = z.object({ ticket: z.string().min(1) });

function brokerUrl(): string {
  const url = new URL("ws", `${getBackendBaseUrl()}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenOriginResponse();

  const session = await readSession();
  if (!session) return expiredSessionResponse();

  let response: Response;
  try {
    response = await fetchBackend("api/v1/auth/ws-ticket", {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${session.accessToken}` },
    });
  } catch {
    return errorResponse("Could not connect to the chat backend. Please try again.", 503);
  }
  if (!response.ok) return backendErrorResponse(response, "Could not prepare the realtime connection.");

  const parsed = TicketSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return errorResponse("The backend returned an invalid realtime ticket.", 502);

  return NextResponse.json(
    { brokerURL: brokerUrl(), ticket: parsed.data.ticket },
    { headers: { "Cache-Control": "no-store" } },
  );
}
