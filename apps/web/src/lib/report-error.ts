import { ErrorInfo } from "react";
import { parseApiError } from "./api-error";

/**
 * The one place a caught UI error is reported.
 *
 * No monitoring service is connected. Sentry was wired here until 2026-09-28,
 * but no environment ever gave it a DSN and its init files were never part of
 * the build, so every call went nowhere. When a service is chosen — the
 * release plan points at Azure Application Insights, which keeps the data in
 * the yayasan's own tenant — it is connected here and nowhere else.
 *
 * Until then a production error goes to the browser console, with the API
 * error's context when there is one, so it can at least be read off a
 * user's screen. In development the error boundaries log it themselves.
 */
export const captureError = (error: unknown, errorInfo?: ErrorInfo) => {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const parsed = parseApiError(error);
  const isApiError = parsed.statusCode > 0 || !!parsed.code;

  console.error("[captureError]", error, {
    ...(errorInfo?.componentStack && {
      componentStack: errorInfo.componentStack,
    }),
    ...(isApiError && {
      api: {
        statusCode: parsed.statusCode,
        code: parsed.code,
        isNetworkError: parsed.isNetworkError,
        title: parsed.title,
        message: parsed.message,
      },
    }),
  });
};
