// Browser-readable session state. This holds no credentials: the tokens stay in
// an httpOnly cookie, and this cookie only records when the access token expires.
export const SESSION_EXPIRY_COOKIE = "chatapp.session-expires";

const LEGACY_TOKEN_KEYS = [
  "chatapp.accessToken",
  "chatapp.refreshToken",
  "chatapp.accessTokenExpiresAt",
];

export function getSessionExpiresAt(): number | null {
  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${SESSION_EXPIRY_COOKIE}=`));
  if (!entry) return null;

  const timestamp = Number(entry.slice(SESSION_EXPIRY_COOKIE.length + 1));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function hasSession(): boolean {
  return getSessionExpiresAt() !== null;
}

export function clearLegacyTokenStorage(): void {
  LEGACY_TOKEN_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
}
