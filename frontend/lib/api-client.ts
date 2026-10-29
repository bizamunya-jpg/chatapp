import {
  clearAuthTokens,
  getAccessToken,
  getAccessTokenExpiresAt,
  getRefreshToken,
  storeAuthTokens,
} from "@/lib/auth-token";

const DEFAULT_BACKEND_URL = "http://localhost:8080";
const REFRESH_BEFORE_EXPIRY_MS = 30_000;

export type BackendAuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer" | string;
  accessTokenExpiresAt: string;
};

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

let refreshInProgress: Promise<BackendAuthTokens> | null = null;

export function getBackendBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_URL;
  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_BACKEND_URL must be an absolute HTTP(S) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_BACKEND_URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}

export function backendUrl(path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${getBackendBaseUrl()}/`);
}

export function getBackendWebSocketUrl(): string {
  const url = backendUrl("/ws");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (isRequest(input)) return new URL(input.url);
  return new URL(input, `${getBackendBaseUrl()}/`);
}

function makeRequest(
  input: RequestInfo | URL,
  init: RequestInit,
  token?: string,
): { url: URL; init: RequestInit } {
  const url = resolveUrl(input);
  const headers = new Headers(isRequest(input) ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return {
    url,
    init: {
      ...init,
      headers,
    },
  };
}

export async function backendFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const request = makeRequest(input, init);
  return fetch(request.url, request.init);
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

async function doRefresh(): Promise<BackendAuthTokens> {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();
  if (!accessToken || !refreshToken) {
    clearAuthTokens();
    throw new Error("Your session has expired. Please log in again.");
  }

  const response = await fetch(backendUrl("/api/v1/auth/refresh"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    clearAuthTokens();
    throw await decodeError(response);
  }

  const tokens = (await response.json()) as BackendAuthTokens;
  try {
    storeAuthTokens(tokens);
  } catch (error) {
    clearAuthTokens();
    throw error;
  }
  return tokens;
}

export async function refreshBackendSession(): Promise<BackendAuthTokens> {
  if (!refreshInProgress) {
    refreshInProgress = doRefresh().finally(() => {
      refreshInProgress = null;
    });
  }
  return refreshInProgress;
}

async function currentAccessToken(): Promise<string> {
  let token = getAccessToken();
  if (!token) {
    throw new Error("An access token is required. Please log in first.");
  }

  const expiresAt = getAccessTokenExpiresAt();
  if (expiresAt !== null && expiresAt <= Date.now() + REFRESH_BEFORE_EXPIRY_MS) {
    token = (await refreshBackendSession()).accessToken;
  }
  return token;
}

export async function getAuthenticatedAccessToken(): Promise<string> {
  return currentAccessToken();
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await currentAccessToken();
  const request = makeRequest(input, init, token);
  const response = await fetch(request.url, request.init);

  if (response.status !== 401 || isRequest(input)) return response;

  const latestToken = getAccessToken();
  if (latestToken && latestToken !== token) {
    const retry = makeRequest(input, init, latestToken);
    return fetch(retry.url, retry.init);
  }

  const refreshed = await refreshBackendSession();
  const retry = makeRequest(input, init, refreshed.accessToken);
  return fetch(retry.url, retry.init);
}
