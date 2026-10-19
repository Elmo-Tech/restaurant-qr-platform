import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Like the restaurant web app, this app reads the repository's single root-level .env
// (NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE_PATH are shared with it).
config({ path: path.resolve(__dirname, "..", "..", ".env") });

// The platform control dashboard is an internal tool (DEC-045): never framed, never indexed,
// no referrer to other sites. HSTS is added by the reverse proxy at deployment (HTTPS only).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
