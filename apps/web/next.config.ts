import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React Compiler (experimental - only in development for safety)
  reactCompiler: process.env.NODE_ENV === "development",


  // Standalone output is for the Docker image (the Dockerfile sets
  // BUILD_STANDALONE=1 and runs `node server.js`). For everything else — local
  // dev, `next start`, and the e2e/CI server — leave it unset so `next start`
  // is fully supported (it is not, with output: "standalone").
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,

  // Production optimizations
  poweredByHeader: false,

  // Enable strict mode for better error catching
  reactStrictMode: true,

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  /**
   * Permanent redirects for renamed public paths.
   *
   * The site is live, indexed, and a Google Ad Grants account depends on
   * landing pages that do not 404 — so a renamed public URL always keeps a 308
   * shipped in the same deploy. Kemendikdasmen replaced PPDB with SPMB from the
   * 2025/2026 intake, but printed materials and search results still carry the
   * old path.
   */
  async redirects() {
    return [
      {
        source: "/public/ppdb",
        destination: "/public/spmb",
        permanent: true,
      },
      {
        source: "/public/ppdb/:path*",
        destination: "/public/spmb/:path*",
        permanent: true,
      },
      // "Wakaf & Infaq" is the term the pesantren uses, and the donation page
      // now lives under that name instead of being a second, differently-named
      // copy of the same thing.
      {
        source: "/public/donation",
        destination: "/wakaf-infaq",
        permanent: true,
      },
      // Letters already in circulation carry a QR printed when verification
      // still lived at /verifikasi/<token>. That page was removed deliberately
      // — a token attests that some letter was signed, never that the document
      // in your hand is that letter, so a forger could keep the genuine QR and
      // edit the body. The redirect does not verify anything; it just stops a
      // printed letter from dead-ending, and sends the reader to the upload
      // form that does bind to the document.
      {
        source: "/verifikasi/:token",
        destination: "/public/verify-letter",
        permanent: true,
      },
      {
        source: "/verifikasi",
        destination: "/public/verify-letter",
        permanent: true,
      },
    ];
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // Compression
  compress: true,

  // Logging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // Turbopack empty config to silence error when using webpack plugins (Sentry)
  turbopack: {},
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,
});
