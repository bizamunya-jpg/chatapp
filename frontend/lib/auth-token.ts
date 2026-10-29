const ACCESS_TOKEN_KEY = "chatapp.accessToken";
const REFRESH_TOKEN_KEY = "chatapp.refreshToken";
const ACCESS_TOKEN_EXPIRY_KEY = "chatapp.accessTokenExpiresAt";

function getSessionStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Access-token storage is only available in the browser.");
  }

  return window.sessionStorage;
}

export function storeAccessToken(token: string): void {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error("Access token cannot be empty.");
  }

  getSessionStorage().setItem(ACCESS_TOKEN_KEY, normalizedToken);
}

export function storeAuthTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}): void {
  const accessToken = tokens.accessToken.trim();
  const refreshToken = tokens.refreshToken.trim();
  const expiresAt = Date.parse(tokens.accessTokenExpiresAt);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) {
    throw new Error("The backend returned invalid authentication tokens.");
  }

  const storage = getSessionStorage();
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  storage.setItem(ACCESS_TOKEN_EXPIRY_KEY, new Date(expiresAt).toISOString());
}

export function getAccessToken(): string | null {
  return getSessionStorage().getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return getSessionStorage().getItem(REFRESH_TOKEN_KEY);
}

export function getAccessTokenExpiresAt(): number | null {
  const expiresAt = getSessionStorage().getItem(ACCESS_TOKEN_EXPIRY_KEY);
  if (!expiresAt) return null;

  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function clearAccessToken(): void {
  clearAuthTokens();
}

export function clearAuthTokens(): void {
  const storage = getSessionStorage();
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
  storage.removeItem(ACCESS_TOKEN_EXPIRY_KEY);
}
