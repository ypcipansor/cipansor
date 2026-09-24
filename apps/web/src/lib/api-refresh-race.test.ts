import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { isRefreshRaceError } from "./api";

/**
 * Finding 1 (web half). Two tabs refresh the same `HttpOnly` cookie; the API
 * lets one rotate and answers the other `409 { error: { code: 'REFRESH_RACE' } }`
 * without clearing cookies. The interceptor has to recognise that shape and
 * retry instead of running the logout path — otherwise the loser of a benign
 * two-tab refresh logs the user out of the winner's brand-new session.
 */
function axiosErrorWith(data: unknown, status = 409): AxiosError {
  const error = new AxiosError("Request failed");
  error.response = {
    data,
    status,
    statusText: "Conflict",
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe("isRefreshRaceError", () => {
  it("recognises the API's REFRESH_RACE envelope", () => {
    expect(
      isRefreshRaceError(
        axiosErrorWith({
          success: false,
          error: { code: "REFRESH_RACE", message: "x" },
        }),
      ),
    ).toBe(true);
  });

  it("does not treat a plain 401 rejection as a race", () => {
    expect(
      isRefreshRaceError(
        axiosErrorWith(
          { success: false, error: { code: "UNAUTHORIZED" } },
          401,
        ),
      ),
    ).toBe(false);
  });

  it("does not treat a transport error with no response as a race", () => {
    expect(isRefreshRaceError(new AxiosError("Network Error"))).toBe(false);
  });
});
