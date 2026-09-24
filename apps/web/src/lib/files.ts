/**
 * URLs for API-served uploads.
 *
 * The API serves `/uploads` behind authentication (files hold student photos
 * and documents). Browser-native fetches — `<img src>`, `<a href>`,
 * `window.open`, `<object data>` — cannot send an `Authorization` header, but
 * they *do* send cookies. The session access token now lives in an `HttpOnly`
 * cookie, so a same-origin upload URL is authenticated by the browser with no
 * JavaScript involvement and no token in the URL.
 *
 * Non-upload URLs (external links, data URIs) pass through untouched.
 */
export function authFileUrl(url: string | null | undefined): string {
  return url ?? "";
}
