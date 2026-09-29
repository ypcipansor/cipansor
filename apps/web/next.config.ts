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
        source: "/ppdb",
        destination: "/spmb",
        permanent: true,
      },
      {
        source: "/ppdb/:path*",
        destination: "/spmb/:path*",
        permanent: true,
      },
      {
        source: "/psb",
        destination: "/spmb",
        permanent: true,
      },
      {
        source: "/psb/:path*",
        destination: "/spmb/:path*",
        permanent: true,
      },
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
      // The Mutabaah form follows the "…/new" convention for create pages;
      // its buttons had always pointed there, and /daily-report/new landed
      // on the detail page with "new" taken for an id.
      {
        source: "/daily-report/create",
        destination: "/daily-report/new",
        permanent: true,
      },
      // Manajemen Kinerja diremajakan sebagai /kinerja. Buku penanda dan hasil
      // pencarian lama masih membawa /pkg, dan halaman lamanya sudah dihapus —
      // tanpa pengalihan ini bookmark lama berakhir di 404.
      {
        source: "/pkg",
        destination: "/kinerja",
        permanent: true,
      },
      {
        source: "/pkg/:path*",
        destination: "/kinerja/:path*",
        permanent: true,
      },
      // The gate check belongs to Perizinan: it looks up a permit and records
      // leaving and coming back. Under /reception it had no menu entry at all.
      {
        source: "/reception/gate",
        destination: "/permits/gate",
        permanent: true,
      },
      // One register, one page (decided 2026-09-27): Wali Kelas → Absensi
      // Harian had its own copy of the daily register. The page it opens now
      // starts on the wali kelas's own class.
      {
        source: "/homeroom/attendance",
        destination: "/attendance/record",
        permanent: true,
      },
      // The Kurikulum list had no table and no API behind it; the curriculum
      // in force is Kurikulum Merdeka (removal approved 2026-09-27).
      {
        source: "/curriculum/curriculums",
        destination: "/curriculum/merdeka",
        permanent: true,
      },
      {
        source: "/curriculum/curriculums/:path*",
        destination: "/curriculum/merdeka",
        permanent: true,
      },
      // One daily-report page (decided 2026-09-27): the TK tree and the wali
      // kelas copy answer with the page that serves every unit and role.
      // Specific paths first; `:id` last.
      ...(
        [
          ["/tk/daily-reports", "/daily-report"],
          ["/tk/daily-reports/new", "/daily-report/new"],
          ["/tk/daily-reports/create", "/daily-report/bulk"],
          ["/tk/daily-reports/class", "/daily-report"],
          ["/tk/daily-reports/check-in", "/daily-report/check-in"],
          ["/tk/daily-reports/parent", "/parent/daily-report"],
          ["/tk/daily-reports/:id/edit", "/daily-report/:id/edit"],
          ["/tk/daily-reports/:id", "/daily-report/:id"],
          ["/homeroom/daily-report", "/daily-report/bulk"],
        ] as const
      ).map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
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
            value: "camera=(self), microphone=(), geolocation=()",
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
};

export default nextConfig;
