import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureError } from "./report-error";

/**
 * captureError is the one seam a monitoring service will hang on. With
 * Sentry gone (2026-09-28) it must still say something in production — the
 * old body called an SDK nobody had initialised, so a production error left
 * no trace at all — and stay quiet in development, where the error
 * boundaries already log.
 */
describe("captureError", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    log.mockRestore();
    vi.unstubAllEnvs();
  });

  it("stays quiet outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    captureError(new Error("boom"));
    expect(log).not.toHaveBeenCalled();
  });

  it("logs a production render error with its component stack", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = new Error("boom");
    captureError(error, { componentStack: "\n    at Widget" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[captureError]", error, {
      componentStack: "\n    at Widget",
    });
  });

  it("adds the API error's context for a failed request", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = {
      response: { status: 403, data: { message: "Akses ditolak" } },
    };
    captureError(error);
    const context = log.mock.calls[0][2] as {
      api?: { statusCode: number; message: string };
    };
    expect(context.api).toMatchObject({
      statusCode: 403,
      message: "Akses ditolak",
    });
  });
});
