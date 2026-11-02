export function getBackendBaseUrl(): string {
  const configuredUrl = process.env.BACKEND_URL;
  if (!configuredUrl) {
    throw new Error("BACKEND_URL is not set.");
  }
  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("BACKEND_URL must be an absolute HTTP(S) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BACKEND_URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}
