import { NextResponse, type NextRequest } from "next/server";

import {
  expiredSessionResponse,
  forbiddenOriginResponse,
  isSameOriginRequest,
  readSession,
} from "@/lib/server-session";

const STUN_SERVER: RTCIceServer = { urls: "stun:stun.l.google.com:19302" };

function turnServer(): RTCIceServer | null {
  const urls = process.env.TURN_URLS?.split(",").map((url) => url.trim()).filter(Boolean);
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_PASSWORD;
  if (!urls?.length || !username || !credential) return null;
  return { urls, username, credential };
}

// Browsers need the TURN credentials to open a relay, so only signed-in users receive them.
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return forbiddenOriginResponse();

  const session = await readSession();
  if (!session) return expiredSessionResponse();

  const turn = turnServer();
  return NextResponse.json(
    { iceServers: turn ? [STUN_SERVER, turn] : [STUN_SERVER] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
