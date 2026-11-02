import { getSessionExpiresAt } from "@/lib/session-state";

const REFRESH_BEFORE_EXPIRY_MS = 30_000;
const REFRESH_LOCK_NAME = "chatapp.session-refresh";
const BACKEND_API_PREFIX = "/api/v1/";
const BACKEND_PROXY_PREFIX = "/api/backend/";

export class BackendApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

let refreshInProgress: Promise<void> | null = null;

function proxyUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  if (!url.pathname.startsWith(BACKEND_API_PREFIX)) {
    throw new Error("The requested backend path is not allowed.");
  }
  return `${BACKEND_PROXY_PREFIX}${url.pathname.slice(BACKEND_API_PREFIX.length)}${url.search}`;
}

async function decodeError(response: Response): Promise<BackendApiError> {
  const content = await response.text();
  let body: unknown = content;
  if (content) {
    try {
      body = JSON.parse(content) as unknown;
    } catch {
      body = content;
    }
  }

  const apiMessage =
    typeof body === "object" && body !== null && "error" in body &&
    typeof body.error === "string"
      ? body.error
      : typeof body === "object" && body !== null && "detail" in body &&
          typeof body.detail === "string"
        ? body.detail
      : response.statusText || "The backend request failed.";
  return new BackendApiError(apiMessage, response.status, body);
}

export async function expectBackendSuccess(response: Response): Promise<void> {
  if (!response.ok) throw await decodeError(response);
}

export async function expectBackendJson<T>(response: Response): Promise<T> {
  await expectBackendSuccess(response);
  return (await response.json()) as T;
}

async function doRefresh(seenExpiresAt: number | null): Promise<void> {
  // Another tab may have rotated the tokens while this one waited for the lock.
  const currentExpiresAt = getSessionExpiresAt();
  if (currentExpiresAt !== null && currentExpiresAt !== seenExpiresAt) return;

  await expectBackendSuccess(await fetch("/api/session/refresh", { method: "POST" }));
}

function refreshBackendSession(seenExpiresAt: number | null): Promise<void> {
  if (!refreshInProgress) {
    const refresh = () => doRefresh(seenExpiresAt);
    // Refresh tokens are single-use, so only one tab may rotate them at a time.
    const pending: Promise<void> = navigator.locks
      ? navigator.locks.request(REFRESH_LOCK_NAME, refresh).then(() => undefined)
      : refresh();
    const current = pending.finally(() => {
      refreshInProgress = null;
    });
    refreshInProgress = current;
    return current;
  }
  return refreshInProgress;
}

async function ensureFreshSession(): Promise<void> {
  const expiresAt = getSessionExpiresAt();
  if (expiresAt === null) {
    throw new Error("Your session has expired. Please log in again.");
  }
  if (expiresAt <= Date.now() + REFRESH_BEFORE_EXPIRY_MS) {
    await refreshBackendSession(expiresAt);
  }
}

// Sends a request through the server-side proxy, which attaches the access token.
export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await ensureFreshSession();
  const seenExpiresAt = getSessionExpiresAt();
  const url = proxyUrl(path);
  const response = await fetch(url, init);
  if (response.status !== 401) return response;

  await refreshBackendSession(seenExpiresAt);
  return fetch(url, init);
}

export async function sessionRequest(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function requestRealtimeTicket(): Promise<{ brokerURL: string; ticket: string }> {
  await ensureFreshSession();
  const seenExpiresAt = getSessionExpiresAt();
  const response = await sessionRequest("/api/session/ws-ticket");
  if (response.status !== 401) return expectBackendJson(response);

  await refreshBackendSession(seenExpiresAt);
  return expectBackendJson(await sessionRequest("/api/session/ws-ticket"));
}
