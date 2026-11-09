import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// This repository owns a single root-level .env / .env.example (see
// apps/api/prisma.config.ts for the same pattern) -- Next.js only loads
// .env files from its own app directory by default, so the root file is
// loaded explicitly here, before Next collects NEXT_PUBLIC_* values.
config({ path: path.resolve(__dirname, "..", "..", ".env") });

// FT-9: baseline security headers for every Web response. Deliberately NO
// Content-Security-Policy here: a correct CSP for Next.js (inline bootstrap
// scripts, images from the API origin) needs nonce plumbing and is a
// separate hardening task -- a half-right CSP would break the Guest Menu or
// Staff app. `X-Frame-Options: SAMEORIGIN` blocks clickjacking of the Staff
// app; HSTS is added by the reverse proxy at deployment (it must only be sent
// over HTTPS).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Production images (infra/docker/Dockerfile.web) build a self-contained server with
  // NEXT_OUTPUT=standalone. The monorepo root is the tracing root so the packages hoisted into the root
  // node_modules are included. Local `next dev` / `next start` are unaffected.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const, outputFileTracingRoot: path.resolve(__dirname, "..", "..") }
    : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
