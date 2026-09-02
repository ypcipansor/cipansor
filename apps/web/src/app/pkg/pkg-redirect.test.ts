import { describe, it, expect, vi } from "vitest";
import nextConfig from "../../../next.config";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { redirect } from "next/navigation";
import PkgLegacyRedirectPage from "./page";

describe("Legacy /pkg route redirect tests", () => {
  it("configures 308 permanent redirects for /pkg and /pkg/* in next.config.ts", async () => {
    const redirectsFn = nextConfig.redirects;
    expect(redirectsFn).toBeDefined();

    if (redirectsFn) {
      const redirects = await redirectsFn();
      const pkgRedirect = redirects.find((r) => r.source === "/pkg");
      const pkgSubRedirect = redirects.find((r) => r.source === "/pkg/:path*");

      expect(pkgRedirect).toBeDefined();
      expect(pkgRedirect?.destination).toBe("/kinerja");
      expect(pkgRedirect?.permanent).toBe(true);

      expect(pkgSubRedirect).toBeDefined();
      expect(pkgSubRedirect?.destination).toBe("/kinerja");
      expect(pkgSubRedirect?.permanent).toBe(true);
    }
  });

  it("triggers next/navigation redirect('/kinerja') when rendering PkgLegacyRedirectPage", () => {
    PkgLegacyRedirectPage();
    expect(redirect).toHaveBeenCalledWith("/kinerja");
  });
});
